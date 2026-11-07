import assert from "node:assert/strict";
import test from "node:test";
import {actionNaming, dualRole, keyFace, keyName, visibleKeycode, cellLabel, behaviourTiers, behaviourGridSteps, inheritedBranch, impliedBranch} from "../../webview/view/keyface.mjs";
import {createRequire} from "node:module";
import keyNames from "../../core/model/key-names.js";
import {behaviourEditorRow} from "../../webview/view/behavior-editor.mjs";
import {keyIdentity} from "../../webview/view/key-identity.mjs";
import * as edits from "../../webview/view/edits.mjs";

const require = createRequire(import.meta.url);
const {profileDocument, publishedModel} = require("../fixtures/published-model.js");

// A key cap's second line for a layer key is in the vocabulary's words, and
// which keys act on a layer, and how, is the core's (qmkKeyLayerForms): the
// model core publishes for a profile with these keys on Base, whose layers
// are Base, Numbers, Symbols and Navigation.
const CAPS = ["LT(2,KC_F)", "LT(3,KC_SLASH)", "LT(3,KC_F)", "MO(1)", "MO(2)", "MO(3)", "TG(1)", "TO(2)", "OSL(3)", "TT(1)", "DF(0)", "PDF(0)", "LOCK_LAYER(3)", "LM(1,MOD_LSFT)",
    "MT(MOD_LSFT,KC_A)", "MT(MOD_LCTL|MOD_LSFT|MOD_LGUI,KC_A)", "KC_A", "KC_F", "KC_TRANSPARENT", "PD_MODE_6", "PD_MODE_0"];
const {LAYER_LOCK_BASE} = require("../../core/data/user-keycodes");
const words = publishedModel(profileDocument({keys: {0: Object.fromEntries(CAPS.map((name, at) => [at, name === "LOCK_LAYER(3)" ? LAYER_LOCK_BASE + 3 : name]))}}));
// The cap core publishes for a key, by what it means; an unmapped one where none is placed.
const cap = (semantic) => words.layers[0].positions.find((position) => position.semantic === semantic);

const STYLES = {tap: "TAP_SENDS", hold: "PRESS_AND_HOLD_UNTIL_RELEASE", longHold: "PRESS_AND_HOLD_UNTIL_RELEASE"};
// The behaviour core publishes for a key on Base with these steps stored, as
// the editor opens it; with none, the key's own row, stored nowhere.
function behaviourOf(keycode, steps = []) {
    const doc = () => profileDocument({keys: {0: {0: keycode}}});
    const stored = steps.map(({tapCount, ...tiers}) => ({tapCount, ...Object.fromEntries(Object.entries(tiers).map(([tier, branch]) => [tier, {style: STYLES[tier], repeatHz: "0", ...branch}]))}));
    const posted = [...(behaviourEditorRow(publishedModel(doc()), keycode)?.stored ? [edits.deleteBehaviour(keycode)] : []),
        ...(stored.length ? [edits.saveBehaviour({keycode, steps: stored})] : [])];
    return behaviourEditorRow(publishedModel(doc(), {edits: posted}), keycode);
}

test("visible macro keycodes use the MACRO_n name for both QMK's named and unnamed values", () => {
    // Which names are a macro's is core's (qmkKeyKinds), as is the name each
    // stored one is known by (qmkKeycodeAliases).
    const model = publishedModel();
    assert.equal(visibleKeycode(model, "QK_MACRO_9"), "MACRO_9");
    assert.equal(visibleKeycode(model, "0x773F"), "MACRO_63");
    assert.equal(visibleKeycode(model, "QK_USER_16"), "QK_USER_16", "other stored identities keep their existing display");
    assert.equal(visibleKeycode({qmkKeycodeAliases: model.qmkKeycodeAliases}, "QK_MACRO_9"), "QK_MACRO_9", "a name core does not say is a macro's is not taken for one");
    assert.equal(visibleKeycode({}, "QK_MACRO_9"), "QK_MACRO_9", "an unadvertised alias is not invented");
});

