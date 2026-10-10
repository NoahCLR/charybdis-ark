"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const {hostKeyVocabulary, keyLabel, keyLabelWithName, profileKeyNames} = require("../../core/model/key-names");
const {decodedDeviceProfile} = require("../fixtures/device-profile");
const keycodes = require("../../core/data/keycode-catalog");
const {PD_SLOT_BINDINGS: PD_BINDINGS} = require("../../core/data/pd-bindings");

const PD_SLOT_0 = PD_BINDINGS[0].holdCode;

test("semantic target aliases link the native ABI and stay absent for an unknown one", () => {
    const behaviors = decodedDeviceProfile().domains.keyBehaviors.rows;
    const {aliases} = profileKeyNames({behaviors, actionsKnown: true});
    assert.equal(aliases[keycodes.resolve(PD_SLOT_0).name], "PD_SLOT_0");
    assert.equal(aliases[keycodes.resolve(PD_BINDINGS[5].holdCode).name], "PD_SLOT_5");
    assert.deepEqual(profileKeyNames({behaviors, actionsKnown: false}).aliases, {});
});

test("a key reads by the profile's name for it, under every name it is known by", () => {
    const names = profileKeyNames({
        actionsKnown: true,
        macros: [{keycode: "VIA_MACRO_0", name: "Copy line"}, {keycode: "VIA_MACRO_1", name: ""}],
        pdModes: [{id: 0, kind: 2, name: "Dragscroll"}, {id: 1, kind: 0, name: ""}],
    });
    assert.equal(keyLabel(names, PD_SLOT_0), "Dragscroll · hold", "not the catalogue's bare user slot");
    assert.equal(names.labels.PD_SLOT_0, "Dragscroll · hold");
    assert.equal(keyLabel(names, PD_BINDINGS[1].holdCode), "Slot 1 · hold (empty)", "an empty slot says so");
    assert.equal(keyLabel(names, PD_BINDINGS[0].lockCode), "Dragscroll · toggle");
    assert.equal(names.labels.VIA_MACRO_0, "Copy line");
    assert.equal(names.labels.VIA_MACRO_1, "Macro 1", "an unnamed macro reads by its number");
    assert.equal(keyLabel(names, 0x04), "A", "the rest reads as the catalogue names it");
    assert.equal(keyLabel(profileKeyNames(), PD_SLOT_0), keycodes.resolve(PD_SLOT_0).label, "no profile, no renaming");
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
            const entry=keycodes.lookup(key);
            assert.equal(keyLabel(names,entry.value),label);
            assert.equal(names.labels[key],label);
            for(const alias of entry.aliases) assert.equal(names.labels[alias],label);
        }
        assert.equal(keyLabel(names,keycodes.lookup('KC_MISSION_CONTROL').value),'Mission Control');
    }
});

test("modifier-bearing catalogue families inherit host vocabulary regardless of browsing group", () => {
    const {hostKeyLabel}=require('../../core/model/key-names');
    for(const hostOs of [0,1,2,3]) {
        const names=profileKeyNames({hostOs});
        for(const entry of keycodes.entries().filter(e=>/\b[LR]?(?:Alt|GUI|Cmd)\b/.test(e.label))) {
            const label=hostKeyLabel(entry.label,hostOs);
            assert.equal(keyLabel(names,entry.value),label,entry.name);
            for(const alias of entry.aliases || []) assert.equal(names.labels[alias],label,alias);
        }
        assert.equal(keyLabel(names,keycodes.lookup('SC_LAPO').value),hostKeyLabel('Left Alt/(',hostOs));
        assert.equal(keyLabel(names,keycodes.lookup('SC_RAPC').value),hostKeyLabel('Right Alt/)',hostOs));
    }
});
