"use strict";
const {test} = require("node:test"), assert = require("node:assert/strict");
const vectors = require("../../upstream/firmware/tests/fixtures/lighting_vectors_v1.json");
const {decodeLightingCapabilities, readLightingCapabilities} = require("../../core/protocol/lighting-capabilities-v1");
const pages = () => require("../fixtures/lighting-capabilities").lightingPages();
test("lighting capabilities match every firmware bitmap and bound", () => {
    const c = require("../fixtures/lighting-capabilities").lightingCapabilities();
    for (const [name, ids] of Object.entries(c.registries)) assert.deepEqual(ids, vectors.limits[name]);
    assert.equal(c.tapDepth, vectors.limits.tapDepth); assert.equal(c.payloadBudget, 8192); assert.equal(c.paletteMaximum, 128);
});
test("lighting capability read uses correlated GET 0x0D for all pages", async () => {
    const requests = [];
    const actual = await readLightingCapabilities({request: async request => {
        requests.push(request); const report = Buffer.alloc(32);request.copy(report,0,0,5);
        const p = pages()[request[4]] ?? Buffer.alloc(0); report[6] = p.length;p.copy(report,7);return report;
    }});
    assert.equal(requests.length, 16 + actual.registries.facts.length);requests.forEach((r,i) => {assert.equal(r[2],13);assert.equal(r[4],i < 16 ? i : 128 + actual.registries.facts[i-16]);});
    assert.deepEqual(actual, require("../fixtures/lighting-capabilities").lightingCapabilities());
});
test("lighting capabilities reject short, reordered and incompatible pages", () => {
    assert.throws(() => decodeLightingCapabilities(pages().slice(1,16)));
    for (const [page, field, value] of [[0,0,2],[0,7,0],[1,0,1],[2,1,0]]) {const p=pages().slice(0,16);p[page][field]=value;assert.throws(() => decodeLightingCapabilities(p));}
});

test("missing and unknown working models do not invent capacity or module bounds", () => {
 const p=pages().slice(0,15);assert.equal(decodeLightingCapabilities(p).working,undefined);
 p.push(Buffer.from([9,0,0,0,0,0,0,0]));assert.equal(decodeLightingCapabilities(p).working.model,9);
 p[15]=Buffer.from([1,28,32,8,12,12,5,4]);
 assert.throws(()=>decodeLightingCapabilities(p,{13:Buffer.from([14,128,0,1])}), /bounds/);
});

test("optional metadata UNKNOWN_PAGE is unavailable; errors and malformed empty success still fail",async()=>{
 const respond=(request,status=0)=>{const r=Buffer.alloc(32);request.copy(r,0,0,5);const p=pages()[request[4]]??Buffer.alloc(0);r[5]=status;r[6]=status?0:p.length;if(!status)p.copy(r,7);return r;};
 const older=await readLightingCapabilities({request:async r=>respond(r,r[4]>=15?2:0)});assert.equal(older.working,undefined);
 const noBounds=await readLightingCapabilities({request:async r=>respond(r,r[4]>=128?2:0)});assert.deepEqual(noBounds.working.modules,{});
 await assert.rejects(()=>readLightingCapabilities({request:async r=>respond(r,r[4]===15?3:0)}),e=>e.code==='DEVICE_REJECTED');
 await assert.rejects(()=>readLightingCapabilities({request:async r=>{const b=respond(r);if(r[4]===15){b.fill(0,5);}return b;}}),e=>e.code==='MALFORMED_RESPONSE');
});
