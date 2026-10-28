// @ts-check
"use strict";

// Profile actions: their names, their native keycodes, and the limits that
// decode them, in one place.
//
// A profile stores an action as {kind, operand}. Editors, the draft, the
// review and the device model all need to name one, turn it into the native
// keycode VIA stores, and decode a domain with the right action limits; they
// ask here rather than each doing it their own way.

const keycodes = require("../data/keycode-catalog");
const {QK, inBlock, LAYER_FORMS, layerFormBase, layerFormLayer, layerTapLayer, layerModLayer} = require("../data/qmk-keycodes");
const {PD_MODE_KEYS, pdModeKeyOfCode} = require("../data/pd-mode-keys");
const {PROFILE_ACTION_KINDS: ACTION} = require("./profile-blob-v1");
const {resolveNativeQmkExpression} = require("./compiled-profile-v1");

// The native action ABI whose semantic actions map onto VIA keycodes: the
// 32-slot firmware's, with the userspace keycode blocks and pointing slots
// 0..31 (firmware D-F09), under schema 4.3. The firmware folds the schema's
// major and minor into the digest, so schema 4 moved it from schema 3's
// 0x837cf479 (firmware D-F28), schema 4.1 from 4.0's 0x6fd70b90 (firmware
// D-F62), schema 4.2 from 4.1's 0x7fecec81 and schema 4.3 from 4.2's
// 0xb4a15f12 (firmware D-F26), with no keycode changed. A keyboard advertising another vocabulary
// numbers its keys differently, so Ark reads it but neither names its keys
// nor edits it.
const ACTION_ABI = 0x67df11b3;
const KNOWN_ACTION_ABIS = Object.freeze([ACTION_ABI]);
/** @param {number} value */
const knownActionAbi = value => KNOWN_ACTION_ABIS.includes(value);

// An action's name, the one every edit message and row lookup uses.
/** @param {import("./types.js").SemanticAction} action */
function actionName(action) {
    switch (action.kind) {
        case ACTION.NONE: return "KC_NO";
        case ACTION.QMK_KEYCODE: return keycodes.resolve(action.operand).name;
        case ACTION.LAYER_MOMENTARY: return `MO(${action.operand})`;
        case ACTION.LAYER_LOCK: return `LOCK_LAYER(${action.operand})`;
        case ACTION.MACRO: return `MACRO_${action.operand}`;
        case ACTION.CUSTOM_KEY: return `CUSTOM_KEY_${action.operand}`;
        case ACTION.POINTING_MODE_MOMENTARY:
        case ACTION.POINTING_MODE_LOCK: {
            const keys = PD_MODE_KEYS[action.operand];
            if (!keys) throw new Error(`Unsupported pointing slot ${action.operand}.`);
            return action.kind === ACTION.POINTING_MODE_LOCK ? keys.lock : keys.hold;
        }
        default: throw new Error(`Unsupported device action kind ${action.kind}.`);
    }
}

// The native keycode an action is stored as on a VIA layer, when it has one.
/** @param {import("./types.js").SemanticAction} action */
const nativeCode = action => action.kind === ACTION.QMK_KEYCODE ? action.operand : resolveNativeQmkExpression(actionName(action), {});
// A native keycode as the action a profile stores for it.
/** @param {number} operand @returns {import("./types.js").SemanticAction} */
const keycodeAction = operand => ({kind: ACTION.QMK_KEYCODE, operand});

// The pointing slot a native keycode binds, if it is a pointing-mode key.
/** @param {number} code */
const pointingSlotOfCode = code => pdModeKeyOfCode(code)?.slot;

// A layer as edit messages and group rows name it, and back.
/** @param {number} index @returns {import("../../contracts/edits.js").LayerReference} */
const layerRef = index => `Layer ${index}`;
/** @param {unknown} text */
const layerOfRef = text => {
    const match = /^Layer ([0-9]+)$/.exec(String(text ?? ""));
    return match ? Number(match[1]) : undefined;
};

// TG(n), TO(n), TT(n) and OSL(n) on a layer the keyboard has: the QMK layer
// keycodes the keyboard runs through its own layer ownership (TG as LOCK_LAYER, TO as "lock only n", TT as a hold
// whose fifth tap locks, OSL as a one-shot). Where each may go is
// placementProblem's to say.
const OWNED_LAYER_BASES = Object.freeze([LAYER_FORMS.TO, LAYER_FORMS.TG, LAYER_FORMS.OSL, LAYER_FORMS.TT]);
/** @param {number} code @param {number} layerCount */
const isOwnedLayerCode = (code, layerCount) =>
    OWNED_LAYER_BASES.includes(layerFormBase(code)) && layerFormLayer(code) < layerCount;

