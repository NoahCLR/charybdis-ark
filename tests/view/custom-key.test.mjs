import test from "node:test";
import {withAnswers} from "../fixtures/layer-answers.mjs";
import assert from "node:assert/strict";
import {customKeyInUse, customKeyReach, customKeyBypassText, customKeyDoes, customKeyHeadline, customKeyShortcutOnly, customKeyOf, customKeySendsNote, customKeyShortcutLine, hasShortcut, shortcutKeyCode, shortcutPick, shortcutPickLabel, shortcutPickMods, shortcutOffer, shortcutModifiers, unusedCustomKey, offeredName, customKeyWithShortcut, customKeyChoice, shortcutLayerRows, shortcutLayerList, shortcutWhen, shortcutLayerTag, shortcutLayerUnder, shortcutLayerKinds, LAYER_KIND} from "../../webview/view/custom-key.mjs";

const key = (slot, shortcut = {mods: 0, key: 0, layers: 0, layerKind: 0}, shortcutLabel = "", hasBehavior = false) =>
    ({slot, keycode: `CUSTOM_KEY_${slot}`, code: 0x7f00 + slot, name: "", hasBehavior, shortcut, shortcutLabel});
const model = {
    customKeys: [key(0), key(1, {mods: 0x41, key: 0x0e, layers: 0, layerKind: 0}, "Left Ctrl + Right Alt + K"), key(2, {mods: 0x0f, key: 0, layers: 0, layerKind: 0}, "Left Ctrl + Left Shift + Left Alt + Left GUI", true)],
    customKeyShortcutKeys: ["KC_K", "KC_1", "QK_MOUSE_BUTTON_1", "MS_BTN1"],
    qmkKeycodes: [
        {value: "KC_K", key: "KC_K", label: "K", group: "basic", aliases: [], keycode: 0x0e, searchTerms: [], search: "", searchCompact: ""},
        {value: "QK_MOUSE_BUTTON_1", key: "QK_MOUSE_BUTTON_1", label: "Mouse Button 1", group: "mouse", aliases: ["MS_BTN1"], keycode: 0xd1, searchTerms: [], search: "", searchCompact: ""},
        {value: "KC_LEFT_CTRL", key: "KC_LEFT_CTRL", label: "Left Ctrl", group: "modifiers", aliases: ["KC_LCTL"], keycode: 0xe0, searchTerms: [], search: "", searchCompact: ""},
        {value: "KC_RIGHT_GUI", key: "KC_RIGHT_GUI", label: "Right GUI", group: "modifiers", aliases: ["KC_RGUI"], keycode: 0xe7, searchTerms: [], search: "", searchCompact: ""},
        {value: "KC_1", key: "KC_1", label: "1", group: "basic", aliases: [], keycode: 0x1e, searchTerms: [], search: "", searchCompact: ""},
        {value: "KC_EXLM", key: "KC_EXLM", label: "!", group: "shifted", aliases: ["KC_EXCLAIM"], keycode: 0x21e, searchTerms: [], search: "", searchCompact: ""},
        {value: "RCS(KC_K)", key: "RCS(KC_K)", label: "", group: "shifted", aliases: [], keycode: 0x130e, searchTerms: [], search: "", searchCompact: ""},
        {value: "S(KC_LEFT_CTRL)", key: "S(KC_LEFT_CTRL)", label: "", group: "shifted", aliases: [], keycode: 0x2e0, searchTerms: [], search: "", searchCompact: ""},
    ],
};

test("a shortcut is modifiers, a key, or both; neither is none", () => {
    assert.deepEqual(model.customKeys.map(hasShortcut), [false, true, true]);
    assert.equal(customKeyOf(model, "CUSTOM_KEY_1"), model.customKeys[1]);
    assert.equal(customKeyOf(model, "KC_A"), undefined);
    assert.equal(customKeyOf(model, "CUSTOM_KEY_9"), undefined, "a key the model does not list");
});

