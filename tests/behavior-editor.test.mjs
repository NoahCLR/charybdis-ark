import assert from "node:assert/strict";
import test from "node:test";
import {behaviourEditorRow, behaviourKeyAt, behaviourRowAfterPreview, behaviourTimingEdit, behaviourTimingField, canHaveBehaviour} from "../webview/view/behavior-editor.mjs";

test("opening an unstored behaviour leaves the model unchanged and takes built-ins from the host", () => {
    const builtIn = {tap: {helper: "TAP_SENDS", action: "KC_F"}};
    const timing = {tapHoldTerm: "210", multiTapTerm: "150", longerHoldTerm: "400"};
    const model = {keyBehaviors: [], behaviorEditing: {keyDefaults: {"LT(3,KC_F)": {builtIn, timing}}}};
    const before = structuredClone(model);
    const row = behaviourEditorRow(model, "LT(3, KC_F)");
    assert.equal(row.keycode, "LT(3,KC_F)");
    assert.equal(row.stored, false);
    assert.deepEqual(row.steps, []);
    assert.deepEqual(row.builtIn, builtIn);
    assert.deepEqual(row.timingDefaults, timing);
    assert.deepEqual(model, before);
});

test("an existing row is selected through its semantic alias without changing it", () => {
    const existing = {keycode: "CUSTOM_KEY_0", steps: [{tapCount: 0, tap: {helper: "TAP_SENDS", action: "KC_A"}}]};
    const model = {keyBehaviors: [existing], qmkKeycodeAliases: {QK_USER_0: "CUSTOM_KEY_0"}};
    const row = behaviourEditorRow(model, "QK_USER_0");
    assert.equal(row.stored, true);
    assert.equal(row.keycode, "CUSTOM_KEY_0");
    assert.deepEqual(row.steps, existing.steps);
    assert.equal(existing.stored, undefined);
});

test("transparent and disabled key aliases never open a behaviour editor", () => {
    for (const key of [undefined, "", "KC_NO", "XXXXXXX", "KC_TRNS", "KC_TRANSPARENT", "_______", "0x0000", "0x1"]) {
        assert.equal(canHaveBehaviour({}, key), false, key);
        assert.equal(behaviourEditorRow({}, key), undefined, key);
    }
    for (const key of ["KC_A", "LT(3,KC_F)", "CUSTOM_KEY_0", "PD_SLOT_0"]) assert.equal(canHaveBehaviour({}, key), true, key);
});

test("a transparent key in a layer preview opens the key answered from below", () => {
    const at = (layoutIndex, keycode, semantic) => ({layoutIndex, keycode, semantic, display: keycode});
    const stack = [
        {index: 0, name: "Base", positions: [at(0, "KC_A"), at(1, "KC_B"), at(2, "KC_C"), at(3, "QK_USER_0", "CUSTOM_KEY_0")]},
        {index: 3, name: "Navigation", positions: [at(0, "KC_DELETE"), at(1, "KC_NO"), at(2, "KC_TRANSPARENT"), at(3, "KC_TRANSPARENT")]},
        {index: 4, name: "Pointing", positions: [at(0, "KC_TRANSPARENT"), at(1, "KC_TRANSPARENT"), at(2, "KC_TRANSPARENT"), at(3, "KC_TRANSPARENT")]},
    ];
    const key = (held, index) => {
        const found = behaviourKeyAt(stack, 2, held, index);
        return [found.keycode, found.from?.name ?? null];
    };

    assert.deepEqual(key([1], 0), ["KC_DELETE", "Navigation"], "the layer held under it answers");
    assert.deepEqual(key([1], 2), ["KC_C", "Base"], "through two transparent keys to the default layer");
    assert.deepEqual(key([1], 3), ["CUSTOM_KEY_0", "Base"], "rows are found by what a key means, not its stored name");
    assert.equal(behaviourEditorRow({}, key([1], 1)[0]), undefined, "a key answered by KC_NO still has no editor");
    assert.deepEqual(key([], 0), ["KC_TRANSPARENT", null], "outside a preview the board shows the transparent key itself");
    assert.equal(behaviourEditorRow({}, key([], 0)[0]), undefined);
    assert.deepEqual(behaviourKeyAt(stack, 1, [], 0), {keycode: "KC_DELETE", from: null}, "a mapped key opens its own row");
    assert.deepEqual(behaviourKeyAt(stack, 1, [], 9), {keycode: "", from: null}, "no position, no key");

    const hollow = [{index: 0, name: "Base", positions: [at(0, "KC_TRANSPARENT")]}, {index: 1, name: "Top", positions: [at(0, "KC_TRANSPARENT")]}];
    assert.deepEqual(behaviourKeyAt(hollow, 1, [0], 0), {keycode: "KC_TRANSPARENT", from: null}, "nothing mapped below");
});

test("timing fields show effective defaults but keep their stored inheritance zeros", () => {
    const row = {multiTapTerm: "0", timingDefaults: {multiTapTerm: "150"}};
    const field = behaviourTimingField(row, "multiTapTerm");
    assert.deepEqual(field, {stored: "0", followsDefault: true, fallback: "150", value: "", placeholder: "150 · default"});
    assert.equal(behaviourTimingEdit("150", field), "0");
    assert.equal(behaviourTimingEdit(" 777 ", field), "777");
    assert.equal(behaviourTimingEdit("", field), "0");
    const custom = behaviourTimingField({...row, multiTapTerm: "177"}, "multiTapTerm");
    assert.equal(custom.value, "177");
    assert.equal(custom.followsDefault, false);
    assert.equal(behaviourTimingEdit("", custom), "0");
    assert.equal(behaviourTimingField({timingDefaults: {multiTapTerm: "0"}}, "multiTapTerm").placeholder, "0 · default");
    assert.equal(behaviourTimingField({}, "multiTapTerm").value, "", "unknown defaults are not invented");
});

test("an explicit timing matching the default is muted without rewriting its stored override", () => {
    const field = behaviourTimingField({multiTapTerm: "150", timingDefaults: {multiTapTerm: "150"}}, "multiTapTerm");
    assert.equal(field.value, "");
    assert.equal(field.placeholder, "150 · default");
    assert.equal(field.followsDefault, false);
    assert.equal(behaviourTimingEdit("", field), "150");
    assert.equal(behaviourTimingEdit("177", field), "177");
    assert.equal(behaviourTimingEdit("0", field), "0");
});

test("a row opened from the selected key follows it when the preview changes; a picked row stays", () => {
    assert.equal(behaviourRowAfterPreview("KC_TRANSPARENT", "KC_TRANSPARENT", "KC_DELETE"), "KC_DELETE", "a layer turned on under it answers");
    assert.equal(behaviourRowAfterPreview("KC_DELETE", "KC_DELETE", "KC_TRANSPARENT"), "KC_TRANSPARENT", "turned off again, back to the key itself");
    assert.equal(behaviourRowAfterPreview("KC_ENTER", "KC_TRANSPARENT", "KC_DELETE"), "KC_ENTER", "a row picked from the list is kept");
    assert.equal(behaviourRowAfterPreview(null, "KC_TRANSPARENT", "KC_DELETE"), null, "nothing opened yet");
});
