"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const {actionName, nativeCode, keycodeAction, pdSlotOfCode, layerRef, layerOfRef, knownActionAbi} = require("../../core/schema/actions");
const {PROFILE_ACTION_KINDS: ACTION} = require("../../core/schema/profile-blob-v1");

test("an action has one name and one native keycode", () => {
    assert.equal(actionName({kind: ACTION.QMK_KEYCODE, operand: 0x04}), "KC_A");
    assert.equal(actionName({kind: ACTION.LAYER_MOMENTARY, operand: 2}), "MO(2)");
    assert.equal(actionName({kind: ACTION.PD_MODE_MOMENTARY, operand: 0}), "PD_SLOT_0");
    assert.equal(actionName({kind: ACTION.PD_MODE_LOCK, operand: 7}), "PD_SLOT_7_LOCK");
    assert.equal(nativeCode({kind: ACTION.QMK_KEYCODE, operand: 0x04}), 0x04);
    assert.equal(nativeCode({kind: ACTION.PD_MODE_LOCK, operand: 0}), 0x7ea0);
    assert.equal(actionName({kind: ACTION.CUSTOM_KEY, operand: 127}), "CUSTOM_KEY_127");
    // Custom keys sit at 0x7f00 + n since firmware D-F14; layer locks cover sixteen layers.
    assert.equal(nativeCode({kind: ACTION.CUSTOM_KEY, operand: 3}), 0x7f03);
    assert.equal(nativeCode({kind: ACTION.CUSTOM_KEY, operand: 127}), 0x7f7f);
    assert.equal(nativeCode({kind: ACTION.LAYER_LOCK, operand: 7}), 0x7ec7);
    assert.equal(nativeCode({kind: ACTION.LAYER_LOCK, operand: 15}), 0x7ecf);
    assert.equal(actionName({kind: ACTION.LAYER_MOMENTARY, operand: 15}), "MO(15)");
    assert.deepEqual(keycodeAction(0x29), {kind: ACTION.QMK_KEYCODE, operand: 0x29});
    assert.equal(pdSlotOfCode(0x7e87), 7);
    assert.equal(pdSlotOfCode(0x7ea7), 7);
    assert.equal(pdSlotOfCode(0x0004), undefined);
    // The keycode blocks hold 32 slots; how many a keyboard has is its
    // current vocabulary defines 32 slots, and its decode limits enforce it.
    assert.equal(actionName({kind: ACTION.PD_MODE_LOCK, operand: 31}), "PD_SLOT_31_LOCK");
    assert.equal(nativeCode({kind: ACTION.PD_MODE_MOMENTARY, operand: 31}), 0x7e9f);
    assert.throws(() => actionName({kind: ACTION.PD_MODE_MOMENTARY, operand: 32}), /pointing slot/);
});

test("one action vocabulary is known, and a layer reference reads back", () => {
    assert.equal(layerRef(3), "Layer 3");
    assert.equal(layerOfRef("Layer 3"), 3);
    assert.equal(layerOfRef("Numbers"), undefined);
    assert.equal(knownActionAbi(0x837cf479), true, "the vocabulary with the keycode blocks and 32 pointing slots");
    for (const retired of [0xf79c6151, 0x1d3fcacc, 0x61072732, 0xeb80829c, 0xdcb00959]) assert.equal(knownActionAbi(retired), false, `0x${retired.toString(16)} is retired`);
    assert.equal(knownActionAbi(1), false);
});

