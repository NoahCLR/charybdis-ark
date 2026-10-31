"use strict";
// What the device service holds of one connection, through its interface:
// opened, written only through the writer held for the connection, cleared
// as one when it ends, and published as copies the panel can keep.
const assert = require("node:assert/strict");
const test = require("node:test");
const {connectedService} = require("../fixtures/connected-service");
const {CANDIDATE_STATE_NAMES} = require("../../core/protocol/profile-candidate-v1");
const {evaluateProfileCompatibility} = require("../../core/session/firmware-support");
const {editorViews} = require("../../core/model/profile-model");
const {publicError} = require("../../core/session/operation-failure");
const {ConnectionState, clone} = require("../../core/session/connection-state");

// A connection as the request coordinator gives one: connected until it is
// not, and heard when it is lost until the listener is disposed.
function connection() {
    const listeners = new Set();
    return {
        connected: true,
        /** @param {(reason: unknown) => void} listener */
        onDisconnect(listener) {listeners.add(listener); return () => listeners.delete(listener);},
        lose(reason = new Error("Unplugged")) {this.connected = false; for (const listener of listeners) listener(reason);},
        get listening() {return listeners.size;},
    };
}

/** @param {ReturnType<typeof connection>} [held] @param {Partial<{publicId: string, token: number, onLoss: (reason: unknown) => void}>} [options] */
function opened(held = connection(), {publicId = "kb-1", token = 1, onLoss = () => {}} = {}) {
    const state = new ConnectionState();
    state.open(/** @type {any} */ (held), {publicId, token, requestIds: {next: () => 1}, onLoss});
    return {state, held};
}

const MODE = {mode: 1, counter: 3, slaveMode: 1, slaveCounter: 3, slaveKnown: true, conflict: false, agreed: true};
const STATUS = {activeKind: 1};

test("a snapshot publishes the connection's state as copies the panel can keep", async t => {
    const {service, id} = await connectedService(t);
    await service.readKeyboardProfile();
    const published = service.state.published();
    const snapshot = service.snapshot();
    for (const [key, value] of Object.entries(published)) assert.deepEqual(snapshot[key], value, key);
    assert.equal(snapshot.connected, true);
    assert.equal(snapshot.selectedDeviceId, id);
    assert.deepEqual(snapshot.compatibility, evaluateProfileCompatibility(service.capabilities), "judged as it is published");
    assert.equal(snapshot.candidateStatus?.stateName, CANDIDATE_STATE_NAMES[snapshot.candidateStatus?.state ?? -1]);
    snapshot.capabilities.compiledLayerCount = 0;
    snapshot.layout.layers.length = 0;
    snapshot.diagnostics.push("changed by the panel");
    snapshot.devices[0].label = "changed by the panel";
    assert.notEqual(service.capabilities?.compiledLayerCount, 0);
    assert.notEqual(service.snapshot().layout?.layers.length, 0);
    assert.ok(!service.diagnostics.includes("changed by the panel"));
    assert.notEqual(service.devices[0].label, "changed by the panel");
});

test("a writer from a connection that ended writes nothing into the next one", () => {
    const {state} = opened();
    const before = state.of();
    before.keep({status: STATUS});
    state.clear();
    state.open(/** @type {any} */ (connection()), {publicId: "kb-2", token: 2, requestIds: {next: () => 1}, onLoss: () => {}});
    const fresh = opened(connection(), {publicId: "kb-2", token: 2}).state.published();
    assert.equal(before.current, false);
    assert.equal(before.keep({status: {activeKind: 3}, lastRefreshedAt: "then"}), false);
    assert.equal(before.adopt(/** @type {any} */ ({document: {}})), false);
    assert.equal(before.mode({read: MODE}), false);
    assert.equal(before.failed("combos", new Error("late")), false);
    before.reading("layout");
    before.showing("Saving on both halves");
    before.liveApply = {id: 1, state: "applying", steps: [], bytes: {completed: 1, total: 2}};
    assert.deepEqual(state.published(), fresh, "as if the ended connection had never written");
    assert.equal(state.of().current, true);
});

test("a lost connection keeps nothing more of what the keyboard says, and adopts no profile", () => {
    const {state, held} = opened();
    const writer = state.of();
    held.connected = false;
    const lost = state.published();
    assert.equal(writer.current, false);
    assert.equal(writer.keep({status: STATUS}), false);
    assert.equal(writer.adopt(/** @type {any} */ ({document: {}})), false);
    assert.equal(state.portable, undefined);
    assert.deepEqual(state.published(), lost);
});

