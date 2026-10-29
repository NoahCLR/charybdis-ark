"use strict";
// What the device service publishes: its state as the panel draws it, every
// part a copy.
const assert = require("node:assert/strict");
const test = require("node:test");
const {connectedService} = require("../fixtures/connected-service");
const {CANDIDATE_STATE_NAMES} = require("../../core/protocol/profile-candidate-v1");
const {evaluateProfileCompatibility} = require("../../core/session/firmware-support");
const {serviceSnapshot, clone} = require("../../core/session/service-snapshot");

test("a snapshot is the service's state as copies the panel can keep", async t => {
    const {service, id} = await connectedService(t);
    const snapshot = serviceSnapshot(service);
    assert.deepEqual(snapshot, service.snapshot());
    assert.equal(snapshot.connected, true);
    assert.equal(snapshot.selectedDeviceId, id);
    assert.deepEqual(snapshot.compatibility, evaluateProfileCompatibility(service.capabilities), "judged as it is published");
    assert.equal(snapshot.candidateStatus?.stateName, CANDIDATE_STATE_NAMES[service.candidateStatus?.state ?? -1]);
    snapshot.capabilities.compiledLayerCount = 0;
    snapshot.diagnostics.push("changed by the panel");
    snapshot.devices[0].label = "changed by the panel";
    assert.notEqual(service.capabilities?.compiledLayerCount, 0);
    assert.ok(!service.diagnostics.includes("changed by the panel"));
    assert.notEqual(service.devices[0].label, "changed by the panel");
});

test("a state the protocol does not name is published as unknown, and an idle apply as idle alone", async t => {
    const {service} = await connectedService(t);
    service.candidateStatus = {...service.candidateStatus, state: 250};
    assert.equal(serviceSnapshot(service).candidateStatus?.stateName, "UNKNOWN_250");
    service.liveApply = {state: "idle", steps: ["left over"]};
    assert.deepEqual(serviceSnapshot(service).liveApply, {state: "idle"});
    const view = {id: 1, state: "applying", steps: [], bytes: {completed: 1, total: 2}};
    service.liveApply = view;
    const published = serviceSnapshot(service).liveApply;
    assert.deepEqual(published, view);
    assert.notEqual(published, view);
});

test("a clone shares nothing with what it copies", () => {
    const value = {a: [1, {b: 2}]};
    const copy = clone(value);
    assert.deepEqual(copy, value);
    copy.a[1].b = 3;
    assert.equal(value.a[1].b, 2);
});
