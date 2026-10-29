"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {compareFindings} = require("../../core/model/compare-findings");

test("a finding is matched layer with layer through the draft's order, and a fixed one has no place", () => {
    const order = [0, 2, 1, ...Array.from({length: 13}, (_, n) => n + 3)];
    const finding = {kind: "unreachable", layers: [1], place: {kind: "key", layer: 1}};
    const keyOf = (found, slots) => compareFindings([], [found], slots)[0].key;
    assert.equal(keyOf(finding), "unreachable:1");
    assert.equal(keyOf(finding, order), "unreachable:2");
    assert.equal(keyOf({kind: "unowned", layers: [0], identity: "7:21057"}), "unowned:0:7:21057");
    // The draft's slot 1 holds keyboard layer 2: the same finding.
    assert.deepEqual(compareFindings([{kind: "unreachable", layers: [2]}], [finding], order).map(check => [check.key, check.status]), [["unreachable:2", "existing"]]);
    const fixed = compareFindings([finding], [], order);
    assert.deepEqual(fixed.map(check => [check.key, check.status, check.place]), [["unreachable:1", "fixed", undefined]]);
});

test("an incomplete draft graph never marks an earlier graph finding fixed", () => {
    const before = [{kind: "trap", layers: [15]}, {kind: "unreachable", layers: [14]}, {kind: "baseNo", layers: [0]}];
    const after = [{kind: "reachabilityIncomplete", layers: []}];
    const compared = compareFindings(before, after);
    assert.deepEqual(compared.filter(f => f.status === "fixed").map(f => f.kind), ["baseNo"]);
});

test("uncertainty about escapes does not hide a proved reachability repair", () => {
    const before = [{kind: "trap", layers: [15]}, {kind: "unreachable", layers: [14]}];
    const after = [{kind: "reachabilityIncomplete", scope: "escapes", layers: [15]}];
    assert.deepEqual(compareFindings(before, after).filter(f => f.status === "fixed").map(f => f.kind), ["unreachable"]);
});
