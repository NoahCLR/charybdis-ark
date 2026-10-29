// @ts-check
"use strict";
const {readEditStatus} = require("../protocol/profile-edit-v1");
const {readFlashPauses: readHalvesFlashPauses} = require("../protocol/flash-pauses-v1");
const {publicError} = require("./operation-failure");
const {failureSentence} = require("../model/vocabulary");

/** @typedef {InstanceType<typeof import("./profile-device-service.js").ProfileDeviceService>} Service */

// The look at a live keyboard between edits (live-watch.js) is a background
// read: Chrome on macOS holds back a page's input reports while one of its
// menus is open, so an answer can be late though the keyboard is fine. Each
// of its requests waits this long, and a miss only skips that look; this many
// misses in a row mean the keyboard is lost.
const WATCH_TIMEOUT_MS = 3000;
const WATCH_MISSES = 3;

// The reads the device service makes between operations (the live watch's
// look, the flash pauses; profile-device-service.js): one at a time, and an
// operation that starts meanwhile waits for the one out to end.
class BackgroundReads {
    /** @type {Promise<void> | undefined} */
    #out = undefined;

    // Settled when the read out now ends; undefined while none is.
    get out() {return this.#out;}

    /** @template T @param {() => Promise<T>} read @returns {Promise<T>} */
    async run(read) {
        const running = read();
        const settled = this.#out = running.then(() => {}, () => {});
        try {return await running;}
        finally {if (this.#out === settled) this.#out = undefined;}
    }
}

// A read the caller can miss: each request waits `timeoutMs`, and one
// unanswered fails alone and keeps the connection.
/** @param {import("./types.js").DeviceConnection} connection @param {number} timeoutMs @returns {import("../transport/types.js").RequestConnection} */
function missableConnection(connection, timeoutMs) {
    return {request: (report, options = {}) => connection.request(report, {...options, timeoutMs, softTimeout: true})};
}

// Between edits, what a live keyboard says about itself: whether it saved
// by itself, whether its own keys moved the revision, how its halves are.
// A background read, skipped (undefined) while an operation holds the
// keyboard. An unanswered look is skipped too, and keeps the connection;
// WATCH_MISSES of them in a row end it as a lost keyboard.
/** @param {Service} service @param {BackgroundReads} background */
async function readLiveStatus(service, background) {
    const connection = quietConnection(service, background);
    if (!connection || !service.editMode) return undefined;
    const missable = missableConnection(connection, service.watchTimeoutMs);
    return background.run(async () => {try {
        const status = await readEditStatus(missable, service.liveCoordinator().options);
        service.missedLooks = 0;
        if (service.connection !== connection || !connection.connected) return undefined;
        // The mode's write to EEPROM retried (flag 12) shows beside the switch.
        if (service.editMode && Boolean(service.editMode.notStored) !== status.modeNotStored) {service.editMode = {...service.editMode, notStored: status.modeNotStored}; service.emitChange();}
        return status;
    } catch (error) {
        // A refused read is tried again at the next look.
        if (/** @type {{soft?: boolean}} */ (error)?.soft && service.connection === connection) {
            service.missedLooks++;
            service.addDiagnostic(`${service.deviceLabel(service.connectionPublicId)} missed a status look (${service.missedLooks} in a row).`);
            if (service.missedLooks >= WATCH_MISSES) await connection.abandon(error);
        }
        return undefined;
    }});
}

// Each half's flash pauses (GET 0x0D) for the Keyboard screen's
// Diagnostics, into `flashPauses`: a background read like the watch's
// look, false when skipped because an operation holds the keyboard or
// another background read is out. A failure is the read's own
// `{state: "unavailable", error}`, never the keyboard's error.
/** @param {Service} service @param {BackgroundReads} background */
async function readFlashPauses(service, background) {
    const connection = quietConnection(service, background), ids = service.requestIds;
    if (!connection || !ids) return false;
    return background.run(async () => {
        /** @type {import("../../contracts/model.js").FlashPausesView} */
        let read;
        try {read = {state: "read", ...await readHalvesFlashPauses(missableConnection(connection, service.watchTimeoutMs), ids)};}
        catch (error) {
            // Said as the panel says any failure; its own text goes to the diagnostics.
            const failure = publicError(error);
            service.addDiagnostic(`Flash pauses: ${failure.code}: ${failure.message}`);
            read = {state: "unavailable", error: failureSentence(failure)};
        }
        if (service.connection !== connection || !connection.connected) return false;
        service.flashPauses = read;
        service.emitChange();
        return true;
    });
}

// The connection a background read may start on: none while an operation
// holds the keyboard or another background read is out.
/** @param {Service} service @param {BackgroundReads} background */
function quietConnection(service, background) {
    return service.busy || background.out || !service.connection?.connected || !service.requestIds ? undefined : service.connection;
}

module.exports = {WATCH_TIMEOUT_MS, WATCH_MISSES, BackgroundReads, missableConnection, readLiveStatus, readFlashPauses};
