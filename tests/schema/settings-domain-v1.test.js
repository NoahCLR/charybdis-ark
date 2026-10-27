"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const {SETTINGS, SHORTCUT_KEYS, SHORTCUT_LAYER_KINDS, SETTING, SETTING_FIELD, SETTING_FIELDS, MATRIX_POSITIONS, validSetting, validShortcutKey, shortcutKeysRefusal, shortcutStoreRefusal, SHORTCUT_KEY_REFUSALS, defaultLayerRecord, encodeSettings, decodeSettings} = require("../../core/schema/settings-domain-v1");

// Compiled defaults as the firmware sets them (profile-wire-v1/settings-domain.md):
// scalar 27 retired at zero, auto-sniping on Navigation (layer 3) alone,
// behaviours on, every layer in both masks, every layer referring combos to
// itself with nothing bypassed or excluded.
const defaults = () => ({comboOutputBehaviors: true, values: [200,150,400,150,1,4,1200,25,1,1 << 3,0,0,0,0,0,200,400,900000,1200,200,1,257,0xc8ff00,1,0,200,10,0,1,0xffff,0xffff],
    names: Array.from({length: 16}, (_, id) => id < 8 ? `Layer ${id}` : ""), layers: Array.from({length: 16}, (_, layer) => defaultLayerRecord(layer)),
    macroNames: Array(128).fill(""), customKeyNames: Array(128).fill(""), customKeyShortcuts: Array.from({length: 128}, () => ({mods: 0, keys: [], layers: 0, layerKind: 0})), keyboardName: "", formatVersion: 11});
const thirtyTwo = (seed, fill) => `${seed}`.padEnd(32, fill);
const full = () => ({...defaults(), names: Array.from({length: 16}, (_, i) => thirtyTwo(`L${i}`, "-")),
    macroNames: Array.from({length: 128}, (_, i) => thirtyTwo(i, "~")), customKeyNames: Array.from({length: 128}, (_, i) => thirtyTwo(`Key ${i}`, "!")),
    // Six keys each: four keyboard keys, a media key, then a system or mouse key.
    customKeyShortcuts: Array.from({length: 128}, (_, i) => ({mods: 255 - i,
        keys: [...[0, 1, 2, 3].map(key => 0x04 + (i * 4 + key) % 0xa1), 0xa8 + i % 27, i % 2 ? 0xa5 + i % 3 : 0xcd + i % 16],
        layers: (i * 0x0203) & 0xfffe, layerKind: (i * 0x0203) & 0xfffe ? i % 5 : 0})),
    keyboardName: thirtyTwo("Charybdis", "*")});
const withShortcut = (slot, shortcut) => { const value = defaults(); value.customKeyShortcuts[slot] = shortcut; return value; };
const withValue = (id, v) => { const value = defaults(); value.values[id] = v; return value; };
const withLayer = (layer, record) => { const value = defaults(); value.layers[layer] = {...value.layers[layer], ...record}; return value; };

test("the layout constants are the firmware's version 11 domain", () => {
    assert.deepEqual([SETTINGS.VERSION, SETTINGS.COUNT, SETTINGS.LAYERS, SETTINGS.MACRO_NAMES, SETTINGS.CUSTOM_KEY_NAMES, SETTINGS.CUSTOM_KEY_SHORTCUTS], [11, 31, 16, 128, 128, 128]);
    // 128 ten-byte shortcuts at 404, then 273 counted names: 16 layers, 128
    // macros, 128 custom keys and the keyboard (profile-wire-v1/settings-domain.md).
    assert.deepEqual([SETTINGS.SCALARS_OFFSET, SETTINGS.LAYER_RECORDS_OFFSET, SETTINGS.SHORTCUTS_OFFSET, SETTINGS.SHORTCUT_SIZE, SETTINGS.SHORTCUT_KEY_COUNT, SETTINGS.FIXED_SIZE, SETTINGS.MIN_SIZE, SETTINGS.MAX_SIZE], [8, 132, 404, 10, 6, 1684, 1957, 10693]);
    assert.deepEqual([SETTING.UNICODE_HOST_MODE, SETTING.BEHAVIORS_ENABLED, SETTING.LAYER_BEHAVIORS, SETTING.LAYER_COMBOS], [27, 28, 29, 30]);
    assert.equal(MATRIX_POSITIONS, 60);
    assert.deepEqual(defaultLayerRecord(9), {reference: 9, bypass: [], exclude: []});
});

