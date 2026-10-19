"use strict";
// Live + review through the panel loop both hosts run: edits, undo, the trap
// check, Save, Revert, reconnect and replug, and the mode switch, against a
// keyboard with a working copy (firmware D-F32).
const assert = require("node:assert/strict");
const test = require("node:test");
const {openPanelLoop} = require("../../core/session/panel-loop");
const {fakeKeyboardAdapter} = require("../fixtures/fake-keyboard");
const {liveKeyboard} = require("../fixtures/live-keyboard");
const {document} = require("../fixtures/portable-profile");
const {validateSnapshot} = require("../../core/model/portable-profile");
const {EDIT_MODE, EDIT_RESULT} = require("../../core/protocol/profile-edit-v1");

function fakeHost() {
    const host = {
        posted: [], errors: [], recoveries: [],
        post: (message) => {host.posted.push(message);},
        showError: (text) => {host.errors.push(text);},
        saveRecovery: async (doc) => {host.recoveries.push(doc); return `/recovery/${host.recoveries.length}.json`;},
        saveExport: async () => undefined,
    };
    return host;
}
const model = host => host.posted.filter(message => message.type === "model").at(-1);

/** @param {import("node:test").TestContext} t @param {object} [options] */
async function open(t, options = {}) {
    const keyboard = liveKeyboard({document: document(), ...options});
    const host = fakeHost();
    const loop = openPanelLoop(host, {adapter: fakeKeyboardAdapter({keyboard}), defaultTimeoutMs: 300, sleep: async () => {}});
    t.after(() => loop.close());
    await loop.handleMessage({type: "refresh"});
    /** @param {object} message */
    const send = message => loop.handleMessage({draftId: loop.session.draft?.id, draftRevision: loop.session.draft?.revision, ...message});
    /** @param {number} layer @param {number} layoutIndex @param {string} keycode */
    const key = (layer, layoutIndex, keycode) => send({type: "updateLayoutKeys", layer: `Layer ${layer}`, changes: [{layoutIndex, keycode}]});
    return {keyboard, host, loop, send, key, session: loop.session};
}
/** @param {Buffer | null} bytes */
const layers = bytes => validateSnapshot({format: "charybdis-profile", version: 5, keyboard: "charybdis-4x6", actionAbiDigest: document().actionAbiDigest, profile: /** @type {Buffer} */ (bytes).toString("base64")}).layers;

test("a keyboard in Live + review opens a live draft, and every posted edit reaches the keyboard at once", async t => {
    const {keyboard, host, session, key} = await open(t);
    const draft = session.draft;
    assert.ok(draft.live, "the draft is the keyboard's working copy");
    assert.equal(model(host).model.editMode.mode, EDIT_MODE.LIVE_REVIEW);
    assert.equal(draft.dirty, false);
    await key(0, 10, "KC_X");
    assert.ok(keyboard.working, "the keyboard runs the edit");
    assert.equal(keyboard.events.filter(event => event === "published").length, 1);
    assert.equal(draft.dirty, true, "review compares the working copy with the saved profile");
    assert.equal(draft.view({}).changes.length, 1);
    assert.equal(draft.history.length, 2);
    const published = model(host);
    assert.ok(published.acceptedEdit, "the form learns its edit was taken");
    assert.equal(published.model.draft.live.unsaved, true);
    assert.equal(published.model.draft.live.converged, true);
    assert.ok(keyboard.saved.equals(Buffer.from(document().profile, "base64")), "nothing is saved until Save");
});

test("undo and redo send the inverse edit through the same path", async t => {
    const {keyboard, session, key, send} = await open(t);
    await key(0, 12, "KC_Y");
    const edited = keyboard.working;
    await send({type: "undoProfileDraft"});
    assert.equal(session.draft.cursor, 0);
    assert.notDeepEqual(keyboard.working, edited, "undo changed the keyboard back");
    assert.deepEqual(layers(keyboard.working)[0], layers(keyboard.saved)[0]);
    assert.equal(keyboard.working !== null, true, "an undone edit is still an unsaved change to the keyboard");
    await send({type: "redoProfileDraft"});
    assert.ok(keyboard.working.equals(edited));
    assert.equal(keyboard.events.filter(event => event === "published").length, 3);
});

test("an edit that adds a trap waits for the person; cancelling sends nothing, confirming sends it", async t => {
    const {keyboard, host, session, key, send} = await open(t);
    const published = keyboard.events.filter(event => event === "published").length;
    // Layer 2 has no way back once toggled on.
    await key(0, 20, "TG(2)");
    const proposal = model(host).model.liveProposal;
    assert.ok(proposal, "the trap is asked about before anything is sent");
    assert.ok(proposal.checks.some(check => check.level === "trap"));
    assert.equal(keyboard.events.filter(event => event === "published").length, published);
    await send({type: "cancelLiveEdit", proposal: proposal.id});
    assert.equal(model(host).model.liveProposal, null);
    assert.equal(model(host).resetDraftForms, true, "the form goes back to what the keyboard runs");
    await key(0, 20, "TG(2)");
    await send({type: "confirmLiveEdit", proposal: model(host).model.liveProposal.id});
    assert.equal(keyboard.events.filter(event => event === "published").length, published + 1);
    assert.equal(model(host).model.liveProposal, null);
    assert.equal(session.draft.history.length, 2);
});

