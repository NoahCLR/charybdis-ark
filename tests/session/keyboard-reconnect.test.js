"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {RECONNECT_WORDS, renamedTo, expectReconnect, endReconnect, reconnectTarget, awaitReconnect} = require("../../core/session/keyboard-reconnect");
const {draftEdit} = require("../fixtures/draft-edit");
const {fingerprint, summary} = require("../../core/model/portable-profile");
const {document} = require("../fixtures/portable-profile");
const {fakeKeyboard} = require("../fixtures/fake-keyboard");
const {connectedService} = require("../fixtures/connected-service");
const {openPanelLoop} = require("../../core/session/panel-loop");
const {fakeShell, testClock} = require("../fixtures/panel-loop");

const snapshot = (value) => ({document: value, fingerprint: fingerprint(value), summary: summary(value)});
const named = (name, base = snapshot(document())) => snapshot(draftEdit(base, {type: "renameKeyboard", name}));

test("a save renames the keyboard only when the stored name changes", () => {
    const plain = snapshot(document()), desk = named("Desk");
    assert.equal(renamedTo(plain, desk), "Desk");
    assert.equal(renamedTo(desk, plain), "", "clearing the name gives back the built-in one");
    assert.equal(renamedTo(desk, named("Desk")), null);
    assert.equal(renamedTo(plain, plain), null);
    assert.equal(renamedTo(undefined, desk), "Desk", "a recovery with no previous name may restart USB");
    assert.equal(renamedTo({...plain, incomplete: true}, desk), "Desk");
    assert.equal(renamedTo(desk, undefined), null);
});

test("a known serial must match, and browser reconnects exclude other keyboards present before the save", () => {
    const desk = {name: "Desk", serialNumber: "", otherDevices: [{id: "other", product: "Travel"}, {id: "same-name", product: "Desk"}]};
    const returned = {id: "back", product: "Desk"};
    assert.deepEqual(reconnectTarget({name: "Desk", serialNumber: "E4", otherDevices: []},
        [{id: "a", product: "Other", serialNumber: "DE"}, {id: "b", product: "Charybdis", serialNumber: "E4"}]),
        {device: {id: "b", product: "Charybdis", serialNumber: "E4"}});
    assert.equal(reconnectTarget({name: "Desk", serialNumber: "E4", otherDevices: []}, [{id: "a", product: "Desk", serialNumber: "DE"}]), null);
    assert.equal(reconnectTarget({name: "Desk", serialNumber: "E4", otherDevices: []}, [returned]), null, "never abandon a known serial for a name match");
    assert.equal(reconnectTarget(desk, [{id: "other", product: "Travel"}]), null, "a pre-existing keyboard is not the renamed one");
    assert.equal(reconnectTarget(desk, [{id: "same-name", product: "Desk"}]), null, "even when the other keyboard already has the target name");
    assert.deepEqual(reconnectTarget({...desk, otherDevices: [desk.otherDevices[0]]}, [desk.otherDevices[0], returned]), {device: returned});
    assert.deepEqual(reconnectTarget(desk, [returned]), {ambiguous: true}, "a name shared with another known keyboard cannot establish identity");
    assert.deepEqual(reconnectTarget({...desk, otherDevices: []}, [{id: "new", product: "Travel"}]), {ambiguous: true}, "an unknown sole keyboard with the wrong name needs a choice");
    assert.deepEqual(reconnectTarget({...desk, otherDevices: []}, [returned, {id: "another", product: "Desk"}]), {ambiguous: true});
    assert.deepEqual(reconnectTarget({name: "", serialNumber: "", otherDevices: []}, [{id: "new", product: "Charybdis"}]), {ambiguous: true}, "clearing a name does not identify an unknown built-in name");
    assert.equal(reconnectTarget(desk, []), null);
});

