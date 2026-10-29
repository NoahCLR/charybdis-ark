"use strict";
// Live edit through the panel loop: the keyboard saves by itself and Ark only
// says so (live-watch.js reads its status between edits), its own keys' edits
// are read as news, and its flags show with the one action that helps.
const assert = require("node:assert/strict");
const test = require("node:test");
const {watchLive} = require("../../core/session/live-watch");
const {lastMessage, lastModel, openLoop} = require("../fixtures/panel-loop");
const {liveKeyboard} = require("../fixtures/live-keyboard");
const {document} = require("../fixtures/portable-profile");
const {validateSnapshot} = require("../../core/model/portable-profile");
const {replaceDomain} = require("../../core/schema/profile-domains");
const {encodeKeymapDomain} = require("../../core/schema/keymap-domain-v1");
const {EDIT_MODE} = require("../../core/protocol/profile-edit-v1");

// The loop on a live keyboard in Live edit, unless `options` say otherwise.
/** @param {import("node:test").TestContext} t @param {object} [options] */
const open = (t, options = {}) => openLoop(t, {keyboard: liveKeyboard({document: document(), mode: EDIT_MODE.LIVE, ...options})});

test("in Live edit an edit runs at once, and Ark shows it saved once the keyboard says it saved it", async t => {
    const {keyboard, shell, session, key, look, send} = await open(t);
    assert.equal(session.draft.live.mode, EDIT_MODE.LIVE);
    assert.deepEqual(lastModel(shell).editMode.offered, [EDIT_MODE.LIVE, EDIT_MODE.LIVE_REVIEW, EDIT_MODE.APPLY], "all three modes are offered: Live edit, Live preview + save, Review and save");
    await key(0, 10, "KC_X");
    assert.ok(keyboard.working, "the keyboard runs the edit");
    assert.equal(lastModel(shell).draft.live.unsaved, true);
    assert.equal(await look(), false, "nothing new while the keyboard waits for quiet");
    assert.equal(keyboard.autoSave(), true, "the quiet period passes on the keyboard");
    assert.equal(await look(), true);
    const live = lastModel(shell).draft.live;
    assert.equal(live.unsaved, false);
    assert.equal(live.keyboard.savedByKeyboard, true, "saved by the keyboard, by its own status");
    assert.equal(session.draft.dirty, false, "what is saved is what it runs");
    assert.equal(session.draft.history.length, 2, "the history stays: undo still sends the edit back");
    assert.deepEqual(shell.recoveries, [], "Ark wrote nothing and kept no recovery copy: the keyboard saved");
    await send({type: "undoProfileDraft"});
    assert.ok(keyboard.working, "undo is one more live edit");
    assert.equal(lastModel(shell).draft.live.keyboard.savedByKeyboard, false);
    assert.equal(lastModel(shell).draft.live.unsaved, true);
    assert.equal(keyboard.mutations.filter(report => report[2] === 0x25).length, 0, "Ark never asked it to save");
});

test("Save is not Live edit's: it is refused until the keyboard's own save fails, then it saves again without a review", async t => {
    const {keyboard, shell, session, key, look, send} = await open(t);
    await key(0, 11, "KC_W");
    await send({type: "saveProfileDraft"});
    assert.match(lastMessage(shell).notice, /saves by itself/);
    keyboard.faults.autoSaveFails = 4;
    keyboard.autoSave();
    assert.equal(await look(), true);
    assert.equal(lastModel(shell).draft.live.keyboard.saveFailed, true, "the failure is shown");
    await send({type: "saveProfileDraft"});
    assert.equal(keyboard.working, null, "saved on the second try");
    assert.equal(shell.recoveries.length, 1, "a save Ark asks for keeps a recovery copy first");
    assert.equal(session.draft.live.unsaved, false);
});

test("an adjustment key's edit is read as news, not as a failure", async t => {
    const {keyboard, shell, session, look} = await open(t);
    const changed = validateSnapshot(document()).layers; changed[3][1] = 0x05;
    keyboard.externalEdit(replaceDomain(Buffer.from(document().profile, "base64"), 0x60, () => encodeKeymapDomain(changed)));
    assert.equal(await look(), true);
    assert.match(lastMessage(shell).notice, /changed by itself/);
    assert.deepEqual(shell.errors, []);
    assert.equal(validateSnapshot(session.draft.current.document).layers[3][1], 0x05, "the draft shows what the keyboard runs");
    assert.equal(session.draft.live.revision, keyboard.revision);
    keyboard.autoSave();
    await look();
    assert.equal(lastModel(shell).draft.live.keyboard.savedByKeyboard, true, "and the keyboard saves it in Live edit");
});

