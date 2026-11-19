"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const {BANKS, IDENTITY, compose, inverse, isIdentity, movedBanks, relative, layersOnly, slotsOnly, rearranged} = require("../../core/model/draft-order");
const {swapStep} = require("../../core/model/slot-order");
const {fingerprint, summary, validateSnapshot} = require("../../core/model/portable-profile");
const {LAYER_IDENTITY} = require("../../core/data/charybdis-layout");
const {document} = require("../fixtures/pd-profile");

const SWAP = [0, 1, 3, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

test("the identity holds every bank, and a step names only the banks it moves", () => {
    assert.deepEqual(BANKS, ["layers", "macros", "customKeys", "pdModes"]);
    assert.deepEqual(IDENTITY.layers, LAYER_IDENTITY);
    assert.ok(isIdentity(IDENTITY));
    assert.deepEqual(movedBanks(IDENTITY), []);
    const order = compose(IDENTITY, {macros: swapStep("macros", 1, 2)});
    assert.deepEqual(movedBanks(order), ["macros"]);
    assert.deepEqual([order.layers, order.customKeys, order.pdModes], [IDENTITY.layers, IDENTITY.customKeys, IDENTITY.pdModes], "the other banks stay");
    assert.ok(Object.isFrozen(order) && Object.isFrozen(order.macros));
    assert.throws(() => compose(IDENTITY, {layers: [0, 1]}), /every slot once/);
    assert.throws(() => compose(IDENTITY, {pdModes: [0, 0]}), /every slot once/);
});

test("swaps compose step by step into one order, and an order and its inverse cancel", () => {
    // Slot 1 to 2, then 2 to 3, then 2 to 1: slot 2 is back where it was, 1 and 3 traded.
    const order = [["macros", 1, 2], ["macros", 2, 3], ["macros", 2, 1]].reduce((so, [bank, a, b]) => compose(so, {[bank]: swapStep(bank, a, b)}), IDENTITY);
    assert.deepEqual(order.macros.slice(0, 5), [0, 3, 2, 1, 4], "slot 1 holds the keyboard's macro 3, slot 3 its macro 1");
    assert.ok(isIdentity(compose(order, inverse(order))));
    assert.ok(isIdentity(relative(order, order)), "nothing moves between an order and itself");
    assert.deepEqual(relative(IDENTITY, order), order, "from the keyboard's order, the step is the order");
    const mixed = compose(order, {layers: SWAP, pdModes: swapStep("pdModes", 0, 4)});
    assert.deepEqual(movedBanks(mixed), ["layers", "macros", "pdModes"]);
    assert.deepEqual(movedBanks(layersOnly(mixed)), ["layers"]);
    assert.deepEqual(movedBanks(slotsOnly(mixed)), ["macros", "pdModes"]);
    assert.deepEqual(relative(order, mixed), compose(IDENTITY, {layers: SWAP, pdModes: swapStep("pdModes", 0, 4)}), "what moved between the two");
});

test("a rearranged document moves layers and slots alike, three swaps as one, and moving it back restores it", () => {
    const value = document();
    const steps = [{macros: swapStep("macros", 1, 2)}, {macros: swapStep("macros", 2, 3)}, {macros: swapStep("macros", 2, 1)}, {pdModes: swapStep("pdModes", 1, 6)}, {layers: SWAP}];
    const oneByOne = steps.reduce((doc, step) => rearranged(doc, step), value);
    const order = steps.reduce((so, step) => compose(so, step), IDENTITY);
    assert.equal(fingerprint(rearranged(value, order)), fingerprint(oneByOne), "the composed order rearranges as the steps did one by one");
    assert.deepEqual(summary(oneByOne).names.slice(2, 4), summary(value).names.slice(2, 4).reverse(), "the layers moved");
    assert.equal(validateSnapshot(oneByOne).pdModes[6].name, validateSnapshot(value).pdModes[1].name, "and the pointing mode");
    assert.equal(fingerprint(rearranged(oneByOne, inverse(order))), fingerprint(value));
    assert.equal(rearranged(value, {}), value, "a step naming nothing is the document itself");
});
