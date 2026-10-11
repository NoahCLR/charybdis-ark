// @ts-check
"use strict";

/**
 * @typedef {import("./types.js").DeviceConnection} Connection
 * @typedef {import("./types.js").DeviceCapabilities} Caps
 * @typedef {import("./types.js").ProfileStatus} Status
 * @typedef {import("./types.js").CapturedProfile} Capture
 * @typedef {import("./types.js").CompleteCapture} CompleteCapture
 * @typedef {import("./types.js").RestoredProfile} Restored
 * @typedef {import("./types.js").PublicError & Partial<Record<'step' | 'stepLabel' | 'reason' | 'saved', string>>} PublishedError
 */
const {baseLighting} = require("../model/settings-editor");
const {profilePlacementProblem} = require("../model/profile-placement");
const {knownActionAbi} = require("../schema/actions");
const {customKeyOfCode, layerLockOfCode} = require("../data/user-keycodes");
const {pdBindingOfCode} = require("../data/pd-bindings");
const {layerName} = require("../model/vocabulary");
const {decodePdDomain} = require("../schema/pd-mode-domain-v1");
const {readSettingsLimits} = require("../protocol/portable-profile-v1");
const {readHostOs} = require("../protocol/host-os-v1");
const {supportsUnicodeMacros} = require("../schema/macro-payload");
const {readKeyboardOptions} = require("../protocol/keyboard-options-v1");
const {decodeSettings} = require("../schema/settings-domain-v1");
const {profileDepthOptions} = require("../schema/profile-depth");
const {captureProfile, restoreProfile, validateSnapshot, requireReady} = require("./portable-profile-session");
const {settingsEditorView} = require("../model/settings-editor");
const {macroEditorView} = require("../model/macro-editor");
const {customKeyEditorView} = require("../model/custom-key-editor");
const {RAW_HID_REPORT_SIZE} = require("../transport/device-adapter");
const {NodeHidDeviceAdapter} = require("../transport/node-hid-adapter");
const {DeviceRequestCoordinator} = require("../transport/request-coordinator");
const {readViaLayout, decodeViaLayout} = require("../protocol/via-layout-v1");
const keycodeCatalog = require("../data/keycode-catalog");
const {readViaRgbMatrix} = require("../protocol/via-rgb-matrix-v1");
const {readDeviceCombos} = require("../protocol/combo-readback-v1");
const {ProfilePayloadReader} = require("./profile-payload-reader");
const {PROFILE_DOMAIN_IDS, decodeProfileBlob} = require("../schema/profile-blob-v1");
const {decodeRgbDomainV1} = require("../schema/rgb-domain-v1");
const {decodeComboDomain} = require("../schema/combo-domain-v1");
const {decodeKeyBehaviorDomain} = require("../schema/key-behavior-domain-v1");
const {CANDIDATE_STATE_NAMES, readCandidateStatus} = require("../protocol/profile-candidate-v1");
const {PROFILE_ACTIVE_KIND, PROFILE_STATE_FLAGS, PROFILE_WIRE_KNOWN_MASKS, PROFILE_WIRE_FEATURES, PROFILE_WIRE_V1, VIA_READS, readProfileCapabilities, readProfileStatus, readViaIdentity} = require("../protocol/profile-wire-v1");

/** @type {(capabilities: Partial<Caps> | null | undefined, writing?: boolean) => asserts capabilities is Partial<Caps>} */
const checkReady = requireReady;

const SUPPORTED_PROFILE_PROTOCOL = Object.freeze({major: 1, minor: 0});
const SUPPORTED_PROFILE_SCHEMA = Object.freeze({major: 3, minor: 0});
const PROFILE_DOMAIN_FLAGS = Object.freeze({RGB: 1 << 0, KEY_BEHAVIORS: 1 << 1});
const REQUIRED_PROFILE_DOMAIN_MASK = PROFILE_DOMAIN_FLAGS.RGB | PROFILE_DOMAIN_FLAGS.KEY_BEHAVIORS;
const REQUIRED_LIVE_MUTATION_FEATURES = PROFILE_WIRE_FEATURES.CANDIDATE_WRITE
    | PROFILE_WIRE_FEATURES.PERSISTENT_COMMIT
    | PROFILE_WIRE_FEATURES.RUNTIME_ACTIVATION
    | PROFILE_WIRE_FEATURES.PEER_RECONCILIATION
    | PROFILE_WIRE_FEATURES.ATOMIC_LOGICAL_APPLY;

