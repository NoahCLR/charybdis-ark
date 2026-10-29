// @ts-check
"use strict";
const {PHASE} = require("../model/vocabulary");
const {PROFILE_BLOB_V1} = require("../schema/profile-blob-v1");
const {readActiveProfile} = require("../protocol/profile-edit-v1");
const {readLiveProfile} = require("./read-operations");

/**
 * @typedef {InstanceType<typeof import("./profile-device-service.js").ProfileDeviceService>} Service
 * @typedef {InstanceType<typeof import("./live-edit-coordinator.js").LiveEditCoordinator>} Coordinator
 */

// The device service's operations on the keyboard's working copy (firmware
// D-F32), each one operation through the connection's live edit coordinator
// (profile-device-service.js liveCoordinator, live-edit-coordinator.js): an
// edit, Save, Revert, leaving Live edit, reading what the keyboard runs, the
// edit mode and a restart. After an edit, Save or Revert the service reads
// the keyboard's status again, whether it worked or not.

// A live edit from the working copy's exact bytes to `to` (firmware
// D-F32). Resolves with what the keyboard runs now, or `cancelled` when
// Cancel edit ended it while the keyboard held it; a refusal rejects
// and is recorded like any failed operation. `onCommitted` learns the
// transaction the keyboard took whole.
/** @param {Service} service @param {{from: Buffer, to: Buffer, defaults: Buffer, identity: {session: number, revision: number}, replaceWhenLarge?: boolean}} edit
 * @param {{onCommitted?: (transactionId: number) => void}} [options] */
async function postLiveEdit(service, edit, {onCommitted} = {}) {
    if (!service.connection?.connected) service.refuse("Connect the keyboard before editing it.");
    /** @type {Awaited<ReturnType<Coordinator["post"]>> | undefined} */
    let result;
    await service.runOperation(PHASE.LIVE_EDIT, async () => {
        const capabilities = service.profileCapabilities();
        try {
            result = await service.liveCoordinator().post({...edit, capacity: capabilities.profileSlotPayload || PROFILE_BLOB_V1.MAX_SIZE},
                {onCommitted, onWaiting: waiting => showWaiting(service, waiting)});
        } finally {service.liveWaiting = null;}
    }, {after: () => refreshLive(service)});
    if (!result) throw new Error("The keyboard operation returned no edit result.");
    return result;
}

// What the keyboard holds until no key is held, published as it changes.
/** @param {Service} service @param {import("./types.js").LiveWaiting | null} waiting */
function showWaiting(service, waiting) {
    if (JSON.stringify(waiting) === JSON.stringify(service.liveWaiting)) return;
    service.liveWaiting = waiting;
    service.emitChange();
}

// Save: the keyboard writes its working copy as a new generation on both
// halves (firmware D-F32). Resolves with the edit status after it.
/** @param {Service} service @param {{session: number, revision: number}} identity */
async function saveWorkingCopy(service, identity) {
    if (!service.connection?.connected) service.refuse("Connect the keyboard before saving.");
    /** @type {Awaited<ReturnType<Coordinator["save"]>> | undefined} */
    let result;
    await service.runOperation(PHASE.LIVE_SAVE, async () => {
        // Its words go when it ends, failed or not.
        try {
            result = await service.liveCoordinator().save(identity, status => {
                service.portableProgress = status.storagePaused || status.slaveStoragePaused ? "Waiting for a quiet keyboard to save"
                    : status.waitingSafe ? "Release held keys to finish saving" : "Saving on both halves";
                service.emitChange();
            });
        } finally {service.portableProgress = "";}
    }, {after: () => refreshLive(service)});
    if (!result) throw new Error("The keyboard operation returned no save result.");
    return result;
}

// Revert: the keyboard runs its saved profile again; nothing is written.
/** @param {Service} service @param {{session: number, revision: number}} identity */
async function revertWorkingCopy(service, identity) {
    if (!service.connection?.connected) service.refuse("Connect the keyboard before reverting it.");
    /** @type {Awaited<ReturnType<Coordinator["revert"]>> | undefined} */
    let result;
    await service.runOperation(PHASE.LIVE_REVERT, async () => {
        try {result = await service.liveCoordinator().revert(identity, {onWaiting: waiting => showWaiting(service, waiting)});}
        finally {service.liveWaiting = null;}
    }, {after: () => refreshLive(service)});
    if (!result) throw new Error("The keyboard operation returned no revert result.");
    return result;
}

