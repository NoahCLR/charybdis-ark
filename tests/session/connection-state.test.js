"use strict";
// What the device service holds of one connection: cleared as one when it
// ends, and published as copies the panel can keep.
const assert = require("node:assert/strict");
const test = require("node:test");
const {connectedService} = require("../fixtures/connected-service");
const {CANDIDATE_STATE_NAMES} = require("../../core/protocol/profile-candidate-v1");
const {evaluateProfileCompatibility} = require("../../core/session/firmware-support");
const {editorViews} = require("../../core/model/profile-model");
const {ConnectionState, clone} = require("../../core/session/connection-state");

test("a snapshot publishes the connection's state as copies the panel can keep", async t => {
    const {service, id} = await connectedService(t);
    await service.readKeyboardProfile();
    const published = service.state.published();
    const snapshot = service.snapshot();
    for (const [key, value] of Object.entries(published)) assert.deepEqual(snapshot[key], value, key);
    assert.equal(snapshot.connected, true);
    assert.equal(snapshot.selectedDeviceId, id);
    assert.deepEqual(snapshot.compatibility, evaluateProfileCompatibility(service.capabilities), "judged as it is published");
    assert.equal(snapshot.candidateStatus?.stateName, CANDIDATE_STATE_NAMES[service.state.candidateStatus?.state ?? -1]);
    snapshot.capabilities.compiledLayerCount = 0;
    snapshot.layout.layers.length = 0;
    snapshot.diagnostics.push("changed by the panel");
    snapshot.devices[0].label = "changed by the panel";
    assert.notEqual(service.capabilities?.compiledLayerCount, 0);
    assert.notEqual(service.state.layout?.layers.length, 0);
    assert.ok(!service.diagnostics.includes("changed by the panel"));
    assert.notEqual(service.devices[0].label, "changed by the panel");
});

test("a state the protocol does not name is published as unknown, and an idle apply as idle alone", async t => {
    const {service} = await connectedService(t);
    const state = service.state;
    state.candidateStatus = {...state.candidateStatus, state: 250};
    assert.equal(state.published().candidateStatus?.stateName, "UNKNOWN_250");
    state.liveApply = {state: "idle", steps: ["left over"]};
    assert.deepEqual(state.published().liveApply, {state: "idle"});
    const view = {id: 1, state: "applying", steps: [], bytes: {completed: 1, total: 2}};
    state.liveApply = view;
    const published = state.published().liveApply;
    assert.deepEqual(published, view);
    assert.notEqual(published, view);
});

test("adopting a profile builds the editors' views of it", async t => {
    const {service} = await connectedService(t);
    const read = await service.readPortableProfile();
    assert.equal(service.portable, undefined);
    service.state.adoptPortable(read);
    assert.equal(service.portable, read);
    const {settingsView, macroView, customKeyView} = service.state;
    assert.deepEqual({settingsView, macroView, customKeyView}, editorViews(read, service.capabilities));
});

test("a connection that ends leaves nothing of it, and is no longer listened to", async t => {
    const {service, adapter} = await connectedService(t);
    await service.readKeyboardProfile();
    service.state.clear();
    assert.deepEqual({...service.state}, {...new ConnectionState()}, "as a state never connected");
    assert.equal(service.snapshot().connected, false);
    adapter.lastConnection().emitDisconnect(new Error("Unplugged"));
    assert.equal(service.snapshot().error, null, "its loss is not the service's to report");
    assert.equal(service.takeLost(), undefined);
});

test("a clone shares nothing with what it copies", () => {
    const value = {a: [1, {b: 2}]};
    const copy = clone(value);
    assert.deepEqual(copy, value);
    copy.a[1].b = 3;
    assert.equal(value.a[1].b, 2);
});
