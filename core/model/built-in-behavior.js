// @ts-check
"use strict";

// What a key does where its behaviour row leaves a tier empty. The keyboard
// fills that gap with the key's own meaning, so an empty cell is not "nothing".
//
// Whatever a row leaves empty is the standard key, what the key does with no
// row (firmware D-F64): its own tap fills an empty Tap, once per press, so a
// double tap that sets no tap sends it twice, and nothing from one tap count
// reaches another (the grid decides which cell, webview/view/keyface.mjs). A
// Single tap set to Transparent is the exception: the key below becomes the
// standard tap (`transparentTap`). A plain key
// (a basic keycode, alone or with modifiers) taps itself; LT() taps its key,
// MT() taps its key and OSM() arms its one-shot. A custom key with a shortcut
// (firmware D-F26) is a plain key whose own action is that shortcut: it taps
// it, and holds it as a fallback. One whose shortcut's layers are Tap-toggle
// or One-shot is a momentary layer key instead, as TT() and OSL() are: it
// holds its shortcut from every press (`fromPress`, no fallback), and its own
// tap is left only what it does to the layers: One-shot's arms them, held or
// let go after Tap / hold too (`armsOnRelease`), and
// Tap-toggle's does nothing until its TAPPING_TOGGLE-th tap, which a row with
// steps replaces, so it has no tap of its own. With no row it counts taps all
// the same (`tapToggle`). (Under an authored first-press
// hold the keyboard does tap a Tap-toggle shortcut's keys from an empty tap;
// the grid, one built-in tap per row, leaves that cell empty.)
//
// The built-in hold belongs to the first press. LT() holds its layer and MT()
// and OSM() their modifiers, whatever else the row authors. A plain key's hold
// is a fallback: held, it stays down until release, but only while the first
// press authors neither a hold nor a long hold (`fallback`).
//
// A press that has a Long hold but no hold of its own stays in its tap window
// until Long hold, so a release after Tap / hold and before Long hold still
// sends that count's tap (`releaseTaps`). That holds for plain keys, custom
// keys and macros. A macro's tap plays it, and it has no hold of its own, so
// held it plays on release. Layer keys send no tap once held past Tap / hold, pointing
// keys hold their mode, and dual-role keys always have their own hold.
//
// Some keys hold from the press rather than at Tap / hold (`fromPress`): MO()
// turns its layer on, LM() its layer and modifiers, and a pointing-mode key
// (PD_MODE_n) runs its mode, all as soon as the key goes down
// (handled_key_defaults.c, handled_key_hold_behavior). A pointing-mode key
// whose row holds another mode on a later tap count waits for Tap / hold
// instead, so the two modes never overlap (key_behavior_lookup.c,
// key_behavior_step_references_foreign_pointing_mode); given the row's steps,
// `fromPress` says so.
//
// A bare modifier key (KC_LEFT_CTRL to KC_RIGHT_GUI) is a plain key: it taps
// itself, a lone tap included, and holds itself as a fallback.
//
// A pointing mode's lock key (PD_MODE_n_LOCK) and a switch key (CM_ON …
// AM_TOGG, firmware D-F66) tap themselves too, so an empty Tap locks the mode
// or switches, and hold nothing of their own, so held they act on release, as
// a macro plays (action_kind_registry_list.h, DEFAULT_TAP_USES_ACTION_KEYCODE).
//
// The keyboard owns the gesture timing of authored LT(), MT() and OSM() rows
// (physical gesture timing and runtime-owned tapping).
const {PROFILE_ACTION_KINDS: ACTION} = require("../schema/profile-blob-v1");
const {isLeaderKey, isSwitchKey, keycodeAction} = require("../schema/actions");
const {customKeyOfCode} = require("../data/user-keycodes");
const {pdModeKeyOfCode} = require("../data/pd-mode-keys");
const {QK, inBlock, BASIC_KEYS, MOD_MASK, TRANSPARENT, keyOf, modsOf, layerFormLayer, layerTapLayer} = require("../../rules/qmk-keycodes.mjs");
const {SHORTCUT_LAYER_KINDS, shortcutPresent} = require("../schema/settings-domain-v1");

// A key a tap sends: a basic key past KC_NO and KC_TRNS, a bare modifier
// among them, or a modified key.
/** @param {number} code */
const plainKey = (code) => inBlock(code, BASIC_KEYS) || inBlock(code, QK.MODS);

