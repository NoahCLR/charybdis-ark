// @ts-check
"use strict";
const {PROFILE_ACTIVE_KIND, readProfileStatus} = require("../protocol/profile-wire-v1");
const {EDIT_MODE, readEditMode, readEditProgress, readRuntime} = require("../protocol/profile-edit-v1");

/** @typedef {import("./profile-device-service.js").Operation} Operation */

// How edits reach the keyboard (firmware D-F32), as the device service reads
// it into its connection state (profile-device-service.js): at each status
// refresh and before a complete read.

// The edit mode, or why it is not known (connection-state.js `mode`): an
// unknown one is said.
/** @param {Operation} op */
async function readServiceEditMode(op) {
    const state = op.state;
    try {
        state.mode({read: await readEditMode(op.connection, {nextRequestId: op.nextRequestId})});
    } catch (error) {
        state.mode({failed: error});
        if (state.editModeUnknown) op.say("The keyboard's edit mode could not be read; Ark tries again.");
    }
}

// What the panel shows beside the profile in either mode: the toggles a
// key turned off (GET 0x22) and, with an edit mode, whether its last
// write is still owed. Neither stops anything when it cannot be read.
/** @param {Operation} op */
async function readLiveFacts(op) {
    const state = op.state;
    if (state.editModeUnknown) await readServiceEditMode(op);
    if (!state.editMode) return;
    try {state.keep({runtime: await readRuntime(op.connection, {nextRequestId: op.nextRequestId})});} catch {}
    try {
        const progress = await readEditProgress(op.connection, {nextRequestId: op.nextRequestId});
        state.mode({notStored: progress.modeNotStored});
    } catch {}
}

// Live preview + save reads the working copy and the saved profile
// together (live-profile-session.js): whenever the keyboard's edit mode is
// not Review and save, and in Review and save too while it still runs
// unsaved live edits, which only Save or Revert can settle.
/** @param {Operation} op */
async function readsLive(op) {
    const state = op.state;
    if (state.editModeUnknown) await readServiceEditMode(op);
    if (!state.editMode) return false;
    if (state.editMode.mode !== EDIT_MODE.APPLY) return true;
    const status = await readProfileStatus(op.connection, {nextRequestId: op.nextRequestId});
    state.keep({status});
    return status.activeKind === PROFILE_ACTIVE_KIND.WORKING;
}

module.exports = {readServiceEditMode, readLiveFacts, readsLive};
