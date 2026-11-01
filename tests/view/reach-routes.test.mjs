import assert from "node:assert/strict";
import test from "node:test";
import {routesOf} from "../../webview/view/reach-routes.mjs";
import {layerView} from "../../webview/view/layer-view.mjs";
import {published} from "../fixtures/published-behaviours.mjs";

// A behaviour on `keycode` that sends X on a double tap.
const behaviourOn = (/** @type {string} */ keycode) => ({keycode, steps: [{tapCount: 1, tap: {action: "KC_X"}}]});
// Base holds J, K and 1; Numbers its custom key over a transparent K and 1.
// The combo needs Numbers' custom key and Base's K.
const model = published({keys: {0: {0: "KC_J", 1: "KC_K", 2: "KC_1"}, 1: {0: "CUSTOM_KEY_0", 1: "KC_TRANSPARENT", 2: "KC_TRANSPARENT"}},
    combos: [{inputs: ["CUSTOM_KEY_0", "KC_K"], output: "KC_TAB"}], behaviours: ["CUSTOM_KEY_0", "KC_K"].map(behaviourOn)});
const sends = [{action: "KC_X", cell: {branch: 2, tier: "tap"}}];

/** @param {import("../../webview/view/keyface-types.js").ReachRoute[]} routes */
const read = (routes) => routes.filter((route) => route.how !== "key" || route.action !== "KC_NO").map((route) =>
    route.how === "key" ? ["key", route.below, route.action, route.key.layer.index]
        : route.how === "behaviour" ? ["behaviour", route.below, route.row.keycode, route.layer?.index ?? null, route.sends]
            : ["combo", route.below, route.combo.badge, route.action]);

test("a layer's routes list its keys, then each behaviour on its own keys, then each under a transparent key, then its combos", () => {
    assert.deepEqual(read(routesOf(layerView(model, 1), "layer")), [
        ["key", false, "CUSTOM_KEY_0", 1], ["key", true, "KC_K", 0], ["key", true, "KC_1", 0],
        ["behaviour", false, "CUSTOM_KEY_0", null, sends],
        ["behaviour", true, "KC_K", 0, sends],
        ["combo", true, "C0", "KC_TAB"],
    ]);
    assert.deepEqual(read(routesOf(layerView(model, 1), "view")), [["key", false, "CUSTOM_KEY_0", 1], ["behaviour", false, "CUSTOM_KEY_0", null, sends]],
        "the view lists each key it shows and the behaviour it carries, key by key");
});

test("each walk is made once per view, and a layer's walk is the same whatever is held", () => {
    const alone = layerView(model, 1), held = layerView(model, 1, [0]);
    assert.equal(routesOf(alone, "view"), routesOf(alone, "view"));
    assert.equal(routesOf(alone, "layer"), routesOf(alone, "layer"));
    assert.equal(routesOf(held, "layer"), routesOf(alone, "layer"), "the layers held do not change what the layer reaches");
    assert.notEqual(routesOf(held, "view"), routesOf(alone, "view"), "but they change what the board shows");
});