test("a bare value the keyboard names reads by that name, and a named keycode keeps its own", () => {
    const model = {qmkKeycodeAliases: {"0x7F01": "CUSTOM_KEY_1", "0x7E85": "PD_MODE_5", QK_USER_16: "PD_MODE_0"}};
    assert.equal(visibleKeycode(model, "0x7F01"), "CUSTOM_KEY_1");
    assert.equal(visibleKeycode(model, "0x7E85"), "PD_MODE_5");
    assert.equal(visibleKeycode(model, "QK_USER_16"), "QK_USER_16");
    assert.equal(visibleKeycode(model, "0x7F09"), "0x7F09", "a value nothing names stays a value");
});

test("an action is named by its words, with the stored keycode only where it adds something", () => {
    const model = {qmkKeyLabels: {"MO(2)": "Hold Symbol", "0x7F04": "VoiceInk", KC_A: "A"}, qmkKeycodeAliases: {"0x7F04": "CUSTOM_KEY_4"}};
    assert.deepEqual(actionNaming(model, "MO(2)"), {words: "Hold Symbol", stored: "MO(2)"});
    assert.deepEqual(actionNaming(model, "0x7F04"), {words: "VoiceInk", stored: "CUSTOM_KEY_4"});
    assert.deepEqual(actionNaming({}, "LT(3,KC_F)"), {words: "LT(3,KC_F)", stored: ""}, "an unnamed action is not repeated");
});

test("a key face uses the model's own resolution, and names the layer a dual-role key reaches", () => {
    assert.deepEqual(keyFace(cap("KC_TRANSPARENT"), words), {main: "▽", sub: "", kind: "transparent"});
    assert.deepEqual(keyFace({keycode: "KC_NO", display: ""}, words), {main: "", sub: "", kind: "disabled"});
    assert.deepEqual(keyFace({keycode: "KC_TRNS", display: "▽"}, words).kind, "transparent", "by any name core reads it under");
    assert.deepEqual(keyFace({keycode: "XXXXXXX", display: ""}, words).kind, "disabled");
    assert.deepEqual(keyFace({keycode: "KC_A", display: "A"}, words), {main: "A", sub: "", kind: "key"});
    assert.deepEqual(keyFace(cap("LT(2,KC_F)"), words), {main: "F", sub: "Symbols", kind: "layer"});
    assert.deepEqual(keyFace(cap("MO(2)"), words), {main: "Hold Symbols", sub: "", kind: "layer"});
    assert.deepEqual(keyFace(cap("LT(2,KC_F)"), null), {main: "F", sub: "", kind: "key"},
        "with no model, the interface never reads a layer out of a keycode's name");
    assert.deepEqual(keyFace(cap("KC_TRANSPARENT"), null).kind, "key", "nor whether a key is transparent (qmkKeyKinds)");
    assert.equal(keyFace(undefined, null).kind, "none");
});

test("tiers count the branches that use them, so a key shows what it can do", () => {
    const thumb = behaviourOf("LT(2,KC_SPACE)", [
        {tapCount: 0, tap: {action: "LOCK_LAYER(2)"}, hold: {action: "MO(2)"}},
        {tapCount: 1, tap: {action: "KC_MPLY"}, hold: {action: "KC_ESC"}, longHold: {action: "LOCK_LAYER(1)"}},
        {tapCount: 2, tap: {action: "KC_MNXT"}, longHold: {action: "KC_MNXT"}},
    ]);
    assert.deepEqual(behaviourTiers(thumb), [{kind: "tap", count: 3}, {kind: "hold", count: 2}, {kind: "long", count: 2}]);
    assert.deepEqual(behaviourTiers(undefined), []);
});

test("the behaviour editor keeps every supported tap column visible", () => {
    const behaviour = {steps: [{tapCount: 0, tap: {action: "KC_A"}}, {tapCount: 3, hold: {action: "KC_B"}}]};
    const steps = behaviourGridSteps(behaviour, 5);
    assert.deepEqual(steps.map((step) => step.tapCount), [0, 1, 2, 3, 4]);
    assert.equal(steps[0], behaviour.steps[0], "populated cells keep the device-backed row");
    assert.deepEqual(steps[1], {tapCount: 1}, "missing cells are empty editor slots");
    assert.equal(steps[3], behaviour.steps[1]);
    assert.equal(behaviourGridSteps(behaviour, 3).length, 3, "a lower advertised device limit is respected");
    // Core publishes an empty cell for every tap count the grid can show.
    const {GRID_TAP_COUNTS} = require("../../core/model/empty-cells");
    assert.equal(behaviourGridSteps(behaviour, 255).length, GRID_TAP_COUNTS, "the grid shows no more tap counts than core publishes cells for");
});

