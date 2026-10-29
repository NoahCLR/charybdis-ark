// @ts-check
"use strict";

// The unit a review item names: the one thing the keyboard stores that the
// item describes and a discard puts back (D-L29). A key on a layer, a layer's
// name, a key's participation, a behaviour, a combo, the combo timing, a macro
// with its name, a custom key's name and shortcut, the keyboard's name, one
// settings section, a pointing slot, one lighting record, a change no item
// describes (`profile`), or the layer order. The panel gets a unit as a string
// (`ReviewChange.unit`); this is where that string is written and read. The
// interface keeps pinned copies of the units it reads
// (`tests/view/enum-drift.test.mjs`).

/** @typedef {"stages" | "automouse" | "combo" | "key" | "groups"} RgbRecord */
/**
 * @typedef {{kind: "layout" | "placement", layer: number, position: number}
 *   | {kind: "layerName", layer: number}
 *   | {kind: "behavior", target: import("../schema/types.js").SemanticAction}
 *   | {kind: "combo" | "macro" | "customKey", index: number}
 *   | {kind: "pd", slot: number}
 *   | {kind: "settings", section: string}
 *   | {kind: "rgb", record: "layer", layer: number}
 *   | {kind: "rgb", record: "pd", slot: number}
 *   | {kind: "rgb", record: RgbRecord}
 *   | {kind: "comboTiming" | "keyboardName" | "profile" | "layerOrder"}} ReviewUnit
 */

const RGB_RECORDS = /** @type {readonly string[]} */ (/** @type {readonly RgbRecord[]} */ (["stages", "automouse", "combo", "key", "groups"]));
const BARE = /** @type {readonly string[]} */ (["comboTiming", "keyboardName", "profile", "layerOrder"]);

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
});

/** @param {ReviewUnit} unit @returns {string} */
function formatUnit(unit) {
    switch (unit.kind) {
        case "layout": case "placement": return UNIT[unit.kind](unit.layer, unit.position);
        case "layerName": return UNIT.layerName(unit.layer);
        case "behavior": return UNIT.behavior(unit.target);
        case "combo": case "macro": case "customKey": return UNIT[unit.kind](unit.index);
        case "pd": return UNIT.pd(unit.slot);
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
    if (at < 0) return BARE.includes(text) ? /** @type {ReviewUnit} */ ({kind: text}) : null;
    const kind = text.slice(0, at), rest = text.slice(at + 1), numbers = rest.split(":").map(part => /^\d+$/.test(part) ? Number(part) : NaN);
    const [first, second] = numbers, whole = numbers.every(Number.isInteger);
    if ((kind === "layout" || kind === "placement") && numbers.length === 2 && whole) return {kind, layer: first, position: second};
    if (kind === "layerName" && numbers.length === 1 && whole) return {kind, layer: first};
    if ((kind === "combo" || kind === "macro" || kind === "customKey") && numbers.length === 1 && whole) return {kind, index: first};
    if (kind === "pd" && numbers.length === 1 && whole) return {kind, slot: first};
    if (kind === "settings" && rest) return {kind, section: rest};
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

// A unit named by the keyboard layer it belongs to rather than the slot it
// sits in (`order[slot]` is the layer a slot holds, layer-order.js), so
// edits made before and after a reorder link by what they touched. A unit
// with no layer, or no unit at all, is itself.
/** @param {string} text @param {readonly number[]} order */
function unitByLayer(text, order) {
    const unit = parseUnit(text);
    if (!unit || !("layer" in unit)) return text;
    return formatUnit({...unit, layer: order[unit.layer]});
}

module.exports = {UNIT, formatUnit, parseUnit, unitByLayer};
