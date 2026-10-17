// @ts-check
"use strict";
// Backups from the firmware before sixteen layers (schema 2.0, action ABI
// 0xf79c6151) translated into the format the keyboard stores now (firmware
// D-F14), so an old backup restores without loss. The firmware never reads
// the old format; translation is the client's (firmware D-F10). A backup in
// the current schema whose domains predate the keyboard's current versions
// is brought forward by the same steps (translateCurrentBackup).
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
// the restored keyboard behaves as the backup did. Settings v6 → v7 adds the
// keyboard's own name, empty: the firmware's built-in name. Settings v7 → v8
// adds 128 custom-key shortcuts, all none, so each custom key still does only
// what its behaviour says.
//
// Custom keys moved from 0x7e40 + n to 0x7f00 + n. They are named by their
// stable slot, so the backup's keys, behaviour targets and combo inputs and
// outputs that named slot n by its old keycode name it by the new one.
const {PROFILE_DOMAIN_IDS} = require("../schema/profile-domains");
const {ACTION_ABI} = require("../schema/actions");
const {PROFILE_ACTION_KINDS: ACTION, PROFILE_BLOB_V1, decodeProfileBlob, encodeProfileBlob, PROFILE_DOMAIN_VERSIONS} = require("../schema/profile-blob-v1");
const {decodeKeyBehaviorDomain, encodeKeyBehaviorDomain} = require("../schema/key-behavior-domain-v1");
const {decodeComboDomain, encodeComboDomain} = require("../schema/combo-domain-v1");
const {decodeRgbDomainV1} = require("../schema/rgb-domain-v1");
const {validSetting} = require("../schema/settings-domain-v1");
const {NAME_MAX_BYTES, nameOfBytes} = require("../schema/profile-name");
const {CUSTOM_KEY_BASE, RETIRED_CUSTOM_KEY_BASE, RETIRED_CUSTOM_KEY_SLOTS} = require("../data/user-keycodes");
const {CHARYBDIS_4X6_LAYOUT_MATRIX, LAYERS, MATRIX_KEYS, matrixPosition} = require("../data/charybdis-layout");
const {FILE_MAX_BYTES, validateSnapshot, validateViaMacro, macroBank} = require("./portable-profile");

// The action ABI of the firmware before D-F14: eight layers, 64 macros and
// custom keys at 0x7e40.
const PREVIOUS_ACTION_ABI = 0xf79c6151;
const PREVIOUS = Object.freeze({SCHEMA: 2, LAYERS: 8, MACROS: 64, domains: Object.freeze([
    Object.freeze({id: PROFILE_DOMAIN_IDS.RGB, version: 3}), Object.freeze({id: PROFILE_DOMAIN_IDS.KEY_BEHAVIORS, version: 1}),
    Object.freeze({id: PROFILE_DOMAIN_IDS.COMBOS, version: 2}), Object.freeze({id: PROFILE_DOMAIN_IDS.SETTINGS, version: 5}),
    Object.freeze({id: PROFILE_DOMAIN_IDS.PD_MODES, version: 2}),
])});
const PREVIOUS_ACTION_LIMITS = Object.freeze({maxLogicalLayers: 8, maxViaMacroSlots: 64, maxCustomKeys: 64, maxPdModes: 32});
const MACROS = 128, TRANSPARENT = 0x0001;
// These are historical step outputs, independent of the registry's eventual
// target. A later geometry or settings version gets another translation step.
const RGB_V4_LAYERS = 16, SETTINGS_V6_LAYERS = 16;
/** @param {string} message */
const fail = message => Object.assign(new Error(message), {code: "INVALID_PORTABLE_PROFILE"});
// A new layer: transparent on every physical key, nothing in the matrix slots
// no key sits on, as the compiled layers 8..15 are.
const PHYSICAL = new Set(CHARYBDIS_4X6_LAYOUT_MATRIX.map((position, layoutIndex) => matrixPosition(layoutIndex)));
const EMPTY_LAYER = Array.from({length: MATRIX_KEYS}, (_, slot) => (PHYSICAL.has(slot) ? TRANSPARENT : 0));
/** @param {Buffer} bytes @param {number} at */
const u32 = (bytes, at) => bytes.readUInt32LE(at);