test("a key for an empty pointing slot says so on one line, as core names it", () => {
    // The line across a cap is a dual-role key's; this key holds or locks a
    // slot that holds nothing, which its name already says.
    assert.deepEqual(keyFace(cap("PD_MODE_6"), words), {main: "Slot 6 · hold (empty)", sub: "", kind: "key"});
    assert.equal(keyFace(cap("PD_MODE_0"), words).sub, "");
});

test("a key's name outside a cap is the core's whole name, not the cap's short legend", () => {
    assert.equal(keyName(cap("LT(3,KC_F)"), words), "F / Navigation",
        "a layer-tap is a layer key too, which its cap's top line alone does not say");
    assert.equal(keyName(cap("KC_A"), words), "A");
    assert.equal(keyName(cap("KC_TRANSPARENT"), words), "Transparent");
    assert.equal(keyName(cap("KC_NO"), words), "Unmapped");
});

test("a layer-tap cap names its layer on the second line, as the core names it", () => {
    assert.deepEqual(keyFace(cap("LT(3,KC_SLASH)"), words), {main: "/", sub: "Navigation", kind: "layer"});
    assert.deepEqual(keyFace(cap("OSL(3)"), words), {main: "Navigation", sub: "one-shot", kind: "layer"});
});

test("a key is transparent, disabled, a macro's or a custom key's only as core publishes it", () => {
    // Every name core publishes a kind under reads as that kind, and a key on
    // the board is drawn by it: the interface keeps no list of these names.
    const model = publishedModel(profileDocument({keys: {0: {0: "KC_TRANSPARENT", 1: "KC_NO", 2: "MACRO_3", 3: "CUSTOM_KEY_3", 4: "KC_A"}}}));
    const kindOf = (/** @type {string} */ keycode) => keyIdentity(model, keycode).kind;
    for (const [name, kind] of Object.entries(model.qmkKeyKinds)) assert.equal(kindOf(name), kind, name);
    const [transparent, disabled, macro, custom, plain] = model.layers[0].positions;
    assert.deepEqual([transparent, disabled, macro, custom, plain].map((position) => kindOf(position.keycode)), ["transparent", "disabled", "macro", "customKey", undefined]);
    assert.deepEqual([transparent, disabled, plain].map((position) => keyFace(position, model).kind), ["transparent", "disabled", "key"]);
    assert.equal(kindOf("0x1"), "transparent", "a number however it is written");
    assert.equal(kindOf("LSFT(KC_NO)"), undefined, "a modified key is a key");
});

test("the line across a cap marks a dual-role key: tap above, hold below", () => {
    const face = (semantic) => keyFace(cap(semantic), words);
    // A dual-role layer key names its layer, and below what it does to it.
    assert.deepEqual(face("OSL(3)"), {main: "Navigation", sub: "one-shot", kind: "layer"});
    assert.deepEqual(face("TT(1)"), {main: "Numbers", sub: "tap-toggle", kind: "layer"});
    // Any other layer key reads by its whole name on one line, as core names it.
    for (const [keycode, display] of [["MO(1)", "Hold Numbers"], ["TG(1)", "Lock Numbers"], ["TO(2)", "Move to Symbols"], ["DF(0)", "Default Base"], ["PDF(0)", "Default Base"],
        ["LM(1,MOD_LSFT)", "Numbers + Shift"]]) assert.deepEqual(face(keycode), {main: display, sub: "", kind: "layer"}, keycode);
    assert.equal(cap("LOCK_LAYER(3)").keycode, "0x7EC3", "a layer lock is stored as a user slot");
    assert.deepEqual(face("LOCK_LAYER(3)"), {main: "Lock Navigation", sub: "", kind: "layer"}, "however it is stored");
    // A mod-tap's second line is the modifier core names for its hold.
    assert.deepEqual(face("MT(MOD_LSFT,KC_A)"), {main: "A", sub: "Shift", kind: "key"});
    assert.equal(face("MT(MOD_LCTL|MOD_LSFT|MOD_LGUI,KC_A)").sub, "Ctrl+Shift+GUI");
    assert.deepEqual(face("KC_A"), {main: "A", sub: "", kind: "key"}, "a plain A has no second line");
});

