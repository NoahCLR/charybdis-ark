"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const {PHASE} = require("../../core/model/vocabulary");
const {fixture} = require("../fixtures/portable-restore");
const {connectedService} = require("../fixtures/connected-service");
const {PROFILE_WIRE_V1} = require("../../core/protocol/profile-wire-v1");

function deferred() {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return {promise, resolve};
}
const connected = (t, keyboard, options) => connectedService(t, keyboard ? {keyboard} : {}, options);

test("required overlap refuses before changing the owner's read state or sending requests", async t => {
    const {service, adapter, id} = await connected(t);
    await service.readLayout();
    const gate = deferred(); t.after(gate.resolve);
    const owner = service.runOperation(PHASE.READ_PROFILE, () => gate.promise);
    const before = service.snapshot(), writes = adapter.lastConnection().writes.length;
    try {
        for (const call of [() => service.enumerate(), () => service.refresh(), () => service.readLayout(),
            () => service.readCommittedProfile(), () => service.connect(id)]) {
            await assert.rejects(call(), error => error.code === "SERVICE_BUSY");
            const after = service.snapshot();
            assert.equal(after.busy, true);
            assert.equal(after.operationId, before.operationId);
            assert.equal(after.phase, before.phase);
            assert.deepEqual(after.layout, before.layout);
            assert.deepEqual(after.committed, before.committed);
            assert.equal(after.connected, true);
            assert.equal(adapter.lastConnection().writes.length, writes);
        }
    } finally {gate.resolve(); await owner;}
    assert.equal(service.snapshot().busy, false);
});

test("optional overlap resolves explicitly without clearing an earlier error or releasing the owner", async t => {
    const {service, adapter} = await connected(t);
    const gate = deferred(); t.after(gate.resolve);
    const owner = service.runOperation(PHASE.READ_PROFILE, () => gate.promise);
    service.setError(Error("Earlier profile failure"));
    const before = service.snapshot(), writes = adapter.lastConnection().writes.length;
    try {
        for (const read of [() => service.readCombos(), () => service.readBaseRgb()]) {
            const state = await read();
            assert.equal(state.busy, true);
            assert.equal(state.operationId, before.operationId);
            assert.equal(state.phase, before.phase);
            assert.equal(state.error.message, "Earlier profile failure");
            assert.deepEqual(state.combos, before.combos);
            assert.deepEqual(state.baseRgb, before.baseRgb);
            assert.match(state.diagnostics.at(-1), /current operation/);
            assert.equal(adapter.lastConnection().writes.length, writes);
        }
    } finally {gate.resolve(); await owner;}
});

for (const explicit of [false, true]) test(`${explicit ? "explicit" : "physical"} disconnect keeps busy until the active operation unwinds`, async t => {
    const {service, adapter, id} = await connected(t);
    const gate = deferred(); t.after(gate.resolve);
    const owner = service.runOperation(PHASE.READ_PROFILE, () => gate.promise);
    if (explicit) await service.disconnect(); else adapter.lastConnection().emitDisconnect(Error("Unplugged"));
    assert.equal(service.snapshot().connected, false);
    assert.equal(service.snapshot().busy, true);
    await assert.rejects(service.connect(id), error => error.code === "SERVICE_BUSY");
    gate.resolve(); await owner;
    assert.equal(service.snapshot().busy, false);
    assert.equal((await service.connect(id)).connected, true, "the finished owner cannot clear a later connection");
});

for (const fails of [false, true]) test(`restore owns its trailing health read after ${fails ? "failure" : "success"}`, async t => {
    let trailing = false;
    const f = fixture(), {service, adapter} = await connected(t, f.keyboard,
        {onApplyProgress: view => { if (view.state === "done") trailing = true; }});
    const entered = deferred(), finish = deferred(); t.after(finish.resolve);
    const respond = adapter.onWrite;
    adapter.onWrite = async write => {
        if (trailing && write.report[0] === PROFILE_WIRE_V1.COMMAND_GET && write.report[2] === PROFILE_WIRE_V1.VALUE_STATUS) {
            entered.resolve(); await finish.promise;
        }
        return respond(write);
    };
    const options = fails ? {...f.options, saveRecovery: async () => {trailing = true; throw Error("Recovery refused");}} : f.options;
    const restore = service.restorePortableProfile(f.targetDocument, options);
    const outcome = restore.then(value => ({value}), error => ({error}));
    await entered.promise;
    assert.equal(service.snapshot().busy, true);
    const id = service.snapshot().operationId;
    await assert.rejects(service.enumerate(), error => error.code === "SERVICE_BUSY");
    assert.equal(service.snapshot().operationId, id);
    finish.resolve();
    const result = await outcome;
    assert.equal(Boolean(result.error), fails);
    assert.equal(service.snapshot().busy, false);
});

for (const [method, field, phase] of [["readCombos", "combos", PHASE.READ_COMBOS], ["readBaseRgb", "baseRgb", PHASE.READ_BASE_RGB]]) {
    test(`${method} owns the service and publishes its reading state before its first request`, async t => {
        const changes = [], {service, adapter} = await connected(t, undefined, {onChange: state => changes.push(state)});
        const entered = deferred(), finish = deferred(); t.after(finish.resolve);
        const respond = adapter.onWrite;
        adapter.onWrite = async write => {entered.resolve(); await finish.promise; return respond(write);};
        service.setError(Error("Earlier profile failure"));
        const read = service[method]();
        await entered.promise;
        assert.equal(service.snapshot().busy, true);
        assert.equal(service.snapshot().phase, phase);
        assert.equal(changes.at(-1)[field].state, "reading");
        const operationId = service.snapshot().operationId;
        const refused = await service[method]();
        assert.equal(refused.operationId, operationId);
        assert.equal(refused[field].state, "reading", "contention cannot replace the owner's read");
        assert.equal(refused.error.message, "Earlier profile failure");
        finish.resolve();
        const completed = await read;
        assert.equal(completed.busy, false);
        assert.equal(completed[field].state, "read");
        assert.equal(completed.error.message, "Earlier profile failure");
    });
}
