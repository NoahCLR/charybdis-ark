import assert from "node:assert/strict";
import test from "node:test";
import {createRequire} from "node:module";
import {SEARCH_ROWS, foldedPick, heldModifiers, isLayerKeyPicked, isPicked, offeredEntries, offeredMacros, offeredSections, pickAllowed, pickProblem, pickValue,
    pickedExpression, pickerMatches, shownSection, storedPick} from "../../webview/view/picker.mjs";
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
    assert.deepEqual(ids(offeredSections(model, picker({allowedKeys: ["KC_A", "KC_EXLM", "MACRO_0"]}))), ["board", "symbols", "macros", "all"]);
    assert.deepEqual(ids(offeredSections(model, picker({allowedKeys: ["KC_A"], shortcut: true}))), ["board", "symbols", "layers", "more", "all"],
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

test("a pick that cannot be used says why in the draft's words; a shortcut is named as core names it", () => {
    const both = picker({mods: ["C", "S", "RCTL", "RSFT"]});
    assert.ok("shortcut" in /** @type {object} */ (foldedPick(model, both)), "two modifiers on each side are a custom key's shortcut");
    assert.match(pickProblem(model, both), /left modifiers or right modifiers/);
    assert.equal(pickProblem(model, picker({mods: ["S"], keys: ["KC_A"]})), "");
    const shortcut = picker({shortcut: true, mods: ["S"], keys: ["KC_1"]});
    assert.equal(pickProblem(model, shortcut), "");
    assert.equal(pickedExpression(model, shortcut), "Left Shift + 1");
});

test("a search finds the field's macros and offered keycodes, the first rows of them", () => {
    const all = pickerMatches(model, picker({search: "a"}));
    assert.equal(all.keycodes.length, SEARCH_ROWS, "capped");
    assert.equal(all.macros.length, model.macros.length, "macros apart from the cap");
    assert.deepEqual(pickerMatches(model, picker({search: "Mute"})).keycodes.map((entry) => entry.value), ["KC_KB_MUTE", "KC_AUDIO_MUTE"], "case aside, by name or words");
    assert.deepEqual(pickerMatches(model, picker({search: "SPOT"})).macros.map((slot) => slot.keycode), ["MACRO_0"], "a macro by its name");
    assert.deepEqual(pickerMatches(model, picker({search: "QK_USER"})).keycodes, [], "what core does not offer is never found");
    const limited = pickerMatches(model, picker({search: "a", allowedKeys: ["KC_A", "MACRO_0"]}));
    assert.deepEqual([limited.keycodes.map((entry) => entry.value), limited.macros.map((slot) => slot.keycode)], [["KC_A"], ["MACRO_0"]]);
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
