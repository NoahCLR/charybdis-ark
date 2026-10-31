"use strict";
const {profileLayers} = require("../fixtures/profile-document");
const test = require("node:test");
const assert = require("node:assert/strict");
const {document: pdDocument} = require("../fixtures/pd-profile");
const {fingerprint, validateSnapshot} = require("../../core/model/portable-profile");
const {customKeyEditorView} = require("../../core/model/custom-key-editor");
const {draftEdit} = require("../fixtures/draft-edit");
const {SHORTCUT_KEY_LIMITS, SHORTCUT_KEY_REFUSALS, shortcutKeysRefusal} = require("../../core/schema/settings-domain-v1");
const {macroEditorView} = require("../../core/model/macro-editor");
const {profileReview} = require("../../core/model/profile-review");
const {revertUnits} = require("../../core/model/profile-revert");
const {buildDeviceModel} = require("../../core/session/device-model");
const capabilities = {protocol: {major: 2, minor: 0}, schema: {major: 4, minor: 3}, compiledLayerCount: 16, supportedDomainMask: 127, actionAbiDigest: 0x67df11b3};
const snapshot = value => ({document: value, fingerprint: fingerprint(value)});

test("all 128 custom keys are listed, and a name changes nothing else", () => {
    const before = snapshot(pdDocument());
    const view = customKeyEditorView(before, capabilities);
    assert.equal(view.keys.length, 128);
    assert.deepEqual(view.keys[2], {slot: 2, keycode: "CUSTOM_KEY_2", code: 0x7f02, name: "", hasBehavior: true, shortcut: {mods: 0, keys: [], layers: 0, layerKind: 0}}, "the compiled profile gives Click Spam a behaviour");
    assert.deepEqual(view.keys[127], {slot: 127, keycode: "CUSTOM_KEY_127", code: 0x7f7f, name: "", hasBehavior: false, shortcut: {mods: 0, keys: [], layers: 0, layerKind: 0}});
    assert.deepEqual(view.names, {perName: 32}, "a name is counted in bytes of UTF-8");
    assert.ok(["KC_A", "KC_EXSEL", "QK_MOUSE_BUTTON_1", "MS_BTN1", "QK_MOUSE_BUTTON_8", "KC_SYSTEM_POWER", "KC_AUDIO_MUTE", "KC_MEDIA_PLAY_PAUSE", "KC_LAUNCHPAD", "QK_MOUSE_CURSOR_UP", "QK_MOUSE_WHEEL_RIGHT"]
        .every(name => view.shortcutKeys.includes(name)), "keyboard, system and media keys, mouse buttons, the wheel and cursor movement");
    assert.ok(!["KC_LEFT_CTRL", "KC_LCTL", "KC_NO", "KC_TRANSPARENT", "QK_MOUSE_ACCELERATION_0", "CUSTOM_KEY_0", "MACRO_0"].some(name => view.shortcutKeys.includes(name)),
        "modifiers belong in the mask; mouse-key acceleration and user keys stay out");
    // The picker's limits: the codec's own caps, as data, in its words
    // (firmware D-F26), with no catalogue name to match.
    assert.equal(view.shortcutKeyLimits, SHORTCUT_KEY_LIMITS);
    assert.deepEqual(view.shortcutKeyLimits.caps.map(cap => [cap.keycodes?.length ?? null, cap.each, cap.most]), [[null, false, 6], [null, true, 1], [27, false, 1], [3, false, 1]],
        "six keys, each once, one media key, one system key");
    assert.deepEqual(view.shortcutKeyLimits.caps.map(cap => cap.refusal), [shortcutKeysRefusal([4, 5, 6, 7, 8, 9, 10]), shortcutKeysRefusal([4, 4]), shortcutKeysRefusal([0xae, 0xa9]), shortcutKeysRefusal([0xa5, 0xa6])],
        "each cap says what the codec says when it is broken");
    assert.ok(view.shortcutKeyLimits.caps[2].keycodes.includes(0xae) && view.shortcutKeyLimits.caps[2].keycodes.includes(0xc2) && !view.shortcutKeyLimits.caps[2].keycodes.includes(0xa7), "Play and Launchpad are media keys, Wake is not");
    assert.deepEqual(view.shortcutKeyLimits.caps[3].keycodes, [0xa5, 0xa6, 0xa7], "power, sleep and wake");
    assert.equal(view.shortcutKeyLimits.words, "up to 6 keys held together, at most one media key and one system key");
    const named = draftEdit(before, {type: "updateCustomKey", keycode: "CUSTOM_KEY_2", name: " Click Spam "}, capabilities);
    const after = validateSnapshot(named, capabilities);
    assert.equal(after.settings.formatVersion, 11);
    assert.equal(after.settings.customKeyNames[2], "Click Spam", "trimmed");
    assert.deepEqual(after.settings.macroNames, validateSnapshot(before.document).settings.macroNames, "the macros keep their names");
    assert.deepEqual(profileLayers(named), profileLayers(before.document));
    const [item] = profileReview(before, snapshot(named)).filter(row => row.unit === "customKey:2");
    assert.equal(item.title, "Custom key 2 · Click Spam");
    assert.equal(item.fields.find(field => field.label === "Name").after, "Click Spam");
    assert.deepEqual(profileLayers(revertUnits(before, snapshot(named), new Set(["customKey:2"]), capabilities)), profileLayers(before.document));
    assert.equal(validateSnapshot(revertUnits(before, snapshot(named), new Set(["customKey:2"]), capabilities)).settings.customKeyNames[2], "", "discarded alone");
    const model = buildDeviceModel({customKeyView: customKeyEditorView(snapshot(named), capabilities), capabilities});
    assert.equal(model.customKeys[2].name, "Click Spam");
    assert.equal(model.qmkKeyLabels.CUSTOM_KEY_2, "Click Spam", "it reads by its name wherever a key is labelled");
    assert.equal(model.customKeyEditing.writable, true);
});

