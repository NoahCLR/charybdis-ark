"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const {SETTINGS, SETTING, SETTING_FIELD, SETTING_FIELDS, MATRIX_POSITIONS, validSetting, defaultLayerRecord, encodeSettings, decodeSettings} = require("../../core/schema/settings-domain-v1");

// Compiled defaults as the firmware sets them (portable-profile-v1.md):
// scalar 27 retired at zero, behaviours on, every layer in both masks, every
// layer referring combos to itself with nothing bypassed or excluded.
const defaults = () => ({values: [200,150,400,150,1,4,1200,25,1,3,0,0,0,0,0,200,400,900000,1200,200,1,257,0xc8ff00,1,0,200,10,0,1,0xffff,0xffff],
    names: Array.from({length: 16}, (_, id) => id < 8 ? `Layer ${id}` : ""), layers: Array.from({length: 16}, (_, layer) => defaultLayerRecord(layer)),
    macroNames: Array(128).fill(""), customKeyNames: Array(128).fill(""), formatVersion: 6});
const thirtyTwo = (seed, fill) => `${seed}`.padEnd(32, fill);
const full = () => ({...defaults(), names: Array.from({length: 16}, (_, i) => thirtyTwo(`L${i}`, "-")),
    macroNames: Array.from({length: 128}, (_, i) => thirtyTwo(i, "~")), customKeyNames: Array.from({length: 128}, (_, i) => thirtyTwo(`Key ${i}`, "!"))});
const withValue = (id, v) => { const value = defaults(); value.values[id] = v; return value; };
const withLayer = (layer, record) => { const value = defaults(); value.layers[layer] = {...value.layers[layer], ...record}; return value; };

test("the layout constants are the firmware's version 6 domain", () => {
    assert.deepEqual([SETTINGS.VERSION, SETTINGS.COUNT, SETTINGS.LAYERS, SETTINGS.MACRO_NAMES, SETTINGS.CUSTOM_KEY_NAMES], [6, 31, 16, 128, 128]);
    assert.deepEqual([SETTINGS.SCALARS_OFFSET, SETTINGS.LAYER_RECORDS_OFFSET, SETTINGS.FIXED_SIZE, SETTINGS.MIN_SIZE, SETTINGS.MAX_SIZE], [8, 132, 404, 676, 9380]);
    assert.deepEqual([SETTING.UNICODE_HOST_MODE, SETTING.BEHAVIORS_ENABLED, SETTING.LAYER_BEHAVIORS, SETTING.LAYER_COMBOS], [27, 28, 29, 30]);
    assert.equal(MATRIX_POSITIONS, 60);
    assert.deepEqual(defaultLayerRecord(9), {reference: 9, bypass: [], exclude: []});
});

test("the stored field table determines scalar geometry and layer-reference rewrites", () => {
    assert.equal(SETTINGS.COUNT, SETTING_FIELDS.length);
    assert.equal(SETTINGS.LAYER_RECORDS_OFFSET, SETTINGS.SCALARS_OFFSET + SETTING_FIELDS.length * 4);
    assert.equal(SETTINGS.FIXED_SIZE, SETTINGS.LAYER_RECORDS_OFFSET + SETTINGS.LAYERS * SETTINGS.LAYER_RECORD_SIZE);
    assert.deepEqual(SETTING_FIELDS.filter(field => field.layerReference).map(field => [field.name, field.layerReference, field.layerReorder]), [
        ["AUTO_MOUSE_LAYER", "layer", "storage"], ["AUTO_SNIPING_LAYER", "layer", "storage"],
        ["DEFAULT_LAYERS", "mask", "reach"], ["LAYER_BEHAVIORS", "mask", "storage"], ["LAYER_COMBOS", "mask", "storage"],
    ]);
    assert.ok(Object.isFrozen(SETTING_FIELDS));
});

