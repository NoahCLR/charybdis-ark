"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const {lightingPreset, lightingPresets, opaqueLighting} = require("../../core/model/lighting-presets");
const {decodeLightingDomain, encodeLightingDomain} = require("../../core/schema/lighting-domain-v1");
const {lightingCapabilities} = require("../fixtures/lighting-capabilities");
const vectors = require("../../upstream/firmware/tests/fixtures/lighting_vectors_v1.json");
const standard = vectors.conversion.find(c => c.name === "standard"), factory = Buffer.from(standard.hex, "hex");
const options = () => ({capabilities: lightingCapabilities(), maximumBrightness: 200});
const source = () => decodeLightingDomain(factory);
test("Standard uses exact factory bytes and exact existing v4 conversion, regardless of current edits", () => {
    const current = source();current.rules = [];current.palette[0].h = 123;
    for (const bytes of [factory, Buffer.from(standard.v4, "hex")]) assert.deepEqual(lightingPreset(current, bytes, [], options(), "standard").bytes, factory);
    assert.ok(lightingPresets(current, null, [], options()).every(p => p.reason && !p.program));
});
test("Minimal preserves the factory layer recipes and tables and removes feedback/fade/commit", () => {
    const p = lightingPreset(source(), factory, [], options(), "minimal").program;
    assert.ok(p.rules.length);assert.deepEqual(p.rules, source().rules.filter(r => r.parts[0].slot === 0 && r.parts[0].kind === 1));
    assert.deepEqual(p.extensions, []);assert.deepEqual(p.things, source().things);
});
test("Teaching uses native top-layer queries and independent creation-time combo colour copies", () => {
    const current = source(), combos = [{enabled: true}, {enabled: false}, {enabled: true}, {enabled: true}];
    const table = current.things.find(t => t.kind === 3);table.records = [[254, 254], [254, 254], [254, 255], [254, 254]];
    const p = lightingPreset(current, factory, combos, options(), "teaching").program;
    assert.deepEqual(p.rules.slice(0, 3).map(r => r.parts.map(p => [p.slot, p.kind, p.params])), [
        [[0,9,[255,0]],[2,8,[15,0]],[3,2,[p.rules[0].parts[2].params[0]]]],
        [[0,9,[255,0]],[2,8,[15,3]],[3,2,[p.rules[0].parts[2].params[0]]]],
        [[0,9,[255,0]],[2,8,[10,255]],[3,9,[]]],
    ]);
    const copy = p.rules[0].parts[2].params[0], original = table.default[1];
    assert.notEqual(copy, original);assert.deepEqual(p.palette[copy], current.palette[original]);
    p.palette[original].h = 87;assert.notEqual(p.palette[copy].h, 87);
    assert.deepEqual(p.extensions, []);assert.deepEqual(current, sourceWithRecords());
    function sourceWithRecords() {const s = source();s.things.find(t=>t.kind===3).records = table.records;return s;}
});
test("black remains a combo accent; none/missing identities fabricate no colour", () => {
    const current = source(), table = current.things.find(t=>t.kind===3);current.palette.push({h:0,s:0,v:0});table.default[1]=current.palette.length-1;
    assert.deepEqual(lightingPreset(current,factory,[{enabled:true}],options(),"teaching").program.palette.at(-1),{h:0,s:0,v:0});
    table.default[1]=255;assert.equal(lightingPreset(current,factory,[{enabled:true}],options(),"teaching").program.rules.filter(r=>r.parts.some(p=>p.slot===2&&p.kind===8&&p.params[0]===15)).length,0);
});
test("capabilities, saved bounds, palette bounds, brightness and working admission are checked before staging", () => {
    const caps = options();caps.capabilities.registries.paints=caps.capabilities.registries.paints.filter(k=>k!==9);
    assert.throws(()=>lightingPreset(source(),factory,[],caps,"teaching"),/Teaching needs/);
    const small=options();small.capabilities.payloadBudget=100;assert.throws(()=>lightingPreset(source(),factory,[],small,"standard"),/CAPACITY/);
    const palette=options();palette.capabilities.paletteMaximum=2;assert.throws(()=>lightingPreset(source(),factory,[],palette,"standard"),/more colours/);
    assert.throws(()=>lightingPreset(source(),factory,[],{...options(),maximumBrightness:100},"standard"),/BRIGHTNESS/);
    const timed=source();timed.rules.unshift({flags:0,brightness:255,parts:[{slot:0,kind:24,params:[255]},{slot:2,kind:0,params:[]},{slot:3,kind:1,params:[]},{slot:5,kind:3,params:[1,0]}]});
    const tiny=options();tiny.capabilities.working.capacity=1;assert.throws(()=>lightingPreset(source(),encodeLightingDomain(timed),[],tiny,"standard"),/working|bytes|memory/);
});
test("opaque parts/maps/extensions require an intentional replacement boundary",()=>{
    const current=source();assert.equal(opaqueLighting(current),false);current.extensions.push({kind:200,params:[5]});assert.equal(lightingPreset(current,factory,[],options(),"standard").replacesUnknown,true);
    current.extensions=[];current.maps=[[...Array(58).fill(128)]];current.maps[0][0]=140;assert.equal(opaqueLighting(current),true);
});
