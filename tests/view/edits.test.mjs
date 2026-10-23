import {profileLayers, profileMacros, editLayers, editMacros} from "../fixtures/profile-document.js";
// The payloads this interface posts have to be the ones the tested core
// accepts. Every screen builds its messages with webview/view/edits.mjs (and
// pointing records with view/pointing-config.mjs, layer-panel controls with
// view/controls.mjs); these tests stage exactly
// what those builders return against a real draft session, so a change of
// message shape fails here rather than on a keyboard.

import assert from "node:assert/strict";
import test from "node:test";
import {createRequire} from "node:module";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {recordedTakePayload} from "../../webview/view/macro-recording.mjs";
import * as edits from "../../webview/view/edits.mjs";
import * as controls from "../../webview/view/controls.mjs";
import {behaviourEditorRow, behaviourTimingEdit, behaviourTimingField} from "../../webview/view/behavior-editor.mjs";
import {shareHold} from "../../webview/view/share.mjs";
import {durationMilliseconds, durationValue} from "../../webview/view/duration.mjs";
import {AXIS, BUTTON, DIRECTIONAL_STARTER_THRESHOLD, KIND, MODIFIER_POLICY, SCROLL_AXES, SCROLL_STARTER, SHIPPED_SCROLL, dpiOptions, scrollStarter, modeDpi, newMode, readConfig, settleButtons, settleTaps, startingRecord, thresholdDistance} from "../../webview/view/pointing-config.mjs";

const require = createRequire(import.meta.url);
const {SETTING} = require("../../core/schema/settings-domain-v1");
const {customKeyCode} = require("../../core/data/user-keycodes");
const here = path.dirname(fileURLToPath(import.meta.url));
const {ProfileDraftSession} = require(path.join(here, "..", "..", "core", "session", "profile-draft-session"));
const portable = require(path.join(here, "..", "..", "core", "model", "portable-profile"));
const {settingsEditorView} = require(path.join(here, "..", "..", "core", "model", "settings-editor"));
const {buildDeviceModel, buildSnapshotModel} = require(path.join(here, "..", "..", "core", "session", "device-model"));
const {CHARYBDIS_4X6_LAYOUT_MATRIX} = require(path.join(here, "..", "..", "core", "data", "charybdis-layout"));
const {RGB_LOCALITIES} = require(path.join(here, "..", "..", "core", "schema", "rgb-domain-v1"));
const {document: pdDocument} = require(path.join(here, "..", "fixtures", "pd-profile"));

const capabilities = {protocol: {major: 2, minor: 0}, schema: {major: 4, minor: 0}, compiledLayerCount: 16, supportedDomainMask: 127, actionAbiDigest: 0x6fd70b90,
    featureFlags: require(path.join(here, "..", "..", "core", "protocol", "profile-wire-v1")).PROFILE_WIRE_KNOWN_MASKS.CURRENT_PAIR_FEATURES};

test("the playback protection control stages a portable policy and Review/discard/undo preserve text", () => {
    const {hostMacros} = require("../fixtures/host-macros");
    const {macroEditorView} = require("../../core/model/macro-editor");
    const fixture = hostMacros(1 | (3 << 16), ["café🙂"]);
    const draft = new ProfileDraftSession(fixture.snapshot, "test-device", fixture.capabilities);
    const message = edits.macroProtectionMessage("VIA_MACRO_0", "off", draft.current.fingerprint);
    assert.deepEqual(message, {type: "updateMacro", keycode: "VIA_MACRO_0", protection: "off", expectedFingerprint: draft.current.fingerprint});
    stage(draft, message);
    assert.equal(macroEditorView(draft.current, fixture.capabilities).macros[0].uninterruptible, false);
    const change = draft.changes().find(row => row.unit === "macro:0");
    assert.deepEqual(change.fields.map(field => [field.label, field.before, field.after]), [["Uninterruptible playback", "Automatic · on", "Off"]]);
    const exported = JSON.parse(JSON.stringify(draft.document));
    assert.deepEqual(profileMacros(portable.validateSnapshot(exported).document), profileMacros(draft.document));
    draft.discard(draft.revision, change.group);
    assert.deepEqual(profileMacros(draft.document), profileMacros(fixture.snapshot.document));
    draft.undo(draft.revision);
    assert.equal(macroEditorView(draft.current, fixture.capabilities).macros[0].protection, "off");
});

function session() {
    const doc = pdDocument();
    const snapshot = {document: doc, fingerprint: portable.fingerprint(doc), summary: portable.summary(doc), limits: {brightnessMax: 200}};
    return new ProfileDraftSession(snapshot, "test-device", capabilities);
}
// The webview's store adds the draft id and revision to every message it posts.
const stage = (draft, message) => draft.stage({draftId: draft.id, draftRevision: draft.revision, ...message});
const decoded = (draft) => portable.validateSnapshot(draft.document);
const slotOf = (layoutIndex) => CHARYBDIS_4X6_LAYOUT_MATRIX[layoutIndex][0] * 6 + CHARYBDIS_4X6_LAYOUT_MATRIX[layoutIndex][1];
const reviewAreas = (draft) => draft.view({selectedDeviceId: "test-device", connected: true}).changes.map((change) => change.area);

test("a dropped profile's payload opens a review before an undoable draft replacement", async () => {
    const {portableControl} = require("../../core/session/panel-controls");
    const {routeMessage} = require("../../core/session/panel-session");
    const draft = session(), before = draft.document;
    const incoming = structuredClone(before);
    editLayers(incoming, layers => layers[0][0] = 5);
    const state = {selectedDeviceId: "test-device", connected: true, capabilities};
    const panel = {draft, service: {snapshot: () => state}};
    const payload = {...edits.reviewPortableProfile(JSON.stringify(incoming), "777.charybdis.json"),
        draftId: draft.id, draftRevision: draft.revision};
    assert.equal(routeMessage(panel, payload, state), "portable");
    await portableControl(panel, payload);
    assert.equal(panel.portableReview.fileName, "777.charybdis.json");
    assert.deepEqual(draft.document, before, "opening review leaves the draft untouched");
    await portableControl(panel, {type: "restorePortableProfile"});
    assert.equal(profileLayers(draft.document)[0][0], 5);
    draft.undo(draft.revision);
    assert.deepEqual(draft.document, before);
});

// ── layout keys ─────────────────────────────────────────────────────────

test("a key picked in the interface lands at its position on the layer the board was showing", () => {
    const draft = session();
    const before = profileLayers(draft.document).map((layer) => layer.slice());
    stage(draft, edits.setKey("Layer 3", 27, "KC_B"));
    assert.equal(profileLayers(draft.document)[3][slotOf(27)], 0x05, "KC_B at matrix row/column of layout index 27");
    profileLayers(draft.document).forEach((layer, index) => {
        const changed = layer.filter((code, slot) => code !== before[index][slot]).length;
        assert.equal(changed, index === 3 ? 1 : 0, `layer ${index}`);
    });
    assert.deepEqual(reviewAreas(draft), ["Keys"], "the change is reviewable before it is applied");
});

test("Delete stores the key as transparent, and nothing else moves", () => {
    const draft = session();
    stage(draft, edits.setKey("Layer 2", 27, "KC_B"));
    const before = profileLayers(draft.document)[2].slice();
    stage(draft, edits.clearKey("Layer 2", 27));
    const after = profileLayers(draft.document)[2];
    assert.deepEqual(after.map((code, slot) => code !== before[slot] ? slot : -1).filter((slot) => slot >= 0), [slotOf(27)]);
    assert.equal(after[slotOf(27)], 1, "KC_TRANSPARENT");
});

test("a modifier around a macro or pointing key is refused, not stored as another keycode", () => {
    const draft = session();
    const before = profileLayers(draft.document)[0].slice();
    // the picker builds Cmd + VIA macro 3 as G(VIA_MACRO_3)
    const picked = edits.pickerExpression({keys: ["VIA_MACRO_3"], mods: ["G"]});
    assert.equal(picked, "G(VIA_MACRO_3)");
    for (const keycode of [picked, "C(PD_SLOT_0)", "LOCK_LAYER(16)", "LT(60, 0x00)"]) {
        assert.throws(() => stage(draft, edits.setKey("Layer 0", 3, keycode)), /Cannot represent/, keycode);
    }
    assert.deepEqual(profileLayers(draft.document)[0], before);
    assert.equal(draft.dirty, false);
});

test("swapping two keys is one message and one draft step", () => {
    const draft = session();
    stage(draft, edits.setKey("Layer 1", 0, "KC_A"));
    stage(draft, edits.setKey("Layer 1", 1, "KC_B"));
    const before = profileLayers(draft.document)[1].slice();
    stage(draft, edits.swapKeys("Layer 1", {layoutIndex: 0, keycode: "KC_A"}, {layoutIndex: 1, keycode: "KC_B"}));
    assert.equal(profileLayers(draft.document)[1][slotOf(0)], 0x05);
    assert.equal(profileLayers(draft.document)[1][slotOf(1)], 0x04);
    draft.undo(draft.revision);
    assert.deepEqual(profileLayers(draft.document)[1], before, "one undo takes both keys back");
});

test("an edit from a stale form is refused rather than silently rebased", () => {
    const draft = session();
    assert.throws(() => draft.stage({draftId: draft.id, draftRevision: draft.revision + 5, ...edits.setKey("Layer 0", 0, "KC_B")}), /draft changed/i);
});

test("the picker posts layer keys by index, and wraps the key in modifiers and LT", () => {
    const draft = session();
    assert.equal(edits.pickerExpression({keys: ["MO(1)"]}), "MO(1)");
    assert.equal(edits.pickerExpression({keys: ["KC_A"], mods: ["C", "S"]}), "S(C(KC_A))");
    assert.equal(edits.pickerExpression({keys: ["KC_A"], layerTap: "2"}), "LT(2, KC_A)");
    assert.equal(edits.pickerExpression({keys: ["KC_A", "KC_B"], mode: "list"}), "KC_A, KC_B");
    assert.equal(edits.pickerExpression({keys: []}), "");
    for (const keycode of ["MO(1)", "LOCK_LAYER(1)", edits.pickerExpression({keys: ["KC_A"], layerTap: "2"}),
        edits.pickerExpression({keys: ["KC_A"], mods: ["C", "S"]})]) {
        stage(draft, edits.setKey("Layer 0", 5, keycode));
    }
    assert.equal(profileLayers(draft.document)[0][slotOf(5)], 0x0304, "C(S(KC_A))");
});

// ── keyboard shortcuts ──────────────────────────────────────────────────

test("undo and redo belong to the draft except inside text, a recording or a prompt", () => {
    const key = (name, mods = {}) => ({key: name, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...mods});
    assert.equal(edits.historyAction(key("z", {metaKey: true})), "undo");
    assert.equal(edits.historyAction(key("Z", {metaKey: true, shiftKey: true})), "redo");
    assert.equal(edits.historyAction(key("y", {ctrlKey: true})), "redo");
    assert.equal(edits.historyAction(key("z")), null, "no modifier");
    assert.equal(edits.historyAction(key("z", {metaKey: true, altKey: true})), null);
    assert.equal(edits.historyAction(key("z", {metaKey: true}), {editingText: true}), null, "a text field keeps its own undo");
    assert.equal(edits.historyAction(key("z", {metaKey: true}), {busy: true}), null);
});

test("copy, paste and delete on the board are told apart from everything else", () => {
    const key = (name, mods = {}) => ({key: name, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...mods});
    assert.equal(edits.keyAction(key("c", {metaKey: true})), "copy");
    assert.equal(edits.keyAction(key("v", {ctrlKey: true})), "paste");
    assert.equal(edits.keyAction(key("Delete")), "clear");
    assert.equal(edits.keyAction(key("Backspace")), "clear");
    assert.equal(edits.keyAction(key("Backspace", {metaKey: true})), null);
    assert.equal(edits.keyAction(key("v", {metaKey: true, shiftKey: true})), null);
    assert.equal(edits.keyAction(key("c")), null);
});

// ── key behaviours ──────────────────────────────────────────────────────

test("a behaviour row posted as the editor builds it is accepted whole", () => {
    const draft = session();
    // the fixture already has an Escape row; the editor saves it whole
    const behaviour = {keycode: "KC_ESCAPE", tapHoldTerm: 0, longerHoldTerm: 0, multiTapTerm: 0, keepsAutoMouseAnchored: false,
        steps: [{tapCount: 0, tap: {helper: "TAP_SENDS", action: "KC_ESCAPE"}}]};
    const change = {tapCount: 0, kind: "hold", branch: edits.cellBranch("hold", {action: "KC_LSFT", helper: "PRESS_AND_HOLD_UNTIL_RELEASE"})};
    stage(draft, edits.saveBehaviour(behaviour, {terms: {tapHoldTerm: "175", longerHoldTerm: ""}, change}, draft.identity()));
    const row = decoded(draft).behaviors.rows.find((entry) => entry.target.kind === 1 && entry.target.operand === 0x29);
    assert.equal(row.tapHoldTerm, 175);
    assert.equal(row.longerHoldTerm, 0, "an empty timing field means the keyboard default");
    assert.equal(row.steps[0].hold.mode, 1);
    assert.ok(reviewAreas(draft).includes("Behaviours"));
});

