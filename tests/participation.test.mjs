import test from "node:test";
import assert from "node:assert/strict";
import {participationAt} from "../webview/view/participation.mjs";
const model = {participation: {behaviorsEnabled: true, combosEnabled: true, behaviorLayers: 65535 ^ 4, comboLayers: 65535 ^ 4,
    layers: Array.from({length: 16}, () => ({bypass: [], exclude: []}))}};
const position = {row: 0, column: 0}, definition = {enabled: true, allowedLayers: 65535};
test("policy uses the supplied source layer and every applicable off scope explains its veto", () => {
    assert.equal(participationAt(model, 1, position, definition).enabled, true);
    assert.deepEqual(participationAt(model, 2, position, definition).reasons, ["source layer switch is off"]);
    const disabled = structuredClone(model); disabled.participation.behaviorsEnabled = false; disabled.participation.layers[15].bypass = [0];
    assert.deepEqual(participationAt(disabled, 15, position, {enabled: false, allowedLayers: 1}).reasons,
        ["master switch is off", "definition is disabled", "definition does not allow the source layer", "this placement bypasses its behaviour"]);
    assert.equal(participationAt(disabled, 15, position, definition, "combo").enabled, true, "behaviour bypass and combo exclusion are independent");
    disabled.participation.layers[15].exclude = [0];
    assert.deepEqual(participationAt(disabled, 15, position, definition, "combo").reasons, ["this placement is excluded from combos"]);
});
