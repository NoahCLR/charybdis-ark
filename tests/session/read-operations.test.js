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
const {liveKeyboard} = require("../fixtures/live-keyboard");
const {editLayers} = require("../fixtures/profile-document");
const {testClock} = require("../fixtures/panel-loop");
const {fnv1a32} = require("../../core/schema/profile-blob-v1");
const {EDIT_MODE, buildEditModeRequest, sendEditRequest} = require("../../core/protocol/profile-edit-v1");
const {PROFILE_WIRE_V1} = require("../../core/protocol/profile-wire-v1");

test("a read without a keyboard is refused before it starts; the optional ones only record it", async () => {
    const service = new ProfileDeviceService({adapter: new FakeDeviceAdapter()});
    await assert.rejects(service.readLayout(), {message: "Connect to a keyboard before reading its layout."});
    await assert.rejects(service.readCommittedProfile(), {message: "Connect to a keyboard before reading its profile."});
    await assert.rejects(service.readPortableProfile(), {message: "Connect the keyboard and wait for the current operation to finish."});
    await assert.rejects(service.readKeyboardProfile(), {message: "Connect the keyboard and wait for the current operation to finish."});
    assert.equal(service.snapshot().operationId, 0, "nothing started");
    assert.equal((await service.readCombos()).combos, null, "no keyboard: nothing to show");
    assert.equal((await service.readBaseRgb()).baseRgb, null);
    assert.equal(service.snapshot().error?.message, "Connect the keyboard and wait for the current operation to finish.", "the optional reads leave the error alone");
});

