"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
    RGB_DOMAIN_V1,
    RGB_STAGE_BITS,
    createRgbDomainV1,
    decodeRgbDomainV1,
    encodeRgbDomainV1,
} = require("../../core/schema/rgb-domain-v1");
const {
    crc32,
    decodeProfileBlob,
    encodeProfileBlob,
    fnv1a32,
} = require("../../core/schema/profile-blob-v1");
const {PROFILE_DOMAIN_IDS} = require("../../core/schema/profile-domains");

function fixture() {
    const semantic = JSON.parse(fs.readFileSync(path.join(__dirname, "../fixtures/rgb-domain-v1.json"), "utf8"));
    const vectors = Object.fromEntries(fs.readFileSync(path.resolve(__dirname, "../../upstream/firmware/tests/fixtures/rgb_domain_v1.fixture"), "utf8")
        .split(/\r?\n/u)
        .filter((line) => line && !line.startsWith("#"))
        .map((line) => {
            const separator = line.indexOf("=");
            return [line.slice(0, separator), line.slice(separator + 1)];
        }));
    return {
        ...semantic,
        codecOptions: {
            compiledStageMask: Number(vectors["codec.compiled_stage_mask"]),
            logicalLayerCount: Number(vectors["codec.logical_layer_count"]),
            maximumBrightness: Number(vectors["codec.maximum_brightness"]),
            tapBranchColorCount: Number(vectors["codec.tap_branch_color_count"]),
            supportedPdModeIds: Array.from({length: 6}, (unused, id) => id)
                .filter((id) => (Number(vectors["codec.supported_pd_mode_mask"]) & (1 << id)) !== 0),
        },
        payloadHex: vectors["payload.hex"],
        blobHex: vectors["blob.hex"],
        fnv1a32: vectors["blob.fnv1a32"],
        crc32: vectors["blob.crc32"],
    };
}

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function assertCode(code, callback) {
    assert.throws(callback, (error) => error?.code === code, `expected RGB protocol error ${code}`);
}

function remapGroupIds(profile, mapping) {
    for (const group of profile.groups) group.id = mapping[group.id];
    for (const table of [profile.layerGroupRows, profile.pdModeGroupRows, profile.comboGroupRows, profile.keyGroupRows, profile.autocorrectGroupRows]) {
        for (const row of table) row.groupId = mapping[row.groupId];
    }
}

test("representative RGB payload and whole-profile blob match the shared C/JavaScript golden vectors", () => {
    const golden = fixture();
    const payload = encodeRgbDomainV1(golden.profile, golden.codecOptions);
    assert.equal(payload.toString("hex"), golden.payloadHex);
    assert.deepEqual(decodeRgbDomainV1(payload, golden.codecOptions), golden.profile);

    const blob = encodeProfileBlob({schema: {major: 4, minor: 5}, domains: [createRgbDomainV1(golden.profile, golden.codecOptions)]});
    assert.equal(blob.toString("hex"), golden.blobHex);
    assert.equal(fnv1a32(blob), Number.parseInt(golden.fnv1a32, 16));
    assert.equal(crc32(blob), Number.parseInt(golden.crc32, 16));
    const decoded = decodeProfileBlob(blob);
    assert.equal(decoded.domains.length, 1);
    assert.equal(decoded.domains[0].id, PROFILE_DOMAIN_IDS.RGB);
    assert.equal(decoded.domains[0].version, 5);
    assert.deepEqual(decodeRgbDomainV1(decoded.domains[0].payload, golden.codecOptions), golden.profile);
});

test("identity tables canonicalize while renderer row order stays authored", () => {
    const golden = fixture();
    const expected = encodeRgbDomainV1(golden.profile, golden.codecOptions);

    const direct = clone(golden.profile);
    direct.groups.reverse();
    direct.layerColors.reverse();
    direct.pdModeColors.reverse();
    remapGroupIds(direct, {0: 2, 1: 1, 2: 0});
    assert.deepEqual(encodeRgbDomainV1(direct, golden.codecOptions), expected);

    const reorderedRows = clone(golden.profile);
    reorderedRows.layerGroupRows.reverse();
    assert.notDeepEqual(encodeRgbDomainV1(reorderedRows, golden.codecOptions), expected);
});

