// @ts-check

// Where a stored action may be placed, as the keyboard checks a profile it is
// asked to save (noah_action_supported_at in users/noah/lib/action). Only
// layer keycodes are restricted: a layer hold needs a key held down, so it is a
// key, a press-and-hold branch or a combo (a combo holds its output); OSL() is
// a key, a tap or a combo; LM() is a key or a combo; LT() is only a key; TG(),
// TO() and LOCK_LAYER() go anywhere; DF() and PDF(), which the keyboard does not
// own, go nowhere, and nor does a layer key past the keyboard's layers, or a
// lock of a layer it does not have. Core's
// placementProblem (core/schema/actions.js) and the interface's keycode picker
// (webview/view/keycode-expression.mjs) both ask it, each in its own words
// (D-L73).

import {QK, inBlock, layerFormLayer, layerModLayer, layerTapLayer} from "./qmk-keycodes.mjs";

/** @typedef {'key' | 'tap' | 'holdPress' | 'holdOther' | 'comboOutput'} Placement */
/** @typedef {{kind: 'layerTap' | 'layerMod' | 'hold' | 'oneShot' | 'unowned' | 'missing', places: Placement[]}} LayerRule */
export const PLACEMENT = Object.freeze(/** @type {const} */ ({KEY: "key", TAP: "tap", HOLD_PRESS: "holdPress", HOLD_OTHER: "holdOther", COMBO_OUTPUT: "comboOutput"}));

/**
 * The places a layer keycode may go on a keyboard with `layerCount` layers,
 * and what kind of layer key it is; undefined for a keycode that is no layer
 * key. "unowned" goes nowhere, and nor does "missing", a lock of a layer the
 * keyboard does not have, given the keyboard's layer-lock block (`locks`).
 * @param {number} code @param {number} layerCount @param {{first: number, count: number}} [locks] @returns {LayerRule | undefined}
 */
export function layerRuleOf(code, layerCount, locks) {
    if (locks && code >= locks.first && code < locks.first + locks.count) return code - locks.first < layerCount ? undefined : {kind: "missing", places: []};
    /** @param {import("./qmk-keycodes.mjs").KeycodeBlock} block */
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
