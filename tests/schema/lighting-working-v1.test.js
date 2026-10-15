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

test('enabled unknown timing never takes the zero-cost path, including mixtures and future capabilities',()=>{
 const w=lightingCapabilities().working, known=decodeLightingDomain(Buffer.from(vectors.workingMemory.find(v=>v.required>0).hex,'hex'));
 const opaque={flags:0,brightness:255,parts:[{slot:2,kind:0,params:[]},{slot:3,kind:1,params:[]},{slot:5,kind:31,params:[7,0,255]}]};
 const before=JSON.stringify(opaque);
 for(const rules of [[opaque],[...known.rules,opaque],[{...opaque,flags:1},...known.rules,opaque]])for(const cap of [undefined,w,{...w,model:2}]){
  const c=lightingWorkingCost({rules},cap);assert.equal(c.required,null);assert.equal(c.bank,null);assert.equal(c.maximum,null);assert.equal(c.admitted,false);assert.match(c.reason,/newer Ark/);
 }
 assert.equal(JSON.stringify(opaque),before,'cost inspection preserves opaque bytes');
 assert.equal(lightingWorkingCost({rules:[{...opaque,flags:1}]}).required,0);
 assert.deepEqual(lightingWorkingCost({...known,rules:[...known.rules,{...opaque,flags:1}]},w),lightingWorkingCost(known,w));
 for(const parts of [[],[{slot:5,kind:1,params:[100,0]}]])assert.equal(lightingWorkingCost({rules:[{...opaque,parts}]}).admitted,true,'state and show-after need no new timing allocation');
});
