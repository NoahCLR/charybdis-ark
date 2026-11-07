// @ts-check
"use strict";

// A swap of two slots of one bank (D-L81): two macros, two custom keys or
// two pointing modes trade places, each with everything that is its own and
// every reference following (slot-order.js). The message names the two the
// way their screens pick them, a macro and a custom key by keycode name and
// a pointing mode by slot; the step it makes of the draft's order is what
// the draft keeps beside the history entry (draft-order.js), so the review
// shows the swap as one item.

const {decodedOf} = require("./portable-profile");
const {reorderSlots, swapStep} = require("./slot-order");
const {macroDefaultName, slotName} = require("./vocabulary");
const {macroOfName} = require("../../rules/qmk-keycodes.mjs");
const {customKeyOfName} = require("../data/user-keycodes");

/**
 * @typedef {import("../../contracts/edits.js").PanelEdit} PanelEdit
 * @typedef {Extract<PanelEdit, {type: "swapMacros" | "swapCustomKeys" | "swapPdModes"}>} SwapEdit
 * @typedef {import("./slot-order.js").SlotBank} SlotBank
 */
/** @param {string} text */
const fail = text => Object.assign(new Error(text), {code: "PROFILE_DRAFT_CONFLICT"});

// The bank a swap message names and the two slots, as numbers.
/** @param {SwapEdit} message @returns {{bank: SlotBank, slots: [number, number]}} */
function swapOf(message) {
    switch (message.type) {
        case "swapMacros": {
            const slots = (Array.isArray(message.keycodes) ? message.keycodes : []).map(name => macroOfName(String(name ?? "")));
            if (slots.length !== 2 || slots.some(slot => slot === undefined)) throw fail("Choose two macro slots reported by the keyboard.");
            return {bank: "macros", slots: /** @type {[number, number]} */ (slots)};
        }
        case "swapCustomKeys": {
            const slots = (Array.isArray(message.keycodes) ? message.keycodes : []).map(name => customKeyOfName(name));
            if (slots.length !== 2 || slots.some(slot => slot === undefined)) throw fail("Choose two custom keys the keyboard has.");
            return {bank: "customKeys", slots: /** @type {[number, number]} */ (slots)};
        }
        case "swapPdModes": {
            const slots = Array.isArray(message.slots) ? message.slots : [];
            if (slots.length !== 2 || slots.some(slot => !Number.isInteger(slot))) throw fail("Choose two pointing slots the keyboard has.");
            return {bank: "pdModes", slots: /** @type {[number, number]} */ (slots)};
        }
        default: throw fail("Unsupported draft edit.");
    }
}

// The step a swap makes of the draft's order: its bank's two slots traded.
/** @param {SwapEdit} message @returns {import("./draft-order.js").Step} */
function slotEditStep(message) {
    const {bank, slots: [a, b]} = swapOf(message);
    return {[bank]: swapStep(bank, a, b)};
}

// What a swap did, naming the two as their screens call them before it.
/** @param {SwapEdit} message @param {import("./types.js").PortableDocument} document */
function swapLabel(message, document) {
    const {bank, slots} = swapOf(message);
    const {settings, pdModes} = decodedOf({document});
    /** @param {number} slot */
    const called = slot => bank === "macros" ? settings.macroNames[slot] || macroDefaultName(slot)
        : bank === "customKeys" ? settings.customKeyNames[slot] || `Custom key ${slot}`
        : slotName(pdModes[slot], slot);
    return `Swapped ${called(slots[0])} and ${called(slots[1])}`;
}

// The document with the two slots swapped.
/** @param {import("./types.js").PortableDocument} document @param {SwapEdit} message */
const editSlots = (document, message) => reorderSlots(document, slotEditStep(message));

module.exports = {editSlots, slotEditStep, swapLabel};