test("a behaviour cell reads by the core's name for its key, and by its keycode when it has none", () => {
    // The core names every keycode, layer keys by their layer's name
    // (core/model/key-names.js); the cell never composes a name itself.
    const names = keyNames.profileKeyNames({layers: ["Base", "Numbers"], actionsKnown: true});
    const model = {qmkKeyLabels: {KC_HASH: "#", KC_F: "F", ...names.labels, "LT(1,KC_F)": keyNames.keyLabel(names, 0x4109)},
        qmkKeyKinds: publishedModel().qmkKeyKinds};
    assert.equal(cellLabel(model, {action: "KC_HASH"}), "#");
    assert.equal(cellLabel(model, {action: "LSFT(KC_ENTER)", label: "Shift+Enter"}), "Shift+Enter", "an expression takes the core's name");
    assert.equal(cellLabel(model, {action: "CUSTOM_KEY_2", label: "Left Ctrl + K"}), "Left Ctrl + K", "a custom key's own action reads as its shortcut");
    assert.equal(cellLabel(model, {action: "MO(1)"}), "Hold Numbers", "a layer action names the layer, in the picker's words");
    assert.equal(cellLabel(model, {action: "LOCK_LAYER(1)"}), "Lock Numbers");
    assert.equal(cellLabel(model, {action: "LT(1,KC_F)"}), "F / Numbers");
    assert.equal(cellLabel(model, {action: "QK_BOOT"}), "QK_BOOT", "no clean name: the keycode is the label");
});

// A branch may hold a custom key by the bare number a combo stores, cased
// either way: the same keycode reads the same.
test("a custom key's branch reads the same under its number as under its name", () => {
    const model = publishedModel();
    for (const action of ["CUSTOM_KEY_0", "0x7F00", "0x7f00"]) {
        assert.equal(cellLabel(model, {action, label: "Left Ctrl + K"}), "Left Ctrl + K", `${action}: as the shortcut it sends`);
        assert.equal(cellLabel(model, {action}), "Right Thumb", `${action}: with no shortcut, by its name`);
    }
});

test("an empty tap is the key's own tap, once per press, inside the deepest tap count and past it", () => {
    const behaviour = behaviourOf("MT(MOD_LSFT,KC_S)", [{tapCount: 2, hold: {action: "KC_A"}}]);
    const {tap, hold} = behaviour.builtIn;
    assert.deepEqual([tap.action, hold.action, hold.label], ["KC_S", "LSFT(KC_NO)", "Shift"], "the key's own tap, and Shift held");
    assert.deepEqual(inheritedBranch(behaviour, {tapCount: 0}, "hold"), hold);
    assert.deepEqual(inheritedBranch(behaviour, {tapCount: 0}, "tap"), tap);
    assert.deepEqual(inheritedBranch(behaviour, {tapCount: 1}, "tap"), {...tap, times: 2}, "a double tap sends the key's tap twice");
    assert.deepEqual(inheritedBranch(behaviour, {tapCount: 2, hold: {action: "KC_A"}}, "tap"), {...tap, times: 3});
    assert.deepEqual(inheritedBranch(behaviour, {tapCount: 3}, "tap"), {...tap, times: 4}, "past the deepest count every press is the key's own tap");
    const unstored = behaviourOf("MT(MOD_LSFT,KC_S)");
    assert.deepEqual(inheritedBranch(unstored, {tapCount: 1}, "tap"), {...unstored.builtIn.tap, times: 2, separate: true}, "with no row each press is a single tap");
    assert.deepEqual(inheritedBranch(unstored, {tapCount: 0}, "tap"), unstored.builtIn.tap);
    assert.deepEqual(inheritedBranch(behaviour, {tapCount: 1, tap: {action: "KC_B"}}, "tap"), null, "an authored cell replaces it");
    assert.deepEqual(inheritedBranch(behaviour, {tapCount: 0, hold: {action: "KC_A"}}, "hold"), null, "an authored cell replaces it");
    assert.deepEqual(inheritedBranch(behaviour, {tapCount: 0, longHold: {action: "KC_A"}}, "hold"), hold, "a dual-role hold stays beside a long hold");
    assert.deepEqual(inheritedBranch(behaviour, {tapCount: 1}, "hold"), null, "later presses have no built-in hold");
    assert.deepEqual(inheritedBranch(behaviour, {tapCount: 0}, "long"), null, "no key has a built-in long hold");
    assert.deepEqual(inheritedBranch({keycode: "KC_A", builtIn: {}}, {tapCount: 0}, "hold"), null);
});