test("what the keyboard says is kept as said, the combos and background effect stamped as read", () => {
    const {state} = opened();
    const writer = state.of();
    const combos = {enabled: true, layerReferences: [], version: 1, defaultTermMs: 50, holdTermMs: 200, rows: []};
    const baseRgb = {effectId: 1, brightness: 2, hue: 3, saturation: 4, speed: 5};
    assert.equal(writer.keep({status: STATUS, combos, baseRgb, lastRefreshedAt: "now"}), true);
    const published = state.published();
    assert.deepEqual(published.status, STATUS);
    assert.equal(published.lastRefreshedAt, "now");
    assert.deepEqual({...published.combos, readAt: undefined}, {state: "read", ...combos, readAt: undefined});
    assert.deepEqual({...published.baseRgb, readAt: undefined}, {state: "read", ...baseRgb, readAt: undefined});
    assert.ok(published.combos?.readAt && published.baseRgb?.readAt);
});

test("only what a keyboard says is kept: the profile is adopted and the edit mode follows its events", () => {
    const writer = opened().state.of();
    for (const key of ["portable", "editMode", "editModeUnknown", "connection", "liveApply"]) {
        assert.throws(() => writer.keep(/** @type {any} */ ({[key]: {}})), TypeError, key);
    }
});

test("adopting a profile builds the editors' views of it, and new capabilities build them again", async t => {
    const {service} = await connectedService(t);
    const read = await service.readPortableProfile();
    const capabilities = /** @type {import("../../core/session/types.js").DeviceCapabilities} */ (service.capabilities);
    const {state} = opened();
    const writer = state.of();
    writer.keep({capabilities});
    assert.equal(writer.adopt(read), true);
    assert.equal(state.portable, read);
    const views = () => {const {settingsView, macroView, customKeyView} = state.published(); return {settingsView, macroView, customKeyView};};
    assert.deepEqual(views(), clone(editorViews(read, capabilities)));
    const unknownAbi = {...capabilities, actionAbiDigest: 0};
    writer.keep({capabilities: unknownAbi});
    assert.notDeepEqual(views(), clone(editorViews(read, capabilities)), "custom keys follow the firmware's action ABI");
    assert.deepEqual(views(), clone(editorViews(read, unknownAbi)));
});

test("a read starts, counts, and fails as unavailable while connected, cleared once lost, and nothing once replaced", () => {
    const {state, held} = opened();
    const writer = state.of();
    writer.reading("layout");
    writer.progress("layout", {done: 1, total: 4});
    assert.deepEqual(state.published().layout, {state: "reading", progress: {done: 1, total: 4}, layers: [], readAt: ""});
    writer.reading("committed");
    writer.progress("committed", {done: 2, total: 4});
    assert.deepEqual(state.published().committed, {state: "reading", progress: {done: 2, total: 4}});
    assert.equal(writer.failed("layout", new Error("No answer")), true);
    assert.deepEqual(state.published().layout, {state: "unavailable", error: publicError(new Error("No answer")), layers: [], progress: null});
    writer.reading("combos");
    assert.equal(writer.failed("combos", new Error("No answer")), true);
    assert.equal(state.published().combos?.state, "unavailable");
    held.connected = false;
    assert.equal(writer.failed("combos", new Error("Unplugged")), false);
    assert.equal(state.published().combos, null, "cleared once lost");
    state.clear();
    state.open(/** @type {any} */ (connection()), {publicId: "kb-2", token: 2, requestIds: {next: () => 1}, onLoss: () => {}});
    state.of().reading("baseRgb");
    assert.equal(writer.failed("baseRgb", new Error("late")), false);
    assert.deepEqual(state.published().baseRgb, {state: "reading"}, "the next connection's read is its own");
});

test("an operation's words go when it ends", () => {
    const {state} = opened();
    const writer = state.of();
    writer.showing("Saving on both halves");
    assert.equal(state.published().portableProgress, "Saving on both halves");
    writer.end();
    assert.equal(state.published().portableProgress, "");
});

