"use strict";
// A keyboard that has just come back answers before it has decided which
// profile runs (firmware D-F61). Ark waits until profile status says it has
// finished starting before reading it, after a replug or a lost keyboard and
// on Read keyboard alike (D-L70); a keyboard without its slave half is told
// so in the usual words once the wait is over.
const assert = require("node:assert/strict");
const test = require("node:test");
const {hasStarted, readOnceStarted, stillStarting, STARTING, STARTING_WORDS} = require("../../core/session/keyboard-starting");
const {notices, openLoop} = require("../fixtures/panel-loop");
const {LOST_WORDS} = require("../../core/session/keyboard-reconnect");
const {BOOT, booting, fakeKeyboard} = require("../fixtures/fake-keyboard");
const {writableKeyboard} = require("../fixtures/writable-keyboard");
const {liveKeyboard} = require("../fixtures/live-keyboard");
const {EDIT_MODE} = require("../../core/protocol/profile-edit-v1");
const {document} = require("../fixtures/portable-profile");
const {PHASE} = require("../../core/model/vocabulary");

/** @param {number} activeKind @param {number} stateFlags @param {number} [conflictCount] */
const status = (activeKind, stateFlags, conflictCount = 0) => ({activeKind, stateFlags, conflictCount,
    slaveKnown: (stateFlags & 0x10) !== 0, slaveConverged: (stateFlags & 0x20) !== 0});

test("the keyboard has started once its profile is decided and both halves agree", () => {
    // What Noah's keyboard reported after a restart, then before the firmware
    // reported its boot as pending (kind 0 while it still ran its defaults).
    assert.equal(hasStarted(status(3, 0x80)), false, "pending, nothing known");
    assert.equal(hasStarted(status(3, 0xb2)), false, "pending, though the halves agree");
    assert.equal(stillStarting(status(3, 0xb2)), true);
    assert.equal(hasStarted(status(0, 0x01)), false, "the slave half not known yet");
    assert.equal(hasStarted(status(1, 0xb2)), false, "digests not reported yet");
    assert.equal(hasStarted(status(1, 0x32)), true, "the saved profile, on both halves");
    assert.equal(hasStarted(status(0, 0x31)), true, "nothing saved: the compiled defaults, decided");
    assert.equal(hasStarted(status(4, 0x32)), true, "unsaved edits it kept");
    assert.equal(hasStarted(status(1, 0x32, 1)), false, "a generation conflict");
    assert.equal(hasStarted({...status(1, 0x32), activeGeneration: 42, committedGeneration: 42, slaveGeneration: 41}), false, "the slave half a generation behind");
    assert.equal(hasStarted(status(1, 0x02)), false, "without its slave half");
    assert.equal(stillStarting(status(1, 0x02)), false);
});

test("a read refused once the wait's bound is over is read once more only if the keyboard had started", async () => {
    let reads = 0;
    const refused = Object.assign(new Error("The slave half is not connected."), {code: "KEYBOARD_NOT_READY"});
    const read = async () => {if (++reads < 3) throw refused; return "read";};
    const ended = {awaitStarted: async () => ({started: true, deadline: 0, late: true})};
    await assert.rejects(readOnceStarted(ended, {deadline: 0}, read), refused, "started as it ended: once more, then no more");
    assert.equal(reads, 2);
    reads = 1;
    assert.equal(await readOnceStarted(ended, {deadline: 0}, read), "read");
    reads = 0;
    const stillNot = {awaitStarted: async () => ({started: false, deadline: 0, late: true})};
    await assert.rejects(readOnceStarted(stillNot, {deadline: 0}, read), refused);
    assert.equal(reads, 1, "not started when it ended: the refusal stands");
    const other = Object.assign(new Error("No."), {code: "TIMEOUT"});
    await assert.rejects(readOnceStarted(ended, {deadline: 0}, async () => {throw other;}), other, "anything else is not read again");
});

/** @param {import("node:test").TestContext} t @param {import("../fixtures/types.js").FakeKeyboard} inner */
async function open(t, inner) {
    const opened = await openLoop(t, {keyboard: booting(inner)});
    const {keyboard, shell, clock, adapter} = opened;
    const models = () => shell.posted.filter((message) => message.type === "model").map((message) => message.model);
    const waited = () => models().some((model) => model.load.state === "loading" && model.load.phase === PHASE.STARTING);
    // Unplugged and plugged back in: it drops off USB and starts again,
    // listed under a new device id when the test says (node-hid's new path).
    const replug = ({newId = false} = {}) => {
        const devices = newId ? adapter.devices.map((device) => ({...device, id: `${device.id}-again`})) : adapter.devices;
        /** @type {{replug?: () => void}} */ (inner).replug?.();
        keyboard.boot();
        adapter.devices = [];
        adapter.lastConnection().emitDisconnect(new Error("Unplugged."));
        clock.at(clock.now() + 15, () => {adapter.devices = devices;});
    };
    return {...opened, models, notices: () => notices(shell), waited, replug};
}

