// @ts-check
"use strict";

/** @typedef {{qmkKeycodeValues?: Record<string, number>, layers?: {name: string}[]}} ExpressionModel */

// Expressions as the keyboard's vocabulary spells them — KC_A, LT(1, KC_A),
// PD_MODE_0, MACRO_3 — resolved to profile actions and native keycodes.

const {PD_MODE_KEYS, formerNames, pdModeKeyOfName} = require("../data/pd-mode-keys");
const {QK, LAYER_FORMS, LAYER_FORM_LAYERS, PACKED_LAYERS, MODS, MODIFIER_WRAPPERS, combineModifiers, keyOf, MOD_MASK, layerTap, modified, modsOf, modTap, oneShotMod} = require("../data/qmk-keycodes");
const {customKeyCode, customKeyOfName, layerLockCode, LAYER_LOCK_SLOTS} = require("../data/user-keycodes");
const {PROFILE_ACTION_KINDS} = require("./profile-blob-v1");

// The macro slot a name reaches: MACRO_n, or VIA_MACRO_n, the name before
// firmware D-F31 dropped VIA, so a name typed the old way still reaches its
// macro. Ark only ever writes MACRO_n.
/** @param {string} name */
const macroOfName = name => {
    const match = /^(?:MACRO_|VIA_MACRO_)(\d+)$/.exec(name);
    return match && Number(match[1]) < 128 ? Number(match[1]) : undefined;
};
/** @type {Readonly<Record<string, number>>} */
const CHARYBDIS_KEYCODE_VALUES = Object.freeze({
    DPI_MOD: 0x7e00,
    DPI_RMOD: 0x7e01,
    S_D_MOD: 0x7e02,
    S_D_RMOD: 0x7e03,
    SNIPING: 0x7e04,
    SNP_TOG: 0x7e05,
    DRGSCRL: 0x7e06,
    DRG_TOG: 0x7e07,
});

// Every pointing key's name, former names included, as the action a
// behaviour or combo stores.
/** @type {Readonly<Record<string, import("./types.js").SemanticAction>>} */
const PD_ACTIONS = Object.freeze(Object.fromEntries(PD_MODE_KEYS.flatMap(({slot, hold, lock}) => {
    /** @type {[string, import("./types.js").SemanticAction][]} */
    const entries = [
        [hold, {kind: PROFILE_ACTION_KINDS.POINTING_MODE_MOMENTARY, operand: slot}],
        [lock, {kind: PROFILE_ACTION_KINDS.POINTING_MODE_LOCK, operand: slot}],
    ];
    for (const former of formerNames(slot)) entries.push(
        [former.hold, {kind: PROFILE_ACTION_KINDS.POINTING_MODE_MOMENTARY, operand: slot}],
        [former.lock, {kind: PROFILE_ACTION_KINDS.POINTING_MODE_LOCK, operand: slot}],
    );
    return entries;
})));

// The wrappers this resolver has always taken: a subset of QMK's
// (qmk-keycodes.js) with no right-hand pairs, plus LAS, which QMK spells LSA.
// The draft tries the catalogue's encoder first, so this table only decides
// what it falls back to; it is kept as it was rather than changing what an
// edit is accepted with.
/** @type {Readonly<Record<string, number>>} */
const LEGACY_WRAPPERS = Object.freeze({
    ...Object.fromEntries(["C", "LCTL", "S", "LSFT", "A", "LALT", "G", "LGUI", "LCAG", "LCA", "LCG", "LCS", "LAG", "LSG",
        "MEH", "HYPR", "RCTL", "RSFT", "RALT", "RGUI"].map(name => [name, MODIFIER_WRAPPERS[name]])),
    LAS: MODIFIER_WRAPPERS.LSA,
});

// MOD_ names for MT() and OSM(): QMK's eight, and MOD_HYPR and MOD_MEH.
/** @type {Readonly<Record<string, number>>} */
const MODIFIER_BITS = Object.freeze({
    ...Object.fromEntries(Object.entries(MODS).map(([name, bits]) => [`MOD_${name}`, bits])),
    MOD_HYPR: MODIFIER_WRAPPERS.HYPR, MOD_MEH: MODIFIER_WRAPPERS.MEH,
});

