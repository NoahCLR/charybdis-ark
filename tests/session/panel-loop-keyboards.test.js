"use strict";
// What the panel loop does with what the shell's browser says about keyboards
// (core/session/panel-loop.js): a keyboard chosen in the picker, Disconnect,
// a keyboard the page may open coming or going, and a profile the shell holds
// opened for review. Each case checks what the panel shows after it.
const assert = require("node:assert/strict");
const test = require("node:test");
const {LIVE_LINK_ERROR_CODES, liveLinkError} = require("../../core/transport/device-adapter");
const {expectLost} = require("../../core/session/keyboard-reconnect");
const {FAILURE_WORDS} = require("../../core/model/vocabulary");
const {fakeShell, lastMessage, lastModel, notices, openLoop} = require("../fixtures/panel-loop");
const {document} = require("../fixtures/portable-profile");

// A second keyboard the fake adapter lists; the fake keyboard answers on it too.
const second = {id: "fake-second", product: "Charybdis 4x6", manufacturer: "Bastard Keyboards", serialNumber: "FAKE-2"};
const DISCONNECTED = "Disconnected. This page will not open that keyboard again until you choose it.";

test("a keyboard chosen in the picker is the one read, even while another is connected", async (t) => {
    const {adapter, shell, loop} = await openLoop(t);
    const first = lastModel(shell).selectedDeviceId;
    // Chrome lists the keyboard just chosen first.
    adapter.devices.unshift(second);
    await loop.chose(Promise.resolve());
    const model = lastModel(shell);
    assert.equal(model.devices.length, 2);
    assert.equal(model.selectedDeviceId, model.devices[0].id, "the chosen keyboard is selected");
    assert.notEqual(model.selectedDeviceId, first);
    assert.equal(model.device.connected, true, "and read");
    assert.ok(loop.session.draft, "its draft is open");
});

test("a picker closed without a choice says so and reads nothing; one that failed says why", async (t) => {
    const {shell, loop} = await openLoop(t, {read: false});
    await loop.chose(Promise.reject(liveLinkError(LIVE_LINK_ERROR_CODES.CANCELLED, "No Charybdis was chosen.")));
    assert.equal(lastMessage(shell).notice, "No keyboard was chosen.");
    assert.equal(lastMessage(shell).failed, undefined, "no failure");
    assert.equal(lastModel(shell).device.connected, false);
    await loop.chose(Promise.reject(liveLinkError(LIVE_LINK_ERROR_CODES.ENUMERATION_FAILED, "The browser refused to show the keyboard picker.")));
    assert.equal(lastMessage(shell).notice, "Failed: The browser refused to show the keyboard picker.");
    assert.equal(lastMessage(shell).failed, true);
    assert.equal(lastModel(shell).device.connected, false);
});

test("a chosen keyboard whose list fails with a fault reads as plain words, its own text kept for the diagnostics", async (t) => {
    const {shell, loop} = await openLoop(t, {read: false});
    loop.session.service.enumerate = async () => {throw new TypeError("Cannot read properties of undefined (reading 'id')");};
    await loop.chose(Promise.resolve());
    const {notice} = lastMessage(shell);
    assert.equal(notice, `Failed: ${FAILURE_WORDS.unexpected}`);
    assert.doesNotMatch(notice, /properties|undefined/);
    assert.match(loop.session.service.snapshot().diagnostics.at(-1), /^TypeError: Cannot read properties of undefined/);
});

test("choosing a keyboard from the demo leaves it when the panel asked to", async (t) => {
    const {shell, loop} = await openLoop(t, {read: false});
    await loop.handleMessage({type: "openDemo"});
    assert.equal(lastModel(shell).demo.active, true);
    await loop.chose(Promise.resolve(), {discardDemo: true});
    const model = lastModel(shell);
    assert.equal(model.demo.active, false, "the demo is left");
    assert.equal(model.device.connected, true, "and the keyboard read");
});

test("Disconnect lets go of the keyboard, takes back the page's permission and says so", async (t) => {
    const {adapter, shell, loop} = await openLoop(t);
    let letGo = 0;
    await loop.forget(async () => {letGo++; adapter.devices = [];});
    assert.equal(letGo, 1);
    assert.deepEqual(notices(shell).slice(1), [DISCONNECTED], "said once, after what the read said");
    const model = lastModel(shell);
    assert.equal(model.device.connected, false);
    assert.deepEqual(model.devices, [], "the keyboard is no longer listed");
});

test("after Disconnect, the first keyboard the page may still open is connected", async (t) => {
    const {adapter, shell, loop} = await openLoop(t);
    adapter.devices.push(second);
    await loop.forget(async () => {adapter.devices = [second];});
    const model = lastModel(shell);
    assert.equal(model.devices.length, 1);
    assert.equal(model.selectedDeviceId, model.devices[0].id);
    assert.equal(model.device.connected, true);
});

