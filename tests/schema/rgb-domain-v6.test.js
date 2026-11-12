"use strict";
// RGB format 6, a colour row for each of the 16 layers and the 32 pointing
// slots and the replacement feedback stage's record and rows (firmware
// D-F70), leading among its cases (firmware D-F72), against the firmware's
// golden vectors (rgb_domain_v6.json), then
// Ark's own further cases built from the compiled profile's lighting.
const test = require("node:test");
const assert = require("node:assert/strict");
const {RGB_AUTOCORRECT_SEMANTICS, RGB_DOMAIN_V1, RGB_EVERY_OWNER, RGB_POINTING_MODE_IDS, RGB_STAGE_BITS, decodeRgbDomainV1, encodeRgbDomainV1} = require("../../core/schema/rgb-domain-v1");
const {decodeProfileBlob, encodeProfileBlob} = require("../../core/schema/profile-blob-v1");
const {validateSnapshot} = require("../../core/model/portable-profile");
const {document} = require("../fixtures/pd-profile");
const golden = require("../../upstream/firmware/tests/fixtures/rgb_domain_v6.json");
const limits = {compiledStageMask: golden.limits.compiledStageMask, logicalLayerCount: golden.limits.logicalLayerCount,
    maximumBrightness: golden.limits.maximumBrightness, tapBranchColorCount: golden.limits.tapBranchColorCount};
const vector = name => Buffer.from([...golden.valid, ...golden.invalid].find(entry => entry.name === name).hex, "hex");

test("the firmware's format-6 vectors decode and re-encode byte for byte", () => {
    assert.equal(golden.limits.supportedPdModeMask, 0xffffffff, "all 32 slots coloured");
    assert.equal(golden.limits.compiledStageMask, 0x3f, "every stage compiled, replacement feedback among them");
    for (const entry of golden.valid) {
        const bytes = Buffer.from(entry.hex, "hex");
        const decoded = decodeRgbDomainV1(bytes, limits);
        assert.equal(decoded.pdModeColors.length, 32, entry.name);
        assert.equal(decoded.layerColors.length, 16, entry.name);
        assert.equal(encodeRgbDomainV1(decoded, limits).toString("hex"), entry.hex, entry.name);
    }
    const selector = decodeRgbDomainV1(vector("pd-group-selector-slot-31"), limits);
    assert.ok(selector.pdModeGroupRows.some(row => row.selector === 31));
});

test("the firmware's replacement feedback vectors read as its record and rows", () => {
    // The compiled defaults: on, green for text, magenta for a macro, red for
    // an undo, blue while leading, the half of the key, and the thumb LEDs
    // for every case.
    const compiled = decodeRgbDomainV1(vector("compiled"), limits);
    assert.equal(compiled.stageEnableMask & RGB_STAGE_BITS.AUTOCORRECT, RGB_STAGE_BITS.AUTOCORRECT);
    assert.deepEqual(compiled.autocorrectFeedback, {textColor: {h: 106, s: 255, v: 200}, macroColor: {h: 234, s: 255, v: 200}, undoColor: {h: 0, s: 255, v: 200}, leadingColor: {h: 170, s: 255, v: 200}, locality: 3});
    assert.deepEqual(compiled.autocorrectGroupRows.map(row => [row.semantic, row.color]), [[0xff, {h: 0, s: 0, v: 0}]]);
    const every = decodeRgbDomainV1(vector("replacement-rows-every-semantic"), limits);
    assert.deepEqual(every.autocorrectGroupRows.map(row => row.semantic).sort((a, b) => a - b), [0, 1, 2, 3, 0xff], "text, macro, undo, leading and all");
    assert.deepEqual(decodeRgbDomainV1(vector("replacement-row-leading"), limits).autocorrectGroupRows.map(row => row.semantic), [RGB_AUTOCORRECT_SEMANTICS.AUTOCORRECT_FEEDBACK_GROUP_LEADING]);
    assert.equal(decodeRgbDomainV1(vector("replacement-rows-255"), limits).autocorrectGroupRows.length, RGB_DOMAIN_V1.MAX_TABLE_GROUP_ROWS);
    const full = decodeRgbDomainV1(vector("rows-640-with-replacement"), limits);
    assert.ok(full.autocorrectGroupRows.length > 0);
    assert.equal(full.layerGroupRows.length + full.pdModeGroupRows.length + full.comboGroupRows.length + full.keyGroupRows.length + full.autocorrectGroupRows.length, RGB_DOMAIN_V1.MAX_STAGE_GROUP_ROWS);
    // Stage bit 5 clear keeps the record and its rows.
    const off = decodeRgbDomainV1(vector("replacement-stage-off"), limits);
    assert.equal(off.stageEnableMask & RGB_STAGE_BITS.AUTOCORRECT, 0);
    assert.deepEqual(off.autocorrectFeedback, compiled.autocorrectFeedback);
    assert.deepEqual(off.autocorrectGroupRows, compiled.autocorrectGroupRows);
    // A colour of saturation and value 0 paints nothing for its case, and is stored.
    const dark = decodeRgbDomainV1(vector("replacement-colours-off"), limits).autocorrectFeedback;
    assert.deepEqual([dark.textColor, dark.macroColor, dark.undoColor, dark.leadingColor], Array.from({length: 4}, () => ({h: 0, s: 0, v: 0})));
});

