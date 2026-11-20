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
//                         edits go back as one live edit, unsaved (in Live
//                         edit the keyboard saves them by itself, in Live
//                         preview + save they wait for Save), and the panel
//                         says how it went, naming the recovery copy whenever
//                         something failed. A Review and save draft had
//                         nothing on the keyboard: it stays as it is, and the
//                         keyboard is looked at at once.
//
// Ark never restarts the keyboard by itself.

/**
 * @typedef {import("./types.js").RunningPanelSession} Session
 * @typedef {NonNullable<Session["draft"]>} Draft
 */
const {EDIT_MODE} = require("../protocol/profile-edit-v1");
const {EDIT_MODE_WORDS, arkCode, failureSentence} = require("../model/vocabulary");
const {IDENTITY} = require("../model/draft-order");
const {snapshotOf} = require("./live-profile-session");
const {expectRestart} = require("./keyboard-reconnect");
const {followKeyboard, forget, keptFor, remember} = require("./kept");
const {fingerprint} = require("../model/portable-profile");
const {proposeLive} = require("./live-edits");
const {takeRead} = require("./draft-follow");
const {say, sayAfter} = require("./panel-session-state");

const RESTART_LABEL = "Put back the unsaved edits from before the restart";

/** @param {string} message @param {string} code */
const refusal = (message, code) => Object.assign(new Error(message), {code});
/** @param {string | undefined} recovery */
const inRecovery = recovery => recovery ? ` Your unsaved edits are in the recovery copy on Backups: ${recovery}` : "";
const UNANSWERED = " The slave half did not answer the restart: if the halves do not agree now, unplug the keyboard and plug it back in.";

// What a restart would lose: the keyboard's working copy, as a document. A
// Review and save draft is Ark's own and survives it; so does a keyboard with
// nothing unsaved.
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
    const kept = await keptEdits(session, draft);
    let recovery;
    if (kept) {
        recovery = await saveRecovery(kept);
        if (!recovery) throw refusal("A recovery copy of the keyboard's unsaved edits could not be saved, so it was not restarted.", "RECOVERY_REQUIRED");
    }
    let result;
    try {result = await service.restartKeyboard();}
    catch (error) {
        const code = arkCode(error, "RESTART_FAILED");
        if (code === "UNHANDLED") throw refusal(`This keyboard's firmware cannot restart from Ark, so nothing happened. Unplug the keyboard and plug it back in.${inRecovery(recovery)}`, "RESTART_UNSUPPORTED");
        // What stopped it is said in words (failureSentence); its own text
        // stays under it, for the diagnostics.
        throw Object.assign(refusal(`The keyboard did not restart. ${failureSentence(error)}${inRecovery(recovery)}`, code), {cause: error});
    }
    remember(session, "restart", {kept, recovery, slaveAcknowledged: result.slaveAcknowledged}, state);
    const expected = expectRestart(session);
    // Said if the keyboard never comes back; replaced once it is read again.
    if (expected) expected.after = `${inRecovery(recovery).trim()}${result.slaveAcknowledged ? "" : UNANSWERED}`.trim();
    // It holds until the keyboard is back, when what happened replaces it.
    const waiting = kept ? "Restarting the keyboard… Ark keeps its unsaved edits and puts them back once it is back." : "Restarting the keyboard…";
    if (expected) expected.waiting = waiting;
    say(session, waiting, "lasting");
}

