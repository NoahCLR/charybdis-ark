// @ts-check
// What the keycode picker offers and holds, read from its state
// (`state.picker`): which keys and sections a field takes, what is picked,
// what the pick stores, why it cannot be used yet, and what a search finds.
// The sheet itself is webview/ui/picker.mjs.

import {pickerExpression} from "./edits.mjs";
import {keycodeModifiers, modifierPick, pickerModifierProblem} from "./keyvalues.mjs";
import {keycodeValue} from "./keycode-expression.mjs";
import {entriesForPickerSection, pickable, pickerSections} from "./picker-sections.mjs";
import {macroMatches} from "./macro.mjs";
import {shortcutModifiers, shortcutPick, shortcutPickDrop, shortcutPickKey, shortcutPickLabel, shortcutPickModifier, shortcutPickMods, shortcutPickProblem} from "./custom-key.mjs";
import {keyIdentity, sameKey} from "./key-identity.mjs";
import {vocabulary} from "./vocabulary.mjs";

/**
 * @typedef {import("../../contracts/panel.js").PublishedModel | null} Model
 * @typedef {import("../state.js").PickerState} Picker
 */

// A search shows this many keycodes at most, macros apart.
export const SEARCH_ROWS = 64;

// A field limited to some keys names them as QMK does; a key picked under
// another name is stored as that one.
/** @param {Model} model @param {Picker} picker @param {string} value */
export const pickValue = (model, picker, value) => picker.allowedKeys ? keyIdentity(model, value).name : value;

// Whether the picker takes one key with modifiers held around it: the row of
// modifiers above the board, and a modifier key on the board, are one set.
/** @param {{mode?: string, shortcut?: boolean, layerTap?: string | null}} picker */
const oneKey = (picker) => !picker.shortcut && picker.mode === "single" && !picker.layerTap;

// A key that is or carries modifiers, read through the row. In a shortcut a
// modifier key is its button in the row, and a shifted symbol is its key with
// those modifiers lit. In a picker for one key a modifier key is its button
// too, so clicking either lights both; a shifted symbol stays a key of its
// own there.
/** @param {Model} model @param {Picker} picker @param {string} value */
export const heldModifiers = (model, picker, value) => {
    if (picker.shortcut) return shortcutModifiers(model, value);
    if (!oneKey(picker)) return null;
    const held = shortcutModifiers(model, value);
    return held && !held.key ? held : null;
};

/** @param {Model} model @param {Picker} picker @param {string} value */
export const pickAllowed = (model, picker, value) => !picker.allowedKeys || picker.allowedKeys.includes(value) || Boolean(picker.shortcut && heldModifiers(model, picker, value));

// What a picker for one key opens on: the stored key with the modifiers it
// carries lit in the row, as clicking them would (LGUI(KC_A) is A with
// Command, the Left Command key is Command), so the row and the board say
// the same thing from the start. A key the catalogue names itself, such as
// the shifted symbol KC_EXLM, stays that key, as it was picked. Any other
// picker opens on its seed.
/** @param {Model} model @param {{mode?: string, shortcut?: boolean, layerTap?: string | null}} picker @param {readonly string[]} keys @returns {{keys: string[], mods: string[]}} */
export function openingPick(model, picker, keys) {
    if (!oneKey(picker) || keys.length !== 1) return {keys: [...keys], mods: []};
    const code = keyIdentity(model, keys[0]).entry?.keycode ?? keycodeValue(model, keys[0]);
    const held = code === undefined ? null : keycodeModifiers(model, code);
    const named = Boolean(held?.key) && (model?.qmkKeycodes || []).some((entry) => entry.keycode === code);
    if (!held || named) return {keys: [...keys], mods: []};
    return {keys: held.key ? [held.key] : [], mods: shortcutPickMods(model, held.mods)};
}

// What a click on a key picks, as the picker's next keys and modifiers, or
// null when it picks nothing (a list already full). A shortcut's keys are a
// list in press order: a click adds a key or takes it out, a symbol with its
// modifiers, which stay while another symbol needs them or the person turned
// them on (shortcutPickKey). In a picker for one key a modifier key is its
// button in the row: it lights or unlights the modifier and leaves the key
// picked. Otherwise a list adds or takes out the key, and a picker for one
// key picks it alone.
/** @param {Model} model @param {Picker} picker @param {string} chosen @returns {Partial<Picker> | null} */
export function pickKey(model, picker, chosen) {
    if (picker.shortcut || heldModifiers(model, picker, chosen)) return shortcutPickKey(model, picker, chosen);
    if (picker.mode !== "list") return {keys: [chosen]};
    if (picker.keys.includes(chosen)) return {keys: picker.keys.filter((key) => key !== chosen)};
    if (picker.maxKeys === 1) return {keys: [chosen]};
    return picker.keys.length >= picker.maxKeys ? null : {keys: [...picker.keys, chosen]};
}

// A modifier lit or unlit in the row, or by its chip's ×.
/** @param {Picker} picker @param {string} mod */
export const pickModifier = (picker, mod) => shortcutPickModifier(picker, mod);