test("choosing repeat while held posts a rate the keyboard accepts", () => {
    assert.deepEqual(edits.cellBranch("hold", {action: "KC_RIGHT", helper: "REPEAT_WHILE_HELD", repeatHz: ""}),
        {helper: "REPEAT_WHILE_HELD", action: "KC_RIGHT", repeatHz: edits.DEFAULT_REPEAT_HZ});
    assert.equal(edits.cellBranch("hold", {action: "KC_RIGHT", helper: "TAP_AT_HOLD_THRESHOLD", repeatHz: "30"}).repeatHz, "0");
    assert.equal(edits.cellBranch("tap", {action: " "}), null, "an empty cell removes the tier");
    const draft = session();
    const behaviour = {keycode: "KC_Q", steps: [{tapCount: 0, tap: {helper: "TAP_SENDS", action: "KC_Q"}}]};
    stage(draft, edits.saveBehaviour(behaviour, {change: {tapCount: 0, kind: "hold",
        branch: edits.cellBranch("hold", {action: "KC_RIGHT", helper: "REPEAT_WHILE_HELD", repeatHz: ""})}}, draft.identity()));
    const row = decoded(draft).behaviors.rows.find((entry) => entry.target.operand === 0x14);
    assert.equal(row.steps[0].hold.repeatHz, Number(edits.DEFAULT_REPEAT_HZ));
});

test("how an empty cell runs is held until it sends something, then posted with it", () => {
    assert.deepEqual(edits.cellEdit("hold", {stored: false, action: "", helper: "REPEAT_WHILE_HELD", repeatHz: "30"}),
        {pending: {helper: "REPEAT_WHILE_HELD", repeatHz: "30"}}, "an empty cell posts nothing the keyboard would drop");
    assert.deepEqual(edits.cellEdit("hold", {stored: false, action: "KC_RIGHT", helper: "REPEAT_WHILE_HELD", repeatHz: "30"}),
        {branch: {helper: "REPEAT_WHILE_HELD", action: "KC_RIGHT", repeatHz: "30"}}, "the first action carries the held choice");
    assert.deepEqual(edits.cellEdit("hold", {stored: true, action: " ", helper: "TAP_AT_HOLD_THRESHOLD"}),
        {branch: null}, "emptying a stored cell still removes the tier");
    assert.deepEqual(edits.cellEdit("tap", {stored: false, action: ""}), {pending: null}, "a tap tier has no helper to hold");
});

test("a behaviour row is added by a key's first action, and deleted again", () => {
    const draft = session();
    const rows = () => decoded(draft).behaviors.rows.length;
    const before = rows();
    stage(draft, edits.saveBehaviour({keycode: "KC_Q", stored: false, steps: []}, {change: {tapCount: 0, kind: "tap", branch: {helper: "TAP_SENDS", action: "KC_A"}}}, draft.identity()));
    assert.equal(rows(), before + 1);
    stage(draft, edits.deleteBehaviour("KC_Q", draft.identity()));
    assert.equal(rows(), before);
});

test("an edit that leaves a stored row changing nothing removes it, and Undo brings it back", () => {
    const draft = session();
    const rows = () => decoded(draft).behaviors.rows.filter(entry => entry.target.kind === 1 && entry.target.operand === 0x14);
    const branch = {helper: "TAP_SENDS", action: "KC_A"};
    stage(draft, edits.saveBehaviour({keycode: "KC_Q", stored: false, steps: []}, {change: {tapCount: 0, kind: "tap", branch}}, draft.identity()));
    const stored = {keycode: "KC_Q", stored: true, timingAlone: false, steps: [{tapCount: 0, tap: branch}]};
    const cleared = edits.saveBehaviour(stored, {change: {tapCount: 0, kind: "tap", branch: null}}, draft.identity());
    assert.equal(cleared?.type, "deleteBehavior", "its last branch gone, nothing is left");
    stage(draft, cleared);
    assert.equal(rows().length, 0);
    assert.equal(draft.history[draft.cursor].label, "Removed a behaviour");
    draft.undo(draft.revision);
    assert.equal(rows().length, 1, "undo brings the row back");
    // On a plain key a timing alone does nothing, so a row left with only one goes too.
    const timed = {...stored, tapHoldTerm: "120"};
    assert.equal(edits.saveBehaviour(timed, {change: {tapCount: 0, kind: "tap", branch: null}}, draft.identity())?.type, "deleteBehavior");
    // Its switch and layers gate only what it holds.
    assert.equal(edits.saveBehaviour({...stored, steps: []}, {enabled: false, allowedLayers: 1}, draft.identity())?.type, "deleteBehavior");
    // What keeps a row: a branch, the anchor on any key, a timing on a key the keyboard handles anyway.
    assert.equal(edits.saveBehaviour({...stored, steps: []}, {anchored: true}, draft.identity())?.type, "saveBehavior");
    assert.equal(edits.saveBehaviour({...stored, steps: [], timingAlone: true}, {terms: {tapHoldTerm: "120"}}, draft.identity())?.type, "saveBehavior");
    // A key without a row gets none.
    assert.equal(edits.saveBehaviour({...stored, stored: false, steps: []}, {terms: {tapHoldTerm: "120"}}, draft.identity()), null);
});

test("the editor removes exactly the rows the core's review notes as changing nothing", () => {
    const {changesNothing} = require("../../core/model/inert-behaviors");
    const {nativeCode} = require("../../core/schema/actions");
    const {resolveNativeQmkExpression} = require("../../core/schema/compiled-profile-v1");
    const model = buildSnapshotModel(session().current, capabilities, {editable: true, reason: ""});
    // Keys this profile holds, which the core publishes defaults for.
    for (const keycode of ["KC_ENTER", "LGUI(KC_C)", "VIA_MACRO_10", "LT(3,KC_SLASH)", "OSM(MOD_LSFT)", "MO(3)", "LOCK_LAYER(3)", "PD_SLOT_0", "PD_SLOT_0_LOCK", "CUSTOM_KEY_0"]) {
        const row = behaviourEditorRow(model, keycode);
        assert.ok(row, keycode);
        for (const fields of [{}, {terms: {tapHoldTerm: "120"}}, {terms: {multiTapTerm: "90"}}, {anchored: true}, {enabled: false}]) {
            const terms = {tapHoldTerm: "0", longerHoldTerm: "0", multiTapTerm: "0", ...fields.terms};
            const posted = edits.saveBehaviour({...row, ...terms, stored: true, steps: []}, fields, null);
            // The same row stored as it is, for the core's rule to judge.
            const draft = session();
            stage(draft, {type: "saveBehavior", behavior: {keycode: row.keycode, steps: [], ...terms,
                keepsAutoMouseAnchored: Boolean(fields.anchored), enabled: fields.enabled ?? true, allowedLayers: 0xffff}});
            const value = decoded(draft);
            const code = require("../../core/data/keycode-catalog").encode(row.keycode) ?? resolveNativeQmkExpression(row.keycode, {});
            const saved = value.behaviors.rows.find(entry => nativeCode(entry.target) === code);
            assert.ok(saved, `${keycode} is stored`);
            assert.equal(posted?.type === "deleteBehavior", changesNothing(saved, value.settings.customKeyShortcuts), `${keycode} ${JSON.stringify(fields)}`);
        }
    }
});

test("new behaviour rows preserve built-in actions, including LT targets", () => {
    for (const [keycode, operand] of [["LT(3,KC_F)", 0x4309], ["MT(MOD_LCTL,KC_F)", 0x2109], ["MO(3)", 0x5223]]) {
        const draft = session();
        const row = () => decoded(draft).behaviors.rows.find(entry => entry.target.kind === 1 && entry.target.operand === operand
            || keycode === "MO(3)" && entry.target.kind === 2 && entry.target.operand === 3);
        stage(draft, edits.saveBehaviour({keycode, steps: []}, {terms: {tapHoldTerm: "177"}}, draft.identity()));
        assert.equal(row().tapHoldTerm, 177, "timing-only edits keep the target valid");
        assert.deepEqual(row().steps, []);
        assert.throws(() => stage(draft, edits.saveBehaviour({keycode, steps: []}, {change: {
            tapCount: 0, kind: "tap", branch: {helper: "TAP_SENDS", action: "LT(3,KC_F)"},
        }}, draft.identity())), /makes its own tap\/hold decision/, "LT is still refused as an authored action");
    }
});

test("a custom key on no layer gets its behaviour row from the Custom keys screen's first edit", () => {
    const draft = session();
    const slot = 5;
    const isRow = (entry) => entry.target.kind === 7 && entry.target.operand === slot;
    assert.ok(!profileLayers(draft.document).some((layer) => layer.includes(customKeyCode(slot))), "CUSTOM_KEY_5 is on no layer");
    assert.ok(!decoded(draft).behaviors.rows.some(isRow));
    const row = behaviourEditorRow({behaviorTimingDefaults: {tapHoldTerm: "150", longerHoldTerm: "400", multiTapTerm: "150"}}, "CUSTOM_KEY_5");
    stage(draft, edits.saveBehaviour(row, {change: {tapCount: 0, kind: "long", branch: edits.cellBranch("long", {action: "KC_B", helper: "TAP_AT_HOLD_THRESHOLD"})}}, draft.identity()));
    const saved = decoded(draft).behaviors.rows.find(isRow);
    assert.ok(saved, "the row is stored for the unplaced custom key");
    assert.equal(saved.steps[0].longHold.action.operand, 0x05);
    assert.ok(reviewAreas(draft).includes("Behaviours"));
});

test("an unstored editor only creates a row after an action, a timing where one alone does something, or the anchor", () => {
    const timing = {tapHoldTerm: "150", longerHoldTerm: "400", multiTapTerm: "150"};
    const model = {behaviorTimingDefaults: timing, behaviorEditing: {keyDefaults: {
        KC_Q: {builtIn: {}, timing, timingAlone: false}, "LT(3,KC_F)": {builtIn: {}, timing, timingAlone: true}}}};
    // On a plain key a timing alone does nothing (firmware D-F27), so it makes no row.
    for (const terms of [{multiTapTerm: "777"}, {tapHoldTerm: "177"}, {longerHoldTerm: "477"}]) {
        assert.equal(edits.saveBehaviour(behaviourEditorRow(model, "KC_Q"), {terms}, null), null, JSON.stringify(terms));
    }
    for (const [keycode, operand, change] of [
        ["LT(3,KC_F)", 0x4309, {terms: {multiTapTerm: "777"}}],
        ["LT(3,KC_F)", 0x4309, {terms: {tapHoldTerm: "177"}}],
        ["LT(3,KC_F)", 0x4309, {terms: {longerHoldTerm: "477"}}],
        ["KC_Q", 0x14, {anchored: true}],
        ["KC_Q", 0x14, {change: {tapCount: 0, kind: "tap", branch: {helper: "TAP_SENDS", action: "KC_A"}}}],
    ]) {
        const draft = session();
        const before = decoded(draft).behaviors.rows.length;
        const row = behaviourEditorRow(model, keycode);
        assert.equal(edits.saveBehaviour(row, {}, draft.identity()), null);
        const field = behaviourTimingField(row, "multiTapTerm");
        assert.equal(edits.saveBehaviour(row, {terms: {multiTapTerm: behaviourTimingEdit("150", field)}}, draft.identity()), null);
        assert.equal(edits.saveBehaviour(row, {change: {tapCount: 0, kind: "tap", branch: null}}, draft.identity()), null);
        if (row?.timingAlone) assert.throws(() => stage(draft, edits.saveBehaviour(row, {terms: {multiTapTerm: "0.0"}}, draft.identity())), /whole number/);
        assert.equal(draft.dirty, false);
        stage(draft, edits.saveBehaviour(row, change, draft.identity()));
        const saved = decoded(draft).behaviors.rows.find(entry => entry.target.kind === 1 && entry.target.operand === operand);
        assert.equal(decoded(draft).behaviors.rows.length, before + 1);
        assert.equal(saved.tapHoldTerm, Number(change.terms?.tapHoldTerm || 0));
        assert.equal(saved.longerHoldTerm, Number(change.terms?.longerHoldTerm || 0));
        assert.equal(saved.multiTapTerm, Number(change.terms?.multiTapTerm || 0));
        assert.equal(saved.keepsAutoMouseAnchored, Boolean(change.anchored));
        assert.equal(saved.steps.length, change.change ? 1 : 0);
        draft.undo(draft.revision);
        assert.equal(decoded(draft).behaviors.rows.length, before);
    }
});

