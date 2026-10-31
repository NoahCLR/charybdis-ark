// @ts-check
"use strict";
const {readEditStatus} = require("../protocol/profile-edit-v1");
const {readFlashPauses: readHalvesFlashPauses} = require("../protocol/flash-pauses-v1");
const {publicError} = require("./operation-failure");
const {failureSentence} = require("../model/vocabulary");

/** @typedef {import("./profile-device-service.js").Operation} Operation */

// The look at a live keyboard between edits (live-watch.js) is a background
// read: Chrome on macOS holds back a page's input reports while one of its
// menus is open, so an answer can be late though the keyboard is fine. Each
// of its requests waits this long, and a miss only skips that look; this many
// misses in a row mean the keyboard is lost.
const WATCH_TIMEOUT_MS = 3000;
const WATCH_MISSES = 3;

// The reads the device service makes between operations (the live watch's
// look, the flash pauses; profile-device-service.js): one at a time, never
// while an operation holds the keyboard, and an operation that starts
// meanwhile waits for the one out to end.
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
// A background read (profile-device-service.js), made only while no
// operation holds the keyboard. An unanswered look is skipped
// (undefined), and keeps the connection; WATCH_MISSES of them in a row end
// it as a lost keyboard. `watch` is how long each request waits, and the
// keyboard's name for the diagnostics.
/** @param {Operation} op @param {{timeoutMs: number, label: string}} watch */
async function readLiveStatus(op, {timeoutMs, label}) {
    const state = op.state, connection = op.connection;
    try {
        const status = await readEditStatus(missableConnection(connection, timeoutMs), op.live().options);
        state.missedLooks = 0;
        if (!state.current) return undefined;
        // The mode's write to EEPROM retried (flag 12) shows beside the switch.
        if (state.mode({notStored: status.modeNotStored})) op.publish();
        return status;
    } catch (error) {
        // A refused read is tried again at the next look.
        if (/** @type {{soft?: boolean}} */ (error)?.soft && state.current) {
            state.missedLooks++;
            op.say(`${label} missed a status look (${state.missedLooks} in a row).`);
            if (state.missedLooks >= WATCH_MISSES) await connection.abandon(error);
        }
        return undefined;
    }
}

// Each half's flash pauses (GET 0x0D) for the Keyboard screen's
// Diagnostics, into `flashPauses`: a background read like the watch's
// look, each request waiting `timeoutMs`. Resolves true once read; a
// failure is the read's own `{state: "unavailable", error}`, never the
// keyboard's error.
/** @param {Operation} op @param {number} timeoutMs */
async function readFlashPauses(op, timeoutMs) {
    const connection = op.connection, ids = op.ids;
    /** @type {import("../../contracts/model.js").FlashPausesView} */
    let read;
    try {read = {state: "read", ...await readHalvesFlashPauses(missableConnection(connection, timeoutMs), ids)};}
    catch (error) {
        // Said as the panel says any failure; its own text goes to the diagnostics.
        const failure = publicError(error);
        op.say(`Flash pauses: ${failure.code}: ${failure.message}`);
        read = {state: "unavailable", error: failureSentence(failure)};
    }
    if (!op.state.keep({flashPauses: read})) return false;
    op.publish();
    return true;
}

module.exports = {WATCH_TIMEOUT_MS, WATCH_MISSES, BackgroundReads, missableConnection, readLiveStatus, readFlashPauses};
