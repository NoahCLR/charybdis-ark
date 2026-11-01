"use strict";
// How edits reach the keyboard, as the device service reads it into its own
// state at each status refresh and before a complete read.
const assert = require("node:assert/strict");
const test = require("node:test");
const {connectedService} = require("../fixtures/connected-service");
const {liveKeyboard} = require("../fixtures/live-keyboard");
const {document} = require("../fixtures/portable-profile");
const {testClock} = require("../fixtures/panel-loop");
const {EDIT_MODE, PROFILE_EDIT_V1} = require("../../core/protocol/profile-edit-v1");
const {PROFILE_ACTIVE_KIND} = require("../../core/protocol/profile-wire-v1");
const {editLayers} = require("../fixtures/profile-document");

const UNREAD = "The keyboard's edit mode could not be read; Ark tries again.";

// A live keyboard whose edit mode cannot be read `modeReadFails` times
// from the first, connected; `asked(value)` counts the GETs of that value.
/** @param {import("node:test").TestContext} t @param {{modeReadFails?: number}} [options] */
async function connected(t, {modeReadFails = 0} = {}) {
    const keyboard = liveKeyboard({document: document()});
    if (modeReadFails) keyboard.faults.modeReadFails = modeReadFails;
    const {now, sleep} = testClock();
    const {service, adapter} = await connectedService(t, {keyboard}, {now, sleep});
    /** @param {number} value */
    const asked = value => adapter.lastConnection().writes.filter(report => report[0] === PROFILE_EDIT_V1.COMMAND_GET && report[2] === value).length;
    return {service, keyboard, adapter, asked};
}
/** @param {(layers: number[][]) => void} change */
const target = change => {const next = document(); editLayers(next, change); return Buffer.from(next.profile, "base64");};

test("an edit mode that could not be read is tried again at the next read, and said once", async t => {
    const {service, keyboard, asked} = await connected(t, {modeReadFails: 2});
    assert.equal(service.snapshot().editMode, null, "unknown: Review and save's reads meanwhile");
    assert.equal(service.snapshot().diagnostics.filter(line => line === UNREAD).length, 1);
    assert.equal(asked(PROFILE_EDIT_V1.VALUE_MODE), 2, "the refresh asked, and its live facts asked again");
    const read = await service.readKeyboardProfile();
    assert.equal(service.snapshot().editMode?.mode, keyboard.mode, "a complete read tries it again first");
    assert.ok("live" in read, "and reads live once it is known");
});

test("a firmware without an edit mode is asked once, and nothing more", async t => {
    const {service, adapter} = await connectedService(t, {document: document()});
    const asked = (/** @type {number} */ value) => adapter.lastConnection().writes.filter(report => report[0] === PROFILE_EDIT_V1.COMMAND_GET && report[2] === value).length;
    assert.equal(service.snapshot().editMode, null);
    assert.ok(!service.snapshot().diagnostics.includes(UNREAD), "nothing to try again");
    const read = await service.readKeyboardProfile();
    assert.ok(!("live" in read), "the saved profile is read");
    assert.equal(asked(PROFILE_EDIT_V1.VALUE_MODE), 1);
    assert.equal(asked(PROFILE_EDIT_V1.VALUE_RUNTIME), 0, "without an edit mode no toggles are asked for");
    assert.equal(service.snapshot().runtime, null);
});

test("a keyboard reads live outside Review and save, and its toggles beside the saved profile in it", async t => {
    const {service} = await connected(t);
    assert.equal(service.snapshot().editMode?.mode, EDIT_MODE.LIVE_REVIEW);
    assert.ok("live" in await service.readKeyboardProfile());
    await service.setEditMode(EDIT_MODE.APPLY);
    const read = await service.readKeyboardProfile();
    assert.ok(!("live" in read), "nothing unsaved: Review and save reads the saved profile");
    assert.ok(service.snapshot().runtime, "the toggles a key turned off are read beside the profile");
    assert.equal(service.snapshot().editMode?.notStored, false);
});

test("a mode read again is known again, then the toggles and whether its write is still owed", async t => {
    const {service, keyboard} = await connected(t, {modeReadFails: 2});
    keyboard.raised.modeNotStored = true;
    await service.refreshStatus();
    const {editMode, runtime} = service.snapshot();
    assert.equal(editMode?.mode, EDIT_MODE.LIVE_REVIEW);
    assert.equal(editMode?.notStored, true, "the keyboard still owes the mode's write");
    assert.ok(runtime);
});

test("toggles or progress that cannot be read stop nothing, and leave the mode as it was", async t => {
    const {service, keyboard, adapter, asked} = await connected(t);
    const before = service.snapshot(), runtimes = asked(PROFILE_EDIT_V1.VALUE_RUNTIME), statuses = asked(PROFILE_EDIT_V1.VALUE_STATUS);
    // The keyboard stops handling its toggles and its edit status.
    const answer = keyboard.answer.bind(keyboard);
    adapter.keyboard = {...keyboard, answer: report => report[0] === PROFILE_EDIT_V1.COMMAND_GET && (report[2] === PROFILE_EDIT_V1.VALUE_RUNTIME || report[2] === PROFILE_EDIT_V1.VALUE_STATUS)
        ? [Object.assign(Buffer.from(report), {0: 0xff})] : answer(report)};
    keyboard.raised.modeNotStored = true;
    await service.refreshStatus();
    assert.deepEqual([asked(PROFILE_EDIT_V1.VALUE_RUNTIME) - runtimes, asked(PROFILE_EDIT_V1.VALUE_STATUS) - statuses], [1, 1], "each was asked for once");
    const after = service.snapshot();
    assert.deepEqual([after.editMode, after.runtime], [before.editMode, before.runtime]);
    assert.ok(!after.diagnostics.includes(UNREAD));
    assert.deepEqual([after.error, after.connected], [null, true]);
});

test("in Review and save a keyboard running unsaved edits reads live, and the status it read is kept", async t => {
    const {service, keyboard} = await connected(t);
    await service.setEditMode(EDIT_MODE.APPLY);
    keyboard.externalEdit(target(layers => {layers[0][9] = 0x06;}));
    const read = await service.readKeyboardProfile();
    assert.ok("live" in read && read.live.unsaved);
    assert.equal(service.snapshot().status?.activeKind, PROFILE_ACTIVE_KIND.WORKING);
});

test("a refresh that cannot read the mode leaves it unknown, and a complete read reads it first", async t => {
    const {service, keyboard} = await connected(t);
    await service.setEditMode(EDIT_MODE.APPLY);
    keyboard.faults.modeReadFails = 2;
    await service.refresh();
    assert.equal(service.snapshot().editMode, null);
    keyboard.externalEdit(target(layers => {layers[0][9] = 0x06;}));
    assert.ok("live" in await service.readKeyboardProfile(), "a mode unknown is read first");
    assert.equal(service.snapshot().editMode?.mode, EDIT_MODE.APPLY);
});