// After the restarted keyboard was read again, when the restart Ark asked
// for is this keyboard's (kept.js: the one its own wait followed back, or the
// same device or serial number). What happened is said after the
// follow-back's own words when one is running, else at once.
/** @param {Session} session */
async function putBackAfterRestart(session) {
    const state = session.service.snapshot(), portable = session.service.portable;
    const restart = keptFor(session, "restart", state);
    if (!restart) return;
    forget(session, "restart");
    // The same keyboard, perhaps listed under a new device id since: its
    // draft follows it and takes the read just made, which the shell may not
    // have shown it yet, so the edits go to the session it runs now.
    if (state.selectedDeviceId) followKeyboard(session, restart.deviceId || "", state.selectedDeviceId);
    const followed = session.draft;
    // A live draft takes a live read; anything else is the panel's, which
    // asks before a draft changes its kind (draft-follow.js followRead).
    if (portable && "live" in portable && portable.live && followed?.live && followed.deviceId === state.selectedDeviceId) takeRead(session, followed, portable);
    // A Review and save draft takes the new connection when the keyboard
    // still holds what it began from. Its read says nothing of the keyboard's
    // saving: look at it now, so a keyboard that stopped again is told from
    // one that is back.
    else if (followed && !followed.live && followed.deviceId === state.selectedDeviceId) {
        followed.followRestart(state.connectionToken ?? null);
        followed.observeApplyStatus(await session.service.readLiveStatus());
    }
    const {words: outcome, failed} = await putBack(session, restart, portable);
    // A restart's own wait said its recovery copy in case the keyboard never
    // came back; any other follow-back keeps what it says already. Edits not
    // put back are a failure, kept on the rail with where their copy is.
    if (session.reconnect?.restart) Object.assign(session.reconnect, {after: outcome, afterFailed: failed});
    else if (session.reconnect) Object.assign(session.reconnect, {after: [session.reconnect.after, outcome].filter(Boolean).join(" "), afterFailed: session.reconnect.afterFailed || failed});
    else if (outcome) sayAfter(session, outcome, failed ? "failed" : session.noticeKind);
}

// What became of the edits kept over a restart, and whether that failed.
/** @param {Session} session @param {NonNullable<import("./types.js").KeptRecords["restart"]>} restart @param {import("../model/types.js").ProfileSnapshot | null | undefined} read @returns {Promise<{words: string, failed: boolean}>} */
async function putBack(session, restart, read) {
    const draft = session.draft, keyboard = draft?.keyboardStatus;
    // Read again, the keyboard answered for both halves (a read refuses one
    // without the slave half), and since D-F34 a half that missed the restart
    // rejoins by itself: an unanswered restart needs no replug now. It is said
    // only while the keyboard has not come back (above).
    const slave = "";
    if (keyboard?.stopped || keyboard?.slaveStopped) {
        return {words: `It stopped saving again at once, so the fault is in its flash or its firmware, and restarting again will not help.${restart.kept ? ` Your unsaved edits were not put back.${inRecovery(restart.recovery)}` : ""}${slave}`.trim(), failed: true};
    }
    if (!restart.kept) return {words: slave.trim(), failed: false};
    if (!draft?.live) return {words: `Your unsaved edits were not put back: the keyboard is now in ${EDIT_MODE_WORDS[EDIT_MODE.APPLY].label}.${inRecovery(restart.recovery)}${slave}`, failed: true};
    // Only to the keyboard just read, at the session it runs now.
    const readSession = read && "live" in read ? /** @type {import("./types.js").LiveSnapshot} */ (read).live?.session : undefined;
    if (draft.deviceId !== session.service.snapshot().selectedDeviceId || readSession === undefined || draft.live.session !== readSession) {
        return {words: `Your unsaved edits were not put back: Ark could not tell that this is the keyboard it restarted.${inRecovery(restart.recovery)}${slave}`, failed: true};
    }
    const kept = fingerprint(restart.kept);
    try {
        const sent = await proposeLive(session, {document: restart.kept, label: RESTART_LABEL, origin: "edit", order: IDENTITY}, {confirmed: true, replaceWhenLarge: true});
        // They are back once the keyboard confirmed them, unsaved.
        const back = session.draft === draft && draft.live?.unsaved && draft.current.fingerprint === kept;
        if (!sent || !back) return {words: `Your unsaved edits were not put back: the keyboard changed meanwhile.${inRecovery(restart.recovery)}${slave}`, failed: true};
    } catch (error) {
        session.service.addDiagnostic?.(`Putting back the edits from before the restart failed: ${error instanceof Error ? error.message : String(error)}`);
        return {words: `Your unsaved edits could not be put back. ${failureSentence(error)}${inRecovery(restart.recovery)}${slave}`, failed: true};
    }
    return {words: `${draft.live?.mode === EDIT_MODE.LIVE ? "Your unsaved edits are back on the keyboard, which saves them in a moment."
        : "Your unsaved edits are back on the keyboard, not saved yet: review and save them."}${slave}`, failed: false};
}

module.exports = {RESTART_LABEL, restartKeyboard, putBackAfterRestart};
