import assert from "node:assert/strict";
import test from "node:test";
import {createRequire} from "node:module";
import {foldedPick, heldModifiers, isLayerKeyPicked, isPicked, offeredEntries, offeredMacros, offeredSections, pickAllowed, pickProblem, pickValue,
    dropKey, openingPick, pickKey, pickModifier, pickedExpression, shownSection, storedPick} from "../../webview/view/picker.mjs";
import {pickerSections} from "../../webview/view/picker-sections.mjs";

const {demoDocument, publishedModel} = createRequire(import.meta.url)("../fixtures/published-model");

// The demo as core publishes it: named macros in its first slots, and the
// catalogue with what the picker never offers marked.
const model = publishedModel(demoDocument());
// The picker's state as openPicker starts it, with what a test sets.
/** @param {object} [over] @returns {any} */
const picker = (over = {}) => ({title: "Key", mode: "single", allowedKeys: null, maxKeys: Infinity, section: "board", search: "", mods: [], keys: [], layerTap: null, ...over});
const ids = (/** @type {{id: string}[]} */ sections) => sections.map((section) => section.id);

test("a field limited to some keys takes only them, by the names QMK gives them", () => {
    const limited = picker({allowedKeys: ["KC_A", "MACRO_0"]});
    assert.equal(model.qmkKeycodeAliases.QK_MACRO_0, "MACRO_0");
    assert.equal(pickValue(model, limited, "QK_MACRO_0"), "MACRO_0", "a key picked under another name is stored as the field's");
    assert.equal(pickValue(model, picker(), "QK_MACRO_0"), "QK_MACRO_0", "a field taking every key stores what was picked");
    assert.equal(pickAllowed(model, limited, "KC_A"), true);
    assert.equal(pickAllowed(model, limited, "KC_B"), false);
    assert.equal(pickAllowed(model, picker(), "KC_B"), true);
    // A shortcut takes a modifier key or a shifted symbol as its modifiers.
    const shortcut = picker({allowedKeys: ["KC_A"], shortcut: true});
    assert.deepEqual(heldModifiers(model, shortcut, "KC_EXLM"), {key: "KC_1", mods: 2});
    assert.equal(heldModifiers(model, picker(), "KC_EXLM"), null, "only in a shortcut");
    assert.equal(pickAllowed(model, shortcut, "KC_EXLM"), true);
    assert.equal(pickAllowed(model, shortcut, "KC_LEFT_SHIFT"), true);
});

test("a limited field offers the keyboard and the sections holding one of its keys", () => {
    assert.deepEqual(ids(offeredSections(model, picker())), ids(pickerSections()), "every section for a field taking every key");
    assert.deepEqual(ids(offeredSections(model, picker({allowedKeys: ["KC_A", "KC_EXLM", "MACRO_0"]}))), ["board", "letters", "symbols", "macros", "all"]);
    assert.deepEqual(ids(offeredSections(model, picker({allowedKeys: ["KC_A"], shortcut: true}))), ["board", "letters", "symbols", "common", "layers", "all"],
        "a shortcut's layer switches, and its modifier keys and shifted symbols");
    const limited = picker({allowedKeys: ["KC_A", "MACRO_0"]});
    assert.equal(shownSection(model, {...limited, section: "macros"})?.id, "macros");
    assert.equal(shownSection(model, {...limited, section: "media"})?.id, "board", "a section the field does not offer shows the first");
    assert.deepEqual(offeredMacros(model, limited).map((slot) => slot.keycode), ["MACRO_0"]);
    assert.deepEqual(offeredEntries(model, limited, shownSection(model, {...limited, section: "all"})).map((entry) => entry.value), ["KC_A"]);
    assert.equal(offeredMacros(model, picker()).length, model.macros.length);
});

test("a key is lit when picked, and in a shortcut a symbol when its key and modifiers are held", () => {
    assert.equal(isPicked(model, picker({keys: ["KC_A"]}), "KC_A"), true);
    assert.equal(isPicked(model, picker({keys: ["MACRO_0"], allowedKeys: ["MACRO_0"]}), "QK_MACRO_0"), true, "by the name the field stores");
    assert.equal(isPicked(model, picker({keys: ["KC_A"]}), "KC_B"), false);
    const shifted = picker({shortcut: true, mods: ["S"], keys: []});
    assert.equal(isPicked(model, shifted, "KC_LEFT_SHIFT"), true, "a modifier key is its modifier");
    assert.equal(isPicked(model, shifted, "KC_EXLM"), false, "! needs its key too");
    assert.equal(isPicked(model, {...shifted, keys: ["KC_1"]}, "KC_EXLM"), true);
});