// The connected keyboard: scanning, connecting, and every read and save.
//
// What it holds is published as `snapshot()`, through `onChange`, so the panel
// draws the keyboard as the service last saw it, failures included.
//
// One convention for failure. An operation that fails rejects, with the error
// it records: `snapshot().error` (code, message and, for a save, where it
// stopped) and a line in `diagnostics`, so the published model shows the
// failure whoever awaited it. This holds for enumerate, connect, refresh,
// readLayout, readCommittedProfile, the complete reads (readKeyboardProfile,
// readPortableProfile) and restorePortableProfile; a refusal before one
// starts (not connected, not yet refreshed, busy) rejects too. Two reads are
// optional and degrade instead: readCombos and readBaseRgb never reject, and
// record a failure as their own `{state: "unavailable", error}` so it neither
// discards a usable profile nor masks an earlier error. disconnect() always
// leaves the keyboard disconnected and resolves, recording a failure to close
// it cleanly.
class ProfileDeviceService {
    /** @param {import("./types.js").DeviceServiceOptions} [options] */
    constructor(options = {}) {
        const adapter = options.adapter || new NodeHidDeviceAdapter();
        this.coordinator = options.coordinator || new DeviceRequestCoordinator(adapter, {
            defaultTimeoutMs: options.defaultTimeoutMs,
            onUnexpectedReport: ({reason}) => this.addDiagnostic(`Ignored an unexpected Raw HID report: ${reason}.`),
        });
        this.onChange = typeof options.onChange === "function" ? options.onChange : undefined;
        this.onApplyProgress = typeof options.onApplyProgress === "function" ? options.onApplyProgress : undefined;
        this.onReadProgress = typeof options.onReadProgress === "function" ? options.onReadProgress : undefined;
        // The wait between polls while reading and saving a profile. A host
        // whose timers are throttled (a background browser tab) passes its
        // own; the timer's is used otherwise.
        this.sleep = typeof options.sleep === "function" ? options.sleep : undefined;
        this.requestIdStart = normalizeRequestId(options.requestIdStart === undefined ? 1 : options.requestIdStart);
        this.readCandidateStatus = typeof options.readCandidateStatus === "function"
            ? options.readCandidateStatus
            : readCandidateStatus;
        /** @type {(import("../transport/types.js").DeviceDescriptor & {label: string})[]} */
        this.devices = [];
        /** @type {Map<string, string>} */
        this.adapterIdsByPublicId = new Map();
        /** @type {Map<string, string>} */
        this.publicIdsByAdapterIdentity = new Map();
        this.nextPublicDeviceId = 1;
        /** @type {Connection | undefined} */
        this.connection = undefined;
        this.connectionPublicId = "";
        this.connectionSequence = 0;
        /** @type {number | null} */
        this.connectionToken = null;
        /** @type {(() => void) | undefined} */
        this.disposeConnectionListener = undefined;
        this.disconnecting = false;
        this.scanned = false;
        this.busy = false;
        this.phase = "idle";
        this.operationId = 0;
        /** @type {Caps | undefined} */
        this.capabilities = undefined;
        /** @type {Status | undefined} */
        this.status = undefined;
        /** @type {import("./types.js").CandidateStatus | undefined} */
        this.candidateStatus = undefined;
        /** @type {Awaited<ReturnType<typeof readViaIdentity>> | undefined} */
        this.viaIdentity = undefined;
        /** @type {import("../protocol/types.js").RequestIds | undefined} */
        this.requestIds = undefined;
        /** @type {PublishedError | undefined} */
        this.error = undefined;
        /** @type {string[]} */
        this.diagnostics = [];
        this.lastRefreshedAt = "";
        /** @type {NonNullable<import("./types.js").DeviceModelInput["liveApply"]>} */
        this.liveApply = {state: "idle"};
        /** @type {import("./types.js").LayoutRead | undefined} */
        this.layout = undefined;
        /** @type {import("./types.js").CommittedRead | undefined} */
        this.committed = undefined;
        /** @type {import("./types.js").BaseRgbRead | undefined} */
        this.baseRgb = undefined;
        /** @type {import("./types.js").ComboRead | undefined} */
        this.combos = undefined;
        /** @type {Capture | Restored | undefined} */
        this.portable = undefined;
        this.portableProgress = "";
        /** @type {ReturnType<typeof macroEditorView> | undefined} */
        this.macroView = undefined;
        /** @type {ReturnType<typeof customKeyEditorView> | undefined} */
        this.customKeyView = undefined;
        /** @type {ReturnType<typeof settingsEditorView> | undefined} */
        this.settingsView = undefined;
        /** @type {InstanceType<typeof ProfilePayloadReader> | undefined} */
        this.payloadReader = undefined;
    }

    async enumerate() {
        return this.runOperation("enumerating", async () => {
            const descriptors = await this.coordinator.listDevices();
            this.adapterIdsByPublicId.clear();
            this.devices = descriptors.map((descriptor, index) => {
                const identity = JSON.stringify([descriptor.id, cleanText(descriptor.serialNumber)]);
                let id = this.publicIdsByAdapterIdentity.get(identity);
                if (!id) {
                    id = `charybdis-${this.nextPublicDeviceId++}`;
                    this.publicIdsByAdapterIdentity.set(identity, id);
                }
                this.adapterIdsByPublicId.set(id, descriptor.id);
                return publicDeviceDescriptor(id, descriptor, index);
            });
            this.scanned = true;
            this.phase = this.connection ? "connected" : this.devices.length ? "available" : "empty";
            this.addDiagnostic(
                this.devices.length
                    ? `Found ${this.devices.length} compatible Charybdis Raw HID interface${this.devices.length === 1 ? "" : "s"}.`
                    : "No compatible Charybdis Raw HID interface is currently visible."
            );
        });
    }

    /** @param {string} publicDeviceId */
    async connect(publicDeviceId) {
        const adapterDeviceId = this.adapterIdsByPublicId.get(String(publicDeviceId || ""));
        if (!adapterDeviceId) this.refuse("Select a keyboard from the latest scan before connecting.");
        if (this.connection) {
            await this.disconnect();
        }
        await this.runOperation("connecting", async () => {
            const connection = await this.coordinator.connect(adapterDeviceId);
            this.connection = connection;
            this.requestIds = new ProfileRequestIdSequence(this.requestIdStart);
            this.connectionPublicId = String(publicDeviceId);
            this.connectionToken = ++this.connectionSequence;
            this.phase = "connected";
            this.disposeConnectionListener = connection.onDisconnect((reason) => this.handleDisconnect(reason));
            this.addDiagnostic(`Connected to ${this.deviceLabel(this.connectionPublicId)}.`);
        });
        return this.refresh();
    }