test("the firmware's format-6 rejections are refused with its codes", () => {
    // Ark reports RGB failures by table and row, not by byte offset, so the
    // firmware's offsets are not compared here.
    for (const entry of golden.invalid) {
        assert.throws(() => decodeRgbDomainV1(Buffer.from(entry.hex, "hex"), limits),
            error => error.code === entry.error.code, `${entry.name}: ${entry.error.code}`);
    }
    // The replacement record's and rows' refusals name where they are, as the
    // firmware's tables 12 and 13 do.
    /** @param {string} name @param {object} where */
    const at = (name, where) => assert.throws(() => decodeRgbDomainV1(vector(name), limits), error => {
        assert.deepEqual({table: error.table, row: error.row, field: error.field}, where, name);
        return true;
    });
    at("replacement-locality-5", {table: "autocorrectFeedback", row: 0, field: "locality"});
    at("replacement-value-over-limit", {table: "autocorrectFeedback", row: 0, field: "macroColor.v"});
    at("replacement-leading-value-over-limit", {table: "autocorrectFeedback", row: 0, field: "leadingColor.v"});
    at("replacement-row-semantic-4", {table: "autocorrectGroupRows", row: 0, field: "semantic"});
    at("replacement-row-group-out-of-range", {table: "autocorrectGroupRows", row: 0, field: "groupId"});
});

const reject = (fn, code) => assert.throws(fn, error => error.code === code, `expected ${code}`);
// The compiled profile's lighting: a row for every slot.
const v6 = () => validateSnapshot(document()).rgb;
const black = {h: 0, s: 0, v: 0};

test("format 6 colours 16 layers and 32 pointing slots and round-trips", () => {
    assert.equal(RGB_DOMAIN_V1.POINTING_SLOTS, 32);
    assert.equal(RGB_POINTING_MODE_IDS.POINTING_MODE_31, 31);
    const encoded = encodeRgbDomainV1(v6());
    assert.equal(encoded[0], 6);
    assert.equal(encoded[5], 16, "header byte 5 counts the layer colours");
    assert.equal(encoded[7], 32, "header byte 7 counts the PD colours");
    const decoded = decodeRgbDomainV1(encoded);
    assert.equal(decoded.formatVersion, 6);
    assert.deepEqual(decoded.layerColors.map(row => row.layerId), Array.from({length: 16}, (_, id) => id));
    assert.deepEqual(decoded.pdModeColors.map(row => row.pdModeId), Array.from({length: 32}, (_, id) => id));
    assert.deepEqual(encodeRgbDomainV1(decoded), encoded);
    const blob = encodeProfileBlob({schema: {major: 4, minor: 7}, domains: [{id: 0x10, version: 6, payload: encoded}]});
    assert.equal(decodeProfileBlob(blob).domains[0].version, 6);
});