test("what a custom key does says its shortcut, its behaviour on top, both, or nothing", () => {
    assert.match(customKeyDoes(model.customKeys[0]), /^Nothing yet/);
    assert.match(customKeyDoes(model.customKeys[1]), /^Sends Left Ctrl \+ Right Alt \+ K: held while the key is held, tapped when it is tapped/);
    assert.match(customKeyDoes(model.customKeys[2]), /^Its behaviour, on top of Left Ctrl \+ Left Shift \+ Left Alt \+ Left GUI: a tap or hold the behaviour leaves empty sends/);
    // Under a behaviour the shortcut is not held from the press: it fills
    // the taps and holds the behaviour leaves empty (firmware D-F26).
    assert.equal(customKeyShortcutLine(model.customKeys[1]), "Sends Left Ctrl + Right Alt + K: held while the key is held, tapped when it is tapped.");
    assert.equal(customKeyShortcutLine(model.customKeys[2]), "Sends Left Ctrl + Left Shift + Left Alt + Left GUI where its behaviour leaves a tap or hold empty.");
    assert.equal(customKeyShortcutLine(model.customKeys[0]), "No shortcut: it does only what its behaviour says.");
    assert.match(customKeyDoes({...model.customKeys[0], hasBehavior: true}), /^Only what its behaviour says/);
    assert.equal(customKeySendsNote(model, "CUSTOM_KEY_1"), "Custom key · sends Left Ctrl + Right Alt + K");
    assert.match(customKeySendsNote(model, "CUSTOM_KEY_0"), /no shortcut/);
    assert.equal(customKeySendsNote(model, "KC_A"), "", "not a custom key");
});

test("the hover card says what a custom key sends, short where its behaviour says the rest", () => {
    // A shortcut has its own section, so the header says nothing of it.
    assert.equal(customKeyHeadline(model.customKeys[1]), "");
    assert.equal(shortcutWhen(model.customKeys[1]), "Held while the key is held, tapped when it is tapped");
    assert.equal(shortcutWhen(model.customKeys[2]), "Where its behaviour leaves a tap or hold empty");
    assert.deepEqual(shortcutLayerList({...model.customKeys[1], shortcut: {mods: 0, key: 0, layers: 0b101000, layerKind: 0}}), [3, 5], "its layers, lowest first");
    assert.equal(customKeyHeadline({...model.customKeys[0], hasBehavior: true}), "No shortcut");
    assert.match(customKeyHeadline(model.customKeys[0]), /sends nothing/);
    assert.equal(customKeyHeadline(undefined), "");
    // A step or a combo output whose behaviour does not run sends the
    // shortcut only, never the key's own behaviour (firmware D-F26).
    assert.equal(customKeyShortcutOnly(model.customKeys[2]), "sends its shortcut, Left Ctrl + Left Shift + Left Alt + Left GUI");
    assert.equal(customKeyShortcutOnly({...model.customKeys[0], hasBehavior: true}), "no shortcut, so it sends nothing");
    assert.equal(customKeyShortcutOnly(undefined), "");
});

test("a bypassed custom key sends its shortcut, and says so, or nothing", () => {
    assert.match(customKeyBypassText(model.customKeys[1]), /sends its shortcut, Left Ctrl \+ Right Alt \+ K\./);
    assert.match(customKeyBypassText(model.customKeys[0]), /no shortcut, so it sends nothing/);
    assert.equal(customKeyBypassText(undefined), "");
});

test("a picked shortcut key is stored by value, and only a key the shortcut may hold", () => {
    assert.equal(shortcutKeyCode(model, "KC_K"), 0x0e);
    assert.equal(shortcutKeyCode(model, "MS_BTN1"), 0xd1, "an alias names the same key");
    assert.equal(shortcutKeyCode(model, " QK_MOUSE_BUTTON_1 "), 0xd1);
    for (const refused of ["KC_LEFT_CTRL", "KC_LCTL", "", "C(KC_K)", "CUSTOM_KEY_0"]) assert.equal(shortcutKeyCode(model, refused), null, refused);
});

