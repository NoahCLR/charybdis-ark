// @ts-check
"use strict";
const {PROFILE_DOMAIN_VERSIONS, PROFILE_DOMAIN_IDS} = require("./profile-domains");
const {LAYERS, MATRIX_KEYS} = require("../data/charybdis-layout");
const {validHostSetting} = require("./host-settings");
const {canonical} = require("./bytes");
// Settings domain 0x40, version 8, the only one the keyboard stores (firmware
// D-F14, D-F26): 31 values, sixteen layer records, 128 custom-key shortcuts,
// then 273 counted names — sixteen
// layer names, 128 VIA macro names, 128 custom-key names and the keyboard's
// own name, each a length byte and up to 32 bytes of UTF-8 (profile-name.js).
// An empty keyboard name means the firmware's built-in name; a stored one is
// the USB product string the computer sees. Earlier versions are refused, as
// the firmware refuses them; a backup's are translated (backup-translation.js).
//
// A layer record is its combo reference layer and two placement bitmaps:
// positions whose behaviour is bypassed, and positions kept out of combos
// (participation-policy.md). Decoded, each bitmap is the sorted list of its
// set positions (row × columns + column).
//
// A custom-key shortcut is two bytes, custom key 0 first: the modifier mask in
// HID report order (bit 0 Left Ctrl … bit 7 Right GUI, any combination), then
// the key: none, a basic key or a mouse button (SHORTCUT_KEYS). Both zero is no
// shortcut; modifiers alone and a key alone are both shortcuts.
const {NAME_MAX_BYTES, validName, nameOfBytes, encodeName} = require("./profile-name");

/** @param {string} message */
const fail = message => Object.assign(new Error(message), {code: "INVALID_SETTINGS"});

