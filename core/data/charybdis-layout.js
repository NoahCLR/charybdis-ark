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

// The LED each key carries, by layout index, and the trackball's. The
// keyboard numbers the left half's columns, its thumb keys, then the right
// half's columns and thumb keys; a lighting group names LEDs by these numbers.
const KEY_LEDS = Object.freeze([
    0, 7, 8, 15, 16, 20, 49, 45, 44, 37, 36, 29,
    1, 6, 9, 14, 17, 21, 50, 46, 43, 38, 35, 30,
    2, 5, 10, 13, 18, 22, 51, 47, 42, 39, 34, 31,
    3, 4, 11, 12, 19, 23, 52, 48, 41, 40, 33, 32,
    26, 27, 28, 53, 54, 25, 24, 55,
]);
const TRACKBALL_LED = 56;

module.exports = {CHARYBDIS_4X6_LAYOUT_MATRIX, KEY_LEDS, LAYERS, ALL_LAYERS, LAYER_IDENTITY, MATRIX_ROWS, MATRIX_COLUMNS, MATRIX_KEYS, TRACKBALL_LED, layersAbove, layersOfMask, matrixPosition};