// Every stored value by the firmware's name (profile_settings_v1.h), with the
// values either side of each limit portable-profile-v1.md gives it: accepted,
// then refused, in a sixteen-layer bank.
const EDGES = {
    TAPPING_TERM: [[0, 65535], [65536]], TAP_HOLD_TERM: [[0, 65535], [65536]], LONG_HOLD_TERM: [[0, 65535], [65536]], MULTI_TAP_TERM: [[0, 65535], [65536]],
    AUTO_MOUSE_ENABLED: [[0, 1], [2]], AUTO_MOUSE_LAYER: [[0, 15], [16]], AUTO_MOUSE_TIMEOUT: [[0, 65535], [65536]], AUTO_MOUSE_DEBOUNCE: [[0, 255], [256]],
    AUTO_SNIPING_ENABLED: [[0, 1], [2]], AUTO_SNIPING_LAYER: [[0, 15], [16]],
    DRAGSCROLL_DPI: [[0], [1, 400]], VOLUME_DPI: [[0], [1]], BRIGHTNESS_DPI: [[0], [1]], ZOOM_DPI: [[0], [1]], ARROW_DPI: [[0], [1]],
    FEEDBACK_PERIOD: [[1, 65535], [0, 65536]], AUTO_MOUSE_DEAD_TIME: [[0, 65535], [65536]], RGB_TIMEOUT: [[0, 86400000], [86400001]],
    DEFAULT_DPI: [[400, 600, 3400], [200, 500, 3600]], SNIPING_DPI: [[100, 200, 400], [0, 150, 500]],
    COMBOS_ENABLED: [[0, 1], [2]], RGB_MODE: [[0, 1, 0xffffff01], [2, 0xff, 0xffffffff]], RGB_COLOR: [[0, 0xffffff], [0x1000000]],
    DEFAULT_LAYERS: [[1, 0xffff], [0, 0x10000]], KEYMAP_OPTIONS: [[0, 65535], [65536]], AUTO_MOUSE_DELAY: [[0, 65535], [65536]], AUTO_MOUSE_THRESHOLD: [[0, 65535], [65536]],
    UNICODE_HOST_MODE: [[0, 3, 0x103, 0x1000103], [4, 0x200, 0x2000000]],
    BEHAVIORS_ENABLED: [[0, 1], [2]], LAYER_BEHAVIORS: [[0, 0xffff], [0x10000]], LAYER_COMBOS: [[0, 0xffff], [0x10000]],
};

test("every stored value is named once, in ID order, and accepts only what the firmware does", () => {
    assert.deepEqual(Object.keys(SETTING_FIELD), Object.keys(EDGES));
    assert.equal(Object.keys(SETTING).length, SETTINGS.COUNT);
    Object.values(SETTING_FIELD).forEach((field, id) => {
        assert.equal(field.id, id);
        assert.equal(SETTING[field.name], id);
        assert.ok(Object.isFrozen(field));
    });
    for (const [name, [accepted, refused]] of Object.entries(EDGES)) {
        const id = SETTING[name];
        for (const v of accepted) assert.ok(validSetting(id, v), `${name} accepts ${v}`);
        for (const v of [...refused, -1, 1.5, 2 ** 32]) assert.equal(validSetting(id, v), false, `${name} refuses ${v}`);
    }
    // Layers and layer masks follow the bank they are judged in.
    for (const name of ["AUTO_MOUSE_LAYER", "AUTO_SNIPING_LAYER"]) assert.ok(validSetting(SETTING[name], 7, 8) && !validSetting(SETTING[name], 8, 8));
    for (const name of ["DEFAULT_LAYERS", "LAYER_BEHAVIORS", "LAYER_COMBOS"]) assert.ok(validSetting(SETTING[name], 0xff, 8) && !validSetting(SETTING[name], 0x100, 8));
    // A plain range carries its bounds for an editor.
    assert.deepEqual([SETTING_FIELD.AUTO_MOUSE_DEBOUNCE.max, SETTING_FIELD.RGB_TIMEOUT.max, SETTING_FIELD.FEEDBACK_PERIOD.min], [255, 86400000, 1]);
    assert.deepEqual([SETTING_FIELD.DEFAULT_DPI.min, SETTING_FIELD.DEFAULT_DPI.max, SETTING_FIELD.DEFAULT_DPI.step], [400, 3400, 200]);
});

