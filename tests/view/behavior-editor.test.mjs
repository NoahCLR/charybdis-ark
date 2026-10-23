import {withAnswers} from "../fixtures/layer-answers.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import {behaviourEditorRow, behaviourChangesNothing, behaviourHasTiming, behaviourThresholds, styleDetail, behaviourKeyAt, behaviourRowAfterPreview, behaviourTimingEdit, behaviourTimingField, canHaveBehaviour} from "../../webview/view/behavior-editor.mjs";
import {impliedBranch} from "../../webview/view/keyface.mjs";
import {VOCABULARY} from "../../core/model/vocabulary.js";

test("opening an unstored behaviour leaves the model unchanged and takes built-ins from the core", () => {
    const builtIn = {tap: {style: "TAP_SENDS", action: "KC_F"}};
    const timing = {tapHoldTerm: "210", multiTapTerm: "150", longHoldTerm: "400"};
    const model = {keyBehaviors: [], behaviorEditing: {keyDefaults: {"LT(3,KC_F)": {builtIn, timing}}}};
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
    // defaults for every custom key (tests/session/device-model.test.js).
    const model = {keyBehaviors: [], behaviorEditing: {keyDefaults: {CUSTOM_KEY_9: {builtIn: {releaseTaps: true}, timing: {}}}}};
    const unplaced = behaviourEditorRow(model, "CUSTOM_KEY_9");
    assert.equal(unplaced.stored, false);
    const step = {tapCount: 0, tap: {style: "TAP_SENDS", action: "KC_A"}, longHold: {style: "HOLD_WHILE_HELD", action: "KC_B"}};
    assert.equal(impliedBranch({...unplaced, steps: [step]}, step, "hold")?.meaning, "tapsBeforeLong");
});

test("an existing row is selected through its semantic alias without changing it", () => {
    const existing = {keycode: "CUSTOM_KEY_0", steps: [{tapCount: 0, tap: {style: "TAP_SENDS", action: "KC_A"}}]};
    const model = {keyBehaviors: [existing], qmkKeycodeAliases: {QK_USER_0: "CUSTOM_KEY_0"}};
    const row = behaviourEditorRow(model, "QK_USER_0");
    assert.equal(row.stored, true);
    assert.equal(row.keycode, "CUSTOM_KEY_0");
    assert.deepEqual(row.steps, existing.steps);
    assert.equal(existing.stored, undefined);
});

test("transparent and disabled key aliases never open a behaviour editor", () => {
    for (const key of [undefined, "", "KC_NO", "XXXXXXX", "KC_TRNS", "KC_TRANSPARENT", "_______", "0x0000", "0x1"]) {
        assert.equal(canHaveBehaviour({}, key), false, key);
        assert.equal(behaviourEditorRow({}, key), undefined, key);
    }
    for (const key of ["KC_A", "LT(3,KC_F)", "CUSTOM_KEY_0", "PD_SLOT_0"]) assert.equal(canHaveBehaviour({}, key), true, key);
});

