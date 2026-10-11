// @ts-check
/** @typedef {Partial<import("../../contracts/panel.js").PublishedModel> | null | undefined} Model */
import {vocabulary} from "./vocabulary.mjs";

// Numeric keycodes, named.
//
// Pointing-mode slots store their shortcuts as bare numbers, and the profile
// writer takes them back as names. This turns one into the other using the
// catalogue the keyboard itself reported, and falls back to the hex value
// rather than inventing a name it cannot prove.

/** @type {[number, string][]} */
const MOD_WRAPPERS_LEFT = [[1, "C"], [2, "S"], [4, "A"], [8, "G"]];
/** @type {[number, string][]} */
const MOD_WRAPPERS_RIGHT = [[1, "RCTL"], [2, "RSFT"], [4, "RALT"], [8, "RGUI"]];

export function keyName(/** @type {Model} */ model, /** @type {number} */ code) {
    if (!code) return "";
    const direct = (/** @type {number} */ value) => (model?.qmkKeycodes || []).find((entry) => entry.keycode === value)?.value;
    const exact = direct(code);
    if (exact) return exact;

    // Modifier-wrapped basic keycodes: 0x0100–0x1fff carries the held
    // modifiers in bits 8–12, and bit 12 means they are the right-hand ones.
    if (code >= 0x0100 && code <= 0x1fff) {
        const base = direct(code & 0xff);
        const bits = (code >> 8) & 0x1f;
        if (base && bits) {
            const wrappers = bits & 0x10 ? MOD_WRAPPERS_RIGHT : MOD_WRAPPERS_LEFT;
            return wrappers.filter(([bit]) => bits & bit).reduceRight((value, [, name]) => `${name}(${value})`, base);
        }
    }
    return `0x${code.toString(16).toUpperCase()}`;
}

// Labels arrive with the current model; never retain a translated name.
export const modifierBits = (/** @type {Model} */ model) => vocabulary(model).modifiers;
export const modifierNames = (/** @type {Model} */ model, /** @type {number} */ mask) => modifierBits(model).filter(([bit]) => mask & bit).map(([, name]) => name);
