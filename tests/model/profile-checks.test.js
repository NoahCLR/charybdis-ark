"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const {validateSnapshot} = require("../../core/model/portable-profile");
const {profileFindings, draftProfileChecks} = require("../../core/model/profile-checks");
const {document} = require("../fixtures/portable-profile");

test("whole-profile checks report inert actions and destination blockers", () => {
    const decoded = validateSnapshot(document());
    decoded.danglingPdBindings = {7: 2};
    decoded.document.macros[0] = Buffer.from("A".repeat(520)).toString("base64");
    const checks = profileFindings(decoded, {brightnessMax: 100, effects: [{id: 2}]});
    assert.equal(checks.find(row => row.kind === "inertPointing")?.count, 2);
    assert.equal(checks.find(row => row.kind === "unplayableMacro")?.place.index, 0);
    assert.deepEqual(checks.filter(row => row.level === "blocker").map(row => row.kind), ["brightnessBlocker", "effectBlocker"]);
});

test("whole-profile findings retain new and fixed status beside the keyboard", () => {
    const keyboard = validateSnapshot(document());
    const draft = validateSnapshot(document());
    draft.danglingPdBindings = {7: 1};
    const checks = draftProfileChecks(keyboard, draft, [0, 1, 2, 3, 4, 5, 6, 7], {});
    assert.equal(checks.find(row => row.kind === "inertPointing")?.status, "new");
});

test("gesture timing advice is gated by the destination firmware", () => {
    const decoded = validateSnapshot(document());
    // The imported layout has an authored LT; use it as a reachable witness.
    decoded.behaviors.rows = [{target: {kind: 1, flags: 0, operand: 0x4131}, steps: [{tapIndex: 1, tap: {kind: 1, flags: 0, operand: 4}}]}];
    assert.ok(profileFindings(decoded, {physicalGestureTiming: false}).some(x => x.kind === "gestureTiming"));
    assert.ok(!profileFindings(decoded, {physicalGestureTiming: true}).some(x => x.kind === "gestureTiming"));
    const draft = structuredClone(decoded);
    draft.behaviors.rows = [];
    const checks = draftProfileChecks(decoded, draft, undefined, {physicalGestureTiming: false});
    assert.equal(checks.find(x => x.kind === "gestureTiming").status, "fixed");
});

test("timing changes report new, existing and fixed findings, including inherited defaults", () => {
    const keyboard = validateSnapshot(document());
    const action = operand => ({kind: 1, flags: 0, operand});
    keyboard.behaviors.rows = [{target: action(4), tapHoldTerm: 0, longerHoldTerm: 0,
        steps: [{tapIndex: 0, hold: {mode: 4, action: action(5)}, longHold: {mode: 4, action: action(6)}}]}];
    keyboard.settings.values[1] = 100; keyboard.settings.values[2] = 200;
    const draft = structuredClone(keyboard); draft.settings.values[2] = 100;
    const checks = (before, after) => draftProfileChecks(before, after, undefined, {physicalGestureTiming: true, ownedTapping: true})
        .filter(f => f.kind === "gestureTiming" && f.title.includes("cannot send"));
    assert.equal(checks(keyboard, draft)[0].status, "new");
    assert.equal(checks(draft, draft)[0].status, "existing");
    assert.equal(checks(draft, keyboard)[0].status, "fixed");
});
