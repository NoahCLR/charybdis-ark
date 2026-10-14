import test from "node:test";
import assert from "node:assert/strict";
import {LED_INDEX} from "../../webview/view/geometry.mjs";
import {mirrorMap, MIRROR_LEDS, selectPaintKeys, identityValue, copyLayerCells, canPaintSubject, canCustomiseIdentity, subjectRules} from "../../webview/view/painting.mjs";
test("mirror follows physical keys and retains unmatched LEDs", () => {
    const cells = Array.from({length: 58}, (_, i) => i), mirrored = mirrorMap(cells, "left");
    assert.equal(mirrored[LED_INDEX[11]], cells[LED_INDEX[0]]);
    assert.equal(mirrored[LED_INDEX[52]], cells[LED_INDEX[49]]);
    for (const led of [25, 26, 56, 57]) assert.equal(mirrored[led], cells[led]);
    assert.ok(Object.entries(MIRROR_LEDS).every(([a, b]) => MIRROR_LEDS[b] === Number(a)));
});
test("key selection uses semantic names and returns LED positions", () => {
    const layer = {positions: [{layoutIndex: 0, keycode: "KC_A"}, {layoutIndex: 1, keycode: "QK_USER_16", semantic: "PD_SLOT_0"}, {layoutIndex: 2, keycode: "KC_TRNS"}, {layoutIndex: 3, keycode: "KC_NO"}]};
    assert.deepEqual(selectPaintKeys(layer, "pointing"), [LED_INDEX[1]]);
    assert.deepEqual(selectPaintKeys(layer, "mapped"), [LED_INDEX[0], LED_INDEX[1]]);
    assert.deepEqual(selectPaintKeys(layer, "transparent"), [LED_INDEX[2]]);
});
test("identity inheritance is field by field and zero is retained", () => {
    const model = {rgb: {lighting: {program: {palette: [{h: 0, s: 0, v: 0}], things: [{kind: 1, default: [6, 0], records: [[0, 254]]}]}}}};
    assert.deepEqual(identityValue(model, {kind: 1, id: 0}), {colour: {h: 0, s: 0, v: 0}, inherited: true, place: 0, placeInherited: false});
});
test("identity and map controls require their own advertised modules", () => {
    const m = {rgb: {lighting: {supportedThings: [3, 4], supportedFacts: [7, 8], supportedPaints: [3], supportedTargets: [7]}}};
    const subject = {kind: 4, id: 0};
    assert.equal(canCustomiseIdentity(m, subject), true);assert.equal(canPaintSubject(m, subject), false);
    m.rgb.lighting.supportedPaints = [4];m.rgb.lighting.supportedTargets = [0];
    assert.equal(canCustomiseIdentity(m, subject), false);assert.equal(canPaintSubject(m, subject), true);
    m.rgb.lighting.supportedFacts = [5];
    assert.equal(canCustomiseIdentity(m, subject), false);assert.equal(canPaintSubject(m, subject), false);
    m.rgb.lighting.supportedThings = [5];m.rgb.lighting.supportedFacts = [8];m.rgb.lighting.supportedPaints = [3, 4];m.rgb.lighting.supportedTargets = [0, 7];
    assert.equal(canCustomiseIdentity(m, {kind: 5, id: 0}), false);assert.equal(canPaintSubject(m, {kind: 5, id: 0}), false);
});
test("a Lighting tab includes later and negated conditions that mention its thing", () => {
    const m = {rgb: {lighting: {rules: [{index: 0}], program: {rules: [{parts: [{slot: 0, kind: 1, params: [3]}, {slot: 1, kind: 3, params: [2]}]}]}}}};
    assert.equal(subjectRules(m, {kind: 1, id: 3})[0].inherited, false);
    assert.equal(subjectRules(m, {kind: 2, id: 2})[0].inherited, false);
    assert.deepEqual(subjectRules(m, {kind: 2, id: 1}), []);
    m.rgb.lighting.program.rules[0].parts[1].params[0] = 255;
    assert.equal(subjectRules(m, {kind: 2, id: 1})[0].inherited, true);
});

test("copying a layer resolves its identity cells and replaces the whole map", () => {
    const cells = Array(58).fill(128);cells[1] = 131;cells[2] = 129;
    const m = {layers: [{index: 3, positions: [{layoutIndex: 25, keycode: "KC_A"}]}], rgb: {lighting: {rules: [{readOnly: false}], program: {palette: [{h: 177, s: 200, v: 188}], things: [{kind: 1, default: [6, 0], records: []}], maps: [cells], rules: [{parts: [{slot: 0, kind: 1, params: [3]}, {slot: 3, kind: 4, params: [0]}]}]}}}};
    const copied = copyLayerCells(m, 3);assert.equal(copied[1], 0);assert.equal(copied[2], 129);assert.equal(copied[3], 128);
    m.rgb.lighting.program.rules = [];const identity = copyLayerCells(m, 3);assert.equal(identity[LED_INDEX[25]], 0);assert.equal(identity[1], 128);
});
