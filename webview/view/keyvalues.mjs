// @ts-check
/** @typedef {Partial<import("../../contracts/panel.js").PublishedModel> | null | undefined} Model */
import {vocabulary} from "./vocabulary.mjs";
import {actionLabel, canonicalKeycode} from "./keyface.mjs";

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
    const macro = macroIndex(code);
    if (macro !== null) return `VIA_MACRO_${macro}`;
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

// A stored shortcut as the picker and the rest of Ark name it: a macro by its
// name, any other keycode by the label the keyboard's profile gives it
// ("Mouse Button 3", "Cmd+C"). keyName stays the form a field stages.
export function keyDisplayName(/** @type {Model} */ model, /** @type {number} */ code) {
    if (!code) return "";
    const macro = pointingMacro(model, code);
    if (macro) return macro.name;
    return actionLabel(model, canonicalKeycode(model, keyName(model, code)));
}

// The modifiers a compact keycode carries (0x0100–0x1fff, as KC_EXLM is
// S(KC_1)), as the eight-bit mask the picker's controls use: bits 8–11 are
// the modifiers and bit 12 puts them on the right. 0 for any other keycode.
/** @param {number} code */
export const compactModifierMask = (code) => {
    if (code < 0x0100 || code > 0x1fff) return 0;
    const compact = (code >> 8) & 0x1f;
    return compact & 0x10 ? (compact & 0x0f) << 4 : compact & 0x0f;
};

// Labels arrive with the current model; never retain a translated name.
export const modifierBits = (/** @type {Model} */ model) => vocabulary(model).modifiers;
export const modifierNames = (/** @type {Model} */ model, /** @type {number} */ mask) => modifierBits(model).filter(([bit]) => mask & bit).map(([, name]) => name);

// A picker selection that is modifiers only: the modifier buttons and, if
// one was clicked, a modifier key. A modifier key is a modifier like the
// buttons, so Command + Right Command + the Left Command key is just Left and
// Right Command. Folded into one set, it is stored as the simplest keycode
// that holds it: one modifier as the key, wrapped in the others when those are
// all on one side (Left Ctrl + Left Shift is S(KC_LEFT_CTRL), Left + Right
// Command is RGUI(KC_LEFT_GUI)), a lone modifier as its own key. A set no
// keycode can hold (two or more modifiers on each side) comes back as the
// shortcut a custom key would take instead (D-L63).
// Null when the selection has a key that is not a modifier, or nothing.
/** @param {Model} model @param {{keys?: string[], mods?: string[]}} picker @returns {{keys: string[], mods: string[]} | {shortcut: {mods: number, key: number}} | null} */
export function modifierPick(model, {keys = [], mods = []}) {
    const controls = vocabulary(model).pickerModifiers || [];
    const wrapped = mods.reduce((bits, wrapper) => bits | (controls.find((entry) => entry.value === wrapper)?.bit ?? 0), 0);
    /** @param {string} name */
    const entryOf = (name) => (model?.qmkKeycodes || []).find((entry) => entry.value === (model?.qmkKeycodeAliases?.[name] || name) || entry.aliases?.includes(name));
    const code = keys[0] ? entryOf(keys[0])?.keycode : undefined;
    const keyBit = code !== undefined && code >= 0xe0 && code <= 0xe7 ? 1 << (code - 0xe0) : 0;
    if (keys.length && !keyBit) return null;
    const mask = wrapped | keyBit;
    if (!mask) return null;
    const oneSide = (/** @type {number} */ bits) => !(bits & 0x0f) || !(bits & 0xf0);
    const single = (/** @type {number} */ bits) => bits !== 0 && (bits & (bits - 1)) === 0;
    // The clicked modifier stays the key when it can. Otherwise a set on one
    // side gives its first modifier, and a set on both sides the lone modifier
    // of one side, the left first, so the rest share the other side.
    const inner = keyBit && oneSide(mask & ~keyBit) ? keyBit
        : oneSide(mask) ? mask & -mask
        : single(mask & 0x0f) ? mask & 0x0f
        : single(mask & 0xf0) ? mask & 0xf0 : 0;
    if (!inner) return {shortcut: {mods: mask, key: 0}};
    const name = (model?.qmkKeycodes || []).find((entry) => entry.keycode === 0xe0 + Math.log2(inner))?.value;
    if (!name) return null;
    return {keys: [name], mods: controls.filter((entry) => mask & ~inner & entry.bit).map((entry) => entry.value)};
}

// Picker controls carry the full eight-bit modifier mask from the model.
// Compact keycodes can store modifiers from only one side. Include a shifted
// catalogue key's own modifiers (e.g. KC_EXLM), not just the selected controls.
// A field that lets only some keys take modifiers (a pointing mode's shortcut)
// names them, and the others are refused with the controls on.
/** @param {Model} model @param {{keys: string[], mods: string[], mode: 'single' | 'list', modifiable?: string[] | null, shortcut?: boolean}} picker */
export function pickerModifierProblem(model, picker) {
    // A shortcut holds a mask, so its modifiers mix sides (firmware D-F26).
    if (picker.mode === "list" || picker.shortcut) return "";
    if (picker.modifiable && picker.mods.length && picker.keys.length && !picker.modifiable.includes(picker.keys[0])) {
        return "Only keyboard keys take modifiers here. Send this key on its own, or clear the modifiers.";
    }
    let mask = picker.mods.reduce((bits, wrapper) => bits | ((vocabulary(model).pickerModifiers || []).find(entry => entry.value === wrapper)?.bit ?? 0), 0);
    const selected = model?.qmkKeycodeAliases?.[picker.keys[0]] || picker.keys[0];
    const code = model?.qmkKeycodes?.find(entry => entry.value === selected)?.keycode;
    if (code !== undefined) mask |= compactModifierMask(code);
    return (mask & 0x0f) && (mask & 0xf0)
        ? "A keycode can hold left modifiers or right modifiers together. Choose modifiers from one side." : "";
}

// The stored VIA macro identity, including the names accepted by the writer.
/** @param {string | number | null | undefined} code */
export function macroIndex(code) {
    const text = String(code ?? "").trim();
    const match = /^(?:VIA_MACRO_|QK_MACRO_|MC_)(\d+)$/.exec(text);
    if (match && !text.startsWith("VIA_MACRO_") && Number(match[1]) > 31) return null;
    const value = match ? Number(match[1]) : /^(?:0x[0-9a-f]+|\d+)$/i.test(text) ? Number(text) - 0x7700 : -1;
    return Number.isInteger(value) && value >= 0 && value < 128 ? value : null;
}
/** @param {Model} model @param {string | number | null | undefined} code */
export function pointingMacro(model, code) {
    const index = macroIndex(code);
    if (index === null) return null;
    const slot = model?.viaMacros?.find(slot => slot.keycode === `VIA_MACRO_${index}`);
    return {index, name: slot?.name || `Macro ${index}`, empty: Boolean(slot?.empty)};
}