test("the stored field table determines scalar geometry and layer-reference rewrites", () => {
    assert.equal(SETTINGS.COUNT, SETTING_FIELDS.length);
    assert.equal(SETTINGS.LAYER_RECORDS_OFFSET, SETTINGS.SCALARS_OFFSET + SETTING_FIELDS.length * 4);
    assert.equal(SETTINGS.SHORTCUTS_OFFSET, SETTINGS.LAYER_RECORDS_OFFSET + SETTINGS.LAYERS * SETTINGS.LAYER_RECORD_SIZE);
    assert.equal(SETTINGS.FIXED_SIZE, SETTINGS.SHORTCUTS_OFFSET + SETTINGS.CUSTOM_KEY_SHORTCUTS * SETTINGS.SHORTCUT_SIZE);
    assert.deepEqual(SETTING_FIELDS.filter(field => field.layerReference).map(field => [field.name, field.layerReference, field.layerReorder]), [
        ["AUTO_MOUSE_LAYER", "layer", "storage"], ["AUTO_SNIPING_LAYERS", "mask", "storage"],
        ["DEFAULT_LAYERS", "mask", "reach"], ["LAYER_BEHAVIORS", "mask", "storage"], ["LAYER_COMBOS", "mask", "storage"],
    ]);
    assert.ok(Object.isFrozen(SETTING_FIELDS));
});

// Every stored value by the firmware's name (profile_settings_v1.h), with the
// values either side of each limit profile-wire-v1/settings-domain.md gives it: accepted,
// then refused, in a sixteen-layer bank.
const EDGES = {
    TAPPING_TERM: [[0, 65535], [65536]], TAP_HOLD_TERM: [[0, 65535], [65536]], LONG_HOLD_TERM: [[0, 65535], [65536]], MULTI_TAP_TERM: [[0, 65535], [65536]],
    AUTO_MOUSE_ENABLED: [[0, 1], [2]], AUTO_MOUSE_LAYER: [[0, 15], [16]], AUTO_MOUSE_TIMEOUT: [[0, 65535], [65536]], AUTO_MOUSE_DEBOUNCE: [[0, 255], [256]],
    // A layer mask that may be empty: turning auto-sniping off keeps its layers.
    AUTO_SNIPING_ENABLED: [[0, 1], [2]], AUTO_SNIPING_LAYERS: [[0, 1 << 3, 0xffff], [0x10000]],
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
    assert.ok(validSetting(SETTING.AUTO_MOUSE_LAYER, 7, 8) && !validSetting(SETTING.AUTO_MOUSE_LAYER, 8, 8));
    for (const name of ["AUTO_SNIPING_LAYERS", "DEFAULT_LAYERS", "LAYER_BEHAVIORS", "LAYER_COMBOS"]) assert.ok(validSetting(SETTING[name], 0xff, 8) && !validSetting(SETTING[name], 0x100, 8));
    // A plain range carries its bounds for an editor.
    assert.deepEqual([SETTING_FIELD.AUTO_MOUSE_DEBOUNCE.max, SETTING_FIELD.RGB_TIMEOUT.max, SETTING_FIELD.FEEDBACK_PERIOD.min], [255, 86400000, 1]);
    assert.deepEqual([SETTING_FIELD.DEFAULT_DPI.min, SETTING_FIELD.DEFAULT_DPI.max, SETTING_FIELD.DEFAULT_DPI.step], [400, 3400, 200]);
});

