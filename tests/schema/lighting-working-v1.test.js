"use strict";
const {test}=require("node:test"), assert=require("node:assert/strict");
const {lightingWorkingCost}=require("../../core/schema/lighting-working-v1");
const {decodeLightingDomain}=require("../../core/schema/lighting-domain-v1");
const vectors=require("../../upstream/firmware/tests/fixtures/lighting_vectors_v1.json");
const {lightingCapabilities}=require("../fixtures/lighting-capabilities");
for(const v of vectors.workingMemory) test(`firmware working memory: ${v.name}`,()=>{
 const p=decodeLightingDomain(Buffer.from(v.hex,"hex")), c=lightingWorkingCost(p,lightingCapabilities().working);
 for(const k of ["bank","maximum","required","admitted"])assert.equal(c[k],v[k],k);
});
test("working admission never assumes capacity or accepts unknown metadata",()=>{
 const p=decodeLightingDomain(Buffer.from(vectors.workingMemory.find(v=>v.required>0).hex,"hex")), w=lightingCapabilities().working;
 assert.equal(lightingWorkingCost(p).required,null); assert.equal(lightingWorkingCost(p,{...w,model:2}).admitted,false);
 assert.equal(lightingWorkingCost(p,{...w,modules:{}}).admitted,false);
 assert.equal(lightingWorkingCost(p,{...w,ownerBytes:2**32}).admitted,false);
 assert.equal(lightingWorkingCost({...p,rules:p.rules.map(r=>({...r,flags:1}))}).required,0);
});

test('checked u32 overflow and layout mismatches never produce an activatable estimate',()=>{
 const p=decodeLightingDomain(Buffer.from(vectors.workingMemory.find(v=>v.name==='state8-full-domain').hex,'hex')),w=lightingCapabilities().working;
 const malformed={...p,rules:Array.from({length:100000},()=>p.rules[0])};assert.equal(lightingWorkingCost(malformed,w).required,null);
 for(const [k,n] of [['descriptorBytes',11],['slotHeaderBytes',0],['memberBase',6],['alignment',8]])assert.equal(lightingWorkingCost(p,{...w,[k]:n}).admitted,false);
});
