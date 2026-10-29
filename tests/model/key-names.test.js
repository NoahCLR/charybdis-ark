"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const {heldModifierWords, hostKeyVocabulary, keyLabel, keyLabelWithName, layerModWords, profileKeyNames} = require("../../core/model/key-names");
const {decodedDeviceProfile} = require("../fixtures/device-profile");
const catalog = require("../../core/data/keycode-catalog");
const keycodes = require("../../core/schema/keycodes");
const {PD_MODE_KEYS} = require("../../core/data/pd-mode-keys");

const PD_MODE_0 = PD_MODE_KEYS[0].holdCode;

test("compact basic-key labels retain modifier side, host and layout naming under every alias", () => {
    const {compactKeyLabels} = require("../../core/model/key-names");
    for (const [hostOs, gui, alt] of [[0, "GUI", "Alt"], [1, "Cmd", "Opt"], [2, "Win", "Alt"], [3, "Super", "Alt"]]) {
        const full = profileKeyNames({hostOs, hostLayout: 9}).labels;
        const compact = compactKeyLabels(full);
        assert.equal(compact.KC_LGUI, `L ${gui}`);
        assert.equal(compact.KC_RIGHT_GUI, `R ${gui}`);
        assert.equal(compact.KC_RALT, `R ${alt}`);
        assert.equal(compact.KC_Y, "Z", "German host naming survives shortening");
        assert.equal(full.KC_LGUI, `Left ${hostOs === 1 ? "Command" : hostOs === 2 ? "Windows" : gui}`, "full names remain untouched");
    }
    assert.equal(compactKeyLabels({}).KC_SPC, "Space");
    assert.equal(compactKeyLabels({KC_A: "An unfamiliar long name"}).KC_A, "An unfamiliar long name", "an unknown name stays whole");
    assert.equal(compactKeyLabels({}).MACRO_0, undefined, "profile names are not shortened");
});

test("semantic target aliases link the native ABI and stay absent for an unknown one", () => {
    const behaviors = decodedDeviceProfile().domains.keyBehaviors.rows;
    const {aliases} = profileKeyNames({behaviors, actionsKnown: true});
    assert.equal(aliases[keycodes.resolve(PD_MODE_0).name], "PD_MODE_0");
    assert.equal(aliases[keycodes.resolve(PD_MODE_KEYS[5].holdCode).name], "PD_MODE_5");
    assert.deepEqual(profileKeyNames({behaviors, actionsKnown: false}).aliases, {});
});

test("a layer-mod's modifiers read in the host's words, as its label ends", () => {
    const shift = /** @type {number} */ (keycodes.encode("LM(1,MOD_LSFT)")), mac = /** @type {number} */ (keycodes.encode("LM(2,MOD_LCTL|MOD_LGUI)"));
    const names = profileKeyNames({layers: ["Base", "Numbers", "Symbols"], hostOs: 1});
    assert.equal(layerModWords(names, shift), "Shift");
    assert.equal(layerModWords(names, mac), "Ctrl+Command");
    assert.equal(keyLabel(names, mac), "Symbols + Ctrl+Command");
    assert.equal(layerModWords(names, 0x04), undefined, "any other key holds no layer's modifiers");
});

// A mod-tap's hold names its modifiers from the keycode's modifier bits, the
// way a layer-mod does, never by cutting its label.
test("a mod-tap's modifiers read from its bits, in the host's words", () => {
    const command = /** @type {number} */ (keycodes.encode("MT(MOD_LGUI,KC_A)")), right = /** @type {number} */ (keycodes.encode("MT(MOD_RCTL|MOD_RSFT,KC_SLSH)"));
    assert.equal(keycodes.resolve(command).modifiers, "Cmd", "resolve carries a mod-tap's modifiers as a layer-mod's");
    const mac = profileKeyNames({hostOs: 1}), windows = profileKeyNames({hostOs: 2});
    assert.equal(heldModifierWords(mac, command), "Command");
    assert.equal(heldModifierWords(windows, command), "Windows");
    assert.equal(heldModifierWords(mac, right), "Right Ctrl+Right Shift");
    assert.equal(keyLabel(mac, command), "A / Command");
    assert.equal(keyLabel(mac, right), `${keyLabel(mac, 0x38)} / Right Ctrl+Right Shift`, "the tap reads by its own name");
    assert.equal(heldModifierWords(mac, /** @type {number} */ (keycodes.encode("LM(1,MOD_LSFT)"))), "Shift", "a layer-mod's too");
    assert.equal(heldModifierWords(mac, 0x04), undefined, "a key that holds no modifiers");
    assert.equal(heldModifierWords(mac, /** @type {number} */ (keycodes.encode("LT(1,KC_A)"))), undefined, "a layer-tap holds a layer, not modifiers");
});

