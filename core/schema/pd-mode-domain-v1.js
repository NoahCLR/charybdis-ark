// @ts-check
"use strict";
const {PROFILE_DOMAIN_VERSIONS, PROFILE_DOMAIN_IDS} = require("./profile-domains");

// PD domain codec, version 4, the only one the keyboard stores (firmware
// D-F14): a header naming its capacity (32 slots) and record count, then only
// the slots that hold something (configured, or disabled with a name), each in
// a 128-byte record, in ascending ID order. An omitted slot is disabled and
// nameless. It decodes to one dense array, a record per slot. A record's name
// follows the shared rule (profile-name.js): its length at byte 8, its UTF-8
// at bytes 96..127, zero after it. Bytes 11..15 are the slot's link
// (firmware D-F62): what ends a mode its layers started, the linked layers
// that start it and the layers its key turns on (little-endian masks); bytes
// 9..10 and 16..31 are zero.
const {NAME_MAX_BYTES, validName, nameOfBytes} = require("./profile-name");
const {canonical} = require("./bytes");
const PD_DOMAIN = Object.freeze({ID: PROFILE_DOMAIN_IDS.PD_MODES, VERSION: PROFILE_DOMAIN_VERSIONS[PROFILE_DOMAIN_IDS.PD_MODES], SLOTS: 32, HEADER_SIZE: 8, RECORD_SIZE: 128, NAME_OFFSET: 96, NAME_MAX_BYTES, MAX_SIZE: 8 + 32 * 128});
const PD_KIND = Object.freeze({DISABLED: 0, DIRECTIONAL: 1, SCROLLING: 2});
const PD_AXIS = Object.freeze({VERTICAL: 0, HORIZONTAL: 1, DOMINANT: 2, EIGHT: 3});
// Which axes a scrolling mode scrolls, in the same byte (firmware D-F08).
const PD_SCROLL_AXES = Object.freeze({BOTH: 0, HORIZONTAL: 1, VERTICAL: 2});
// What an eight-direction mode does when a diagonal has no shortcut.
const PD_EMPTY_DIRECTION = Object.freeze({NEAREST: 0, BOTH: 1, NOTHING: 2});
// How often a directional mode sends: once per threshold step, or once per
// movement (firmware D-F07).
const PD_DIRECTION_OUTPUT = Object.freeze({REPEAT: 0, ONCE: 1});
const PD_MODIFIERS = Object.freeze({INHERIT: 0, MASK: 1, EXACT: 2});
// A link: its linked layers start the mode while any is on; its key turns on
// its own set of layers, any mix; and a higher layer, or any layer outside
// both sets, may end a mode its layers started. Every link byte zero is no
// link. No layer starts two modes; the layers keys turn on may repeat.
const PD_LINK_ENDS = Object.freeze({NOTHING: 0, HIGHER_LAYER: 1, OTHER_LAYER: 2});
const PD_LINK_LAYERS = 16;
const DIRECTIONS = ["left", "right", "up", "down"];
// Eight directions keep their diagonals in bytes 70..85, which any other
// directional record leaves zero. Byte 86 is what every directional mode does
// with motion toward a direction that has no shortcut, byte 87 how often it
// sends.
const DIAGONALS = ["upLeft", "upRight", "downLeft", "downRight"];
const SCROLL_U16 = ["thresholdH", "thresholdV", "divisorH", "divisorV", "intervalMs", "expireMs", "lockMs"];
const SCROLL_U8 = ["startNumerator", "startDenominator", "sustainNumerator", "sustainDenominator", "decayDivisor", "invert"];