test("decoder rejects noncanonical headers, geometry, dictionary order, and bitmap bits", () => {
    const golden = fixture();
    const valid = encodeRgbDomainV1(golden.profile, golden.codecOptions);
    // Byte 14 counts the replacement feedback rows (format 5); 1 and 15 stay reserved.
    for (const offset of [1, 15]) {
        const reserved = Buffer.from(valid);
        reserved[offset] = 1;
        assertCode("RESERVED_BITS", () => decodeRgbDomainV1(reserved, golden.codecOptions));
    }
    const stageBit = Buffer.from(valid);
    stageBit[2] |= 0x40;
    assertCode("RESERVED_BITS", () => decodeRgbDomainV1(stageBit, golden.codecOptions));
    // Bit 5 is replacement feedback, which this build does not compile.
    const uncompiledStage = Buffer.from(valid);
    uncompiledStage[2] |= 0x20;
    assertCode("UNSUPPORTED_STAGE", () => decodeRgbDomainV1(uncompiledStage, golden.codecOptions));
    for (const [offset, value] of [[12, 57], [13, 7]]) {
        const geometry = Buffer.from(valid);
        geometry[offset] = value;
        assertCode("INCOMPATIBLE_GEOMETRY", () => decodeRgbDomainV1(geometry, golden.codecOptions));
    }

    const reservedLedBits = Buffer.from(valid);
    reservedLedBits[24] = 0x04;
    assertCode("RESERVED_BITS", () => decodeRgbDomainV1(reservedLedBits, golden.codecOptions));
    const duplicateBitmap = Buffer.from(valid);
    valid.copy(duplicateBitmap, 26, 17, 25);
    assertCode("DUPLICATE_BITMAP", () => decodeRgbDomainV1(duplicateBitmap, golden.codecOptions));
    const noncanonicalDictionary = Buffer.from(valid);
    valid.copy(noncanonicalDictionary, 17, 26, 34);
    valid.copy(noncanonicalDictionary, 26, 17, 25);
    assertCode("NONCANONICAL", () => decodeRgbDomainV1(noncanonicalDictionary, golden.codecOptions));
    const noncanonicalId = Buffer.from(valid);
    noncanonicalId[16] = 1;
    assertCode("NONCANONICAL_ORDER", () => decodeRgbDomainV1(noncanonicalId, golden.codecOptions));
});

test("strict decoder rejects invalid references, selectors, enums, brightness, and PD ids", () => {
    const golden = fixture();
    const valid = encodeRgbDomainV1(golden.profile, golden.codecOptions);
    const badReference = Buffer.from(valid);
    badReference[62] = 3;
    assertCode("INVALID_REFERENCE", () => decodeRgbDomainV1(badReference, golden.codecOptions));
    const badLayerSelector = Buffer.from(valid);
    badLayerSelector[58] = 3;
    assertCode("INVALID_SELECTOR", () => decodeRgbDomainV1(badLayerSelector, golden.codecOptions));
    const badLayerMode = Buffer.from(valid);
    badLayerMode[47] = 2;
    assertCode("INVALID_ENUM", () => decodeRgbDomainV1(badLayerMode, golden.codecOptions));
    const tooBright = Buffer.from(valid);
    tooBright[46] = 201;
    assertCode("BRIGHTNESS_EXCEEDED", () => decodeRgbDomainV1(tooBright, golden.codecOptions));
    const badPdId = Buffer.from(valid);
    badPdId[72] = 6;
    assertCode("INVALID_ID", () => decodeRgbDomainV1(badPdId, golden.codecOptions));
});

