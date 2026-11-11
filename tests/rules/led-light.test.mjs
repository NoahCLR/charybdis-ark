import test from "node:test";
import assert from "node:assert/strict";
import {OFF, inheritsStageColour, layerPaints, ledColour, replacementPaints} from "../../rules/led-light.mjs";

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

test("a replacement flash paints last, where it reaches, then its accents: those for every case before those for its own", () => {
    const layers = [{layer: 0, colour: colour(80, 255, 255), paints: true}];
    const combo = {colour: colour(190, 255, 200), reaches: true, groups: []};
    const pointing = {colour: colour(9, 255, 255), reaches: true, groups: []};
    const flash = {colour: colour(106, 255, 200), reaches: true, every: [], own: []};
    assert.deepEqual(ledColour(stages({layers, combo, pointing, replacement: flash})), {colour: flash.colour, source: "replacement", layer: null}, "over every other stage");
    assert.equal(ledColour(stages({layers, replacement: {...flash, reaches: false}})).source, "layer", "outside its locality what is beneath shows");
    const accent = colour(20, 255, 200), narrower = colour(30, 255, 200);
    assert.deepEqual(ledColour(stages({layers, replacement: {...flash, reaches: false, every: [accent]}})).colour, accent, "its accent paints wherever it names");
    assert.deepEqual(ledColour(stages({layers, replacement: {...flash, reaches: false, every: [colour(0, 0, 0)]}})).colour, flash.colour, "a black accent takes the case's colour");
    assert.deepEqual(ledColour(stages({layers, replacement: {...flash, every: [accent], own: [narrower]}})).colour, narrower, "an accent naming the case repaints one for every case");
    assert.deepEqual(ledColour(stages({layers, replacement: {...flash, every: [accent, narrower], own: []}})).colour, narrower, "accents keep their stored order");
    assert.equal(ledColour(stages({layers, replacement: null})).source, "layer");
    assert.deepEqual(ledColour(stages({off: true, layers, replacement: flash})), {colour: OFF, source: "off"});
});

test("a replacement case whose colour has no saturation or value does not flash, nor do its black accents; a coloured accent still lights", () => {
    assert.equal(replacementPaints(colour(0, 0, 0)), false);
    assert.equal(replacementPaints(colour(77, 0, 0)), false, "at any hue");
    assert.equal(replacementPaints(colour(0, 255, 0)), true, "brightness alone at zero flashes black");
    assert.equal(replacementPaints(colour(0, 0, 1)), true);
    const layers = [{layer: 0, colour: colour(80, 255, 255), paints: true}];
    const dark = {colour: colour(77, 0, 0), reaches: true, every: [], own: []};
    assert.equal(ledColour(stages({layers, replacement: dark})).source, "layer", "the case paints nothing");
    assert.equal(ledColour(stages({layers, replacement: {...dark, every: [colour(0, 0, 0)], own: [colour(0, 0, 0)]}})).source, "layer", "a black accent of it paints nothing");
    const accent = colour(20, 255, 200);
    assert.deepEqual(ledColour(stages({layers, replacement: {...dark, own: [accent]}})), {colour: accent, source: "replacement", layer: null});
    const black = {colour: colour(0, 255, 0), reaches: true, every: [], own: []};
    assert.deepEqual(ledColour(stages({layers, replacement: black})).colour, black.colour, "black is painted");
});