test("format 6 ends with the replacement record and its rows, counted in header byte 14", () => {
    const profile = v6();
    profile.stageEnableMask |= RGB_STAGE_BITS.AUTOCORRECT;
    profile.autocorrectFeedback = {textColor: {h: 1, s: 2, v: 3}, macroColor: {h: 4, s: 5, v: 6}, undoColor: {h: 7, s: 8, v: 9}, leadingColor: {h: 13, s: 14, v: 15}, locality: 4};
    profile.autocorrectGroupRows = [];
    const bare = encodeRgbDomainV1(profile);
    assert.equal(bare[2] & 0x20, 0x20, "stage bit 5");
    assert.equal(bare[14], 0);
    assert.equal(bare[15], 0, "byte 15 stays reserved");
    assert.deepEqual([...bare.subarray(bare.length - 13)], [1, 2, 3, 4, 5, 6, 7, 8, 9, 13, 14, 15, 4], "text, macro, undo and leading colours, then the locality");
    profile.autocorrectGroupRows = [
        {semantic: RGB_AUTOCORRECT_SEMANTICS.AUTOCORRECT_FEEDBACK_GROUP_LEADING, color: {h: 10, s: 11, v: 12}, groupId: 0},
        {semantic: RGB_AUTOCORRECT_SEMANTICS.AUTOCORRECT_FEEDBACK_GROUP_ALL, color: black, groupId: 1},
    ];
    const encoded = encodeRgbDomainV1(profile);
    assert.equal(encoded[14], 2, "header byte 14 counts the replacement rows");
    assert.equal(encoded.length, bare.length + 10, "five bytes a row");
    assert.deepEqual([...encoded.subarray(encoded.length - 10)], [3, 10, 11, 12, 0, 0xff, 0, 0, 0, 1], "semantic, colour, group; rows keep their stored order");
    const decoded = decodeRgbDomainV1(encoded);
    assert.deepEqual(decoded.autocorrectFeedback, profile.autocorrectFeedback);
    assert.deepEqual(decoded.autocorrectGroupRows, profile.autocorrectGroupRows);
    assert.deepEqual(encodeRgbDomainV1(decoded), encoded);
    // The payload is 48 + 9G + 5L + 5LG + 5P + 5PG + 4CG + 3T + 5KG + 5RG bytes.
    const d = decoded;
    assert.equal(encoded.length, 48 + 9 * d.groups.length + 5 * d.layerColors.length + 5 * d.layerGroupRows.length + 5 * d.pdModeColors.length + 5 * d.pdModeGroupRows.length
        + 4 * d.comboGroupRows.length + 3 * d.keyFeedback.tapBranchColors.length + 5 * d.keyGroupRows.length + 5 * d.autocorrectGroupRows.length);
    assert.equal(RGB_EVERY_OWNER.autocorrect, "AUTOCORRECT_FEEDBACK_GROUP_ALL");
});

test("the largest format-6 domain is 4,652 bytes", () => {
    const profile = v6();
    const ledsOf = id => Array.from({length: 7}, (unused, led) => led).filter(led => (id >> led) & 1);
    profile.groups = Array.from({length: RGB_DOMAIN_V1.MAX_GROUPS}, (_, id) => ({id, leds: id === 0 ? [57] : ledsOf(id)}));
    const rows = (length, field) => Array.from({length}, (unused, row) => ({[field]: 255, color: black, groupId: row % RGB_DOMAIN_V1.MAX_GROUPS}));
    profile.layerGroupRows = rows(255, "selector");
    profile.pdModeGroupRows = rows(255, "selector");
    profile.comboGroupRows = [];
    profile.keyGroupRows = [];
    profile.autocorrectGroupRows = rows(130, "semantic");
    assert.equal(encodeRgbDomainV1(profile).length, 4652);
    profile.autocorrectGroupRows = rows(131, "semantic");
    assert.throws(() => encodeRgbDomainV1(profile), error => error.code === "CAPACITY_EXCEEDED" && error.limit === "lightingGroupRows" && error.most === 640, "the replacement rows count toward the 640");
    profile.layerGroupRows = []; profile.pdModeGroupRows = [];
    profile.autocorrectGroupRows = rows(256, "semantic");
    assert.throws(() => encodeRgbDomainV1(profile), error => error.code === "CAPACITY_EXCEEDED" && error.limit === "lightingTableGroupRows" && error.table === "autocorrectGroupRows" && error.most === 255);
});

