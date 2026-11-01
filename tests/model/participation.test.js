"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const {participation} = require("../../core/model/participation");
const {SETTING} = require("../../core/schema/settings-domain-v1");
const {matrixPosition} = require("../../core/data/charybdis-layout");

// Settings with every switch on, and layer 2's placements set for key 5.
const settings = (values = {}) => {
    const all = [];
    Object.assign(all, {[SETTING.BEHAVIORS_ENABLED]: 1, [SETTING.COMBOS_ENABLED]: 1, [SETTING.LAYER_BEHAVIORS]: 0xffff, [SETTING.LAYER_COMBOS]: 0xffff}, values);
    const layers = Array.from({length: 16}, (_, layer) => ({reference: layer, bypass: layer === 2 ? [matrixPosition(5)] : [], exclude: layer === 2 ? [matrixPosition(5)] : []}));
    return participation({values: all, layers});
};

test("a behaviour runs where every switch lets it: the master, the layer's, its own and the placement's", () => {
    const on = settings();
    assert.equal(on.behaviorUsed({}, 1, 5), true);
    assert.equal(on.behaviorUsed(undefined, 1, 5), false, "no row runs nothing");
    assert.equal(on.behaviorUsed({enabled: false}, 1, 5), false);
    assert.equal(on.behaviorUsed({allowedLayers: 0b01}, 1, 5), false, "its layers leave this one out");
    assert.equal(on.behaviorUsed({}, 2, 5), false, "Use behaviour is off for this key on layer 2");
    assert.equal(on.behaviorUsed({}, 2, 6), true);
    assert.equal(settings({[SETTING.LAYER_BEHAVIORS]: 0b01}).behaviorUsed({}, 1, 5), false);
    assert.equal(settings({[SETTING.BEHAVIORS_ENABLED]: 0}).behaviorUsed({}, 1, 5), false);
});

test("a key joins a combo where every switch lets it, judged by the layer it came from", () => {
    const on = settings();
    assert.equal(on.comboJoins({}, 1, 5), true);
    assert.equal(on.comboJoins({enabled: false}, 1, 5), false);
    assert.equal(on.comboJoins({allowedLayers: 0b100}, 1, 5), false);
    assert.equal(on.comboJoins({}, 2, 5), false, "Join combos is off for this key on layer 2");
    assert.equal(on.comboPress(2, 6), true);
    assert.equal(settings({[SETTING.COMBOS_ENABLED]: 0}).comboJoins({}, 1, 5), false);
    assert.equal(settings({[SETTING.LAYER_COMBOS]: 0}).comboPress(1, 5), false);
});

test("a combo's generated output runs its row on the row's own layers, with the behaviours switch", () => {
    const on = settings();
    assert.equal(on.generatedLayers({allowedLayers: 0b110}, {useOutputBehavior: true}), 0b110);
    assert.equal(on.generatedLayers({}, {useOutputBehavior: false}), 0);
    assert.equal(on.generatedLayers({enabled: false}, {useOutputBehavior: true}), 0);
    assert.equal(settings({[SETTING.BEHAVIORS_ENABLED]: 0}).generatedLayers({}, {useOutputBehavior: true}), 0);
});

test("why a behaviour or a key toward a combo does not take part, in the order the switches widen", () => {
    const off = settings({[SETTING.BEHAVIORS_ENABLED]: 0, [SETTING.LAYER_BEHAVIORS]: 0xffff ^ 4, [SETTING.COMBOS_ENABLED]: 0});
    assert.deepEqual(off.reasons({enabled: false, allowedLayers: 1}, 2, 5, "behavior"), ["master", "layer", "definition", "layers", "placement"]);
    assert.deepEqual(off.reasons({}, 1, 5, "combo"), ["master"]);
    assert.deepEqual(settings().reasons({}, 1, 5, "behavior"), []);
    assert.deepEqual(settings().reasons(undefined, 2, 5, "combo"), ["placement"], "no definition, no switches of its own");
});

test("the interface reads each layer's reasons, and the keys switched off there by layout index", () => {
    const view = settings({[SETTING.LAYER_COMBOS]: 0xffff ^ 2}).view();
    assert.equal(view.behaviorsEnabled, true);
    assert.equal(view.comboOutputBehaviors, true);
    assert.deepEqual(view.layers[1], {behaviors: [], combos: ["layer"], bypass: [], exclude: []});
    assert.deepEqual(view.layers[2], {behaviors: [], combos: [], bypass: [5], exclude: [5]}, "by layout index, not matrix position");
    assert.equal(view.layers.length, 16);
});

test("a combo's output runs its behaviour on the row's layers, while every switch for it is on", () => {
    const {comboOutputBehaviorLayers} = require("../../core/model/participation");
    const {PROFILE_ACTION_KINDS: ACTION} = require("../../core/schema/profile-blob-v1");
    const gui = 0xe3;
    const row = (more = {}) => ({target: {kind: ACTION.QMK_KEYCODE, operand: gui}, steps: [], enabled: true, allowedLayers: 0b110, ...more});
    const values = [];
    values[SETTING.BEHAVIORS_ENABLED] = 1;
    const settings = {values, layers: [], comboOutputBehaviors: true};
    const layers = (rows, more = {}, combo = {}) => comboOutputBehaviorLayers({...settings, ...more}, rows)({output: gui, useOutputBehavior: true, ...combo});
    assert.equal(layers([row()]), 0b110, "the row's own layers");
    assert.equal(layers([]), 0, "a key with no behaviour runs none");
    assert.equal(layers([row()], {}, {useOutputBehavior: false}), 0, "the combo's Use output behaviour is off");
    assert.equal(layers([row()], {comboOutputBehaviors: false}), 0, "Combo outputs use behaviours is off");
    assert.equal(layers([row()], {values: Object.assign([], values, {[SETTING.BEHAVIORS_ENABLED]: 0})}), 0, "behaviours are off");
    assert.equal(layers([row({enabled: false})]), 0, "the behaviour is off");
    assert.equal(comboOutputBehaviorLayers(undefined, [row()])({output: gui}), 0b110, "with no settings read, the row and the combo decide");
});
