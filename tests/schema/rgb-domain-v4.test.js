"use strict";
// RGB format 4, a colour row for each of the 16 layers and the 32 pointing
// slots, against the firmware's golden vectors (rgb_domain_v4.json), then
// Ark's own further cases built from the compiled profile's lighting.
const test = require("node:test");
const assert = require("node:assert/strict");
const {RGB_DOMAIN_V1, RGB_PD_MODE_IDS, decodeRgbDomainV1, encodeRgbDomainV1} = require("../../core/schema/rgb-domain-v1");
const {decodeProfileBlob, encodeProfileBlob} = require("../../core/schema/profile-blob-v1");
const {validateSnapshot} = require("../../core/model/portable-profile");
const {document} = require("../fixtures/pd-profile");
const golden = require("../../upstream/firmware/tests/fixtures/rgb_domain_v4.json");
const limits = {compiledStageMask: golden.limits.compiledStageMask, logicalLayerCount: golden.limits.logicalLayerCount,
    maximumBrightness: golden.limits.maximumBrightness, tapBranchColorCount: golden.limits.tapBranchColorCount};

test("the firmware's format-4 vectors decode and re-encode byte for byte", () => {
    assert.equal(golden.limits.supportedPdModeMask, 0xffffffff, "all 32 slots coloured");
    for (const vector of golden.valid) {
        const bytes = Buffer.from(vector.hex, "hex");
        const decoded = decodeRgbDomainV1(bytes, limits);
        assert.equal(decoded.pdModeColors.length, 32, vector.name);
        assert.equal(decoded.layerColors.length, 16, vector.name);
        assert.equal(encodeRgbDomainV1(decoded, limits).toString("hex"), vector.hex, vector.name);
    }
    const selector = decodeRgbDomainV1(Buffer.from(golden.valid.find(vector => vector.name === "pd-group-selector-slot-31").hex, "hex"), limits);
    assert.ok(selector.pdModeGroupRows.some(row => row.selector === 31));
});

test("the firmware's format-4 rejections are refused with its codes", () => {
    // Ark reports RGB failures by table and row, not by byte offset, so the
    // firmware's offsets are not compared here.
    for (const vector of golden.invalid) {
        assert.throws(() => decodeRgbDomainV1(Buffer.from(vector.hex, "hex"), limits),
            error => error.code === vector.error.code, `${vector.name}: ${vector.error.code}`);
    }
});

const reject = (fn, code) => assert.throws(fn, error => error.code === code, `expected ${code}`);
// The compiled profile's lighting: a row for every slot.
const v4 = () => validateSnapshot(document()).rgb;

test("format 4 colours 16 layers and 32 pointing slots and round-trips", () => {
    assert.equal(RGB_DOMAIN_V1.PD_SLOTS, 32);
    assert.equal(RGB_PD_MODE_IDS.PD_MODE_SLOT_31, 31);
    const encoded = encodeRgbDomainV1(v4());
    assert.equal(encoded[0], 4);
    assert.equal(encoded[5], 16, "header byte 5 counts the layer colours");
    assert.equal(encoded[7], 32, "header byte 7 counts the PD colours");
    const decoded = decodeRgbDomainV1(encoded);
    assert.equal(decoded.formatVersion, 4);
    assert.deepEqual(decoded.layerColors.map(row => row.layerId), Array.from({length: 16}, (_, id) => id));
    assert.deepEqual(decoded.pdModeColors.map(row => row.pdModeId), Array.from({length: 32}, (_, id) => id));
    assert.deepEqual(encodeRgbDomainV1(decoded), encoded);
    const blob = encodeProfileBlob({schema: {major: 3, minor: 0}, domains: [{id: 0x10, version: 4, payload: encoded}]});
    assert.equal(decodeProfileBlob(blob).domains[0].version, 4);
});

test("format 4 needs every layer's and slot's row once, and selectors in range", () => {
    const missing = v4(); missing.pdModeColors.splice(20, 1);
    reject(() => encodeRgbDomainV1(missing), "INCOMPLETE_SURFACE");
    const doubled = v4(); doubled.pdModeColors[20].pdModeId = 21;
    reject(() => encodeRgbDomainV1(doubled), "DUPLICATE_ID");
    const high = v4(); high.pdModeColors[31].pdModeId = 32;
    reject(() => encodeRgbDomainV1(high), "INVALID_ID");
    const selector = v4(); selector.pdModeGroupRows.push({selector: 31, color: {h: 0, s: 0, v: 0}, groupId: 0});
    assert.equal(decodeRgbDomainV1(encodeRgbDomainV1(selector)).pdModeGroupRows.at(-1).selector, 31);
    selector.pdModeGroupRows.at(-1).selector = 32;
    reject(() => encodeRgbDomainV1(selector), "INVALID_SELECTOR");
    const layerMissing = v4(); layerMissing.layerColors.splice(12, 1);
    reject(() => encodeRgbDomainV1(layerMissing), "INCOMPLETE_SURFACE");
    const layerSelector = v4(); layerSelector.layerGroupRows.push({selector: 15, color: {h: 0, s: 0, v: 0}, groupId: 0});
    assert.equal(decodeRgbDomainV1(encodeRgbDomainV1(layerSelector)).layerGroupRows.at(-1).selector, 15);
    layerSelector.layerGroupRows.at(-1).selector = 16;
    reject(() => encodeRgbDomainV1(layerSelector), "INVALID_SELECTOR");
    // The retired formats 1 to 3, and any later one, are refused.
    for (const version of [1, 2, 3, 5]) {
        const bytes = encodeRgbDomainV1(v4()); bytes[0] = version;
        reject(() => decodeRgbDomainV1(bytes), "INVALID_VERSION");
        reject(() => encodeRgbDomainV1({...v4(), formatVersion: version}), "INVALID_VERSION");
    }
});