// A device service as the wait sees one: a state to change, and what it was asked.
function stubSession(state = {}) {
    const calls = [];
    const current = {connected: true, busy: false, selectedDeviceId: "kb", devices: [{id: "kb", product: "Charybdis (4x6) Splinky", serialNumber: ""}], ...state};
    const service = {calls, state: current, snapshot: () => current,
        enumerate: async () => {calls.push("enumerate");}, expectReconnect: (on) => {calls.push(`expect:${on}`);}};
    return {service};
}

test("a stored rename expects a reconnect even when the USB product already has the target text", () => {
    const session = stubSession(), {now} = testClock();
    assert.equal(expectReconnect(session, null, now), undefined);
    assert.ok(expectReconnect(stubSession(), "Charybdis (4x6) Splinky", now), "empty and explicit built-in names are different stored names");
    const expected = expectReconnect(session, "Desk", now);
    assert.deepEqual(expected, {deviceId: "kb", serialNumber: "", name: "Desk", otherDevices: [], startedAt: 0, dropped: false});
    assert.equal(session.reconnect, expected);
    assert.deepEqual(session.service.calls, ["expect:true"]);
    endReconnect(session, {...expected}, "ignored");
    assert.equal(session.reconnect, expected, "only the current expectation ends");
    endReconnect(session, expected, "said");
    assert.equal(session.reconnect, undefined);
    assert.equal(session.notice, "said");
    assert.deepEqual(session.service.calls, ["expect:true", "expect:false"]);
    assert.equal(expectReconnect(stubSession({connected: false}), "Desk", now), undefined);
    assert.equal(expectReconnect(stubSession({selectedDeviceId: "gone"}), "Desk", now), undefined);
});

test("the renamed keyboard drops off, comes back under its new name and is read again", async () => {
    const session = stubSession(), timing = testClock(), reads = [], published = [];
    const expected = expectReconnect(session, "Desk", timing.now);
    expected.saved = "Complete profile applied. Recovery copy: /r.json";
    let ticks = 0;
    const sleep = async (ms) => {
        await timing.sleep(ms);
        ticks++;
        if (ticks === 2) Object.assign(session.service.state, {connected: false, selectedDeviceId: "", devices: []});
        if (ticks === 4) session.service.state.devices = [{id: "kb-2", product: "Desk", serialNumber: ""}];
    };
    await awaitReconnect(session, expected, {sleep, now: timing.now, publish: () => published.push(session.reconnect?.dropped),
        read: async (id) => {reads.push(id); Object.assign(session.service.state, {connected: true, selectedDeviceId: id});}});
    assert.deepEqual(reads, ["kb-2"]);
    assert.equal(session.reconnect, undefined);
    assert.equal(session.notice, `Complete profile applied. Recovery copy: /r.json ${RECONNECT_WORDS.back("Desk")}`);
    assert.equal(published[0], true, "the panel is told as soon as the keyboard drops");
    assert.deepEqual(session.service.calls, ["expect:true", "enumerate", "enumerate", "enumerate", "expect:false"], "the list is polled until it is back");
});

test("a safe restart may be delayed beyond ten seconds; only the return wait is bounded", async () => {
    {
        const session = stubSession(), timing = testClock(), reads = [];
        const expected = expectReconnect(session, "Desk", timing.now);
        const sleep = async (ms) => {
            await timing.sleep(ms);
            if (timing.now() === 15000) {
                assert.equal(session.reconnect, expected, "the keyboard can still be waiting for a held key or macro");
                assert.deepEqual(session.service.calls, ["expect:true"]);
                Object.assign(session.service.state, {connected: false, devices: []});
            }
            if (timing.now() === 15500) session.service.state.devices = [{id: "back", product: "Desk"}];
        };
        await awaitReconnect(session, expected, {sleep, now: timing.now, publish: () => {}, read: async (id) => {
            reads.push(id); session.service.state.connected = true;
        }});
        assert.equal(session.reconnect, undefined);
        assert.equal(session.notice, RECONNECT_WORDS.back("Desk"));
        assert.equal(timing.now(), 15500);
        assert.deepEqual(reads, ["back"]);
    }
    {
        const session = stubSession({connected: false, devices: []}), timing = testClock();
        const expected = expectReconnect(stubSession(), "Desk", timing.now);
        session.reconnect = expected;
        await awaitReconnect(session, expected, {...timing, publish: () => {}, read: async () => {throw new Error("nothing to read");}});
        assert.equal(session.notice, RECONNECT_WORDS.timeout);
        assert.ok(timing.now() >= 10000 && timing.now() <= 11000);
    }
    {
        const session = stubSession({connected: false, devices: [{id: "a", product: "Charybdis"}, {id: "b", product: "Charybdis"}]}), timing = testClock(), reads = [];
        const expected = {deviceId: "kb", serialNumber: "", name: "Desk", otherDevices: [], startedAt: 0, dropped: false};
        session.reconnect = expected;
        await awaitReconnect(session, expected, {...timing, publish: () => {}, read: async (id) => {reads.push(id);}});
        assert.equal(session.notice, RECONNECT_WORDS.ambiguous);
        assert.deepEqual(reads, [], "never silently picks one of two");
    }
});