// A picked key taken out by its chip's ×: in a shortcut with the modifiers
// it brought as a symbol, unless another key still needs them.
/** @param {Picker} picker @param {number} index @returns {Partial<Picker>} */
export const dropKey = (picker, index) => picker.shortcut ? shortcutPickDrop(picker, picker.keys[index])
    : {keys: picker.keys.filter((_, at) => at !== index)};

// The sections a field offers: all of them, or, for one limited to some keys,
// the keyboard and the sections holding one of them. A shortcut's Layers
// section holds its layer switches, not layer keycodes.
/** @param {Model} model @param {Picker} picker */
export const offeredSections = (model, picker) => pickerSections().filter(section => !picker.allowedKeys || section.kind === "board"
    || (section.kind === "layers" && Boolean(picker.shortcut))
    || (section.kind === "macros" && (model?.macros || []).some(slot => pickAllowed(model, picker, slot.keycode)))
    || entriesForPickerSection(model?.qmkKeycodes || [], section).some(entry => pickAllowed(model, picker, entry.value)));

// The section shown: the one picked, or the first offered.
/** @param {Model} model @param {Picker} picker */
export const shownSection = (model, picker) => {
    const sections = offeredSections(model, picker);
    return sections.find((entry) => entry.id === picker.section) || sections[0];
};

// What a section lists for the field: the macros, or the catalogue's entries.
/** @param {Model} model @param {Picker} picker */
export const offeredMacros = (model, picker) => (model?.macros || []).filter(slot => pickAllowed(model, picker, slot.keycode));
/** @param {Model} model @param {Picker} picker @param {import("./types.js").PickerSection | undefined} section */
export const offeredEntries = (model, picker, section) => entriesForPickerSection(model?.qmkKeycodes || [], section).filter(entry => pickAllowed(model, picker, entry.value));

// Whether a key is lit: picked, or, in a shortcut, a modifier key or shifted
// symbol whose key and modifiers are all held.
/** @param {Model} model @param {Picker} picker @param {string} value */
export const isPicked = (model, picker, value) => {
    /** @param {string} name */
    const has = (name) => picker.keys.some((key) => key === name || sameKey(model, key, name));
    const held = heldModifiers(model, picker, value);
    if (!held) return has(pickValue(model, picker, value));
    // A modifier key that is the picked key itself, as Left Shift is in
    // LCTL(KC_LSFT), is lit as the key it is.
    if (!picker.shortcut && has(value)) return true;
    return (!held.key || has(held.key)) && shortcutPickMods(model, held.mods).every((mod) => picker.mods.includes(mod));
};

// A layer key's button lit for the key picked, or for one acting on the same
// layer in a form core words alike (vocabulary.layerKeyVerbs): TG(3) is the
// same lock as LOCK_LAYER(3), so it lights Lock.
/** @param {Model} model @param {Picker} picker @param {string} value */
export function isLayerKeyPicked(model, picker, value) {
    if (isPicked(model, picker, value)) return true;
    const verbs = vocabulary(model).layerKeyVerbs, layer = keyIdentity(model, value).layer;
    /** @param {string} key */
    const verb = (key) => {
        const form = keyIdentity(model, key).layerForm;
        return form ? verbs[form] : undefined;
    };
    return layer !== undefined && verb(value) !== undefined && picker.keys.some((key) => keyIdentity(model, key).layer === layer && verb(key) === verb(value));
}

// Modifiers alone, or with a modifier key, are one set of modifiers, stored as
// the simplest keycode that holds them (modifierPick): Command and Right
// Command, from the row or the board, are RGUI(KC_LEFT_GUI). Any other
// selection is stored as picked.
/** @param {Model} model @param {Picker} picker */
export const foldedPick = (model, picker) => oneKey(picker) ? modifierPick(model, picker) : null;
/** @param {Model} model @param {Picker} picker */
export const storedPick = (model, picker) => {
    const fold = foldedPick(model, picker);
    return fold && "keys" in fold ? {...picker, ...fold} : picker;
};
// Why the pick cannot be used yet, in the draft's words: a shortcut's keys
// against core's caps, or modifiers no keycode holds.
/** @param {Model} model @param {Picker} picker */
export const pickProblem = (model, picker) => picker.shortcut ? shortcutPickProblem(model, picker) : pickerModifierProblem(model, storedPick(model, picker));

// What Use would store: a shortcut as core names it, anything else as its
// keycode expression.
/** @param {Model} model @param {Picker | null} picker */
export const pickedExpression = (model, picker) => !picker ? ""
    : picker.shortcut ? shortcutPickLabel(model, shortcutPick(model, picker)) : pickerExpression(storedPick(model, picker));

// What a search finds across every section the field takes: the macros it
// names and the offered keycodes whose name or words hold it, the first
// SEARCH_ROWS of them.
/** @param {Model} model @param {Picker} picker */
export function pickerMatches(model, picker) {
    const query = picker.search.toLowerCase();
    const macros = offeredMacros(model, picker).filter((slot) => macroMatches(slot, query));
    const keycodes = (model?.qmkKeycodes || []).filter((entry) => pickAllowed(model, picker, entry.value) && pickable(entry)
        && (entry.search?.includes(query) || entry.value.toLowerCase().includes(query))).slice(0, SEARCH_ROWS);
    return {macros, keycodes};
}
