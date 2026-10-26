"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const {pointingTaps, pointingTapKeys, pointingMacros} = require("../../core/model/pointing-taps");
const {isPdTapKey} = require("../../core/schema/pd-mode-domain-v1");
const catalog = require("../../core/data/keycode-catalog");

test("every shortcut place keeps its direction or diagonal", () => {
    const stored = {directions: {left: {keycode: 4}}};
    const slot = {id: 7, kind: 1, name: "Clicks", directions: {left: {keycode: 0xd3}, right: {keycode: 4}},
        diagonals: {upLeft: {keycode: 0xd4}}};
    assert.deepEqual(pointingTaps(slot, stored)[0], {label: "Left", tap: slot.directions.left, stored: stored.directions.left});
    assert.deepEqual(pointingTaps(slot).filter(place => place.tap).map(place => place.label), ["Left", "Right", "Up-left"]);
    assert.equal(pointingTaps(slot).length, 8, "four directions and four diagonals: mouse button overrides are retired (firmware D-F22)");
});

test("pointing picker names and aliases follow the tap allowlist", () => {
    const keys = pointingTapKeys();
    for (const entry of catalog.entries()) {
        for (const name of [entry.name, ...entry.aliases]) assert.equal(keys.plain.includes(name), isPdTapKey(entry.value), name);
    }
    for (const name of ["QK_MOUSE_BUTTON_1", "QK_MOUSE_BUTTON_3", "MS_BTN4", "QK_MOUSE_BUTTON_8"]) {
        assert.ok(keys.plain.includes(name), name);
        assert.ok(!keys.modified.includes(name), name);
    }
    assert.ok(keys.modified.includes("KC_A"));
    for (const name of ["KC_VOLU", "MS_UP", "MS_WHLD", "PD_SLOT_0", "QK_BOOTLOADER"]) assert.ok(!keys.modified.includes(name), name);
});

test("macro outputs keep their place, and are offered alone", () => {
    const slot = {id: 4, name: "Macros", kind: 1, directions: {left: {keycode: 0x7700}}, diagonals: {upLeft: {keycode: 0x777f}}};
    assert.deepEqual(pointingMacros([slot]), [
        {slot: 4, name: "Macros", label: "Left", macro: 0},
        {slot: 4, name: "Macros", label: "Up-left", macro: 127},
    ]);
    assert.deepEqual(pointingMacros([{...slot, kind: 0}]), []);
    for (const name of ["QK_MACRO_0", "MC_31", "MACRO_127"]) {
        assert.ok(pointingTapKeys().plain.includes(name));
        assert.ok(!pointingTapKeys().modified.includes(name));
    }
});
