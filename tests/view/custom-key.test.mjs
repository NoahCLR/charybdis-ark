import test from "node:test";
import {withAnswers} from "../fixtures/layer-answers.mjs";
import assert from "node:assert/strict";
import {customKeyBypassText, customKeyDoes, customKeyHeadline, customKeyShortcutOnly, customKeyOf, customKeySendsNote, customKeyShortcutLine, hasShortcut, shortcutKeyCode, shortcutPick, shortcutPickLabel, shortcutPickMods, shortcutOffer, shortcutModifiers, unusedCustomKey, offeredName, customKeyWithShortcut, customKeyChoice} from "../../webview/view/custom-key.mjs";

const key = (slot, shortcut = {mods: 0, key: 0}, shortcutLabel = "", hasBehavior = false) =>
    ({slot, keycode: `CUSTOM_KEY_${slot}`, code: 0x7f00 + slot, name: "", hasBehavior, shortcut, shortcutLabel});
const model = {
    customKeys: [key(0), key(1, {mods: 0x41, key: 0x0e}, "Left Ctrl + Right Alt + K"), key(2, {mods: 0x0f, key: 0}, "Left Ctrl + Left Shift + Left Alt + Left GUI", true)],
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
    assert.equal(customKeyHeadline(model.customKeys[1]), "Sends Left Ctrl + Right Alt + K: held while the key is held, tapped when it is tapped.");
    assert.equal(customKeyHeadline(model.customKeys[2]), "Sends Left Ctrl + Left Shift + Left Alt + Left GUI where its behaviour leaves a tap or hold empty.");
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
    assert.deepEqual(shortcutPick(picking, {mods: ["C", "RALT"], keys: ["KC_K"]}), {mods: 0x41, key: 0x0e}, "sides mix");
    assert.deepEqual(shortcutPick(picking, {mods: ["C", "S", "A", "G"], keys: []}), {mods: 0x0f, key: 0}, "modifiers alone");
    assert.deepEqual(shortcutPick(picking, {mods: [], keys: ["CUSTOM_KEY_0"]}), {mods: 0, key: 0}, "a key a shortcut cannot hold is none");
    assert.deepEqual(shortcutPickMods(picking, 0x41), ["C", "RALT"]);
    assert.equal(shortcutPickLabel(picking, {mods: 0x41, key: 0x0e}), "Left Ctrl + Right Alt + K");
    assert.equal(shortcutPickLabel(picking, {mods: 0, key: 0}), "", "nothing picked");
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
    assert.deepEqual(shortcutPick(picking, {mods: [], keys: ["KC_EXLM"]}), {mods: 0x02, key: 0x1e});
    assert.deepEqual(shortcutPick(picking, {mods: ["C"], keys: ["KC_EXLM"]}), {mods: 0x03, key: 0x1e}, "with the row's modifiers");
    assert.deepEqual(shortcutPick(picking, {mods: ["RALT"], keys: ["KC_LEFT_CTRL"]}), {mods: 0x41, key: 0});
    assert.equal(shortcutPickLabel(picking, shortcutPick(picking, {mods: ["RALT"], keys: ["KC_EXLM"]})), "Left Shift + Right Alt + 1");
    // The Keys screen offers a custom key for a symbol with the other side's modifiers.
    assert.deepEqual(shortcutOffer(picking, {mods: ["RALT"], keys: ["KC_EXLM"]}), {mods: 0x42, key: 0x1e});
});

