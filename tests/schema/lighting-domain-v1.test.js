"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const vectors = require("../../upstream/firmware/tests/fixtures/lighting_vectors_v1.json");
const {decodeLightingDomain, encodeLightingDomain} = require("../../core/schema/lighting-domain-v1");
for (const c of vectors.codec.valid) test(`lighting codec round-trip: ${c.name}`, () => {
    const bytes = Buffer.from(c.hex, "hex"); assert.deepEqual(encodeLightingDomain(decodeLightingDomain(bytes, vectors.limits), vectors.limits), bytes);
});
for (const c of vectors.codec.invalid) test(`lighting codec rejects: ${c.name}`, () => {
    assert.throws(() => decodeLightingDomain(Buffer.from(c.hex, "hex"), vectors.limits), e => e.code === c.error.code && e.offset === c.error.offset);
});
