"use strict";
// Live through the panel loop: the keyboard saves by itself and Ark only says
// so (live-watch.js reads its status between edits), its own keys' edits are
// read as news, and its flags show with the one action that helps.
const assert = require("node:assert/strict");
const test = require("node:test");
const {openPanelLoop} = require("../../core/session/panel-loop");
const {checkLive, watchLive} = require("../../core/session/live-watch");
const {fakeKeyboardAdapter} = require("../fixtures/fake-keyboard");
const {liveKeyboard} = require("../fixtures/live-keyboard");
const {document} = require("../fixtures/portable-profile");
const {validateSnapshot} = require("../../core/model/portable-profile");
const {replaceDomain} = require("../../core/schema/profile-domains");
const {encodeKeymapDomain} = require("../../core/schema/keymap-domain-v1");
const {EDIT_MODE} = require("../../core/protocol/profile-edit-v1");

function fakeHost() {
    const host = {
        posted: [], errors: [], recoveries: [], made: [],
        post: (message) => {host.posted.push(message);},
        showError: (text) => {host.errors.push(text);},
        saveRecovery: async (doc, about) => {host.recoveries.push(doc); host.made.push(about); return `/recovery/${host.recoveries.length}.json`;},
        saveExport: async () => undefined,
    };
    return host;
}
const model = host => host.posted.filter(message => message.type === "model").at(-1);

/** @param {import("node:test").TestContext} t @param {object} [options] */
async function open(t, options = {}) {
    const keyboard = liveKeyboard({document: document(), mode: EDIT_MODE.LIVE, ...options});
    const host = fakeHost();
    const loop = openPanelLoop(host, {adapter: fakeKeyboardAdapter({keyboard}), defaultTimeoutMs: 300, sleep: async () => {}});
    t.after(() => loop.close());
    await loop.handleMessage({type: "refresh"});
    /** @param {object} message */
    const send = message => loop.handleMessage({draftId: loop.session.draft?.id, draftRevision: loop.session.draft?.revision, ...message});
    /** @param {number} layer @param {number} layoutIndex @param {string} keycode */
    const key = (layer, layoutIndex, keycode) => send({type: "updateLayoutKeys", layer: `Layer ${layer}`, changes: [{layoutIndex, keycode}]});
    const look = async () => {const changed = await checkLive(loop.session); if (changed) loop.publish(); return changed;};
    return {keyboard, host, loop, send, key, look, session: loop.session};
}

test("in Live an edit runs at once, and Ark shows it saved once the keyboard says it saved it", async t => {
    const {keyboard, host, session, key, look, send} = await open(t);
    assert.equal(session.draft.live.mode, EDIT_MODE.LIVE);
    assert.deepEqual(model(host).model.editMode.offered, [0, 1, 2], "all three modes are offered");
    await key(0, 10, "KC_X");
    assert.ok(keyboard.working, "the keyboard runs the edit");
    assert.equal(model(host).model.draft.live.unsaved, true);
    assert.equal(await look(), false, "nothing new while the keyboard waits for quiet");
    assert.equal(keyboard.autoSave(), true, "the quiet period passes on the keyboard");
    assert.equal(await look(), true);
    const live = model(host).model.draft.live;
    assert.equal(live.unsaved, false);
    assert.equal(live.keyboard.savedByKeyboard, true, "saved by the keyboard, by its own status");
    assert.equal(session.draft.dirty, false, "what is saved is what it runs");
    assert.equal(session.draft.history.length, 2, "the history stays: undo still sends the edit back");
    assert.deepEqual(host.recoveries, [], "Ark wrote nothing and kept no recovery copy: the keyboard saved");
    await send({type: "undoProfileDraft"});
    assert.ok(keyboard.working, "undo is one more live edit");
    assert.equal(model(host).model.draft.live.keyboard.savedByKeyboard, false);
    assert.equal(model(host).model.draft.live.unsaved, true);
    assert.equal(keyboard.mutations.filter(report => report[2] === 0x25).length, 0, "Ark never asked it to save");
});

test("Save is not Live's: it is refused until the keyboard's own save fails, then it saves again without a review", async t => {
    const {keyboard, host, session, key, look, send} = await open(t);
    await key(0, 11, "KC_W");
    await send({type: "saveProfileDraft"});
    assert.match(model(host).notice, /saves by itself/);
    keyboard.faults.autoSaveFails = 4;
    keyboard.autoSave();
    assert.equal(await look(), true);
    assert.equal(model(host).model.draft.live.keyboard.saveFailed, true, "the failure is shown");
    await send({type: "saveProfileDraft"});
    assert.equal(keyboard.working, null, "saved on the second try");
    assert.equal(host.recoveries.length, 1, "a save Ark asks for keeps a recovery copy first");
    assert.equal(session.draft.live.unsaved, false);
});

