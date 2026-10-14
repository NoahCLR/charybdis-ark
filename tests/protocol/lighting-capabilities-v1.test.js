"use strict";
const {test} = require("node:test"), assert = require("node:assert/strict");
const vectors = require("../../upstream/firmware/tests/fixtures/lighting_vectors_v1.json");
const {decodeLightingCapabilities, readLightingCapabilities} = require("../../core/protocol/lighting-capabilities-v1");
const pages = () => vectors.capability.map(hex => Buffer.from(hex, "hex"));
test("lighting capabilities match every firmware bitmap and bound", () => {
    const c = decodeLightingCapabilities(pages());
    for (const [name, ids] of Object.entries(c.registries)) assert.deepEqual(ids, vectors.limits[name]);
    assert.equal(c.tapDepth, vectors.limits.tapDepth); assert.equal(c.payloadBudget, 8192); assert.equal(c.paletteMaximum, 128);
});
test("lighting capability read uses correlated GET 0x0D for all pages", async () => {
    const requests = [];
    const actual = await readLightingCapabilities({request: async request => {
        requests.push(request); const report = Buffer.alloc(32);request.copy(report,0,0,5);
        const p = pages()[request[4]]; report[6] = p.length;p.copy(report,7);return report;
    }});
    assert.equal(requests.length, 15);requests.forEach((r,i) => {assert.equal(r[2],13);assert.equal(r[4],i);});
    assert.deepEqual(actual, decodeLightingCapabilities(pages()));
});
test("lighting capabilities reject short, reordered and incompatible pages", () => {
    assert.throws(() => decodeLightingCapabilities(pages().slice(1)));
    for (const [page, field, value] of [[0,0,2],[0,7,0],[1,0,1],[2,1,0]]) {const p=pages();p[page][field]=value;assert.throws(() => decodeLightingCapabilities(p));}
});