test("the return wait ignores the other keyboard left connected until the renamed one is back", async () => {
    for (const product of ["Travel", "Desk"]) {
        const other = {id: "other", product};
        const session = stubSession(), timing = testClock(), reads = [];
        session.service.state.devices.push(other);
        const expected = expectReconnect(session, "Desk", timing.now);
        let ticks = 0;
        const sleep = async (ms) => {
            await timing.sleep(ms);
            ticks++;
            session.service.state.connected = false;
            session.service.state.devices = ticks < 3 ? [other] : [other, {id: "back", product: "Desk"}];
        };
        await awaitReconnect(session, expected, {sleep, now: timing.now, publish: () => {}, read: async (id) => {
            reads.push(id); session.service.state.connected = true;
        }});
        assert.ok(ticks >= 3, "the other keyboard alone must not finish the wait");
        assert.deepEqual(reads, product === "Travel" ? ["back"] : []);
        assert.equal(session.notice, product === "Travel" ? RECONNECT_WORDS.back("Desk") : RECONNECT_WORDS.ambiguous);
    }
});

test("failed enumeration never reconnects from a stale list, and the timeout preserves the recovery notice", async () => {
    const session = stubSession(), timing = testClock(), reads = [];
    const expected = expectReconnect(session, "Desk", timing.now);
    expected.saved = "Saved. Recovery copy: /r.json";
    session.service.state.connected = false;
    session.service.state.devices = [{id: "stale", product: "Desk"}];
    session.service.enumerate = async () => {throw new Error("listing unavailable");};
    await awaitReconnect(session, expected, {...timing, publish: () => {}, read: async (id) => reads.push(id)});
    assert.deepEqual(reads, []);
    assert.equal(session.notice, `${expected.saved} ${RECONNECT_WORDS.timeout}`);
    assert.equal(session.reconnect, undefined);
});

test("the wait gives way to the person, waits out a running operation, and says when reading it again failed", async () => {
    {
        const session = stubSession({connected: false, devices: []}), timing = testClock();
        const expected = {deviceId: "kb", serialNumber: "", name: "Desk", otherDevices: [], startedAt: 0, dropped: false};
        session.reconnect = expected;
        const sleep = async (ms) => {await timing.sleep(ms); session.reconnect = undefined;};
        await awaitReconnect(session, expected, {sleep, now: timing.now, publish: () => {}, read: async () => {throw new Error("not read");}});
        assert.equal(session.notice, undefined, "a cancelled wait says nothing");
    }
    {
        const session = stubSession({connected: false, busy: true, devices: [{id: "a", product: "Desk"}]}), timing = testClock(), reads = [];
        const expected = {deviceId: "kb", serialNumber: "", name: "Desk", otherDevices: [], startedAt: 0, dropped: true};
        session.reconnect = expected;
        const sleep = async (ms) => {await timing.sleep(ms); if (timing.now() >= 1500) session.service.state.busy = false;};
        await awaitReconnect(session, expected, {sleep, now: timing.now, publish: () => {},
            read: async (id) => {reads.push(id); session.service.state.error = {message: "no answer"};}});
        assert.deepEqual(reads, ["a"], "read once the running operation ended");
        assert.equal(session.notice, RECONNECT_WORDS.failed);
    }
    {
        // A read that connected but did not come back ready (its complete
        // profile could not be read, though no error stayed behind) failed.
        const session = stubSession({connected: false, devices: [{id: "a", product: "Desk"}]}), timing = testClock();
        const expected = {deviceId: "kb", serialNumber: "", name: "Desk", otherDevices: [], startedAt: 0, dropped: true};
        session.reconnect = expected;
        await awaitReconnect(session, expected, {...timing, publish: () => {},
            read: async (id) => {Object.assign(session.service.state, {connected: true, selectedDeviceId: id}); return false;}});
        assert.equal(session.notice, RECONNECT_WORDS.failed);
    }
});