    async refresh() {
        if (!this.connection?.connected) this.refuse("Connect to a keyboard before refreshing live capabilities.");
        return this.runOperation("refreshing", async () => {
            const connection = this.connectedConnection();
            const viaIdentity = await readViaIdentity(connection);
            const capabilities = await readProfileCapabilities(connection, {nextRequestId: () => this.nextRequestId()});
            const status = await readProfileStatus(connection, {nextRequestId: () => this.nextRequestId()});
            const candidateStatus = (capabilities.featureFlags & PROFILE_WIRE_FEATURES.CANDIDATE_WRITE) !== 0
                ? await this.readCandidateStatus(connection, {nextRequestId: () => this.nextRequestId()})
                : undefined;
            if (this.connection !== connection || !connection.connected) {
                throw new Error("The keyboard disconnected while live state was being refreshed.");
            }
            this.capabilities = capabilities;
            this.status = status;
            this.candidateStatus = candidateStatus;
            this.viaIdentity = viaIdentity;
            this.lastRefreshedAt = new Date().toISOString();
            this.phase = "connected";
            const compatibility = evaluateProfileCompatibility(capabilities, viaIdentity);
            this.addDiagnostic(
                compatibility.compatible
                    ? "Live protocol, schema, VIA identity and required features are compatible."
                    : `Live compatibility check found ${compatibility.reasons.length} blocking issue${compatibility.reasons.length === 1 ? "" : "s"}.`
            );
        });
    }

    // Reads the layout the keyboard is actually running and resolves each
    // keycode through the vendored catalog. This is device-first: nothing here
    // consults the authored source. Layer count comes from the firmware's own
    // advertised capacity rather than from a compiled constant.
    async readLayout() {
        if (!this.connection?.connected) this.refuse("Connect to a keyboard before reading its layout.");
        const layerCount = this.capabilities?.compiledLayerCount;
        if (typeof layerCount !== "number" || !Number.isInteger(layerCount) || layerCount < 1) {
            this.refuse("Refresh capabilities before reading the layout.");
        }

        this.layout = {state: "reading", progress: {done: 0, total: 0}, layers: [], readAt: ""};
        return this.runOperation("reading layout", async () => {
            const connection = this.connectedConnection();

            const layers = await readViaLayout(connection, {
                layerCount,
                onProgress: progress => this.reportReadProgress("layout", progress),
            });
            if (this.connection !== connection || !connection.connected) {
                throw new Error("The keyboard disconnected while its layout was being read.");
            }

            this.#acceptLayout(layers);
        });
    }

