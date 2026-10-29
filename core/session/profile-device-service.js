// @ts-check
"use strict";
const {PHASE} = require("../model/vocabulary");

/**
 * @typedef {import("./types.js").DeviceConnection} Connection
 * @typedef {import("./types.js").DeviceCapabilities} Caps
 * @typedef {import("./types.js").ProfileStatus} Status
 * @typedef {import("./types.js").ReadSnapshot} ReadSnapshot
 * @typedef {import("./types.js").RestoredProfile} Restored
 * @typedef {import("./operation-failure.js").PublishedError} PublishedError
 */
const {requireReady, evaluateProfileCompatibility} = require("./firmware-support");
const {editorViews} = require("../model/profile-model");
const {restoreProfile} = require("./portable-profile-session");
const {DeviceRequestCoordinator} = require("../transport/request-coordinator");
const {ProfilePayloadReader, CompiledDefaults} = require("./profile-payload-reader");
const {BUSY_REFUSAL, causeText, publicError, rejection} = require("./operation-failure");
const {DeviceListing} = require("./device-listing");
const {BackgroundReads, WATCH_TIMEOUT_MS, readLiveStatus, readFlashPauses} = require("./background-reads");
const {checkRestorable} = require("./restore-checks");
const {ProfileRequestIdSequence, normalizeRequestId} = require("./request-ids");
const {serviceSnapshot, clone} = require("./service-snapshot");
const {readServiceEditMode, readLiveFacts} = require("./edit-mode-reads");
const {adoptPortable, readBaseRgb, readCombos, readCommittedProfile, readCompleteProfile, readDeviceFacts, readLayout} = require("./read-operations");
const {flushWorkingCopy, postLiveEdit, readWorkingCopy, restartKeyboard, revertWorkingCopy, saveWorkingCopy, setEditMode} = require("./live-edit-operations");
const {readCandidateStatus} = require("../protocol/profile-candidate-v1");
const {PROFILE_WIRE_FEATURES, readProfileCapabilities, readProfileStatus} = require("../protocol/profile-wire-v1");
const {firmwareUpdateRequired} = require("../schema/profile-blob-v1");
const {STARTING, STARTING_CODE, STARTING_WORDS, hasStarted, stillStarting} = require("./keyboard-starting");
const {LiveEditCoordinator, TransactionIds} = require("./live-edit-coordinator");

/** @type {(capabilities: Partial<Caps> | null | undefined, writing?: boolean) => asserts capabilities is Partial<Caps>} */
const checkReady = requireReady;
/** @param {number} ms */
const defaultSleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// The connected keyboard: scanning, connecting, and every read and save.
//
// The class holds the connection's state and runs one operation at a time
// (`runOperation`). The operations past connecting are grouped by what they
// do, each taking the service: the profile reads (read-operations.js), the
// working copy's (live-edit-operations.js) and the reads between operations
// (background-reads.js).
//
// What it holds is published as `snapshot()` (service-snapshot.js), through
// `onChange`, so the panel draws the keyboard as the service last saw it,
// failures included.
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
// out: readLiveStatus and readFlashPauses, which never reject either.
// disconnect() always leaves the keyboard disconnected and resolves,
// recording a failure to close it cleanly.
class ProfileDeviceService {
    #operationActive = false;
    // The live watch's look and the flash pauses (background-reads.js).
    #background = new BackgroundReads();

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
        // Each keyboard's public id and number (device-listing.js).
        this.listing = new DeviceListing();
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
        // The compiled defaults last verified on any connection, and the
        // shell's copy between runs (profile-payload-reader.js).
        this.compiledDefaults = new CompiledDefaults(options.compiledDefaults);
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
            this.devices = this.listing.list(descriptors);
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
        const adapterDeviceId = this.listing.adapterId(String(publicDeviceId || ""));
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
                if (code === "INCOMPATIBLE_RESPONSE" || code === "UNHANDLED") throw firmwareUpdateRequired({cause: error});
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
            if (candidateStatus) await readServiceEditMode(this, connection);
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
            await readLiveFacts(this, connection);
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

    // The profile reads, each one operation (read-operations.js): the layout
    // the keyboard runs, its committed profile (`reuse` takes bytes a read
    // just checked again, while they are still what it runs), and the
    // optional combos and base RGB, which never reject.
    readLayout() {return readLayout(this);}
    /** @param {{reuse?: boolean}} [options] */
    readCommittedProfile(options) {return readCommittedProfile(this, options);}
    readCombos() {return readCombos(this);}
    readBaseRgb() {return readBaseRgb(this);}