test("the picker's modifier row sets the shortcut's mask, either side, and starts as the stored one", () => {
    const names = ["Left Ctrl", "Left Shift", "Left Alt", "Left GUI", "Right Ctrl", "Right Shift", "Right Alt", "Right GUI"];
    const wrappers = ["C", "S", "A", "G", "RCTL", "RSFT", "RALT", "RGUI"];
    const picking = {...model, vocabulary: {modifiers: names.map((label, i) => [1 << i, label]),
        pickerModifiers: names.map((label, i) => ({bit: 1 << i, value: wrappers[i], label}))}};
    assert.deepEqual(shortcutPick(picking, {mods: ["C", "RALT"], keys: ["KC_K"]}), {mods: 0x41, key: 0x0e, layers: 0, layerKind: 0}, "sides mix");
    assert.deepEqual(shortcutPick(picking, {mods: ["C", "S", "A", "G"], keys: []}), {mods: 0x0f, key: 0, layers: 0, layerKind: 0}, "modifiers alone");
    assert.deepEqual(shortcutPick(picking, {mods: [], keys: ["CUSTOM_KEY_0"]}), {mods: 0, key: 0, layers: 0, layerKind: 0}, "a key a shortcut cannot hold is none");
    assert.deepEqual(shortcutPickMods(picking, 0x41), ["C", "RALT"]);
    assert.equal(shortcutPickLabel(picking, {mods: 0x41, key: 0x0e, layers: 0, layerKind: 0}), "Left Ctrl + Right Alt + K");
    assert.equal(shortcutPickLabel(picking, {mods: 0, key: 0, layers: 0, layerKind: 0}), "", "nothing picked");
});

test("a modifier key or a shifted symbol is a shortcut too: its modifiers and its key", () => {
    const names = ["Left Ctrl", "Left Shift", "Left Alt", "Left GUI", "Right Ctrl", "Right Shift", "Right Alt", "Right GUI"];
    const wrappers = ["C", "S", "A", "G", "RCTL", "RSFT", "RALT", "RGUI"];
    const picking = {...model, vocabulary: {modifiers: names.map((label, i) => [1 << i, label]),
        pickerModifiers: names.map((label, i) => ({bit: 1 << i, value: wrappers[i], label}))}};
    assert.deepEqual(shortcutModifiers(picking, "KC_EXLM"), {key: "KC_1", mods: 0x02}, "! is Left Shift + 1");
    assert.deepEqual(shortcutModifiers(picking, "KC_EXCLAIM"), {key: "KC_1", mods: 0x02}, "an alias names the same key");
    assert.deepEqual(shortcutModifiers(picking, "RCS(KC_K)"), {key: "KC_K", mods: 0x30}, "right-hand modifiers keep their side");
    assert.deepEqual(shortcutModifiers(picking, "KC_LCTL"), {key: "", mods: 0x01}, "a modifier key is its modifier, with no key");
    assert.deepEqual(shortcutModifiers(picking, "KC_RIGHT_GUI"), {key: "", mods: 0x80});
    for (const refused of ["S(KC_LEFT_CTRL)", "KC_1", "KC_K", "", "CUSTOM_KEY_0"]) assert.equal(shortcutModifiers(picking, refused), null, refused);
    assert.deepEqual(shortcutPick(picking, {mods: [], keys: ["KC_EXLM"]}), {mods: 0x02, key: 0x1e, layers: 0, layerKind: 0});
    assert.deepEqual(shortcutPick(picking, {mods: ["C"], keys: ["KC_EXLM"]}), {mods: 0x03, key: 0x1e, layers: 0, layerKind: 0}, "with the row's modifiers");
    assert.deepEqual(shortcutPick(picking, {mods: ["RALT"], keys: ["KC_LEFT_CTRL"]}), {mods: 0x41, key: 0, layers: 0, layerKind: 0});
    assert.equal(shortcutPickLabel(picking, shortcutPick(picking, {mods: ["RALT"], keys: ["KC_EXLM"]})), "Left Shift + Right Alt + 1");
    // The Keys screen offers a custom key for a symbol with the other side's modifiers.
    assert.deepEqual(shortcutOffer(picking, {mods: ["RALT"], keys: ["KC_EXLM"]}), {mods: 0x42, key: 0x1e, layers: 0, layerKind: 0});
});

