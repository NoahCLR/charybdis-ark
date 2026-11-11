"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const keycodes = require("../../core/data/user-keycodes");

test("each userspace family has its fixed block, as the firmware allocates them", () => {
    assert.deepEqual([keycodes.CUSTOM_KEY_BASE, keycodes.PD_HOLD_BASE, keycodes.PD_LOCK_BASE, keycodes.LAYER_LOCK_BASE], [0x7f00, 0x7e80, 0x7ea0, 0x7ec0]);
    assert.deepEqual([keycodes.CUSTOM_KEY_SLOTS, keycodes.LAYER_LOCK_SLOTS], [128, 16]);
    assert.equal(keycodes.customKeyCode(0), 0x7f00);
    assert.equal(keycodes.customKeyCode(127), 0x7f7f);
    assert.equal(keycodes.customKeyOfCode(0x7f00), 0);
    assert.equal(keycodes.customKeyOfCode(0x7f7f), 127);
    assert.equal(keycodes.customKeyOfCode(0x7f80), undefined, "only 128 custom keys");
    assert.equal(keycodes.customKeyOfCode(0x7eff), undefined);
    assert.equal(keycodes.customKeyOfCode(0x7e80), undefined, "a pointing hold is not a custom key");
    assert.equal(keycodes.customKeyOfCode(1.5), undefined);
    assert.equal(keycodes.customKeyOfName("CUSTOM_KEY_12"), 12);
    assert.equal(keycodes.customKeyOfName("CUSTOM_KEY_127"), 127);
    assert.equal(keycodes.customKeyOfName("CUSTOM_KEY_128"), undefined);
    assert.equal(keycodes.customKeyOfName("CUSTOM_KEY_x"), undefined);
    assert.equal(keycodes.customKeyOfName(undefined), undefined);
    assert.equal(keycodes.layerLockCode(15), 0x7ecf);
    assert.equal(keycodes.layerLockOfCode(0x7ec0), 0);
    assert.equal(keycodes.layerLockOfCode(0x7ecf), 15);
    assert.equal(keycodes.layerLockOfCode(0x7ed0), undefined, "only sixteen layers have a lock");
    // The switch keys for behaviours (firmware D-F66): three of a 16-code block.
    assert.deepEqual([keycodes.BEHAVIOR_SWITCH_BASE, keycodes.BEHAVIOR_SWITCH_SLOTS], [0x7ee0, 16]);
    assert.deepEqual(keycodes.BEHAVIOR_SWITCH_KEYS.map(keycodes.behaviorSwitchKeyCode), [0x7ee0, 0x7ee1, 0x7ee2]);
    assert.deepEqual([0x7ee0, 0x7ee1, 0x7ee2].map(keycodes.behaviorSwitchKeyName), ["BH_ON", "BH_OFF", "BH_TOGG"]);
    for (const code of [0x7edf, 0x7ee3, 0x7eef, 0x7ef0, 0x7f00, 0x7f7f, 0xffff, 1.5]) assert.equal(keycodes.behaviorSwitchKeyName(code), undefined, `0x${code.toString(16)}`);
    for (const name of ["BH_TOGGLE", "bh_on", undefined]) assert.equal(keycodes.behaviorSwitchKeyCode(name), undefined, String(name));
    assert.ok(Object.isFrozen(keycodes.BEHAVIOR_SWITCH_KEYS));
    // And for auto-mouse (firmware D-F66): three of the next 16-code block.
    assert.deepEqual([keycodes.AUTO_MOUSE_SWITCH_BASE, keycodes.AUTO_MOUSE_SWITCH_SLOTS], [0x7ef0, 16]);
    assert.deepEqual(keycodes.AUTO_MOUSE_SWITCH_KEYS.map(keycodes.autoMouseSwitchKeyCode), [0x7ef0, 0x7ef1, 0x7ef2]);
    assert.deepEqual([0x7ef0, 0x7ef1, 0x7ef2].map(keycodes.autoMouseSwitchKeyName), ["AM_ON", "AM_OFF", "AM_TOGG"]);
    for (const code of [0x7eef, 0x7ee0, 0x7ef3, 0x7eff, 0x7f00, 0xffff, 1.5]) assert.equal(keycodes.autoMouseSwitchKeyName(code), undefined, `0x${code.toString(16)}`);
    for (const name of ["AM_TOGGLE", "am_on", "BH_ON", undefined]) assert.equal(keycodes.autoMouseSwitchKeyCode(name), undefined, String(name));
    assert.equal(keycodes.behaviorSwitchKeyCode("AM_ON"), undefined, "each family names only its own keys");
    assert.ok(Object.isFrozen(keycodes.AUTO_MOUSE_SWITCH_KEYS));
});

test("custom keys moved off the retired 0x7e40 block, which no longer names one", () => {
    assert.deepEqual([keycodes.RETIRED_CUSTOM_KEY_BASE, keycodes.RETIRED_CUSTOM_KEY_SLOTS], [0x7e40, 64]);
    for (const code of [0x7e40, 0x7e7f]) assert.equal(keycodes.customKeyOfCode(code), undefined);
    // The retired block, pointing holds, pointing locks, layer locks, the switch keys and custom keys never overlap.
    const blocks = [[keycodes.RETIRED_CUSTOM_KEY_BASE, keycodes.RETIRED_CUSTOM_KEY_SLOTS], [keycodes.PD_HOLD_BASE, 32], [keycodes.PD_LOCK_BASE, 32],
        [keycodes.LAYER_LOCK_BASE, 32], [keycodes.BEHAVIOR_SWITCH_BASE, keycodes.BEHAVIOR_SWITCH_SLOTS], [keycodes.AUTO_MOUSE_SWITCH_BASE, keycodes.AUTO_MOUSE_SWITCH_SLOTS], [keycodes.CUSTOM_KEY_BASE, keycodes.CUSTOM_KEY_SLOTS]];
    for (let i = 1; i < blocks.length; i++) assert.ok(blocks[i - 1][0] + blocks[i - 1][1] <= blocks[i][0], `block ${i} starts after block ${i - 1}`);
});
