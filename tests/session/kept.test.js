"use strict";
// What Ark keeps per keyboard: each case says which keyboard a record is for
// after it is remembered, followed to a new device id, or forgotten.
const test = require("node:test");
const assert = require("node:assert/strict");
const {followKeyboard, forget, keptFor, keptForAny, remember} = require("../../core/session/kept");

const listed = (selectedDeviceId, devices) => ({selectedDeviceId, devices});
const desk = {id: "desk", serialNumber: "E4"}, travel = {id: "travel", serialNumber: "T1"};
const restart = {recovery: "/recovery/1.json", slaveAcknowledged: true};
const cut = {edits: "abc", recovery: "/recovery/2.json"};
const before = {document: {format: "charybdis-profile"}, savedAt: "2026-10-29T00:00:00.000Z"};

test("a record is for the keyboard it was remembered for, the selected one by default", () => {
    const session = {}, state = listed("desk", [desk, travel]);
    remember(session, "restart", restart, state);
    remember(session, "saveCutShort", cut, state, "travel");
    assert.equal(keptFor(session, "restart", state)?.recovery, restart.recovery);
    assert.equal(keptFor(session, "restart", listed("travel", [desk, travel])), undefined, "another keyboard has none");
    assert.equal(keptFor(session, "saveCutShort", state), undefined);
    assert.equal(keptFor(session, "saveCutShort", state, "travel")?.edits, cut.edits);
    assert.equal(keptForAny(session, "saveCutShort")?.edits, cut.edits, "whichever keyboard it is for");
    assert.equal(keptForAny(session, "beforeApply"), undefined);
});

test("a restart and a Save cut short know their keyboard by its serial number under a new device id; the copy from before an Apply does not", () => {
    const session = {}, state = listed("desk", [desk]), moved = listed("desk-2", [{id: "desk-2", serialNumber: "E4"}]);
    remember(session, "restart", restart, state);
    remember(session, "saveCutShort", cut, state);
    remember(session, "beforeApply", before, state);
    assert.ok(keptFor(session, "restart", moved));
    assert.ok(keptFor(session, "saveCutShort", moved));
    assert.equal(keptFor(session, "beforeApply", moved), undefined);
    // A browser shows no serial numbers: no keyboard is another's by them.
    const unnamed = {};
    remember(unnamed, "restart", restart, listed("a", [{id: "a", serialNumber: ""}]));
    assert.equal(keptFor(unnamed, "restart", listed("b", [{id: "b", serialNumber: ""}])), undefined);
});

test("the follow-back a restart or a lost keyboard starts reads the keyboard its record is for", () => {
    const session = {}, state = listed("desk", [desk]), other = listed("travel", [travel]);
    remember(session, "restart", restart, state);
    remember(session, "saveCutShort", cut, state);
    remember(session, "beforeApply", before, state);
    session.reconnect = {restart: true};
    assert.ok(keptFor(session, "restart", other), "a restart's own follow-back");
    assert.equal(keptFor(session, "saveCutShort", other), undefined);
    session.reconnect = {lost: "stopped answering"};
    assert.ok(keptFor(session, "saveCutShort", other), "a lost keyboard's follow-back");
    assert.equal(keptFor(session, "restart", other), undefined);
    assert.equal(keptFor(session, "beforeApply", other), undefined);
});

test("a keyboard followed back under a new device id takes its draft and every record with it, and no other keyboard's", () => {
    let followed;
    const session = {draft: {deviceId: "desk", followDevice(id) {followed = id;}}}, state = listed("desk", [desk, travel]);
    remember(session, "restart", restart, state);
    remember(session, "beforeApply", before, state);
    remember(session, "saveCutShort", cut, state, "travel");
    followKeyboard(session, "desk", "desk-2");
    const now = listed("desk-2", [{id: "desk-2"}, travel]);
    assert.equal(followed, "desk-2");
    assert.ok(keptFor(session, "restart", now));
    assert.ok(keptFor(session, "beforeApply", now));
    assert.equal(keptFor(session, "saveCutShort", now, "travel")?.edits, cut.edits, "the other keyboard's stays its own");
    assert.equal(keptFor(session, "beforeApply", listed("desk", [desk])), undefined, "the old device id has none");
});

test("forgetting one record keeps the others, and remembering again replaces it", () => {
    const session = {}, state = listed("desk", [desk]);
    remember(session, "restart", restart, state);
    remember(session, "beforeApply", before, state);
    forget(session, "restart");
    assert.equal(keptForAny(session, "restart"), undefined);
    assert.ok(keptFor(session, "beforeApply", state));
    remember(session, "beforeApply", {...before, savedAt: "later"}, state, "travel");
    assert.equal(keptFor(session, "beforeApply", state), undefined);
    assert.equal(keptForAny(session, "beforeApply")?.savedAt, "later");
});