test("a behaviour moves to another key, and overwrites or swaps with one already there", () => {
    const draft = session();
    const rows = () => decoded(draft).behaviors.rows.length;
    for (const keycode of ["KC_Q", "KC_W"]) stage(draft, edits.saveBehaviour({keycode, stored: false, steps: []}, {anchored: true}, draft.identity()));
    const before = rows();
    stage(draft, edits.retargetBehaviour("KC_Q", "KC_E", draft.identity()));
    assert.equal(rows(), before, "moving to a free key keeps the row count");
    assert.throws(() => stage(draft, edits.retargetBehaviour("KC_E", "KC_W", draft.identity())), /overwrite it or swap/);
    stage(draft, edits.retargetBehaviour("KC_E", "KC_W", draft.identity(), "swap"));
    assert.equal(rows(), before);
    stage(draft, edits.retargetBehaviour("KC_W", "KC_E", draft.identity(), "overwrite"));
    assert.equal(rows(), before - 1, "overwriting drops the row that was there");
    draft.undo(draft.revision);
    assert.equal(rows(), before, "one undo brings the overwritten row back");
});

// ── combos ──────────────────────────────────────────────────────────────

test("a keyboard that stores the combo timing keeps it without combos, and a new combo follows the default", () => {
    const draft = session();
    assert.deepEqual([decoded(draft).combos.defaultTermMs, decoded(draft).combos.holdTermMs, decoded(draft).combos.rows.length], [50, 200, 0]);
    stage(draft, edits.comboMessage(null, {inputs: ["KC_D", "KC_F"], output: "KC_ESCAPE", termMs: ""}));
    const combos = decoded(draft).combos;
    assert.equal(combos.rows.length, 1);
    assert.equal(combos.rows[0].termMs, null, "an empty window follows the default");
    assert.equal(combos.holdTermMs, 200);
    stage(draft, edits.comboMessage(0, {inputs: ["KC_D", "KC_F"], output: "KC_ESCAPE", termMs: "65"}));
    assert.equal(decoded(draft).combos.rows[0].termMs, 65);
    stage(draft, edits.comboMessage(0, {inputs: ["KC_D", "KC_F"], output: "KC_ESCAPE", termMs: "65", followsDefault: true}));
    assert.equal(decoded(draft).combos.rows[0].termMs, null, "Use default drops the combo's own window");
});

test("the default window and the hold threshold are each their own message, set with or without combos", () => {
    const draft = session();
    stage(draft, edits.comboHoldTerm("275"));
    stage(draft, edits.comboDefaultWindow("70"));
    assert.deepEqual([decoded(draft).combos.defaultTermMs, decoded(draft).combos.holdTermMs], [70, 275]);
    for (const [inputs, output] of [[["KC_D", "KC_F"], "KC_ESCAPE"], [["KC_J", "KC_K"], "KC_TAB"]]) {
        stage(draft, edits.comboMessage(null, {inputs, output, termMs: ""}));
    }
    stage(draft, edits.comboDefaultWindow("45"));
    assert.deepEqual(draft.combos().rows.map((row) => [row.termMs, row.followsDefault]), [[45, true], [45, true]],
        "the combos that follow the default run with its new value");
    assert.throws(() => stage(draft, edits.comboDefaultWindow("0")), /at least 1 ms/);
});

test("a combo is edited and deleted by the id the interface holds", () => {
    const draft = session();
    stage(draft, edits.comboMessage(null, {inputs: ["KC_D", "KC_F"], output: "KC_ESCAPE", termMs: "50", holdTermMs: "200"}));
    stage(draft, edits.comboMessage(0, {inputs: ["KC_D", "KC_F"], output: " KC_TAB ", termMs: "40", holdTermMs: "200", mustHold: true, ordered: true}));
    const saved = decoded(draft).combos.rows[0];
    assert.equal(saved.termMs, 40);
    assert.equal(saved.output.operand, 0x2b, "the output is trimmed and encoded");
    assert.equal(saved.mustHold, true);
    assert.equal(saved.ordered, true);
    stage(draft, edits.deleteCombo(0));
    assert.deepEqual(decoded(draft).combos.rows, []);
});

// ── lighting ────────────────────────────────────────────────────────────

test("a colour changed in Lighting is staged as the keyboard stores it", () => {
    const draft = session();
    stage(draft, edits.layerColour("Layer 3", "KEYS_MAPPED_ON_THIS_LAYER_ONLY", {h: 60, s: 255, v: 200}));
    const row = decoded(draft).rgb.layerColors.find((entry) => entry.layerId === 3);
    assert.deepEqual(row.color, {h: 60, s: 255, v: 200});
    assert.ok(reviewAreas(draft).includes("Lighting"));
    const tooBright = session();
    assert.throws(() => stage(tooBright, edits.layerColour("Layer 3", "KEYS_MAPPED_ON_THIS_LAYER_ONLY", {h: 60, s: 255, v: 201})),
        /Brightness must be between 0 and 200/);
});

test("switching a stage off is a mask edit that lands as that mask", () => {
    const draft = session();
    const mask = decoded(draft).rgb.stageEnableMask;
    const bit = 1;
    stage(draft, edits.rgbStages(mask, bit, false));
    assert.equal(decoded(draft).rgb.stageEnableMask, mask & ~bit);
    stage(draft, edits.rgbStages(mask & ~bit, bit, true));
    assert.equal(decoded(draft).rgb.stageEnableMask, mask | bit);
});

test("a pointing-mode colour keeps the locality posted beside it", () => {
    const draft = session();
    stage(draft, edits.pdModeColour("PD_MODE_DRAGSCROLL", "RGB_BOTH_HALVES", {h: 21, s: 255, v: 180}));
    const row = decoded(draft).rgb.pdModeColors.find((entry) => entry.pdModeId === 0);
    assert.equal(row.locality, RGB_LOCALITIES.RGB_BOTH_HALVES);
    assert.deepEqual(row.color, {h: 21, s: 255, v: 180});
});

test("key feedback posts the whole record with one colour or policy replaced", () => {
    const draft = session();
    // the screen redraws from the new model after each edit, so each message
    // is built from the record as it stands then
    const feedback = () => buildSnapshotModel(draft.current, draft.capabilities, {editable: true, reason: ""}).rgb.keyBehaviorFeedback;
    stage(draft, edits.keyFeedback(feedback(), "holdActiveColor", {h: 99, s: 255, v: 150}));
    stage(draft, edits.keyFeedback(feedback(), "branch:0", {h: 12, s: 200, v: 100}));
    const stored = decoded(draft).rgb.keyFeedback;
    assert.deepEqual(stored.holdActiveColor, {h: 99, s: 255, v: 150});
    assert.deepEqual(stored.tapBranchColors[0], {h: 12, s: 200, v: 100});
    stage(draft, edits.keyFeedback(feedback(), null, null, {locality: "RGB_BOTH_HALVES"}));
    assert.deepEqual(decoded(draft).rgb.keyFeedback.holdActiveColor, {h: 99, s: 255, v: 150}, "and earlier edits survive the next one");
    assert.equal(decoded(draft).rgb.keyFeedback.locality, RGB_LOCALITIES.RGB_BOTH_HALVES);
});

test("auto-mouse fade and combo feedback post their colour beside their mode", () => {
    const draft = session();
    stage(draft, edits.automouseFade("END_COLOR_WHERE_BASE_EFFECT_WOULD_SHOW", {h: 128, s: 255, v: 180}));
    stage(draft, edits.comboFeedback("RGB_KEYS_ONLY", {h: 32, s: 255, v: 200}));
    const rgb = decoded(draft).rgb, original = decoded(session()).rgb;
    assert.equal(rgb.automouseFade.endColor.h, 128);
    assert.notEqual(rgb.automouseFade.mode, original.automouseFade.mode, "the mode posted beside the colour is the one that lands");
    assert.equal(rgb.comboFeedback.color.h, 32);
    assert.equal(rgb.comboFeedback.locality, RGB_LOCALITIES.RGB_KEYS_ONLY);
});

test("LED group rows land in every table, and groups renumber when one is deleted", () => {
    const draft = session();
    const rgb = () => decoded(draft).rgb;
    const ledsOf = (id) => rgb().groups.find((group) => group.id === id).leds;
    const startCount = rgb().groups.length;
    const colour = {h: 10, s: 255, v: 100};
    for (const [target, owner] of [["layer", "Layer 2"], ["pdMode", "PD_MODE_VOLUME"], ["combo", "ignored"], ["keyBehavior", "KEY_FEEDBACK_GROUP_HOLD_ACTIVE"]]) {
        stage(draft, edits.ledRow({target, owner, source: ""}, [1, 2], colour));
    }
    assert.equal(rgb().groups.length, startCount + 1, "rows with the same LEDs share one group");
    assert.equal(edits.ledRow({target: "combo", owner: "x", source: ""}, [1], colour).group.owner, undefined, "a combo row has no owner");

    for (const leds of [[40], [41], [42]]) stage(draft, edits.saveLedGroup(leds));
    const byLeds = (leds) => rgb().groups.find((group) => group.leds.join() === leds.join()).id;
    stage(draft, edits.ledRow({target: "layer", owner: "Layer 3", source: `Group ${byLeds([42])}`}, [], {h: 1, s: 1, v: 1}));
    stage(draft, edits.deleteLedGroup(`Group ${byLeds([40])}`));
    const ids = rgb().groups.map((group) => group.id);
    assert.deepEqual(ids, ids.map((_, index) => index), "ids stay consecutive from zero");
    const layerRow = rgb().layerGroupRows.find((row) => row.selector === 3);
    assert.deepEqual(ledsOf(layerRow.groupId), [42], "a row still paints the LEDs it pointed at");
    const before = rgb().layerGroupRows.length;
    stage(draft, edits.deleteLedRow("layer", before - 1));
    assert.equal(rgb().layerGroupRows.length, before - 1);
});

// ── macros ──────────────────────────────────────────────────────────────

test("a macro payload is posted as the text the keyboard stores", () => {
    const draft = session();
    stage(draft, edits.macroMessage("VIA_MACRO_0", "hello{120}{KC_ENT}", draft.current.fingerprint));
    assert.equal(draft.dirty, true);
    assert.ok(reviewAreas(draft).includes("Macros"));
    assert.throws(() => stage(draft, edits.macroMessage("VIA_MACRO_0", "{KC_A", draft.current.fingerprint)),
        /macro command|}/i, "a payload the keyboard cannot parse is refused");
});

test("a macro name is posted without its steps, and review shows the rename", () => {
    const draft = session();
    stage(draft, edits.macroMessage("VIA_MACRO_5", "hello", draft.current.fingerprint));
    const before = profileMacros(decoded(draft).document)[5];
    const message = edits.macroNameMessage("VIA_MACRO_5", "  Sign-off ", draft.current.fingerprint);
    assert.deepEqual(Object.keys(message).sort(), ["expectedFingerprint", "keycode", "name", "type"], "no payload travels with a rename");
    stage(draft, message);
    const after = decoded(draft);
    assert.equal(after.settings.macroNames[5], "Sign-off");
    assert.equal(profileMacros(after.document)[5], before, "the steps are untouched");
    assert.ok(draft.view({selectedDeviceId: "test-device", connected: true}).changes.some((change) => change.unit === "macro:5" && change.fields.some((field) => field.label === "Name" && field.after === "Sign-off")));
});

test("a custom key's name is posted trimmed against the draft it was read from, and review shows the rename", () => {
    const draft = session(), read = draft.current.fingerprint, layers = profileLayers(draft.document);
    const message = edits.customKeyNameMessage("CUSTOM_KEY_2", "  Click Spam ", read);
    assert.deepEqual(message, {type: "updateCustomKey", keycode: "CUSTOM_KEY_2", name: "Click Spam", expectedFingerprint: read});
    stage(draft, message);
    assert.equal(decoded(draft).settings.customKeyNames[2], "Click Spam");
    assert.deepEqual(profileLayers(draft.document), layers, "a name moves no key");
    const view = draft.view({selectedDeviceId: "test-device", connected: true});
    assert.ok(view.changes.some((change) => change.unit === "customKey:2" && change.fields.some((field) => field.label === "Name" && field.after === "Click Spam")));
    assert.equal(view.undoLabel, "Renamed a custom key");
    assert.throws(() => stage(draft, edits.customKeyNameMessage("CUSTOM_KEY_3", "Late", read)), /keyboard changed/, "a form read before the last edit is refused");
    stage(draft, edits.customKeyNameMessage("CUSTOM_KEY_3", "Thumb"));
    assert.equal(decoded(draft).settings.customKeyNames[3], "Thumb", "a form that names no identity is checked against this revision");
    assert.throws(() => stage(draft, edits.customKeyNameMessage("CUSTOM_KEY_128", "Gone", draft.current.fingerprint)), /custom key the keyboard has/);
    draft.undo(draft.revision); draft.undo(draft.revision);
    assert.equal(decoded(draft).settings.customKeyNames[2], "");
});