// What the firmware accepts for a value, given that it is a uint32 and the
// layer count. A plain range also says its bounds, for an editor to offer.
/** @param {number} min @param {number} max @param {number} [step] @returns {import("./types.js").SettingRule} */
const range = (min, max, step = 1) => ({min, max, step, valid: v => v >= min && v <= max && v % step === 0});
/** @param {(v: number, layers: number) => boolean} valid @returns {import("./types.js").SettingRule} */
const rule = valid => ({valid});
const UINT16 = range(0, 65535), SWITCH = range(0, 1), RETIRED = range(0, 0);
const LAYER = {...rule((v, layers) => v < layers), layerReference: /** @type {const} */ ("layer"), layerReorder: /** @type {const} */ ("storage")};
const LAYER_MASK = {...rule((v, layers) => v < 2 ** layers), layerReference: /** @type {const} */ ("mask"), layerReorder: /** @type {const} */ ("storage")};
// The 31 stored values, each once, in ID order: the firmware's name for it
// (profile_settings_v1.h, without NOAH_SETTING_) and what it accepts
// (portable-profile-v1.md, "Settings domain 0x40"). The editor's words for
// them are in model/settings-editor.js.
const STORED = /** @type {const} */ ([
    ["TAPPING_TERM", UINT16], ["TAP_HOLD_TERM", UINT16], ["LONG_HOLD_TERM", UINT16], ["MULTI_TAP_TERM", UINT16],
    ["AUTO_MOUSE_ENABLED", SWITCH], ["AUTO_MOUSE_LAYER", LAYER], ["AUTO_MOUSE_TIMEOUT", UINT16], ["AUTO_MOUSE_DEBOUNCE", range(0, 255)],
    ["AUTO_SNIPING_ENABLED", SWITCH], ["AUTO_SNIPING_LAYER", LAYER],
    // Retired per-mode DPI: mode tuning is in domain 0x50.
    ["DRAGSCROLL_DPI", RETIRED], ["VOLUME_DPI", RETIRED], ["BRIGHTNESS_DPI", RETIRED], ["ZOOM_DPI", RETIRED], ["ARROW_DPI", RETIRED],
    // A half-period: one on or off phase of the key feedback flash.
    ["FEEDBACK_PERIOD", range(1, 65535)],
    // Shorter than the auto-mouse timeout, which encodeSettings checks.
    ["AUTO_MOUSE_DEAD_TIME", UINT16],
    // Zero keeps lighting on; at most one day.
    ["RGB_TIMEOUT", range(0, 86400000)],
    ["DEFAULT_DPI", range(400, 3400, 200)], ["SNIPING_DPI", range(100, 400, 100)],
    ["COMBOS_ENABLED", SWITCH],
    // Enabled, effect, speed and LED flags, a byte each; only the switch is checked.
    ["RGB_MODE", rule(v => (v & 255) <= 1)],
    // Hue, saturation and brightness; the high byte zero.
    ["RGB_COLOR", range(0, 0xffffff)],
    // At least one startup layer, and none past the bank.
    ["DEFAULT_LAYERS", {...rule((v, layers) => v > 0 && v < 2 ** layers), layerReference: /** @type {const} */ ("mask"), layerReorder: /** @type {const} */ ("reach")}],
    ["KEYMAP_OPTIONS", UINT16], ["AUTO_MOUSE_DELAY", UINT16], ["AUTO_MOUSE_THRESHOLD", UINT16],
    // Host OS, Unicode playback, host layout and macOS ISO (host-settings.js).
    ["UNICODE_HOST_MODE", rule(validHostSetting)],
    // Participation (participation-policy.md): the behaviour master switch,
    // then one bit per layer for its behaviours and for its combos.
    ["BEHAVIORS_ENABLED", SWITCH], ["LAYER_BEHAVIORS", LAYER_MASK], ["LAYER_COMBOS", LAYER_MASK],
]);
// Geometry follows the field table: adding a scalar moves the records and
// names without updating parallel byte offsets.
const SCALARS_OFFSET = 8, PLACEMENT_BYTES = 8, LAYER_RECORD_SIZE = 1 + 2 * PLACEMENT_BYTES;
const LAYER_RECORDS_OFFSET = SCALARS_OFFSET + STORED.length * 4;
const MACRO_NAMES = 128, CUSTOM_KEY_NAMES = 128, KEYBOARD_NAMES = 1, NAME_COUNT = LAYERS + MACRO_NAMES + CUSTOM_KEY_NAMES + KEYBOARD_NAMES;
const CUSTOM_KEY_SHORTCUTS = 128, SHORTCUT_SIZE = 2;
const SHORTCUTS_OFFSET = LAYER_RECORDS_OFFSET + LAYERS * LAYER_RECORD_SIZE;
const FIXED_SIZE = SHORTCUTS_OFFSET + CUSTOM_KEY_SHORTCUTS * SHORTCUT_SIZE;
const SETTINGS = Object.freeze({VERSION: PROFILE_DOMAIN_VERSIONS[PROFILE_DOMAIN_IDS.SETTINGS], COUNT: STORED.length, LAYERS, MACRO_NAMES, CUSTOM_KEY_NAMES, CUSTOM_KEY_SHORTCUTS,
    LAYER_RECORD_SIZE, PLACEMENT_BYTES, PLACEMENT_MAX_POSITIONS: PLACEMENT_BYTES * 8, NAME_MAX_BYTES, SHORTCUT_SIZE,
    SCALARS_OFFSET, LAYER_RECORDS_OFFSET, SHORTCUTS_OFFSET, FIXED_SIZE, MIN_SIZE: FIXED_SIZE + NAME_COUNT, MAX_SIZE: FIXED_SIZE + NAME_COUNT * (NAME_MAX_BYTES + 1)});
// The keys a shortcut may hold (firmware D-F26): none, the basic keyboard
// usages KC_A..KC_EXSEL, or mouse buttons 1-8. Modifiers belong in the mask.
const SHORTCUT_KEYS = Object.freeze({BASIC_MIN: 0x04, BASIC_MAX: 0xa4, MOUSE_MIN: 0xd1, MOUSE_MAX: 0xd8});
/** @param {unknown} key */
const validShortcutKey = key => Number.isInteger(key) && (key === 0 || (/** @type {number} */ (key) >= SHORTCUT_KEYS.BASIC_MIN && /** @type {number} */ (key) <= SHORTCUT_KEYS.BASIC_MAX)
    || (/** @type {number} */ (key) >= SHORTCUT_KEYS.MOUSE_MIN && /** @type {number} */ (key) <= SHORTCUT_KEYS.MOUSE_MAX));
/** @param {unknown} shortcut @returns {shortcut is import("./types.js").CustomKeyShortcut} */
const validShortcut = shortcut => typeof shortcut === "object" && shortcut !== null
    && Number.isInteger(/** @type {any} */ (shortcut).mods) && /** @type {any} */ (shortcut).mods >= 0 && /** @type {any} */ (shortcut).mods <= 0xff
    && validShortcutKey(/** @type {any} */ (shortcut).key);
