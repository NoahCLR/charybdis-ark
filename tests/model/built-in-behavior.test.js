"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const {builtInActions} = require("../../core/model/built-in-behavior");
const {PROFILE_ACTION_KINDS: ACTION} = require("../../core/schema/profile-blob-v1");

const key = (operand) => ({kind: ACTION.QMK_KEYCODE, operand});
const both = {physicalGestureTiming: true, ownedTapping: true};

test("dual-role keys fill an empty tap and first hold with their own meaning", () => {
    // LT(3, KC_SLSH): tap the key, hold the layer.
    assert.deepEqual(builtInActions(key(0x4338), both), {tap: key(0x38), hold: {kind: ACTION.LAYER_MOMENTARY, operand: 3}});
    // MT(MOD_LSFT | MOD_LGUI, KC_S): tap the key, hold its modifiers.
    assert.deepEqual(builtInActions(key(0x2a16), both), {tap: key(0x16), hold: key(0x0a00)});
    // Right-hand modifiers keep QMK's right-hand bit.
    assert.deepEqual(builtInActions(key(0x3416), both).hold, key(0x1400));
    // OSM(MOD_LALT): tap arms the one-shot, hold holds Alt.
    assert.deepEqual(builtInActions(key(0x52a4), both), {tap: key(0x52a4), hold: key(0x0400)});
});

test("a plain key taps itself and holds itself down as a fallback, on every firmware", () => {
    for (const code of [0x04, 0x2d, 0xa8, 0xff, 0x021e, 0x0106, 0x1fff]) {
        assert.deepEqual(builtInActions(key(code)), {tap: key(code), hold: key(code), fallback: true}, `0x${code.toString(16)}`);
        assert.deepEqual(builtInActions(key(code), both), builtInActions(key(code)), "no feature changes a plain key");
    }
});

test("a dual-role built-in action is claimed only by firmware that advertises it", () => {
    assert.deepEqual(builtInActions(key(0x4338), {ownedTapping: true}), {}, "LT needs physical gesture timing (bit 17)");
    assert.deepEqual(builtInActions(key(0x2a16), {physicalGestureTiming: true}), {}, "MT needs runtime-owned tapping (bit 18)");
    assert.deepEqual(builtInActions(key(0x52a4), {physicalGestureTiming: true}), {}, "OSM needs runtime-owned tapping (bit 18)");
    assert.deepEqual(builtInActions(key(0x2a16)), {});
});

test("bare modifiers, other key families and non-keycode targets inherit nothing", () => {
    const others = [key(0x00), key(0x01), key(0x03), key(0xe0), key(0xe3), key(0xe7), key(0x5223), key(0x5310), key(0x7e00),
        {kind: ACTION.LAYER_MOMENTARY, operand: 3}, {kind: ACTION.PD_MODE_MOMENTARY, operand: 0}, undefined];
    for (const target of others) assert.deepEqual(builtInActions(target, both), {});
});