test("a custom key's shortcut is posted as a mask and a key, reviewed, undone and redone", () => {
    const draft = session(), read = draft.current.fingerprint, layers = profileLayers(draft.document);
    const message = edits.customKeyShortcutMessage("CUSTOM_KEY_2", 0x41, 0x0e, read);
    assert.deepEqual(message, {type: "updateCustomKeyShortcut", keycode: "CUSTOM_KEY_2", shortcut: {mods: 0x41, key: 0x0e}, expectedFingerprint: read});
    stage(draft, message);
    assert.deepEqual(decoded(draft).settings.customKeyShortcuts[2], {mods: 0x41, key: 0x0e});
    assert.deepEqual(profileLayers(draft.document), layers, "a shortcut moves no key");
    const view = draft.view({selectedDeviceId: "test-device", connected: true});
    assert.ok(view.changes.some((change) => change.unit === "customKey:2" && change.fields.some((field) => field.label === "Shortcut" && field.after === "Left Ctrl + Right Alt + K")));
    assert.equal(view.undoLabel, "Changed a custom key's shortcut");
    stage(draft, edits.customKeyShortcutMessage("CUSTOM_KEY_2", 0x0f, 0));
    assert.deepEqual(decoded(draft).settings.customKeyShortcuts[2], {mods: 0x0f, key: 0}, "modifiers alone");
    stage(draft, edits.customKeyShortcutMessage("CUSTOM_KEY_2", 0, 0));
    assert.deepEqual(decoded(draft).settings.customKeyShortcuts[2], {mods: 0, key: 0}, "cleared");
    assert.throws(() => stage(draft, edits.customKeyShortcutMessage("CUSTOM_KEY_2", 0, 0xe0)), /plain key or mouse button/, "a modifier key belongs in the mask");
    draft.undo(draft.revision);
    assert.deepEqual(decoded(draft).settings.customKeyShortcuts[2], {mods: 0x0f, key: 0});
    draft.redo(draft.revision);
    assert.deepEqual(decoded(draft).settings.customKeyShortcuts[2], {mods: 0, key: 0});
});

test("a custom key made for a shortcut no keycode holds is named and placed in one draft step", () => {
    const draft = session();
    const before = draft.document;
    const message = edits.customKeyForShortcut("CUSTOM_KEY_9", {mods: 0x88, key: 0}, " Left GUI + Right GUI ", edits.setKey("Layer 0", 27, "CUSTOM_KEY_9"), draft.current.fingerprint);
    assert.deepEqual(message, {type: "updateCustomKeyShortcut", keycode: "CUSTOM_KEY_9", shortcut: {mods: 0x88, key: 0}, expectedFingerprint: draft.current.fingerprint,
        name: "Left GUI + Right GUI", then: {type: "updateLayoutKeys", layer: "Layer 0", changes: [{layoutIndex: 27, keycode: "CUSTOM_KEY_9"}]}});
    stage(draft, message);
    const after = decoded(draft);
    assert.deepEqual(after.settings.customKeyShortcuts[9], {mods: 0x88, key: 0}, "both GUIs, no key");
    assert.equal(after.settings.customKeyNames[9], "Left GUI + Right GUI");
    assert.equal(profileLayers(draft.document)[0][slotOf(27)], customKeyCode(9), "placed on the key the picker was for");
    assert.equal(draft.view({selectedDeviceId: "test-device", connected: true}).undoLabel, "Made a custom key for a shortcut");
    draft.undo(draft.revision);
    assert.deepEqual(draft.document, before, "one undo takes back the key, its name and its shortcut");
    assert.throws(() => stage(draft, edits.customKeyForShortcut("CUSTOM_KEY_9", {mods: 0x88, key: 0}, "", edits.setKey("Layer 99", 27, "CUSTOM_KEY_9"))), /layer/, "a bad placement refuses the whole step");
    assert.deepEqual(draft.document, before);
});

test("a custom key made for a behaviour cell's shortcut is sent by that cell in the same step", () => {
    const draft = session();
    const before = draft.document;
    const behaviour = {keycode: "KC_Q", steps: []};
    const then = edits.saveBehaviour(behaviour, {change: {tapCount: 0, kind: "hold", branch: edits.cellBranch("hold", {action: "CUSTOM_KEY_9", helper: "PRESS_AND_HOLD_UNTIL_RELEASE"})}}, draft.identity());
    stage(draft, edits.customKeyForShortcut("CUSTOM_KEY_9", {mods: 0x11, key: 0}, "Left Ctrl + Right Ctrl", /** @type {any} */ (then)));
    const after = decoded(draft);
    assert.deepEqual(after.settings.customKeyShortcuts[9], {mods: 0x11, key: 0});
    const row = after.behaviors.rows.find((entry) => entry.target.operand === 0x14);
    assert.deepEqual([row.steps[0].hold.action.kind, row.steps[0].hold.action.operand], [7, 9], "the hold sends the custom key");
    draft.undo(draft.revision);
    assert.deepEqual(draft.document, before, "one undo takes back both");
    // Without a following edit the key is only named and given the shortcut.
    stage(draft, edits.customKeyForShortcut("CUSTOM_KEY_9", {mods: 0x11, key: 0}, "Left Ctrl + Right Ctrl"));
    assert.deepEqual(decoded(draft).settings.customKeyShortcuts[9], {mods: 0x11, key: 0});
    assert.deepEqual(profileLayers(draft.document), profileLayers(before));
    assert.throws(() => stage(draft, {...edits.customKeyForShortcut("CUSTOM_KEY_8", {mods: 0x11, key: 0}, ""), then: /** @type {any} */ ({type: "renameKeyboard", name: "x"})}),
        /goes on a key, in a behaviour or in a combo/, "only a layout key, a behaviour or a combo follows");
});

test("a combo kept with the custom key its output picker offered makes both in one draft step", () => {
    const draft = session();
    const before = draft.document;
    const made = {keycode: "CUSTOM_KEY_9", shortcut: {mods: 0x11, key: 0}, name: "Left Ctrl + Right Ctrl"};
    const combo = edits.comboMessage(null, {output: "CUSTOM_KEY_9", inputs: ["KC_A", "KC_B"], termMs: "50", followsDefault: false, holdTermMs: "200"});
    const message = edits.comboKept(combo, made, draft.current.fingerprint);
    assert.deepEqual(message, {type: "updateCustomKeyShortcut", keycode: "CUSTOM_KEY_9", shortcut: {mods: 0x11, key: 0},
        expectedFingerprint: draft.current.fingerprint, name: "Left Ctrl + Right Ctrl", then: combo});
    const combos = decoded(draft).combos.rows.length;
    stage(draft, message);
    const after = decoded(draft);
    assert.deepEqual(after.settings.customKeyShortcuts[9], {mods: 0x11, key: 0});
    assert.equal(after.combos.rows.length, combos + 1);
    assert.deepEqual([after.combos.rows.at(-1).output.kind, after.combos.rows.at(-1).output.operand], [7, 9], "the combo sends the custom key");
    assert.equal(draft.view({selectedDeviceId: "test-device", connected: true}).undoLabel, "Made a custom key for a shortcut");
    draft.undo(draft.revision);
    assert.deepEqual(draft.document, before, "one undo takes back the key and the combo");
    // Without an offer taken, or once the output is something else, the
    // combo is kept on its own and no key is made.
    assert.deepEqual(edits.comboKept(combo, null), combo);
    const other = edits.comboMessage(null, {output: "KC_E", inputs: ["KC_A", "KC_B"], termMs: "50", followsDefault: false, holdTermMs: "200"});
    assert.deepEqual(edits.comboKept(other, made), other);
    const edited = edits.comboMessage(0, {output: "CUSTOM_KEY_9", inputs: ["KC_A", "KC_B"], termMs: "50", followsDefault: false, holdTermMs: "200"});
    assert.equal(edits.comboKept(edited, made).then, edited, "an edited combo takes the key too");
});

test("the keyboard's name is posted trimmed against the draft it was read from, and review shows the rename", () => {
    const draft = session(), read = draft.current.fingerprint, layers = profileLayers(draft.document);
    const message = edits.keyboardNameMessage("  Noah’s Charybdis ", read);
    assert.deepEqual(message, {type: "renameKeyboard", name: "Noah’s Charybdis", expectedFingerprint: read});
    stage(draft, message);
    assert.equal(decoded(draft).settings.keyboardName, "Noah’s Charybdis");
    assert.deepEqual(profileLayers(draft.document), layers, "a name moves no key");
    const view = draft.view({selectedDeviceId: "test-device", connected: true});
    assert.ok(view.changes.some((change) => change.unit === "keyboardName" && change.fields.some((field) => field.label === "Name" && field.before === "built-in name" && field.after === "Noah’s Charybdis")));
    assert.equal(view.undoLabel, "Renamed the keyboard");
    assert.throws(() => stage(draft, edits.keyboardNameMessage("Late", read)), /keyboard changed/, "a form read before the last edit is refused");
    assert.throws(() => stage(draft, edits.keyboardNameMessage("x".repeat(33), draft.current.fingerprint)), /32 bytes/, "more than 32 bytes is refused");
    assert.throws(() => stage(draft, edits.keyboardNameMessage("a\u0007b")), /control characters/);
    stage(draft, edits.keyboardNameMessage(""));
    assert.equal(decoded(draft).settings.keyboardName, "", "an empty name gives back the built-in one");
    draft.undo(draft.revision);
    assert.equal(decoded(draft).settings.keyboardName, "Noah’s Charybdis");
});

test("a macro left holding a key is refused, and macro and custom keys land as the keyboard's own values", () => {
    const draft = session();
    assert.throws(() => stage(draft, edits.macroMessage("VIA_MACRO_0", "{+KC_A}", draft.current.fingerprint)), /Release/);
    stage(draft, edits.layoutKeys("Layer 0", [{layoutIndex: 0, keycode: "VIA_MACRO_63"}, {layoutIndex: 1, keycode: "CUSTOM_KEY_15"}]));
    assert.equal(profileLayers(draft.document)[0][slotOf(0)], 0x773f);
    assert.equal(profileLayers(draft.document)[0][slotOf(1)], 0x7f0f);
    assert.throws(() => stage(draft, edits.layoutKeys("Layer 0", [{layoutIndex: 1, keycode: "MACRO_15"}])), /Cannot represent/, "the retired user macros are gone");
});

test("a recorded take appends to what the payload held, with no pause before the first key", () => {
    const payload = recordedTakePayload("{KC_H}", [
        {keycode: "KC_A", type: "keydown", time: 900}, {keycode: "KC_A", type: "keyup", time: 950},
        {keycode: "KC_B", type: "keydown", time: 1074}, {keycode: "KC_B", type: "keyup", time: 1124},
        {keycode: "KC_C", type: "keydown", time: 1144}, {keycode: "KC_C", type: "keyup", time: 1194},
    ], {threshold: 30, round: 10});
    assert.equal(payload, "{KC_H}{KC_A}{120}{KC_B}{KC_C}", "gaps under the threshold are dropped");
    const draft = session();
    stage(draft, edits.macroMessage("VIA_MACRO_1", payload, draft.current.fingerprint));
    assert.equal(draft.dirty, true);
});

// ── pointing modes ──────────────────────────────────────────────────────

// A form as ui/pointing.mjs registers it: one reader per drawn field.
const formOf = (values) => Object.fromEntries(Object.entries(values).map(([key, value]) => [key, () => value]));

test("a pointing slot is posted whole, with its shortcuts as names", () => {
    const draft = session();
    const slot = decoded(draft).pdModes[1];
    assert.equal(slot.kind, 1, "the fixture's slot 2 is directional");
    const config = readConfig({...slot, directions: {}}, formOf({kind: KIND.DIRECTIONAL, name: "Volume", dpi: "0", thresholdX: "0", thresholdY: "70",
        "dir:up": "KC_VOLU", "dir:down": "KC_VOLD"}));
    stage(draft, edits.pdMode(1, config, draft.identity()));
    const after = decoded(draft).pdModes[1];
    assert.equal(after.thresholdY, 70, "the edited threshold reached the profile");
    assert.ok(after.directions.up.keycode > 0, "and the named shortcut became the keyboard's own value");
});

