"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const {offered} = require("../../core/data/offered-keycodes");
const keycodes = require("../../core/schema/keycodes");

test("keycodes for QMK features this firmware does not build are offered nowhere", () => {
    const built = [
        {name: "QK_RGB_MATRIX_TOGGLE", group: "rgb_matrix"}, {name: "QK_MAGIC_TOGGLE_NKRO", group: "magic"},
        {name: "QK_BOOTLOADER", group: "quantum"}, {name: "QK_GRAVE_ESCAPE", group: "quantum"},
        {name: "QK_COMBO_TOGGLE", group: "quantum"}, {name: "QK_SPACE_CADET_LEFT_SHIFT_PARENTHESIS_OPEN", group: "quantum"},
        {name: "KC_SYSTEM_SLEEP", group: "system"}, {name: "KC_AUDIO_MUTE", group: "media"}, {name: "DPI_MOD", group: "kb"},
    ];
    const unbuilt = [
        {name: "QK_MIDI_ON", group: "midi"}, {name: "QK_JOYSTICK_BUTTON_0", group: "joystick"},
        {name: "QK_UNDERGLOW_TOGGLE", group: "underglow"}, {name: "RGB_MODE_PLAIN", group: "rgb"},
        {name: "QK_BACKLIGHT_TOGGLE", group: "backlight"}, {name: "QK_SWAP_HANDS_TOGGLE", group: "swap_hands"},
        {name: "QK_OUTPUT_USB", group: "connection"}, {name: "QK_CAPS_WORD_TOGGLE", group: "quantum"},
        {name: "QK_REPEAT_KEY", group: "quantum"}, {name: "QK_LAYER_LOCK", group: "quantum"},
        {name: "QK_UNICODE_MODE_MACOS", group: "quantum"}, {name: "KC_LOCKING_CAPS_LOCK", group: "basic"},
        {name: "QK_KB_8", group: "kb"},
    ];
    for (const entry of built) assert.ok(offered(entry), entry.name);
    for (const entry of unbuilt) assert.ok(!offered(entry), entry.name);
});

test("a macro is offered by its MACRO_n name, and Charybdis's own drag scroll not at all", () => {
    assert.equal(offered({name: "QK_MACRO_9", group: "macro"}), false);
    assert.equal(offered({name: "MACRO_9", group: "Macros"}), true);
    for (const name of ["DRGSCRL", "DRG_TOG"]) assert.equal(offered({name, group: "kb"}), false, name);
});

test("all 32 retired user entries stay in the catalog but are not offered", () => {
    for (let index = 0; index < 32; index++) {
        const {name} = keycodes.resolve(0x7e40 + index);
        assert.equal(name, `QK_USER_${index}`);
        assert.equal(offered({name, group: "user"}), false, name);
    }
    for (const name of ["CUSTOM_KEY_0", "CUSTOM_KEY_127", "KC_NO", "KC_TRANSPARENT"]) assert.ok(offered({name, group: name.startsWith("CUSTOM") ? "Custom keys" : "internal"}), name);
});
