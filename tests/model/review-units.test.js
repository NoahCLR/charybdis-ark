"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const {UNIT, ORDER_UNITS, parseUnit, unitByIdentity} = require("../../core/model/review-units");
const {layerOrderReview, profileReview, slotOrderReview} = require("../../core/model/profile-review");
const {IDENTITY, compose} = require("../../core/model/draft-order");
const {swapStep} = require("../../core/model/slot-order");
const {customKeyCode} = require("../../core/data/user-keycodes");
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
    assert.deepEqual([...kinds].sort(), ["autocorrect", "behavior", "combo", "comboTiming", "customKey", "keyboardName", "layerName", "layout", "macro", "pd", "placement",
        "rgb:automouse", "rgb:combo", "rgb:groups", "rgb:key", "rgb:layer", "rgb:pd", "rgb:stages", "settings"], "the draft edits every area");
    assert.deepEqual(parseUnit(layerOrderReview(current, SWAP).unit), {kind: "layerOrder"});
    for (const bank of /** @type {const} */ (["macros", "customKeys", "pdModes"])) {
        assert.deepEqual(parseUnit(slotOrderReview(current, bank, swapStep(bank, 1, 2)).unit), {kind: ORDER_UNITS[bank]}, bank);
    }
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
        [UNIT.autocorrect("a lot"), {kind: "autocorrect", correction: "a lot"}],
        [UNIT.autocorrect("the", "The: one"), {kind: "autocorrect", correction: "the", respelled: "The: one"}],
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
        [UNIT.macroOrder, {kind: "macroOrder"}],
        [UNIT.customKeyOrder, {kind: "customKeyOrder"}],
        [UNIT.pdOrder, {kind: "pdOrder"}],
    ];
    for (const [unit, read] of units) {
        assert.deepEqual(parseUnit(unit), read, unit);
    }
    // The strings the panel already reads keep their bytes.
    assert.deepEqual(units.map(([unit]) => unit), ["layout:2:5", "placement:2:5", "layerName:3", 'behavior:{"kind":1,"flags":0,"operand":41}', "combo:7", "comboTiming",
        "macro:2", 'autocorrect:["a lot"]', 'autocorrect:["the","The: one"]', "customKey:9", "keyboardName", "settings:host", "settings:otherKeyOptions", "pd:4", "rgb:groups", "rgb:layer:2", "rgb:pd:1", "profile", "layerOrder",
        "macroOrder", "customKeyOrder", "pdOrder"]);
});

test("a string review never writes is no unit", () => {
    for (const text of ["mystery:1", "mystery", "layout:1", "layout:01:2", "layout:1:2:3", "layout:a:2", "combo:-1", "settings:", "rgb:layer", "rgb:layers",
        "rgb:groups:1", "autocorrect:{}", "autocorrect:[]", "autocorrect:[1]", 'autocorrect:["a","b","c"]', 'autocorrect:[ "a"]', "behavior:{", "behavior:[1]", 'behavior:{ "kind":1}', "layerOrder:1", ""]) {
        assert.equal(parseUnit(text), null, text);
    }
});

test("units that belong to a layer are named by the layer, not the slot", () => {
    const order = compose(IDENTITY, {layers: SWAP});
    assert.equal(unitByIdentity("layout:2:5", order), "layout:3:5");
    assert.equal(unitByIdentity("placement:3:5", order), "placement:2:5");
    assert.equal(unitByIdentity("layerName:3", order), "layerName:2");
    assert.equal(unitByIdentity("rgb:layer:2", order), "rgb:layer:3");
    assert.equal(unitByIdentity("macro:2", order), "macro:2", "other units have no layer");
    assert.equal(unitByIdentity("rgb:pd:2", order), "rgb:pd:2");
    assert.equal(unitByIdentity("mystery:2", order), "mystery:2");
});

test("units that belong to a macro, a custom key or a pointing mode are named by what the slot holds (D-L81)", () => {
    const order = compose(IDENTITY, {macros: swapStep("macros", 2, 7), customKeys: swapStep("customKeys", 9, 1), pdModes: swapStep("pdModes", 4, 0)});
    assert.equal(unitByIdentity("macro:2", order), "macro:7");
    assert.equal(unitByIdentity("macro:7", order), "macro:2");
    assert.equal(unitByIdentity("macro:3", order), "macro:3");
    assert.equal(unitByIdentity("customKey:9", order), "customKey:1");
    assert.equal(unitByIdentity("pd:4", order), "pd:0");
    assert.equal(unitByIdentity("rgb:pd:0", order), "rgb:pd:4", "a pointing mode's colour follows the mode");
    assert.equal(unitByIdentity("layout:2:5", order), "layout:2:5", "the layers stayed");
    // A behaviour is named by the key it listens to: a custom key by its own
    // kind, and by its keycode when a layout key stores it that way.
    assert.equal(unitByIdentity(UNIT.behavior({kind: 7, flags: 0, operand: 9}), order), UNIT.behavior({kind: 7, flags: 0, operand: 1}));
    assert.equal(unitByIdentity(UNIT.behavior({kind: 1, flags: 0, operand: customKeyCode(1)}), order), UNIT.behavior({kind: 1, flags: 0, operand: customKeyCode(9)}));
    assert.equal(unitByIdentity(UNIT.behavior({kind: 6, flags: 0, operand: 7}), order), UNIT.behavior({kind: 6, flags: 0, operand: 2}), "a behaviour on a macro key");
    assert.equal(unitByIdentity(UNIT.behavior({kind: 4, flags: 0, operand: 0}), order), UNIT.behavior({kind: 4, flags: 0, operand: 4}), "a behaviour on a pointing key");
    assert.equal(unitByIdentity(UNIT.behavior({kind: 1, flags: 0, operand: 41}), order), UNIT.behavior({kind: 1, flags: 0, operand: 41}), "an ordinary key");
    assert.deepEqual(ORDER_UNITS, {layers: "layerOrder", macros: "macroOrder", customKeys: "customKeyOrder", pdModes: "pdOrder"});
});
