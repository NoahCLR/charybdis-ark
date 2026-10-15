"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const {rewriteLightingThings} = require("../../core/model/lighting-references");
const {decodeLightingDomain, encodeLightingDomain} = require("../../core/schema/lighting-domain-v1");
const vectors = require("../../upstream/firmware/tests/fixtures/lighting_vectors_v1.json");
const {decodeLightingCapabilities} = require("../../core/protocol/lighting-capabilities-v1");
const options = {maximumBrightness: 200, capabilities: decodeLightingCapabilities(vectors.capability.map(h => Buffer.from(h, "hex")))};
test("thing records follow row insertion/removal and retain inherited defaults", () => {
    const program = decodeLightingDomain(Buffer.from(vectors.codec.valid.find(v => v.name === "standard").hex, "hex"), options);
    program.things = [{kind: 3, default: [5, 255], records: [[4, 0], [1, 1], [2, 2]]}];
    const profile = {domains: [{id: 16, payload: encodeLightingDomain(program, options)}]};
    rewriteLightingThings(profile, 3, [2, null, 0], options);
    const after = decodeLightingDomain(profile.domains[0].payload, options);
    assert.deepEqual(after.things[0].records, [[2, 2], [254, 254], [4, 0]]);assert.deepEqual(after.rules, program.rules);
});

test("named selectors follow their rows and removed owners drop rules without touching opaque rules", () => {
    const caps = structuredClone(options.capabilities);caps.registries.facts.push(7, 8);caps.registries.paints.push(200);
    const opts = {...options, capabilities: caps}, p = decodeLightingDomain(Buffer.from(vectors.codec.valid.find(v => v.name === "standard").hex, "hex"), opts);
    const rule = id => ({flags: 0, brightness: 255, parts: [{slot: 0, kind: 7, params: [id, 255]}, {slot: 2, kind: 0, params: []}, {slot: 3, kind: 3, params: []}]});
    p.rules = [rule(0), rule(1), rule(2), {...rule(2), parts: [{slot: 0, kind: 7, params: [2, 255]}, {slot: 2, kind: 0, params: []}, {slot: 3, kind: 200, params: []}]}];p.extensions = [];
    const profile = {domains: [{id: 16, payload: encodeLightingDomain(p, opts)}]};
    rewriteLightingThings(profile, 3, [1, 0], opts);
    const after = decodeLightingDomain(profile.domains[0].payload, opts);
    assert.deepEqual(after.rules.slice(0, 2).map(r => r.parts[0].params[0]), [1, 0]);assert.equal(after.rules.length, 3);
    assert.deepEqual(after.rules[2], decodeLightingDomain(encodeLightingDomain(p, opts), opts).rules[3]);
});

test("new event/phase/query selectors move with their owners and unknown whole rules stay byte exact",()=>{
 const caps=structuredClone(options.capabilities);caps.registries.facts.push(200);
 const opts={...options,capabilities:caps},p={formatVersion:5,palette:[],things:[],keySets:[],maps:[],extensions:[],rules:[]};
 const row=(kind,params,extra=[])=>({flags:0,brightness:255,parts:[{slot:0,kind,params},{slot:2,kind:8,params:[14,2]},{slot:3,kind:0,params:[]},...extra]});
 p.rules=[row(12,[2,3,255]),row(25,[2,255],[{slot:5,kind:3,params:[244,1]}]),row(8,[2,4])];p.rules.push({...row(12,[2,3,255]),parts:[{slot:0,kind:200,params:[2,3]},{slot:2,kind:8,params:[14,2]},{slot:3,kind:0,params:[]}]});
 const blob={domains:[{id:16,payload:encodeLightingDomain(p,opts)}]},opaque=decodeLightingDomain(blob.domains[0].payload,opts).rules[3];
 rewriteLightingThings(blob,4,[2,0,1],opts);const moved=decodeLightingDomain(blob.domains[0].payload,opts);assert.ok(moved.rules.slice(0,3).every(r=>r.parts[0].params[0]===0&&r.parts[1].params[1]===0));assert.deepEqual(moved.rules[3],opaque);
 rewriteLightingThings(blob,4,[1,2],opts);assert.deepEqual(decodeLightingDomain(blob.domains[0].payload,opts).rules,[opaque]);
});
