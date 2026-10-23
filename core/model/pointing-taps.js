// @ts-check
"use strict";

// The shortcuts a pointing slot sends, named as the editor names them, and
// which of a profile's slots run a macro.

const {PD_KIND, isPdTapKey, pdTapProblem, isPdMacro, PD_MACROS} = require("../schema/pd-mode-domain-v1");
const catalog = require("../data/keycode-catalog");

/** @typedef {{keycode?: unknown, modifierPolicy?: unknown, mask?: unknown}} TapLike */
/** @typedef {{directions?: Record<string, TapLike | undefined>, diagonals?: Record<string, TapLike | undefined>, buttons?: ({tap?: TapLike} | undefined)[]}} SlotLike */

/** @type {readonly (readonly ["directions" | "diagonals", string, string])[]} */
const PLACES = Object.freeze([
    ["directions", "left", "Left"], ["directions", "right", "Right"], ["directions", "up", "Up"], ["directions", "down", "Down"],
    ["diagonals", "upLeft", "Up-left"], ["diagonals", "upRight", "Up-right"], ["diagonals", "downLeft", "Down-left"], ["diagonals", "downRight", "Down-right"],
]);

// Every shortcut place of a slot, with the tap it holds there and the tap a
// second slot, the stored one, holds in the same place.
/** @param {SlotLike} slot @param {SlotLike} [stored] */
function pointingTaps(slot, stored) {
    /** @type {{label: string, tap: TapLike | undefined, stored: TapLike | undefined}[]} */
    const taps = PLACES.map(([group, name, label]) => ({label, tap: slot[group]?.[name], stored: stored?.[group]?.[name]}));
    (slot.buttons || []).forEach((button, index) => taps.push({label: `Button ${index + 1}`, tap: button?.tap, stored: stored?.buttons?.[index]?.tap}));
    return taps;
}

// Each configured slot's macro outputs, with their stored slot identity.
/** @param {readonly (SlotLike & {id: number, kind: number, name: string})[]} slots */
function pointingMacros(slots) {
    return slots.filter(slot => slot.kind !== PD_KIND.DISABLED).flatMap(slot => pointingTaps(slot)
        .filter(({tap}) => typeof tap?.keycode === "number" && isPdMacro(tap.keycode))
        .map(({label, tap}) => ({slot: slot.id, name: slot.name, label, macro: /** @type {number} */ (tap?.keycode) - PD_MACROS.FIRST})));
}

// The catalogue keys a pointing shortcut may send, by every name the picker
// knows them by: alone, and wrapped in modifiers, which only keyboard keys
// take.
function pointingTapKeys() {
    /** @param {(code: number) => boolean} keep */
    const names = keep => catalog.entries().filter(entry => keep(entry.value)).flatMap(entry => [entry.name, ...entry.aliases]);
    return {plain: [...names(code => code > 0 && !pdTapProblem(code)), ...Array.from({length: 128}, (_, index) => `MACRO_${index}`)], modified: names(code => code > 0 && code <= 0x1fff && isPdTapKey(code | 0x100))};
}

module.exports = {pointingTaps, pointingTapKeys, pointingMacros};