test("a macro name edit keeps the custom-key names", () => {
    let current = snapshot(pdDocument());
    current = snapshot(draftEdit(current, {type: "updateCustomKey", keycode: "CUSTOM_KEY_0", name: "Right Thumb"}, capabilities));
    current = snapshot(draftEdit(current, {type: "updateMacro", keycode: "MACRO_3", name: "OCR Copy"}, capabilities));
    const settings = validateSnapshot(current.document).settings;
    assert.equal(settings.formatVersion, 11);
    assert.equal(settings.customKeyNames[0], "Right Thumb");
    assert.equal(macroEditorView(current).macros[3].name, "OCR Copy");
});

test("an imported profile without custom-key names can take one name back from the keyboard", () => {
    let keyboard = snapshot(pdDocument());
    keyboard = snapshot(draftEdit(keyboard, {type: "updateCustomKey", keycode: "CUSTOM_KEY_0", name: "Right Thumb"}, capabilities));
    keyboard = snapshot(draftEdit(keyboard, {type: "updateCustomKey", keycode: "CUSTOM_KEY_1", name: "Left Thumb"}, capabilities));
    const imported = snapshot(pdDocument());
    assert.deepEqual(validateSnapshot(imported.document).settings.customKeyNames, Array(128).fill(""), "a backup whose custom keys have no names");
    assert.deepEqual(profileReview(keyboard, imported).filter(row => row.unit.startsWith("customKey:")).map(row => row.unit), ["customKey:0", "customKey:1"]);
    const kept = snapshot(revertUnits(keyboard, imported, new Set(["customKey:0"]), capabilities));
    const settings = validateSnapshot(kept.document, capabilities).settings;
    assert.equal(settings.formatVersion, 11);
    assert.deepEqual(settings.customKeyNames.slice(0, 2), ["Right Thumb", ""]);
    assert.deepEqual(settings.macroNames, validateSnapshot(imported.document).settings.macroNames, "the imported macro names stay");
    assert.deepEqual(profileReview(keyboard, kept).filter(row => row.unit.startsWith("customKey:")).map(row => row.unit), ["customKey:1"]);
});

