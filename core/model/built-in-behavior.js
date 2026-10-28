// @ts-check
"use strict";

// What a key does where its behaviour row leaves a tier empty. The keyboard
// fills that gap with the key's own meaning, so an empty cell is not "nothing".
//
// The key's own tap fills an empty first tap. An empty later tap repeats the
// first tap, the row's own or else the key's, once per press: a double tap that
// authors no tap sends it twice (firmware D-F33; the grid decides it,
// webview/view/keyface.mjs). A plain key
// (a basic keycode, alone or with modifiers) taps itself; LT() taps its key,
// MT() taps its key and OSM() arms its one-shot. A custom key with a shortcut
// (firmware D-F26) is a plain key whose own action is that shortcut: it taps
// it, and holds it as a fallback. One whose shortcut's layers are Tap-toggle
// or One-shot is a momentary layer key instead, as TT() and OSL() are: it
// holds its shortcut from every press (`fromPress`, no fallback), and its own
// tap is left only what it does to the layers: One-shot's arms them, and
// Tap-toggle's does nothing until its TAPPING_TOGGLE-th tap, which a row with
// steps replaces, so it has no tap of its own. (Under an authored first-press
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
// keys and macros. Layer keys send no tap once held past Tap / hold, pointing
// keys hold their mode, and dual-role keys always have their own hold.
//
// Some keys hold from the press rather than at Tap / hold (`fromPress`): MO()
// turns its layer on, LM() its layer and modifiers, and a pointing-mode key
// (PD_MODE_n) runs its mode, all as soon as the key goes down
// (handled_key_defaults.c, handled_key_hold_behavior). A pointing-mode key
// whose later tap counts enter another mode waits for Tap / hold instead; that
// depends on the row, so the grid decides it (webview/view/keyface.mjs).
//
// The keyboard owns the gesture timing of authored LT(), MT() and OSM() rows
// (physical gesture timing and runtime-owned tapping). A bare modifier key is
// buffered rather than tapped, so it claims nothing.
const {PROFILE_ACTION_KINDS: ACTION} = require("../schema/profile-blob-v1");
const {keycodeAction} = require("../schema/actions");
const {customKeyOfCode, PD_HOLD_BASE} = require("../data/user-keycodes");
const {QK, inBlock, MOD_MASK, keyOf, modsOf, layerTapLayer} = require("../data/qmk-keycodes");
const {SHORTCUT_LAYER_KINDS, shortcutPresent} = require("../schema/settings-domain-v1");

/** @param {number} code @param {number} start @param {number} end */
const within = (code, start, end) => code >= start && code <= end;
// A key a tap sends: a basic key past KC_NO and KC_TRNS that is no modifier,
// or a modified key.
/** @param {number} code */
const plainKey = (code) => (within(code, 0x0004, QK.BASIC.last) && !within(code, 0x00e0, 0x00e7)) || inBlock(code, QK.MODS);

/** @typedef {{customKeyShortcuts?: readonly import("../schema/types.js").CustomKeyShortcut[]}} BuiltInFeatures */
/** @param {import("../schema/types.js").SemanticAction | null | undefined} target @param {BuiltInFeatures} [options] @returns {{tap?: import("../schema/types.js").SemanticAction, hold?: import("../schema/types.js").SemanticAction, fallback?: boolean, releaseTaps?: boolean, fromPress?: boolean}} */
function builtInActions(target, {customKeyShortcuts = []} = {}) {
    const slot = target?.kind === ACTION.CUSTOM_KEY ? target.operand : target?.kind === ACTION.QMK_KEYCODE ? customKeyOfCode(target.operand) : undefined;
    if (slot !== undefined) {
        const shortcut = customKeyShortcuts[slot];
        if (!shortcutPresent(shortcut)) return {releaseTaps: true};
        const own = {kind: ACTION.CUSTOM_KEY, operand: slot};
        if (shortcut.layers && shortcut.layerKind === SHORTCUT_LAYER_KINDS.ONESHOT) return {tap: own, hold: own, fromPress: true};
        if (shortcut.layers && shortcut.layerKind === SHORTCUT_LAYER_KINDS.TAP_TOGGLE) return {hold: own, fromPress: true};
        return {tap: own, hold: own, fallback: true, releaseTaps: true};
    }
    if (target?.kind === ACTION.MACRO) return {releaseTaps: true};
    if (target?.kind === ACTION.LAYER_MOMENTARY) return {hold: target, fromPress: true};
    if (target?.kind === ACTION.POINTING_MODE_MOMENTARY) return {hold: target, fromPress: true};
    if (target?.kind !== ACTION.QMK_KEYCODE || !Number.isInteger(target.operand)) return {};
    const code = target.operand;
    if (inBlock(code, QK.MACRO)) return {releaseTaps: true};
    if (plainKey(code)) {
        return {tap: keycodeAction(code), hold: keycodeAction(code), fallback: true, releaseTaps: true};
    }
    if (inBlock(code, QK.LAYER_TAP)) {
        return {tap: keycodeAction(keyOf(code)), hold: {kind: ACTION.LAYER_MOMENTARY, operand: layerTapLayer(code)}};
    }
    if (inBlock(code, QK.MOD_TAP)) {
        return {tap: keycodeAction(keyOf(code)), hold: keycodeAction(modsOf(code) << 8)};
    }
    if (inBlock(code, QK.MOMENTARY)) return {hold: {kind: ACTION.LAYER_MOMENTARY, operand: code & 0x0f}, fromPress: true};
    if (inBlock(code, QK.LAYER_MOD)) return {hold: keycodeAction(code), fromPress: true};
    if (within(code, PD_HOLD_BASE, PD_HOLD_BASE + 0x1f)) return {hold: keycodeAction(code), fromPress: true};
    if (inBlock(code, QK.ONE_SHOT_MOD)) {
        return {tap: keycodeAction(code), hold: keycodeAction((code & MOD_MASK) << 8)};
    }
    return {};
}

module.exports = {builtInActions};
