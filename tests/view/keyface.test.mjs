import assert from "node:assert/strict";
import test from "node:test";
import {actionNaming, dualRole, keyFace, layerOfKeycode, keyName, visibleKeycode, cellLabel, behaviourFor, canonicalKeycode, behaviourListeningTo, behaviourTiers, behaviourGridSteps, inheritedBranch, impliedBranch} from "../../webview/view/keyface.mjs";
import keyNames from "../../core/model/key-names.js";

test("visible macro keycodes use the VIA slot name for both QMK's named and unnamed values", () => {
    const model = {qmkKeycodeAliases: {QK_MACRO_9: "VIA_MACRO_9", "0x773F": "VIA_MACRO_63", QK_USER_16: "PD_SLOT_0"}};
    assert.equal(visibleKeycode(model, "QK_MACRO_9"), "VIA_MACRO_9");
    assert.equal(visibleKeycode(model, "0x773F"), "VIA_MACRO_63");
    assert.equal(visibleKeycode(model, "QK_USER_16"), "QK_USER_16", "other stored identities keep their existing display");
    assert.equal(visibleKeycode({}, "QK_MACRO_9"), "QK_MACRO_9", "an unadvertised alias is not invented");
});

test("a bare value the keyboard names reads by that name, and a named keycode keeps its own", () => {
    const model = {qmkKeycodeAliases: {"0x7F01": "CUSTOM_KEY_1", "0x7E85": "PD_SLOT_5", QK_USER_16: "PD_SLOT_0"}};
    assert.equal(visibleKeycode(model, "0x7F01"), "CUSTOM_KEY_1");
    assert.equal(visibleKeycode(model, "0x7E85"), "PD_SLOT_5");
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
    assert.deepEqual(keyFace({keycode: "KC_TRANSPARENT", display: "▽"}), {main: "▽", sub: "", kind: "transparent"});
    assert.deepEqual(keyFace({keycode: "KC_NO", display: ""}), {main: "", sub: "", kind: "disabled"});
    assert.deepEqual(keyFace({keycode: "KC_A", display: "A"}), {main: "A", sub: "", kind: "key"});
    assert.deepEqual(keyFace({keycode: "LT(LAYER_NAV,KC_F)", display: "F"}), {main: "F", sub: "nav", kind: "layer"});
    assert.deepEqual(keyFace({keycode: "MO(LAYER_SYM)", display: "L2"}), {main: "L2", sub: "momentary", kind: "layer"});
    assert.equal(keyFace(undefined).kind, "none");
});

