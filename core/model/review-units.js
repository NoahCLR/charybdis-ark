// @ts-check
"use strict";

// The unit a review item names: the one thing the keyboard stores that the
// item describes and a discard puts back (D-L29). A key on a layer, a layer's
// name, a key's participation, a behaviour, a combo, the combo timing, a macro
// with its name, an autocorrect entry, a custom key's name and shortcut, the keyboard's name, one
// settings section, a pointing slot, one lighting record, a change no item
// describes (`profile`), the layer order, or a slot bank's order (D-L81). The
// panel gets a unit as a string (`ReviewChange.unit`); this is where that
// string is written and read. The interface keeps pinned copies of the units
// it reads (`tests/view/enum-drift.test.mjs`).

const {actionByIdentity} = require("./slot-order");

/** @typedef {"stages" | "automouse" | "combo" | "key" | "groups"} RgbRecord */
/**
 * @typedef {{kind: "layout" | "placement", layer: number, position: number}
 *   | {kind: "layerName", layer: number}
 *   | {kind: "behavior", target: import("../schema/types.js").SemanticAction}
 *   | {kind: "combo" | "macro" | "customKey", index: number}
 *   | {kind: "pd", slot: number}
 *   | {kind: "autocorrect", correction: string, respelled?: string}
 *   | {kind: "settings", section: string}
 *   | {kind: "rgb", record: "layer", layer: number}
 *   | {kind: "rgb", record: "pd", slot: number}
 *   | {kind: "rgb", record: RgbRecord}
 *   | {kind: BareKind}} ReviewUnit
 * @typedef {typeof BARE[number]} BareKind
 */

const RGB_RECORDS = /** @type {readonly string[]} */ (/** @type {readonly RgbRecord[]} */ (["stages", "automouse", "combo", "key", "groups"]));
// The kinds a unit names by itself alone.
const BARE = /** @type {const} */ (["comboTiming", "keyboardName", "profile", "layerOrder", "macroOrder", "customKeyOrder", "pdOrder"]);
// Each bank's order unit, by the bank as the draft's order names it
// (draft-order.js), and back.
/** @type {Readonly<Record<import("./draft-order.js").Bank, BareKind>>} */
const ORDER_UNITS = Object.freeze({layers: "layerOrder", macros: "macroOrder", customKeys: "customKeyOrder", pdModes: "pdOrder"});
/** @param {string} text @returns {text is BareKind} */
const isBare = (text) => /** @type {readonly string[]} */ (BARE).includes(text);

// One builder per kind; a unit with nothing to tell apart is its own name.
const UNIT = Object.freeze({
    /** @param {number} layer @param {number} position */
    layout: (layer, position) => `layout:${layer}:${position}`,
    /** @param {number} layer @param {number} position */
    placement: (layer, position) => `placement:${layer}:${position}`,
    /** @param {number} layer */
    layerName: layer => `layerName:${layer}`,
    /** @param {import("../schema/types.js").SemanticAction} target */
    behavior: target => `behavior:${JSON.stringify(target)}`,
    /** @param {number} index */
    combo: index => `combo:${index}`,
    comboTiming: "comboTiming",
    /** @param {number} index */
    macro: index => `macro:${index}`,
    // A text replacement entry by its key (its replacement's text, or a
    // macro replacement's key; core/schema/autocorrect-domain-v1.js entryKey)
    // as the keyboard has it, or as the draft does for one the keyboard
    // lacks, and with it the draft's key when its replacement changed.
    /** @param {string} correction @param {string} [respelled] */
    autocorrect: (correction, respelled) => `autocorrect:${JSON.stringify(respelled === undefined ? [correction] : [correction, respelled])}`,
    /** @param {number} index */
    customKey: index => `customKey:${index}`,
    keyboardName: "keyboardName",
    /** @param {string} section */
    settings: section => `settings:${section}`,
    /** @param {number} slot */
    pd: slot => `pd:${slot}`,
    /** @param {RgbRecord} record */
    rgb: record => `rgb:${record}`,
    /** @param {number} layer */
    rgbLayer: layer => `rgb:layer:${layer}`,
    /** @param {number} slot */
    rgbPd: slot => `rgb:pd:${slot}`,
    profile: "profile",
    layerOrder: "layerOrder",
    macroOrder: "macroOrder",
    customKeyOrder: "customKeyOrder",
    pdOrder: "pdOrder",
});