test("a mouse-button override is set up kind first, and reaches the keyboard once it is complete", () => {
    const draft = session();
    const slot = decoded(draft).pdModes.find((candidate) => candidate.kind && candidate.buttons?.length);
    const base = {kind: slot.kind, name: slot.name, dpi: String(slot.dpi)};
    const post = (values) => {
        const settled = settleButtons(slot, readConfig(slot, formOf({...base, ...values})));
        stage(draft, edits.pdMode(slot.id, settled.config, draft.identity()));
        return settled.pending;
    };
    const stored = () => decoded(draft).pdModes[slot.id].buttons[0];
    assert.equal(slot.buttons[0].kind, BUTTON.PASS_THROUGH, "the fixture's first button passes through");

    const pending = post({"button:0:kind": BUTTON.TAP, "button:0:tap": "", name: "Renamed"});
    assert.equal(pending[0].kind, BUTTON.TAP, "a tap with no shortcut yet is held by the editor");
    assert.equal(stored().kind, BUTTON.PASS_THROUGH, "and the keyboard keeps the stored override meanwhile");
    assert.equal(decoded(draft).pdModes[slot.id].name, "Renamed", "while the rest of the record still lands");

    assert.deepEqual(post({"button:0:kind": BUTTON.TAP, "button:0:tap": "KC_C"}), {});
    assert.equal(stored().kind, BUTTON.TAP);
    assert.ok(stored().tap.keycode > 0, "the shortcut arrives with its kind");

    assert.deepEqual(post({"button:0:kind": BUTTON.HOLD_MODIFIERS, "button:0:modifiers": 0}), {0: {kind: BUTTON.HOLD_MODIFIERS, modifiers: 0, tap: {keycode: "0", modifierPolicy: 0, mask: 0}}},
        "holding no modifiers is not storable yet");
    post({"button:0:kind": BUTTON.HOLD_MODIFIERS, "button:0:modifiers": 2 | 128});
    assert.equal(stored().kind, BUTTON.HOLD_MODIFIERS);
    assert.equal(stored().modifiers, 2 | 128, "the switches reach the keyboard as its modifier mask");
    assert.equal(stored().tap.keycode, 0, "and the earlier shortcut is dropped rather than refused");

    post({"button:0:kind": BUTTON.PASS_THROUGH, "button:0:tap": "KC_C"});
    assert.deepEqual(stored(), {kind: BUTTON.PASS_THROUGH, modifiers: 0, tap: {keycode: 0, modifierPolicy: 0, mask: 0}},
        "pass through carries nothing it does not read");
});

test("a pointing mode picks its speed from the model's DPI list, and keeps a stored speed outside it", () => {
    const choices = buildDeviceModel({}).pdModeEditing.dpiChoices;
    const options = dpiOptions(choices, 400);
    assert.deepEqual(options.map(([value, label]) => ({value, label})), choices, "exactly the shared list");
    assert.deepEqual(options[0], [0, "Normal pointer speed"]);
    assert.deepEqual(dpiOptions(choices, 250).find(([dpi]) => dpi === 250), [250, "250 DPI · as stored"]);
    assert.deepEqual(dpiOptions(choices, 250).map(([dpi]) => dpi).slice(2, 5), [200, 250, 300], "in its place in the list");
    assert.deepEqual(dpiOptions(choices, 12500).at(-1), [12500, "12500 DPI · as stored"]);

    // The select posts a number; the record carries it as the slot's DPI.
    const draft = session();
    const slot = decoded(draft).pdModes[4];
    stage(draft, edits.pdMode(4, readConfig(slot, formOf({kind: slot.kind, name: slot.name, dpi: 800})), draft.identity()));
    assert.equal(decoded(draft).pdModes[4].dpi, 800);
});

test("a mode set to one axis posts the other axis empty, which the draft accepts", () => {
    const draft = session();
    const slot = decoded(draft).pdModes[4];
    assert.equal(slot.axis, AXIS.DOMINANT, "the fixture's slot 5 reads both axes");
    const stored = {...slot, thresholdX: 40, thresholdY: 40,
        directions: {left: {keycode: 0x50, modifierPolicy: 0, mask: 0}, right: {keycode: 0x4f, modifierPolicy: 0, mask: 0},
            up: {keycode: 0x52, modifierPolicy: 0, mask: 0}, down: {keycode: 0x51, modifierPolicy: 0, mask: 0}}};
    // Vertical only: the form draws Up and Down and the vertical threshold, nothing else.
    const config = readConfig(stored, formOf({kind: KIND.DIRECTIONAL, name: "Arrow", dpi: "0", axis: AXIS.VERTICAL,
        thresholdY: "40", "dir:up": "KC_UP", "dir:down": "KC_DOWN"}));
    assert.equal(config.thresholdX, 0, "the unread axis has no threshold");
    assert.deepEqual([config.directions.left, config.directions.right], [{keycode: "0", modifierPolicy: 0, mask: 0}, {keycode: "0", modifierPolicy: 0, mask: 0}]);
    stage(draft, edits.pdMode(4, config, draft.identity()));
    const after = decoded(draft).pdModes[4];
    assert.equal(after.axis, AXIS.VERTICAL);
    assert.equal(after.directions.left.keycode, 0, "the keyboard stores the unread shortcuts as empty");
    assert.ok(after.directions.up.keycode > 0);
});

test("an eight-direction mode posts its diagonals; another axis posts them empty and keeps the empty-direction choice", () => {
    const draft = session();
    const slot = decoded(draft).pdModes[4];
    const eight = readConfig(slot, formOf({kind: KIND.DIRECTIONAL, name: "Arrow", dpi: "0", axis: AXIS.EIGHT, emptyDirection: 1,
        thresholdX: "40", thresholdY: "40", "dir:up": "KC_UP", "dir:down": "KC_DOWN", "dir:left": "KC_LEFT", "dir:right": "KC_RIGHT",
        "diag:upLeft": "KC_HOME", "diag:downRight": "KC_END"}));
    assert.equal(eight.diagonals.upLeft.keycode, "KC_HOME");
    assert.equal(eight.diagonals.upRight.keycode, "0", "a diagonal without a shortcut stays empty");
    stage(draft, edits.pdMode(4, eight, draft.identity()));
    const after = decoded(draft).pdModes[4];
    assert.equal(after.axis, AXIS.EIGHT);
    assert.equal(after.emptyDirection, 1);
    assert.ok(after.diagonals.upLeft.keycode > 0 && after.diagonals.downRight.keycode > 0);
    assert.equal(after.scroll.divisorH, 0, "a directional record's bytes 70..90 are not scroll settings");

    const back = readConfig(after, formOf({kind: KIND.DIRECTIONAL, name: "Arrow", dpi: "0", axis: AXIS.DOMINANT}));
    assert.deepEqual(Object.values(back.diagonals).map(tap => tap.keycode), ["0", "0", "0", "0"]);
    assert.equal(back.emptyDirection, 1, "every directional mode has an empty-direction choice");
    stage(draft, edits.pdMode(4, back, draft.identity()));
    assert.equal(decoded(draft).pdModes[4].axis, AXIS.DOMINANT);
    assert.equal(decoded(draft).pdModes[4].diagonals.upLeft.keycode, 0);
    const nothing = readConfig(decoded(draft).pdModes[4], formOf({kind: KIND.DIRECTIONAL, name: "Arrow", dpi: "0", axis: AXIS.DOMINANT, emptyDirection: 2}));
    stage(draft, edits.pdMode(4, nothing, draft.identity()));
    assert.equal(decoded(draft).pdModes[4].emptyDirection, 2);
});

test("a directional mode posts how often it sends, and keeps it when the form does not draw it", () => {
    const draft = session();
    const slot = decoded(draft).pdModes[4];
    assert.equal(slot.directionOutput, 0, "existing modes send every step");
    const once = readConfig(slot, formOf({kind: KIND.DIRECTIONAL, name: "Arrow", dpi: "0", directionOutput: 1}));
    assert.equal(once.directionOutput, 1);
    stage(draft, edits.pdMode(4, once, draft.identity()));
    assert.equal(decoded(draft).pdModes[4].directionOutput, 1);
    const kept = readConfig(decoded(draft).pdModes[4], formOf({kind: KIND.DIRECTIONAL, name: "Arrow", dpi: "0", axis: AXIS.EIGHT, thresholdX: "40", thresholdY: "40"}));
    assert.equal(kept.directionOutput, 1, "switching axis keeps the choice");
    stage(draft, edits.pdMode(4, kept, draft.identity()));
    assert.equal(decoded(draft).pdModes[4].directionOutput, 1);
    assert.equal(newMode({id: 7, buttons: [{}, {}, {}].map(() => ({kind: 0, modifiers: 0, tap: {keycode: 0, modifierPolicy: 0, mask: 0}}))}, KIND.DIRECTIONAL).directionOutput, 0,
        "a new mode sends every step");
});

test("a scrolling mode posts which axes it scrolls; switching kind starts each kind from its own axis", () => {
    const draft = session();
    const scroll = decoded(draft).pdModes[0];
    assert.equal(scroll.axis, SCROLL_AXES.BOTH, "existing scrolling modes scroll both axes");
    const vertical = readConfig(scroll, formOf({kind: KIND.SCROLLING, name: "Dragscroll", dpi: "0", scrollAxes: SCROLL_AXES.VERTICAL}));
    stage(draft, edits.pdMode(0, vertical, draft.identity()));
    assert.equal(decoded(draft).pdModes[0].axis, SCROLL_AXES.VERTICAL);
    const kept = readConfig(decoded(draft).pdModes[0], formOf({kind: KIND.SCROLLING, name: "Dragscroll", dpi: "0"}));
    assert.equal(kept.axis, SCROLL_AXES.VERTICAL, "a field not drawn keeps the stored axes");

    // Arrow reads the dominant axis, which as a scroll axis would mean
    // vertical only: switched to scrolling it starts on both.
    const arrow = decoded(draft).pdModes[4];
    const scrolling = readConfig(startingRecord(arrow, KIND.SCROLLING), formOf({kind: KIND.SCROLLING, name: "Arrow", dpi: "0"}));
    assert.equal(scrolling.axis, SCROLL_AXES.BOTH);
    stage(draft, edits.pdMode(4, scrolling, draft.identity()));
    // And a vertical-only scroll switched to directional starts on the
    // vertical axis with its shipped threshold, not as a dominant axis
    // without a horizontal threshold.
    const directional = readConfig(startingRecord(decoded(draft).pdModes[0], KIND.DIRECTIONAL), formOf({kind: KIND.DIRECTIONAL, name: "Dragscroll", dpi: "0"}));
    assert.equal(directional.axis, AXIS.VERTICAL);
    stage(draft, edits.pdMode(0, directional, draft.identity()));
    assert.equal(decoded(draft).pdModes[0].thresholdY, DIRECTIONAL_STARTER_THRESHOLD);
});

test("each direction posts what held modifiers do to it, and an empty direction posts nothing", () => {
    const draft = session();
    const arrow = decoded(draft).pdModes[4];
    assert.equal(arrow.directions.up.modifierPolicy, MODIFIER_POLICY.MASK, "the factory Arrow leaves Alt out of up and down");
    // Clearing a shortcut that leaves modifiers out posts an empty direction,
    // not a mask the keyboard refuses.
    const cleared = readConfig(arrow, formOf({kind: KIND.DIRECTIONAL, name: "Arrow", dpi: "0", "dir:up": ""}));
    assert.deepEqual(cleared.directions.up, {keycode: "0", modifierPolicy: 0, mask: 0});
    stage(draft, edits.pdMode(4, cleared, draft.identity()));
    assert.equal(decoded(draft).pdModes[4].directions.up.keycode, 0);

    const exact = readConfig(decoded(draft).pdModes[4], formOf({kind: KIND.DIRECTIONAL, name: "Arrow", dpi: "0",
        "dirPolicy:left": MODIFIER_POLICY.EXACT, "dirPolicy:down": MODIFIER_POLICY.INHERIT}));
    assert.equal(exact.directions.down.mask, 0, "a mask goes only with Ignore");
    stage(draft, edits.pdMode(4, exact, draft.identity()));
    const after = decoded(draft).pdModes[4];
    assert.equal(after.directions.left.modifierPolicy, MODIFIER_POLICY.EXACT);
    assert.deepEqual([after.directions.down.modifierPolicy, after.directions.down.mask], [MODIFIER_POLICY.INHERIT, 0]);

    // Ignore is stored only with what it leaves out: chosen alone it is held
    // by the editor and the direction posts as stored; with a modifier it
    // posts.
    const chosen = readConfig(after, formOf({kind: KIND.DIRECTIONAL, name: "Arrow", dpi: "0", "dirPolicy:right": MODIFIER_POLICY.MASK}));
    const {config, pending} = settleTaps(after, chosen);
    assert.deepEqual(Object.keys(pending), ["dir:right"]);
    assert.equal(config.directions.right.modifierPolicy, after.directions.right.modifierPolicy);
    stage(draft, edits.pdMode(4, config, draft.identity()));
    const masked = settleTaps(after, readConfig(after, formOf({kind: KIND.DIRECTIONAL, name: "Arrow", dpi: "0",
        "dirPolicy:right": MODIFIER_POLICY.MASK, "dirMask:right": 0x02})));
    assert.deepEqual(masked.pending, {});
    stage(draft, edits.pdMode(4, masked.config, draft.identity()));
    assert.deepEqual([decoded(draft).pdModes[4].directions.right.modifierPolicy, decoded(draft).pdModes[4].directions.right.mask], [MODIFIER_POLICY.MASK, 0x02]);

    // Diagonals carry theirs too.
    const eight = readConfig(decoded(draft).pdModes[4], formOf({kind: KIND.DIRECTIONAL, name: "Arrow", dpi: "0", axis: AXIS.EIGHT,
        thresholdX: "40", thresholdY: "40", "diag:upLeft": "KC_HOME", "diagPolicy:upLeft": MODIFIER_POLICY.EXACT}));
    stage(draft, edits.pdMode(4, eight, draft.identity()));
    assert.equal(decoded(draft).pdModes[4].diagonals.upLeft.modifierPolicy, MODIFIER_POLICY.EXACT);
});