test("a refused edit is said, and the draft is read again from the keyboard", async t => {
    const {keyboard, host, session, key} = await open(t);
    await key(0, 3, "KC_Z");
    keyboard.faults.refuse = EDIT_RESULT.VALIDATION_REJECTED;
    const before = session.draft.history.length, shown = session.draft.current.fingerprint;
    await key(0, 4, "KC_Q");
    assert.match(model(host).notice, /checks refused/);
    assert.equal(session.draft.history.length, before, "read again, the keyboard is as the draft says, so its history stays");
    assert.equal(session.draft.dirty, true, "the earlier unsaved edit is still shown");
    assert.equal(session.draft.current.fingerprint, shown, "the refused edit is not shown as made");
});

test("a stale edit (another client, a key adjustment) is refused and the keyboard read again", async t => {
    const {keyboard, host, session, key} = await open(t);
    const other = Buffer.from(document().profile, "base64");
    const changed = validateSnapshot(document()).layers; changed[2][0] = 0x04;
    keyboard.externalEdit(require("../../core/schema/profile-domains").replaceDomain(other, 0x60, () => require("../../core/schema/keymap-domain-v1").encodeKeymapDomain(changed)));
    await key(0, 5, "KC_W");
    assert.match(model(host).notice, /changed since Ark last read it/);
    assert.equal(validateSnapshot(session.draft.current.document).layers[2][0], 0x04, "the other edit shows as unsaved");
});

test("Save asks for review, keeps a recovery copy of what was saved, and makes the working copy the saved profile", async t => {
    const {keyboard, host, session, key, send} = await open(t);
    await key(0, 6, "KC_V");
    await send({type: "saveProfileDraft"});
    assert.match(model(host).notice, /Review/);
    await send({type: "reviewProfileDraft"});
    await send({type: "saveProfileDraft"});
    assert.match(model(host).notice, /Confirm them in the review/, "this profile's traps are asked about, as for Apply");
    await send({type: "saveProfileDraft", confirmChecks: true});
    assert.equal(keyboard.generation, 43);
    assert.equal(keyboard.working, null);
    assert.equal(host.recoveries.length, 1);
    assert.equal(host.recoveries[0].profile, document().profile, "the recovery copy is what was saved before");
    assert.equal(session.draft.dirty, false);
    assert.equal(session.draft.live.unsaved, false);
    assert.match(model(host).notice, /Saved on both halves/);
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
    const {keyboard, host, loop, session, key} = await open(t);
    await key(0, 8, "KC_T");
    await loop.handleMessage({type: "refresh"});
    assert.equal(session.draft.dirty, true, "the same powered keyboard keeps its working copy");
    keyboard.replug();
    await loop.handleMessage({type: "refresh"});
    assert.equal(session.draft.dirty, false, "a replug boots the saved profile");
    assert.equal(session.draft.live.unsaved, false);
    assert.equal(model(host).model.draft.live.unsaved, false);
    assert.match(model(host).notice, /restarted .* unsaved edits are gone/);
});

test("leaving Live + review with unsaved edits asks Save or Revert first", async t => {
    const {keyboard, session, key, send, host} = await open(t);
    await key(0, 9, "KC_S");
    await send({type: "setEditMode", mode: EDIT_MODE.APPLY});
    assert.match(model(host).notice, /Save or Revert/);
    assert.equal(keyboard.mode, EDIT_MODE.LIVE_REVIEW);
    await send({type: "setEditMode", mode: EDIT_MODE.APPLY, pending: "revert"});
    assert.equal(keyboard.mode, EDIT_MODE.APPLY);
    assert.equal(keyboard.working, null);
    assert.equal(session.draft.live, null, "the draft is an Apply draft now");
    assert.equal(model(host).model.editMode.mode, EDIT_MODE.APPLY);
});

test("going from Apply to Live + review with a draft asks to send it live or discard it", async t => {
    const {keyboard, session, key, send, host} = await open(t, {mode: EDIT_MODE.APPLY});
    assert.equal(session.draft.live, null);
    await key(0, 11, "KC_R");
    assert.equal(keyboard.working, null, "Apply mode keeps edits in Ark's draft");
    assert.equal(session.draft.dirty, true);
    await send({type: "setEditMode", mode: EDIT_MODE.LIVE_REVIEW});
    assert.match(model(host).notice, /send your draft|Send your draft/i);
    // The question shows the draft's traps and warnings; sending confirms them.
    await send({type: "setEditMode", mode: EDIT_MODE.LIVE_REVIEW, pending: "send"});
    assert.match(model(host).notice, /Confirm them before sending/);
    assert.equal(keyboard.mode, EDIT_MODE.APPLY);
    await send({type: "setEditMode", mode: EDIT_MODE.LIVE_REVIEW, pending: "send", confirmChecks: true});
    assert.equal(keyboard.mode, EDIT_MODE.LIVE_REVIEW);
    assert.ok(session.draft.live);
    assert.ok(keyboard.working, "the draft runs on the keyboard, unsaved");
    assert.equal(layers(keyboard.working)[0].filter(code => code === 0x15).length >= 1, true);
});

