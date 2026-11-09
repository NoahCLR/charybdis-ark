import assert from "node:assert/strict";
import test from "node:test";
import {entriesForPickerSection, groupedEntries, pickable, pickerSections} from "../../webview/view/picker-sections.mjs";

import {createRequire} from "node:module";

const {profileDocument, publishedModel} = createRequire(import.meta.url)("../fixtures/published-model");

// Representative entries of the catalogue core publishes for a profile, as
// it offers them: the keyboard's unnamed user keys, native macros and
// unsupported keyboard slots are in it, not offered.
const published = publishedModel(profileDocument()).qmkKeycodes;
const catalogue = ["KC_A", "KC_SLASH", "KC_EXLM", "KC_HOME", "KC_KP_1", "KC_F12", "KC_AUDIO_MUTE", "QK_RGB_MATRIX_TOGGLE", "PD_MODE_0", "CUSTOM_KEY_0",
    "QK_USER_20", "QK_MACRO_9", "QK_BOOTLOADER", "QK_MOUSE_BUTTON_1", "DPI_MOD", "DRGSCRL", "DRG_TOG", "QK_KB_8"].map((value) => {
    const entry = published.find((candidate) => candidate.value === value);
    assert.ok(entry, `${value} is in the published catalogue`);
    return entry;
});

test("the picker uses task-shaped sections instead of raw QMK group names", () => {
    assert.deepEqual(pickerSections().map(({label}) => label), [
        "Keyboard", "Letters and digits", "Symbols", "Numpad", "Common keys", "Layers", "Macros", "Custom keys", "Pointing modes",
        "Mouse", "Media", "More keys", "Lighting", "Other QMK", "All keycodes",
    ]);
});

test("curated picker sections route representative keycodes", () => {
    const section = (id) => pickerSections().find((candidate) => candidate.id === id);
    for (const id of ["custom", "all"]) assert.ok(entriesForPickerSection(catalogue, section(id)).some((entry) => entry.value === "CUSTOM_KEY_0"), id);
    assert.deepEqual(entriesForPickerSection(catalogue, section("letters")).map((entry) => entry.value), ["KC_A"]);
    assert.deepEqual(entriesForPickerSection(catalogue, section("symbols")).map((entry) => entry.value), ["KC_SLASH", "KC_EXLM"]);
    assert.deepEqual(entriesForPickerSection(catalogue, section("common")).map((entry) => entry.value), ["KC_HOME", "KC_F12"]);
    assert.deepEqual(entriesForPickerSection(catalogue, section("numpad")).map((entry) => entry.value), ["KC_KP_1"]);
    assert.deepEqual(entriesForPickerSection(catalogue, section("lighting")).map((entry) => entry.value), ["QK_RGB_MATRIX_TOGGLE"]);
    // The keyboard's own pointer keys sit with the mouse; its unnamed slots do nothing.
    assert.deepEqual(entriesForPickerSection(catalogue, section("mouse")).map((entry) => entry.value), ["QK_MOUSE_BUTTON_1", "DPI_MOD"]);
    assert.deepEqual(entriesForPickerSection(catalogue, section("custom")).map((entry) => entry.value), ["CUSTOM_KEY_0"]);
    assert.deepEqual(entriesForPickerSection(catalogue, section("other")).map((entry) => entry.value), ["QK_BOOTLOADER"]);
    assert.equal(entriesForPickerSection(catalogue, section("all")).length, catalogue.length - 5, "native macros, retired user keys and unsupported keyboard slots are excluded");
    assert.deepEqual(catalogue.filter((entry) => entry.offered === false).map((entry) => entry.value), ["QK_USER_20", "QK_MACRO_9", "DRGSCRL", "DRG_TOG", "QK_KB_8"], "core offers none of these");
    assert.equal(pickable(catalogue.find((entry) => entry.value === "QK_MACRO_9")), false, "what core does not offer");
});

test("Charybdis's own drag scroll is offered nowhere; the PD_MODE_0 pointing mode is drag scroll", () => {
    for (const section of pickerSections()) {
        const offered = entriesForPickerSection(catalogue, section).map((entry) => entry.value);
        assert.ok(!offered.includes("DRGSCRL") && !offered.includes("DRG_TOG"), section.id);
    }
    // Search reads the same rule.
    assert.deepEqual(catalogue.filter(pickable).filter((entry) => entry.group === "kb").map((entry) => entry.value), ["DPI_MOD"]);
});

test("the picker offers what core offers, in every section and search", async () => {
    const {createRequire} = await import("node:module");
    const {buildDeviceModel} = createRequire(import.meta.url)("../../core/session/device-model");
    const published = buildDeviceModel().qmkKeycodes;
    const all = pickerSections().find((section) => section.id === "all");
    assert.deepEqual(entriesForPickerSection(published, all), published.filter((entry) => entry.offered !== false));
    for (const value of ["DRGSCRL", "QK_USER_0", "QK_MACRO_9", "QK_MIDI_ON", "QK_LAYER_LOCK"]) {
        const entry = published.find((candidate) => candidate.value === value);
        assert.ok(entry, `${value} is in the catalog`);
        assert.equal(pickable(/** @type {any} */ (entry)), false, value);
    }
    for (const value of ["KC_A", "QK_RGB_MATRIX_TOGGLE", "DPI_MOD", "QK_BOOTLOADER"]) assert.ok(pickable(published.find((entry) => entry.value === value)), value);
});