// Where a stored action may be placed, as the keyboard checks a profile it is
// asked to save (noah_action_supported_at in users/noah/lib/action). Only
// layer keycodes are restricted: a layer hold needs a key held down, so it is a
// key, a press-and-hold branch or a combo (a combo holds its output); OSL() is
// a key, a tap or a combo; LM() is a key or a combo; LT() is only a key; TG(),
// TO() and LOCK_LAYER() go anywhere; DF() and PDF(), which the keyboard does not
// own, go nowhere. A custom key goes anywhere: as a step it sends its shortcut
// only, never its own behaviour (firmware D-F26). Returns what is wrong, or
// undefined.
/** @typedef {'key' | 'tap' | 'holdPress' | 'holdOther' | 'comboOutput'} Placement */
const PLACEMENT = Object.freeze({KEY: "key", TAP: "tap", HOLD_PRESS: "holdPress", HOLD_OTHER: "holdOther", COMBO_OUTPUT: "comboOutput"});

/** @param {number} code @param {number} layerCount @returns {{kind: string, places: Placement[]} | undefined} */
function layerRuleOf(code, layerCount) {
    /** @param {import("../data/qmk-keycodes").KeycodeBlock} block */
    const range = block => inBlock(code, block);
    if (range(QK.LAYER_TAP)) return layerTapLayer(code) < layerCount ? {kind: "layerTap", places: [PLACEMENT.KEY]} : {kind: "unowned", places: []};
    if (range(QK.LAYER_MOD)) return layerModLayer(code) < layerCount ? {kind: "layerMod", places: [PLACEMENT.KEY, PLACEMENT.COMBO_OUTPUT]} : {kind: "unowned", places: []};
    if (range(QK.DEF_LAYER) || range(QK.PERSISTENT_DEF_LAYER)) return {kind: "unowned", places: []};
    if (!(range(QK.TO) || range(QK.MOMENTARY) || range(QK.TOGGLE_LAYER) || range(QK.ONE_SHOT_LAYER) || range(QK.LAYER_TAP_TOGGLE))) return undefined;
    if (layerFormLayer(code) >= layerCount) return {kind: "unowned", places: []};
    if (range(QK.MOMENTARY) || range(QK.LAYER_TAP_TOGGLE)) return {kind: "hold", places: [PLACEMENT.KEY, PLACEMENT.HOLD_PRESS, PLACEMENT.COMBO_OUTPUT]};
    if (range(QK.ONE_SHOT_LAYER)) return {kind: "oneShot", places: [PLACEMENT.KEY, PLACEMENT.TAP, PLACEMENT.COMBO_OUTPUT]};
    return undefined;
}

/** @param {import("./types.js").SemanticAction} action @param {Placement} placement @param {{layerCount?: number}} [options] */
function placementProblem(action, placement, {layerCount = 16} = {}) {
    const code = action.kind === ACTION.LAYER_MOMENTARY ? LAYER_FORMS.MO | action.operand : nativeCode(action);
    const rule = code === undefined ? undefined : layerRuleOf(code, layerCount);
    if (!rule || rule.places.includes(placement)) return undefined;
    const name = actionName(action);
    switch (rule.kind) {
        case "unowned": return `${name} is a layer keycode this keyboard does not run through its layer tracking, so it cannot be saved here.`;
        case "hold": return `${name} holds a layer, so it only works as a key, a combo or a "Press and hold until release" branch.`;
        case "layerTap": return `${name} makes its own tap/hold decision, so it only works as a key, not in a behaviour or a combo.`;
        case "oneShot": return `${name} works as a key, a tap or a combo, not as a hold.`;
        case "layerMod": return `${name} holds a layer and its modifiers, so it only works as a key or a combo.`;
        default: return undefined;
    }
}

module.exports = {PLACEMENT, placementProblem, isOwnedLayerCode, KNOWN_ACTION_ABIS, ACTION_ABI, knownActionAbi, actionName, nativeCode, keycodeAction, pointingSlotOfCode, layerRef, layerOfRef};
