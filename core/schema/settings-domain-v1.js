"use strict";
// Settings domain 0x40, version 6, the only one the keyboard stores (firmware
// D-F14): 31 values, sixteen layer records, then 272 counted names — sixteen
// layer names, 128 VIA macro names and 128 custom-key names, each a length
// byte and up to 32 bytes of UTF-8 (profile-name.js). Earlier versions are
// refused, as the firmware refuses them.
//
// A layer record is its combo reference layer and two placement bitmaps:
// positions whose behaviour is bypassed, and positions kept out of combos
// (participation-policy.md). Decoded, each bitmap is the sorted list of its
// set positions (row × columns + column).
const {NAME_MAX_BYTES, validName, nameOfBytes, encodeName} = require("./profile-name");

const SETTINGS = Object.freeze({VERSION: 6, COUNT: 31, LAYERS: 16, MACRO_NAMES: 128, CUSTOM_KEY_NAMES: 128,
    LAYER_RECORD_SIZE: 17, PLACEMENT_BYTES: 8, PLACEMENT_MAX_POSITIONS: 64, NAME_MAX_BYTES,
    SCALARS_OFFSET: 8, LAYER_RECORDS_OFFSET: 132, FIXED_SIZE: 404, MIN_SIZE: 404 + 272, MAX_SIZE: 404 + 272 * 33});
// The values that are layer masks or switches (participation-policy.md).
const SETTING = Object.freeze({COMBOS_ENABLED: 20, DEFAULT_LAYERS: 23, RETIRED_COMBO_REFERENCES: 27, BEHAVIORS_ENABLED: 28, LAYER_BEHAVIORS: 29, LAYER_COMBOS: 30});
// This keyboard's matrix: ten rows of six (capability page 2 reports it).
const MATRIX_POSITIONS = 60;
const HEADER = Buffer.from([SETTINGS.VERSION, SETTINGS.LAYERS, SETTINGS.COUNT, SETTINGS.MACRO_NAMES, SETTINGS.CUSTOM_KEY_NAMES, 0, 0, 0]);
const fail = message => Object.assign(new Error(message), {code: "INVALID_SETTINGS"});

function validSetting(id, v, layers = SETTINGS.LAYERS) {
    if (!Number.isInteger(v) || v < 0 || v > 0xffffffff) return false;
    const bank = 2 ** layers;
    if ([4, 8, 20, 28].includes(id)) return v <= 1;
    if ([5, 9].includes(id)) return v < layers;
    if (id === 7) return v <= 255;
    if (id >= 10 && id <= 14) return v === 0;
    if (id === 15) return v > 0 && v <= 65535;
    if (id === 17) return v <= 86400000;
    if (id === 18) return v >= 400 && v <= 3400 && v % 200 === 0;
    if (id === 19) return v >= 100 && v <= 400 && v % 100 === 0;
    if (id === 21) return (v & 255) <= 1;
    if (id === 22) return v <= 0xffffff;
    if (id === 23) return v > 0 && v < bank;
    if (id === 27) return v === 0;
    if (id === 29 || id === 30) return v < bank;
    return v <= 65535;
}

// A placement bitmap as its set positions, and back.
function positionsOfBitmap(bytes, positions) {
    const set = [];
    for (let position = 0; position < SETTINGS.PLACEMENT_MAX_POSITIONS; position++) {
        if ((bytes[position >> 3] >> (position & 7)) & 1) {
            if (position >= positions) throw fail("A placement bit names a key position this keyboard does not have.");
            set.push(position);
        }
    }
    return set;
}
function bitmapOfPositions(list, positions) {
    const bytes = Buffer.alloc(SETTINGS.PLACEMENT_BYTES);
    for (const position of list ?? []) {
        if (!Number.isInteger(position) || position < 0 || position >= positions) throw fail("A placement names a key position this keyboard does not have.");
        bytes[position >> 3] |= 1 << (position & 7);
    }
    return bytes;
}

// A fresh layer record: combos refer to the layer itself, nothing bypassed or
// excluded, as compiled defaults and translated backups have it.
const defaultLayerRecord = layer => ({reference: layer, bypass: [], exclude: []});

