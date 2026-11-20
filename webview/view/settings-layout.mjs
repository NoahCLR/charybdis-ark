// @ts-check
// How the Settings screens are laid out: which sections each draws, in what
// order, and which screen a section is edited on.
// Pure: it reads the published sections and returns them and ids.

import {vocabulary} from "./vocabulary.mjs";

/** @typedef {import("../../contracts/panel.js").PresentedSection} Section */
/** @typedef {import("../../contracts/panel.js").PresentedField} Field */

// The Settings group of the rail, a screen per subject, each drawing its
// sections open in the order a person reads them: where behaviours run and
// what a key press feels like; combos and the layers they match on; the
// computer the keyboard is plugged into, and text replacement, which types
// through that computer's layout; how the trackball moves the pointer. Combos
// also holds the combo timing, saved with the combos. Default layers is on none: moving the base layer covers
// it, and the keyboard's stored value is kept as it is.
export const SETTINGS_SCREENS = Object.freeze({
    behaviours: Object.freeze(["behaviorSettings", "keyTiming"]),
    combos: Object.freeze(["comboSettings", "comboReferences"]),
    host: Object.freeze(["host", "autocorrect"]),
    pointer: Object.freeze(["normalPointerSpeed", "sniping", "autoMouse"]),
});
/** @typedef {keyof typeof SETTINGS_SCREENS} SettingsScreen */

/** @param {unknown} screen @returns {screen is SettingsScreen} */
const isSettingsScreen = (screen) => typeof screen === "string" && Object.hasOwn(SETTINGS_SCREENS, screen);

// The sections the keyboard's model files in an area ("Lighting"), which a
// screen outside Settings draws, in the model's order.
/** @param {{configDefaults?: readonly Section[]} | null | undefined} model @param {string} area @returns {Section[]} */
export const sectionsIn = (model, area) => (model?.configDefaults || []).filter((section) => section.area === area);

// What a setting governs, as core marks it (`governs`,
// core/model/settings-editor.js), by the setting's name: a control elsewhere
// that stands in for the setting, a behaviour's own timing, wears the same
// mark (D-L31). Null for a setting the keyboard has not reported, or one that
// marks nothing.
/** @param {{configDefaults?: readonly Section[]} | null | undefined} model @param {string} name @returns {import("../../contracts/model.js").ReviewMark | null} */
export const settingGoverns = (model, name) =>
    (model?.configDefaults || []).flatMap((section) => section.fields).find((field) => field.macro === name)?.governs ?? null;

// A setting's field, by its name, wherever it is filed; undefined for one the
// keyboard has not reported.
/** @param {{configDefaults?: readonly Section[]} | null | undefined} model @param {string} name @returns {Field | undefined} */
export const settingField = (model, name) => (model?.configDefaults || []).flatMap((section) => section.fields).find((field) => field.macro === name);

// A setting's label without the unit core writes after it for the review
// ("Blink time (ms)" reads "Blink time"), for a control that shows its unit
// beside its value, or a sentence that names the setting.
/** @param {Pick<Field, "label" | "unit"> | null | undefined} field */
export const unitlessLabel = (field) => {
    const label = field?.label || "";
    const unit = field?.unit ? ` (${field.unit})` : "";
    return unit && label.endsWith(unit) ? label.slice(0, -unit.length) : label;
};

// The sections a Settings screen draws, in its order; one the keyboard has
// not reported is left out.
/** @param {readonly Section[]} sections @param {string} screen @returns {Section[]} */
export function sectionsOn(sections, screen) {
    if (!isSettingsScreen(screen)) return [];
    const byId = new Map(sections.map((section) => [section.id, section]));
    return SETTINGS_SCREENS[screen].map((id) => byId.get(id)).filter((section) => section !== undefined);
}

// The Settings screen a section is edited on, or null for one no Settings
// screen draws (Lighting's, or Default layers).
/** @param {string | null | undefined} id @returns {SettingsScreen | null} */
export function screenOfSection(id) {
    for (const screen of /** @type {SettingsScreen[]} */ (Object.keys(SETTINGS_SCREENS))) {
        if (id && SETTINGS_SCREENS[screen].includes(id)) return screen;
    }
    return null;
}

// Where a person finds a section, as a note names it: the screen as a
// Settings screen is named outside the rail ("Behaviour settings"), then the
// section's heading ("Behaviour settings → Tap & hold timing"), each in the
// vocabulary's words, so the path is whole before any setting is read. A
// part not known is left out.
/** @param {import("./vocabulary.mjs").VocabularyModel | null | undefined} model @param {string} id */
export function sectionPath(model, id) {
    const screen = screenOfSection(id), words = vocabulary(model);
    return [screen && words.settingsScreens[screen], words.settingsSections[id]].filter(Boolean).join(" → ");
}

// A setting's label as its Settings section names it, for a note that points
// at it: the field the keyboard published, its unit left off ("Leader
// waits", not "Leader waits (ms)"), so the words have one home
// (core/model/settings-editor.js). Empty when the keyboard published none.
/** @param {{configDefaults?: readonly Section[]} | null | undefined} model @param {string} macro */
export const settingLabel = (model, macro) => unitlessLabel(settingField(model, macro));

// A section's one-per-layer switches are one setting to a person, drawn as
// one row of layers.
/** @param {Field} field */
export const isLayerSwitch = (field) => field.kind === "toggle" && field.governs?.kind === "layer";
