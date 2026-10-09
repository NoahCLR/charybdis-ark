"use strict";
// Backups from the firmware before sixteen layers (schema 2.0, action ABI
// 0xf79c6151) translated into the format the keyboard stores now (firmware
// D-F14), so an old backup restores without loss. The firmware never reads
// the old format; translation is the client's (firmware D-F10).
//
// Each domain moves one version forward exactly as the firmware's documented
// translation says (its specs, and tests/host/translate_eight_slot_profile.py
// there): RGB v3 → v4 adds a black, mapped-keys-only colour row for layers
// 8..15; key behaviours v1 → v2 widens the step count and lets every row act
// on every layer; combos v2 → v3 keeps each row's inputs only and allows every
// layer; settings v5 → v6 moves the combo references into the layer records,
// counts the layer names and adds 64 empty macro and custom-key names; PD
// v2 → v3 moves each name to the counted rule. Layers 8..15 start transparent
// and unnamed, macros 64..127 empty, and every participation control on, so
// the restored keyboard behaves as the backup did.
//
// Custom keys moved from 0x7e40 + n to 0x7f00 + n. They are named by their
// stable slot, so the backup's keys, behaviour targets and combo inputs and
// outputs that named slot n by its old keycode name it by the new one.
const {ACTION_ABI} = require("../schema/actions");
const {PROFILE_ACTION_KINDS: ACTION, decodeProfileBlob, encodeProfileBlob, PROFILE_DOMAIN_VERSIONS} = require("../schema/profile-blob-v1");
const {decodeKeyBehaviorDomain, encodeKeyBehaviorDomain} = require("../schema/key-behavior-domain-v1");
const {decodeComboDomain, encodeComboDomain} = require("../schema/combo-domain-v1");
const {decodeRgbDomainV1} = require("../schema/rgb-domain-v1");
const {validSetting} = require("../schema/settings-domain-v1");
const {CUSTOM_KEY_BASE, RETIRED_CUSTOM_KEY_BASE, RETIRED_CUSTOM_KEY_SLOTS} = require("../data/user-keycodes");
const {CHARYBDIS_4X6_LAYOUT_MATRIX} = require("../data/charybdis-layout");
const {FILE_MAX_BYTES, validateSnapshot, validateViaMacro, macroBank} = require("./portable-profile");

// The action ABI of the firmware before D-F14: eight layers, 64 macros and
// custom keys at 0x7e40.
const PREVIOUS_ACTION_ABI = 0xf79c6151;
const PREVIOUS = Object.freeze({SCHEMA: 2, LAYERS: 8, MACROS: 64});
const PREVIOUS_ACTION_LIMITS = Object.freeze({maxLogicalLayers: 8, maxViaMacroSlots: 64, maxCustomKeys: 64, maxPdModes: 32});
const LAYERS = 16, MACROS = 128, MATRIX_KEYS = 60, TRANSPARENT = 0x0001;
const fail = message => Object.assign(new Error(message), {code: "INVALID_PORTABLE_PROFILE"});
// A new layer: transparent on every physical key, nothing in the matrix slots
// no key sits on, as the compiled layers 8..15 are.
const PHYSICAL = new Set(CHARYBDIS_4X6_LAYOUT_MATRIX.map(([row, column]) => row * 6 + column));
const EMPTY_LAYER = Array.from({length: MATRIX_KEYS}, (_, slot) => (PHYSICAL.has(slot) ? TRANSPARENT : 0));
const u32 = (bytes, at) => bytes.readUInt32LE(at);

function rgbV4(payload) {
    if (payload.length < 16 || payload[0] !== 3) throw fail("The backup's lighting is in an unknown format.");
    const original = Buffer.from(payload); original[0] = 4;
    // These formats share the records: validate the original eight-layer
    // surface and selectors before filling the new bank.
    decodeRgbDomainV1(original, {logicalLayerCount: PREVIOUS.LAYERS, maxLogicalLayers: PREVIOUS.LAYERS});
    const groups = payload[4], layerColors = payload[5], end = 16 + groups * 9 + layerColors * 5;
    if (layerColors > PREVIOUS.LAYERS) throw fail("The backup's lighting has too many layer colours.");
    const added = layerColors ? Buffer.concat(Array.from({length: LAYERS - layerColors}, (_, i) => Buffer.from([layerColors + i, 0, 0, 0, 1]))) : Buffer.alloc(0);
    const header = Buffer.from(payload.subarray(0, 16));
    header[0] = 4;
    if (layerColors) header[5] = LAYERS;
    return Buffer.concat([header, payload.subarray(16, end), added, payload.subarray(end)]);
}

