"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {TRANSPARENT, profileFacts, comboCodes, compactWalk, boundedWalk, stateOf, locksOf, heldOf, highest} = require("../../core/model/layer-walk");
const {LAYERS, matrixPosition} = require("../../core/data/charybdis-layout");
const {SETTING} = require("../../core/schema/settings-domain-v1");
const {settings} = require("../fixtures/portable-profile");

const KC_A = 0x04, KC_B = 0x05;
const MO = (n) => 0x5220 | n, TG = (n) => 0x5260 | n, TO = (n) => 0x5200 | n;
const code = (operand) => ({kind: 1, flags: 0, operand});
// A profile as validateSnapshot decodes one: Base answers every key with
// KC_A, the other layers start transparent, and `keys` puts a keycode at
// "layer:layoutIndex". No pointer layer and no sniping.
function decoded(keys = {}, combos = []) {
    const layers = Array.from({length: LAYERS}, (_, layer) => Array(60).fill(layer === 0 ? KC_A : TRANSPARENT));
    for (const [at, value] of Object.entries(keys)) {
        const [layer, index] = at.split(":").map(Number);
        layers[layer][matrixPosition(index)] = value;
    }
    const policy = settings();
    policy.values[SETTING.AUTO_MOUSE_ENABLED] = 0; policy.values[SETTING.AUTO_SNIPING_ENABLED] = 0;
    return {layers, settings: policy, behaviors: {rows: []}, combos: {rows: combos}, pdModes: []};
}

test("the walk reads a profile's layers in layout order, and its combos only while combos are on", () => {
    const combos = [{inputs: [code(KC_A), code(KC_B)], output: code(MO(2))}, {inputs: [code(KC_A)], output: code(KC_B), enabled: false}];
    const profile = decoded({"1:5": KC_B}, combos);
    profile.settings.layers[3].reference = 1;
    const facts = profileFacts(profile);
    assert.equal(facts.layers[1][5], KC_B);
    assert.deepEqual(facts.combos.map(combo => [combo.index, combo.inputs]), [[0, [KC_A, KC_B]]], "a disabled combo is not walked");
    assert.equal(facts.allCombos.length, 2, "every combo's output is still counted");
    assert.equal(facts.comboLayer(3), 1, "a layer's combos read its reference layer");
    assert.equal(facts.comboLayer(2), 2);
    profile.settings.values[SETTING.COMBOS_ENABLED] = 0;
    assert.deepEqual(profileFacts(profile).combos, []);
});

test("the compact walk and the bounded walk reach the same layers", () => {
    const facts = profileFacts(decoded({"0:0": TG(1), "0:1": MO(2), "1:2": TO(3), "3:3": TO(0), "2:4": KC_B, "3:4": KC_B}));
    const compact = compactWalk(facts);
    assert.equal(compact.complete, true);
    assert.ok("symbolic" in compact && compact.symbolic);
    const bounded = boundedWalk(facts);
    assert.equal(bounded.complete, true);
    const reached = [...bounded.parent.keys()].reduce((mask, state) => mask | locksOf(state) | heldOf(state), facts.always);
    assert.equal(reached, 0b1111);
    assert.equal(compact.reachedLayers, reached);
    assert.ok(bounded.home.has(stateOf(0b1000, 0)), "TO(0) on Navigation goes home");
});

test("a state is its locks with the held layers on top", () => {
    const state = stateOf(0b0110, 0b1000);
    assert.equal(locksOf(state), 0b0110);
    assert.equal(heldOf(state), 0b1000);
    assert.equal(highest(0b1010), 3);
});

test("the codes a press offers combos are the keys that answer under the layers on, or the reference layer's own", () => {
    const profile = decoded({"1:5": KC_B});
    const keys = profileFacts(profile).layers[0].length;
    const resolved = comboCodes(profileFacts(profile), 0b11);
    assert.deepEqual(resolved.get(KC_B), [1], "layer 1's own key");
    assert.deepEqual(resolved.get(KC_A), Array(keys - 1).fill(0), "every other key falls through to Base");
    assert.deepEqual(comboCodes(profileFacts(profile), 0b1).get(KC_B), undefined, "Base alone offers no B");
    // Under Combo Layer Matching layer 1 matches Base's raw keys, still from
    // the layer each key came from.
    profile.settings.layers[1].reference = 0;
    const matched = comboCodes(profileFacts(profile), 0b11);
    assert.equal(matched.get(KC_B), undefined);
    assert.equal(matched.get(KC_A)?.length, keys);
    assert.deepEqual(matched.get(KC_A)?.filter(layer => layer === 1), [1], "the key layer 1 stores is still its own");
    profile.settings.layers[1].reference = LAYERS;
    assert.equal(comboCodes(profileFacts(profile), 0b11).size, 0, "a reference past the bank matches nothing");
});