test("an adjustment key's edit is read as news, not as a failure", async t => {
    const {keyboard, host, session, look} = await open(t);
    const changed = validateSnapshot(document()).layers; changed[3][1] = 0x05;
    keyboard.externalEdit(replaceDomain(Buffer.from(document().profile, "base64"), 0x60, () => encodeKeymapDomain(changed)));
    assert.equal(await look(), true);
    assert.match(model(host).notice, /changed by itself/);
    assert.deepEqual(host.errors, []);
    assert.equal(validateSnapshot(session.draft.current.document).layers[3][1], 0x05, "the draft shows what the keyboard runs");
    assert.equal(session.draft.live.revision, keyboard.revision);
    keyboard.autoSave();
    await look();
    assert.equal(model(host).model.draft.live.keyboard.savedByKeyboard, true, "and the keyboard saves it in Live");
});

test("the other half refusing the edits, a save waiting for quiet and an unstored mode are shown", async t => {
    const {keyboard, host, key, look, send} = await open(t);
    await key(0, 12, "KC_V");
    keyboard.raised.peerRefused = true; keyboard.raised.modeNotStored = true; keyboard.raised.peerStoragePaused = true;
    assert.equal(await look(), true);
    const published = model(host).model;
    assert.deepEqual([published.draft.live.apart, published.editMode.notStored, published.draft.live.keyboard.storagePaused], [true, true, true]);
    keyboard.raised.peerRefused = false;
    await send({type: "revertProfileDraft"});
    assert.equal(keyboard.working, null, "Revert is the way back");
});

test("the watch never looks while an operation or the panel holds the keyboard, and a stale draft waits for a read", async t => {
    const {keyboard, session, key, look} = await open(t);
    await key(0, 13, "KC_U");
    keyboard.autoSave();
    session.portableBusy = true;
    assert.equal(await look(), false);
    session.portableBusy = false;
    session.draft.needsRead = true;
    assert.equal(await look(), false);
    session.draft.needsRead = false;
    assert.equal(await look(), true);
});

test("the watch looks on the host's sleep until stopped", async t => {
    const {keyboard, session, key} = await open(t);
    await key(0, 14, "KC_T");
    keyboard.autoSave();
    let published = 0, slept = 0;
    /** @type {() => void} */
    let wake = () => {};
    const watch = watchLive(session, {publish: () => {published++;}, sleep: () => new Promise(resolve => {slept++; wake = resolve;})});
    await new Promise(resolve => setImmediate(resolve));
    wake();
    while (slept < 2) await new Promise(resolve => setImmediate(resolve));
    assert.equal(published, 1);
    const stopped = watch.stop();
    wake();
    await stopped;
    assert.equal(session.draft.live.unsaved, false);
});

test("a replug in Live keeps what the keyboard saved, and says so", async t => {
    const {keyboard, host, loop, key} = await open(t);
    await key(0, 15, "KC_S");
    keyboard.autoSave();
    keyboard.replug();
    await loop.handleMessage({type: "refresh"});
    assert.match(model(host).notice, /kept your edits/);
    await key(0, 16, "KC_R");
    keyboard.replug();
    await loop.handleMessage({type: "refresh"});
    assert.match(model(host).notice, /before it saved your last edits/);
});

test("under an Apply draft, a key adjustment the keyboard saved is read again; one still unsaved opens live and goes back to Apply once saved", async t => {
    const {keyboard, host, session, look} = await open(t, {mode: EDIT_MODE.APPLY});
    assert.equal(session.draft.live, null);
    assert.equal(await look(), false, "the first look only notes where the keyboard is");
    const changed = validateSnapshot(document()).layers; changed[3][2] = 0x06;
    keyboard.externalEdit(replaceDomain(Buffer.from(document().profile, "base64"), 0x60, () => encodeKeymapDomain(changed)));
    assert.equal(await look(), false, "unsaved: the keyboard saves it after its quiet moment");
    keyboard.autoSave();
    assert.equal(await look(), true);
    assert.match(model(host).notice, /changed by itself/);
    assert.equal(session.draft.live, null, "still an Apply draft");
    assert.equal(validateSnapshot(session.draft.current.document).layers[3][2], 0x06, "showing what the keyboard saved");
    assert.equal(session.draft.dirty, false);
    // Read while an adjustment is unsaved, the draft opens live (only Save or
    // Revert could settle it), and returns to Apply once the keyboard saved it.
    changed[3][2] = 0x07;
    keyboard.externalEdit(replaceDomain(Buffer.from(document().profile, "base64"), 0x60, () => encodeKeymapDomain(changed)));
    await session.service.readKeyboardProfile();
    require("../../core/session/panel-session").observePortable(session, require("../../core/session/demo-session").panelState(session));
    assert.ok(session.draft.live);
    keyboard.autoSave();
    assert.equal(await look(), true);
    assert.equal(session.draft.live, null, "back to an Apply draft");
    assert.equal(validateSnapshot(session.draft.current.document).layers[3][2], 0x07);
});


