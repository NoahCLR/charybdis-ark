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
    for (const target of [{kind: ACTION.CUSTOM_KEY, operand: 0}, {kind: ACTION.MACRO, operand: 3}, key(0x7f00), key(0x7f7f), key(0x7700), key(0x777f)]) {
        assert.deepEqual(builtInActions(target), {releaseTaps: true});
    }
    assert.equal(builtInActions(key(0x4338)).releaseTaps, undefined, "a dual-role key always has its own hold");
});

test("a custom key with a shortcut taps it and holds it as a fallback, like a plain key", () => {
    const customKeyShortcuts = Array.from({length: 128}, () => ({mods: 0, keys: [], layers: 0, layerKind: 0}));
    customKeyShortcuts[2] = {mods: 0x41, keys: [0x0e], layers: 0, layerKind: 0};
    customKeyShortcuts[127] = {mods: 0x0f, keys: [], layers: 0, layerKind: 0};
    const own = operand => ({kind: ACTION.CUSTOM_KEY, operand});
    for (const [target, slot] of [[own(2), 2], [key(0x7f02), 2], [own(127), 127], [key(0x7f7f), 127]]) {
        assert.deepEqual(builtInActions(target, {customKeyShortcuts}), {tap: own(slot), hold: own(slot), fallback: true, releaseTaps: true});
    }
    assert.deepEqual(builtInActions(own(3), {customKeyShortcuts}), {releaseTaps: true}, "one without a shortcut claims nothing");
    customKeyShortcuts[3] = {mods: 0, keys: [], layers: 1 << 3, layerKind: 0};
    assert.deepEqual(builtInActions(own(3), {customKeyShortcuts}), {tap: own(3), hold: own(3), fallback: true, releaseTaps: true}, "layers alone are a shortcut (firmware D-F26)");
    // Lock and Move to are plain keys too: their shortcut acts at the press,
    // held or tapped.
    for (const layerKind of [1, 2]) {
        customKeyShortcuts[3] = {mods: 0, keys: [], layers: 1 << 3, layerKind};
        assert.deepEqual(builtInActions(own(3), {customKeyShortcuts}), {tap: own(3), hold: own(3), fallback: true, releaseTaps: true});
    }
    // Tap-toggle and One-shot make it a momentary layer key, as TT() and
    // OSL() are: held from every press, an authored hold or long hold
    // notwithstanding (no fallback). One-shot's own tap arms its layers;
    // Tap-toggle's does nothing until its fifth, which a row with steps
    // replaces, so it has no tap of its own.
    customKeyShortcuts[3] = {mods: 0x02, keys: [], layers: 1 << 3, layerKind: 4};
    assert.deepEqual(builtInActions(own(3), {customKeyShortcuts}), {tap: own(3), hold: own(3), fromPress: true});
    customKeyShortcuts[3] = {mods: 0, keys: [], layers: 1 << 3, layerKind: 3};
    assert.deepEqual(builtInActions(own(3), {customKeyShortcuts}), {hold: own(3), fromPress: true});
});

test("bare modifiers, other key families and non-keycode targets inherit nothing", () => {
    const others = [key(0x00), key(0x01), key(0x03), key(0xe0), key(0xe3), key(0xe7), key(0x5310), key(0x7e00), key(0x7ea0), key(0x7ec0), undefined];
    for (const target of others) assert.deepEqual(builtInActions(target), {});
});

test("layer holds and pointing-mode keys hold from the press, with no tap of their own", () => {
    // MO(3): the layer is on as soon as the key goes down.
    assert.deepEqual(builtInActions(key(0x5223)), {hold: {kind: ACTION.LAYER_MOMENTARY, operand: 3}, fromPress: true});
    assert.deepEqual(builtInActions({kind: ACTION.LAYER_MOMENTARY, operand: 3}), {hold: {kind: ACTION.LAYER_MOMENTARY, operand: 3}, fromPress: true});
    // MO(15): the layer field's top layer, read as the layer forms read it.
    assert.deepEqual(builtInActions(key(0x522f)), {hold: {kind: ACTION.LAYER_MOMENTARY, operand: 15}, fromPress: true});
    // LM(2, MOD_LSFT): its layer and its modifiers, from the press.
    assert.deepEqual(builtInActions(key(0x5042)), {hold: key(0x5042), fromPress: true});
    // PD_MODE_0 and PD_MODE_31 run their mode while held.
    assert.deepEqual(builtInActions(key(0x7e80)), {hold: key(0x7e80), fromPress: true});
    assert.deepEqual(builtInActions(key(0x7e9f)), {hold: key(0x7e9f), fromPress: true});
    assert.deepEqual(builtInActions({kind: ACTION.POINTING_MODE_MOMENTARY, operand: 0}), {hold: {kind: ACTION.POINTING_MODE_MOMENTARY, operand: 0}, fromPress: true});
});

test("a pointing-mode key holds its mode from the press, unless its row holds another mode on a later tap count", () => {
    const mode = (slot, lock = false) => ({kind: lock ? ACTION.POINTING_MODE_LOCK : ACTION.POINTING_MODE_MOMENTARY, operand: slot});
    const hold = (action) => ({style: 0, repeatHz: 0, action});
    const own = mode(0);
    assert.equal(builtInActions(own, {}, []).fromPress, true);
    assert.equal(builtInActions(own, {}, [{tapIndex: 1, hold: hold(mode(0, true))}]).fromPress, true, "its own mode does not defer it");
    assert.equal(builtInActions(own, {}, [{tapIndex: 0, hold: hold(mode(3))}]).fromPress, true, "only a later tap count does");
    assert.deepEqual(builtInActions(own, {}, [{tapIndex: 1, longHold: hold(mode(3))}]), {hold: own}, "another mode waits for Tap / hold");
    assert.equal(builtInActions(key(0x7e80), {}, [{tapIndex: 2, hold: hold(mode(5))}]).fromPress, undefined, "PD_MODE_0 stored by its keycode too");
    assert.equal(builtInActions(key(0x7e80), {}, [{tapIndex: 2, hold: hold(key(0x7e80))}]).fromPress, true, "and its own keycode is its own mode");
    assert.equal(builtInActions({kind: ACTION.LAYER_MOMENTARY, operand: 2}, {}, [{tapIndex: 1, hold: hold(mode(3))}]).fromPress, true, "a layer hold is no mode");
});
