// @ts-check
"use strict";
// Developer-only: the C probe receives Ark's judgments and conversion bytes.
const fs = require("node:fs"), assert = require("node:assert/strict");
const vectors = require("../../upstream/firmware/tests/fixtures/lighting_vectors_v1.json");
const {decodeLightingDomain, encodeLightingDomain} = require("../../core/schema/lighting-domain-v1");
const {convertLightingV4} = require("../../core/schema/lighting-conversion-v1");
const {decodeLightingCapabilities} = require("../../core/protocol/lighting-capabilities-v1");
/** @param {number[]} ids */
const mask = ids => ids.reduce((value, id) => (value | 1 << id) >>> 0, 0);
/** @param {typeof vectors.limits} limits */
const limitsLine = limits => [limits.tapDepth, limits.logicalLayers, limits.maximumBrightness, limits.supportedModeMask,
    ...["facts", "targets", "paints", "timings", "ruleExtensions", "domainExtensions", "things"].map(name => mask(/** @type {number[]} */ (limits[/** @type {keyof typeof limits} */ (name)])))].join(" ");
const lines = [limitsLine(vectors.limits)];
for (const vector of [...vectors.codec.valid, ...vectors.render]) {
    const bytes = Buffer.from(vector.hex, "hex"), decoded = decodeLightingDomain(bytes, vectors.limits);
    assert.deepEqual(encodeLightingDomain(decoded, vectors.limits), bytes);
    lines.push(`CODEC OK 0 ${vector.name} ${vector.hex}`);
}
for (const vector of vectors.codec.invalid) {
    try {decodeLightingDomain(Buffer.from(vector.hex, "hex"), vectors.limits); throw Error(`Ark accepted ${vector.name}`);} catch (error) {
        const failure = /** @type {Error & {code: string, offset: number}} */ (error);
        assert.equal(failure.code, vector.error.code); assert.equal(failure.offset, vector.error.offset);
        lines.push(`CODEC ${failure.code} ${failure.offset} ${vector.name} ${vector.hex}`);
    }
}
for (const vector of vectors.conversion) {
    const limits = vector.limits;
    const bytes = convertLightingV4(Buffer.from(vector.v4, "hex"), {...limits,
        capabilities: {layoutVersion: 1, domainVersion: 5, tapDepth: limits.tapDepth, registries: limits,
            payloadBudget: 8192, paletteMaximum: 128, conditionsPerRule: 4, partParameterMaximum: 16, ledCount: 58}});
    assert.equal(bytes.toString("hex"), vector.hex);
    lines.push(`CONVERT ${vector.name} ${limitsLine(limits)} ${vector.v4} ${bytes.toString("hex")}`);
}
const capabilities = decodeLightingCapabilities(vectors.capability.map(hex => Buffer.from(hex, "hex")));
for (const [name, ids] of Object.entries(capabilities.registries)) assert.deepEqual(ids, vectors.limits[/** @type {keyof typeof vectors.limits} */ (name)]);
lines.push(...vectors.capability.map((hex, page) => `CAPABILITY ${page} ${hex}`));
fs.writeFileSync(process.argv[2], lines.join("\n") + "\n");