test("a key reads by the profile's name for it, under every name it is known by", () => {
    const names = profileKeyNames({
        actionsKnown: true,
        macros: [{keycode: "MACRO_0", name: "Copy line"}, {keycode: "MACRO_1", name: ""}],
        pdModes: [{id: 0, kind: 2, name: "Dragscroll"}, {id: 1, kind: 0, name: ""}],
    });
    assert.equal(keyLabel(names, PD_MODE_0), "Dragscroll · hold", "not the catalogue's bare user slot");
    assert.equal(names.labels.PD_MODE_0, "Dragscroll · hold");
    assert.equal(keyLabel(names, PD_MODE_KEYS[1].holdCode), "Slot 1 · hold (empty)", "an empty slot says so");
    assert.equal(keyLabel(names, PD_MODE_KEYS[0].lockCode), "Dragscroll · lock");
    assert.equal(names.labels.MACRO_0, "Copy line");
    assert.equal(names.labels.MACRO_1, "Macro 1", "an unnamed macro reads by its number");
    assert.equal(keyLabel(names, 0x04), "A", "the rest reads as the catalogue names it");
    assert.equal(keyLabel(profileKeyNames(), PD_MODE_0), keycodes.resolve(PD_MODE_0).label, "no profile, no renaming");
});

test("every custom key reads by its name, or by its number without one", () => {
    const names = profileKeyNames({actionsKnown: true, customKeys: [{slot: 0, name: "Right Thumb"}, {slot: 1, name: ""}]});
    assert.equal(keyLabel(names, 0x7f00), "Right Thumb");
    assert.equal(names.labels.CUSTOM_KEY_0, "Right Thumb");
    assert.equal(keyLabel(names, 0x7f01), "Custom key 1");
    assert.equal(keyLabel(names, 0x7f7f), "Custom key 127", "all 128 exist, named or not");
    assert.equal(names.custom.length, 128);
    assert.equal(names.aliases[keycodes.resolve(0x7f00).name], "CUSTOM_KEY_0");
    assert.deepEqual(profileKeyNames({actionsKnown: false}).custom, [], "an unknown ABI numbers its keys otherwise");
});

test("a key's name is added only where it tells two alike labels apart", () => {
    assert.equal(keyLabelWithName({}, 0x1e), "1 (KC_1)");
    assert.equal(keyLabelWithName({}, 0x59), "1 (KC_KP_1)");
    const unknown = keycodes.resolve(0xfffe);
    assert.equal(keyLabelWithName({}, 0xfffe), unknown.label === unknown.name ? unknown.name : `${unknown.label} (${unknown.name})`);
});

test("a layer key names its layer by name; only the raw keycode keeps the number", () => {
    const names = profileKeyNames({layers: ["Base", "Numbers", "Symbols", "Navigation"], actionsKnown: true});
    assert.equal(keyLabel(names, 0x5223), "Hold Navigation", "MO(3)");
    assert.equal(keyLabel(names, 0x5261), "Lock Numbers", "TG is a lock on this firmware");
    assert.equal(keyLabel(names, 0x5282), "One-shot Symbols");
    assert.equal(keyLabel(names, 0x52c1), "Tap-toggle Numbers");
    assert.equal(keyLabel(names, 0x5200), "Move to Base");
    assert.equal(names.labels["LOCK_LAYER(2)"], "Lock Symbols");
    assert.equal(keyLabel(names, 0x4338), "/ / Navigation", "LT(3,KC_SLASH): the tap key and the layer, both named");
    assert.equal(keyLabelWithName(names, 0x4338), "/ / Navigation (LT(3,KC_SLASH))", "the raw keycode, where one is shown, keeps the number");
    assert.equal(keyLabel(profileKeyNames({layers: ["Base", ""]}), 0x5221), "Hold Layer 1", "an unnamed layer reads as the layer tabs name it");
    assert.equal(profileKeyNames({layers: []}).labels["LOCK_LAYER(1)"], undefined, "a layer lock needs the action ABI");
    const lock = keycodes.resolve(require("../../core/schema/compiled-profile-v1").resolveNativeQmkExpression("LOCK_LAYER(2)", {})).name;
    assert.equal(names.aliases[lock], "LOCK_LAYER(2)", "the user slot a layer lock is stored as is known as the lock");
});

