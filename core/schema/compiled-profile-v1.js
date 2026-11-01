// @ts-check
"use strict";

/** @typedef {{qmkKeycodeValues?: Record<string, number>, layers?: {name: string}[]}} ExpressionModel */

// Expressions as the keyboard's vocabulary spells them — KC_A, LT(1, KC_A),
// PD_MODE_0, MACRO_3 — resolved to profile actions and native keycodes.

const keycodes = require("./keycodes");
const legacy = require("../data/keycode-legacy");
const {PD_MODE_KEYS, formerNames, pdModeKeyOfName} = require("../data/pd-mode-keys");
const {macroOfName} = require("../../rules/qmk-keycodes.mjs");
const {customKeyCode, customKeyOfName, LAYER_LOCK_BLOCK} = require("../data/user-keycodes");
const {PROFILE_ACTION_KINDS} = require("./profile-blob-v1");
const {DIALECTS, callParts, encodeExpression, normalizeExpression, splitArguments} = require("../../rules/keycode-expression.mjs");

// The Charybdis's own pointer keys (QK_KB_0…7), which resolve even when the
// model carries no keycode catalog; their values are the keycode catalog's.
/** @type {Readonly<Record<string, number>>} */
const CHARYBDIS_KEYCODE_VALUES = Object.freeze(Object.fromEntries(["DPI_MOD", "DPI_RMOD", "S_D_MOD", "S_D_RMOD", "SNIPING", "SNP_TOG", "DRGSCRL", "DRG_TOG"]
    .map(name => [name, /** @type {number} */ (keycodes.encode(name))])));

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

class ProfileExpressionError extends Error {
    /** @param {string} code @param {string} message @param {Record<string, unknown>} [details] */
    constructor(code, message, details = {}) {
        super(message);
        this.name = "ProfileExpressionError";
        this.code = code;
        Object.assign(this, details);
    }
}

// A refusal answers what a person typed or picked, so it says so in words.
/** @param {unknown} value @param {ExpressionModel} model @returns {import("./types.js").SemanticAction} */
function semanticActionForExpression(value, model) {
    const expression = normalizeExpression(value);
    if (!expression) throw compileError("UNSUPPORTED_ACTION", "Choose a key.", {expression});
    if (PD_ACTIONS[expression]) return {...PD_ACTIONS[expression]};

    const macro = macroOfName(expression);
    if (macro !== undefined) return {kind: PROFILE_ACTION_KINDS.MACRO, operand: macro};
    const custom = customKeyOfName(expression);
    if (custom !== undefined) return {kind: PROFILE_ACTION_KINDS.CUSTOM_KEY, operand: custom};

    const call = parseCall(expression);
    if (call?.name === "MO" || call?.name === "LOCK_LAYER") {
        if (call.args.length !== 1) throw unsupportedAction(expression);
        const layer = layerId(call.args[0], model);
        return {kind: call.name === "MO" ? PROFILE_ACTION_KINDS.LAYER_MOMENTARY : PROFILE_ACTION_KINDS.LAYER_LOCK, operand: layer};
    }

    const numeric = resolveNativeQmkExpression(expression, model);
    if (numeric === undefined) throw unsupportedAction(expression);
    return {kind: PROFILE_ACTION_KINDS.QMK_KEYCODE, operand: numeric};
}

// QMK's other spellings (keycode-legacy.js), which the picker reads too.
const SPELLINGS = Object.freeze({names: legacy.NAMES, modTaps: legacy.MOD_TAP_SHORTHANDS, wrappers: legacy.WRAPPER_ALIASES});
// What the draft knows by name: the model's keycode values, the Charybdis's
// own pointer keys, QMK's blank names and other spellings, then (after a
// macro's name) custom keys and pointing keys, and the profile's layers by
// name.
/** @param {ExpressionModel} model @returns {import("../../rules/keycode-expression.mjs").ExpressionTables} */
function tablesOf(model) {
    const catalog = model?.qmkKeycodeValues || {};
    return {
        names: (name) => {
            if (Number.isInteger(catalog[name])) return catalog[name];
            if (Number.isInteger(CHARYBDIS_KEYCODE_VALUES[name])) return CHARYBDIS_KEYCODE_VALUES[name];
            if (name === "_______") return catalog.KC_TRNS ?? catalog.KC_TRANSPARENT ?? 1;
            if (name === "XXXXXXX") return catalog.KC_NO ?? 0;
            return undefined;
        },
        more: (name) => {
            const custom = customKeyOfName(name);
            if (custom !== undefined) return customKeyCode(custom);
            const pd = pdModeKeyOfName(name);
            return pd ? (pd.locked ? PD_MODE_KEYS[pd.slot].lockCode : PD_MODE_KEYS[pd.slot].holdCode) : undefined;
        },
        spellings: SPELLINGS,
        layers: model?.layers || [],
        layerLocks: LAYER_LOCK_BLOCK,
    };
}

// The keycode an expression stores, read in the shared grammar's keyboard
// dialect (rules/keycode-expression.mjs), or undefined. A number is already
// a keycode, as a key is posted when it is put back.
/** @param {unknown} value @param {ExpressionModel} model @returns {number | undefined} */
function resolveNativeQmkExpression(value, model) {
    if (typeof value === "number") return Number.isInteger(value) && value >= 0 && value <= 0xffff ? value : undefined;
    return encodeExpression(String(value ?? ""), tablesOf(model), DIALECTS.keyboard);
}

/** @param {unknown} value @param {ExpressionModel} model */
function layerId(value, model) {
    const id = DIALECTS.keyboard.layer(normalizeExpression(value), tablesOf(model));
    if (id === undefined) throw compileError("UNKNOWN_LAYER", normalizeExpression(value) ? `${normalizeExpression(value)} is not a layer this keyboard has.` : "Choose a layer.", {expression: value});
    return id;
}

/** @param {unknown} value */
function parseCall(value) {
    const call = callParts(normalizeExpression(value));
    return call && {name: call.name, args: splitArguments(call.inner, DIALECTS.keyboard.normalize)};
}

/** @param {string} expression */
function unsupportedAction(expression) {
    return compileError("UNSUPPORTED_ACTION", `${expression} is not a key this keyboard can store.`, {expression});
}

/** @param {string} code @param {string} message @param {Record<string, unknown>} [details] */
function compileError(code, message, details = {}) {
    return new ProfileExpressionError(code, message, details);
}

module.exports = {
    resolveNativeQmkExpression,
    semanticActionForExpression,
};
