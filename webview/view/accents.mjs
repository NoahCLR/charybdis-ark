// @ts-check
// Accents (D-L77): LEDs that light in a colour of their own while a layer is
// on, a pointing mode runs, a combo's inputs are held, a key shows a
// behaviour state or the keyboard flashes for a replacement. The keyboard
// keeps them as rows in five tables, one per stage, each naming a group of
// LEDs; Ark keeps the groups, so a person sees
// only accents. Each stage's tab lists the accents of the owner it has picked,
// and this module says which those are and what they are called, purely, so
// the lists are tested without a screen.

import {colourPaints, layerColourRow, pdColourRow, POINTING_MODE_IDS} from "./lighting.mjs";
import {localityOf, tapBranchOf} from "./edits.mjs";
import {layerAt, layerCalled, slotCalled, vocabulary, word} from "./vocabulary.mjs";

/**
 * @typedef {import("../../contracts/model.js").AccentTable} AccentTable
 * @typedef {import("../../contracts/panel.js").Accent} Accent
 * @typedef {import("../../contracts/edits.js").Colour} Colour
 * @typedef {Partial<import("../../contracts/panel.js").PublishedModel> | null | undefined} Model
 * @typedef {{layer?: number, pointingSlot?: number, feedbackRow?: string, replacementRow?: string}} Picked what a stage's tab has picked: the layer shown, the pointing slot, the behaviour feedback row and the replacement feedback row
 */

// The stages whose tab lists accents, by the table it edits.
/** @type {Readonly<Record<string, AccentTable>>} */
export const ACCENT_STAGES = Object.freeze({layers: "layer", pd: "pdMode", combo: "combo", key: "keyBehavior", autocorrect: "autocorrect"});

// The owner that is all of a table's, by the RGB enum name core reads and
// writes (vocabulary.accents.everyOwner); combo accents have no such owner,
// since every combo shares one.
/** @param {Model} model @param {AccentTable} target @returns {string | undefined} */
export const everyOwner = (model, target) => vocabulary(model).accents[target]?.everyOwner;

// The owner that stands for a group of a table's owners, by the owner picked:
// Every tap branch, for a tap branch of behaviour feedback (D-L93, firmware
// D-F75); undefined for an owner in no group.
/** @param {Model} model @param {AccentTable} target @param {string} owner @returns {string | undefined} */
export function groupOwner(model, target, owner) {
    const group = vocabulary(model).accents[target]?.group;
    return group && (group.members.includes(owner) || group.owner === owner) ? group.owner : undefined;
}

// The case a Behaviour feedback row is (D-L93), by the row: a tier's colour
// field, or a tap branch, each its own case, a tap count deeper than the
// last case's taking it, as the keyboard does (firmware D-F73); and the row
// that shows a case. Both read from vocabulary.feedbackColourOwners; a row
// the tab does not have reads as its first.
/** @param {Model} model @param {string | undefined} row */
export function feedbackOwner(model, row) {
    const owners = /** @type {Readonly<Record<string, string>>} */ (vocabulary(model).feedbackColourOwners);
    const branch = tapBranchOf(String(row || ""));
    if (branch !== null) {
        const last = Object.keys(owners).filter((key) => tapBranchOf(key) !== null).length - 1;
        return owners[`branch:${Math.min(branch, last)}`];
    }
    return owners[String(row)] || owners.tapCommittedColor;
}
/** @param {Model} model @param {string} owner */
export function feedbackRowOf(model, owner) {
    const owners = /** @type {Readonly<Record<string, string>>} */ (vocabulary(model).feedbackColourOwners);
    return Object.keys(owners).find((row) => owners[row] === owner) || "tapCommittedColor";
}

// The case a Replacement feedback row is, by the colour it edits, and the row
// that shows a case; both read from vocabulary.replacementColourOwners. A row
// the tab does not have reads as its first, as the tab picks it.
/** @param {Model} model @param {string | undefined} row */
export function replacementOwner(model, row) {
    const owners = vocabulary(model).replacementColourOwners;
    return owners[/** @type {keyof typeof owners} */ (String(row))] || owners.textColor;
}
/** @param {Model} model @param {string} owner @returns {import("../../contracts/edits.js").AutocorrectFeedbackColourField} */
export function replacementRowOf(model, owner) {
    const owners = vocabulary(model).replacementColourOwners;
    return /** @type {(keyof typeof owners)[]} */ (Object.keys(owners)).find((field) => owners[field] === owner) || "textColor";
}

/**
 * Where an owner sits on its stage's tab: the layer, the pointing slot, the
 * Behaviour feedback row or the Replacement feedback row that shows its accents,
 * or that it is all of them, which every one of those shows. The one reading of an owner's name the lists,
 * marks, colours and All accents' Open share.
 * @param {Model} model @param {AccentTable} target @param {string} owner
 * @returns {{every: boolean, group?: boolean, layer?: number, slot?: number, feedbackRow?: string, replacementRow?: string}}
 */
export function ownerPlace(model, target, owner) {
    if (owner && owner === everyOwner(model, target)) return {every: true};
    // A group's accents light on each of its owners: they open on the first.
    const group = vocabulary(model).accents[target]?.group;
    if (group && owner === group.owner) return {every: false, group: true, feedbackRow: feedbackRowOf(model, group.members[0])};
    if (target === "layer") {
        const layer = (model?.layers || []).find((entry) => entry.name === owner);
        return layer ? {every: false, layer: layer.index} : {every: false};
    }
    if (target === "pdMode") return POINTING_MODE_IDS.includes(owner) ? {every: false, slot: POINTING_MODE_IDS.indexOf(owner)} : {every: false};
    if (target === "keyBehavior") return {every: false, feedbackRow: feedbackRowOf(model, owner)};
    if (target === "autocorrect") return {every: false, replacementRow: replacementRowOf(model, owner)};
    return {every: false};
}

