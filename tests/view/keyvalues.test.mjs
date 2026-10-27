import assert from "node:assert/strict";
import test from "node:test";
import {createRequire} from "node:module";
const require = createRequire(import.meta.url);
const {buildDeviceModel} = require("../../core/session/device-model");
import {modifierBits, keyDisplayName, keyName, modifierNames, modifierPick, pickerModifierProblem, macroIndex, pointingMacro} from "../../webview/view/keyvalues.mjs";

const model = {qmkKeycodes: [
    {keycode: 0x0004, value: "KC_A"},
    {keycode: 0x0006, value: "KC_C"},
    {keycode: 0x00a9, value: "KC_VOLU"},
    {keycode: 0x7e50, value: "PD_MODE_0"},
]};

test("a stored number is named from the keyboard's own catalogue", () => {
    assert.equal(keyName(model, 0x00a9), "KC_VOLU");
    assert.equal(keyName(model, 0x7e50), "PD_MODE_0");
    assert.equal(keyName(model, 0), "", "zero means no shortcut, not a keycode");
});

test("modifier-wrapped values are unwrapped the way the keyboard encodes them", () => {
    assert.equal(keyName(model, 0x0806), "G(KC_C)", "left GUI + C");
    assert.equal(keyName(model, 0x0a04), "S(G(KC_A))", "left GUI + shift + A");
    assert.equal(keyName(model, 0x1806), "RGUI(KC_C)", "the right-hand bit switches the wrappers");
});

test("an unknown value keeps its number rather than gaining an invented name", () => {
    assert.equal(keyName(model, 0x7e61), "0x7E61");
    assert.equal(keyName({}, 0x0004), "0x4", "with no catalogue, nothing is claimed");
});

test("modifier masks read back as the names the keyboard holds", () => {
    assert.deepEqual(modifierNames(buildDeviceModel(), 0), []);
    assert.deepEqual(modifierNames(buildDeviceModel(), 1 | 8), ["Left Ctrl", "Left GUI"]);
    assert.deepEqual(modifierNames(buildDeviceModel(), 255), modifierBits(buildDeviceModel()).map(([, name]) => name));
});

test("the picker finds a key by what the host layout prints on it", () => {
    const settingsView = {host: {effective: 2, layout: 9}};
    const model = buildDeviceModel({settingsView});
    const entry = model.qmkKeycodes?.find?.((row) => row.value === "KC_SEMICOLON") || model.catalog?.entries?.find((row) => row.value === "KC_SEMICOLON");
    assert.ok(entry, "the catalogue lists KC_SEMICOLON");
    assert.equal(entry.label, "Ö");
    assert.ok(entry.search.includes("ö"));
    assert.deepEqual(model.hostLayoutLegends.KC_Y, ["Z", "", "", ""]);
    assert.equal(buildDeviceModel().hostLayoutLegends, null);
});


test("picker modifier checks include both selected sides and a shifted key's stored mask", () => {
    const model = buildDeviceModel();
    const problem = (keys, mods, mode = "single") => pickerModifierProblem(model, {keys, mods, mode});
    assert.match(problem(["KC_A"], ["C", "RSFT"]), /one side/);
    assert.match(problem(["KC_EXLM"], ["RALT"]), /one side/);
    assert.equal(problem(["KC_A"], ["C", "S"]), "");
    assert.equal(problem(["KC_A"], ["RCTL", "RSFT"]), "");
    assert.equal(problem(["KC_EXLM"], ["A"]), "");
    assert.equal(problem(["KC_A"], ["C", "RSFT"], "list"), "", "macro chords have separate key instructions");
});

test("pointing picks allow modified keyboard keys while mouse clicks and media stay plain", () => {
    const model = buildDeviceModel({});
    const problem = (key, mods) => pickerModifierProblem(model, {keys: [key], mods, mode: "single", modifiable: model.pdModeEditing.tapKeys.modified});
    assert.equal(problem("KC_A", ["C"]), "");
    for (const key of ["QK_MOUSE_BUTTON_3", "QK_MOUSE_BUTTON_4", "KC_AUDIO_VOL_UP"]) {
        assert.equal(problem(key, []), "");
        assert.match(problem(key, ["C"]), /Only keyboard keys take modifiers/);
    }
});

test("a stored shortcut reads as the picker names it: a key's label, a macro's name", () => {
    const named = {...buildDeviceModel(), macros: [{keycode: "MACRO_17", name: "Copy line", empty: false}]};
    named.qmkKeyLabels = {...named.qmkKeyLabels, "LGUI(KC_C)": "Cmd+C", "LCTL(LSFT(KC_C))": "Ctrl+Shift+C"};
    assert.equal(keyDisplayName(named, 0x00d3), "Mouse Button 3");
    assert.equal(keyDisplayName(named, 0x0052), "Up");
    assert.equal(keyDisplayName(named, 0x0806), "Cmd+C", "G(KC_C) by the label the profile gives LGUI(KC_C)");
    assert.equal(keyDisplayName(named, 0x0306), "Ctrl+Shift+C");
    assert.equal(keyDisplayName(named, 0x7711), "Copy line");
    assert.equal(keyDisplayName(named, 0), "");
    assert.equal(keyDisplayName({}, 0x7e61), "0x7E61", "a value nobody names keeps its number");
});

