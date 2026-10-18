// The layer plate's "Reached by" lines, from core's layerWays.
import assert from "node:assert/strict";
import test from "node:test";
import {layerReachLines, wayLine} from "../../webview/view/layer-plate.mjs";

const position = (layoutIndex, keycode, editLabel) => ({layoutIndex, keycode, semantic: keycode, display: editLabel, editLabel});
const model = (ways, defaults = [0]) => ({
    vocabulary: {layerWayVerbs: {hold: "hold", lock: "lock", move: "move to", oneShot: "one-shot"}},
    layers: [
        {index: 0, name: "LAYER_0", displayName: "Base", positions: [position(0, "MO(1)", "Hold Number"), position(1, "LEFT_THUMB", "Left Thumb")]},
        {index: 1, name: "LAYER_1", displayName: "Number", positions: [position(5, "TG(2)", "Lock Symbol")]},
        {index: 2, name: "LAYER_2", displayName: "Symbol", positions: []},
    ],
    combos: [{id: 0, inputs: ["KC_SPC", "KC_DEL"], inputDisplays: ["Space", "Delete"]}],
    draft: {layerWays: {complete: true, defaults, layers: ways}},
});
const key = (layer, layoutIndex) => ({layer, layoutIndex});

test("a key's own keycode reads by its name; a behaviour action by its gesture and verb", () => {
    const m = model([]);
    assert.equal(wayLine(m, {verb: "hold", press: "hold", tapIndex: 0, own: true, from: key(0, 0)}, [0]).text, "Hold Number");
    assert.equal(wayLine(m, {verb: "lock", press: "tap", tapIndex: 1, own: false, from: key(0, 1)}, [0]).text, "Double-tap Left Thumb (lock)");
    assert.equal(wayLine(m, {verb: "hold", press: "hold", tapIndex: 1, own: false, from: key(0, 1)}, [0]).text, "Tap+hold Left Thumb");
    assert.equal(wayLine(m, {verb: "lock", press: "longHold", tapIndex: 2, own: false, from: key(0, 1)}, [0]).text, "2 taps+long hold Left Thumb (lock)");
    assert.equal(wayLine(m, {verb: "lock", press: "tap", tapIndex: 0, own: true, from: key(1, 5)}, [0]).text, "Lock Symbol on Number",
        "a way from a layer that is not a default layer says where it is");
    assert.deepEqual(wayLine(m, {verb: "lock", press: "tap", tapIndex: 0, own: true, from: key(1, 5)}, [0]).key, {layer: 1, layoutIndex: 5});
    assert.equal(wayLine(m, {verb: "hold", press: "hold", tapIndex: 0, own: true, from: {combo: 0}}, [0]).text, "Hold Space + Delete together (hold)");
    assert.equal(wayLine(m, {verb: "hold", press: "hold", tapIndex: 0, own: true, from: {trackball: true}}, [0]).text, "Moving the trackball");
    m.layers[0].positions.push({layoutIndex: 9, keycode: "LT(1,KC_J)", semantic: "LT(1,KC_J)", display: "J", editLabel: "J / Number"});
    assert.equal(wayLine(m, {verb: "hold", press: "hold", tapIndex: 0, own: true, from: key(0, 9)}, [0]).text, "Hold J", "a layer-tap is held by its tap key");
});

test("the plate shows three ways and how many more, or says nothing reaches the layer", () => {
    const ways = Array.from({length: 5}, (_, n) => ({verb: "lock", press: "tap", tapIndex: n, own: false, from: key(0, 1)}));
    const reach = layerReachLines(model([{layer: 1, reached: true, ways}]), 1);
    assert.equal(reach.state, "reached");
    assert.deepEqual(reach.lines.map((line) => line.text), ["Tap Left Thumb (lock)", "Double-tap Left Thumb (lock)", "Triple-tap Left Thumb (lock)"]);
    assert.equal(reach.more, 2);
    assert.equal(layerReachLines(model([{layer: 2, reached: false, ways: []}]), 2).state, "unreached");
    assert.equal(layerReachLines(model([{layer: 2, reached: null, ways: []}]), 2).state, "unknown", "an incomplete walk claims nothing");
    assert.equal(layerReachLines(model([]), 0).state, "default");
    assert.equal(layerReachLines({layers: []}, 1).state, "unknown");
});

test("lines that read the same are said once", () => {
    const way = {verb: "hold", press: "hold", tapIndex: 0, own: true, from: key(0, 0)};
    const reach = layerReachLines(model([{layer: 1, reached: true, ways: [way, {...way, verb: "lock", press: "tap"}]}]), 1);
    assert.deepEqual(reach.lines.map((line) => line.text), ["Hold Number"]);
});

test("empty, unnamed, uncoloured layers fold out of the tab strip, except Base and the picked one", async () => {
    const {layerTabs, layerIsEmpty} = await import("../../webview/view/layer-tabs.mjs");
    const empty = (index) => ({index, name: `Layer ${index}`, positions: [{layoutIndex: 0, keycode: "KC_TRANSPARENT"}]});
    const stack = [{index: 0, name: "Base", positions: []}, {index: 1, name: "Number", positions: []}, empty(2), empty(3),
        {...empty(4), positions: [{layoutIndex: 0, keycode: "KC_A"}]}, empty(5)];
    const model = {rgb: {layerColors: [{layerId: 5, color: {h: 0, s: 255, v: 200}}]}};
    assert.equal(layerIsEmpty(model, stack[2]), true);
    assert.equal(layerIsEmpty(model, stack[4]), false, "a layer with keys");
    assert.equal(layerIsEmpty(model, stack[5]), false, "a layer with a colour");
    assert.deepEqual(layerTabs(model, stack, 0), {shown: [0, 1, 4, 5], empty: [2, 3]});
    assert.deepEqual(layerTabs(model, stack, 3), {shown: [0, 1, 3, 4, 5], empty: [2]});
});