test("every offered key is in one section, and in one of its groups", () => {
    const published = publishedModel(profileDocument());
    const offered = published.qmkKeycodes.filter(pickable);
    const sections = pickerSections().filter(({kind}) => kind === "catalogue");
    const pointing = (entry) => entry.group === "Pointing modes";
    for (const entry of offered) {
        const holding = sections.filter((section) => section.filter(entry)).map(({id}) => id);
        assert.equal(holding.length, pointing(entry) ? 0 : 1, `${entry.value}: ${holding}`);
    }
    for (const section of sections) {
        const entries = entriesForPickerSection(offered, section);
        const groups = groupedEntries(section, entries, published);
        assert.equal(groups.flatMap((group) => group.entries).length, entries.length, section.id);
        assert.equal(new Set(groups.map((group) => group.name)).size, groups.length, section.id);
    }
});

test("arrows and navigation keys read in the order a person says them, not the catalogue's", () => {
    const published = publishedModel(profileDocument());
    const common = pickerSections().find((section) => section.id === "common");
    const groups = groupedEntries(common, entriesForPickerSection(published.qmkKeycodes, common), published);
    const keysOf = (name) => groups.find((group) => group.name === name).entries.map((entry) => entry.value);
    assert.deepEqual(keysOf("Arrows"), ["KC_LEFT", "KC_RIGHT", "KC_UP", "KC_DOWN"]);
    assert.deepEqual(keysOf("Navigation"), ["KC_HOME", "KC_END", "KC_PAGE_UP", "KC_PAGE_DOWN", "KC_INSERT", "KC_DELETE"]);
});

// The keyboard's switch keys for behaviours and then for auto-mouse (firmware
// D-F66) sit right after QMK's for combos and autocorrect, in Other QMK's
// Switch keys, by their words.
test("the switch keys for behaviours and auto-mouse are offered beside those for combos", () => {
    const published = publishedModel(profileDocument());
    const other = pickerSections().find((section) => section.id === "other");
    const groups = groupedEntries(other, entriesForPickerSection(published.qmkKeycodes, other), published);
    const switches = groups.find((group) => group.name === "Switch keys");
    assert.deepEqual(switches?.entries.map((entry) => [entry.value, entry.label]), [
        ["QK_COMBO_ON", "Combo On"], ["QK_COMBO_OFF", "Combo Off"], ["QK_COMBO_TOGGLE", "Toggle Combo"],
        ["QK_AUTOCORRECT_ON", "Autocorrect On"], ["QK_AUTOCORRECT_OFF", "Autocorrect Off"], ["QK_AUTOCORRECT_TOGGLE", "Toggle Autocorrect"],
        ["BH_ON", "Behaviours On"], ["BH_OFF", "Behaviours Off"], ["BH_TOGG", "Toggle Behaviours"],
        ["AM_ON", "Auto-mouse On"], ["AM_OFF", "Auto-mouse Off"], ["AM_TOGG", "Toggle Auto-mouse"],
    ]);
    assert.deepEqual(switches.entries.slice(6).map((entry) => entry.keycode), [0x7ee0, 0x7ee1, 0x7ee2, 0x7ef0, 0x7ef1, 0x7ef2]);
    assert.ok(switches.entries.every(pickable));
});

test("a section's groups tell its keys apart by keycode, and a custom key by whether it has a name", () => {
    const published = publishedModel(profileDocument());
    const named = published.customKeys.find((key) => key.name);
    const unnamed = published.customKeys.find((key) => !key.name);
    /** @param {string} id @param {string} value */
    const groupOf = (id, value, model = published) => {
        const section = pickerSections().find((candidate) => candidate.id === id);
        return groupedEntries(section, entriesForPickerSection(model.qmkKeycodes, section), model).find((group) => group.entries.some((entry) => entry.value === value))?.name;
    };
    assert.deepEqual(["KC_ENTER", "KC_LEFT_CTRL", "KC_LEFT", "KC_HOME", "KC_PRINT_SCREEN", "KC_F12", "KC_NO", "KC_TRANSPARENT"].map((value) => groupOf("common", value)),
        ["Typing", "Modifiers", "Arrows", "Navigation", "System", "Function", "No key", "No key"]);
    assert.deepEqual(["KC_UNDO", "KC_INTERNATIONAL_1", "KC_LANGUAGE_1", "KC_KB_MUTE"].map((value) => groupOf("more", value)), ["Editing", "International", "Language", "System"]);
    assert.deepEqual(["KC_NUM_LOCK", "KC_KP_SLASH", "KC_KP_1"].map((value) => groupOf("numpad", value)), ["Signs and lock", "Signs and lock", "Digits"]);
    assert.equal(groupOf("other", "QK_GRAVE_ESCAPE"), "Features");
    assert.deepEqual(["QK_MAGIC_SWAP_CONTROL_CAPS_LOCK", "QK_MAGIC_TOGGLE_NKRO", "QK_BOOTLOADER"].map((value) => groupOf("other", value)), ["Magic swaps", "Magic switches", "Firmware"]);
    if (named) assert.equal(groupOf("custom", named.keycode), "Named");
    assert.equal(groupOf("custom", unnamed.keycode), "Unnamed");
    const renamed = {...published, customKeys: published.customKeys.map((key) => key.keycode === unnamed.keycode ? {...key, name: "Thumb"} : key)};
    assert.equal(groupOf("custom", unnamed.keycode, renamed), "Named");
});
