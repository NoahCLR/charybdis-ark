// @ts-check
"use strict";

// The read Live preview + save starts from (firmware D-F32): the keyboard's
// working copy, which it runs now, and its saved profile, which a replug or
// Revert puts back, read as one coherent pair. Review compares the two; a
// live edit is made against the working copy's own bytes, so they are kept
// exactly.

const {PROFILE_ACTIVE_KIND, readProfileStatus} = require("../protocol/profile-wire-v1");
const {EDIT_PHASE, EDIT_RESULT, readActiveProfile, readEditProgress, readEditStatus, readEditMode, readRuntime} = require("../protocol/profile-edit-v1");
const {readDeviceCombos} = require("../protocol/combo-readback-v1");
const {ProfilePayloadReader} = require("./profile-payload-reader");
const {createSnapshot, validateSnapshot, materializeStored, fingerprint, summary} = require("../model/portable-profile");
const {requireReady: checkReady} = require("./firmware-support");
/** @type {(capabilities: Partial<import("./types.js").DeviceCapabilities> | null | undefined, writing?: boolean) => asserts capabilities is Partial<import("./types.js").DeviceCapabilities>} */
const requireReady = checkReady;
const {fnv1a32, PROFILE_BLOB_V1} = require("../schema/profile-blob-v1");
const {answered} = require("../schema/bytes");

/** @param {string} code @param {string} message */
const fail = (code, message) => Object.assign(new Error(message), {code});
const CHANGED = "The keyboard changed while it was being read. Read it again.";
const KEPT_CHANGING = "The keyboard kept changing while it was being read. Read it again.";
// An edit the keyboard has not finished (a held key keeps it from a safe
// boundary), or a save it is writing, makes any read a guess: wait for it
// this long, then give up and leave the draft to be read again (600 polls
// 50 ms apart: at least 30 s).
const SETTLE_POLLS = 600, SETTLE_POLL_MS = 50;
// A pair that moved under the read (the keyboard's own save landing, an
// adjustment key, another app) is read again this many times in all.
const PAIR_READS = 3;

// What the keyboard says about its own saving and its halves, from the edit
// status (pages 0, 1 and 3), in the words the panel needs. `saveMark` is the
// save transaction last seen when the working copy last changed: a failed
// save after it failed these edits (-1: any failure counts, as at a read).
/** @param {import("../protocol/types.js").EditStatus} status @param {number} [saveMark] @returns {import("./types.js").LiveKeyboardStatus} */
function liveKeyboardStatus(status, saveMark = -1) {
    const saving = status.saving || status.save.phase !== 0 || status.autoSave.inProgress;
    const failed = status.unsaved && !saving && status.save.lastTransactionId !== 0 && status.save.lastTransactionId !== saveMark
        && status.save.lastResult !== EDIT_RESULT.OK;
    return {saving, autoSaving: status.autoSave.inProgress,
        savedByKeyboard: !status.unsaved && status.autoSave.lastWasAutomatic && status.autoSave.count > 0
            && status.autoSave.revision === status.revision && status.autoSave.generation === status.savedGeneration,
        saveFailed: failed, saveError: failed ? status.save.lastError : 0, lastSaveTransaction: status.save.lastTransactionId,
        storagePaused: status.storagePaused, slaveStoragePaused: status.slaveStoragePaused,
        adjustmentPending: status.adjustmentPending, slaveRefused: status.slaveRefused, modeNotStored: status.modeNotStored,
        stopped: status.stopped, slaveStopped: status.slaveStopped, quietMs: status.autoSave.quietMs};
}

/** @param {import("./types.js").DeviceCapabilities} capabilities @param {Buffer} stored @param {Buffer} defaults */
function snapshotOf(capabilities, stored, defaults) {
    const document = createSnapshot({profile: materializeStored(stored, defaults), actionAbiDigest: capabilities.actionAbiDigest});
    // Made of what the keyboard sent: a check it fails is its answer not
    // reading, never a backup's (bytes.js answered).
    answered(() => validateSnapshot(document, capabilities));
    return {document, fingerprint: fingerprint(document), summary: summary(document), incomplete: /** @type {const} */ (false)};
}

/**
 * @param {import("../transport/types.js").RequestConnection} connection
 * @param {import("../protocol/types.js").RequestIds} ids
 * @param {import("./types.js").DeviceCapabilities} capabilities
 * @param {{payloadReader?: InstanceType<typeof ProfilePayloadReader>, onProgress?: (text: string) => void, sleep?: (ms: number) => Promise<void>}} [options]
 * @returns {Promise<import("./types.js").LiveSnapshot>}
 */
async function snapshotLive(connection, ids, capabilities, {payloadReader = new ProfilePayloadReader(connection), onProgress = () => {},
    sleep = ms => new Promise(resolve => setTimeout(resolve, ms))} = {}) {
    requireReady(capabilities);
    for (let read = 1; ; read++) {
        try {return await readPair(connection, ids, capabilities, {payloadReader, onProgress, sleep});}
        catch (error) {
            // A saved profile that moved under every payload read is a move too.
            const code = /** @type {{code?: string}} */ (error)?.code;
            if (code !== "PROFILE_CHANGED" && code !== "GENERATION_UNSTABLE") throw error;
            if (read >= PAIR_READS) throw fail("PROFILE_CHANGED", KEPT_CHANGING);
        }
    }
}

