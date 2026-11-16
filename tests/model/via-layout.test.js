"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {document} = require("../fixtures/portable-profile");
const {validateSnapshot, editProfileDomains} = require("../../core/model/portable-profile");
const {LAYER_SWITCHES, viaLayoutOf, importViaLayout, codeOf, viaMacroText} = require("../../core/model/via-layout");
const {encodeMacroPayload} = require("../../core/schema/macro-payload");
const {MATRIX_KEYS, LAYERS} = require("../../core/data/charybdis-layout");
const {NOTHING, TRANSPARENT} = require("../../rules/qmk-keycodes.mjs");
const {PROFILE_ACTION_KINDS} = require("../../core/schema/profile-blob-v1");
const {RGB_DOMAIN_V1, RGB_LAYER_MODES} = require("../../core/schema/rgb-domain-v1");
const {SETTING, SETTING_FIELDS} = require("../../core/schema/settings-domain-v1");
const {PD_LINK_ENDS} = require("../../core/schema/pd-mode-domain-v1");
const {CURRENT_CAPABILITIES} = require("../fixtures/portable-profile");

/** @param {(position: number) => string} key */
const layer = key => Array.from({length: MATRIX_KEYS}, (_, position) => key(position));
// A file as VIA's Save + Load pane saves it.
/** @param {{layers: string[][], macros?: string[]}} parts */
const viaFile = ({layers, macros = Array(16).fill("")}) => JSON.stringify({name: "Charybdis (4x6) Splinky", vendorProductId: 0xa8f80000 + 0x1834, macros, layers, encoders: []});
const named = () => editProfileDomains(document(), {}, open => {
    const settings = open("settings");
    settings.names.fill("Old");
    settings.macroNames.fill("Old");
    open("macros").fill(encodeMacroPayload("old", {}));
});

test("a VIA layout is told apart from a backup and from anything else", () => {
    assert.equal(viaLayoutOf(JSON.stringify(document())), undefined);
    assert.equal(viaLayoutOf("not json"), undefined);
    assert.equal(viaLayoutOf("[]"), undefined);
    const via = viaLayoutOf(viaFile({layers: [layer(() => "KC_A")]}));
    assert.equal(via?.layers.length, 1);
    assert.equal(via?.macros.length, 16);
});

