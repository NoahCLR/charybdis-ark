// @ts-check
"use strict";

// Resolves the numeric keycodes a device reports into something a person
// recognises, and encodes an authored expression back, by the keycode
// catalog's names (core/data/keycode-catalog.js) and QMK's keycode layout
// (rules/qmk-keycodes.mjs), rather than a QMK checkout.
//
// A keycode arriving from the keyboard is a bare uint16. Most resolve to a
// catalog entry directly. The rest are parameterised quantum keycodes — layer
// taps, momentary layers, modified keys — where the high bits select a
// behaviour and the low bits carry its arguments. Those are decoded
// structurally so an unknown-but-valid keycode still renders as something
// truthful rather than as a hex number.

const {lookup, lookupValue} = require("../data/keycode-catalog");
const legacy = require("../data/keycode-legacy");
const qmk = require("../../rules/qmk-keycodes.mjs");
const {DIALECTS, encodeExpression} = require("../../rules/keycode-expression.mjs");
const {QK, inBlock} = qmk;

// QMK's quantum keycode ranges (rules/qmk-keycodes.mjs); the
// catalog lists the range markers only as boundaries, which the generator
// deliberately drops. The words for each layer form and modifier are these.
/** @type {Readonly<Record<keyof typeof qmk.LAYER_FORMS, string>>} */
const LAYER_FORM_LABELS = Object.freeze({
    TO: "Layer move", MO: "Layer hold", DF: "Default layer", TG: "Layer toggle",
    OSL: "One-shot layer", TT: "Layer tap toggle", PDF: "Persistent default layer",
});
const LAYER_FORMS = Object.freeze(Object.entries(qmk.LAYER_FORMS).map(([name, base]) =>
    ({base, name, label: LAYER_FORM_LABELS[/** @type {keyof typeof qmk.LAYER_FORMS} */ (name)]})));
const MODIFIERS = [
    {bit: qmk.MODS.LCTL, name: "CTL", label: "Ctrl"}, {bit: qmk.MODS.LSFT, name: "SFT", label: "Shift"},
    {bit: qmk.MODS.LALT, name: "ALT", label: "Alt"}, {bit: qmk.MODS.LGUI, name: "GUI", label: "Cmd"},
];

/** @param {number} bits */
function modifiers(bits) {
    const side = bits & qmk.MOD_RIGHT ? "R" : "L";
    return MODIFIERS.filter(mod => bits & mod.bit).map(mod => ({
        name: side + mod.name, label: (side === "R" ? "Right " : "") + mod.label,
    }));
}

/** @param {number} value @returns {import("../data/types.js").ResolvedKeycode} */
function resolve(value) {
    if (!Number.isInteger(value) || value < 0 || value > 0xffff) {
        return unknown(value);
    }

    const direct = lookupValue(value);
    if (direct) {
        return {
            value,
            name: direct.name,
            label: direct.label,
            group: direct.group,
            kind: "basic",
            known: true,
        };
    }

    const layered = resolveLayerKeycode(value);
    if (layered) {
        return layered;
    }

    const tap = resolveTapHold(value);
    if (tap) {
        return tap;
    }

    if (inBlock(value, QK.MODS)) {
        const key = lookupValue(qmk.keyOf(value));
        const mods = modifiers(qmk.modsOf(value));
        if (key && mods.length) return {
            value, name: mods.reduceRight((name, mod) => `${mod.name}(${name})`, key.name),
            label: [...mods.map(mod => mod.label), key.label].join("+"),
            group: "modifiers", kind: "modified", known: true,
        };
    }
    if (inBlock(value, QK.ONE_SHOT_MOD)) {
        const mods = modifiers(value & qmk.MOD_MASK);
        if (mods.length) return {
            value, name: `OSM(${mods.map(mod => `MOD_${mod.name}`).join("|")})`,
            label: `One-shot ${mods.map(mod => mod.label).join("+")}`,
            group: "modifiers", kind: "one-shot-mod", known: true,
        };
    }
    // LM(layer, mods): a layer hold with its modifiers held too.
    if (inBlock(value, QK.LAYER_MOD)) {
        const layer = qmk.layerModLayer(value);
        const mods = modifiers(value & qmk.MOD_MASK);
        if (mods.length) return {
            value, name: `LM(${layer},${mods.map(mod => `MOD_${mod.name}`).join("|")})`,
            label: `Layer ${layer} + ${mods.map(mod => mod.label).join("+")}`,
            group: "layer", kind: "layer-mod", layer, known: true,
        };
    }

    return unknown(value);
}

// MO/TG/OSL/TO carry the layer in the low bits of a fixed base.
/** @param {number} value @returns {import("../data/types.js").ResolvedKeycode | undefined} */
function resolveLayerKeycode(value) {
    for (const form of LAYER_FORMS) {
        const layer = value - form.base;
        if (layer >= 0 && layer < qmk.LAYER_FORM_LAYERS) {
            return {
                value,
                name: `${form.name}(${layer})`,
                label: `${form.label} ${layer}`,
                group: "layer",
                kind: "layer",
                layer,
                known: true,
            };
        }
    }
    return undefined;
}

// LT(layer, kc) and mod-tap share a shape: a behaviour in the high nibble, a
// basic keycode in the low byte.
/** @param {number} value @returns {import("../data/types.js").ResolvedKeycode | undefined} */
function resolveTapHold(value) {
    const tapped = lookupValue(qmk.keyOf(value));
    if (!tapped) return undefined;
    if (inBlock(value, QK.LAYER_TAP)) {
        const argument = qmk.layerTapLayer(value);
        return {
            value,
            name: `LT(${argument},${tapped.name})`,
            label: `${tapped.label} / layer ${argument}`,
            group: "layer",
            kind: "layer-tap",
            layer: argument,
            tap: tapped.name,
            known: true,
        };
    }
    if (!inBlock(value, QK.MOD_TAP)) return undefined;
    const mods = modifiers(qmk.modsOf(value));
    if (!mods.length) return undefined;
    return {
        value,
        name: `MT(${mods.map(mod => `MOD_${mod.name}`).join("|")},${tapped.name})`,
        label: `${tapped.label} / ${mods.map(mod => mod.label).join("+")}`,
        group: "modifiers",
        kind: "mod-tap",
        tap: tapped.name,
        known: true,
    };
}

/** @param {number} value @returns {import("../data/types.js").ResolvedKeycode} */
function unknown(value) {
    const hex = Number.isInteger(value) ? `0x${(value >>> 0).toString(16).toUpperCase().padStart(4, "0")}` : String(value);
    return {value, name: hex, label: hex, group: "unknown", kind: "unknown", known: false};
}

// The inverse of resolve(): turn an authored expression back into the uint16
// the device stores, as the shared grammar's catalogue dialect reads it
// (rules/keycode-expression.mjs): the catalog's names and aliases, QMK's other
// spellings (keycode-legacy.js), and QMK's calls and numbers. Returns undefined
// rather than guessing, so a caller can refuse the write instead of sending a
// wrong keycode to the keyboard.
/** @type {import("../../rules/keycode-expression.mjs").ExpressionTables} */
const CATALOGUE = Object.freeze({
    names: (/** @type {string} */ name) => lookup(name)?.value,
    spellings: {names: legacy.NAMES, modTaps: legacy.MOD_TAP_SHORTHANDS, wrappers: legacy.WRAPPER_ALIASES},
});
/** @param {unknown} expression @returns {number | undefined} */
function encode(expression) {
    return encodeExpression(String(expression || ""), CATALOGUE, DIALECTS.qmk);
}

module.exports = {encode, resolve};
