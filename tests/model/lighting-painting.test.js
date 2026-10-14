"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const {editLightingIdentity, paintLightingMap} = require("../../core/model/lighting-painting");
const {decodeLightingDomain, encodeLightingDomain} = require("../../core/schema/lighting-domain-v1");
const {ruleIdentity} = require("../../core/model/lighting-editor");
const {decodeLightingCapabilities} = require("../../core/protocol/lighting-capabilities-v1");
const vectors = require("../../upstream/firmware/tests/fixtures/lighting_vectors_v1.json");
const options = {maximumBrightness: 200, capabilities: decodeLightingCapabilities(vectors.capability.map(h => Buffer.from(h, "hex")))};
const bytes = () => Buffer.from(vectors.codec.valid.find(c => c.name === "standard").hex, "hex");
const paint = (bytes, fields) => paintLightingMap(bytes, {index: 0, expectedRule: ruleIdentity(decodeLightingDomain(bytes, options).rules[0]), ...fields}, options);
test("identity overrides and reset keep every other field and share colours", () => {
    const before = decodeLightingDomain(bytes(), options), colour = before.palette[0];
    const custom = editLightingIdentity(bytes(), {kind: 1, id: 3, field: "colour", slot: 1, colour}, options);
    const after = decodeLightingDomain(custom, options);
    assert.equal(after.things[0].records[3][1], 0);assert.deepEqual(after.rules, before.rules);assert.equal(after.palette.length, before.palette.length);
    const inherited = decodeLightingDomain(editLightingIdentity(custom, {kind: 1, id: 3, field: "colour", slot: 1, colour: "inherit"}, options), options);
    assert.equal(inherited.things[0].records[3][1], 254);
});
test("repeated brush and identity edits reuse abandoned colours", () => {
    let current = paint(bytes(), {leds: [2], paint: {h: 1, s: 2, v: 3}}), count = decodeLightingDomain(current, options).palette.length;
    for (let h = 2; h < 200; h++) current = paint(current, {leds: [2], paint: {h, s: 2, v: 3}});
    assert.equal(decodeLightingDomain(current, options).palette.length, count);
    for (let h = 2; h < 200; h++) current = editLightingIdentity(current, {kind: 1, id: 3, field: "colour", slot: 1, colour: {h, s: 1, v: 2}}, options);
    assert.ok(decodeLightingDomain(current, options).palette.length <= count + 1);
});
test("painting automatically crosses the dense/sparse boundary and keeps map cells", () => {
    const before = bytes(), sparse = paint(before, {cells: Array(58).fill(128), leds: Array.from({length: 28}, (_, i) => i), paint: 129});
    const dense = paint(sparse, {leds: [28], paint: 131});
    const a = decodeLightingDomain(sparse, options), b = decodeLightingDomain(dense, options);
    assert.equal(b.byteLength - a.byteLength, 1); // 58-byte sparse vs 59-byte dense
    assert.deepEqual(b.maps[0].slice(0, 28), Array(28).fill(129));assert.equal(b.maps[0][28], 131);
    assert.deepEqual(b.rules.slice(1), decodeLightingDomain(before, options).rules.slice(1));
    assert.deepEqual(encodeLightingDomain(b, options), dense);
});
test("shared maps detach before a stroke and unknown rules remain byte exact", () => {
    const profile = decodeLightingDomain(paint(bytes(), {leds: [1], paint: 129}), options);
    profile.rules[1].parts.find(p => p.slot === 3).kind = 4;profile.rules[1].parts.find(p => p.slot === 3).params = [0];
    const shared = encodeLightingDomain(profile, options), changed = decodeLightingDomain(paint(shared, {leds: [1], paint: 131}), options);
    assert.equal(changed.maps[0][1], 129);assert.equal(changed.maps[1][1], 131);
    const caps = structuredClone(options.capabilities);caps.registries.paints.push(200);
    const opts = {...options, capabilities: caps};profile.rules[2].parts.find(p => p.slot === 3).kind = 200;
    const original = encodeLightingDomain(profile, opts);
    const after = decodeLightingDomain(paintLightingMap(original, {index: 0, expectedRule: ruleIdentity(profile.rules[0]), leds: [3], paint: {h: 11, s: 22, v: 33}}, opts), opts);
    assert.deepEqual(after.rules[2], decodeLightingDomain(original, opts).rules[2]);assert.deepEqual(after.palette.slice(0, profile.palette.length), profile.palette);
});
test("unsupported paints, stale guards, invalid selection and brightness are rejected", () => {
    assert.throws(() => paint(bytes(), {expectedRule: "stale", leds: [1], paint: 129}), /changed/);
    assert.throws(() => paint(bytes(), {leds: [58], paint: 129}), /keys/);
    assert.throws(() => paint(bytes(), {leds: [1], paint: {h: 1, s: 1, v: 201}}), /brightness/);
    const caps = structuredClone(options.capabilities);caps.registries.paints = caps.registries.paints.filter(n => n !== 4);
    assert.throws(() => paintLightingMap(bytes(), {index: 0, leds: [1], paint: 129}, {...options, capabilities: caps}), /does not offer/);
});

