// @ts-check
"use strict";
const {PROFILE_DOMAIN_VERSIONS, PROFILE_DOMAIN_IDS} = require("./profile-domains");
const {LAYERS, MATRIX_KEYS} = require("../data/charybdis-layout");
const {validHostSetting} = require("./host-settings");
const {canonical} = require("./bytes");
// Settings domain 0x40, version 11, the only one the keyboard stores (firmware
// D-F14, D-F26): 31 values, sixteen layer records, 128 custom-key shortcuts,
// then 273 counted names — sixteen
// layer names, 128 macro names, 128 custom-key names and the keyboard's
// own name, each a length byte and up to 32 bytes of UTF-8 (profile-name.js).
// An empty keyboard name means the firmware's built-in name; a stored one is
// the USB product string the computer sees. Every other version is refused,
// as the firmware refuses it.
//
// A layer record is its combo reference layer and two placement bitmaps:
// positions whose behaviour is bypassed, and positions kept out of combos
// (participation-policy.md). Decoded, each bitmap is the sorted list of its
// set positions (row × columns + column).
//
// A custom-key shortcut is ten bytes, custom key 0 first: the modifier mask in
// HID report order (bit 0 Left Ctrl … bit 7 Right GUI, any combination), six
// key bytes, the keys it holds together in the order they are pressed, zero
// after the last (SHORTCUT_KEYS; decoded, the list of its keys), the layers it
// turns on, a 16-bit mask, little-endian, then how it turns them on, as the
// layer keys do (SHORTCUT_LAYER_KINDS): hold, lock, move to, tap-toggle or
// one-shot, all its layers alike. All zero is no shortcut; any part alone is a
// shortcut, and a kind other than hold needs layers. The base layer and the
// default layers are always on, so a shortcut never names them; the domain
// states the default layers itself, so both directions are refused here, as
// the firmware does.
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
// (firmware profile-wire-v1/settings-domain.md). The editor's words for
// them are in model/settings-editor.js.
const STORED = /** @type {const} */ ([
    ["TAPPING_TERM", UINT16], ["TAP_HOLD_TERM", UINT16], ["LONG_HOLD_TERM", UINT16], ["MULTI_TAP_TERM", UINT16],
    ["AUTO_MOUSE_ENABLED", SWITCH], ["AUTO_MOUSE_LAYER", LAYER], ["AUTO_MOUSE_TIMEOUT", UINT16], ["AUTO_MOUSE_DEBOUNCE", range(0, 255)],
    // The master switch, then the layers auto-sniping follows: a layer mask,
    // which may be empty, so turning auto-sniping off keeps its layers.
    ["AUTO_SNIPING_ENABLED", SWITCH], ["AUTO_SNIPING_LAYERS", LAYER_MASK],
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
const CUSTOM_KEY_SHORTCUTS = 128, SHORTCUT_KEY_COUNT = 6, SHORTCUT_SIZE = 4 + SHORTCUT_KEY_COUNT;
const SHORTCUTS_OFFSET = LAYER_RECORDS_OFFSET + LAYERS * LAYER_RECORD_SIZE;
const FIXED_SIZE = SHORTCUTS_OFFSET + CUSTOM_KEY_SHORTCUTS * SHORTCUT_SIZE;
const SETTINGS = Object.freeze({VERSION: PROFILE_DOMAIN_VERSIONS[PROFILE_DOMAIN_IDS.SETTINGS], COUNT: STORED.length, LAYERS, MACRO_NAMES, CUSTOM_KEY_NAMES, CUSTOM_KEY_SHORTCUTS,
    LAYER_RECORD_SIZE, PLACEMENT_BYTES, PLACEMENT_MAX_POSITIONS: PLACEMENT_BYTES * 8, NAME_MAX_BYTES, SHORTCUT_SIZE, SHORTCUT_KEY_COUNT,
    SCALARS_OFFSET, LAYER_RECORDS_OFFSET, SHORTCUTS_OFFSET, FIXED_SIZE, MIN_SIZE: FIXED_SIZE + NAME_COUNT, MAX_SIZE: FIXED_SIZE + NAME_COUNT * (NAME_MAX_BYTES + 1)});
// The keys a shortcut may hold (firmware D-F26): QMK's basic keycodes for a
// usage the computer sees. Keyboard keys KC_A..KC_EXSEL, the system keys
// (power, sleep, wake), the consumer (media) keys, and the mouse keys that
// move, click and scroll; modifiers belong in the mask, and mouse-key
// acceleration changes no report. At most SHORTCUT_KEY_COUNT, the 6-key
// report's limit on every build, each once, and at most one system key and one
// media key, since those reports carry one usage each.
const SHORTCUT_KEYS = Object.freeze({BASIC_MIN: 0x04, BASIC_MAX: 0xa4, SYSTEM_MIN: 0xa5, SYSTEM_MAX: 0xa7, CONSUMER_MIN: 0xa8, CONSUMER_MAX: 0xc2, MOUSE_MIN: 0xcd, MOUSE_MAX: 0xdc});
/** @param {number} key */
const systemKey = key => key >= SHORTCUT_KEYS.SYSTEM_MIN && key <= SHORTCUT_KEYS.SYSTEM_MAX;
/** @param {number} key */
const consumerKey = key => key >= SHORTCUT_KEYS.CONSUMER_MIN && key <= SHORTCUT_KEYS.CONSUMER_MAX;
// A key a shortcut may hold; 0 (none) is not one.
/** @param {unknown} key */
const validShortcutKey = key => Number.isInteger(key) && ((/** @type {number} */ (key) >= SHORTCUT_KEYS.BASIC_MIN && /** @type {number} */ (key) <= SHORTCUT_KEYS.CONSUMER_MAX)
    || (/** @type {number} */ (key) >= SHORTCUT_KEYS.MOUSE_MIN && /** @type {number} */ (key) <= SHORTCUT_KEYS.MOUSE_MAX));
// The bytes that are not keys a shortcut holds but have words of their own
// when refused: no key, transparent, mouse-key acceleration and the modifier
// keys, which are the mask's.
const NOT_SHORTCUT_KEYS = Object.freeze({NONE: 0x00, TRANSPARENT: 0x01, ACCELERATION_MIN: 0xdd, ACCELERATION_MAX: 0xdf, MODIFIER_MIN: 0xe0, MODIFIER_MAX: 0xe7});
// Why a shortcut cannot be stored, in words: the codec's refusals, and the
// picker's (each cap's, published in customKeyShortcutKeyLimits), one home.
const SHORTCUT_KEY_REFUSALS = Object.freeze({
    list: "A shortcut names its keys as a list, in the order they are pressed.",
    single: "A shortcut names its keys as a list, in the order they are pressed, not as a single key.",
    none: "A shortcut holds no empty key (KC_NO): leave it out.",
    transparent: "A shortcut holds no transparent key (KC_TRNS): it is the key's own action, with no layer below it to fall through to.",
    acceleration: "A shortcut holds no mouse-key acceleration key: acceleration changes nothing the computer sees.",
    modifier: "A shortcut holds keyboard keys, media and system keys and mouse keys, not modifier keys, which are its modifiers.",
    kind: "A shortcut holds keyboard keys, media and system keys and mouse keys, and no other keycode.",
    count: `A shortcut holds at most ${SHORTCUT_KEY_COUNT} keys at once.`,
    twice: "A shortcut holds each key once.",
    media: "A shortcut holds at most one media key: the computer reads one at a time.",
    system: "A shortcut holds at most one system key (power, sleep or wake): the computer reads one at a time.",
    shape: `A custom key shortcut holds modifiers, up to ${SHORTCUT_KEY_COUNT} keys, and layers other than the base, turned on as one layer key does.`,
});
/** @param {number} min @param {number} max */
const keycodesIn = (min, max) => Object.freeze(Array.from({length: max - min + 1}, (_, at) => min + at));
// The caps on the keys a shortcut holds, checked in this order: at most
// `most` of the keys in `keycodes` (every key when null), or, with `each`,
// each of them at most `most` times. Published to the picker as they are
// (customKeyShortcutKeyLimits), so it refuses what the codec refuses, in the
// same words, with no rule of its own.
/** @type {readonly import("../../contracts/panel.js").ShortcutKeyCap[]} */
const SHORTCUT_KEY_CAPS = Object.freeze([
    Object.freeze({keycodes: null, each: false, most: SHORTCUT_KEY_COUNT, refusal: SHORTCUT_KEY_REFUSALS.count}),
    Object.freeze({keycodes: null, each: true, most: 1, refusal: SHORTCUT_KEY_REFUSALS.twice}),
    Object.freeze({keycodes: keycodesIn(SHORTCUT_KEYS.CONSUMER_MIN, SHORTCUT_KEYS.CONSUMER_MAX), each: false, most: 1, refusal: SHORTCUT_KEY_REFUSALS.media}),
    Object.freeze({keycodes: keycodesIn(SHORTCUT_KEYS.SYSTEM_MIN, SHORTCUT_KEYS.SYSTEM_MAX), each: false, most: 1, refusal: SHORTCUT_KEY_REFUSALS.system}),
]);
// The limits the picker reads: the caps, and the limits in words for its
// notes and tips.
const SHORTCUT_KEY_LIMITS = Object.freeze({caps: SHORTCUT_KEY_CAPS,
    words: `up to ${SHORTCUT_KEY_COUNT} keys held together, at most one media key and one system key`});
// The first cap these keys break, or undefined.
/** @param {readonly import("../../contracts/panel.js").ShortcutKeyCap[]} caps @param {readonly number[]} keys */
const brokenCap = (caps, keys) => caps.find(cap => {
    const held = cap.keycodes ? keys.filter(key => /** @type {readonly number[]} */ (cap.keycodes).includes(key)) : keys;
    const most = cap.each ? Math.max(0, ...held.map(key => held.filter(other => other === key).length)) : held.length;
    return most > cap.most;
});
// Why a shortcut cannot hold this byte, which is not a key it may hold.
/** @param {unknown} key */
function keyRefusal(key) {
    if (key === NOT_SHORTCUT_KEYS.NONE) return SHORTCUT_KEY_REFUSALS.none;
    if (key === NOT_SHORTCUT_KEYS.TRANSPARENT) return SHORTCUT_KEY_REFUSALS.transparent;
    if (!Number.isInteger(key)) return SHORTCUT_KEY_REFUSALS.kind;
    const code = /** @type {number} */ (key);
    if (code >= NOT_SHORTCUT_KEYS.ACCELERATION_MIN && code <= NOT_SHORTCUT_KEYS.ACCELERATION_MAX) return SHORTCUT_KEY_REFUSALS.acceleration;
    if (code >= NOT_SHORTCUT_KEYS.MODIFIER_MIN && code <= NOT_SHORTCUT_KEYS.MODIFIER_MAX) return SHORTCUT_KEY_REFUSALS.modifier;
    return SHORTCUT_KEY_REFUSALS.kind;
}
// Why a shortcut cannot hold these keys, or "" when it can: one list, in the
// order they are pressed.
/** @param {unknown} keys */
function shortcutKeysRefusal(keys) {
    if (!Array.isArray(keys)) return SHORTCUT_KEY_REFUSALS.list;
    const wrong = keys.findIndex(key => !validShortcutKey(key));
    if (wrong >= 0) return keyRefusal(keys[wrong]);
    return brokenCap(SHORTCUT_KEY_CAPS, keys)?.refusal ?? "";
}
// How a shortcut turns its layers on (firmware D-F26), as MO(), TG(), TO(),
// TT() and OSL() turn one on: held while the key is; a lock of them all, or
// off again when all are locked; locked alone, every other lock released;
// held, its own tapping-toggle-th tap locking them; held, a tap turning them
// on for the next key press.
const SHORTCUT_LAYER_KINDS = Object.freeze({HOLD: 0, LOCK: 1, MOVE: 2, TAP_TOGGLE: 3, ONESHOT: 4});
/** @param {unknown} kind @param {number} layers */
const validLayerKind = (kind, layers) => Number.isInteger(kind) && /** @type {number} */ (kind) >= SHORTCUT_LAYER_KINDS.HOLD && /** @type {number} */ (kind) <= SHORTCUT_LAYER_KINDS.ONESHOT && (layers !== 0 || kind === SHORTCUT_LAYER_KINDS.HOLD);
/** @param {unknown} shortcut @returns {shortcut is import("./types.js").CustomKeyShortcut} */
const validShortcut = shortcut => typeof shortcut === "object" && shortcut !== null
    && Number.isInteger(/** @type {any} */ (shortcut).mods) && /** @type {any} */ (shortcut).mods >= 0 && /** @type {any} */ (shortcut).mods <= 0xff
    && !shortcutKeysRefusal(/** @type {any} */ (shortcut).keys)
    && Number.isInteger(/** @type {any} */ (shortcut).layers) && /** @type {any} */ (shortcut).layers >= 0 && /** @type {any} */ (shortcut).layers <= 0xffff && !(/** @type {any} */ (shortcut).layers & 1)
    && validLayerKind(/** @type {any} */ (shortcut).layerKind, /** @type {any} */ (shortcut).layers);
// Why a shortcut is not one the keyboard stores, in words, or "" when it is:
// its keys' refusal when they are what is wrong, else the shape it has.
/** @param {unknown} shortcut */
function shortcutStoreRefusal(shortcut) {
    if (validShortcut(shortcut)) return "";
    if (typeof shortcut !== "object" || shortcut === null) return SHORTCUT_KEY_REFUSALS.shape;
    if (!("keys" in shortcut) && "key" in shortcut) return SHORTCUT_KEY_REFUSALS.single;
    return shortcutKeysRefusal(/** @type {{keys?: unknown}} */ (shortcut).keys) || SHORTCUT_KEY_REFUSALS.shape;
}
// Whether a shortcut sends anything to the computer, modifiers or keys, and
// whether a custom key has one at all: any part of it, layers alone included.
/** @param {{mods?: number, keys?: readonly number[]} | null | undefined} shortcut */
const shortcutSends = shortcut => Boolean(shortcut && (shortcut.mods || shortcut.keys?.length));
/** @param {{mods?: number, keys?: readonly number[], layers?: number} | null | undefined} shortcut */
const shortcutPresent = shortcut => Boolean(shortcut && (shortcutSends(shortcut) || shortcut.layers));
// One string for a shortcut's every part, equal for equal shortcuts: for
// comparing two, and for Review's field identity.
/** @param {import("./types.js").CustomKeyShortcut} shortcut */
const shortcutIdentity = shortcut => `${shortcut.mods}:${shortcut.keys.join(",")}:${shortcut.layers}:${shortcut.layerKind}`;
// The layers always on, which no shortcut may name: the base layer and the
// default layers (scalar 23).
/** @param {readonly number[]} values */
const alwaysOnLayers = values => ((values[SETTING.DEFAULT_LAYERS] | 1) & 0xffff) >>> 0;
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
// excluded, as compiled defaults have it.
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
    const refused = value.customKeyShortcuts.find(shortcut => !validShortcut(shortcut));
    if (refused !== undefined) throw fail(shortcutStoreRefusal(refused));
    const named = value.customKeyShortcuts.findIndex(shortcut => shortcut.layers & alwaysOnLayers(value.values));
    if (named >= 0) throw fail(`Custom key ${named}'s shortcut turns on a default layer, which is always on.`);
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
    value.customKeyShortcuts.forEach(({mods, keys, layers, layerKind}, slot) => {
        const at = SETTINGS.SHORTCUTS_OFFSET + slot * SETTINGS.SHORTCUT_SIZE;
        fixed[at] = mods;
        keys.forEach((key, index) => { fixed[at + 1 + index] = key; });
        fixed.writeUInt16LE(layers, at + 1 + SHORTCUT_KEY_COUNT);
        fixed[at + 3 + SHORTCUT_KEY_COUNT] = layerKind;
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
        const record = [...bytes.subarray(at + 1, at + 1 + SHORTCUT_KEY_COUNT)];
        const count = record.indexOf(0) < 0 ? SHORTCUT_KEY_COUNT : record.indexOf(0);
        const keys = record.slice(0, count);
        if (record.slice(count).some(Boolean)) throw fail(`Custom key ${slot}'s shortcut has a key after its last.`);
        const refusal = shortcutKeysRefusal(keys);
        if (refusal) throw fail(`Custom key ${slot}'s shortcut: ${refusal}`);
        const layers = bytes.readUInt16LE(at + 1 + SHORTCUT_KEY_COUNT);
        if (layers & alwaysOnLayers(values)) throw fail(`Custom key ${slot}'s shortcut turns on a layer that is always on.`);
        const layerKind = bytes[at + 3 + SHORTCUT_KEY_COUNT];
        if (!validLayerKind(layerKind, layers)) throw fail(`Custom key ${slot}'s shortcut turns its layers on in no way the keyboard knows.`);
        return {mods: bytes[at], keys, layers, layerKind};
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
module.exports = {SETTINGS_HEADER_FLAGS, SETTINGS, SHORTCUT_KEYS, SHORTCUT_LAYER_KINDS, SETTING, SETTING_FIELD, SETTING_FIELDS: FIELDS, MATRIX_POSITIONS, validName, validSetting, validShortcutKey, shortcutKeysRefusal, shortcutStoreRefusal, SHORTCUT_KEY_REFUSALS, SHORTCUT_KEY_CAPS, SHORTCUT_KEY_LIMITS, validShortcut, shortcutSends, shortcutPresent, shortcutIdentity, alwaysOnLayers, defaultLayerRecord, encodeSettings, decodeSettings};