test("complete RGB surfaces and negotiated feature inclusion are enforced", () => {
    const golden = fixture();
    const missingLayer = clone(golden.profile);
    missingLayer.layerColors.pop();
    assertCode("INCOMPLETE_SURFACE", () => encodeRgbDomainV1(missingLayer, golden.codecOptions));
    const missingPdMode = clone(golden.profile);
    missingPdMode.pdModeColors.pop();
    assertCode("INCOMPLETE_SURFACE", () => encodeRgbDomainV1(missingPdMode, golden.codecOptions));
    const missingTapColor = clone(golden.profile);
    missingTapColor.keyFeedback.tapBranchColors.pop();
    assertCode("INCOMPLETE_SURFACE", () => encodeRgbDomainV1(missingTapColor, golden.codecOptions));

    const unsupportedEnable = clone(golden.profile);
    assertCode("UNSUPPORTED_STAGE", () => encodeRgbDomainV1(unsupportedEnable, {
        ...golden.codecOptions,
        compiledStageMask: 30,
    }));
    const unsupportedData = clone(golden.profile);
    unsupportedData.stageEnableMask &= ~RGB_STAGE_BITS.AUTOMOUSE;
    assertCode("UNSUPPORTED_STAGE_DATA", () => encodeRgbDomainV1(unsupportedData, {
        ...golden.codecOptions,
        compiledStageMask: 29,
    }));

    const layerOnly = clone(golden.profile);
    layerOnly.stageEnableMask = RGB_STAGE_BITS.LAYER;
    layerOnly.automouseFade = {mode: 0, endColor: {h: 0, s: 0, v: 0}};
    layerOnly.pdModeColors = [];
    layerOnly.pdModeGroupRows = [];
    layerOnly.comboFeedback = {color: {h: 0, s: 0, v: 0}, locality: 0};
    layerOnly.comboGroupRows = [];
    layerOnly.keyFeedback = {
        tapBranchColors: [],
        tapCommittedColor: {h: 0, s: 0, v: 0},
        holdActiveColor: {h: 0, s: 0, v: 0},
        longHoldActiveColor: {h: 0, s: 0, v: 0},
        tapCommitMode: 0,
        locality: 0,
    };
    layerOnly.keyGroupRows = [];
    layerOnly.autocorrectFeedback = {textColor: {h: 0, s: 0, v: 0}, macroColor: {h: 0, s: 0, v: 0}, undoColor: {h: 0, s: 0, v: 0}, locality: 0};
    layerOnly.autocorrectGroupRows = [];
    const layerOptions = {...golden.codecOptions, compiledStageMask: RGB_STAGE_BITS.LAYER};
    assert.deepEqual(decodeRgbDomainV1(encodeRgbDomainV1(layerOnly, layerOptions), layerOptions), layerOnly);
});

test("fixed v1 group, row, tap-color, LED, and payload boundaries are enforced", () => {
    const golden = fixture();
    const maximum = clone(golden.profile);
    // Firmware D-F63: 128 LED sets, 255 rows in one table, 640 in all.
    const ledsOf = (/** @type {number} */ id) => Array.from({length: 7}, (unused, led) => led).filter((led) => (id >> led) & 1);
    maximum.groups = Array.from({length: RGB_DOMAIN_V1.MAX_GROUPS}, (_, id) => ({id, leds: id === 0 ? Array.from({length: 58}, (unused, led) => led) : ledsOf(id)}));
    const rows = (/** @type {number} */ length) => Array.from({length}, (unused, row) => ({selector: 255, color: {h: 0, s: 0, v: 0}, groupId: row % RGB_DOMAIN_V1.MAX_GROUPS}));
    const keyRows = (/** @type {number} */ length) => Array.from({length}, (unused, row) => ({semantic: 255, color: {h: 0, s: 0, v: 0}, groupId: row % RGB_DOMAIN_V1.MAX_GROUPS}));
    const rest = RGB_DOMAIN_V1.MAX_STAGE_GROUP_ROWS - 2 * RGB_DOMAIN_V1.MAX_TABLE_GROUP_ROWS;
    maximum.layerGroupRows = rows(RGB_DOMAIN_V1.MAX_TABLE_GROUP_ROWS);
    maximum.pdModeGroupRows = rows(RGB_DOMAIN_V1.MAX_TABLE_GROUP_ROWS);
    maximum.comboGroupRows = [];
    maximum.keyGroupRows = keyRows(rest);
    const maximumBytes = encodeRgbDomainV1(maximum, golden.codecOptions);
    const maximumDecoded = decodeRgbDomainV1(maximumBytes, golden.codecOptions);
    assert.equal(maximumDecoded.groups.length, RGB_DOMAIN_V1.MAX_GROUPS);
    assert.equal(maximumDecoded.layerGroupRows.length, RGB_DOMAIN_V1.MAX_TABLE_GROUP_ROWS);
    assert.equal(maximumDecoded.layerGroupRows.length + maximumDecoded.pdModeGroupRows.length + maximumDecoded.keyGroupRows.length, RGB_DOMAIN_V1.MAX_STAGE_GROUP_ROWS);
    assert.deepEqual(maximumDecoded.groups.find((group) => group.leds.length === 58).leds, Array.from({length: 58}, (unused, led) => led));

    const tooManyGroups = clone(golden.profile);
    tooManyGroups.groups = Array.from({length: RGB_DOMAIN_V1.MAX_GROUPS + 1}, (_, id) => ({id, leds: [id]}));
    assertCode("CAPACITY_EXCEEDED", () => encodeRgbDomainV1(tooManyGroups, golden.codecOptions));
    const tooManyInTable = clone(maximum);
    tooManyInTable.layerGroupRows = rows(RGB_DOMAIN_V1.MAX_TABLE_GROUP_ROWS + 1);
    tooManyInTable.keyGroupRows = [];
    assert.throws(() => encodeRgbDomainV1(tooManyInTable, golden.codecOptions), (error) => error.code === "CAPACITY_EXCEEDED" && error.limit === "lightingTableGroupRows" && error.most === RGB_DOMAIN_V1.MAX_TABLE_GROUP_ROWS);
    const tooManyRows = clone(maximum);
    tooManyRows.keyGroupRows = keyRows(rest + 1);
    assert.throws(() => encodeRgbDomainV1(tooManyRows, golden.codecOptions), (error) => error.code === "CAPACITY_EXCEEDED" && error.limit === "lightingGroupRows" && error.most === RGB_DOMAIN_V1.MAX_STAGE_GROUP_ROWS);
    // A keyboard that reports smaller ceilings (firmware before D-F63) holds
    // a profile to them.
    const olderKeyboard = {...golden.codecOptions, maxGroups: 16, maxTableGroupRows: 32, maxGroupRows: 32};
    assert.throws(() => encodeRgbDomainV1(maximum, olderKeyboard), (error) => error.code === "CAPACITY_EXCEEDED" && error.limit === "lightingGroups" && error.most === 16);
    const olderRows = clone(maximum);
    olderRows.groups = maximum.groups.slice(0, 16);
    olderRows.layerGroupRows = rows(20).map((row) => ({...row, groupId: row.groupId % 16}));
    olderRows.pdModeGroupRows = rows(13).map((row) => ({...row, groupId: row.groupId % 16}));
    olderRows.keyGroupRows = [];
    assert.throws(() => encodeRgbDomainV1(olderRows, olderKeyboard), (error) => error.code === "CAPACITY_EXCEEDED" && error.limit === "lightingGroupRows" && error.most === 32);
    assert.throws(() => encodeRgbDomainV1(maximum, {...golden.codecOptions, maxGroupRows: 641}), RangeError);
    const tooManyTapColors = clone(golden.profile);
    tooManyTapColors.keyFeedback.tapBranchColors.push({h: 0, s: 0, v: 0});
    assertCode("CAPACITY_EXCEEDED", () => encodeRgbDomainV1(tooManyTapColors, golden.codecOptions));
    const badLed = clone(golden.profile);
    badLed.groups[0].leds = [58];
    assertCode("INVALID_LED", () => encodeRgbDomainV1(badLed, golden.codecOptions));
    const duplicateGroup = clone(golden.profile);
    duplicateGroup.groups[1].leds = [];
    assertCode("DUPLICATE_BITMAP", () => encodeRgbDomainV1(duplicateGroup, golden.codecOptions));
});

