// @ts-check
// How the Settings screen is laid out and searched: which cards it draws, in
// what order, what a folded card counts, where a search finds things that are
// edited on another screen, and the firmware facts it states read-only.
// Pure: it reads the published model and returns words and ids.

/** @typedef {import("../../contracts/panel.js").PublishedModel} Model */
/** @typedef {import("../../contracts/panel.js").PresentedSection} Section */

// The Settings cards, in order. A card draws one section, or groups several
// under one title; `combo-timing` and `built-in` are drawn by the screen.
// Any other Settings section the keyboard reports is drawn after Your
// computer, in the order it came, so nothing it reports is lost.
export const SETTINGS_CARDS = Object.freeze([
    {id: "keyTiming", sections: ["keyTiming"]},
    {id: "where", title: "Where behaviours and combos run", sections: ["behaviorSettings", "comboSettings"]},
    {id: "comboTiming", title: "Combo timing", sections: []},
    {id: "comboReferences", sections: ["comboReferences"]},
    {id: "keyboardOptions", sections: ["keyboardOptions"]},
    {id: "host", sections: ["host"]},
    {id: "others", sections: []},
    {id: "startupLayers", sections: ["startupLayers"]},
    {id: "builtIn", title: "Built into this firmware", sections: []},
]);
const PLACED = new Set(SETTINGS_CARDS.flatMap((card) => card.sections));

/** @param {Section[]} sections */
export function settingsCards(sections) {
    const byId = new Map(sections.map((section) => [section.id, section]));
    return SETTINGS_CARDS.map((card) => ({...card,
        sections: card.id === "others" ? sections.filter((section) => !PLACED.has(section.id)) : card.sections.map((id) => byId.get(id)).filter((section) => section !== undefined)}));
}

// What a folded section holds, in words: its layers, its options or its
// settings. One-per-layer sections count layers, not their switches.
/** @param {Section} section */
export function foldedCount(section) {
    const fields = section.fields || [];
    const layers = fields.filter((field) => field.governs?.kind === "layer").length;
    if (layers && layers === fields.length) return `${layers} layers`;
    if (section.id === "keyboardOptions") return `${fields.length} option${fields.length === 1 ? "" : "s"}`;
    return `${fields.length} setting${fields.length === 1 ? "" : "s"}`;
}

// A field or section is found by its words, its hover help (where QMK's
// names are) and the other names a section is known by.
/** @param {{label?: string, hint?: string, tooltip?: string, search?: string}} entry @param {string} query */
export const matchesQuery = (entry, query) => !query
    || `${entry.label || ""} ${entry.hint || ""} ${entry.tooltip || ""} ${entry.search || ""}`.toLowerCase().includes(query.trim().toLowerCase());

/** @param {Section} section @param {string} query */
export const sectionMatches = (section, query) => matchesQuery({label: section.label, hint: section.search}, query)
    ? section.fields.length : section.fields.filter((field) => matchesQuery(field, query)).length;

// The keyboard's name, searched for here but edited as the Keyboard screen's
// title.
export const KEYBOARD_NAME_SEARCH = {label: "Keyboard name", tooltip: "name rename product USB",
    hint: "Shown in Chrome's keyboard chooser and your computer's list of devices."};

// What a search finds on other screens, one entry per screen that has any.
/** @param {Model | null | undefined} model @param {string} query @returns {{screen: "mouse" | "lighting" | "device", label: string, count: number}[]} */
export function matchesElsewhere(model, query) {
    if (!query.trim()) return [];
    const sections = model?.configDefaults || [];
    /** @param {string} area */
    const count = (area) => sections.filter((section) => section.area === area).reduce((total, section) => total + sectionMatches(section, query), 0);
    /** @type {{screen: "mouse" | "lighting" | "device", label: string, count: number}[]} */
    const found = [
        {screen: "lighting", label: "Lighting", count: count("Lighting")},
        {screen: "mouse", label: "Mouse", count: count("Mouse")},
        {screen: "device", label: "Keyboard", count: model?.keyboardName && matchesQuery(KEYBOARD_NAME_SEARCH, query) ? 1 : 0},
    ];
    return found.filter((entry) => entry.count > 0);
}

/** @param {{label: string, count: number}} entry */
export const elsewhereWords = (entry) => `${entry.count} match${entry.count === 1 ? "" : "es"} on ${entry.label} →`;

/** @param {string} query */
export const noMatchWords = (query) => `No setting matches “${query.trim()}”.`;

const BUILD = "Needs a firmware build to change.";

// What this firmware was built with, read-only: each fact the keyboard
// reports (model.firmware) or that the screens already show, and that QMK's
// tap-hold options apply to no key.
/** @param {Model | null | undefined} model @returns {{label: string, value: string, hint: string}[]} */
export function firmwareFacts(model) {
    const firmware = model?.firmware;
    /** @type {{label: string, value: string, hint: string}[]} */
    const facts = [];
    /** @param {string} label @param {number | null | undefined} value @param {string} words @param {string} hint */
    const add = (label, value, words, hint) => { if (Number.isInteger(value)) facts.push({label, value: `${value} ${words}`, hint: `${hint} ${BUILD}`}); };
    add("Layers", firmware?.layers ?? (model?.layers?.length || null), "layers", "Every layer the keymap has, used or empty.");
    add("Tap counts", firmware?.tapCounts ?? model?.behaviorEditing?.maxTapStepsPerBehavior, "per behaviour", "How many taps a behaviour can tell apart; more taps cycle back to the first.");
    add("Macros", firmware?.macros ?? (model?.viaMacros?.length || null), "macros", "Macro slots, stored apart from the profile.");
    add("Custom keys", firmware?.customKeys, "custom keys", "Custom key slots.");
    add("Pointing modes", model?.pdModes?.length || null, "modes", "Pointing mode slots.");
    add("Combos", firmware?.combos, "combos", "The most combos the profile can hold.");
    add("LEDs", firmware?.leds, "LEDs", "Lights on both halves together.");
    const brightness = model?.rgb?.maximumBrightness;
    if (Number.isInteger(brightness)) facts.push({label: "Brightness ceiling", value: `${brightness}`, hint: `Brightness goes no higher than this, whatever is saved. ${BUILD}`});
    if (Number.isInteger(firmware?.repeatHz)) facts.push({label: "Repeat ceiling", value: `${firmware?.repeatHz} Hz`, hint: `The fastest a held behaviour repeats. ${BUILD}`});
    const dpi = (model?.configDefaults || []).find((section) => section.id === "normalPointerSpeed");
    for (const field of dpi?.fields || []) {
        const steps = (field.choices || []).map((choice) => typeof choice === "object" ? choice.value : choice);
        if (steps.length) facts.push({label: `${field.label.replace(/ \(.*\)$/, "")} speed steps`, value: `${steps[0]}–${steps[steps.length - 1]} DPI, ${steps.length} steps`,
            hint: `The DPI steps the Charybdis accepts for this speed; a trackball mode's own speed is not limited to them. ${BUILD}`});
    }
    // Current firmware decides every key's tap or hold itself (firmware D-F27,
    // Profile Wire feature bit 31, which Ark requires).
    facts.push({label: "QMK tap-hold options", value: "Not used",
        hint: `The keyboard decides every key's tap or hold itself, so QMK's permissive hold, hold on other key press and quick tap apply to no key. ${BUILD}`});
    return facts;
}
