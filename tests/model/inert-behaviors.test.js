"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const {timingAlone, changesNothing, inertBehaviorFindings} = require("../../core/model/inert-behaviors");

const key = operand => ({kind: 1, flags: 0, operand});
const shortcuts = Array.from({length: 128}, () => ({mods: 0, key: 0}));
shortcuts[2] = {mods: 0x02, key: 0x06};
const row = (target, fields = {}) => ({target, steps: [], tapHoldTerm: 0, longHoldTerm: 0, multiTapTerm: 0,
    keepsAutoMouseAnchored: false, enabled: true, allowedLayers: 0xffff, ...fields});

test("a timing alone does something only on a key the keyboard handles anyway, as the firmware classifies it", () => {
    // Dual-role keys: MT, LT, OSM, and TT and OSL on a layer the keyboard has.
    for (const code of [0x2204, 0x3fff, 0x432f, 0x4f00, 0x52a2, 0x52c2, 0x52cf, 0x5281, 0x528f]) assert.equal(timingAlone(key(code), shortcuts), true, code.toString(16));
    // Keys that hold a layer or a pointing mode while down: MO and LM, and pointing-mode holds.
    for (const code of [0x5221, 0x522f, 0x5021, 0x51ff, 0x7e80, 0x7e9f]) assert.equal(timingAlone(key(code), shortcuts), true, code.toString(16));
    assert.equal(timingAlone({kind: 2, flags: 0, operand: 1}, shortcuts), true, "MO as its own action kind");
    assert.equal(timingAlone({kind: 4, flags: 0, operand: 3}, shortcuts), true, "a pointing-mode hold as its own action kind");
    // A custom key only with a shortcut.
    assert.equal(timingAlone({kind: 7, flags: 0, operand: 2}, shortcuts), true);
    assert.equal(timingAlone({kind: 7, flags: 0, operand: 3}, shortcuts), false);
    // Keys the keyboard does not handle without a row: plain keys, macros, TO,
    // TG, LOCK_LAYER, pointing-mode toggles, DF and PDF, and layer keys past
    // the sixteen layers.
    for (const code of [0x04, 0x4c, 0xe1, 0x0204, 0x5201, 0x5261, 0x7ec3, 0x7ea0, 0x7ebf, 0x5241, 0x52e1, 0x5230, 0x52d0, 0x5290]) {
        assert.equal(timingAlone(key(code), shortcuts), false, code.toString(16));
    }
    assert.equal(timingAlone({kind: 3, flags: 0, operand: 3}, shortcuts), false, "LOCK_LAYER as its own action kind");
    assert.equal(timingAlone({kind: 5, flags: 0, operand: 3}, shortcuts), false, "a pointing-mode toggle as its own action kind");
    assert.equal(timingAlone({kind: 6, flags: 0, operand: 2}, shortcuts), false, "a macro key");
});

test("a row changes nothing without steps, the anchor, or a timing that applies to its key", () => {
    assert.equal(changesNothing(row(key(0x4c)), shortcuts), true, "an empty row on Delete");
    assert.equal(changesNothing(row(key(0x432f)), shortcuts), true, "an empty row on LT");
    assert.equal(changesNothing(row(key(0x4c), {tapHoldTerm: 180}), shortcuts), true, "a timing alone on a plain key");
    assert.equal(changesNothing(row(key(0x432f), {tapHoldTerm: 180}), shortcuts), false, "a timing alone on LT");
    assert.equal(changesNothing(row(key(0x4c), {keepsAutoMouseAnchored: true}), shortcuts), false, "the anchor applies on any key");
    assert.equal(changesNothing(row(key(0x4c), {steps: [{tapIndex: 0, tap: key(0x04)}]}), shortcuts), false);
    // Its switch and layers gate only what it holds.
    assert.equal(changesNothing(row(key(0x4c), {enabled: false, allowedLayers: 1}), shortcuts), true);
    assert.equal(changesNothing(row(key(0x432f), {tapHoldTerm: 180, enabled: false}), shortcuts), false, "switched back on, its timing applies again");
});

test("Review notes each row that changes nothing, opening its behaviour", () => {
    const decoded = {settings: {customKeyShortcuts: shortcuts}, behaviors: {rows: [
        row(key(0x4c)), row(key(0x4c + 1), {multiTapTerm: 120}), row(key(0x432f), {tapHoldTerm: 180}), row(key(0x04), {keepsAutoMouseAnchored: true}),
    ]}};
    const findings = inertBehaviorFindings(decoded);
    assert.deepEqual(findings.map(finding => [finding.kind, finding.level, finding.identity, finding.place]), [
        ["inertBehavior", "notice", "76", {kind: "behaviour", keycode: "KC_DELETE"}],
        ["inertBehavior", "notice", "77", {kind: "behaviour", keycode: "KC_END"}],
    ]);
    assert.match(findings[0].title, /^KC_DELETE: its behaviour changes nothing$/);
    assert.match(findings[0].detail, /no branches, no timing of its own/);
    assert.match(findings[1].detail, /a timing alone does nothing on this key/);
    assert.equal(inertBehaviorFindings({settings: {}, behaviors: undefined}).length, 0);
});
