"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
    buildCanonicalStudioProfileV1,
    semanticActionForExpression,
} = require("../../core/schema/compiled-profile-v1");

function minimalStudioModel() {
    return {
        layers: [{name: "_BASE"}],
        configDefaults: [],
        rgb: {
            ledGroups: [],
            layerColors: [{layer: "_BASE", color: {h: 0, s: 0, v: 0}, mode: "ALL_KEYS"}],
            layerLedGroups: [],
            pdModeColors: [],
            pdModeLedGroups: [],
            comboFeedbackLedGroups: [],
            keyBehaviorFeedbackLedGroups: [],
        },
        keyBehaviors: [{
            keycode: "CUSTOM_ONE",
            tapHoldTerm: "180",
            steps: [{
                tapCount: 0,
                tap: {style: "TAP_SENDS", action: "KC_A"},
                hold: {style: "PRESS_AND_HOLD_UNTIL_RELEASE", action: "MO(_BASE)"},
            }],
        }],
        qmkKeycodeValues: {KC_A: 4},
        customKeycodes: ["CUSTOM_ONE"],
    };
}

const milestoneCapabilities = {
    maxLogicalLayers: 16,
    maxBehaviorRows: 128,
    maxTapStepsPerBehavior: 5,
    maxPopulatedBehaviorSteps: 640,
    customKeySlots: 128,
    macroSlots: 128,
    maxProfilePayload: 65504,
    physicalLedCount: 58,
};

test("semantic compiler maps stable actions and rejects source-only helpers", () => {
    const model = minimalStudioModel();
    assert.deepEqual(semanticActionForExpression("MACRO_12", model), {kind: 6, operand: 12});
    assert.deepEqual(semanticActionForExpression("VIA_MACRO_12", model), {kind: 6, operand: 12}, "the former name");
    assert.deepEqual(semanticActionForExpression("LOCK_LAYER(_BASE)", model), {kind: 3, operand: 0});
    assert.throws(
        () => semanticActionForExpression("SOME_LOCAL_C_FUNCTION(KC_A)", model),
        (error) => error?.code === "UNSUPPORTED_ACTION"
    );
});

test("the native resolver refuses expressions whose bits would land on another keycode", () => {
    const {resolveNativeQmkExpression: resolve} = require("../../core/schema/compiled-profile-v1");
    // Well-formed expressions still resolve, including nested modifiers.
    assert.equal(resolve("C(S(0x04))", {}), 0x0304);
    assert.equal(resolve("LT(15,0x04)", {}), 0x4f04);
    assert.equal(resolve("LOCK_LAYER(15)", {}) - resolve("LOCK_LAYER(0)", {}), 15);
    // Each of these used to OR into an unrelated keycode: a dead user keycode,
    // a macro with Ctrl dropped, RIGHT_THUMB, TO(4), QK_BOOTLOADER, MO(1)+mods.
    for (const expression of ["G(MACRO_3)", "C(MACRO_3)", "C(PD_MODE_0)", "LOCK_LAYER(16)",
        "LT(18,0x04)", "LT(60,0x00)", "LCTL(MO(1))"]) {
        assert.equal(resolve(expression, {}), undefined, expression);
    }
});


test("authored compact expressions cannot silently switch a modifier's side", () => {
    const {resolveNativeQmkExpression: resolve} = require("../../core/schema/compiled-profile-v1");
    const model = {qmkKeycodeValues: {KC_A: 4, KC_EXLM: 0x021e}};
    for (const expression of ["RSFT(C(KC_A))", "C(RSFT(KC_A))", "RALT(KC_EXLM)",
        "MT(MOD_LCTL|MOD_RSFT, KC_A)", "OSM(MOD_RSFT|MOD_LCTL)"]) {
        assert.equal(resolve(expression, model), undefined, expression);
        assert.throws(() => semanticActionForExpression(expression, model), /cannot be represented/);
    }
    assert.equal(resolve("S(C(KC_A))", model), 0x0304);
    assert.equal(resolve("RSFT(RCTL(KC_A))", model), 0x1304);
    assert.equal(resolve("MT(MOD_RCTL|MOD_RSFT, KC_A)", model), 0x3304);
    assert.equal(resolve("OSM(MOD_RCTL|MOD_RSFT)", model), 0x52b3);
    assert.equal(resolve("0x1304", model), 0x1304);
});