/** @returns {import("./types.js").CustomKeyShortcut} */
const noShortcut = () => ({mods: 0, key: 0});
const MATRIX_POSITIONS = MATRIX_KEYS;
const SETTINGS_HEADER_FLAGS = Object.freeze({OFFSET: 5, COMBO_OUTPUT_BYPASS: 1, KNOWN: 1});
const HEADER = Buffer.from([SETTINGS.VERSION, SETTINGS.LAYERS, SETTINGS.COUNT, SETTINGS.MACRO_NAMES, SETTINGS.CUSTOM_KEY_NAMES, 0, SETTINGS.CUSTOM_KEY_SHORTCUTS, 0]);

/** @typedef {typeof STORED[number][0]} SettingName */
// The stored values in ID order, each by its name, and each ID by its name.
/** @type {readonly Readonly<import("./types.js").SettingField<SettingName>>[]} */
const FIELDS = Object.freeze(STORED.map(([name, accepts], id) => Object.freeze({...accepts, id, name})));
const SETTING_FIELD = Object.freeze(/** @type {Record<SettingName, Readonly<import("./types.js").SettingField<SettingName>>>} */ (Object.fromEntries(FIELDS.map(field => [field.name, field]))));
const SETTING = Object.freeze(/** @type {Record<SettingName, number>} */ (Object.fromEntries(FIELDS.map(field => [field.name, field.id]))));

/** @param {number} id @param {number} v @param {number} [layers] */
function validSetting(id, v, layers = SETTINGS.LAYERS) {
    if (!Number.isInteger(v) || v < 0 || v > 0xffffffff) return false;
    return Number.isInteger(id) && id >= 0 && id < SETTINGS.COUNT ? FIELDS[id].valid(v, layers) : v <= 65535;
}

// A placement bitmap as its set positions, and back.
/** @param {Uint8Array} bytes @param {number} positions */
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
/** @param {readonly number[] | undefined} list @param {number} positions */
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
/** @param {number} layer @returns {import("./types.js").LayerRecord} */
const defaultLayerRecord = layer => ({reference: layer, bypass: [], exclude: []});

/** @param {import("./types.js").SettingsDomain} value @param {number} [layers] @param {number} [positions] */
function encodeSettings(value, layers = SETTINGS.LAYERS, positions = MATRIX_POSITIONS) {
    if ((value?.formatVersion ?? SETTINGS.VERSION) !== SETTINGS.VERSION) throw fail("Unsupported settings format.");
    if (!value || !Array.isArray(value.values) || value.values.length !== SETTINGS.COUNT || !value.values.every((v, id) => validSetting(id, v, layers))
        || value.values[SETTING.AUTO_MOUSE_TIMEOUT] <= value.values[SETTING.AUTO_MOUSE_DEAD_TIME]) throw fail("Invalid keyboard settings.");
    if (!Array.isArray(value.names) || value.names.length !== SETTINGS.LAYERS) throw fail("Missing layer names.");
    if (!Array.isArray(value.layers) || value.layers.length !== SETTINGS.LAYERS) throw fail("Missing layer records.");
    if (!Array.isArray(value.macroNames) || value.macroNames.length !== SETTINGS.MACRO_NAMES) throw fail("Missing macro names.");
    if (!Array.isArray(value.customKeyNames) || value.customKeyNames.length !== SETTINGS.CUSTOM_KEY_NAMES) throw fail("Missing custom key names.");
    if (typeof value.keyboardName !== "string") throw fail("Missing keyboard name.");
    if (!Array.isArray(value.customKeyShortcuts) || value.customKeyShortcuts.length !== SETTINGS.CUSTOM_KEY_SHORTCUTS) throw fail("Missing custom key shortcuts.");
    if (!value.customKeyShortcuts.every(validShortcut)) throw fail("A custom key shortcut holds modifiers and one plain key or mouse button.");
    const fixed = Buffer.alloc(SETTINGS.FIXED_SIZE);
    HEADER.copy(fixed);
    if (value.comboOutputBehaviors !== undefined && typeof value.comboOutputBehaviors !== "boolean") throw fail("Combo output behaviour permission must be on or off.");
    fixed[SETTINGS_HEADER_FLAGS.OFFSET] = value.comboOutputBehaviors === false ? SETTINGS_HEADER_FLAGS.COMBO_OUTPUT_BYPASS : 0;
    value.values.forEach((v, id) => fixed.writeUInt32LE(v, SETTINGS.SCALARS_OFFSET + id * 4));
    value.layers.forEach((record, layer) => {
        const at = SETTINGS.LAYER_RECORDS_OFFSET + layer * SETTINGS.LAYER_RECORD_SIZE;
        if (!Number.isInteger(record?.reference) || record.reference < 0 || record.reference >= layers) throw fail("A combo reference layer is outside the layer bank.");
        fixed[at] = record.reference;
        bitmapOfPositions(record.bypass, positions).copy(fixed, at + 1);
        bitmapOfPositions(record.exclude, positions).copy(fixed, at + 1 + SETTINGS.PLACEMENT_BYTES);
    });
    value.customKeyShortcuts.forEach(({mods, key}, slot) => {
        fixed[SETTINGS.SHORTCUTS_OFFSET + slot * SETTINGS.SHORTCUT_SIZE] = mods;
        fixed[SETTINGS.SHORTCUTS_OFFSET + slot * SETTINGS.SHORTCUT_SIZE + 1] = key;
    });
    /** @param {string} name @param {string} what */
    const record = (name, what) => {
        if (!validName(name)) throw fail(`A ${what} name is at most ${NAME_MAX_BYTES} bytes of text, with no control characters.`);
        return encodeName(name);
    };
    return Buffer.concat([fixed, ...value.names.map(name => record(name, "layer")), ...value.macroNames.map(name => record(name, "macro")), ...value.customKeyNames.map(name => record(name, "custom key")), record(value.keyboardName, "keyboard")]);
}

