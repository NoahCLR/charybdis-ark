// @ts-check
// How the Settings screens are laid out: which sections each draws, in what
// order, and which screen a section is edited on.
// Pure: it reads the published sections and returns them and ids.

import {screenDefinition} from "./screens.mjs";

/** @typedef {import("../../contracts/panel.js").PresentedSection} Section */
/** @typedef {import("../../contracts/panel.js").PresentedField} Field */

// The Settings group of the rail, a screen per subject, each drawing its
// sections open in the order a person reads them: what a key press feels
// like and where behaviours run; combos and the layers they match on; how
// the trackball moves the pointer; the computer the keyboard is plugged into
// and the keyboard-wide swaps. Combos also holds the combo timing, saved
// with the combos. Default layers is on none: moving the base layer covers
// it, and the keyboard's stored value is kept as it is.
export const SETTINGS_SCREENS = Object.freeze({
    behaviours: Object.freeze(["keyTiming", "behaviorSettings"]),
    combos: Object.freeze(["comboSettings", "comboReferences"]),
    pointer: Object.freeze(["normalPointerSpeed", "sniping", "autoMouse"]),
    host: Object.freeze(["host", "keyboardOptions"]),
});
/** @typedef {keyof typeof SETTINGS_SCREENS} SettingsScreen */

/** @param {unknown} screen @returns {screen is SettingsScreen} */
const isSettingsScreen = (screen) => typeof screen === "string" && Object.hasOwn(SETTINGS_SCREENS, screen);

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

// Where a person finds a section, as a note names it: the rail's group, the
// screen and the section, each in its owner's words ("Settings · Behaviours ·
// Tap & hold timing"). A part not known is left out.
/** @param {readonly Section[] | null | undefined} sections @param {string} id */
export function sectionPath(sections, id) {
    const screen = screenDefinition(screenOfSection(id));
    return [screen?.group, screen?.label, sections?.find((section) => section.id === id)?.label].filter(Boolean).join(" · ");
}

// A section's one-per-layer switches are one setting to a person, drawn as
// one row of layers.
/** @param {Field} field */
export const isLayerSwitch = (field) => field.kind === "toggle" && field.governs?.kind === "layer";

// The parts a section lists its fields under, in the order the first of
// each comes; a section without parts is one unnamed part.
/** @param {readonly Field[]} fields @returns {{part: string, fields: Field[]}[]} */
export function fieldParts(fields) {
    /** @type {Map<string, Field[]>} */
    const parts = new Map();
    for (const field of fields) {
        const part = field.part || "";
        if (!parts.has(part)) parts.set(part, []);
        parts.get(part)?.push(field);
    }
    return [...parts].map(([part, list]) => ({part, fields: list}));
}
