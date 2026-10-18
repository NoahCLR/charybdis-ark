// What a key does, as the Key tab's Does line and the hover card say it.
import assert from "node:assert/strict";
import test from "node:test";
import {answerBelow, keySummary, timingWords} from "../../webview/view/key-summary.mjs";

const timing = {tappingTerm: "200", tapHoldTerm: "150", longerHoldTerm: "400", multiTapTerm: "150"};
const sources = {tapHoldTerm: "tapHoldTerm", longerHoldTerm: "longHoldTerm", multiTapTerm: "multiTapTerm"};
const vocabulary = {timingSources: {tappingTerm: "dual-role", tapHoldTerm: "behaviour default", longHoldTerm: "default", multiTapTerm: "default"},
    layerKeyEffects: {MO: "on while held", TG: "on until pressed again"}};
const at = (layoutIndex, keycode, semantic = keycode) => ({layoutIndex, keycode, semantic, display: keycode, editLabel: keycode});
function model(extra = {}) {
    return {
        vocabulary, behaviorTimingDefaults: timing, qmkKeyLayers: {"MO(1)": 1, "TG(2)": 2, "LT(3,KC_F)": 3},
        behaviorEditing: {keyDefaults: {
            "LT(3,KC_F)": {builtIn: {tap: {helper: "TAP_SENDS", action: "KC_F"}, hold: {helper: "PRESS_AND_HOLD_UNTIL_RELEASE", action: "MO(3)"}},
                timing: {...timing, tapHoldTerm: "200"}, timingSources: {...sources, tapHoldTerm: "tappingTerm"}},
            "MO(1)": {builtIn: {hold: {helper: "PRESS_AND_HOLD_UNTIL_RELEASE", action: "MO(1)", fromPress: true}}, timing, timingSources: sources},
            PD_SLOT_0: {builtIn: {hold: {helper: "PRESS_AND_HOLD_UNTIL_RELEASE", action: "0x7E80", fromPress: true}}, timing, timingSources: sources},
            KC_ESCAPE: {builtIn: {tap: {helper: "TAP_SENDS", action: "KC_ESCAPE"}}, timing, timingSources: sources},
            KC_A: {builtIn: {tap: {helper: "TAP_SENDS", action: "KC_A"}, hold: {helper: "PRESS_AND_HOLD_UNTIL_RELEASE", action: "KC_A"}}, timing, timingSources: sources},
        }},
        keyBehaviors: [],
        ...extra,
    };
}

test("a layer key says what it does to its layer, and a plain key is just itself", () => {
    const layer = keySummary(model(), at(0, "MO(1)"));
    assert.equal(layer.kind, "layer");
    assert.equal(layer.effect, "on while held");
    assert.deepEqual(layer.parts, []);
    const plain = keySummary(model(), at(0, "KC_A"));
    assert.deepEqual([plain.kind, plain.parts, plain.timing, plain.costs], ["key", [], [], []], "held down, a plain key is just itself");
});

test("a layer-tap reads as its tap and its hold, waiting on the dual-role setting", () => {
    const summary = keySummary(model(), at(0, "LT(3,KC_F)"));
    assert.deepEqual(summary.parts.map((part) => [part.lead, part.action]), [["Tap", "KC_F"], ["Hold", "MO(3)"]]);
    assert.equal(timingWords(summary.timing), "hold after 200 ms (dual-role)");
    assert.deepEqual(summary.costs, ["Tap sends on release."]);
});

test("a behaviour's actions read by their press, with multi-tap's wait said", () => {
    const behaviour = {keycode: "KC_ESCAPE", builtIn: {tap: {helper: "TAP_SENDS", action: "KC_ESCAPE"}}, tapHoldTerm: "0", longerHoldTerm: "0", multiTapTerm: "0", steps: [
        {tapCount: 0, longHold: {action: "LALT(LGUI(KC_ESCAPE))", helper: "PRESS_AND_HOLD_UNTIL_RELEASE"}},
        {tapCount: 1, tap: {action: "KC_GRAVE", helper: "TAP_SENDS"}},
    ]};
    const summary = keySummary(model({keyBehaviors: [behaviour]}), at(0, "KC_ESCAPE"));
    assert.deepEqual(summary.parts.map((part) => [part.lead, part.action]), [["Tap", "KC_ESCAPE"], ["Long hold", "LALT(LGUI(KC_ESCAPE))"], ["2×", "KC_GRAVE"]]);
    assert.equal(timingWords(summary.timing), "long hold after 400 ms (default) · taps within 150 ms (default)", "no Hold, so no hold threshold");
    assert.deepEqual(summary.costs, ["Single taps wait 150 ms for a second tap.", "Tap sends on release."]);
});

test("a pointing key's transparent tap is what answers from the layer below (B9)", () => {
    const behaviour = {keycode: "PD_SLOT_0", builtIn: {hold: {helper: "PRESS_AND_HOLD_UNTIL_RELEASE", action: "0x7E80", fromPress: true}}, tapHoldTerm: "0", longerHoldTerm: "0", multiTapTerm: "0", steps: [{tapCount: 0, tap: {action: "KC_TRANSPARENT", helper: "TAP_SENDS"}}]};
    const stack = [
        {index: 0, name: "Base", positions: [at(5, "KC_DOT")]},
        {index: 1, name: "Nav", positions: [at(5, "KC_TRANSPARENT")]},
        {index: 2, name: "Pointing", positions: [at(5, "QK_USER_16", "PD_SLOT_0")]},
    ];
    const summary = keySummary(model({keyBehaviors: [behaviour], layers: stack}), stack[2].positions[0], {stack, at: 2, held: [1]});
    assert.deepEqual(summary.parts.map((part) => [part.lead, part.action, part.from?.name]), [["Tap", "KC_DOT", "Base"], ["Hold", "0x7E80", undefined]]);
    assert.equal(answerBelow(stack, 2, [1], 5)?.layer.name, "Base", "a transparent layer in between is passed over");
    assert.equal(answerBelow(stack, 2, [], 9), null);
});

test("Nothing and Transparent have no parts; dangerous and unbuilt keys say so", () => {
    assert.equal(keySummary(model(), at(0, "KC_NO")).kind, "disabled");
    assert.equal(keySummary(model(), at(0, "KC_TRANSPARENT")).kind, "transparent");
    assert.match(keySummary(model(), at(0, "QK_BOOTLOADER")).danger, /flashing mode/);
    assert.equal(keySummary(model({qmkKeycodes: [{value: "QK_CAPS_WORD_TOGGLE", group: "quantum"}]}), at(0, "QK_CAPS_WORD_TOGGLE")).inert, true);
    assert.equal(keySummary(model({qmkKeycodes: [{value: "UG_TOGG", group: "underglow"}]}), at(0, "UG_TOGG")).inert, true);
    assert.equal(keySummary(model(), at(0, "KC_A")).inert, false);
});
