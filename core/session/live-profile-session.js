// @ts-check
"use strict";

// The read Live + review starts from (firmware D-F32): the keyboard's working
// copy, which it runs now, and its saved profile, which a replug or Revert
// puts back, read as one coherent pair. Review compares the two; a live edit
// is made against the working copy's own bytes, so they are kept exactly.

const {PROFILE_ACTIVE_KIND, readProfileStatus} = require("../protocol/profile-wire-v1");
const {EDIT_PHASE, EDIT_RESULT, readActiveProfile, readEditProgress, readEditStatus, readEditMode, readRuntime} = require("../protocol/profile-edit-v1");
const {readDeviceCombos} = require("../protocol/combo-readback-v1");
const {ProfilePayloadReader} = require("./profile-payload-reader");
const {createSnapshot, validateSnapshot, materializeStored, fingerprint, summary} = require("../model/portable-profile");
const {requireReady: checkReady} = require("./firmware-support");
/** @type {(capabilities: Partial<import("./types.js").DeviceCapabilities> | null | undefined, writing?: boolean) => asserts capabilities is Partial<import("./types.js").DeviceCapabilities>} */
const requireReady = checkReady;
const {fnv1a32, PROFILE_BLOB_V1} = require("../schema/profile-blob-v1");

/** @param {string} code @param {string} message */
const fail = (code, message) => Object.assign(new Error(message), {code});
const CHANGED = "The keyboard changed while it was being read. Read it again.";
// An edit the keyboard has not finished (a held key keeps it from a safe
// boundary) makes any read a guess: wait for it this long, then give up and
// leave the draft to be read again (600 polls 50 ms apart: at least 30 s).
const SETTLE_POLLS = 600, SETTLE_POLL_MS = 50;

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
        storagePaused: status.storagePaused, peerStoragePaused: status.peerStoragePaused,
        adjustmentPending: status.adjustmentPending, peerRefused: status.peerRefused, modeNotStored: status.modeNotStored,
        stopped: status.stopped, peerStopped: status.peerStopped, quietMs: status.autoSave.quietMs};
}

/** @param {import("./types.js").DeviceCapabilities} capabilities @param {Buffer} stored @param {Buffer} defaults */
function snapshotOf(capabilities, stored, defaults) {
    const document = createSnapshot({profile: materializeStored(stored, defaults), actionAbiDigest: capabilities.actionAbiDigest});
    validateSnapshot(document, capabilities);
    return {document, fingerprint: fingerprint(document), summary: summary(document), incomplete: /** @type {const} */ (false)};
}

/**
 * @param {import("../transport/types.js").RequestConnection} connection
 * @param {import("../protocol/types.js").RequestIds} ids
 * @param {import("./types.js").DeviceCapabilities} capabilities
 * @param {{payloadReader?: InstanceType<typeof ProfilePayloadReader>, onProgress?: (text: string) => void, sleep?: (ms: number) => Promise<void>}} [options]
 * @returns {Promise<import("./types.js").LiveCapture>}
 */
async function captureLive(connection, ids, capabilities, {payloadReader = new ProfilePayloadReader(connection), onProgress = () => {},
    sleep = ms => new Promise(resolve => setTimeout(resolve, ms))} = {}) {
    requireReady(capabilities);
    const options = {nextRequestId: () => ids.next()};
    onProgress("Reading the keyboard's working copy");
    const status = await readProfileStatus(connection, options);
    if (!status.peerKnown) throw fail("KEYBOARD_NOT_READY", "The slave half is not connected. Connect the cable between the halves and read again.");
    let before = await readEditProgress(connection, options);
    for (let polls = 0; before.phase !== EDIT_PHASE.IDLE; polls++, before = await readEditProgress(connection, options)) {
        if (polls >= SETTLE_POLLS) throw fail("LIVE_EDIT_PENDING", "The keyboard is still taking an edit. Release held keys and locked layers, then read the keyboard again.");
        onProgress("Waiting for the keyboard to finish an edit · release held keys");
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
            converged: !after.peerRequired || after.peerConverged, apart: after.peerRefused, working: working.bytes, saved, defaults: defaults.bytes,
            keyboard: liveKeyboardStatus(after), saveMark: -1}};
}

module.exports = {captureLive, liveKeyboardStatus, snapshotOf};