test("the replacement record and its rows are refused as the firmware refuses them", () => {
    const base = () => { const profile = v6(); profile.autocorrectGroupRows = [{semantic: 0, color: black, groupId: 0}]; return profile; };
    const bytes = () => encodeRgbDomainV1(base());
    const record = bytes().length - 18, row = bytes().length - 5;
    /** @param {(bytes: Buffer) => void} change @param {string} code @param {{table?: string, row?: number, field?: string}} [where] */
    const refused = (change, code, where) => {
        const changed = bytes(); change(changed);
        assert.throws(() => decodeRgbDomainV1(changed), error => {
            assert.equal(error.code, code);
            if (where) assert.deepEqual({table: error.table, row: error.row, field: error.field}, where);
            return true;
        });
    };
    refused(b => { b[0] = 4; }, "INVALID_VERSION");
    refused(b => { b[15] = 1; }, "RESERVED_BITS");
    refused(b => { b[2] |= 0x40; }, "RESERVED_BITS");
    refused(b => { b[3] = 0x80; }, "RESERVED_BITS");
    for (const [colour, field] of [[0, "textColor.v"], [1, "macroColor.v"], [2, "undoColor.v"], [3, "leadingColor.v"]]) {
        const changed = bytes(); changed[record + colour * 3 + 2] = 201;
        assert.throws(() => decodeRgbDomainV1(changed, {maximumBrightness: 200}), error => error.code === "BRIGHTNESS_EXCEEDED" && error.table === "autocorrectFeedback" && error.field === field, field);
    }
    refused(b => { b[record + 12] = 5; }, "INVALID_ENUM", {table: "autocorrectFeedback", row: 0, field: "locality"});
    refused(b => { b[row] = 4; }, "INVALID_SELECTOR", {table: "autocorrectGroupRows", row: 0, field: "semantic"});
    refused(b => { b[row] = 0xfe; }, "INVALID_SELECTOR", {table: "autocorrectGroupRows", row: 0, field: "semantic"});
    refused(b => { b[row + 4] = b[4]; }, "INVALID_REFERENCE", {table: "autocorrectGroupRows", row: 0, field: "groupId"});
    const brightRow = bytes(); brightRow[row + 3] = 201;
    assert.throws(() => decodeRgbDomainV1(brightRow, {maximumBrightness: 200}), error => error.code === "BRIGHTNESS_EXCEEDED" && error.table === "autocorrectGroupRows");
    reject(() => decodeRgbDomainV1(bytes().subarray(0, bytes().length - 1)), "TRUNCATED");
    reject(() => decodeRgbDomainV1(Buffer.concat([bytes(), Buffer.from([0])])), "TRAILING_BYTES");
    // One row more than the payload holds, and one fewer.
    refused(b => { b[14] = 2; }, "TRUNCATED");
    refused(b => { b[14] = 0; }, "TRAILING_BYTES");
    // The encoder refuses the same.
    for (const [change, code] of /** @type {[((profile: any) => void), string][]} */ ([
        [profile => { profile.autocorrectFeedback.locality = 5; }, "INVALID_ENUM"],
        [profile => { profile.autocorrectGroupRows[0].semantic = 4; }, "INVALID_SELECTOR"],
        [profile => { profile.autocorrectGroupRows[0].groupId = profile.groups.length; }, "INVALID_REFERENCE"],
        [profile => { profile.stageEnableMask |= 0x40; }, "RESERVED_BITS"],
    ])) {
        const profile = base(); change(profile);
        reject(() => encodeRgbDomainV1(profile), code);
    }
    const bright = base(); bright.autocorrectFeedback.leadingColor = {h: 0, s: 0, v: 201};
    reject(() => encodeRgbDomainV1(bright, {maximumBrightness: 200}), "BRIGHTNESS_EXCEEDED");
});

