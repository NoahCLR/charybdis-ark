"use strict";

// The keyboard's pointing-mode keycodes: a fixed registry the firmware owns.
//
// Every slot has one canonical hold and lock name: slot n holds at
// PD_HOLD_BASE + n and toggles at PD_LOCK_BASE + n (user-keycodes.js). The
// blocks hold 32 slots; a keyboard has as many of them as its action
// vocabulary says (schema/actions.js pdSlotCountFor), eight on the first
// configurable-slot firmware. Every module that names or decodes a slot reads
// this table. Older portable files can still supply the former preset names.

const {PD_HOLD_BASE, PD_LOCK_BASE} = require("./user-keycodes");

const FORMER_NAMES = Object.freeze(["DRAGSCROLL", "VOLUME_MODE", "BRIGHTNESS_MODE", "ZOOM_MODE", "ARROW_MODE", "PINCH_MODE"]);

// The size of the keycode blocks: the most slots any firmware can have.
const PD_SLOT_CAPACITY = 32;
const PD_SLOT_BINDINGS = Object.freeze(Array.from({length: PD_SLOT_CAPACITY}, (_, slot) => Object.freeze({
    slot, hold: `PD_SLOT_${slot}`, lock: `PD_SLOT_${slot}_LOCK`,
    holdCode: PD_HOLD_BASE + slot,
    lockCode: PD_LOCK_BASE + slot,
})));
// The eight slots every configurable-slot firmware has.
const PD_BINDINGS = Object.freeze(PD_SLOT_BINDINGS.slice(0, 8));

// The slot a native keycode or a binding name reaches, and whether it locks.
// A keyboard with fewer slots passes its count: a code past its last slot is
// not a pointing key there.
const pdBindingOfCode = (code, slotCount = PD_SLOT_CAPACITY) => {
    for (const binding of PD_SLOT_BINDINGS.slice(0, slotCount)) {
        if (code === binding.holdCode) return {slot: binding.slot, locked: false};
        if (code === binding.lockCode) return {slot: binding.slot, locked: true};
    }
    return undefined;
};
const pdBindingOfName = name => {
    for (const binding of PD_SLOT_BINDINGS) {
        if (name === binding.hold) return {slot: binding.slot, locked: false};
        if (name === binding.lock) return {slot: binding.slot, locked: true};
    }
    for (let slot = 0; slot < FORMER_NAMES.length; slot++) {
        if (name === FORMER_NAMES[slot]) return {slot, locked: false};
        if (name === `${FORMER_NAMES[slot]}_LOCK`) return {slot, locked: true};
    }
    return undefined;
};

module.exports = {PD_BINDINGS, PD_SLOT_BINDINGS, PD_SLOT_CAPACITY, FORMER_NAMES, pdBindingOfCode, pdBindingOfName};
