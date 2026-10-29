import assert from "node:assert/strict";
import test from "node:test";
import {entriesForPickerSection, pickable, pickerSections} from "../../webview/view/picker-sections.mjs";

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
