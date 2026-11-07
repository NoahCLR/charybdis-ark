"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const {emptyCells, GRID_TAP_COUNTS} = require("../../core/model/empty-cells");
const {TAPPING_TOGGLE} = require("../../rules/qmk-keycodes.mjs");

const hold = {style: "PRESS_AND_HOLD_UNTIL_RELEASE", action: "CUSTOM_KEY_3", label: "Nav", fromPress: true};
const key = (operand) => ({kind: 1, operand});

// A Tap-toggle key with no row counts taps by itself (firmware D-F27): its
// TAPPING_TOGGLE-th quick tap locks its layers, and every press holds them.
test("a Tap-toggle key with no row counts taps, and its last tap locks", () => {
    const cells = emptyCells({hold, tapToggle: true});
    assert.ok(TAPPING_TOGGLE <= GRID_TAP_COUNTS, "the grid reaches the locking tap");
    assert.deepEqual(cells[`${TAPPING_TOGGLE - 1}-tap`], {inherited: {own: "hold", locks: true}}, "its own action, tapped");
    assert.equal(cells["1-tap"], undefined, "an earlier quick tap does nothing of its own");
    assert.deepEqual(cells["1-hold"], {implied: {meaning: "afterTaps", hold: {own: "hold"}}}, "held, it holds its layers, never as a Single tap");
    assert.deepEqual(cells[`${TAPPING_TOGGLE - 1}-hold`], {implied: {meaning: "afterTaps", hold: {own: "hold"}}}, "the locking tap's count held is still a hold");
    assert.deepEqual(emptyCells({hold})["1-hold"], {implied: {meaning: "asSingle", as: {kind: "hold", branch: {own: "hold"}}}}, "a key that counts no taps treats it as a Single tap");
    const row = [{tapIndex: 1, hold: {style: 0, repeatHz: 0, action: key(4)}}];
    assert.equal(emptyCells({hold, tapToggle: true}, row)[`${TAPPING_TOGGLE - 1}-tap`], undefined, "a row with steps replaces its taps");
});

// A cell names the branch it shows, so keys of one kind share their cells.
test("a cell names the branch it shows, the key's own or the row's", () => {
    const tap = {style: "TAP_SENDS", action: "KC_E"};
    const builtIn = {tap, hold: {style: "PRESS_AND_HOLD_UNTIL_RELEASE", action: "KC_E", fallback: true}, releaseTaps: true};
    const cells = emptyCells(builtIn, [{tapIndex: 1, tap: key(0x1b)}]);
    assert.equal(cells["1-tap"], undefined, "the Double tap's Tap is set");
    assert.deepEqual(cells["1-hold"], {implied: {meaning: "tapsOnRelease", tap: {step: 1, tier: "tap"}}}, "the row's own Tap, on release");
    assert.deepEqual(cells[`${GRID_TAP_COUNTS - 1}-tap`], {inherited: {own: "tap", times: GRID_TAP_COUNTS}}, "the deepest row the grid shows");
    assert.equal(cells[`${GRID_TAP_COUNTS}-tap`], undefined);
    assert.deepEqual(emptyCells(builtIn), emptyCells({...builtIn, tap: {style: "TAP_SENDS", action: "KC_F"}}), "another plain key, the same cells");
});