test("settings v6 round-trip Unicode names, layer records, zero settings and every name", () => {
    const value = defaults(); value.names[1] = "Édition ⌘"; value.names[15] = "Top"; value.macroNames[3] = "Sign-off"; value.macroNames[127] = "Last macro";
    value.customKeyNames[127] = "Last key";
    value.layers[2] = {reference: 0, bypass: [0, 7, 8, 59], exclude: [12, 33]};
    value.layers[15] = {reference: 14, bypass: [], exclude: [59]};
    const bytes = encodeSettings(value);
    assert.deepEqual([...bytes.subarray(0, 8)], [6, 16, 31, 128, 128, 0, 0, 0]);
    const nameBytes = [...value.names, ...value.macroNames, ...value.customKeyNames].reduce((sum, name) => sum + Buffer.byteLength(name), 0);
    assert.equal(bytes.length, SETTINGS.MIN_SIZE + nameBytes);
    const layer2 = SETTINGS.LAYER_RECORDS_OFFSET + 2 * SETTINGS.LAYER_RECORD_SIZE;
    assert.deepEqual([...bytes.subarray(layer2, layer2 + 17)], [0, 0x81, 0x01, 0, 0, 0, 0, 0, 0x08, 0, 0x10, 0, 0, 2, 0, 0, 0]);
    assert.equal(bytes.readUInt32LE(SETTINGS.SCALARS_OFFSET + 29 * 4), 0xffff);
    assert.deepEqual(decodeSettings(bytes), value);
    const empty = encodeSettings({...defaults(), names: Array(16).fill("")});
    assert.equal(empty.length, SETTINGS.MIN_SIZE);
    assert.deepEqual(decodeSettings(empty), {...defaults(), names: Array(16).fill("")});
});

test("settings reject invalid durations, the retired pointing DPI and the retired combo references", () => {
    assert.throws(() => encodeSettings(withValue(16, 1200)), /Invalid keyboard settings/);
    assert.throws(() => encodeSettings(withValue(10, 100)), /Invalid keyboard settings/);
    assert.throws(() => encodeSettings(withValue(27, 0x76543210)), /Invalid keyboard settings/);
    assert.throws(() => encodeSettings({...defaults(), values: defaults().values.slice(0, 28)}), /Invalid keyboard settings/);
    const bytes = encodeSettings(defaults());
    const dpi = Buffer.from(bytes); dpi.writeUInt32LE(100, SETTINGS.SCALARS_OFFSET + 10 * 4);
    assert.throws(() => decodeSettings(dpi), /Invalid keyboard settings/);
    const references = Buffer.from(bytes); references.writeUInt32LE(0x76543210, SETTINGS.SCALARS_OFFSET + 27 * 4);
    assert.throws(() => decodeSettings(references), /Invalid keyboard settings/);
});

