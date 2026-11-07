// @ts-check
"use strict";

// The draft's order: which keyboard layer, macro, custom key and pointing
// mode each slot of the draft holds. A draft keeps an order beside each
// history entry (session/profile-draft-session.js), set from what a Rename &
// Reorder save or a slot swap did, never inferred from names or contents:
// `order.layers[slot]` is the keyboard layer that slot now holds, and
// `order.macros[slot]`, `order.customKeys[slot]` and `order.pdModes[slot]`
// the keyboard's macro, custom key and pointing mode. The keyboard's profile
// rearranged into that order, every reference following, is the *reference*
// the review compares the draft with: a reorder or a swap is then one item
// for its bank, and everything else is compared thing with thing (D-L29,
// D-L81). Swaps compose: three swaps of a bank are one order, and the item
// says where each thing sits now.

const layers = require("./layer-order");
const {BANKS: SLOT_BANKS, identityOf, isPermutation, reorderSlots, SLOT_BANKS: SLOTS} = require("./slot-order");
const {LAYERS, LAYER_IDENTITY} = require("../data/charybdis-layout");

/** @typedef {readonly number[]} Permutation */
/** @typedef {"layers" | import("./slot-order.js").SlotBank} Bank */
/** @typedef {Readonly<Record<Bank, Permutation>>} Order */
/** @typedef {Partial<Record<Bank, Permutation>>} Step */

/** @type {readonly Bank[]} */
const BANKS = Object.freeze(["layers", ...SLOT_BANKS]);
/** @type {Order} */
const IDENTITY = Object.freeze({layers: LAYER_IDENTITY, macros: identityOf(SLOTS.macros.count), customKeys: identityOf(SLOTS.customKeys.count), pdModes: identityOf(SLOTS.pdModes.count)});

/** @param {Bank} bank @param {unknown} order @returns {order is Permutation} */
const isBankPermutation = (bank, order) => bank === "layers"
    ? Array.isArray(order) && order.length === LAYERS && new Set(order).size === LAYERS && order.every(layer => Number.isInteger(layer) && layer >= 0 && layer < LAYERS)
    : isPermutation(bank, order);
// An order with every bank, from one that names only some.
/** @param {Step} step @returns {Order} */
function completed(step) {
    for (const bank of BANKS) if (step[bank] !== undefined && !isBankPermutation(bank, step[bank])) throw Object.assign(new Error("Include every slot once."), {code: "PROFILE_DRAFT_CONFLICT"});
    return Object.freeze({layers: step.layers ?? IDENTITY.layers, macros: step.macros ?? IDENTITY.macros, customKeys: step.customKeys ?? IDENTITY.customKeys, pdModes: step.pdModes ?? IDENTITY.pdModes});
}
/** @param {Order} order */
const isIdentity = order => BANKS.every(bank => layers.isIdentity(order[bank]));
// The banks an order moves anything in.
/** @param {Order} order @returns {Bank[]} */
const movedBanks = order => BANKS.filter(bank => !layers.isIdentity(order[bank]));
// `step` rearranges a document already in `order`: slot n of a bank takes
// what slot step[bank][n] held. A step naming no bank leaves it as it is.
/** @param {Order} order @param {Step} step @returns {Order} */
const compose = (order, step) => {
    const whole = completed(step);
    return Object.freeze({layers: layers.compose(order.layers, whole.layers), macros: layers.compose(order.macros, whole.macros),
        customKeys: layers.compose(order.customKeys, whole.customKeys), pdModes: layers.compose(order.pdModes, whole.pdModes)});
};
/** @param {Order} order @returns {Order} */
const inverse = order => Object.freeze({layers: layers.inverse(order.layers), macros: layers.inverse(order.macros), customKeys: layers.inverse(order.customKeys), pdModes: layers.inverse(order.pdModes)});
// The step that takes a document in order `from` to one in order `to`:
// what moved between two history entries.
/** @param {Order} from @param {Order} to @returns {Order} */
const relative = (from, to) => compose(inverse(from), to);
// The order with only its layers moved, and with only its slots moved.
/** @param {Order} order @returns {Order} */
const layersOnly = order => Object.freeze({...IDENTITY, layers: order.layers});
/** @param {Order} order @returns {Order} */
const slotsOnly = order => Object.freeze({...order, layers: IDENTITY.layers});

// A document rearranged by `step`: every layer moves with its keys, name,
// colour and settings (layer-order.js), every macro, custom key and pointing
// mode with what is its own (slot-order.js), and every reference follows.
/** @param {import("./types.js").PortableDocument} document @param {Step} step */
function rearranged(document, step) {
    const whole = completed(step);
    const moved = layers.isIdentity(whole.layers) ? document : layers.rearranged(document, whole.layers);
    return reorderSlots(moved, {macros: whole.macros, customKeys: whole.customKeys, pdModes: whole.pdModes});
}

module.exports = {BANKS, IDENTITY, compose, inverse, isIdentity, movedBanks, relative, layersOnly, slotsOnly, rearranged};