function behaviorsV2(payload) {
    if (payload.length < 4 || payload[0] > 64 || payload[1] > 128 || payload[2] || payload[3]) throw fail("The backup's behaviours are in an unknown format.");
    const parts = [Buffer.from([payload[0], 0, payload[1], 0])];
    let offset = 4;
    for (let row = 0; row < payload[0]; row++) {
        if (offset + 2 > payload.length) throw fail("The backup's behaviours are truncated.");
        const length = payload.readUInt16LE(offset), body = payload.subarray(offset + 2, offset + 2 + length);
        if (body.length !== length || length < 12) throw fail("The backup's behaviours are truncated.");
        if (body[10] & ~1) throw fail("The backup's behaviour has unknown flags.");
        const widened = Buffer.concat([body.subarray(0, 12), Buffer.from([0xff, 0xff, 0, 0]), body.subarray(12)]);
        const size = Buffer.alloc(2); size.writeUInt16LE(widened.length);
        parts.push(size, widened);
        offset += 2 + length;
    }
    if (offset !== payload.length) throw fail("The backup's behaviours have trailing data.");
    const widened = Buffer.concat(parts);
    decodeKeyBehaviorDomain(widened, {limits: {maxRows: 64, maxPopulatedSteps: 128}, actionLimits: PREVIOUS_ACTION_LIMITS});
    return widened;
}

function combosV3(payload) {
    const count = payload[0];
    if (payload.length < 8 || count > 32 || payload[1] || payload[2] || payload[3] || payload.length !== 8 + count * 28) throw fail("The backup's combos are in an unknown format.");
    const rows = Array.from({length: count}, (_, index) => {
        const row = payload.subarray(8 + 28 * index, 8 + 28 * (index + 1));
        if (row[0] < 2 || row[0] > 4 || row[1] & ~7 || row.subarray(4, 8).some(byte => byte) || row.subarray(12 + 4 * row[0]).some(byte => byte)) throw fail("The backup's combo is not canonical.");
        return Buffer.concat([row.subarray(0, 4), Buffer.from([0xff, 0xff, 0, 0]), row.subarray(8, 12), row.subarray(12, 12 + 4 * row[0])]);
    });
    const widened = Buffer.concat([payload.subarray(0, 8), ...rows]);
    decodeComboDomain(widened, {actionLimits: PREVIOUS_ACTION_LIMITS});
    return widened;
}