/** @param {string} code @param {number} offset @param {string} message @returns {never} */
function fail(code, offset, message) {
    throw Object.assign(new Error(message), {code, offset});
}
/** @param {Uint8Array} bytes */
function zero(bytes) { return bytes.every(byte => byte === 0); }
// A tap may click a plain mouse button 1–8 (firmware D-F22) or run a macro.
const PD_MACROS = Object.freeze({FIRST: 0x7700, LAST: 0x777f});
/** @param {number} keycode */
const isPdMacro = keycode => Number.isInteger(keycode) && keycode >= PD_MACROS.FIRST && keycode <= PD_MACROS.LAST;
const PD_CLICKS = Object.freeze({FIRST: 0xd1, LAST: 0xd8});
/** @param {number} keycode */
const isPdClick = keycode => Number.isInteger(keycode) && keycode >= PD_CLICKS.FIRST && keycode <= PD_CLICKS.LAST;
/** @param {number} keycode */
function isPdTapKey(keycode) {
    if (!Number.isInteger(keycode) || keycode < 0 || keycode > 0xffff) return false;
    if ((keycode >= 4 && keycode <= 0xc2) || isPdClick(keycode) || isPdMacro(keycode)) return true;
    const mods = keycode >>> 8, key = keycode & 255;
    return mods <= 0x1f && (mods & 15) !== 0 && key >= 4 && key <= 0xa4;
}
// Why a keycode cannot be a pointing-mode tap, or "" when it can. The words
// name what a person would have picked.
/** @param {number} keycode */
function pdTapProblem(keycode) {
    if (isPdTapKey(keycode)) return "";
    const key = keycode & 255, modified = keycode > 0xff;
    if (keycode <= 0x1fff && key >= 0xcd && key <= 0xdf) {
        return modified && isPdClick(key) ? "A mouse-button click cannot carry modifiers in its keycode. Choose the button alone."
            : "A pointing mode can click mouse buttons 1–8, but not move the pointer, scroll or change mouse acceleration.";
    }
    if (modified && keycode <= 0x1fff && key > 0xa4 && key <= 0xc2) return "Only keyboard keys take modifiers in a pointing mode; send a media or system key on its own.";
    return "A pointing mode sends keys, shortcuts, media and system keys, mouse buttons 1–8 and supported macros, not layer, pointing-mode or keyboard controls.";
}
/** @param {Buffer} bytes */
function validTap(bytes) {
    if (bytes.readUInt16LE(0) === 0) return zero(bytes);
    if (isPdMacro(bytes.readUInt16LE(0))) return bytes[2] === PD_MODIFIERS.INHERIT && bytes[3] === 0;
    return isPdTapKey(bytes.readUInt16LE(0)) && (bytes[2] === PD_MODIFIERS.MASK
        ? bytes[3] !== 0 : /** @type {number[]} */ ([PD_MODIFIERS.INHERIT, PD_MODIFIERS.EXACT]).includes(bytes[2]) && bytes[3] === 0);
}
/** @param {Buffer} p @param {number} offset */
function readName(p, offset) {
    const length = p[8], text = length <= NAME_MAX_BYTES ? nameOfBytes(p.subarray(PD_DOMAIN.NAME_OFFSET, PD_DOMAIN.NAME_OFFSET + length)) : undefined;
    if (text === undefined || !zero(p.subarray(PD_DOMAIN.NAME_OFFSET + length))) {
        fail("INVALID_NAME", offset + 8, `Mode name must be at most ${NAME_MAX_BYTES} bytes of valid UTF-8, counted and zero-padded.`);
    }
    return text;
}
/** @param {Buffer} p @param {number} slot @param {number} offset @param {number} [slots] */
function validateRecord(p, slot, offset, slots = PD_DOMAIN.SLOTS) {
    /** @param {string} code @param {number} at @param {string} message @returns {never} */
    const reject = (code, at, message) => fail(code, offset + at, message);
    if (p[0] !== slot) reject("INVALID_ID", 0, `PD slots must appear exactly once in ID order 0–${slots - 1}.`);
    // Reserved: byte 7, bytes 9..10 before the link, version 2's name field
    // past the link (bytes 16..31,
    // since the name moved), version 3's mouse button records (bytes 52..69)
    // and the bytes before the name; each refused at its first byte.
    const reserved = /** @type {const} */ ([[7, 8], [9, 11], [16, 32], [52, 70], [90, PD_DOMAIN.NAME_OFFSET]]).find(([from, to]) => !zero(p.subarray(from, to)));
    if (reserved) reject("RESERVED", reserved[0], "Reserved PD bytes must be zero.");
    const name = readName(p, offset);
    if (p[1] > 2 || p[2] > 1 || p[3] > PD_AXIS.EIGHT) reject("INVALID_POLICY", 1, "Unknown engine, layer policy or axis policy.");
    if (p[11] > PD_LINK_ENDS.OTHER_LAYER) reject("INVALID_POLICY", 11, "Unknown choice of what ends a mode its layers started.");
    if (p[1] === PD_KIND.DISABLED) {
        if (!zero(p.subarray(2, 8)) || !zero(p.subarray(11, 16)) || !zero(p.subarray(32, PD_DOMAIN.NAME_OFFSET))) reject("INVALID_PARAMETER", 2, "Disabled slots retain only their ID and name.");
        return;
    }
    if (!name) reject("INVALID_NAME", 8, "Configured modes need a name.");
    // What ends a mode its linked layers started needs linked layers.
    if (p[11] !== PD_LINK_ENDS.NOTHING && !p.readUInt16LE(12)) reject("INVALID_PARAMETER", 11, "Only a mode its linked layers started can be ended by another layer, so it needs linked layers.");
    for (let at = 36; at < 52; at += 4) {
        if (!validTap(p.subarray(at, at + 4))) reject("INVALID_ACTION", at, "Unsupported directional tap or modifier policy.");
    }
    const x = p.readUInt16LE(32), y = p.readUInt16LE(34);
    if (p[1] === PD_KIND.DIRECTIONAL && p[3] === PD_AXIS.EIGHT) {
        if (p[6]) reject("INVALID_PARAMETER", 6, "Directional modes cannot carry owned scroll modifiers.");
        if (!x || !y) reject("INVALID_PARAMETER", 32, "Enabled axes need a nonzero movement threshold.");
        for (let at = 70; at < 86; at += 4) {
            if (!validTap(p.subarray(at, at + 4))) reject("INVALID_ACTION", at, "Unsupported diagonal tap or modifier policy.");
        }
        if (p[86] > PD_EMPTY_DIRECTION.NOTHING) reject("INVALID_POLICY", 86, "Unknown empty-direction policy.");
        if (p[87] > PD_DIRECTION_OUTPUT.ONCE) reject("INVALID_POLICY", 87, "Unknown directional output policy.");
        if (!zero(p.subarray(88, 90))) reject("RESERVED", 88, "Reserved PD bytes must be zero.");
    } else if (p[1] === PD_KIND.DIRECTIONAL) {
        if (p[6] || !zero(p.subarray(70, 86))) reject("INVALID_PARAMETER", 6, "Directional modes cannot carry scroll settings or owned scroll modifiers.");
        if (p[86] > PD_EMPTY_DIRECTION.NOTHING) reject("INVALID_POLICY", 86, "Unknown empty-direction policy.");
        if (p[87] > PD_DIRECTION_OUTPUT.ONCE) reject("INVALID_POLICY", 87, "Unknown directional output policy.");
        if (!zero(p.subarray(88, 90))) reject("RESERVED", 88, "Reserved PD bytes must be zero.");
        if ((p[3] !== PD_AXIS.VERTICAL && !x) || (p[3] !== PD_AXIS.HORIZONTAL && !y)) reject("INVALID_PARAMETER", 32, "Enabled axes need a nonzero movement threshold.");
        if ((p[3] === PD_AXIS.VERTICAL && (x || !zero(p.subarray(36, 44)))) ||
            (p[3] === PD_AXIS.HORIZONTAL && (y || !zero(p.subarray(44, 52))))) reject("INVALID_PARAMETER", 32, "Unused axes must have zero thresholds and outputs.");
    } else {
        if (p[3] > PD_SCROLL_AXES.VERTICAL || !zero(p.subarray(32, 52))) reject("INVALID_PARAMETER", 3, "Scrolling modes cannot carry directional settings.");
        if (![70, 72, 74, 76, 82].every(at => p.readUInt16LE(at) > 0) || p.readUInt16LE(80) < p.readUInt16LE(82) ||
            ![84, 85, 86, 87].every(at => p[at] > 0) || p[84] < p[85] || p[86] < p[87] ||
            p[86] * p[85] > p[84] * p[87] || p[88] < 2 || p[89] > 3) reject("INVALID_PARAMETER", 70, "Invalid scrolling thresholds, ratios, divisors or timing.");
    }
}

