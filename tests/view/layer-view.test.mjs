import assert from "node:assert/strict";
import test from "node:test";
import {createRequire} from "node:module";
import {layerView} from "../../webview/view/layer-view.mjs";
import {behaviourEditorRow, canHaveBehaviour} from "../../webview/view/behavior-editor.mjs";

const require = createRequire(import.meta.url);
const {demoDocument, profileDocument, publishedModel} = require("../fixtures/published-model.js");
const {buildDeviceModel} = require("../../core/session/device-model");
const {layoutOf, layoutRead} = require("../../core/session/profile-reads");
const {LAYERS} = require("../../core/data/charybdis-layout");

// The answers at these layout indexes, as "keycode from layer".
/** @param {import("../../webview/view/keyface-types.js").LayerView} view @param {"answerAt" | "shownAt"} ask @param {number[]} indexes */
const read = (view, ask, ...indexes) => indexes.map((index) => {
    const key = view[ask](index);
    return key ? `${key.position.keycode} from ${key.layer.displayName}` : null;
});

test("a view is one value for a model, a layer on top and the layers previewed under it", () => {
    const model = publishedModel(profileDocument({keys: {0: {0: "KC_A"}, 1: {0: "KC_1"}, 2: {0: "KC_TRANSPARENT"}}}));
    const view = layerView(model, 2, [1, 0]);
    assert.deepEqual([view.at, view.held, view.layer, view.previewing], [2, [1, 0], model.layers[2], true]);
    assert.equal(layerView(model, 2, [1, 0]), view, "the same layers make the same value, worked out once");
    assert.notEqual(layerView({...model}, 2, [1, 0]), view, "another model, another view");

    const alone = layerView(model, 2);
    assert.deepEqual([alone.held, alone.previewing], [[], false]);
    assert.equal(view.alone, alone, "the layer shown alone is the same view");
    assert.equal(alone.alone, alone);
    assert.equal(view.under([1]), layerView(model, 2, [1]), "and another preview of the same layer");
    assert.equal(view.combos.groups, alone.combos.groups, "what the layers held do not change is the layer's own");
    assert.equal(view.behaviours.groups, alone.behaviours.groups);
    assert.equal(view.reachable, alone.reachable);
    assert.equal(view.combos.marks, view.combos.marks, "and every answer is kept with its view");

    assert.equal(layerView(null, 0).layer, undefined, "with no model there is no layer to show");
    assert.deepEqual(layerView(null, 0).combos.shownAt(0), []);
});

test("a key answers as the keyboard would, and shows only what the layers on in the view hold", () => {
    const model = publishedModel(profileDocument({keys: {
        0: {0: "KC_A", 1: "KC_B"},
        1: {0: "KC_1", 1: "KC_TRANSPARENT"},
        2: {0: "KC_TRANSPARENT", 1: "KC_TRANSPARENT"},
    }}));
    // Pressed, base always answers a transparent key; shown alone, a layer is the view by itself.
    assert.deepEqual(read(layerView(model, 2), "answerAt", 0, 1), ["KC_A from Base", "KC_B from Base"]);
    assert.deepEqual(read(layerView(model, 2), "shownAt", 0, 1), [null, null]);
    assert.deepEqual(read(layerView(model, 2, [1]), "answerAt", 0, 1), ["KC_1 from Numbers", "KC_B from Base"]);
    assert.deepEqual(read(layerView(model, 2, [1]), "shownAt", 0, 1), ["KC_1 from Numbers", "KC_B from Base"], "a preview has base on");
    assert.deepEqual(read(layerView(model, 2), "answerAt", 99, undefined), [null, null], "a position the layer does not have answers nothing");
});