    /** @param {Awaited<ReturnType<typeof readViaLayout>>} layers */
    #acceptLayout(layers) {
        this.layout = {
            state: "read",
            progress: null,
            readAt: new Date().toISOString(),
            catalog: keycodeCatalog.metadata(),
            layers: layers.map(({layer, positions}) => ({
                layer,
                keys: positions.map((position) => ({
                    ...position,
                    resolved: keycodeCatalog.resolve(position.keycode),
                })),
            })),
        };
        const unknown = unnamedKeyCount(this.layout.layers, this.capabilities);
        this.addDiagnostic(
            unknown === 0
                ? `Read ${layers.length} layers from the keyboard.`
                : `Read ${layers.length} layers; ${unknown} keycodes are ones this app cannot name.`
        );
    }

    // Reads the committed profile off the keyboard and decodes it.
    //
    // This is the read D-026 requires and the first time the app can show RGB
    // and key behaviours as the device actually holds them, rather than as the
    // authored source describes them. A domain that fails to decode is
    // reported as such and leaves the others readable; the alternative is
    // discarding a whole profile because one section drifted.
    async readCommittedProfile() {
        if (!this.connection?.connected) this.refuse("Connect to a keyboard before reading its profile.");

        this.committed = {state: "reading", progress: {done: 0, total: 0}};
        return this.runOperation("reading profile", async () => {
            const connection = this.connectedConnection();

            // Decide from a fresh status before requesting payload pages. A
            // rejected committed chunk can mean a read failed mid-transfer;
            // it must not be interpreted as proof that nothing is committed.
            const status = await readProfileStatus(connection, {nextRequestId: () => this.nextRequestId()});
            if (this.connection !== connection || !connection.connected) {
                throw new Error("The keyboard disconnected while its profile status was being read.");
            }
            this.status = status;
            const source = status.activeKind === PROFILE_ACTIVE_KIND.COMPILED_ONLY
                && !(status.stateFlags & PROFILE_STATE_FLAGS.COMMITTED_VALID) ? "compiled" : "committed";
            const reader = this.profilePayloadReader();
            /** @type {import("../protocol/types.js").ReadOptions & {onProgress: (progress: import("../../contracts/model.js").CountedProgress) => void}} */
            const readOptions = {
                nextRequestId: () => this.nextRequestId(),
                onProgress: progress => this.reportReadProgress("profile", progress),
            };
            const read = source === "compiled" ? await reader.readCompiled(readOptions) : await reader.readCommitted(readOptions);
            if (this.connection !== connection || !connection.connected) {
                throw new Error("The keyboard disconnected while its profile was being read.");
            }
            this.#acceptCommitted(read, source);
        });
    }

    /** @param {import("../protocol/types.js").PayloadRead} read @param {string} source */
    #acceptCommitted({metadata, bytes}, source) {
        const blob = decodeProfileBlob(bytes);
        const depth = profileDepthOptions(this.capabilities, blob.domains.find(domain => domain.id === PROFILE_DOMAIN_IDS.RGB)?.payload);
        /** @type {import("./types.js").ReadDomains} */
        const domains = {};
        const failures = [];
        for (const domain of blob.domains) {
            try {
                if (domain.id === PROFILE_DOMAIN_IDS.RGB) {
                    domains.rgb = decodeRgbDomainV1(domain.payload, depth.rgb);
                } else if (domain.id === PROFILE_DOMAIN_IDS.KEY_BEHAVIORS) {
                    domains.keyBehaviors = decodeKeyBehaviorDomain(domain.payload, depth.behaviors);
                } else if (domain.id === PROFILE_DOMAIN_IDS.PD_MODES) {
                    domains.pdModes = decodePdDomain(domain.payload);
                } else if (domain.id === PROFILE_DOMAIN_IDS.SETTINGS) {
                    domains.settings = decodeSettings(domain.payload);
                } else if (domain.id === PROFILE_DOMAIN_IDS.COMBOS) {
                    domains.combos = decodeComboDomain(domain.payload);
                }
            } catch (error) {
                failures.push({domainId: domain.id, message: error instanceof Error ? error.message : String(error)});
            }
        }

        this.committed = {
            state: "read",
            source,
            progress: null,
            readAt: new Date().toISOString(),
            generation: metadata.generation,
            digest: metadata.digest,
            schema: metadata.schema,
            originHalf: metadata.originHalf,
            byteLength: bytes.length,
            domainIds: blob.domains.map((domain) => domain.id),
            domains,
            failures,
        };
        const described = source === "compiled"
            ? "the firmware's compiled defaults"
            : `committed generation ${metadata.generation}`;
        this.addDiagnostic(
            failures.length
                ? `Read ${described}; ${failures.length} domain${failures.length === 1 ? "" : "s"} failed to decode.`
                : `Read ${described} from the keyboard (${bytes.length} bytes).`
        );
    }

    // Optional: never rejects. A failure while connected is recorded as
    // `combos: {state: "unavailable", error}`; a lost connection clears it.
    async readCombos() {
        const connection = this.connection;
        this.combos = {state: "reading"};
        this.emitChange();
        try {
            if (!connection?.connected) throw new Error("Connect to a keyboard before reading combos.");
            const read = await readDeviceCombos(connection, {nextRequestId: () => this.nextRequestId()});
            if (this.connection !== connection || !connection.connected) return this.snapshot();
            this.combos = {state: "read", ...read, readAt: new Date().toISOString()};
        } catch (error) {
            if (this.connection !== connection) return this.snapshot();
            this.combos = connection?.connected ? {state: "unavailable", error: publicError(error)} : undefined;
        }
        this.emitChange();
        return this.snapshot();
    }

    // Optional: never rejects. A failure while connected is recorded as
    // `baseRgb: {state: "unavailable", error}` and a diagnostic, leaving
    // `error` and the profile alone; a lost connection clears it.
    async readBaseRgb() {
        const connection = this.connection;
        this.baseRgb = {state: "reading"};
        this.emitChange();
        try {
            if (!connection?.connected) throw new Error("Connect to a keyboard before reading base RGB.");
            const settings = await readViaRgbMatrix(connection);
            if (this.connection !== connection || !connection.connected) return this.snapshot();
            this.baseRgb = {state: "read", ...settings, readAt: new Date().toISOString()};
        } catch (error) {
            if (this.connection !== connection) return this.snapshot();
            if (!connection?.connected) {
                this.baseRgb = undefined;
            } else {
                // This optional read must not discard a usable profile or
                // mask an earlier layout/profile error. Clear stale colour.
                this.baseRgb = {state: "unavailable", error: publicError(error)};
                this.addDiagnostic(`Base RGB: ${this.baseRgb.error?.message}`);
            }
        }
        this.emitChange();
        return this.snapshot();
    }

    // Always ends disconnected and resolves; a failure to close the handle
    // cleanly is recorded in `error`.
    async disconnect() {
        const connection = this.connection;
        if (!connection) {
            this.phase = this.scanned ? (this.devices.length ? "available" : "empty") : "idle";
            this.emitChange();
            return this.snapshot();
        }
        this.busy = true;
        this.phase = "disconnecting";
        this.error = undefined;
        this.emitChange();
        this.disconnecting = true;
        this.disposeConnectionListener?.();
        this.disposeConnectionListener = undefined;
        try {
            await connection.disconnect();
        } catch (error) {
            this.setError(error);
        } finally {
            this.disconnecting = false;
            this.clearConnection();
            this.busy = false;
            this.phase = this.scanned ? (this.devices.length ? "available" : "empty") : "idle";
            this.addDiagnostic("Disconnected from the live keyboard.");
            this.emitChange();
        }
        return this.snapshot();
    }

    // One coherent capture supplies the editor and the draft. Standalone
    // exports use the same reader without replacing the editor's state.
    /** @returns {Promise<import("./types.js").CompleteCapture>} */
    async readKeyboardProfile() {
        const read = await this.#readCompleteProfile({forEditor: true});
        if (read.incomplete) throw new Error("The keyboard did not return a complete editor profile.");
        return read;
    }

    /** @overload @param {{forRestore: true; reuseReadback?: boolean}} options @returns {Promise<import("./types.js").CapturedProfile>} */
    /** @overload @param {{forRestore?: false; reuseReadback?: boolean}} [options] @returns {Promise<import("./types.js").CompleteCapture>} */
    /** @param {{forRestore?: boolean; reuseReadback?: boolean}} [options] @returns {Promise<import("./types.js").CapturedProfile>} */
    async readPortableProfile(options = {}) {
        return this.#readCompleteProfile(options);
    }

    /** @param {{forRestore?: boolean; reuseReadback?: boolean; forEditor?: boolean}} [options] @returns {Promise<Capture>} */
    async #readCompleteProfile({forRestore = false, reuseReadback = false, forEditor = false} = {}) {
        if (!this.connection?.connected || this.busy) this.refuse("Connect the keyboard and wait for the current operation to finish.");
        /** @type {Capture | undefined} */
        let result;
        this.portableProgress = "";
        await this.runOperation("reading complete profile", async () => {
            const connection = this.connectedConnection();
            const capabilities = this.profileCapabilities();
            const capture = await captureProfile(connection, this.requestSequence(), capabilities,
                message => this.reportReadProgress("portable", message), false, forRestore,
                {sleep: this.sleep, payloadReader: this.profilePayloadReader(), reuseReadback});
            const {readback, ...captured} = capture;
            result = captured;
            result.limits = await readSettingsLimits(connection, this.requestSequence());
            result.options = await readKeyboardOptions(connection, this.requestSequence());
            if (supportsUnicodeMacros(this.capabilities)) result.hostOs = await readHostOs(connection, this.requestSequence());
            if (forEditor) {
                if (capture.incomplete) throw new Error("The keyboard did not return a complete editor profile.");
                /** @type {import("./types.js").BaseRgbRead} */
                let baseRgb;
                try {baseRgb = {state: "read", ...await readViaRgbMatrix(connection), readAt: new Date().toISOString()};}
                catch (error) {baseRgb = {state: "unavailable", error: publicError(error)};}
                if (this.connection !== connection || !connection.connected) throw new Error("The keyboard disconnected while its configuration was being read.");
                this.#acceptLayout(decodeViaLayout(capture.storage.layout, capture.document.layers.length));
                this.#acceptCommitted(capture.readback.active, capture.readback.source);
                this.status = result.status;
                this.combos = {state: "read", ...capture.readback.combos, readAt: new Date().toISOString()};
                this.baseRgb = baseRgb;
                if (baseRgb.error) this.addDiagnostic(`Base RGB: ${baseRgb.error.message}`);
            }
            this.portable = result;
            this.macroView = macroEditorView(result, this.capabilities);
            this.customKeyView = customKeyEditorView(result, this.capabilities);
            this.settingsView = settingsEditorView(result, this.capabilities);
            this.portableProgress = "";
        }).finally(() => {this.portableProgress = "";});
        if (!result) throw new Error("The keyboard operation returned no verified profile.");
        return result;
    }

    /** @param {import("../model/types.js").PortableDocument} document @param {import("./types.js").RestoreOptions} options @returns {Promise<import("./types.js").RestoredProfile>} */
    async restorePortableProfile(document, options) {
        if (!this.connection?.connected || this.busy) this.refuse("Connect the keyboard and wait for the current operation to finish.");
        /** @type {Restored | undefined} */
        let result;
        let started = false;
        this.liveApply = {state: "idle"};
        await this.runOperation("restoring complete profile", async () => {
            const connection = this.connectedConnection();
            const capabilities = this.profileCapabilities();
            const cachedBase = options?.expectedFingerprint && this.portable?.fingerprint === options.expectedFingerprint
                ? this.portable
                : undefined;
            const limits = cachedBase?.limits || await readSettingsLimits(connection, this.requestSequence());
            // What is checked is what would be written: an older backup as
            // this keyboard numbers its keys.
            const target = validateSnapshot(document, this.capabilities);
            const lighting = baseLighting(target.settings.values);
            const brightness = lighting.brightness;
            if (limits && limits.brightnessMax !== undefined && brightness > limits.brightnessMax) throw Object.assign(new Error(`This profile's brightness exceeds the keyboard's reported limit of ${limits.brightnessMax}. Lower the brightness before restoring it.`), {code: "SETTINGS_LIMIT_EXCEEDED"});
            const keyboardOptions = cachedBase?.options || await readKeyboardOptions(connection, this.requestSequence());
            const effect = lighting.effect;
            if (keyboardOptions && !keyboardOptions.effects.some(item => item.id === effect)) throw Object.assign(new Error("This profile uses a lighting effect unavailable on this keyboard."), {code: "SETTINGS_LIMIT_EXCEEDED"});
            // The keyboard refuses a profile whose actions sit where it cannot
            // run them; say which one before anything is sent.
            const misplaced = profilePlacementProblem(Buffer.from(target.document.profile, "base64"), {layerCount: this.capabilities?.compiledLayerCount ?? 8,
                capabilities: this.capabilities,
                behaviorQmkFunctions: Boolean((this.capabilities?.featureFlags || 0) & PROFILE_WIRE_FEATURES.BEHAVIOR_QMK_FUNCTIONS)});
            if (misplaced) throw Object.assign(new Error(`${misplaced} Fix it before saving this profile.`), {code: "PLACEMENT_REFUSED"});
            started = true;
            result = await restoreProfile(connection, this.requestSequence(), capabilities, document, {...options,
                baseSnapshot: cachedBase,
                sleep: this.sleep,
                onProgress: message => {this.portableProgress = message;},
                // The step view the commit bar draws; it outlives the apply
                // when it failed, so the person can see where and why.
                onApplyProgress: view => this.reportApplyProgress(view),
            });
            result.limits = limits;
            result.options = keyboardOptions;
            if (supportsUnicodeMacros(this.capabilities)) result.hostOs = await readHostOs(connection, this.requestSequence());
            this.portable = result;
            this.macroView = macroEditorView(result, this.capabilities);
            this.customKeyView = customKeyEditorView(result, this.capabilities);
            this.settingsView = settingsEditorView(result, this.capabilities);
            if (result.performance) {
                const seconds = (result.performance.elapsedMs / 1000).toFixed(1);
                this.addDiagnostic(`Saved the complete profile in ${seconds} s; transferred ${result.performance.layoutBytes} changed layout bytes and ${result.performance.macroBytes} changed macro bytes.`);
            }
        }).finally(async () => {
            this.portableProgress = "";
            // Once the restore has started — landed, failed, or stopped past
            // the point of no return — the health the panel shows must be the
            // keyboard's now, not the status read before the apply began. A
            // refusal before the first write changed nothing, so it reads nothing.
            if (started) {
                await this.refreshStatus();
                this.emitChange();
            }
        });
        if (!result) throw new Error("The keyboard operation returned no verified profile.");
        return result;
    }

    async close() {
        this.disposeConnectionListener?.();
        this.disposeConnectionListener = undefined;
        this.disconnecting = true;
        try {
            await this.coordinator.close();
        } finally {
            this.disconnecting = false;
            this.clearConnection();
        }
    }

    /** @returns {import("./types.js").ServiceSnapshot} */
    snapshot() {
        return {
            phase: this.phase,
            operationId: this.operationId,
            scanned: this.scanned,
            busy: this.busy,
            connected: Boolean(this.connection?.connected),
            devices: this.devices.map((device) => ({...device})),
            selectedDeviceId: this.connectionPublicId,
            connectionToken: this.connectionToken,
            capabilities: this.capabilities ? {...this.capabilities} : null,
            status: this.status ? {...this.status} : null,
            candidateStatus: this.candidateStatus ? cloneCandidateStatus(this.candidateStatus) : null,
            viaIdentity: this.viaIdentity ? {...this.viaIdentity} : null,
            compatibility: this.capabilities
                ? evaluateProfileCompatibility(this.capabilities, this.viaIdentity)
                : null,
            mutationCompatibility: evaluateLiveMutationCompatibility(
                this.capabilities,
                this.capabilities ? evaluateProfileCompatibility(this.capabilities, this.viaIdentity) : null,
                Boolean(this.connection?.connected),
                this.status
            ),
            portableSummary: this.committed?.domains?.settings ? {names: this.committed.domains.settings.names.map((name, index, names) => layerName(names, index))} : this.portable?.summary || null,
            portableProgress: this.portableProgress || "",
            settingsView: this.settingsView ? clone(this.settingsView) : null,
            macroView: this.macroView ? clone(this.macroView) : null,
            customKeyView: this.customKeyView ? clone(this.customKeyView) : null,
            liveApply: cloneLiveApply(this.liveApply),
            layout: this.layout ? clone(this.layout) : null,
            committed: this.committed ? clone(this.committed) : null,
            baseRgb: this.baseRgb ? clone(this.baseRgb) : null,
            combos: this.combos ? clone(this.combos) : null,
            error: this.error ? {...this.error} : null,
            diagnostics: this.diagnostics.slice(),
            lastRefreshedAt: this.lastRefreshedAt,
        };
    }

    // Runs one operation: busy while it runs, then its failure recorded,
    // published and rejected with (see the class comment).
    /** @param {string} phase @param {() => Promise<unknown>} operation */
    async runOperation(phase, operation) {
        this.operationId++;
        this.busy = true;
        this.phase = phase;
        this.error = undefined;
        this.emitChange();
        /** @type {PublishedError | undefined} */
        let failure;
        try {
            await operation();
        } catch (error) {
            this.setError(error);
            failure = this.error;
            if (!this.connection?.connected) {
                this.clearConnection();
            }
            this.phase = this.connection?.connected
                ? "connected"
                : this.scanned ? (this.devices.length ? "available" : "empty") : "idle";
        } finally {
            this.busy = false;
            this.emitChange();
        }
        if (failure) throw rejection(failure);
        return this.snapshot();
    }

    // Refuses an operation before it starts: recorded and published like a
    // failure, and rejected with.
    /** @param {string} message @returns {never} */
    refuse(message) {
        this.setError(new Error(message));
        this.emitChange();
        throw rejection(/** @type {PublishedError} */ (this.error));
    }

    /** @param {unknown} reason */
    handleDisconnect(reason) {
        if (this.disconnecting) {
            return;
        }
        const label = this.deviceLabel(this.connectionPublicId);
        this.clearConnection();
        this.busy = false;
        this.phase = this.scanned ? (this.devices.length ? "available" : "empty") : "idle";
        this.setError(reason instanceof Error ? reason : new Error(`${label} disconnected.`));
        this.addDiagnostic(`${label} disconnected; reconnect before sending another read request.`);
        this.emitChange();
    }

    clearConnection() {
        this.portable = undefined; this.portableProgress = "";
        this.macroView = undefined;
        this.customKeyView = undefined;
        this.settingsView = undefined;
        this.payloadReader = undefined;
        this.layout = undefined;
        this.committed = undefined;
        this.baseRgb = undefined;
        this.combos = undefined;
        this.disposeConnectionListener?.();
        this.disposeConnectionListener = undefined;
        this.connection = undefined;
        this.connectionPublicId = "";
        this.connectionToken = null;
        this.capabilities = undefined;
        this.status = undefined;
        this.candidateStatus = undefined;
        this.viaIdentity = undefined;
        this.requestIds = undefined;
        this.lastRefreshedAt = "";
        this.liveApply = {state: "idle"};
    }

    /** @param {unknown} error */
    setError(error) {
        this.error = publicError(error);
        this.addDiagnostic(`${this.error.code}: ${this.error.message}`);
    }

    /** @param {string} message */
    addDiagnostic(message) {
        const text = String(message || "").trim();
        if (!text || this.diagnostics[this.diagnostics.length - 1] === text) {
            return;
        }
        this.diagnostics.push(text);
        if (this.diagnostics.length > 8) {
            this.diagnostics.splice(0, this.diagnostics.length - 8);
        }
    }

    /** @param {string} publicDeviceId */
    deviceLabel(publicDeviceId) {
        return this.devices.find((device) => device.id === publicDeviceId)?.label || "Charybdis keyboard";
    }

    // Transfer progress changes no profile data. Hosts that can display it
    // separately avoid rebuilding and sending the complete panel per chunk.
    /** @param {import("../../contracts/model.js").ApplyView} view */
    reportApplyProgress(view) {
        this.liveApply = view;
        if (!this.onApplyProgress) { this.emitChange(); return; }
        try { this.onApplyProgress(clone(view)); } catch {
            // A closed or reloading panel must not interrupt the save.
        }
    }

    // Keep the read's latest counter for snapshots without copying all the
    // profile data or asking the panel to rebuild its editor for every reply.
    /** @param {[source: 'layout' | 'profile', progress: import("../../contracts/model.js").CountedProgress] | [source: 'portable', progress: string]} args */
    reportReadProgress(...args) {
        const [source, progress] = args;
        if (source === "layout") this.layout = {...this.layout, progress};
        else if (source === "profile") this.committed = {...this.committed, progress};
        else if (source === "portable") this.portableProgress = progress;
        if (!this.onReadProgress) { this.emitChange(); return; }
        try {
            this.onReadProgress({...(source === "portable" ? {source, progress} : {source, progress: {...progress}}),
                operationId: this.operationId, phase: this.phase,
                selectedDeviceId: this.connectionPublicId, connectionToken: this.connectionToken});
        } catch {
            // A closed or reloading panel must not interrupt the read.
        }
    }

    connectedConnection() {
        if (!this.connection?.connected) throw new Error("The keyboard disconnected before its operation could start.");
        return this.connection;
    }
    requestSequence() {
        if (!this.requestIds) throw new Error("The keyboard disconnected before its operation could start.");
        return this.requestIds;
    }
    nextRequestId() {return this.requestSequence().next();}
    profileCapabilities() {
        const capabilities = this.capabilities;
        checkReady(capabilities);
        return capabilities;
    }

    profilePayloadReader() {
        if (!this.payloadReader || this.payloadReader.connection !== this.connection) this.payloadReader = new ProfilePayloadReader(this.connectedConnection());
        return this.payloadReader;
    }

    emitChange() {
        if (!this.onChange) {
            return;
        }
        try {
            this.onChange(this.snapshot());
        } catch {
            // A closed or reloading webview must not break device cleanup.
        }
    }

    async refreshStatus() {
        if (!this.connection?.connected || !this.requestIds) return;
        try {
            this.status = await readProfileStatus(this.connection, {nextRequestId: () => this.nextRequestId()});
            this.candidateStatus = await this.readCandidateStatus(this.connection, {
                nextRequestId: () => this.nextRequestId(),
            });
            this.lastRefreshedAt = new Date().toISOString();
        } catch {
            // Preserve the original outcome; Refresh remains available for a later explicit retry.
        }
    }
}