// Firmware D-F64: nothing from one tap count reaches another, so an empty
// later Tap is the key's own, never the Single tap the row sets.
test("an empty later tap is the key's own tap, never the row's Single tap", () => {
    const first = {style: "TAP_SENDS", action: "LGUI(KC_BACKSPACE)"};
    const hold = {style: "PRESS_AND_HOLD_UNTIL_RELEASE", action: "KC_K"};
    const del = behaviourOf("KC_DELETE", [{tapCount: 1, hold}, {tapCount: 2, longHold: hold}]);
    const {tap} = del.builtIn;
    assert.equal(tap.action, "KC_DELETE", "Delete taps itself");
    assert.deepEqual(inheritedBranch(del, {tapCount: 2, longHold: hold}, "tap"), {...tap, times: 3}, "three quick taps, three Deletes");
    assert.deepEqual(inheritedBranch(del, {tapCount: 3}, "tap"), {...tap, times: 4}, "four quick taps, four Deletes");
    const set = behaviourOf("KC_DELETE", [{tapCount: 0, tap: first}, {tapCount: 1, hold}, {tapCount: 2, longHold: hold}]);
    assert.deepEqual(inheritedBranch(set, {tapCount: 1, hold}, "tap"), {...tap, times: 2}, "the key's own tap, not the Single tap the row sets");
    assert.deepEqual(inheritedBranch(set, {tapCount: 0, tap: first}, "tap"), null, "the first tap is its own cell");
    const custom = behaviourOf("CUSTOM_KEY_0", [{tapCount: 0, tap: first}, {tapCount: 1, hold}]);
    assert.equal(custom.builtIn.tap, undefined, "a custom key without a shortcut has no tap of its own");
    assert.deepEqual(inheritedBranch(custom, {tapCount: 1, hold}, "tap"), null, "so its later taps send nothing");
    assert.deepEqual(inheritedBranch(custom, {tapCount: 2}, "tap"), null, "past the depth too");
    const esc = behaviourOf("KC_ESCAPE", [{tapCount: 0, tap: first}, {tapCount: 2, tap: {action: "KC_MPLY"}}]);
    assert.deepEqual(inheritedBranch(esc, {tapCount: 1}, "tap"), {...esc.builtIn.tap, times: 2}, "an empty count inside the depth sends Esc twice");
    assert.deepEqual(inheritedBranch(esc, {tapCount: 3}, "tap"), {...esc.builtIn.tap, times: 4}, "past the depth every press is Esc");
});

// A Single tap set to Transparent is the exception: the key below is the
// key's tap wherever a Tap is empty, so a pointing-mode key still types it.
test("a Transparent Single tap makes the key below the key's tap", () => {
    const transparent = {style: "TAP_SENDS", action: "KC_TRNS"};
    const lock = {style: "PRESS_AND_HOLD_UNTIL_RELEASE", action: "KC_B"};
    const drag = behaviourOf("PD_MODE_0", [{tapCount: 0, tap: transparent}, {tapCount: 1, hold: lock}]);
    assert.equal(drag.builtIn.transparentTap, true);
    const below = drag.builtIn.tap;
    assert.equal(below.action, drag.steps[0].tap.action, "the Transparent Single tap");
    assert.deepEqual(inheritedBranch(drag, drag.steps[1], "tap"), {...below, times: 2, below: true}, "two quick taps type the key below twice");
    assert.deepEqual(inheritedBranch(drag, {tapCount: 2}, "tap"), {...below, times: 3, below: true}, "and past the depth, three");
    assert.equal(behaviourOf("PD_MODE_0", [{tapCount: 1, hold: lock}]).builtIn.tap, undefined, "without it the mode key taps nothing");
});