    // One coherent snapshot supplies the editor and the draft. Standalone
    // exports use the same reader without replacing the editor's state
    // (read-operations.js).
    /** @returns {Promise<import("./types.js").CompleteReadSnapshot>} */
    async readKeyboardProfile() {
        const read = await readCompleteProfile(this, {forEditor: true});
        if (read.incomplete) throw new Error("The keyboard did not return a complete editor profile.");
        return read;
    }

    /** @overload @param {{forRestore: true; reuseReadback?: boolean}} options @returns {Promise<import("./types.js").ReadSnapshot>} */
    /** @overload @param {{forRestore?: false; reuseReadback?: boolean}} [options] @returns {Promise<import("./types.js").CompleteReadSnapshot>} */
    /** @param {{forRestore?: boolean; reuseReadback?: boolean}} [options] @returns {Promise<import("./types.js").ReadSnapshot>} */
    async readPortableProfile(options = {}) {
        return readCompleteProfile(this, options);
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

    // One coordinator per connection, so its transaction ids never repeat
    // within it.
    liveCoordinator() {
        const connection = this.connectedConnection();
        if (!this.liveEdits || this.liveEdits.connection !== connection) {
            this.liveEdits = new LiveEditCoordinator(connection, {requestIds: this.requestSequence(), transactionIds: new TransactionIds(), sleep: this.sleep, now: this.now});
        }
        return this.liveEdits;
    }

    // The working copy's operations (live-edit-operations.js): a live edit,
    // Save, Revert, leaving Live edit, reading what the keyboard runs, a
    // restart and the edit mode.
    /** @param {Parameters<typeof postLiveEdit>[1]} edit @param {Parameters<typeof postLiveEdit>[2]} [options] */
    postLiveEdit(edit, options) {return postLiveEdit(this, edit, options);}
    /** @param {{session: number, revision: number}} identity */
    saveWorkingCopy(identity) {return saveWorkingCopy(this, identity);}
    /** @param {{session: number, revision: number}} identity */
    revertWorkingCopy(identity) {return revertWorkingCopy(this, identity);}
    /** @param {(document: import("../model/types.js").PortableDocument) => Promise<string | undefined>} saveRecovery */
    flushWorkingCopy(saveRecovery) {return flushWorkingCopy(this, saveRecovery);}
    readWorkingCopy() {return readWorkingCopy(this);}
    restartKeyboard() {return restartKeyboard(this);}
    /** @param {number} mode */
    setEditMode(mode) {return setEditMode(this, mode);}

    // Cancel edit, taken while a live edit runs: the keyboard holds it until
    // no key is held, and aborts it at Ark's next look. False when nothing
    // of Ark's is held that can be cancelled.
    cancelLiveEdit() {
        return Boolean(this.liveWaiting && this.liveEdits?.cancelWaiting());
    }

    // The background reads (background-reads.js): the live watch's look, and
    // each half's flash pauses for the Keyboard screen's Diagnostics. Neither
    // starts while an operation or another background read holds the
    // keyboard, and neither rejects.
    readLiveStatus() {return readLiveStatus(this, this.#background);}
    readFlashPauses() {return readFlashPauses(this, this.#background);}

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
                const facts = await readDeviceFacts(this, connection, cachedBase);
                checkRestorable(document, facts, this.capabilities);
                started = true;
                result = await restoreProfile(connection, this.requestSequence(), capabilities, document, {...options,
                    baseSnapshot: cachedBase,
                    sleep: this.sleep,
                    now: this.now,
                    onProgress: message => {this.portableProgress = message;},
                    // The step view the commit bar draws; it outlives the apply
                    // when it failed, so the person can see where and why.
                    onApplyProgress: view => this.reportApplyProgress(view),
                });
                Object.assign(result, facts);
                adoptPortable(this, result);
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

    // What the service holds, as the panel draws it (service-snapshot.js).
    /** @returns {import("./types.js").ServiceSnapshot} */
    snapshot() {return serviceSnapshot(this);}

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
            const background = this.#background.out;
            if (background) await background;
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
            this.payloadReader = new ProfilePayloadReader(this.connectedConnection(), {compiled: this.compiledDefaults.current(), onCompiled: read => this.compiledDefaults.keep(read)});
        }
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
        if (!this.connection?.connected || !this.requestIds || !evaluateProfileCompatibility(this.capabilities).compatible) return;
        try {
            this.status = await readProfileStatus(this.connection, {nextRequestId: () => this.nextRequestId()});
            this.candidateStatus = await this.readCandidateStatus(this.connection, {
                nextRequestId: () => this.nextRequestId(),
            });
            await readLiveFacts(this, this.connection);
            this.lastRefreshedAt = new Date().toISOString();
        } catch {
            // Preserve the original outcome; Refresh remains available for a later explicit retry.
        }
    }
}

module.exports = {ProfileDeviceService};
