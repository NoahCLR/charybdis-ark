"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const {decodeRgbDomainV1, encodeRgbDomainV1} = require("../../core/schema/rgb-domain-v1");
const fixture = Object.fromEntries(fs.readFileSync(process.argv[2] + "/tests/fixtures/rgb_domain_v1.fixture", "utf8")
    .split(/\r?\n/).filter(line => line && !line.startsWith("#")).map(line => line.split("=")));
const options = {
    compiledStageMask: Number(fixture["codec.compiled_stage_mask"]),
    logicalLayerCount: Number(fixture["codec.logical_layer_count"]),
    maximumBrightness: Number(fixture["codec.maximum_brightness"]),
    tapBranchColorCount: Number(fixture["codec.tap_branch_color_count"]),
    supportedPdModeIds: Array.from({length: 8}, (_, id) => id).filter(id => Number(fixture["codec.supported_pd_mode_mask"]) & (1 << id)),
};
const version = Number(process.argv[4]);
let golden = Buffer.from(fixture["payload.hex"], "hex");
if (version === 2) {
    const model = decodeRgbDomainV1(golden, options);
    model.formatVersion = 2;
    options.supportedPdModeIds.push(6, 7);
    model.pdModeColors.push(...[6, 7].map(pdModeId => ({pdModeId, color: {h: 0, s: 0, v: 0}, locality: 0})));
    golden = encodeRgbDomainV1(model, options);
}
assert.deepEqual(encodeRgbDomainV1(decodeRgbDomainV1(golden, options), options), golden);
const chunks = [Buffer.from([options.compiledStageMask, options.logicalLayerCount, options.maximumBrightness,
    options.tapBranchColorCount, version === 2 ? 255 : 63])];
let accepted = 0, rejected = 0;
function add(bytes) {
    let valid = 1;
    try {
        // Ark can read backups of either version. Each firmware binary accepts
        // only its compiled schema; compare against that selected contract.
        if (bytes[0] !== version) throw new Error("Different compiled schema");
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