test("settings v11 round-trip Unicode names, layer records, zero settings and every name", () => {
    const value = defaults(); value.names[1] = "Édition ⌘"; value.names[15] = "Top"; value.macroNames[3] = "Sign-off"; value.macroNames[127] = "Last macro";
    value.customKeyNames[127] = "Last key"; value.keyboardName = "Noah’s Charybdis";
    value.layers[2] = {reference: 0, bypass: [0, 7, 8, 59], exclude: [12, 33]};
    value.layers[15] = {reference: 14, bypass: [], exclude: [59]};
    const bytes = encodeSettings(value);
    assert.deepEqual([...bytes.subarray(0, 8)], [11, 16, 31, 128, 128, 0, 128, 0]);
    const nameBytes = [...value.names, ...value.macroNames, ...value.customKeyNames, value.keyboardName].reduce((sum, name) => sum + Buffer.byteLength(name), 0);
    assert.equal(bytes.length, SETTINGS.MIN_SIZE + nameBytes);
    const layer2 = SETTINGS.LAYER_RECORDS_OFFSET + 2 * SETTINGS.LAYER_RECORD_SIZE;
    assert.deepEqual([...bytes.subarray(layer2, layer2 + 17)], [0, 0x81, 0x01, 0, 0, 0, 0, 0, 0x08, 0, 0x10, 0, 0, 2, 0, 0, 0]);
    assert.equal(bytes.readUInt32LE(SETTINGS.SCALARS_OFFSET + 29 * 4), 0xffff);
    assert.deepEqual(decodeSettings(bytes), value);
    // The keyboard's name is the last record: its length, then its text.
    const keyboard = Buffer.from(value.keyboardName);
    assert.deepEqual([...bytes.subarray(bytes.length - keyboard.length - 1)], [keyboard.length, ...keyboard]);
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
    // The behaviour and combo layers, and auto-sniping's (scalar 9).
    for (const id of [29, 30, 9]) {
        for (const ok of [0, 1, 0x8000, 0xffff]) assert.deepEqual(decodeSettings(encodeSettings(withValue(id, ok))).values[id], ok, `${id}=${ok}`);
        for (const bad of [0x10000, 0x80000000, -1, 1.5]) assert.throws(() => encodeSettings(withValue(id, bad)), /Invalid keyboard settings/, `${id}=${bad}`);
    }
    assert.throws(() => encodeSettings(withValue(28, 2)), /Invalid keyboard settings/);
    assert.equal(decodeSettings(encodeSettings(withValue(28, 0))).values[28], 0);
    assert.ok(validSetting(23, 0x8000) && !validSetting(23, 0x10000) && !validSetting(23, 0));
    assert.equal(decodeSettings(encodeSettings(withValue(5, 15))).values[5], 15);
    assert.throws(() => encodeSettings(withValue(5, 16)), /Invalid keyboard settings/);
    // Auto-sniping on no layer is kept, as with its switch off.
    assert.equal(decodeSettings(encodeSettings(withValue(9, 0))).values[9], 0);
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
        assert.throws(() => encodeSettings({...full(), keyboardName: name}), /keyboard name/);
    }
    assert.equal(decodeSettings(encodeSettings({...defaults(), keyboardName: multibyte})).keyboardName, multibyte);
    assert.equal(decodeSettings(encodeSettings({...defaults(), keyboardName: euros})).keyboardName, euros);
    for (const missing of [undefined, null, ["Charybdis"]]) assert.throws(() => encodeSettings({...full(), keyboardName: missing}), /keyboard name/);
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
    // The keyboard name is read by the same rule, and is required.
    const named = encodeSettings({...defaults(), keyboardName: "éx"}), last = named.length - 4;
    assert.equal(named[last], 3);
    for (const [label, patch] of [["cut multibyte", b => { b[last] = 1; }], ["control", b => { b[last + 3] = 0x1f; }], ["DEL", b => { b[last + 3] = 0x7f; }]]) {
        const bytes = Buffer.from(named); patch(bytes);
        assert.throws(() => decodeSettings(bytes), /Invalid name encoding|Unexpected settings data|Invalid name length/, `keyboard name: ${label}`);
    }
    const overlong = Buffer.concat([named.subarray(0, last), Buffer.from([33]), Buffer.alloc(33, 0x61)]);
    assert.throws(() => decodeSettings(overlong), /Invalid name length/);
    // A body one name short lacks the keyboard name.
    const six = encodeSettings({...defaults(), names: Array(16).fill("")}).subarray(0, SETTINGS.MIN_SIZE - 1);
    assert.throws(() => decodeSettings(six), /Unsupported settings format/);
});

