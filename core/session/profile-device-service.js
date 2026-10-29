// @ts-check
"use strict";
const {PHASE} = require("../model/vocabulary");

/**
 * @typedef {import("./types.js").DeviceConnection} Connection
 * @typedef {import("./types.js").DeviceCapabilities} Caps
 * @typedef {import("./types.js").ReadSnapshot} ReadSnapshot
 * @typedef {import("./types.js").RestoredProfile} Restored
 * @typedef {import("./operation-failure.js").PublishedError} PublishedError
 * @typedef {import("../../contracts/model.js").PhaseId} PhaseId
 * @typedef {InstanceType<typeof import("./connection-state.js").ConnectionState>} State
 */
const {canEdit, requireReady, evaluateProfileCompatibility} = require("./firmware-support");
const {restoreProfile} = require("./portable-profile-session");
const {DeviceRequestCoordinator} = require("../transport/request-coordinator");
const {ProfilePayloadReader, CompiledDefaults} = require("./profile-payload-reader");
const {BUSY_REFUSAL, causeText, publicError, rejection} = require("./operation-failure");
const {DeviceListing} = require("./device-listing");
const {BackgroundReads, WATCH_TIMEOUT_MS, readLiveStatus, readFlashPauses} = require("./background-reads");
const {checkRestorable} = require("./restore-checks");
const {ProfileRequestIdSequence, normalizeRequestId} = require("./request-ids");
const {ConnectionState, clone} = require("./connection-state");
const {readServiceEditMode, readLiveFacts} = require("./edit-mode-reads");
const {readBaseRgb, readCombos, readCommittedProfile, readCompleteProfile, readDeviceFacts, readLayout} = require("./read-operations");
const {flushWorkingCopy, postLiveEdit, readWorkingCopy, restartKeyboard, revertWorkingCopy, saveWorkingCopy, setEditMode} = require("./live-edit-operations");
const {readCandidateStatus} = require("../protocol/profile-candidate-v1");
const {PROFILE_WIRE_FEATURES, readProfileCapabilities, readProfileStatus} = require("../protocol/profile-wire-v1");
const {firmwareUpdateRequired} = require("../schema/profile-blob-v1");
const {STARTING, STARTING_CODE, STARTING_WORDS, hasStarted, isStartingTimeout, readOnceStarted, stillStarting} = require("./keyboard-starting");
const {LiveEditCoordinator, TransactionIds} = require("./live-edit-coordinator");

/** @type {(capabilities: Partial<Caps> | null | undefined, writing?: boolean) => asserts capabilities is Partial<Caps>} */
const checkReady = requireReady;
/** @param {number} ms */
const defaultSleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * What one operation works with (`#operate`): the keyboard it runs on, and
 * what the service holds of it, never the service itself. `connection` and
 * `ids` are the keyboard's as each is asked for, and fail once it is gone;
 * `waiting` is what the keyboard holds of Ark's until no key is held.
 * @typedef {{
 *   readonly connection: Connection,
 *   readonly ids: import("../protocol/types.js").RequestIds,
 *   nextRequestId(): number,
 *   state: State,
 *   capabilities(): Caps,
 *   current(): boolean,
 *   reader(): InstanceType<typeof ProfilePayloadReader>,
 *   live(): InstanceType<typeof LiveEditCoordinator>,
 *   progress: ProfileDeviceService["reportReadProgress"],
 *   say(message: string): void,
 *   publish(): void,
 *   waiting: import("./types.js").LiveWaiting | null,
 *   expectReconnect: ProfileDeviceService["expectReconnect"],
 *   sleep: ((ms: number) => Promise<void>) | undefined,
 *   now: (() => number) | undefined,
 * }} Operation
 */

