// @ts-check
"use strict";

// The keyboard's pointing keys: a fixed registry the firmware owns.
//
// Each pointing slot's mode has two keys, PD_MODE_n to hold it and
// PD_MODE_n_LOCK to lock it: slot n holds at PD_HOLD_BASE + n and locks at
// PD_LOCK_BASE + n (user-keycodes.js). The blocks hold 32 slots, and the
// keyboard has all of them. Every module that names or decodes a pointing key
// reads this table. Former names still resolve, so a name written the old way
// reaches its slot; Ark only ever writes PD_MODE_n.

const {PD_HOLD_BASE, PD_LOCK_BASE} = require("./user-keycodes");

const FORMER_NAMES = Object.freeze(["DRAGSCROLL", "VOLUME_MODE", "BRIGHTNESS_MODE", "ZOOM_MODE", "ARROW_MODE", "PINCH_MODE"]);

// A slot's former key names, hold and lock: the first six slots' factory
// preset names (firmware D-F50), and PD_SLOT_n, every slot's name before the
// keycodes became PD_MODE_n.
/** @param {number} slot @returns {{hold: string, lock: string}[]} */
const formerNames = slot => [...(FORMER_NAMES[slot] ? [FORMER_NAMES[slot]] : []), `PD_SLOT_${slot}`]
    .map(hold => ({hold, lock: `${hold}_LOCK`}));

// The keyboard's pointing slots: all 32 of the keycode blocks.
const POINTING_SLOT_COUNT = 32;
const PD_MODE_KEYS = Object.freeze(Array.from({length: POINTING_SLOT_COUNT}, (_, slot) => Object.freeze({
    slot, hold: `PD_MODE_${slot}`, lock: `PD_MODE_${slot}_LOCK`,
    holdCode: PD_HOLD_BASE + slot,
    lockCode: PD_LOCK_BASE + slot,
})));

// The slot a pointing key's native keycode or name reaches, and whether it
// locks.
/** @param {number} code */
const pdModeKeyOfCode = code => {
    for (const keys of PD_MODE_KEYS) {
        if (code === keys.holdCode) return {slot: keys.slot, locked: false};
        if (code === keys.lockCode) return {slot: keys.slot, locked: true};
    }
    return undefined;
};
/** @param {string} name */
const pdModeKeyOfName = name => {
    for (const keys of PD_MODE_KEYS) for (const {hold, lock} of [keys, ...formerNames(keys.slot)]) {
        if (name === hold) return {slot: keys.slot, locked: false};
        if (name === lock) return {slot: keys.slot, locked: true};
    }
    return undefined;
};

module.exports = {PD_MODE_KEYS, POINTING_SLOT_COUNT, FORMER_NAMES, formerNames, pdModeKeyOfCode, pdModeKeyOfName};