test("wrong keys, long names and older firmware are refused", () => {
    const current = snapshot(pdDocument());
    const message = {type: "updateCustomKey", keycode: "CUSTOM_KEY_0", name: "Thumb"};
    for (const keycode of ["CUSTOM_KEY_128", "CUSTOM_KEY_01", "MACRO_0", "KC_A"]) assert.throws(() => draftEdit(current, {...message, keycode}, capabilities), /custom key/);
    assert.equal(validateSnapshot(draftEdit(current, {...message, keycode: "CUSTOM_KEY_127"}, capabilities)).settings.customKeyNames[127], "Thumb", "the last custom key is one");
    assert.throws(() => draftEdit(current, {...message, name: "x".repeat(33)}, capabilities), error => error.code === "CUSTOM_KEY_NAME_INVALID" && /32 bytes of text/.test(error.message));
    assert.throws(() => draftEdit(current, {...message, name: "tab\there"}, capabilities), error => error.code === "CUSTOM_KEY_NAME_INVALID" && /no control characters/.test(error.message));
    // Limits count bytes: sixteen two-byte letters fit, one more byte does not.
    assert.equal(validateSnapshot(draftEdit(current, {...message, name: "ü".repeat(16)}, capabilities)).settings.customKeyNames[0], "ü".repeat(16));
    assert.throws(() => draftEdit(current, {...message, name: `${"ü".repeat(16)}x`}, capabilities), error => error.code === "CUSTOM_KEY_NAME_INVALID");
    assert.equal(validateSnapshot(draftEdit(current, {...message, name: "Café"}, capabilities)).settings.customKeyNames[0], "Café", "accented letters are text");
    for (const actionAbiDigest of [0x61072732, 0xf79c6151]) {
        const older = {...capabilities, actionAbiDigest};
        assert.equal(customKeyEditorView(current, older), null, "no custom keys on firmware that numbers them differently");
        assert.throws(() => draftEdit(current, message, older), /keycode blocks/);
    }
    assert.equal(draftEdit(current, {...message, name: ""}, capabilities), validateSnapshot(current.document, capabilities).document, "an unchanged name is no edit");
});

