// @ts-check
"use strict";
const {PHASE} = require("../model/vocabulary");

/**
 * @typedef {import("./types.js").DeviceConnection} Connection
 * @typedef {import("./types.js").DeviceCapabilities} Caps
 * @typedef {import("./types.js").ProfileStatus} Status
 * @typedef {import("./types.js").ReadSnapshot} ReadSnapshot
 * @typedef {import("./types.js").CompleteReadSnapshot} CompleteReadSnapshot
 * @typedef {import("./types.js").RestoredProfile} Restored
 * @typedef {import("./types.js").PublicError & Partial<Record<'step' | 'stepLabel' | 'reason' | 'saved' | 'verdict', string>>} PublishedError
 */
const {requireReady, PROFILE_DOMAIN_FLAGS, SUPPORTED_PROFILE_PROTOCOL, SUPPORTED_PROFILE_SCHEMA,
    REQUIRED_PROFILE_DOMAIN_MASK, REQUIRED_LIVE_MUTATION_FEATURES,
    evaluateProfileCompatibility, evaluateLiveMutationCompatibility} = require("./firmware-support");
const {baseLighting} = require("../model/settings-editor");
const {profilePlacementProblem} = require("../model/profile-placement");
const {knownActionAbi} = require("../schema/actions");
const {customKeyOfCode, layerLockOfCode} = require("../data/user-keycodes");
const {pdModeKeyOfCode} = require("../data/pd-mode-keys");
const {layerName} = require("../model/vocabulary");
const {readSettings, readSettingsLimits} = require("../protocol/portable-profile-v1");
const {deviceLabels, editorViews} = require("./device-model");
const {storedKeyboardName} = require("../model/keyboard-name");
const {readHostOs} = require("../protocol/host-os-v1");
const {readFlashPauses} = require("../protocol/flash-pauses-v1");
const {readKeyboardOptions} = require("../protocol/keyboard-options-v1");
const {profileDomain} = require("../schema/profile-domains");
const {profileDepthOptions} = require("../schema/profile-depth");
const {snapshotProfile, restoreProfile, validateSnapshot} = require("./portable-profile-session");
const {DeviceRequestCoordinator} = require("../transport/request-coordinator");
const {decodeKeymapDomain} = require("../schema/keymap-domain-v1");
const keycodeCatalog = require("../data/keycode-catalog");
const {CHARYBDIS_4X6_LAYOUT_MATRIX, LAYERS, matrixPosition} = require("../data/charybdis-layout");
const {readDeviceCombos} = require("../protocol/combo-readback-v1");
const {ProfilePayloadReader, payloadMatchesActive, encodeCompiledRead, decodeCompiledRead} = require("./profile-payload-reader");
const {PROFILE_DOMAIN_IDS, decodeStoredProfileBlob, fnv1a32} = require("../schema/profile-blob-v1");
const {CANDIDATE_STATE_NAMES, readCandidateStatus} = require("../protocol/profile-candidate-v1");
const {PROFILE_ACTIVE_KIND, PROFILE_WIRE_FEATURES, readProfileCapabilities, readProfileStatus} = require("../protocol/profile-wire-v1");
const {EDIT_MODE, readActiveProfile, readEditMode, readEditProgress, readEditStatus, readRuntime} = require("../protocol/profile-edit-v1");

// The look at a live keyboard between edits (live-watch.js) is a background
// read: Chrome on macOS holds back a page's input reports while one of its
// menus is open, so an answer can be late though the keyboard is fine. Each
// of its requests waits this long, and a miss only skips that look; this many
// misses in a row mean the keyboard is lost.
const WATCH_TIMEOUT_MS = 3000;
const WATCH_MISSES = 3;
// What an operation started while another runs is told, here and by the panel.
const BUSY_REFUSAL = "Wait for the current operation to finish before starting another.";
const {snapshotLive} = require("./live-profile-session");
const {STARTING, STARTING_CODE, STARTING_WORDS, hasStarted, stillStarting} = require("./keyboard-starting");
const {LiveEditCoordinator, TransactionIds} = require("./live-edit-coordinator");

/** @type {(capabilities: Partial<Caps> | null | undefined, writing?: boolean) => asserts capabilities is Partial<Caps>} */
const checkReady = requireReady;
/** @param {number} ms */
const defaultSleep = ms => new Promise(resolve => setTimeout(resolve, ms));

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
// discards a usable profile nor masks an earlier error. Two are background
// reads, one at a time and never during an operation, which waits for one
// out: readLiveStatus and readFlashPauses, which never reject either. disconnect() always
// leaves the keyboard disconnected and resolves, recording a failure to close
// it cleanly.
class ProfileDeviceService {
    #operationActive = false;
    // A background read out now (the live watch's look, the flash pauses),
    // settled when it ends: one at a time, and an operation waits for it.
    /** @type {Promise<void> | undefined} */
    #background = undefined;