class ProfileExpressionError extends Error {
    /** @param {string} code @param {string} message @param {Record<string, unknown>} [details] */
    constructor(code, message, details = {}) {
        super(message);
        this.name = "ProfileExpressionError";
        this.code = code;
        Object.assign(this, details);
    }
}

/** @param {unknown} value @param {ExpressionModel} model @param {string} [label] @returns {import("./types.js").SemanticAction} */
function semanticActionForExpression(value, model, label = "Action") {
    const expression = normalizeExpression(value);
    if (!expression) throw compileError("UNSUPPORTED_ACTION", `${label} is empty.`, {expression});
    if (PD_ACTIONS[expression]) return {...PD_ACTIONS[expression]};

    const macro = macroOfName(expression);
    if (macro !== undefined) return {kind: PROFILE_ACTION_KINDS.MACRO, operand: macro};
    const match = expression.match(/^CUSTOM_KEY_(\d+)$/);
    if (match) return {kind: PROFILE_ACTION_KINDS.CUSTOM_KEY, operand: Number(match[1])};

    const call = parseCall(expression);
    if (call?.name === "MO" || call?.name === "LOCK_LAYER") {
        if (call.args.length !== 1) throw unsupportedAction(label, expression);
        const layer = layerId(call.args[0], model, label);
        return {kind: call.name === "MO" ? PROFILE_ACTION_KINDS.LAYER_MOMENTARY : PROFILE_ACTION_KINDS.LAYER_LOCK, operand: layer};
    }

    const numeric = resolveNativeQmkExpression(expression, model);
    if (numeric === undefined) throw unsupportedAction(label, expression);
    return {kind: PROFILE_ACTION_KINDS.QMK_KEYCODE, operand: numeric};
}

/** @param {unknown} value @param {ExpressionModel} model @returns {number | undefined} */
function resolveNativeQmkExpression(value, model) {
    const expression = normalizeExpression(value);
    if (/^(?:0x[0-9a-f]+|\d+)$/i.test(expression)) {
        const number = Number(expression);
        return Number.isInteger(number) && number >= 0 && number <= 0xffff ? number : undefined;
    }
    const catalog = model?.qmkKeycodeValues || {};
    if (Number.isInteger(catalog[expression])) return catalog[expression];
    if (Number.isInteger(CHARYBDIS_KEYCODE_VALUES[expression])) return CHARYBDIS_KEYCODE_VALUES[expression];
    if (expression === "_______") return catalog.KC_TRNS ?? catalog.KC_TRANSPARENT ?? 1;
    if (expression === "XXXXXXX") return catalog.KC_NO ?? 0;

    const macro = macroOfName(expression);
    if (macro !== undefined) return QK.MACRO.first + macro;
    const custom = customKeyOfName(expression);
    if (custom !== undefined) return customKeyCode(custom);

    const pd = pdModeKeyOfName(expression);
    if (pd) return pd.locked ? PD_MODE_KEYS[pd.slot].lockCode : PD_MODE_KEYS[pd.slot].holdCode;

    const call = parseCall(expression);
    if (!call) return undefined;
    // TT() and PDF() are the catalogue's alone.
    if ((call.name === "TO" || call.name === "MO" || call.name === "DF" || call.name === "TG" || call.name === "OSL") && call.args.length === 1) {
        const layer = layerIdOrUndefined(call.args[0], model);
        return layer === undefined || layer >= LAYER_FORM_LAYERS ? undefined : LAYER_FORMS[call.name] | layer;
    }
    // The firmware supports a lock for each of its sixteen layers; the rest of
    // the reserved block has no key behind it.
    if (call.name === "LOCK_LAYER" && call.args.length === 1) {
        const layer = layerIdOrUndefined(call.args[0], model);
        return layer === undefined || layer >= LAYER_LOCK_SLOTS ? undefined : layerLockCode(layer);
    }
    // A modifier wrapper only applies to a basic or already-modified key
    // (QK_MODS, up to 0x1FFF). Anything above would OR the modifier bits into
    // an unrelated keycode, e.g. C(MACRO_3) into a macro without Ctrl.
    if (LEGACY_WRAPPERS[call.name] !== undefined && call.args.length === 1) {
        const keycode = resolveNativeQmkExpression(call.args[0], model);
        if (keycode === undefined || keycode > QK.MODS.last) return undefined;
        const mods = combineModifiers(modsOf(keycode), LEGACY_WRAPPERS[call.name]);
        return mods === undefined ? undefined : modified(mods, keyOf(keycode));
    }
    if (call.name === "OSM" && call.args.length === 1) {
        const mods = resolveModifierBits(call.args[0]);
        return mods === undefined ? undefined : oneShotMod(mods);
    }
    if (call.name === "LT" && call.args.length === 2) {
        const layer = layerIdOrUndefined(call.args[0], model);
        const keycode = resolveNativeQmkExpression(call.args[1], model);
        // QK_LAYER_TAP has four layer bits; layer 16 and up would spill into
        // TO(), MO() and QK_BOOTLOADER.
        return layer === undefined || layer >= PACKED_LAYERS || keycode === undefined || keycode > QK.BASIC.last ? undefined : layerTap(layer, keycode);
    }
    if (call.name === "MT" && call.args.length === 2) {
        const mods = resolveModifierBits(call.args[0]);
        const keycode = resolveNativeQmkExpression(call.args[1], model);
        return mods === undefined || keycode === undefined || keycode > QK.BASIC.last ? undefined : modTap(mods, keycode);
    }
    return undefined;
}

