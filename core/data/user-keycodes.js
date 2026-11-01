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
//   0x7f00–0x7f7f  CUSTOM_KEY_0–127  named keys that do what their behaviour says

const CUSTOM_KEY_BASE = 0x7f00, PD_HOLD_BASE = 0x7e80, PD_LOCK_BASE = 0x7ea0, LAYER_LOCK_BASE = 0x7ec0;
const CUSTOM_KEY_SLOTS = 128, LAYER_LOCK_SLOTS = 16;
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

module.exports = {
    CUSTOM_KEY_BASE, PD_HOLD_BASE, PD_LOCK_BASE, LAYER_LOCK_BASE, CUSTOM_KEY_SLOTS, LAYER_LOCK_SLOTS, LAYER_LOCK_BLOCK,
    RETIRED_CUSTOM_KEY_BASE, RETIRED_CUSTOM_KEY_SLOTS,
    customKeyCode, customKeyName, customKeyOfCode, customKeyOfName, layerLockCode, layerLockOfCode,
};
