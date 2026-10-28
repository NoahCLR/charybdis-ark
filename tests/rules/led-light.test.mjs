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
