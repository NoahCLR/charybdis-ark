import assert from "node:assert/strict";
import test from "node:test";
import {createRequire} from "node:module";
import {tabReach} from "../../webview/view/tab-reach.mjs";
import {comboBehaviourFor} from "../../webview/view/behaviour-reach.mjs";
import {layerView} from "../../webview/view/layer-view.mjs";
import {macroMessage} from "../../webview/view/edits.mjs";
import {published} from "../fixtures/published-behaviours.mjs";

const {keyAt} = createRequire(import.meta.url)("../fixtures/published-model.js");

// The behaviour views read what core publishes for a profile (published): its
// layers with their answers, its combos and the reach core works out for them.

// A behaviour on `keycode` that sends X on a double tap: a row that changes something.
const behaviourOn = (/** @type {string} */ keycode) => ({keycode, steps: [{tapCount: 1, tap: {action: "KC_X"}}]});

test("behaviours group by how this layer reaches them", () => {
    const model = published({keys: {0: {0: "KC_ESCAPE", 1: "KC_1", 2: "KC_9", 3: "KC_B"}, 1: {0: "CUSTOM_KEY_0", 1: "KC_TRANSPARENT", 2: "KC_NO", 3: "KC_TRANSPARENT"}},
        behaviours: ["KC_ESCAPE", "CUSTOM_KEY_0", "KC_1", "KC_9"].map(behaviourOn)});

    const groups = layerView(model, 1).behaviours.groups;
    assert.deepEqual(groups.here.map((row) => row.keycode), ["CUSTOM_KEY_0"], "stored on this layer");
    assert.deepEqual(groups.through.map((entry) => entry.row.keycode), ["KC_1"],
        "a transparent key lets the layer underneath answer");
    assert.equal(groups.through[0].layer.name, "Layer 0", "and the group names the layer that answers");
    assert.deepEqual(groups.elsewhere.map((row) => row.keycode), ["KC_9", "KC_ESCAPE"],
        "KC_ESCAPE is covered on this layer and KC_NO stops the fall-through to KC_9");

    const base = layerView(model, 0).behaviours.groups;
    assert.deepEqual(base.here.map((row) => row.keycode), ["KC_ESCAPE", "KC_1", "KC_9"]);
    assert.deepEqual(base.through, [], "nothing lies under the base layer");
    assert.deepEqual(base.elsewhere.map((row) => row.keycode), ["CUSTOM_KEY_0"]);
});

test("a behaviour a combo sends is reached, though no key carries it", () => {
    const model = published({keys: {0: {0: "KC_J", 1: "KC_K", 2: "KC_L"}, 1: {0: "KC_TRANSPARENT", 1: "KC_K", 2: "KC_1"}},
        combos: [{inputs: ["KC_J", "KC_K"], output: "CUSTOM_KEY_0"}, {inputs: ["KC_K", "KC_L"], output: "CUSTOM_KEY_0"}],
        behaviours: ["CUSTOM_KEY_0", "KC_9"].map(behaviourOn)});

    const base = layerView(model, 0).behaviours.groups;
    assert.deepEqual(base.here, [], "no key carries it");
    assert.deepEqual(base.combos.map((entry) => [entry.row.keycode, entry.combos.map((route) => route.combo.badge)]),
        [["CUSTOM_KEY_0", ["C0", "C1"]]], "one row, naming every combo that sends it");
    assert.deepEqual(tabReach(layerView(model, 0), "behaviours").keysFor("combos:CUSTOM_KEY_0").sort(), [0, 1, 2],
        "the board rings the keys chorded for either combo");
    assert.deepEqual(base.elsewhere.map((row) => row.keycode), ["KC_9"], "no longer called unreachable");

    const above = layerView(model, 1).behaviours.groups;
    assert.deepEqual(above.combos, [], "C0 needs the transparent J, and C1 needs L, which Numbers covers");
    assert.deepEqual(above.combosBelow.map((entry) => [entry.row.keycode, entry.combos.map((route) => route.combo.badge)]),
        [["CUSTOM_KEY_0", ["C0"]]]);
});

test("a behaviour picked under one route rings only that route's keys", () => {
    // The Pointer layer case: KC_LEFT_GUI sits on Base's thumb, which the
    // Pointer layer leaves transparent, and a combo chorded on two Pointer
    // keys sends it too. Picked under the combo, the thumb is not the answer.
    const model = published({keys: {0: {48: "KC_LEFT_GUI", 30: "KC_N", 31: "KC_M"}, 4: {48: "KC_TRANSPARENT", 30: "PD_MODE_1", 31: "MS_BTN1"}},
        combos: [{inputs: ["MS_BTN1", "PD_MODE_1"], output: "KC_LEFT_GUI"}], behaviours: [behaviourOn("KC_LEFT_GUI")]});
    const groups = layerView(model, 4).behaviours.groups;
    assert.deepEqual(groups.through.map((entry) => entry.row.keycode), ["KC_LEFT_GUI"], "listed under the transparent key");
    assert.deepEqual(groups.combos.map((entry) => entry.row.keycode), ["KC_LEFT_GUI"], "and under the combo");
    assert.deepEqual(groups.combosBelow, [], "the combo needs no transparent key");

    const ring = (/** @type {string | null} */ route) => layerView(model, 4).behaviours.routeKeys("KC_LEFT_GUI", route).sort((a, b) => a - b);
    assert.deepEqual(ring("combos"), [30, 31], "the chord, not the thumb");
    assert.deepEqual(ring("through"), [48], "the thumb that falls through to Base");
    assert.deepEqual(ring("here"), [], "no key on Pointer carries it");
    assert.deepEqual(ring(null), [30, 31, 48], "with no route, every way in");
    assert.deepEqual(layerView(model, 4).behaviours.routeKeys(null), []);
});