test("Disconnect waits for the keyboard to finish", async (t) => {
    const {shell, loop} = await openLoop(t);
    const service = loop.session.service, snapshot = service.snapshot.bind(service);
    service.snapshot = () => ({...snapshot(), busy: true});
    let letGo = 0;
    await loop.forget(async () => {letGo++;});
    assert.equal(lastMessage(shell).notice, "Failed: Wait for the keyboard to finish before disconnecting it.");
    assert.equal(letGo, 0, "nothing is let go");
    service.snapshot = snapshot;
    assert.equal(service.snapshot().connected, true);
});

test("an allowed keyboard plugged in with none open is connected and read", async (t) => {
    const {adapter, shell, loop} = await openLoop(t, {read: false});
    const plugged = adapter.devices;
    adapter.devices = [];
    await loop.keyboardsChanged();
    assert.deepEqual(lastModel(shell).devices, [], "none yet");
    adapter.devices = plugged;
    await loop.keyboardsChanged();
    const model = lastModel(shell);
    assert.equal(model.device.connected, true);
    assert.ok(loop.session.draft);
});

test("an allowed keyboard plugged in while one is open is only listed", async (t) => {
    const {adapter, shell, loop} = await openLoop(t);
    const connected = lastModel(shell).selectedDeviceId;
    adapter.devices.push(second);
    await loop.keyboardsChanged();
    const model = lastModel(shell);
    assert.equal(model.devices.length, 2, "the selector lists it");
    assert.equal(model.selectedDeviceId, connected, "the open one stays");
});

test("in the demo, a keyboard plugged in is listed but the demo stays", async (t) => {
    const {shell, loop} = await openLoop(t, {read: false});
    await loop.handleMessage({type: "openDemo"});
    await loop.keyboardsChanged();
    assert.equal(lastModel(shell).demo.active, true, "still the demo");
    const state = loop.session.service.snapshot();
    assert.equal(state.devices.length, 1, "the keyboard is listed for when it is left");
    assert.equal(state.connected, false);
});

test("while a lost or renamed keyboard is waited for, no other is connected in its place", async (t) => {
    const {shell, loop} = await openLoop(t, {read: false});
    expectLost(loop.session, {deviceId: "charybdis-9", serialNumber: "GONE", product: "Charybdis 4x6", otherDevices: [], what: "unplugged", unanswered: false});
    await loop.keyboardsChanged();
    assert.equal(loop.session.service.snapshot().connected, false);
    assert.deepEqual(lastModel(shell).devices, [], "nothing is even listed");
});

test("a tab that reaches no keyboard follows none", async (t) => {
    const blocked = {title: "Ark is open in another tab", detail: "One tab holds the keyboard at a time."};
    const {shell, loop} = await openLoop(t, {read: false, shell: fakeShell({panel: () => ({blocked})})});
    await loop.keyboardsChanged();
    const model = lastModel(shell);
    assert.deepEqual(model.devices, []);
    assert.equal(model.device.connected, false);
});

test("keyboards coming and going while the keyboard is busy are looked at once, after it", async (t) => {
    const {loop} = await openLoop(t, {read: false});
    // The loop's timer on a test clock; what it starts runs before the next
    // turn of the event loop.
    t.mock.timers.enable({apis: ["setTimeout"]});
    t.after(() => t.mock.timers.reset());
    const after = async (ms) => {
        t.mock.timers.tick(ms);
        await new Promise((resolve) => setImmediate(resolve));
    };
    const service = loop.session.service, snapshot = service.snapshot.bind(service);
    let busy = true, listed = 0;
    service.snapshot = () => ({...snapshot(), busy});
    service.enumerate = async () => {listed++;};
    for (let event = 0; event < 5; event++) await loop.keyboardsChanged();
    for (let look = 0; look < 3; look++) await after(500);
    assert.equal(listed, 0, "nothing is listed while it is busy");
    busy = false;
    await after(500);
    assert.equal(listed, 1, "one look, not one per event");
    await after(5000);
    assert.equal(listed, 1, "and none after it");
});

test("a profile the shell holds opens for review against the keyboard, bound to the open draft", async (t) => {
    const {shell, loop} = await openLoop(t);
    const draft = loop.session.draft;
    await loop.reviewProfile({text: JSON.stringify(document()), name: "recovery-before-save-home.charybdis.json"});
    const message = lastMessage(shell);
    assert.equal(message.failed, undefined, message.notice);
    assert.ok(message.model.portable.review, "its comparison with the keyboard shows");
    assert.equal(loop.session.draft, draft, "the draft is kept until it is used");
});