test("a bare modifier taps and holds itself like any plain key", () => {
    const optionHeld = {style: "PRESS_AND_HOLD_UNTIL_RELEASE", action: "KC_LEFT_ALT"};
    const shift = {style: "TAP_SENDS", action: "OSM(MOD_LSFT)"};
    const command = behaviourOf("KC_LEFT_GUI", [{tapCount: 1, hold: optionHeld, longHold: optionHeld}, {tapCount: 2, tap: shift}]);
    const {tap, hold} = command.builtIn;
    assert.deepEqual([tap.action, hold.action, hold.fallback], ["KC_LEFT_GUI", "KC_LEFT_GUI", true]);
    assert.deepEqual(inheritedBranch(command, {tapCount: 0}, "tap"), tap, "a lone tap sends it");
    assert.deepEqual(inheritedBranch(command, {tapCount: 0}, "hold"), hold, "held, it is Left Command until release");
    assert.deepEqual(impliedBranch(command, {tapCount: 0}, "long"), {meaning: "continues", hold});
    assert.deepEqual(inheritedBranch(command, {tapCount: 1, hold: optionHeld, longHold: optionHeld}, "tap"), {...tap, times: 2}, "two quick taps send it twice");
});

// Firmware's host harness, driving these rows: a third press held sends
// One-shot Shift on release, however long it is held; on a later tap count any
// key does, a layer key too. Past the depth, three taps and a held fourth send
// Left Command three times and then hold it.
test("the grid shows a tap sent on release on a count with no hold of any kind", () => {
    const optionHeld = {style: "PRESS_AND_HOLD_UNTIL_RELEASE", action: "KC_LEFT_ALT"};
    const shift = {style: "TAP_SENDS", action: "OSM(MOD_LSFT)"};
    const command = behaviourOf("KC_LEFT_GUI", [{tapCount: 1, hold: optionHeld}, {tapCount: 2, tap: shift}]);
    const third = command.steps.find((step) => step.tapCount === 2);
    for (const kind of ["hold", "long"]) {
        assert.deepEqual(impliedBranch(command, third, kind), {meaning: "tapsOnRelease", tap: third.tap}, `${kind}: letting go sends the tap`);
    }
    const {tap, hold} = command.builtIn;
    assert.deepEqual(impliedBranch(command, {tapCount: 3}, "hold"), {meaning: "afterTaps", tap: {...tap, times: 3}, hold}, "past the depth: three Left Commands, then Left Command held");
    assert.deepEqual(impliedBranch(command, {tapCount: 3}, "long"), {meaning: "continues", hold});
    assert.deepEqual(impliedBranch(command, third, "tap"), null);
    const layer = behaviourOf("MO(1)", [{tapCount: 1, tap: shift}]);
    assert.deepEqual(impliedBranch(layer, layer.steps[0], "hold"), {meaning: "tapsOnRelease", tap: layer.steps[0].tap}, "a layer key's later tap count too");
    const custom = behaviourOf("CUSTOM_KEY_0", [{tapCount: 0, tap: shift}]);
    assert.deepEqual(impliedBranch(custom, custom.steps[0], "hold"), {meaning: "tapsOnRelease", tap: custom.steps[0].tap}, "a key with no hold of its own taps on release");
    assert.deepEqual(impliedBranch(custom, {tapCount: 1}, "hold"), {meaning: "asSingle", as: {meaning: "tapsOnRelease", tap: custom.steps[0].tap}}, "a later press is a Single tap of its own");
});

// Firmware D-F64: a tap count with nothing set is the key pressed that many
// times with the last held, inside the deepest tap count as past it.
test("a later tap count with nothing set taps the key, then holds it", () => {
    const e = behaviourOf("KC_E", [{tapCount: 3, tap: {style: "TAP_SENDS", action: "KC_X"}}]);
    const {tap, hold} = e.builtIn;
    assert.deepEqual(impliedBranch(e, {tapCount: 1}, "hold"), {meaning: "afterTaps", tap: {...tap, times: 1}, hold}, "E, then E held");
    assert.deepEqual(impliedBranch(e, {tapCount: 2}, "hold"), {meaning: "afterTaps", tap: {...tap, times: 2}, hold});
    const layer = behaviourOf("MO(1)", [{tapCount: 2, tap: {style: "TAP_SENDS", action: "KC_X"}}]);
    assert.deepEqual(impliedBranch(layer, {tapCount: 1}, "hold"), {meaning: "afterTaps", hold: layer.builtIn.hold}, "a layer key taps nothing first");
    const custom = behaviourOf("CUSTOM_KEY_0", [{tapCount: 2, tap: {style: "TAP_SENDS", action: "KC_X"}}]);
    assert.deepEqual(impliedBranch(custom, {tapCount: 1}, "hold"), null, "a custom key without a shortcut does nothing");
});

