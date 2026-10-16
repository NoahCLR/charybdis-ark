"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const {lightingIdentities} = require("../../core/model/lighting-view");
const {lightingForView} = require("../../core/model/lighting-view");
const {behaviorRowsForView, rgbForView} = require("../../core/model/device-profile-view");
const {actionName} = require("../../core/schema/actions");
const {encodeKeyBehaviorDomain, decodeKeyBehaviorDomain} = require("../../core/schema/key-behavior-domain-v1");
const {decodedDeviceProfile, capabilities} = require("../fixtures/device-profile");
const keycodes = require("../../core/data/keycode-catalog");

test("every v1 semantic action has an explicit display, including unknown numeric keycodes", () => {
    const cases = [[0, 0, "KC_NO"], [1, 4, "KC_A"], [1, 0xfffe, "0xFFFE"], [2, 0, "MO(0)"],
        [3, 4, "LOCK_LAYER(4)"], [4, 0, "PD_SLOT_0"], [4, 5, "PD_SLOT_5"],
        [5, 0, "PD_SLOT_0_LOCK"], [5, 2, "PD_SLOT_2_LOCK"], [6, 0, "VIA_MACRO_0"], [7, 15, "CUSTOM_KEY_15"]];
    for (const [kind, operand, name] of cases) assert.equal(actionName({kind, flags: 0, operand}), name);
    assert.throws(() => actionName({kind: 8, operand: 0}), /Unsupported/);
});

test("a row carries its key's built-in first tap and hold, named as a person reads them", () => {
    const row = (operand) => ({target: {kind: 1, operand}, tapHoldTerm: 0, longerHoldTerm: 0, multiTapTerm: 0,
        keepsAutoMouseAnchored: false, steps: [{tapIndex: 1, tap: {kind: 1, operand: 4}}]});
    const domain = decodeKeyBehaviorDomain(encodeKeyBehaviorDomain({rows: [row(0x2a16), row(0x4338), row(0xe3)]}));
    const byKey = (rows) => Object.fromEntries(rows.map((entry) => [entry.keycode, entry.builtIn]));
    const rows = byKey(behaviorRowsForView(domain, {physicalGestureTiming: true, ownedTapping: true}));
    assert.deepEqual(rows["MT(MOD_LSFT|MOD_LGUI,KC_S)"], {
        tap: {helper: "TAP_SENDS", action: "KC_S", label: "S", code: 0x16},
        hold: {helper: "PRESS_AND_HOLD_UNTIL_RELEASE", action: "LSFT(LGUI(KC_NO))", repeatHz: "0", label: "Shift+GUI", code: 0x0a00},
    }, "a modifiers-only hold reads as its modifiers, not Shift+GUI+N/A");
    assert.deepEqual(rows["LT(3,KC_SLASH)"].hold, {helper: "PRESS_AND_HOLD_UNTIL_RELEASE", action: "MO(3)", repeatHz: "0", code: 0x5223});
    assert.deepEqual(rows.KC_LEFT_GUI, {});
    assert.ok(Object.values(byKey(behaviorRowsForView(domain))).every((builtIn) => !Object.keys(builtIn).length),
        "without the advertised features nothing is claimed");
});

test("a behaviour branch carries the readable name of the keycode it stores, when one exists", () => {
    const branch = (operand) => ({mode: 1, repeatHz: 0, action: {kind: 1, operand}});
    const domain = decodeKeyBehaviorDomain(encodeKeyBehaviorDomain({rows: [{
        target: {kind: 1, operand: 4}, tapHoldTerm: 0, longerHoldTerm: 0, multiTapTerm: 0, keepsAutoMouseAnchored: false,
        steps: [
            {tapIndex: 0, tap: {kind: 1, operand: 0x0220}, hold: branch(0x0228), longHold: {mode: 1, repeatHz: 0, action: {kind: 2, operand: 3}}},
            {tapIndex: 1, tap: {kind: 1, operand: 0xfffe}},
        ],
    }]}));
    const [step, unknown] = behaviorRowsForView(domain)[0].steps;
    assert.deepEqual([step.tap.action, step.tap.label], ["KC_HASH", "#"]);
    assert.deepEqual([step.hold.action, step.hold.label], ["LSFT(KC_ENTER)", "Shift+Enter"]);
    // A layer action is named from the profile's layers by the interface, and
    // a keycode the catalogue knows only by itself has no second name.
    assert.equal("label" in step.longHold, false);
    assert.equal("label" in unknown.tap, false);
});

