import assert from "node:assert/strict";
import test from "node:test";
import {entriesForPickerSection, pickable, pickerSections} from "../../webview/view/picker-sections.mjs";

const catalogue = [
    {value: "KC_A", group: "basic"},
    {value: "KC_SLASH", group: "basic"},
    {value: "KC_EXLM", group: "shifted"},
    {value: "KC_HOME", group: "basic"},
    {value: "KC_KP_1", group: "basic"},
    {value: "KC_F12", group: "basic"},
    {value: "KC_MUTE", group: "media"},
    {value: "QK_RGB_MATRIX_TOGGLE", group: "rgb_matrix"},
    {value: "PD_MODE_0", group: "Pointing modes"},
    {value: "CUSTOM_KEY_0", group: "Custom keys"},
    {value: "QK_USER_20", group: "user"},
    {value: "QK_MACRO_9", group: "macro"},
    {value: "QK_BOOT", group: "quantum"},
    {value: "QK_MOUSE_BUTTON_1", group: "mouse"},
    {value: "DPI_MOD", group: "kb"},
    {value: "DRGSCRL", group: "kb"},
    {value: "DRG_TOG", group: "kb"},
    {value: "QK_KB_8", group: "kb"},
];

test("the picker uses task-shaped sections instead of raw QMK group names", () => {
    assert.deepEqual(pickerSections().map(({label}) => label), [
        "Keyboard", "Symbols", "Navigation", "Numpad", "Layers", "Pointing modes", "Macros",
        "Mouse", "Media", "Lighting", "Magic", "Custom keys", "More keys", "Other QMK", "All keycodes",
    ]);
});

test("curated picker sections route representative keycodes", () => {
    const section = (id) => pickerSections().find((candidate) => candidate.id === id);
    for (const id of ["custom", "all"]) assert.ok(entriesForPickerSection(catalogue, section(id)).some((entry) => entry.value === "CUSTOM_KEY_0"), id);
    assert.deepEqual(entriesForPickerSection(catalogue, section("symbols")).map((entry) => entry.value), ["KC_SLASH", "KC_EXLM"]);
    assert.deepEqual(entriesForPickerSection(catalogue, section("navigation")).map((entry) => entry.value), ["KC_HOME"]);
    assert.deepEqual(entriesForPickerSection(catalogue, section("numpad")).map((entry) => entry.value), ["KC_KP_1"]);
    assert.deepEqual(entriesForPickerSection(catalogue, section("lighting")).map((entry) => entry.value), ["QK_RGB_MATRIX_TOGGLE"]);
    // The keyboard's own pointer keys sit with the mouse; its unnamed slots do nothing.
    assert.deepEqual(entriesForPickerSection(catalogue, section("mouse")).map((entry) => entry.value), ["QK_MOUSE_BUTTON_1", "DPI_MOD"]);
    assert.deepEqual(entriesForPickerSection(catalogue, section("custom")).map((entry) => entry.value), ["CUSTOM_KEY_0"]);
    assert.deepEqual(entriesForPickerSection(catalogue, section("other")).map((entry) => entry.value), ["QK_BOOT"]);
    assert.equal(entriesForPickerSection(catalogue, section("all")).length, catalogue.length - 5, "native macros, retired user keys and unsupported keyboard slots are excluded");
    assert.equal(pickable({value: "QK_MACRO_9", group: "macro"}), false);
});

test("Charybdis's own drag scroll is offered nowhere; the PD_MODE_0 pointing mode is drag scroll", () => {
    for (const section of pickerSections()) {
        const offered = entriesForPickerSection(catalogue, section).map((entry) => entry.value);
        assert.ok(!offered.includes("DRGSCRL") && !offered.includes("DRG_TOG"), section.id);
    }
    // Search reads the same rule.
    assert.deepEqual(catalogue.filter(pickable).filter((entry) => entry.group === "kb").map((entry) => entry.value), ["DPI_MOD"]);
});

test("keycodes for QMK features this firmware does not build are offered nowhere", () => {
    const built = [
        {value: "QK_RGB_MATRIX_TOGGLE", group: "rgb_matrix"}, {value: "QK_MAGIC_TOGGLE_NKRO", group: "magic"},
        {value: "QK_BOOTLOADER", group: "quantum"}, {value: "QK_GRAVE_ESCAPE", group: "quantum"},
        {value: "QK_COMBO_TOGGLE", group: "quantum"}, {value: "QK_SPACE_CADET_LEFT_SHIFT_PARENTHESIS_OPEN", group: "quantum"},
        {value: "KC_SYSTEM_SLEEP", group: "system"}, {value: "KC_AUDIO_MUTE", group: "media"},
    ];
    const unbuilt = [
        {value: "QK_MIDI_ON", group: "midi"}, {value: "QK_JOYSTICK_BUTTON_0", group: "joystick"},
        {value: "QK_UNDERGLOW_TOGGLE", group: "underglow"}, {value: "RGB_MODE_PLAIN", group: "rgb"},
        {value: "QK_BACKLIGHT_TOGGLE", group: "backlight"}, {value: "QK_SWAP_HANDS_TOGGLE", group: "swap_hands"},
        {value: "QK_OUTPUT_USB", group: "connection"}, {value: "QK_CAPS_WORD_TOGGLE", group: "quantum"},
        {value: "QK_REPEAT_KEY", group: "quantum"}, {value: "QK_LAYER_LOCK", group: "quantum"},
        {value: "QK_UNICODE_MODE_MACOS", group: "quantum"}, {value: "KC_LOCKING_CAPS_LOCK", group: "basic"},
        {value: "QK_KB_8", group: "kb"},
    ];
    for (const entry of built) assert.ok(pickable(entry), entry.value);
    for (const entry of unbuilt) assert.ok(!pickable(entry), entry.value);
    const all = pickerSections().find((section) => section.id === "all");
    assert.equal(entriesForPickerSection([...built, ...unbuilt], all).length, built.length);
});

test("all 32 retired user entries stay in the catalogue but are absent from sections and search", async () => {
    const {createRequire} = await import("node:module");
    const require = createRequire(import.meta.url);
    const catalog = require("../../core/data/keycode-catalog");
    const retired = Array.from({length: 32}, (_, index) => {
        const entry = catalog.resolve(0x7e40 + index);
        assert.equal(entry.name, `QK_USER_${index}`);
        return {value: entry.name, group: "user", search: `${entry.name} ${entry.label}`.toLowerCase()};
    });
    for (const entry of retired) {
        assert.equal(pickable(entry), false, entry.value);
        assert.equal(pickable({name: entry.value, group: "user"}), false);
        assert.equal(pickable({key: entry.value, group: "user"}), false);
    }
    for (const section of pickerSections()) assert.deepEqual(entriesForPickerSection(retired, section), [], section.id);
    assert.deepEqual(retired.filter(pickable).filter(entry => entry.search.includes("user")), []);
    for (const value of ["CUSTOM_KEY_0", "CUSTOM_KEY_127", "KC_NO", "KC_TRANSPARENT"]) {
        const entry = {value, group: value.startsWith("CUSTOM") ? "Custom keys" : "internal"};
        assert.ok(pickable(entry), value);
        assert.deepEqual(entriesForPickerSection([entry], pickerSections().find(section => section.id === "custom")), [entry]);
    }
});