test("generated behaviour lists use the declared owner's physical source rather than reference or other member", () => {
    // The layers core publishes for a combo's output are the row's own.
    const view = (/** @type {{inputs?: string[], allowedLayers?: number, useOutputBehavior?: boolean, reference?: number}} */ {inputs = ["KC_A", "KC_B"], allowedLayers = 1, useOutputBehavior = true, reference = 1} = {}) => {
        const model = published({keys: {0: {0: "KC_C", 1: "KC_B"}, 1: {0: "KC_A", 1: "KC_TRANSPARENT"}, 2: {0: "KC_A", 1: "KC_B"}},
            combos: [{inputs, output: "CUSTOM_KEY_0", useOutputBehavior}],
            behaviours: [{keycode: "CUSTOM_KEY_0", allowedLayers, steps: [{tapCount: 1, tap: {action: "MACRO_0"}}]}],
            settings: (settings) => { settings.layers[1].reference = reference; },
            edits: [macroMessage("MACRO_0", "{KC_A}")]});
        // Base previewed on under Numbers, so B answers from it in the view.
        return layerView(model, 1, [0]).behaviours.inView;
    };
    assert.equal(view().length, 1, "B owns Base policy despite A coming from Numbers");
    assert.equal(view({inputs: ["KC_B", "KC_A"]}).length, 0, "A becomes the declared owner, so B cannot lend its allowance");
    assert.equal(view({reference: 2}).length, 1, "reference remapping retains Base's physical origin");
    assert.equal(view({reference: 2, allowedLayers: 4}).length, 0, "a reference-layer allowance cannot enable the output");
    assert.equal(view({reference: 2, useOutputBehavior: false}).length, 0, "no layers, as with the behaviour or the behaviours switch off");
});

test("a combo runs its output's behaviour only when its last input's key comes from a layer the behaviour runs on", () => {
    // CUSTOM_KEY_0's behaviour runs on Base alone; CUSTOM_KEY_1 has none.
    const model = published({keys: {0: {0: "KC_J", 1: "KC_K"}, 1: {0: "KC_J", 1: "KC_K"}, 2: {0: "KC_TRANSPARENT", 1: "KC_TRANSPARENT"}},
        combos: [{inputs: ["KC_J", "KC_K"], output: "CUSTOM_KEY_0"}, {inputs: ["KC_J", "KC_K"], output: "CUSTOM_KEY_1"},
            {inputs: ["KC_J", "KC_K"], output: "CUSTOM_KEY_0", useOutputBehavior: false}],
        behaviours: [{keycode: "CUSTOM_KEY_0", allowedLayers: 1, steps: [{tapCount: 1, tap: {action: "KC_X"}}]}]});
    const stack = model.layers;
    // The key at `layoutIndex`, pressed from `layer`.
    const key = (/** @type {number} */ layer, /** @type {number} */ layoutIndex) => ({layer: stack[layer], fellThrough: false, whileHeld: false,
        position: keyAt(model, layer, layoutIndex)});
    const [sends, none, bypassed] = model.combos;
    assert.equal(comboBehaviourFor(layerView(model, 0), sends, [key(0, 0), key(0, 1)])?.keycode, "CUSTOM_KEY_0", "both keys from Base");
    assert.equal(comboBehaviourFor(layerView(model, 1), sends, [key(1, 0), key(1, 1)]), undefined, "both from layer 1, where it does not run");
    assert.equal(comboBehaviourFor(layerView(model, 1), sends, [key(1, 0), key(0, 1)])?.keycode, "CUSTOM_KEY_0", "K, its last input, from Base decides");
    assert.equal(comboBehaviourFor(layerView(model, 1), sends, [key(0, 0), key(1, 1)]), undefined, "J from Base cannot lend K its layer");
    // Matched on a reference layer's raw keys, the key's layer is the one
    // that answers that place in the view: on layer 2, which is transparent
    // there, Base once it is on too.
    const referenced = [key(1, 0), {...key(1, 1), reference: true}];
    assert.equal(comboBehaviourFor(layerView(model, 2, [0]), sends, referenced)?.keycode, "CUSTOM_KEY_0", "a reference key's place answers from Base");
    assert.equal(comboBehaviourFor(layerView(model, 2), sends, referenced), undefined, "layer 2 shown alone answers nothing there");
    assert.equal(comboBehaviourFor(layerView(model, 1), sends, referenced), undefined, "and on layer 1 from layer 1");
    assert.equal(comboBehaviourFor(layerView(model, 0), none, [key(0, 0), key(0, 1)]), undefined, "an output with no behaviour runs none");
    assert.equal(bypassed.outputBehaviorLayers, 0);
    assert.equal(comboBehaviourFor(layerView(model, 0), bypassed, [key(0, 0), key(0, 1)]), undefined, "a combo that bypasses its output's behaviour runs none");
});
