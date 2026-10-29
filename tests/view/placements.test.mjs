import assert from "node:assert/strict";
import test from "node:test";
import {createRequire} from "node:module";
import {keycodePlacements, keysPlacedOn, reachLine} from "../../webview/view/placements.mjs";
import {deleteBehaviour, saveBehaviour} from "../../webview/view/edits.mjs";

const require = createRequire(import.meta.url);
const {profileDocument, publishedModel} = require("../fixtures/published-model.js");

// The sniping keys on Base and Navigation, a behaviour holding one and a combo
// sending the other, as core publishes them; only that behaviour.
const doc = profileDocument({keys: {0: {0: "SNIPING"}, 3: {0: "SNP_TOG", 1: "PD_MODE_4"}}, combos: [{inputs: ["KC_J", "KC_K"], output: "SNIPING"}]});
const stored = publishedModel(doc).keyBehaviors.map((/** @type {{keycode: string}} */ row) => deleteBehaviour(row.keycode));
const model = publishedModel(doc, {edits: [...stored, saveBehaviour({keycode: "KC_RIGHT_ALT", steps: [{tapCount: 0, hold: {style: "PRESS_AND_HOLD_UNTIL_RELEASE", action: "SNP_TOG"}}]})]});

test("a key is found on layers, behaviours and combos, by its name or the value the keyboard stores", () => {
    const found = keycodePlacements(model, ["SNIPING", "SNP_TOG"]);
    assert.equal(found.keys.length, 2);
    assert.equal(found.behaviours.length, 1);
    assert.equal(found.combos.length, 1);
    assert.equal(reachLine(found), "Base · 1 key, Navigation · 1 key, 1 behaviour, 1 combo");
    // A keyboard may name the value by another of its catalogue names.
    const toggle = model.layers[3].positions[0];
    assert.ok(model.qmkKeycodes.find((/** @type {{value: string}} */ entry) => entry.value === "SNP_TOG").aliases.includes("QK_KB_5"));
    const renamed = {...model, layers: model.layers.map((/** @type {any} */ layer) => layer.index === 3 ? {...layer, positions: [{...toggle, keycode: "QK_KB_5", semantic: undefined}]} : layer)};
    assert.equal(keycodePlacements(renamed, ["SNIPING", "SNP_TOG"]).keys.length, 2, "QK_KB_5 is SNP_TOG by value");
    assert.equal(reachLine({keys: [], behaviours: [], combos: [], layers: []}), "Not placed");
});

test("where keys are placed reads on after what they are, layer by layer", () => {
    const found = keycodePlacements(model, ["SNIPING", "SNP_TOG", "PD_MODE_4"]);
    assert.equal(keysPlacedOn(found.keys), "on Base · 1 key, Navigation · 2 keys");
    assert.equal(keysPlacedOn([]), "not placed on any layer");
});