test("modifiers alone or with a modifier key fold into the simplest keycode; anything else is stored as picked", () => {
    assert.deepEqual(foldedPick(model, picker({mods: ["G", "RGUI"], keys: ["KC_LEFT_GUI"]})), {keys: ["KC_LEFT_GUI"], mods: ["RGUI"]});
    assert.equal(pickedExpression(model, picker({mods: ["G", "RGUI"]})), "RGUI(KC_LEFT_GUI)");
    assert.equal(pickedExpression(model, picker({mods: ["G"], keys: ["KC_C"]})), "G(KC_C)");
    assert.equal(foldedPick(model, picker({mode: "list", mods: ["G"]})), null, "a list never folds");
    assert.equal(foldedPick(model, picker({shortcut: true, mods: ["G"]})), null, "nor a shortcut");
    assert.equal(foldedPick(model, picker({layerTap: "2", mods: ["G"]})), null, "nor a tap-hold's tap");
    assert.equal(pickedExpression(model, picker({mods: ["S"], keys: ["KC_A"], layerTap: "2"})), "LT(2, S(KC_A))");
    assert.equal(pickedExpression(model, picker({mode: "list", keys: ["KC_A", "KC_B"]})), "KC_A, KC_B");
    assert.equal(pickedExpression(model, null), "");
    const unfolded = picker({mods: ["S"], keys: ["KC_A"]});
    assert.equal(storedPick(model, unfolded), unfolded, "the pick itself when nothing folds");
});

test("a pick that cannot be used says why in the draft's words; a shortcut shows as the chord of its QMK names", () => {
    const both = picker({mods: ["C", "S", "RCTL", "RSFT"]});
    assert.ok("shortcut" in /** @type {object} */ (foldedPick(model, both)), "two modifiers on each side are a custom key's shortcut");
    assert.match(pickProblem(model, both), /left modifiers or right modifiers/);
    assert.equal(pickProblem(model, picker({mods: ["S"], keys: ["KC_A"]})), "");
    const shortcut = picker({shortcut: true, mods: ["S"], keys: ["KC_1"]});
    assert.equal(pickProblem(model, shortcut), "");
    assert.equal(pickedExpression(model, shortcut), "KC_LEFT_SHIFT+KC_1");
});

test("a layer key lights the button for the same act on its layer, as core words the forms alike", () => {
    // TG(3) is the same lock as LOCK_LAYER(3): core words both "Lock".
    assert.equal(model.vocabulary.layerKeyVerbs.TG, model.vocabulary.layerKeyVerbs.LOCK_LAYER);
    assert.equal(isLayerKeyPicked(model, picker({keys: ["TG(3)"]}), "LOCK_LAYER(3)"), true);
    assert.equal(isLayerKeyPicked(model, picker({keys: ["LOCK_LAYER(3)"]}), "LOCK_LAYER(3)"), true, "and the key itself");
    assert.equal(isLayerKeyPicked(model, picker({keys: ["TG(2)"]}), "LOCK_LAYER(3)"), false, "another layer");
    assert.equal(isLayerKeyPicked(model, picker({keys: ["MO(3)"]}), "LOCK_LAYER(3)"), false, "another act");
    assert.equal(isLayerKeyPicked(model, picker({keys: ["TO(3)"]}), "MO(3)"), false);
    assert.equal(isLayerKeyPicked(model, picker(), "LOCK_LAYER(3)"), false, "nothing picked");
});

test("in a picker for one key a modifier key is its button in the row, as in a shortcut", () => {
    const command = picker({mods: ["G"], keys: []});
    assert.equal(isPicked(model, command, "KC_LEFT_GUI"), true, "the row's Command lights the board's Left Command");
    assert.equal(isPicked(model, picker(), "KC_LEFT_GUI"), false);
    assert.equal(isPicked(model, picker({mods: ["G"], keys: ["KC_A"]}), "KC_A"), true, "the key stays lit beside it");
    assert.deepEqual(heldModifiers(model, picker(), "KC_LEFT_GUI"), {key: "", mods: 8}, "a modifier key is read through the row");
    assert.equal(heldModifiers(model, picker(), "KC_EXLM"), null, "a shifted symbol stays a key of its own");
    assert.equal(heldModifiers(model, picker({mode: "list"}), "KC_LEFT_GUI"), null, "a list picks keys, modifiers among them");
    assert.equal(heldModifiers(model, picker({layerTap: "2"}), "KC_LEFT_GUI"), null);
    // Clicking either stores the same key: Command alone is the Left Command key.
    assert.equal(pickedExpression(model, command), "KC_LEFT_GUI");
    assert.equal(pickAllowed(model, picker({allowedKeys: ["KC_A"]}), "KC_LEFT_GUI"), false, "a limited field still takes only its keys");
});