test("a shortcut is staged, reviewed beside the name, discarded alone and named in the host's words", () => {
    const before = snapshot(pdDocument());
    const message = {type: "updateCustomKeyShortcut", keycode: "CUSTOM_KEY_2", shortcut: {mods: 0x41, keys: [0x0e], layers: 0, layerKind: 0}};
    const changed = draftEdit(before, message, capabilities);
    const after = validateSnapshot(changed, capabilities);
    assert.deepEqual(after.settings.customKeyShortcuts[2], {mods: 0x41, keys: [0x0e], layers: 0, layerKind: 0}, "Left Ctrl + Right Alt + K, mixed sides");
    assert.equal(after.settings.customKeyNames[2], "", "the name is untouched");
    assert.deepEqual(after.settings.customKeyShortcuts.filter(({mods, keys}) => mods || keys.length).length, 1, "no other key changes");
    assert.deepEqual(profileLayers(changed), profileLayers(before.document));
    const [item] = profileReview(before, snapshot(changed)).filter(row => row.unit === "customKey:2");
    assert.equal(item.status, "added", "a key with no name or shortcut gains one");
    assert.deepEqual(item.fields.map(field => [field.label, field.before, field.after]), [["Shortcut", null, "Left Ctrl + Right Alt + K"]]);
    const reverted = revertUnits(before, snapshot(changed), new Set(["customKey:2"]), capabilities);
    assert.deepEqual(validateSnapshot(reverted, capabilities).settings.customKeyShortcuts[2], {mods: 0, keys: [], layers: 0, layerKind: 0}, "discarded with its key");
    // Modifiers alone and a key alone are shortcuts; both zero clears one.
    let current = snapshot(changed);
    for (const shortcut of [{mods: 0x0f, keys: [], layers: 0, layerKind: 0}, {mods: 0, keys: [0xd1], layers: 0, layerKind: 0}, {mods: 0, keys: [], layers: 0, layerKind: 0}]) {
        current = snapshot(draftEdit(current, {...message, shortcut}, capabilities));
        assert.deepEqual(validateSnapshot(current.document, capabilities).settings.customKeyShortcuts[2], shortcut);
    }
    assert.equal(draftEdit(current, {...message, shortcut: {mods: 0, keys: [], layers: 0, layerKind: 0}}, capabilities),
        validateSnapshot(current.document, capabilities).document, "an unchanged shortcut is no edit");
    for (const shortcut of [{mods: 0x100, keys: [], layers: 0, layerKind: 0}, {mods: 0, keys: [0xe0], layers: 0, layerKind: 0}, {mods: 1, keys: [0xdd], layers: 0, layerKind: 0}, {mods: 1, keys: [0x7f00], layers: 0, layerKind: 0},
        {mods: 1, keys: 4, layers: 0, layerKind: 0}, undefined, null]) {
        assert.throws(() => draftEdit(before, {...message, shortcut}, capabilities), error => error.code === "CUSTOM_KEY_SHORTCUT_INVALID", JSON.stringify(shortcut));
    }
    // Six keys, a media key among them, are one shortcut, named key by
    // key; a seventh, a key twice, a second media or system key are refused in
    // words.
    const six = {mods: 0x02, keys: [0x04, 0x16, 0x07, 0xae, 0xd1, 0xa6], layers: 0, layerKind: 0};
    const sixKeyed = snapshot(draftEdit(before, {...message, shortcut: six}, capabilities));
    assert.deepEqual(validateSnapshot(sixKeyed.document, capabilities).settings.customKeyShortcuts[2], six);
    const sixModel = buildDeviceModel({customKeyView: customKeyEditorView(sixKeyed, capabilities), capabilities});
    assert.deepEqual(sixModel.customKeys[2].shortcutKeys.slice(0, 4), ["Left Shift", "A", "S", "D"], "each key, in the order it is pressed");
    assert.equal(sixModel.customKeys[2].shortcutKeys.length, 7);
    assert.equal(sixModel.customKeys[2].shortcutLabel, sixModel.customKeys[2].shortcutKeys.join(" + "), "the list and the tab name every key");
    const [sixItem] = profileReview(before, sixKeyed).filter(row => row.unit === "customKey:2");
    assert.deepEqual(sixItem.fields.map(field => [field.label, field.after]), [["Shortcut", sixModel.customKeys[2].shortcutLabel]], "Review names every key");
    for (const [keys, words] of [[[4, 5, 6, 7, 8, 9, 10], /at most 6 keys/], [[4, 5, 4], /each key once/], [[0xae, 0xa9], /one media key/], [[0xa5, 0xa7], /one system key/]]) {
        assert.throws(() => draftEdit(before, {...message, shortcut: {mods: 0, keys, layers: 0, layerKind: 0}}, capabilities),
            error => error.code === "CUSTOM_KEY_SHORTCUT_INVALID" && words.test(error.message), keys.join());
    }
    // A byte that is no key a shortcut holds, or a message naming one key the
    // old way, is refused for what it is, in the codec's words.
    for (const [shortcut, words] of [[{mods: 1, keys: [0], layers: 0, layerKind: 0}, SHORTCUT_KEY_REFUSALS.none], [{mods: 1, keys: [1], layers: 0, layerKind: 0}, SHORTCUT_KEY_REFUSALS.transparent],
        [{mods: 1, keys: [0xdd], layers: 0, layerKind: 0}, SHORTCUT_KEY_REFUSALS.acceleration], [{mods: 1, keys: [0xe1], layers: 0, layerKind: 0}, SHORTCUT_KEY_REFUSALS.modifier],
        [{mods: 1, keys: [0x7f00], layers: 0, layerKind: 0}, SHORTCUT_KEY_REFUSALS.kind], [{mods: 1, keys: 4, layers: 0, layerKind: 0}, SHORTCUT_KEY_REFUSALS.list],
        [{mods: 1, key: 4, layers: 0, layerKind: 0}, SHORTCUT_KEY_REFUSALS.single], [{mods: 0x100, keys: [], layers: 0, layerKind: 0}, SHORTCUT_KEY_REFUSALS.shape], [null, SHORTCUT_KEY_REFUSALS.shape]]) {
        assert.throws(() => draftEdit(before, {...message, shortcut: /** @type {any} */ (shortcut)}, capabilities),
            error => error.code === "CUSTOM_KEY_SHORTCUT_INVALID" && error.message === words, JSON.stringify(shortcut));
    }
    // Named for the host: macOS calls Alt Option and GUI Command.
    const model = buildDeviceModel({customKeyView: customKeyEditorView(snapshot(changed), capabilities), capabilities});
    assert.equal(model.customKeys[2].shortcutLabel, "Left Ctrl + Right Alt + K");
    assert.equal(model.customKeys[3].shortcutLabel, "");
    assert.deepEqual(model.customKeys[2].shortcutKeys, ["Left Ctrl", "Right Alt", "K"], "what it sends, one part each, for the hover card");
    assert.deepEqual(model.customKeys[3].shortcutKeys, []);
    assert.equal(model.qmkKeycodes.find(entry => entry.value === "CUSTOM_KEY_2").tip, "Custom key 2 · sends Left Ctrl + Right Alt + K", "the picker's tip names it");
    assert.equal(model.qmkKeycodes.find(entry => entry.value === "CUSTOM_KEY_3").tip, "Custom key 3 · no shortcut");
    const {shortcutKeys, shortcutLabel, profileKeyNames} = require("../../core/model/key-names");
    // Its layers follow, by name, lowest first (firmware D-F26).
    const named = profileKeyNames({hostOs: 1, layers: ["Base", "Numbers", "Symbols", "Navigation", "", "Extra"]});
    assert.equal(shortcutLabel(named, {mods: 0x08, keys: [], layers: (1 << 5) | (1 << 3), layerKind: 0}), "Left Command + Navigation + Extra");
    assert.equal(shortcutLabel(named, {mods: 0, keys: [], layers: 1 << 4, layerKind: 0}), "Layer 4", "an unnamed layer by its number");
    // Any kind but hold leads its layers with its layer key's verb.
    assert.deepEqual([1, 2, 3, 4].map((layerKind) => shortcutLabel(named, {mods: 0x08, keys: [], layers: (1 << 5) | (1 << 3), layerKind})),
        ["Left Command + Lock Navigation + Extra", "Left Command + Move to Navigation + Extra", "Left Command + Tap-toggle Navigation + Extra", "Left Command + One-shot Navigation + Extra"]);
    assert.equal(shortcutLabel(named, {mods: 0, keys: [], layers: 1 << 3, layerKind: 1}), "Lock Navigation", "layers alone");
    // A tip says what it does: a shortcut of layers alone by what it does
    // with them, not "sends".
    const {shortcutAct} = require("../../core/model/key-names");
    assert.deepEqual([0, 1, 2, 3, 4].map((layerKind) => shortcutAct(named, {mods: 0, keys: [], layers: (1 << 5) | (1 << 3), layerKind})),
        ["holds Navigation + Extra on", "locks Navigation + Extra", "moves to Navigation + Extra", "tap-toggles Navigation + Extra", "turns Navigation + Extra on as a one-shot"]);
    assert.equal(shortcutAct(named, {mods: 0x08, keys: [], layers: 1 << 3, layerKind: 1}), "sends Left Command + Lock Navigation");
    assert.equal(shortcutAct(named, {mods: 0, keys: [], layers: 0, layerKind: 0}), "");
    assert.deepEqual(shortcutKeys(named, {mods: 0x08, keys: [], layers: 1 << 3, layerKind: 0}), ["Left Command"], "its layers are not keys it sends");
    assert.equal(shortcutLabel(profileKeyNames({hostOs: 1}), {mods: 0x8c, keys: [0xd1], layers: 0, layerKind: 0}), "Left Alt + Left GUI + Right GUI + Mouse Button 1".replace(/Alt/, "Option").replace(/GUI/g, "Command"));
    assert.ok(model.customKeyShortcutKeys.includes("KC_K"));
});

