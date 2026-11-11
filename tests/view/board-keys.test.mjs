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

test("a dot carries the colour its tier flashes, none while behaviour feedback is off", () => {
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

test("a key is named as the board names it, never by its layout index", () => {
    assert.equal(keyOf(model, 0, [], 0).name, "C");
    assert.equal(keyOf(model, 2, [], 0).name, "Transparent", "a transparent key says so");
    assert.equal(keyOf(model, 2, [0], 0).name, "C", "and seen through to Base, names the key that answers");
});

test("every key carries its LED, and the LEDs picked for an accent show in its colour", () => {
    const key = keyOf(model, 0, [], 1);
    assert.deepEqual([key.led, key.picked], [keyLed(model, 1), false], "Lighting numbers each key by the LED it carries");
    const red = {h: 0, s: 255, v: 200};
    const picked = keyOf(model, 0, [], 1, {accent: {leds: new Set([keyLed(model, 1)]), colour: red}});
    assert.deepEqual([picked.picked, picked.light], [true, red], "a picked LED wears the accent's colour over the layer's");
    assert.deepEqual([picked.main, picked.tiers.length], [key.main, key.tiers.length], "and keeps its face and marks");
    const unpicked = keyOf(model, 0, [], 0, {accent: {leds: new Set([keyLed(model, 1)]), colour: red}});
    assert.deepEqual([unpicked.picked, unpicked.light], [false, keyOf(model, 0, [], 0).light], "others keep the layer's light");
    const dark = keyOf(model, 0, [], 1, {accent: {leds: new Set([keyLed(model, 1)]), colour: null}});
    assert.deepEqual([dark.picked, dark.light], [true, key.light], "an accent that would paint nothing leaves the light as it is, still picked");
    const plain = keyOf(model, 0, [], 1, {faces: false});
    assert.ok(plain.light, "without faces a key is still lit");
    assert.deepEqual([plain.tiers, plain.badges], [[], []], "but wears no marks");
});

test("the trackball shows its light, solid on base, and wears an accent's colour while picked", () => {
    const ball = boardTrackball(layerView(model, 0));
    assert.deepEqual([ball.led, ball.glass, ball.picked], [model.leds.trackball, false, false]);
    assert.ok(ball.light);
    const red = {h: 0, s: 255, v: 200};
    assert.deepEqual(boardTrackball(layerView(model, 2), {accent: {leds: new Set([model.leds.trackball]), colour: red}}),
        {led: model.leds.trackball, picked: true, light: red, glass: false});
});

test("a key wears one icon for each kind of thing it plays, sends or runs, its own first", () => {
    // D taps macro 1 and holds Volume locked on; F taps Dragscroll and holds
    // Zoom; E's row runs only on Numbers. Symbols is transparent at the
    // pointing key.
    const model = published({
        keys: {0: {5: "MACRO_0", 6: "CUSTOM_KEY_0", 7: "PD_MODE_0", 8: "KC_D", 9: "KC_E", 10: "MACRO_2", 11: "KC_F"}, 2: {7: "KC_TRANSPARENT"}},
        behaviours: [
            {keycode: "KC_D", steps: [{tapCount: 0, tap: {action: "MACRO_1"}, hold: {action: "PD_MODE_1_LOCK", style: "TAP_AT_HOLD_THRESHOLD"}}]},
            {keycode: "KC_E", allowedLayers: NUMBERS, steps: [{tapCount: 0, tap: {action: "CUSTOM_KEY_1"}}]},
            {keycode: "MACRO_2", steps: [{tapCount: 0, hold: {action: "MACRO_3", style: "TAP_AT_HOLD_THRESHOLD"}, longHold: {action: "CUSTOM_KEY_1", style: "TAP_AT_HOLD_THRESHOLD"}}]},
            {keycode: "KC_F", steps: [{tapCount: 0, tap: {action: "PD_MODE_0"}, hold: {action: "PD_MODE_3", style: "TAP_AT_HOLD_THRESHOLD"}}]},
        ]});
    /** @param {number} at @param {number} index @param {number[]} [held] @param {Parameters<typeof boardKeys>[1]} [shows] */
    const icons = (at, index, held = [], shows) => keyOf(model, at, held, index, shows).icons;

    assert.deepEqual(icons(0, 5), ["macro"], "a macro's key");
    assert.deepEqual(icons(0, 6), ["customKey"], "a custom key");
    assert.deepEqual(icons(0, 7), ["pointing"], "a pointing key");
    assert.deepEqual(icons(0, 8), ["macro", "pointing"], "a plain key whose behaviour plays a macro and runs a pointing mode, in tier order");
    assert.deepEqual(icons(0, 10), ["macro", "customKey"], "its own macro once, then what its behaviour sends");
    assert.deepEqual(icons(0, 11), ["pointing"], "two pointing modes, one icon");
    assert.deepEqual(icons(0, 9), [], "a behaviour a switch keeps off marks nothing, as its dots don't");
    assert.deepEqual(icons(1, 9), [], "Numbers holds no E");
    assert.deepEqual(icons(0, 0), [], "a plain key has none");

    assert.deepEqual(icons(2, 7), [], "a transparent key shows none of its own");
    assert.deepEqual(icons(2, 7, [0]), ["pointing"], "seen through to Base, the answering key's");
    assert.deepEqual(icons(0, 8, [], {faces: false}), [], "no marks, no icons");
});
