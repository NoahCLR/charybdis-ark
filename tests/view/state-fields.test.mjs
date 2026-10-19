// The panel state's declarations (webview/view/state-fields.mjs), and what
// the store declares for each of its fields when the host replaces the draft
// under the forms (webview/store.mjs resetDraftForms).
import assert from "node:assert/strict";
import test from "node:test";
import {afterDraftChange, draftChangePolicies, initialState, kept, resets, resetsTo} from "../../webview/view/state-fields.mjs";

globalThis.acquireVsCodeApi = () => ({postMessage() {}});
const {STATE_FIELDS, closeComboBuilder, openComboBuilder, resetDraftForms, setModel, state} = await import("../../webview/store.mjs");

test("a state starts from fresh copies of its declared values", () => {
    const fields = {screen: kept("keys"), picks: kept([]), form: resets({text: ""})};
    const one = initialState(fields), two = initialState(fields);
    assert.deepEqual(one, {screen: "keys", picks: [], form: {text: ""}});
    one.picks.push(3);
    one.form.text = "typed";
    assert.deepEqual(two, {screen: "keys", picks: [], form: {text: ""}}, "no two states share a starting object");
    assert.deepEqual(fields.form.initial, {text: ""}, "nor change the declaration");
});

test("a field without a draft-change decision is refused, not given one", () => {
    assert.throws(() => initialState({screen: kept("keys"), form: {initial: null}}), /draft-change decision: form/);
    assert.throws(() => initialState({form: {initial: null, draftChange: "sometimes"}}), /draft-change decision: form/);
    assert.throws(() => initialState({form: null}), /draft-change decision: form/);
});

test("a draft change resets forms, applies each field's rule to the state before it, and keeps the rest", () => {
    const fields = {
        screen: kept("keys"),
        form: resets({text: ""}),
        busy: kept(false),
        notes: resetsTo({}, (notes, before) => before.busy ? notes : {}),
    };
    const before = {screen: "macros", form: {text: "typed"}, busy: true, notes: {a: 1}};
    const next = afterDraftChange(fields, before);
    assert.deepEqual(next, {form: {text: ""}, notes: {a: 1}}, "kept fields are absent; the rule saw busy");
    assert.notEqual(next.form, fields.form.initial, "a reset is a fresh copy");
    assert.deepEqual(afterDraftChange(fields, {...before, busy: false}).notes, {});
    assert.deepEqual(draftChangePolicies(fields), {screen: "keep", form: "reset", busy: "keep", notes: "custom"});
});

// Every field of the panel's state, by what a draft change does to it. A new
// field joins one of these lists, so its decision is made in review.
const RESETS = ["retarget", "pdKind", "pdButtons", "pdTaps", "lastTake"];
const CUSTOM = ["combo", "macroForms"];
const KEPT = [
    "screen", "layer", "layersOn", "layerGripFocus", "selected", "tab", "behaviourRow", "behaviourRowShown", "behaviourRoute",
    "reachGroups", "resetBenchHeight", "reachRow", "cell", "cellRow", "reveal", "pickCombo", "settingsOpen", "keyDetailsOpen", "stackOpen", "cellHow", "placement",
    "macroClipboard", "keyClipboard", "stage", "layersOpen", "layersAsked", "pdSlot", "pdAdvanced", "applyDismissed", "pdPreview", "feedbackRow",
    "macroSlot", "macroSearch", "customKey", "customKeySearch", "recording", "recordDelays", "recordPreserveHoldTiming", "recordDelayThreshold",
    "recordDelayRound", "ledPicks", "trackball", "rowColour", "ledRow", "settingsSearch", "overlay", "leaveDemo", "modeAsk", "confirmChecks",
    "picker", "notice", "error", "settingsDurationUnits",
];

test("every panel state field declares what a draft change does to it", () => {
    const policies = draftChangePolicies(STATE_FIELDS);
    const pinned = Object.fromEntries([...RESETS.map((name) => [name, "reset"]), ...CUSTOM.map((name) => [name, "custom"]),
        ...KEPT.map((name) => [name, "keep"])]);
    assert.deepEqual(policies, pinned);
    assert.deepEqual(Object.keys(state).sort(), Object.keys(STATE_FIELDS).sort(), "the store's state is exactly what it declares");
});

