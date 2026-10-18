import assert from "node:assert/strict";
import test from "node:test";
import {createRequire} from "node:module";
import {dangerOf, entryMatches, keycodeScope, layerChoices, layerResults, modifierBlock, pickerChoice, rememberLayerKey, seedPick, typedExpression} from "../../webview/view/picker-choice.mjs";

const require = createRequire(import.meta.url);
const model = require("../fixtures/picker-model.js");

test("Base's row offers only what does something on Base", () => {
    assert.deepEqual(layerChoices(0).map((choice) => choice.verb), ["Tap-hold", "Move to"]);
    assert.deepEqual(layerChoices(2).map((choice) => choice.verb), ["Hold", "Lock", "Tap-hold", "Tap-toggle", "One-shot", "Move to"]);
});

test("search finds layer keys by the layer's name, the verb and the QMK form", () => {
    const found = (query) => layerResults(model.layers, query).map((result) => `${result.verb} ${result.name}`);
    assert.deepEqual(found("numbers"), ["Hold Numbers", "Lock Numbers", "Tap-hold Numbers", "Tap-toggle Numbers", "One-shot Numbers", "Move to Numbers"]);
    assert.deepEqual(found("lock numbers"), ["Lock Numbers"]);
    assert.ok(found("MO(").includes("Hold Symbols"));
    assert.ok(!found("MO(").includes("Hold Base"), "Base has no Hold");
    assert.deepEqual(found("n"), [], "one letter finds nothing yet");
});

test("search finds keys by words and by names QMK used to give them", () => {
    const entry = (value) => model.qmkKeycodes.find((row) => row.value === value);
    assert.ok(entryMatches(model, entry("KC_NO"), "nothing"));
    assert.ok(entryMatches(model, entry("KC_TRANSPARENT"), "transparent"));
    assert.ok(entryMatches(model, entry("QK_BOOTLOADER"), "reset"));
    assert.ok(entryMatches(model, entry("QK_MOUSE_BUTTON_1"), "kc_btn1"));
    assert.ok(!entryMatches(model, entry("KC_A"), "reset"));
});

test("a typed expression is a result of its own, or says why it is not", () => {
    assert.deepEqual(typedExpression(model, "LT(3,KC_F)"), {expression: "LT(3, KC_F)", problem: ""});
    assert.deepEqual(typedExpression(model, "lctl_t(kc_a)"), {expression: "LCTL_T(KC_A)", problem: ""});
    assert.deepEqual(typedExpression(model, "KC_BTN1"), {expression: "KC_BTN1", problem: ""});
    assert.equal(typedExpression(model, "number"), null, "a word is a search");
    assert.equal(typedExpression(model, "esc"), null);
    assert.match(typedExpression(model, "LT(2, LT(3, KC_F))").problem, /not a key/);
    assert.match(typedExpression(model, "DF(1)").problem, /default layer/);
});

test("a seed opens in the slots it was made from", () => {
    assert.deepEqual(seedPick(model, "LT(3,KC_F)"), {keys: ["KC_F"], mods: [], hold: {kind: "layer", layer: 3}});
    assert.deepEqual(seedPick(model, "MT(MOD_LCTL, KC_ESC)"), {keys: ["KC_ESC"], mods: [], hold: {kind: "mod", mod: "MOD_LCTL"}});
    assert.deepEqual(seedPick(model, "LSFT_T(KC_A)"), {keys: ["KC_A"], mods: [], hold: {kind: "mod", mod: "MOD_LSFT"}});
    assert.deepEqual(seedPick(model, "S(C(KC_A))"), {keys: ["KC_A"], mods: ["C", "S"], hold: null});
    assert.deepEqual(seedPick(model, "LGUI(KC_C)"), {keys: ["KC_C"], mods: ["G"], hold: null});
    assert.deepEqual(seedPick(model, "MO(2)"), {keys: ["MO(2)"], mods: [], hold: null});
});

test("Use key is never offered for what the draft refuses (B10)", () => {
    const choice = (pick) => pickerChoice(model, {mods: [], ...pick}, {key: true});
    assert.equal(choice({keys: ["MO(2)"], mods: ["S"]}).expression, "");
    assert.equal(choice({keys: ["PD_SLOT_0"], mods: ["G"]}).expression, "");
    assert.equal(choice({keys: ["VIA_MACRO_0"], mods: ["S"]}).expression, "");
    assert.equal(choice({keys: ["KC_A"], mods: ["S"]}).expression, "S(KC_A)");
    assert.equal(choice({keys: ["DF(1)"]}).expression, "");
    // A hold over anything but a plain key is refused with a custom-key way out.
    const over = choice({keys: ["LT(3, KC_F)"], hold: {kind: "layer", layer: 2}});
    assert.equal(over.expression, "");
    assert.equal(over.customKey, true);
    assert.equal(choice({keys: ["KC_EXLM"], hold: {kind: "mod", mod: "MOD_LCTL"}}).customKey, true);
    assert.equal(choice({keys: ["KC_F"], hold: {kind: "layer", layer: 3}}).expression, "LT(3, KC_F)");
    assert.equal(choice({keys: ["KC_F"], hold: {kind: "layer", layer: 16}}).expression, "");
    assert.equal(choice({keys: ["KC_SPC"], hold: {kind: "mode", slot: 0}}).behaviour, true);
    assert.equal(choice({keys: ["KC_TRANSPARENT"], hold: {kind: "mode", slot: 0}}).expression, "");
    assert.equal(choice({keys: [], hold: {kind: "mod", mod: "MOD_LCTL"}}).problem, "Choose the key a tap sends.");
});

test("modifier chips say why they are off", () => {
    assert.match(modifierBlock(model, {keys: ["KC_F"], mods: [], hold: {kind: "layer", layer: 3}}), /hold/);
    assert.match(modifierBlock(model, {keys: ["MO(2)"], mods: []}), /cannot hold them/);
    assert.equal(modifierBlock(model, {keys: ["KC_A"], mods: []}), "");
    assert.equal(modifierBlock(model, {keys: [], mods: []}), "");
});

test("the scope of a behaviour-row hold is every key sending that keycode", () => {
    const scope = keycodeScope(model, "KC_NO");
    assert.ok(scope.total > 50);
    assert.equal(keycodeScope(model, "KC_SPC").total, 0);
});

test("dangerous keys carry a consequence; recent layer keys keep the newest four", () => {
    assert.match(dangerOf(model, "QK_BOOT"), /flashing mode/);
    assert.match(dangerOf(model, "QK_CLEAR_EEPROM"), /Erases/);
    assert.equal(dangerOf(model, "KC_A"), "");
    let recent = [];
    for (const value of ["MO(1)", "KC_A", "LOCK_LAYER(2)", "MO(1)", "TO(3)", "TT(4)", "OSL(5)"]) recent = rememberLayerKey(recent, value);
    assert.deepEqual(recent, ["OSL(5)", "TT(4)", "TO(3)", "MO(1)"]);
});
