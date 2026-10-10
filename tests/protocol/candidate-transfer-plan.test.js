"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const {encodeProfileBlob} = require("../../core/schema/profile-blob-v1");
const {candidateTransferPlan} = require("../../core/protocol/candidate-transfer-plan");

const blob = (first = Buffer.alloc(200, 1), second = Buffer.alloc(3000, 2)) => encodeProfileBlob({domains: [
    {id: 0x10, version: 4, payload: first}, {id: 0x40, version: 6, payload: second},
]});
function reconstruct(target, source) {
    const plan = candidateTransferPlan(target, source);
    const bytes = Buffer.concat(plan.map(part => part.kind === "reuse"
        ? source.subarray(part.sourceOffset, part.sourceOffset + part.length)
        : target.subarray(part.offset, part.offset + part.length)));
    assert.deepEqual(bytes, target);
    let offset = 0;
    for (const part of plan) {assert.equal(part.offset, offset); offset += part.length; if (part.kind === "reuse") assert.ok(part.length <= 1024);}
    return plan;
}
test("one scalar edit sends a small range and reuses the rest", () => {
    const source = blob(), target = Buffer.from(source); target[500] = 9;
    const plan = reconstruct(target, source);
    assert.ok(plan.filter(p => p.kind === "write").reduce((n,p) => n + p.length, 0) <= 20);
    assert.ok(plan.length < Math.ceil(target.length / 20) / 10);
});
test("growing a domain preserves reuse of domains shifted after it", () => {
    const source = blob(), target = blob(Buffer.alloc(280, 1));
    const plan = reconstruct(target, source);
    assert.ok(plan.some(p => p.kind === "reuse" && p.sourceOffset !== p.offset));
    assert.ok(plan.filter(p => p.kind === "write").reduce((n,p) => n + p.length, 0) < 300);
});
test("a missing or entirely different base uses full upload", () => {
    const target = blob();
    assert.deepEqual(candidateTransferPlan(target), [{kind: "write", offset: 0, length: target.length}]);
    reconstruct(target, blob(Buffer.alloc(200, 3), Buffer.alloc(3000, 4)));
});
test("mixed edits and domain removal always reconstruct the exact target", () => {
    const source = blob();
    for (let length = 100; length < 300; length += 17) {
        const first = Buffer.alloc(length, 1); first[length >> 1] = 8;
        reconstruct(blob(first), source);
    }
    reconstruct(encodeProfileBlob({domains: [{id: 0x40, version: 6, payload: Buffer.alloc(3000, 2)}]}), source);
});