test("modifiers no keycode can hold are offered as an unused custom key's shortcut", () => {
    const names = ["Left Ctrl", "Left Shift", "Left Alt", "Left GUI", "Right Ctrl", "Right Shift", "Right Alt", "Right GUI"];
    const wrappers = ["C", "S", "A", "G", "RCTL", "RSFT", "RALT", "RGUI"];
    const picking = {...model, vocabulary: {modifiers: names.map((label, i) => [1 << i, label]),
        pickerModifiers: names.map((label, i) => ({bit: 1 << i, value: wrappers[i], label}))}};
    assert.equal(shortcutOffer(picking, {mods: ["G", "RGUI"], keys: []}), null, "modifiers alone are modifierPick's");
    assert.deepEqual(shortcutOffer(picking, {mods: ["C", "RALT"], keys: ["KC_K"]}), {mods: 0x41, key: 0x0e, layers: 0, layerKind: 0}, "sides mixed with a key");
    assert.equal(shortcutOffer(picking, {mods: ["C", "S"], keys: ["KC_K"]}), null, "one side and a key is a keycode");
    assert.equal(shortcutOffer(picking, {mods: [], keys: []}), null);
    assert.equal(shortcutOffer(picking, {mods: ["C", "RALT"], keys: ["KC_LEFT_CTRL"]}), null, "a key no shortcut can hold");
    assert.equal(shortcutOffer({...picking, customKeyShortcutKeys: []}, {mods: ["C", "RALT"], keys: ["KC_K"]}), null, "firmware without shortcuts");
    assert.equal(offeredName(picking, {mods: 0x88, key: 0, layers: 0, layerKind: 0}), "Left GUI + Right GUI");
    assert.equal(offeredName(picking, {mods: 0x33, key: 0, layers: 0, layerKind: 0}), "LCtrl+LShift+RCtrl+RShift", "too long in words: written short");
    assert.equal(offeredName(picking, {mods: 0xff, key: 0x0e, layers: 0, layerKind: 0}), "", "too long even short: left empty");
    // The first custom key that does nothing yet: no name, behaviour or
    // shortcut, and on no layer.
    const keys = [0, 1, 2, 3].map((slot) => ({slot, keycode: `CUSTOM_KEY_${slot}`, code: 0x7f00 + slot, name: slot === 0 ? "Thumb" : "", hasBehavior: slot === 1, shortcut: {mods: 0, key: 0, layers: 0, layerKind: 0}, shortcutLabel: ""}));
    const stack = withAnswers([{index: 0, name: "Base", positions: [{layoutIndex: 0, keycode: "QK_USER_2", semantic: "CUSTOM_KEY_2", display: "CUSTOM_KEY_2"}]}]);
    assert.equal(unusedCustomKey({...picking, customKeys: keys, keyBehaviors: [], combos: [], qmkKeycodeAliases: {}}, stack)?.keycode, "CUSTOM_KEY_3");
});