// Leaving Live edit: the keyboard saves at once what it has not saved yet
// (live-edit-coordinator.js), so its mode can change. Resolves with the
// edit status after it.
/** @param {Service} service @param {(document: import("../model/types.js").PortableDocument) => Promise<string | undefined>} saveRecovery */
async function flushWorkingCopy(service, saveRecovery) {
    if (!service.connection?.connected) service.refuse("Connect the keyboard before changing how edits reach it.");
    /** @type {Awaited<ReturnType<Coordinator["flush"]>> | undefined} */
    let result;
    await service.runOperation(PHASE.LIVE_SAVE, async () => {
        try {result = await service.liveCoordinator().flush(status => {
            service.portableProgress = status.storagePaused || status.slaveStoragePaused ? "Waiting for a quiet keyboard to save"
                : status.autoSave.inProgress ? "The keyboard is saving its edits" : "Saving what the keyboard has not saved yet";
            service.emitChange();
        }, async status => {
            // A quiet-period save may have moved the saved base since the
            // panel's snapshot. Recover what is actually saved immediately
            // before each explicit Save, inside this operation's ownership.
            const snapshot = await readLiveProfile(service, service.connectedConnection(), service.profileCapabilities(), false);
            if (!snapshot.live.unsaved) return;
            if (snapshot.live.session !== status.session || snapshot.live.revision !== status.revision
                || snapshot.live.savedGeneration !== status.savedGeneration || snapshot.live.savedOrigin !== status.savedOrigin) {
                throw Object.assign(new Error("The keyboard changed before its recovery copy was saved."), {code: "LIVE_EDIT_STALE"});
            }
            const recovery = await saveRecovery(snapshot.saved.document);
            if (!recovery) throw Object.assign(new Error("A recovery copy could not be saved. Nothing was saved on the keyboard."), {code: "RECOVERY_REQUIRED"});
        });}
        // Its words go when it ends, failed or not.
        finally {service.portableProgress = "";}
    }, {after: () => refreshLive(service)});
    if (!result) throw new Error("The keyboard operation returned no save result.");
    return result;
}

// What the keyboard runs now (its working copy, or its saved profile),
// read as one revision (GET 0x21): what a restart would lose.
/** @param {Service} service */
async function readWorkingCopy(service) {
    if (!service.connection?.connected) service.refuse("Connect the keyboard before reading it.");
    /** @type {Awaited<ReturnType<typeof readActiveProfile>> | undefined} */
    let result;
    await service.runOperation(PHASE.READ_COMPLETE, async () => {
        result = await readActiveProfile(service.connectedConnection(), {...service.liveCoordinator().options, maxLength: service.profileCapabilities().profileSlotPayload || PROFILE_BLOB_V1.MAX_SIZE});
    });
    if (!result) throw new Error("The keyboard operation returned no profile.");
    return result;
}

// Restart both halves (firmware D-F34): the keyboard answers, then drops
// off USB and comes back as from power, so that loss is expected. Resolves
// with whether the slave half acknowledged, and so restarts too.
/** @param {Service} service */
async function restartKeyboard(service) {
    if (!service.connection?.connected) service.refuse("Connect the keyboard before restarting it.");
    /** @type {{slaveAcknowledged: boolean} | undefined} */
    let result;
    await service.runOperation(PHASE.RESTART, async () => {
        service.expectReconnect(true, "to restart");
        try {result = await service.liveCoordinator().restart();}
        catch (error) {service.expectReconnect(false); throw error;}
    });
    if (!result) throw new Error("The keyboard operation returned no restart result.");
    return result;
}

// How edits reach this keyboard, stored on both halves; refused while it
// has unsaved edits (Save or Revert first).
/** @param {Service} service @param {number} mode */
async function setEditMode(service, mode) {
    if (!service.connection?.connected) service.refuse("Connect the keyboard before changing how edits reach it.");
    await service.runOperation(PHASE.EDIT_MODE, async () => {service.editMode = await service.liveCoordinator().setMode(mode);});
    return service.editMode;
}

// After a live edit, Save or Revert: the keyboard's health and its
// toggles as they are now (an edit may change a stored master).
/** @param {Service} service */
async function refreshLive(service) {await service.refreshStatus();}

module.exports = {postLiveEdit, saveWorkingCopy, revertWorkingCopy, flushWorkingCopy, readWorkingCopy, restartKeyboard, setEditMode};
