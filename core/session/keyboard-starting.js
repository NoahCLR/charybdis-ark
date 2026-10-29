// @ts-check
"use strict";

// A keyboard that has just come back (a restart, a rename, a replug or a
// lost connection) answers over USB about a second before it has decided
// which profile runs: until then its profile status reports the active
// profile pending (active kind 3, flag 7 set, firmware D-F61), and for a
// moment more the halves have not yet agreed. Read then, it fails. So before
// the editor's read of a keyboard (readForEditor: every read Ark follows back,
// and Read keyboard), Ark polls profile status until the keyboard has
// finished starting, for at most STARTING.WAIT_MS (D-L70):
//
//   hasStarted(status)       the active profile is decided (not pending,
//                            digests reported) and the halves agree
//                            (halvesConverged, device-model.js)
//   stillStarting(status)    the active profile is still pending
//   isStartingTimeout(error) the wait's own failure, KEYBOARD_STARTING
//   startingTimeout(session) its notice, naming the recovery copy
//
// Past the bound, a keyboard still starting with its slave half known fails
// KEYBOARD_STARTING, in words of its own. Any other keyboard that has not
// started, such as one without its slave half, is read anyway, so it is said
// what it is in the read's usual words. Within the bound, a read refused
// because the keyboard was not ready or changed under it waits again and is
// read again (`readOnceStarted`), rather than reported.

/** @typedef {import("./types.js").ProfileStatus} Status */
const {PROFILE_ACTIVE_KIND, PROFILE_STATE_FLAGS} = require("../protocol/profile-wire-v1");
const {halvesConverged} = require("./device-model");

// A booting keyboard decided within about 2.5 s (a 6 KB profile) to 4 s (the
// largest) on Noah's keyboard; the bound leaves room for a slow half.
const STARTING = Object.freeze({WAIT_MS: 15000, POLL_MS: 200});
const STARTING_CODE = "KEYBOARD_STARTING";
// Meanwhile the panel shows the wait's phase, PHASE.STARTING, in its words
// ("Waiting for the keyboard to finish starting…", core/model/vocabulary.js).
const STARTING_WORDS = Object.freeze({
    timeout: `The keyboard has not finished starting after ${STARTING.WAIT_MS / 1000} seconds. Read the keyboard again in a moment; if it still has not, unplug it and plug it back in.`,
});
// Refusals that mean the keyboard was not ready yet, or changed under the read.
const RETRIED = new Set(["KEYBOARD_NOT_READY", "ACTIVE_PROFILE_UNAVAILABLE", "PROFILE_CHANGED", "GENERATION_UNSTABLE"]);

/** @param {Pick<Status, "activeKind" | "stateFlags">} status */
const stillStarting = status => status.activeKind === PROFILE_ACTIVE_KIND.PENDING
    || (status.stateFlags & PROFILE_STATE_FLAGS.DIGESTS_UNAVAILABLE) !== 0;

/** @param {Partial<Status> & Pick<Status, "activeKind" | "stateFlags">} status */
const hasStarted = status => !stillStarting(status) && halvesConverged(status);

/** @param {unknown} error */
const codeOf = error => /** @type {{code?: unknown} | null | undefined} */ (error)?.code;

/** @param {unknown} error a rejection, or a recorded error */
const isStartingTimeout = error => codeOf(error) === STARTING_CODE;

// The timeout notice, naming the recovery copy that holds unsaved edits: a
// Restart's, or a Save's the connection cut short. A Restart's follow-back
// says its own copy after its words (keyboard-restart.js), so not here.
/** @param {Pick<import("./types.js").RunningPanelSession, "reconnect" | "restart" | "saveCutShort">} session */
function startingTimeout(session) {
    const recovery = session.reconnect?.restart ? undefined : session.restart?.recovery || session.saveCutShort?.recovery;
    return `${STARTING_WORDS.timeout}${recovery ? ` Your unsaved edits are in the recovery copy: ${recovery}` : ""}`;
}

/**
 * The editor's read once the keyboard has started: a read refused as not
 * ready, or changed under it, waits again (the service's `awaitStarted`) and
 * is read again while the wait's bound lasts, and once more if the keyboard
 * started just as it ended. A service without the wait reads once.
 * @template T
 * @param {{awaitStarted?: (options?: {deadline?: number}) => Promise<{started: boolean, deadline: number, late: boolean}>}} service
 * @param {{deadline: number} | undefined} started what the first wait resolved with
 * @param {() => Promise<T>} read
 * @returns {Promise<T>}
 */
async function readOnceStarted(service, started, read) {
    for (let last = false; ;) {
        try {return await read();}
        catch (error) {
            const code = codeOf(error);
            if (last || !started || !service.awaitStarted || typeof code !== "string" || !RETRIED.has(code)) throw error;
            const again = await service.awaitStarted({deadline: started.deadline});
            if (again.late && !again.started) throw error;
            last = again.late;
        }
    }
}

module.exports = {STARTING, STARTING_CODE, STARTING_WORDS, hasStarted, stillStarting, isStartingTimeout, startingTimeout, readOnceStarted};
