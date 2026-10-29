import assert from "node:assert/strict";
import test from "node:test";
import {actionNaming, dualRole, keyFace, keyKindOf, layerOfKeycode, keyName, visibleKeycode, cellLabel, behaviourFor, canonicalKeycode, behaviourListeningTo, behaviourTiers, behaviourGridSteps, behaviourDepth, behaviourGridLayout, inheritedBranch, impliedBranch} from "../../webview/view/keyface.mjs";
import {createRequire} from "node:module";
import keyNames from "../../core/model/key-names.js";
import {behaviourEditorRow} from "../../webview/view/behavior-editor.mjs";
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
    const model = {keyBehaviors: [thumb]};
    const behaviour = behaviourFor(model, "LT(2,KC_SPACE)");
    assert.deepEqual(behaviourTiers(behaviour), [{kind: "tap", count: 3}, {kind: "hold", count: 2}, {kind: "long", count: 2}]);
    assert.deepEqual(behaviourTiers(undefined), []);
    assert.equal(behaviourFor(model, "KC_A"), undefined);
});

test("the behaviour editor keeps every supported tap column visible", () => {
    const behaviour = {steps: [{tapCount: 0, tap: {action: "KC_A"}}, {tapCount: 3, hold: {action: "KC_B"}}]};
    const steps = behaviourGridSteps(behaviour, 5);
    assert.deepEqual(steps.map((step) => step.tapCount), [0, 1, 2, 3, 4]);
    assert.equal(steps[0], behaviour.steps[0], "populated cells keep the device-backed row");
    assert.deepEqual(steps[1], {tapCount: 1}, "missing cells are empty editor slots");
    assert.equal(steps[3], behaviour.steps[1]);
    assert.equal(behaviourGridSteps(behaviour, 3).length, 3, "a lower advertised device limit is respected");
});

test("a key for an empty pointing slot says so on one line, as core names it", () => {
    // The line across a cap is a dual-role key's; this key holds or locks a
    // slot that holds nothing, which its name already says.
    assert.deepEqual(keyFace(cap("PD_MODE_6"), words), {main: "Slot 6 · hold (empty)", sub: "", kind: "key"});
    assert.equal(keyFace(cap("PD_MODE_0"), words).sub, "");
});

test("a picked key finds the behaviour it would collide with, whatever its spelling", () => {
    const model = {
        qmkKeycodeAliases: {KC_ENT: "KC_ENTER", KC_ENTER: "KC_ENTER", KC_SLSH: "KC_SLASH", KC_SLASH: "KC_SLASH"},
        keyBehaviors: [{keycode: "KC_ENTER"}, {keycode: "LT(3,KC_SLASH)"}, {keycode: "PD_MODE_0"}],
    };
    assert.equal(canonicalKeycode(model, "KC_ENT"), "KC_ENTER");
    assert.equal(canonicalKeycode(model, "LT(3, KC_SLSH)"), "LT(3,KC_SLASH)");
    assert.equal(behaviourListeningTo(model, "KC_ENT").keycode, "KC_ENTER");
    assert.equal(behaviourListeningTo(model, "LT(3, KC_SLSH)").keycode, "LT(3,KC_SLASH)");
    assert.equal(behaviourListeningTo(model, "PD_MODE_0").keycode, "PD_MODE_0");
    assert.equal(behaviourListeningTo(model, "KC_A"), undefined);
});

test("a key's name outside a cap is the core's whole name, not the cap's short legend", () => {
    assert.equal(keyName(cap("LT(3,KC_F)"), words), "F / Navigation",
        "a layer-tap is a layer key too, which its cap's top line alone does not say");
    assert.equal(keyName(cap("KC_A"), words), "A");
    assert.equal(keyName(cap("KC_TRANSPARENT"), words), "Transparent");
    assert.equal(keyName(cap("KC_NO"), words), "Unmapped");
});

