import assert from "node:assert/strict";
import test from "node:test";
import {createRequire} from "node:module";
import {layerView} from "../../webview/view/layer-view.mjs";
import {tabReach} from "../../webview/view/tab-reach.mjs";
import {comboHeld, combosHere, holdComboFrom, viewWhileHeld} from "../../webview/view/combo-held.mjs";

const {profileDocument, publishedModel} = createRequire(import.meta.url)("../fixtures/published-model.js");
const model = publishedModel();
const badges = (view) => combosHere(view).map((entry) => entry.combo.badge);

test("the combos Combo feedback can hold are the Keymap's On this view, those lighting combo feedback first, then those holding a layer", () => {
    for (const at of [0, 3]) {
        const view = layerView(model, at, []);
        const onView = tabReach(view, "combos").groups.find((group) => group.id === "view")?.entries.map((entry) => entry.combo.badge) || [];
        assert.deepEqual(new Set(badges(view)), new Set(onView), `on layer ${at}`);
        const holds = combosHere(view).map((entry) => (entry.combo.holdsLayers || []).length > 0);
        assert.deepEqual(holds, [...holds].sort((a, b) => Number(a) - Number(b)), "combo feedback first, layer holds second");
    }
    assert.ok(badges(layerView(model, 0, [])).includes("C3"), "C3 fires on Base");
    assert.ok(!badges(layerView(model, 3, [])).includes("C3"), "and not on Navigation, where only one of its keys is");
    assert.deepEqual(combosHere(layerView(model, 0, [])).filter((entry) => entry.combo.holdsLayers?.length).map((entry) => [entry.combo.badge, entry.combo.holdsLayers]),
        [["C10", [5]], ["C11", [1]], ["C13", [5]]], "the combos sending MO() hold their layer, as core publishes it");
});

test("a combo is held on one key for each input, the first until another is picked, and rings every key that presses it", () => {
    const view = layerView(model, 0, []);
    // C13 is Right Thumb + Backspace, and Base has a Backspace on each thumb cluster.
    const held = comboHeld(view, {id: 13, keys: []});
    assert.equal(held?.combo.badge, "C13");
    assert.deepEqual(held?.ring, tabReach(view, "combos").keysFor(`view:${held?.combo.id}`), "ringed as the Keymap rings it");
    assert.equal(held?.choice, true, "one input is pressed by two keys");
    assert.equal(held?.held.length, 2, "held on one key per input");
    assert.ok(held?.held.every((key) => key === 51 || key === 55), "from the Backspace beside its Right Thumb, both on the right half");
    const other = held?.ring.find((key) => !held.held.includes(key));
    assert.ok(other !== undefined);
    const next = holdComboFrom(view, {id: 13, keys: []}, /** @type {number} */ (other));
    assert.deepEqual(comboHeld(view, next)?.held.sort(), [...held.held.filter((key) => key !== held.held[1]), other].sort(), "a ringed key holds its input instead");
    assert.equal(holdComboFrom(view, next, 0), null, "a key that presses none of its inputs holds nothing");
    assert.equal(comboHeld(view, {id: 999, keys: []})?.combo.badge, badges(view)[0], "a combo that does not fire here falls back to the first that does");
});

test("a held combo paints against its held keys, and one holding a layer shows no combo light", () => {
    const view = layerView(model, 0, []);
    const c3 = comboHeld(view, {id: 3, keys: []});
    assert.deepEqual([c3?.holds, c3?.active?.inputs, c3?.active?.locality, c3?.active?.beneath], [[], c3?.held, model.rgb.comboFeedback.locality, false]);
    const c13 = comboHeld(view, {id: 13, keys: []});
    assert.deepEqual([c13?.holds, c13?.active], [[5], null], "C13 sends MO(5): the layer's own light shows the hold");
    const shown = viewWhileHeld(view, c13);
    assert.deepEqual([shown.at, shown.held], [5, [0]], "so the board turns Function on over Base, as the layer strip would");
    assert.equal(viewWhileHeld(view, c3), view, "a combo that holds no layer leaves the view as it is");
});

test("a combo holding a layer that is not a plain MO() is quiet too, and one running a pointing mode paints beneath it", () => {
    const doc = profileDocument({keys: {0: {0: "KC_A", 1: "KC_B", 2: "KC_C", 3: "KC_D"}}, combos: [
        {inputs: ["KC_A", "KC_B"], output: "PD_MODE_1"},
        {inputs: ["KC_C", "KC_D"], output: "TT(2)"},
    ]});
    const view = layerView(publishedModel(doc), 0, []);
    const tapToggle = comboHeld(view, {id: 1, keys: []});
    assert.deepEqual([tapToggle?.holds, tapToggle?.active, tapToggle?.pointing], [[2], null, null], "TT() holds its layer while held, as the firmware's owned momentary layer");
    assert.deepEqual([viewWhileHeld(view, tapToggle).at], [2]);
    const mode = comboHeld(view, {id: 0, keys: []});
    assert.deepEqual([mode?.holds, mode?.pointing, mode?.active?.beneath], [[], 1, true], "PD_MODE_1 runs slot 1, the combo painting beneath it");
    assert.deepEqual(combosHere(view).map((entry) => entry.combo.id), [0, 1], "combo feedback first, the layer hold second");
});