test("the behaviour master switch and the per-layer masks hold sixteen layers", () => {
    assert.ok(validSetting(28, 0) && validSetting(28, 1) && !validSetting(28, 2));
    for (const id of [29, 30]) {
        for (const ok of [0, 1, 0x8000, 0xffff]) assert.deepEqual(decodeSettings(encodeSettings(withValue(id, ok))).values[id], ok, `${id}=${ok}`);
        for (const bad of [0x10000, 0x80000000, -1, 1.5]) assert.throws(() => encodeSettings(withValue(id, bad)), /Invalid keyboard settings/, `${id}=${bad}`);
    }
    assert.throws(() => encodeSettings(withValue(28, 2)), /Invalid keyboard settings/);
    assert.equal(decodeSettings(encodeSettings(withValue(28, 0))).values[28], 0);
    assert.ok(validSetting(23, 0x8000) && !validSetting(23, 0x10000) && !validSetting(23, 0));
    for (const id of [5, 9]) {
        assert.equal(decodeSettings(encodeSettings(withValue(id, 15))).values[id], 15);
        assert.throws(() => encodeSettings(withValue(id, 16)), /Invalid keyboard settings/);
    }
    const mask = Buffer.from(encodeSettings(defaults())); mask.writeUInt32LE(0x1ffff, SETTINGS.SCALARS_OFFSET + 30 * 4);
    assert.throws(() => decodeSettings(mask), /Invalid keyboard settings/);
});

test("layer records keep the reference in the bank and placements on the matrix", () => {
    assert.equal(decodeSettings(encodeSettings(withLayer(3, {reference: 15}))).layers[3].reference, 15);
    for (const reference of [16, -1, 1.5, undefined]) assert.throws(() => encodeSettings(withLayer(3, {reference})), /reference layer/, String(reference));
    const edge = decodeSettings(encodeSettings(withLayer(4, {bypass: [59], exclude: [0]}))).layers[4];
    assert.deepEqual(edge, {reference: 4, bypass: [59], exclude: [0]});
    for (const key of ["bypass", "exclude"]) {
        for (const position of [60, 63, 64, -1, 2.5]) assert.throws(() => encodeSettings(withLayer(4, {[key]: [position]})), /key position/, `${key} ${position}`);
    }
    assert.throws(() => encodeSettings({...defaults(), layers: defaults().layers.slice(1)}), /layer records/);
    assert.throws(() => encodeSettings({...defaults(), layers: undefined}), /layer records/);
    const bytes = encodeSettings(defaults());
    const record = SETTINGS.LAYER_RECORDS_OFFSET + 5 * SETTINGS.LAYER_RECORD_SIZE;
    const reference = Buffer.from(bytes); reference[record] = 16;
    assert.throws(() => decodeSettings(reference), /reference layer/);
    // Bit 60 is byte 7 bit 4: a position this keyboard does not have, in either bitmap.
    for (const offset of [1 + 7, 9 + 7]) {
        const placement = Buffer.from(bytes); placement[record + offset] = 0x10;
        assert.throws(() => decodeSettings(placement), /key position/);
        const last = Buffer.from(bytes); last[record + offset] = 0x08;
        assert.deepEqual(decodeSettings(last).layers[5][offset === 8 ? "bypass" : "exclude"], [59]);
    }
    // A smaller matrix moves the bound with it.
    assert.throws(() => encodeSettings(withLayer(0, {bypass: [48]}), 16, 48), /key position/);
    assert.deepEqual(decodeSettings(encodeSettings(withLayer(0, {bypass: [47]}), 16, 48), 16, 48).layers[0].bypass, [47]);
});

test("names are 32 bytes of UTF-8 at most: full tables fit, longer or control names are refused", () => {
    const bytes = encodeSettings(full());
    assert.equal(bytes.length, SETTINGS.MAX_SIZE);
    assert.deepEqual(decodeSettings(bytes), full());
    const multibyte = "é".repeat(16), euros = "ab" + "€".repeat(10);
    assert.equal(Buffer.byteLength(multibyte), 32);
    assert.equal(Buffer.byteLength(euros), 32);
    assert.equal(decodeSettings(encodeSettings({...defaults(), names: defaults().names.map((n, i) => i ? n : euros)})).names[0], euros);
    assert.equal(decodeSettings(encodeSettings({...defaults(), macroNames: defaults().macroNames.map((n, i) => i ? n : multibyte)})).macroNames[0], multibyte);
    for (const name of ["x".repeat(33), multibyte + "x", euros + "€", "tab\t", "del\x7f", "nul\0", "\ud800", 7]) {
        assert.throws(() => encodeSettings({...full(), names: full().names.map((n, i) => i ? n : name)}), /layer name/);
        assert.throws(() => encodeSettings({...full(), macroNames: full().macroNames.map((n, i) => i ? n : name)}), /macro name/);
        assert.throws(() => encodeSettings({...full(), customKeyNames: full().customKeyNames.map((n, i) => i ? n : name)}), /custom key name/);
    }
    assert.throws(() => encodeSettings({...full(), names: full().names.slice(1)}), /layer names/);
    assert.throws(() => encodeSettings({...full(), customKeyNames: full().customKeyNames.slice(1)}), /custom key names/);
    assert.throws(() => encodeSettings({...full(), macroNames: undefined}), /macro names/);
});

