"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {lightingForView,lightingIdentities}=require("../../core/model/lighting-view");
const {decodeLightingDomain}=require("../../core/schema/lighting-domain-v1");
const vectors=require("../../upstream/firmware/tests/fixtures/lighting_vectors_v1.json");
const domain=()=>decodeLightingDomain(Buffer.from(vectors.codec.valid[1].hex,"hex"));
test("lighting view reports ordered bands, retained zeros and device colour support",()=>{
 const d=domain(),caps={payloadBudget:8192,registries:{paints:[3]}};
 const v=lightingForView(d,[],caps, d.rules.map((_,i)=>`stable-${i}`));
 assert.equal(v.used,Buffer.from(vectors.codec.valid[1].hex,"hex").length);assert.equal(v.capacity,8192);assert.equal(v.rules[0].key,"stable-0");assert.ok(v.rules.every(r=>!r.canColour));
 caps.registries.paints.push(2);assert.ok(lightingForView(d,[],caps).rules.every(r=>r.canColour));
 assert.equal(v.rules[0].band,"feedback");assert.equal(v.rules.at(-1).band,"layers");assert.deepEqual(lightingIdentities(d).layerColors[0].color,{h:0,s:0,v:0});
});
