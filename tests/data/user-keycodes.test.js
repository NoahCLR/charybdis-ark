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
});

test("custom keys moved off the retired 0x7e40 block, which no longer names one", () => {
    assert.deepEqual([keycodes.RETIRED_CUSTOM_KEY_BASE, keycodes.RETIRED_CUSTOM_KEY_SLOTS], [0x7e40, 64]);
    for (const code of [0x7e40, 0x7e7f]) assert.equal(keycodes.customKeyOfCode(code), undefined);
    // The retired block, pointing holds, pointing locks, layer locks and custom keys never overlap.
    const blocks = [[keycodes.RETIRED_CUSTOM_KEY_BASE, keycodes.RETIRED_CUSTOM_KEY_SLOTS], [keycodes.PD_HOLD_BASE, 32], [keycodes.PD_LOCK_BASE, 32],
        [keycodes.LAYER_LOCK_BASE, 32], [keycodes.CUSTOM_KEY_BASE, keycodes.CUSTOM_KEY_SLOTS]];
    for (let i = 1; i < blocks.length; i++) assert.ok(blocks[i - 1][0] + blocks[i - 1][1] <= blocks[i][0], `block ${i} starts after block ${i - 1}`);
});