test("one message can name a custom key and set its shortcut together", () => {
    const before = snapshot(pdDocument());
    const after = validateSnapshot(draftEdit(before, {type: "updateCustomKeyShortcut", keycode: "CUSTOM_KEY_9", name: "Both GUI", shortcut: {mods: 0x88, keys: [], layers: 0, layerKind: 0}}, capabilities));
    assert.equal(after.settings.customKeyNames[9], "Both GUI");
    assert.deepEqual(after.settings.customKeyShortcuts[9], {mods: 0x88, keys: [], layers: 0, layerKind: 0});
    assert.throws(() => draftEdit(before, {type: "updateCustomKeyShortcut", keycode: "CUSTOM_KEY_9", name: "x", shortcut: {mods: 0, keys: [0xe0], layers: 0, layerKind: 0}}, capabilities),
        /not modifier keys/, "the shortcut is still checked");
});

test("a shortcut's layers are staged, listed by name, moved by a reorder and kept off the default layers", () => {
    const {reorderLayers} = require("../../core/model/portable-profile");
    const {settingsEditorView} = require("../../core/model/settings-editor");
    const before = snapshot(pdDocument());
    const names = validateSnapshot(before.document).settings.names;
    // Firmware D-F26: layers alone are a shortcut; the base layer never is one.
    const layered = snapshot(draftEdit(before, {type: "updateCustomKeyShortcut", keycode: "CUSTOM_KEY_9", shortcut: {mods: 0x08, keys: [], layers: (1 << 3) | (1 << 6), layerKind: 0}}, capabilities));
    assert.deepEqual(validateSnapshot(layered.document).settings.customKeyShortcuts[9], {mods: 0x08, keys: [], layers: 0b1001000, layerKind: 0});
    assert.throws(() => draftEdit(before, {type: "updateCustomKeyShortcut", keycode: "CUSTOM_KEY_9", shortcut: {mods: 0, keys: [], layers: 1, layerKind: 0}}, capabilities),
        error => error.code === "CUSTOM_KEY_SHORTCUT_INVALID" && /^Base is the base layer: it is always on/.test(error.message));
    const view = customKeyEditorView(layered, capabilities);
    assert.deepEqual(view.shortcutLayers.filter(target => target.refusal).map(target => target.layer), [0], "only the base layer is always on here");
    const model = buildDeviceModel({customKeyView: view, capabilities});
    // Built without the profile's layer names, the layers read by number.
    assert.equal(model.customKeys[9].shortcutLabel, "Left GUI + Layer 3 + Layer 6");
    assert.deepEqual(model.customKeyShortcutLayers[0], {layer: 0, refusal: model.customKeyShortcutLayers[0].refusal, alwaysOn: "base"});
    // A reorder renumbers its layers as it does layer keys.
    const moved = validateSnapshot(reorderLayers(layered.document, [0, 3, 1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]));
    assert.equal(moved.settings.customKeyShortcuts[9].layers, (1 << 1) | (1 << 6));
    // Settings refuse to make a layer the shortcut turns on a default layer.
    const section = settingsEditorView(layered).sections.find(entry => entry.id === "startupLayers");
    const keep = field => field.kind === "toggle" ? {macro: field.macro, enabled: field.enabled} : {macro: field.macro, value: field.value};
    const fields = section.fields.map(field => field.macro === "startupLayer3" ? {macro: field.macro, enabled: true} : keep(field));
    assert.throws(() => draftEdit(layered, {type: "updateConfigDefaults", sectionId: "startupLayers", fields}, capabilities),
        new RegExp(`^Error: ${names[3]} is turned on by Custom key 9's shortcut, and a shortcut cannot turn on a default layer`));
    // A layer no shortcut names may still become one.
    const free = section.fields.map(field => field.macro === "startupLayer2" ? {macro: field.macro, enabled: true} : keep(field));
    assert.doesNotThrow(() => draftEdit(layered, {type: "updateConfigDefaults", sectionId: "startupLayers", fields: free}, capabilities));
});