/** @param {Buffer} payload */
function rgbV4(payload) {
    if (payload.length < 16 || payload[0] !== 3) throw fail("The backup's lighting is in an unknown format.");
    const original = Buffer.from(payload); original[0] = 4;
    // These formats share the records: validate the original eight-layer
    // surface and selectors before filling the new bank.
    decodeRgbDomainV1(original, {logicalLayerCount: PREVIOUS.LAYERS, maxLogicalLayers: PREVIOUS.LAYERS});
    const groups = payload[4], layerColors = payload[5], end = 16 + groups * 9 + layerColors * 5;
    if (layerColors > PREVIOUS.LAYERS) throw fail("The backup's lighting has too many layer colours.");
    const added = layerColors ? Buffer.concat(Array.from({length: RGB_V4_LAYERS - layerColors}, (_, i) => Buffer.from([layerColors + i, 0, 0, 0, 1]))) : Buffer.alloc(0);
    const header = Buffer.from(payload.subarray(0, 16));
    header[0] = 4;
    if (layerColors) header[5] = RGB_V4_LAYERS;
    return Buffer.concat([header, payload.subarray(16, end), added, payload.subarray(end)]);
}

/** @param {Buffer} payload */
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

/** @param {Buffer} payload */
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

/** @param {Buffer} payload */
function settingsV6(payload) {
    if (payload.length < 440 || payload.length > 312 + 128 * 21 || !payload.subarray(0, 8).equals(Buffer.from([5, 8, 28, 64, 64, 0, 0, 0]))) throw fail("The backup's settings are in an unknown format.");
    const scalars = Array.from({length: 28}, (_, id) => u32(payload, 8 + id * 4));
    if (scalars.some((v, id) => id !== 27 && !validSetting(id, v, PREVIOUS.LAYERS))) throw fail("The backup's settings exceed its layer bank or value limits.");
    const references = scalars[27];
    for (let layer = 0; layer < PREVIOUS.LAYERS; layer++) if (((references >>> (4 * layer)) & 15) >= PREVIOUS.LAYERS) throw fail("The backup's combo reference is outside its layer bank.");
    scalars.splice(27, 1, 0, 1, 0xffff, 0xffff);
    const scalarOffset = 8, recordSize = 1 + 2 * 8, recordsOffset = scalarOffset + scalars.length * 4;
    const fixed = Buffer.alloc(recordsOffset + SETTINGS_V6_LAYERS * recordSize);
    Buffer.from([6, SETTINGS_V6_LAYERS, scalars.length, MACROS, MACROS, 0, 0, 0]).copy(fixed);
    scalars.forEach((value, id) => fixed.writeUInt32LE(value >>> 0, scalarOffset + id * 4));
    for (let layer = 0; layer < SETTINGS_V6_LAYERS; layer++) fixed[recordsOffset + layer * recordSize] = layer < PREVIOUS.LAYERS ? (references >>> (4 * layer)) & 15 : layer;
    const names = Array.from({length: SETTINGS_V6_LAYERS}, (_, layer) => {
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

// Settings v6 → v7: the keyboard's own name follows the custom-key names, as
// one more counted name. A v6 backup names none, so it gets the empty name,
// which means the firmware's built-in one: one zero length byte. The v6 body
// is checked here only for its shape (header and 272 well-formed names); the
// complete document is validated once it is current.
/** @param {Buffer} payload */
function settingsV7(payload) {
    const scalars = 31, fixed = 8 + scalars * 4 + 16 * 17, names = 16 + 128 + 128;
    if (payload.length < fixed + names || payload.length > fixed + names * (1 + NAME_MAX_BYTES)
        || !payload.subarray(0, 5).equals(Buffer.from([6, 16, scalars, 128, 128])) || payload[5] & ~1 || payload[6] || payload[7]) throw fail("The backup's settings are in an unknown format.");
    let offset = fixed;
    for (let name = 0; name < names; name++) {
        const length = payload[offset];
        if (length === undefined || offset + 1 + length > payload.length || nameOfBytes(payload.subarray(offset + 1, offset + 1 + length)) === undefined) throw fail("The backup's settings hold a name that is not well-formed.");
        offset += 1 + length;
    }
    if (offset !== payload.length) throw fail("The backup's settings have trailing data.");
    const translated = Buffer.concat([payload, Buffer.from([0])]);
    translated[0] = 7;
    return translated;
}

// Settings v7 → v8 (firmware D-F26): 256 zero bytes, no shortcut for any
// custom key, go after the layer records, and header byte 6 counts them. The
// v7 body is checked for its header only; the names are moved unread and the
// complete document is validated once it is current.
/** @param {Buffer} payload */
function settingsV8(payload) {
    const scalars = 31, fixed = 8 + scalars * 4 + 16 * 17, names = 16 + 128 + 128 + 1, shortcuts = 128;
    if (payload.length < fixed + names || payload.length > fixed + names * (1 + NAME_MAX_BYTES)
        || !payload.subarray(0, 5).equals(Buffer.from([7, 16, scalars, 128, 128])) || payload[5] & ~1 || payload[6] || payload[7]) throw fail("The backup's settings are in an unknown format.");
    const translated = Buffer.concat([payload.subarray(0, fixed), Buffer.alloc(shortcuts * 2), payload.subarray(fixed)]);
    translated[0] = 8;
    translated[6] = shortcuts;
    return translated;
}

/** @param {Buffer} payload */
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

// A step is keyed by the version it produces and receives the immediately
// preceding version. A future domain bump adds one step; earlier backups
// traverse every intervening version rather than jumping to the newest one.
/** @typedef {Readonly<Record<number, (payload: Buffer) => Buffer>>} DomainTranslations */
/** @type {Readonly<Record<number, DomainTranslations>>} */
const DOMAIN_TRANSLATIONS = Object.freeze({
    [PROFILE_DOMAIN_IDS.RGB]: Object.freeze({4: rgbV4}),
    [PROFILE_DOMAIN_IDS.KEY_BEHAVIORS]: Object.freeze({2: behaviorsV2}),
    [PROFILE_DOMAIN_IDS.COMBOS]: Object.freeze({3: combosV3}),
    [PROFILE_DOMAIN_IDS.SETTINGS]: Object.freeze({6: settingsV6, 7: settingsV7, 8: settingsV8}),
    [PROFILE_DOMAIN_IDS.PD_MODES]: Object.freeze({3: pdV3}),
});

// Schema admission belongs to the backup revision. Once admitted, a domain
// follows its own version chain to the registry's current target.
/** @param {import("../schema/types.js").ProfileDomain} domain @param {number} [targetVersion] @param {DomainTranslations} [translations] @returns {import("../schema/types.js").ProfileDomain} */
function translateDomain(domain, targetVersion = PROFILE_DOMAIN_VERSIONS[domain.id], translations = DOMAIN_TRANSLATIONS[domain.id]) {
    let {version, payload} = domain;
    if (!Number.isInteger(version) || !Number.isInteger(targetVersion) || version < 1 || version > targetVersion) throw fail("The backup's profile holds a domain this app cannot translate.");
    while (version < targetVersion) {
        const next = version + 1, step = translations?.[next];
        if (!step) throw fail("The backup's profile holds a domain this app cannot translate.");
        payload = step(payload);
        version = next;
    }
    return {id: domain.id, version, payload};
}

// An old custom key's keycode as its new one; every other keycode unchanged.
/** @param {number} code */
const movedKeycode = code => code >= RETIRED_CUSTOM_KEY_BASE && code < RETIRED_CUSTOM_KEY_BASE + RETIRED_CUSTOM_KEY_SLOTS ? CUSTOM_KEY_BASE + (code - RETIRED_CUSTOM_KEY_BASE) : code;
/** @param {unknown} value */
function moveActions(value) {
    if (!value || typeof value !== "object") return;
    const record = /** @type {Record<string, unknown>} */ (value);
    if (typeof record.kind === "number" && Number.isInteger(record.kind) && typeof record.operand === "number" && Number.isInteger(record.operand)) {
        if (record.kind === ACTION.QMK_KEYCODE) record.operand = movedKeycode(record.operand);
        return;
    }
    for (const child of Object.values(value)) if (child && typeof child === "object") moveActions(child);
}

// The profile blob in the current schema.
/** @param {Buffer} bytes */
function translateProfileUnchecked(bytes) {
    if (bytes.length < 8 || bytes.length > 5088 || bytes.toString("ascii", 0, 4) !== "NLP1" || bytes[4] !== PREVIOUS.SCHEMA || bytes[5] !== 0 || bytes[6] !== PREVIOUS.domains.length || bytes[7] !== 1) throw fail("The backup's profile is not one this app can translate.");
    /** @type {import("../schema/types.js").ProfileDomain[]} */
    const domains = [];
    let offset = 8;
    for (let index = 0; index < bytes[6]; index++) {
        if (offset + 4 > bytes.length) throw fail("The backup's profile is truncated.");
        const id = bytes[offset], version = bytes[offset + 1], length = bytes.readUInt16LE(offset + 2);
        if (id !== PREVIOUS.domains[index].id) throw fail("The backup's domains are not complete and canonical.");
        const payload = bytes.subarray(offset + 4, offset + 4 + length);
        if (version !== PREVIOUS.domains[index].version || payload.length !== length) throw fail("The backup's profile holds a domain this app cannot translate.");
        domains.push(translateDomain({id, version, payload}));
        offset += 4 + length;
    }
    if (offset !== bytes.length) throw fail("The backup's profile has trailing data.");
    const blob = decodeProfileBlob(encodeProfileBlob({domains}));
    return encodeProfileBlob({domains: blob.domains.map(domain => {
        if (domain.id === PROFILE_DOMAIN_IDS.KEY_BEHAVIORS) {const value = decodeKeyBehaviorDomain(domain.payload); moveActions(value.rows); return {...domain, payload: encodeKeyBehaviorDomain(value)};}
        if (domain.id === PROFILE_DOMAIN_IDS.COMBOS) {const value = decodeComboDomain(domain.payload); moveActions(value.rows); return {...domain, payload: encodeComboDomain(value)};}
        return domain;
    })});
}

/** @param {Buffer} bytes */
function translateProfile(bytes) {
    try {return translateProfileUnchecked(bytes);} catch (error) {
        const failure = /** @type {Error & {code?: string}} */ (error);
        if (failure.code === "INVALID_PORTABLE_PROFILE") throw error;
        throw fail(`The preceding backup is invalid: ${failure.message}`);
    }
}

// The domain versions the current schema (3.0) began with: a current-format
// backup holds these or later ones, and each later version has a step above.
const CURRENT_SCHEMA_FIRST = Object.freeze({[PROFILE_DOMAIN_IDS.RGB]: 4, [PROFILE_DOMAIN_IDS.KEY_BEHAVIORS]: 2,
    [PROFILE_DOMAIN_IDS.COMBOS]: 3, [PROFILE_DOMAIN_IDS.SETTINGS]: 6, [PROFILE_DOMAIN_IDS.PD_MODES]: 3});
const CURRENT_SCHEMA_VERSIONS = new Map(Object.entries(CURRENT_SCHEMA_FIRST).map(([id, first]) => [Number(id),
    Array.from({length: PROFILE_DOMAIN_VERSIONS[Number(id)] - first + 1}, (_, index) => first + index)]));

// A current-format backup with every domain at the keyboard's current
// version, or the document unchanged when it is not one this can bring
// forward (validation then says what is wrong with it). Only the profile
// blob's domains change; keys and macros are the same in every version.
/** @param {unknown} value @returns {unknown} */
function translateCurrentBackup(value) {
    const candidate = /** @type {{format?: unknown, version?: unknown, profile?: unknown} | null | undefined} */ (value);
    if (candidate?.format !== "charybdis-profile" || candidate.version !== PROFILE_BLOB_V1.SCHEMA_MAJOR || typeof candidate.profile !== "string") return value;
    const bytes = Buffer.from(candidate.profile, "base64");
    if (bytes.toString("base64") !== candidate.profile) return value;
    /** @type {ReturnType<typeof decodeProfileBlob>} */
    let blob;
    try {blob = decodeProfileBlob(bytes, {domainVersions: CURRENT_SCHEMA_VERSIONS});} catch {return value;}
    if (blob.domains.every(domain => domain.version === PROFILE_DOMAIN_VERSIONS[domain.id])) return value;
    try {
        const domains = blob.domains.map(domain => translateDomain(domain));
        return {...candidate, profile: encodeProfileBlob({domains}).toString("base64")};
    } catch (error) {
        const failure = /** @type {Error & {code?: string}} */ (error);
        if (failure.code === "INVALID_PORTABLE_PROFILE") throw error;
        throw fail(`The backup is invalid: ${failure.message}`);
    }
}

// Whether a parsed document is a backup from before sixteen layers.
/**
 * This identifies the revision only; translateBackup validates its contents.
 * @typedef {{format: 'charybdis-profile', version: 2, actionAbiDigest: number, keyboard?: unknown, layers?: unknown, profile?: unknown, macros?: unknown}} PreviousBackupCandidate
 */
/** @param {unknown} value @returns {value is PreviousBackupCandidate} */
function isPreviousBackup(value) {
    const candidate = /** @type {Partial<PreviousBackupCandidate> | null | undefined} */ (value);
    return candidate?.format === "charybdis-profile" && candidate.version === PREVIOUS.SCHEMA && candidate.actionAbiDigest === PREVIOUS_ACTION_ABI;
}

// A backup from before sixteen layers, or a current-format one with older
// domain versions, as one in the current format; any other document unchanged.
/** @param {unknown} value @returns {unknown} */
function translateBackup(value) {
    if (typeof value === "string") {
        if (Buffer.byteLength(value) > FILE_MAX_BYTES) throw fail("This profile file is too large.");
        try {value = JSON.parse(value);} catch {return value;}
    }
    if (!isPreviousBackup(value)) return translateCurrentBackup(value);
    if (value.keyboard !== "charybdis-4x6" || Object.keys(value).some(key => !["format", "version", "keyboard", "actionAbiDigest", "layers", "profile", "macros"].includes(key))) throw fail("The backup contains unsupported fields.");
    if (!Array.isArray(value.layers) || value.layers.length !== PREVIOUS.LAYERS || value.layers.some(keys => !Array.isArray(keys) || keys.length !== MATRIX_KEYS || keys.some(code => !Number.isInteger(code) || code < 0 || code > 65535))) throw fail("The backup is missing layers.");
    // The complete matrix above has been checked before it is retargeted.
    const layers = /** @type {number[][]} */ (value.layers);
    if (!Array.isArray(value.macros) || value.macros.length !== PREVIOUS.MACROS) throw fail("The backup is missing macros.");
    try {
        const macros = value.macros.map(text => {
            if (typeof text !== "string" || text.length > Math.ceil(7191 / 3) * 4) throw fail("The backup's macro is invalid.");
            const bytes = Buffer.from(text, "base64");
            if (bytes.toString("base64") !== text) throw fail("The backup's macro is not canonical base64.");
            validateViaMacro(bytes); return bytes;
        });
        macroBank(macros, 7191);
    } catch (error) {throw fail(`The preceding backup's macros are invalid: ${/** @type {Error} */ (error).message}`);}
    if (typeof value.profile !== "string") throw fail("The backup is missing its profile.");
    const oldProfile = Buffer.from(value.profile, "base64");
    if (oldProfile.toString("base64") !== value.profile) throw fail("The backup's profile is not canonical base64.");
    const translated = {
        format: value.format, version: 3, keyboard: value.keyboard, actionAbiDigest: ACTION_ABI,
        layers: [...layers.map(keys => keys.map(movedKeycode)), ...Array.from({length: LAYERS - PREVIOUS.LAYERS}, () => EMPTY_LAYER.slice())],
        profile: translateProfile(oldProfile).toString("base64"),
        macros: [...value.macros, ...Array(MACROS - PREVIOUS.MACROS).fill("")],
    };
    validateSnapshot(translated);
    return translated;
}

module.exports = {PREVIOUS_ACTION_ABI, DOMAIN_TRANSLATIONS, translateDomain, isPreviousBackup, translateBackup, translateCurrentBackup, translateProfile};
