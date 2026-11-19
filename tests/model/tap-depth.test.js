"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const {tapDepth} = require("../../core/model/tap-depth");

test("a row's depth is its deepest tap count with an action set", () => {
    assert.equal(tapDepth([{tapIndex: 1, tap: {kind: 1, operand: 0x35}}]), 2);
    assert.equal(tapDepth([{tapIndex: 0, longHold: {style: 0, repeatHz: 0, action: {kind: 1, operand: 4}}}]), 1, "any tier counts");
    assert.equal(tapDepth([{tapIndex: 3}]), 0, "a tap count with nothing set does not count");
    assert.equal(tapDepth([]), 0);
    assert.equal(tapDepth(undefined), 0, "a key with no row");
});