test("only version 11 is read or written: the retired versions and reserved bytes are refused", () => {
    for (const formatVersion of [10, 9, 8, 7, 6, 5, 4, 12]) assert.throws(() => encodeSettings({...defaults(), formatVersion}), /Unsupported settings format/);
    const bytes = encodeSettings(defaults());
    for (const header of [[5, 8, 28, 64, 64], [4, 8, 28, 64, 0], [3, 8, 28, 64, 0], [2, 8, 28, 16, 0], [1, 8, 28, 16, 0], [6, 16, 31, 128, 128], [7, 16, 31, 128, 128], [8, 16, 31, 128, 128], [9, 16, 31, 128, 128], [10, 16, 31, 128, 128], [12, 16, 31, 128, 128],
        [11, 8, 31, 128, 128], [11, 16, 28, 128, 128], [11, 16, 31, 64, 128], [11, 16, 31, 128, 64],
        [11, 16, 31, 128, 128, 2], [11, 16, 31, 128, 128, 0, 0], [11, 16, 31, 128, 128, 0, 64], [11, 16, 31, 128, 128, 0, 128, 1]]) {
        const relabelled = Buffer.from(bytes); relabelled.set(header);
        assert.throws(() => decodeSettings(relabelled), /Unsupported settings format/, header.join());
    }
    assert.throws(() => decodeSettings(Buffer.concat([bytes, Buffer.from([0])])), /Unexpected settings data/);
    assert.throws(() => decodeSettings(bytes.subarray(0, SETTINGS.MIN_SIZE - 1)), /Unsupported settings format/);
    assert.throws(() => decodeSettings(Buffer.concat([encodeSettings(full()), Buffer.from([0])])), /Unsupported settings format/);
    assert.throws(() => decodeSettings([...bytes]), /Unsupported settings format/);
});


test("the global combo-output permission changes only header byte 5 and defaults on", () => {
    const enabled = encodeSettings(defaults());
    const bypassed = encodeSettings({...defaults(), comboOutputBehaviors: false});
    assert.deepEqual([...bypassed].flatMap((byte, i) => byte === enabled[i] ? [] : [i]), [5]);
    assert.equal(bypassed[5], 1);
    assert.equal(decodeSettings(bypassed).comboOutputBehaviors, false);
    const {comboOutputBehaviors, ...oldSettings} = defaults();
    assert.deepEqual(encodeSettings(oldSettings), enabled);
    for (const invalid of [0, 1, "false", null]) assert.throws(() => encodeSettings({...defaults(), comboOutputBehaviors: invalid}));
    for (let flag = 2; flag <= 255; flag++) {
        const bytes = Buffer.from(enabled); bytes[5] = flag;
        assert.throws(() => decodeSettings(bytes), /Unsupported settings format/);
    }
});

