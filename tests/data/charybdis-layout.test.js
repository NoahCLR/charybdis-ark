"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const {CHARYBDIS_4X6_LAYOUT_MATRIX, LAYERS, MATRIX_ROWS, MATRIX_COLUMNS, MATRIX_KEYS, matrixPosition} = require("../../core/data/charybdis-layout");
const protocol = require("../../core/protocol/via-layout-v1");

test("the layout names 56 distinct matrix positions, and the wire codec uses the same table", () => {
    assert.equal(CHARYBDIS_4X6_LAYOUT_MATRIX.length, 56);
    assert.equal(new Set(CHARYBDIS_4X6_LAYOUT_MATRIX.map(([row, column]) => row * 6 + column)).size, 56);
    assert.ok(CHARYBDIS_4X6_LAYOUT_MATRIX.every(([row, column]) => row >= 0 && row < 10 && column >= 0 && column < 6));
    assert.equal(protocol.CHARYBDIS_4X6_LAYOUT_MATRIX, CHARYBDIS_4X6_LAYOUT_MATRIX);
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