const layer = (index) => ({index, name: `Layer ${index}`, positions: []});

test("a draft change resets the existing forms and preserves historically kept pending choices", () => {
    setModel({layers: [layer(0), layer(1), layer(2)]});
    const standing = {
        screen: "macros", layer: 2, layersOn: [1], selected: 7, tab: "behaviours", cell: "0-hold", cellRow: "QK_USER_16",
        cellHow: {cell: "0-hold", keycode: "QK_USER_16", helper: "REPEAT_WHILE_HELD", repeatHz: "20"},
        placement: {keycode: "VIA_MACRO_1"}, keyClipboard: {keycode: "KC_A", label: "A"}, pdSlot: 2, macroSlot: "VIA_MACRO_0",
        macroSearch: "hello", ledPicks: [1, 4], trackball: true, rowColour: {h: "10", s: "20", v: "30"},
        ledRow: {target: "pdMode", owner: "PD_SLOT_0", source: "Thumbs"}, recordPreserveHoldTiming: true, overlay: "history",
        notice: "Saved.", recording: null,
    };
    Object.assign(state, standing, {
        retarget: {from: "QK_USER_16", to: "KC_B", existing: "QK_USER_17"},
        pdKind: {slot: 1, kind: 2}, pdButtons: {slot: 1, rows: {0: {}}}, pdTaps: {slot: 1, rows: {"dir:up": {}}},
        lastTake: {slot: "VIA_MACRO_0", before: "abc"},
        macroForms: {VIA_MACRO_0: {draft: "unstaged", stepError: "bad"}},
    });
    openComboBuilder({id: 4, inputs: ["KC_A", "KC_B"], output: "KC_C", termMs: 40, followsDefault: false, enabled: true, allowedLayers: 1});
    state.combo.picking = true;
    const references = Object.fromEntries(Object.keys(standing).map((name) => [name, state[name]]));

    resetDraftForms();

    for (const name of Object.keys(standing)) assert.equal(state[name], references[name], `${name} is kept as it was`);
    for (const name of RESETS) assert.equal(state[name], null, `${name} starts again`);
    assert.deepEqual(state.macroForms, {});
    assert.equal(state.combo.open, false, "the combo builder closes");
    assert.equal(state.combo.picking, false);
    assert.equal(state.combo.form.allowedLayers, 0b111, "and starts again on every layer of the keyboard");
});

test("a draft change closes the combo builder exactly as Close does", () => {
    setModel({layers: [layer(0), layer(1)]});
    openComboBuilder({id: 1, inputs: ["KC_A", "KC_B"], output: "KC_C", termMs: 40, followsDefault: false, mustHold: true});
    state.combo.awaiting = true;
    resetDraftForms();
    const afterReset = state.combo;
    closeComboBuilder();
    assert.deepEqual(afterReset, state.combo);
    assert.equal(afterReset.open, false);
    assert.equal(afterReset.editId, null);
    assert.deepEqual(afterReset.inputs, []);
});

test("a take being recorded keeps the text it is building on, and nothing else of its slot or others", () => {
    Object.assign(state, {
        recording: {slot: "VIA_MACRO_1", before: "ab"},
        lastTake: {slot: "VIA_MACRO_0", before: "x"},
        macroForms: {
            VIA_MACRO_0: {draft: "other", steps: []},
            VIA_MACRO_1: {draft: "ab{KC_C}", stepError: "stale", wantsStage: true},
        },
    });
    const recording = state.recording;
    resetDraftForms();
    assert.deepEqual(state.macroForms, {VIA_MACRO_1: {draft: "ab{KC_C}"}});
    assert.equal(state.recording, recording, "the take carries on");
    assert.equal(state.lastTake, null);

    state.macroForms = {VIA_MACRO_0: {draft: "other"}};
    resetDraftForms();
    assert.deepEqual(state.macroForms, {}, "a take whose slot has no form leaves none behind");
});
