import test from "node:test";
import assert from "node:assert/strict";
import {keyHandling, participationAt} from "../../webview/view/participation.mjs";
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

test("a key is handled by the keyboard only while its behaviour row runs there; otherwise by QMK", () => {
    const at = {row: 2, column: 4};
    const row = {enabled: true, allowedLayers: 65535};
    assert.deepEqual(keyHandling(model, 0, at, null), {by: "qmk", reasons: []}, "no row: QMK, as the firmware leaves it");
    assert.deepEqual(keyHandling(model, 0, at, row), {by: "keyboard", reasons: []}, "a row, even one with no branches, hands it to the keyboard");
    assert.equal(keyHandling(model, 2, at, row).by, "qmk", "behaviours switched off on the source layer");
    assert.deepEqual(keyHandling(model, 0, at, {...row, enabled: false}).reasons, ["definition is disabled"]);
    const bypassed = {participation: {...model.participation, layers: model.participation.layers.map((layer, index) => index ? layer : {...layer, bypass: [16]})}};
    assert.equal(keyHandling(bypassed, 0, at, row).by, "qmk", "this placement bypasses its behaviour");
    assert.equal(keyHandling({}, 0, at, row).by, "keyboard", "without reported participation a row alone decides");
});
