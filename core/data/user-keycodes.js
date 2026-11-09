// @ts-check
"use strict";

// The keyboard's userspace keycodes: fixed blocks the firmware owns, one per
// family, reserved beyond what is supported today (users/noah/noah_keymap_ids.h,
// Profile Wire feature bit 16).
//
//   0x7e40–0x7e7f  retired: custom keys 0–63 before firmware D-F14, now inert
//   0x7e80–0x7e9f  PD_MODE_n         hold pointing slot n
//   0x7ea0–0x7ebf  PD_MODE_n_LOCK    lock pointing slot n
//   0x7ec0–0x7edf  LOCK_LAYER(n)     toggle layer n's lock
//   0x7ee0–0x7eef  BH_ON, BH_OFF, BH_TOGG
//                                    the switch keys for behaviours: on, off or
//                                    the other way, as QMK's CM_ON, CM_OFF and
//                                    CM_TOGG are for combos (firmware D-F66;
//                                    16 reserved, 3 used)
//   0x7ef0–0x7eff  AM_ON, AM_OFF, AM_TOGG
//                                    the switch keys for auto-mouse, the same
//                                    way (firmware D-F66; 16 reserved, 3 used)
//   0x7f00–0x7f7f  CUSTOM_KEY_0–127  named keys that do what their behaviour says

const CUSTOM_KEY_BASE = 0x7f00, PD_HOLD_BASE = 0x7e80, PD_LOCK_BASE = 0x7ea0, LAYER_LOCK_BASE = 0x7ec0;
const CUSTOM_KEY_SLOTS = 128, LAYER_LOCK_SLOTS = 16;
// The block of the switch keys for behaviours, and the one for auto-mouse's:
// sixteen codes reserved each, three used.
const BEHAVIOR_SWITCH_BASE = 0x7ee0, BEHAVIOR_SWITCH_SLOTS = 16;
const AUTO_MOUSE_SWITCH_BASE = 0x7ef0, AUTO_MOUSE_SWITCH_SLOTS = 16;
// The block custom keys used before D-F14, now inert: nothing there is a
// custom key.
const RETIRED_CUSTOM_KEY_BASE = 0x7e40, RETIRED_CUSTOM_KEY_SLOTS = 64;

/** @param {number} slot */
const customKeyCode = slot => CUSTOM_KEY_BASE + slot;
/** @param {number} code */
const customKeyOfCode = code => Number.isInteger(code) && code >= CUSTOM_KEY_BASE && code < CUSTOM_KEY_BASE + CUSTOM_KEY_SLOTS ? code - CUSTOM_KEY_BASE : undefined;
// A custom key by the name the keyboard gives it, CUSTOM_KEY_0 …
// CUSTOM_KEY_127: a slot written with a leading zero is no name of one.
/** @param {unknown} name */
const customKeyOfName = name => {
    const match = /^CUSTOM_KEY_(0|[1-9]\d*)$/.exec(String(name ?? ""));
    return match && Number(match[1]) < CUSTOM_KEY_SLOTS ? Number(match[1]) : undefined;
};
// The name the keyboard gives a custom key.
/** @param {number} slot */
const customKeyName = slot => `CUSTOM_KEY_${slot}`;
// The layer-lock block as the shared layer rules read it (rules/).
const LAYER_LOCK_BLOCK = Object.freeze({first: LAYER_LOCK_BASE, count: LAYER_LOCK_SLOTS});
/** @param {number} layer */
const layerLockCode = layer => LAYER_LOCK_BASE + layer;
/** @param {number} code */
const layerLockOfCode = code => Number.isInteger(code) && code >= LAYER_LOCK_BASE && code < LAYER_LOCK_BASE + LAYER_LOCK_SLOTS ? code - LAYER_LOCK_BASE : undefined;
// The switch keys for behaviours, by the keyboard's names, in their block's
// order: on, off, the other way. This is the names' one home; their words
// (VOCABULARY.switchKeys) are keyed by them. A stored one is a plain keycode
// (action kind 1), as QMK's CM_ON, CM_OFF and CM_TOGG are; the rest of the
// block is inert.
const BEHAVIOR_SWITCH_KEYS = /** @type {const} */ (["BH_ON", "BH_OFF", "BH_TOGG"]);
Object.freeze(BEHAVIOR_SWITCH_KEYS);
/** @typedef {typeof BEHAVIOR_SWITCH_KEYS[number]} BehaviorSwitchKey */
/** @param {unknown} name */
const behaviorSwitchKeyCode = name => {
    const at = /** @type {readonly string[]} */ (BEHAVIOR_SWITCH_KEYS).indexOf(String(name ?? ""));
    return at < 0 ? undefined : BEHAVIOR_SWITCH_BASE + at;
};
/** @param {number} code @returns {BehaviorSwitchKey | undefined} */
const behaviorSwitchKeyName = code => Number.isInteger(code) && code >= BEHAVIOR_SWITCH_BASE && code < BEHAVIOR_SWITCH_BASE + BEHAVIOR_SWITCH_SLOTS
    ? BEHAVIOR_SWITCH_KEYS[code - BEHAVIOR_SWITCH_BASE] : undefined;
// The switch keys for auto-mouse, the same way: their names' one home, in
// their block's order, keying their words (VOCABULARY.switchKeys); a stored
// one is a plain keycode, and the rest of the block is inert.
const AUTO_MOUSE_SWITCH_KEYS = /** @type {const} */ (["AM_ON", "AM_OFF", "AM_TOGG"]);
Object.freeze(AUTO_MOUSE_SWITCH_KEYS);
/** @typedef {typeof AUTO_MOUSE_SWITCH_KEYS[number]} AutoMouseSwitchKey */
/** @param {unknown} name */
const autoMouseSwitchKeyCode = name => {
    const at = /** @type {readonly string[]} */ (AUTO_MOUSE_SWITCH_KEYS).indexOf(String(name ?? ""));
    return at < 0 ? undefined : AUTO_MOUSE_SWITCH_BASE + at;
};
/** @param {number} code @returns {AutoMouseSwitchKey | undefined} */
const autoMouseSwitchKeyName = code => Number.isInteger(code) && code >= AUTO_MOUSE_SWITCH_BASE && code < AUTO_MOUSE_SWITCH_BASE + AUTO_MOUSE_SWITCH_SLOTS
    ? AUTO_MOUSE_SWITCH_KEYS[code - AUTO_MOUSE_SWITCH_BASE] : undefined;

module.exports = {
    CUSTOM_KEY_BASE, PD_HOLD_BASE, PD_LOCK_BASE, LAYER_LOCK_BASE, BEHAVIOR_SWITCH_BASE, AUTO_MOUSE_SWITCH_BASE, CUSTOM_KEY_SLOTS, LAYER_LOCK_SLOTS, LAYER_LOCK_BLOCK,
    BEHAVIOR_SWITCH_SLOTS, BEHAVIOR_SWITCH_KEYS, AUTO_MOUSE_SWITCH_SLOTS, AUTO_MOUSE_SWITCH_KEYS, RETIRED_CUSTOM_KEY_BASE, RETIRED_CUSTOM_KEY_SLOTS,
    autoMouseSwitchKeyCode, autoMouseSwitchKeyName, behaviorSwitchKeyCode, behaviorSwitchKeyName, customKeyCode, customKeyName, customKeyOfCode, customKeyOfName, layerLockCode, layerLockOfCode,
};
