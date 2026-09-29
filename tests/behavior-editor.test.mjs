import assert from "node:assert/strict";
import test from "node:test";
import {behaviourEditorRow, behaviourTimingEdit, behaviourTimingField, canHaveBehaviour} from "../webview/view/behavior-editor.mjs";

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
