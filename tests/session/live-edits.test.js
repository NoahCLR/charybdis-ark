"use strict";
// Live preview + save through the panel loop the page runs: edits, undo, the
// trap check, Save, Revert, reconnect and replug, and the mode switch, against
// a keyboard with a working copy (firmware D-F32).
const assert = require("node:assert/strict");
const test = require("node:test");
const {lastMessage, lastModel, notices, openLoop} = require("../fixtures/panel-loop");
const {liveKeyboard} = require("../fixtures/live-keyboard");
const {document} = require("../fixtures/portable-profile");
const {validateSnapshot} = require("../../core/model/portable-profile");
const {EDIT_MODE, EDIT_RESULT, PROFILE_EDIT_V1} = require("../../core/protocol/profile-edit-v1");
const {STARTING} = require("../../core/session/keyboard-starting");
const EDIT_VALUE_SAVE = PROFILE_EDIT_V1.VALUE_SAVE;

// The loop on a live keyboard (in Live preview + save unless `options` say).
/** @param {import("node:test").TestContext} t @param {object} [options] */
const open = (t, options = {}) => openLoop(t, {keyboard: liveKeyboard({document: document(), ...options})});
/** @param {Buffer | null} bytes */
const layers = bytes => validateSnapshot({format: "charybdis-profile", version: 5, keyboard: "charybdis-4x6", actionAbiDigest: document().actionAbiDigest, profile: /** @type {Buffer} */ (bytes).toString("base64")}).layers;

test("a keyboard in Live preview + save opens a live draft, and every posted edit reaches the keyboard at once", async t => {
    const {keyboard, shell, session, key} = await open(t);
    const draft = session.draft;
    assert.ok(draft.live, "the draft is the keyboard's working copy");
    assert.equal(lastModel(shell).editMode.mode, EDIT_MODE.LIVE_REVIEW);
    assert.equal(draft.dirty, false);
    await key(0, 10, "KC_X");
    assert.ok(keyboard.working, "the keyboard runs the edit");
    assert.equal(keyboard.events.filter(event => event === "published").length, 1);
    assert.equal(draft.dirty, true, "review compares the working copy with the saved profile");
    assert.equal(draft.view({}).changes.length, 1);
    assert.equal(draft.history.length, 2);
    const published = lastMessage(shell);
    assert.ok(published.acceptedEdit, "the form learns its edit was taken");
    assert.equal(published.model.draft.live.unsaved, true);
    assert.equal(published.model.draft.live.converged, true);
    assert.ok(keyboard.saved.equals(Buffer.from(document().profile, "base64")), "nothing is saved until Save");
});

test("undo and redo send the inverse edit through the same path", async t => {
    const {keyboard, session, key, send} = await open(t);
    await key(0, 12, "KC_Y");
    const first = keyboard.working;
    await key(0, 13, "KC_U");
    const edited = keyboard.working;
    await send({type: "undoProfileDraft"});
    assert.equal(session.draft.cursor, 1);
    assert.notDeepEqual(keyboard.working, edited, "undo changed the keyboard back");
    assert.ok(keyboard.working.equals(first), "to the first edit, which still runs");
    await send({type: "redoProfileDraft"});
    assert.ok(keyboard.working.equals(edited));
    assert.equal(keyboard.events.filter(event => event === "published").length, 4);
});

// A working copy identical to what is saved is no unsaved edit: "Unsaved
// edits match what is saved" (keyboard check, 2026-10-19). A step that lands
// on the saved profile reverts the keyboard instead, and Live edit has
// nothing to save; the history keeps its steps, so redo sends the edit again.
test("undo back to the saved profile reverts the keyboard; redo sends the edit again", async t => {
    const {keyboard, shell, session, key, send} = await open(t);
    await key(0, 12, "KC_Y");
    const edited = keyboard.working;
    await send({type: "undoProfileDraft"});
    assert.equal(session.draft.cursor, 0);
    assert.equal(keyboard.working, null, "the keyboard runs its saved profile, not a copy of it");
    assert.deepEqual(keyboard.events.slice(-1), ["reverted"]);
    assert.equal(lastModel(shell).draft.live.unsaved, false);
    assert.equal(session.draft.dirty, false);
    await send({type: "redoProfileDraft"});
    assert.ok(keyboard.working.equals(edited));
    assert.equal(lastModel(shell).draft.live.unsaved, true);
    // Revert, then undo (the edits back) and redo (the Revert again).
    await send({type: "revertProfileDraft"});
    assert.equal(keyboard.working, null);
    await send({type: "undoProfileDraft"});
    assert.ok(keyboard.working.equals(edited));
    await send({type: "redoProfileDraft"});
    assert.equal(keyboard.working, null, "redoing a Revert reverts");
    assert.equal(lastModel(shell).draft.live.unsaved, false);
    assert.equal(keyboard.events.filter(event => event === "reverted").length, 3);
    assert.ok(keyboard.saved.equals(Buffer.from(document().profile, "base64")), "nothing was saved");
});

// An edit made by hand that puts the last change back is the same Revert.
test("an edit that puts the saved value back reverts the keyboard", async t => {
    const {keyboard, shell, loop, key} = await open(t);
    const original = loop.session.service.snapshot().layout.layers[0].keys[12].keycode;
    await key(0, 12, "KC_Y");
    assert.ok(keyboard.working);
    await key(0, 12, original);
    assert.equal(keyboard.working, null);
    assert.equal(lastModel(shell).draft.live.unsaved, false);
});

