// @ts-check
"use strict";

// Profile actions: their names, their native keycodes, and the limits that
// decode them, in one place.
//
// A profile stores an action as {kind, operand}. Editors, the draft, the
// review and the device model all need to name one, turn it into the native
// keycode VIA stores, and decode a domain with the right action limits; they
// ask here rather than each doing it their own way.

const keycodes = require("./keycodes");
const {LAYER_FORMS, layerFormBase, layerFormLayer, macroName} = require("../../rules/qmk-keycodes.mjs");
const {layerRuleOf} = require("../../rules/layer-placement.mjs");
const {callParts} = require("../../rules/keycode-expression.mjs");
const {LAYER_LOCK_BLOCK, customKeyName} = require("../data/user-keycodes");
// The keyboard's layer-lock block, LOCK_LAYER(n).
const {PD_MODE_KEYS, pdModeKeyOfCode} = require("../data/pd-mode-keys");
const {LAYERS} = require("../data/charybdis-layout");
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
        case ACTION.MACRO: return macroName(action.operand);
        case ACTION.CUSTOM_KEY: return customKeyName(action.operand);
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

// Where a stored action may be placed is the shared layer placement rule
// (rules/layer-placement.mjs); this says in words what is wrong, or returns
// undefined.
/** @param {import("./types.js").SemanticAction} action @param {import("../../rules/layer-placement.mjs").Placement} placement @param {{layerCount?: number}} [options] */
function placementProblem(action, placement, {layerCount = LAYERS} = {}) {
    const code = action.kind === ACTION.LAYER_MOMENTARY ? LAYER_FORMS.MO | action.operand : nativeCode(action);
    const rule = code === undefined ? undefined : layerRuleOf(code, layerCount, LAYER_LOCK_BLOCK);
    if (!rule || rule.places.includes(placement)) return undefined;
    const name = actionName(action);
    switch (rule.kind) {
        case "unowned": return `${name} is a layer keycode this keyboard does not run through its layer tracking, so it cannot be saved here.`;
        case "missing": return `${name} locks a layer this keyboard does not have.`;
        case "hold": return `${name} holds a layer, so it only works as a key, a combo or a "Press and hold until release" branch.`;
        case "layerTap": return `${name} makes its own tap/hold decision, so it only works as a key, not in a behaviour or a combo.`;
        case "oneShot": return `${name} works as a key, a tap or a combo, not as a hold.`;
        case "layerMod": return `${name} holds a layer and its modifiers, so it only works as a key or a combo.`;
        default: return undefined;
    }
}

// Whether an expression is an MO() call, which a behaviour or combo stores as
// a layer action of its own (ACTION.LAYER_MOMENTARY) rather than as the
// keycode, so a layer reorder moves it with its layer.
/** @param {string} expression */
const momentaryCall = expression => callParts(expression.replace(/\s+(?=\()/, ""))?.name === "MO";

module.exports = {placementProblem, momentaryCall, isOwnedLayerCode, KNOWN_ACTION_ABIS, ACTION_ABI, knownActionAbi, actionName, nativeCode, keycodeAction, pointingSlotOfCode, layerRef, layerOfRef};
