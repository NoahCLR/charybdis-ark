// @ts-check
"use strict";

/** @typedef {{qmkKeycodeValues?: Record<string, number>, layers?: {name: string}[]}} ExpressionModel */

// Expressions as the keyboard's vocabulary spells them — KC_A, LT(1, KC_A),
// PD_MODE_0, MACRO_3 — resolved to profile actions and native keycodes.

const {PD_MODE_KEYS, formerNames, pdModeKeyOfName} = require("../data/pd-mode-keys");
const {combineModifiers} = require("../data/keycode-catalog");
const {customKeyCode, customKeyOfName, layerLockCode, LAYER_LOCK_SLOTS} = require("../data/user-keycodes");
const {PROFILE_ACTION_KINDS} = require("./profile-blob-v1");

const QMK_MACRO_BASE = 0x7700;

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

/** @type {Readonly<Record<string, number>>} */
const MODIFIER_WRAPPERS = Object.freeze({
    C: 0x0100, LCTL: 0x0100,
    S: 0x0200, LSFT: 0x0200,
    A: 0x0400, LALT: 0x0400,
    G: 0x0800, LGUI: 0x0800,
    LCAG: 0x0d00, LCA: 0x0500, LCG: 0x0900, LCS: 0x0300,
    LAG: 0x0c00, LSG: 0x0a00, LAS: 0x0600,
    MEH: 0x0700, HYPR: 0x0f00,
    RCTL: 0x1100, RSFT: 0x1200, RALT: 0x1400, RGUI: 0x1800,
});

/** @type {Readonly<Record<string, number>>} */
const MODIFIER_BITS = Object.freeze({
    MOD_LCTL: 0x01, MOD_LSFT: 0x02, MOD_LALT: 0x04, MOD_LGUI: 0x08,
    MOD_RCTL: 0x11, MOD_RSFT: 0x12, MOD_RALT: 0x14, MOD_RGUI: 0x18,
    MOD_HYPR: 0x0f, MOD_MEH: 0x07,
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

const QK_MODS_MAX = 0x1fff;

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
    if (macro !== undefined) return QMK_MACRO_BASE + macro;
    const custom = customKeyOfName(expression);
    if (custom !== undefined) return customKeyCode(custom);

    const pd = pdModeKeyOfName(expression);
    if (pd) return pd.locked ? PD_MODE_KEYS[pd.slot].lockCode : PD_MODE_KEYS[pd.slot].holdCode;

    const call = parseCall(expression);
    if (!call) return undefined;
    if (["TO", "MO", "DF", "TG", "OSL"].includes(call.name) && call.args.length === 1) {
        const layer = layerIdOrUndefined(call.args[0], model);
        /** @type {Record<string, number>} */
        const bases = {TO: 0x5200, MO: 0x5220, DF: 0x5240, TG: 0x5260, OSL: 0x5280};
        return layer === undefined || layer > 0x1f ? undefined : bases[call.name] | layer;
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
    if (MODIFIER_WRAPPERS[call.name] !== undefined && call.args.length === 1) {
        const keycode = resolveNativeQmkExpression(call.args[0], model);
        if (keycode === undefined || keycode > QK_MODS_MAX) return undefined;
        const mods = combineModifiers((keycode >> 8) & 0x1f, MODIFIER_WRAPPERS[call.name] >> 8);
        return mods === undefined ? undefined : (mods << 8) | (keycode & 0xff);
    }
    if (call.name === "OSM" && call.args.length === 1) {
        const mods = resolveModifierBits(call.args[0]);
        return mods === undefined ? undefined : 0x52a0 | mods;
    }
    if (call.name === "LT" && call.args.length === 2) {
        const layer = layerIdOrUndefined(call.args[0], model);
        const keycode = resolveNativeQmkExpression(call.args[1], model);
        // QK_LAYER_TAP has four layer bits; layer 16 and up would spill into
        // TO(), MO() and QK_BOOTLOADER.
        return layer === undefined || layer > 0x0f || keycode === undefined || keycode > 0xff ? undefined : 0x4000 | (layer << 8) | keycode;
    }
    if (call.name === "MT" && call.args.length === 2) {
        const mods = resolveModifierBits(call.args[0]);
        const keycode = resolveNativeQmkExpression(call.args[1], model);
        return mods === undefined || keycode === undefined || keycode > 0xff ? undefined : 0x2000 | (mods << 8) | keycode;
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
    return result & 0x1f;
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