/** @param {Buffer} bytes @param {number} at */
function tapFromBytes(bytes, at) {
    return {keycode: bytes.readUInt16LE(at), modifierPolicy: bytes[at + 2], mask: bytes[at + 3]};
}
/** @param {Buffer} p @param {number} id @param {number} offset @returns {import("./types.js").PdSlot} */
function slotOfRecord(p, id, offset) {
    return {
        id, kind: p[1], pointerLayer: p[2], axis: p[3], dpi: p.readUInt16LE(4), heldModifiers: p[6], name: readName(p, offset),
        linkedLayers: p.readUInt16LE(12), linkTurnsOn: p.readUInt16LE(14), linkEnds: p[11],
        thresholdX: p.readUInt16LE(32), thresholdY: p.readUInt16LE(34),
        directions: Object.fromEntries(DIRECTIONS.map(/** @returns {[string, import("./types.js").PdTap]} */ (name, i) => [name, tapFromBytes(p, 36 + i * 4)])),
        // Bytes 70..90 are scroll settings only in a scrolling mode.
        scroll: Object.fromEntries([...SCROLL_U16.map(/** @returns {[string, number]} */ (name, i) => [name, p[1] === PD_KIND.SCROLLING ? p.readUInt16LE(70 + i * 2) : 0]), ...SCROLL_U8.map(/** @returns {[string, number]} */ (name, i) => [name, p[1] === PD_KIND.SCROLLING ? p[84 + i] : 0])]),
        diagonals: Object.fromEntries(DIAGONALS.map(/** @returns {[string, import("./types.js").PdTap]} */ (name, i) => [name, p[1] === PD_KIND.DIRECTIONAL ? tapFromBytes(p, 70 + i * 4) : {keycode: 0, modifierPolicy: 0, mask: 0}])),
        emptyDirection: p[1] === PD_KIND.DIRECTIONAL ? p[86] : 0,
        directionOutput: p[1] === PD_KIND.DIRECTIONAL ? p[87] : 0,
    };
}
// A slot the sparse format leaves out: disabled, with no name.
/** @param {number} id */
function omittedSlot(id) {
    const p = Buffer.alloc(PD_DOMAIN.RECORD_SIZE);
    p[0] = id;
    return slotOfRecord(p, id, 0);
}
// Whether a slot needs a record of its own in the sparse format.
/** @param {{kind: number, name: string}} slot */
const storesRecord = slot => slot.kind !== PD_KIND.DISABLED || slot.name !== "";