test("modifiers no keycode can hold are offered as an unused custom key's shortcut", () => {
    const names = ["Left Ctrl", "Left Shift", "Left Alt", "Left GUI", "Right Ctrl", "Right Shift", "Right Alt", "Right GUI"];
    const wrappers = ["C", "S", "A", "G", "RCTL", "RSFT", "RALT", "RGUI"];
    const picking = {...model, vocabulary: {modifiers: names.map((label, i) => [1 << i, label]),
        pickerModifiers: names.map((label, i) => ({bit: 1 << i, value: wrappers[i], label}))}};
    assert.equal(shortcutOffer(picking, {mods: ["G", "RGUI"], keys: []}), null, "modifiers alone are modifierPick's");
    assert.deepEqual(shortcutOffer(picking, {mods: ["C", "RALT"], keys: ["KC_K"]}), {mods: 0x41, key: 0x0e}, "sides mixed with a key");
    assert.equal(shortcutOffer(picking, {mods: ["C", "S"], keys: ["KC_K"]}), null, "one side and a key is a keycode");
    assert.equal(shortcutOffer(picking, {mods: [], keys: []}), null);
    assert.equal(shortcutOffer(picking, {mods: ["C", "RALT"], keys: ["KC_LEFT_CTRL"]}), null, "a key no shortcut can hold");
    assert.equal(shortcutOffer({...picking, customKeyShortcutKeys: []}, {mods: ["C", "RALT"], keys: ["KC_K"]}), null, "firmware without shortcuts");
    assert.equal(offeredName(picking, {mods: 0x88, key: 0}), "Left GUI + Right GUI");
    assert.equal(offeredName(picking, {mods: 0x33, key: 0}), "LCtrl+LShift+RCtrl+RShift", "too long in words: written short");
    assert.equal(offeredName(picking, {mods: 0xff, key: 0x0e}), "", "too long even short: left empty");
    // The first custom key that does nothing yet: no name, behaviour or
    // shortcut, and on no layer.
    const keys = [0, 1, 2, 3].map((slot) => ({slot, keycode: `CUSTOM_KEY_${slot}`, code: 0x7f00 + slot, name: slot === 0 ? "Thumb" : "", hasBehavior: slot === 1, shortcut: {mods: 0, key: 0}, shortcutLabel: ""}));
    const stack = withAnswers([{index: 0, name: "Base", positions: [{layoutIndex: 0, keycode: "QK_USER_2", semantic: "CUSTOM_KEY_2", display: "CUSTOM_KEY_2"}]}]);
    assert.equal(unusedCustomKey({...picking, customKeys: keys, keyBehaviors: [], combos: [], qmkKeycodeAliases: {}}, stack)?.keycode, "CUSTOM_KEY_3");
});

test("a custom key that already holds the shortcut is used rather than another made", () => {
    const both = (slot, hasBehavior) => ({slot, keycode: `CUSTOM_KEY_${slot}`, code: 0x7f00 + slot, name: `K${slot}`, hasBehavior, shortcut: {mods: 0x88, key: 0}, shortcutLabel: "Left GUI + Right GUI"});
    const keys = {customKeys: [key(0), both(1, true), both(2, false)]};
    assert.equal(customKeyWithShortcut(keys, {mods: 0x88, key: 0})?.keycode, "CUSTOM_KEY_2", "a layout key runs the custom key's behaviour: only one without");
    assert.equal(customKeyWithShortcut(keys, {mods: 0x88, key: 0}, {runsBehaviour: false})?.keycode, "CUSTOM_KEY_1", "a step sends only the shortcut: any");
    assert.equal(customKeyWithShortcut(keys, {mods: 0x88, key: 0x0e}), undefined, "the key must match too");
    assert.equal(customKeyWithShortcut({customKeys: [key(0), both(1, true)]}, {mods: 0x88, key: 0}), undefined);
});

test("a match with a behaviour is offered beside a new key where the behaviour would run, and used as it is in a step", () => {
    const both = (slot, hasBehavior) => ({slot, keycode: `CUSTOM_KEY_${slot}`, code: 0x7f00 + slot, name: `K${slot}`, hasBehavior, shortcut: {mods: 0x88, key: 0}, shortcutLabel: "Left GUI + Right GUI"});
    const free = (slot) => ({...key(slot), name: ""});
    const choose = (keys, runsBehaviour) => {
        const choice = customKeyChoice({customKeys: keys, keyBehaviors: [], combos: [], qmkKeycodeAliases: {}}, {mods: 0x88, key: 0}, withAnswers([]), {runsBehaviour});
        return {existing: choice.existing?.keycode, withBehaviour: choice.withBehaviour, spare: choice.spare?.keycode};
    };
    assert.deepEqual(choose([both(1, true), both(2, false), free(3)], true), {existing: "CUSTOM_KEY_2", withBehaviour: false, spare: undefined}, "one that does only this is used");
    assert.deepEqual(choose([both(1, true), free(3)], true), {existing: "CUSTOM_KEY_1", withBehaviour: true, spare: "CUSTOM_KEY_3"}, "a key or combo output: use it with its behaviour, or make a new one");
    assert.deepEqual(choose([both(1, true), free(3)], false), {existing: "CUSTOM_KEY_1", withBehaviour: false, spare: undefined}, "a step sends only the shortcut: used as it is");
    assert.deepEqual(choose([free(3)], true), {existing: undefined, withBehaviour: false, spare: "CUSTOM_KEY_3"});
});