    get busy() { return this.#operationActive || this.disconnecting; }

    // The caller passes the transport: the page WebHID's, a Node script the
    // node-hid adapter (core/README.md). There is no default, so the page can
    // never reach for a native module.
    /** @param {import("./types.js").DeviceServiceOptions} options */
    constructor(options) {
        const adapter = options?.adapter;
        if (!adapter && !options?.coordinator) throw new TypeError("The device service needs the device adapter its shell talks through.");
        this.coordinator = options.coordinator || new DeviceRequestCoordinator(/** @type {import("../transport/types.js").DeviceAdapter} */ (adapter), {
            defaultTimeoutMs: options.defaultTimeoutMs,
            onUnexpectedReport: ({reason}) => this.addDiagnostic(`Ignored an unexpected Raw HID report: ${reason}.`),
        });
        this.onChange = typeof options.onChange === "function" ? options.onChange : undefined;
        this.watchTimeoutMs = options.watchTimeoutMs || WATCH_TIMEOUT_MS;
        this.missedLooks = 0;
        this.onApplyProgress = typeof options.onApplyProgress === "function" ? options.onApplyProgress : undefined;
        this.onReadProgress = typeof options.onReadProgress === "function" ? options.onReadProgress : undefined;
        // The wait between polls while reading and saving a profile. A shell
        // whose timers are throttled (a background browser tab) passes its
        // own; the timer's is used otherwise.
        this.sleep = typeof options.sleep === "function" ? options.sleep : undefined;
        // The clock a live edit's waits are measured on (Date.now when omitted).
        this.now = typeof options.now === "function" ? options.now : undefined;
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
        // The number a keyboard shows while it is listed: the smallest free
        // one when it appears, so two keyboards are always 1 and 2, and a
        // replugged one takes back a number that came free.
        /** @type {Map<string, number>} */
        this.numbersByPublicId = new Map();
        /** @type {Connection | undefined} */
        this.connection = undefined;
        this.connectionPublicId = "";
        this.connectionSequence = 0;
        /** @type {number | null} */
        this.connectionToken = null;
        /** @type {(() => void) | undefined} */
        this.disposeConnectionListener = undefined;
        this.disconnecting = false;
        // A save renamed the keyboard, which then restarts USB by itself
        // (keyboard-reconnect.js): losing the connection is no failure.
        this.reconnectExpected = false;
        this.reconnectReason = "to take its new name";
        // The keyboard the connection was lost to, unexpectedly, until the
        // panel loop takes it to connect it again (keyboard-reconnect.js).
        /** @type {import("./types.js").LostKeyboard | undefined} */
        this.lost = undefined;
        this.scanned = false;
        /** @type {import("../../contracts/model.js").PhaseId} */
        this.phase = PHASE.IDLE;
        this.operationId = 0;
        /** @type {Caps | undefined} */
        this.capabilities = undefined;
        /** @type {Status | undefined} */
        this.status = undefined;
        /** @type {import("./types.js").CandidateStatus | undefined} */
        this.candidateStatus = undefined;
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
        // Each half's flash pauses, read for the Keyboard screen's Diagnostics.
        /** @type {import("../../contracts/model.js").FlashPausesView | undefined} */
        this.flashPauses = undefined;
        /** @type {ReadSnapshot | Restored | undefined} */
        this.portable = undefined;
        this.portableProgress = "";
        // Ark's own live edit or Revert the keyboard holds until no key is
        // held (live-edit-coordinator.js), while it waits.
        /** @type {import("./types.js").LiveWaiting | null} */
        this.liveWaiting = null;
        /** @type {ReturnType<typeof editorViews>["macroView"] | undefined} */
        this.macroView = undefined;
        /** @type {ReturnType<typeof editorViews>["customKeyView"] | undefined} */
        this.customKeyView = undefined;
        /** @type {ReturnType<typeof editorViews>["settingsView"] | undefined} */
        this.settingsView = undefined;
        /** @type {InstanceType<typeof ProfilePayloadReader> | undefined} */
        this.payloadReader = undefined;
        // The compiled defaults last verified on any connection, so a
        // reconnect does not download them again; a shell that keeps them
        // between runs (`compiledDefaults`) spares the first read too. A
        // reader takes them only for a keyboard whose metadata names exactly
        // those bytes.
        this.compiledDefaultsStore = options.compiledDefaults && typeof options.compiledDefaults.get === "function" && typeof options.compiledDefaults.set === "function" ? options.compiledDefaults : undefined;
        /** @type {import("../protocol/types.js").PayloadRead | undefined} */
        this.knownCompiled = undefined;
        // How edits reach this keyboard (firmware D-F32), read with its
        // capabilities; undefined when the keyboard does not say.
        /** @type {(import("../protocol/types.js").EditModeRead & {notStored?: boolean}) | undefined} */
        this.editMode = undefined;
        // The edit mode could not be read (not refused as unknown): Review and
        // save's reads meanwhile, and the next status refresh or read tries
        // again.
        this.editModeUnknown = false;
        // The toggles' stored masters and runtime overrides (GET 0x22).
        /** @type {import("../protocol/types.js").RuntimeRead | null} */
        this.runtime = null;
        /** @type {InstanceType<typeof LiveEditCoordinator> | undefined} */
        this.liveEdits = undefined;
    }

    async enumerate() {
        return this.runOperation(PHASE.ENUMERATE, async () => {
            const descriptors = await this.coordinator.listDevices();
            this.adapterIdsByPublicId.clear();
            const ids = descriptors.map((descriptor) => {
                const identity = JSON.stringify([descriptor.id, cleanText(descriptor.serialNumber)]);
                let id = this.publicIdsByAdapterIdentity.get(identity);
                if (!id) {
                    id = `charybdis-${this.nextPublicDeviceId++}`;
                    this.publicIdsByAdapterIdentity.set(identity, id);
                }
                this.adapterIdsByPublicId.set(id, descriptor.id);
                return id;
            });
            for (const id of [...this.numbersByPublicId.keys()]) if (!ids.includes(id)) this.numbersByPublicId.delete(id);
            for (const id of ids) {
                if (this.numbersByPublicId.has(id)) continue;
                const taken = new Set(this.numbersByPublicId.values());
                let number = 1;
                while (taken.has(number)) number += 1;
                this.numbersByPublicId.set(id, number);
            }
            const devices = descriptors.map((descriptor, index) =>
                publicDeviceDescriptor(ids[index], descriptor, /** @type {number} */ (this.numbersByPublicId.get(ids[index]))));
            const labels = deviceLabels(devices);
            this.devices = devices.map((device, index) => ({...device, label: labels[index]}));
            this.scanned = true;
            this.phase = this.connection ? PHASE.CONNECTED : this.devices.length ? PHASE.AVAILABLE : PHASE.EMPTY;
            this.addDiagnostic(
                this.devices.length
                    ? `Found ${this.devices.length} compatible Charybdis Raw HID interface${this.devices.length === 1 ? "" : "s"}.`
                    : "No compatible Charybdis Raw HID interface is currently visible."
            );
        });
    }

    /** @param {string} publicDeviceId */
    async connect(publicDeviceId) {
        if (this.busy) this.refuseBusy();
        const adapterDeviceId = this.adapterIdsByPublicId.get(String(publicDeviceId || ""));
        if (!adapterDeviceId) this.refuse("Select a keyboard from the latest scan before connecting.");
        if (this.connection) {
            await this.disconnect();
        }
        await this.runOperation(PHASE.CONNECT, async () => {
            const connection = await this.coordinator.connect(adapterDeviceId);
            this.connection = connection;
            this.reconnectExpected = false;
            this.lost = undefined;
            this.missedLooks = 0;
            this.requestIds = new ProfileRequestIdSequence(this.requestIdStart);
            this.connectionPublicId = String(publicDeviceId);
            this.connectionToken = ++this.connectionSequence;
            this.phase = PHASE.CONNECTED;
            this.disposeConnectionListener = connection.onDisconnect((reason) => this.handleDisconnect(reason));
            this.addDiagnostic(`Connected to ${this.deviceLabel(this.connectionPublicId)}.`);
        });
        return this.refresh();
    }

    async refresh() {
        if (!this.connection?.connected) this.refuse("Connect to a keyboard before refreshing live capabilities.");
        return this.runOperation(PHASE.REFRESH, async () => {
            const connection = this.connectedConnection();
            let capabilities;
            try {capabilities = await readProfileCapabilities(connection, {nextRequestId: () => this.nextRequestId()});}
            catch (error) {
                const code = /** @type {{code?: string}} */ (error).code;
                if (code === "INCOMPATIBLE_RESPONSE" || code === "UNHANDLED") throw Object.assign(new Error("Ark supports only current firmware. Update both halves, then read the keyboard again."), {code: "FIRMWARE_UPDATE_REQUIRED", cause: error});
                throw error; // Timeouts and broken correlation remain transport failures.
            }
            const compatibility = evaluateProfileCompatibility(capabilities);
            const status = compatibility.compatible ? await readProfileStatus(connection, {nextRequestId: () => this.nextRequestId()}) : undefined;
            const candidateStatus = compatibility.compatible && (capabilities.featureFlags & PROFILE_WIRE_FEATURES.SAVES) !== 0
                ? await this.readCandidateStatus(connection, {nextRequestId: () => this.nextRequestId()})
                : undefined;
            // Every build that saves has a working copy and an edit mode; a
            // keyboard that does not answer is read and applied as before.
            this.editMode = undefined;
            this.editModeUnknown = false;
            if (candidateStatus) await this.#readEditMode(connection);
            if (this.connection !== connection || !connection.connected) {
                throw new Error("The keyboard disconnected while live state was being refreshed.");
            }
            this.capabilities = capabilities;
            this.status = status;
            this.candidateStatus = candidateStatus;
            // A connection that replaces a lost one: an edit Ark began on the
            // old one and never finished is aborted now rather than holding
            // the keyboard until its lease ends.
            if (this.editMode) await this.liveCoordinator().abandonUnfinished().catch(() => false);
            await this.#readLiveFacts(connection);
            this.lastRefreshedAt = new Date().toISOString();
            this.phase = PHASE.CONNECTED;
            this.addDiagnostic(
                compatibility.compatible
                    ? "Profile Wire capabilities identify compatible current firmware."
                    : `Live compatibility check found ${compatibility.reasons.length} blocking issue${compatibility.reasons.length === 1 ? "" : "s"}.`
            );
        });
    }

    // Waits until the keyboard has finished starting (keyboard-starting.js):
    // polls profile status until `deadline` on the service's clock,
    // STARTING.WAIT_MS from now when omitted. A wait given a deadline is a
    // read's retry, and first lets one poll interval pass. Resolves whether it
    // started and whether the deadline passed; still starting then, with its
    // slave half known, it fails KEYBOARD_STARTING.
    /** @param {{deadline?: number}} [options] @returns {Promise<{started: boolean, deadline: number, late: boolean}>} */
    async awaitStarted({deadline} = {}) {
        if (!this.connection?.connected) this.refuse("Connect to a keyboard before reading it.");
        const now = this.now || Date.now, sleep = this.sleep || defaultSleep;
        const until = deadline ?? now() + STARTING.WAIT_MS;
        let started = false;
        await this.runOperation(PHASE.STARTING, async () => {
            const connection = this.connectedConnection();
            if (deadline !== undefined) await sleep(STARTING.POLL_MS);
            for (;;) {
                if (this.connection !== connection || !connection.connected) throw new Error("The keyboard disconnected while it was starting.");
                const status = await readProfileStatus(connection, {nextRequestId: () => this.nextRequestId()});
                this.status = status;
                if (hasStarted(status)) {started = true; break;}
                if (now() >= until) {
                    if (stillStarting(status) && status.slaveKnown) throw Object.assign(new Error(STARTING_WORDS.timeout), {code: STARTING_CODE});
                    this.addDiagnostic("The keyboard had not finished starting when the wait ended; reading it as it is.");
                    break;
                }
                await sleep(STARTING.POLL_MS);
            }
            this.phase = PHASE.CONNECTED;
        });
        return {started, deadline: until, late: now() >= until};
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

        return this.runOperation(PHASE.READ_LAYOUT, async () => {
            const connection = this.connectedConnection();

            let keymap;
            try {
                keymap = await this.#readKeymap(connection, progress => this.reportReadProgress("layout", progress));
            } catch (error) {
                this.layout = {state: "unavailable", error: publicError(error), layers: [], progress: null};
                throw error;
            }
            if (this.connection !== connection || !connection.connected) {
                throw new Error("The keyboard disconnected while its layout was being read.");
            }

            this.#acceptLayout(layoutOf(keymap, /** @type {number} */ (layerCount)));
        }, {initialize: () => {this.layout = {state: "reading", progress: {done: 0, total: 0}, layers: [], readAt: ""};}});
    }

    // The keymap the keyboard types: its active profile's keymap domain, or
    // the compiled default's when the saved profile has none (the firmware
    // falls back to it the same way).
    /** @param {Connection} connection @param {(progress: import("../../contracts/model.js").CountedProgress) => void} onProgress */
    async #readKeymap(connection, onProgress) {
        this.#requireCurrentRead();
        const options = {nextRequestId: () => this.nextRequestId(), onProgress};
        const {read, source} = await this.#readActivePayload(connection, options);
        /** @param {Uint8Array} bytes */
        const keymapOf = bytes => decodeStoredProfileBlob(bytes).domains.find(domain => domain.id === PROFILE_DOMAIN_IDS.KEYMAP);
        let found = keymapOf(read.bytes);
        if (!found && source === "committed") {
            found = keymapOf((await this.profilePayloadReader().readCompiled(options)).bytes);
            await this.#confirmActivePayload(connection, read, source, options);
        }
        if (!found) throw new Error("The keyboard's profile has no keymap.");
        return decodeKeymapDomain(found.payload);
    }