function encodeSettings(value, layers = SETTINGS.LAYERS, positions = MATRIX_POSITIONS) {
    if ((value?.formatVersion ?? SETTINGS.VERSION) !== SETTINGS.VERSION) throw fail("Unsupported settings format.");
    if (!value || !Array.isArray(value.values) || value.values.length !== SETTINGS.COUNT || !value.values.every((v, id) => validSetting(id, v, layers)) || value.values[6] <= value.values[16]) throw fail("Invalid keyboard settings.");
    if (!Array.isArray(value.names) || value.names.length !== SETTINGS.LAYERS) throw fail("Missing layer names.");
    if (!Array.isArray(value.layers) || value.layers.length !== SETTINGS.LAYERS) throw fail("Missing layer records.");
    if (!Array.isArray(value.macroNames) || value.macroNames.length !== SETTINGS.MACRO_NAMES) throw fail("Missing macro names.");
    if (!Array.isArray(value.customKeyNames) || value.customKeyNames.length !== SETTINGS.CUSTOM_KEY_NAMES) throw fail("Missing custom key names.");
    const fixed = Buffer.alloc(SETTINGS.FIXED_SIZE);
    HEADER.copy(fixed);
    value.values.forEach((v, id) => fixed.writeUInt32LE(v, SETTINGS.SCALARS_OFFSET + id * 4));
    value.layers.forEach((record, layer) => {
        const at = SETTINGS.LAYER_RECORDS_OFFSET + layer * SETTINGS.LAYER_RECORD_SIZE;
        if (!Number.isInteger(record?.reference) || record.reference < 0 || record.reference >= layers) throw fail("A combo reference layer is outside the layer bank.");
        fixed[at] = record.reference;
        bitmapOfPositions(record.bypass, positions).copy(fixed, at + 1);
        bitmapOfPositions(record.exclude, positions).copy(fixed, at + 1 + SETTINGS.PLACEMENT_BYTES);
    });
    const record = (name, what) => {
        if (!validName(name)) throw fail(`A ${what} name is at most ${NAME_MAX_BYTES} bytes of text, with no control characters.`);
        return encodeName(name);
    };
    return Buffer.concat([fixed, ...value.names.map(name => record(name, "layer")), ...value.macroNames.map(name => record(name, "macro")), ...value.customKeyNames.map(name => record(name, "custom key"))]);
}

function decodeSettings(bytes, layers = SETTINGS.LAYERS, positions = MATRIX_POSITIONS) {
    if (!Buffer.isBuffer(bytes) || bytes.length < SETTINGS.MIN_SIZE || bytes.length > SETTINGS.MAX_SIZE || !bytes.subarray(0, 8).equals(HEADER)) throw fail("Unsupported settings format.");
    const values = Array.from({length: SETTINGS.COUNT}, (_, id) => bytes.readUInt32LE(SETTINGS.SCALARS_OFFSET + id * 4));
    const layerRecords = Array.from({length: SETTINGS.LAYERS}, (_, layer) => {
        const at = SETTINGS.LAYER_RECORDS_OFFSET + layer * SETTINGS.LAYER_RECORD_SIZE;
        return {reference: bytes[at], bypass: positionsOfBitmap(bytes.subarray(at + 1, at + 9), positions), exclude: positionsOfBitmap(bytes.subarray(at + 9, at + 17), positions)};
    });
    let offset = SETTINGS.FIXED_SIZE;
    const nameRecord = () => {
        if (offset >= bytes.length) throw fail("Missing name.");
        const length = bytes[offset++];
        if (length > NAME_MAX_BYTES || offset + length > bytes.length) throw fail("Invalid name length.");
        const name = nameOfBytes(bytes.subarray(offset, offset + length));
        offset += length;
        if (name === undefined) throw fail("Invalid name encoding.");
        return name;
    };
    const names = Array.from({length: SETTINGS.LAYERS}, nameRecord);
    const macroNames = Array.from({length: SETTINGS.MACRO_NAMES}, nameRecord);
    const customKeyNames = Array.from({length: SETTINGS.CUSTOM_KEY_NAMES}, nameRecord);
    if (offset !== bytes.length) throw fail("Unexpected settings data.");
    const result = {values, names, layers: layerRecords, macroNames, customKeyNames, formatVersion: SETTINGS.VERSION};
    encodeSettings(result, layers, positions);
    return result;
}
module.exports = {SETTINGS, SETTING, MATRIX_POSITIONS, validName, validSetting, defaultLayerRecord, encodeSettings, decodeSettings};
