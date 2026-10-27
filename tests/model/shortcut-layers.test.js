"use strict";
// The layers a custom key's shortcut may turn on (firmware D-F26): any but
// the base layer and the default layers, as the editor offers them and a
// staged shortcut, settings change or layer reorder is judged.
const test = require("node:test"), assert = require("node:assert/strict");
const {shortcutLayerReason, shortcutLayerTargets, shortcutRefusal, settingsShortcutRefusal, reorderShortcutRefusal} = require("../../core/model/shortcut-layers");
const {settings} = require("../fixtures/portable-profile");

test("the base layer and the default layers are always on, and say so by name", () => {
    const value = settings();
    assert.match(shortcutLayerReason(value, 0), /^Base is the base layer: it is always on, so a shortcut cannot turn it on/);
    assert.equal(shortcutLayerReason(value, 3), "");
    value.values[23] = (1 << 0) | (1 << 2);
    assert.match(shortcutLayerReason(value, 2), /^Symbols is a default layer: it is always on/);
    const targets = shortcutLayerTargets(value);
    assert.equal(targets.length, 16);
    assert.deepEqual(targets.filter(target => target.refusal).map(target => target.layer), [0, 2]);
    assert.deepEqual(targets[3], {layer: 3, refusal: "", alwaysOn: ""});
    assert.deepEqual([targets[0].alwaysOn, targets[2].alwaysOn], ["base", "default"], "which kind of layer, for the editor's words");
});

test("a shortcut naming a layer that is always on is refused in words", () => {
    const value = settings();
    assert.equal(shortcutRefusal(value, {layers: (1 << 3) | (1 << 5)}), "");
    assert.match(shortcutRefusal(value, {layers: (1 << 3) | 1}), /^Base is the base layer/);
    value.values[23] = 1 | (1 << 5);
    assert.match(shortcutRefusal(value, {layers: (1 << 3) | (1 << 5)}), /^Extra 1 is a default layer/);
});

test("a settings change or a layer reorder that makes a shortcut's layer a default layer is refused, naming the key", () => {
    const value = {...settings(), customKeyShortcuts: Array.from({length: 128}, () => ({mods: 0, keys: [], layers: 0, layerKind: 0}))};
    value.customKeyShortcuts[7] = {mods: 0x08, keys: [], layers: 1 << 3, layerKind: 0};
    value.customKeyNames[7] = "Cmd + Nav";
    assert.equal(settingsShortcutRefusal(value), "");
    value.values[23] = 1 | (1 << 3);
    assert.match(settingsShortcutRefusal(value), /^Navigation is turned on by Custom key 7 \(Cmd \+ Nav\)'s shortcut, and a shortcut cannot turn on a default layer/);
    const same = (mask) => mask;
    assert.match(reorderShortcutRefusal(value, value, same, true), /^This move would have Custom key 7 \(Cmd \+ Nav\)'s shortcut turn on Navigation, which would be a default layer, always on\. Change the shortcut first\.$/);
    assert.match(reorderShortcutRefusal(value, value, same, false), /Turn on Keys follow their layers, or change the shortcut first\.$/);
    value.values[23] = 1;
    assert.equal(reorderShortcutRefusal(value, value, same, true), "");
    // Onto the base layer, it says so.
    const based = {...value, customKeyShortcuts: value.customKeyShortcuts.map((shortcut, slot) => slot === 7 ? {...shortcut, layers: 1} : shortcut)};
    assert.match(reorderShortcutRefusal(value, based, same, false), /turn on Base, the base layer, always on\./);
    // Two of its layers landing on one would merge them: refused, naming both.
    const two = {...value, customKeyShortcuts: value.customKeyShortcuts.map((shortcut, slot) => slot === 7 ? {...shortcut, layers: (1 << 3) | (1 << 5)} : shortcut)};
    const merge = (mask) => (mask & (1 << 5) ? (mask & ~(1 << 5)) | (1 << 3) : mask);
    assert.match(reorderShortcutRefusal(two, {...two, customKeyShortcuts: two.customKeyShortcuts.map((shortcut) => ({...shortcut, layers: merge(shortcut.layers)}))}, merge, false),
        /^This move would have Custom key 7 \(Cmd \+ Nav\)'s shortcut turn on Navigation and Extra 1 as one layer, Navigation\. Turn on Keys follow their layers, or change the shortcut first\.$/);
});