/** @typedef {{customKeyShortcuts?: readonly import("../schema/types.js").CustomKeyShortcut[]}} BuiltInFeatures */
// The pointing slot an action holds or locks: a pointing-mode action's, or
// that of the pointing-mode key a keycode is.
/** @param {import("../schema/types.js").SemanticAction | undefined} action */
const pointingSlotNamed = (action) => {
    if (action?.kind === ACTION.POINTING_MODE_MOMENTARY || action?.kind === ACTION.POINTING_MODE_LOCK) return action.operand;
    if (action?.kind === ACTION.QMK_KEYCODE) return pdModeKeyOfCode(action.operand)?.slot ?? null;
    return null;
};
/** @typedef {{tap?: import("../schema/types.js").SemanticAction, hold?: import("../schema/types.js").SemanticAction, fallback?: boolean, releaseTaps?: boolean, fromPress?: boolean, armsOnRelease?: boolean, transparentTap?: boolean, tapToggle?: boolean}} BuiltIns */
// Whether a branch's action is Transparent: the key below answers.
/** @param {import("../schema/types.js").SemanticAction | undefined} action */
const transparent = (action) => action?.kind === ACTION.QMK_KEYCODE && action.operand === TRANSPARENT;
// What a key does where its row, of `steps`, leaves a tier empty.
/** @param {import("../schema/types.js").SemanticAction | null | undefined} target @param {BuiltInFeatures} [features] @param {readonly Pick<import("../schema/types.js").BehaviorStep, "tapIndex" | "tap" | "hold" | "longHold">[]} [steps] @returns {BuiltIns} */
function builtInActions(target, features = {}, steps = []) {
    const actions = pointingTiming(keyActions(target, features), steps);
    const single = steps.find((step) => step.tapIndex === 0)?.tap;
    return transparent(single) ? {...actions, tap: single, transparentTap: true} : actions;
}

// A pointing-mode key whose row holds another mode on a later tap count waits
// for Tap / hold, so the two modes never overlap.
/** @param {BuiltIns} actions @param {readonly Pick<import("../schema/types.js").BehaviorStep, "tapIndex" | "hold" | "longHold">[]} steps @returns {BuiltIns} */
function pointingTiming(actions, steps) {
    const own = actions.fromPress ? pointingSlotNamed(actions.hold) : null;
    if (own === null) return actions;
    const foreign = steps.some((step) => step.tapIndex > 0 && [step.hold, step.longHold].some((branch) => {
        const slot = pointingSlotNamed(branch?.action);
        return slot !== null && slot !== own;
    }));
    if (!foreign) return actions;
    const {fromPress, ...rest} = actions;
    return rest;
}

/** @param {import("../schema/types.js").SemanticAction | null | undefined} target @param {BuiltInFeatures} [options] @returns {BuiltIns} */
function keyActions(target, {customKeyShortcuts = []} = {}) {
    const slot = target?.kind === ACTION.CUSTOM_KEY ? target.operand : target?.kind === ACTION.QMK_KEYCODE ? customKeyOfCode(target.operand) : undefined;
    if (slot !== undefined) {
        const shortcut = customKeyShortcuts[slot];
        if (!shortcutPresent(shortcut)) return {releaseTaps: true};
        const own = {kind: ACTION.CUSTOM_KEY, operand: slot};
        if (shortcut.layers && shortcut.layerKind === SHORTCUT_LAYER_KINDS.ONESHOT) return {tap: own, hold: own, fromPress: true, armsOnRelease: true};
        if (shortcut.layers && shortcut.layerKind === SHORTCUT_LAYER_KINDS.TAP_TOGGLE) return {hold: own, fromPress: true, tapToggle: true};
        return {tap: own, hold: own, fallback: true, releaseTaps: true};
    }
    if (target?.kind === ACTION.MACRO) return {tap: target, releaseTaps: true};
    if (target?.kind === ACTION.LAYER_MOMENTARY) return {hold: target, fromPress: true};
    if (target?.kind === ACTION.POINTING_MODE_MOMENTARY) return {hold: target, fromPress: true};
    if (target?.kind === ACTION.POINTING_MODE_LOCK) return {tap: target, releaseTaps: true};
    if (target?.kind !== ACTION.QMK_KEYCODE || !Number.isInteger(target.operand)) return {};
    const code = target.operand;
    if (inBlock(code, QK.MACRO)) return {tap: keycodeAction(code), releaseTaps: true};
    if (plainKey(code)) {
        return {tap: keycodeAction(code), hold: keycodeAction(code), fallback: true, releaseTaps: true};
    }
    if (inBlock(code, QK.LAYER_TAP)) {
        return {tap: keycodeAction(keyOf(code)), hold: {kind: ACTION.LAYER_MOMENTARY, operand: layerTapLayer(code)}};
    }
    if (inBlock(code, QK.MOD_TAP)) {
        return {tap: keycodeAction(keyOf(code)), hold: keycodeAction(modsOf(code) << 8)};
    }
    if (inBlock(code, QK.MOMENTARY)) return {hold: {kind: ACTION.LAYER_MOMENTARY, operand: layerFormLayer(code)}, fromPress: true};
    if (inBlock(code, QK.LAYER_MOD)) return {hold: keycodeAction(code), fromPress: true};
    if (pdModeKeyOfCode(code)?.locked === false) return {hold: keycodeAction(code), fromPress: true};
    if (pdModeKeyOfCode(code)?.locked || isSwitchKey(code) || isLeaderKey(code)) return {tap: keycodeAction(code), releaseTaps: true};
    if (inBlock(code, QK.ONE_SHOT_MOD)) {
        return {tap: keycodeAction(code), hold: keycodeAction((code & MOD_MASK) << 8)};
    }
    return {};
}

module.exports = {builtInActions, transparent};