function settingsV6(payload) {
    if (payload.length < 440 || payload.length > 312 + 128 * 21 || !payload.subarray(0, 8).equals(Buffer.from([5, 8, 28, 64, 64, 0, 0, 0]))) throw fail("The backup's settings are in an unknown format.");
    const scalars = Array.from({length: 28}, (_, id) => u32(payload, 8 + id * 4));
    if (scalars.some((v, id) => id !== 27 && !validSetting(id, v, PREVIOUS.LAYERS))) throw fail("The backup's settings exceed its layer bank or value limits.");
    const references = scalars[27];
    for (let layer = 0; layer < PREVIOUS.LAYERS; layer++) if (((references >>> (4 * layer)) & 15) >= PREVIOUS.LAYERS) throw fail("The backup's combo reference is outside its layer bank.");
    scalars.splice(27, 1, 0, 1, 0xffff, 0xffff);
    const fixed = Buffer.alloc(404);
    Buffer.from([6, LAYERS, 31, MACROS, MACROS, 0, 0, 0]).copy(fixed);
    scalars.forEach((value, id) => fixed.writeUInt32LE(value >>> 0, 8 + id * 4));
    for (let layer = 0; layer < LAYERS; layer++) fixed[132 + layer * 17] = layer < PREVIOUS.LAYERS ? (references >>> (4 * layer)) & 15 : layer;
    const names = Array.from({length: LAYERS}, (_, layer) => {
        if (layer >= PREVIOUS.LAYERS) return Buffer.from([0]);
        const field = payload.subarray(120 + 24 * layer, 144 + 24 * layer), end = field.indexOf(0);
        if (end < 0 || field.subarray(end).some(byte => byte)) throw fail("The backup's layer name is not canonical.");
        const text = field.subarray(0, end < 0 ? field.length : end);
        return Buffer.concat([Buffer.from([text.length]), text]);
    });
    let offset = 312;
    const record = () => {
        if (offset >= payload.length) throw fail("The backup's names are truncated.");
        const length = payload[offset], bytes = payload.subarray(offset, offset + 1 + length);
        if (length > 20 || bytes.length !== length + 1 || bytes.subarray(1).some(byte => byte < 32 || byte > 126)) throw fail("The backup's name is not at most 20 printable ASCII bytes.");
        offset += 1 + length;
        return bytes;
    };
    const macros = Array.from({length: PREVIOUS.MACROS}, record), custom = Array.from({length: PREVIOUS.MACROS}, record);
    if (offset !== payload.length) throw fail("The backup's settings have trailing data.");
    const empty = Buffer.alloc(MACROS - PREVIOUS.MACROS);
    return Buffer.concat([fixed, ...names, ...macros, empty, ...custom, empty]);
}

function pdV3(payload) {
    const count = payload[3];
    if (!payload.subarray(0, 3).equals(Buffer.from([2, 32, 96])) || payload.length !== 8 + 96 * count || payload.subarray(4, 8).some(byte => byte)) throw fail("The backup's pointing modes are in an unknown format.");
    const records = Array.from({length: count}, (_, index) => {
        const record = payload.subarray(8 + 96 * index, 8 + 96 * (index + 1));
        const field = record.subarray(8, 32), end = field.indexOf(0), name = field.subarray(0, end < 0 ? field.length : end);
        if (end < 0 || field.subarray(end).some(byte => byte)) throw fail("The backup's pointing name is not canonical.");
        const out = Buffer.alloc(128);
        record.copy(out, 0, 0, 8);
        out[8] = name.length;
        record.copy(out, 32, 32, 96);
        name.copy(out, 96);
        return out;
    });
    return Buffer.concat([Buffer.from([3, 32, 128, count, 0, 0, 0, 0]), ...records]);
}

const STEPS = {0x10: [3, rgbV4], 0x20: [1, behaviorsV2], 0x30: [2, combosV3], 0x40: [5, settingsV6], 0x50: [2, pdV3]};

// An old custom key's keycode as its new one; every other keycode unchanged.
const movedKeycode = code => code >= RETIRED_CUSTOM_KEY_BASE && code < RETIRED_CUSTOM_KEY_BASE + RETIRED_CUSTOM_KEY_SLOTS ? CUSTOM_KEY_BASE + (code - RETIRED_CUSTOM_KEY_BASE) : code;
function moveActions(value) {
    if (!value || typeof value !== "object") return;
    if (Number.isInteger(value.kind) && Number.isInteger(value.operand)) {
        if (value.kind === ACTION.QMK_KEYCODE) value.operand = movedKeycode(value.operand);
        return;
    }
    for (const child of Object.values(value)) if (child && typeof child === "object") moveActions(child);
}

