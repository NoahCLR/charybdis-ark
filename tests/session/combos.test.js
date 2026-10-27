"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const {connectedService} = require("../fixtures/connected-service");
const {buildDeviceModel} = require("../../core/session/device-model");
const {fixturePages, responseFor} = require("../fixtures/device-combos");

// What QMK answers when nothing handles a report: the request echoed back with
// byte 0 set to id_unhandled.
const unhandled = (request) => Object.assign(Buffer.from(request), {0: 0xff});

test("combo snapshots publish readable native keys and clear stale rows after failure or disconnect", async t => {
    const {service, adapter} = await connectedService(t);
    let fail = false;
    adapter.keyboard = {...adapter.keyboard, answer: request => [fail ? unhandled(request) : responseFor(request, fixturePages())]};
    service.setError(Error("Earlier profile failure"));
    let state = await service.readCombos();
    const model = buildDeviceModel(state);
    assert.equal(model.combos.length, 2);
    assert.equal(model.combos[0].badge, "C0");
    assert.equal(model.combos[1].outputDisplay, "GUI+A");
    assert.deepEqual(model.combos[1].inputDisplays, ["GUI+C", "GUI+V"]);
    assert.equal(model.comboReadback.enabled, true);
    state.combos.rows[0].inputs[0] = 99;
    assert.equal(service.snapshot().combos.rows[0].inputs[0], 7);
    fail = true;
    state = await service.readCombos();
    assert.equal(state.combos.error.code, "COMBO_UNSUPPORTED");
    assert.equal(buildDeviceModel(state).combos.length, 0);
    assert.equal(state.error.message, "Earlier profile failure");
    adapter.lastConnection().emitDisconnect(Error("Unplugged"));
    assert.equal(service.snapshot().combos, null);
});