test("a picker for one key opens on the stored key with its modifiers lit in the row", () => {
    assert.deepEqual(openingPick(model, {mode: "single"}, ["G(KC_A)"]), {keys: ["KC_A"], mods: ["G"]});
    assert.deepEqual(openingPick(model, {mode: "single"}, ["KC_LEFT_GUI"]), {keys: [], mods: ["G"]}, "a modifier key is its button");
    assert.deepEqual(openingPick(model, {mode: "single"}, ["KC_EXLM"]), {keys: ["KC_EXLM"], mods: []}, "a symbol the catalogue names stays that key");
    assert.deepEqual(openingPick(model, {mode: "single"}, ["KC_A"]), {keys: ["KC_A"], mods: []});
    assert.deepEqual(openingPick(model, {mode: "list"}, ["G(KC_A)"]), {keys: ["G(KC_A)"], mods: []});
    assert.deepEqual(openingPick(model, {mode: "single", shortcut: true}, ["KC_LEFT_GUI"]), {keys: ["KC_LEFT_GUI"], mods: []});
    // Opened and used unchanged, it stores the same keycode.
    assert.equal(pickedExpression(model, picker(openingPick(model, {mode: "single"}, ["G(KC_A)"]))), "G(KC_A)");
    assert.equal(pickedExpression(model, picker(openingPick(model, {mode: "single"}, ["KC_LEFT_GUI"]))), "KC_LEFT_GUI");
});

test("a modifier key that is the stored key itself opens lit, as the key it is", () => {
    // LCTL(KC_LSFT): Left Shift is the key, Ctrl lit around it.
    const opened = picker(openingPick(model, {mode: "single"}, ["C(KC_LEFT_SHIFT)"]));
    assert.deepEqual([opened.keys, opened.mods], [["KC_LEFT_SHIFT"], ["C"]]);
    assert.equal(isPicked(model, opened, "KC_LSFT"), true, "the board's Left Shift, under its short name");
    assert.equal(isPicked(model, opened, "KC_LCTL"), true, "and Left Ctrl, lit in the row");
    assert.equal(pickedExpression(model, opened), "C(KC_LEFT_SHIFT)", "used unchanged, it stores the same keycode");
});

test("a click picks by the picker's kind: one key alone, a list in order up to its limit, a modifier key as its button", () => {
    assert.deepEqual(pickKey(model, picker({keys: ["KC_A"]}), "KC_B"), {keys: ["KC_B"]}, "a picker for one key picks it alone");
    const withA = pickKey(model, picker({keys: ["KC_A"]}), "KC_LGUI");
    assert.deepEqual([withA?.keys, withA?.mods], [["KC_A"], ["G"]], "a modifier key lights its button and keeps the key");
    assert.deepEqual(pickKey(model, picker({mode: "list", keys: ["KC_A"]}), "KC_B"), {keys: ["KC_A", "KC_B"]});
    assert.deepEqual(pickKey(model, picker({mode: "list", keys: ["KC_A", "KC_B"]}), "KC_A"), {keys: ["KC_B"]}, "a second click takes it out");
    assert.equal(pickKey(model, picker({mode: "list", maxKeys: 2, keys: ["KC_A", "KC_B"]}), "KC_C"), null, "a full list picks nothing");
    assert.deepEqual(pickKey(model, picker({mode: "list", maxKeys: 1, keys: ["KC_A"]}), "KC_C"), {keys: ["KC_C"]}, "a list of one swaps");
    assert.deepEqual(pickModifier(picker({mods: ["G"]}), "G").mods, [], "the row's button unlights");
    assert.deepEqual(dropKey(picker({mode: "list", keys: ["KC_A", "KC_B"]}), 0), {keys: ["KC_B"]});
});