test("mouse buttons 3/4 stage with modifier policies, review, undo and complete backup import intact", async () => {
    const value = pdDocument();
    const caps = capabilities;
    const snapshot = {document: value, fingerprint: portable.fingerprint(value), summary: portable.summary(value)};
    const draft = new ProfileDraftSession(snapshot, "test-device", caps);
    const before = decoded(draft).pdModes[4];
    const config = readConfig(before, formOf({kind: KIND.DIRECTIONAL, name: before.name, dpi: before.dpi,
        axis: AXIS.EIGHT, "dir:left": "QK_MOUSE_BUTTON_3", "dir:right": "MS_BTN4",
        "dirPolicy:left": MODIFIER_POLICY.INHERIT, "dirPolicy:right": MODIFIER_POLICY.MASK, "dirMask:right": 2,
        "diag:upLeft": "0x00d3", "diagPolicy:upLeft": MODIFIER_POLICY.EXACT,
        "button:0:kind": BUTTON.TAP, "button:0:tap": "QK_MOUSE_BUTTON_1"}));
    stage(draft, edits.pdMode(4, config, draft.identity()));
    const after = decoded(draft).pdModes[4];
    assert.deepEqual(after.directions.left, {keycode: 0xd3, modifierPolicy: 0, mask: 0});
    assert.deepEqual(after.directions.right, {keycode: 0xd4, modifierPolicy: 1, mask: 2});
    assert.deepEqual(after.diagonals.upLeft, {keycode: 0xd3, modifierPolicy: 2, mask: 0});
    assert.equal(after.buttons[0].tap.keycode, 0xd1, "an override may click its own physical button");
    const fields = draft.changes().find(change => change.unit === "pd:4").fields;
    assert.match(fields.find(field => field.label === "Left").after, /Mouse Button 3.*Inherit/);
    assert.match(fields.find(field => field.label === "Right").after, /Mouse Button 4.*Ignore/);
    draft.review(draft.revision);
    assert.equal(draft.hasBlockers(), false);
    const backup = JSON.stringify(draft.document), savedProfile = draft.document.profile;
    draft.undo(draft.revision);
    assert.deepEqual(decoded(draft).pdModes[4], before);
    draft.redo(draft.revision);
    assert.equal(draft.document.profile, savedProfile);
    const restored = new ProfileDraftSession(snapshot, "test-device", caps);
    restored.replace(portable.validateSnapshot(backup, caps).document, restored.revision, "edit", "Imported a profile");
    assert.equal(restored.document.profile, savedProfile, "complete backup keeps the exact bytes");
    assert.deepEqual(decoded(restored).pdModes[4], after);
});

test("pointing text entry refuses unsupported mouse/control outputs without changing the draft", () => {
    const value = pdDocument();
    const draft = new ProfileDraftSession({document: value, fingerprint: portable.fingerprint(value), summary: portable.summary(value)}, "test-device", capabilities);
    const slot = decoded(draft).pdModes[4];
    const before = draft.current.fingerprint;
    const set = key => edits.pdMode(4, readConfig(slot, formOf({kind: slot.kind, name: slot.name, dpi: slot.dpi, "dir:left": key})), draft.identity());
    for (const key of ["MS_UP", "MS_WHLD", "MS_ACL0", "C(MS_BTN3)", "PD_SLOT_0", "MO(1)", "QK_BOOTLOADER"]) {
        assert.throws(() => stage(draft, set(key)), /Left:.*(pointing mode|keyboard keys|mouse-button click)/, key);
        assert.equal(draft.current.fingerprint, before);
    }
    const model = buildSnapshotModel(draft.current, capabilities, {editable: true, reason: ""});
    assert.ok(model.pdModeEditing.tapKeys.plain.includes("QK_MOUSE_BUTTON_3"));
});

test("a threshold reads as ball movement at the mode's pointer speed", () => {
    const defaults = [{id: "normalPointerSpeed", fields: [{macro: "normalDpi", value: "1200"}]}];
    assert.equal(modeDpi({dpi: 400}, defaults), 400);
    assert.equal(modeDpi({dpi: 0}, defaults), 1200, "a mode keeping normal speed runs at the normal DPI");
    assert.equal(modeDpi({dpi: 0}, []), 0);
    assert.deepEqual(thresholdDistance(80, 400), {short: "≈ 5.1 mm", long: "Sensor counts: about 5.1 mm of ball movement at 400 DPI."});
    assert.equal(thresholdDistance(800, 400).short, "≈ 51 mm");
    assert.equal(thresholdDistance(80, 0), null, "unknown speed says nothing");
});

test("an axis switched back on starts from the shipped threshold, and a typed zero on a read axis is posted as typed", () => {
    const draft = session();
    const vertical = {...decoded(draft).pdModes[1], axis: AXIS.VERTICAL, thresholdX: 0, thresholdY: 70};
    const widened = readConfig(vertical, formOf({kind: KIND.DIRECTIONAL, name: "Volume", dpi: "0", axis: AXIS.DOMINANT}));
    assert.equal(widened.thresholdX, DIRECTIONAL_STARTER_THRESHOLD, "the axis that was off starts from the shipped tuning");
    assert.equal(widened.thresholdY, 70, "the axis that was already read keeps its value");
    stage(draft, edits.pdMode(1, widened, draft.identity()));
    assert.equal(decoded(draft).pdModes[1].axis, AXIS.DOMINANT);

    const zeroed = readConfig(vertical, formOf({kind: KIND.DIRECTIONAL, name: "Volume", dpi: "0", axis: AXIS.VERTICAL, thresholdY: "0"}));
    assert.equal(zeroed.thresholdY, 0, "the keyboard decides whether a zero is allowed, not the form");
});

test("a directional slot switched to scrolling posts the starter tuning, which the draft accepts", () => {
    const draft = session();
    const slot = startingRecord(decoded(draft).pdModes[1], KIND.SCROLLING);
    assert.deepEqual(slot.scroll, SCROLL_STARTER);
    stage(draft, edits.pdMode(1, readConfig(slot, formOf({kind: KIND.SCROLLING, name: "Volume", dpi: "0"})), draft.identity()));
    const after = decoded(draft).pdModes[1];
    assert.equal(after.kind, 2);
    assert.equal(after.scroll.divisorV, SCROLL_STARTER.divisorV);
});

test("clearing a slot leaves its button on the board, inert until it is configured again", () => {
    const draft = session();
    // The fixture reaches slot 6 from a behaviour. The keyboard's mode keycodes
    // are a fixed registry and its runtime refuses to activate an empty slot,
    // so the button stays put and does nothing — which is what the interface
    // says next to the slot.
    stage(draft, edits.clearPdMode(5, draft.identity()));
    const value = decoded(draft);
    assert.equal(value.pdModes[5].kind, 0, "the slot is empty");
    assert.ok(value.danglingPdBindings[5] > 0, "and what still reaches it is counted, not refused");
});

test("an empty slot can start a new mode of either kind, which the draft accepts as posted", () => {
    const draft = session();
    stage(draft, edits.clearPdMode(5, draft.identity()));
    const empty = decoded(draft).pdModes[5];
    stage(draft, edits.pdMode(5, newMode(empty, KIND.DIRECTIONAL), draft.identity()));
    let slot = decoded(draft).pdModes[5];
    assert.equal(slot.kind, KIND.DIRECTIONAL);
    assert.equal(slot.name, "Mode 5");
    assert.equal(slot.axis, AXIS.DOMINANT);
    assert.equal(slot.thresholdX, DIRECTIONAL_STARTER_THRESHOLD);
    assert.equal(slot.thresholdY, DIRECTIONAL_STARTER_THRESHOLD);
    assert.ok(Object.values(slot.directions).every(tap => !tap.keycode), "no shortcuts yet");

    stage(draft, edits.clearPdMode(5, draft.identity()));
    stage(draft, edits.pdMode(5, newMode(decoded(draft).pdModes[5], KIND.SCROLLING), draft.identity()));
    slot = decoded(draft).pdModes[5];
    assert.equal(slot.kind, KIND.SCROLLING);
    assert.equal(slot.scroll.divisorV, SCROLL_STARTER.divisorV);
});

test("a new or switched-to scrolling mode scrolls like Dragscroll: its speed and its reversal", () => {
    const draft = session();
    const dragscroll = decoded(draft).pdModes[0];
    const starter = scrollStarter(decoded(draft).pdModes);
    assert.equal(starter.dpi, dragscroll.dpi);
    assert.equal(starter.scroll.invert, dragscroll.scroll.invert);
    stage(draft, edits.clearPdMode(5, draft.identity()));
    stage(draft, edits.pdMode(5, newMode(decoded(draft).pdModes[5], KIND.SCROLLING, starter), draft.identity()));
    const made = decoded(draft).pdModes[5];
    assert.deepEqual([made.dpi, made.scroll.invert, made.scroll.divisorV], [dragscroll.dpi, dragscroll.scroll.invert, dragscroll.scroll.divisorV]);
    // Without a scrolling mode to copy, the firmware's shipped Dragscroll.
    assert.deepEqual(scrollStarter([]), SHIPPED_SCROLL);
    assert.deepEqual([SHIPPED_SCROLL.dpi, SHIPPED_SCROLL.scroll.invert], [100, 2], "100 DPI, vertical reversed (pd_config.c)");
    const directional = newMode({id: 7, buttons: []}, KIND.SCROLLING);
    assert.deepEqual([directional.dpi, directional.scroll.invert], [100, 2]);
    // A directional mode switched to scrolling takes the same speed and reversal.
    const arrow = decoded(draft).pdModes[4];
    const switched = startingRecord(arrow, KIND.SCROLLING, starter);
    assert.deepEqual([switched.dpi, switched.scroll.invert], [dragscroll.dpi, dragscroll.scroll.invert]);
    stage(draft, edits.pdMode(4, readConfig(switched, formOf({kind: KIND.SCROLLING, name: "Arrow", dpi: String(switched.dpi)})), draft.identity()));
    assert.deepEqual([decoded(draft).pdModes[4].dpi, decoded(draft).pdModes[4].scroll.invert], [dragscroll.dpi, dragscroll.scroll.invert]);
});

test("duplicating needs a configured source and an empty destination", () => {
    const draft = session();
    assert.throws(() => stage(draft, edits.duplicatePdMode(0, 1, draft.identity())), /empty destination/i,
        "a configured slot is not overwritten by a copy");
    stage(draft, edits.clearPdMode(5, draft.identity()));
    stage(draft, edits.duplicatePdMode(5, 1, draft.identity()));
    assert.equal(decoded(draft).pdModes[5].kind, decoded(draft).pdModes[1].kind);
});

test("a duplicate is named as a copy and takes the source's colour and locality", () => {
    const draft = session();
    const colour = (id) => decoded(draft).rgb.pdModeColors.find((row) => row.pdModeId === id);
    const source = decoded(draft).pdModes[1];
    stage(draft, edits.clearPdMode(5, draft.identity()));
    assert.notDeepEqual(colour(5).color, colour(1).color, "the fixture's two slots start with different colours");
    stage(draft, edits.duplicatePdMode(5, 1, draft.identity()));
    assert.equal(decoded(draft).pdModes[5].name, `${source.name} copy`);
    assert.deepEqual([colour(5).color, colour(5).locality], [colour(1).color, colour(1).locality]);
    // A name at the limit is cut a whole character at a time to fit " copy".
    stage(draft, edits.pdMode(1, readConfig(decoded(draft).pdModes[1], formOf({kind: KIND.DIRECTIONAL, name: "é".repeat(16), dpi: "0"})), draft.identity()));
    stage(draft, edits.clearPdMode(6, draft.identity()));
    stage(draft, edits.duplicatePdMode(6, 1, draft.identity()));
    assert.equal(decoded(draft).pdModes[6].name, `${"é".repeat(13)} copy`);
});

// ── settings ────────────────────────────────────────────────────────────

