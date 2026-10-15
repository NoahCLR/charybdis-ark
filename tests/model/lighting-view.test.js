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

test("native keymap query basis follows remaps and exact authored rows and combo layers",()=>{
 const {validateSnapshot}=require('../../core/model/portable-profile'),{lightingKeymap}=require('../../core/model/lighting-view');
 const doc=require('../fixtures/pd-profile').document(),d=validateSnapshot(doc);d.document.layers[3][59]=0x777f;d.document.layers[3][56]=0x5222;
 const native=require('../../core/schema/actions').nativeCode(d.behaviors.rows[0].target);d.document.layers[3][0]=native;
 let b=lightingKeymap(d);assert.equal(b.keymap[3][0].behaviour,0);assert.equal(b.keymap[3][59].code,0x777f);assert.equal(b.keymap[3][56].code,0x5222);
 d.document.layers[3][59]=0x7e9f;b=lightingKeymap(d);assert.equal(b.keymap[3][59].code,0x7e9f);
 for(const [id,c] of Object.entries(b.queryCombos)){assert.equal(c.enabled,d.combos.rows[id].enabled);assert.ok(c.inputs.every(Number.isInteger));}
});
