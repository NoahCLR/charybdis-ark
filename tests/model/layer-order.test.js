"use strict";
const {profileLayers} = require("../fixtures/profile-document");
const test = require("node:test"), assert = require("node:assert/strict");
const {compose, inverse, isIdentity, rearranged} = require("../../core/model/layer-order");
const {LAYER_IDENTITY} = require("../../core/data/charybdis-layout");
const {fingerprint, summary} = require("../../core/model/portable-profile");
const {document} = require("../fixtures/portable-profile");

const SWAP = [0, 1, 3, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

test("orders compose step by step, and an order and its inverse cancel", () => {
    assert.deepEqual(compose(LAYER_IDENTITY, SWAP), SWAP);
    assert.ok(isIdentity(compose(SWAP, SWAP)), "swapping back is the keyboard's order");
    const moved = compose(SWAP, [0, 2, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    assert.deepEqual(moved, [0, 3, 1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], "slot 1 now holds the keyboard's layer 3");
    assert.ok(isIdentity(compose(moved, inverse(moved))));
});

test("a rearranged document moves each layer with its name, and moving it back restores it", () => {
    const value = document(), moved = rearranged(value, SWAP);
    assert.deepEqual(summary(moved).names.slice(2, 4), ["Navigation", "Symbols"]);
    assert.equal(fingerprint(rearranged(moved, inverse(SWAP))), fingerprint(value));
    const renumbered = rearranged(value, [0, 2, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    assert.notEqual(profileLayers(renumbered)[0][0], profileLayers(value)[0][0], "a key reaching a moved layer follows it");
});