// A read unit as its builder writes it, for parseUnit's exact match and
// unitByIdentity; everything else writes a unit with UNIT.
/** @param {ReviewUnit} unit @returns {string} */
function formatUnit(unit) {
    switch (unit.kind) {
        case "layout": case "placement": return UNIT[unit.kind](unit.layer, unit.position);
        case "layerName": return UNIT.layerName(unit.layer);
        case "behavior": return UNIT.behavior(unit.target);
        case "combo": case "macro": case "customKey": return UNIT[unit.kind](unit.index);
        case "pd": return UNIT.pd(unit.slot);
        case "autocorrect": return UNIT.autocorrect(unit.correction, unit.respelled);
        case "settings": return UNIT.settings(unit.section);
        case "rgb": return unit.record === "layer" ? UNIT.rgbLayer(unit.layer) : unit.record === "pd" ? UNIT.rgbPd(unit.slot) : UNIT.rgb(unit.record);
        default: return UNIT[unit.kind];
    }
}

// A unit as review wrote it, or null for anything else: a string that is
// not exactly what its builder writes is no unit.
/** @param {string} text @returns {ReviewUnit | null} */
function parseUnit(text) {
    const unit = read(text);
    return unit && formatUnit(unit) === text ? unit : null;
}
/** @param {string} text @returns {ReviewUnit | null} */
function read(text) {
    const at = text.indexOf(":");
    if (at < 0) return isBare(text) ? {kind: text} : null;
    const kind = text.slice(0, at), rest = text.slice(at + 1), numbers = rest.split(":").map(part => /^\d+$/.test(part) ? Number(part) : NaN);
    const [first, second] = numbers, whole = numbers.every(Number.isInteger);
    if ((kind === "layout" || kind === "placement") && numbers.length === 2 && whole) return {kind, layer: first, position: second};
    if (kind === "layerName" && numbers.length === 1 && whole) return {kind, layer: first};
    if ((kind === "combo" || kind === "macro" || kind === "customKey") && numbers.length === 1 && whole) return {kind, index: first};
    if (kind === "pd" && numbers.length === 1 && whole) return {kind, slot: first};
    if (kind === "settings" && rest) return {kind, section: rest};
    if (kind === "autocorrect") {
        try {
            const names = JSON.parse(rest);
            if (!Array.isArray(names) || names.length < 1 || names.length > 2 || names.some(name => typeof name !== "string")) return null;
            return names.length === 1 ? {kind, correction: names[0]} : {kind, correction: names[0], respelled: names[1]};
        } catch {return null;}
    }
    if (kind === "behavior") {
        try {
            const target = JSON.parse(rest);
            return target && typeof target === "object" && !Array.isArray(target) ? {kind, target} : null;
        } catch {return null;}
    }
    if (kind === "rgb") {
        const [record, id] = rest.split(":"), slot = /^\d+$/.test(id ?? "") ? Number(id) : null;
        if (record === "layer" && slot !== null) return {kind, record, layer: slot};
        if (record === "pd" && slot !== null) return {kind, record, slot};
        if (id === undefined && RGB_RECORDS.includes(record)) return {kind, record: /** @type {RgbRecord} */ (record)};
    }
    return null;
}

// A unit named by the keyboard layer, macro, custom key or pointing mode it
// belongs to rather than the slot it sits in (`order[bank][slot]` is what a
// slot holds, draft-order.js), so edits made before and after a reorder or a
// swap link by what they touched. A behaviour is named by the key it listens
// to, which may be one of them. A unit with nothing that moves, or no unit at
// all, is itself.
/** @param {string} text @param {import("./draft-order.js").Order} order */
function unitByIdentity(text, order) {
    const unit = parseUnit(text);
    if (!unit) return text;
    if ("layer" in unit) return formatUnit({...unit, layer: order.layers[unit.layer]});
    if (unit.kind === "macro") return formatUnit({...unit, index: order.macros[unit.index]});
    if (unit.kind === "customKey") return formatUnit({...unit, index: order.customKeys[unit.index]});
    if (unit.kind === "pd" || (unit.kind === "rgb" && unit.record === "pd")) return formatUnit({...unit, slot: order.pdModes[unit.slot]});
    if (unit.kind === "behavior") return formatUnit({...unit, target: actionByIdentity(unit.target, order)});
    return text;
}

module.exports = {UNIT, ORDER_UNITS, parseUnit, unitByIdentity};