test("a custom-key shortcut is a modifier mask and up to six keys the firmware accepts", () => {
    // Firmware D-F26, settings v11: keyboard keys KC_A..KC_EXSEL, system and
    // media keys, and the mouse keys that move, click and scroll.
    assert.deepEqual(SHORTCUT_KEYS, {BASIC_MIN: 0x04, BASIC_MAX: 0xa4, SYSTEM_MIN: 0xa5, SYSTEM_MAX: 0xa7, CONSUMER_MIN: 0xa8, CONSUMER_MAX: 0xc2, MOUSE_MIN: 0xcd, MOUSE_MAX: 0xdc});
    const accepted = [0x04, 0x0e, 0xa4, 0xa5, 0xa7, 0xa8, 0xae, 0xc2, 0xcd, 0xd1, 0xd8, 0xd9, 0xdc];
    const refused = [0, 0x01, 0x03, 0xc3, 0xcc, 0xdd, 0xdf, 0xe0, 0xe7, 0xff, 0x104, -1, 1.5];
    for (const key of accepted) assert.ok(validShortcutKey(key), `accepts 0x${key.toString(16)}`);
    for (const key of refused) assert.equal(validShortcutKey(key), false, `refuses ${key}`);
    // Mixed sides, modifiers alone, a key alone and six keys are all shortcuts.
    for (const shortcut of [{mods: 0x41, keys: [0x0e], layers: 0, layerKind: 0}, {mods: 0x0f, keys: [], layers: 0, layerKind: 0}, {mods: 0, keys: [0xd1], layers: 0, layerKind: 0},
        {mods: 0xff, keys: [0x04, 0x16, 0x07, 0xae, 0xa6, 0xdc], layers: 0, layerKind: 0}]) {
        const bytes = encodeSettings(withShortcut(5, shortcut));
        const at = SETTINGS.SHORTCUTS_OFFSET + 5 * SETTINGS.SHORTCUT_SIZE;
        assert.deepEqual([...bytes.subarray(at, at + SETTINGS.SHORTCUT_SIZE)], [shortcut.mods, ...shortcut.keys, ...Array(6 - shortcut.keys.length).fill(0), 0, 0, 0]);
        assert.deepEqual(decodeSettings(bytes).customKeyShortcuts[5], shortcut);
    }
    for (const shortcut of [{mods: 256, keys: [], layers: 0, layerKind: 0}, {mods: -1, keys: [], layers: 0, layerKind: 0}, {mods: 0, keys: [0xe0], layers: 0, layerKind: 0}, {mods: 1, keys: [0xdd], layers: 0, layerKind: 0},
        {mods: 1, keys: [0], layers: 0, layerKind: 0}, {mods: 1, layers: 0}, {mods: 1, keys: 4, layers: 0, layerKind: 0}, {mods: 1, keys: []}, null, 4]) {
        assert.throws(() => encodeSettings(withShortcut(5, shortcut)), /shortcut/, JSON.stringify(shortcut));
    }
    // A seventh key, a key twice, a second media key and a second system key
    // are refused in words.
    assert.throws(() => encodeSettings(withShortcut(5, {mods: 0, keys: [4, 5, 6, 7, 8, 9, 10], layers: 0, layerKind: 0})), /at most 6 keys/);
    assert.throws(() => encodeSettings(withShortcut(5, {mods: 0, keys: [4, 5, 4], layers: 0, layerKind: 0})), /each key once/);
    assert.throws(() => encodeSettings(withShortcut(5, {mods: 0, keys: [0xae, 0x04, 0xa9], layers: 0, layerKind: 0})), /one media key/);
    assert.throws(() => encodeSettings(withShortcut(5, {mods: 0, keys: [0xa5, 0xa7], layers: 0, layerKind: 0})), /one system key/);
    assert.equal(shortcutKeysRefusal([0xa5, 0xae, 0x04, 0x05, 0xd1, 0xcd]), "", "one system and one media key among six");
    // Each refused byte is refused for what it is, and only a modifier key is
    // told it belongs in the mask.
    const words = shortcut => { try { encodeSettings(withShortcut(5, shortcut)); return ""; } catch (error) { return error.message; } };
    const say = keys => words({mods: 1, keys, layers: 0, layerKind: 0});
    assert.equal(say([0x04, 0]), SHORTCUT_KEY_REFUSALS.none);
    assert.match(say([0]), /no empty key \(KC_NO\)/);
    assert.match(say([0x01]), /no transparent key \(KC_TRNS\)/);
    for (const key of [0xdd, 0xde, 0xdf]) assert.match(say([key]), /no mouse-key acceleration key/, `0x${key.toString(16)}`);
    for (const key of [0xe0, 0xe7]) assert.match(say([key]), /not modifier keys, which are its modifiers/, `0x${key.toString(16)}`);
    for (const key of [0x03, 0xc3, 0xcc, 0xe8, 0xff, 0x104, -1, 1.5, "KC_A"]) assert.equal(say([key]), SHORTCUT_KEY_REFUSALS.kind, String(key));
    assert.doesNotMatch(SHORTCUT_KEY_REFUSALS.kind, /modifier/, "any other byte is not told it is a modifier");
    assert.equal(say(4), SHORTCUT_KEY_REFUSALS.list, "keys that are not a list");
    assert.equal(words({mods: 1, layers: 0, layerKind: 0}), SHORTCUT_KEY_REFUSALS.list, "no keys at all");
    assert.equal(words({mods: 1, key: 4, layers: 0, layerKind: 0}), SHORTCUT_KEY_REFUSALS.single, "an old-style single key");
    assert.match(SHORTCUT_KEY_REFUSALS.single, /not as a single key/);
    for (const shortcut of [{mods: 256, keys: [], layers: 0, layerKind: 0}, {mods: 1, keys: []}, null, 4]) assert.equal(words(shortcut), SHORTCUT_KEY_REFUSALS.shape, JSON.stringify(shortcut));
    assert.equal(shortcutStoreRefusal({mods: 1, keys: [4], layers: 0, layerKind: 0}), "", "a shortcut it stores");
    assert.equal(shortcutStoreRefusal({mods: 1, key: 4, layers: 0, layerKind: 0}), SHORTCUT_KEY_REFUSALS.single, "the editor and the codec say it alike");
    assert.throws(() => encodeSettings({...defaults(), customKeyShortcuts: defaults().customKeyShortcuts.slice(1)}), /custom key shortcuts/);
    assert.throws(() => encodeSettings({...defaults(), customKeyShortcuts: undefined}), /custom key shortcuts/);
    const bytes = encodeSettings(defaults());
    const last = SETTINGS.SHORTCUTS_OFFSET + 127 * SETTINGS.SHORTCUT_SIZE;
    for (const key of [0x01, 0xdd, 0xe0, 0xc3]) {
        const stored = Buffer.from(bytes); stored[last + 1] = key;
        assert.throws(() => decodeSettings(stored), /Custom key 127/, `0x${key.toString(16)}`);
    }
    // Packed from the first: a key after none is refused; so are two media keys.
    const gap = Buffer.from(bytes); gap[last + 2] = 0x04;
    assert.throws(() => decodeSettings(gap), /after its last/);
    const media = Buffer.from(bytes); media[last + 1] = 0xae; media[last + 2] = 0xa9;
    assert.throws(() => decodeSettings(media), /one media key/);
    const twice = Buffer.from(bytes); twice[last + 1] = 0x04; twice[last + 2] = 0x05; twice[last + 3] = 0x04;
    assert.throws(() => decodeSettings(twice), /each key once/);
    const system = Buffer.from(bytes); system[last + 1] = 0xa5; system[last + 2] = 0xa7;
    assert.throws(() => decodeSettings(system), /one system key/);
    const any = Buffer.from(bytes); any[last] = 0xff;
    assert.deepEqual(decodeSettings(any).customKeyShortcuts[127], {mods: 0xff, keys: [], layers: 0, layerKind: 0}, "any modifier mask");
});