test("a queued key adjustment reaches the panel before its revision changes", async t => {
    const {keyboard, host, look} = await open(t);
    keyboard.raised.adjustmentPending = true;
    assert.equal(await look(), true);
    assert.equal(model(host).model.draft.live.keyboard.adjustmentPending, true);
    assert.equal(model(host).model.draft.keyboard.adjustmentPending, true, "the draft's keyboard view is the live one");
    keyboard.raised.adjustmentPending = false;
    assert.equal(await look(), true);
    assert.equal(model(host).model.draft.live.keyboard.adjustmentPending, false);
});


test("under an Apply draft, a queued key adjustment reaches the panel too", async t => {
    const {keyboard, host, session, look} = await open(t, {mode: EDIT_MODE.APPLY});
    assert.equal(session.draft.live, null);
    assert.equal(await look(), false, "the first look only notes where the keyboard is");
    assert.equal(model(host).model.draft.keyboard, null, "nothing said before a look");
    keyboard.raised.adjustmentPending = true;
    assert.equal(await look(), true);
    assert.equal(model(host).model.draft.live, null, "still an Apply draft");
    assert.equal(model(host).model.draft.keyboard.adjustmentPending, true);
    assert.equal(await look(), false, "nothing new while it stays pending");
    keyboard.raised.adjustmentPending = false;
    assert.equal(await look(), true);
    assert.equal(model(host).model.draft.keyboard.adjustmentPending, false);
});

test("an automatic save racing a reread stays eligible and synchronizes on the next poll", async t => {
    const {keyboard, session, look} = await open(t);
    const changed = validateSnapshot(document()).layers; changed[3][1] = 0x05;
    keyboard.externalEdit(replaceDomain(keyboard.saved, 0x60, () => encodeKeymapDomain(changed)));
    const answer = keyboard.answer;
    let raced = false;
    keyboard.answer = report => {
        if (!raced && report[0] === 0x08 && report[2] === 0x21) {raced = true; keyboard.autoSave();}
        return answer(report);
    };
    await look();
    assert.ok(raced);
    assert.equal(session.draft.needsRead, true, "an incoherent capture is refused");
    assert.equal(await look(), true, "the next poll retries the automatic reread");
    assert.equal(session.draft.stale, false);
    assert.equal(validateSnapshot(session.draft.current.document).layers[3][1], 0x05);
    assert.equal(session.draft.live.savedGeneration, keyboard.generation);
});

test("persistent coherence failures exhaust a bounded automatic reread budget", async t => {
    const {keyboard, session, look} = await open(t);
    keyboard.externalEdit(keyboard.saved);
    const answer = keyboard.answer;
    let captures = 0;
    keyboard.answer = report => {
        if (report[0] === 0x08 && report[2] === 0x22) {
            captures++;
            keyboard.externalEdit(keyboard.saved);
        }
        return answer(report);
    };
    for (let poll = 0; poll < 6; poll++) await look();
    assert.equal(captures, 3, "three captures, then manual Read keyboard is required");
    assert.equal(session.draft.needsRead, true);
});

for (const dirty of [false, true]) test(`the first Apply poll catches a saved adjustment (draft edited: ${dirty})`, async t => {
    const {keyboard, session, look, key} = await open(t, {mode: EDIT_MODE.APPLY});
    if (dirty) await key(0, 11, "KC_R");
    const kept = session.draft.current.document.profile;
    const changed = validateSnapshot(document()).layers; changed[3][2] = 0x06;
    keyboard.externalEdit(replaceDomain(keyboard.saved, 0x60, () => encodeKeymapDomain(changed)));
    keyboard.autoSave();
    assert.equal(await look(), true, "compare the very first status to the successful capture");
    if (dirty) {
        assert.equal(session.draft.current.document.profile, kept);
        assert.equal(session.draft.stale, true);
    } else {
        assert.equal(validateSnapshot(session.draft.current.document).layers[3][2], 0x06);
        assert.equal(session.draft.stale, false);
    }
});