/** @param {string} id @param {import("../transport/types.js").DeviceDescriptor} descriptor @param {number} index */
function publicDeviceDescriptor(id, descriptor, index) {
    const product = cleanText(descriptor.product) || "Charybdis 4x6";
    const serial = cleanText(descriptor.serialNumber);
    const suffix = serial ? ` · ${serial}` : index ? ` · interface ${index + 1}` : "";
    return {
        id,
        label: product + suffix,
        product,
        serialNumber: serial,
        manufacturer: cleanText(descriptor.manufacturer),
    };
}

/** @param {unknown} value */
function cleanText(value) {
    return typeof value === "string" ? value.trim() : "";
}

/** @param {unknown} value @returns {PublishedError} */
function publicError(value) {
    const error = /** @type {Partial<Error> & Record<string, unknown> | null | undefined} */ (value);
    /** @type {PublishedError} */
    const result = {
        code: cleanText(error?.code) || cleanText(error?.name) || "LIVE_LINK_ERROR",
        message: cleanText(error?.message) || String(error || "Unknown live-link error."),
    };
    // Where an Apply failed, why, and what was saved (see apply-progress.js).
    for (const key of /** @type {const} */ (["step", "stepLabel", "reason", "saved"])) {
        if (typeof error?.[key] === "string" && error[key]) result[key] = cleanText(error[key]);
    }
    return result;
}

