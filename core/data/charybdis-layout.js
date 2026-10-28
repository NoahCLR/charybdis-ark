// @ts-check
"use strict";

const LAYERS = 16, MATRIX_ROWS = 10, MATRIX_COLUMNS = 6;
const MATRIX_KEYS = MATRIX_ROWS * MATRIX_COLUMNS;

// A set of layers is a mask, bit n for layer n; ALL_LAYERS is the whole bank.
const ALL_LAYERS = 2 ** LAYERS - 1;
// Every layer in its own slot: the order no reorder has changed.
const LAYER_IDENTITY = Object.freeze(Array.from({length: LAYERS}, (_, layer) => layer));
/** @param {number} mask */
const layersOfMask = mask => LAYER_IDENTITY.filter(layer => mask & (1 << layer));
/** @param {number} layer */
const layersAbove = layer => (ALL_LAYERS << (layer + 1)) & ALL_LAYERS;

// The Charybdis 4x6 key layout: inert data every layer may read.
//
// QMK keyboard.json -> layouts.LAYOUT.layout, in the same order as the
// authored LAYOUT(...) arguments. Keeping this contract beside the wire codec
// makes it impossible to confuse visual order with matrix row/column order.
const CHARYBDIS_4X6_LAYOUT_MATRIX = Object.freeze([
    [0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [0, 5],
    [5, 5], [5, 4], [5, 3], [5, 2], [5, 1], [5, 0],
    [1, 0], [1, 1], [1, 2], [1, 3], [1, 4], [1, 5],
    [6, 5], [6, 4], [6, 3], [6, 2], [6, 1], [6, 0],
    [2, 0], [2, 1], [2, 2], [2, 3], [2, 4], [2, 5],
    [7, 5], [7, 4], [7, 3], [7, 2], [7, 1], [7, 0],
    [3, 0], [3, 1], [3, 2], [3, 3], [3, 4], [3, 5],
    [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0],
    [4, 3], [4, 4], [4, 1], [9, 1], [9, 3], [4, 5], [4, 2], [9, 5],
].map((position) => Object.freeze(position)));

// Visible layout order and stored matrix order differ on the right half and
// thumbs. Callers name a visible key by its layout index, then read this slot.
/** @param {number} layoutIndex */
function matrixPosition(layoutIndex) {
    const [row, column] = CHARYBDIS_4X6_LAYOUT_MATRIX[layoutIndex];
    return row * MATRIX_COLUMNS + column;
}

module.exports = {CHARYBDIS_4X6_LAYOUT_MATRIX, LAYERS, ALL_LAYERS, LAYER_IDENTITY, MATRIX_ROWS, MATRIX_COLUMNS, MATRIX_KEYS, layersAbove, layersOfMask, matrixPosition};
