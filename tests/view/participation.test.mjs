import test from "node:test";
import assert from "node:assert/strict";
import {behaviourRuns, comboJoins, participationAt, thisKeyOnThisLayer} from "../../webview/view/participation.mjs";
const model = {participation: {behaviorsEnabled: true, combosEnabled: true, behaviorLayers: 65535 ^ 4, comboLayers: 65535 ^ 4,
    layers: Array.from({length: 16}, () => ({bypass: [], exclude: []}))},
    layers: Array.from({length: 16}, (_, index) => ({index, name: `Layer ${index}`, ...(index === 2 ? {displayName: "Symbol"} : index === 15 ? {displayName: "Game"} : {})}))};
const position = {row: 0, column: 0}, definition = {enabled: true, allowedLayers: 65535};
test("policy uses the supplied source layer and every applicable off scope explains its veto", () => {
    assert.equal(participationAt(model, 1, position, definition).enabled, true);
    assert.deepEqual(participationAt(model, 2, position, definition).reasons, ["Settings has behaviours off on this layer (Symbol)"]);
    const disabled = structuredClone(model); disabled.participation.behaviorsEnabled = false; disabled.participation.layers[15].bypass = [0];
    assert.deepEqual(participationAt(disabled, 15, position, {enabled: false, allowedLayers: 1}).reasons,
        ["behaviours are off in Settings", "Use this behaviour is off", "Layers it runs on leaves out this layer (Game)", "Use behaviour is off for this key on this layer (Game)"]);
    assert.equal(participationAt(disabled, 15, position, definition, "combo").enabled, true, "behaviour bypass and combo exclusion are independent");
    disabled.participation.layers[15].exclude = [0];
    assert.deepEqual(participationAt(disabled, 15, position, definition, "combo").reasons, ["Join combos is off for this key on this layer (Game)"]);
});

test("a behaviour row runs only where the switches, its definition and the placement let it", () => {
    const at = {row: 2, column: 4};
    const row = {enabled: true, allowedLayers: 65535};
    assert.deepEqual(behaviourRuns(model, 0, at, null), {runs: false, reasons: []}, "no row, nothing to run");
    assert.deepEqual(behaviourRuns(model, 0, at, row), {runs: true, reasons: []});
    assert.equal(behaviourRuns(model, 2, at, row).runs, false, "behaviours switched off on the source layer");
    assert.deepEqual(behaviourRuns(model, 0, at, {...row, enabled: false}).reasons, ["Use this behaviour is off"]);
    const bypassed = {participation: {...model.participation, layers: model.participation.layers.map((layer, index) => index ? layer : {...layer, bypass: [16]})}};
    assert.equal(behaviourRuns(bypassed, 0, at, row).runs, false, "this placement bypasses its behaviour");
    assert.equal(behaviourRuns({}, 0, at, row).runs, true, "without reported participation the row's own switch decides");
    assert.deepEqual(behaviourRuns({}, 0, at, {...row, enabled: false}), {runs: false, reasons: ["Use this behaviour is off"]});
    assert.deepEqual(behaviourRuns({layers: model.layers}, 2, at, {...row, allowedLayers: 1}), {runs: false, reasons: ["Layers it runs on leaves out this layer (Symbol)"]},
        "without reported participation the row's own layers still decide");
});

test("the words for one placement name its layer", () => {
    assert.equal(thisKeyOnThisLayer("Number"), "this key on this layer (Number)");
    assert.equal(thisKeyOnThisLayer(""), "this key on this layer");
});

test("a key joins a combo only where every switch lets it", () => {
    const at = {row: 2, column: 4};
    const combo = {enabled: true, allowedLayers: 65535};
    assert.deepEqual(comboJoins(model, 0, at, combo), {joins: true, reasons: []});
    assert.deepEqual(comboJoins(model, 2, at, combo).reasons, ["Settings has combos off on this layer (Symbol)"]);
    assert.deepEqual(comboJoins(model, 0, at, {...combo, enabled: false}).reasons, ["Use this combo is off"]);
    assert.deepEqual(comboJoins(model, 1, at, {...combo, allowedLayers: 1}).reasons, ["Layers it runs on leaves out this layer (Layer 1)"]);
    const off = structuredClone(model); off.participation.combosEnabled = false;
    assert.deepEqual(comboJoins(off, 0, at, combo).reasons, ["combos are off in Settings"]);
    const excluded = structuredClone(model); excluded.participation.layers[0].exclude = [16];
    assert.deepEqual(comboJoins(excluded, 0, at, combo).reasons, ["Join combos is off for this key on this layer (Layer 0)"]);
    assert.equal(comboJoins(excluded, 1, at, combo).joins, true, "an exclusion belongs to one layer");
    const bypassed = structuredClone(model); bypassed.participation.layers[0].bypass = [16];
    assert.equal(comboJoins(bypassed, 0, at, combo).joins, true, "a behaviour bypass leaves combos alone");
    assert.deepEqual(comboJoins({}, 0, at, combo), {joins: true, reasons: []}, "without reported participation the combo's own switch decides");
    assert.deepEqual(comboJoins({}, 0, at, {...combo, enabled: false}), {joins: false, reasons: ["Use this combo is off"]});
    assert.deepEqual(comboJoins({layers: model.layers}, 1, at, {...combo, allowedLayers: 1}), {joins: false, reasons: ["Layers it runs on leaves out this layer (Layer 1)"]},
        "without reported participation the combo's own layers still decide");
});
