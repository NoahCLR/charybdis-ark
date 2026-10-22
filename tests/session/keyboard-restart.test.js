"use strict";
// Restarting the keyboard from Ark (firmware D-F34), through the panel loop
// both hosts run, against a keyboard with a working copy that can stop saving
// and restart: the unsaved edits are kept with a recovery copy, the keyboard
// restarts, comes back and is read again, and the edits go back unsaved.
const assert = require("node:assert/strict");
const test = require("node:test");
const {openPanelLoop} = require("../../core/session/panel-loop");
const {fakeKeyboardAdapter} = require("../fixtures/fake-keyboard");
const {liveKeyboard} = require("../fixtures/live-keyboard");
const {document} = require("../fixtures/portable-profile");
const {EDIT_MODE} = require("../../core/protocol/profile-edit-v1");
const {RESTART_WORDS} = require("../../core/session/keyboard-reconnect");
const {RESTART_LABEL} = require("../../core/session/keyboard-restart");

function fakeHost({recoveryFails = false} = {}) {
    const host = {
        posted: [], errors: [], recoveries: [],
        post: (message) => {host.posted.push(message);},
        showError: (text) => {host.errors.push(text);},
        saveRecovery: async (doc) => {if (recoveryFails) return undefined; host.recoveries.push(doc); return `/recovery/${host.recoveries.length}.json`;},
        saveExport: async () => undefined,
    };
    return host;
}
const model = host => host.posted.filter(message => message.type === "model").at(-1).model;
const notices = host => host.posted.filter(message => message.notice).map(message => message.notice);

/** @param {import("node:test").TestContext} t @param {{mode?: number, recoveryFails?: boolean, comesBack?: boolean}} [options] */
async function open(t, {mode = EDIT_MODE.LIVE_REVIEW, recoveryFails = false, comesBack = true} = {}) {
    const keyboard = liveKeyboard({document: document(), mode});
    const host = fakeHost({recoveryFails});
    const adapter = fakeKeyboardAdapter({keyboard});
    const loop = openPanelLoop(host, {adapter, defaultTimeoutMs: 300, sleep: async () => {},
        reconnect: {sleep: () => new Promise(resolve => setTimeout(resolve, 5)), waitMs: comesBack ? 5000 : 50}});
    t.after(() => loop.close());
    // The keyboard drops off USB just after it answers, and comes back under
    // the same name and serial number, unless the test says it does not.
    const devices = adapter.devices;
    keyboard.restarting.onRestart = () => {
        adapter.lastConnection().emitDisconnect(new Error("restarted"));
        adapter.devices = [];
        loop.serviceChanged();
        if (comesBack) setTimeout(() => {adapter.devices = devices;}, 15);
    };
    await loop.handleMessage({type: "refresh"});
    /** @param {object} message */
    const send = message => loop.handleMessage({draftId: loop.session.draft?.id, draftRevision: loop.session.draft?.revision, ...message});
    /** @param {number} layoutIndex @param {string} keycode */
    const key = (layoutIndex, keycode) => send({type: "updateLayoutKeys", layer: "Layer 0", changes: [{layoutIndex, keycode}]});
    return {keyboard, host, loop, send, key, session: loop.session};
}

// The keyboard of 2026-10-19: unsaved edits, then its storage stopped.
async function stoppedWithEdits(t, options) {
    const opened = await open(t, options);
    await opened.key(10, "KC_X");
    const edited = opened.keyboard.working;
    opened.keyboard.raised.stopped = true;
    // The live watch's look, as between edits.
    opened.loop.session.draft.observeLiveStatus(await opened.loop.session.service.readLiveStatus());
    opened.loop.publish();
    return {...opened, edited};
}

test("a stopped keyboard says so instead of 'not ready' or 'catching up', and refuses Save plainly", async t => {
    const {host, send, session} = await stoppedWithEdits(t);
    const live = model(host).draft.live;
    assert.equal(live.keyboard.stopped, true);
    assert.equal(live.keyboard.peerStopped, false);
    await send({type: "reviewProfileDraft"});
    await send({type: "saveProfileDraft", confirmChecks: true});
    const said = notices(host).at(-1);
    assert.match(said, /stopped saving\. Restart it to continue/);
    assert.doesNotMatch(said, /not ready/);
    assert.ok(session.draft.live.unsaved, "nothing was saved");
});

test("Restart keeps the unsaved edits, restarts both halves and puts them back unsaved (Live + review)", async t => {
    const {keyboard, host, loop, send, session, edited} = await stoppedWithEdits(t);
    const sessionBefore = keyboard.session;
    await send({type: "restartKeyboard"});
    // The recovery copy holds what the keyboard ran: the unsaved edits.
    assert.equal(host.recoveries.length, 1);
    assert.equal(host.recoveries[0].profile, edited.toString("base64"));
    assert.equal(keyboard.restarting.restarts, 1);
    assert.match(notices(host).at(-1), /Restarting the keyboard… Ark keeps its unsaved edits/);
    await loop.reconnected();
    assert.equal(loop.session.reconnect, undefined);
    assert.notEqual(keyboard.session, sessionBefore, "a new boot");
    assert.ok(keyboard.working?.equals(edited), "the edits run on the keyboard again");
    assert.ok(!keyboard.saved.equals(edited), "and are not saved");
    const published = model(host);
    assert.equal(published.device.connected, true);
    assert.equal(published.draft.live.unsaved, true);
    assert.equal(published.draft.live.keyboard.stopped, false);
    assert.equal(session.draft.history.at(-1).label, RESTART_LABEL);
    const said = notices(host).at(-1);
    assert.ok(said.startsWith(RESTART_WORDS.back()), said);
    assert.match(said, /Your unsaved edits are back on the keyboard, not saved yet: review and save them\./);
    // And they save as any edit does.
    await send({type: "reviewProfileDraft"});
    await send({type: "saveProfileDraft", confirmChecks: true});
    assert.equal(keyboard.working, null);
    assert.ok(keyboard.saved.equals(edited));
});

