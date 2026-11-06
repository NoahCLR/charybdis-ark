// @ts-check
// Accents (D-L77): LEDs that light in a colour of their own while a layer is
// on, a pointing mode runs, a combo's inputs are held or a key shows a
// feedback state. The keyboard keeps them as rows in four tables, one per
// stage, each naming a group of LEDs; Ark keeps the groups, so a person sees
// only accents. Each stage's tab lists the accents of the owner it has picked,
// and this module says which those are and what they are called, purely, so
// the lists are tested without a screen.

import {layerColourRow, layerPaints, pdColourRow, POINTING_MODE_IDS} from "./lighting.mjs";
import {layerCalled, slotCalled, vocabulary, word} from "./vocabulary.mjs";

/**
 * @typedef {import("../../contracts/model.js").AccentTable} AccentTable
 * @typedef {import("../../contracts/panel.js").Accent} Accent
 * @typedef {import("../../contracts/edits.js").Colour} Colour
 * @typedef {Partial<import("../../contracts/panel.js").PublishedModel> | null | undefined} Model
 * @typedef {{layer?: number, pointingSlot?: number, feedbackRow?: string}} Picked what a stage's tab has picked: the layer shown, the pointing slot and the key feedback row
 */

// The stages whose tab lists accents, by the table it edits.
/** @type {Readonly<Record<string, AccentTable>>} */
export const ACCENT_STAGES = Object.freeze({layers: "layer", pd: "pdMode", combo: "combo", key: "keyBehavior"});

// The owner that is all of a table's, by the RGB enum name core reads and
// writes (vocabulary.accents.everyOwner); combo accents have no such owner,
// since every combo shares one.
/** @param {Model} model @param {AccentTable} target @returns {string | undefined} */
export const everyOwner = (model, target) => vocabulary(model).accents[target]?.everyOwner;

// The key feedback state a Key feedback row is, by the colour it edits (a
// tier's field, or any tap branch's, all of which wait as one state), and
// the row that shows a state, a tap branch pending showing on the double
// tap's; both read from vocabulary.feedbackColourOwners.
/** @param {Model} model @param {string | undefined} row */
export function feedbackOwner(model, row) {
    const owners = vocabulary(model).feedbackColourOwners;
    if (String(row || "").startsWith("branch:")) return owners.tapBranchColors;
    return owners[/** @type {keyof typeof owners} */ (String(row))] || owners.tapCommittedColor;
}
/** @param {Model} model @param {string} owner */
export function feedbackRowOf(model, owner) {
    const owners = vocabulary(model).feedbackColourOwners;
    if (owner === owners.tapBranchColors) return "branch:0";
    return Object.keys(owners).find((field) => owners[/** @type {keyof typeof owners} */ (field)] === owner) || "tapCommittedColor";
}

/**
 * Where an owner sits on its stage's tab: the layer, the pointing slot or the
 * Key feedback row that shows its accents, or that it is all of them, which
 * every one of those shows. The one reading of an owner's name the lists,
 * marks, colours and All accents' Open share.
 * @param {Model} model @param {AccentTable} target @param {string} owner
 * @returns {{every: boolean, layer?: number, slot?: number, feedbackRow?: string}}
 */
export function ownerPlace(model, target, owner) {
    if (owner && owner === everyOwner(model, target)) return {every: true};
    if (target === "layer") {
        const layer = (model?.layers || []).find((entry) => entry.name === owner);
        return layer ? {every: false, layer: layer.index} : {every: false};
    }
    if (target === "pdMode") return POINTING_MODE_IDS.includes(owner) ? {every: false, slot: POINTING_MODE_IDS.indexOf(owner)} : {every: false};
    if (target === "keyBehavior") return {every: false, feedbackRow: feedbackRowOf(model, owner)};
    return {every: false};
}

// An owner's mark, as the review marks the same accent: the layer's or
// pointing mode's icon in its colour, a feedback state's tier dot; none for
// the owner that is all of them, or combo feedback's.
/** @param {Model} model @param {AccentTable} target @param {string} owner @returns {import("../../contracts/model.js").ReviewMark | null} */
export function ownerMark(model, target, owner) {
    const place = ownerPlace(model, target, owner);
    if (place.layer !== undefined) return {kind: "layer", layer: place.layer};
    if (place.slot !== undefined) return {kind: "pointing", slot: place.slot};
    const tier = target === "keyBehavior" && !place.every ? vocabulary(model).feedbackTiers[owner] : undefined;
    return tier ? {kind: "tier", tier} : null;
}

/** A table's accents, in the order the keyboard paints them. @param {Model} model @param {AccentTable} target @returns {readonly Accent[]} */
export function accentRows(model, target) {
    const rgb = model?.rgb;
    if (target === "layer") return rgb?.layerAccents || [];
    if (target === "pdMode") return rgb?.pdModeAccents || [];
    if (target === "combo") return rgb?.comboAccents || [];
    return rgb?.keyFeedbackAccents || [];
}

/**
 * Whose accents a stage's tab shows: the layer shown, or the pointing slot or
 * feedback state picked; null for a stage with no accents.
 * @param {Model} model @param {string} stage @param {Picked} picked @returns {{target: AccentTable, owner: string} | null}
 */