test("human timeout units stage milliseconds and keep the rest of All lighting", () => {
    const draft = session();
    for (const [value, unit, expected] of [["777", "seconds", 777000], ["1.5", "minutes", 90000], ["0.777", "seconds", 777], ["0", "minutes", 0], ["1440", "minutes", 86400000]]) {
        const section = settingsEditorView(draft.current).sections.find(row => row.id === "lightingPower");
        const before = decoded(draft).settings.values.slice();
        const message = edits.settingsSection(section, field => field.macro === "lightingTimeout" ? durationMilliseconds(value, unit) : undefined, draft.current.fingerprint);
        stage(draft, message);
        assert.equal(decoded(draft).settings.values[SETTING.RGB_TIMEOUT], expected);
        before[SETTING.RGB_TIMEOUT] = expected;
        assert.deepEqual(decoded(draft).settings.values, before);
    }
    const section = settingsEditorView(draft.current).sections.find(row => row.id === "lightingPower");
    const timeout = section.fields.find(field => field.macro === "lightingTimeout");
    const before = draft.document;
    stage(draft, edits.settingsSection(section, field => field.macro === "lightingTimeout" ? durationMilliseconds(durationValue(timeout.value, "minutes"), "minutes") : undefined, draft.current.fingerprint));
    assert.deepEqual(draft.document, before);
});

// The Background effect tab posts only the control that changed (its colour
// editor gives hue, saturation and brightness at once); the rest of the
// section travels at its stored value, and All lighting, which shares the
// effect's settings word, is left as it is.
test("the background effect posts its changed channels and keeps the rest of its word", () => {
    const draft = session();
    const section = settingsEditorView(draft.current).sections.find(row => row.id === "rgbAppearance");
    const before = decoded(draft).settings.values.slice();
    stage(draft, edits.settingsSection(section, field => ({hue: "23", saturation: "200"})[field.macro], draft.current.fingerprint));
    const after = decoded(draft).settings.values;
    assert.equal(after[SETTING.RGB_COLOR] & 0xff, 23);
    assert.equal((after[SETTING.RGB_COLOR] >>> 8) & 0xff, 200);
    assert.equal(after[SETTING.RGB_COLOR] >>> 16, before[SETTING.RGB_COLOR] >>> 16, "brightness kept");
    assert.equal(after[SETTING.RGB_MODE], before[SETTING.RGB_MODE], "effect, speed, LEDs and All lighting kept");
});

test("a settings section is posted whole, and a partial section is refused", () => {
    const draft = session();
    const section = settingsEditorView(draft.current).sections.find((row) => row.id === "keyTiming");
    const message = edits.settingsSection(section, (field) => field.macro === "tappingTerm" ? "210" : undefined, draft.current.fingerprint);
    assert.equal(message.fields.length, section.fields.length, "undrawn fields travel with the value that was read");
    stage(draft, message);
    assert.equal(settingsEditorView(draft.current).timing.tappingTerm, "210");
    assert.throws(() => stage(draft, {...message, expectedFingerprint: draft.current.fingerprint, fields: message.fields.slice(0, 2)}),
        /complete settings section/i);
});

test("the auto-mouse fade is posted as a share, and a new timeout rescales it in the same step", () => {
    const draft = session();
    const sectionOf = (id) => settingsEditorView(draft.current).sections.find((row) => row.id === id);
    const fade = () => sectionOf("automouseFade").fields[0];
    stage(draft, edits.settingsSection(sectionOf("automouseFade"), () => "25", draft.current.fingerprint));
    assert.equal(fade().value, "25");
    assert.equal(Number(fade().ms), Math.round(Number(fade().whole) / 4), "a quarter of the timeout, stored in milliseconds");

    const timeout = String(Number(fade().whole) * 2);
    stage(draft, edits.settingsSection(sectionOf("autoMouse"), (field) => field.macro === "mouseTimeout" ? timeout : undefined, draft.current.fingerprint));
    assert.equal(fade().value, "25", "the share holds across a new timeout");
    assert.equal(fade().whole, timeout);
    const last = draft.steps().at(-1).changes;
    assert.deepEqual(last.map((change) => [change.unit, change.area]).sort(),
        [["settings:autoMouse", "Mouse"], ["settings:automouseFade", "Lighting"]], "the step says it moved the fade too");
    const place = last.find((change) => change.unit === "settings:automouseFade").place;
    assert.deepEqual(place, {kind: "settings", section: "automouseFade", area: "Lighting", stage: "auto"});
    const groups = draft.view({}).changes.filter((change) => ["settings:autoMouse", "settings:automouseFade"].includes(change.unit)).map((change) => change.group);
    assert.equal(groups.length, 2);
    assert.equal(new Set(groups).size, 1, "one Discard takes back the timeout and the fade it moved");
});

test("the fade slider previews exactly what the keyboard will store for every share", () => {
    const draft = session();
    const read = settingsEditorView(draft.current).sections.find((row) => row.id === "automouseFade");
    for (let percent = 0; percent <= Number(read.fields[0].max); percent++) {
        const staged = session();
        stage(staged, edits.settingsSection(read, () => String(percent), staged.current.fingerprint));
        const stored = settingsEditorView(staged.current).sections.find((row) => row.id === "automouseFade").fields[0].ms;
        assert.equal(String(shareHold(read.fields[0], percent)), stored, `${percent}%`);
    }
});

test("behaviour timing defaults follow the draft's Key Timing, and its undo", () => {
    const draft = session();
    // what extension.js builds the webview's model from while a draft is open
    const timing = () => buildSnapshotModel(draft.current, draft.capabilities, {editable: true, reason: ""}).behaviorTimingDefaults;
    const before = timing().tapHoldTerm;
    assert.match(before, /^\d+$/, "the keyboard reports its default");
    const section = settingsEditorView(draft.current).sections.find((row) => row.id === "keyTiming");
    const next = String(Number(before) + 35);
    stage(draft, edits.settingsSection(section, (field) => field.macro === "tapHoldTerm" ? next : undefined, draft.current.fingerprint));
    assert.equal(timing().tapHoldTerm, next, "the behaviour editor's note reads the drafted default");
    draft.undo(draft.revision);
    assert.equal(timing().tapHoldTerm, before, "and undo puts it back");
});

test("the combo hold threshold is the one the keyboard stores, else its tapping term", () => {
    const model = {comboReadback: {holdTermMs: 240, defaultTermMs: 50}, behaviorTimingDefaults: {tappingTerm: "200"}};
    assert.equal(edits.comboHoldTermValue(model, " 275 "), "275", "a written value wins");
    assert.equal(edits.comboHoldTermValue(model, ""), "240");
    assert.equal(edits.comboHoldTermValue({...model, comboReadback: {holdTermMs: null}}, ""), "200", "an older keyboard without combos: its own tapping term");
    assert.equal(edits.comboHoldTermValue({...model, comboReadback: {holdTermMs: 0}}, ""), "0", "0 is a threshold, not a missing one");
    assert.equal(edits.comboDefaultWindowValue(model), "50");
    assert.equal(edits.comboDefaultWindowValue({comboReadback: {defaultTermMs: null}}), "", "an older keyboard has no default");
});

// ── the 32-slot firmware ────────────────────────────────────────────────

test("on the 32-slot firmware, the same builders reach slots past seven", () => {
    const {CAPABILITIES_32, document32} = require(path.join(here, "..", "fixtures", "pd-slots-32"));
    const doc = document32();
    const draft = new ProfileDraftSession({document: doc, fingerprint: portable.fingerprint(doc), summary: portable.summary(doc)}, "test-device", CAPABILITIES_32);
    const wide = () => portable.validateSnapshot(draft.document, CAPABILITIES_32);
    stage(draft, edits.pdMode(27, newMode(wide().pdModes[27], KIND.SCROLLING), draft.identity()));
    assert.equal(wide().pdModes[27].kind, KIND.SCROLLING);
    stage(draft, edits.duplicatePdMode(30, 12, draft.identity()));
    assert.equal(wide().pdModes[30].name, "Tabs copy");
    assert.deepEqual(wide().rgb.pdModeColors[30].color, {h: 200, s: 255, v: 200}, "with slot 12's colour");
    stage(draft, edits.pdModeColour("PD_MODE_SLOT_25", "RGB_LEFT_HALF", {h: 1, s: 2, v: 3}));
    assert.deepEqual(wide().rgb.pdModeColors[25], {pdModeId: 25, color: {h: 1, s: 2, v: 3}, locality: RGB_LOCALITIES.RGB_LEFT_HALF});
    stage(draft, edits.setKey("Layer 1", 27, "PD_SLOT_31_LOCK"));
    assert.equal(profileLayers(draft.document)[1][slotOf(27)], 0x7ebf);
    stage(draft, edits.clearPdMode(12, draft.identity()));
    assert.equal(wide().pdModes[12].kind, 0);
    assert.ok(reviewAreas(draft).includes("Pointing modes"));
});

test("participation controls preserve definitions, review their scopes, and undo or discard as one edit", () => {
    const initial = require("../fixtures/portable-profile").document();
    const draft = new ProfileDraftSession({document: initial, fingerprint: portable.fingerprint(initial), summary: portable.summary(initial), limits: {brightnessMax: 200}}, "test-device", capabilities);
    const base = draft.document;
    stage(draft, edits.placementPolicy(15, 0, false, false));
    assert.deepEqual(decoded(draft).settings.layers[15].bypass, [slotOf(0)]);
    assert.deepEqual(decoded(draft).settings.layers[15].exclude, [slotOf(0)]);
    let change = draft.view({selectedDeviceId: "test-device", connected: true}).changes.find(row => row.unit.startsWith("placement:"));
    assert.equal(change.fields.length, 2);
    draft.discard(draft.revision, change.group); assert.deepEqual(draft.document, base);
    const model = buildSnapshotModel(draft.current, capabilities, {editable: true, reason: ""});
    const behavior = model.keyBehaviors[0], original = decoded(draft).behaviors.rows[0];
    stage(draft, edits.saveBehaviour(behavior, {enabled: false, allowedLayers: 2 ** 15}, draft.identity()));
    let stored = decoded(draft).behaviors.rows.find(row => JSON.stringify(row.target) === JSON.stringify(original.target));
    assert.equal(stored.enabled, false); assert.equal(stored.allowedLayers, 32768);
    assert.deepEqual(stored.steps, original.steps);
    change = draft.view({selectedDeviceId: "test-device", connected: true}).changes.find(row => row.unit.startsWith("behavior:"));
    assert.deepEqual(change.fields.map(field => field.label), ["Enabled", "Allowed layers"]);
    // Another edit from a form that omits the fields must keep both permissions.
    stage(draft, {type: "saveBehavior", behavior: {...edits.saveBehaviour(behavior).behavior, enabled: undefined, allowedLayers: undefined}});
    stored = decoded(draft).behaviors.rows.find(row => JSON.stringify(row.target) === JSON.stringify(original.target));
    assert.equal(stored.enabled, false); assert.equal(stored.allowedLayers, 32768);
    draft.undo(draft.revision); assert.deepEqual(draft.document, base);
    const combo = {id: 0, inputs: ["KC_A", "KC_B"], output: "KC_E", followsDefault: true, termMs: "50"};
    stage(draft, edits.comboMessage(combo.id, {...combo, enabled: false, allowedLayers: 32768}));
    assert.equal(decoded(draft).combos.rows[0].enabled, false);
    assert.equal(decoded(draft).combos.rows[0].allowedLayers, 32768);
    change = draft.view({selectedDeviceId: "test-device", connected: true}).changes.find(row => row.unit === "combo:0");
    assert.deepEqual(change.fields.map(field => field.label), ["Enabled", "Allowed layers"]);
    draft.discard(draft.revision, change.group); assert.deepEqual(draft.document, base);
});

test("a late layer carries its participation masks and placement flags through reorder", () => {
    const draft = session();
    stage(draft, edits.placementPolicy(15, 55, false, false));
    const view = settingsEditorView(draft.current);
    for (const [sectionId, macro] of [["behaviorSettings", "behaviorsOnLayer15"], ["comboSettings", "combosOnLayer15"]]) {
        const section = view.sections.find(row => row.id === sectionId);
        stage(draft, edits.settingsSection(section, field => field.macro === macro ? false : undefined));
    }
    const order = Array.from({length: 16}, (_, i) => i); [order[1], order[15]] = [order[15], order[1]];
    const next = portable.validateSnapshot(portable.reorderLayers(draft.document, order));
    assert.deepEqual(next.settings.layers[1].bypass, [slotOf(55)]);
    assert.deepEqual(next.settings.layers[1].exclude, [slotOf(55)]);
    assert.equal(next.settings.values[29] & 2, 0); assert.equal(next.settings.values[30] & 2, 0);
    draft.editLayers(portable.reorderLayers(draft.document, order), draft.revision, order);
    const placement = draft.changes().find(row => row.unit.startsWith("placement:"));
    assert.equal(placement.place.layer, 1);
    draft.discard(draft.revision, placement.group);
    const reverted = portable.validateSnapshot(draft.document);
    assert.deepEqual(reverted.settings.layers[1].bypass, []);
    assert.deepEqual(reverted.settings.layers[1].exclude, []);
    assert.equal(reverted.settings.values[29] & 2, 0);
    assert.equal(reverted.settings.values[30] & 2, 0);
    assert(draft.changes().some(row => row.unit === "layerOrder"));
});