test("an edit that adds a trap waits for the person; cancelling sends nothing, confirming sends it", async t => {
    const {keyboard, shell, session, key, send} = await open(t);
    const published = keyboard.events.filter(event => event === "published").length;
    // Layer 2 has no way back once toggled on.
    await key(0, 20, "TG(2)");
    const proposal = lastModel(shell).liveProposal;
    assert.ok(proposal, "the trap is asked about before anything is sent");
    assert.ok(proposal.checks.some(check => check.level === "trap"));
    assert.equal(keyboard.events.filter(event => event === "published").length, published);
    await send({type: "cancelLiveEdit", proposal: proposal.id});
    assert.equal(lastModel(shell).liveProposal, null);
    assert.equal(lastMessage(shell).resetDraftForms, true, "the form goes back to what the keyboard runs");
    await key(0, 20, "TG(2)");
    await send({type: "confirmLiveEdit", proposal: lastModel(shell).liveProposal.id});
    assert.equal(keyboard.events.filter(event => event === "published").length, published + 1);
    assert.equal(lastModel(shell).liveProposal, null);
    assert.equal(session.draft.history.length, 2);
});

// Shift held through a rename once made Ark say "Failed" after 5 s and throw
// the history away, though the keyboard took the edit on release (keyboard
// session, 2026-10-24).
const ABORT = 0x24;
test("an edit held by a key waits for the release, says so, and lands as Ark's own edit", async t => {
    const {keyboard, shell, session, key, send, at} = await open(t);
    const draft = session.draft;
    keyboard.hold(1);
    /** @type {Promise<unknown>[]} */
    const meanwhile = [];
    at(3000, () => {meanwhile.push(key(0, 11, "KC_W"), send({type: "revertProfileDraft"}));});
    at(13000, () => keyboard.release());
    await key(0, 10, "KC_X");
    await Promise.all(meanwhile);
    const waited = shell.posted.filter(message => message.type === "model" && message.model.liveWait).map(message => message.model.liveWait);
    assert.ok(waited.length, "the panel showed the wait");
    assert.equal(waited[0].title, "Let go of the held keys to finish the edit");
    assert.match(waited[0].detail, /Held now: a key\./);
    assert.equal(waited[0].cancellable, true);
    assert.equal(lastModel(shell).liveWait, null, "and stopped once the edit landed");
    assert.equal(keyboard.events.filter(event => event === "published").length, 1, "published once");
    assert.ok(!keyboard.mutations.some(request => request[2] === ABORT), "nothing was aborted");
    assert.equal(layers(keyboard.working)[0][11], 0, "the edit asked for meanwhile was not sent");
    assert.equal(session.draft, draft);
    assert.equal(draft.history.length, 2, "the history has the step");
    assert.equal(draft.live.revision, keyboard.revision);
    const said = notices(shell);
    assert.ok(!said.some(notice => /not what Ark last saw/.test(notice)));
    assert.ok(!said.some(notice => /^Failed/.test(notice)), "nothing failed");
    assert.deepEqual(said.filter(notice => /^Let go/.test(notice)), [
        "Let go of the held keys first: the keyboard is still taking the last edit.",
        "Let go of the held keys first: the keyboard is still taking the last edit.",
    ], "what was asked for meanwhile was refused, with words");
    await send({type: "undoProfileDraft"});
    assert.equal(keyboard.working, null, "undo sends the edit back");
});

test("Cancel edit aborts an edit held by a key; the keyboard and the draft stay as they were", async t => {
    const {keyboard, shell, session, key, send, at} = await open(t);
    const draft = session.draft, shown = draft.current.fingerprint;
    keyboard.hold(1 << 6);
    at(2000, () => {void send({type: "abortLiveEdit"});});
    await key(0, 10, "KC_X");
    assert.equal(keyboard.mutations.filter(request => request[2] === ABORT).length, 1, "the abort was sent");
    assert.equal(keyboard.working, null, "the keyboard runs what it ran");
    assert.equal(draft.history.length, 1);
    assert.equal(draft.current.fingerprint, shown);
    assert.equal(lastMessage(shell).notice, "Edit cancelled: the keyboard runs what it ran before.");
    assert.ok(shell.posted.some(message => message.type === "model" && /a modifier or one-shot/.test(message.model.liveWait?.detail || "")));
    keyboard.release();
    assert.equal(keyboard.events.filter(event => event === "published").length, 0);
    // Nothing is held now: Cancel edit says there is nothing to cancel.
    await send({type: "abortLiveEdit"});
    assert.match(lastMessage(shell).notice, /Nothing to cancel/);
});

test("a Revert held by a key waits for the release the same way, with no Cancel edit", async t => {
    const {keyboard, shell, key, send, at} = await open(t);
    await key(0, 10, "KC_X");
    keyboard.hold(1 << 4);
    at(8000, () => keyboard.release());
    await send({type: "revertProfileDraft"});
    assert.equal(keyboard.working, null);
    const waited = shell.posted.filter(message => message.type === "model" && message.model.liveWait).map(message => message.model.liveWait);
    assert.equal(waited[0].title, "Let go of the held keys to finish reverting");
    assert.match(waited[0].detail, /a locked layer or pointing mode/);
    assert.equal(waited[0].cancellable, false, "the keyboard refuses to abort its own Revert");
    assert.match(lastMessage(shell).notice, /^Reverted/);
});

test("in Live edit, a read that finds Ark's edit already saved by the keyboard confirms it too", async t => {
    // The keyboard saves by itself after two looks at its status.
    const {keyboard, shell, session, key} = await open(t, {mode: EDIT_MODE.LIVE, autoSaveAfterReads: 2});
    const draft = session.draft;
    keyboard.faults.lengthSkew = 1;
    await key(0, 4, "KC_Q");
    assert.equal(keyboard.working, null, "saved by the keyboard before Ark read it again");
    assert.equal(session.draft, draft);
    assert.equal(draft.history.length, 2, "the step is kept");
    assert.equal(draft.current.fingerprint, draft.base.fingerprint, "and is what the keyboard saved");
    assert.equal(layers(keyboard.saved)[0][4], layers(Buffer.from(draft.current.document.profile, "base64"))[0][4]);
    assert.ok(!notices(shell).some(notice => /not what Ark last saw|^Failed/.test(notice)));
});