/** @param {unknown} bytes */
function decodePdDomain(bytes) {
    if (!Buffer.isBuffer(bytes)) fail("INVALID_ARGUMENT", 0, "PD domain must be a Buffer.");
    const {HEADER_SIZE, RECORD_SIZE, SLOTS, VERSION} = PD_DOMAIN;
    if (bytes.length < HEADER_SIZE) fail("INVALID_LENGTH", 0, "PD domain v4 needs an 8-byte header.");
    if (bytes[0] !== VERSION) fail("INVALID_HEADER", 0, `PD domain version ${bytes[0]} is not supported.`);
    const count = bytes[3];
    if (bytes[1] !== SLOTS) fail("INVALID_HEADER", 1, `PD domain v4 must hold ${SLOTS} slots.`);
    if (bytes[2] !== RECORD_SIZE) fail("INVALID_HEADER", 2, `PD domain v4 records must be ${RECORD_SIZE} bytes.`);
    if (count > SLOTS) fail("INVALID_HEADER", 3, `PD domain v4 cannot hold more than ${SLOTS} records.`);
    for (let at = 4; at < HEADER_SIZE; at++) if (bytes[at]) fail("RESERVED", at, "Reserved PD header bytes must be zero.");
    if (bytes.length !== HEADER_SIZE + count * RECORD_SIZE) fail("INVALID_LENGTH", 0, `PD domain v4 with ${count} records must contain exactly ${HEADER_SIZE + count * RECORD_SIZE} bytes.`);
    const slots = Array.from({length: SLOTS}, (_, id) => omittedSlot(id));
    let prior = -1, starting = 0;
    for (let index = 0; index < count; index++) {
        const offset = HEADER_SIZE + index * RECORD_SIZE;
        const p = bytes.subarray(offset, offset + RECORD_SIZE), id = p[0];
        if (id >= SLOTS || id <= prior) fail("INVALID_ID", offset, `PD records must have unique IDs below ${SLOTS} in ascending order.`);
        validateRecord(p, id, offset, SLOTS);
        const slot = slotOfRecord(p, id, offset);
        if (!storesRecord(slot)) fail("NONCANONICAL", offset + 1, "A disabled slot without a name is stored by leaving its record out.");
        // No layer starts two modes (firmware D-F62). The layers keys turn on
        // may repeat: a key source beats a layer source, and a mode its
        // layers started owns no layer, so links cannot chain or latch.
        if (starting & slot.linkedLayers) fail("INVALID_PARAMETER", offset + 12, "Another pointing mode already starts from one of these layers.");
        starting |= slot.linkedLayers;
        slots[id] = slot;
        prior = id;
    }
    return canonical(bytes, slots, writePdDomain, () => fail("NONCANONICAL", 0, "PD domain does not use its canonical representation."));
}