    /** @param {Connection} connection @param {import("../protocol/types.js").ReadOptions} options @param {boolean} [reuse] */
    async #readActivePayload(connection, options, reuse = false) {
        const status = await readProfileStatus(connection, options);
        this.status = status;
        const source = status.activeKind === PROFILE_ACTIVE_KIND.COMPILED_ONLY ? "compiled" : "committed";
        if (status.activeKind !== PROFILE_ACTIVE_KIND.COMPILED_ONLY && status.activeKind !== PROFILE_ACTIVE_KIND.COMMITTED) {
            throw this.#activePayloadUnavailable();
        }
        const reader = this.profilePayloadReader();
        const read = source === "compiled" ? await reader.readCompiled(options) : await reader.readCommitted({...options, reuse});
        // Read status again even if the first identity did not match: health
        // must report the keyboard now, including recovery that just finished.
        await this.#confirmActivePayload(connection, read, source, options);
        if (!payloadMatchesActive(read, status)) throw this.#activePayloadUnavailable();
        return {read, source};
    }

    /** @param {Connection} connection @param {import("../protocol/types.js").PayloadRead} read @param {string} source @param {import("../protocol/types.js").ReadOptions} options */
    async #confirmActivePayload(connection, read, source, options) {
        const status = await readProfileStatus(connection, options);
        this.status = status;
        if ((source === "compiled") !== (status.activeKind === PROFILE_ACTIVE_KIND.COMPILED_ONLY)
            || !payloadMatchesActive(read, status)) throw this.#activePayloadUnavailable();
    }

    #activePayloadUnavailable() {
        return Object.assign(new Error("The keyboard's active profile is unavailable: its readable payload does not match the profile it is running. Let both halves finish recovery, then read the keyboard again."), {code: "ACTIVE_PROFILE_UNAVAILABLE"});
    }

    /** @param {ReturnType<typeof layoutOf>} layers */
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
    // `reuse`: a read made right after one that downloaded and checked the
    // saved profile may take those bytes again, only while the keyboard's
    // fresh metadata still names exactly them (rereadKeyboard). Otherwise the
    // saved bytes always download.
    /** @param {{reuse?: boolean}} [options] */
    async readCommittedProfile({reuse = false} = {}) {
        if (!this.connection?.connected) this.refuse("Connect to a keyboard before reading its profile.");

        return this.runOperation(PHASE.READ_PROFILE, async () => {
            this.#requireCurrentRead();
            const connection = this.connectedConnection();

            /** @type {import("../protocol/types.js").ReadOptions & {onProgress: (progress: import("../../contracts/model.js").CountedProgress) => void}} */
            const readOptions = {
                nextRequestId: () => this.nextRequestId(),
                onProgress: progress => this.reportReadProgress("profile", progress),
            };
            const {read, source} = await this.#readActivePayload(connection, readOptions, reuse);
            if (this.connection !== connection || !connection.connected) {
                throw new Error("The keyboard disconnected while its profile was being read.");
            }
            this.#acceptCommitted(read, source);
        }, {initialize: () => {this.committed = {state: "reading", progress: {done: 0, total: 0}};}});
    }

    /** @param {{metadata: Pick<import("../protocol/types.js").PayloadMetadata, "generation" | "digest" | "schema" | "originHalf">, bytes: Buffer}} read @param {string} source */
    #acceptCommitted({metadata, bytes}, source) {
        const blob = decodeStoredProfileBlob(bytes);
        const rgb = blob.domains.find(domain => domain.id === PROFILE_DOMAIN_IDS.RGB);
        const depth = profileDepthOptions(this.capabilities, rgb?.payload);
        /** @type {import("./types.js").ReadDomains} */
        const domains = {};
        const failures = [];
        for (const domain of blob.domains) {
            try {
                const registered = profileDomain(domain.id);
                // The keymap and macros reach the editors through the layout
                // and the complete read, not this readback.
                if (registered?.readKey) Object.assign(domains, {[registered.readKey]: registered.decode(domain.payload, depth)});
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

    #requireCurrentRead() {
        if (!evaluateProfileCompatibility(this.capabilities).compatible) throw Object.assign(new Error("Ark supports only current firmware. Update both halves, then read the keyboard again."), {code: "FIRMWARE_UPDATE_REQUIRED"});
    }

    /** @param {Connection} connection */
    async #readBaseLighting(connection) {
        this.#requireCurrentRead();
        const {decodeSettings} = require("../schema/settings-domain-v1");
        const lighting = baseLighting(decodeSettings(await readSettings(connection, this.requestSequence())).values);
        return {effectId: lighting.enabled ? lighting.effect : 0, brightness: lighting.brightness,
            hue: lighting.hue, saturation: lighting.saturation, speed: lighting.speed};
    }

    // Optional: never rejects. A failure while connected is recorded as
    // `combos: {state: "unavailable", error}`; a lost connection clears it.
    async readCombos() {
        return this.readOptional(PHASE.READ_COMBOS, async () => {
            const connection = this.connection;
            try {
                if (!connection?.connected) throw new Error("Connect to a keyboard before reading combos.");
                this.#requireCurrentRead();
                const read = await readDeviceCombos(connection, {nextRequestId: () => this.nextRequestId()});
                if (this.connection !== connection || !connection.connected) return this.snapshot();
                this.combos = {state: "read", ...read, readAt: new Date().toISOString()};
            } catch (error) {
                if (this.connection !== connection) return this.snapshot();
                this.combos = connection?.connected ? {state: "unavailable", error: publicError(error)} : undefined;
            }
            return this.snapshot();
        }, () => {this.combos = {state: "reading"};});
    }

    // Optional: never rejects. A failure while connected is recorded as
    // `baseRgb: {state: "unavailable", error}` and a diagnostic, leaving
    // `error` and the profile alone; a lost connection clears it.
    async readBaseRgb() {
        return this.readOptional(PHASE.READ_BASE_RGB, async () => {
            const connection = this.connection;
            try {
                if (!connection?.connected) throw new Error("Connect to a keyboard before reading base RGB.");
                const settings = await this.#readBaseLighting(connection);
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
            return this.snapshot();
        }, () => {this.baseRgb = {state: "reading"};});
    }

    // Always ends disconnected and resolves; a failure to close the handle
    // cleanly is recorded in `error`.
    async disconnect() {
        const connection = this.connection;
        if (!connection) {
            this.phase = this.scanned ? (this.devices.length ? PHASE.AVAILABLE : PHASE.EMPTY) : PHASE.IDLE;
            this.emitChange();
            return this.snapshot();
        }
        this.disconnecting = true;
        this.phase = PHASE.DISCONNECT;
        this.error = undefined;
        this.emitChange();
        this.disposeConnectionListener?.();
        this.disposeConnectionListener = undefined;
        try {
            await connection.disconnect();
        } catch (error) {
            this.setError(error);
        } finally {
            this.disconnecting = false;
            this.clearConnection();
            this.phase = this.scanned ? (this.devices.length ? PHASE.AVAILABLE : PHASE.EMPTY) : PHASE.IDLE;
            this.addDiagnostic("Disconnected from the live keyboard.");
            this.emitChange();
        }
        return this.snapshot();
    }

    // One coherent snapshot supplies the editor and the draft. Standalone
    // exports use the same reader without replacing the editor's state.
    /** @returns {Promise<import("./types.js").CompleteReadSnapshot>} */
    async readKeyboardProfile() {
        const read = await this.#readCompleteProfile({forEditor: true});
        if (read.incomplete) throw new Error("The keyboard did not return a complete editor profile.");
        return read;
    }

    /** @overload @param {{forRestore: true; reuseReadback?: boolean}} options @returns {Promise<import("./types.js").ReadSnapshot>} */
    /** @overload @param {{forRestore?: false; reuseReadback?: boolean}} [options] @returns {Promise<import("./types.js").CompleteReadSnapshot>} */
    /** @param {{forRestore?: boolean; reuseReadback?: boolean}} [options] @returns {Promise<import("./types.js").ReadSnapshot>} */
    async readPortableProfile(options = {}) {
        return this.#readCompleteProfile(options);
    }

    /** @param {{forRestore?: boolean; reuseReadback?: boolean; forEditor?: boolean}} [options] @returns {Promise<ReadSnapshot>} */
    async #readCompleteProfile({forRestore = false, reuseReadback = false, forEditor = false} = {}) {
        if (!this.connection?.connected || this.busy) this.refuse("Connect the keyboard and wait for the current operation to finish.");
        /** @type {ReadSnapshot | undefined} */
        let result;
        await this.runOperation(PHASE.READ_COMPLETE, async () => {
            this.portableProgress = "";
            try {
                const connection = this.connectedConnection();
                const capabilities = this.profileCapabilities();
                if (await this.#readsLive(connection)) {
                    result = await this.#readLiveProfile(connection, capabilities, forEditor);
                    if (forEditor || forRestore) this.#adoptPortable(result);
                    return;
                }
                const snapshot = await snapshotProfile(connection, this.requestSequence(), capabilities,
                    message => this.reportReadProgress("portable", message), false, forRestore,
                    {sleep: this.sleep, payloadReader: this.profilePayloadReader(), reuseReadback});
                const {readback, ...withoutReadback} = snapshot;
                result = withoutReadback;
                Object.assign(result, await this.#readDeviceFacts(connection));
                if (forEditor) {
                    if (snapshot.incomplete) throw new Error("The keyboard did not return a complete editor profile.");
                    const decoded = validateSnapshot(snapshot.document);
                    const lighting = baseLighting(decoded.settings.values);
                    const baseRgb = {state: /** @type {const} */ ("read"), effectId: lighting.enabled ? lighting.effect : 0,
                        brightness: lighting.brightness, hue: lighting.hue, saturation: lighting.saturation, speed: lighting.speed,
                        readAt: new Date().toISOString()};
                    if (this.connection !== connection || !connection.connected) throw new Error("The keyboard disconnected while its configuration was being read.");
                    this.#acceptLayout(layoutOf(decoded.layers, decoded.layers.length));
                    this.#acceptCommitted(snapshot.readback.active, snapshot.readback.source);
                    this.status = result.status;
                    this.combos = {state: "read", ...snapshot.readback.combos, readAt: new Date().toISOString()};
                    this.baseRgb = baseRgb;
                    // Review and save shows a toggle a key turned off as well.
                    await this.#readLiveFacts(connection);
                }
                // Export is an independent snapshot. Only an editor read or a
                // restore/rebase read changes the state the editor follows.
                if (forEditor || forRestore) this.#adoptPortable(result);
                this.portableProgress = "";
            } finally {this.portableProgress = "";}
        });
        if (!result) throw new Error("The keyboard operation returned no verified profile.");
        return result;
    }

    // The edit mode; anything but a firmware without it (UNHANDLED) leaves
    // the mode unknown, tried again at the next status refresh or read.
    /** @param {Connection} connection */
    async #readEditMode(connection) {
        try {
            const editMode = await readEditMode(connection, {nextRequestId: () => this.nextRequestId()});
            this.editMode = {...editMode, notStored: this.editMode?.notStored ?? false};
            this.editModeUnknown = false;
        } catch (error) {
            this.editModeUnknown = /** @type {{code?: string}} */ (error).code !== "UNHANDLED";
            if (this.editModeUnknown) this.addDiagnostic("The keyboard's edit mode could not be read; Ark tries again.");
        }
    }

    // What the panel shows beside the profile in either mode: the toggles a
    // key turned off (GET 0x22) and, with an edit mode, whether its last
    // write is still owed. Neither stops anything when it cannot be read.
    /** @param {Connection} connection */
    async #readLiveFacts(connection) {
        if (this.editModeUnknown) await this.#readEditMode(connection);
        if (!this.editMode) return;
        try {this.runtime = await readRuntime(connection, {nextRequestId: () => this.nextRequestId()});} catch {}
        try {
            const progress = await readEditProgress(connection, {nextRequestId: () => this.nextRequestId()});
            this.editMode = {...this.editMode, notStored: progress.modeNotStored};
        } catch {}
    }

    // Live preview + save reads the working copy and the saved profile
    // together (live-profile-session.js): whenever the keyboard's edit mode is
    // not Review and save, and in Review and save too while it still runs
    // unsaved live edits, which only Save or Revert can settle.
    /** @param {Connection} connection */
    async #readsLive(connection) {
        if (this.editModeUnknown) await this.#readEditMode(connection);
        if (!this.editMode) return false;
        if (this.editMode.mode !== EDIT_MODE.APPLY) return true;
        this.status = await readProfileStatus(connection, {nextRequestId: () => this.nextRequestId()});
        return this.status.activeKind === PROFILE_ACTIVE_KIND.WORKING;
    }

    /** @param {Connection} connection @param {Caps} capabilities @param {boolean} forEditor @returns {Promise<import("./types.js").LiveSnapshot>} */
    async #readLiveProfile(connection, capabilities, forEditor) {
        const snapshot = await snapshotLive(connection, this.requestSequence(), capabilities, {payloadReader: this.profilePayloadReader(), sleep: this.sleep,
            onProgress: message => this.reportReadProgress("portable", message)});
        const facts = await this.#readDeviceFacts(connection);
        if (this.connection !== connection || !connection.connected) throw new Error("The keyboard disconnected while its configuration was being read.");
        /** @type {import("./types.js").LiveSnapshot} */
        const result = {...snapshot, ...facts, saved: {...snapshot.saved, ...facts}};
        this.status = snapshot.status;
        this.runtime = snapshot.runtime;
        if (this.editMode) this.editMode = {...this.editMode, mode: snapshot.live.mode};
        if (forEditor) {
            const decoded = validateSnapshot(result.document);
            const lighting = baseLighting(decoded.settings.values);
            this.#acceptLayout(layoutOf(decoded.layers, decoded.layers.length));
            // What the editors follow is what the keyboard runs; its schema
            // is the blob's own, its generation the saved one it began from.
            const working = snapshot.live.working;
            this.#acceptCommitted({metadata: {generation: snapshot.live.savedGeneration, digest: fnv1a32(working),
                schema: decodeStoredProfileBlob(working).schema, originHalf: snapshot.live.savedOrigin},
            bytes: working}, snapshot.live.unsaved ? "working" : snapshot.live.savedGeneration ? "committed" : "compiled");
            if (snapshot.combosReadback) this.combos = {state: "read", ...snapshot.combosReadback, readAt: new Date().toISOString()};
            this.baseRgb = {state: "read", effectId: lighting.enabled ? lighting.effect : 0, brightness: lighting.brightness,
                hue: lighting.hue, saturation: lighting.saturation, speed: lighting.speed, readAt: new Date().toISOString()};
        }
        return result;
    }

    // One coordinator per connection, so its transaction ids never repeat
    // within it.
    liveCoordinator() {
        const connection = this.connectedConnection();
        if (!this.liveEdits || this.liveEdits.connection !== connection) {
            this.liveEdits = new LiveEditCoordinator(connection, {requestIds: this.requestSequence(), transactionIds: new TransactionIds(), sleep: this.sleep, now: this.now});
        }
        return this.liveEdits;
    }

    // What the keyboard holds until no key is held, published as it changes.
    /** @param {import("./types.js").LiveWaiting | null} waiting */
    #showWaiting(waiting) {
        if (JSON.stringify(waiting) === JSON.stringify(this.liveWaiting)) return;
        this.liveWaiting = waiting;
        this.emitChange();
    }

    // A live edit from the working copy's exact bytes to `to` (firmware
    // D-F32). Resolves with what the keyboard runs now, or `cancelled` when
    // Cancel edit ended it while the keyboard held it; a refusal rejects
    // and is recorded like any failed operation. `onCommitted` learns the
    // transaction the keyboard took whole.
    /** @param {{from: Buffer, to: Buffer, defaults: Buffer, identity: {session: number, revision: number}, replaceWhenLarge?: boolean}} edit
     * @param {{onCommitted?: (transactionId: number) => void}} [options] */
    async postLiveEdit(edit, {onCommitted} = {}) {
        if (!this.connection?.connected) this.refuse("Connect the keyboard before editing it.");
        /** @type {Awaited<ReturnType<InstanceType<typeof LiveEditCoordinator>["post"]>> | undefined} */
        let result;
        await this.runOperation(PHASE.LIVE_EDIT, async () => {
            const capabilities = this.profileCapabilities();
            try {
                result = await this.liveCoordinator().post({...edit, capacity: capabilities.profileSlotPayload || 130048},
                    {onCommitted, onWaiting: waiting => this.#showWaiting(waiting)});
            } finally {this.liveWaiting = null;}
        }, {after: () => this.#refreshLive()});
        if (!result) throw new Error("The keyboard operation returned no edit result.");
        return result;
    }

    // Save: the keyboard writes its working copy as a new generation on both
    // halves (firmware D-F32). Resolves with the edit status after it.
    /** @param {{session: number, revision: number}} identity */
    async saveWorkingCopy(identity) {
        if (!this.connection?.connected) this.refuse("Connect the keyboard before saving.");
        /** @type {Awaited<ReturnType<InstanceType<typeof LiveEditCoordinator>["save"]>> | undefined} */
        let result;
        await this.runOperation(PHASE.LIVE_SAVE, async () => {
            result = await this.liveCoordinator().save(identity, status => {
                this.portableProgress = status.storagePaused || status.slaveStoragePaused ? "Waiting for a quiet keyboard to write flash"
                    : status.waitingSafe ? "Release held keys to finish saving" : "Saving on both halves";
                this.emitChange();
            });
        }, {after: () => this.#refreshLive()});
        this.portableProgress = "";
        if (!result) throw new Error("The keyboard operation returned no save result.");
        return result;
    }

    // Revert: the keyboard runs its saved profile again; nothing is written.
    /** @param {{session: number, revision: number}} identity */
    async revertWorkingCopy(identity) {
        if (!this.connection?.connected) this.refuse("Connect the keyboard before reverting it.");
        /** @type {Awaited<ReturnType<InstanceType<typeof LiveEditCoordinator>["revert"]>> | undefined} */
        let result;
        await this.runOperation(PHASE.LIVE_REVERT, async () => {
            try {result = await this.liveCoordinator().revert(identity, {onWaiting: waiting => this.#showWaiting(waiting)});}
            finally {this.liveWaiting = null;}
        }, {after: () => this.#refreshLive()});
        if (!result) throw new Error("The keyboard operation returned no revert result.");
        return result;
    }

    // Cancel edit, taken while a live edit runs: the keyboard holds it until
    // no key is held, and aborts it at Ark's next look. False when nothing
    // of Ark's is held that can be cancelled.
    cancelLiveEdit() {
        return Boolean(this.liveWaiting && this.liveEdits?.cancelWaiting());
    }

    // Leaving Live edit: the keyboard saves at once what it has not saved yet
    // (live-edit-coordinator.js), so its mode can change. Resolves with the
    // edit status after it.
    /** @param {(document: import("../model/types.js").PortableDocument) => Promise<string | undefined>} saveRecovery */
    async flushWorkingCopy(saveRecovery) {
        if (!this.connection?.connected) this.refuse("Connect the keyboard before changing how edits reach it.");
        /** @type {Awaited<ReturnType<InstanceType<typeof LiveEditCoordinator>["flush"]>> | undefined} */
        let result;
        await this.runOperation(PHASE.LIVE_SAVE, async () => {
            result = await this.liveCoordinator().flush(status => {
                this.portableProgress = status.storagePaused || status.slaveStoragePaused ? "Waiting for a quiet keyboard to write flash"
                    : status.autoSave.inProgress ? "The keyboard is saving its edits" : "Saving what the keyboard has not saved yet";
                this.emitChange();
            }, async status => {
                // A quiet-period save may have moved the saved base since the
                // panel's snapshot. Recover what is actually saved immediately
                // before each explicit Save, inside this operation's ownership.
                const snapshot = await this.#readLiveProfile(this.connectedConnection(), this.profileCapabilities(), false);
                if (!snapshot.live.unsaved) return;
                if (snapshot.live.session !== status.session || snapshot.live.revision !== status.revision
                    || snapshot.live.savedGeneration !== status.savedGeneration || snapshot.live.savedOrigin !== status.savedOrigin) {
                    throw Object.assign(new Error("The keyboard changed before its recovery copy was saved."), {code: "LIVE_EDIT_STALE"});
                }
                const recovery = await saveRecovery(snapshot.saved.document);
                if (!recovery) throw Object.assign(new Error("A recovery copy could not be saved. Nothing was saved on the keyboard."), {code: "RECOVERY_REQUIRED"});
            });
        }, {after: () => this.#refreshLive()});
        this.portableProgress = "";
        if (!result) throw new Error("The keyboard operation returned no save result.");
        return result;
    }

    // What the keyboard runs now (its working copy, or its saved profile),
    // read as one revision (GET 0x21): what a restart would lose.
    async readWorkingCopy() {
        if (!this.connection?.connected) this.refuse("Connect the keyboard before reading it.");
        /** @type {Awaited<ReturnType<typeof readActiveProfile>> | undefined} */
        let result;
        await this.runOperation(PHASE.READ_COMPLETE, async () => {
            result = await readActiveProfile(this.connectedConnection(), {...this.liveCoordinator().options, maxLength: this.profileCapabilities().profileSlotPayload || 130048});
        });
        if (!result) throw new Error("The keyboard operation returned no profile.");
        return result;
    }

    // Restart both halves (firmware D-F34): the keyboard answers, then drops
    // off USB and comes back as from power, so that loss is expected. Resolves
    // with whether the slave half acknowledged, and so restarts too.
    async restartKeyboard() {
        if (!this.connection?.connected) this.refuse("Connect the keyboard before restarting it.");
        /** @type {{slaveAcknowledged: boolean} | undefined} */
        let result;
        await this.runOperation(PHASE.RESTART, async () => {
            this.expectReconnect(true, "to restart");
            try {result = await this.liveCoordinator().restart();}
            catch (error) {this.expectReconnect(false); throw error;}
        });
        if (!result) throw new Error("The keyboard operation returned no restart result.");
        return result;
    }

    // Between edits, what a live keyboard says about itself: whether it saved
    // by itself, whether its own keys moved the revision, how its halves are.
    // A background read, skipped (undefined) while an operation holds the
    // keyboard. An unanswered look is skipped too, and keeps the connection;
    // WATCH_MISSES of them in a row end it as a lost keyboard.
    async readLiveStatus() {
        const connection = this.#quietConnection();
        if (!connection || !this.editMode) return undefined;
        const background = this.#backgroundConnection(connection);
        return this.#inBackground(async () => {try {
            const status = await readEditStatus(background, this.liveCoordinator().options);
            this.missedLooks = 0;
            if (this.connection !== connection || !connection.connected) return undefined;
            // The mode's write to EEPROM retried (flag 12) shows beside the switch.
            if (this.editMode && Boolean(this.editMode.notStored) !== status.modeNotStored) {this.editMode = {...this.editMode, notStored: status.modeNotStored}; this.emitChange();}
            return status;
        } catch (error) {
            // A refused read is tried again at the next look.
            if (/** @type {{soft?: boolean}} */ (error)?.soft && this.connection === connection) {
                this.missedLooks++;
                this.addDiagnostic(`${this.deviceLabel(this.connectionPublicId)} missed a status look (${this.missedLooks} in a row).`);
                if (this.missedLooks >= WATCH_MISSES) await connection.abandon(error);
            }
            return undefined;
        }});
    }

    // Each half's flash pauses (GET 0x0D) for the Keyboard screen's
    // Diagnostics, into `flashPauses`: a background read like the watch's
    // look, false when skipped because an operation holds the keyboard or
    // another background read is out. A failure is the read's own
    // `{state: "unavailable", error}`, never the keyboard's error.
    async readFlashPauses() {
        const connection = this.#quietConnection(), ids = this.requestIds;
        if (!connection || !ids) return false;
        return this.#inBackground(async () => {
            /** @type {import("../../contracts/model.js").FlashPausesView} */
            let read;
            try {read = {state: "read", ...await readFlashPauses(this.#backgroundConnection(connection), ids)};}
            catch (error) {read = {state: "unavailable", error: publicError(error).message};}
            if (this.connection !== connection || !connection.connected) return false;
            this.flashPauses = read;
            this.emitChange();
            return true;
        });
    }

    // The connection a background read may start on: none while an operation
    // holds the keyboard or another background read is out.
    #quietConnection() {
        return this.busy || this.#background || !this.connection?.connected || !this.requestIds ? undefined : this.connection;
    }

    // A read the caller can miss: each request waits the watch's timeout, and
    // one unanswered fails alone and keeps the connection.
    /** @param {Connection} connection @returns {import("../transport/types.js").RequestConnection} */
    #backgroundConnection(connection) {
        return {request: (report, options = {}) => connection.request(report, {...options, timeoutMs: this.watchTimeoutMs, softTimeout: true})};
    }

    /** @template T @param {() => Promise<T>} read @returns {Promise<T>} */
    async #inBackground(read) {
        const running = read();
        const settled = this.#background = running.then(() => {}, () => {});
        try {return await running;}
        finally {if (this.#background === settled) this.#background = undefined;}
    }

    // How edits reach this keyboard, stored on both halves; refused while it
    // has unsaved edits (Save or Revert first).
    /** @param {number} mode */
    async setEditMode(mode) {
        if (!this.connection?.connected) this.refuse("Connect the keyboard before changing how edits reach it.");
        await this.runOperation(PHASE.EDIT_MODE, async () => {this.editMode = await this.liveCoordinator().setMode(mode);});
        return this.editMode;
    }

    // After a live edit, Save or Revert: the keyboard's health and its
    // toggles as they are now (an edit may change a stored master).
    async #refreshLive() {await this.refreshStatus();}

    // What the keyboard accepts beside its profile: its settings limits, its
    // lighting effects and the host OS it detected. A profile already read
    // from this connection supplies the first two; the host OS is always read
    // fresh. Read before anything is written.
    /** @param {Connection} connection @param {Pick<ReadSnapshot, "limits" | "options">} [known] */
    async #readDeviceFacts(connection, known) {
        const limits = known?.limits || await readSettingsLimits(connection, this.requestSequence());
        const options = known?.options || await readKeyboardOptions(connection, this.requestSequence());
        return {limits, options, hostOs: await readHostOs(connection, this.requestSequence())};
    }

    // The profile the editors follow, with their views (device-model.js).
    /** @param {ReadSnapshot} result */
    #adoptPortable(result) {
        this.portable = result;
        ({settingsView: this.settingsView, macroView: this.macroView, customKeyView: this.customKeyView} = editorViews(result, this.capabilities));
    }

    /** @param {import("../model/types.js").PortableDocument} document @param {import("./types.js").RestoreOptions} options @returns {Promise<import("./types.js").RestoredProfile>} */
    async restorePortableProfile(document, options) {
        if (!this.connection?.connected || this.busy) this.refuse("Connect the keyboard and wait for the current operation to finish.");
        /** @type {Restored | undefined} */
        let result;
        let started = false;
        await this.runOperation(PHASE.RESTORE_COMPLETE, async () => {
            this.liveApply = {state: "idle"};
            try {
                const connection = this.connectedConnection();
                const capabilities = this.profileCapabilities();
                const cachedBase = options?.expectedFingerprint && this.portable?.fingerprint === options.expectedFingerprint
                    ? this.portable
                    : undefined;
                const facts = await this.#readDeviceFacts(connection, cachedBase);
                const {limits, options: keyboardOptions} = facts;
                // What is checked is what would be written.
                const target = validateSnapshot(document, this.capabilities);
                const lighting = baseLighting(target.settings.values);
                const brightness = lighting.brightness;
                if (limits && limits.brightnessMax !== undefined && brightness > limits.brightnessMax) throw Object.assign(new Error(`This profile's brightness exceeds the keyboard's reported limit of ${limits.brightnessMax}. Lower the brightness before restoring it.`), {code: "SETTINGS_LIMIT_EXCEEDED"});
                const effect = lighting.effect;
                if (keyboardOptions && !keyboardOptions.effects.some(item => item.id === effect)) throw Object.assign(new Error("This profile uses a lighting effect unavailable on this keyboard."), {code: "SETTINGS_LIMIT_EXCEEDED"});
                // The keyboard refuses a profile whose actions sit where it cannot
                // run them; say which one before anything is sent.
                const misplaced = profilePlacementProblem(Buffer.from(target.document.profile, "base64"), {layerCount: this.capabilities?.compiledLayerCount ?? LAYERS,
                    capabilities: this.capabilities});
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
                Object.assign(result, facts);
                this.#adoptPortable(result);
                if (result.performance) {
                    const seconds = (result.performance.elapsedMs / 1000).toFixed(1);
                    this.addDiagnostic(`Saved the complete profile in ${seconds} s; published one ${result.performance.profileBytes}-byte profile.`);
                }
            } finally {
                this.portableProgress = "";
                // Once the restore has started — landed, failed, or stopped past
                // the point of no return — the health the panel shows must be the
                // keyboard's now, not the status read before the apply began. A
                // refusal before the first write changed nothing, so it reads nothing.
                if (started) {
                    await this.refreshStatus();
                    this.emitChange();
                }
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
            compatibility: this.capabilities
                ? evaluateProfileCompatibility(this.capabilities)
                : null,
            mutationCompatibility: evaluateLiveMutationCompatibility(
                this.capabilities,
                this.capabilities ? evaluateProfileCompatibility(this.capabilities) : null,
                Boolean(this.connection?.connected),
                this.status
            ),
            storedKeyboardName: storedKeyboardName(this.portable) ?? this.committed?.domains?.settings?.keyboardName,
            portableSummary: this.committed?.domains?.settings ? {names: this.committed.domains.settings.names.map((name, index, names) => layerName(names, index))} : this.portable?.summary || null,
            portableProgress: this.portableProgress || "",
            liveWaiting: this.liveWaiting ? {...this.liveWaiting} : null,
            settingsView: this.settingsView ? clone(this.settingsView) : null,
            macroView: this.macroView ? clone(this.macroView) : null,
            customKeyView: this.customKeyView ? clone(this.customKeyView) : null,
            liveApply: cloneLiveApply(this.liveApply),
            layout: this.layout ? clone(this.layout) : null,
            committed: this.committed ? clone(this.committed) : null,
            baseRgb: this.baseRgb ? clone(this.baseRgb) : null,
            combos: this.combos ? clone(this.combos) : null,
            flashPauses: this.flashPauses ? clone(this.flashPauses) : null,
            editMode: this.editMode ? {...this.editMode} : null,
            runtime: this.runtime ? clone(this.runtime) : null,
            error: this.error ? {...this.error} : null,
            diagnostics: this.diagnostics.slice(),
            lastRefreshedAt: this.lastRefreshedAt,
        };
    }

    // Runs one operation: busy while it runs, then its failure recorded,
    // published and rejected with (see the class comment).
    /** @param {import("../../contracts/model.js").PhaseId} phase @param {() => Promise<unknown>} operation @param {{preserveError?: boolean, initialize?: () => void, after?: () => Promise<unknown>}} [options] */
    async runOperation(phase, operation, {preserveError = false, initialize, after} = {}) {
        if (this.busy) this.refuseBusy(preserveError);
        this.#operationActive = true;
        this.operationId++;
        this.phase = phase;
        if (!preserveError) this.error = undefined;
        /** @type {PublishedError | undefined} */
        let failure;
        try {
            initialize?.();
            this.emitChange();
            // Not alongside a background read: it ends first.
            if (this.#background) await this.#background;
            await operation();
        } catch (error) {
            if (this.reconnectExpected && !this.connection?.connected) {
                // The keyboard went away to take its new name; the operation
                // still rejects, but the keyboard is not reported as failing.
                failure = publicError(error);
                this.addDiagnostic(`${failure.code}: ${failure.message} (the keyboard is reconnecting under its new name)`);
            } else {
                this.setError(error);
                failure = this.error;
            }
            if (!this.connection?.connected) {
                this.clearConnection();
            }
            this.phase = this.connection?.connected
                ? PHASE.CONNECTED
                : this.scanned ? (this.devices.length ? PHASE.AVAILABLE : PHASE.EMPTY) : PHASE.IDLE;
        } finally {
            // Health shown after a live edit, Save or Revert is the keyboard's
            // now, whether it worked or not.
            if (after && this.connection?.connected) await after().catch(() => {});
            this.#operationActive = false;
            this.emitChange();
        }
        if (failure) throw rejection(failure);
        return this.snapshot();
    }

    /** @param {import("../../contracts/model.js").PhaseId} phase @param {() => Promise<unknown>} read @param {() => void} initialize */
    async readOptional(phase, read, initialize) {
        const previousPhase = this.phase;
        try {
            return await this.runOperation(phase, async () => {
                try {await read();}
                finally {if (this.connection?.connected) this.phase = previousPhase;}
            }, {preserveError: true, initialize});
        } catch (error) {
            if (/** @type {{code?: string}} */ (error).code !== "SERVICE_BUSY") throw error;
            return this.snapshot();
        }
    }

    /** @param {boolean} [preserveError] @returns {never} */
    refuseBusy(preserveError = false) {
        const error = Object.assign(new Error(BUSY_REFUSAL), {code: "SERVICE_BUSY"});
        if (preserveError) this.addDiagnostic(`${error.code}: ${error.message}`);
        else this.setError(error);
        this.emitChange();
        throw error;
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
        const device = this.devices.find((entry) => entry.id === this.connectionPublicId);
        const others = this.devices.filter((entry) => entry !== device).map(({id, product}) => ({id, product}));
        this.clearConnection();
        this.phase = this.scanned ? (this.devices.length ? PHASE.AVAILABLE : PHASE.EMPTY) : PHASE.IDLE;
        if (this.reconnectExpected) {
            this.addDiagnostic(`${label} disconnected ${this.reconnectReason}.`);
        } else {
            const error = reason instanceof Error ? reason : new Error(`${label} disconnected.`);
            const {timeoutMs, request} = /** @type {{timeoutMs?: number, request?: string}} */ (error);
            if (device) this.lost = {deviceId: device.id, serialNumber: device.serialNumber || "", product: device.product || "", otherDevices: others,
                what: timeoutMs ? `did not answer within ${timeoutMs} ms` : "disconnected", unanswered: Boolean(timeoutMs)};
            this.setError(error);
            this.addDiagnostic(timeoutMs
                ? `${label} did not answer request ${request} within ${timeoutMs} ms; the connection was closed.`
                : `${label} disconnected; reconnect before sending another read request.`);
        }
        this.emitChange();
    }

    // Whether the next loss of the connection is the keyboard restarting USB
    // to take a new name (keyboard-reconnect.js), or restarting altogether
    // when asked to, rather than a failure.
    /** @param {boolean} expected @param {string} [reason] */
    expectReconnect(expected, reason = "to take its new name") {
        this.reconnectExpected = Boolean(expected);
        this.reconnectReason = reason;
    }

    // The keyboard last lost unexpectedly, once: the panel loop takes it to
    // wait for that keyboard and connect it again (keyboard-reconnect.js).
    takeLost() {
        const lost = this.lost;
        this.lost = undefined;
        return lost;
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
        this.flashPauses = undefined;
        this.disposeConnectionListener?.();
        this.disposeConnectionListener = undefined;
        this.connection = undefined;
        this.connectionPublicId = "";
        this.connectionToken = null;
        this.capabilities = undefined;
        this.status = undefined;
        this.candidateStatus = undefined;
        this.requestIds = undefined;
        this.lastRefreshedAt = "";
        this.liveApply = {state: "idle"};
        this.editMode = undefined;
        this.editModeUnknown = false;
        this.runtime = null;
        this.liveEdits = undefined;
    }

    /** @param {unknown} error */
    setError(error) {
        this.error = publicError(error);
        this.addDiagnostic(`${this.error.code}: ${this.error.message}${causeText(error)}`);
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

    // Transfer progress changes no profile data. Shells that can display it
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
        if (!this.payloadReader || this.payloadReader.connection !== this.connection) {
            this.payloadReader = new ProfilePayloadReader(this.connectedConnection(), {compiled: this.#compiledDefaults(), onCompiled: read => this.#keepCompiledDefaults(read)});
        }
        return this.payloadReader;
    }

    #compiledDefaults() {
        if (!this.knownCompiled && this.compiledDefaultsStore) {
            try {this.knownCompiled = decodeCompiledRead(this.compiledDefaultsStore.get());} catch {}
        }
        return this.knownCompiled;
    }

    /** @param {import("../protocol/types.js").PayloadRead} read */
    #keepCompiledDefaults(read) {
        const known = this.knownCompiled;
        this.knownCompiled = read;
        if (!this.compiledDefaultsStore || (known && known.metadata.digest === read.metadata.digest && known.metadata.crc32 === read.metadata.crc32 && known.bytes.equals(read.bytes))) return;
        try {void this.compiledDefaultsStore.set(encodeCompiledRead(read));} catch {}
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
        if (!this.connection?.connected || !this.requestIds || !evaluateProfileCompatibility(this.capabilities).compatible) return;
        try {
            this.status = await readProfileStatus(this.connection, {nextRequestId: () => this.nextRequestId()});
            this.candidateStatus = await this.readCandidateStatus(this.connection, {
                nextRequestId: () => this.nextRequestId(),
            });
            await this.#readLiveFacts(this.connection);
            this.lastRefreshedAt = new Date().toISOString();
        } catch {
            // Preserve the original outcome; Refresh remains available for a later explicit retry.
        }
    }
}

// A listed keyboard as the panel sees it. Its label is the product name it
// reports, told apart from another of the same name by its serial number or,
// where there is none (a browser shows none), its number (deviceLabels).
/** @param {string} id @param {import("../transport/types.js").DeviceDescriptor} descriptor @param {number} number */
function publicDeviceDescriptor(id, descriptor, number) {
    return {
        id,
        label: "",
        product: cleanText(descriptor.product) || "Charybdis 4x6",
        serialNumber: cleanText(descriptor.serialNumber),
        manufacturer: cleanText(descriptor.manufacturer),
        number,
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
    // Where an Apply failed, why, and what was saved (see apply-progress.js
    // and interruption.js).
    for (const key of /** @type {const} */ (["step", "stepLabel", "reason", "saved", "verdict"])) {
        if (typeof error?.[key] === "string" && error[key]) result[key] = cleanText(error[key]);
    }
    return result;
}

// What lies under a failure, for the diagnostics: the coordinators' and the
// transport's own words, with the device they name. A person reads the
// failure's sentence; this is for whoever looks into it.
/** @param {unknown} error */
function causeText(error) {
    const own = /** @type {{deviceId?: unknown} | null | undefined} */ (error)?.deviceId;
    const parts = typeof own === "string" ? [`device ${own}`] : [];
    let cause = /** @type {{cause?: unknown} | null | undefined} */ (error)?.cause;
    for (let depth = 0; cause && typeof cause === "object" && depth < 8; depth++) {
        const item = /** @type {{code?: unknown, name?: unknown, message?: unknown, deviceId?: unknown, cause?: unknown}} */ (cause);
        const device = typeof item.deviceId === "string" ? ` [${item.deviceId}]` : "";
        parts.push(`${cleanText(item.code) || cleanText(item.name) || "cause"}: ${cleanText(item.message)}${device}`);
        cause = item.cause;
    }
    return parts.length ? ` (${parts.join("; ")})` : "";
}

// What a failed operation rejects with: the error it recorded, as a thrown
// Error carrying the same code and fields.
/** @param {PublishedError} error */
function rejection(error) {
    return Object.assign(new Error(error.message), error);
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

// The visible keys of each layer, in layout order, from matrix-order layers.
/** @param {readonly (readonly number[])[]} keymap @param {number} layerCount */
function layoutOf(keymap, layerCount) {
    return keymap.slice(0, layerCount).map((keys, layer) => ({layer,
        positions: CHARYBDIS_4X6_LAYOUT_MATRIX.map(([row, column], layoutIndex) => ({layoutIndex, row, column, keycode: keys[matrixPosition(layoutIndex)]}))}));
}

/** @param {unknown} value */
function normalizeRequestId(value) {
    const requestId = Number(value);
    if (!Number.isInteger(requestId) || requestId < 1 || requestId > 0xff) {
        throw new RangeError("Profile Wire request id must be an integer from 1 through 255.");
    }
    return requestId;
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
        || ownBlocks && (customKeyOfCode(keycode) !== undefined || layerLockOfCode(keycode) !== undefined || pdModeKeyOfCode(keycode) !== undefined);
    return layers.flatMap((entry) => entry.keys).filter((key) => !named(key)).length;
}

/** @param {number} state */
function candidateStateName(state) {
    return CANDIDATE_STATE_NAMES[state] || `UNKNOWN_${state}`;
}

module.exports = {
    BUSY_REFUSAL,
    WATCH_MISSES,
    WATCH_TIMEOUT_MS,
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
