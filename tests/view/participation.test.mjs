import test from "node:test";
import assert from "node:assert/strict";
import {behaviourRuns, participationAt} from "../../webview/view/participation.mjs";
const model = {participation: {behaviorsEnabled: true, combosEnabled: true, behaviorLayers: 65535 ^ 4, comboLayers: 65535 ^ 4,
    layers: Array.from({length: 16}, () => ({bypass: [], exclude: []}))}};
const position = {row: 0, column: 0}, definition = {enabled: true, allowedLayers: 65535};
test("policy uses the supplied source layer and every applicable off scope explains its veto", () => {
    assert.equal(participationAt(model, 1, position, definition).enabled, true);
    assert.deepEqual(participationAt(model, 2, position, definition).reasons, ["Settings has behaviours off on this layer"]);
    const disabled = structuredClone(model); disabled.participation.behaviorsEnabled = false; disabled.participation.layers[15].bypass = [0];
    assert.deepEqual(participationAt(disabled, 15, position, {enabled: false, allowedLayers: 1}).reasons,
        ["behaviours are off in Settings", "Use this behaviour is off", "this layer is not one it runs on", "this key's Use behaviour is off"]);
    assert.equal(participationAt(disabled, 15, position, definition, "combo").enabled, true, "behaviour bypass and combo exclusion are independent");
    disabled.participation.layers[15].exclude = [0];
    assert.deepEqual(participationAt(disabled, 15, position, definition, "combo").reasons, ["this key's Join combos is off"]);
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
});