// The connected keyboard: scanning, connecting, and every read and save.
//
// The class runs one operation at a time (`runOperation`), and holds what it
// knows of the connection as one record (connection-state.js), cleared when
// the connection ends. Each operation past connecting states here what it
// needs before it starts and what it resolves with (`#operate`); its work is
// grouped with others by what it does, each given only the operation: the
// profile reads (read-operations.js), the working copy's
// (live-edit-operations.js) and the reads between operations
// (background-reads.js). Two sequences chain operations of its own: the
// editor's read (`readForEditor`) and the read after a save (`readBack`).
//
// What it holds is published as `snapshot()`, through `onChange`, so the
// panel draws the keyboard as the service last saw it, failures included.
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
        // What the service holds of the connection (connection-state.js).
        this.state = new ConnectionState();
        this.connectionSequence = 0;
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
        /** @type {PhaseId} */
        this.phase = PHASE.IDLE;
        this.operationId = 0;
        /** @type {PublishedError | undefined} */
        this.error = undefined;
        /** @type {string[]} */
        this.diagnostics = [];
        // Ark's own live edit or Revert the keyboard holds until no key is
        // held (live-edit-coordinator.js), while it waits.
        /** @type {import("./types.js").LiveWaiting | null} */
        this.liveWaiting = null;
        // The compiled defaults last verified on any connection, and the
        // shell's copy between runs (profile-payload-reader.js).
        this.compiledDefaults = new CompiledDefaults(options.compiledDefaults);
    }

    // The profile the editors follow, and the capabilities the keyboard
    // reported, as the panel reads them (connection-state.js).
    get portable() {return this.state.portable;}
    set portable(profile) {this.state.portable = profile;}
    get capabilities() {return this.state.capabilities;}

    async enumerate() {
        return this.runOperation(PHASE.ENUMERATE, async () => {
            const descriptors = await this.coordinator.listDevices();
            this.devices = this.listing.list(descriptors);
            this.scanned = true;
            this.phase = this.state.connection ? PHASE.CONNECTED : this.devices.length ? PHASE.AVAILABLE : PHASE.EMPTY;
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
        if (this.state.connection) {
            await this.disconnect();
        }
        await this.runOperation(PHASE.CONNECT, async () => {
            const connection = await this.coordinator.connect(adapterDeviceId);
            const state = this.state;
            state.connection = connection;
            this.reconnectExpected = false;
            this.lost = undefined;
            state.missedLooks = 0;
            state.requestIds = new ProfileRequestIdSequence(this.requestIdStart);
            state.connectionPublicId = String(publicDeviceId);
            state.connectionToken = ++this.connectionSequence;
            this.phase = PHASE.CONNECTED;
            state.disposeConnectionListener = connection.onDisconnect((reason) => this.handleDisconnect(reason));
            this.addDiagnostic(`Connected to ${this.deviceLabel(state.connectionPublicId)}.`);
        });
        return this.refresh();
    }

    async refresh() {
        await this.#operate(PHASE.REFRESH, {requires: "Connect to a keyboard before refreshing live capabilities."}, async op => {
            const connection = op.connection, state = op.state;
            let capabilities;
            try {capabilities = await readProfileCapabilities(connection, {nextRequestId: op.nextRequestId});}
            catch (error) {
                const code = /** @type {{code?: string}} */ (error).code;
                if (code === "INCOMPATIBLE_RESPONSE" || code === "UNHANDLED") throw firmwareUpdateRequired({cause: error});
                throw error; // Timeouts and broken correlation remain transport failures.
            }
            const compatibility = evaluateProfileCompatibility(capabilities);
            const status = compatibility.compatible ? await readProfileStatus(connection, {nextRequestId: op.nextRequestId}) : undefined;
            const candidateStatus = compatibility.compatible && (capabilities.featureFlags & PROFILE_WIRE_FEATURES.SAVES) !== 0
                ? await this.readCandidateStatus(connection, {nextRequestId: op.nextRequestId})
                : undefined;
            // Every build that saves has a working copy and an edit mode; a
            // keyboard that does not answer is read and applied as before.
            state.editMode = undefined;
            state.editModeUnknown = false;
            if (candidateStatus) await readServiceEditMode(op);
            if (!op.current()) {
                throw new Error("The keyboard disconnected while live state was being refreshed.");
            }
            state.capabilities = capabilities;
            state.status = status;
            state.candidateStatus = candidateStatus;
            // A connection that replaces a lost one: an edit Ark began on the
            // old one and never finished is aborted now rather than holding
            // the keyboard until its lease ends.
            if (state.editMode) await op.live().abandonUnfinished().catch(() => false);
            await readLiveFacts(op);
            state.lastRefreshedAt = new Date().toISOString();
            this.phase = PHASE.CONNECTED;
            this.addDiagnostic(
                compatibility.compatible
                    ? "Profile Wire capabilities identify compatible current firmware."
                    : `Live compatibility check found ${compatibility.reasons.length} blocking issue${compatibility.reasons.length === 1 ? "" : "s"}.`
            );
        });
        return this.snapshot();
    }

    // Waits until the keyboard has finished starting (keyboard-starting.js):
    // polls profile status until `deadline` on the service's clock,
    // STARTING.WAIT_MS from now when omitted. A wait given a deadline is a
    // read's retry, and first lets one poll interval pass. Resolves whether it
    // started and whether the deadline passed; still starting then, with its
    // slave half known, it fails KEYBOARD_STARTING.
    /** @param {{deadline?: number}} [options] @returns {Promise<{started: boolean, deadline: number, late: boolean}>} */
    async awaitStarted({deadline} = {}) {
        const now = this.now || Date.now, sleep = this.sleep || defaultSleep;
        const until = deadline ?? now() + STARTING.WAIT_MS;
        const started = await this.#operate(PHASE.STARTING, {requires: "Connect to a keyboard before reading it."}, async op => {
            const connection = op.connection;
            let started = false;
            if (deadline !== undefined) await sleep(STARTING.POLL_MS);
            for (;;) {
                if (!op.current()) throw new Error("The keyboard disconnected while it was starting.");
                const status = await readProfileStatus(connection, {nextRequestId: op.nextRequestId});
                op.state.status = status;
                if (hasStarted(status)) {started = true; break;}
                if (now() >= until) {
                    if (stillStarting(status) && status.slaveKnown) throw Object.assign(new Error(STARTING_WORDS.timeout), {code: STARTING_CODE});
                    this.addDiagnostic("The keyboard had not finished starting when the wait ended; reading it as it is.");
                    break;
                }
                await sleep(STARTING.POLL_MS);
            }
            this.phase = PHASE.CONNECTED;
            return started;
        });
        return {started, deadline: until, late: now() >= until};
    }

    // The profile reads, each one operation (read-operations.js): the layout
    // the keyboard runs, its committed profile (`reuse` takes bytes a read
    // just checked again, while they are still what it runs), and the
    // optional combos and base RGB, which never reject.
    async readLayout() {
        // The layer count comes from the firmware's own advertised capacity:
        // a keyboard connected without one is refused for that, one not
        // connected for its connection (#operate).
        const layerCount = this.state.capabilities?.compiledLayerCount;
        if (this.state.connected && (typeof layerCount !== "number" || !Number.isInteger(layerCount) || layerCount < 1)) {
            this.refuse("Refresh capabilities before reading the layout.");
        }
        await this.#operate(PHASE.READ_LAYOUT, {requires: "Connect to a keyboard before reading its layout.",
            initialize: state => {state.layout = {state: "reading", progress: {done: 0, total: 0}, layers: [], readAt: ""};}},
        op => readLayout(op, /** @type {number} */ (layerCount)));
        return this.snapshot();
    }
    /** @param {{reuse?: boolean}} [options] */
    async readCommittedProfile(options) {
        await this.#operate(PHASE.READ_PROFILE, {requires: "Connect to a keyboard before reading its profile.",
            initialize: state => {state.committed = {state: "reading", progress: {done: 0, total: 0}};}},
        op => readCommittedProfile(op, options));
        return this.snapshot();
    }
    readCombos() {
        return this.#readOptional(PHASE.READ_COMBOS, state => {state.combos = {state: "reading"};}, readCombos);
    }
    readBaseRgb() {
        return this.#readOptional(PHASE.READ_BASE_RGB, state => {state.baseRgb = {state: "reading"};}, readBaseRgb);
    }

    // One coherent snapshot supplies the editor and the draft. Standalone
    // exports use the same reader without replacing the editor's state
    // (read-operations.js).
    /** @returns {Promise<import("./types.js").CompleteReadSnapshot>} */
    async readKeyboardProfile() {
        const read = await this.#readComplete({forEditor: true});
        if (read.incomplete) throw new Error("The keyboard did not return a complete editor profile.");
        return read;
    }

    /** @overload @param {{forRestore: true; reuseReadback?: boolean}} options @returns {Promise<import("./types.js").ReadSnapshot>} */
    /** @overload @param {{forRestore?: false; reuseReadback?: boolean}} [options] @returns {Promise<import("./types.js").CompleteReadSnapshot>} */
    /** @param {{forRestore?: boolean; reuseReadback?: boolean}} [options] @returns {Promise<import("./types.js").ReadSnapshot>} */
    async readPortableProfile(options = {}) {
        return this.#readComplete(options);
    }

    /** @param {Parameters<typeof readCompleteProfile>[1]} options */
    #readComplete(options) {
        return this.#operate(PHASE.READ_COMPLETE, {requires: "Connect the keyboard and wait for the current operation to finish.", idle: true, returns: "verified profile"},
            op => readCompleteProfile(op, options));
    }

    // The editor's read, as Read keyboard and every read Ark follows back
    // make it, each step its own operation: list the keyboards, connect
    // `deviceId` (the first listed when none is given) unless it is the one
    // connected, read its capabilities, wait until it has finished starting
    // and read its complete profile, read again while it changes under the
    // read (keyboard-starting.js). A keyboard not on current firmware is read
    // no further. A failed complete read is told to `failed`, then falls back
    // to the independent reads, so a partly readable keyboard still gets its
    // diagnostics; their failures stay in the snapshot. `progress` runs the
    // slow steps behind the shell's indicator. Resolves with what it found:
    //
    //   {kind: "none"}                no keyboard is listed
    //   {kind: "firmware", failure?}  not current firmware: its capabilities
    //                                 say so, or its stored profile does
    //   {kind: "starting"}            it never finished starting
    //   {kind: "read", portable}      its complete profile
    //   {kind: "read", failure}       the complete read failed; the
    //                                 independent reads ran
    //
    // Any other failure (listing, connecting, refreshing, the wait, the
    // layout) rejects.
    /** @param {string} [deviceId] @param {import("./types.js").EditorReadHooks} [hooks] @returns {Promise<import("./types.js").EditorRead>} */
    async readForEditor(deviceId, {progress = (_step, work) => work(), failed} = {}) {
        await this.enumerate();
        const devices = this.devices;
        /** @param {string | undefined} id */
        const listed = id => devices.some(device => device.id === id);
        if (!devices.length) return {kind: "none"};
        if (deviceId && !listed(deviceId)) throw new Error("The selected keyboard is no longer available. Choose a keyboard from the keyboard menu.");
        // A keyboard that left the list is let go: on the web page, choosing
        // another keyboard lists only that one, and reading connects it.
        const connected = this.state.connectionPublicId;
        if (!this.state.connected || !listed(connected) || (deviceId && connected !== deviceId)) await this.connect(deviceId || devices[0].id);
        await this.refresh();
        if (!canEdit(this.capabilities)) return {kind: "firmware"};
        let started;
        try {started = await this.awaitStarted();}
        catch (error) {
            if (isStartingTimeout(error)) return {kind: "starting"};
            throw error;
        }
        try {return {kind: "read", portable: await progress("complete", () => readOnceStarted(this, started, () => this.readKeyboardProfile()))};}
        catch (error) {
            if (isStartingTimeout(error)) return {kind: "starting"};
            if (/** @type {{code?: string}} */ (error).code === "FIRMWARE_UPDATE_REQUIRED") return {kind: "firmware", failure: /** @type {Error} */ (error)};
            failed?.(error);
            // A failed complete read never opens an editable draft. (The
            // base lighting is read before the combos here, after them in
            // readBack: neither depends on the other.)
            await progress("layout", () => this.readLayout());
            await progress("profile", () => this.readCommittedProfile()).catch(() => {});
            await this.readBaseRgb();
            await this.readCombos();
            return {kind: "read", failure: error};
        }
    }

    // After the keyboard stored a new profile, everything the panel shows of
    // it is read again, each step its own operation, in the order the reads
    // depend on; `onStep` hears each step as it starts. The layout comes from
    // the saved profile, downloaded and checked: the fresh read of what the
    // keyboard stored. The profile step takes those bytes again while the
    // keyboard still names exactly them (`reuse`). Rejects with what failed,
    // as the layout and profile reads do.
    /** @param {(step: import("../../contracts/messages.js").ReadStep) => void} [onStep] */
    async readBack(onStep = () => {}) {
        onStep("layout");
        await this.readLayout();
        onStep("profile");
        await this.readCommittedProfile({reuse: true});
        onStep("combos");
        await this.readCombos();
        onStep("baseRgb");
        await this.readBaseRgb();
    }

    // Always ends disconnected and resolves; a failure to close the handle
    // cleanly is recorded in `error`.
    async disconnect() {
        const connection = this.state.connection;
        if (!connection) {
            this.phase = this.scanned ? (this.devices.length ? PHASE.AVAILABLE : PHASE.EMPTY) : PHASE.IDLE;
            this.emitChange();
            return this.snapshot();
        }
        this.disconnecting = true;
        this.phase = PHASE.DISCONNECT;
        this.error = undefined;
        this.emitChange();
        this.state.disposeConnectionListener?.();
        this.state.disposeConnectionListener = undefined;
        try {
            await connection.disconnect();
        } catch (error) {
            this.setError(error);
        } finally {
            this.disconnecting = false;
            this.state.clear();
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
        if (!this.state.liveEdits || this.state.liveEdits.connection !== connection) {
            this.state.liveEdits = new LiveEditCoordinator(connection, {requestIds: this.requestSequence(), transactionIds: new TransactionIds(), sleep: this.sleep, now: this.now});
        }
        return this.state.liveEdits;
    }

    // The working copy's operations (live-edit-operations.js): a live edit,
    // Save, Revert, leaving Live edit, reading what the keyboard runs, a
    // restart and the edit mode. After an edit, Save or Revert the service
    // reads the keyboard's status again, whether it worked or not.
    /** @param {Parameters<typeof postLiveEdit>[1]} edit @param {Parameters<typeof postLiveEdit>[2]} [options] */
    postLiveEdit(edit, options) {
        return this.#operate(PHASE.LIVE_EDIT, {requires: "Connect the keyboard before editing it.", returns: "edit result", refreshAfter: true},
            op => postLiveEdit(op, edit, options));
    }
    /** @param {{session: number, revision: number}} identity */
    saveWorkingCopy(identity) {
        return this.#operate(PHASE.LIVE_SAVE, {requires: "Connect the keyboard before saving.", returns: "save result", refreshAfter: true},
            op => saveWorkingCopy(op, identity));
    }
    /** @param {{session: number, revision: number}} identity */
    revertWorkingCopy(identity) {
        return this.#operate(PHASE.LIVE_REVERT, {requires: "Connect the keyboard before reverting it.", returns: "revert result", refreshAfter: true},
            op => revertWorkingCopy(op, identity));
    }
    /** @param {(document: import("../model/types.js").PortableDocument) => Promise<string | undefined>} saveRecovery */
    flushWorkingCopy(saveRecovery) {
        return this.#operate(PHASE.LIVE_SAVE, {requires: "Connect the keyboard before changing how edits reach it.", returns: "save result", refreshAfter: true},
            op => flushWorkingCopy(op, saveRecovery));
    }
    readWorkingCopy() {
        return this.#operate(PHASE.READ_COMPLETE, {requires: "Connect the keyboard before reading it.", returns: "profile"}, readWorkingCopy);
    }
    restartKeyboard() {
        return this.#operate(PHASE.RESTART, {requires: "Connect the keyboard before restarting it.", returns: "restart result"}, restartKeyboard);
    }
    /** @param {number} mode */
    async setEditMode(mode) {
        await this.#operate(PHASE.EDIT_MODE, {requires: "Connect the keyboard before changing how edits reach it."}, op => setEditMode(op, mode));
        return this.state.editMode;
    }

    // Cancel edit, taken while a live edit runs: the keyboard holds it until
    // no key is held, and aborts it at Ark's next look. False when nothing
    // of Ark's is held that can be cancelled.
    cancelLiveEdit() {
        return Boolean(this.liveWaiting && this.state.liveEdits?.cancelWaiting());
    }

    // The background reads (background-reads.js): the live watch's look, and
    // each half's flash pauses for the Keyboard screen's Diagnostics. Neither
    // starts while an operation or another background read holds the
    // keyboard, and neither rejects.
    readLiveStatus() {
        const watch = {timeoutMs: this.watchTimeoutMs, label: this.deviceLabel(this.state.connectionPublicId)};
        return this.#readBetween(undefined, op => readLiveStatus(op, watch), Boolean(this.state.editMode));
    }
    readFlashPauses() {
        return this.#readBetween(false, op => readFlashPauses(op, this.watchTimeoutMs));
    }

    /** @param {import("../model/types.js").PortableDocument} document @param {import("./types.js").RestoreOptions} options @returns {Promise<import("./types.js").RestoredProfile>} */
    async restorePortableProfile(document, options) {
        let started = false;
        return this.#operate(PHASE.RESTORE_COMPLETE, {requires: "Connect the keyboard and wait for the current operation to finish.", idle: true, returns: "verified profile"}, async op => {
            const state = op.state;
            state.liveApply = {state: "idle"};
            try {
                const connection = op.connection;
                const capabilities = op.capabilities();
                const cachedBase = options?.expectedFingerprint && state.portable?.fingerprint === options.expectedFingerprint
                    ? state.portable
                    : undefined;
                const facts = await readDeviceFacts(op, connection, cachedBase);
                checkRestorable(document, facts, state.capabilities);
                started = true;
                const result = await restoreProfile(connection, op.ids, capabilities, document, {...options,
                    baseSnapshot: cachedBase,
                    sleep: this.sleep,
                    now: this.now,
                    onProgress: message => {state.portableProgress = message;},
                    // The step view the commit bar draws; it outlives the apply
                    // when it failed, so the person can see where and why.
                    onApplyProgress: view => this.reportApplyProgress(view),
                });
                Object.assign(result, facts);
                state.adoptPortable(result);
                if (result.performance) {
                    const seconds = (result.performance.elapsedMs / 1000).toFixed(1);
                    this.addDiagnostic(`Saved the complete profile in ${seconds} s; published one ${result.performance.profileBytes}-byte profile.`);
                }
                return result;
            } finally {
                state.portableProgress = "";
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
    }

    async close() {
        this.state.disposeConnectionListener?.();
        this.state.disposeConnectionListener = undefined;
        this.disconnecting = true;
        try {
            await this.coordinator.close();
        } finally {
            this.disconnecting = false;
            this.state.clear();
        }
    }

    // What the service holds, as the panel draws it: every part a copy, so
    // the panel can keep it while the service goes on.
    /** @returns {import("./types.js").ServiceSnapshot} */
    snapshot() {
        return {
            phase: this.phase,
            operationId: this.operationId,
            scanned: this.scanned,
            busy: this.busy,
            devices: this.devices.map((device) => ({...device})),
            ...this.state.published(),
            liveWaiting: this.liveWaiting ? {...this.liveWaiting} : null,
            error: this.error ? {...this.error} : null,
            diagnostics: this.diagnostics.slice(),
        };
    }

    // Runs one operation on the connected keyboard: refused with `requires`
    // before it starts when there is none (and, `idle`, while another runs),
    // then run as one operation (`runOperation`) given only what it works
    // with. Resolves with what `work` returns; one that returns nothing
    // fails, saying it returned no `returns`. `initialize` sets the state
    // the operation publishes as it starts; `refreshAfter` reads the
    // keyboard's status after it, whether it worked or not.
    /**
     * @template T
     * @param {PhaseId} phase
     * @param {{requires: string, idle?: boolean, returns?: string, initialize?: (state: State) => void, refreshAfter?: boolean}} contract
     * @param {(op: Operation) => Promise<T>} work
     * @returns {Promise<T>}
     */
    async #operate(phase, {requires, idle = false, returns, initialize, refreshAfter = false}, work) {
        if (!this.state.connected || (idle && this.busy)) this.refuse(requires);
        /** @type {{value: T} | undefined} */
        let done;
        await this.runOperation(phase, async () => {done = {value: await work(this.#operation())};}, {
            initialize: initialize && (() => initialize(this.state)),
            after: refreshAfter ? () => this.refreshStatus() : undefined,
        });
        if (returns && !done?.value) throw new Error(`The keyboard operation returned no ${returns}.`);
        return /** @type {{value: T}} */ (done).value;
    }

    // What an operation is given: the keyboard as it stands when the
    // operation starts. It is current while the service still holds that
    // connection and it is still connected.
    /** @returns {Operation} */
    #operation() {
        const service = this, state = this.state, started = state.connection;
        return {
            get connection() {return service.connectedConnection();},
            get ids() {return service.requestSequence();},
            nextRequestId: () => this.nextRequestId(),
            state,
            capabilities: () => this.profileCapabilities(),
            current: () => Boolean(started && state.connection === started && started.connected),
            reader: () => this.profilePayloadReader(),
            live: () => this.liveCoordinator(),
            progress: (...args) => this.reportReadProgress(...args),
            say: message => this.addDiagnostic(message),
            publish: () => this.emitChange(),
            get waiting() {return service.liveWaiting;},
            set waiting(waiting) {service.liveWaiting = waiting;},
            expectReconnect: (expected, reason) => this.expectReconnect(expected, reason),
            sleep: this.sleep,
            now: this.now,
        };
    }

    // An optional read (readCombos, readBaseRgb): never rejects, and leaves
    // an earlier error alone. Refused while another operation runs, it
    // resolves with the snapshot as it is; the phase it ends in is the one
    // before it while the keyboard is connected.
    /** @param {PhaseId} phase @param {(state: State) => void} initialize @param {(op: Operation) => Promise<void>} read */
    async #readOptional(phase, initialize, read) {
        const previousPhase = this.phase;
        try {
            return await this.runOperation(phase, async () => {
                try {await read(this.#operation());}
                finally {if (this.state.connected) this.phase = previousPhase;}
            }, {preserveError: true, initialize: () => initialize(this.state)});
        } catch (error) {
            if (/** @type {{code?: string}} */ (error).code !== "SERVICE_BUSY") throw error;
            return this.snapshot();
        }
    }

    // A read between operations (background-reads.js), one at a time:
    // skipped, resolving with `skipped`, while an operation or another
    // background read holds the keyboard, or when it is not `wanted`.
    /** @template T, S @param {S} skipped @param {(op: Operation) => Promise<T>} read @param {boolean} [wanted] @returns {Promise<T | S>} */
    async #readBetween(skipped, read, wanted = true) {
        if (!wanted || this.busy || this.#background.out || !this.state.connected || !this.state.requestIds) return skipped;
        return this.#background.run(() => read(this.#operation()));
    }

    // Runs one operation: busy while it runs, then its failure recorded,
    // published and rejected with (see the class comment).
    /** @param {PhaseId} phase @param {() => Promise<unknown>} operation @param {{preserveError?: boolean, initialize?: () => void, after?: () => Promise<unknown>}} [options] */
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
            if (this.reconnectExpected && !this.state.connected) {
                // The keyboard went away to take its new name; the operation
                // still rejects, but the keyboard is not reported as failing.
                failure = publicError(error);
                this.addDiagnostic(`${failure.code}: ${failure.message} (the keyboard is reconnecting under its new name)`);
            } else {
                this.setError(error);
                failure = this.error;
            }
            if (!this.state.connected) {
                this.state.clear();
            }
            this.phase = this.state.connected
                ? PHASE.CONNECTED
                : this.scanned ? (this.devices.length ? PHASE.AVAILABLE : PHASE.EMPTY) : PHASE.IDLE;
        } finally {
            // Health shown after a live edit, Save or Revert is the keyboard's
            // now, whether it worked or not.
            if (after && this.state.connected) await after().catch(() => {});
            this.#operationActive = false;
            this.emitChange();
        }
        if (failure) throw rejection(failure);
        return this.snapshot();
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
        const publicId = this.state.connectionPublicId;
        const label = this.deviceLabel(publicId);
        const device = this.devices.find((entry) => entry.id === publicId);
        const others = this.devices.filter((entry) => entry !== device).map(({id, product}) => ({id, product}));
        this.state.clear();
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
        this.state.liveApply = view;
        if (!this.onApplyProgress) { this.emitChange(); return; }
        try { this.onApplyProgress(clone(view)); } catch {
            // A closed or reloading panel must not interrupt the save.
        }
    }

    // Keep the read's latest counter for snapshots without copying all the
    // profile data or asking the panel to rebuild its editor for every reply.
    /** @param {[source: 'layout' | 'profile', progress: import("../../contracts/model.js").CountedProgress] | [source: 'portable', progress: string]} args */
    reportReadProgress(...args) {
        const [source, progress] = args, state = this.state;
        if (source === "layout") state.layout = {...state.layout, progress};
        else if (source === "profile") state.committed = {...state.committed, progress};
        else if (source === "portable") state.portableProgress = progress;
        if (!this.onReadProgress) { this.emitChange(); return; }
        try {
            this.onReadProgress({...(source === "portable" ? {source, progress} : {source, progress: {...progress}}),
                operationId: this.operationId, phase: this.phase,
                selectedDeviceId: state.connectionPublicId, connectionToken: state.connectionToken});
        } catch {
            // A closed or reloading panel must not interrupt the read.
        }
    }

    connectedConnection() {
        if (!this.state.connection?.connected) throw new Error("The keyboard disconnected before its operation could start.");
        return this.state.connection;
    }
    requestSequence() {
        if (!this.state.requestIds) throw new Error("The keyboard disconnected before its operation could start.");
        return this.state.requestIds;
    }
    nextRequestId() {return this.requestSequence().next();}
    profileCapabilities() {
        const capabilities = this.state.capabilities;
        checkReady(capabilities);
        return capabilities;
    }

    profilePayloadReader() {
        const state = this.state;
        if (!state.payloadReader || state.payloadReader.connection !== state.connection) {
            state.payloadReader = new ProfilePayloadReader(this.connectedConnection(), {compiled: this.compiledDefaults.current(), onCompiled: read => this.compiledDefaults.keep(read)});
        }
        return state.payloadReader;
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

    // The keyboard's health and its toggles as they are now; a failure keeps
    // what was read before.
    async refreshStatus() {
        const state = this.state;
        if (!state.connection?.connected || !state.requestIds || !evaluateProfileCompatibility(state.capabilities).compatible) return;
        const op = this.#operation(), connection = state.connection;
        try {
            state.status = await readProfileStatus(connection, {nextRequestId: op.nextRequestId});
            state.candidateStatus = await this.readCandidateStatus(connection, {
                nextRequestId: op.nextRequestId,
            });
            await readLiveFacts(op);
            state.lastRefreshedAt = new Date().toISOString();
        } catch {
            // Preserve the original outcome; Refresh remains available for a later explicit retry.
        }
    }
}

module.exports = {ProfileDeviceService};