test("tiers count the branches that use them, so a key shows what it can do", () => {
    const model = {keyBehaviors: [{
        keycode: "LEFT_THUMB",
        steps: [
            {tapCount: 0, tap: {action: "LOCK_LAYER(LAYER_SYM)"}, hold: {action: "MO(LAYER_SYM)"}},
            {tapCount: 1, tap: {action: "KC_MPLY"}, hold: {action: "KC_ESC"}, longHold: {action: "LOCK_LAYER(LAYER_NUM)"}},
            {tapCount: 2, tap: {action: "KC_MNXT"}, longHold: {action: "KC_MNXT"}},
        ],
    }]};
    const behaviour = behaviourFor(model, "LEFT_THUMB");
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

test("a key for an empty pointing slot says so on its second line", () => {
    // The catalogue label carries "(empty)" so the picker can tell the two
    // apart; on the cap that belongs under the name, not inside it.
    assert.deepEqual(keyFace({keycode: "0x7EF0", display: "Slot 6 · hold (empty)"}),
        {main: "Slot 6 · hold", sub: "empty", kind: "key"});
    assert.equal(keyFace({keycode: "QK_USER_16", display: "Dragscroll · hold"}).sub, "");
});

test("a picked key finds the behaviour it would collide with, whatever its spelling", () => {
    const model = {
        qmkKeycodeAliases: {KC_ENT: "KC_ENTER", KC_ENTER: "KC_ENTER", KC_SLSH: "KC_SLASH", KC_SLASH: "KC_SLASH"},
        keyBehaviors: [{keycode: "KC_ENTER"}, {keycode: "LT(3,KC_SLASH)"}, {keycode: "PD_SLOT_0"}],
    };
    assert.equal(canonicalKeycode(model, "KC_ENT"), "KC_ENTER");
    assert.equal(canonicalKeycode(model, "LT(3, KC_SLSH)"), "LT(3,KC_SLASH)");
    assert.equal(behaviourListeningTo(model, "KC_ENT").keycode, "KC_ENTER");
    assert.equal(behaviourListeningTo(model, "LT(3, KC_SLSH)").keycode, "LT(3,KC_SLASH)");
    assert.equal(behaviourListeningTo(model, "PD_SLOT_0").keycode, "PD_SLOT_0");
    assert.equal(behaviourListeningTo(model, "KC_A"), undefined);
});

test("a key's name outside a cap is the host's whole name, not the cap's short legend", () => {
    assert.equal(keyName({keycode: "LT(3,KC_F)", display: "F", editLabel: "F / Navigation", layerLabel: "Navigation"}), "F / Navigation",
        "a layer-tap is a layer key too, which its cap's top line alone does not say");
    assert.equal(keyName({keycode: "KC_A", display: "A", editLabel: "A"}), "A");
    assert.equal(keyName({keycode: "KC_TRANSPARENT", display: "▽", editLabel: "Transparent"}), "Transparent");
    assert.equal(keyName({keycode: "KC_NO", display: "", editLabel: "N/A"}), "Unmapped");
});

test("a layer key knows the layer it acts on, however the keyboard stores it", () => {
    const model = {qmkKeycodeAliases: {QK_USER_31: "LOCK_LAYER(3)", KC_ENT: "KC_ENTER"}};
    assert.equal(layerOfKeycode(model, "MO(3)"), 3);
    assert.equal(layerOfKeycode(model, "LT(2,KC_J)"), 2);
    assert.equal(layerOfKeycode(model, "LT(2, KC_J)"), 2, "however the expression is spaced");
    assert.equal(layerOfKeycode(model, "QK_USER_31"), 3, "a layer lock stored as a user slot");
    assert.equal(layerOfKeycode(model, "KC_ENT"), null);
    assert.equal(layerOfKeycode(model, "LGUI(KC_3)"), null, "a number inside a keycode is not a layer");
});

test("a layer-tap cap names its layer on the second line, as the host names it", () => {
    assert.deepEqual(keyFace({keycode: "LT(3,KC_SLASH)", display: "/", layerLabel: "Navigation"}), {main: "/", sub: "Navigation", kind: "layer"});
    assert.deepEqual(keyFace({keycode: "MO(3)", display: "Navigation", layerLabel: "Navigation"}), {main: "Navigation", sub: "momentary", kind: "layer"});
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

test("a key cap tells layer keys and mod-taps apart from plain keys", () => {
    const face = (keycode, display) => keyFace({keycode, display});
    assert.deepEqual(face("MO(1)", "L1"), {main: "L1", sub: "momentary", kind: "layer"});
    assert.equal(face("TG(1)", "L1").sub, "toggle");
    assert.equal(face("TO(2)", "L2").sub, "move");
    assert.equal(face("OSL(3)", "L3").sub, "one-shot");
    assert.equal(face("TT(1)", "L1").sub, "tap-toggle");
    assert.equal(face("DF(0)", "L0").sub, "default");
    assert.deepEqual(face("MT(MOD_LSFT,KC_A)", "A"), {main: "A", sub: "MOD_LSFT", kind: "key"});
    assert.equal(face("MT(MOD_LCTL|MOD_LSFT|MOD_LGUI,KC_A)", "A").sub, "MOD_LCTL|MOD_LSFT|MOD_LGUI");
    assert.equal(face("MT(MOD_RALT,KC_B)", "B").sub, "MOD_RALT");
    assert.deepEqual(face("KC_A", "A"), {main: "A", sub: "", kind: "key"}, "a plain A has no second line");
});

test("a behaviour cell reads by the host's name for its key, and by its keycode when it has none", () => {
    // The host names every keycode, layer keys by their layer's name
    // (core/model/key-names.js); the cell never composes a name itself.
    const names = keyNames.profileKeyNames({layers: ["Base", "Numbers"], actionsKnown: true});
    const model = {qmkKeyLabels: {KC_HASH: "#", KC_F: "F", ...names.labels, "LT(1,KC_F)": keyNames.keyLabel(names, 0x4109)}};
    assert.equal(cellLabel(model, {action: "KC_HASH"}), "#");
    assert.equal(cellLabel(model, {action: "LSFT(KC_ENTER)", label: "Shift+Enter"}), "Shift+Enter", "an expression takes the host's name");
    assert.equal(cellLabel(model, {action: "CUSTOM_KEY_2", label: "Left Ctrl + K"}), "Left Ctrl + K", "a custom key's own action reads as its shortcut");
    assert.equal(cellLabel(model, {action: "MO(1)"}), "Hold Numbers", "a layer action names the layer, in the picker's words");
    assert.equal(cellLabel(model, {action: "LOCK_LAYER(1)"}), "Lock Numbers");
    assert.equal(cellLabel(model, {action: "LT(1,KC_F)"}), "F / Numbers");
    assert.equal(cellLabel(model, {action: "QK_BOOT"}), "QK_BOOT", "no clean name: the keycode is the label");
});

test("an empty tap inherits the key's own tap at every count the row reaches, once per press", () => {
    const hold = {helper: "PRESS_AND_HOLD_UNTIL_RELEASE", action: "LSFT(KC_NO)", label: "Shift"};
    const tap = {helper: "TAP_SENDS", action: "KC_S", label: "S"};
    const behaviour = {keycode: "MT(MOD_LSFT,KC_S)", builtIn: {tap, hold}, steps: [{tapCount: 2, hold: {action: "KC_A"}}]};
    assert.equal(inheritedBranch(behaviour, {tapCount: 0}, "hold"), hold);
    assert.equal(inheritedBranch(behaviour, {tapCount: 0}, "tap"), tap);
    assert.deepEqual(inheritedBranch(behaviour, {tapCount: 1}, "tap"), {...tap, times: 2}, "a double tap sends the key's tap twice");
    assert.deepEqual(inheritedBranch(behaviour, {tapCount: 2, hold: {action: "KC_A"}}, "tap"), {...tap, times: 3});
    assert.equal(inheritedBranch(behaviour, {tapCount: 3}, "tap"), null, "past the deepest authored count the presses are separate gestures");
    assert.equal(inheritedBranch({...behaviour, steps: []}, {tapCount: 1}, "tap"), null, "an unstored row reaches only a single tap");
    assert.equal(inheritedBranch({...behaviour, steps: []}, {tapCount: 0}, "tap"), tap);
    assert.equal(inheritedBranch(behaviour, {tapCount: 1, tap: {action: "KC_B"}}, "tap"), null, "an authored cell replaces it");
    assert.equal(inheritedBranch(behaviour, {tapCount: 0, hold: {action: "KC_A"}}, "hold"), null, "an authored cell replaces it");
    assert.equal(inheritedBranch(behaviour, {tapCount: 0, longHold: {action: "KC_A"}}, "hold"), hold, "a dual-role hold stays beside a long hold");
    assert.equal(inheritedBranch(behaviour, {tapCount: 1}, "hold"), null, "later presses have no built-in hold");
    assert.equal(inheritedBranch(behaviour, {tapCount: 0}, "long"), null, "no key has a built-in long hold");
    assert.equal(inheritedBranch({keycode: "KC_A", builtIn: {}}, {tapCount: 0}, "hold"), null);
});

test("a plain key's fallback hold gives way to any authored first-press hold or long hold", () => {
    const hold = {helper: "PRESS_AND_HOLD_UNTIL_RELEASE", action: "KC_MINUS", label: "-", fallback: true};
    const behaviour = {keycode: "KC_MINUS", builtIn: {tap: {helper: "TAP_SENDS", action: "KC_MINUS", label: "-"}, hold}, steps: []};
    assert.equal(inheritedBranch(behaviour, {tapCount: 0}, "hold"), hold);
    assert.equal(inheritedBranch(behaviour, {tapCount: 0, longHold: {action: "KC_A"}}, "hold"), null);
    assert.equal(inheritedBranch(behaviour, {tapCount: 0, hold: {action: "KC_A"}}, "hold"), null);
});

test("with no Long hold set, a press's Hold carries on past the Long hold threshold", () => {
    const tap = {helper: "TAP_SENDS", action: "KC_MINUS", label: "-"};
    const fallback = {helper: "PRESS_AND_HOLD_UNTIL_RELEASE", action: "KC_MINUS", label: "-", fallback: true};
    const plain = {keycode: "KC_MINUS", builtIn: {tap, hold: fallback, releaseTaps: true}, steps: []};
    assert.deepEqual(impliedBranch(plain, {tapCount: 0}, "long"), {meaning: "continues", hold: fallback}, "the fallback hold carries on");
    for (const helper of ["PRESS_AND_HOLD_UNTIL_RELEASE", "TAP_AT_HOLD_THRESHOLD", "TAP_ON_RELEASE_AFTER_HOLD", "REPEAT_WHILE_HELD"]) {
        const hold = {helper, action: "KC_A"};
        assert.deepEqual(impliedBranch(plain, {tapCount: 2, hold}, "long"), {meaning: "continues", hold}, helper);
    }
    const lt = {keycode: "LT(3,KC_SLASH)", builtIn: {tap, hold: {helper: "PRESS_AND_HOLD_UNTIL_RELEASE", action: "MO(3)"}}, steps: []};
    assert.equal(impliedBranch(lt, {tapCount: 0}, "long").hold.action, "MO(3)", "a built-in layer hold carries on");
    assert.equal(impliedBranch(plain, {tapCount: 0, longHold: {action: "KC_B"}}, "long"), null, "a set Long hold takes over");
    assert.equal(impliedBranch(plain, {tapCount: 1}, "long"), null, "no Hold, nothing to carry on");
    assert.equal(impliedBranch(plain, {tapCount: 0}, "tap"), null);
});

test("with only a Long hold set, a release before it sends the press's tap on keys whose tap survives a hold", () => {
    const tap = {helper: "TAP_SENDS", action: "KC_MINUS", label: "-"};
    const longHold = {helper: "PRESS_AND_HOLD_UNTIL_RELEASE", action: "KC_B"};
    const fallback = {helper: "PRESS_AND_HOLD_UNTIL_RELEASE", action: "KC_MINUS", fallback: true};
    const plain = {keycode: "KC_MINUS", builtIn: {tap, hold: fallback, releaseTaps: true}, steps: [{tapCount: 1, longHold}]};
    assert.deepEqual(impliedBranch(plain, {tapCount: 0, longHold}, "hold"), {meaning: "tapsBeforeLong", tap});
    assert.deepEqual(impliedBranch(plain, {tapCount: 1, longHold}, "hold"), {meaning: "tapsBeforeLong", tap: {...tap, times: 2}}, "the count's own built-in tap");
    const set = {helper: "TAP_SENDS", action: "KC_C"};
    assert.deepEqual(impliedBranch(plain, {tapCount: 1, tap: set, longHold}, "hold"), {meaning: "tapsBeforeLong", tap: set}, "the count's set tap");
    assert.equal(impliedBranch(plain, {tapCount: 0, hold: {action: "KC_A"}, longHold}, "hold"), null, "a set Hold is the Hold");
    assert.equal(impliedBranch(plain, {tapCount: 0}, "hold"), null, "without a Long hold the fallback hold is shown instead");
    const custom = {keycode: "CUSTOM_KEY_0", builtIn: {releaseTaps: true}, steps: [{tapCount: 0, longHold}]};
    assert.equal(impliedBranch(custom, {tapCount: 0, longHold}, "hold"), null, "no tap to send");
    assert.deepEqual(impliedBranch(custom, {tapCount: 0, tap: set, longHold}, "hold"), {meaning: "tapsBeforeLong", tap: set});
    const layer = {keycode: "MO(3)", builtIn: {}, steps: [{tapCount: 0, tap: set, longHold}]};
    assert.equal(impliedBranch(layer, {tapCount: 0, tap: set, longHold}, "hold"), null, "a layer key sends no tap once held");
    const lt = {keycode: "LT(3,KC_SLASH)", builtIn: {tap, hold: {helper: "PRESS_AND_HOLD_UNTIL_RELEASE", action: "MO(3)"}}, steps: []};
    assert.equal(impliedBranch(lt, {tapCount: 0, longHold}, "hold"), null, "a dual-role key's own hold fills the cell");
});

test("a dual-role key names what its tap sends and what its hold does", () => {
    assert.deepEqual(dualRole({}, {keycode: "LT(3,KC_F)", display: "F", layerLabel: "Navigation"}), {tap: "F", hold: {layer: 3, name: "Navigation"}});
    assert.deepEqual(dualRole({}, {keycode: "MT(MOD_LSFT,KC_A)", display: "A", modifierLabel: "Shift"}), {tap: "A", hold: {modifier: "Shift"}});
    assert.equal(dualRole({}, {keycode: "MO(3)", display: "Hold Navigation"}), null, "a layer key has no tap half");
    assert.equal(dualRole({}, {keycode: "KC_F", display: "F"}), null);
});