test("a toggle a key turned off is published beside the stored master, not as a change", async t => {
    const {host, session} = await open(t, {combosOverride: false});
    assert.deepEqual(model(host).model.runtime, {combosOffByKey: true, behavioursOffByKey: false});
    assert.equal(session.draft.dirty, false);
});

test("a live draft out of step with the keyboard is read again, not rebased", async t => {
    const {host, session, send} = await open(t);
    session.draft.needsRead = true;
    assert.equal(session.draft.stale, true);
    await send({type: "rebaseProfileDraft"});
    assert.equal(session.draft.stale, false);
    assert.match(model(host).notice, /Read the keyboard again/);
});

test("a draft the keyboard refuses to take live is kept, and Ark stays in Apply", async t => {
    const {keyboard, session, key, send, host} = await open(t, {mode: EDIT_MODE.APPLY});
    await key(0, 11, "KC_R");
    const changes = session.draft.view({}).changes.length;
    keyboard.faults.refuse = EDIT_RESULT.VALIDATION_REJECTED;
    await send({type: "setEditMode", mode: EDIT_MODE.LIVE_REVIEW, pending: "send", confirmChecks: true});
    assert.match(model(host).notice, /not sent.*your draft is kept/is);
    assert.equal(keyboard.mode, EDIT_MODE.APPLY);
    assert.equal(keyboard.working, null);
    assert.equal(session.draft.live, null);
    assert.equal(session.draft.dirty, true);
    assert.equal(session.draft.view({}).changes.length, changes);
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
    const {keyboard, session, key, loop, host} = await open(t);
    await key(0, 14, "KC_F");
    const edited = validateSnapshot({...document(), profile: keyboard.working.toString("base64")}).layers; edited[3][3] = 0x04;
    keyboard.externalEdit(require("../../core/schema/profile-domains").replaceDomain(keyboard.working, 0x60, () => require("../../core/schema/keymap-domain-v1").encodeKeymapDomain(edited)));
    await loop.handleMessage({type: "refresh"});
    assert.match(model(host).notice, /not what Ark last saw/);
    assert.equal(session.draft.history.length, 1);
});

test("halves apart: the rail and commit bar offer Revert, Save says why", async t => {
    const {keyboard, session, key, send, host} = await open(t);
    keyboard.faults.peerRefuses = 2;
    await key(0, 15, "KC_G");
    assert.match(model(host).notice, /slave half refused this edit/);
    assert.equal(model(host).model.draft.live.apart, true);
    await send({type: "reviewProfileDraft"});
    await send({type: "saveProfileDraft", confirmChecks: true});
    assert.match(model(host).notice, /halves run different profiles.*Revert/);
    assert.equal(keyboard.generation, 42, "nothing saved");
    await send({type: "revertProfileDraft"});
    assert.equal(session.draft.live.apart, false);
    assert.equal(keyboard.apart, false);
});

test("choosing the same mode again settles halves that stored different modes", async t => {
    const {keyboard, send, host, loop} = await open(t);
    keyboard.modeConflict = true;
    await loop.handleMessage({type: "refresh"});
    assert.equal(model(host).model.editMode.conflict, true);
    await send({type: "setEditMode", mode: EDIT_MODE.LIVE_REVIEW});
    assert.ok(keyboard.events.includes("mode 2"));
    assert.equal(keyboard.modeConflict, false);
    assert.match(model(host).notice, /same edit mode/);
});

test("in Apply a toggle a key turned off is shown too", async t => {
    const {host} = await open(t, {mode: EDIT_MODE.APPLY, combosOverride: false});
    assert.deepEqual(model(host).model.runtime, {combosOffByKey: true, behavioursOffByKey: false});
});


test("Revert rereads the saved profile when another client saved the same working revision", async t => {
    const {keyboard, session, key, send, host} = await open(t);
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
    assert.doesNotMatch(model(host).notice, /Undo .* sends the edits back/);
});

test("Send live keeps the original Apply draft when a stale send also prevents switching back", async t => {
    const {keyboard, session, key, send, host, loop} = await open(t, {mode: EDIT_MODE.APPLY});
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
    assert.match(model(host).notice, /not sent.*draft is kept/is);
    assert.doesNotMatch(model(host).notice, /draft is running/);
    await loop.handleMessage({type: "refresh"});
    assert.equal(session.draft, kept, "later observations keep the Apply edits too");
    assert.equal(kept.current.document.profile, target);
});