// What a failed operation rejects with: the error it recorded, as a thrown
// Error carrying the same code and fields.
/** @param {PublishedError} error */
function rejection(error) {
    return Object.assign(new Error(error.message), error);
}

// Whether this app can read the keyboard at all: its protocol and schema,
// VIA identity, report framing, and the features and domains every read
// needs. Capacities are not compared here: the keyboard advertises its own,
// and the editors and Apply hold a profile to them.
/** @param {Partial<Caps> | null | undefined} capabilities @param {Partial<Awaited<ReturnType<typeof readViaIdentity>>> | null} [viaIdentity] */
function evaluateProfileCompatibility(capabilities, viaIdentity = {}) {
    const checks = [
        equalityCheck("Protocol major", capabilities?.protocol?.major, SUPPORTED_PROFILE_PROTOCOL.major),
        equalityCheck("Schema major", capabilities?.schema?.major, SUPPORTED_PROFILE_SCHEMA.major),
        oneOfCheck("VIA protocol version", viaIdentity?.protocolVersion, VIA_READS.SUPPORTED_PROTOCOL_VERSIONS),
        equalityCheck("VIA firmware version", viaIdentity?.firmwareVersion, capabilities?.firmwareVersion),
        equalityCheck("Raw HID report size", capabilities?.reportSize, RAW_HID_REPORT_SIZE),
        minimumCheck("Status pages", capabilities?.statusPageCount, PROFILE_WIRE_V1.STATUS_PAGE_COUNT),
        maskCheck("Required Profile Wire features", capabilities?.featureFlags, PROFILE_WIRE_KNOWN_MASKS.REQUIRED_READ_FEATURES),
        maskCheck("Required profile domains", capabilities?.supportedDomainMask, REQUIRED_PROFILE_DOMAIN_MASK),
    ];
    const reasons = checks.filter((check) => !check.ok).map((check) => check.message);
    return {
        compatible: reasons.length === 0,
        reasons,
        checks,
        requiredDomainMask: REQUIRED_PROFILE_DOMAIN_MASK,
    };
}

