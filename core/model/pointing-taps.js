// @ts-check
"use strict";

// The shortcuts a pointing slot sends, named as the editor names them, and
// which of a profile's slots click a mouse button: the keyboard takes a click
// only when it advertises it (schema/pd-mode-domain-v1.js), so a profile that
// holds one is checked against the keyboard before it is applied.

const {PD_KIND, isPdClick, isPdTapKey, pdTapProblem, supportsPdClicks} = require("../schema/pd-mode-domain-v1");
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

// Each configured slot's mouse-button clicks, in slot order.
/** @param {readonly (SlotLike & {id: number, kind: number, name: string})[]} slots */
function pointingClicks(slots) {
    return slots.filter(slot => slot.kind !== PD_KIND.DISABLED).flatMap(slot => pointingTaps(slot)
        .filter(({tap}) => typeof tap?.keycode === "number" && isPdClick(tap.keycode))
        .map(({label, tap}) => ({slot: slot.id, name: slot.name, label, button: /** @type {number} */ (tap?.keycode) - 0xd0})));
}

// Why the keyboard would refuse these slots, or undefined: a click on a
// keyboard that does not click. A keyboard whose features are unknown is not
// judged here.
/** @param {Parameters<typeof pointingClicks>[0]} slots @param {{featureFlags?: number} | null | undefined} capabilities */
function pointingClickProblem(slots, capabilities) {
    if (typeof capabilities?.featureFlags !== "number" || supportsPdClicks(capabilities)) return undefined;
    const [first] = pointingClicks(slots);
    return first && `Pointing mode ${first.slot} (${first.name}) clicks mouse button ${first.button} on ${first.label}, and this keyboard's firmware cannot click from a pointing mode.`;
}

// The catalogue keys a pointing shortcut may send on a keyboard that does or
// does not click, by every name the picker knows them by: alone, and wrapped
// in modifiers, which only keyboard keys take.
/** @param {boolean} clicks */
function pointingTapKeys(clicks) {
    /** @param {(code: number) => boolean} keep */
    const names = keep => catalog.entries().filter(entry => keep(entry.value)).flatMap(entry => [entry.name, ...entry.aliases]);
    return {plain: names(code => code > 0 && !pdTapProblem(code, {clicks})), modified: names(code => code > 0 && code <= 0x1fff && isPdTapKey(code | 0x100))};
}

module.exports = {pointingTaps, pointingClicks, pointingClickProblem, pointingTapKeys};