test("in Live the put-back edits are left for the keyboard's own save", async t => {
    const {keyboard, host, loop, send, edited} = await stoppedWithEdits(t, {mode: EDIT_MODE.LIVE});
    await send({type: "restartKeyboard"});
    await loop.reconnected();
    assert.ok(keyboard.working?.equals(edited));
    assert.match(notices(host).at(-1), /back on the keyboard, which saves them in a moment/);
    keyboard.autoSave();
    assert.ok(keyboard.saved.equals(edited));
});

test("with nothing unsaved a restart saves no recovery copy and puts nothing back", async t => {
    const {keyboard, host, loop, send} = await open(t);
    keyboard.raised.stopped = true;
    loop.session.draft.observeLiveStatus(await loop.session.service.readLiveStatus());
    await send({type: "restartKeyboard"});
    assert.equal(host.recoveries.length, 0);
    await loop.reconnected();
    assert.equal(keyboard.working, null);
    assert.equal(notices(host).at(-1), RESTART_WORDS.back());
});

test("the working copy read failing falls back to the draft's own copy of it", async t => {
    const {keyboard, host, loop, send, edited} = await stoppedWithEdits(t);
    keyboard.faults.workingReadFails = true;
    await send({type: "restartKeyboard"});
    assert.equal(host.recoveries[0].profile, edited.toString("base64"));
    await loop.reconnected();
    assert.ok(keyboard.working?.equals(edited));
});

test("no recovery copy, no restart", async t => {
    const {keyboard, host, send} = await stoppedWithEdits(t, {recoveryFails: true});
    await send({type: "restartKeyboard"});
    assert.equal(keyboard.restarting.restarts, 0);
    assert.match(notices(host).at(-1), /recovery copy .* could not be saved, so it was not restarted/);
});

test("firmware without restart answers unhandled: nothing happens, and the recovery copy is named", async t => {
    const {keyboard, host, loop, send} = await stoppedWithEdits(t);
    keyboard.faults.noRestart = true;
    await send({type: "restartKeyboard"});
    assert.equal(keyboard.restarting.restarts, 0);
    assert.equal(loop.session.reconnect, undefined);
    assert.equal(loop.session.restart, undefined);
    const said = notices(host).at(-1);
    assert.match(said, /firmware cannot restart from Ark, so nothing happened\. Unplug the keyboard/);
    assert.match(said, /recovery copy: \/recovery\/1\.json/);
    assert.equal(model(host).device.connected, true, "the keyboard is still there");
});

test("a slave half that missed the restart needs no replug once the keyboard is back with it", async t => {
    // Read again, the keyboard answers for both halves, and the half that
    // missed the restart rejoins by itself (firmware D-F34).
    const {keyboard, host, loop, send, edited} = await stoppedWithEdits(t);
    keyboard.faults.restartUnacknowledged = true;
    await send({type: "restartKeyboard"});
    await loop.reconnected();
    assert.ok(keyboard.working?.equals(edited));
    assert.doesNotMatch(notices(host).at(-1), /unplug/);
});

test("a restart the slave half missed, of a keyboard that does not come back, says to replug", async t => {
    const {keyboard, host, loop, send} = await stoppedWithEdits(t, {comesBack: false});
    keyboard.faults.restartUnacknowledged = true;
    await send({type: "restartKeyboard"});
    await loop.reconnected();
    assert.match(notices(host).at(-1), /slave half did not answer the restart: if the halves do not agree now, unplug the keyboard/);
});

test("a keyboard that stops again at once is told apart: the edits stay in the recovery copy", async t => {
    const {keyboard, host, loop, send} = await stoppedWithEdits(t);
    keyboard.faults.stopsAgain = true;
    await send({type: "restartKeyboard"});
    await loop.reconnected();
    assert.equal(keyboard.working, null, "nothing was sent to a stopped keyboard");
    const said = notices(host).at(-1);
    assert.match(said, /stopped saving again at once, so the fault is in its flash or its firmware/);
    assert.match(said, /not put back\. Your unsaved edits are in the recovery copy: \/recovery\/1\.json/);
});

test("a keyboard that does not come back says so and names the recovery copy", async t => {
    const {keyboard, host, loop, send} = await stoppedWithEdits(t, {comesBack: false});
    await send({type: "restartKeyboard"});
    await loop.reconnected();
    assert.equal(keyboard.restarting.restarts, 1);
    const said = notices(host).at(-1);
    assert.ok(said.startsWith(RESTART_WORDS.timeout), said);
    assert.match(said, /recovery copy: \/recovery\/1\.json/);
});