test("the layout and committed reads keep what they read and say so in the diagnostics", async t => {
    const {service} = await connectedService(t, {document: document()});
    const layout = (await service.readLayout()).layout;
    assert.equal(layout?.state, "read");
    assert.equal(layout?.layers.length, service.capabilities?.compiledLayerCount);
    assert.equal(service.snapshot().diagnostics.at(-1), `Read ${layout?.layers.length} layers from the keyboard.`);
    const committed = (await service.readCommittedProfile()).committed;
    assert.equal(committed?.state, "read");
    assert.match(service.snapshot().diagnostics.at(-1) || "", /^Read (committed generation \d+|the firmware's compiled defaults) from the keyboard \(\d+ bytes\)\.$/);
});

test("the optional reads keep what they read, and a failure as their own", async t => {
    const {service, keyboard} = await connectedService(t, {document: document()});
    assert.equal((await service.readCombos()).combos?.state, "read");
    assert.equal((await service.readBaseRgb()).baseRgb?.state, "read");
    // The keyboard no longer handles a profile read: both reads fail alone.
    keyboard.answer = report => {const unhandled = Buffer.from(report); unhandled[0] = 0xff; return [unhandled];};
    service.setError(new Error("Earlier profile failure"));
    const combos = (await service.readCombos()).combos;
    assert.equal(combos?.state, "unavailable");
    const baseRgb = (await service.readBaseRgb()).baseRgb;
    assert.equal(baseRgb?.state, "unavailable");
    assert.equal(service.snapshot().diagnostics.at(-1), `Base RGB: ${baseRgb?.error?.message}`);
    assert.equal(service.snapshot().error?.message, "Earlier profile failure", "neither masks an earlier error");
    assert.equal(service.snapshot().connected, true);
});

test("only an editor read changes the profile the editors follow", async t => {
    const {service} = await connectedService(t, {document: document()});
    const exported = await service.readPortableProfile();
    assert.equal(service.portable, undefined, "an export leaves the editors alone");
    assert.ok(exported.limits && exported.options && exported.hostOs, "what the keyboard accepts travels with the profile");
    const read = await service.readKeyboardProfile();
    assert.equal(service.portable, read);
    const {settingsView, macroView, customKeyView} = service.snapshot();
    assert.deepEqual({settingsView, macroView, customKeyView}, JSON.parse(JSON.stringify(editorViews(read, service.capabilities))));
    assert.equal(service.snapshot().layout?.state, "read");
    assert.equal(service.snapshot().baseRgb?.state, "read");
    const restoreRead = await service.readPortableProfile({forRestore: true});
    assert.equal(service.portable, restoreRead, "a read for a restore is followed too");
});

// A keyboard in Live preview + save running an unsaved edit.
/** @param {import("node:test").TestContext} t */
async function runningEdits(t) {
    const keyboard = liveKeyboard({document: document()});
    const {now, sleep} = testClock();
    const connected = await connectedService(t, {keyboard}, {now, sleep});
    const next = document();
    editLayers(next, layers => {layers[0][9] = 0x06;});
    keyboard.externalEdit(Buffer.from(next.profile, "base64"));
    return connected;
}

test("a live read gives the working copy and the saved profile, each with what the keyboard accepts, and keeps its status", async t => {
    const keyboard = liveKeyboard({document: document()});
    const {now, sleep} = testClock();
    const {service} = await connectedService(t, {keyboard}, {now, sleep});
    // The keyboard's mode changes under the service, before an edit runs.
    await sendEditRequest(/** @type {import("../../core/session/types.js").DeviceConnection} */ (service.state.connection), buildEditModeRequest(200, EDIT_MODE.LIVE));
    const next = document();
    editLayers(next, layers => {layers[0][9] = 0x06;});
    keyboard.externalEdit(Buffer.from(next.profile, "base64"));
    const {layout, committed} = service.snapshot();
    const read = /** @type {import("../../core/session/types.js").LiveSnapshot} */ (await service.readPortableProfile());
    assert.ok(keyboard.working && read.live.working.equals(keyboard.working));
    assert.equal(read.live.unsaved, true);
    assert.ok(Buffer.from(read.saved.document.profile, "base64").equals(keyboard.saved), "the saved profile beside it");
    assert.ok(read.limits && read.options && read.hostOs);
    assert.deepEqual([read.saved.limits, read.saved.options, read.saved.hostOs], [read.limits, read.options, read.hostOs], "the saved profile carries the same facts");
    const published = service.snapshot();
    assert.deepEqual(published.status, read.status);
    assert.deepEqual(published.runtime, JSON.parse(JSON.stringify(read.runtime)));
    assert.equal(read.live.mode, EDIT_MODE.LIVE);
    assert.equal(published.editMode?.mode, EDIT_MODE.LIVE, "the mode the read found");
    assert.deepEqual([published.layout, published.committed], [layout, committed], "not for the editors: the layout and readback stay");
    assert.equal(service.portable, undefined);
});

test("a live read for the editors shows what the keyboard runs: its working copy, over the saved generation it began from", async t => {
    const {service, keyboard} = await runningEdits(t);
    const read = await service.readKeyboardProfile();
    assert.ok("live" in read);
    const {layout, committed, baseRgb, combos} = service.snapshot();
    assert.equal(layout?.state, "read");
    assert.equal(committed?.state, "read");
    assert.equal(committed?.source, "working");
    assert.equal(committed?.generation, read.live.savedGeneration);
    assert.equal(committed?.digest, fnv1a32(/** @type {Buffer} */ (keyboard.working)));
    assert.equal(committed?.byteLength, keyboard.working?.length);
    assert.equal(baseRgb?.state, "read");
    assert.equal(combos?.state, "read");
    await service.revertWorkingCopy(read.live);
    await service.readKeyboardProfile();
    assert.equal(service.snapshot().committed?.source, "committed", "nothing unsaved: the saved profile");
});

test("a live read refuses what it read once the keyboard it read from is gone", async t => {
    const {service, adapter} = await runningEdits(t);
    // The keyboard answers its host OS, the read's last request, and is unplugged.
    adapter.onWrite = ({connection, report}) => {
        const responses = adapter.keyboard.answer(report);
        queueMicrotask(() => {
            responses.forEach(response => connection.emitReport(response));
            if (report[0] === PROFILE_WIRE_V1.COMMAND_GET && report[2] === 0x0b) connection.emitDisconnect(new Error("Unplugged"));
        });
    };
    await assert.rejects(service.readKeyboardProfile(), {message: "The keyboard disconnected while its profile was being read."});
    assert.equal(service.snapshot().connected, false);
    assert.equal(service.portable, undefined, "nothing of it is kept");
});

test("a restore over the profile just read takes what the keyboard accepts again; the host OS is read fresh", async t => {
    const {fixture} = require("../fixtures/portable-restore");
    const f = fixture(), {service, adapter} = await connectedService(t, {keyboard: f.keyboard});
    const read = await service.readKeyboardProfile();
    assert.equal(read.fingerprint, f.options.expectedFingerprint);
    const sent = adapter.lastConnection().writes.length;
    await service.restorePortableProfile(f.targetDocument, f.options);
    const asked = adapter.lastConnection().writes.slice(sent).filter(report => report[0] === PROFILE_WIRE_V1.COMMAND_GET);
    assert.equal(asked.filter(report => report[2] === 8 && report[4] === 1).length, 0, "its settings limits are the read's");
    assert.equal(asked.filter(report => report[2] === 0x0b).length, 1, "its host OS is read again");
    assert.deepEqual([service.portable?.limits, service.portable?.options, service.portable?.hostOs], [read.limits, read.options, read.hostOs]);
});