test("a shortcut's layers are a 16-bit mask that never names the base layer or a default layer", () => {
    // Firmware D-F26, settings v11: bytes 7..8 of the record, little-endian.
    const shortcut = {mods: 0x08, keys: [], layers: 0x8206, layerKind: 0};
    const bytes = encodeSettings(withShortcut(9, shortcut));
    const at = SETTINGS.SHORTCUTS_OFFSET + 9 * SETTINGS.SHORTCUT_SIZE;
    assert.deepEqual([...bytes.subarray(at, at + SETTINGS.SHORTCUT_SIZE)], [0x08, 0, 0, 0, 0, 0, 0, 0x06, 0x82, 0]);
    assert.deepEqual(decodeSettings(bytes).customKeyShortcuts[9], shortcut);
    // Layers alone are a shortcut.
    assert.deepEqual(decodeSettings(encodeSettings(withShortcut(9, {mods: 0, keys: [], layers: 0xfffe, layerKind: 0}))).customKeyShortcuts[9], {mods: 0, keys: [], layers: 0xfffe, layerKind: 0});
    for (const layers of [1, 0x10000, -2, 1.5, undefined]) {
        assert.throws(() => encodeSettings(withShortcut(9, {mods: 0, keys: [], layers})), /shortcut/, String(layers));
    }
    // A default layer is always on too: refused in the shortcut, and so is a
    // set of default layers that takes in a layer a shortcut names.
    const defaultTwo = withShortcut(9, {mods: 0, keys: [], layers: 0x0004, layerKind: 0});
    defaultTwo.values[SETTING.DEFAULT_LAYERS] = 0b101;
    assert.throws(() => encodeSettings(defaultTwo), /Custom key 9.*always on/);
    const stored = Buffer.from(bytes);
    stored[at + 7] |= 1;
    assert.throws(() => decodeSettings(stored), /always on/);
    stored[at + 7] = 0x06;
    stored.writeUInt32LE(0b11, SETTINGS.SCALARS_OFFSET + SETTING.DEFAULT_LAYERS * 4);
    assert.throws(() => decodeSettings(stored), /always on/);
});

