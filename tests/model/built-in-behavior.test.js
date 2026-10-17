"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const {builtInActions} = require("../../core/model/built-in-behavior");
const {PROFILE_ACTION_KINDS: ACTION} = require("../../core/schema/profile-blob-v1");

const key = (operand) => ({kind: ACTION.QMK_KEYCODE, operand});

test("dual-role keys fill an empty tap and first hold with their own meaning", () => {
    // LT(3, KC_SLSH): tap the key, hold the layer.
    assert.deepEqual(builtInActions(key(0x4338)), {tap: key(0x38), hold: {kind: ACTION.LAYER_MOMENTARY, operand: 3}});
    // MT(MOD_LSFT | MOD_LGUI, KC_S): tap the key, hold its modifiers.
    assert.deepEqual(builtInActions(key(0x2a16)), {tap: key(0x16), hold: key(0x0a00)});
    // Right-hand modifiers keep QMK's right-hand bit.
    assert.deepEqual(builtInActions(key(0x3416)).hold, key(0x1400));
    // OSM(MOD_LALT): tap arms the one-shot, hold holds Alt.
    assert.deepEqual(builtInActions(key(0x52a4)), {tap: key(0x52a4), hold: key(0x0400)});
});

test("a plain key taps itself and holds itself down as a fallback", () => {
    for (const code of [0x04, 0x2d, 0xa8, 0xff, 0x021e, 0x0106, 0x1fff]) {
        assert.deepEqual(builtInActions(key(code)), {tap: key(code), hold: key(code), fallback: true, releaseTaps: true}, `0x${code.toString(16)}`);
    }
});

test("custom keys and macros keep their tap when released before a long hold, and claim nothing else", () => {
    for (const target of [{kind: ACTION.CUSTOM_KEY, operand: 0}, {kind: ACTION.VIA_MACRO, operand: 3}, key(0x7f00), key(0x7f7f), key(0x7700), key(0x777f)]) {
        assert.deepEqual(builtInActions(target), {releaseTaps: true});
    }
    assert.equal(builtInActions(key(0x4338)).releaseTaps, undefined, "a dual-role key always has its own hold");
});

test("a custom key with a shortcut taps it and holds it as a fallback, like a plain key", () => {
    const customKeyShortcuts = Array.from({length: 128}, () => ({mods: 0, key: 0}));
    customKeyShortcuts[2] = {mods: 0x41, key: 0x0e};
    customKeyShortcuts[127] = {mods: 0x0f, key: 0};
    const own = operand => ({kind: ACTION.CUSTOM_KEY, operand});
    for (const [target, slot] of [[own(2), 2], [key(0x7f02), 2], [own(127), 127], [key(0x7f7f), 127]]) {
        assert.deepEqual(builtInActions(target, {customKeyShortcuts}), {tap: own(slot), hold: own(slot), fallback: true, releaseTaps: true});
    }
    assert.deepEqual(builtInActions(own(3), {customKeyShortcuts}), {releaseTaps: true}, "one without a shortcut claims nothing");
});

test("bare modifiers, other key families and non-keycode targets inherit nothing", () => {
    const others = [key(0x00), key(0x01), key(0x03), key(0xe0), key(0xe3), key(0xe7), key(0x5223), key(0x5310), key(0x7e00), key(0x7e80), key(0x7ec0),
        {kind: ACTION.LAYER_MOMENTARY, operand: 3}, {kind: ACTION.PD_MODE_MOMENTARY, operand: 0}, undefined];
    for (const target of others) assert.deepEqual(builtInActions(target), {});
});