class ProfileRequestIdSequence {
    constructor(start = 1) {
        this.value = normalizeRequestId(start);
    }

    next() {
        const current = this.value;
        this.value = current === 0xff ? 1 : current + 1;
        return current;
    }
}

/** @param {unknown} value */
function normalizeRequestId(value) {
    const requestId = Number(value);
    if (!Number.isInteger(requestId) || requestId < 1 || requestId > 0xff) {
        throw new RangeError("Profile Wire request id must be an integer from 1 through 255.");
    }
    return requestId;
}

/** @param {string} label @param {number | undefined} actual @param {number | undefined} expected */
function equalityCheck(label, actual, expected) {
    const ok = Number(actual) === Number(expected);
    return {label, ok, actual, limit: expected, message: ok ? "" : `${label} is ${actual}; Charybdis Ark requires ${expected}.`};
}

/** @param {string} label @param {number | undefined} actual @param {readonly number[]} accepted */
function oneOfCheck(label, actual, accepted) {
    const ok = accepted.includes(Number(actual));
    return {label, ok, actual, limit: accepted, message: ok ? "" : `${label} is ${actual}; Charybdis Ark supports ${accepted.join(" or ")}.`};
}

/** @param {string} label @param {number | undefined} actual @param {number} expected */
function minimumCheck(label, actual, expected) {
    const ok = typeof actual === "number" && Number.isInteger(actual) && actual >= expected;
    return {label, ok, actual, limit: expected, message: ok ? "" : `${label} is ${actual}; at least ${expected} is required.`};
}