test("a custom key that already holds the shortcut is used rather than another made", () => {
    const both = (slot, hasBehavior) => ({slot, keycode: `CUSTOM_KEY_${slot}`, code: 0x7f00 + slot, name: `K${slot}`, hasBehavior, shortcut: {mods: 0x88, key: 0, layers: 0, layerKind: 0}, shortcutLabel: "Left GUI + Right GUI"});
    const keys = {customKeys: [key(0), both(1, true), both(2, false)]};
    assert.equal(customKeyWithShortcut(keys, {mods: 0x88, key: 0, layers: 0, layerKind: 0})?.keycode, "CUSTOM_KEY_2", "a layout key runs the custom key's behaviour: only one without");
    assert.equal(customKeyWithShortcut(keys, {mods: 0x88, key: 0, layers: 0, layerKind: 0}, {runsBehaviour: false})?.keycode, "CUSTOM_KEY_1", "a step sends only the shortcut: any");
    assert.equal(customKeyWithShortcut(keys, {mods: 0x88, key: 0x0e, layers: 0, layerKind: 0}), undefined, "the key must match too");
    assert.equal(customKeyWithShortcut({customKeys: [key(0), both(1, true)]}, {mods: 0x88, key: 0, layers: 0, layerKind: 0}), undefined);
});

test("a match with a behaviour is offered beside a new key where the behaviour would run, and used as it is in a step", () => {
    const both = (slot, hasBehavior) => ({slot, keycode: `CUSTOM_KEY_${slot}`, code: 0x7f00 + slot, name: `K${slot}`, hasBehavior, shortcut: {mods: 0x88, key: 0, layers: 0, layerKind: 0}, shortcutLabel: "Left GUI + Right GUI"});
    const free = (slot) => ({...key(slot), name: ""});
    const choose = (keys, runsBehaviour) => {
        const choice = customKeyChoice({customKeys: keys, keyBehaviors: [], combos: [], qmkKeycodeAliases: {}}, {mods: 0x88, key: 0, layers: 0, layerKind: 0}, withAnswers([]), {runsBehaviour});
        return {existing: choice.existing?.keycode, withBehaviour: choice.withBehaviour, spare: choice.spare?.keycode};
    };
    assert.deepEqual(choose([both(1, true), both(2, false), free(3)], true), {existing: "CUSTOM_KEY_2", withBehaviour: false, spare: undefined}, "one that does only this is used");
    assert.deepEqual(choose([both(1, true), free(3)], true), {existing: "CUSTOM_KEY_1", withBehaviour: true, spare: "CUSTOM_KEY_3"}, "a key or combo output: use it with its behaviour, or make a new one");
    assert.deepEqual(choose([both(1, true), free(3)], false), {existing: "CUSTOM_KEY_1", withBehaviour: false, spare: undefined}, "a step sends only the shortcut: used as it is");
    assert.deepEqual(choose([free(3)], true), {existing: undefined, withBehaviour: false, spare: "CUSTOM_KEY_3"});
});

test("a custom key is in use once it is named, sends a shortcut or has a behaviour", () => {
    const key = (fields) => ({slot: 0, keycode: "CUSTOM_KEY_0", name: "", hasBehavior: false, shortcut: {mods: 0, key: 0, layers: 0, layerKind: 0}, ...fields});
    assert.equal(customKeyInUse(key({})), false, "an empty slot");
    assert.equal(customKeyInUse(key({name: "Paste plain"})), true);
    assert.equal(customKeyInUse(key({shortcut: {mods: 0x08, key: 0, layers: 0, layerKind: 0}})), true, "modifiers alone are a shortcut");
    assert.equal(customKeyInUse(key({hasBehavior: true})), true);
    assert.equal(customKeyInUse(undefined), false);
});