/** @template {object} T @param {T} value @param {readonly string[]} keys @param {string} label @returns {T} */
function object(value, keys, label) {
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) {
        fail("INVALID_ARGUMENT", 0, `${label} must be an object with supported fields.`);
    }
    return value;
}
/** @template T @param {T | undefined} value @param {T} fallback @returns {T} */
function optional(value, fallback) { return value === undefined ? fallback : value; }
/** @param {number} value @param {number} max */
function integer(value, max) {
    if (!Number.isInteger(value) || value < 0 || value > max) fail("INVALID_PARAMETER", 0, `PD value must be an integer from 0 to ${max}.`);
    return value;
}
/** @param {Buffer} p @param {number} at @param {Partial<import("./types.js").PdTap>} [value] */
function writeTap(p, at, value = {}) {
    object(value, ["keycode", "modifierPolicy", "mask"], "Tap");
    p.writeUInt16LE(integer(optional(value.keycode, 0), 65535), at);
    p[at + 2] = integer(optional(value.modifierPolicy, 0), 255);
    p[at + 3] = integer(optional(value.mask, 0), 255);
}
/** @param {Buffer} p @param {import("./types.js").PdSlotInput} input @param {number} id */
function writeRecord(p, input, id) {
    const slot = object(input, ["id", "kind", "pointerLayer", "axis", "dpi", "heldModifiers", "name", "linkedLayers", "linkTurnsOn", "linkEnds", "thresholdX", "thresholdY", "directions", "scroll", "diagonals", "emptyDirection", "directionOutput"], "Slot");
    p[0] = integer(slot.id, 255);
    for (const [at, name] of /** @type {[number, 'kind' | 'pointerLayer' | 'axis' | 'heldModifiers' | 'linkEnds'][]} */ ([[1, "kind"], [2, "pointerLayer"], [3, "axis"], [6, "heldModifiers"], [11, "linkEnds"]])) p[at] = integer(optional(slot[name], 0), 255);
    for (const [at, name] of /** @type {[number, 'dpi' | 'linkedLayers' | 'linkTurnsOn' | 'thresholdX' | 'thresholdY'][]} */ ([[4, "dpi"], [12, "linkedLayers"], [14, "linkTurnsOn"], [32, "thresholdX"], [34, "thresholdY"]])) p.writeUInt16LE(integer(optional(slot[name], 0), 65535), at);
    if (!validName(slot.name)) {
        fail("INVALID_NAME", PD_DOMAIN.HEADER_SIZE + id * PD_DOMAIN.RECORD_SIZE + 8, `Names must fit ${NAME_MAX_BYTES} UTF-8 bytes and contain no ASCII controls.`);
    }
    p[8] = p.write(slot.name, PD_DOMAIN.NAME_OFFSET, NAME_MAX_BYTES, "utf8");
    const directions = object(optional(slot.directions, /** @type {Record<string, Partial<import("./types.js").PdTap>>} */ ({})), DIRECTIONS, "Directions");
    DIRECTIONS.forEach((name, i) => writeTap(p, 36 + i * 4, directions[name]));
    // Bytes 52..69, version 3's mouse button records, stay zero.
    const scroll = object(optional(slot.scroll, /** @type {Record<string, number>} */ ({})), [...SCROLL_U16, ...SCROLL_U8], "Scroll settings");
    const diagonals = object(optional(slot.diagonals, /** @type {Record<string, Partial<import("./types.js").PdTap>>} */ ({})), DIAGONALS, "Diagonals");
    if (slot.kind === PD_KIND.DIRECTIONAL) {
        // A directional record's bytes 70..90 hold diagonals or nothing.
        DIAGONALS.forEach((name, i) => writeTap(p, 70 + i * 4, diagonals[name]));
        p[86] = integer(optional(slot.emptyDirection, 0), 255);
        p[87] = integer(optional(slot.directionOutput, 0), 255);
    } else {
        SCROLL_U16.forEach((name, i) => p.writeUInt16LE(integer(optional(scroll[name], 0), 65535), 70 + i * 2));
        SCROLL_U8.forEach((name, i) => { p[84 + i] = integer(optional(scroll[name], 0), 255); });
    }
}
// The 32 slots, with only the records the sparse format needs. The bytes
// are checked by decoding them, so the decoder's own canonical check writes
// with writePdDomain rather than encoding again.
/** @param {import("./types.js").PdSlotInput[]} slots */
function encodePdDomain(slots) {
    const bytes = writePdDomain(slots);
    decodePdDomain(bytes);
    return bytes;
}
/** @param {import("./types.js").PdSlotInput[]} slots */
function writePdDomain(slots) {
    if (!Array.isArray(slots) || slots.length !== PD_DOMAIN.SLOTS) fail("INVALID_LENGTH", 0, `Exactly ${PD_DOMAIN.SLOTS} PD slots are required.`);
    const {RECORD_SIZE, SLOTS, VERSION} = PD_DOMAIN;
    const records = [];
    for (let id = 0; id < SLOTS; id++) {
        const slot = slots[id];
        if (!slot || typeof slot !== "object" || Array.isArray(slot)) fail("INVALID_ARGUMENT", 0, "Slot must be an object with supported fields.");
        if (slot.id !== id) fail("INVALID_ID", 0, `PD slots must appear exactly once in ID order 0–${SLOTS - 1}.`);
        if (!storesRecord({kind: slot.kind ?? 0, name: slot.name})) continue;
        const p = Buffer.alloc(RECORD_SIZE);
        writeRecord(p, slot, id);
        records.push(p);
    }
    return Buffer.concat([Buffer.from([VERSION, SLOTS, RECORD_SIZE, records.length, 0, 0, 0, 0]), ...records]);
}

