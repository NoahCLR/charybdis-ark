"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {actionEffects, bit, codeName, keyEffects, layerEffects, linkFacts, keycodeLayersOn} = require("../../core/model/layer-effects");
const {PD_LINK_ENDS} = require("../../core/schema/pd-mode-domain-v1");
const {SETTING, SHORTCUT_LAYER_KINDS} = require("../../core/schema/settings-domain-v1");
const {LAYERS} = require("../../core/data/charybdis-layout");
const {settings} = require("../fixtures/portable-profile");
const {PD_MODE_KEYS} = require("../../core/data/pd-mode-keys");
const {customKeyCode, layerLockCode} = require("../../core/data/user-keycodes");

const MO = (n) => 0x5220 | n, TT = (n) => 0x52c0 | n, DF = (n) => 0x5240 | n;
const code = (operand) => ({kind: 1, flags: 0, operand});

test("a layer keycode holds, locks, moves or leaves its layer to QMK", () => {
    assert.deepEqual(layerEffects(MO(3)), [{kind: "hold", layer: 3}]);
    assert.deepEqual(layerEffects(TT(2)), [{kind: "hold", layer: 2}, {kind: "lock", layer: 2, taps: 5}], "TT() locks on its TAPPING_TOGGLE-th tap");
    assert.deepEqual(layerEffects(DF(1)), [{kind: "unowned", layer: 1}]);
    assert.deepEqual(layerEffects(MO(20)), [{kind: "unowned", layer: 20}], "a layer past the bank is QMK's");
    assert.deepEqual(layerEffects(0x0004), []);
    assert.deepEqual(actionEffects(code(MO(3))), [{kind: "hold", layer: 3}], "a stored keycode action does what its keycode does");
    assert.deepEqual(actionEffects(undefined), []);
});

test("a key's effects are told by the taps and holds that reach them, and a row with steps replaces TT()'s taps", () => {
    assert.deepEqual(keyEffects(TT(2), undefined).map(effect => [effect.kind, effect.how]), [["hold", "Hold TT(2)"], ["lock", "Tap TT(2) 5 times"]]);
    const row = {target: code(TT(2)), steps: [{tapIndex: 1, tap: code(MO(4))}]};
    assert.deepEqual(keyEffects(TT(2),row).map(effect => [effect.kind, effect.layer]), [["hold", 2]], "a tap that sends MO() sends it once, holding nothing");
});

test("a native keycode is named as the profile stores it", () => {
    assert.equal(codeName(0x0004), "KC_A");
    assert.equal(codeName(MO(3)), "MO(3)");
    assert.equal(codeName(layerLockCode(2)), "LOCK_LAYER(2)");
    assert.equal(codeName(customKeyCode(3)), "CUSTOM_KEY_3");
    assert.equal(codeName(PD_MODE_KEYS[5].lockCode), PD_MODE_KEYS[5].lock);
});

test("the layers a keycode turns on, as the keyboard runs it", () => {
    // A layer key's layer, a pointing-mode key's linked layers and a custom
    // key's shortcut layers; DF and PDF only make a layer the default, which
    // the keyboard leaves to QMK, so they turn none on.
    const decoded = {settings: settings(), pdModes: [{id: 5, kind: 1, name: "Zoom", linkedLayers: 0, linkTurnsOn: (1 << 3) | (1 << 4), linkEnds: 0}]};
    decoded.settings.customKeyShortcuts = Array.from({length: 128}, (_, slot) => (slot === 2 ? {mods: 0, keys: [], layers: (1 << 3) | (1 << 6), layerKind: 1} : {mods: 0, keys: [], layers: 0, layerKind: 0}));
    const turnsOn = keycodeLayersOn(decoded);
    assert.equal(turnsOn(0x5223), 1 << 3, "MO(3)");
    assert.equal(turnsOn(0x5263), 1 << 3, "TG(3)");
    assert.equal(turnsOn(0x5203), 1 << 3, "TO(3)");
    assert.equal(turnsOn(0x5283), 1 << 3, "OSL(3)");
    assert.equal(turnsOn(0x52c3), 1 << 3, "TT(3)");
    assert.equal(turnsOn(0x4338), 1 << 3, "LT(3,KC_SLASH)");
    assert.equal(turnsOn(0x5243), 0, "DF(3)");
    assert.equal(turnsOn(0x52e3), 0, "PDF(3)");
    assert.equal(turnsOn(0x0004), 0, "KC_A");
    assert.equal(turnsOn(PD_MODE_KEYS[5].holdCode), 1 << 3, "a pointing-mode key: its linked layers, less the pointer layer the keyboard ignores");
    assert.equal(turnsOn(PD_MODE_KEYS[5].lockCode), 1 << 3);
    assert.equal(turnsOn(customKeyCode(2)), (1 << 3) | (1 << 6), "a custom key's shortcut layers");
    assert.equal(turnsOn(customKeyCode(3)), 0);
});

