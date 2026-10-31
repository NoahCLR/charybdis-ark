import assert from "node:assert/strict";
import test from "node:test";
import {boardKeys, boardTrackball} from "../../webview/view/board-keys.mjs";
import {layerView} from "../../webview/view/layer-view.mjs";
import {keyLed} from "../../webview/view/lighting.mjs";
import {rgbStages} from "../../webview/view/edits.mjs";
import {published} from "../fixtures/published-behaviours.mjs";

// A double tap that sends X, on C only on Numbers and on B everywhere; Q+W
// sends B. Base holds C, B, Q and W; Numbers C again; Symbols is transparent
// at C and B.
const tapX = {tapCount: 1, tap: {action: "KC_X"}};
const NUMBERS = 2;
/** @param {object[]} [edits] */
const modelOf = (edits = []) => published({keys: {0: {0: "KC_C", 1: "KC_B", 3: "KC_Q", 4: "KC_W"}, 1: {0: "KC_C"}, 2: {0: "KC_TRANSPARENT", 1: "KC_TRANSPARENT"}},
    combos: [{inputs: ["KC_Q", "KC_W"], output: "KC_B"}],
    behaviours: [{keycode: "KC_C", allowedLayers: NUMBERS, steps: [tapX]}, {keycode: "KC_B", steps: [tapX]}], edits});
const model = modelOf();
/** @param {any} model @param {number} at @param {number[]} held @param {number} index @param {Parameters<typeof boardKeys>[1]} [shows] */
const keyOf = (model, at, held, index, shows) => {
    const key = boardKeys(layerView(model, at, held), shows).find((entry) => entry.index === index);
    assert.ok(key, `the board draws index ${index}`);
    return key;
};
/** @param {ReturnType<typeof keyOf>} key */
const dots = (key) => key.tiers.map((tier) => `${tier.kind} ${tier.count}`);

test("the board draws every key of the layer, in its order", () => {
    assert.deepEqual(boardKeys(layerView(model, 2)).map((key) => key.index), model.layers[2].positions.map((/** @type {{layoutIndex: number}} */ position) => position.layoutIndex));
    assert.deepEqual(boardKeys(layerView(null, 0)), [], "with no model there is nothing to draw");
});

test("a key wears its behaviour's dots only where the behaviour runs, judged on the layer that supplies it", () => {
    assert.deepEqual(dots(keyOf(model, 1, [], 0)), ["tap 1"], "C's row runs on Numbers");
    assert.deepEqual(dots(keyOf(model, 0, [], 0)), [], "and not on Base");
    assert.deepEqual(dots(keyOf(model, 0, [], 1)), ["tap 1"]);

    const alone = keyOf(model, 2, [], 0);
    assert.deepEqual([alone.kind, alone.from, alone.glass, alone.shown?.keycode, dots(alone)], ["transparent", null, true, "KC_TRANSPARENT", []],
        "shown alone, a transparent key shows itself");

    const throughNumbers = keyOf(model, 2, [1], 0);
    assert.deepEqual([throughNumbers.kind, throughNumbers.from, throughNumbers.glass, throughNumbers.shown?.keycode, throughNumbers.meaning, dots(throughNumbers)],
        ["key", model.layers[1], true, "KC_C", "KC_C", ["tap 1"]], "previewed over Numbers, it shows Numbers' C, glass, with the dots C runs there");
    const throughBase = keyOf(model, 2, [0], 0);
    assert.deepEqual([throughBase.from, dots(throughBase)], [model.layers[0], []], "answered by Base's C, it marks nothing: C's row does not run on Base");
});

test("a dot carries the colour its tier flashes, none while key feedback is off", () => {
    assert.notEqual(keyOf(model, 0, [], 1).tiers[0].colour, null);
    const off = modelOf([rgbStages(model.rgb.stageEnableMask, 16, false)]);
    assert.deepEqual(keyOf(off, 0, [], 1).tiers, [{kind: "tap", count: 1, colour: null}]);
});

test("a key in a combo wears its badge, lit in the combo feedback colour while that stage is on", () => {
    assert.deepEqual(keyOf(model, 0, [], 3).badges, [{text: "C0", lit: model.rgb.comboFeedback.color}]);
    const off = modelOf([rgbStages(model.rgb.stageEnableMask, 8, false)]);
    assert.deepEqual(keyOf(off, 0, [], 3).badges, [{text: "C0", lit: null}]);
    assert.deepEqual(keyOf(model, 0, [], 1).badges, []);
});

test("the LED selector names each key's LED, and shows no light, marks or second line", () => {
    const led = keyOf(model, 0, [], 1, {mode: "leds"});
    assert.deepEqual([led.main, led.sub, led.light, led.tiers, led.badges], [String(keyLed(model, 1)), "", null, [], []]);
    const plain = keyOf(model, 0, [], 1, {faces: false});
    assert.ok(plain.light, "without faces a key is still lit");
    assert.deepEqual([plain.tiers, plain.badges], [[], []], "but wears no marks");
    assert.equal(keyOf(model, 2, [1], 0, {mode: "leds"}).from, null, "and a selector shows each layer's own key");
});

test("the trackball shows its light, solid on base, and in the LED selector only its index", () => {
    const ball = boardTrackball(layerView(model, 0));
    assert.deepEqual([ball.led, ball.glass], [model.leds.trackball, false]);
    assert.ok(ball.light);
    assert.deepEqual(boardTrackball(layerView(model, 2), {mode: "leds"}), {led: model.leds.trackball, light: null, glass: false});
});