test("the Custom keys tab groups a layer's custom keys the ways a macro is reached, and leaves empty slots out", () => {
    const at = (layoutIndex, keycode, semantic) => ({layoutIndex, keycode, semantic, display: keycode});
    const model = {
        customKeys: [0, 1, 2, 3, 4].map((slot) => ({slot, keycode: `CUSTOM_KEY_${slot}`, name: slot < 4 ? `Key ${slot}` : "",
            hasBehavior: false, shortcut: {mods: 0, key: 0, layers: 0, layerKind: 0}})),
        qmkKeycodeAliases: {QK_USER_2: "CUSTOM_KEY_2"},
        keyBehaviors: [{keycode: "KC_A", enabled: true, allowedLayers: 0xffff, steps: [{tapCount: 1, tap: {style: "TAP_SENDS", action: "CUSTOM_KEY_3"}}]}],
        combos: [{id: 0, badge: "C1", inputs: ["KC_B", "KC_C"], output: "QK_USER_2"}],
    };
    const stack = withAnswers([
        {index: 0, name: "Base", positions: [at(0, "QK_USER_0", "CUSTOM_KEY_0"), at(1, "KC_B"), at(2, "KC_C"), at(3, "KC_A")]},
        {index: 1, name: "Numbers", positions: [at(0, "KC_TRANSPARENT"), at(1, "QK_USER_1", "CUSTOM_KEY_1"), at(2, "KC_NO"), at(3, "KC_NO")]},
    ]);
    const names = (entries) => entries.map((entry) => entry.name);
    const base = customKeyReach(model, stack, 0);
    assert.deepEqual(names(base.onKeys), ["CUSTOM_KEY_0"]);
    assert.deepEqual(names(base.fromCombos), ["CUSTOM_KEY_2"], "a combo on Base's keys sends it");
    assert.deepEqual(names(base.fromBranches), ["CUSTOM_KEY_3"], "a behaviour step on Base sends it");
    assert.deepEqual(base.elsewhere, ["CUSTOM_KEY_1"], "unreachable from Base; the unnamed empty slot 4 is no key at all");
    const numbers = customKeyReach(model, stack, 1);
    assert.deepEqual(names(numbers.onKeys), ["CUSTOM_KEY_1"]);
    assert.deepEqual(names(numbers.throughKeys), ["CUSTOM_KEY_0"], "a transparent key falls through to Base's");
});