// An owner's mark, as the review marks the same accent: the layer's or
// pointing mode's icon in its colour, a behaviour state's tier dot; none for
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
    if (target === "autocorrect") return rgb?.autocorrectFeedbackAccents || [];
    return rgb?.keyFeedbackAccents || [];
}

/**
 * Whose accents a stage's tab shows: the layer shown, or the pointing slot,
 * behaviour state or replacement case picked; null for a stage with no accents.
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
    if (target === "autocorrect") return {target, owner: replacementOwner(model, picked.replacementRow)};
    return {target, owner: feedbackOwner(model, picked.feedbackRow)};
}

/**
 * The accents a tab lists for an owner. `here` it edits: its own and those
 * of the owner that is all of them, which light here too, in their stored
 * order. The keyboard paints them in that order, a later one repainting an
 * earlier one, except that behaviour feedback's and replacement feedback's rows
 * for every state or case paint before the rows naming one. `beneath`,
 * for a layer above the base, are the base layer's, which stay lit over it
 * (firmware paints every layer's accents after all the layer colours) and
 * are edited on the base. Each keeps its index in its table, which an edit
 * names.
 * @param {Model} model @param {AccentTable} target @param {string} owner
 */
export function accentsFor(model, target, owner) {
    const rows = accentRows(model, target);
    const every = everyOwner(model, target), group = groupOwner(model, target, owner);
    const base = model?.layers?.[0]?.name;
    return {
        here: target === "combo" ? [...rows] : rows.filter((row) => row.owner === owner || row.owner === every || (group !== undefined && row.owner === group)),
        beneath: target === "layer" && owner !== base ? rows.filter((row) => row.owner === base) : [],
    };
}

/** What an owner is called: the layer's or mode's name, the behaviour state, the replacement case, or the owner that is all of them. @param {Model} model @param {AccentTable} target @param {string} owner */
export function ownerCalled(model, target, owner) {
    const place = ownerPlace(model, target, owner);
    if (place.every) return vocabulary(model).accents[target]?.every || owner;
    if (place.group) return vocabulary(model).accents[target]?.group?.words || owner;
    if (place.layer !== undefined) return layerCalled((model?.layers || []).find((layer) => layer.index === place.layer)) || owner;
    if (place.slot !== undefined) return slotCalled(model, place.slot) || owner;
    if (target === "keyBehavior") return word(vocabulary(model).feedbackOwners, owner);
    if (target === "autocorrect") return word(vocabulary(model).replacementOwners, owner);
    return "";
}

/** When an owner's accents light, in the vocabulary's words: a phrase, so a layer owner is marked. @param {Model} model @param {AccentTable} target @param {string} owner @returns {import("./vocabulary.mjs").Phrase} */
export function accentsWhen(model, target, owner) {
    const words = vocabulary(model).accents[target];
    if (!words) return [];
    const place = ownerPlace(model, target, owner);
    const layer = !place.every && place.layer !== undefined ? layerAt(model, place.layer) : undefined;
    const [before, after = ""] = words.when.split("{owner}");
    return words.when.includes("{owner}") ? [before, layer ? {layer} : ownerCalled(model, target, owner), after] : [words.when];
}

/**
 * The colour an accent that takes its stage's colour lights with: the layer's
 * where it paints (the shown layer's for every layer's), the mode's, combo
 * feedback's, the behaviour state's or the replacement case's where it
 * flashes; null when it would paint nothing, as for a passthrough owner
 * (D-L94).
 * @param {Model} model @param {AccentTable} target @param {string} owner @param {Picked} picked @returns {Colour | null}
 */
export function stageShade(model, target, owner, picked) {
    const place = ownerPlace(model, target, owner);
    if (target === "layer") {
        const layer = place.every ? picked.layer : place.layer;
        const colour = layer === undefined ? undefined : layerColourRow(model, layer)?.color;
        return colour && colourPaints(colour) ? colour : null;
    }
    /** @param {Colour | undefined} colour */
    const paints = (colour) => colour && colourPaints(colour) ? colour : null;
    if (target === "pdMode") return paints(pdColourRow(model, place.every ? picked.pointingSlot ?? 0 : place.slot ?? -1)?.color);
    if (target === "combo") return paints(model?.rgb?.comboFeedback?.color);
    if (target === "autocorrect") {
        const colour = model?.rgb?.autocorrectFeedback?.[replacementRowOf(model, place.every ? replacementOwner(model, picked.replacementRow) : owner)];
        return colour && colourPaints(colour) ? colour : null;
    }
    // Every behaviour state's takes the picked case's, every tap branch's the
    // picked branch's, or the first's when a tier is picked.
    const pickedBranch = String(picked.feedbackRow || "").startsWith("branch:") ? picked.feedbackRow : undefined;
    return paints(feedbackCase(model, place.every ? picked.feedbackRow : place.group ? pickedBranch || place.feedbackRow : place.feedbackRow)?.color);
}

/**
 * A Behaviour feedback case's colour and where it paints, by its row: a
 * tier's, or a tap branch's (D-L93); the tab's first row when none is given.
 * @param {Model} model @param {string | undefined} row @returns {{color: Colour, locality?: string} | null}
 */
export function feedbackCase(model, row) {
    const feedback = model?.rgb?.keyBehaviorFeedback;
    if (!feedback) return null;
    const branch = tapBranchOf(String(row || ""));
    if (branch !== null) return feedback.tapBranches?.[branch] || null;
    const field = /** @type {import("../../contracts/edits.js").FeedbackColourField} */ (row || "tapCommittedColor");
    const color = feedback[field];
    return color ? {color, locality: feedback[localityOf(field)]} : null;
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
