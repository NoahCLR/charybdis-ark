"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {convertLightingV4}=require("../../core/schema/lighting-conversion-v1");
const vectors=require("../../upstream/firmware/tests/fixtures/lighting_vectors_v1.json");
for(const c of vectors.conversion)test(`v4 conversion emits firmware bytes: ${c.name}`,()=>{
 const options={...c.limits,capabilities:{payloadBudget:8192,tapDepth:c.limits.tapDepth,registries:c.limits}};
 assert.equal(convertLightingV4(Buffer.from(c.v4,"hex"),options).toString("hex"),c.hex);
});
test("v4 conversion rejects corrupt source instead of guessing",()=>{
 const b=Buffer.from(vectors.conversion[0].v4,"hex");b[1]=1;assert.throws(()=>convertLightingV4(b));
});