// One 128-byte record, and its rules, alone. The firmware's frozen record
// corpus is wrapped in the retired eight-slot envelope; the cross-language
// runner checks its records with these, and no profile carries that envelope.
/** @param {import("./types.js").PdSlotInput} slot @param {number} [id] */
function encodePdRecord(slot, id = slot?.id) {
    const p = Buffer.alloc(PD_DOMAIN.RECORD_SIZE);
    writeRecord(p, slot, id);
    return p;
}
/** @param {unknown} bytes @param {number} id @param {number} [offset] */
function validatePdRecord(bytes, id, offset = 0) {
    if (!Buffer.isBuffer(bytes) || bytes.length !== PD_DOMAIN.RECORD_SIZE) fail("INVALID_LENGTH", offset, `A PD record is ${PD_DOMAIN.RECORD_SIZE} bytes.`);
    validateRecord(bytes, id, offset);
}

module.exports = {PD_DOMAIN, PD_KIND, PD_LINK_ENDS, PD_LINK_LAYERS, PD_AXIS, PD_SCROLL_AXES, PD_EMPTY_DIRECTION, PD_DIRECTION_OUTPUT, PD_MODIFIERS, DIAGONALS, PD_CLICKS, isPdClick, PD_MACROS, isPdMacro, isPdTapKey, pdTapProblem, encodePdDomain, decodePdDomain, encodePdRecord, validatePdRecord};