test("decoded behaviors preserve sparse branches, all hold modes, anchors and timing zeros", () => {
    const rows = [1, 2, 3, 4].map((mode) => ({
        target: {kind: 1, operand: mode + 3}, tapHoldTerm: 0, longerHoldTerm: 410, multiTapTerm: 190,
        keepsAutoMouseAnchored: mode === 3,
        steps: [{tapIndex: 4, tap: {kind: 6, operand: 0},
            hold: {mode, repeatHz: mode === 3 ? 37 : 0, action: {kind: 2, operand: 0}},
            longHold: {mode: 4, repeatHz: 0, action: {kind: 7, operand: 15}}}],
    }));
    const domain = decodeKeyBehaviorDomain(encodeKeyBehaviorDomain({rows}));
    const view = behaviorRowsForView(domain);
    assert.deepEqual(view.map(r => r.steps[0].hold.helper), ["PRESS_AND_HOLD_UNTIL_RELEASE", "TAP_AT_HOLD_THRESHOLD", "REPEAT_WHILE_HELD", "TAP_ON_RELEASE_AFTER_HOLD"]);
    assert.equal(view[0].tapHoldTerm, "0");
    assert.equal(view[0].longerHoldTerm, "410");
    assert.equal(view[0].multiTapTerm, "190");
    assert.equal(view[2].keepsAutoMouseAnchored, true);
    assert.equal(view[0].keepsAutoMouseAnchored, false);
    assert.equal(view[2].steps[0].hold.repeatHz, "37");
    assert.equal(view[0].steps[0].hold.repeatHz, "0");
    assert.equal(view[0].steps.length, 1);
    assert.equal(view[0].steps[0].tapCount, 4);
    assert.equal(view[0].steps[0].tapCountName, "Quintuple tap");
    assert.equal(view[0].steps[0].tap.action, "VIA_MACRO_0");
    assert.equal(view[0].steps[0].longHold.action, "CUSTOM_KEY_15");
});

test("device lighting projection retains identity colours without changing the program", () => {
    const rgb = decodedDeviceProfile().domains.rgb, original = JSON.stringify(rgb);
    const view = rgbForView(rgb), stored = lightingIdentities(rgb);
    assert.deepEqual(view.layerColors[0].color, {h: "0", s: "0", v: "0"});
    for (const row of view.layerColors) assert.deepEqual(row.color, Object.fromEntries(Object.entries(stored.layerColors[row.layerId].color).map(([k,v]) => [k,String(v)])));
    assert.deepEqual(view.ledGroups.map(g => g.ledIndices), rgb.keySets);
    assert.equal(JSON.stringify(rgb), original);
});

test("disabled lighting rules and unknown parts are published verbatim", () => {
    const rgb = decodedDeviceProfile().domains.rgb;
    rgb.rules[0].flags = 1;
    rgb.rules[1].parts.find(p => p.slot === 3).kind = 200;
    const view = lightingForView(rgb);
    assert.equal(view.rules[0].enabled, false);
    assert.equal(view.rules[1].readOnly, true);
    assert.equal(view.unknownRules, 1);
    assert.deepEqual(view.program, rgb);
});

test("authored and built-in behaviour labels use the profile's host naming rule", () => {
    const {profileKeyNames} = require("../../core/model/key-names");
    const domain = decodeKeyBehaviorDomain(encodeKeyBehaviorDomain({rows:[{
        target:{kind:1, operand:0x1804}, tapHoldTerm:0, longerHoldTerm:0, multiTapTerm:0,
        steps:[{tapIndex:0, tap:{kind:1, operand:0x1c04}, hold:{mode:1, repeatHz:0, action:{kind:1, operand:0xe6}}}]
    }]}));
    for(const [hostOs, alt, gui] of [[0,"Alt","GUI"],[1,"Option","Command"],[2,"Alt","Windows"],[3,"Alt","Super"]]) {
        const [row] = behaviorRowsForView(domain, {}, profileKeyNames({hostOs}));
        assert.equal(row.steps[0].tap.label, `Right ${alt}+Right ${gui}+A`);
        assert.equal(row.steps[0].hold.label, `Right ${alt}`);
        assert.equal(row.builtIn.tap.label, `Right ${gui}+A`);
        assert.equal(row.builtIn.hold.label, `Right ${gui}+A`);
        const builtIn = require("../../core/model/device-profile-view").builtInForView({kind:1, operand:0x3804}, {ownedTapping:true}, profileKeyNames({hostOs}));
        assert.equal(builtIn.hold.label, `Right ${gui}`);
    }
});