test("host names preserve modifier keycodes and compose shortcuts and mod-taps", () => {
    for (const [hostOs, alt, gui] of [[1, "Option", "Command"], [2, "Alt", "Windows"], [3, "Alt", "Super"]]) {
        const names = profileKeyNames({hostOs});
        assert.equal(keyLabel(names, 0xe2), `Left ${alt}`);
        assert.equal(keyLabel(names, 0xe7), `Right ${gui}`);
        assert.equal(names.labels.KC_LGUI, `Left ${gui}`);
        assert.equal(keyLabel(names, 0x0804), `${gui}+A`);
        assert.equal(keyLabel(names, 0x2804), `A / ${gui}`);
        assert.equal(keycodes.resolve(0x0804).name, "LGUI(KC_A)");
    }
});

for (const [hostOs, alt, gui] of [[0, "Alt", "GUI"], [1, "Option", "Command"], [2, "Alt", "Windows"], [3, "Alt", "Super"]]) {
    test(`host ${hostOs} shares all eight modifier names with basic keys, shortcuts and mod-taps`, () => {
        const names = profileKeyNames({hostOs});
        const {modifiers, pickerModifiers} = hostKeyVocabulary(hostOs);
        assert.deepEqual(modifiers.map(([, label]) => label), ["Left Ctrl", "Left Shift", `Left ${alt}`, `Left ${gui}`, "Right Ctrl", "Right Shift", `Right ${alt}`, `Right ${gui}`]);
        for (let i = 0; i < 8; i++) {
            const [bit, label] = modifiers[i];
            assert.equal(keyLabel(names, 0xe0 + i), label);
            const control = pickerModifiers[i];
            assert.equal(control.bit, bit);
            assert.equal(control.label, i < 4 ? label.replace(/^Left /, "") : label);
            const encodedMods = i < 4 ? bit : 0x10 | (bit >> 4);
            const shortcut = keycodes.resolve((encodedMods << 8) | 4);
            assert.equal(keyLabel(names, shortcut.value), `${control.label}+A`);
            assert.equal(keyLabel(names, 0x2000 | shortcut.value), `A / ${control.label}`);
        }
        assert.deepEqual(pickerModifiers.map(({value}) => value), ["C", "S", "A", "G", "RCTL", "RSFT", "RALT", "RGUI"]);
    });
}

test("layer modifiers and Magic actions share host words without rewriting unrelated labels", () => {
    for(const [hostOs,alt,gui] of [[0,'Alt','GUI'],[1,'Option','Command'],[2,'Alt','Windows'],[3,'Alt','Super']]) {
        const names=profileKeyNames({hostOs,layers:['Base','Navigation']});
        assert.equal(keyLabel(names,0x502c),`Navigation + ${alt}+${gui}`);
        for(const [key,label] of [['QK_MAGIC_SWAP_ALT_GUI',`Swap ${alt}⇄${gui}`],['QK_MAGIC_SWAP_LALT_LGUI',`Swap Left ${alt}⇄Left ${gui}`],['QK_MAGIC_SWAP_RALT_RGUI',`Swap Right ${alt}⇄Right ${gui}`]]) {
            const entry=catalog.lookup(key);
            assert.equal(keyLabel(names,entry.value),label);
            assert.equal(names.labels[key],label);
            for(const alias of entry.aliases) assert.equal(names.labels[alias],label);
        }
        assert.equal(keyLabel(names,catalog.lookup('KC_MISSION_CONTROL').value),'Mission Control');
    }
});

test("modifier-bearing catalogue families inherit host vocabulary regardless of browsing group", () => {
    const {hostKeyLabel}=require('../../core/model/key-names');
    for(const hostOs of [0,1,2,3]) {
        const names=profileKeyNames({hostOs});
        for(const entry of catalog.entries().filter(e=>/\b[LR]?(?:Alt|GUI|Cmd)\b/.test(e.label))) {
            const label=hostKeyLabel(entry.label,hostOs);
            assert.equal(keyLabel(names,entry.value),label,entry.name);
            for(const alias of entry.aliases || []) assert.equal(names.labels[alias],label,alias);
        }
        assert.equal(keyLabel(names,catalog.lookup('SC_LAPO').value),hostKeyLabel('Left Alt/(',hostOs));
        assert.equal(keyLabel(names,catalog.lookup('SC_RAPC').value),hostKeyLabel('Right Alt/)',hostOs));
    }
});