test("named combo and behaviour identity edits create visible subject rules with outcome above its fallback", () => {
    const caps = structuredClone(options.capabilities);caps.registries.facts.push(7, 8);caps.registries.paints.push(8);
    const opts = {...options, capabilities: caps};
    const combo = decodeLightingDomain(editLightingIdentity(bytes(), {kind: 3, id: 2, field: "colour", slot: 1, colour: {h: 7, s: 8, v: 9}}, opts), opts);
    assert.ok(combo.rules.some(r => r.parts.some(p => p.slot === 0 && p.kind === 7 && p.params[0] === 2 && p.params[1] === 255) && r.parts.some(p => p.slot === 3 && p.kind === 3)));
    const hold = decodeLightingDomain(editLightingIdentity(bytes(), {kind: 4, id: 3, field: "outcome", outcome: true}, opts), opts);
    assert.equal(hold.rules[0].parts.find(p => p.slot === 3).kind, 8);
    assert.equal(hold.rules[1].parts.find(p => p.slot === 3).kind, 3);
    assert.deepEqual(hold.rules[0].parts[0].params, [3, 12]);assert.deepEqual(hold.rules[1].parts[0].params, [3, 15]);
    assert.deepEqual(hold.rules.slice(2), decodeLightingDomain(bytes(), options).rules);
});
test("identity colour by outcome refuses missing capabilities and preserves unknown rule bytes", () => {
    const missing = structuredClone(options.capabilities);missing.registries.paints = missing.registries.paints.filter(kind => kind !== 8);
    assert.throws(() => editLightingIdentity(bytes(), {kind: 4, id: 3, field: "outcome", outcome: true}, {...options, capabilities: missing}), /does not offer/);
    const caps = structuredClone(options.capabilities);caps.registries.facts.push(7, 8);caps.registries.paints.push(8, 200);
    const opts = {...options, capabilities: caps};
    const profile = decodeLightingDomain(bytes(), opts);profile.rules[0].parts.find(p => p.slot === 3).kind = 200;
    const original = encodeLightingDomain(profile, opts), after = decodeLightingDomain(editLightingIdentity(original, {kind: 1, id: 3, field: "colour", slot: 1, colour: {h: 177, s: 177, v: 177}}, opts), opts);
    assert.deepEqual(after.rules, decodeLightingDomain(original, opts).rules);assert.deepEqual(after.palette.slice(0, profile.palette.length), profile.palette);
});

test("a paint exceeding shared lighting memory is refused without changing the original bytes", () => {
    const original = bytes(), saved = Buffer.from(original), caps = structuredClone(options.capabilities);caps.payloadBudget = original.length + 10;
    const opts = {...options, capabilities: caps}, rule = decodeLightingDomain(original, opts).rules[0];
    assert.throws(() => paintLightingMap(original, {index: 0, expectedRule: ruleIdentity(rule), leds: Array.from({length: 58}, (_, i) => i), paint: {h: 177, s: 188, v: 199}}, opts), e => e.code === "CAPACITY_EXCEEDED");
    assert.deepEqual(original, saved);
});

test("editing an identity keeps its painted map above the fallback and feedback covers all states", () => {
    const caps = structuredClone(options.capabilities);caps.registries.facts = [...new Set([...caps.registries.facts, 7, 8])];caps.registries.paints = [...new Set([...caps.registries.paints, 8])];
    const opts = {...options, capabilities: caps};
    let current = paintLightingMap(bytes(), {subject: {kind: 4, id: 3}, leds: [1], paint: 129}, opts);
    current = editLightingIdentity(current, {kind: 4, id: 3, field: "colour", slot: 3, colour: {h: 177, s: 188, v: 199}}, opts);
    let p = decodeLightingDomain(current, opts);assert.equal(p.rules[0].parts.find(p => p.slot === 3).kind, 4);
    assert.equal(p.rules[1].parts.find(p => p.slot === 3).kind, 3);assert.deepEqual(p.rules[1].parts[0].params, [3, 15]);
    current = editLightingIdentity(current, {kind: 4, id: 3, field: "outcome", outcome: true}, opts);
    current = editLightingIdentity(current, {kind: 4, id: 3, field: "outcome", outcome: false}, opts);
    p = decodeLightingDomain(current, opts);assert.ok(p.rules.some(r => r.parts[0]?.kind === 8 && r.parts[0].params[1] === 15 && r.parts.find(p => p.slot === 3).kind === 3));
});

test("a future paint inside a map stays read-only and byte-exact through other edits", () => {
    const caps = structuredClone(options.capabilities);caps.registries.paints.push(9);
    const opts = {...options, capabilities: caps};
    const profile = decodeLightingDomain(bytes(), opts);
    profile.maps = [Array(58).fill(128)];profile.maps[0][2] = 128 + 9;
    const p = profile.rules[0].parts.find(p => p.slot === 3);p.kind = 4;p.params = [0];
    const original = encodeLightingDomain(profile, opts), decoded = decodeLightingDomain(original, opts);
    assert.equal(decoded.rules[0].known, false);
    assert.deepEqual(encodeLightingDomain(decoded, opts), original);
    assert.throws(() => paintLightingMap(original, {index: 0, expectedRule: ruleIdentity(decoded.rules[0]), leds: [2], paint: 129}, opts), /read-only/);
    assert.throws(() => decodeLightingDomain(original, {...opts, allowUnknown: false}), e => e.code === "INVALID_REFERENCE");
    assert.throws(() => decodeLightingDomain(original, options), e => e.code === "INVALID_REFERENCE");
    const edited = editLightingIdentity(original, {kind: 1, id: 3, field: "colour", slot: 1, colour: {h: 177, s: 188, v: 199}}, opts);
    const after = decodeLightingDomain(edited, opts);
    assert.deepEqual(after.maps, decoded.maps);assert.deepEqual(after.rules[0], decoded.rules[0]);
    assert.deepEqual(after.palette.slice(0, profile.palette.length), profile.palette);
});
