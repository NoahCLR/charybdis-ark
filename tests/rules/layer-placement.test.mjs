import test from "node:test";
import assert from "node:assert/strict";
import {PLACEMENT, layerRuleOf} from "../../rules/layer-placement.mjs";
import {LAYER_FORMS, layerMod, layerTap} from "../../rules/qmk-keycodes.mjs";

const {KEY, TAP, HOLD_PRESS, COMBO_OUTPUT} = PLACEMENT;

test("a layer hold goes on a key, a press-and-hold branch or a combo; a one-shot layer on a key, a tap or a combo", () => {
    assert.deepEqual(layerRuleOf(LAYER_FORMS.MO | 3, 16), {kind: "hold", places: [KEY, HOLD_PRESS, COMBO_OUTPUT]});
    assert.deepEqual(layerRuleOf(LAYER_FORMS.TT | 3, 16), {kind: "hold", places: [KEY, HOLD_PRESS, COMBO_OUTPUT]});
    assert.deepEqual(layerRuleOf(LAYER_FORMS.OSL | 3, 16), {kind: "oneShot", places: [KEY, TAP, COMBO_OUTPUT]});
});

test("LT() goes only on a key, LM() on a key or a combo, while their layer is one the keyboard has", () => {
    assert.deepEqual(layerRuleOf(layerTap(2, 4), 16), {kind: "layerTap", places: [KEY]});
    assert.deepEqual(layerRuleOf(layerMod(2, 1), 16), {kind: "layerMod", places: [KEY, COMBO_OUTPUT]});
    assert.deepEqual(layerRuleOf(layerTap(9, 4), 8), {kind: "unowned", places: []});
    assert.deepEqual(layerRuleOf(layerMod(9, 1), 8), {kind: "unowned", places: []});
});

test("DF() and PDF() go nowhere, and nor does a layer key past the keyboard's layers", () => {
    for (const code of [LAYER_FORMS.DF, LAYER_FORMS.DF | 1, LAYER_FORMS.PDF | 2]) assert.deepEqual(layerRuleOf(code, 16), {kind: "unowned", places: []});
    for (const form of ["TO", "MO", "TG", "OSL", "TT"]) {
        assert.deepEqual(layerRuleOf(LAYER_FORMS[/** @type {keyof typeof LAYER_FORMS} */ (form)] | 8, 8), {kind: "unowned", places: []}, form);
        assert.notEqual(layerRuleOf(LAYER_FORMS[/** @type {keyof typeof LAYER_FORMS} */ (form)] | 7, 8)?.kind, "unowned", form);
    }
});

test("TO() and TG() go anywhere, and a keycode that is no layer key has no rule", () => {
    assert.equal(layerRuleOf(LAYER_FORMS.TO | 1, 16), undefined);
    assert.equal(layerRuleOf(LAYER_FORMS.TG | 1, 16), undefined);
    for (const code of [0x0004, 0x0104, 0x2104, 0x52a2, 0x7700]) assert.equal(layerRuleOf(code, 16), undefined, code.toString(16));
});

test("a lock of a layer the keyboard has goes anywhere, and of one it lacks nowhere", () => {
    const locks = {first: 0x7ec0, count: 16};
    assert.equal(layerRuleOf(0x7ec0 + 5, 8, locks), undefined);
    assert.deepEqual(layerRuleOf(0x7ec0 + 10, 8, locks), {kind: "missing", places: []});
    assert.equal(layerRuleOf(0x7ec0 + 10, 8), undefined, "without the block, no lock is known");
});
