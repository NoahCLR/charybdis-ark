// @ts-check
"use strict";
const {PROFILE_BLOB_V1} = require("../schema/profile-blob-v1");
const {readActiveProfile} = require("../protocol/profile-edit-v1");
const {readLiveProfile} = require("./read-operations");

/**
 * @typedef {import("./profile-device-service.js").Operation} Operation
 * @typedef {InstanceType<typeof import("./live-edit-coordinator.js").LiveEditCoordinator>} Coordinator
 */

// The work of the device service's operations on the keyboard's working
// copy (firmware D-F32), each one operation (profile-device-service.js)
// through the connection's live edit coordinator (live-edit-coordinator.js):
// an edit, Save, Revert, leaving Live edit, reading what the keyboard runs,
// the edit mode and a restart.

// A live edit from the working copy's exact bytes to `to` (firmware
// D-F32). Resolves with what the keyboard runs now, or `cancelled` when
// Cancel edit ended it while the keyboard held it; a refusal rejects
// and is recorded like any failed operation. `onCommitted` learns the
// transaction the keyboard took whole.
/** @param {Operation} op @param {{from: Buffer, to: Buffer, defaults: Buffer, identity: {session: number, revision: number}, replaceWhenLarge?: boolean}} edit
 * @param {{onCommitted?: (transactionId: number) => void}} [options] */
async function postLiveEdit(op, edit, {onCommitted} = {}) {
    const capabilities = op.capabilities();
    try {
        return await op.live().post({...edit, capacity: capabilities.profileSlotPayload || PROFILE_BLOB_V1.MAX_SIZE},
            {onCommitted, onWaiting: waiting => showWaiting(op, waiting)});
    } finally {op.waiting = null;}
}

// What the keyboard holds until no key is held, published as it changes.
/** @param {Operation} op @param {import("./types.js").LiveWaiting | null} waiting */
function showWaiting(op, waiting) {
    if (JSON.stringify(waiting) === JSON.stringify(op.waiting)) return;
    op.waiting = waiting;
    op.publish();
}

// Save: the keyboard writes its working copy as a new generation on both
// halves (firmware D-F32). Resolves with the edit status after it.
/** @param {Operation} op @param {{session: number, revision: number}} identity */
async function saveWorkingCopy(op, identity) {
    // Its words go when it ends, failed or not.
    try {
        return await op.live().save(identity, status => {
            op.state.portableProgress = status.storagePaused || status.slaveStoragePaused ? "Waiting for a quiet keyboard to save"
                : status.waitingSafe ? "Release held keys to finish saving" : "Saving on both halves";
            op.publish();
        });
    } finally {op.state.portableProgress = "";}
}

// Revert: the keyboard runs its saved profile again; nothing is written.
/** @param {Operation} op @param {{session: number, revision: number}} identity */
async function revertWorkingCopy(op, identity) {
    try {return await op.live().revert(identity, {onWaiting: waiting => showWaiting(op, waiting)});}
    finally {op.waiting = null;}
}

// Leaving Live edit: the keyboard saves at once what it has not saved yet
// (live-edit-coordinator.js), so its mode can change. Resolves with the
// edit status after it.
/** @param {Operation} op @param {(document: import("../model/types.js").PortableDocument) => Promise<string | undefined>} saveRecovery */
async function flushWorkingCopy(op, saveRecovery) {
    try {return await op.live().flush(status => {
        op.state.portableProgress = status.storagePaused || status.slaveStoragePaused ? "Waiting for a quiet keyboard to save"
            : status.autoSave.inProgress ? "The keyboard is saving its edits" : "Saving what the keyboard has not saved yet";
        op.publish();
    }, async status => {
        // A quiet-period save may have moved the saved base since the
        // panel's snapshot. Recover what is actually saved immediately
        // before each explicit Save, inside this operation's ownership.
        const snapshot = await readLiveProfile(op, false);
        if (!snapshot.live.unsaved) return;
        if (snapshot.live.session !== status.session || snapshot.live.revision !== status.revision
            || snapshot.live.savedGeneration !== status.savedGeneration || snapshot.live.savedOrigin !== status.savedOrigin) {
            throw Object.assign(new Error("The keyboard changed before its recovery copy was saved."), {code: "LIVE_EDIT_STALE"});
        }
        const recovery = await saveRecovery(snapshot.saved.document);
        if (!recovery) throw Object.assign(new Error("A recovery copy could not be saved. Nothing was saved on the keyboard."), {code: "RECOVERY_REQUIRED"});
    });}
    // Its words go when it ends, failed or not.
    finally {op.state.portableProgress = "";}
}

// What the keyboard runs now (its working copy, or its saved profile),
// read as one revision (GET 0x21): what a restart would lose.
/** @param {Operation} op */
async function readWorkingCopy(op) {
    return readActiveProfile(op.connection, {...op.live().options, maxLength: op.capabilities().profileSlotPayload || PROFILE_BLOB_V1.MAX_SIZE});
}

// Restart both halves (firmware D-F34): the keyboard answers, then drops
// off USB and comes back as from power, so that loss is expected. Resolves
// with whether the slave half acknowledged, and so restarts too.
/** @param {Operation} op */
async function restartKeyboard(op) {
    op.expectReconnect(true, "to restart");
    try {return await op.live().restart();}
    catch (error) {op.expectReconnect(false); throw error;}
}

// How edits reach this keyboard, stored on both halves; refused while it
// has unsaved edits (Save or Revert first).
/** @param {Operation} op @param {number} mode */
async function setEditMode(op, mode) {op.state.editMode = await op.live().setMode(mode);}

module.exports = {postLiveEdit, saveWorkingCopy, revertWorkingCopy, flushWorkingCopy, readWorkingCopy, restartKeyboard, setEditMode};