// The board, the Key tab and the Behaviours tab open the same key for a pick.
test("a transparent key in a layer preview opens the key answered from below", () => {
    const model = publishedModel(profileDocument({keys: {
        0: {0: "KC_A", 1: "KC_B", 2: "KC_C", 3: "CUSTOM_KEY_0"},
        3: {0: "KC_DELETE", 1: "KC_NO", 2: "KC_TRANSPARENT", 3: "KC_TRANSPARENT"},
        4: {0: "KC_TRANSPARENT", 1: "KC_TRANSPARENT", 2: "KC_TRANSPARENT", 3: "KC_TRANSPARENT"},
    }}));
    const stack = model.layers;
    /** @param {number[]} held @param {number} index */
    const key = (held, index) => {
        const found = layerView(model, 4, held).behaviours.keyAt(index);
        return [found.keycode, found.from?.displayName ?? null];
    };

    assert.deepEqual(key([3], 0), ["KC_DELETE", "Navigation"], "the layer held under it answers");
    assert.deepEqual(key([3], 2), ["KC_C", "Base"], "through two transparent keys to the default layer");
    assert.deepEqual(key([3], 3), ["CUSTOM_KEY_0", "Base"], "rows are found by what a key means, not its stored name");
    assert.equal(behaviourEditorRow(model, key([3], 1)[0]), undefined, "a key answered by KC_NO still has no editor");
    // With no preview the base layer still answers, as the Key tab's status line says.
    assert.deepEqual(key([], 0), ["KC_A", "Base"], "outside a preview the base layer answers");
    assert.deepEqual(key([], 3), ["CUSTOM_KEY_0", "Base"]);
    const numbers = layerView(model, 3).behaviours;
    assert.deepEqual(numbers.keyAt(2), {keycode: "KC_C", from: stack[0]}, "a transparent key on a layer above the base");
    assert.equal(behaviourEditorRow(model, numbers.keyAt(1).keycode), undefined, "KC_NO itself has no editor");
    assert.deepEqual(numbers.keyAt(0), {keycode: "KC_DELETE", from: null}, "a mapped key opens its own row");
    assert.deepEqual(numbers.keyAt(99), {keycode: "", from: null}, "no position, no key");

    const hollow = publishedModel(profileDocument({keys: {0: {0: "KC_TRANSPARENT"}, 1: {0: "KC_TRANSPARENT"}}}));
    assert.deepEqual(layerView(hollow, 1, [0]).behaviours.keyAt(0), {keycode: "KC_TRANSPARENT", from: null}, "nothing mapped below");
    assert.deepEqual(layerView(hollow, 1).behaviours.keyAt(0), {keycode: "KC_TRANSPARENT", from: null}, "nothing mapped below, no preview");
    const overNothing = publishedModel(profileDocument({keys: {1: {0: "KC_TRANSPARENT"}}}));
    const below = layerView(overNothing, 1).behaviours.keyAt(0);
    assert.equal(below.keycode, "KC_NO", "a transparent key over KC_NO follows it");
    assert.equal(canHaveBehaviour(model, below.keycode), false, "and still has no behaviour");
});

// A view counts layers by their place in the stack, as `state.layer` and the
// layer tabs do, and reads a layer's `index` where a mask or a switch names it
// by bit. The two are the same number on every model core publishes: a
// keyboard's layout as read, and a draft's, the demo's or a file's snapshot.
test("a layer's place in the stack is its index on every model core publishes", () => {
    const keymap = Array.from({length: LAYERS}, () => Array(60).fill(0));
    const models = {
        device: buildDeviceModel({layout: layoutRead(layoutOf(keymap, LAYERS))}),
        demo: publishedModel(demoDocument()),
        profile: publishedModel(profileDocument()),
    };
    for (const [source, model] of Object.entries(models)) {
        assert.equal(model.layers.length, LAYERS, source);
        assert.deepEqual(model.layers.map((/** @type {{index: number}} */ layer) => layer.index), model.layers.map((_, at) => at), source);
        for (const [at] of model.layers.entries()) assert.equal(layerView(model, at).layer.index, at, source);
    }
});