// A shortcut can hold layers too (firmware D-F26): layers alone are a
// shortcut that holds them on rather than sends them.
test("a shortcut of layers alone holds them on, and says so", () => {
    const layered = {slot: 4, keycode: "CUSTOM_KEY_4", code: 0x7f04, name: "", hasBehavior: false, shortcut: {mods: 0, key: 0, layers: 0b101000, layerKind: 0}, shortcutLabel: "Navigation + Extra"};
    assert.equal(hasShortcut(layered), true);
    assert.equal(customKeyShortcutLine(layered), "Holds Navigation + Extra on: held while the key is held, tapped when it is tapped.");
    assert.match(customKeyDoes(layered), /^Holds Navigation \+ Extra on: held while the key is held/);
    assert.equal(customKeyShortcutLine({...layered, hasBehavior: true}), "Holds Navigation + Extra on where its behaviour leaves a tap or hold empty.");
    assert.equal(customKeyShortcutOnly(layered), "holds its shortcut's layers on, Navigation + Extra");
    assert.equal(customKeySendsNote({customKeys: [layered]}, "CUSTOM_KEY_4"), "Custom key · holds Navigation + Extra on");
    assert.match(customKeyBypassText(layered), /this custom key holds its shortcut's layers on, Navigation \+ Extra\.$/);
    // With modifiers or a key too, it sends them, its layers named after.
    const both = {...layered, shortcut: {mods: 0x08, key: 0, layers: 0b1000, layerKind: 0}, shortcutLabel: "Left GUI + Navigation"};
    assert.equal(customKeyShortcutLine(both), "Sends Left GUI + Navigation: held while the key is held, tapped when it is tapped.");
});

// A shortcut turns its layers on as one layer key does (firmware D-F26), and
// says so: locks, moves to, tap-toggles or one-shots them, and keys held as
// before.
test("a shortcut's layers say how it turns them on, wherever the shortcut is described", () => {
    const words = {customKeys: {alwaysOn: {base: "", default: ""}, layerKinds: [[0, "Hold"], [1, "Lock"], [2, "Move to"], [3, "Tap-toggle"], [4, "One-shot"]]}};
    const alone = (layerKind) => ({slot: 4, keycode: "CUSTOM_KEY_4", code: 0x7f04, name: "", hasBehavior: false, shortcut: {mods: 0, key: 0, layers: 0b101000, layerKind},
        shortcutLabel: `${["", "Lock ", "Move to ", "Tap-toggle ", "One-shot "][layerKind]}Navigation + Extra`, shortcutKeys: [], shortcutLayerNames: ["Navigation", "Extra"]});
    assert.deepEqual([0, 1, 2, 3, 4].map((kind) => customKeyShortcutLine(alone(kind))), [
        "Holds Navigation + Extra on: held while the key is held, tapped when it is tapped.",
        "Locks Navigation + Extra: pressing the key locks its layers on, or off again once all are on.",
        "Moves to Navigation + Extra: pressing the key locks its layers alone, letting every other lock go.",
        "Tap-toggles Navigation + Extra: held while the key is held; tapping it 5 times locks its layers.",
        "Turns Navigation + Extra on as a one-shot: held while the key is held; a tap turns its layers on for the next key press.",
    ]);
    // Sent by a step or a combo, a tap-toggle shortcut only holds.
    assert.deepEqual([0, 1, 2, 3, 4].map((kind) => customKeyShortcutOnly(alone(kind))), [
        "holds its shortcut's layers on, Navigation + Extra", "locks its shortcut's layers, Navigation + Extra", "moves to its shortcut's layers, Navigation + Extra",
        "holds its shortcut's layers on, Navigation + Extra", "turns its shortcut's layers on as a one-shot, Navigation + Extra"]);
    // Bypassed, the key is still itself: a tap-toggle or one-shot key holds
    // its layers from the press, and its own taps lock or arm them.
    assert.deepEqual([3, 4].map((kind) => customKeyBypassText(alone(kind))), [
        "With its behaviour bypassed or off, this custom key holds its shortcut's layers on while held, Navigation + Extra; tapping it 5 times locks them.",
        "With its behaviour bypassed or off, this custom key holds its shortcut's layers on while held, Navigation + Extra; a tap turns them on for the next key."]);
    assert.match(customKeyBypassText({...alone(4), shortcut: {mods: 0x02, key: 0, layers: 0b1000, layerKind: 4}, shortcutLabel: "Left Shift + One-shot Navigation"}),
        /sends its shortcut, Left Shift \+ One-shot Navigation; a tap turns it on for the next key\.$/);
    assert.equal(customKeyBypassText(alone(1)), "With its behaviour bypassed or off, this custom key locks its shortcut's layers, Navigation + Extra.");
    assert.equal(customKeySendsNote({customKeys: [alone(1)]}, "CUSTOM_KEY_4"), "Custom key · locks Navigation + Extra");
    // With keys, it sends them, its layers named by their kind; a lock still
    // holds its keys while the key is held.
    const keyed = {...alone(1), shortcut: {mods: 0x08, key: 0, layers: 0b1000, layerKind: 1}, shortcutLabel: "Left GUI + Lock Navigation", shortcutKeys: ["Left GUI"], shortcutLayerNames: ["Navigation"]};
    assert.equal(customKeyShortcutLine(keyed), "Sends Left GUI + Lock Navigation: its keys held while the key is held; pressing the key locks its layers on, or off again once all are on.");
    // The hover card: each layer's tag, what they do, and when.
    assert.deepEqual([0, 1, 2, 3, 4].map((kind) => shortcutLayerTag({vocabulary: words}, alone(kind))), ["hold", "lock", "move to", "tap-toggle", "one-shot"]);
    assert.deepEqual([0, 1, 2, 3, 4].map((kind) => shortcutLayerUnder(alone(kind))), ["layers · on while the shortcut is held", "layers · locks them on, or off when all are on",
        "layers · locks them alone", "layers · held while held; 5 taps lock them", "layers · held while held; a tap turns them on for the next key"]);
    assert.equal(shortcutLayerUnder({...alone(1), shortcut: {mods: 0, key: 0, layers: 0b1000, layerKind: 1}}), "layer · locks it on, or off when it is on");
    assert.deepEqual([0, 1, 2].map((kind) => shortcutWhen(alone(kind))), ["Held while the key is held, tapped when it is tapped", "When the key is pressed", "When the key is pressed"]);
    assert.equal(shortcutWhen(keyed), "Held while the key is held, tapped when it is tapped", "its keys are held");
    // Under a behaviour, tap-toggle and one-shot layers are still on from
    // every press, as TT()'s and OSL()'s are; the other kinds wait for an
    // empty tier.
    const behaved = (kind) => ({...alone(kind), hasBehavior: true});
    assert.equal(customKeyShortcutLine(behaved(1)), "Locks Navigation + Extra where its behaviour leaves a tap or hold empty.");
    assert.equal(customKeyShortcutLine(behaved(4)), "Turns Navigation + Extra on as a one-shot where its behaviour leaves a tap or hold empty; its layers are on from every press of the key.");
    assert.equal(shortcutWhen(behaved(3)), "Where its behaviour leaves a tap or hold empty; its layers are on from every press of the key");
    assert.equal(shortcutLayerUnder(behaved(3)), "layers · held from every press; 5 taps lock them unless its behaviour has steps");
    assert.equal(shortcutLayerUnder(behaved(4)), "layers · held from every press; an empty tap turns them on for the next key");
    assert.match(customKeyDoes(behaved(3)), /a tap or hold the behaviour leaves empty tap-toggles Navigation \+ Extra, and its layers are on from every press of the key\.$/);
    // The picker offers each kind by its layer key's verb, and a kind with no
    // layers is a hold.
    assert.deepEqual(shortcutLayerKinds({vocabulary: words}).map(({kind, label}) => [kind, label]), words.customKeys.layerKinds);
    assert.deepEqual(shortcutPick(model, {mods: [], keys: [], layers: 0b1000, layerKind: LAYER_KIND.MOVE}), {mods: 0, key: 0, layers: 0b1000, layerKind: 2});
    assert.deepEqual(shortcutPick(model, {mods: [], keys: ["KC_K"], layers: 0, layerKind: LAYER_KIND.LOCK}), {mods: 0, key: 0x0e, layers: 0, layerKind: 0});
    const picking = {layers: [{index: 3, name: "Navigation", displayName: "Navigation"}], vocabulary: {...words, modifiers: [[0x08, "Left GUI"]]}};
    assert.equal(shortcutPickLabel(picking, {mods: 0x08, key: 0, layers: 0b1000, layerKind: 4}), "Left GUI + One-shot Navigation");
});

test("the shortcut picker's layer rows dim the layers that are always on, and its label names the layers lowest first", () => {
    const layers = [3, 0, 5].map((index) => ({index, name: ["Base", "", "", "Navigation", "", "Extra"][index], displayName: ["Base", "", "", "Navigation", "", "Extra"][index]}));
    const picking = {layers, vocabulary: {customKeys: {alwaysOn: {base: "base layer, always on", default: "default layer, always on"}}, modifiers: [[0x08, "Left GUI"]]},
        customKeyShortcutLayers: [{layer: 0, refusal: "Base is the base layer: it is always on, so a shortcut cannot turn it on.", alwaysOn: "base"}, {layer: 3, refusal: "", alwaysOn: ""}, {layer: 5, refusal: "Extra is a default layer: it is always on, so a shortcut cannot turn it on.", alwaysOn: "default"}]};
    const rows = shortcutLayerRows(picking, 0b1000);
    assert.deepEqual(rows.map((row) => [row.layer, row.on, row.unusable, row.why]), [[3, true, false, ""], [0, false, true, "base layer, always on"], [5, false, true, "default layer, always on"]], "in the tab order");
    assert.match(rows[1].tip, /^Base is the base layer/);
    assert.equal(shortcutPickLabel(picking, {mods: 0x08, key: 0, layers: 0b101000, layerKind: 0}), "Left GUI + Navigation + Extra", "lowest first, whatever the tab order");
});
