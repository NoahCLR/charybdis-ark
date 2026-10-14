"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const {lightingFindings} = require("../../core/model/lighting-checks");
const {validateSnapshot} = require("../../core/model/portable-profile");
const {document} = require("../fixtures/pd-profile");
const decoded = () => validateSnapshot(document());
test("Review advises similar identities, unknown kinds and memory without claiming LED acceptance", () => {
    const d = decoded();d.rgb.things = [{kind: 1, default: [6, 255], records: [[6, 0], [6, 1]]}];
    d.rgb.palette = [{h: 254, s: 240, v: 180}, {h: 2, s: 250, v: 190}];d.rgb.rules = [{flags: 0, brightness: 255, parts: [{slot: 2, kind: 0, params: []}, {slot: 3, kind: 200, params: []}]}];d.rgb.byteLength = 7900;
    const found = lightingFindings(d, {});
    assert.deepEqual(found.map(f => f.kind), ["lightingMemory", "unknownLighting", "similarLighting"]);
    assert.match(found[2].detail, /screen cannot predict/);
});
test("shadowing requires provable conditions and opaque coverage; maps and timed rules are conservative", () => {
    const d = decoded(), base = {flags: 0, brightness: 255, parts: [{slot: 2, kind: 0, params: []}, {slot: 3, kind: 2, params: [0]}]};
    const target = {flags: 0, brightness: 255, parts: [{slot: 0, kind: 1, params: [2]}, {slot: 2, kind: 6, params: []}, {slot: 3, kind: 3, params: []}]};
    d.rgb.rules = [base, target];assert.ok(lightingFindings(d, {}).some(f => f.kind === "hiddenLighting"));
    base.parts[1] = {slot: 3, kind: 4, params: [0]};assert.ok(!lightingFindings(d, {}).some(f => f.kind === "hiddenLighting"));
    base.parts[1] = {slot: 3, kind: 2, params: [0]};base.parts.push({slot: 5, kind: 1, params: [10, 0]});assert.ok(!lightingFindings(d, {}).some(f => f.kind === "hiddenLighting"));
});
test("identity inheritance intentionally shared by every combo does not flood Review", () => {
    const d = decoded();d.rgb.rules = [];d.rgb.things = [{kind: 3, default: [5, 0], records: Array.from({length: 128}, () => [254, 254])}];
    assert.equal(lightingFindings(d, {}).length, 0);
});

test("impossible lighting conditions reuse proven reachability and do not infer from incomplete analysis", () => {
    const d = decoded();d.rgb.rules = [{flags: 0, brightness: 255, parts: [{slot: 0, kind: 1, params: [3]}, {slot: 2, kind: 0, params: []}, {slot: 3, kind: 2, params: [0]}]}];
    assert.ok(!lightingFindings(d, {}).some(f => f.kind === "unreachableLighting"));
    assert.ok(lightingFindings(d, {}, [{kind: "unreachable", layers: [3]}]).some(f => f.kind === "unreachableLighting"));
});