test("a build without the stage takes the zero record and no rows, and refuses its bit", () => {
    const without = {compiledStageMask: 0x1f};
    const profile = v6();
    profile.stageEnableMask &= ~RGB_STAGE_BITS.AUTOCORRECT;
    profile.autocorrectFeedback = {textColor: black, macroColor: black, undoColor: black, leadingColor: black, locality: 0};
    profile.autocorrectGroupRows = [];
    const encoded = encodeRgbDomainV1(profile, without);
    assert.deepEqual(decodeRgbDomainV1(encoded, without).autocorrectFeedback, profile.autocorrectFeedback);
    reject(() => encodeRgbDomainV1({...profile, stageEnableMask: profile.stageEnableMask | RGB_STAGE_BITS.AUTOCORRECT}, without), "UNSUPPORTED_STAGE");
    const bit = Buffer.from(encoded); bit[2] |= 0x20;
    reject(() => decodeRgbDomainV1(bit, without), "UNSUPPORTED_STAGE");
    for (const change of /** @type {((profile: any) => void)[]} */ ([
        value => { value.autocorrectFeedback.textColor = {h: 1, s: 0, v: 0}; },
        value => { value.autocorrectFeedback.macroColor = {h: 0, s: 1, v: 0}; },
        value => { value.autocorrectFeedback.undoColor = {h: 0, s: 0, v: 1}; },
        value => { value.autocorrectFeedback.leadingColor = {h: 0, s: 0, v: 1}; },
        value => { value.autocorrectFeedback.locality = 1; },
        value => { value.autocorrectGroupRows = [{semantic: 0xff, color: black, groupId: 0}]; },
    ])) {
        const changed = structuredClone(profile); change(changed);
        reject(() => encodeRgbDomainV1(changed, without), "UNSUPPORTED_STAGE_DATA");
        reject(() => decodeRgbDomainV1(encodeRgbDomainV1(changed), without), "UNSUPPORTED_STAGE_DATA");
    }
});

test("format 6 needs every layer's and slot's row once, and selectors in range", () => {
    const missing = v6(); missing.pdModeColors.splice(20, 1);
    reject(() => encodeRgbDomainV1(missing), "INCOMPLETE_SURFACE");
    const doubled = v6(); doubled.pdModeColors[20].pdModeId = 21;
    reject(() => encodeRgbDomainV1(doubled), "DUPLICATE_ID");
    const high = v6(); high.pdModeColors[31].pdModeId = 32;
    reject(() => encodeRgbDomainV1(high), "INVALID_ID");
    const selector = v6(); selector.pdModeGroupRows.push({selector: 31, color: {h: 0, s: 0, v: 0}, groupId: 0});
    assert.equal(decodeRgbDomainV1(encodeRgbDomainV1(selector)).pdModeGroupRows.at(-1).selector, 31);
    selector.pdModeGroupRows.at(-1).selector = 32;
    reject(() => encodeRgbDomainV1(selector), "INVALID_SELECTOR");
    const layerMissing = v6(); layerMissing.layerColors.splice(12, 1);
    reject(() => encodeRgbDomainV1(layerMissing), "INCOMPLETE_SURFACE");
    const layerSelector = v6(); layerSelector.layerGroupRows.push({selector: 15, color: {h: 0, s: 0, v: 0}, groupId: 0});
    assert.equal(decodeRgbDomainV1(encodeRgbDomainV1(layerSelector)).layerGroupRows.at(-1).selector, 15);
    layerSelector.layerGroupRows.at(-1).selector = 16;
    reject(() => encodeRgbDomainV1(layerSelector), "INVALID_SELECTOR");
    // The retired formats 1 to 5, and any later one, are refused.
    for (const version of [1, 2, 3, 4, 5, 7]) {
        const bytes = encodeRgbDomainV1(v6()); bytes[0] = version;
        reject(() => decodeRgbDomainV1(bytes), "INVALID_VERSION");
        reject(() => encodeRgbDomainV1({...v6(), formatVersion: version}), "INVALID_VERSION");
    }
});