// The tripwire after an edit (a length Ark did not expect) reads the
// keyboard again; finding exactly Ark's edit there, the edit landed.
test("a read after a failed answer that finds exactly Ark's edit confirms it, keeping the history", async t => {
    const {keyboard, shell, session, key} = await open(t);
    await key(0, 3, "KC_Z");
    const draft = session.draft;
    keyboard.faults.lengthSkew = 1;
    await key(0, 4, "KC_Q");
    assert.equal(session.draft, draft);
    assert.equal(draft.history.length, 3, "the step is kept");
    assert.equal(draft.cursor, 2);
    assert.equal(layers(keyboard.working)[0][4], layers(Buffer.from(draft.current.document.profile, "base64"))[0][4]);
    assert.ok(!notices(shell).some(notice => /not what Ark last saw|^Failed/.test(notice)));
    assert.ok(lastMessage(shell).acceptedEdit, "the form learns its edit was taken");
});

test("a refused edit is said, and the draft is read again from the keyboard", async t => {
    const {keyboard, shell, session, key} = await open(t);
    await key(0, 3, "KC_Z");
    keyboard.faults.refuse = EDIT_RESULT.VALIDATION_REJECTED;
    const before = session.draft.history.length, shown = session.draft.current.fingerprint;
    await key(0, 4, "KC_Q");
    assert.match(lastMessage(shell).notice, /checks refused/);
    assert.equal(session.draft.history.length, before, "read again, the keyboard is as the draft says, so its history stays");
    assert.equal(session.draft.dirty, true, "the earlier unsaved edit is still shown");
    assert.equal(session.draft.current.fingerprint, shown, "the refused edit is not shown as made");
});

test("a stale edit (another client, a key adjustment) is not sent, and the keyboard is read again as news, not a failure", async t => {
    const {keyboard, shell, session, key} = await open(t);
    const other = Buffer.from(document().profile, "base64");
    const changed = validateSnapshot(document()).layers; changed[2][0] = 0x04;
    keyboard.externalEdit(require("../../core/schema/profile-domains").replaceDomain(other, 0x60, () => require("../../core/schema/keymap-domain-v1").encodeKeymapDomain(changed)));
    await key(0, 5, "KC_W");
    assert.match(lastMessage(shell).notice, /^Not sent: the keyboard changed by itself/);
    assert.deepEqual(shell.errors, [], "no failure is raised");
    assert.equal(validateSnapshot(session.draft.current.document).layers[2][0], 0x04, "the other edit shows as unsaved");
});

test("Save asks for review, keeps a recovery copy of what was saved, and makes the working copy the saved profile", async t => {
    const {keyboard, shell, session, key, send} = await open(t);
    await key(0, 6, "KC_V");
    await send({type: "saveProfileDraft"});
    assert.match(lastMessage(shell).notice, /Review/);
    await send({type: "reviewProfileDraft"});
    await send({type: "saveProfileDraft"});
    assert.match(lastMessage(shell).notice, /Confirm them in the review/, "this profile's traps are asked about, as for Apply");
    await send({type: "saveProfileDraft", confirmChecks: true});
    assert.equal(keyboard.generation, 43);
    assert.equal(keyboard.working, null);
    assert.equal(shell.recoveries.length, 1);
    assert.equal(shell.recoveries[0].profile, document().profile, "the recovery copy is what was saved before");
    assert.deepEqual(shell.made, [{cause: "save", keyboard: lastModel(shell).device.label}], "named for the Save and this keyboard");
    assert.ok(shell.made[0].keyboard);
    assert.equal(session.draft.dirty, false);
    assert.equal(session.draft.live.unsaved, false);
    assert.match(lastMessage(shell).notice, /Saved on both halves/);
});

test("Revert puts the saved profile back; undo sends the edits again", async t => {
    const {keyboard, session, key, send} = await open(t);
    await key(0, 7, "KC_U");
    const edited = keyboard.working;
    await send({type: "revertProfileDraft"});
    assert.equal(keyboard.working, null);
    assert.equal(session.draft.dirty, false);
    assert.equal(session.draft.live.unsaved, false);
    await send({type: "undoProfileDraft"});
    assert.ok(keyboard.working.equals(edited));
});

test("reconnecting shows the unsaved edits; a replug shows them gone", async t => {
    const {keyboard, shell, loop, session, key} = await open(t);
    await key(0, 8, "KC_T");
    await loop.handleMessage({type: "refresh"});
    assert.equal(session.draft.dirty, true, "the same powered keyboard keeps its working copy");
    keyboard.replug();
    await loop.handleMessage({type: "refresh"});
    assert.equal(session.draft.dirty, false, "a replug boots the saved profile");
    assert.equal(session.draft.live.unsaved, false);
    assert.equal(lastModel(shell).draft.live.unsaved, false);
    assert.match(lastMessage(shell).notice, /restarted .* unsaved edits are gone/);
});