test("a VIA layout for another keyboard, or with more layers than the keyboard, is refused whole", () => {
    assert.throws(() => viaLayoutOf(viaFile({layers: [Array(70).fill("KC_A")]})), /another keyboard: its layers have 70 keys, and a Charybdis 4x6's have 60/);
    // How many layers fit is the keyboard's, judged on import.
    const tooMany = /** @type {NonNullable<ReturnType<typeof viaLayoutOf>>} */ (viaLayoutOf(viaFile({layers: Array(LAYERS + 1).fill(layer(() => "KC_A"))})));
    assert.throws(() => importViaLayout(document(), tooMany), /has 17 layers, and the keyboard holds 16/);
    assert.throws(() => viaLayoutOf(JSON.stringify({layers: []})), /no layers Ark can read/);
    const via = /** @type {NonNullable<ReturnType<typeof viaLayoutOf>>} */ (viaLayoutOf(viaFile({layers: Array(5).fill(layer(() => "KC_A"))})));
    assert.throws(() => importViaLayout(document(), via, {capabilities: /** @type {any} */ ({compiledLayerCount: 4})}), /has 5 layers, and the keyboard holds 4/);
});

test("any number of VIA layers replaces that many, and every layer above is emptied", () => {
    for (const count of [1, 4, LAYERS]) {
        const via = /** @type {NonNullable<ReturnType<typeof viaLayoutOf>>} */ (viaLayoutOf(viaFile({layers: Array(count).fill(layer(() => "KC_B"))})));
        const result = importViaLayout(named(), via);
        const after = validateSnapshot(result.document);
        assert.equal(result.layers, count);
        after.layers.forEach((keys, index) => assert.deepEqual(keys, Array(MATRIX_KEYS).fill(index < count ? 0x05 : TRANSPARENT), `layer ${index} of ${count}`));
        assert.deepEqual(after.settings.names, Array(LAYERS).fill(""), "the replaced layers' names describe what they held");
    }
});

test("keys are read as VIA spells them, across its protocols", () => {
    for (const [spelling, code] of /** @type {const} */ ([
        ["KC_A", 0x04], ["KC_TRNS", 0x01], ["", NOTHING], ["0x7e85", 0x7e85],
        ["MT(MOD_LCTL,KC_A)", 0x2104], ["MT(MOD_LCTL | MOD_LSFT,KC_A)", 0x2304],
        // VIA names a right modifier beside its left one.
        ["MT(MOD_LCTL | MOD_RCTL,KC_A)", 0x3104], ["OSM(MOD_LSFT | MOD_RSFT)", 0x52b2], ["LM(1,MOD_LALT | MOD_RALT)", 0x5034],
        ["LT(1,KC_SPC)", 0x412c], ["MO(3)", 0x5223], ["TG(2)", 0x5262], ["C(S(KC_A))", 0x0304], ["LSG(KC_A)", 0x0a04],
        ["MACRO(0)", 0x7700], ["MACRO(40)", 0x7728], ["MACRO00", 0x7700], ["CUSTOM(2)", 0x7e02], ["USER03", 0x7e03],
        // Names VIA keeps that QMK has renamed.
        ["KC_SLCK", 0x47], ["RESET", 0x7c00], ["KC_GESC", 0x7c16], ["RGB_TOG", 0x7820], ["MAGIC_TOGGLE_NKRO", 0x7013], ["FN_MO13", 0x7c77],
        ["C(KC_NLCK)", 0x0153],
    ])) assert.equal(codeOf(spelling), code, spelling);
    for (const spelling of ["NOT_A_KEY", "LT(0,undefined)", "MACRO(200)", 12.5, null]) assert.equal(codeOf(spelling), undefined, String(spelling));
});

test("a key Ark cannot read or place is left empty and listed; the rest of the file still comes", () => {
    const keys = layer(position => position === 3 ? "NOT_A_KEY" : position === 4 ? "MO(20)" : position === 6 ? "CUSTOM(80)" : "KC_C");
    const via = /** @type {NonNullable<ReturnType<typeof viaLayoutOf>>} */ (viaLayoutOf(viaFile({layers: [keys]})));
    const result = importViaLayout(document(), via);
    const after = validateSnapshot(result.document);
    assert.equal(after.layers[0][3], NOTHING);
    assert.equal(after.layers[0][4], NOTHING);
    assert.equal(after.layers[0][5], 0x06);
    assert.equal(after.layers[0][6], NOTHING);
    assert.deepEqual(result.left.keys.map(key => [key.layer, key.position, key.spelling]), [[0, 3, "NOT_A_KEY"], [0, 4, "MO(20)"], [0, 6, "CUSTOM(80)"]]);
    assert.match(result.left.keys[0].reason, /does not know this key/);
    assert.equal(result.left.keys[0].layerName, "Base", "named as core names an unnamed layer");
    // VIA's CUSTOM(64) on is the block custom keys used before firmware D-F14.
    assert.equal(result.left.keys[2].reason, "It was custom key 16 on older firmware, and does nothing on this firmware.");
});

test("VIA's macros fill the first slots, every slot above is emptied, and their names are cleared", () => {
    const macros = ["Hello{KC_ENT}", "{KC_LCTL,KC_C}", "", "{+KC_LSFT}abc{-KC_LSFT}", ...Array(12).fill("")];
    const via = /** @type {NonNullable<ReturnType<typeof viaLayoutOf>>} */ (viaLayoutOf(viaFile({layers: [layer(() => "KC_A")], macros})));
    const result = importViaLayout(named(), via);
    const after = validateSnapshot(result.document);
    assert.equal(result.macros, 3);
    assert.deepEqual(after.macroSlots[0], encodeMacroPayload("Hello{KC_ENT}", {}));
    assert.deepEqual(after.macroSlots[1], encodeMacroPayload("{KC_LCTL,KC_C}", {}));
    assert.equal(after.macroSlots[2].length, 0);
    assert.ok(after.macroSlots.slice(4).every(slot => slot.length === 0), "the slots above the file's are emptied");
    assert.ok(after.settings.macroNames.every(name => name === ""));
});

test("a macro Ark cannot carry is left empty and listed, as is one past the keyboard's slots", () => {
    const macros = ["{NOT_A_KEY}", "fine", ...Array(126).fill(""), "past the bank"];
    const via = /** @type {NonNullable<ReturnType<typeof viaLayoutOf>>} */ (viaLayoutOf(viaFile({layers: [layer(() => "KC_A")], macros})));
    const result = importViaLayout(document(), via);
    const after = validateSnapshot(result.document);
    assert.equal(after.macroSlots[0].length, 0);
    assert.deepEqual(after.macroSlots[1], encodeMacroPayload("fine", {}));
    assert.deepEqual(result.left.macros.map(macro => macro.slot), [0, 128]);
    assert.match(result.left.macros[1].reason, /holds 128 macros/);
    assert.equal(result.macros, 1);
});

test("VIA's macro text is written in Ark's grammar", () => {
    for (const [via, ark] of [
        ["Hello{KC_ENT}", "Hello{KC_ENT}"], ["a{100}b", "a{100}b"], ["{+KC_LSFT}x{-KC_LSFT}", "{+KC_LSFT}x{-KC_LSFT}"],
        // VIA escapes an opening brace with a backslash; Ark doubles both.
        ["x\\{y}", "x{{y}}"], ["a}b", "a}}b"], ["C:\\path", "C:\\path"],
        // VIA reads a key in any case and keeps old names.
        ["{kc_lctl, kc_a}", "{KC_LCTL,KC_A}"], ["{KC_SLCK}", "{KC_SCROLL_LOCK}"],
    ]) assert.equal(viaMacroText(via), ark, via);
});

test("the rest of the draft stays as it was", () => {
    const before = validateSnapshot(document());
    const via = /** @type {NonNullable<ReturnType<typeof viaLayoutOf>>} */ (viaLayoutOf(viaFile({layers: [layer(() => "KC_A")]})));
    const after = validateSnapshot(importViaLayout(document(), via).document);
    for (const domain of /** @type {const} */ (["behaviors", "combos", "autocorrect"])) assert.deepEqual(after[domain], before[domain], domain);
    assert.deepEqual(withoutLayerState(after), withoutLayerState(before), "lighting, settings and pointing change only in each layer's own state and what points at an emptied layer");
    assert.deepEqual(after.settings.customKeyNames, before.settings.customKeyNames);
    assert.deepEqual(after.settings.customKeyShortcuts, before.settings.customKeyShortcuts);
});

// Lighting, settings and pointing, less each layer's own state
// (resetLayerState) and what points at a layer (settlePointing).
const LAYER_SETTINGS = [...Object.keys(LAYER_SWITCHES).map(Number), SETTING.AUTO_MOUSE_LAYER, SETTING.AUTO_MOUSE_ENABLED];
/** @param {ReturnType<typeof validateSnapshot>} decoded */
const withoutLayerState = ({rgb, settings, pdModes}) => {
    const {layerColors, layerGroupRows, ...lighting} = rgb;
    return {lighting, values: settings.values.map((value, id) => LAYER_SETTINGS.includes(id) ? null : value),
        pointing: pdModes.map(({linkedLayers, linkTurnsOn, linkEnds, ...slot}) => slot)};
};

test("every per-layer setting is one a layer's own state resets, or the pointer layer", () => {
    const perLayer = SETTING_FIELDS.filter(field => field.layerReference).map(field => field.id).sort((a, b) => a - b);
    assert.deepEqual(perLayer, [...Object.keys(LAYER_SWITCHES).map(Number), SETTING.AUTO_MOUSE_LAYER].sort((a, b) => a - b),
        "a new per-layer setting needs its reset in LAYER_SWITCHES (D-L97)");
});

test("each layer's own state is reset, lighting only where the layer is gone, so the layers the file leaves empty are empty layers (D-L76)", () => {
    const capabilities = CURRENT_CAPABILITIES;
    // A draft whose layers were coloured, matched combos elsewhere, took keys
    // out of behaviours, owned an accent and were switched on and off.
    const busy = editProfileDomains(document(), {capabilities}, open => {
        const rgb = open("rgb");
        rgb.layerColors.forEach(row => {row.color = {h: 40, s: 255, v: 200}; row.mode = RGB_LAYER_MODES.ALL_KEYS;});
        rgb.layerGroupRows.push({selector: 1, color: {h: 3, s: 255, v: 255}, groupId: rgb.groups[0].id},
            {selector: 9, color: {h: 1, s: 255, v: 255}, groupId: rgb.groups[0].id},
            {selector: RGB_DOMAIN_V1.SELECTOR_ALL, color: {h: 2, s: 255, v: 255}, groupId: rgb.groups[0].id});
        const settings = open("settings");
        settings.layers[9] = {reference: 2, bypass: [5], exclude: [6]};
        settings.values[SETTING.DEFAULT_LAYERS] = 0b1001;
        settings.values[SETTING.LAYER_BEHAVIORS] = 0b0110;
        settings.values[SETTING.LAYER_COMBOS] = 0b0011;
        settings.values[SETTING.AUTO_SNIPING_LAYERS] = 1 << 9;
        settings.values[SETTING.AUTO_MOUSE_LAYER] = 9;
    });
    const before = validateSnapshot(busy, capabilities);
    const via = /** @type {NonNullable<ReturnType<typeof viaLayoutOf>>} */ (viaLayoutOf(viaFile({layers: [layer(() => "KC_A"), layer(() => "KC_B")]})));
    const after = validateSnapshot(importViaLayout(busy, via, {capabilities}).document, capabilities);
    // The file fills Base and Layer 1: they keep their lighting. The rest are gone, and so is theirs.
    assert.deepEqual(after.rgb.layerColors.map(row => [row.color, row.mode]),
        after.rgb.layerColors.map((_, layer) => layer < 2 ? [{h: 40, s: 255, v: 200}, RGB_LAYER_MODES.ALL_KEYS] : [{h: 0, s: 0, v: 0}, RGB_LAYER_MODES.KEYS_MAPPED_ON_THIS_LAYER_ONLY]));
    assert.deepEqual(after.rgb.layerGroupRows.map(row => row.selector), [1, RGB_DOMAIN_V1.SELECTOR_ALL], "an accent on every layer is no layer's own");
    assert.deepEqual(after.settings.layers, after.settings.layers.map((_, layer) => ({reference: layer, bypass: [], exclude: []})));
    assert.equal(after.settings.values[SETTING.DEFAULT_LAYERS], 1);
    assert.equal(after.settings.values[SETTING.LAYER_BEHAVIORS], 2 ** LAYERS - 1);
    assert.equal(after.settings.values[SETTING.LAYER_COMBOS], 2 ** LAYERS - 1);
    assert.equal(after.settings.values[SETTING.AUTO_SNIPING_LAYERS], 0);
});

test("the file decides the pointer layer, and pointing modes let go of the layers it empties", () => {
    const capabilities = CURRENT_CAPABILITIES;
    // Auto-mouse on Layer 9, and a pointing mode started by Layers 1 and 9.
    /** @param {number} pointer @param {number} on */
    const pointing = (pointer, on) => editProfileDomains(document(), {capabilities}, open => {
        const settings = open("settings");
        settings.values[SETTING.AUTO_MOUSE_ENABLED] = on;
        settings.values[SETTING.AUTO_MOUSE_LAYER] = pointer;
        const slot = open("pdModes")[0];
        slot.linkedLayers = (1 << 1) | (1 << 9); slot.linkTurnsOn = 1 << 9; slot.linkEnds = PD_LINK_ENDS.HIGHER_LAYER;
    });
    const mouseLayer = layer(position => position === 10 ? "KC_MS_BTN1" : "KC_TRNS");
    /** @param {string[][]} layers @param {number} [pointer] @param {number} [on] */
    const imported = (layers, pointer = 9, on = 1) => {
        const result = importViaLayout(pointing(pointer, on), /** @type {NonNullable<ReturnType<typeof viaLayoutOf>>} */ (viaLayoutOf(viaFile({layers}))), {capabilities});
        const after = validateSnapshot(result.document, capabilities);
        return {pointer: result.pointer, layer: after.settings.values[SETTING.AUTO_MOUSE_LAYER], on: after.settings.values[SETTING.AUTO_MOUSE_ENABLED],
            link: ["linkedLayers", "linkTurnsOn", "linkEnds"].map(key => after.pdModes[0][key])};
    };
    const typing = layer(() => "KC_A");
    // Its highest layer above Base with a mouse button, from a layer it empties or one it fills.
    assert.deepEqual(imported([typing, typing, mouseLayer, typing]),
        {pointer: {layer: 2, layerName: "Layer 2", change: "moved"}, layer: 2, on: 1, link: [1 << 1, 0, PD_LINK_ENDS.HIGHER_LAYER]});
    assert.deepEqual(imported([typing, typing, mouseLayer, typing], 1).pointer, {layer: 2, layerName: "Layer 2", change: "moved"}, "a typing layer is no pointer layer");
    assert.equal(imported([typing, typing, mouseLayer], 2).pointer, null, "already there: nothing to say");
    // None: Auto-mouse turns off, and a pointer layer the file empties becomes its last.
    assert.deepEqual(imported([typing, typing]),
        {pointer: {layer: 1, layerName: "Layer 1", change: "off"}, layer: 1, on: 0, link: [1 << 1, 0, PD_LINK_ENDS.HIGHER_LAYER]});
    assert.deepEqual(imported([mouseLayer]).pointer, {layer: 0, layerName: "Base", change: "off"}, "Base is no pointer layer, mouse buttons or not");
    assert.deepEqual(imported([typing]).link, [0, 0, PD_LINK_ENDS.NOTHING], "a mode no layer starts has nothing to end it");
    // Already off: the layer still lets go of an emptied one, and there is nothing to say.
    assert.deepEqual(imported([typing, typing], 9, 0), {pointer: null, layer: 1, on: 0, link: [1 << 1, 0, PD_LINK_ENDS.HIGHER_LAYER]});
});

test("a blank slate is offered for what the draft has: behaviours on ordinary keys, combos, and custom keys in use", () => {
    const {CURRENT_CAPABILITIES} = require("../fixtures/portable-profile");
    const {viaClearable} = require("../../core/model/via-layout");
    const before = validateSnapshot(document());
    const custom = before.behaviors.rows.filter(row => row.target.kind === PROFILE_ACTION_KINDS.CUSTOM_KEY).length;
    assert.ok(custom > 0, "the fixture has behaviours on custom keys");
    assert.deepEqual(viaClearable(document(), CURRENT_CAPABILITIES),
        {behaviors: before.behaviors.rows.length - custom, combos: before.combos.rows.length, customKeys: 4});
    // Nothing of a kind, and there is nothing to offer.
    const bare = editProfileDomains(document(), {}, open => {open("behaviors").rows = []; open("combos").rows = [];});
    assert.deepEqual(viaClearable(bare, CURRENT_CAPABILITIES), {behaviors: 0, combos: 0, customKeys: 0});
});

test("each part of a blank slate goes on its own, and a custom key's behaviours go with the custom keys", () => {
    const {CURRENT_CAPABILITIES: capabilities} = require("../fixtures/portable-profile");
    const {viaClearable} = require("../../core/model/via-layout");
    const before = validateSnapshot(document(), capabilities);
    const via = /** @type {NonNullable<ReturnType<typeof viaLayoutOf>>} */ (viaLayoutOf(viaFile({layers: [layer(() => "KC_A")]})));
    /** @param {Partial<import("../../contracts/model.js").ViaClears>} clear */
    const after = clear => validateSnapshot(importViaLayout(document(), via, {capabilities, clear: {behaviors: false, combos: false, customKeys: false, ...clear}}).document, capabilities);
    const onCustom = (/** @type {{target: {kind: number}}} */ row) => row.target.kind === PROFILE_ACTION_KINDS.CUSTOM_KEY;

    const kept = after({});
    assert.deepEqual(kept.behaviors.rows, before.behaviors.rows, "nothing asked, nothing removed");
    assert.deepEqual(kept.combos.rows, before.combos.rows);

    const behaviours = after({behaviors: true});
    assert.deepEqual(behaviours.behaviors.rows, before.behaviors.rows.filter(onCustom), "the custom keys keep their behaviours");
    assert.deepEqual(behaviours.combos.rows, before.combos.rows);
    assert.deepEqual(behaviours.settings.customKeyShortcuts, before.settings.customKeyShortcuts);

    const combos = after({combos: true});
    assert.deepEqual(combos.combos.rows, []);
    assert.equal(combos.combos.defaultTermMs, before.combos.defaultTermMs, "combo timing is a setting, and stays");
    assert.deepEqual(combos.behaviors.rows, before.behaviors.rows);

    const customKeys = after({customKeys: true});
    assert.deepEqual(customKeys.behaviors.rows, before.behaviors.rows.filter(row => !onCustom(row)));
    assert.deepEqual(viaClearable(importViaLayout(document(), via, {capabilities, clear: {behaviors: false, combos: false, customKeys: true}}).document, capabilities).customKeys, 0);

    const all = after({behaviors: true, combos: true, customKeys: true});
    assert.deepEqual([all.behaviors.rows, all.combos.rows], [[], []]);
    assert.deepEqual(all.autocorrect, before.autocorrect);
    assert.deepEqual(withoutLayerState(all), withoutLayerState(before));
});
