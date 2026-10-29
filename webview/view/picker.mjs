// @ts-check
// What the keycode picker offers and holds, read from its state
// (`state.picker`): which keys and sections a field takes, what is picked,
// what the pick stores, why it cannot be used yet, and what a search finds.
// The sheet itself is webview/ui/picker.mjs.

import {pickerExpression} from "./edits.mjs";
import {modifierPick, pickerModifierProblem} from "./keyvalues.mjs";
import {entriesForPickerSection, pickable, pickerSections} from "./picker-sections.mjs";
import {macroMatches} from "./macro.mjs";
import {shortcutModifiers, shortcutPick, shortcutPickLabel, shortcutPickMods, shortcutPickProblem} from "./custom-key.mjs";
import {layerFormOf, layerOfKeycode} from "./keyface.mjs";
import {keyIdentity} from "./key-identity.mjs";
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

// A shortcut also takes a key that is or carries modifiers: a modifier key
// is its button in the row, and a shifted symbol is its key with those
// modifiers lit.
/** @param {Model} model @param {Picker} picker @param {string} value */
export const heldModifiers = (model, picker, value) => picker.shortcut ? shortcutModifiers(model, value) : null;

/** @param {Model} model @param {Picker} picker @param {string} value */
export const pickAllowed = (model, picker, value) => !picker.allowedKeys || picker.allowedKeys.includes(value) || Boolean(heldModifiers(model, picker, value));

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
    const held = heldModifiers(model, picker, value);
    return held ? (!held.key || picker.keys.includes(held.key)) && shortcutPickMods(model, held.mods).every((mod) => picker.mods.includes(mod))
        : picker.keys.includes(pickValue(model, picker, value));
};

// A layer key's button lit for the key picked, or for one acting on the same
// layer in a form core words alike (vocabulary.layerKeyVerbs): TG(3) is the
// same lock as LOCK_LAYER(3), so it lights Lock.
/** @param {Model} model @param {Picker} picker @param {string} value */
export function isLayerKeyPicked(model, picker, value) {
    if (isPicked(model, picker, value)) return true;
    const verbs = vocabulary(model).layerKeyVerbs, layer = layerOfKeycode(model, value);
    /** @param {string} key */
    const verb = (key) => {
        const form = layerFormOf(model, key);
        return form ? verbs[form] : undefined;
    };
    return layer !== null && verb(value) !== undefined && picker.keys.some((key) => layerOfKeycode(model, key) === layer && verb(key) === verb(value));
}

// Modifiers alone, or with a modifier key, are one set of modifiers, stored as
// the simplest keycode that holds them (modifierPick): Command, Right Command
// and the Left Command key are RGUI(KC_LEFT_GUI), as are Command and Right
// Command alone. Any other selection is stored as picked.
/** @param {Model} model @param {Picker} picker */
export const foldedPick = (model, picker) => !picker.shortcut && picker.mode === "single" && !picker.layerTap ? modifierPick(model, picker) : null;
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