// The keyboard restarting during a Save (keyboard session, 2026-10-24): Ark
// can't tell whether it finished, keeps the edits as a recovery copy, and
// says what the next read shows became of them.
for (const [when, saves, moves] of /** @type {const} */ ([["before it saved", false, false], ["once it had saved", true, false],
    ["before it saved, back under a new device id", false, true]])) test(`a Save cut short ${when} says Ark can't tell, then what the read shows`, async t => {
    const {keyboard, shell, adapter, loop, send, key} = await open(t);
    await key(0, 6, "KC_V");
    const edits = Buffer.from(keyboard.working);
    await send({type: "reviewProfileDraft"});
    // The keyboard restarts under the Save, or just after it saved, and its
    // connection goes with it.
    const answer = keyboard.answer;
    let saving = false;
    const restart = () => {
        keyboard.answer = answer; keyboard.replug();
        queueMicrotask(() => {
            adapter.lastConnection().emitDisconnect(new Error("USB unplugged"));
            // A restarted keyboard may be listed under a new path; its serial number stays.
            if (moves) adapter.devices = [{id: "fake-charybdis-2", product: "Charybdis 4x6", manufacturer: "Bastard Keyboards", serialNumber: "FAKE-1"}];
        });
        return [];
    };
    keyboard.answer = report => {
        const save = report[0] === 0x07 && report[2] === EDIT_VALUE_SAVE;
        if (save && !saves) return restart();
        if (!save && saving) return restart();
        saving ||= save;
        return answer(report);
    };
    await send({type: "saveProfileDraft", confirmChecks: true});
    const failed = shell.posted.filter(message => message.type === "model" && message.failed).at(-1);
    assert.ok(failed, "the Save's failure is published as one");
    assert.match(failed.notice, /^Ark can't tell whether the save finished\. The keyboard was disconnected or restarted\. /);
    assert.doesNotMatch(failed.notice, /DevSrvsID|Device \S+ disconnected|Raw HID|fake-charybdis|Candidate|mutation|ambiguous|wait window|decision/);
    for (const sentence of failed.notice.split(/(?<=[.!?])\s+/)) assert.match(sentence, /^[A-Z(]/, sentence);
    // The recovery copy before Save is the saved profile; the Save cut short
    // keeps the edits too, which a restart may have lost.
    assert.deepEqual(shell.made.map(about => about.cause), ["save", "save"]);
    assert.equal(shell.recoveries[0].profile, document().profile);
    assert.equal(shell.recoveries[1].profile, edits.toString("base64"), "the second copy holds the edits");
    assert.match(failed.notice, /A recovery copy on Backups has your edits \(\/recovery\/2\.json\)\./);
    await loop.reconnected();
    const said = notices(shell).at(-1);
    if (saves) assert.match(said, /The save finished: the keyboard saved your edits\.$/);
    else assert.match(said, /The save did not finish, so the keyboard's unsaved edits are gone: it runs its saved profile again\. The recovery copy on Backups has them \(\/recovery\/2\.json\)\.$/);
    assert.doesNotMatch(said, /restarted since Ark last read it/, "the Save's result is said once, not beside the restart's");
    assert.equal(loop.session.saveCutShort, undefined, "said once");
});

test("leaving Live preview + save with unsaved edits asks Save or Revert first", async t => {
    const {keyboard, session, key, send, shell} = await open(t);
    await key(0, 9, "KC_S");
    await send({type: "setEditMode", mode: EDIT_MODE.APPLY});
    assert.match(lastMessage(shell).notice, /Save or Revert/);
    assert.equal(keyboard.mode, EDIT_MODE.LIVE_REVIEW);
    await send({type: "setEditMode", mode: EDIT_MODE.APPLY, pending: "revert"});
    assert.equal(keyboard.mode, EDIT_MODE.APPLY);
    assert.equal(keyboard.working, null);
    assert.equal(session.draft.live, null, "the draft is an Apply draft now");
    assert.equal(lastModel(shell).editMode.mode, EDIT_MODE.APPLY);
});

test("going from Review and save to Live preview + save with a draft asks to send it live or discard it", async t => {
    const {keyboard, session, key, send, shell} = await open(t, {mode: EDIT_MODE.APPLY});
    assert.equal(session.draft.live, null);
    await key(0, 11, "KC_R");
    assert.equal(keyboard.working, null, "Apply mode keeps edits in Ark's draft");
    assert.equal(session.draft.dirty, true);
    await send({type: "setEditMode", mode: EDIT_MODE.LIVE_REVIEW});
    assert.match(lastMessage(shell).notice, /send your draft|Send your draft/i);
    // The question shows the draft's traps and warnings; sending confirms them.
    await send({type: "setEditMode", mode: EDIT_MODE.LIVE_REVIEW, pending: "send"});
    assert.match(lastMessage(shell).notice, /Confirm them before sending/);
    assert.equal(keyboard.mode, EDIT_MODE.APPLY);
    await send({type: "setEditMode", mode: EDIT_MODE.LIVE_REVIEW, pending: "send", confirmChecks: true});
    assert.equal(keyboard.mode, EDIT_MODE.LIVE_REVIEW);
    assert.ok(session.draft.live);
    assert.ok(keyboard.working, "the draft runs on the keyboard, unsaved");
    assert.equal(layers(keyboard.working)[0].filter(code => code === 0x15).length >= 1, true);
    // The notice says both things, whole: the send publishes the model on
    // its way, which takes the mode's notice before the draft's is added.
    const said = shell.posted.filter(message => message.type === "model" && message.notice).map(message => message.notice);
    assert.ok(said.some(text => /^Now in Live preview \+ save: .* Your draft is running on the keyboard, unsaved\.$/.test(text)), said.join(" | "));
    assert.ok(said.every(text => !/undefined/.test(text)), said.join(" | "));
});

test("a toggle a key turned off is published beside the stored master, not as a change", async t => {
    const {shell, session} = await open(t, {combosOverride: false});
    assert.deepEqual(lastModel(shell).runtime, {combosOffByKey: true, behavioursOffByKey: false});
    assert.equal(session.draft.dirty, false);
});

test("a live draft out of step with the keyboard is read again, not rebased", async t => {
    const {shell, session, send} = await open(t);
    session.draft.needsRead = true;
    assert.equal(session.draft.stale, true);
    await send({type: "rebaseProfileDraft"});
    assert.equal(session.draft.stale, false);
    assert.match(lastMessage(shell).notice, /Read the keyboard again/);
});

test("a draft the keyboard refuses to take live is kept, and Ark stays in Apply", async t => {
    const {keyboard, session, key, send, shell} = await open(t, {mode: EDIT_MODE.APPLY});
    await key(0, 11, "KC_R");
    const changes = session.draft.view({}).changes.length;
    keyboard.faults.refuse = EDIT_RESULT.VALIDATION_REJECTED;
    await send({type: "setEditMode", mode: EDIT_MODE.LIVE_REVIEW, pending: "send", confirmChecks: true});
    assert.match(lastMessage(shell).notice, /not sent.*your draft is kept/is);
    assert.equal(keyboard.mode, EDIT_MODE.APPLY);
    assert.equal(keyboard.working, null);
    assert.equal(session.draft.live, null);
    assert.equal(session.draft.dirty, true);
    assert.equal(session.draft.view({}).changes.length, changes);
});

// A new name takes effect by one USB restart (firmware D-F25), after which
// the shell lists the keyboard as a new device. It is the same keyboard on the
// same boot, running the same working copy: the draft follows it, keeping its
// history, and the rename can be saved or reverted. Seen on the keyboard on
// 2026-10-19: the draft stayed with the old device ("belongs to another
// keyboard") and Save and Revert were gone.
for (const mode of [EDIT_MODE.LIVE_REVIEW, EDIT_MODE.LIVE]) test(`a live rename (${mode === EDIT_MODE.LIVE ? "Live edit" : "Live preview + save"}) restarts USB and the draft follows the same keyboard back`, async t => {
    const {keyboard, shell, adapter, loop, send, key} = await open(t, {mode});
    await key(0, 10, "KC_X");
    await send({type: "renameKeyboard", name: "Desk"});
    const draft = loop.session.draft, history = draft.history.length;
    assert.ok(loop.session.reconnect, "Ark expects the restart the new name causes");
    adapter.lastConnection().emitDisconnect(new Error("USB restarted."));
    adapter.devices = [{id: "fake-charybdis-2", product: "Desk", manufacturer: "Bastard Keyboards", serialNumber: "FAKE-1"}];
    loop.serviceChanged();
    await loop.reconnected();
    const published = lastMessage(shell);
    assert.equal(loop.session.draft, draft, "the same draft");
    assert.equal(draft.history.length, history, "with its history");
    assert.equal(published.model.draft.matching, true, "it belongs to the keyboard Ark is connected to");
    assert.equal(published.model.draft.stale, false);
    assert.equal(published.model.draft.live.unsaved, true);
    assert.match(published.notice ?? notices(shell).at(-1), /back as “Desk”/);
    if (mode === EDIT_MODE.LIVE_REVIEW) {
        await send({type: "reviewProfileDraft"});
        await send({type: "saveProfileDraft", confirmChecks: true});
        assert.equal(keyboard.working, null, "the rename was saved");
    } else {
        keyboard.autoSave();
        await loop.handleMessage({type: "refresh"});
        assert.equal(loop.session.draft.live.unsaved, false, "the keyboard's own save is seen");
    }
});

// In Live edit a rename restarts USB about 1.5 s after the edit, before the
// keyboard's own save 3 s after it, so the follow-back read runs while that
// save lands: the saved profile moves on (and, to a shorter name, gets
// shorter) under the read. Seen on the keyboard twice out of twice on
// 2026-10-24: "Chunk 258 returned 1 bytes where 3 were expected", or "The
// keyboard's profile changed while it was being read", and then a panel left
// with unsaved edits until Read keyboard.
/** @param {import("node:test").TestContext} t */
async function renamedInLive(t) {
    const {editKeyboardName} = require("../../core/model/keyboard-name");
    const {fingerprint} = require("../../core/model/portable-profile");
    const plain = document(), print = fingerprint(plain);
    const named = editKeyboardName({document: plain, fingerprint: print}, {name: "Charybdis on the desk", expectedFingerprint: print});
    const opened = await openLoop(t, {keyboard: liveKeyboard({document: named, mode: EDIT_MODE.LIVE})});
    const {keyboard, adapter, loop} = opened;
    keyboard.firstDeviceId = loop.session.draft.deviceId;
    await opened.send({type: "renameKeyboard", name: "Desk"});
    assert.ok(loop.session.reconnect, "Ark expects the restart the new name causes");
    assert.ok(keyboard.working && keyboard.working.length < keyboard.saved.length, "the new name is shorter");
    const comeBack = async () => {
        adapter.lastConnection().emitDisconnect(new Error("USB restarted."));
        adapter.devices = [{id: "fake-charybdis-2", product: "Desk", manufacturer: "Bastard Keyboards", serialNumber: "FAKE-1"}];
        loop.serviceChanged();
        await loop.reconnected();
    };
    return {...opened, comeBack};
}

/** @param {any} published @param {any} keyboard @param {any} session */
function inStep(published, keyboard, session) {
    assert.equal(published.model.draft.matching, true, "the draft is the keyboard's");
    assert.equal(published.model.draft.stale, false);
    assert.equal(published.model.draft.live.unsaved, false, "nothing unsaved: the keyboard saved the name");
    assert.equal(session.draft.dirty, false);
    assert.equal(session.draft.live.savedGeneration, keyboard.generation);
    const selected = session.service.snapshot().selectedDeviceId;
    assert.equal(session.draft.deviceId, selected, "under its new device id");
    assert.notEqual(selected, keyboard.firstDeviceId);
}

for (const during of [0x04, 0x21]) test(`a Live edit rename's follow-back read with the keyboard's own save landing during its ${during === 0x04 ? "saved profile" : "working copy"} is read again`, async t => {
    const {keyboard, shell, loop, comeBack} = await renamedInLive(t);
    const answer = keyboard.answer, pages = Math.ceil(keyboard.saved.length / 25);
    let landed = false;
    keyboard.answer = report => {
        // Near the end of the saved profile, so what follows no longer fits it.
        const page = report[4] | report[5] << 8, at = during === 0x04 ? pages - 1 : 3;
        if (!landed && loop.session.reconnect?.dropped && report[0] === 0x08 && report[2] === during && page === at) {landed = true; keyboard.autoSave();}
        return answer(report);
    };
    await comeBack();
    assert.ok(landed, "the save landed during the read");
    const published = lastMessage(shell);
    inStep(published, keyboard, loop.session);
    const said = notices(shell).at(-1);
    assert.match(said, /back as “Desk”/);
    assert.doesNotMatch(said, /could not be read|failed|Chunk/);
});

// A follow-back read the keyboard keeps moving under is said to have failed,
// and the live watch takes over: the same keyboard, by its edit session,
// under its new device id, read again within the watch's bound. The read is
// three tries, read again while the wait for the keyboard to start lasts
// (readOnceStarted, keyboard-starting.js): each read takes about 3 s on the
// clock, at 2 ms a report, so five fit in STARTING.WAIT_MS and one more
// follows as it ends.
const REPORT_MS = 2;
for (const settles of [true, false]) test(`after a failed follow-back read the live watch ${settles ? "follows the keyboard and reads it again" : "keeps its bounded retry"}`, async t => {
    const {keyboard, shell, loop, clock, comeBack, look} = await renamedInLive(t);
    const answer = keyboard.answer;
    let racing = true;
    // Each try of a live read reads what the keyboard runs, page 0 before
    // and after its bytes.
    const tries = () => keyboard.requests.filter(r => r[0] === 0x08 && r[2] === 0x21 && (r[4] | r[5] << 8) === 0).length / 2;
    keyboard.answer = report => {
        clock.pass(REPORT_MS);
        // Each try of the read moves under it once it has read the working
        // copy, as the keyboard's own keys would.
        if (racing && loop.session.reconnect?.dropped !== false && report[0] === 0x08 && report[2] === 0x06 && (report[4] | report[5] << 8) === 0) {
            keyboard.externalEdit(keyboard.working ?? keyboard.saved);
        }
        return answer(report);
    };
    keyboard.requests.length = 0;
    const since = clock.now();
    await comeBack();
    assert.equal(tries(), 6 * 3, "six reads of three tries each");
    assert.ok(clock.now() - since >= STARTING.WAIT_MS, "read again until the wait's bound");
    assert.match(notices(shell).at(-1), /reading it again failed/, "the follow-back says its read failed");
    assert.doesNotMatch(notices(shell).at(-1), /back as|Chunk|could not be read:/);
    assert.equal(loop.session.draft.stale, true);
    if (settles) {
        racing = false;
        assert.equal(keyboard.autoSave(), true, "the keyboard saves the name by itself");
        assert.equal(await look(), true, "the watch takes over");
        inStep(lastMessage(shell), keyboard, loop.session);
        assert.match(notices(shell).at(-1), /read the keyboard again now that it is back/);
        return;
    }
    // A keyboard that restarted meanwhile (or another one) is not followed:
    // one look at its status ends the retry.
    if (!settles) {
        const retry = loop.session.liveReadRetry;
        loop.session.draft.live.session ^= 1;
        assert.equal(await look(), false);
        assert.equal(loop.session.liveReadRetry, undefined, "left to the person");
        loop.session.draft.live.session ^= 1;
        loop.session.liveReadRetry = retry;
    }
    keyboard.requests.length = 0;
    for (let poll = 0; poll < 6; poll++) await look();
    // The follow-back's read was the first of three failed reads the draft
    // gets: the watch reads twice more, three tries each.
    assert.equal(tries(), 6, "two looks of three tries each, then Read keyboard is the person's");
    assert.equal(loop.session.draft.stale, true);
});

test("a reconnect to the same running keyboard keeps the undo history", async t => {
    const {keyboard, session, key, send, loop} = await open(t);
    await key(0, 12, "KC_E");
    await key(0, 13, "KC_D");
    const draft = session.draft, length = draft.history.length;
    await loop.session.service.disconnect();
    await loop.handleMessage({type: "refresh"});
    assert.equal(session.draft, draft);
    assert.equal(draft.history.length, length, "the keyboard vouches for the same session and revision");
    assert.equal(draft.stale, false);
    await send({type: "undoProfileDraft"});
    assert.equal(draft.cursor, length - 2);
    assert.equal(layers(keyboard.working)[0][13], 0, "undo still reaches the keyboard");
});

test("a working copy changed without Ark is said, and the draft starts again from it", async t => {
    const {keyboard, session, key, loop, shell} = await open(t);
    await key(0, 14, "KC_F");
    const edited = validateSnapshot({...document(), profile: keyboard.working.toString("base64")}).layers; edited[3][3] = 0x04;
    keyboard.externalEdit(require("../../core/schema/profile-domains").replaceDomain(keyboard.working, 0x60, () => require("../../core/schema/keymap-domain-v1").encodeKeymapDomain(edited)));
    await loop.handleMessage({type: "refresh"});
    assert.match(lastMessage(shell).notice, /not what Ark last saw/);
    assert.equal(session.draft.history.length, 1);
});

test("halves apart: the rail and commit bar offer Revert, Save says why", async t => {
    const {keyboard, session, key, send, shell} = await open(t);
    keyboard.faults.slaveRefuses = 2;
    await key(0, 15, "KC_G");
    assert.match(lastMessage(shell).notice, /slave half refused this edit/);
    assert.equal(lastModel(shell).draft.live.slaveRefused, true);
    await send({type: "reviewProfileDraft"});
    await send({type: "saveProfileDraft", confirmChecks: true});
    assert.match(lastMessage(shell).notice, /halves run different profiles.*Revert/);
    assert.equal(keyboard.generation, 42, "nothing saved");
    await send({type: "revertProfileDraft"});
    assert.equal(session.draft.live.slaveRefused, false);
    assert.equal(keyboard.slaveRefused, false);
});

test("choosing the same mode again settles halves that stored different modes", async t => {
    const {keyboard, send, shell, loop} = await open(t);
    keyboard.modeConflict = true;
    await loop.handleMessage({type: "refresh"});
    assert.equal(lastModel(shell).editMode.conflict, true);
    await send({type: "setEditMode", mode: EDIT_MODE.LIVE_REVIEW});
    assert.ok(keyboard.events.includes("mode 2"));
    assert.equal(keyboard.modeConflict, false);
    assert.match(lastMessage(shell).notice, /same edit mode/);
});

test("in Apply a toggle a key turned off is shown too", async t => {
    const {shell} = await open(t, {mode: EDIT_MODE.APPLY, combosOverride: false});
    assert.deepEqual(lastModel(shell).runtime, {combosOffByKey: true, behavioursOffByKey: false});
});

test("Live preview + save into Live edit with unsaved edits asks Save or Revert first, as the keyboard refuses the change otherwise", async t => {
    const {keyboard, session, key, send, shell} = await open(t);
    await key(0, 17, "KC_Q");
    await send({type: "setEditMode", mode: EDIT_MODE.LIVE});
    assert.match(lastMessage(shell).notice, /Save or Revert .* before switching to Live/);
    assert.equal(keyboard.mode, EDIT_MODE.LIVE_REVIEW);
    await send({type: "setEditMode", mode: EDIT_MODE.LIVE, pending: "save", confirmChecks: true});
    assert.equal(keyboard.mode, EDIT_MODE.LIVE);
    assert.equal(keyboard.working, null, "saved first");
    assert.equal(shell.recoveries.length, 1);
    assert.equal(session.draft.live.mode, EDIT_MODE.LIVE);
    assert.match(lastMessage(shell).notice, /saves them by itself/);
});

test("Live edit's words say the quiet interval the keyboard reports", async t => {
    const {session, key, send, shell} = await open(t, {mode: EDIT_MODE.LIVE, quietMs: 5000});
    assert.equal(session.draft.live.keyboard.quietMs, 5000);
    assert.equal(lastModel(shell).draft.live.keyboard.quietWords, "5 seconds", "core words it for the interface");
    await key(0, 17, "KC_Q");
    const published = lastModel(shell);
    assert.match(published.vocabulary.editModes[EDIT_MODE.LIVE].detail, /after 5 seconds with no edit/);
    assert.match(published.device.subtitle, /after 5 seconds without typing/);
    await send({type: "saveProfileDraft"});
    assert.match(lastMessage(shell).notice, /after 5 seconds with no edit and no key held/, "Save's refusal");
    await send({type: "revertProfileDraft"});
    await send({type: "setEditMode", mode: EDIT_MODE.LIVE_REVIEW});
    await send({type: "setEditMode", mode: EDIT_MODE.LIVE});
    assert.match(lastMessage(shell).notice, /saves them by itself after 5 seconds/, "the switch's notice");
    for (const words of [JSON.stringify(lastModel(shell).vocabulary.editModes), lastMessage(shell).notice]) assert.doesNotMatch(words, /3 seconds/);
});

test("Review and save into Live edit with a draft asks to send it live or discard it", async t => {
    const {keyboard, session, key, send, shell} = await open(t, {mode: EDIT_MODE.APPLY});
    await key(0, 18, "KC_P");
    await send({type: "setEditMode", mode: EDIT_MODE.LIVE});
    assert.match(lastMessage(shell).notice, /before switching to Live/);
    await send({type: "setEditMode", mode: EDIT_MODE.LIVE, pending: "discard"});
    assert.equal(keyboard.mode, EDIT_MODE.LIVE);
    assert.equal(keyboard.working, null, "discarded, nothing sent");
    assert.equal(session.draft.dirty, false);
});

test("leaving Live edit has the keyboard save what it has not saved yet, with no question, then switches", async t => {
    const {keyboard, session, key, send, shell} = await open(t, {mode: EDIT_MODE.LIVE});
    await key(0, 19, "KC_O");
    assert.ok(keyboard.working);
    await send({type: "setEditMode", mode: EDIT_MODE.LIVE_REVIEW});
    assert.equal(keyboard.events.at(-2), "saved", "saved before the mode changed");
    assert.equal(keyboard.events.at(-1), `mode ${EDIT_MODE.LIVE_REVIEW}`);
    assert.equal(keyboard.mode, EDIT_MODE.LIVE_REVIEW);
    assert.equal(session.draft.dirty, false);
    assert.deepEqual(shell.errors, []);
    await key(0, 20, "KC_N");
    assert.ok(keyboard.working, "Live preview + save edits run unsaved");
});

test("leaving Live edit waits for a save of the keyboard's own; when it cannot save, the mode stays and says why", async t => {
    const {keyboard, session, key, send, shell} = await open(t, {mode: EDIT_MODE.LIVE});
    await key(0, 21, "KC_M");
    keyboard.raised.slaveRefused = true;
    await send({type: "setEditMode", mode: EDIT_MODE.APPLY});
    assert.match(lastMessage(shell).notice, /slave half refused .* Revert/);
    assert.equal(keyboard.mode, EDIT_MODE.LIVE, "the mode is unchanged");
    assert.equal(session.draft.live.mode, EDIT_MODE.LIVE);
    keyboard.raised.slaveRefused = false;
    keyboard.autoSave();
    await send({type: "setEditMode", mode: EDIT_MODE.APPLY});
    assert.equal(keyboard.mode, EDIT_MODE.APPLY, "nothing left to save: it switches at once");
    assert.equal(keyboard.events.filter(event => event === "saved").length, 0, "the keyboard's own save was enough");
});

test("closing Ark loses a Review and save draft or unsaved Live preview + save edits, but nothing in Live edit unless an edit is on its way", () => {
    const {closingLoses} = require("../../core/session/live-edits");
    assert.equal(closingLoses({draft: undefined}), false);
    assert.equal(closingLoses({draft: /** @type {any} */ ({live: null, dirty: true})}), true);
    assert.equal(closingLoses({draft: /** @type {any} */ ({live: {mode: EDIT_MODE.LIVE_REVIEW, unsaved: true}, dirty: true})}), true);
    assert.equal(closingLoses({draft: /** @type {any} */ ({live: {mode: EDIT_MODE.LIVE, unsaved: true}, dirty: true}), service: {phase: "live-edit", busy: false}}), false, "the last edit finished");
    assert.equal(closingLoses({draft: /** @type {any} */ ({live: {mode: EDIT_MODE.LIVE, unsaved: true}, dirty: true}), service: {phase: "live-edit", busy: true}}), true);
});


test("Revert rereads the saved profile when another client saved the same working revision", async t => {
    const {keyboard, session, key, send, shell} = await open(t);
    await key(0, 7, "KC_U");
    const edited = keyboard.working;
    const {buildSaveRequest} = require("../../core/protocol/profile-edit-v1");
    keyboard.answer(buildSaveRequest(900, {session: keyboard.session, revision: keyboard.revision}));
    assert.ok(keyboard.saved.equals(edited));
    assert.notEqual(session.draft.live.savedGeneration, keyboard.generation);
    await send({type: "revertProfileDraft"});
    assert.ok(session.draft.current.document.profile === keyboard.saved.toString("base64"), "the shown profile must be the one the keyboard runs");
    assert.equal(session.draft.completeBase.document.profile, keyboard.saved.toString("base64"));
    assert.equal(session.draft.live.savedGeneration, keyboard.generation);
    assert.equal(session.draft.live.unsaved, false);
    assert.equal(session.draft.dirty, false);
    assert.doesNotMatch(lastMessage(shell).notice, /Undo .* sends the edits back/);
});

test("Send live keeps the original Review and save draft when a stale send also prevents switching back", async t => {
    const {keyboard, session, key, send, shell, loop} = await open(t, {mode: EDIT_MODE.APPLY});
    await key(0, 11, "KC_R");
    const kept = session.draft, target = kept.current.document.profile, history = kept.history;
    const answer = keyboard.answer;
    let raced = false;
    keyboard.answer = report => {
        if (!raced && report[0] === 0x07 && report[2] === 0x20) {
            raced = true;
            const changed = validateSnapshot(document()).layers; changed[2][0] = 0x04;
            keyboard.externalEdit(require("../../core/schema/profile-domains").replaceDomain(keyboard.saved, 0x60, () => require("../../core/schema/keymap-domain-v1").encodeKeymapDomain(changed)));
        }
        return answer(report);
    };
    await send({type: "setEditMode", mode: EDIT_MODE.LIVE_REVIEW, pending: "send", confirmChecks: true});
    assert.ok(raced);
    assert.equal(keyboard.mode, EDIT_MODE.LIVE_REVIEW, "the unsaved external edit refuses the return to Apply");
    assert.equal(session.draft, kept, "keep the very same Apply draft even if rollback fails");
    assert.equal(kept.current.document.profile, target);
    assert.equal(kept.history, history);
    assert.equal(kept.live, null);
    assert.equal(kept.needsRead, true, "the kept draft must not post against the live keyboard");
    assert.match(lastMessage(shell).notice, /not sent.*draft is kept/is);
    assert.doesNotMatch(lastMessage(shell).notice, /draft is running/);
    await loop.handleMessage({type: "refresh"});
    assert.equal(session.draft, kept, "later observations keep the Apply edits too");
    assert.equal(kept.current.document.profile, target);
});


test("Revert after an unobserved automatic save shows the keyboard's actual saved profile", async t => {
    const {keyboard, session, key, send} = await open(t, {mode: EDIT_MODE.LIVE});
    await key(0, 7, "KC_U");
    assert.equal(keyboard.autoSave(), true);
    await send({type: "revertProfileDraft"});
    assert.ok(session.draft.current.document.profile === keyboard.saved.toString("base64"));
    assert.equal(session.draft.live.savedGeneration, keyboard.generation);
    assert.equal(session.draft.live.unsaved, false);
    const {checkLive} = require("../../core/session/live-watch");
    await checkLive(session);
    assert.ok(session.draft.current.document.profile === keyboard.saved.toString("base64"), "polling keeps the actual profile");
});

test("leaving Live edit stops before Save or mode change if its recovery copy is unavailable", async t => {
    const {keyboard, session, key, send, shell} = await open(t, {mode: EDIT_MODE.LIVE});
    await key(0, 19, "KC_O");
    const working = keyboard.working;
    shell.saveRecovery = async () => undefined;
    await send({type: "setEditMode", mode: EDIT_MODE.APPLY});
    assert.match(lastMessage(shell).notice, /recovery copy could not be saved/i);
    assert.equal(keyboard.mode, EDIT_MODE.LIVE);
    assert.ok(keyboard.working.equals(working));
    assert.equal(keyboard.mutations.filter(report => report[2] === 0x25).length, 0);
    assert.equal(session.draft.live.unsaved, true);
});

test("leaving Live edit recovers the actual saved profile after an unobserved save", async t => {
    const {keyboard, key, send, shell} = await open(t, {mode: EDIT_MODE.LIVE});
    await key(0, 19, "KC_O");
    keyboard.autoSave();
    const saved = keyboard.saved.toString("base64");
    keyboard.externalEdit(Buffer.from(document().profile, "base64"));
    let savesAtRecovery = -1;
    const recover = shell.saveRecovery;
    shell.saveRecovery = async (doc, about) => {
        savesAtRecovery = keyboard.mutations.filter(report => report[2] === 0x25).length;
        return recover(doc, about);
    };
    await send({type: "setEditMode", mode: EDIT_MODE.APPLY});
    assert.equal(keyboard.mode, EDIT_MODE.APPLY);
    assert.equal(shell.recoveries.length, 1);
    assert.equal(shell.recoveries[0].profile, saved);
    assert.equal(shell.made[0].cause, "leave-live", "named for leaving Live edit");
    assert.equal(savesAtRecovery, 0, "recovery precedes the explicit Save");
});


test("a save during recovery refreshes the recovery copy before the flush writes again", async t => {
    const {keyboard, key, send, shell} = await open(t, {mode: EDIT_MODE.LIVE});
    await key(0, 19, "KC_O");
    const nextSaved = keyboard.working.toString("base64");
    const recover = shell.saveRecovery;
    shell.saveRecovery = async (doc, about) => {
        const result = await recover(doc, about);
        if (shell.recoveries.length === 1) {
            keyboard.autoSave();
            keyboard.externalEdit(Buffer.from(document().profile, "base64"));
        }
        return result;
    };
    await send({type: "setEditMode", mode: EDIT_MODE.APPLY});
    assert.equal(keyboard.mode, EDIT_MODE.APPLY);
    assert.equal(shell.recoveries.length, 2);
    assert.equal(shell.recoveries[1].profile, nextSaved);
    assert.equal(keyboard.events.filter(event => event === "saved").length, 1);
});
