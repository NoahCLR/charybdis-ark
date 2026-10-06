"use strict";
// RGB format 3: format 2 with a colour row for each of the 32-slot firmware's
// pointing slots, against the firmware's golden vectors (rgb_domain_v3.json),
// then Ark's own further cases built from the eight-slot fixture's lighting.
const test = require("node:test");
const assert = require("node:assert/strict");
const {RGB_PD_MODE_IDS, RGB_PD_SLOTS_BY_FORMAT, decodeRgbDomainV1, encodeRgbDomainV1, rgbFormatForPdSlots} = require("../../core/schema/rgb-domain-v1");
const {decodeProfileBlob, encodeProfileBlob} = require("../../core/schema/profile-blob-v1");
const {validateSnapshot} = require("../../core/model/portable-profile");
const {document} = require("../fixtures/pd-profile");
const golden = require("../../upstream/firmware/tests/fixtures/rgb_domain_v3.json");
const limits = {compiledStageMask: golden.limits.compiledStageMask, logicalLayerCount: golden.limits.logicalLayerCount,
    maximumBrightness: golden.limits.maximumBrightness, tapBranchColorCount: golden.limits.tapBranchColorCount};

test("the firmware's format-3 vectors decode and re-encode byte for byte", () => {
    assert.equal(golden.limits.supportedPdModeMask, 0xffffffff, "all 32 slots coloured");
    for (const vector of golden.valid) {
        const bytes = Buffer.from(vector.hex, "hex");
        const decoded = decodeRgbDomainV1(bytes, {...limits, formatVersion: 3});
        assert.equal(decoded.pdModeColors.length, 32, vector.name);
        assert.equal(encodeRgbDomainV1(decoded, limits).toString("hex"), vector.hex, vector.name);
    }
    const selector = decodeRgbDomainV1(Buffer.from(golden.valid.find(vector => vector.name === "pd-group-selector-slot-31").hex, "hex"), limits);
    assert.ok(selector.pdModeGroupRows.some(row => row.selector === 31));
});

test("the firmware's format-3 rejections are refused with its codes", () => {
    // Ark reports RGB failures by table and row, not by byte offset, so the
    // firmware's offsets are not compared here.
    for (const vector of golden.invalid) {
        assert.throws(() => decodeRgbDomainV1(Buffer.from(vector.hex, "hex"), {...limits, formatVersion: 3}),
            error => error.code === vector.error.code, `${vector.name}: ${vector.error.code}`);
    }
});

const reject = (fn, code) => assert.throws(fn, error => error.code === code, `expected ${code}`);
// The eight-slot fixture's lighting, as format 2.
const v2 = () => validateSnapshot(document()).rgb;
const v3 = () => {
    const rgb = v2(); rgb.formatVersion = 3;
    for (let id = 8; id < 32; id++) rgb.pdModeColors.push({pdModeId: id, color: {h: id, s: 0, v: 0}, locality: 2});
    return rgb;
};

test("format 3 colours 32 pointing slots and round-trips", () => {
    assert.equal(RGB_PD_SLOTS_BY_FORMAT[3], 32);
    assert.equal(rgbFormatForPdSlots(32), 3);
    assert.equal(rgbFormatForPdSlots(8), 2);
    assert.equal(RGB_PD_MODE_IDS.PD_MODE_SLOT_31, 31);
    const encoded = encodeRgbDomainV1(v3());
    assert.equal(encoded[0], 3);
    assert.equal(encoded[7], 32, "header byte 7 counts the PD colours");
    assert.equal(encoded.length, encodeRgbDomainV1(v2()).length + 24 * 5);
    const decoded = decodeRgbDomainV1(encoded);
    assert.equal(decoded.formatVersion, 3);
    assert.deepEqual(decoded.pdModeColors.map(row => row.pdModeId), Array.from({length: 32}, (_, id) => id));
    assert.deepEqual(encodeRgbDomainV1(decoded), encoded);
    const blob = encodeProfileBlob({schema: {major: 2, minor: 0}, domains: [{id: 0x10, version: 3, payload: encoded}]});
    assert.equal(decodeProfileBlob(blob).domains[0].version, 3);
});

test("format 3 needs every slot's row once, and selectors below 32", () => {
    const missing = v3(); missing.pdModeColors.splice(20, 1);
    reject(() => encodeRgbDomainV1(missing), "INCOMPLETE_SURFACE");
    const doubled = v3(); doubled.pdModeColors[20].pdModeId = 21;
    reject(() => encodeRgbDomainV1(doubled), "DUPLICATE_ID");
    const high = v3(); high.pdModeColors[31].pdModeId = 32;
    reject(() => encodeRgbDomainV1(high), "INVALID_ID");
    const selector = v3(); selector.pdModeGroupRows.push({selector: 31, color: {h: 0, s: 0, v: 0}, groupId: 0});
    assert.equal(decodeRgbDomainV1(encodeRgbDomainV1(selector)).pdModeGroupRows.at(-1).selector, 31);
    selector.pdModeGroupRows.at(-1).selector = 32;
    reject(() => encodeRgbDomainV1(selector), "INVALID_SELECTOR");
    // A format-3 payload whose header promises only eight rows.
    const bytes = encodeRgbDomainV1(v2()); bytes[0] = 3;
    reject(() => decodeRgbDomainV1(bytes), "INCOMPLETE_SURFACE");
    // Format 2 still stops at eight.
    const eight = v2(); eight.pdModeColors.push({pdModeId: 8, color: {h: 0, s: 0, v: 0}, locality: 2});
    reject(() => encodeRgbDomainV1(eight), "INVALID_ID");
    const four = v3(); four.formatVersion = 4;
    reject(() => encodeRgbDomainV1(four), "INVALID_VERSION");
});
