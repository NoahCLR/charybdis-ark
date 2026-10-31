"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {TRANSPARENT, profileFacts, walkLayers} = require("../../core/model/layer-walk");
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
// The compact walk's budget spent at once, so the bounded walk answers.
const BOUNDED = {limits: {work: 0}};
// What either walk answers, less the paths it tells.
/** @param {import("../../core/model/types.js").LayerWalk} walked */
const outcome = ({reachabilityComplete, escapeComplete, affectedLayers, reachedLayers, reachableCombos, traps, trapCount}) => ({reachabilityComplete, escapeComplete, affectedLayers, reachedLayers,
    reachableCombos: [...reachableCombos].sort(), traps: traps.map(({locks, effect}) => ({locks, from: effect.from})), trapCount});

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

test("the compact walk and the bounded walk reach the same layers, and find no trap where TO(0) waits", () => {
    const facts = profileFacts(decoded({"0:0": TG(1), "0:1": MO(2), "1:2": TO(3), "3:3": TO(0), "2:4": KC_B, "3:4": KC_B}));
    const compact = walkLayers(facts), bounded = walkLayers(facts, BOUNDED);
    assert.deepEqual(outcome(compact), {reachabilityComplete: true, escapeComplete: true, affectedLayers: 0, reachedLayers: 0b1111, reachableCombos: [], traps: [], trapCount: 0});
    assert.deepEqual(outcome(bounded), outcome(compact));
    assert.ok(bounded.effects.some(effect => effect.kind === "move" && effect.layer === 0 && effect.from.layer === 3), "TO(0) on Navigation is offered");
});

test("both walks find the same smallest traps, the lock that gets into each and the steps from rest", () => {
    // TG(1) and TG(2) on Base each lock a layer that covers both; TG(3)
    // falls through its own layer, so locking 3 is no trap.
    const facts = profileFacts(decoded({"0:0": TG(1), "0:1": TG(2), "0:2": TG(3), "1:0": KC_B, "1:1": KC_B, "2:0": KC_B, "2:1": KC_B}));
    const compact = walkLayers(facts), bounded = walkLayers(facts, BOUNDED);
    assert.deepEqual(outcome(compact).traps, [{locks: 0b10, from: {layer: 0, layoutIndex: 0, code: TG(1)}}, {locks: 0b100, from: {layer: 0, layoutIndex: 1, code: TG(2)}}]);
    assert.equal(compact.trapCount, 2);
    assert.deepEqual(outcome(bounded), outcome(compact));
    for (const walked of [compact, bounded]) assert.deepEqual(walked.traps.map(({path}) => path.map(effect => effect.how)), walked.traps.map(({effect}) => [effect.how]), "each is one lock from rest");
});

test("combos fire on the keys that answer under the layers on, or the reference layer's own, from the layer each key came from", () => {
    // Layer 1, held from Base, stores B over one key; every other key falls
    // through to Base's A.
    const combos = [{inputs: [code(KC_A), code(KC_B)], output: code(KC_A)}, {inputs: [code(KC_A)], output: code(KC_B), allowedLayers: 0b10}, {inputs: [code(KC_B)], output: code(KC_A)}];
    const profile = decoded({"0:0": MO(1), "1:5": KC_B}, combos);
    /** @param {number} reference */
    const fired = (reference) => {
        profile.settings.layers[1].reference = reference;
        const facts = profileFacts(profile), compact = walkLayers(facts);
        assert.deepEqual(outcome(walkLayers(facts, BOUNDED)), outcome(compact));
        return [...compact.reachableCombos].sort();
    };
    assert.deepEqual(fired(1), [0, 2], "layer 1's B joins Base's A; no A comes from layer 1");
    // Under Combo Layer Matching layer 1 matches Base's raw keys, still from
    // the layer each key came from: the key layer 1 stores is its own.
    assert.deepEqual(fired(0), [1]);
    assert.deepEqual(fired(LAYERS), [], "a reference past the bank matches nothing while its layer is on top");
});

test("a walk neither finishes names the layers involved, and claims no reach or trap", () => {
    // Thirteen independent locks are more states than the bounded walk takes.
    const keys = {};
    for (let layer = 1; layer <= 13; layer++) keys[`0:${layer}`] = TG(layer);
    const walked = walkLayers(profileFacts(decoded(keys)), BOUNDED);
    assert.equal(walked.reachabilityComplete, false);
    assert.equal(walked.escapeComplete, false);
    assert.equal(walked.affectedLayers, 0b11111111111110);
    assert.deepEqual([walked.traps, walked.trapCount, walked.reachableCombos.size], [[], 0, 0]);
    assert.equal(walkLayers(profileFacts(decoded(keys))).escapeComplete, true, "the compact walk, given its budget, finishes");
});
