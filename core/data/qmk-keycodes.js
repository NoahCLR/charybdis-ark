// @ts-check
"use strict";

// QMK's keycode layout, in one place (D-L33): the block of the uint16 space
// each kind of keycode takes, how a block packs its arguments, the modifier
// bits, and every spelling of a modifier wrapper (LCTL(kc), LSA(kc), …).
// quantum/keycodes.h, quantum/modifiers.h and quantum/quantum_keycodes.h
// define them; the vendored keycodes hjson lists the blocks. The catalogue
// decodes and encodes with this, the schema names and places actions with it,
// and the model reads layers and dual-role keys with it. The keyboard's own
// blocks are in user-keycodes.js. Inert data.

/** @typedef {Readonly<{first: number, last: number}>} KeycodeBlock */
/** @param {number} first @param {number} last @returns {KeycodeBlock} */
const block = (first, last) => Object.freeze({first, last});

// Each block by QMK's name for it, less the QK_ prefix.
const QK = Object.freeze({
    BASIC: block(0x0000, 0x00ff),
    MODS: block(0x0100, 0x1fff),
    MOD_TAP: block(0x2000, 0x3fff),
    LAYER_TAP: block(0x4000, 0x4fff),
    LAYER_MOD: block(0x5000, 0x51ff),
    TO: block(0x5200, 0x521f),
    MOMENTARY: block(0x5220, 0x523f),
    DEF_LAYER: block(0x5240, 0x525f),
    TOGGLE_LAYER: block(0x5260, 0x527f),
    ONE_SHOT_LAYER: block(0x5280, 0x529f),
    ONE_SHOT_MOD: block(0x52a0, 0x52bf),
    LAYER_TAP_TOGGLE: block(0x52c0, 0x52df),
    PERSISTENT_DEF_LAYER: block(0x52e0, 0x52ff),
    MACRO: block(0x7700, 0x777f),
});
/** @param {number} code @param {KeycodeBlock} range */
const inBlock = (code, {first, last}) => code >= first && code <= last;

// The layer keycodes that carry their layer in the low five bits, by the name
// QMK spells them with: TO(n), MO(n), DF(n), TG(n), OSL(n), TT(n), PDF(n).
const LAYER_FORMS = Object.freeze({
    TO: QK.TO.first, MO: QK.MOMENTARY.first, DF: QK.DEF_LAYER.first, TG: QK.TOGGLE_LAYER.first,
    OSL: QK.ONE_SHOT_LAYER.first, TT: QK.LAYER_TAP_TOGGLE.first, PDF: QK.PERSISTENT_DEF_LAYER.first,
});
// A layer form's layer field is five bits wide; LT() and LM() have four.
const LAYER_FORM_LAYERS = 32, PACKED_LAYERS = 16;
/** @param {number} code The layer form a keycode is, by its base, whatever its layer. */
const layerFormBase = code => code & ~(LAYER_FORM_LAYERS - 1);
/** @param {number} code */
const layerFormLayer = code => code & (LAYER_FORM_LAYERS - 1);

// QMK's five modifier bits, as MOD_LCTL … MOD_RGUI: four modifiers and a side
// flag that puts all of them on the right.
const MODS = Object.freeze({
    LCTL: 0x01, LSFT: 0x02, LALT: 0x04, LGUI: 0x08,
    RCTL: 0x11, RSFT: 0x12, RALT: 0x14, RGUI: 0x18,
});
const MOD_RIGHT = 0x10, MOD_MASK = 0x1f;

// Every wrapper QMK spells a modified key with, and the modifier bits it adds.
// The first spelling of each single modifier is the one the picker posts (C,
// S, A, G, RCTL, RSFT, RALT, RGUI); the deprecated SGUI, SCMD, SWIN and SAGR
// are in keycode-legacy.js.
/** @type {Readonly<Record<string, number>>} */
const MODIFIER_WRAPPERS = Object.freeze({
    C: 0x01, LCTL: 0x01, S: 0x02, LSFT: 0x02,
    A: 0x04, LALT: 0x04, LOPT: 0x04,
    G: 0x08, LGUI: 0x08, LCMD: 0x08, LWIN: 0x08,
    LCS: 0x03, LCA: 0x05, LCG: 0x09, LSA: 0x06, LSG: 0x0a, LAG: 0x0c,
    LCSG: 0x0b, LCAG: 0x0d, LSAG: 0x0e, MEH: 0x07, HYPR: 0x0f,
    RCTL: 0x11, RSFT: 0x12, RALT: 0x14, ALGR: 0x14, ROPT: 0x14,
    RGUI: 0x18, RCMD: 0x18, RWIN: 0x18,
    RCS: 0x13, RCA: 0x15, RCG: 0x19, RSA: 0x16, RSG: 0x1a, RAG: 0x1c,
    RCSG: 0x1b, RCAG: 0x1d, RSAG: 0x1e,
});
/** @param {number} mods The first wrapper spelling for these modifier bits. */
const wrapperOf = mods => Object.keys(MODIFIER_WRAPPERS).find(name => MODIFIER_WRAPPERS[name] === mods);

// QMK has one side flag for every modifier in a compact keycode. Combining
// left and right masks would silently move all of them to the right.
/** @param {number} before @param {number} added @returns {number | undefined} */
function combineModifiers(before, added) {
    return (before & 0x0f) && (added & 0x0f) && ((before ^ added) & MOD_RIGHT)
        ? undefined : before | added;
}

// How the blocks pack their arguments. A modified key (QK_MODS) and a mod-tap
// hold their modifiers in bits 8–12 and their key in the low byte; a layer-tap
// its layer in bits 8–11; a layer-mod its layer in bits 5–8 and its
// modifiers in the low five; a one-shot modifier its modifiers in the low five.
/** @param {number} code */
const keyOf = code => code & 0xff;
/** @param {number} code */
const modsOf = code => (code >> 8) & MOD_MASK;
/** @param {number} mods @param {number} key */
const modified = (mods, key) => (mods << 8) | key;
/** @param {number} mods @param {number} key */
const modTap = (mods, key) => QK.MOD_TAP.first | (mods << 8) | key;
/** @param {number} code */
const layerTapLayer = code => (code >> 8) & (PACKED_LAYERS - 1);
/** @param {number} layer @param {number} key */
const layerTap = (layer, key) => QK.LAYER_TAP.first | (layer << 8) | key;
/** @param {number} code @param {number} layer */
const withLayerTapLayer = (code, layer) => (code & 0xf0ff) | (layer << 8);
/** @param {number} code */
const layerModLayer = code => (code >> 5) & (PACKED_LAYERS - 1);
/** @param {number} layer @param {number} mods */
const layerMod = (layer, mods) => QK.LAYER_MOD.first | (layer << 5) | mods;
/** @param {number} code @param {number} layer */
const withLayerModLayer = (code, layer) => (code & 0xfe1f) | (layer << 5);
/** @param {number} mods */
const oneShotMod = mods => QK.ONE_SHOT_MOD.first | mods;

module.exports = {
    QK, inBlock, LAYER_FORMS, LAYER_FORM_LAYERS, PACKED_LAYERS, layerFormBase, layerFormLayer,
    MODS, MOD_RIGHT, MOD_MASK, MODIFIER_WRAPPERS, wrapperOf, combineModifiers,
    keyOf, modsOf, modified, modTap, layerTap, layerTapLayer, withLayerTapLayer, layerMod, layerModLayer, withLayerModLayer, oneShotMod,
};
