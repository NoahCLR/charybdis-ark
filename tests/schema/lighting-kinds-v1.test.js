"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {LIGHTING_KINDS,LIGHTING_REGISTRIES,parameterLength}=require("../../core/schema/lighting-kinds-v1");
const contract=require("../../upstream/firmware/tests/fixtures/lighting_contract_v1.json");
test("all Ark lighting descriptors match the firmware registry and parameter widths",()=>{
 for(const name of LIGHTING_REGISTRIES){const entries=contract.registries[name==="things"?"thingKinds":name];assert.deepEqual(Object.keys(LIGHTING_KINDS[name]).map(Number),entries.map(e=>e.id));
 for(const entry of entries){if(name==="things")continue;assert.equal(parameterLength(LIGHTING_KINDS[name][entry.id]),entry.length??entry.parameters.reduce((n,p)=>n+(p.type==="milliseconds"?2:1),0),`${name}:${entry.id}`);}}
});
