import test from "node:test";
import assert from "node:assert/strict";
import {OFF, inheritsStageColour, layerPaints, ledColour} from "../../rules/led-light.mjs";

const colour = (h, s, v) => ({h: String(h), s: String(s), v: String(v)});
const stages = (more = {}) => ({off: false, base: {colour: colour(10, 20, 30), source: "base"}, layers: [], layerGroups: [], pointing: null, ...more});

test("each stage paints over the one before: background, layers lowest first, their groups, a pointing mode", () => {
    assert.deepEqual(ledColour(stages()), {colour: colour(10, 20, 30), source: "base", layer: null});
    const layers = [{layer: 0, colour: colour(1, 255, 255), paints: true}, {layer: 2, colour: colour(2, 255, 255), paints: true}];
    assert.deepEqual(ledColour(stages({layers})), {colour: colour(2, 255, 255), source: "layer", layer: 2}, "the highest layer on paints last");
    const groups = [{colour: colour(5, 255, 255), owners: [0]}];
    assert.equal(ledColour(stages({layers, layerGroups: groups})).layer, 0, "a layer's group paints after every layer's colour");
    const pointing = {colour: colour(9, 255, 255), reaches: true, groups: []};
    assert.equal(ledColour(stages({layers, pointing})).source, "pointing");
    assert.deepEqual(ledColour(stages({off: true, layers, pointing})), {colour: OFF, source: "off"});
});

test("a held combo paints over the layers where it reaches, then its groups, a black one in the combo's colour", () => {
    const layers = [{layer: 0, colour: colour(80, 255, 255), paints: true}];
    const combo = {colour: colour(190, 255, 200), reaches: true, groups: []};
    assert.deepEqual(ledColour(stages({layers, combo})), {colour: combo.colour, source: "combo", layer: null});
    assert.equal(ledColour(stages({layers, combo: {...combo, reaches: false}})).source, "layer", "outside its locality the layer shows");
    const accent = colour(20, 255, 200);
    assert.deepEqual(ledColour(stages({layers, combo: {...combo, reaches: false, groups: [accent]}})).colour, accent, "its accent paints wherever it names");
    assert.deepEqual(ledColour(stages({layers, combo: {...combo, reaches: false, groups: [colour(0, 0, 0)]}})).colour, combo.colour);
    assert.equal(ledColour(stages({layers, combo: null})).source, "layer");
});

test("a held combo whose output runs the pointing mode paints beneath it, so the mode covers it where both paint", () => {
    const layers = [{layer: 0, colour: colour(80, 255, 255), paints: true}];
    const combo = {colour: colour(190, 255, 200), reaches: true, groups: [], beneath: true};
    const pointing = {colour: colour(9, 255, 255), reaches: true, groups: []};
    assert.equal(ledColour(stages({layers, combo, pointing})).source, "pointing", "the mode paints over it");
    assert.equal(ledColour(stages({layers, combo, pointing: {...pointing, reaches: false}})).source, "combo", "outside the mode's locality the combo shows");
    assert.equal(ledColour(stages({layers, combo: {...combo, beneath: false}, pointing})).source, "combo", "any other combo paints above the mode");
});

test("a layer colour with no saturation or value paints nothing, and a black group takes its stage's colour", () => {
    assert.equal(layerPaints(colour(40, 0, 0)), false);
    assert.equal(inheritsStageColour(colour(0, 0, 0)), true);
    const layers = [{layer: 1, colour: colour(40, 0, 0), paints: true}];
    assert.equal(ledColour(stages({layers})).source, "base");
    const row = [{layer: 1, colour: colour(80, 255, 255), paints: false}];
    assert.deepEqual(ledColour(stages({layers: row, layerGroups: [{colour: colour(0, 0, 0), owners: [1]}]})).colour, colour(80, 255, 255), "inherits the layer's colour");
    assert.deepEqual(ledColour(stages({pointing: {colour: colour(9, 9, 9), reaches: false, groups: [colour(0, 0, 0)]}})).colour, colour(9, 9, 9), "a pointing group inherits the mode's");
    assert.deepEqual(ledColour(stages({pointing: {colour: colour(9, 9, 9), reaches: true, groups: []}, layers: null})).colour, colour(9, 9, 9));
});