test("a layer's bit is its place in a layer mask", () => {
    assert.equal(bit(0), 1);
    assert.equal(bit(3), 0b1000);
    assert.equal(bit(LAYERS - 1) >>> 0, 2 ** (LAYERS - 1), "the last layer of the bank");
    assert.equal([1, 3].reduce((mask, layer) => mask | bit(layer), 0), 0b1010);
});

test("a profile's links: the layers a mode's key turns on, the layers that start a mode, and the layers a custom key's shortcut turns on", () => {
    const policy = settings();
    const pointer = policy.values[SETTING.AUTO_MOUSE_LAYER];
    // Slot 1 turns on no kind of its own: a hold. Slot 2 turns on nothing.
    policy.customKeyShortcuts = Array.from({length: 128}, (_, slot) => (slot === 1 ? {mods: 0, keys: [], layers: 1 << 7}
        : slot === 3 ? {mods: 0, keys: [], layers: (1 << 8) | (1 << 9), layerKind: SHORTCUT_LAYER_KINDS.MOVE} : {mods: 0, keys: [], layers: 0, layerKind: 0}));
    const facts = linkFacts({settings: policy, pdModes: [
        // Its key turns on layer 5 and the pointer layer, which the keyboard ignores in a link.
        {id: 2, kind: 1, name: "Scroll", linkedLayers: 1 << 3, linkTurnsOn: (1 << 5) | (1 << pointer), linkEnds: PD_LINK_ENDS.NOTHING},
        {id: 3, kind: 1, name: "Arrow", linkedLayers: 1 << 2, linkTurnsOn: 0, linkEnds: PD_LINK_ENDS.HIGHER_LAYER},
        // A slot with no mode links nothing.
        {id: 6, kind: 0, name: "", linkedLayers: 1 << 6, linkTurnsOn: 1 << 6, linkEnds: PD_LINK_ENDS.NOTHING},
    ]});
    assert.deepEqual([...facts.modeLinks.modes], [[2, {layers: 1 << 5, name: "Scroll"}]]);
    assert.equal(facts.layerStarted, 1 << 3, "Scroll's start from layer 3 never ends");
    assert.equal(facts.endedStarts.length, 1);
    const [{layer, ends}] = facts.endedStarts;
    assert.equal(layer, 2, "Arrow starts from layer 2 while no higher layer is on");
    assert.ok(ends & (1 << 3) && !(ends & (1 << 2)), "a higher layer ends it, its own does not");
    assert.equal(ends & (1 << pointer), 0, "the pointer layer never ends it");
    assert.deepEqual([...facts.modeLinks.shortcuts], [[1, {layers: 1 << 7, layerKind: SHORTCUT_LAYER_KINDS.HOLD}], [3, {layers: (1 << 8) | (1 << 9), layerKind: SHORTCUT_LAYER_KINDS.MOVE}]]);
    assert.deepEqual(linkFacts({settings: settings()}), {modeLinks: {modes: new Map(), shortcuts: new Map()}, layerStarted: 0, endedStarts: []}, "no slots, no shortcuts: no links");
});