test("decoder rejects header count overflow, truncation, and trailing bytes", () => {
    const golden = fixture();
    const valid = encodeRgbDomainV1(golden.profile, golden.codecOptions);
    const groupOverflow = Buffer.from(valid);
    groupOverflow[4] = RGB_DOMAIN_V1.MAX_GROUPS + 1;
    assertCode("CAPACITY_EXCEEDED", () => decodeRgbDomainV1(groupOverflow, golden.codecOptions));
    const rowOverflow = Buffer.from(valid);
    rowOverflow[6] = RGB_DOMAIN_V1.MAX_TABLE_GROUP_ROWS;
    rowOverflow[8] = RGB_DOMAIN_V1.MAX_TABLE_GROUP_ROWS;
    rowOverflow[9] = RGB_DOMAIN_V1.MAX_STAGE_GROUP_ROWS + 1 - 2 * RGB_DOMAIN_V1.MAX_TABLE_GROUP_ROWS;
    rowOverflow[11] = 0;
    assertCode("CAPACITY_EXCEEDED", () => decodeRgbDomainV1(rowOverflow, golden.codecOptions));
    const olderOverflow = Buffer.from(valid);
    olderOverflow[6] = 33;
    olderOverflow[8] = 0;
    olderOverflow[9] = 0;
    olderOverflow[11] = 0;
    assertCode("CAPACITY_EXCEEDED", () => decodeRgbDomainV1(olderOverflow, {...golden.codecOptions, maxGroupRows: 32}));
    assertCode("TRUNCATED", () => decodeRgbDomainV1(valid.subarray(0, valid.length - 1), golden.codecOptions));
    assertCode("TRAILING_BYTES", () => decodeRgbDomainV1(Buffer.concat([valid, Buffer.from([0])]), golden.codecOptions));
    assertCode("TRUNCATED", () => decodeRgbDomainV1(Buffer.alloc(RGB_DOMAIN_V1.HEADER_SIZE - 1), golden.codecOptions));
});
