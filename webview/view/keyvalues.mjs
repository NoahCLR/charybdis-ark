// @ts-check
/** @typedef {Partial<import("../../contracts/panel.js").PublishedModel> | null | undefined} Model */
import {macroNamed, vocabulary} from "./vocabulary.mjs";
import {actionLabel} from "./keyface.mjs";
import {keyIdentity, keycodeName, macroIndex} from "./key-identity.mjs";
import {MODIFIER_KEYS, MODIFIER_KEY_SIDES, MOD_BITS, MOD_RIGHT, QK, inBlock, macroName, modsOf} from "../../rules/qmk-keycodes.mjs";

// Keycodes as values: a stored shortcut named for a person, the modifiers a
// keycode carries, and a picker selection folded into one keycode. Pointing
// slots store their shortcuts as bare numbers; the name a field stages for one
// is keycodeName's (key-identity.mjs).

// A stored shortcut as the picker and the rest of Ark name it: a macro by its
// name, any other keycode by the label the keyboard's profile gives it
// ("Mouse Button 3", "Cmd+C"). keycodeName stays the form a field stages.
export function keyDisplayName(/** @type {Model} */ model, /** @type {number} */ code) {
    if (!code) return "";
    const macro = pointingMacro(model, code);
    if (macro) return macro.name;
    return actionLabel(model, keyIdentity(model, keycodeName(model, code)).canonical);
}

// The modifiers a compact keycode carries (0x0100–0x1fff, as KC_EXLM is
// S(KC_1)), as the eight-bit mask the picker's controls use: bits 8–11 are
// the modifiers and bit 12 puts them on the right. 0 for any other keycode.
/** @param {number} code */
export const compactModifierMask = (code) => {
    if (!inBlock(code, QK.MODS)) return 0;
    const compact = modsOf(code);
    return compact & MOD_RIGHT ? (compact & MOD_BITS) << 4 : compact & MOD_BITS;
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
/** @param {Model} model @param {{keys?: string[], mods?: string[]}} picker @returns {{keys: string[], mods: string[]} | {shortcut: import("../../contracts/panel.js").CustomKeyShortcut} | null} */
export function modifierPick(model, {keys = [], mods = []}) {
    const controls = vocabulary(model).pickerModifiers || [];
    const wrapped = mods.reduce((bits, wrapper) => bits | (controls.find((entry) => entry.value === wrapper)?.bit ?? 0), 0);
    /** @param {string} name */
    const entryOf = (name) => (model?.qmkKeycodes || []).find((entry) => entry.value === keyIdentity(model, name).name || entry.aliases?.includes(name));
    const code = keys[0] ? entryOf(keys[0])?.keycode : undefined;
    const keyBit = code !== undefined && inBlock(code, MODIFIER_KEYS) ? 1 << (code - MODIFIER_KEYS.first) : 0;
    if (keys.length && !keyBit) return null;
    const mask = wrapped | keyBit;
    if (!mask) return null;
    const {LEFT, RIGHT} = MODIFIER_KEY_SIDES;
    const oneSide = (/** @type {number} */ bits) => !(bits & LEFT) || !(bits & RIGHT);
    const single = (/** @type {number} */ bits) => bits !== 0 && (bits & (bits - 1)) === 0;
    // The clicked modifier stays the key when it can. Otherwise a set on one
    // side gives its first modifier, and a set on both sides the lone modifier
    // of one side, the left first, so the rest share the other side.
    const inner = keyBit && oneSide(mask & ~keyBit) ? keyBit
        : oneSide(mask) ? mask & -mask
        : single(mask & LEFT) ? mask & LEFT
        : single(mask & RIGHT) ? mask & RIGHT : 0;
    if (!inner) return {shortcut: {mods: mask, keys: [], layers: 0, layerKind: 0}};
    const name = (model?.qmkKeycodes || []).find((entry) => entry.keycode === MODIFIER_KEYS.first + Math.log2(inner))?.value;
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
    const selected = keyIdentity(model, picker.keys[0]).name;
    const code = model?.qmkKeycodes?.find(entry => entry.value === selected)?.keycode;
    if (code !== undefined) mask |= compactModifierMask(code);
    return (mask & MODIFIER_KEY_SIDES.LEFT) && (mask & MODIFIER_KEY_SIDES.RIGHT)
        ? "A keycode can hold left modifiers or right modifiers together. Choose modifiers from one side." : "";
}

// The macro slot a stored keycode plays (macroIndex, key-identity.mjs), and
// the name it goes by.
/** @param {Model} model @param {string | number | null | undefined} code */
export function pointingMacro(model, code) {
    const index = macroIndex(code, model);
    if (index === null) return null;
    const slot = model?.macros?.find(slot => slot.keycode === macroName(index));
    return {index, name: macroNamed(slot, macroName(index)), empty: Boolean(slot?.empty)};
}
