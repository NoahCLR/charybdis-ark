import assert from "node:assert/strict";
import test from "node:test";
import {createRequire} from "node:module";
import {behaviourEditorRow, behaviourChangesNothing, behaviourHasTiming, behaviourThresholds, styleDetail, behaviourRowAfterPreview, behaviourTimingEdit, behaviourTimingField, canHaveBehaviour} from "../../webview/view/behavior-editor.mjs";
import {impliedBranch} from "../../webview/view/keyface.mjs";
import * as edits from "../../webview/view/edits.mjs";

const require = createRequire(import.meta.url);
const {profileDocument, publishedModel} = require("../fixtures/published-model.js");

// What core publishes for a profile with these keys on Base, and these rows posted.
const onBase = (keys, posted = []) => publishedModel(profileDocument({keys: {0: Object.fromEntries(keys.map((key, at) => [at, key]))}}), {edits: posted});
// Which keys are transparent or disabled is core's (qmkKeyKinds), so even a
// question about a keycode alone takes the model core publishes.
const profile = onBase([]);

test("opening an unstored behaviour leaves the model unchanged and takes built-ins from the core", () => {
    const model = onBase(["LT(3,KC_F)"]);
    const {builtIn, timing} = model.behaviorEditing.keyDefaults["LT(3,KC_F)"];
    assert.equal(builtIn.tap.action, "KC_F", "the key's own tap");
    const before = structuredClone(model);
    const row = behaviourEditorRow(model, "LT(3, KC_F)");
    assert.equal(row.keycode, "LT(3,KC_F)");
    assert.equal(row.stored, false);
    assert.deepEqual(row.steps, []);
    assert.deepEqual(row.builtIn, builtIn);
    assert.deepEqual(row.timingDefaults, timing);
    assert.deepEqual(model, before);
});

test("an unstored custom key's grid shows the tap a release before Long hold sends", () => {
    // Custom keys shows this editor for a key on no layer, with the core's
    // defaults for every custom key (tests/model/profile-model.test.js).
    const model = onBase([]);
    const unplaced = behaviourEditorRow(model, "CUSTOM_KEY_9");
    assert.equal(unplaced.stored, false);
    assert.equal(unplaced.builtIn.releaseTaps, true);
    const step = {tapCount: 0, tap: {style: "TAP_SENDS", action: "KC_A"}, longHold: {style: "HOLD_WHILE_HELD", action: "KC_B"}};
    assert.equal(impliedBranch({...unplaced, steps: [step]}, step, "hold")?.meaning, "tapsBeforeLong");
});

test("an existing row is selected through its semantic alias without changing it", () => {
    const model = onBase(["MACRO_0"], [edits.saveBehaviour({keycode: "MACRO_0", steps: [{tapCount: 0, tap: {style: "TAP_SENDS", action: "KC_A"}}]})]);
    const stored = model.layers[0].positions[0].keycode;
    assert.equal(stored, "QK_MACRO_0", "the keyboard's own name for the macro key");
    const existing = model.keyBehaviors.find((row) => row.keycode === "MACRO_0");
    const row = behaviourEditorRow(model, stored);
    assert.equal(row.stored, true);
    assert.equal(row.keycode, "MACRO_0");
    assert.deepEqual(row.steps, existing.steps);
    assert.equal(existing.stored, undefined);
});

test("transparent and disabled key aliases never open a behaviour editor", () => {
    for (const key of [undefined, "", "KC_NO", "XXXXXXX", "KC_TRNS", "KC_TRANSPARENT", "_______", "0x0000", "0x1"]) {
        assert.equal(canHaveBehaviour(profile, key), false, key);
        assert.equal(behaviourEditorRow(profile, key), undefined, key);
    }
    for (const key of ["KC_A", "LT(3,KC_F)", "CUSTOM_KEY_0", "PD_MODE_0"]) assert.equal(canHaveBehaviour(profile, key), true, key);
});