/** @param {unknown} value */
function resolveModifierBits(value) {
    const parts = normalizeExpression(value).split("|").map((part) => part.trim()).filter(Boolean);
    if (!parts.length) return undefined;
    let result = 0;
    for (const part of parts) {
        if (MODIFIER_BITS[part] === undefined) return undefined;
        const combined = combineModifiers(result, MODIFIER_BITS[part]);
        if (combined === undefined) return undefined;
        result = combined;
    }
    return result & MOD_MASK;
}

/** @param {unknown} value @param {ExpressionModel} model @param {string} label */
function layerId(value, model, label) {
    const id = layerIdOrUndefined(value, model);
    if (id === undefined) throw compileError("UNKNOWN_LAYER", `${label} references unknown layer ${normalizeExpression(value) || "<empty>"}.`, {expression: value});
    return id;
}

/** @param {unknown} value @param {ExpressionModel} model */
function layerIdOrUndefined(value, model) {
    const expression = normalizeExpression(value);
    if (/^\d+$/.test(expression)) return Number(expression);
    const layers = model?.layers || [];
    const index = layers.findIndex((layer) => layer?.name === expression);
    return index < 0 ? undefined : index;
}

/** @param {unknown} value */
function parseCall(value) {
    const expression = normalizeExpression(value);
    const match = expression.match(/^([A-Z][A-Z0-9_]*)\((.*)\)$/);
    if (!match) return undefined;
    return {name: match[1], args: splitArguments(match[2])};
}

/** @param {string} value */
function splitArguments(value) {
    const parts = [];
    let depth = 0;
    let start = 0;
    for (let index = 0; index < value.length; index += 1) {
        if (value[index] === "(") depth += 1;
        if (value[index] === ")") depth -= 1;
        if (depth < 0) return [];
        if (value[index] === "," && depth === 0) {
            parts.push(normalizeExpression(value.slice(start, index)));
            start = index + 1;
        }
    }
    if (depth !== 0) return [];
    parts.push(normalizeExpression(value.slice(start)));
    return parts;
}

/** @param {unknown} value */
function normalizeExpression(value) {
    return String(value ?? "").replace(/\s+/g, " ").replace(/\s*,\s*/g, ",").trim();
}

/** @param {string} label @param {string} expression */
function unsupportedAction(label, expression) {
    return compileError("UNSUPPORTED_ACTION", `${label} expression ${expression} cannot be represented by the stable live-profile action schema.`, {expression});
}

/** @param {string} code @param {string} message @param {Record<string, unknown>} [details] */
function compileError(code, message, details = {}) {
    return new ProfileExpressionError(code, message, details);
}

module.exports = {
    resolveNativeQmkExpression,
    semanticActionForExpression,
};