test("placement follows the keyboard's rule: only layer keycodes are restricted", () => {
    const {PLACEMENT, placementProblem} = require("../../core/schema/actions");
    const order = [PLACEMENT.KEY, PLACEMENT.TAP, PLACEMENT.HOLD_PRESS, PLACEMENT.HOLD_OTHER, PLACEMENT.COMBO_OUTPUT];
    const places = (action) => order.map(placement => placementProblem(action, placement, {layerCount: 8}) ? "-" : "ok").join(" ");
    const code = operand => ({kind: 1, operand});
    assert.equal(places(code(0x0004)), "ok ok ok ok ok", "KC_A goes anywhere");
    assert.equal(places({kind: 3, operand: 2}), "ok ok ok ok ok", "LOCK_LAYER goes anywhere");
    assert.equal(places(code(0x5262)), "ok ok ok ok ok", "TG goes anywhere");
    assert.equal(places(code(0x5200)), "ok ok ok ok ok", "TO goes anywhere");
    assert.equal(places({kind: 2, operand: 2}), "ok - ok - ok", "MO needs a held key or a combo");
    assert.equal(places(code(0x52c2)), "ok - ok - ok", "TT needs a held key or a combo");
    assert.equal(places(code(0x5282)), "ok ok - - ok", "OSL is a key, a tap or a combo");
    assert.equal(places(code(0x4104)), "ok - - - -", "LT is a key of its own");
    assert.equal(places(code(0x5062)), "ok - - - ok", "LM(3, Shift) is a key or a combo");
    for (const unowned of [0x5241, 0x52e1, 0x5102, 0x5268]) assert.equal(places(code(unowned)), "- - - - -", `0x${unowned.toString(16)} goes nowhere`);
    assert.equal(places({kind: ACTION.CUSTOM_KEY, operand: 2}), "ok - - - ok", "a custom key is a key or a combo output, never a step");
    assert.equal(places(code(0x7f02)), "ok - - - ok", "however it is stored");
    assert.equal(places(code(0x7f7f)), "ok - - - ok", "custom key 127 too");
});

test("placement covers all sixteen layers and refuses a layer past the bank", () => {
    const {PLACEMENT, placementProblem} = require("../../core/schema/actions");
    const order = [PLACEMENT.KEY, PLACEMENT.TAP, PLACEMENT.HOLD_PRESS, PLACEMENT.HOLD_OTHER, PLACEMENT.COMBO_OUTPUT];
    const places = (action, options) => order.map(placement => placementProblem(action, placement, options) ? "-" : "ok").join(" ");
    const code = operand => ({kind: 1, operand});
    // Sixteen layers is the default bank.
    assert.equal(places({kind: 2, operand: 15}), "ok - ok - ok", "MO(15)");
    assert.equal(places(code(0x526f)), "ok ok ok ok ok", "TG(15)");
    assert.equal(places(code(0x528f)), "ok ok - - ok", "OSL(15)");
    assert.equal(places(code(0x4f04)), "ok - - - -", "LT(15, KC_A)");
    assert.equal(places(code(0x51e2)), "ok - - - ok", "LM(15, Shift)");
    for (const past of [0x5270, 0x5290, 0x52d0, 0x5210, 0x5230]) assert.equal(places(code(past)), "- - - - -", `0x${past.toString(16)} names layer 16`);
    // A smaller bank still bounds them.
    assert.equal(places(code(0x5268), {layerCount: 8}), "- - - - -", "TG(8) on eight layers");
    assert.equal(places(code(0x4804), {layerCount: 8}), "- - - - -", "LT(8) on eight layers");
    assert.equal(places(code(0x5268), {layerCount: 16}), "ok ok ok ok ok", "TG(8) on sixteen layers");
});

test("the keyboard has the 32 pointing slots of the keycode blocks", () => {
    const {ACTION_ABI, KNOWN_ACTION_ABIS, PD_SLOT_COUNT} = require("../../core/schema/actions");
    assert.deepEqual(KNOWN_ACTION_ABIS, [ACTION_ABI]);
    assert.equal(ACTION_ABI, 0x837cf479);
    assert.equal(PD_SLOT_COUNT, 32);
    assert.equal(pdSlotOfCode(0x7e94), 20);
    assert.equal(pdSlotOfCode(0x7ebf), 31);
    assert.equal(pdSlotOfCode(0x7ec0), undefined, "the layer-lock block");
});