test("an expected disconnect is no error to the device service; an unexpected one still is", async (t) => {
    for (const expected of [true, false]) {
        const {service, adapter} = await connectedService(t);
        service.expectReconnect(expected);
        adapter.lastConnection().emitDisconnect();
        const state = service.snapshot();
        assert.equal(state.connected, false);
        if (expected) {
            assert.equal(state.error, null);
            assert.match(state.diagnostics.at(-1), /disconnected to take its new name/);
        } else assert.match(state.error.message, /disconnected/);
    }
    const {service, adapter} = await connectedService(t);
    service.expectReconnect(true);
    const read = service.readLayout();
    adapter.lastConnection().emitDisconnect();
    await assert.rejects(read, "an interrupted read still rejects");
    assert.equal(service.snapshot().error, null, "but is not reported as the keyboard failing");
    await service.enumerate();
    await service.connect(service.snapshot().devices[0].id);
    assert.equal(service.reconnectExpected, false, "a new connection ends the expectation");
});

test("in the panel loop, a renamed keyboard is followed through its restart and read again under its new name", async (t) => {
    const shell = fakeShell(), posted = shell.posted, clock = testClock();
    const {service, adapter} = await connectedService(t);
    const loop = openPanelLoop(shell, {service, reconnect: {sleep: clock.sleep, now: clock.now}});
    await loop.handleMessage({type: "refresh"});
    const before = loop.session.draft;
    assert.ok(before, "a complete read opened the draft");
    assert.equal(posted.at(-1).model.devices[0].label, "Charybdis 4x6");

    // As after an Apply that renamed it: the keyboard holds the new name and
    // restarts USB, coming back as a new device with the same serial number.
    const renamed = named("Desk", before.base);
    adapter.keyboard = fakeKeyboard({document: renamed.document});
    loop.session.reconnect = undefined;
    assert.ok(expectReconnect(/** @type {any} */ (loop.session), "Desk", clock.now));
    await loop.handleMessage({type: "openProfileDraftHistory"});
    adapter.lastConnection().emitDisconnect(new Error("USB restarted."));
    assert.equal(service.snapshot().error, null, "no error while it restarts");
    adapter.devices = [{id: "fake-charybdis-2", product: "Desk", manufacturer: "Bastard Keyboards", serialNumber: "FAKE-1"}];
    loop.serviceChanged();
    assert.deepEqual(posted.at(-1).model.reconnecting, {name: "Desk", lost: false});
    assert.equal(posted.at(-1).model.load.state, "loading");
    assert.equal(posted.at(-1).model.load.progress, RECONNECT_WORDS.waiting);
    await loop.reconnected();
    const model = posted.at(-1).model;
    assert.equal(loop.session.reconnect, undefined);
    assert.equal(model.reconnecting, null);
    assert.equal(model.device.connected, true);
    assert.equal(model.device.label, "Desk");
    assert.deepEqual(model.devices.map(({label}) => label), ["Desk"]);
    assert.equal(model.keyboardName.name, "Desk");
    assert.equal(model.load.state, "ready");
    assert.equal(posted.filter((message) => message.notice).at(-1).notice, RECONNECT_WORDS.back("Desk"));
});