// One read of the pair; any move refuses it as PROFILE_CHANGED.
/**
 * @param {import("../transport/types.js").RequestConnection} connection
 * @param {import("../protocol/types.js").RequestIds} ids
 * @param {import("./types.js").DeviceCapabilities} capabilities
 * @param {{payloadReader: InstanceType<typeof ProfilePayloadReader>, onProgress: (text: string) => void, sleep: (ms: number) => Promise<void>}} options
 * @returns {Promise<import("./types.js").LiveSnapshot>}
 */
async function readPair(connection, ids, capabilities, {payloadReader, onProgress, sleep}) {
    const options = {nextRequestId: () => ids.next()};
    onProgress("Reading the keyboard's working copy");
    const status = await readProfileStatus(connection, options);
    if (!status.slaveKnown) throw fail("KEYBOARD_NOT_READY", "The slave half is not connected. Connect the cable between the halves and read again.");
    let before = await readEditProgress(connection, options);
    // A save running (the keyboard's own, or Save) is about to move the saved
    // profile under the read: wait for it as for an edit.
    for (let polls = 0; before.phase !== EDIT_PHASE.IDLE || before.saving; polls++, before = await readEditProgress(connection, options)) {
        const saving = before.phase === EDIT_PHASE.IDLE;
        if (polls >= SETTLE_POLLS) {
            throw saving ? fail("LIVE_SAVE_PENDING", "The keyboard is still saving. Release held keys, then read the keyboard again.")
                : fail("LIVE_EDIT_PENDING", "The keyboard is still taking an edit. Release held keys and locked layers, then read the keyboard again.");
        }
        onProgress(saving ? "Waiting for the keyboard to finish saving" : "Waiting for the keyboard to finish an edit · release held keys");
        await sleep(SETTLE_POLL_MS);
    }
    const mode = await readEditMode(connection, options);
    /** @param {string} label */
    const counted = label => /** @param {{done: number, total: number}} progress */ progress => onProgress(`${label} · ${progress.done} of ${progress.total} bytes`);
    const defaults = await payloadReader.readCompiled({...options, onProgress: counted("Reading compiled defaults")});
    if (fnv1a32(defaults.bytes) !== status.compiledDefaultDigest) throw fail("PROFILE_CHANGED", CHANGED);
    const working = await readActiveProfile(connection, {...options, maxLength: PROFILE_BLOB_V1.MAX_SIZE, onProgress: counted("Reading what the keyboard runs")});
    if (working.metadata.session !== before.session || working.metadata.revision !== before.revision || working.metadata.savedGeneration !== before.savedGeneration) throw fail("PROFILE_CHANGED", CHANGED);
    let saved = defaults.bytes;
    if (before.savedGeneration !== 0) {
        // With nothing unsaved the keyboard runs the saved record itself and
        // has just served its bytes from flash: the saved read takes them if
        // they pass its checks, and downloads them otherwise.
        const runsSaved = !working.metadata.unsaved && status.activeKind === PROFILE_ACTIVE_KIND.COMMITTED
            && status.activeGeneration === before.savedGeneration && status.activeOriginHalf === before.savedOrigin;
        const committed = await payloadReader.readCommitted({...options, sameAs: runsSaved ? working.bytes : undefined, onProgress: counted("Reading the saved profile")});
        // GET 0x04 serves the newest saved record; it must be the one the
        // working copy began from.
        if (committed.metadata.generation !== before.savedGeneration || committed.metadata.originHalf !== before.savedOrigin) throw fail("PROFILE_CHANGED", CHANGED);
        saved = committed.bytes;
    }
    onProgress("Reading combos and toggles");
    const combos = await readDeviceCombos(connection, options);
    const runtime = await readRuntime(connection, options).catch(() => null);
    const after = await readEditStatus(connection, options);
    if (after.phase !== EDIT_PHASE.IDLE || after.session !== before.session || after.revision !== before.revision || after.savedGeneration !== before.savedGeneration) throw fail("PROFILE_CHANGED", CHANGED);
    const finalStatus = await readProfileStatus(connection, options);
    const current = snapshotOf(capabilities, working.bytes, defaults.bytes);
    const stored = snapshotOf(capabilities, saved, defaults.bytes);
    return {...current, status: finalStatus, saved: stored, runtime, combosReadback: combos,
        live: {mode: mode.mode, modeConflict: mode.conflict, session: after.session, revision: after.revision,
            savedGeneration: after.savedGeneration, savedOrigin: after.savedOrigin, unsaved: after.unsaved,
            converged: !after.slaveRequired || after.slaveConverged, slaveRefused: after.slaveRefused, working: working.bytes, saved, defaults: defaults.bytes,
            keyboard: liveKeyboardStatus(after), saveMark: -1, lastTransactionId: after.lastTransactionId}};
}

module.exports = {snapshotLive, liveKeyboardStatus, snapshotOf};
