"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const {decodeLightingDomain, encodeLightingDomain} = require("../../core/schema/lighting-domain-v1");
const {editLightingRule, ruleIdentity, ruleWords} = require("../../core/model/lighting-editor");
const {decodeLightingCapabilities} = require("../../core/protocol/lighting-capabilities-v1");
const vectors = require("../../upstream/firmware/tests/fixtures/lighting_vectors_v1.json");
const options = {maximumBrightness: 200, capabilities: decodeLightingCapabilities(vectors.capability.map(h => Buffer.from(h,"hex")))};
const bytes = () => Buffer.from(vectors.codec.valid.find(c => c.name === "standard").hex,"hex");
const edit = (bytes, index, action, extra = {}) => editLightingRule(bytes, {index, expectedRule: ruleIdentity(decodeLightingDomain(bytes, options).rules[index]), action, ...extra}, options);
test("rule edits keep identity colours, unrelated rules and raw bytes", () => {
    const original = decodeLightingDomain(bytes(),options), next = decodeLightingDomain(edit(bytes(),0,"colour",{colour:{h:0,s:0,v:0}}),options);
    assert.deepEqual(next.things,original.things);assert.deepEqual(next.rules.slice(1),original.rules.slice(1));
    assert.deepEqual(next.palette[next.rules[0].parts.find(p=>p.slot===3).params[0]],{h:0,s:0,v:0});
    assert.deepEqual(decodeLightingDomain(edit(bytes(),1,"toggle"),options).rules[1].flags,1);
});
test("reorder is exact and deleting a fade-scene rule updates its suffix count",()=>{
    const original=decodeLightingDomain(bytes(),options), moved=decodeLightingDomain(edit(bytes(),0,"move",{to:9}),options);
    assert.deepEqual(moved.rules, [...original.rules.slice(1),original.rules[0]]);
    assert.deepEqual(moved.extensions, original.extensions);
    const deleted=decodeLightingDomain(edit(bytes(),9,"delete"),options);
    assert.equal(deleted.rules.length,9);assert.equal(deleted.extensions.find(e=>e.kind===1).params[3],0);
});
test("unknown parts survive decode/re-encode, other edits, but refuse direct editing",()=>{
    const caps=structuredClone(options.capabilities);caps.registries.paints.push(200);
    const opts={...options,capabilities:caps}, profile=decodeLightingDomain(bytes(),options);
    profile.rules[1].parts.find(p=>p.slot===3).kind=200;
    const original=encodeLightingDomain(profile,opts), unknown=decodeLightingDomain(original,opts).rules[1];
    assert.equal(unknown.known,false);assert.deepEqual(encodeLightingDomain(decodeLightingDomain(original,opts),opts),original);
    assert.throws(()=>editLightingRule(original,{index:1,expectedRule:ruleIdentity(unknown),action:"toggle"},opts),/read-only/);
    const edited=editLightingRule(original,{index:0,expectedRule:ruleIdentity(profile.rules[0]),action:"toggle"},opts);
    assert.deepEqual(decodeLightingDomain(edited,opts).rules[1],unknown);
});
test("stale and unsupported paint edits refuse before any profile change",()=>{
    assert.throws(()=>editLightingRule(bytes(),{index:0,expectedRule:"old",action:"toggle"},options),/changed/);
    assert.throws(()=>edit(bytes(),0,"colour",{colour:{h:1,s:1,v:201}}),/brightness/);
    const caps=structuredClone(options.capabilities);caps.registries.paints=caps.registries.paints.filter(id=>id!==2);
    assert.throws(()=>editLightingRule(bytes(),{index:0,expectedRule:ruleIdentity(decodeLightingDomain(bytes(),options).rules[0]),action:"colour",colour:{h:1,s:1,v:1}},{...options,capabilities:caps}),/cannot be changed/);
});
test("rule descriptions name selected layers and unknown facts without wire ids",()=>{
    const rule=decodeLightingDomain(bytes(),options).rules.at(-1);rule.parts[0].params[0]=3;
    assert.match(ruleWords(rule,["Base","Numbers","Symbols","Nav"]).when,/Nav/);
    rule.parts[0].kind=200;assert.equal(ruleWords(rule).when,"A condition from newer firmware");
});

test("repeated colour changes reuse an unshared entry without exhausting the palette", () => {
    let current = edit(bytes(), 0, "colour", {colour: {h: 11, s: 12, v: 13}});
    const before = decodeLightingDomain(current, options), count = before.palette.length;
    for (let h = 20; h < 160; h++) current = edit(current, 0, "colour", {colour: {h, s: 12, v: 13}});
    const after = decodeLightingDomain(current, options);
    assert.equal(after.palette.length, count);
    assert.deepEqual(after.rules.slice(1), before.rules.slice(1));
    assert.deepEqual(after.things, before.things);
    assert.deepEqual(after.palette[after.rules[0].parts.find(p => p.slot === 3).params[0]], {h: 159, s: 12, v: 13});
});

test("opaque rules prevent palette replacement even for an apparently unshared colour", () => {
    const caps = structuredClone(options.capabilities); caps.registries.paints.push(200);
    const opts = {...options, capabilities: caps}, profile = decodeLightingDomain(bytes(), options);
    profile.rules[1].parts.find(p => p.slot === 3).kind = 200;
    let current = encodeLightingDomain(profile, opts);
    const change = colour => {
        const rule = decodeLightingDomain(current, opts).rules[0];
        current = editLightingRule(current, {index: 0, expectedRule: ruleIdentity(rule), action: "colour", colour}, opts);
    };
    change({h: 11, s: 12, v: 13});const before = decodeLightingDomain(current, opts);
    change({h: 20, s: 12, v: 13});const after = decodeLightingDomain(current, opts);
    assert.deepEqual(after.palette.slice(0, before.palette.length), before.palette);
    assert.deepEqual(after.rules[1], before.rules[1]);
});