test("a backup from older firmware is refused at import, and the draft is left as it was", async () => {
    const {portableControl} = require("../../core/session/panel-controls");
    const draft = session(), before = draft.document;
    const older = {...structuredClone(before), version: 2, actionAbiDigest: 0xf79c6151};
    const panel = {draft, service: {snapshot: () => ({selectedDeviceId: "test-device", connected: true, capabilities})}};
    await assert.rejects(portableControl(panel, edits.reviewPortableProfile(JSON.stringify(older), "previous.json")), /format current firmware does not store/);
    assert.equal(panel.portableReview, undefined);
    assert.deepEqual(draft.document, before);
});

test("the Host section posts staged settings with Review, undo, redo and backup intact", () => {
    const caps = capabilities;
    const doc = pdDocument();
    const draft = new ProfileDraftSession({document: doc, fingerprint: portable.fingerprint(doc), summary: portable.summary(doc), limits: {brightnessMax: 200}, hostOs: {detected: 1}}, "test-device", caps);
    const host = () => settingsEditorView(draft.current).sections.find(s => s.id === "host");
    // Windows first, where Unicode playback is a switch; then the switch.
    stage(draft, edits.settingsSection(host(), field => field.macro === "hostOs" ? "2" : field.kind === "toggle" ? false : undefined, portable.fingerprint(draft.document)));
    stage(draft, edits.settingsSection(host(), field => field.macro === "unicodeEnabled" ? true : undefined, portable.fingerprint(draft.document)));
    assert.equal(decoded(draft).settings.values[27], 0x102);
    assert.ok(reviewAreas(draft).includes("Settings"));
    stage(draft, edits.macroMessage("VIA_MACRO_0", "café 🙂 e\u0301", portable.fingerprint(draft.document)));
    assert.equal(Buffer.from(profileMacros(draft.document)[0], "base64").toString("utf8"), "café 🙂 e\u0301");
    const backup = JSON.parse(JSON.stringify(draft.document));
    assert.equal(portable.validateSnapshot(backup, caps).settings.values[27], 0x102);
    draft.undo(draft.revision); assert.equal(profileMacros(draft.document)[0], profileMacros(doc)[0]);
    draft.undo(draft.revision); assert.equal(decoded(draft).settings.values[27], 2);
    draft.undo(draft.revision); assert.equal(decoded(draft).settings.values[27], 0);
    draft.redo(draft.revision); draft.redo(draft.revision); draft.redo(draft.revision); assert.deepEqual(draft.document, backup);
});

test("the Host section stages a keyboard layout and the macOS ISO bit", () => {
    const caps = capabilities;
    const doc = pdDocument();
    const draft = new ProfileDraftSession({document: doc, fingerprint: portable.fingerprint(doc), summary: portable.summary(doc), limits: {brightnessMax: 200}, hostOs: {detected: 1}}, "test-device", caps);
    const host = draft.current && settingsEditorView(draft.current, caps).sections.find(s => s.id === "host");
    assert.deepEqual(host.fields.map(f => f.macro), ["hostOs", "hostLayout", "macosIso"]);
    const message = edits.settingsSection(host, field => ({hostLayout: "2", macosIso: true})[field.macro], portable.fingerprint(draft.document));
    assert.deepEqual(message.fields, [{macro: "hostOs", value: "0"}, {macro: "hostLayout", value: "2"}, {macro: "macosIso", enabled: true}]);
    stage(draft, message);
    assert.equal(decoded(draft).settings.values[27], (2 << 16) | 0x1000000);
    stage(draft, edits.macroMessage("VIA_MACRO_0", "café “hello” €", portable.fingerprint(draft.document)));
    assert.equal(Buffer.from(profileMacros(draft.document)[0], "base64").toString("utf8"), "café “hello” €");
});

test("literal step messages inspect and stage the exact text with undo intact", async () => {
    const {macroStepsInput} = await import("../../webview/view/macro.mjs");
    const {macroInputStatus} = require("../../core/model/macro-editor");
    const draft = session(), text = ' {"key": "{KC_A}"}\nhello ';
    const {payload} = macroStepsInput([{kind: "text", text}, {kind: "tap", keys: ["KC_ENT"]}]);
    const message = edits.macroValidationMessage("VIA_MACRO_17", payload, 777);
    assert.deepEqual(message, {type: "validateMacro", keycode: "VIA_MACRO_17", payload, requestId: 777});
    assert.equal(macroInputStatus(draft.current, message, draft.capabilities).error, "");
    const before = draft.document;
    stage(draft, edits.macroMessage(message.keycode, message.payload, draft.current.fingerprint));
    assert.equal(Buffer.from(profileMacros(draft.document)[17], "base64").subarray(0, Buffer.byteLength(text)).toString(), text);
    assert.ok(reviewAreas(draft).includes("Macros"));
    draft.undo(draft.revision);
    assert.deepEqual(draft.document, before);
});

test("the layer panel's toggle, moves and save reach the draft through the real layer editor", async () => {
    const {portableControl} = require("../../core/session/panel-controls");
    const {routeMessage} = require("../../core/session/panel-session");
    const draft = session(), before = draft.document;
    const state = {selectedDeviceId: "test-device", connected: true, capabilities};
    const panel = {draft, service: {snapshot: () => state}};
    const send = async (message) => {
        const payload = {draftId: draft.id, draftRevision: draft.revision, ...message};
        assert.equal(routeMessage(panel, payload, state), "portable");
        await portableControl(panel, payload);
    };
    await send(controls.control("managePortableLayers"));
    const typed = [...panel.portableLayers.names];
    typed[2] = "777";
    await send(controls.layersFollow(false, typed));
    assert.equal(panel.portableLayers.keysFollow, false);
    assert.equal(panel.portableLayers.names[2], "777", "the toggle keeps the names typed with it");
    await send(controls.moveLayer(4, {direction: -1}, panel.portableLayers.names));
    await send(controls.moveLayer(1, {to: 3}, panel.portableLayers.names));
    await send(controls.moveLayer(5, {makeBase: true}, panel.portableLayers.names));
    const order = [5, 2, 4, 1, 3, 0, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
    assert.deepEqual(panel.portableLayers.order, order);
    assert.deepEqual(draft.document, before, "the layer panel stages nothing until it is saved");
    await send(controls.saveLayers(panel.portableLayers.names));
    assert.equal(panel.portableLayers, undefined);
    assert.deepEqual(draft.order, order);
    assert.equal(draft.current.summary.names[1], "777", "the renamed layer moved to its new slot");
    assert.deepEqual(profileLayers(draft.document)[0], profileLayers(before)[5], "Make base put layer 5's keys at the bottom");
    draft.undo(draft.revision);
    assert.deepEqual(draft.document, before);
});

test("pointing macros stage inherit-only outputs and survive review, history and backup import", async () => {
    const value = pdDocument();
    const caps = capabilities;
    const snapshot = {document: value, fingerprint: portable.fingerprint(value), summary: portable.summary(value)};
    const draft = new ProfileDraftSession(snapshot, "test-device", caps);
    const before = decoded(draft).pdModes[4];
    stage(draft, {type: "updateMacro", keycode: "VIA_MACRO_0", payload: "Hi"});
    stage(draft, edits.macroNameMessage("VIA_MACRO_0", "Greeting", draft.current.fingerprint));
    const config = readConfig(before, formOf({kind: 1, name: before.name, dpi: before.dpi, axis: AXIS.EIGHT,
        "dir:left": "VIA_MACRO_0", "dirPolicy:left": MODIFIER_POLICY.EXACT,
        "dir:right": "VIA_MACRO_127", "dirPolicy:right": MODIFIER_POLICY.MASK, "dirMask:right": 2,
        "diag:upLeft": "MC_0", "button:0:kind": BUTTON.TAP, "button:0:tap": "0x7700"}));
    stage(draft, edits.pdMode(4, config, draft.identity()));
    const after = decoded(draft).pdModes[4];
    assert.deepEqual(after.directions.left, {keycode: 0x7700, modifierPolicy: 0, mask: 0});
    assert.deepEqual(after.directions.right, {keycode: 0x777f, modifierPolicy: 0, mask: 0});
    assert.equal(after.diagonals.upLeft.keycode, 0x7700);
    assert.deepEqual(after.buttons[0].tap, after.directions.left);
    const fields = draft.changes().find(change => change.unit === "pd:4").fields;
    assert.match(fields.find(field => field.label === "Left").after, /Greeting.*Inherit/);
    assert.equal(draft.checks().filter(check => check.kind === "inertPointingMacro").length, 1);
    assert.equal(draft.hasBlockers(), false);
    const backup = JSON.stringify(draft.document);
    draft.undo(draft.revision); assert.deepEqual(decoded(draft).pdModes[4], before);
    draft.redo(draft.revision); assert.deepEqual(decoded(draft).pdModes[4], after);
    const imported = new ProfileDraftSession(snapshot, "test-device", caps);
    imported.replace(portable.validateSnapshot(backup).document, imported.revision, "edit", "Imported profile");
    assert.deepEqual(decoded(imported).pdModes[4], after, "a backup keeps the macro outputs");
    const model = buildSnapshotModel(draft.current, caps, {editable: true, reason: ""});
    assert.ok(model.pdModeEditing.tapKeys.plain.includes("VIA_MACRO_127"));
    for (const [modifierPolicy, mask] of [[1, 2], [2, 0], [0, 2]]) {
        const bad = structuredClone(config); bad.directions.left = {keycode: "VIA_MACRO_0", modifierPolicy, mask};
        assert.throws(() => stage(draft, edits.pdMode(4, bad, draft.identity())), /must inherit held modifiers/);
    }
});

test("combo-output permissions post, review, discard and survive backups and layer reorder", () => {
    const caps = capabilities;
    const doc = require("../fixtures/portable-profile").document();
    const base = {document: doc, fingerprint: portable.fingerprint(doc), summary: portable.summary(doc)};
    const draft = new ProfileDraftSession(base, "test-device", caps);
    const initial = decoded(draft);
    const combo = buildSnapshotModel(draft.current, caps, {editable: true, reason: ""}).combos[0];
    stage(draft, edits.comboMessage(0, {...combo, useOutputBehavior: false}));
    const stored = decoded(draft).combos.rows[0];
    assert.deepEqual({...stored, useOutputBehavior: true}, initial.combos.rows[0]);
    let change = draft.changes().find(row => row.unit === "combo:0");
    assert.deepEqual(change.fields.map(field => [field.label, field.before, field.after]), [["Use output behaviour", "on", "off"]]);
    draft.discard(draft.revision, change.group);
    assert.deepEqual(draft.document, base.document);
    draft.undo(draft.revision);
    assert.equal(decoded(draft).combos.rows[0].useOutputBehavior, false);
    draft.redo(draft.revision);
    assert.equal(decoded(draft).combos.rows[0].useOutputBehavior, true);
    draft.undo(draft.revision);
    // An older form that omits the new field must preserve the stored veto.
    const {useOutputBehavior, ...oldForm} = combo;
    stage(draft, edits.comboMessage(0, oldForm));
    assert.equal(decoded(draft).combos.rows[0].useOutputBehavior, false);
    const section = settingsEditorView(draft.current, caps).sections.find(row => row.id === "comboSettings");
    stage(draft, edits.settingsSection(section, field => field.macro === "comboOutputBehaviors" ? false : undefined));
    const changed = decoded(draft);
    assert.equal(changed.settings.comboOutputBehaviors, false);
    assert.deepEqual(changed.settings.values, initial.settings.values);
    assert.deepEqual(changed.settings.layers, initial.settings.layers);
    const exported = JSON.parse(JSON.stringify(draft.document));
    assert.equal(portable.validateSnapshot(exported, caps).settings.comboOutputBehaviors, false);
    assert.equal(portable.validateSnapshot(exported, caps).combos.rows[0].useOutputBehavior, false);
    const order = Array.from({length: 16}, (_, i) => 15 - i);
    const reordered = portable.validateSnapshot(portable.reorderLayers(exported, order), caps);
    assert.equal(reordered.settings.comboOutputBehaviors, false);
    assert.equal(reordered.combos.rows[0].useOutputBehavior, false);
    change = draft.changes().find(row => row.unit === "settings:comboSettings");
    assert.deepEqual(change.fields.map(field => [field.label, field.before, field.after]), [["Combo outputs use behaviours", "on", "off"]]);
    draft.discard(draft.revision, change.group);
    assert.equal(decoded(draft).settings.comboOutputBehaviors, true);
    assert.equal(decoded(draft).combos.rows[0].useOutputBehavior, false);
});