test("timing fields show effective defaults but keep their stored inheritance zeros", () => {
    const row = {multiTapTerm: "0", timingDefaults: {multiTapTerm: "150"}};
    const field = behaviourTimingField(row, "multiTapTerm");
    assert.deepEqual(field, {stored: "0", followsDefault: true, fallback: "150", value: "", placeholder: "150 · default"});
    assert.equal(behaviourTimingEdit("150", field), "0");
    assert.equal(behaviourTimingEdit(" 777 ", field), "777");
    assert.equal(behaviourTimingEdit("", field), "0");
    const custom = behaviourTimingField({...row, multiTapTerm: "177"}, "multiTapTerm");
    assert.equal(custom.value, "177");
    assert.equal(custom.followsDefault, false);
    assert.equal(behaviourTimingEdit("", custom), "0");
    assert.equal(behaviourTimingField({timingDefaults: {multiTapTerm: "0"}}, "multiTapTerm").placeholder, "0 · default");
    assert.equal(behaviourTimingField({}, "multiTapTerm").value, "", "unknown defaults are not invented");
});

test("each timing placeholder names where its default comes from, and storing is unchanged", () => {
    // The test profile's Tapping term is 200 ms, its Tap / hold term 150 ms,
    // its Long hold term 400 ms and its Multi-tap term 150 ms.
    const model = onBase(["LT(3,KC_F)", "KC_A"]);
    const dual = behaviourEditorRow(model, "LT(3,KC_F)"), plain = behaviourEditorRow(model, "KC_A");
    assert.equal(behaviourTimingField(dual, "tapHoldTerm").placeholder, "200 · dual-role");
    assert.equal(behaviourTimingField(plain, "tapHoldTerm").placeholder, "150 · behaviour default");
    assert.equal(behaviourTimingField(plain, "longHoldTerm").placeholder, "400 · default");
    assert.equal(behaviourTimingField(plain, "multiTapTerm").placeholder, "150 · default");
    assert.equal(behaviourTimingField({...plain, timingDefaults: {}}, "tapHoldTerm").placeholder, "ms", "no default reads ms");
    const {timingSources, ...unsourcedDefaults} = model.behaviorEditing.keyDefaults["LT(3,KC_F)"];
    assert.equal(timingSources.tapHoldTerm, "tappingTerm", "a dual-role key follows the Tapping term");
    const unsourced = behaviourEditorRow({...model, behaviorEditing: {keyDefaults: {"LT(3,KC_F)": unsourcedDefaults}}}, "LT(3,KC_F)");
    assert.equal(behaviourTimingField(unsourced, "tapHoldTerm").placeholder, "200 · default", "without the core's sources, no source is guessed");
    for (const row of [dual, plain]) {
        const field = behaviourTimingField(row, "tapHoldTerm");
        assert.equal(behaviourTimingEdit(field.fallback, field), "0", "typing the default follows it");
        assert.equal(behaviourTimingEdit("", field), "0", "an empty field follows it");
    }
});

test("an explicit timing matching the default is muted without rewriting its stored override", () => {
    const field = behaviourTimingField({multiTapTerm: "150", timingDefaults: {multiTapTerm: "150"}}, "multiTapTerm");
    assert.equal(field.value, "");
    assert.equal(field.placeholder, "150 · default");
    assert.equal(field.followsDefault, false);
    assert.equal(behaviourTimingEdit("", field), "150");
    assert.equal(behaviourTimingEdit("177", field), "177");
    assert.equal(behaviourTimingEdit("0", field), "0");
});

test("a row opened from the selected key follows it when the preview changes; a picked row stays", () => {
    assert.equal(behaviourRowAfterPreview("KC_TRANSPARENT", "KC_TRANSPARENT", "KC_DELETE"), "KC_DELETE", "a layer turned on under it answers");
    assert.equal(behaviourRowAfterPreview("KC_DELETE", "KC_DELETE", "KC_TRANSPARENT"), "KC_TRANSPARENT", "turned off again, back to the key itself");
    assert.equal(behaviourRowAfterPreview("KC_ENTER", "KC_TRANSPARENT", "KC_DELETE"), "KC_ENTER", "a row picked from the list is kept");
    assert.equal(behaviourRowAfterPreview(null, "KC_TRANSPARENT", "KC_DELETE"), null, "nothing opened yet");
});