// The Single tap keeps the key's own hold beside a set Tap: Right Alt whose
// Single tap toggles a lock still holds Right Alt.
test("a set Single tap leaves the key's own hold, and its later taps the key's own tap", () => {
    const lock = {style: "TAP_SENDS", action: "KC_X"};
    const zoom = {style: "PRESS_AND_HOLD_UNTIL_RELEASE", action: "KC_Z"};
    const alt = behaviourOf("KC_RIGHT_ALT", [{tapCount: 0, tap: lock}, {tapCount: 1, hold: zoom}]);
    const {tap, hold} = alt.builtIn;
    assert.deepEqual(inheritedBranch(alt, alt.steps[0], "hold"), hold, "held, Right Alt");
    assert.deepEqual(impliedBranch(alt, alt.steps[0], "hold"), null);
    assert.deepEqual(inheritedBranch(alt, alt.steps[1], "tap"), {...tap, times: 2}, "a quick double tap sends Right Alt twice");
});

// Firmware's host harness: a row that sets only its Single tap sends each tap
// as it is released, never buffered, and a second press held runs the row's
// Single tap Hold, since the key never runs a multi tap.
test("a row with only its Single tap: each press is a Single tap of its own", () => {
    const altHeld = {style: "PRESS_AND_HOLD_UNTIL_RELEASE", action: "KC_LEFT_ALT"};
    const backspace = behaviourOf("KC_BACKSPACE", [{tapCount: 0, hold: altHeld}]);
    const {tap} = backspace.builtIn;
    assert.deepEqual(inheritedBranch(backspace, {tapCount: 1}, "tap"), {...tap, times: 2, separate: true}, "two presses, two Backspaces, each as it is released");
    assert.deepEqual(inheritedBranch(backspace, {tapCount: 4}, "tap"), {...tap, times: 5, separate: true});
    assert.deepEqual(impliedBranch(backspace, {tapCount: 1}, "hold"), {meaning: "asSingle", as: {kind: "hold", branch: backspace.steps[0].hold}}, "held, the second press runs the row's Single tap Hold");
    assert.deepEqual(impliedBranch(backspace, {tapCount: 1}, "long"), {meaning: "asSingle", as: {meaning: "continues", hold: backspace.steps[0].hold}});
});

test("a plain key's fallback hold gives way to any authored first-press hold or long hold", () => {
    const behaviour = behaviourOf("KC_MINUS");
    const {hold} = behaviour.builtIn;
    assert.deepEqual([hold.action, hold.fallback], ["KC_MINUS", true], "a plain key's hold is itself, held");
    assert.deepEqual(inheritedBranch(behaviour, {tapCount: 0}, "hold"), hold);
    const long = behaviourOf("KC_MINUS", [{tapCount: 0, longHold: {action: "KC_A"}}]);
    assert.deepEqual(inheritedBranch(long, long.steps[0], "hold"), null, "an authored long hold");
    const held = behaviourOf("KC_MINUS", [{tapCount: 0, hold: {action: "KC_A"}}]);
    assert.deepEqual(inheritedBranch(held, held.steps[0], "hold"), null, "an authored hold");
});

