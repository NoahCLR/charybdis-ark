import test from "node:test";
import assert from "node:assert/strict";
import {behaviourRuns, comboJoins, participationAt, thisKeyOnThisLayer} from "../../webview/view/participation.mjs";
import {VOCABULARY, publishedParticipation} from "../fixtures/participation.mjs";
const switches = {behaviorLayers: 65535 ^ 4, comboLayers: 65535 ^ 4};
const layers = Array.from({length: 16}, (_, index) => ({index, name: `Layer ${index}`, ...(index === 2 ? {displayName: "Symbol"} : index === 15 ? {displayName: "Game"} : {})}));
/** @param {Parameters<typeof publishedParticipation>[0]} [more] */
const modelWith = (more = {}) => ({participation: publishedParticipation({...switches, ...more}), vocabulary: VOCABULARY, layers});
const model = modelWith();
const position = {layoutIndex: 0}, definition = {enabled: true, allowedLayers: 65535};
test("policy uses the supplied source layer and every applicable off scope explains its veto", () => {
    assert.equal(participationAt(model, 1, position, definition).enabled, true);
    assert.deepEqual(participationAt(model, 2, position, definition).reasons, ["Settings has behaviours off on this layer (Symbol)"]);
    const disabled = modelWith({behaviorsEnabled: false, bypass: {15: [0]}});
    assert.deepEqual(participationAt(disabled, 15, position, {enabled: false, allowedLayers: 1}).reasons,
        ["behaviours are off in Settings", "Use this behaviour is off", "Layers it runs on leaves out this layer (Game)", "Use behaviour is off for this key on this layer (Game)"]);
    assert.equal(participationAt(disabled, 15, position, definition, "combo").enabled, true, "behaviour bypass and combo exclusion are independent");
    const excludedToo = modelWith({behaviorsEnabled: false, bypass: {15: [0]}, exclude: {15: [0]}});
    assert.deepEqual(participationAt(excludedToo, 15, position, definition, "combo").reasons, ["Join combos is off for this key on this layer (Game)"]);
});

test("a behaviour row runs only where the switches, its definition and the placement let it", () => {
    const at = {layoutIndex: 28};
    const row = {enabled: true, allowedLayers: 65535};
    assert.deepEqual(behaviourRuns(model, 0, at, null), {runs: false, reasons: []}, "no row, nothing to run");
    assert.deepEqual(behaviourRuns(model, 0, at, row), {runs: true, reasons: []});
    assert.equal(behaviourRuns(model, 2, at, row).runs, false, "behaviours switched off on the source layer");
    assert.deepEqual(behaviourRuns(model, 0, at, {...row, enabled: false}).reasons, ["Use this behaviour is off"]);
    assert.equal(behaviourRuns(modelWith({bypass: {0: [28]}}), 0, at, row).runs, false, "this placement bypasses its behaviour");
    const unreported = {vocabulary: VOCABULARY};
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
    const combo = {enabled: true, allowedLayers: 65535};
    assert.deepEqual(comboJoins(model, 0, at, combo), {joins: true, reasons: []});
    assert.deepEqual(comboJoins(model, 2, at, combo).reasons, ["Settings has combos off on this layer (Symbol)"]);
    assert.deepEqual(comboJoins(model, 0, at, {...combo, enabled: false}).reasons, ["Use this combo is off"]);
    assert.deepEqual(comboJoins(model, 1, at, {...combo, allowedLayers: 1}).reasons, ["Layers it runs on leaves out this layer (Layer 1)"]);
    assert.deepEqual(comboJoins(modelWith({combosEnabled: false}), 0, at, combo).reasons, ["combos are off in Settings"]);
    const excluded = modelWith({exclude: {0: [28]}});
    assert.deepEqual(comboJoins(excluded, 0, at, combo).reasons, ["Join combos is off for this key on this layer (Layer 0)"]);
    assert.equal(comboJoins(excluded, 1, at, combo).joins, true, "an exclusion belongs to one layer");
    assert.equal(comboJoins(modelWith({bypass: {0: [28]}}), 0, at, combo).joins, true, "a behaviour bypass leaves combos alone");
    const unreported = {vocabulary: VOCABULARY};
    assert.deepEqual(comboJoins(unreported, 0, at, combo), {joins: true, reasons: []}, "without reported participation the combo's own switch decides");
    assert.deepEqual(comboJoins(unreported, 0, at, {...combo, enabled: false}), {joins: false, reasons: ["Use this combo is off"]});
    assert.deepEqual(comboJoins({...unreported, layers}, 1, at, {...combo, allowedLayers: 1}), {joins: false, reasons: ["Layers it runs on leaves out this layer (Layer 1)"]},
        "without reported participation the combo's own layers still decide");
});