test("the slave half refusing the edits, a save waiting for quiet and an unstored mode are shown", async t => {
    const {keyboard, shell, key, look, send} = await open(t);
    await key(0, 12, "KC_V");
    keyboard.raised.slaveRefused = true; keyboard.raised.modeNotStored = true; keyboard.raised.slaveStoragePaused = true;
    assert.equal(await look(), true);
    const published = lastModel(shell);
    assert.deepEqual([published.draft.live.slaveRefused, published.editMode.notStored, published.draft.live.keyboard.storagePaused], [true, true, true]);
    keyboard.raised.slaveRefused = false;
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

test("the watch looks on the shell's sleep until stopped", async t => {
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

test("a replug in Live edit keeps what the keyboard saved, and says so", async t => {
    const {keyboard, shell, loop, key} = await open(t);
    await key(0, 15, "KC_S");
    keyboard.autoSave();
    keyboard.replug();
    await loop.handleMessage({type: "refresh"});
    assert.match(lastMessage(shell).notice, /kept your edits/);
    await key(0, 16, "KC_R");
    keyboard.replug();
    await loop.handleMessage({type: "refresh"});
    assert.match(lastMessage(shell).notice, /before it saved your last edits/);
});

test("under a Review and save draft, a key adjustment the keyboard saved is read again; one still unsaved opens live and goes back to Review and save once saved", async t => {
    const {keyboard, shell, session, look} = await open(t, {mode: EDIT_MODE.APPLY});
    assert.equal(session.draft.live, null);
    assert.equal(await look(), false, "the first look only notes where the keyboard is");
    const changed = validateSnapshot(document()).layers; changed[3][2] = 0x06;
    keyboard.externalEdit(replaceDomain(Buffer.from(document().profile, "base64"), 0x60, () => encodeKeymapDomain(changed)));
    assert.equal(await look(), false, "unsaved: the keyboard saves it after its quiet moment");
    keyboard.autoSave();
    assert.equal(await look(), true);
    assert.match(lastMessage(shell).notice, /changed by itself/);
    assert.equal(session.draft.live, null, "still an Apply draft");
    assert.equal(validateSnapshot(session.draft.current.document).layers[3][2], 0x06, "showing what the keyboard saved");
    assert.equal(session.draft.dirty, false);
    // Read while an adjustment is unsaved, the draft opens live (only Save or
    // Revert could settle it), and returns to Review and save once the
    // keyboard saved it.
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
    const {keyboard, shell, look} = await open(t);
    keyboard.raised.adjustmentPending = true;
    assert.equal(await look(), true);
    assert.equal(lastModel(shell).draft.live.keyboard.adjustmentPending, true);
    assert.equal(lastModel(shell).draft.keyboard.adjustmentPending, true, "the draft's keyboard view is the live one");
    keyboard.raised.adjustmentPending = false;
    assert.equal(await look(), true);
    assert.equal(lastModel(shell).draft.live.keyboard.adjustmentPending, false);
});


test("under a Review and save draft, a queued key adjustment reaches the panel too", async t => {
    const {keyboard, shell, session, look} = await open(t, {mode: EDIT_MODE.APPLY});
    assert.equal(session.draft.live, null);
    assert.equal(await look(), false, "the first look only notes where the keyboard is");
    assert.equal(lastModel(shell).draft.keyboard, null, "nothing said before a look");
    keyboard.raised.adjustmentPending = true;
    assert.equal(await look(), true);
    assert.equal(lastModel(shell).draft.live, null, "still an Apply draft");
    assert.equal(lastModel(shell).draft.keyboard.adjustmentPending, true);
    assert.equal(await look(), false, "nothing new while it stays pending");
    keyboard.raised.adjustmentPending = false;
    assert.equal(await look(), true);
    assert.equal(lastModel(shell).draft.keyboard.adjustmentPending, false);
});

for (const flag of ["stopped", "slaveStopped"]) test(`under a Review and save draft, a ${flag === "stopped" ? "master" : "slave"} half that stopped saving reaches the panel`, async t => {
    const {keyboard, shell, session, look, key} = await open(t, {mode: EDIT_MODE.APPLY});
    await key(0, 11, "KC_R");
    assert.equal(await look(), false, "the first look only notes where the keyboard is");
    keyboard.raised[flag] = true;
    assert.equal(await look(), true);
    const published = lastModel(shell).draft;
    assert.equal(published.live, null, "still an Apply draft");
    assert.equal(published.keyboard[flag], true);
    assert.equal(published.changes.length, 1, "the draft keeps its edit");
    assert.equal(await look(), false, "nothing new while it stays stopped");
    keyboard.raised[flag] = false;
    assert.equal(await look(), true);
    assert.equal(lastModel(shell).draft.keyboard[flag], false);
    assert.equal(session.draft.dirty, true);
});

test("an automatic save racing a reread is read again at once, and the draft synchronizes", async t => {
    const {keyboard, session, look} = await open(t);
    const changed = validateSnapshot(document()).layers; changed[3][1] = 0x05;
    keyboard.externalEdit(replaceDomain(keyboard.saved, 0x60, () => encodeKeymapDomain(changed)));
    const answer = keyboard.answer;
    let raced = false;
    keyboard.answer = report => {
        if (!raced && report[0] === 0x08 && report[2] === 0x21) {raced = true; keyboard.autoSave();}
        return answer(report);
    };
    assert.equal(await look(), true);
    assert.ok(raced);
    assert.equal(session.draft.stale, false, "the moved pair is read again, not refused");
    assert.equal(validateSnapshot(session.draft.current.document).layers[3][1], 0x05);
    assert.equal(session.draft.live.savedGeneration, keyboard.generation);
});

test("a read that keeps racing stays eligible and synchronizes on the next poll", async t => {
    const {keyboard, session, look} = await open(t);
    keyboard.externalEdit(keyboard.saved);
    const answer = keyboard.answer;
    let races = 3;
    keyboard.answer = report => {
        // Each of the read's three tries moves under it.
        if (races > 0 && report[0] === 0x08 && report[2] === 0x22) {races--; keyboard.externalEdit(keyboard.saved);}
        return answer(report);
    };
    await look();
    assert.equal(races, 0);
    assert.equal(session.draft.needsRead, true, "an incoherent snapshot is refused");
    assert.equal(await look(), true, "the next poll retries the automatic reread");
    assert.equal(session.draft.stale, false);
    assert.equal(session.draft.live.revision, keyboard.revision);
});

test("persistent coherence failures exhaust a bounded automatic reread budget", async t => {
    const {keyboard, session, look} = await open(t);
    keyboard.externalEdit(keyboard.saved);
    const answer = keyboard.answer;
    let reads = 0;
    keyboard.answer = report => {
        if (report[0] === 0x08 && report[2] === 0x22) {
            reads++;
            keyboard.externalEdit(keyboard.saved);
        }
        return answer(report);
    };
    for (let poll = 0; poll < 6; poll++) await look();
    assert.equal(reads, 9, "three looks of three tries each, then manual Read keyboard is required");
    assert.equal(session.draft.needsRead, true);
});

for (const dirty of [false, true]) test(`the first look under a Review and save draft catches a saved adjustment (draft edited: ${dirty})`, async t => {
    const {keyboard, session, look, key} = await open(t, {mode: EDIT_MODE.APPLY});
    if (dirty) await key(0, 11, "KC_R");
    const kept = session.draft.current.document.profile;
    const changed = validateSnapshot(document()).layers; changed[3][2] = 0x06;
    keyboard.externalEdit(replaceDomain(keyboard.saved, 0x60, () => encodeKeymapDomain(changed)));
    keyboard.autoSave();
    assert.equal(await look(), true, "compare the very first status to the successful snapshot");
    if (dirty) {
        assert.equal(session.draft.current.document.profile, kept);
        assert.equal(session.draft.stale, true);
    } else {
        assert.equal(validateSnapshot(session.draft.current.document).layers[3][2], 0x06);
        assert.equal(session.draft.stale, false);
    }
});
