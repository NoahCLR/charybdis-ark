"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const {PD_MODE_KEYS, FORMER_NAMES, pdModeKeyOfCode, pdModeKeyOfName} = require("../../core/data/pd-mode-keys");
const {resolveNativeQmkExpression} = require("../../core/schema/compiled-profile-v1");

test("every pointing slot has a hold and a lock key, found by name and by keycode", () => {
    assert.equal(PD_MODE_KEYS.length, 32);
    assert.equal(FORMER_NAMES.length, 6, "the six factory presets had names");
    assert.deepEqual(PD_MODE_KEYS.map((keys) => keys.hold), Array.from({length: 32}, (_, slot) => `PD_MODE_${slot}`));
    for (const keys of PD_MODE_KEYS) {
        assert.deepEqual(pdModeKeyOfCode(keys.holdCode), {slot: keys.slot, locked: false});
        assert.deepEqual(pdModeKeyOfCode(keys.lockCode), {slot: keys.slot, locked: true});
        assert.deepEqual(pdModeKeyOfName(keys.lock), {slot: keys.slot, locked: true});
        assert.equal(resolveNativeQmkExpression(keys.hold, {}), keys.holdCode, "the resolver agrees with the registry");
        assert.equal(resolveNativeQmkExpression(keys.lock, {}), keys.lockCode);
    }
    for (let slot = 0; slot < FORMER_NAMES.length; slot++) {
        assert.deepEqual(pdModeKeyOfName(FORMER_NAMES[slot]), {slot, locked: false});
        assert.deepEqual(pdModeKeyOfName(`${FORMER_NAMES[slot]}_LOCK`), {slot, locked: true});
        assert.equal(resolveNativeQmkExpression(FORMER_NAMES[slot], {}), PD_MODE_KEYS[slot].holdCode);
        assert.equal(resolveNativeQmkExpression(`${FORMER_NAMES[slot]}_LOCK`, {}), PD_MODE_KEYS[slot].lockCode);
    }
    assert.equal(pdModeKeyOfCode(0x0004), undefined);
    assert.deepEqual([PD_MODE_KEYS[0].holdCode, PD_MODE_KEYS[0].lockCode, PD_MODE_KEYS[6].holdCode, PD_MODE_KEYS[7].lockCode], [0x7e80, 0x7ea0, 0x7e86, 0x7ea7],
        "the firmware's fixed keycode blocks");
});

test("the keycode blocks hold 32 slots", () => {
    const {PD_MODE_KEYS, POINTING_SLOT_COUNT} = require("../../core/data/pd-mode-keys");
    assert.equal(POINTING_SLOT_COUNT, 32);
    assert.equal(PD_MODE_KEYS.length, 32);
    assert.deepEqual([PD_MODE_KEYS[31].hold, PD_MODE_KEYS[31].holdCode, PD_MODE_KEYS[31].lockCode], ["PD_MODE_31", 0x7e9f, 0x7ebf]);
    assert.deepEqual(pdModeKeyOfName("PD_MODE_20_LOCK"), {slot: 20, locked: true});
    assert.equal(resolveNativeQmkExpression("PD_MODE_20", {}), 0x7e94);
    assert.equal(resolveNativeQmkExpression("PD_MODE_32", {}), undefined);
    assert.deepEqual(pdModeKeyOfCode(0x7eb4), {slot: 20, locked: true});
    assert.equal(pdModeKeyOfCode(0x7ec0), undefined, "the layer-lock block");
});

test("a pointing key typed by its former PD_SLOT_n name reaches its slot and is written PD_MODE_n", () => {
    const {semanticActionForExpression} = require("../../core/schema/compiled-profile-v1");
    const {actionName} = require("../../core/schema/actions");
    assert.deepEqual(pdModeKeyOfName("PD_SLOT_3"), {slot: 3, locked: false});
    assert.deepEqual(pdModeKeyOfName("PD_SLOT_3_LOCK"), {slot: 3, locked: true});
    assert.equal(resolveNativeQmkExpression("PD_SLOT_3", {}), 0x7e83);
    assert.equal(resolveNativeQmkExpression("PD_SLOT_3_LOCK", {}), 0x7ea3);
    assert.equal(actionName(semanticActionForExpression("PD_SLOT_3", {})), "PD_MODE_3");
    assert.equal(actionName(semanticActionForExpression("PD_SLOT_3_LOCK", {})), "PD_MODE_3_LOCK");
    assert.equal(pdModeKeyOfName("PD_SLOT_32"), undefined);
});
