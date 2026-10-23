// @ts-check
"use strict";

// Restarting the keyboard from Ark (firmware D-F34): the way out of a
// keyboard that stopped saving, which nothing but a restart clears. A
// restart loses what is unsaved in the keyboard's RAM, so Ark keeps it first.
//
//   restartKeyboard       with unsaved edits, read what the keyboard runs
//                         (GET 0x21; the draft's own copy if that read fails)
//                         and save it as a recovery copy, as Apply does: no
//                         recovery copy, no restart. Then ask both halves to
//                         restart, and wait for the same keyboard to come back
//                         (keyboard-reconnect.js). Firmware without restart
//                         answers unhandled, and nothing happens.
//   putBackAfterRestart   once the restarted keyboard is read again: the kept
//                         edits go back as one live edit, unsaved (in Live the
//                         keyboard saves them by itself, in Live + review they
//                         wait for Save), and the panel says how it went,
//                         naming the recovery copy whenever something failed.
//
// Ark never restarts the keyboard by itself.

/**
 * @typedef {import("./types.js").RunningPanelSession} Session
 * @typedef {NonNullable<Session["draft"]>} Draft
 */
const {EDIT_MODE} = require("../protocol/profile-edit-v1");
const {IDENTITY} = require("../model/layer-order");
const {snapshotOf} = require("./live-profile-session");
const {expectRestart} = require("./keyboard-reconnect");
const {proposeLive} = require("./live-edits");

const RESTART_LABEL = "Put back the unsaved edits from before the restart";

/** @param {string} message @param {string} code */
const refusal = (message, code) => Object.assign(new Error(message), {code});
/** @param {unknown} error */
const messageOf = error => (error instanceof Error ? error.message : String(error)).replace(/\.$/, "");
/** @param {string | undefined} recovery */
const inRecovery = recovery => recovery ? ` Your unsaved edits are in the recovery copy: ${recovery}` : "";
const UNANSWERED = " The slave half did not answer the restart: if the halves do not agree now, unplug the keyboard and plug it back in.";

// What a restart would lose: the keyboard's working copy, as a document. An
// Apply draft is Ark's own and survives it; so does a keyboard with nothing
// unsaved.
/** @param {Session} session @param {Draft} draft */
async function keptEdits(session, draft) {
    const live = draft.live;
    if (!live) return undefined;
    let bytes = live.working, unsaved = live.unsaved;
    try {
        const read = await session.service.readWorkingCopy();
        ({bytes} = read); unsaved = read.metadata.unsaved;
    } catch {
        // What Ark last confirmed the keyboard runs is its working copy.
    }
    if (!unsaved) return undefined;
    if (bytes.equals(live.working)) return draft.current.document;
    const capabilities = session.service.snapshot().capabilities;
    if (!capabilities) throw refusal("Read the keyboard again before restarting it.", "RESTART_UNREAD");
    return snapshotOf(/** @type {import("./types.js").DeviceCapabilities} */ (capabilities), bytes, live.defaults).document;
}

/** @param {{session: Session, draft: Draft, saveRecovery: (document: import("../model/types.js").PortableDocument) => Promise<string | undefined>}} context */
async function restartKeyboard({session, draft, saveRecovery}) {
    const service = session.service, state = service.snapshot();
    if (!state.connected) throw refusal("Connect the keyboard before restarting it.", "RESTART_UNCONNECTED");
    const device = (state.devices || []).find(entry => entry.id === state.selectedDeviceId);
    const kept = await keptEdits(session, draft);
    let recovery;
    if (kept) {
        recovery = await saveRecovery(kept);
        if (!recovery) throw refusal("A recovery copy of the keyboard's unsaved edits could not be saved, so it was not restarted.", "RECOVERY_REQUIRED");
    }
    let result;
    try {result = await service.restartKeyboard();}
    catch (error) {
        const code = /** @type {{code?: string}} */ (error)?.code || "RESTART_FAILED";
        if (code === "UNHANDLED") throw refusal(`This keyboard's firmware cannot restart from Ark, so nothing happened. Unplug the keyboard and plug it back in.${inRecovery(recovery)}`, "RESTART_UNSUPPORTED");
        throw refusal(`The keyboard did not restart: ${messageOf(error)}.${inRecovery(recovery)}`, code);
    }
    session.restart = {deviceId: device?.id, serialNumber: device?.serialNumber || "", kept, recovery, slaveAcknowledged: result.slaveAcknowledged};
    const expected = expectRestart(session);
    // Said if the keyboard never comes back; replaced once it is read again.
    if (expected) expected.after = `${inRecovery(recovery).trim()}${result.slaveAcknowledged ? "" : UNANSWERED}`.trim();
    session.notice = kept ? "Restarting the keyboard… Ark keeps its unsaved edits and puts them back once it is back." : "Restarting the keyboard…";
}

// Whether `session.restart` is for the keyboard just read: the one the
// restart's own wait followed back, or the same device or serial number.
/** @param {Session} session @param {NonNullable<Session["restart"]>} restart */
function sameKeyboard(session, restart) {
    if (session.reconnect?.restart) return true;
    const state = session.service.snapshot();
    const device = (state.devices || []).find(entry => entry.id === state.selectedDeviceId);
    return Boolean(device && (device.id === restart.deviceId || (restart.serialNumber && device.serialNumber === restart.serialNumber)));
}

// After the restarted keyboard was read again. What happened is said after
// the reconnect's own words when its wait is still running, else at once.
/** @param {Session} session */
async function putBackAfterRestart(session) {
    const restart = session.restart;
    if (!restart || !sameKeyboard(session, restart)) return;
    session.restart = undefined;
    const outcome = await putBack(session, restart);
    if (session.reconnect?.restart) session.reconnect.after = outcome;
    else if (outcome) session.notice = `${session.notice ? `${session.notice} ` : ""}${outcome}`;
}

/** @param {Session} session @param {NonNullable<Session["restart"]>} restart @returns {Promise<string>} */
async function putBack(session, restart) {
    const draft = session.draft, keyboard = draft?.live?.keyboard;
    // Read again, the keyboard answered for both halves (a read refuses one
    // without the slave half), and since D-F34 a half that missed the restart
    // rejoins by itself: an unanswered restart needs no replug now. It is said
    // only while the keyboard has not come back (above).
    const slave = "";
    if (keyboard?.stopped || keyboard?.slaveStopped) {
        return `It stopped saving again at once, so the fault is in its flash or its firmware, and restarting again will not help.${restart.kept ? ` Your unsaved edits were not put back.${inRecovery(restart.recovery)}` : ""}${slave}`.trim();
    }
    if (!restart.kept) return slave.trim();
    if (!draft?.live) return `Your unsaved edits were not put back: the keyboard now takes edits by Apply.${inRecovery(restart.recovery)}${slave}`;
    try {
        const sent = await proposeLive(session, {document: restart.kept, label: RESTART_LABEL, origin: "edit", order: IDENTITY}, {confirmed: true, replaceWhenLarge: true});
        if (!sent) return `Your unsaved edits were not put back: the keyboard changed meanwhile.${inRecovery(restart.recovery)}${slave}`;
    } catch (error) {
        return `Your unsaved edits could not be put back: ${messageOf(error)}.${inRecovery(restart.recovery)}${slave}`;
    }
    return `${draft.live?.mode === EDIT_MODE.LIVE ? "Your unsaved edits are back on the keyboard, which saves them in a moment."
        : "Your unsaved edits are back on the keyboard, not saved yet: review and save them."}${slave}`;
}

module.exports = {RESTART_LABEL, restartKeyboard, putBackAfterRestart};