test("with no Long hold set, a press's Hold carries on past the Long hold threshold", () => {
    const plain = behaviourOf("KC_MINUS");
    const fallback = plain.builtIn.hold;
    assert.equal(fallback.fallback, true);
    assert.deepEqual(impliedBranch(plain, {tapCount: 0}, "long"), {meaning: "continues", hold: fallback}, "the fallback hold carries on");
    for (const style of ["PRESS_AND_HOLD_UNTIL_RELEASE", "TAP_AT_HOLD_THRESHOLD", "TAP_ON_RELEASE_AFTER_HOLD", "REPEAT_WHILE_HELD"]) {
        const hold = {style, action: "KC_A"};
        const row = behaviourOf("KC_MINUS", [{tapCount: 2, hold: {...hold, ...(style === "REPEAT_WHILE_HELD" ? {repeatHz: "20"} : {})}}]);
        assert.deepEqual(impliedBranch(row, row.steps[0], "long"), {meaning: "continues", hold: row.steps[0].hold}, style);
    }
    const lt = behaviourOf("LT(3,KC_SLASH)");
    assert.deepEqual(impliedBranch(lt, {tapCount: 0}, "long").hold.action, "MO(3)", "a built-in layer hold carries on");
    const long = behaviourOf("KC_MINUS", [{tapCount: 0, longHold: {action: "KC_B"}}]);
    assert.deepEqual(impliedBranch(long, long.steps[0], "long"), null, "a set Long hold takes over");
    assert.deepEqual(impliedBranch(plain, {tapCount: 1}, "long"), {meaning: "asSingle", as: {meaning: "continues", hold: fallback}}, "with no row a second press is a single tap of its own");
    assert.deepEqual(impliedBranch(plain, {tapCount: 0}, "tap"), null);
});

test("with only a Long hold set, a release before it sends the press's tap on keys whose tap survives a hold", () => {
    const longHold = {style: "PRESS_AND_HOLD_UNTIL_RELEASE", action: "KC_B"};
    const set = {style: "TAP_SENDS", action: "KC_C"};
    const plain = behaviourOf("KC_MINUS", [{tapCount: 0, longHold}, {tapCount: 1, longHold}, {tapCount: 2, tap: set, longHold}]);
    const {tap} = plain.builtIn;
    assert.equal(plain.builtIn.releaseTaps, true, "a plain key's tap survives a hold");
    assert.deepEqual(impliedBranch(plain, plain.steps[0], "hold"), {meaning: "tapsBeforeLong", tap});
    assert.deepEqual(impliedBranch(plain, plain.steps[1], "hold"), {meaning: "tapsBeforeLong", tap: {...tap, times: 2}}, "the count's own built-in tap");
    assert.deepEqual(impliedBranch(plain, plain.steps[2], "hold"), {meaning: "tapsBeforeLong", tap: plain.steps[2].tap}, "the count's set tap");
    const both = behaviourOf("KC_MINUS", [{tapCount: 0, hold: {action: "KC_A"}, longHold}]);
    assert.deepEqual(impliedBranch(both, both.steps[0], "hold"), null, "a set Hold is the Hold");
    assert.deepEqual(impliedBranch(behaviourOf("KC_MINUS"), {tapCount: 0}, "hold"), null, "without a Long hold the fallback hold is shown instead");
    const custom = behaviourOf("CUSTOM_KEY_0", [{tapCount: 0, longHold}]);
    assert.deepEqual(impliedBranch(custom, custom.steps[0], "hold"), null, "no tap to send");
    const customTap = behaviourOf("CUSTOM_KEY_0", [{tapCount: 0, tap: set, longHold}]);
    assert.deepEqual(impliedBranch(customTap, customTap.steps[0], "hold"), {meaning: "tapsBeforeLong", tap: customTap.steps[0].tap});
    const layer = behaviourOf("MO(3)", [{tapCount: 0, tap: set, longHold}]);
    assert.deepEqual(impliedBranch(layer, layer.steps[0], "hold"), null, "a layer key's Single tap sends no tap once held");
    const lt = behaviourOf("LT(3,KC_SLASH)", [{tapCount: 0, longHold}]);
    assert.deepEqual(impliedBranch(lt, lt.steps[0], "hold"), null, "a dual-role key's own hold fills the cell");
});

test("a dual-role key names what its tap sends and what its hold does", () => {
    assert.deepEqual(dualRole(words, cap("LT(3,KC_F)")), {tap: "F", hold: {layer: 3, name: "Navigation"}},
        "the layer its hold reaches is the one the core names");
    assert.deepEqual(dualRole(words, cap("MT(MOD_LSFT,KC_A)")), {tap: "A", hold: {modifier: "Shift"}});
    assert.equal(dualRole(words, cap("MO(3)")), null, "a layer key has no tap half");
    assert.equal(dualRole(words, cap("KC_F")), null);
});