test("decoded names must be well-formed, counted and within 32 bytes", () => {
    const one = encodeSettings({...defaults(), names: Array(16).fill(""), macroNames: defaults().macroNames.map((n, i) => i ? n : "éx")});
    const at = SETTINGS.FIXED_SIZE + 16; // macro 0's length byte, after sixteen empty layer names
    assert.equal(one[at], 3);
    for (const [label, patch] of [["cut multibyte", b => { b[at] = 1; }], ["stray continuation", b => { b[at + 1] = 0x80; }], ["overlong", b => { b[at + 1] = 0xc0; b[at + 2] = 0x80; }],
        ["control", b => { b[at + 3] = 0x1f; }], ["DEL", b => { b[at + 3] = 0x7f; }]]) {
        const bytes = Buffer.from(one); patch(bytes);
        assert.throws(() => decodeSettings(bytes), /Invalid name encoding|Unexpected settings data|Invalid name length/, label);
    }
    const cut = Buffer.from(one); cut[at] = 1;
    assert.throws(() => decodeSettings(cut), /Invalid name encoding/, "a length that cuts é is refused, not trimmed");
    const long = Buffer.concat([one.subarray(0, at), Buffer.from([33]), Buffer.alloc(33, 0x61), one.subarray(at + 4)]);
    assert.throws(() => decodeSettings(long), /Invalid name length/);
    const past = Buffer.from(one); past[one.length - 1] = 5;
    assert.throws(() => decodeSettings(past), /Invalid name length/);
    assert.throws(() => decodeSettings(one.subarray(0, one.length - 1)), /Missing name|Unsupported settings format/);
});

test("only version 6 is read or written: the retired versions and reserved bytes are refused", () => {
    for (const formatVersion of [5, 4, 7]) assert.throws(() => encodeSettings({...defaults(), formatVersion}), /Unsupported settings format/);
    const bytes = encodeSettings(defaults());
    for (const header of [[5, 8, 28, 64, 64], [4, 8, 28, 64, 0], [3, 8, 28, 64, 0], [2, 8, 28, 16, 0], [1, 8, 28, 16, 0], [6, 8, 31, 128, 128], [6, 16, 28, 128, 128], [6, 16, 31, 64, 128], [6, 16, 31, 128, 64],
        [6, 16, 31, 128, 128, 1], [6, 16, 31, 128, 128, 0, 0, 1]]) {
        const relabelled = Buffer.from(bytes); relabelled.set(header);
        assert.throws(() => decodeSettings(relabelled), /Unsupported settings format/, header.join());
    }
    assert.throws(() => decodeSettings(Buffer.concat([bytes, Buffer.from([0])])), /Unexpected settings data/);
    assert.throws(() => decodeSettings(bytes.subarray(0, SETTINGS.MIN_SIZE - 1)), /Unsupported settings format/);
    assert.throws(() => decodeSettings(Buffer.concat([encodeSettings(full()), Buffer.from([0])])), /Unsupported settings format/);
    assert.throws(() => decodeSettings([...bytes]), /Unsupported settings format/);
});