test("a transparent key in a layer preview opens the key answered from below", () => {
    const at = (layoutIndex, keycode, semantic) => ({layoutIndex, keycode, semantic, display: keycode});
    const stack = withAnswers([
        {index: 0, name: "Base", positions: [at(0, "KC_A"), at(1, "KC_B"), at(2, "KC_C"), at(3, "QK_USER_0", "CUSTOM_KEY_0")]},
        {index: 3, name: "Navigation", positions: [at(0, "KC_DELETE"), at(1, "KC_NO"), at(2, "KC_TRANSPARENT"), at(3, "KC_TRANSPARENT")]},
        {index: 4, name: "Pointing", positions: [at(0, "KC_TRANSPARENT"), at(1, "KC_TRANSPARENT"), at(2, "KC_TRANSPARENT"), at(3, "KC_TRANSPARENT")]},
    ]);
    const key = (held, index) => {
        const found = behaviourKeyAt(stack, 2, held, index);
        return [found.keycode, found.from?.name ?? null];
    };

    assert.deepEqual(key([1], 0), ["KC_DELETE", "Navigation"], "the layer held under it answers");
    assert.deepEqual(key([1], 2), ["KC_C", "Base"], "through two transparent keys to the default layer");
    assert.deepEqual(key([1], 3), ["CUSTOM_KEY_0", "Base"], "rows are found by what a key means, not its stored name");
    assert.equal(behaviourEditorRow({}, key([1], 1)[0]), undefined, "a key answered by KC_NO still has no editor");
    // With no preview the base layer still answers, as the Key tab's status line says.
    assert.deepEqual(key([], 0), ["KC_A", "Base"], "outside a preview the base layer answers");
    assert.deepEqual(key([], 3), ["CUSTOM_KEY_0", "Base"]);
    assert.deepEqual(behaviourKeyAt(stack, 1, [], 2), {keycode: "KC_C", from: stack[0]}, "a transparent key on a layer above the base");
    assert.equal(behaviourEditorRow({}, behaviourKeyAt(stack, 1, [], 1).keycode), undefined, "KC_NO itself has no editor");
    assert.deepEqual(behaviourKeyAt(stack, 1, [], 0), {keycode: "KC_DELETE", from: null}, "a mapped key opens its own row");
    assert.deepEqual(behaviourKeyAt(stack, 1, [], 9), {keycode: "", from: null}, "no position, no key");

    const hollow = withAnswers([{index: 0, name: "Base", positions: [at(0, "KC_TRANSPARENT")]}, {index: 1, name: "Top", positions: [at(0, "KC_TRANSPARENT")]}]);
    assert.deepEqual(behaviourKeyAt(hollow, 1, [0], 0), {keycode: "KC_TRANSPARENT", from: null}, "nothing mapped below");
    assert.deepEqual(behaviourKeyAt(hollow, 1, [], 0), {keycode: "KC_TRANSPARENT", from: null}, "nothing mapped below, no preview");
    const overNothing = withAnswers([{index: 0, name: "Base", positions: [at(0, "KC_NO")]}, {index: 1, name: "Top", positions: [at(0, "KC_TRANSPARENT")]}]);
    const below = behaviourKeyAt(overNothing, 1, [], 0);
    assert.equal(below.keycode, "KC_NO", "a transparent key over KC_NO follows it");
    assert.equal(canHaveBehaviour({}, below.keycode), false, "and still has no behaviour");
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
    const {timingSources} = VOCABULARY;
    const timing = {tapHoldTerm: "200", multiTapTerm: "150", longHoldTerm: "400"};
    const sources = (hold) => ({tapHoldTerm: hold, longHoldTerm: "longHoldTerm", multiTapTerm: "multiTapTerm"});
    const model = {keyBehaviors: [], vocabulary: {timingSources}, behaviorEditing: {keyDefaults: {
        "LT(3,KC_F)": {builtIn: {}, timing, timingSources: sources("tappingTerm")},
        KC_A: {builtIn: {}, timing: {...timing, tapHoldTerm: "150"}, timingSources: sources("tapHoldTerm")}}}};
    const dual = behaviourEditorRow(model, "LT(3,KC_F)"), plain = behaviourEditorRow(model, "KC_A");
    assert.equal(behaviourTimingField(dual, "tapHoldTerm").placeholder, "200 · dual-role");
    assert.equal(behaviourTimingField(plain, "tapHoldTerm").placeholder, "150 · behaviour default");
    assert.equal(behaviourTimingField(plain, "longHoldTerm").placeholder, "400 · default");
    assert.equal(behaviourTimingField(plain, "multiTapTerm").placeholder, "150 · default");
    assert.equal(behaviourTimingField({...plain, timingDefaults: {}}, "tapHoldTerm").placeholder, "ms", "no default reads ms");
    const unsourced = behaviourEditorRow({...model, behaviorEditing: {keyDefaults: {"LT(3,KC_F)": {builtIn: {}, timing}}}}, "LT(3,KC_F)");
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
    const model = {behaviorTimingDefaults: {tapHoldTerm: "150", longHoldTerm: "400", multiTapTerm: "150"}, keyBehaviors: []};
    const behaviour = {keycode: "KC_LEFT", tapHoldTerm: "100", longHoldTerm: "0", multiTapTerm: "0", steps: [
        {tapCount: 0, hold: {action: "LALT(KC_LEFT)", style: "TAP_ON_RELEASE_AFTER_HOLD"}, longHold: {action: "LGUI(KC_LEFT)", style: "TAP_AT_HOLD_THRESHOLD"}}]};
    model.keyBehaviors.push(behaviour);
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
    const model = {behaviorEditing: {keyDefaults: {KC_DELETE: {builtIn: {}, timing: {}, timingAlone: false}, "LT(3,KC_F)": {builtIn: {}, timing: {}, timingAlone: true}}}};
    assert.equal(behaviourEditorRow(model, "KC_DELETE")?.timingAlone, false);
    assert.equal(behaviourEditorRow(model, "LT(3,KC_F)")?.timingAlone, true);
    assert.equal(behaviourEditorRow(model, "KC_Q")?.timingAlone, true, "a key the core published nothing for keeps its timing");
});
