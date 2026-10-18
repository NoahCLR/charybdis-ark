// @ts-check
"use strict";

// What a key does where its behaviour row leaves a tier empty. The keyboard
// fills that gap with the key's own meaning, so an empty cell is not "nothing".
//
// The key's own tap fills an empty tap at every tap count the row reaches, sent
// once per press: a double tap that authors no tap sends it twice. A plain key
// (a basic keycode, alone or with modifiers) taps itself; LT() taps its key,
// MT() taps its key and OSM() arms its one-shot. A custom key with a shortcut
// (firmware D-F26) is a plain key whose own action is that shortcut: it taps
// it, and holds it as a fallback.
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
// (PD_SLOT_n) runs its mode, all as soon as the key goes down
// (handled_key_defaults.c, handled_key_hold_behavior). A pointing-mode key
// whose later tap counts enter another mode waits for Tap / hold instead; that
// depends on the row, so the grid decides it (webview/view/keyface.mjs).
//
// The keyboard owns the gesture timing of authored LT(), MT() and OSM() rows
// (physical gesture timing and runtime-owned tapping). A bare modifier key is
// buffered rather than tapped, so it claims nothing.
const {PROFILE_ACTION_KINDS: ACTION} = require("../schema/profile-blob-v1");
const {keycodeAction} = require("../schema/actions");
const {customKeyOfCode} = require("../data/user-keycodes");

/** @param {number} code @param {number} start @param {number} end */
const within = (code, start, end) => code >= start && code <= end;
/** @param {number} code */
const plainKey = (code) => (within(code, 0x0004, 0x00ff) && !within(code, 0x00e0, 0x00e7)) || within(code, 0x0100, 0x1fff);

/** @typedef {{customKeyShortcuts?: readonly {mods: number, key: number}[]}} BuiltInFeatures */
/** @param {import("../schema/types.js").SemanticAction | null | undefined} target @param {BuiltInFeatures} [options] @returns {{tap?: import("../schema/types.js").SemanticAction, hold?: import("../schema/types.js").SemanticAction, fallback?: boolean, releaseTaps?: boolean, fromPress?: boolean}} */
function builtInActions(target, {customKeyShortcuts = []} = {}) {
    const slot = target?.kind === ACTION.CUSTOM_KEY ? target.operand : target?.kind === ACTION.QMK_KEYCODE ? customKeyOfCode(target.operand) : undefined;
    if (slot !== undefined) {
        const shortcut = customKeyShortcuts[slot];
        if (!shortcut || !(shortcut.mods || shortcut.key)) return {releaseTaps: true};
        const own = {kind: ACTION.CUSTOM_KEY, operand: slot};
        return {tap: own, hold: own, fallback: true, releaseTaps: true};
    }
    if (target?.kind === ACTION.VIA_MACRO) return {releaseTaps: true};
    if (target?.kind === ACTION.LAYER_MOMENTARY) return {hold: target, fromPress: true};
    if (target?.kind === ACTION.PD_MODE_MOMENTARY) return {hold: target, fromPress: true};
    if (target?.kind !== ACTION.QMK_KEYCODE || !Number.isInteger(target.operand)) return {};
    const code = target.operand;
    if (within(code, 0x7700, 0x777f)) return {releaseTaps: true};
    if (plainKey(code)) {
        return {tap: keycodeAction(code), hold: keycodeAction(code), fallback: true, releaseTaps: true};
    }
    if (within(code, 0x4000, 0x4fff)) {
        return {tap: keycodeAction(code & 0xff), hold: {kind: ACTION.LAYER_MOMENTARY, operand: (code >> 8) & 0x0f}};
    }
    if (within(code, 0x2000, 0x3fff)) {
        return {tap: keycodeAction(code & 0xff), hold: keycodeAction(((code >> 8) & 0x1f) << 8)};
    }
    if (within(code, 0x5220, 0x523f)) return {hold: {kind: ACTION.LAYER_MOMENTARY, operand: code & 0x0f}, fromPress: true};
    if (within(code, 0x5000, 0x51ff)) return {hold: keycodeAction(code), fromPress: true};
    if (within(code, 0x7e80, 0x7e9f)) return {hold: keycodeAction(code), fromPress: true};
    if (within(code, 0x52a0, 0x52bf)) {
        return {tap: keycodeAction(code), hold: keycodeAction((code & 0x1f) << 8)};
    }
    return {};
}

module.exports = {builtInActions};