test("the edit mode follows what happened to it, and an unknown one is none", () => {
    const notStored = {...MODE, notStored: false};
    const unhandled = Object.assign(new Error("no edit mode"), {code: "UNHANDLED"});
    const timeout = Object.assign(new Error("timed out"), {code: "TIMEOUT"});
    /** @type {[string, import("../../core/session/connection-state.js").ModeEvent[], import("../../core/session/connection-state.js").ModeEvent, {mode: object | null, unknown: boolean, changed: boolean}][]} */
    const cases = [
        ["a read with nothing said of its write owes none", [], {read: MODE}, {mode: notStored, unknown: false, changed: true}],
        ["a read keeps what was said of its write", [{read: MODE}, {notStored: true}], {read: {...MODE, mode: 2}}, {mode: {...MODE, mode: 2, notStored: true}, unknown: false, changed: true}],
        ["a set says it anew", [{read: MODE}, {notStored: true}], {set: {...MODE, notStored: false}}, {mode: notStored, unknown: false, changed: true}],
        ["a failure is unknown, tried again", [{read: MODE}], {failed: timeout}, {mode: null, unknown: true, changed: true}],
        ["a firmware without one has none", [{failed: timeout}], {failed: unhandled}, {mode: null, unknown: false, changed: false}],
        ["a read makes an unknown one known", [{failed: timeout}], {read: MODE}, {mode: notStored, unknown: false, changed: true}],
        ["absent until read again", [{failed: timeout}], {absent: true}, {mode: null, unknown: false, changed: false}],
        ["a live read says its mode", [{read: MODE}], {seen: 2}, {mode: {...notStored, mode: 2}, unknown: false, changed: true}],
        ["the same mode seen changes nothing", [{read: MODE}], {seen: 1}, {mode: notStored, unknown: false, changed: false}],
        ["seen without an edit mode is nothing", [], {seen: 2}, {mode: null, unknown: false, changed: false}],
        ["a write said owed changes it", [{read: MODE}], {notStored: true}, {mode: {...MODE, notStored: true}, unknown: false, changed: true}],
        ["a write said as before changes nothing", [{read: MODE}], {notStored: false}, {mode: notStored, unknown: false, changed: false}],
        ["owed without an edit mode is nothing", [{failed: timeout}], {notStored: true}, {mode: null, unknown: true, changed: false}],
    ];
    for (const [name, before, event, expected] of cases) {
        const {state} = opened();
        const writer = state.of();
        for (const earlier of before) writer.mode(earlier);
        const changed = writer.mode(event);
        assert.deepEqual({mode: state.published().editMode, unknown: writer.editModeUnknown, changed}, expected, name);
        assert.ok(!writer.editModeUnknown || !writer.editMode, `${name}: unknown is none`);
    }
});

test("a state the protocol does not name is published as unknown, and an idle apply as idle alone", () => {
    const {state} = opened();
    const writer = state.of();
    writer.keep({candidateStatus: /** @type {any} */ ({state: 250, slaveKnown: true})});
    assert.equal(state.published().candidateStatus?.stateName, "UNKNOWN_250");
    writer.liveApply = /** @type {any} */ ({state: "idle", steps: ["left over"]});
    assert.deepEqual(state.published().liveApply, {state: "idle"});
    const view = {id: 1, state: "applying", steps: [], bytes: {completed: 1, total: 2}};
    writer.liveApply = /** @type {any} */ (view);
    const published = state.published().liveApply;
    assert.deepEqual(published, view);
    assert.notEqual(published, view);
});

test("a connection is heard until detached, and one is held at a time", () => {
    const losses = [];
    const {state, held} = opened(connection(), {onLoss: reason => losses.push(reason)});
    assert.throws(() => state.open(/** @type {any} */ (connection()), {publicId: "kb-2", token: 2, requestIds: {next: () => 1}, onLoss: () => {}}), /already held/);
    held.lose();
    assert.equal(losses.length, 1);
    state.detach();
    state.detach();
    assert.equal(held.listening, 0, "detached once, however often asked");
});

test("a connection that ends leaves nothing of it, and is no longer listened to", async t => {
    const {service, adapter} = await connectedService(t);
    await service.readKeyboardProfile();
    service.state.clear();
    assert.deepEqual(service.state.published(), new ConnectionState().published(), "as a state never connected");
    assert.equal(service.snapshot().connected, false);
    adapter.lastConnection().emitDisconnect(new Error("Unplugged"));
    assert.equal(service.snapshot().error, null, "its loss is not the service's to report");
    assert.equal(service.takeLost(), undefined);
});

test("what the service holds is read-only but for the apply's steps and the missed looks", () => {
    const {state} = opened();
    for (const holder of [state, state.of()]) {
        const prototype = Object.getPrototypeOf(holder);
        for (const [name, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(prototype))) {
            if (descriptor.get) assert.equal(descriptor.set, undefined, name);
        }
        assert.deepEqual(Object.keys(holder), holder === state ? [] : ["liveApply", "missedLooks"]);
        assert.throws(() => {/** @type {any} */ (holder).capabilities = {};}, TypeError);
    }
});

test("a clone shares nothing with what it copies", () => {
    const value = {a: [1, {b: 2}]};
    const copy = clone(value);
    assert.deepEqual(copy, value);
    copy.a[1].b = 3;
    assert.equal(value.a[1].b, 2);
});
