"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const vectors = require("../../upstream/firmware/tests/fixtures/lighting_vectors_v1.json");
const {decodeLightingDomain, encodeLightingDomain} = require("../../core/schema/lighting-domain-v1");
for (const c of vectors.codec.valid) test(`lighting codec round-trip: ${c.name}`, () => {
    const bytes = Buffer.from(c.hex, "hex"); assert.deepEqual(encodeLightingDomain(decodeLightingDomain(bytes, vectors.limits), vectors.limits), bytes);
});
for (const c of vectors.codec.invalid) test(`lighting codec rejects: ${c.name}`, () => {
    assert.throws(() => decodeLightingDomain(Buffer.from(c.hex, "hex"), vectors.limits), e => e.code === c.error.code && e.offset === c.error.offset);
});

test("unrecognized trigger/timing construction stays opaque without a guessed state role",()=>{
 const caps=require('../fixtures/lighting-capabilities').lightingCapabilities();caps.registries.facts.push(200);caps.registries.timings.push(200);
 const p=decodeLightingDomain(Buffer.from(vectors.codec.valid.find(v=>v.name==='event-28-flash').hex,'hex'));
 p.rules[0].parts[0]={slot:0,kind:200,params:[7,0,255]};
 const bytes=encodeLightingDomain(p,{capabilities:caps}),d=decodeLightingDomain(bytes,{capabilities:caps});assert.equal(d.rules[0].known,false);assert.deepEqual(encodeLightingDomain(d,{capabilities:caps}),bytes);
 p.rules[0].parts[0]={slot:0,kind:28,params:[127]};p.rules[0].parts.at(-1).kind=200;
 const newer=encodeLightingDomain(p,{capabilities:caps});assert.deepEqual(encodeLightingDomain(decodeLightingDomain(newer,{capabilities:caps}),{capabilities:caps}),newer);
});