/** @param {Buffer} bytes @param {number} [layers] @param {number} [positions] */
function decodeSettings(bytes, layers = SETTINGS.LAYERS, positions = MATRIX_POSITIONS) {
    if (!Buffer.isBuffer(bytes) || bytes.length < SETTINGS.MIN_SIZE || bytes.length > SETTINGS.MAX_SIZE || HEADER.some((byte, offset) => offset === SETTINGS_HEADER_FLAGS.OFFSET ? Boolean(bytes[offset] & ~SETTINGS_HEADER_FLAGS.KNOWN) : bytes[offset] !== byte)) throw fail("Unsupported settings format.");
    const values = Array.from({length: SETTINGS.COUNT}, (_, id) => bytes.readUInt32LE(SETTINGS.SCALARS_OFFSET + id * 4));
    const layerRecords = Array.from({length: SETTINGS.LAYERS}, (_, layer) => {
        const at = SETTINGS.LAYER_RECORDS_OFFSET + layer * SETTINGS.LAYER_RECORD_SIZE;
        return {reference: bytes[at], bypass: positionsOfBitmap(bytes.subarray(at + 1, at + 9), positions), exclude: positionsOfBitmap(bytes.subarray(at + 9, at + 17), positions)};
    });
    const customKeyShortcuts = Array.from({length: SETTINGS.CUSTOM_KEY_SHORTCUTS}, (_, slot) => {
        const at = SETTINGS.SHORTCUTS_OFFSET + slot * SETTINGS.SHORTCUT_SIZE;
        if (!validShortcutKey(bytes[at + 1])) throw fail("A custom key shortcut names a key it cannot hold.");
        return {mods: bytes[at], key: bytes[at + 1]};
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
    const keyboardName = nameRecord();
    if (offset !== bytes.length) throw fail("Unexpected settings data.");
    const result = {comboOutputBehaviors: !(bytes[SETTINGS_HEADER_FLAGS.OFFSET] & SETTINGS_HEADER_FLAGS.COMBO_OUTPUT_BYPASS), values, names, layers: layerRecords, macroNames, customKeyNames, customKeyShortcuts, keyboardName, formatVersion: SETTINGS.VERSION};
    return canonical(bytes, result, value => encodeSettings(value, layers, positions), () => fail("Noncanonical settings data."));
}
module.exports = {SETTINGS_HEADER_FLAGS, SETTINGS, SHORTCUT_KEYS, SETTING, SETTING_FIELD, SETTING_FIELDS: FIELDS, MATRIX_POSITIONS, validName, validSetting, validShortcutKey, validShortcut, noShortcut, defaultLayerRecord, encodeSettings, decodeSettings};
