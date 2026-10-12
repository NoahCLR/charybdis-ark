import assert from "node:assert/strict";
import test from "node:test";
import {withAnswers} from "../fixtures/layer-answers.mjs";
import {resolvedPositions, reachablePositions, comboActivations, activations} from "../../webview/view/layer-resolution.mjs";
import {pointingReach} from "../../webview/view/reach.mjs";

test("a transparent key can be answered by any layer below that is held with this one", () => {
    // The real stack: Base, Numbers, Symbols, with LT(NUM,SPC) on a thumb and
    // LT(SYM,J) on the other hand, so {Base, Numbers, Symbols} is a real hold.
    const at = (layoutIndex, keycode) => ({layoutIndex, keycode, display: keycode});
    const stack = withAnswers([
        {index: 0, name: "Base", positions: [at(0, "KC_8"), at(1, "KC_RIGHT_ALT"), at(2, "VIA_MACRO_0")]},
        {index: 1, name: "Numbers", positions: [at(0, "KC_P7"), at(1, "KC_NO"), at(2, "KC_TRANSPARENT")]},
        {index: 2, name: "Symbols", positions: [at(0, "KC_TRANSPARENT"), at(1, "KC_TRANSPARENT"), at(2, "KC_TRANSPARENT")]},
    ]);

    // Symbols alone: the default layer answers everything.
    assert.deepEqual(resolvedPositions(stack, 2, []).map((entry) => entry.position.keycode),
        ["KC_8", "KC_RIGHT_ALT", "VIA_MACRO_0"]);
    // Symbols with Numbers held: Numbers wins where it has a key, KC_NO included.
    assert.deepEqual(resolvedPositions(stack, 2, [1]).map((entry) => entry.position.keycode),
        ["KC_P7", "KC_NO", "VIA_MACRO_0"], "and its transparent position still falls to Base");

    // Both are real, so both are reachable, each named with what it needs.
    const reachable = reachablePositions(stack, 2);
    const atZero = reachable.filter((entry) => entry.position.layoutIndex === 0);
    assert.deepEqual(atZero.map((entry) => [entry.position.keycode, entry.layer.name, entry.whileHeld]),
        [["KC_P7", "Numbers", true], ["KC_8", "Base", false]],
        "Numbers answers only while held; Base always does");

    // An intermediate KC_NO is one real outcome — the key does nothing while
    // Numbers is held — but it takes nothing away, because dropping Numbers
    // leaves Base answering. It names nothing, so no group ever lists it.
    assert.deepEqual(reachable.filter((entry) => entry.position.layoutIndex === 1)
        .map((entry) => [entry.position.keycode, entry.whileHeld]),
        [["KC_NO", true], ["KC_RIGHT_ALT", false]]);
    const model = {keyBehaviors: [{keycode: "KC_RIGHT_ALT", steps: [{tapCount: 0, hold: {action: "PD_SLOT_4"}}]}],
        pdModes: [{id: 4, name: "Arrow", kind: 1, binding: {hold: "PD_SLOT_4", lock: "PD_SLOT_4_LOCK", holdCode: 0x7e54, lockCode: 0x7e5a}}]};
    assert.deepEqual(pointingReach(model, stack, 2).fromBranchesBelow.map((entry) => entry.name), ["4"],
        "so the behaviour on Base is reached, and the mode its branch sends with it");
});

test("resolution consumes published facts, including native transparency whose name is unknown", () => {
    const stack = withAnswers([
        {index: 0, positions: [{layoutIndex: 7, keycode: "KC_A", value: 4}]},
        {index: 1, positions: [{layoutIndex: 7, keycode: "0x0001", value: 1}]},
    ]);
    assert.equal(resolvedPositions(stack, 1)[0].position.keycode, "KC_A");
    assert.equal(reachablePositions(stack, 1)[0].layer, stack[0]);
    assert.deepEqual(resolvedPositions([{positions: [{layoutIndex: 7, keycode: "KC_A"}]}], 0), [],
        "an incomplete model supplies no inferred resolution facts");
});

test("combo activation enumeration uses only published lower answering layers", () => {
    const stack = withAnswers([
        {positions: [{layoutIndex: 0, keycode: "KC_A"}]},
        {positions: [{layoutIndex: 0, keycode: "KC_NO"}]},
        {positions: [{layoutIndex: 0, keycode: "KC_TRANSPARENT"}]},
        {positions: [{layoutIndex: 0, keycode: "KC_B"}]},
        {positions: [{layoutIndex: 0, keycode: "KC_TRANSPARENT"}]},
    ]);
    assert.deepEqual(comboActivations(stack, 4), [[], [1], [3], [1, 3]]);
    assert.deepEqual(comboActivations(stack, 3), [[]], "a mapped top key cannot change with lower holds");
    assert.deepEqual(activations(3), [[], [1], [2], [1, 2]], "general reach still offers every hold set");
});