export function accentOwner(model, stage, picked) {
    const target = ACCENT_STAGES[stage];
    if (!target) return null;
    if (target === "layer") {
        const layer = (model?.layers || []).find((entry) => entry.index === picked.layer) || model?.layers?.[0];
        return layer ? {target, owner: layer.name} : null;
    }
    if (target === "pdMode") return {target, owner: POINTING_MODE_IDS[picked.pointingSlot ?? 0]};
    if (target === "combo") return {target, owner: ""};
    return {target, owner: feedbackOwner(model, picked.feedbackRow)};
}

/**
 * The accents a tab lists for an owner. `here` it edits: its own and those
 * of the owner that is all of them, which light here too, in the order the
 * keyboard paints them, a later one repainting an earlier one. `beneath`,
 * for a layer above the base, are the base layer's, which stay lit over it
 * (firmware paints every layer's accents after all the layer colours) and
 * are edited on the base. Each keeps its index in its table, which an edit
 * names.
 * @param {Model} model @param {AccentTable} target @param {string} owner
 */
export function accentsFor(model, target, owner) {
    const rows = accentRows(model, target);
    const every = everyOwner(model, target);
    const base = model?.layers?.[0]?.name;
    return {
        here: target === "combo" ? [...rows] : rows.filter((row) => row.owner === owner || row.owner === every),
        beneath: target === "layer" && owner !== base ? rows.filter((row) => row.owner === base) : [],
    };
}

/** What an owner is called: the layer's or mode's name, the feedback state, or the owner that is all of them. @param {Model} model @param {AccentTable} target @param {string} owner */
export function ownerCalled(model, target, owner) {
    const place = ownerPlace(model, target, owner);
    if (place.every) return vocabulary(model).accents[target]?.every || owner;
    if (place.layer !== undefined) return layerCalled((model?.layers || []).find((layer) => layer.index === place.layer)) || owner;
    if (place.slot !== undefined) return slotCalled(model, place.slot) || owner;
    if (target === "keyBehavior") return word(vocabulary(model).feedbackOwners, owner);
    return "";
}

/** When an owner's accents light, in the vocabulary's words. @param {Model} model @param {AccentTable} target @param {string} owner */
export function accentsWhen(model, target, owner) {
    const words = vocabulary(model).accents[target];
    return words ? words.when.replace("{owner}", ownerCalled(model, target, owner)) : "";
}

/**
 * The colour an accent that takes its stage's colour lights with: the layer's
 * where it paints (the shown layer's for every layer's), the mode's, combo
 * feedback's or the feedback state's; null when it would paint nothing.
 * @param {Model} model @param {AccentTable} target @param {string} owner @param {Picked} picked @returns {Colour | null}
 */
export function stageShade(model, target, owner, picked) {
    const place = ownerPlace(model, target, owner);
    if (target === "layer") {
        const layer = place.every ? picked.layer : place.layer;
        const colour = layer === undefined ? undefined : layerColourRow(model, layer)?.color;
        return colour && layerPaints(colour) ? colour : null;
    }
    if (target === "pdMode") return pdColourRow(model, place.every ? picked.pointingSlot ?? 0 : place.slot ?? -1)?.color || null;
    if (target === "combo") return model?.rgb?.comboFeedback?.color || null;
    const row = place.every ? picked.feedbackRow : place.feedbackRow;
    const feedback = model?.rgb?.keyBehaviorFeedback;
    if (String(row || "").startsWith("branch:")) return feedback?.tapBranchColors?.[0] || null;
    return feedback?.[/** @type {"tapCommittedColor" | "holdActiveColor" | "longHoldActiveColor"} */ (row || "tapCommittedColor")] || null;
}

/**
 * How many accents and LED sets the draft holds against what the keyboard
 * holds, from the profile's usage counts, in the words the Memory card uses
 * (vocabulary.usageCounts); empty when the core sent none.
 * @param {Model} model @returns {{id: string, label: string, what: string, used: number, limit: number}[]}
 */
export function accentBudget(model) {
    const counts = model?.portable?.usage?.counts || [];
    return /** @type {const} */ (["lightingGroupRows", "lightingGroups"]).flatMap((id) => {
        const count = counts.find((entry) => entry.id === id);
        const words = vocabulary(model).usageCounts[id];
        return count ? [{id, label: words?.label || id, what: words?.what || "", used: count.used, limit: count.limit}] : [];
    });
}

/**
 * Every accent, by the stage that paints it and then by owner, in the order
 * the stages paint and the tables list their owners: for All accents.
 * @param {Model} model @returns {{stage: string, target: AccentTable, owners: {owner: string, rows: Accent[]}[]}[]}
 */
export function allAccents(model) {
    return Object.entries(ACCENT_STAGES).flatMap(([stage, target]) => {
        /** @type {Map<string, Accent[]>} */
        const owners = new Map();
        for (const row of accentRows(model, target)) owners.set(row.owner, [...(owners.get(row.owner) || []), row]);
        return owners.size ? [{stage, target, owners: [...owners].map(([owner, rows]) => ({owner, rows}))}] : [];
    });
}