test("a shortcut turns its layers on as one layer key does, all alike, and only when it has layers", () => {
    // Firmware D-F26, settings v11: byte 9 of the record.
    assert.deepEqual(SHORTCUT_LAYER_KINDS, {HOLD: 0, LOCK: 1, MOVE: 2, TAP_TOGGLE: 3, ONESHOT: 4});
    for (const layerKind of Object.values(SHORTCUT_LAYER_KINDS)) {
        const shortcut = {mods: 0x02, keys: [0x04], layers: 0x0028, layerKind};
        const bytes = encodeSettings(withShortcut(12, shortcut));
        const at = SETTINGS.SHORTCUTS_OFFSET + 12 * SETTINGS.SHORTCUT_SIZE;
        assert.deepEqual([...bytes.subarray(at, at + SETTINGS.SHORTCUT_SIZE)], [0x02, 0x04, 0, 0, 0, 0, 0, 0x28, 0, layerKind]);
        assert.deepEqual(decodeSettings(bytes).customKeyShortcuts[12], shortcut);
    }
    // Past one-shot, not a whole number, missing, or a kind with no layers to
    // turn on: refused both ways.
    for (const shortcut of [{mods: 0, keys: [], layers: 0x0008, layerKind: 5}, {mods: 0, keys: [], layers: 0x0008, layerKind: 1.5}, {mods: 0, keys: [], layers: 0x0008},
        {mods: 0x01, keys: [], layers: 0, layerKind: SHORTCUT_LAYER_KINDS.LOCK}]) {
        assert.throws(() => encodeSettings(withShortcut(12, shortcut)), /shortcut/, JSON.stringify(shortcut));
    }
    const bytes = encodeSettings(withShortcut(12, {mods: 0x01, keys: [], layers: 0x0008, layerKind: 0}));
    const at = SETTINGS.SHORTCUTS_OFFSET + 12 * SETTINGS.SHORTCUT_SIZE;
    const past = Buffer.from(bytes); past[at + 9] = 5;
    assert.throws(() => decodeSettings(past), /Custom key 12.*no way/);
    const bare = Buffer.from(bytes); bare.writeUInt16LE(0, at + 7); bare[at + 9] = SHORTCUT_LAYER_KINDS.ONESHOT;
    assert.throws(() => decodeSettings(bare), /Custom key 12.*no way/);
});
