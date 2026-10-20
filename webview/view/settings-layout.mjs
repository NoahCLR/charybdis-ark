// @ts-check
// How the Settings screen is laid out and searched: which cards it draws, in
// what order, which start folded, what a folded card says about itself, and
// where a search finds things that are edited on another screen.
// Pure: it reads the published model and returns words and ids.

import {FIRMWARE_FACTS_SEARCH, firmwareFacts} from "./firmware-facts.mjs";

/** @typedef {import("../../contracts/panel.js").PublishedModel} Model */
/** @typedef {import("../../contracts/panel.js").PresentedSection} Section */
/** @typedef {import("../../contracts/panel.js").PresentedField} Field */

// The Settings cards, in the order a person reaches for them: what a key
// press feels like, the swaps people come looking for, then where behaviours
// and combos run, the computer it is plugged into, and the layers that are
// always on. A card draws one section; Combos also holds the combo timing
// and Combo layer matching, each still saved on its own. `folded` cards start
// closed and say what they hold. Any other Settings section the keyboard
// reports is drawn after Your computer, in the order it came, so nothing it
// reports is lost.
export const SETTINGS_CARDS = Object.freeze([
    {id: "keyTiming", sections: ["keyTiming"], folded: false},
    {id: "keyboardOptions", sections: ["keyboardOptions"], folded: true},
    {id: "behaviorSettings", sections: ["behaviorSettings"], folded: false},
    {id: "comboSettings", sections: ["comboSettings", "comboReferences"], folded: false},
    {id: "host", sections: ["host"], folded: true},
    {id: "others", sections: [], folded: false},
    {id: "startupLayers", sections: ["startupLayers"], folded: true},
]);
const PLACED = new Set(SETTINGS_CARDS.flatMap((card) => card.sections));

/** @param {Section[]} sections */
export function settingsCards(sections) {
    const byId = new Map(sections.map((section) => [section.id, section]));
    return SETTINGS_CARDS.map((card) => ({...card,
        sections: card.id === "others" ? sections.filter((section) => !PLACED.has(section.id)) : card.sections.map((id) => byId.get(id)).filter((section) => section !== undefined)}));
}

// Whether a card starts folded. Your computer opens on its own while it has
// something to say: a layout that does not fit the computer, or a Mac whose
// Unicode setup breaks Option shortcuts.
/** @param {{folded: boolean}} card @param {Section | undefined} section */
export const startsFolded = (card, section) => card.folded && !section?.warning;

// A section's one-per-layer switches are one setting to a person, folded
// under their own heading inside the section's card.
/** @param {Field} field */
export const isLayerSwitch = (field) => field.kind === "toggle" && field.governs?.kind === "layer";

/** @param {Field} field */
const layerOf = (field) => field.governs?.kind === "layer" ? field.governs.layer : -1;

// What a row of layer switches says folded: all of them, the few that are
// off, or how many are on. `nameOf` names a layer by its index.
/** @param {readonly Field[]} fields @param {(layer: number) => string} nameOf */
export function layerSwitchSummary(fields, nameOf) {
    const on = fields.filter((field) => field.enabled), off = fields.filter((field) => !field.enabled);
    if (!off.length) return `All ${fields.length} layers`;
    if (!on.length) return "No layers";
    if (off.length <= 2) return `Off on ${off.map((field) => nameOf(layerOf(field))).join(" and ")}`;
    if (on.length <= 2) return `Only ${on.map((field) => nameOf(layerOf(field))).join(" and ")}`;
    return `${on.length} of ${fields.length} layers`;
}

// What Combo layer matching says folded: every layer matching its own keys,
// or which layers borrow another layer's.
/** @param {Section} section @param {(layer: number) => string} nameOf */
export function referenceSummary(section, nameOf) {
    const borrowed = section.fields.filter((field) => field.value !== `Layer ${layerOf(field)}`);
    if (!borrowed.length) return "Each layer its own";
    const words = borrowed.slice(0, 2).map((field) => `${nameOf(layerOf(field))} uses ${nameOf(Number(String(field.value).replace(/^Layer /, "")))}`);
    return borrowed.length > 2 ? `${words.join(", ")}, +${borrowed.length - 2}` : words.join(", ");
}

// What a folded card says about itself: its state, not a count, so a setting
// that is off can be seen without opening it.
/** @param {Section} section @param {(layer: number) => string} nameOf */
export function foldedSummary(section, nameOf) {
    const fields = section.fields || [];
    if (section.id === "comboReferences") return referenceSummary(section, nameOf);
    if (section.id === "startupLayers") {
        const on = fields.filter((field) => field.enabled).map((field) => nameOf(layerOf(field)));
        return on.length ? on.join(", ") : "None";
    }
    if (section.id === "keyboardOptions") {
        if (!fields.length) return "Not read";
        const on = fields.filter((field) => field.enabled && !field.notBuilt).map((field) => field.label);
        if (!on.length) return "All off";
        return on.length === 1 ? on[0] : `${on.length} on: ${on.join(", ")}`;
    }
    if (section.id === "host") {
        const word = (/** @type {string} */ macro) => {
            const field = fields.find((entry) => entry.macro === macro);
            const choice = (field?.choices || []).find((entry) => typeof entry === "object" && String(entry.value) === String(field?.value));
            return typeof choice === "object" ? choice.label : field?.value;
        };
        return [word("hostOs"), word("hostLayout")].filter(Boolean).join(" · ");
    }
    if (fields.length && fields.every(isLayerSwitch)) return layerSwitchSummary(fields, nameOf);
    return `${fields.length} setting${fields.length === 1 ? "" : "s"}`;
}

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

// The firmware facts a search finds on the Keyboard screen: every one when
// the search names the card, otherwise those whose words match.
/** @param {Model | null | undefined} model @param {string} query */
export const factsMatching = (model, query) => matchesQuery(FIRMWARE_FACTS_SEARCH, query)
    ? firmwareFacts(model) : firmwareFacts(model).filter((fact) => matchesQuery(fact, query));

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
        {screen: "device", label: "Keyboard", count: (model?.keyboardName && matchesQuery(KEYBOARD_NAME_SEARCH, query) ? 1 : 0) + factsMatching(model, query).length},
    ];
    return found.filter((entry) => entry.count > 0);
}

/** @param {{label: string, count: number}} entry */
export const elsewhereWords = (entry) => `${entry.count} match${entry.count === 1 ? "" : "es"} on ${entry.label} →`;

/** @param {string} query */
export const noMatchWords = (query) => `No setting matches “${query.trim()}”.`;