/** @param {string} label @param {number | undefined} actual @param {number} expected */
function maskCheck(label, actual, expected) {
    const numeric = Number(actual) || 0;
    const ok = (numeric & expected) === expected;
    return {label, ok, actual: numeric, limit: expected, message: ok ? "" : `${label} mask 0x${numeric.toString(16)} does not include required mask 0x${expected.toString(16)}.`};
}

/** @param {Partial<Caps> | null | undefined} capabilities @param {Pick<ReturnType<typeof evaluateProfileCompatibility>, "compatible" | "reasons"> | null | undefined} compatibility @param {boolean} [connected] @param {Partial<Status> | null | undefined} [status] */
function evaluateLiveMutationCompatibility(capabilities, compatibility, connected = true, status) {
    const reasons = [];
    if (!connected) reasons.push("Connect to the keyboard before applying a live profile.");
    if (!compatibility?.compatible) reasons.push(...(compatibility?.reasons || ["Read compatibility has not been established."]));
    const flags = Number(capabilities?.featureFlags) || 0;
    if ((flags & REQUIRED_LIVE_MUTATION_FEATURES) !== REQUIRED_LIVE_MUTATION_FEATURES) {
        reasons.push(`Firmware mutation flags 0x${flags.toString(16)} do not include required persistent split apply mask 0x${REQUIRED_LIVE_MUTATION_FEATURES.toString(16)}.`);
    }
    if (!Number.isInteger(capabilities?.candidateChunkMax) || (capabilities?.candidateChunkMax ?? 0) < 1) {
        reasons.push("Firmware does not advertise a candidate upload chunk size.");
    }
    if (connected && !status) {
        reasons.push("Live profile status has not been read yet.");
    } else if (status && !status.peerKnown) {
        reasons.push("The second keyboard half has not been detected over the split link.");
    } else if (status && !status.peerConverged) {
        reasons.push("The two keyboard halves have not established a converged profile state yet.");
    }
    return {
        available: reasons.length === 0,
        reasons,
        requiredFeatureMask: REQUIRED_LIVE_MUTATION_FEATURES,
        peerReady: Boolean(status?.peerKnown && status?.peerConverged),
        recoveryPending: Boolean(status?.candidatePending),
    };
}

/** @param {NonNullable<import("./types.js").DeviceModelInput["liveApply"]>} value */
function cloneLiveApply(value) {
    return value && value.state !== "idle" ? clone(value) : {state: /** @type {const} */ ("idle")};
}

/** @param {import("./types.js").CandidateStatus} status */
function cloneCandidateStatus(status) {
    return {
        ...status,
        error: status.error ? {...status.error} : null,
        stateName: candidateStateName(status?.state),
    };
}

// Keys neither QMK's catalogue nor the keyboard's own blocks name. The
// catalogue ends at QK_USER_31; the blocks count only on the ABI the app knows.
/** @param {Extract<import("./types.js").LayoutRead, {state: "read"}>["layers"]} layers @param {Partial<Caps> | null | undefined} capabilities */
function unnamedKeyCount(layers, capabilities) {
    const ownBlocks = knownActionAbi(capabilities?.actionAbiDigest ?? 0);
    /** @param {import("./types.js").LayoutKey} key */
    const named = ({keycode, resolved}) => resolved.known
        || ownBlocks && (customKeyOfCode(keycode) !== undefined || layerLockOfCode(keycode) !== undefined || pdBindingOfCode(keycode) !== undefined);
    return layers.flatMap((entry) => entry.keys).filter((key) => !named(key)).length;
}

/** @param {number} state */
function candidateStateName(state) {
    return CANDIDATE_STATE_NAMES[state] || `UNKNOWN_${state}`;
}

module.exports = {
    PROFILE_DOMAIN_FLAGS,
    SUPPORTED_PROFILE_PROTOCOL,
    SUPPORTED_PROFILE_SCHEMA,
    ProfileRequestIdSequence,
    ProfileDeviceService,
    REQUIRED_PROFILE_DOMAIN_MASK,
    REQUIRED_LIVE_MUTATION_FEATURES,
    evaluateProfileCompatibility,
    evaluateLiveMutationCompatibility,
    unnamedKeyCount,
};

/** @template T @param {T} value @returns {T} */
function clone(value) {return JSON.parse(JSON.stringify(value));}
