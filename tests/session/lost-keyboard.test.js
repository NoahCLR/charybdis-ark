"use strict";
// A live keyboard whose answers stop for a while: a menu held open in Chrome
// on macOS holds back the page's input reports, so the once-a-second look
// (live-watch.js) goes unanswered though the keyboard is fine. A missed look
// is skipped and its late answer set aside; the look pauses while such a menu
// may be open. A keyboard that is really lost (a user operation unanswered,
// or several looks in a row) is connected again by itself and read
// (keyboard-reconnect.js), with a word on what happened. While no keyboard is
// connected, nothing it said about its edits ("saved by the keyboard") shows.
const assert = require("node:assert/strict");
const test = require("node:test");
const {openPanelLoop} = require("../../core/session/panel-loop");
const {checkLive, watchLive} = require("../../core/session/live-watch");
const {LOST_WORDS, RECONNECT_WORDS, expectLost} = require("../../core/session/keyboard-reconnect");
const {WATCH_MISSES} = require("../../core/session/profile-device-service");
const {fakeKeyboardAdapter} = require("../fixtures/fake-keyboard");
const {liveKeyboard} = require("../fixtures/live-keyboard");
const {document} = require("../fixtures/portable-profile");
const {EDIT_MODE} = require("../../core/protocol/profile-edit-v1");

/** @param {import("node:test").TestContext} t @param {{now?: () => number, sleep?: (ms: number) => Promise<void>}} [timing] */
async function open(t, timing = {}) {
    const keyboard = liveKeyboard({document: document(), mode: EDIT_MODE.LIVE});
    const adapter = fakeKeyboardAdapter({keyboard});
    const answer = adapter.onWrite;
    // `left` requests from the next one on get no answer; while `hold` is
    // set, answers wait in `held` (a menu holding back input reports).
    const silence = {left: 0, hold: false, held: /** @type {(() => void)[]} */ ([])};
    adapter.onWrite = (write) => {
        if (silence.left > 0) {silence.left--; return undefined;}
        if (silence.hold) {
            const responses = adapter.keyboard.answer(write.report);
            silence.held.push(() => responses.forEach((response) => write.connection.emitReport(response)));
            return undefined;
        }
        return answer(write);
    };
    const release = () => {silence.hold = false; silence.held.splice(0).forEach((send) => send());};
    const posted = [];
    const host = {post: (message) => {posted.push(message);}, showError: () => {}, saveRecovery: async () => "/r.json", saveExport: async () => undefined};
    const loop = openPanelLoop(host, {adapter, defaultTimeoutMs: 100, watchTimeoutMs: 50, sleep: async () => {}, reconnect: {sleep: async () => {}, ...timing}});
    t.after(() => loop.close());
    await loop.handleMessage({type: "refresh"});
    const send = (message) => loop.handleMessage({draftId: loop.session.draft?.id, draftRevision: loop.session.draft?.revision, ...message});
    const models = () => posted.filter((message) => message.type === "model").map((message) => message.model);
    const notices = () => posted.filter((message) => message.notice).map((message) => message.notice);
    const look = () => checkLive(loop.session).catch(() => false);
    // The looks that go unanswered in a row before Ark calls the keyboard lost.
    const lose = async () => {for (let i = 0; i < WATCH_MISSES; i++) {silence.left = 1; await look();}};
    return {keyboard, adapter, silence, release, loop, send, models, notices, look, lose};
}

test("a missed look is skipped: the keyboard stays connected, and the late answer is set aside", async (t) => {
    const {adapter, silence, release, loop, models, look} = await open(t);
    const connections = adapter.connectionHistory.length;
    silence.hold = true;
    assert.equal(await look(), false, "the look is skipped");
    assert.equal(loop.session.service.snapshot().connected, true, "no disconnect for one missed look");
    release();
    // The held answers arrive late; the next look gets its own.
    await new Promise((resolve) => setImmediate(resolve));
    await look();
    assert.equal(loop.session.service.snapshot().connected, true);
    assert.equal(loop.session.service.snapshot().error, null);
    assert.ok(loop.session.service.snapshot().diagnostics.some((line) => /answers a request that timed out/.test(line)), "the late answer was set aside, not taken");
    assert.equal(adapter.connectionHistory.length, connections);
    loop.publish();
    assert.equal(models().at(-1).device.connected, true);
});

test("the look pauses while the host says a menu may be open, and resumes after", async () => {
    const looks = [];
    const session = {service: {snapshot: () => ({})}};
    let paused = true, ticks = 0;
    /** @type {() => void} */
    let finish = () => {};
    const ended = new Promise((resolve) => {finish = resolve;});
    const sleep = async () => {
        ticks++;
        if (ticks === 3) paused = false;
        if (ticks === 5) finish();
    };
    const watch = watchLive(/** @type {any} */ (session), {publish: () => {}, sleep, paused: () => paused, check: async () => {looks.push(ticks); return false;}});
    await ended;
    await watch.stop();
    assert.deepEqual(looks.slice(0, 2), [3, 4], "no look while paused, then one each interval");
});

