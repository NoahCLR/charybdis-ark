"use strict";
// The device service's profile reads, each one operation that keeps what it
// read in the service's state.
const assert = require("node:assert/strict");
const test = require("node:test");
const {connectedService} = require("../fixtures/connected-service");
const {document} = require("../fixtures/portable-profile");
const {FakeDeviceAdapter} = require("../../core/transport/fake-device-adapter");
const {ProfileDeviceService} = require("../../core/session/profile-device-service");
const {editorViews} = require("../../core/model/profile-model");
const {adoptPortable, readBaseRgb, readCombos, readCommittedProfile, readCompleteProfile, readDeviceFacts, readLayout, readLiveProfile} = require("../../core/session/read-operations");
const {liveKeyboard} = require("../fixtures/live-keyboard");
const {editLayers} = require("../fixtures/profile-document");
const {testClock} = require("../fixtures/panel-loop");
const {fnv1a32} = require("../../core/schema/profile-blob-v1");
const {EDIT_MODE} = require("../../core/protocol/profile-edit-v1");

test("a read without a keyboard is refused before it starts; the optional ones only record it", async () => {
    const service = new ProfileDeviceService({adapter: new FakeDeviceAdapter()});
    await assert.rejects(readLayout(service), {message: "Connect to a keyboard before reading its layout."});
    await assert.rejects(readCommittedProfile(service), {message: "Connect to a keyboard before reading its profile."});
    await assert.rejects(readCompleteProfile(service), {message: "Connect the keyboard and wait for the current operation to finish."});
    assert.equal((await readCombos(service)).combos, null, "no keyboard: nothing to show");
    assert.equal((await readBaseRgb(service)).baseRgb, null);
    assert.equal(service.snapshot().error?.message, "Connect the keyboard and wait for the current operation to finish.", "the optional reads leave the error alone");
});

test("the layout and committed reads keep what they read and say so in the diagnostics", async t => {
    const {service} = await connectedService(t, {document: document()});
    const layout = (await readLayout(service)).layout;
    assert.equal(layout?.state, "read");
    assert.equal(layout?.layers.length, service.capabilities?.compiledLayerCount);
    assert.equal(service.snapshot().diagnostics.at(-1), `Read ${layout?.layers.length} layers from the keyboard.`);
    const committed = (await readCommittedProfile(service)).committed;
    assert.equal(committed?.state, "read");
    assert.match(service.snapshot().diagnostics.at(-1) || "", /^Read (committed generation \d+|the firmware's compiled defaults) from the keyboard \(\d+ bytes\)\.$/);
});

test("only an editor read changes the profile the editors follow", async t => {
    const {service} = await connectedService(t, {document: document()});
    const exported = await readCompleteProfile(service);
    assert.equal(service.portable, undefined, "an export leaves the editors alone");
    assert.ok(exported.limits && exported.options && exported.hostOs, "what the keyboard accepts travels with the profile");
    const read = await readCompleteProfile(service, {forEditor: true});
    assert.equal(service.portable, read);
    const {settingsView, macroView, customKeyView} = service.snapshot();
    assert.deepEqual({settingsView, macroView, customKeyView}, JSON.parse(JSON.stringify(editorViews(read, service.capabilities))));
    assert.equal(service.snapshot().layout?.state, "read");
    assert.equal(service.snapshot().baseRgb?.state, "read");
});

test("device facts already read are taken again; the host OS is always read fresh", async t => {
    const {service} = await connectedService(t, {document: document()});
    const connection = service.connectedConnection();
    const facts = await readDeviceFacts(service, connection);
    const known = {limits: {brightnessMax: 1}, options: {effects: []}};
    const again = await readDeviceFacts(service, connection, known);
    assert.equal(again.limits, known.limits);
    assert.equal(again.options, known.options);
    assert.deepEqual(again.hostOs, facts.hostOs);
    const read = await readCompleteProfile(service);
    adoptPortable(service, read);
    assert.equal(service.portable, read);
    assert.ok(service.settingsView, "adopting a profile builds its editor views");
});

// A keyboard in Live preview + save running an unsaved edit.
/** @param {import("node:test").TestContext} t */
async function runningEdits(t) {
    const keyboard = liveKeyboard({document: document()});
    const {now, sleep} = testClock();
    const {service} = await connectedService(t, {keyboard}, {now, sleep});
    const next = document();
    editLayers(next, layers => {layers[0][9] = 0x06;});
    keyboard.externalEdit(Buffer.from(next.profile, "base64"));
    return {service, keyboard, connection: service.connectedConnection()};
}

test("a live read gives the working copy and the saved profile, each with what the keyboard accepts, and keeps its status", async t => {
    const {service, keyboard, connection} = await runningEdits(t);
    service.editMode = {mode: EDIT_MODE.APPLY, counter: 0, conflict: false, notStored: false};
    const layout = service.layout, committed = service.committed;
    const read = await readLiveProfile(service, connection, service.profileCapabilities(), false);
    assert.ok(keyboard.working && read.live.working.equals(keyboard.working));
    assert.equal(read.live.unsaved, true);
    assert.ok(Buffer.from(read.saved.document.profile, "base64").equals(keyboard.saved), "the saved profile beside it");
    assert.ok(read.limits && read.options && read.hostOs);
    assert.deepEqual([read.saved.limits, read.saved.options, read.saved.hostOs], [read.limits, read.options, read.hostOs], "the saved profile carries the same facts");
    assert.equal(service.status, read.status);
    assert.equal(service.runtime, read.runtime);
    assert.equal(service.editMode?.mode, read.live.mode, "the mode the read found");
    assert.equal(read.live.mode, EDIT_MODE.LIVE_REVIEW);
    assert.deepEqual([service.layout, service.committed], [layout, committed], "not for the editors: the layout and readback stay");
});

test("a live read for the editors shows what the keyboard runs: its working copy, over the saved generation it began from", async t => {
    const {service, keyboard, connection} = await runningEdits(t);
    const read = await readLiveProfile(service, connection, service.profileCapabilities(), true);
    assert.equal(service.layout?.state, "read");
    const committed = service.committed;
    assert.equal(committed?.state, "read");
    assert.equal(committed?.source, "working");
    assert.equal(committed?.generation, read.live.savedGeneration);
    assert.equal(committed?.digest, fnv1a32(/** @type {Buffer} */ (keyboard.working)));
    assert.equal(committed?.byteLength, keyboard.working?.length);
    assert.equal(service.baseRgb?.state, "read");
    assert.equal(service.combos?.state, "read");
    await service.revertWorkingCopy(read.live);
    await readLiveProfile(service, connection, service.profileCapabilities(), true);
    assert.equal(service.committed?.source, "committed", "nothing unsaved: the saved profile");
});

test("a live read refuses what it read once the connection it read from is not the service's", async t => {
    const {service, connection} = await runningEdits(t);
    const elsewhere = {request: (/** @type {Parameters<typeof connection.request>} */ ...args) => connection.request(...args), get connected() {return connection.connected;}};
    await assert.rejects(readLiveProfile(service, /** @type {any} */ (elsewhere), service.profileCapabilities(), true),
        {message: "The keyboard disconnected while its profile was being read."});
});