// The profile blob in the current schema.
function translateProfileUnchecked(bytes) {
    if (bytes.length < 8 || bytes.length > 5088 || bytes.toString("ascii", 0, 4) !== "NLP1" || bytes[4] !== PREVIOUS.SCHEMA || bytes[5] !== 0 || bytes[6] !== 5 || bytes[7] !== 1) throw fail("The backup's profile is not one this app can translate.");
    const domains = [];
    let offset = 8;
    for (let index = 0; index < bytes[6]; index++) {
        if (offset + 4 > bytes.length) throw fail("The backup's profile is truncated.");
        const id = bytes[offset], version = bytes[offset + 1], length = bytes.readUInt16LE(offset + 2);
        if (id !== (index + 1) * 16) throw fail("The backup's domains are not complete and canonical.");
        const payload = bytes.subarray(offset + 4, offset + 4 + length);
        const step = STEPS[id];
        if (!step || step[0] !== version || payload.length !== length) throw fail("The backup's profile holds a domain this app cannot translate.");
        domains.push({id, version: PROFILE_DOMAIN_VERSIONS[id], payload: step[1](payload)});
        offset += 4 + length;
    }
    if (offset !== bytes.length) throw fail("The backup's profile has trailing data.");
    const blob = decodeProfileBlob(encodeProfileBlob({domains}));
    return encodeProfileBlob({domains: blob.domains.map(domain => {
        if (domain.id === 0x20) {const value = decodeKeyBehaviorDomain(domain.payload); moveActions(value.rows); return {...domain, payload: encodeKeyBehaviorDomain(value)};}
        if (domain.id === 0x30) {const value = decodeComboDomain(domain.payload); moveActions(value.rows); return {...domain, payload: encodeComboDomain(value)};}
        return domain;
    })});
}

function translateProfile(bytes) {
    try {return translateProfileUnchecked(bytes);} catch (error) {
        if (error.code === "INVALID_PORTABLE_PROFILE") throw error;
        throw fail(`The preceding backup is invalid: ${error.message}`);
    }
}

// Whether a parsed document is a backup from before sixteen layers.
const isPreviousBackup = value => value?.format === "charybdis-profile" && value.version === PREVIOUS.SCHEMA && value.actionAbiDigest === PREVIOUS_ACTION_ABI;

// A backup from before sixteen layers as one in the current format, or the
// document unchanged when it is not one.
function translateBackup(value) {
    if (typeof value === "string") {
        if (Buffer.byteLength(value) > FILE_MAX_BYTES) throw fail("This profile file is too large.");
        try {value = JSON.parse(value);} catch {return value;}
    }
    if (!isPreviousBackup(value)) return value;
    if (value.keyboard !== "charybdis-4x6" || Object.keys(value).some(key => !["format", "version", "keyboard", "actionAbiDigest", "layers", "profile", "macros"].includes(key))) throw fail("The backup contains unsupported fields.");
    if (!Array.isArray(value.layers) || value.layers.length !== PREVIOUS.LAYERS || value.layers.some(keys => !Array.isArray(keys) || keys.length !== MATRIX_KEYS || keys.some(code => !Number.isInteger(code) || code < 0 || code > 65535))) throw fail("The backup is missing layers.");
    if (!Array.isArray(value.macros) || value.macros.length !== PREVIOUS.MACROS) throw fail("The backup is missing macros.");
    try {
        const macros = value.macros.map(text => {
            if (typeof text !== "string" || text.length > Math.ceil(7191 / 3) * 4) throw fail("The backup's macro is invalid.");
            const bytes = Buffer.from(text, "base64");
            if (bytes.toString("base64") !== text) throw fail("The backup's macro is not canonical base64.");
            validateViaMacro(bytes); return bytes;
        });
        macroBank(macros, 7191);
    } catch (error) {throw fail(`The preceding backup's macros are invalid: ${error.message}`);}
    if (typeof value.profile !== "string") throw fail("The backup is missing its profile.");
    const oldProfile = Buffer.from(value.profile, "base64");
    if (oldProfile.toString("base64") !== value.profile) throw fail("The backup's profile is not canonical base64.");
    const translated = {
        format: value.format, version: 3, keyboard: value.keyboard, actionAbiDigest: ACTION_ABI,
        layers: [...value.layers.map(keys => keys.map(movedKeycode)), ...Array.from({length: LAYERS - PREVIOUS.LAYERS}, () => EMPTY_LAYER.slice())],
        profile: translateProfile(oldProfile).toString("base64"),
        macros: [...value.macros, ...Array(MACROS - PREVIOUS.MACROS).fill("")],
    };
    validateSnapshot(translated);
    return translated;
}

module.exports = {PREVIOUS_ACTION_ABI, isPreviousBackup, translateBackup, translateProfile};
