// @ts-check
"use strict";

// Behaviour rows that change nothing. A row without steps is no row (firmware
// D-F27 "Rows without steps", part of the Profile Wire base, D-L64): it decides neither
// a key's taps nor whether the keyboard handles the key, its timing applies
// only to a key the keyboard handles anyway, and its switch and layers gate
// only what it holds. Its auto-mouse anchor applies on any key. So a row
// changes nothing when it has no steps, does not keep the pointer layer on and
// has no timing that applies to its key, and the keyboard runs the key exactly
// as without it. The editor removes such a row rather than keep it, and the
// review notes the ones it reads.
const {nativeCode, actionName} = require("../schema/actions");
const {customKeyOfCode, PD_HOLD_BASE} = require("../data/user-keycodes");
const {QK, LAYER_FORMS, layerFormBase, layerFormLayer} = require("../../rules/qmk-keycodes.mjs");
const {LAYERS} = require("../data/charybdis-layout");
const {shortcutPresent} = require("../schema/settings-domain-v1");

/**
 * @typedef {import("../schema/types.js").BehaviorRow} BehaviorRow
 * @typedef {import("../schema/types.js").SemanticAction} Action
 * @typedef {readonly {mods?: number, key?: number, layers?: number}[]} Shortcuts
 */

// The keys the keyboard handles with or without a row, as its key runtime
// classifies them: dual-role keys (MT, LT, OSM), the keys that hold a layer
// while down (MO, TT, OSL, LM) on a layer it has, pointing-mode holds, and
// custom keys with a shortcut. TO, TG, LOCK_LAYER, pointing-mode locks, DF
// and PDF it does not, so a timing alone does nothing there.
const ANY_LAYER = /** @type {const} */ ([[QK.MOD_TAP.first, QK.MOD_TAP.last], [QK.LAYER_TAP.first, QK.LAYER_TAP.last],
    [QK.LAYER_MOD.first, QK.LAYER_MOD.last], [QK.ONE_SHOT_MOD.first, QK.ONE_SHOT_MOD.last], [PD_HOLD_BASE, PD_HOLD_BASE + 0x1f]]);
// MO, OSL and TT name their layer in their low five bits.
const LAYER_IN_LOW_BITS = /** @type {const} */ ([LAYER_FORMS.MO, LAYER_FORMS.OSL, LAYER_FORMS.TT]);

// Whether a row's timing alone does something on this key.
/** @param {Action} target @param {Shortcuts | undefined} shortcuts */
function timingAlone(target, shortcuts) {
    const code = nativeCode(target);
    if (code === undefined) return false;
    const slot = customKeyOfCode(code);
    if (slot !== undefined) return shortcutPresent(shortcuts?.[slot]);
    if (/** @type {readonly number[]} */ (LAYER_IN_LOW_BITS).includes(layerFormBase(code))) return layerFormLayer(code) < LAYERS;
    return ANY_LAYER.some(([start, end]) => code >= start && code <= end);
}

/** @param {Pick<BehaviorRow, "tapHoldTerm" | "longHoldTerm" | "multiTapTerm">} row */
const hasTiming = row => Boolean(row.tapHoldTerm || row.longHoldTerm || row.multiTapTerm);

/** @param {BehaviorRow} row @param {Shortcuts | undefined} shortcuts */
const changesNothing = (row, shortcuts) => !row.steps.length && !row.keepsAutoMouseAnchored
    && (!hasTiming(row) || !timingAlone(row.target, shortcuts));

// A notice for each, not a warning: such a row is harmless, only clutter.
/** @param {Pick<import("./types.js").DecodedProfile, "behaviors"> & {settings: Partial<import("./types.js").DecodedProfile["settings"]>}} decoded @returns {import("../../contracts/model.js").Finding[]} */
function inertBehaviorFindings(decoded) {
    const shortcuts = decoded.settings.customKeyShortcuts;
    return (decoded.behaviors?.rows || []).filter(row => changesNothing(row, shortcuts)).map(row => {
        const keycode = actionName(row.target);
        return {kind: "inertBehavior", level: "notice", layers: [], identity: String(nativeCode(row.target)),
            title: `${keycode}: its behaviour changes nothing`,
            detail: hasTiming(row)
                ? "It has no branches and does not keep the pointer layer on, and a timing alone does nothing on this key, so the keyboard runs the key as if it had no behaviour."
                : "It has no branches, no timing of its own and does not keep the pointer layer on, so the keyboard runs the key as if it had no behaviour.",
            fix: "Remove the behaviour, or give it a branch.", place: {kind: "behaviour", keycode}};
    });
}

module.exports = {timingAlone, changesNothing, inertBehaviorFindings};
