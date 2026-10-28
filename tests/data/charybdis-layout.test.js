"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const {ALL_LAYERS, CHARYBDIS_4X6_LAYOUT_MATRIX, KEY_LEDS, LAYERS, LAYER_IDENTITY, MATRIX_ROWS, MATRIX_COLUMNS, MATRIX_KEYS, TRACKBALL_LED, layersAbove, layersOfMask, matrixPosition} = require("../../core/data/charybdis-layout");
const {decodeKeymapDomain, encodeKeymapDomain} = require("../../core/schema/keymap-domain-v1");

test("the layout names 56 distinct matrix positions, and the wire codec uses the same table", () => {
    assert.equal(CHARYBDIS_4X6_LAYOUT_MATRIX.length, 56);
    assert.equal(new Set(CHARYBDIS_4X6_LAYOUT_MATRIX.map(([row, column]) => row * 6 + column)).size, 56);
    assert.ok(CHARYBDIS_4X6_LAYOUT_MATRIX.every(([row, column]) => row >= 0 && row < 10 && column >= 0 && column < 6));
    const layers = Array.from({length: LAYERS}, () => Array.from({length: MATRIX_KEYS}, (_, slot) => slot));
    assert.deepEqual(decodeKeymapDomain(encodeKeymapDomain(layers)), layers);
});

test("visible layout indexes resolve to the stored matrix geometry", () => {
    assert.deepEqual([LAYERS, MATRIX_ROWS, MATRIX_COLUMNS, MATRIX_KEYS], [16, 10, 6, 60]);
    assert.equal(matrixPosition(0), 0);
    assert.equal(matrixPosition(6), 35, "the first right key is row five's outer column");
    assert.equal(matrixPosition(50), 25, "the left thumb follows its authored order");
    assert.equal(matrixPosition(55), 59);
    const slots = CHARYBDIS_4X6_LAYOUT_MATRIX.map((position, index) => matrixPosition(index));
    assert.equal(new Set(slots).size, 56);
    assert.deepEqual(Array.from({length: MATRIX_KEYS}, (_, slot) => slot).filter(slot => !slots.includes(slot)), [24, 54, 56, 58]);
});

test("a set of layers is a mask over the sixteen-layer bank", () => {
    assert.equal(ALL_LAYERS, 0xffff);
    assert.deepEqual(LAYER_IDENTITY, Array.from({length: 16}, (_, layer) => layer));
    assert.ok(Object.isFrozen(LAYER_IDENTITY));
    assert.deepEqual(layersOfMask(0b1000_0000_0010_0101), [0, 2, 5, 15]);
    assert.deepEqual(layersOfMask(0x1_0000), [], "a bit past the bank names no layer");
    assert.deepEqual(layersOfMask(ALL_LAYERS), LAYER_IDENTITY);
    assert.equal(layersAbove(0), 0xfffe);
    assert.equal(layersAbove(14), 0x8000);
    assert.equal(layersAbove(15), 0, "nothing sits above the top layer");
});

test("every key carries an LED of its own, and the trackball the next one", () => {
    const {RGB_DOMAIN_V1} = require("../../core/schema/rgb-domain-v1");
    assert.equal(KEY_LEDS.length, CHARYBDIS_4X6_LAYOUT_MATRIX.length);
    assert.ok(Object.isFrozen(KEY_LEDS));
    assert.deepEqual([...KEY_LEDS, TRACKBALL_LED].sort((a, b) => a - b), Array.from({length: KEY_LEDS.length + 1}, (_, led) => led));
    assert.ok(TRACKBALL_LED < RGB_DOMAIN_V1.PHYSICAL_LED_COUNT, "a lighting group may name every one");
    assert.deepEqual([KEY_LEDS[0], KEY_LEDS[6], KEY_LEDS[48], KEY_LEDS[51]], [0, 49, 26, 53], "the left half's columns, its thumbs, then the right half's");
});
