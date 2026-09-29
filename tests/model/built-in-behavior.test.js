"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const {builtInFirstStep} = require("../../core/model/built-in-behavior");
const {PROFILE_ACTION_KINDS: ACTION} = require("../../core/schema/profile-blob-v1");

const key = (operand) => ({kind: ACTION.QMK_KEYCODE, operand});
const both = {physicalGestureTiming: true, ownedTapping: true};

test("dual-role keys fill an empty first tap and hold with their own meaning", () => {
    // LT(3, KC_SLSH): tap the key, hold the layer.
    assert.deepEqual(builtInFirstStep(key(0x4338), both), {tap: key(0x38), hold: {kind: ACTION.LAYER_MOMENTARY, operand: 3}});
    // MT(MOD_LSFT | MOD_LGUI, KC_S): tap the key, hold its modifiers.
    assert.deepEqual(builtInFirstStep(key(0x2a16), both), {tap: key(0x16), hold: key(0x0a00)});
    // Right-hand modifiers keep QMK's right-hand bit.
    assert.deepEqual(builtInFirstStep(key(0x3416), both).hold, key(0x1400));
    // OSM(MOD_LALT): tap arms the one-shot, hold holds Alt.
    assert.deepEqual(builtInFirstStep(key(0x52a4), both), {tap: key(0x52a4), hold: key(0x0400)});
});

test("a built-in action is claimed only by firmware that advertises it", () => {
    assert.deepEqual(builtInFirstStep(key(0x4338), {ownedTapping: true}), {}, "LT needs physical gesture timing (bit 17)");
    assert.deepEqual(builtInFirstStep(key(0x2a16), {physicalGestureTiming: true}), {}, "MT needs runtime-owned tapping (bit 18)");
    assert.deepEqual(builtInFirstStep(key(0x52a4), {physicalGestureTiming: true}), {}, "OSM needs runtime-owned tapping (bit 18)");
    assert.deepEqual(builtInFirstStep(key(0x2a16)), {});
});

test("keys without a dual role and non-keycode targets inherit nothing", () => {
    for (const target of [key(0xe3), key(0x04), key(0x5223), {kind: ACTION.LAYER_MOMENTARY, operand: 3}, {kind: ACTION.PD_MODE_MOMENTARY, operand: 0}, undefined]) {
        assert.deepEqual(builtInFirstStep(target, both), {});
    }
});