test("Read keyboard waits for a keyboard still starting, then reads it", async (t) => {
    const {keyboard, loop, models, notices, waited} = await open(t, fakeKeyboard({document: document()}));
    keyboard.boot(BOOT);
    await loop.handleMessage({type: "refresh"});
    assert.ok(waited(), "the panel said it waited for the keyboard to finish starting");
    const model = models().at(-1);
    assert.equal(model.load.state, "ready");
    assert.equal(model.device.health.error, "");
    assert.equal(notices().at(-1), "Read the keyboard's saved profile, generation 42.");
});

test("a keyboard without its slave half is told so in the usual words, once the wait is over", async (t) => {
    const {clock, loop, models, notices} = await open(t, fakeKeyboard({document: document(), slaveKnown: false}));
    const since = clock.now();
    await loop.handleMessage({type: "refresh"});
    assert.ok(clock.now() - since >= STARTING.WAIT_MS, "it waited the bound");
    assert.match(notices().at(-1), /The slave half is not connected\. Connect the cable between the halves and read again\./);
    assert.doesNotMatch(notices().at(-1), /finished starting/);
    assert.equal(models().at(-1).load.state, "unavailable");
});

test("a replugged keyboard is read once it has started: the back words, no health error, the halves agreeing; and a Review and save draft then applies", async (t) => {
    const {loop, models, notices, replug, send} = await open(t, writableKeyboard({document: document()}));
    replug({newId: true});
    loop.serviceChanged();
    await loop.reconnected();
    const model = models().at(-1);
    assert.equal(notices().at(-1), LOST_WORDS.back("disconnected"));
    assert.equal(model.device.health.error, "");
    assert.equal(model.device.health.halves, "agree");
    assert.equal(model.load.state, "ready");
    assert.equal(model.draft.matching, true, "the draft follows it to its new device id");
    await send({type: "updateLayoutKeys", layer: "Layer 0", changes: [{layoutIndex: 10, keycode: "KC_X"}]});
    await send({type: "reviewProfileDraft"});
    await send({type: "applyProfileDraft", confirmChecks: true});
    assert.match(notices().at(-1), /^Complete profile (saved to|saved on) both halves and verified\./);
    assert.doesNotMatch(notices().join("\n"), /slave half is not connected/);
});

test("within the wait, a read refused because the keyboard was not ready yet is read again, not reported", async (t) => {
    const {keyboard, loop, models, notices} = await open(t, fakeKeyboard({document: document()}));
    // It looks started to the reads before the editor's (the connection's
    // and the wait's), then not, for the read itself.
    keyboard.boot([{activeKind: 1, stateFlags: 0x32, reads: 2}, {activeKind: 3, stateFlags: 0x80, reads: 3}]);
    await loop.handleMessage({type: "refresh"});
    assert.equal(models().at(-1).load.state, "ready");
    assert.equal(models().at(-1).device.health.error, "");
    assert.equal(notices().at(-1), "Read the keyboard's saved profile, generation 42.");
});

test("Read keyboard of a keyboard that never finishes starting says so, not that the read failed", async (t) => {
    const {keyboard, clock, loop, models, notices} = await open(t, fakeKeyboard({document: document()}));
    keyboard.boot([{activeKind: 3, stateFlags: 0xb2, reads: Infinity}]);
    const since = clock.now();
    await loop.handleMessage({type: "refresh"});
    assert.ok(clock.now() - since >= STARTING.WAIT_MS);
    assert.equal(notices().at(-1), STARTING_WORDS.timeout);
    assert.equal(models().at(-1).device.health.error, STARTING_WORDS.timeout);
    assert.equal(models().at(-1).load.state, "unavailable");
});

test("a lost keyboard that never finishes starting says so when it is back", async (t) => {
    const {keyboard, loop, notices, replug} = await open(t, fakeKeyboard({document: document()}));
    replug();
    keyboard.boot([{activeKind: 3, stateFlags: 0xb2, reads: Infinity}]);
    loop.serviceChanged();
    await loop.reconnected();
    assert.equal(notices().at(-1), STARTING_WORDS.timeout);
});

test("a live draft with unsaved edits follows a replugged keyboard to its new device id, and takes edits and Save there", async (t) => {
    const keyboard = liveKeyboard({document: document(), mode: EDIT_MODE.LIVE_REVIEW});
    const {loop, models, notices, replug, send} = await open(t, keyboard);
    await send({type: "updateLayoutKeys", layer: "Layer 0", changes: [{layoutIndex: 10, keycode: "KC_X"}]});
    assert.ok(keyboard.working, "unsaved edits");
    replug({newId: true});
    loop.serviceChanged();
    await loop.reconnected();
    assert.equal(notices().at(-1).split(" Ark connected")[0], "The keyboard disconnected;");
    assert.equal(keyboard.working, null, "the replug lost them, as it does");
    assert.equal(models().at(-1).draft.matching, true, "the draft follows it to its new device id");
    assert.equal(loop.session.draft.live.session, keyboard.session, "and its new session");
    await send({type: "updateLayoutKeys", layer: "Layer 0", changes: [{layoutIndex: 11, keycode: "KC_W"}]});
    const edited = keyboard.working;
    assert.ok(edited, "an edit reaches it");
    await send({type: "reviewProfileDraft"});
    await send({type: "saveProfileDraft", confirmChecks: true});
    assert.ok(keyboard.saved.equals(edited), "and saves");
});
