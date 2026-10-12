"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const {pointingTaps, pointingClicks, pointingClickProblem, pointingTapKeys} = require("../../core/model/pointing-taps");
const {isPdTapKey, isPdClick} = require("../../core/schema/pd-mode-domain-v1");
const catalog = require("../../core/data/keycode-catalog");

test("click discovery preserves each direction, diagonal and physical override's place", () => {
    const stored = {directions: {left: {keycode: 4}}};
    const slot = {id: 7, kind: 1, name: "Clicks", directions: {left: {keycode: 0xd3}, right: {keycode: 4}},
        diagonals: {upLeft: {keycode: 0xd4}}, buttons: [{tap: {keycode: 0xd1}}, {tap: {keycode: 0xd8}}]};
    assert.deepEqual(pointingTaps(slot, stored)[0], {label: "Left", tap: slot.directions.left, stored: stored.directions.left});
    assert.deepEqual(pointingClicks([slot]), [
        {slot: 7, name: "Clicks", label: "Left", button: 3},
        {slot: 7, name: "Clicks", label: "Up-left", button: 4},
        {slot: 7, name: "Clicks", label: "Button 1", button: 1},
        {slot: 7, name: "Clicks", label: "Button 2", button: 8},
    ]);
    assert.deepEqual(pointingClicks([{...slot, kind: 0}]), []);
    assert.equal(pointingClickProblem([slot], undefined), undefined);
    assert.equal(pointingClickProblem([slot], {featureFlags: 1 << 28}), undefined);
    assert.match(pointingClickProblem([slot], {featureFlags: 0}), /mode 7 \(Clicks\).*button 3 on Left.*cannot click/);
});

test("pointing picker names and aliases follow the tap allowlist and the advertised click gate", () => {
    const modern = pointingTapKeys(true), legacy = pointingTapKeys(false);
    for (const entry of catalog.entries()) {
        for (const name of [entry.name, ...entry.aliases]) {
            assert.equal(modern.plain.includes(name), isPdTapKey(entry.value), name);
            assert.equal(legacy.plain.includes(name), isPdTapKey(entry.value) && !isPdClick(entry.value), name);
        }
    }
    for (const name of ["QK_MOUSE_BUTTON_1", "QK_MOUSE_BUTTON_3", "MS_BTN4", "QK_MOUSE_BUTTON_8"]) {
        assert.ok(modern.plain.includes(name), name);
        assert.ok(!legacy.plain.includes(name), name);
        assert.ok(!modern.modified.includes(name), name);
    }
    assert.ok(modern.modified.includes("KC_A"));
    for (const name of ["KC_VOLU", "MS_UP", "MS_WHLD", "PD_SLOT_0", "QK_BOOTLOADER"]) assert.ok(!modern.modified.includes(name), name);
});