test("a layer key knows the layer the core says it acts on, however the keyboard stores it", () => {
    const model = {qmkKeycodeAliases: {QK_USER_31: "LOCK_LAYER(3)", KC_ENT: "KC_ENTER"},
        qmkKeyLayers: {"MO(3)": 3, "LT(2,KC_J)": 2, "LOCK_LAYER(3)": 3, "LGUI(KC_3)": undefined}};
    assert.equal(layerOfKeycode(model, "MO(3)"), 3);
    assert.equal(layerOfKeycode(model, "LT(2,KC_J)"), 2);
    assert.equal(layerOfKeycode(model, "LT(2, KC_J)"), 2, "however the expression is spaced");
    assert.equal(layerOfKeycode(model, "QK_USER_31"), 3, "a layer lock stored as a user slot");
    assert.equal(layerOfKeycode(model, "KC_ENT"), null);
    assert.equal(layerOfKeycode(model, "LGUI(KC_3)"), null, "a number inside a keycode is not a layer");
    assert.equal(layerOfKeycode(model, "MO(4)"), null, "a layer the core has not named is not worked out here");
});

test("a layer-tap cap names its layer on the second line, as the core names it", () => {
    assert.deepEqual(keyFace(cap("LT(3,KC_SLASH)"), words), {main: "/", sub: "Navigation", kind: "layer"});
    assert.deepEqual(keyFace(cap("OSL(3)"), words), {main: "Navigation", sub: "one-shot", kind: "layer"});
});

test("a key is transparent, disabled, a macro's or a custom key's only as core publishes it", () => {
    // Every name core publishes a kind under reads as that kind, and a key on
    // the board is drawn by it: the interface keeps no list of these names.
    const model = publishedModel(profileDocument({keys: {0: {0: "KC_TRANSPARENT", 1: "KC_NO", 2: "MACRO_3", 3: "CUSTOM_KEY_3", 4: "KC_A"}}}));
    for (const [name, kind] of Object.entries(model.qmkKeyKinds)) assert.equal(keyKindOf(model, name), kind, name);
    const [transparent, disabled, macro, custom, plain] = model.layers[0].positions;
    assert.deepEqual([transparent, disabled, macro, custom, plain].map((position) => keyKindOf(model, position)), ["transparent", "disabled", "macro", "customKey", undefined]);
    assert.deepEqual([transparent, disabled, plain].map((position) => keyFace(position, model).kind), ["transparent", "disabled", "key"]);
    assert.equal(keyKindOf(model, "0x1"), "transparent", "a number however it is written");
    assert.equal(keyKindOf(model, "LSFT(KC_NO)"), undefined, "a modified key is a key");
});

test("a value the keyboard names by its hex reads as the name core knows it by, however the hex is written", () => {
    const model = publishedModel();
    assert.equal(model.qmkKeycodeAliases["0x7F00"], "CUSTOM_KEY_0", "core names the custom key's bare value");
    assert.equal(canonicalKeycode(model, "0x7F00"), "CUSTOM_KEY_0");
    assert.equal(canonicalKeycode(model, "0x7f00"), "CUSTOM_KEY_0");
    assert.equal(canonicalKeycode(model, "LSFT(0x7F00)"), "LSFT(CUSTOM_KEY_0)", "inside an expression too");
    assert.equal(canonicalKeycode(model, "0x7E86"), "PD_MODE_6");
    assert.equal(canonicalKeycode(model, "0x7F7F"), "CUSTOM_KEY_127");
    assert.equal(canonicalKeycode(model, "0x0041"), "0x0041", "a value nothing names stays as written");
    assert.equal(behaviourListeningTo({...model, keyBehaviors: [{keycode: "CUSTOM_KEY_0"}]}, "0x7f00")?.keycode, "CUSTOM_KEY_0");
});