test("pointing macro identities use the stored slot and current profile name", () => {
    for (const code of [0x7700, "MACRO_0", "VIA_MACRO_0", "QK_MACRO_0", "MC_0", "0x7700", "30464"]) assert.equal(macroIndex(code), 0);
    assert.equal(macroIndex("MACRO_127"), 127);
    assert.equal(macroIndex("VIA_MACRO_127"), 127, "the former name reaches every slot");
    for (const code of [0x7780, "MACRO_128", "VIA_MACRO_128", "QK_MACRO_32", "C(MACRO_0)", "KC_A", ""]) assert.equal(macroIndex(code), null);
    const model = {macros: [{keycode: "MACRO_0", name: "Greeting <&>", empty: true}]};
    assert.deepEqual(pointingMacro(model, 0x7700), {index: 0, name: "Greeting <&>", empty: true});
    assert.deepEqual(pointingMacro(model, "MACRO_127"), {index: 127, name: "Macro 127", empty: false});
    assert.equal(keyName(model, 0x777f), "MACRO_127");
});

test("modifiers alone, or with a modifier key, fold into one set stored as the simplest keycode", () => {
    const names = ["LEFT_CTRL", "LEFT_SHIFT", "LEFT_ALT", "LEFT_GUI", "RIGHT_CTRL", "RIGHT_SHIFT", "RIGHT_ALT", "RIGHT_GUI"];
    const wrappers = ["C", "S", "A", "G", "RCTL", "RSFT", "RALT", "RGUI"];
    const picking = {
        qmkKeycodes: [{keycode: 0x06, value: "KC_C", aliases: []}, ...names.map((name, i) => ({keycode: 0xe0 + i, value: `KC_${name}`, aliases: [`KC_${["LCTL", "LSFT", "LALT", "LGUI", "RCTL", "RSFT", "RALT", "RGUI"][i]}`]}))],
        qmkKeycodeAliases: {KC_LGUI: "KC_LEFT_GUI", KC_RGUI: "KC_RIGHT_GUI"},
        vocabulary: {pickerModifiers: wrappers.map((value, i) => ({bit: 1 << i, value, label: value}))},
    };
    // Command and the Left Command key: the same modifier twice is that key.
    assert.deepEqual(modifierPick(picking, {mods: ["G"], keys: ["KC_LGUI"]}), {keys: ["KC_LEFT_GUI"], mods: []});
    // Right Command around the Left Command key holds both Commands.
    assert.deepEqual(modifierPick(picking, {mods: ["RGUI"], keys: ["KC_LGUI"]}), {keys: ["KC_LEFT_GUI"], mods: ["RGUI"]});
    // ...and adding Command, which that key already is, changes nothing.
    assert.deepEqual(modifierPick(picking, {mods: ["G", "RGUI"], keys: ["KC_LGUI"]}), {keys: ["KC_LEFT_GUI"], mods: ["RGUI"]});
    // Both Commands with no key: the left one becomes the key, as when the
    // Left Command key was clicked.
    assert.deepEqual(modifierPick(picking, {mods: ["G", "RGUI"], keys: []}), {keys: ["KC_LEFT_GUI"], mods: ["RGUI"]});
    assert.deepEqual(modifierPick(picking, {mods: ["RGUI"], keys: ["KC_LGUI"]}), modifierPick(picking, {mods: ["G", "RGUI"], keys: []}));
    // A lone modifier is its own key.
    assert.deepEqual(modifierPick(picking, {mods: ["C"], keys: []}), {keys: ["KC_LEFT_CTRL"], mods: []});
    // Several from one side wrap the first of them, so the keycode field's
    // S(KC_LEFT_CTRL) is what Left Ctrl + Left Shift gives.
    assert.deepEqual(modifierPick(picking, {mods: ["C", "S"], keys: []}), {keys: ["KC_LEFT_CTRL"], mods: ["S"]});
    assert.deepEqual(modifierPick(picking, {mods: ["S", "C", "A"], keys: []}), {keys: ["KC_LEFT_CTRL"], mods: ["S", "A"]});
    assert.deepEqual(modifierPick(picking, {mods: ["RSFT", "RCTL"], keys: []}), {keys: ["KC_RIGHT_CTRL"], mods: ["RSFT"]});
    // One on a side and several on the other: the lone one is the key.
    assert.deepEqual(modifierPick(picking, {mods: ["C", "S", "RALT"], keys: []}), {keys: ["KC_RIGHT_ALT"], mods: ["C", "S"]});
    assert.deepEqual(modifierPick(picking, {mods: ["A", "RCTL", "RSFT"], keys: []}), {keys: ["KC_LEFT_ALT"], mods: ["RCTL", "RSFT"]});
    // Two or more on each side: no keycode holds it, so a custom key would.
    assert.deepEqual(modifierPick(picking, {mods: ["C", "S", "RCTL", "RSFT"], keys: []}), {shortcut: {mods: 0x33, keys: [], layers: 0, layerKind: 0}});
    assert.deepEqual(modifierPick(picking, {mods: ["S", "RCTL", "RSFT"], keys: ["KC_LCTL"]}), {shortcut: {mods: 0x33, keys: [], layers: 0, layerKind: 0}});
    // A key that is not a modifier, or nothing at all, is left as picked.
    assert.equal(modifierPick(picking, {mods: ["G"], keys: ["KC_C"]}), null);
    assert.equal(modifierPick(picking, {mods: [], keys: []}), null);
});
