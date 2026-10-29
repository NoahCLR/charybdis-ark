// @ts-check
"use strict";
const {PROFILE_ACTIVE_KIND, readProfileStatus} = require("../protocol/profile-wire-v1");
const {EDIT_MODE, readEditMode, readEditProgress, readRuntime} = require("../protocol/profile-edit-v1");

/**
 * @typedef {InstanceType<typeof import("./profile-device-service.js").ProfileDeviceService>} Service
 * @typedef {import("./types.js").DeviceConnection} Connection
 */

// How edits reach the keyboard (firmware D-F32), as the device service reads
// it into its own state (profile-device-service.js): at each status refresh
// and before a complete read.

// The edit mode; anything but a firmware without it (UNHANDLED) leaves
// the mode unknown, tried again at the next status refresh or read.
/** @param {Service} service @param {Connection} connection */
async function readServiceEditMode(service, connection) {
    try {
        const editMode = await readEditMode(connection, {nextRequestId: () => service.nextRequestId()});
        service.editMode = {...editMode, notStored: service.editMode?.notStored ?? false};
        service.editModeUnknown = false;
    } catch (error) {
        service.editModeUnknown = /** @type {{code?: string}} */ (error).code !== "UNHANDLED";
        if (service.editModeUnknown) service.addDiagnostic("The keyboard's edit mode could not be read; Ark tries again.");
    }
}

// What the panel shows beside the profile in either mode: the toggles a
// key turned off (GET 0x22) and, with an edit mode, whether its last
// write is still owed. Neither stops anything when it cannot be read.
/** @param {Service} service @param {Connection} connection */
async function readLiveFacts(service, connection) {
    if (service.editModeUnknown) await readServiceEditMode(service, connection);
    if (!service.editMode) return;
    try {service.runtime = await readRuntime(connection, {nextRequestId: () => service.nextRequestId()});} catch {}
    try {
        const progress = await readEditProgress(connection, {nextRequestId: () => service.nextRequestId()});
        service.editMode = {...service.editMode, notStored: progress.modeNotStored};
    } catch {}
}

// Live preview + save reads the working copy and the saved profile
// together (live-profile-session.js): whenever the keyboard's edit mode is
// not Review and save, and in Review and save too while it still runs
// unsaved live edits, which only Save or Revert can settle.
/** @param {Service} service @param {Connection} connection */
async function readsLive(service, connection) {
    if (service.editModeUnknown) await readServiceEditMode(service, connection);
    if (!service.editMode) return false;
    if (service.editMode.mode !== EDIT_MODE.APPLY) return true;
    service.status = await readProfileStatus(connection, {nextRequestId: () => service.nextRequestId()});
    return service.status.activeKind === PROFILE_ACTIVE_KIND.WORKING;
}

module.exports = {readServiceEditMode, readLiveFacts, readsLive};
