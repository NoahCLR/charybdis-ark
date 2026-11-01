import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {behaviourRuns, comboJoins, participationAt, thisKeyOnThisLayer} from "../../webview/view/participation.mjs";

const require = createRequire(import.meta.url);
const {profileDocument, publishedModel} = require("../fixtures/published-model");
const {buildDeviceModel} = require("../../core/session/device-model");
const {SETTING} = require("../../core/schema/settings-domain-v1");
const {ALL_LAYERS, matrixPosition} = require("../../core/data/charybdis-layout");

// What core publishes for a profile whose switches are these: behaviours and
// combos off on Symbol (layer 2) unless named, and the keys whose Use
// behaviour (`bypass`) or Join combos (`exclude`) is off, by layer, by layout
// index. Only Symbol and Game (layer 15) are named.
/** @param {{behaviorsEnabled?: boolean, combosEnabled?: boolean, behaviorLayers?: number, comboLayers?: number, bypass?: Record<number, number[]>, exclude?: Record<number, number[]>}} [switches] */
const modelWith = ({behaviorsEnabled = true, combosEnabled = true, behaviorLayers = ALL_LAYERS ^ 4, comboLayers = ALL_LAYERS ^ 4, bypass = {}, exclude = {}} = {}) => publishedModel(profileDocument({
    combos: [{inputs: ["KC_A", "KC_B"], output: "KC_C"}],
    settings: (settings) => {
        settings.names = settings.names.map((_, layer) => layer === 2 ? "Symbol" : layer === 15 ? "Game" : "");
        settings.values[SETTING.BEHAVIORS_ENABLED] = behaviorsEnabled ? 1 : 0;
        settings.values[SETTING.COMBOS_ENABLED] = combosEnabled ? 1 : 0;
        settings.values[SETTING.LAYER_BEHAVIORS] = behaviorLayers;
        settings.values[SETTING.LAYER_COMBOS] = comboLayers;
        for (const [layer, keys] of Object.entries(bypass)) settings.layers[Number(layer)].bypass = keys.map(matrixPosition);
        for (const [layer, keys] of Object.entries(exclude)) settings.layers[Number(layer)].exclude = keys.map(matrixPosition);
    },
}));
const model = modelWith();
const layers = model.layers;
// A published combo stands for either definition: its own switch and layers.
const definition = model.combos[0];
const position = {layoutIndex: 0};
// A keyboard whose settings are not read publishes no participation.
const unreported = buildDeviceModel({});
test("a keyboard with no settings read publishes no participation", () => {
    assert.equal(unreported.participation, null);
    assert.ok(model.participation, "one with settings does");
});

test("policy uses the supplied source layer and every applicable off scope explains its veto", () => {
    assert.equal(participationAt(model, 1, position, definition).enabled, true);
    assert.deepEqual(participationAt(model, 2, position, definition).reasons, ["Behaviour settings has behaviours off on this layer (Symbol)"]);
    const disabled = modelWith({behaviorsEnabled: false, bypass: {15: [0]}});
    assert.deepEqual(participationAt(disabled, 15, position, {...definition, enabled: false, allowedLayers: 1}).reasons,
        ["behaviours are off in Behaviour settings", "Use this behaviour is off", "Layers it runs on leaves out this layer (Game)", "Use behaviour is off for this key on this layer (Game)"]);
    assert.equal(participationAt(disabled, 15, position, definition, "combo").enabled, true, "behaviour bypass and combo exclusion are independent");
    const excludedToo = modelWith({behaviorsEnabled: false, bypass: {15: [0]}, exclude: {15: [0]}});
    assert.deepEqual(participationAt(excludedToo, 15, position, definition, "combo").reasons, ["Join combos is off for this key on this layer (Game)"]);
});

test("a behaviour row runs only where the switches, its definition and the placement let it", () => {
    const at = {layoutIndex: 28};
    const row = definition;
    assert.deepEqual(behaviourRuns(model, 0, at, null), {runs: false, reasons: []}, "no row, nothing to run");
    assert.deepEqual(behaviourRuns(model, 0, at, row), {runs: true, reasons: []});
    assert.equal(behaviourRuns(model, 2, at, row).runs, false, "behaviours switched off on the source layer");
    assert.deepEqual(behaviourRuns(model, 0, at, {...row, enabled: false}).reasons, ["Use this behaviour is off"]);
    assert.equal(behaviourRuns(modelWith({bypass: {0: [28]}}), 0, at, row).runs, false, "this placement bypasses its behaviour");
    assert.equal(behaviourRuns(unreported, 0, at, row).runs, true, "without reported participation the row's own switch decides");
    assert.deepEqual(behaviourRuns(unreported, 0, at, {...row, enabled: false}), {runs: false, reasons: ["Use this behaviour is off"]});
    assert.deepEqual(behaviourRuns({...unreported, layers}, 2, at, {...row, allowedLayers: 1}), {runs: false, reasons: ["Layers it runs on leaves out this layer (Symbol)"]},
        "without reported participation the row's own layers still decide");
});

test("the words for one placement name its layer", () => {
    assert.equal(thisKeyOnThisLayer(model, "Number"), "this key on this layer (Number)");
    assert.equal(thisKeyOnThisLayer(model, ""), "this key on this layer");
});

test("a key joins a combo only where every switch lets it", () => {
    const at = {layoutIndex: 28};
    const combo = definition;
    assert.deepEqual(comboJoins(model, 0, at, combo), {joins: true, reasons: []});
    assert.deepEqual(comboJoins(model, 2, at, combo).reasons, ["Combo settings has combos off on this layer (Symbol)"]);
    assert.deepEqual(comboJoins(model, 0, at, {...combo, enabled: false}).reasons, ["Use this combo is off"]);
    assert.deepEqual(comboJoins(model, 1, at, {...combo, allowedLayers: 1}).reasons, ["Layers it runs on leaves out this layer (Layer 1)"]);
    assert.deepEqual(comboJoins(modelWith({combosEnabled: false}), 0, at, combo).reasons, ["combos are off in Combo settings"]);
    const excluded = modelWith({exclude: {0: [28]}});
    assert.deepEqual(comboJoins(excluded, 0, at, combo).reasons, ["Join combos is off for this key on this layer (Base)"]);
    assert.equal(comboJoins(excluded, 1, at, combo).joins, true, "an exclusion belongs to one layer");
    assert.equal(comboJoins(modelWith({bypass: {0: [28]}}), 0, at, combo).joins, true, "a behaviour bypass leaves combos alone");
    assert.deepEqual(comboJoins(unreported, 0, at, combo), {joins: true, reasons: []}, "without reported participation the combo's own switch decides");
    assert.deepEqual(comboJoins(unreported, 0, at, {...combo, enabled: false}), {joins: false, reasons: ["Use this combo is off"]});
    assert.deepEqual(comboJoins({...unreported, layers}, 1, at, {...combo, allowedLayers: 1}), {joins: false, reasons: ["Layers it runs on leaves out this layer (Layer 1)"]},
        "without reported participation the combo's own layers still decide");
});