test("a behaviour names the thresholds it runs on, its own or the keyboard's", () => {
    const model = onBase(["KC_LEFT"], [edits.deleteBehaviour("KC_LEFT"), edits.saveBehaviour({keycode: "KC_LEFT", tapHoldTerm: "100", longHoldTerm: "0", multiTapTerm: "0", steps: [
        {tapCount: 0, hold: {action: "LALT(KC_LEFT)", style: "TAP_ON_RELEASE_AFTER_HOLD", repeatHz: "0"}, longHold: {action: "LGUI(KC_LEFT)", style: "TAP_AT_HOLD_THRESHOLD", repeatHz: "0"}}]})]);
    const behaviour = model.keyBehaviors.find((row) => row.keycode === "KC_LEFT");
    const terms = behaviourThresholds(model, behaviour);
    assert.deepEqual(terms.used, ["tapHoldTerm", "longHoldTerm"], "no branch starts on a later tap");
    assert.deepEqual(terms.tapHoldTerm, {name: "tapHoldTerm", ms: "100"}, "its own time");
    assert.deepEqual(terms.longHoldTerm, {name: "longHoldTerm", ms: "400"}, "the keyboard default it follows");
    assert.deepEqual(behaviourThresholds(model, {...behaviour, steps: []}).used, ["tapHoldTerm"], "a behaviour with no branches keeps its tap / hold term");
    assert.deepEqual(behaviourThresholds(model, {...behaviour, steps: [{tapCount: 1, tap: {action: "KC_A"}}]}).used, ["multiTapTerm"]);
});

test("a hold tier states its own threshold when it waits for one, and its rate when it repeats", () => {
    const terms = {tapHoldTerm: {name: "tapHoldTerm", ms: "150"}, longHoldTerm: {name: "longHoldTerm", ms: "400"}, multiTapTerm: {name: "multiTapTerm", ms: "100"}, used: []};
    assert.equal(styleDetail("hold", {style: "TAP_AT_HOLD_THRESHOLD"}, terms), "150 ms");
    assert.equal(styleDetail("long", {style: "TAP_ON_RELEASE_AFTER_HOLD"}, terms), "400 ms");
    assert.equal(styleDetail("hold", {style: "REPEAT_WHILE_HELD", repeatHz: "100"}, terms), "100 Hz", "a repeat runs at its rate, not a gap between taps");
    assert.equal(styleDetail("hold", {style: "REPEAT_WHILE_HELD", repeatHz: "0"}, terms), "0 Hz", "the stored rate is reported as it is");
    assert.equal(styleDetail("hold", {style: "PRESS_AND_HOLD_UNTIL_RELEASE"}, terms), "");
    assert.equal(styleDetail("tap", {style: "TAP_AT_HOLD_THRESHOLD"}, terms), "");
});

test("a behaviour changes nothing without a branch, the anchor or a timing that applies to its key", () => {
    const empty = {keycode: "KC_DELETE", tapHoldTerm: "0", longHoldTerm: "0", multiTapTerm: "0", keepsAutoMouseAnchored: false, enabled: true, allowedLayers: 65535, steps: [], timingAlone: false};
    assert.equal(behaviourChangesNothing(empty), true);
    assert.equal(behaviourChangesNothing({...empty, tapHoldTerm: "150"}), true, "a timing alone does nothing on a plain key");
    assert.equal(behaviourChangesNothing({...empty, timingAlone: true, tapHoldTerm: "150"}), false, "it does on a key the keyboard handles anyway");
    assert.equal(behaviourChangesNothing({...empty, timingAlone: undefined, tapHoldTerm: "150"}), false, "unknown counts as doing something");
    assert.equal(behaviourChangesNothing({...empty, steps: [{tapCount: 0, tap: {style: "TAP_SENDS", action: "KC_A"}}]}), false);
    assert.equal(behaviourChangesNothing({...empty, keepsAutoMouseAnchored: true}), false, "the anchor applies on any key");
    // Its switch and layers gate only what it holds (firmware D-F27 "Rows without steps").
    assert.equal(behaviourChangesNothing({...empty, allowedLayers: 1, enabled: false}), true);
    assert.equal(behaviourHasTiming({tapHoldTerm: "", longHoldTerm: "00", multiTapTerm: undefined}), false, "empty and zero follow the default");
    assert.equal(behaviourHasTiming({tapHoldTerm: "0.0"}), true, "anything else is written, for the keyboard to judge");
});

test("the editor row carries whether a timing alone does something on its key", () => {
    const model = onBase(["KC_DELETE", "LT(3,KC_F)"]);
    assert.equal(behaviourEditorRow(model, "KC_DELETE")?.timingAlone, false);
    assert.equal(behaviourEditorRow(model, "LT(3,KC_F)")?.timingAlone, true);
    assert.equal(behaviourEditorRow(model, "KC_Q")?.timingAlone, true, "a key the core published nothing for keeps its timing");
});
