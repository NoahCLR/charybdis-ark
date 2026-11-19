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

// What the grid shows for a key whose row sets only a Double tap: the Single
// tap row and the Triple tap row are the standard key's (firmware D-F64).
const {builtInForView} = require("../../core/model/device-profile-view");
const doubleTap = [{tapIndex: 1, tap: key(0x08)}];
const shown = (code, steps = doubleTap) => builtInForView(key(code), {}, undefined, steps);

test("a QMK function key's empty cells are its own tap and fallback hold, as a plain key's", () => {
    for (const code of [0x7e00, 0x7c00, 0x7842, 0x7c73]) {
        const {cells, tap, hold} = shown(code);
        assert.equal(tap?.action, hold?.action, `0x${code.toString(16)}`);
        assert.ok(tap?.action, `0x${code.toString(16)} taps itself`);
        assert.deepEqual(cells["0-tap"], {inherited: {own: "tap"}}, "the Single tap taps it");
        assert.deepEqual(cells["0-hold"], {inherited: {own: "hold"}}, "and holds it");
        assert.deepEqual(cells["0-long"], {implied: {meaning: "continues", hold: {own: "hold"}}});
        assert.deepEqual(cells["2-tap"], {inherited: {own: "tap", times: 3}}, "a Triple tap taps it three times");
        assert.deepEqual(cells["2-hold"], {implied: {meaning: "afterTaps", tap: {own: "tap", times: 2}, hold: {own: "hold"}}}, "N - 1 taps, then the hold");
        assert.deepEqual(cells, shown(0x04).cells, "the same cells as a plain key");
    }
});

test("OSL()'s empty Single tap arms its one-shot, and its hold is its layer from the press", () => {
    const {cells, tap, hold} = shown(0x5281);
    assert.equal(tap?.action, "OSL(1)");
    assert.deepEqual({action: hold?.action, fromPress: hold?.fromPress, armsOnRelease: hold?.armsOnRelease}, {action: "OSL(1)", fromPress: true, armsOnRelease: true});
    assert.deepEqual(cells["0-tap"], {inherited: {own: "tap"}});
    assert.deepEqual(cells["0-hold"], {inherited: {own: "hold"}});
    assert.deepEqual(cells["0-long"], {implied: {meaning: "continues", hold: {own: "hold"}}});
    assert.deepEqual(cells["2-tap"], {inherited: {own: "tap", times: 3}});
    assert.deepEqual(cells["2-hold"], {implied: {meaning: "afterTaps", tap: {own: "tap", times: 2}, hold: {own: "hold"}}});
});

test("TT()'s empty Single tap is nothing, and its hold is its layer from the press", () => {
    const {cells, tap, hold} = shown(0x52c1);
    assert.equal(tap, undefined, "its taps do nothing until the lock, which a row replaces");
    assert.deepEqual({action: hold?.action, fromPress: hold?.fromPress}, {action: "TT(1)", fromPress: true});
    assert.equal(cells["0-tap"], undefined);
    assert.deepEqual(cells["0-hold"], {inherited: {own: "hold"}});
    assert.deepEqual(cells["0-long"], {implied: {meaning: "continues", hold: {own: "hold"}}});
    assert.equal(cells["2-tap"], undefined);
    assert.deepEqual(cells["2-hold"], {implied: {meaning: "afterTaps", hold: {own: "hold"}}});
    assert.deepEqual(shown(0x52c1, []).cells[`${TAPPING_TOGGLE - 1}-tap`], {inherited: {own: "hold", locks: true}}, "with no row its last quick tap locks");
});

test("the standard key shown in a cell is never written into the row", () => {
    const steps = [{tapIndex: 1, tap: key(0x08)}];
    const before = JSON.stringify(steps);
    for (const code of [0x7e00, 0x5281, 0x52c1]) builtInForView(key(code), {}, undefined, steps);
    assert.equal(JSON.stringify(steps), before);
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

// A pointing-mode key runs its mode from the press, but on a later tap count
// its row leaves empty the mode starts at Tap / hold, after the taps before
// it (firmware D-F64 rules 5 and 7).
test("a pointing-mode key's hold waits for Tap / hold on a later empty tap count", () => {
    const {PROFILE_ACTION_KINDS: ACTION} = require("../../core/schema/profile-blob-v1");
    const tripleTap = [{tapIndex: 2, tap: key(0x08)}];
    const view = builtInForView({kind: ACTION.POINTING_MODE_MOMENTARY, operand: 0}, {}, undefined, tripleTap);
    assert.equal(view.laterHoldWaits, true);
    assert.equal(view.hold?.fromPress, true, "a Single tap held still runs from the press");
    assert.deepEqual(view.cells?.["1-hold"], {implied: {meaning: "afterTaps", hold: {own: "hold", waits: true}}});
    assert.deepEqual(view.cells?.["1-long"], {implied: {meaning: "continues", hold: {own: "hold", waits: true}}});
    assert.deepEqual(view.cells?.["3-hold"], {implied: {meaning: "afterTaps", hold: {own: "hold"}}}, "past the deepest tap count the mode runs from the press");
    assert.deepEqual(emptyCells({hold}, tripleTap)["1-hold"], {implied: {meaning: "afterTaps", hold: {own: "hold"}}}, "a layer key holds from the press there too");
});