test("keys read as the host layout prints them, and stored keycodes do not change", () => {
    const german = profileKeyNames({hostLayout: 9});
    for (const [name, label] of [["KC_Y", "Z"], ["KC_Z", "Y"], ["KC_SCLN", "Ö"], ["KC_SEMICOLON", "Ö"], ["KC_MINS", "ß"], ["KC_GRV", "^ ◌"], ["KC_EXLM", "!"], ["KC_AT", "\""], ["KC_COLN", "Ö"]]) {
        assert.equal(german.labels[name], label, name);
    }
    assert.deepEqual(german.legends.KC_Y, ["Z", "", "", ""]);
    assert.deepEqual(german.legends.KC_1, ["1", "!", "", ""]);
    assert.deepEqual(german.legends.KC_GRV, ["^ ◌", "°", "", ""]);
    const french = profileKeyNames({hostLayout: 10});
    assert.equal(french.labels.KC_1, "&");
    assert.equal(french.labels.KC_EXLM, "1", "AZERTY types 1 with Shift");
    assert.deepEqual(french.legends.KC_1.slice(0, 2), ["&", "1"]);
    assert.equal(profileKeyNames({hostLayout: 2}).labels.KC_2, "2", "a digit is its own label on Dutch too");
    const us = profileKeyNames({});
    assert.equal(us.legends, null);
    assert.equal(us.labels.KC_Y, undefined, "US keeps the catalogue's labels");
    assert.equal(keycodes.encode("KC_Y"), 0x1c);
});

test("macOS ISO labels swap the same positions as playback, including modified keys", () => {
    const ansi = profileKeyNames({hostOs: 1, hostLayout: 2});
    const iso = profileKeyNames({hostOs: 1, hostLayout: 2, macosIso: true});
    assert.equal(ansi.labels.KC_GRV, "`");
    assert.equal(iso.labels.KC_GRV, "§");
    assert.equal(iso.labels.KC_NUBS, "`");
    assert.deepEqual(iso.legends.KC_GRV, ansi.legends.KC_NUBS);
    assert.deepEqual(iso.legends.KC_2, ["2", "@", "€", "™"]);
    assert.deepEqual(iso.legends.KC_E, ["E", "", "´ ◌", "‰"]);
    assert.equal(profileKeyNames({hostOs: 1, hostLayout: 9, macosIso: true}).labels.KC_GRV, "^ ◌", "only macOS layouts swap");
    assert.equal(profileKeyNames({hostOs: 2, hostLayout: 2, macosIso: true}).labels.KC_GRV, "§", "playback uses the layout's OS even if the effective OS differs");
    const german = profileKeyNames({hostOs: 2, hostLayout: 9});
    assert.equal(keyLabel(german, 0x133), "Ctrl+Ö");
    assert.equal(keyLabel(german, 0x21c), "Shift+Z");
    assert.equal(keyLabel(german, 0x233), "Ö");
    assert.equal(keyLabel(german, 0x211c), "Z / Ctrl");
    assert.equal(keyLabel(german, 0x4133), "Ö / Layer 1");
});

test("the layout read counts only keys the app cannot name", () => {
    const {unnamedKeyCount} = require("../../core/model/key-names");
    const layers = [{layer: 0, keys: [0x0004, 0x7e42, 0x7e85, 0x7ea3, 0x7ec2, 0x7e90, 0x7ee0].map((keycode) => ({keycode, resolved: keycodes.resolve(keycode)}))}];
    assert.equal(unnamedKeyCount(layers, {actionAbiDigest: 0x67df11b3}), 1, "configured or empty pointing slots are named; a code past the blocks is not");
    for (const actionAbiDigest of [0x1d3fcacc, 0x61072732]) assert.equal(unnamedKeyCount(layers, {actionAbiDigest}), 5, "older firmware's user keys are not read as blocks");
});

test("what a keycode is, where the interface treats it apart: transparent, disabled, a macro's or a custom key's", () => {
    const {keyKind} = require("../../core/model/key-names");
    const {CUSTOM_KEY_SLOTS, customKeyCode} = require("../../core/data/user-keycodes");
    const {QK} = require("../../rules/qmk-keycodes.mjs");
    assert.equal(keyKind(keycodes.encode("KC_TRANSPARENT")), "transparent");
    assert.equal(keyKind(keycodes.encode("KC_NO")), "disabled");
    for (const value of [QK.MACRO.first, QK.MACRO.last]) assert.equal(keyKind(value), "macro");
    for (const slot of [0, CUSTOM_KEY_SLOTS - 1]) assert.equal(keyKind(customKeyCode(slot)), "customKey");
    for (const value of [keycodes.encode("KC_A"), QK.MACRO.first - 1, QK.MACRO.last + 1, customKeyCode(CUSTOM_KEY_SLOTS), PD_MODE_KEYS[0].holdCode]) {
        assert.equal(keyKind(value), undefined, `0x${value.toString(16)}`);
    }
});