test("a picked key matches its behaviour row however its modifiers are spelled", () => {
    const model = {qmkKeycodeAliases: {KC_C: "KC_C", KC_ENT: "KC_ENTER", KC_ENTER: "KC_ENTER"}, keyBehaviors: [{keycode: "LGUI(KC_C)"}, {keycode: "LCTL(LSFT(KC_ENTER))"}]};
    assert.equal(canonicalKeycode(model, "G(KC_C)"), "LGUI(KC_C)");
    assert.equal(behaviourListeningTo(model, "G(KC_C)")?.keycode, "LGUI(KC_C)", "the picker's Cmd wrapper");
    assert.equal(behaviourListeningTo(model, "LCMD(KC_C)")?.keycode, "LGUI(KC_C)");
    assert.equal(behaviourListeningTo(model, "S(C(KC_ENT))")?.keycode, "LCTL(LSFT(KC_ENTER))", "nesting order and aliases");
    assert.equal(behaviourListeningTo(model, "LCS(KC_ENT)")?.keycode, "LCTL(LSFT(KC_ENTER))", "a combined wrapper");
    assert.equal(behaviourListeningTo(model, "C(KC_C)"), undefined, "a different modifier is a different key");
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

test("an empty tap inherits the key's own tap at every count the row reaches, once per press", () => {
    const behaviour = behaviourOf("MT(MOD_LSFT,KC_S)", [{tapCount: 2, hold: {action: "KC_A"}}]);
    const {tap, hold} = behaviour.builtIn;
    assert.deepEqual([tap.action, hold.action, hold.label], ["KC_S", "LSFT(KC_NO)", "Shift"], "the key's own tap, and Shift held");
    assert.equal(inheritedBranch(behaviour, {tapCount: 0}, "hold"), hold);
    assert.equal(inheritedBranch(behaviour, {tapCount: 0}, "tap"), tap);
    assert.deepEqual(inheritedBranch(behaviour, {tapCount: 1}, "tap"), {...tap, times: 2}, "a double tap sends the key's tap twice");
    assert.deepEqual(inheritedBranch(behaviour, {tapCount: 2, hold: {action: "KC_A"}}, "tap"), {...tap, times: 3});
    assert.equal(inheritedBranch(behaviour, {tapCount: 3}, "tap"), null, "past the deepest count the keyboard starts again at a single tap");
    assert.equal(inheritedBranch({...behaviour, steps: []}, {tapCount: 1}, "tap"), null, "an unstored row reaches only a single tap");
    assert.equal(inheritedBranch({...behaviour, steps: []}, {tapCount: 0}, "tap"), tap);
    assert.equal(inheritedBranch(behaviour, {tapCount: 1, tap: {action: "KC_B"}}, "tap"), null, "an authored cell replaces it");
    assert.equal(inheritedBranch(behaviour, {tapCount: 0, hold: {action: "KC_A"}}, "hold"), null, "an authored cell replaces it");
    assert.equal(inheritedBranch(behaviour, {tapCount: 0, longHold: {action: "KC_A"}}, "hold"), hold, "a dual-role hold stays beside a long hold");
    assert.equal(inheritedBranch(behaviour, {tapCount: 1}, "hold"), null, "later presses have no built-in hold");
    assert.equal(inheritedBranch(behaviour, {tapCount: 0}, "long"), null, "no key has a built-in long hold");
    assert.equal(inheritedBranch({keycode: "KC_A", builtIn: {}}, {tapCount: 0}, "hold"), null);
});

test("an empty later tap repeats the row's own first tap, up to the deepest tap count", () => {
    const first = {style: "TAP_SENDS", action: "LGUI(KC_BACKSPACE)"};
    const hold = {style: "PRESS_AND_HOLD_UNTIL_RELEASE", action: "KC_K"};
    const del = behaviourOf("KC_DELETE", [{tapCount: 1, hold}, {tapCount: 2, longHold: hold}]);
    const {tap} = del.builtIn;
    assert.equal(tap.action, "KC_DELETE", "Delete taps itself");
    assert.deepEqual(inheritedBranch(del, {tapCount: 2, longHold: hold}, "tap"), {...tap, times: 3}, "three quick taps, three Deletes");
    assert.equal(inheritedBranch(del, {tapCount: 3}, "tap"), null, "a fourth tap starts a new run, so that row is never reached");
    const set = behaviourOf("KC_DELETE", [{tapCount: 0, tap: first}, {tapCount: 1, hold}, {tapCount: 2, longHold: hold}]);
    assert.deepEqual(inheritedBranch(set, {tapCount: 1, hold}, "tap"), {...set.steps[0].tap, first: true, times: 2}, "the first tap the row sets, not the key's own");
    assert.equal(set.steps[0].tap.action, first.action);
    assert.equal(inheritedBranch(set, {tapCount: 0, tap: first}, "tap"), null, "the first tap is its own cell");
    const custom = behaviourOf("CUSTOM_KEY_0", [{tapCount: 0, tap: first}, {tapCount: 1, hold}]);
    assert.equal(custom.builtIn.tap, undefined, "a custom key has no tap of its own");
    assert.deepEqual(inheritedBranch(custom, {tapCount: 1, hold}, "tap"), {...custom.steps[0].tap, first: true, times: 2}, "a key with no tap of its own repeats its set first tap");
    const thumb = behaviourOf("KC_ESCAPE", [{tapCount: 0, tap: first}, {tapCount: 2, tap: {action: "KC_MPLY"}}]);
    assert.deepEqual(inheritedBranch(thumb, {tapCount: 1}, "tap"), {...thumb.steps[0].tap, first: true, times: 2}, "an empty count inside the depth still repeats the first tap");
    assert.equal(inheritedBranch(thumb, {tapCount: 3}, "tap"), null, "past the depth the run types, so that row is never reached");
});

test("a plain key's fallback hold gives way to any authored first-press hold or long hold", () => {
    const behaviour = behaviourOf("KC_MINUS");
    const {hold} = behaviour.builtIn;
    assert.deepEqual([hold.action, hold.fallback], ["KC_MINUS", true], "a plain key's hold is itself, held");
    assert.equal(inheritedBranch(behaviour, {tapCount: 0}, "hold"), hold);
    assert.equal(inheritedBranch(behaviour, {tapCount: 0, longHold: {action: "KC_A"}}, "hold"), null);
    assert.equal(inheritedBranch(behaviour, {tapCount: 0, hold: {action: "KC_A"}}, "hold"), null);
});

test("with no Long hold set, a press's Hold carries on past the Long hold threshold", () => {
    const plain = behaviourOf("KC_MINUS");
    const fallback = plain.builtIn.hold;
    assert.equal(fallback.fallback, true);
    assert.deepEqual(impliedBranch(plain, {tapCount: 0}, "long"), {meaning: "continues", hold: fallback}, "the fallback hold carries on");
    for (const style of ["PRESS_AND_HOLD_UNTIL_RELEASE", "TAP_AT_HOLD_THRESHOLD", "TAP_ON_RELEASE_AFTER_HOLD", "REPEAT_WHILE_HELD"]) {
        const hold = {style, action: "KC_A"};
        assert.deepEqual(impliedBranch(plain, {tapCount: 2, hold}, "long"), {meaning: "continues", hold}, style);
    }
    const lt = behaviourOf("LT(3,KC_SLASH)");
    assert.equal(impliedBranch(lt, {tapCount: 0}, "long").hold.action, "MO(3)", "a built-in layer hold carries on");
    assert.equal(impliedBranch(plain, {tapCount: 0, longHold: {action: "KC_B"}}, "long"), null, "a set Long hold takes over");
    assert.equal(impliedBranch(plain, {tapCount: 1}, "long"), null, "no Hold, nothing to carry on");
    assert.equal(impliedBranch(plain, {tapCount: 0}, "tap"), null);
});

test("with only a Long hold set, a release before it sends the press's tap on keys whose tap survives a hold", () => {
    const longHold = {style: "PRESS_AND_HOLD_UNTIL_RELEASE", action: "KC_B"};
    const plain = behaviourOf("KC_MINUS", [{tapCount: 1, longHold}]);
    const {tap} = plain.builtIn;
    assert.equal(plain.builtIn.releaseTaps, true, "a plain key's tap survives a hold");
    assert.deepEqual(impliedBranch(plain, {tapCount: 0, longHold}, "hold"), {meaning: "tapsBeforeLong", tap});
    assert.deepEqual(impliedBranch(plain, {tapCount: 1, longHold}, "hold"), {meaning: "tapsBeforeLong", tap: {...tap, times: 2}}, "the count's own built-in tap");
    const set = {style: "TAP_SENDS", action: "KC_C"};
    assert.deepEqual(impliedBranch(plain, {tapCount: 1, tap: set, longHold}, "hold"), {meaning: "tapsBeforeLong", tap: set}, "the count's set tap");
    assert.equal(impliedBranch(plain, {tapCount: 0, hold: {action: "KC_A"}, longHold}, "hold"), null, "a set Hold is the Hold");
    assert.equal(impliedBranch(plain, {tapCount: 0}, "hold"), null, "without a Long hold the fallback hold is shown instead");
    const custom = behaviourOf("CUSTOM_KEY_0", [{tapCount: 0, longHold}]);
    assert.equal(impliedBranch(custom, {tapCount: 0, longHold}, "hold"), null, "no tap to send");
    assert.deepEqual(impliedBranch(custom, {tapCount: 0, tap: set, longHold}, "hold"), {meaning: "tapsBeforeLong", tap: set});
    const layer = behaviourOf("MO(3)", [{tapCount: 0, tap: set, longHold}]);
    assert.equal(impliedBranch(layer, {tapCount: 0, tap: set, longHold}, "hold"), null, "a layer key sends no tap once held");
    const lt = behaviourOf("LT(3,KC_SLASH)");
    assert.equal(impliedBranch(lt, {tapCount: 0, longHold}, "hold"), null, "a dual-role key's own hold fills the cell");
});

test("a dual-role key names what its tap sends and what its hold does", () => {
    assert.deepEqual(dualRole(words, cap("LT(3,KC_F)")), {tap: "F", hold: {layer: 3, name: "Navigation"}},
        "the layer its hold reaches is the one the core names");
    assert.deepEqual(dualRole(words, cap("MT(MOD_LSFT,KC_A)")), {tap: "A", hold: {modifier: "Shift"}});
    assert.equal(dualRole(words, cap("MO(3)")), null, "a layer key has no tap half");
    assert.equal(dualRole(words, cap("KC_F")), null);
});

test("the grid shows the tap counts in use and the next, or every one, and says where a run types", () => {
    const esc = {keycode: "KC_ESCAPE", steps: [{tapCount: 1, tap: {action: "KC_GRAVE"}}]};
    assert.equal(behaviourDepth(esc), 2);
    const compact = behaviourGridLayout(esc, 5);
    assert.deepEqual(compact.rows.map((row) => [row.step.tapCount, row.add]), [[0, false], [1, false], [2, true]]);
    assert.deepEqual(compact.typing, {taps: 3}, "three quick taps type the first tap three times");
    const all = behaviourGridLayout(esc, 5, true);
    assert.deepEqual(all.rows.map((row) => row.like), [null, null, null, 0, 0], "a press past the depth is a single tap of its own");
    const none = behaviourGridLayout({keycode: "KC_A", steps: []}, 5);
    assert.deepEqual(none.rows.map((row) => [row.step.tapCount, row.add]), [[0, false], [1, true]]);
    assert.equal(none.typing, null, "a single-tap row never accumulates taps");
    assert.equal(behaviourDepth({steps: [{tapCount: 3}]}), 0, "a tap count with nothing set does not count");
    assert.equal(behaviourGridLayout({steps: [{tapCount: 4, hold: {action: "KC_A"}}]}, 5).rows.length, 5);
    const counting = behaviourGridLayout({keycode: "KC_DELETE", steps: [{tapCount: 1, hold: {action: "KC_K"}}]}, 5, true);
    assert.deepEqual(counting.typing, {taps: 3}, "a row of holds types from the third tap too");
    assert.deepEqual(counting.rows.map((row) => row.like), [null, null, null, 0, 0], "so a fourth press holds like a single tap");
});