test("in Live, a keyboard lost for several looks is connected and read again by itself, and its save state is not shown while it is gone", async (t) => {
    const {keyboard, adapter, loop, send, models, notices, look, lose} = await open(t);
    // As on Noah's keyboard: an edit, which the keyboard then saved by itself.
    await send({type: "updateLayoutKeys", layer: "Layer 0", changes: [{layoutIndex: 10, keycode: "KC_X"}]});
    assert.equal(keyboard.autoSave(), true);
    await look();
    loop.publish();
    assert.equal(models().at(-1).draft.live.keyboard.savedByKeyboard, true);
    const connections = adapter.connectionHistory.length;

    await lose();
    const gone = models().filter((model) => !model.device.connected);
    assert.ok(gone.length, "the loss was published");
    for (const model of gone) assert.equal(model.draft?.live?.keyboard ?? null, null, "no keyboard save state without a keyboard");

    await loop.reconnected();
    const model = models().at(-1);
    assert.equal(model.device.connected, true, "the same keyboard is connected again");
    assert.equal(adapter.connectionHistory.length, connections + 1);
    assert.equal(model.reconnecting, null);
    assert.equal(model.load.state, "ready");
    assert.equal(model.draft.live.mode, EDIT_MODE.LIVE, "the live draft follows what it runs");
    assert.equal(notices().at(-1), LOST_WORDS.back("did not answer within 50 ms"));
});

test("a user operation the keyboard does not answer loses it at once, and it is connected again", async (t) => {
    const {silence, loop, send, models, notices} = await open(t);
    silence.left = 1;
    await send({type: "updateLayoutKeys", layer: "Layer 0", changes: [{layoutIndex: 11, keycode: "KC_W"}]});
    await loop.reconnected();
    assert.equal(models().at(-1).device.connected, true);
    assert.equal(notices().at(-1), LOST_WORDS.back("did not answer within 100 ms"));
});

test("a keyboard that fails again soon after Ark reconnected it is left for the person to choose", async (t) => {
    const time = {now: 0};
    const {adapter, loop, models, notices, lose} = await open(t, {now: () => time.now});
    await lose();
    await loop.reconnected();
    assert.equal(models().at(-1).device.connected, true);
    const connections = adapter.connectionHistory.length;

    time.now += 5000;
    await lose();
    await loop.reconnected();
    const model = models().at(-1);
    assert.equal(model.device.connected, false, "no second automatic reconnect within the guard");
    assert.equal(adapter.connectionHistory.length, connections);
    assert.match(model.device.health.error, /did not respond within 50 ms/, "the failure stays on the Connect screen");
    assert.equal(notices().at(-1), LOST_WORDS.again);

    // The person connects it; a loss well after is followed again.
    await loop.handleMessage({type: "refresh"});
    assert.equal(models().at(-1).device.connected, true);
    time.now += 60000;
    await lose();
    await loop.reconnected();
    assert.equal(models().at(-1).device.connected, true);
});

test("a keyboard that drops off USB and does not come back is waited for, then left to the person", async (t) => {
    const time = {now: 0};
    const {adapter, loop, models, notices} = await open(t, {now: () => time.now, sleep: async (ms) => {time.now += ms;}});
    adapter.devices = [];
    adapter.lastConnection().emitDisconnect(new Error("Unplugged."));
    await loop.reconnected();
    assert.equal(models().at(-1).device.connected, false);
    assert.equal(notices().at(-1), LOST_WORDS.timeout);
    assert.ok(time.now >= 10000, "it waited the bounded time for it to come back");
});

test("in Live, renaming the keyboard expects its USB restart, and it is read again under its new name", async (t) => {
    const {adapter, loop, send, models, notices} = await open(t);
    await send({type: "renameKeyboard", name: "Desk", expectedFingerprint: loop.session.draft.current.fingerprint});
    assert.equal(loop.session.reconnect?.name, "Desk", "the restart that takes the new name is expected");
    assert.equal(loop.session.reconnect?.lost, undefined);

    // The keyboard restarts USB once quiet, cutting the next request, and
    // comes back under its new name.
    adapter.lastConnection().emitDisconnect(new Error("USB restarted."));
    adapter.devices = [{id: "fake-charybdis-2", product: "Desk", manufacturer: "Bastard Keyboards", serialNumber: "FAKE-1"}];
    loop.serviceChanged();
    assert.equal(models().at(-1).device.health.error, "", "no failure while it restarts");
    await loop.reconnected();
    assert.equal(models().at(-1).device.connected, true);
    assert.equal(notices().at(-1), RECONNECT_WORDS.back("Desk"));
});

test("a keyboard that dropped off USB is waited for only where its serial identifies it; a web page follows Chrome's events instead", () => {
    const lost = {deviceId: "kb", serialNumber: "", product: "Charybdis", otherDevices: [], what: "disconnected", unanswered: false};
    const session = {};
    assert.equal(expectLost(session, lost, () => 0), undefined);
    assert.equal(session.reconnect, undefined);
    assert.ok(expectLost({}, {...lost, serialNumber: "E4"}, () => 0), "node-hid knows the serial");
    assert.ok(expectLost({}, {...lost, what: "did not answer within 1000 ms", unanswered: true}, () => 0), "an unanswered request leaves it plugged in");
});
