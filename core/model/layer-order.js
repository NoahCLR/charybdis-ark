// @ts-check
"use strict";

// Which keyboard layer each slot of a draft holds.
//
// A layer is neither its name, which a rename changes, nor its slot, which a
// reorder changes. A draft keeps an order beside each history entry —
// `order[slot]` is the keyboard layer that slot now holds — set from what
// Rename & Reorder saved, never inferred from names or contents. The keyboard's
// profile rearranged into that order, every layer reference following, is the
// *reference* the review compares the draft with: a reorder is then one item,
// and everything else is compared layer with layer.

const {reorderLayers, validateSnapshot} = require("./portable-profile");

/** @param {readonly number[]} order */
const isIdentity = order => order.every((layer, slot) => layer === slot);
// `step` rearranges a document already in `order`, as reorderLayers reads it:
// slot n takes what slot step[n] held.
/** @param {readonly number[]} order @param {readonly number[]} step */
const compose = (order, step) => Object.freeze(step.map(slot => order[slot]));
/** @param {readonly number[]} order */
const inverse = order => {
    /** @type {number[]} */
    const result = [];
    order.forEach((layer, slot) => {result[layer] = slot;});
    return Object.freeze(result);
};

// A document rearranged by `step`: every layer moves with its keys, name,
// colour and settings, and every reference to it follows.
/** @param {import("./types.js").PortableDocument} document @param {readonly number[]} step */
function rearranged(document, step) {
    const names = validateSnapshot(document).settings.names;
    return reorderLayers(document, [...step], step.map(slot => names[slot]), {keysFollow: true});
}

module.exports = {compose, inverse, isIdentity, rearranged};
