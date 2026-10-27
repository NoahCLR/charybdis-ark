// @ts-check
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const {decodeRgbDomainV1, encodeRgbDomainV1} = require("../../core/schema/rgb-domain-v1");
// Format 4, the sixteen-layer firmware's, from its own golden compiled domain
// (rgb_domain_v4.json): the only RGB format it reads.
/** @type {unknown} */
const input = require(process.argv[2] + "/tests/fixtures/rgb_domain_v4.json");
assert(input && typeof input === "object" && "limits" in input && "valid" in input);
const limits = input.limits, vectors = input.valid;
assert(limits && typeof limits === "object");
assert("compiledStageMask" in limits && typeof limits.compiledStageMask === "number");
assert("logicalLayerCount" in limits && typeof limits.logicalLayerCount === "number");
assert("maximumBrightness" in limits && typeof limits.maximumBrightness === "number");
assert("tapBranchColorCount" in limits && typeof limits.tapBranchColorCount === "number");
assert("supportedPdModeMask" in limits && typeof limits.supportedPdModeMask === "number");
assert(Array.isArray(vectors) && vectors.every((/** @type {unknown} */ vector) => vector && typeof vector === "object" && "name" in vector && typeof vector.name === "string" && "hex" in vector && typeof vector.hex === "string"));
const v3 = {limits: {compiledStageMask: limits.compiledStageMask, logicalLayerCount: limits.logicalLayerCount, maximumBrightness: limits.maximumBrightness, tapBranchColorCount: limits.tapBranchColorCount, supportedPdModeMask: limits.supportedPdModeMask}, valid: /** @type {{name: string, hex: string}[]} */ (vectors)};
const version = 4;
const options = {compiledStageMask: v3.limits.compiledStageMask, logicalLayerCount: v3.limits.logicalLayerCount,
    maximumBrightness: v3.limits.maximumBrightness, tapBranchColorCount: v3.limits.tapBranchColorCount,
    supportedPdModeIds: Array.from({length: 32}, (_, id) => id).filter(id => (v3.limits.supportedPdModeMask >>> id) & 1)};
const compiled = v3.valid.find(vector => vector.name === "compiled");
assert(compiled, "The RGB corpus must contain its compiled vector.");
let golden = Buffer.from(compiled.hex, "hex");
assert.deepEqual(encodeRgbDomainV1(decodeRgbDomainV1(golden, options), options), golden);
if (process.argv[4]) {
    const model = decodeRgbDomainV1(golden, options);
    options.tapBranchColorCount = Number(process.argv[4]) - 1;
    model.keyFeedback.tapBranchColors = Array.from({length: options.tapBranchColorCount}, (_, h) => ({h, s: 255, v: 10}));
    golden = encodeRgbDomainV1(model, options);
}
// The probe's limits: four single bytes, then the pointing slot mask as 32 bits.
const config = Buffer.alloc(8);
config.set([options.compiledStageMask, options.logicalLayerCount, options.maximumBrightness, options.tapBranchColorCount]);
config.writeUInt32LE(options.supportedPdModeIds.reduce((mask, id) => (mask | (1 << id)) >>> 0, 0), 4);
/** @type {Buffer[]} */
const chunks = [config];
let accepted = 0, rejected = 0;
/** @param {Buffer} bytes */
function add(bytes) {
    let valid = 1;
    try {
        // Ark still reads older backups' formats; the firmware takes only
        // format 4, so a byte that makes another format is a rejection.
        if (bytes[0] !== version) throw new Error("Another RGB format");
        decodeRgbDomainV1(bytes, options); accepted++;
    } catch {valid = 0; rejected++;}
    const header = Buffer.alloc(3); header[0] = valid; header.writeUInt16LE(bytes.length, 1);
    chunks.push(header, bytes);
}
add(golden);
// Exercise every header, count, bitmap, locality, selector and colour byte.
for (let offset = 0; offset < golden.length; offset++) {
    for (const value of [0, 1, 2, 3, 4, 7, 31, 58, 63, 127, 200, 201, 255]) {
        const bytes = Buffer.from(golden); bytes[offset] = value; add(bytes);
    }
}
for (let length = 0; length < golden.length; length++) add(golden.subarray(0, length));
add(Buffer.concat([golden, Buffer.from([0])]));
// Fresh app encodings, beyond frozen golden bytes.
for (let hue = 0; hue <= 255; hue += 17) {
    const model = decodeRgbDomainV1(golden, options);
    model.layerColors[0].color = {h: hue, s: 255 - hue, v: Math.min(hue, options.maximumBrightness)};
    const encoded = encodeRgbDomainV1(model, options);
    assert.deepEqual(decodeRgbDomainV1(encoded, options), model);
    add(encoded);
}
assert(accepted > 10 && rejected > 10);
fs.writeFileSync(process.argv[3], Buffer.concat(chunks));
console.log(`RGB corpus: ${accepted} accepted and ${rejected} rejected by Ark`);
