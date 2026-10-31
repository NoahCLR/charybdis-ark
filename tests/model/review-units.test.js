"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const {UNIT, parseUnit, unitByLayer} = require("../../core/model/review-units");
const {layerOrderReview, profileReview} = require("../../core/model/profile-review");
const {revertUnits} = require("../../core/model/profile-revert");
const {capabilities, editedDraft} = require("../fixtures/edited-draft");

const SWAP = [0, 1, 3, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

test("every unit the review names reads back as itself, and Discard takes it", () => {
    const draft = editedDraft(), base = draft.base, current = draft.current;
    const units = [...new Set(profileReview(base, current).map((row) => row.unit))];
    const kinds = new Set();
    for (const unit of units) {
        const read = parseUnit(unit);
        assert.ok(read, unit);
        kinds.add(read.kind === "rgb" ? `rgb:${read.record}` : read.kind);
        assert.doesNotThrow(() => revertUnits(base, current, new Set([unit]), capabilities), unit);
    }
    assert.deepEqual([...kinds].sort(), ["behavior", "combo", "comboTiming", "customKey", "keyboardName", "layerName", "layout", "macro", "pd", "placement",
        "rgb:automouse", "rgb:combo", "rgb:groups", "rgb:key", "rgb:layer", "rgb:pd", "rgb:stages", "settings"], "the draft edits every area");
    assert.deepEqual(parseUnit(layerOrderReview(current, SWAP).unit), {kind: "layerOrder"});
});

test("each builder writes a unit that reads back as what it names", () => {
    const target = {kind: 1, flags: 0, operand: 41};
    const units = [
        [UNIT.layout(2, 5), {kind: "layout", layer: 2, position: 5}],
        [UNIT.placement(2, 5), {kind: "placement", layer: 2, position: 5}],
        [UNIT.layerName(3), {kind: "layerName", layer: 3}],
        [UNIT.behavior(target), {kind: "behavior", target}],
        [UNIT.combo(7), {kind: "combo", index: 7}],
        [UNIT.comboTiming, {kind: "comboTiming"}],
        [UNIT.macro(2), {kind: "macro", index: 2}],
        [UNIT.customKey(9), {kind: "customKey", index: 9}],
        [UNIT.keyboardName, {kind: "keyboardName"}],
        [UNIT.settings("host"), {kind: "settings", section: "host"}],
        [UNIT.settings("otherKeyOptions"), {kind: "settings", section: "otherKeyOptions"}],
        [UNIT.pd(4), {kind: "pd", slot: 4}],
        [UNIT.rgb("groups"), {kind: "rgb", record: "groups"}],
        [UNIT.rgbLayer(2), {kind: "rgb", record: "layer", layer: 2}],
        [UNIT.rgbPd(1), {kind: "rgb", record: "pd", slot: 1}],
        [UNIT.profile, {kind: "profile"}],
        [UNIT.layerOrder, {kind: "layerOrder"}],
    ];
    for (const [unit, read] of units) {
        assert.deepEqual(parseUnit(unit), read, unit);
    }
    // The strings the panel already reads keep their bytes.
    assert.deepEqual(units.map(([unit]) => unit), ["layout:2:5", "placement:2:5", "layerName:3", 'behavior:{"kind":1,"flags":0,"operand":41}', "combo:7", "comboTiming",
        "macro:2", "customKey:9", "keyboardName", "settings:host", "settings:otherKeyOptions", "pd:4", "rgb:groups", "rgb:layer:2", "rgb:pd:1", "profile", "layerOrder"]);
});

test("a string review never writes is no unit", () => {
    for (const text of ["mystery:1", "mystery", "layout:1", "layout:01:2", "layout:1:2:3", "layout:a:2", "combo:-1", "settings:", "rgb:layer", "rgb:layers",
        "rgb:groups:1", "behavior:{", "behavior:[1]", 'behavior:{ "kind":1}', "layerOrder:1", ""]) {
        assert.equal(parseUnit(text), null, text);
    }
});

test("units that belong to a layer are named by the layer, not the slot", () => {
    assert.equal(unitByLayer("layout:2:5", SWAP), "layout:3:5");
    assert.equal(unitByLayer("placement:3:5", SWAP), "placement:2:5");
    assert.equal(unitByLayer("layerName:3", SWAP), "layerName:2");
    assert.equal(unitByLayer("rgb:layer:2", SWAP), "rgb:layer:3");
    assert.equal(unitByLayer("macro:2", SWAP), "macro:2", "other units have no layer");
    assert.equal(unitByLayer("rgb:pd:2", SWAP), "rgb:pd:2");
    assert.equal(unitByLayer("mystery:2", SWAP), "mystery:2");
});
