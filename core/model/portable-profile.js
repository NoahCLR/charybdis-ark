// @ts-check
"use strict";

/**
 * @typedef {import("./types.js").PortableDocument} PortableDocument
 * @typedef {import("./types.js").DecodedProfile} DecodedProfile
 * @typedef {import("./types.js").ProfileDestination} ProfileDestination
 * @typedef {{kind: number, operand: number}} WalkAction
 */
const {keycodeAction, knownActionAbi, pdSlotOfCode} = require("../schema/actions");
const {decodeProfileBlob, encodeProfileBlob, crc32, fnv1a32, PROFILE_BLOB_V1, PROFILE_DOMAIN_VERSIONS, ProfileBlobProtocolError} = require("../schema/profile-blob-v1");
const {supportsComboOutputBehaviors, ALL_LAYERS, COMBO_DOMAIN_VERSION, encodeComboDomain} = require("../schema/combo-domain-v1");
const {SETTING, SETTING_FIELDS, decodeSettings} = require("../schema/settings-domain-v1");
const {CHARYBDIS_4X6_LAYOUT_MATRIX, LAYERS, MATRIX_KEYS, matrixPosition} = require("../data/charybdis-layout");
const {LAYER_LOCK_BASE, LAYER_LOCK_SLOTS} = require("../data/user-keycodes");
const {layerName} = require("./vocabulary");
const {decodeMacroPayload} = require("../schema/macro-payload");
const {supportsUnicodeMacros, supportsMacroProtection} = require("../schema/macro-payload");
const {hostSettings, supportsHostLayouts, LAYOUT_MASK, MACOS_ISO} = require("../schema/host-settings");
const {profileDepthOptions} = require("../schema/profile-depth");

// A portable profile is the keyboard's whole configuration in the one format
// it stores: sixteen layers, the 128 VIA macros, and a schema 3.0 profile with
// every domain (RGB 4, key behaviours 2, combos 3, settings 8, PD 3) in the
// action vocabulary Ark knows (firmware D-F14, D-F26). The keyboard migrates
// nothing: a backup in an older format is refused here, and translated by
// backup-translation.js before anything else reads it; a keyboard still
// storing an older domain is read through the same translation, read-only.
const MACRO_SLOTS = 128;
// A file holds at most a full 65,504-byte profile in base64, sixteen layers of
// keys and a full macro bank; this ceiling leaves room for all three.
const FILE_MAX_BYTES = 262144;
const {PROFILE_DOMAINS, PROFILE_DOMAIN_IDS, PROFILE_DOMAIN_MASK, READABLE_DOMAIN_VERSIONS, domainCodec, encodeProfileDomains} = require("../schema/profile-domains");
const DOMAIN_IDS = PROFILE_DOMAINS.map(domain => domain.id);
/** @param {number} id @param {Buffer} payload */
const domain = (id, payload) => ({id, version: PROFILE_DOMAIN_VERSIONS[id], payload});
/** @param {string} message */
const fail = message => Object.assign(new Error(message), {code: "INVALID_PORTABLE_PROFILE"});
/** @param {unknown} value @returns {value is number} */
const u16 = value => typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 65535;
const PHYSICAL_MATRIX_SLOTS = new Set(CHARYBDIS_4X6_LAYOUT_MATRIX.map((position, layoutIndex) => matrixPosition(layoutIndex)));
/** @param {unknown} value @param {number} max @param {string} label */
function base64(value, max, label) {
    if (typeof value !== "string" || value.length > Math.ceil(max / 3) * 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw fail(`Invalid ${label}.`);
    const bytes = Buffer.from(value, "base64");
    if (bytes.length > max || bytes.toString("base64") !== value) throw fail(`Invalid ${label}.`);
    return bytes;
}
// Capture parses the stored format; validateSnapshot gates the destination.
// Unicode bytes must survive capture even before capability checks run.
/** @param {Buffer} bytes @param {number} count */
function macroSlots(bytes, count) {
    if (!Buffer.isBuffer(bytes) || bytes.at(-1) !== 0) throw fail("The macro bank has an unfinished write.");
    const slots = []; let offset = 0;
    while (slots.length < count) {
        const end = bytes.indexOf(0, offset);
        if (end < offset || end >= bytes.length - 1) throw fail("The macro bank is missing a slot terminator.");
        const slot = Buffer.from(bytes.subarray(offset, end)); validateViaMacro(slot, {unicode: true, protectionSupported: true}); slots.push(slot); offset = end + 1;
    }
    return slots;
}
/** @param {Buffer} bytes @param {import("../schema/types.js").MacroOptions} [options] */
function validateViaMacro(bytes, {unicode = false, textEntry = false, layout, protectionSupported = false} = {}) {
    decodeMacroPayload(bytes, {unicode, textEntry, layout, protectionSupported});
    const held = new Set(); let index = 0;
    /** @param {number} v */
    const key = v => (v >= 4 && v <= 0xa4) || (v >= 0xe0 && v <= 0xe7);
    while (index < bytes.length) {
        const b = bytes[index++];
        if (b !== 1) continue;
        const type = bytes[index++];
        if (type === 5) {index++; continue;}
        if (type === 4) {
            let digits = "";
            while (index < bytes.length && bytes[index] >= 48 && bytes[index] <= 57 && digits.length < 5) digits += String.fromCharCode(bytes[index++]);
            if (!digits || Number(digits) > 65535 || bytes[index++] !== 124) throw fail("Invalid macro delay.");
        } else {
            const k = bytes[index++];
            if (![1, 2, 3].includes(type) || !key(k)) throw fail("Unsupported macro key instruction.");
            if (type === 1 && held.has(k)) throw fail("A macro taps a key it already holds.");
            if (type === 2) {if (held.has(k) || held.size >= 16) throw fail("Unbalanced macro keys."); held.add(k);}
            if (type === 3 && !held.delete(k)) throw fail("Unbalanced macro keys.");
        }
    }
    if (held.size) throw fail("A macro leaves keys pressed.");
}
// The macro bank the sixteen-layer storage geometry has, when no keyboard says:
// a 12 KiB VIA region less config and the 1,920-byte keymap (D-F14).
const MACRO_BANK_BYTES = 10327;
const MACRO_BANK_MAX_BYTES = 65535;
/** @param {Buffer[]} slots @param {number} capacity */
function macroBank(slots, capacity) {
    const size = slots.reduce((total, bytes) => total + bytes.length + 1, 1);
    if (!Number.isInteger(capacity) || capacity < MACRO_SLOTS + 1 || capacity > MACRO_BANK_MAX_BYTES) throw fail("Unsupported macro storage capacity.");
    if (size > capacity) throw fail(`Macros need ${size} bytes; this keyboard has ${capacity}, so they are ${size - capacity} bytes over. Shorten or clear macros before restoring.`);
    const result = Buffer.alloc(capacity); let offset = 0;
    for (const slot of slots) {slot.copy(result, offset); offset += slot.length + 1;}
    return result;
}
// A domain a keyboard still stores in an older version, translated to the
// current one by the same steps a backup takes (D-L63). The keyboard keeps
// its own bytes: the translation only lets it be shown, never written.
/** @param {import("../schema/types.js").ProfileDomain} stored @returns {import("../schema/types.js").ProfileDomain} */
function currentDomain(stored) {
    return stored.version < PROFILE_DOMAIN_VERSIONS[stored.id] ? require("./backup-translation").translateDomain(stored) : stored;
}
/** @param {Uint8Array} active @param {Uint8Array} defaults @param {Buffer} settings */
function liveDomains(active, defaults, settings) {
    const live = decodeProfileBlob(active, {domainVersions: READABLE_DOMAIN_VERSIONS}), fallback = decodeProfileBlob(defaults, {domainVersions: READABLE_DOMAIN_VERSIONS});
    /** @type {import("../schema/types.js").ProfileDomain[]} */
    const stored = [PROFILE_DOMAIN_IDS.RGB, PROFILE_DOMAIN_IDS.KEY_BEHAVIORS, PROFILE_DOMAIN_IDS.PD_MODES].map(id => {
        const found = live.domains.find(d => d.id === id) || fallback.domains.find(d => d.id === id);
        if (!found) throw fail("The keyboard did not report every profile domain.");
        return found;
    });
    return [...stored, {id: PROFILE_DOMAIN_IDS.SETTINGS, version: settings[0], payload: settings}];
}
// The domains a keyboard stores in an older version than this app writes: it
// is shown read-only until both halves are updated (D-L63).
/** @param {Uint8Array} active @param {Uint8Array} defaults @param {Buffer} settings @returns {import("./types.js").OlderDomain[]} */
function olderDomains(active, defaults, settings) {
    return liveDomains(active, defaults, settings).filter(stored => stored.version < PROFILE_DOMAIN_VERSIONS[stored.id]).map(({id, version}) => ({id, version}));
}
/** @param {Uint8Array} active @param {Uint8Array} defaults @param {import("./types.js").NativeComboTable} combos @param {Buffer} settings */
function materializeProfile(active, defaults, combos, settings) {
    if (!combos || combos.noTimer || combos.customTrigger || combos.customRelease || combos.customRepress || combos.strictTimer || combos.fixedReference) throw fail("This keyboard uses combo hooks or timing that cannot be represented by a portable profile.");
    const domains = liveDomains(active, defaults, settings).map(currentDomain);
    const current = /** @type {import("../schema/types.js").ProfileDomain} */ (domains.pop());
    const table = comboTableOf(combos);
    decodeSettings(current.payload);
    domains.push(domain(PROFILE_DOMAIN_IDS.COMBOS, encodeComboDomain(table)), domain(PROFILE_DOMAIN_IDS.SETTINGS, current.payload));
    return encodeProfileBlob({domains});
}
// The combo table the keyboard runs, as it stores it: which combos follow the
// default window, and the two shared values.
/** @param {import("./types.js").NativeComboTable} combos */
function comboTableOf(combos) {
    return {version: COMBO_DOMAIN_VERSION, defaultTermMs: combos.defaultTermMs, holdTermMs: combos.holdTermMs,
        rows: combos.rows.map(row => ({inputs: row.inputs.map(keycodeAction), output: keycodeAction(row.output),
            termMs: row.followsDefault ? null : row.termMs, mustHold: row.mustHold, mustTap: row.mustTap, ordered: row.ordered,
            enabled: row.enabled ?? true, useOutputBehavior: row.useOutputBehavior ?? true, allowedLayers: row.allowedLayers ?? ALL_LAYERS}))};
}
/** @param {{profile: Buffer, via: {layers: number, layout: Buffer, macros: Buffer, macroSlots: number}, actionAbiDigest: number}} snapshot */
function createSnapshot({profile, via, actionAbiDigest}) {
    /** @type {PortableDocument} */
    const document = {format: "charybdis-profile", version: decodeProfileBlob(profile).schema.major, keyboard: "charybdis-4x6", actionAbiDigest,
        layers: Array.from({length: via.layers}, (_, layer) => Array.from({length: MATRIX_KEYS}, (_, pos) => via.layout.readUInt16BE((layer * MATRIX_KEYS + pos) * 2))),
        profile: profile.toString("base64"), macros: macroSlots(via.macros, via.macroSlots).map(bytes => bytes.toString("base64"))};
    validateSnapshot(document); return document;
}
/** @param {unknown} value @param {ProfileDestination} [capabilities] @returns {DecodedProfile} */
function validateSnapshot(value, capabilities) {
    if (typeof value === "string") {
        if (Buffer.byteLength(value) > FILE_MAX_BYTES) throw fail("This profile file is too large.");
        try {value = JSON.parse(value);} catch {throw fail("This is not a valid profile file.");}
    }
    // Inspect the unvalidated object; its complete shape is established below.
    const candidate = /** @type {Partial<Record<keyof PortableDocument, unknown>> | null | undefined} */ (value);
    if (!candidate || candidate.format !== "charybdis-profile" || candidate.keyboard !== "charybdis-4x6" || typeof candidate.actionAbiDigest !== "number" || !Number.isInteger(candidate.actionAbiDigest) || candidate.actionAbiDigest < 1 || candidate.actionAbiDigest > 0xffffffff) throw fail("Choose a supported Charybdis profile file.");
    if (candidate.version !== PROFILE_BLOB_V1.SCHEMA_MAJOR || !knownActionAbi(candidate.actionAbiDigest)) throw fail("This profile is from older firmware, in a format the keyboard no longer stores. Export a new backup from current firmware.");
    if (Object.keys(candidate).some(key => !["format", "version", "keyboard", "actionAbiDigest", "layers", "profile", "macros"].includes(key))) throw fail("This profile contains unsupported fields.");
    if (!Array.isArray(candidate.layers) || candidate.layers.length !== LAYERS || candidate.layers.some(keys => !Array.isArray(keys) || keys.length !== MATRIX_KEYS || !keys.every(u16))) throw fail(`A complete profile must contain all ${LAYERS} layers.`);
    if (!Array.isArray(candidate.macros) || candidate.macros.length !== MACRO_SLOTS) throw fail(`A complete profile must contain all ${MACRO_SLOTS} macro slots.`);
    // The exact layer-bank shape and uint16 values were checked above.
    const layers = /** @type {number[][]} */ (candidate.layers);
    const macros = candidate.macros.map(slot => {const bytes = base64(slot, MACRO_BANK_MAX_BYTES, "macro"); validateViaMacro(bytes, {unicode: capabilities ? supportsUnicodeMacros(capabilities) : true, protectionSupported: capabilities ? supportsMacroProtection(capabilities) : true}); return bytes;});
    const profile = base64(candidate.profile, PROFILE_BLOB_V1.MAX_SIZE, "profile data");
    if (capabilities?.maxProfilePayload !== undefined && profile.length > capabilities.maxProfilePayload) throw fail(`The profile needs ${profile.length} bytes; this keyboard holds ${capabilities.maxProfilePayload}.`);
    let domains;
    try {domains = decodeProfileBlob(profile).domains;} catch (error) {
        if (error instanceof ProfileBlobProtocolError && ["INCOMPATIBLE_SCHEMA", "UNKNOWN_DOMAIN_VERSION"].includes(error.code)) throw fail("This profile is from older firmware, in a format the keyboard no longer stores. Export a new backup from current firmware.");
        throw error;
    }
    if (domains.map(d => d.id).join() !== DOMAIN_IDS.join()) throw fail("The profile is missing configuration. Partial profiles cannot be restored as a complete backup.");
    /** @param {import("../schema/profile-domains-types.js").DomainKey} key */
    const payload = key => /** @type {import("../schema/types.js").ProfileDomain} */ (domains.find(domain => domain.id === domainCodec(key).id)).payload;
    const pdModes = domainCodec("pdModes").decode(payload("pdModes"));
    const codecOptions = profileDepthOptions(capabilities, payload("rgb"));
    const rgb = domainCodec("rgb").decode(payload("rgb"), codecOptions), behaviors = domainCodec("behaviors").decode(payload("behaviors"), codecOptions),
        combos = domainCodec("combos").decode(payload("combos")), settings = domainCodec("settings").decode(payload("settings"));
    if (capabilities && !supportsComboOutputBehaviors(capabilities) && (settings.comboOutputBehaviors === false || combos.rows.some(row => !row.useOutputBehavior))) throw fail("This firmware cannot bypass combo output behaviours. Update both halves before restoring this profile.");
    const hostWord = settings.values[SETTING.UNICODE_HOST_MODE];
    if (hostWord && capabilities && !supportsUnicodeMacros(capabilities)) throw fail("This firmware cannot use Host settings. Update both halves before restoring this profile.");
    if (hostWord & (LAYOUT_MASK | MACOS_ISO) && capabilities && !supportsHostLayouts(capabilities)) throw fail("This firmware cannot type through a host keyboard layout. Update both halves before restoring this profile.");
    // With Unicode playback on, a held ordinary key cannot span text the
    // layout leaves to Unicode entry.
    if (hostWord & 0x100) for (const macro of macros) validateViaMacro(macro, {unicode: true, textEntry: true, layout: hostSettings(settings.values).layout, protectionSupported: capabilities ? supportsMacroProtection(capabilities) : true});
    if (rgb.layerColors.length !== LAYERS || rgb.layerColors.some(row => row.layerId >= LAYERS)) throw fail(`RGB does not cover all ${LAYERS} layers.`);
    // A binding for an empty slot is allowed, because the keyboard allows it:
    // the mode keycodes are a fixed registry, and the runtime refuses to
    // activate a slot whose record is empty rather than misbehaving
    // (`noah_effective_pd_for_mask` returns nothing, and both activate and lock
    // bail out on that). So a pointing-mode key stays where it is and does
    // nothing until its slot is configured again. They are counted here so the
    // interface can say so before anyone wonders why a key went quiet.
    /** @type {Map<number, number>} */
    const danglingPdBindings = new Map();
    /** @param {number | undefined} id */
    const checkPd = id => {
        if (id === undefined || pdModes[id]?.kind) return;
        danglingPdBindings.set(id, (danglingPdBindings.get(id) || 0) + 1);
    };
    /** @param {number} code */
    const checkNativePd = code => checkPd(pdSlotOfCode(code));
    layers.flat().forEach(checkNativePd);
    /** @param {WalkAction} action */
    const checkAction = action => {
        if ([4, 5].includes(action.kind)) checkPd(action.operand);
        if (action.kind === 1) checkNativePd(action.operand);
        if ([2, 3].includes(action.kind) && action.operand >= LAYERS) throw fail("A profile action references a missing layer.");
    };
    walkActions(behaviors, checkAction); walkActions(combos, checkAction);
    const layout = Buffer.alloc(LAYERS * MATRIX_KEYS * 2); layers.flat().forEach((v, id) => layout.writeUInt16BE(v, id * 2));
    if (capabilities && (candidate.actionAbiDigest !== capabilities.actionAbiDigest || capabilities.compiledLayerCount !== LAYERS || ((capabilities.supportedDomainMask ?? 0) & PROFILE_DOMAIN_MASK) !== PROFILE_DOMAIN_MASK)) throw fail(`The connected firmware does not support this profile's action vocabulary or ${LAYERS}-layer storage.`);
    // A portable file stores streams, not a bank geometry. Without a device,
    // preserve larger backups; a destination pads or refuses them by its size.
    const stored = macros.reduce((total, bytes) => total + bytes.length + 1, 1);
    const bank = macroBank(macros, capabilities?.viaMacroBytes ?? (capabilities ? MACRO_BANK_BYTES : Math.max(MACRO_BANK_BYTES, stored)));
    return {document: /** @type {PortableDocument} */ (candidate), profile, layout, macros: bank, settings, rgb, behaviors, combos, pdModes, codecOptions, danglingPdBindings: Object.fromEntries(danglingPdBindings)};
}

// A profile with a renamed macro or custom key. Every name fits the settings
// domain, but the whole profile shares one ceiling, so a long name can meet it
// once behaviours, combos and other names have used the room.
/** @param {import("../schema/types.js").BlobInput} profile */
function encodeNamedProfile(profile) {
    try {
        return encodeProfileBlob(profile);
    } catch (error) {
        if (!(error instanceof ProfileBlobProtocolError) || error.code !== "CAPACITY_EXCEEDED") throw error;
        throw Object.assign(new Error("The keyboard's profile is full, so this name does not fit. Shorten another name, or remove a behaviour or combo."), {code: "PROFILE_FULL"});
    }
}

/** @param {unknown} value @param {(action: WalkAction) => void} action */
function walkActions(value, action) {
    if (!value || typeof value !== "object") return;
    if ("kind" in value && "operand" in value && Number.isInteger(value.kind) && Number.isInteger(value.operand)) {action(/** @type {WalkAction} */ (value)); return;}
    for (const child of Object.values(value)) if (Array.isArray(child)) child.forEach(v => walkActions(v, action)); else if (child && typeof child === "object") walkActions(child, action);
}
// The fingerprint and summary of a document, from its decoded form when the
// caller already has it, so a document decoded once is not decoded again.
/** @param {Pick<DecodedProfile, 'document' | 'profile' | 'layout' | 'macros'>} snapshot */
function fingerprintOf({document, profile, layout, macros}) {
    // Bank padding is destination geometry, not part of a portable edit.
    // Retain legacy fingerprints for small profiles and normalize larger ones
    // to their streams plus terminators and validity byte.
    const length = Math.max(MACRO_BANK_BYTES, document.macros.reduce((sum, encoded) => sum + Buffer.byteLength(encoded, "base64") + 1, 1));
    const canonical = macros.length === length ? macros : Buffer.alloc(length);
    if (canonical !== macros) macros.copy(canonical, 0, 0, Math.min(length, macros.length));
    const bytes = Buffer.concat([profile, layout, canonical]);
    return `${document.actionAbiDigest}:${crc32(bytes)}:${fnv1a32(bytes)}`;
}
/** @param {unknown} document */
const fingerprint = document => fingerprintOf(validateSnapshot(document));
// A snapshot's decoded form: the one it carries when that belongs to its very
// document (the draft decodes each revision once and hands it on), otherwise
// decoded now. A copy with another document never reuses a stale decode.
/** @param {{document: PortableDocument, decoded?: DecodedProfile}} snapshot */
const decodedOf = snapshot => snapshot.decoded && snapshot.decoded.document === snapshot.document ? snapshot.decoded : validateSnapshot(snapshot.document);
// Moves each layer to its new place with everything it holds: its keys, name,
// RGB colour and per-layer settings, and the settings that point at it (the
// pointer and sniping layers). With keysFollow, the default, every layer key
// (MO, LT, TG, TO, TT, OSL, DF, LM, LOCK_LAYER...) on a layer, in a behaviour
// or on a combo is renumbered to reach the same layer; without it those keys
// keep their numbers and reach whatever layer now sits there.
//
// Any layer may be put at the bottom, which makes it the base: always on, and
// what every transparent key falls through to. The new base and the old one
// trade roles rather than follow: a layer key that reached the base still
// reaches the bottom slot, so TO(0) still goes home, and one that reached the
// new base now reaches the old base wherever it went, so the key that held
// Numbers from Base holds Base from Numbers. Following would leave MO(0),
// TG(0) and the like, which do nothing since the base is always on. The
// startup layers are slots in the same way. The pointer and sniping layers and
// the combo references name a layer by what it holds, so they follow it.
//
// The swap is not keysFollow's to turn off: keys that kept their numbers would
// reach whatever took the old base's slot once it moved on, so the key that
// switched back would switch somewhere else. Without keysFollow, only the
// references to the other layers keep their numbers.
// An empty physical key entering the base stops there; an intentionally empty
// physical key leaving it falls through to the new base. The four unused matrix
// slots keep their stored values. An uncoloured old base also keeps
// the saved base HSV as its own all-key colour after it becomes an overlay.
/** @param {PortableDocument} document @param {readonly number[]} order @param {readonly string[]} [names] @param {{keysFollow?: boolean}} [options] */
function reorderLayers(document, order, names, {keysFollow = true} = {}) {
    const validated = validateSnapshot(document);
    /** @type {PortableDocument} */
    const result = JSON.parse(JSON.stringify(document));
    if (!Array.isArray(order) || order.length !== LAYERS || new Set(order).size !== LAYERS || order.some(id => !Number.isInteger(id) || id < 0 || id >= LAYERS)) throw fail("Include every layer once.");
    /** @type {number[]} */
    const remap = []; order.forEach((old, next) => {remap[old] = next;});
    /** @param {number} old */
    const reach = old => (old === 0 ? 0 : old === order[0] ? remap[0] : keysFollow ? remap[old] : old);
    const renumbers = keysFollow || order[0] !== 0;
    /** @param {number} code */
    function native(code) {
        if (!renumbers) return code;
        if (code >= 0x4000 && code <= 0x4fff) {const layer = (code >> 8) & 15; if (layer >= LAYERS) throw fail("A key points outside the layer bank."); return (code & 0xf0ff) | (reach(layer) << 8);}
        for (const start of [0x5200, 0x5220, 0x5240, 0x5260, 0x5280, 0x52c0, 0x52e0, LAYER_LOCK_BASE]) {
            const width = start === LAYER_LOCK_BASE ? LAYER_LOCK_SLOTS : 32;
            if (code >= start && code < start + width) {if (code - start >= LAYERS) throw fail("A key points outside the layer bank."); return start + reach(code - start);}
        }
        // Layer-mod stores a four-bit layer followed by five modifier bits.
        if (code >= 0x5000 && code <= 0x51ff) {const layer = (code >> 5) & 15; if (layer >= LAYERS) throw fail("Invalid layer-mod reference."); return (code & 0xfe1f) | reach(layer) << 5;}
        return code;
    }
    result.layers = order.map(old => document.layers[old].map(native));
    if (order[0] !== 0) {
        result.layers[0] = result.layers[0].map((code, slot) => PHYSICAL_MATRIX_SLOTS.has(slot) && code === 0x0001 ? 0x0000 : code);
        result.layers[remap[0]] = result.layers[remap[0]].map((code, slot) => PHYSICAL_MATRIX_SLOTS.has(slot) && code === 0x0000 ? 0x0001 : code);
    }
    const {rgb, behaviors, combos, settings, pdModes} = validated;
    /** @param {WalkAction} a */
    const action = a => {if (!renumbers) return; if ([2, 3].includes(a.kind)) a.operand = reach(a.operand); else if (a.kind === 1) a.operand = native(a.operand);};
    walkActions(behaviors, action); walkActions(combos, action);
    rgb.layerColors.forEach(row => {row.layerId = remap[row.layerId];}); rgb.layerColors.sort((a, b) => a.layerId - b.layerId);
    if (order[0] !== 0) {
        // Validation requires a row for every layer, and order is a permutation.
        const oldBase = /** @type {typeof rgb.layerColors[number]} */ (rgb.layerColors.find(row => row.layerId === remap[0]));
        if (oldBase.color.s === 0 && oldBase.color.v === 0) {
            const hsv = settings.values[SETTING.RGB_COLOR];
            oldBase.color = {h: hsv & 0xff, s: (hsv >>> 8) & 0xff, v: (hsv >>> 16) & 0xff};
            oldBase.mode = 0; // ALL_KEYS: the base effect covered the whole layer.
        }
    }
    rgb.layerGroupRows.forEach(row => {if (row.selector !== 255) row.selector = remap[row.selector];});
    // A name the editor only showed as a default ("Layer 9" for an unnamed
    // layer) stays unnamed, wherever the layer goes.
    /** @param {string} name @param {number} old */
    const unnamed = (name, old) => name === layerName([], old) && settings.names[old] === "";
    settings.names = names ? names.map((name, next) => (unnamed(name, order[next]) ? "" : name)) : order.map(old => settings.names[old]);

    // Each layer's switches, placements and combo reference go with it; a
    // reference names a layer by what it holds, so it follows that layer.
    /** @param {number} mask */
    const follow = mask => remap.reduce((moved, next, old) => (moved | ((mask >>> old) & 1) << next) >>> 0, 0);
    for (const field of SETTING_FIELDS) {
        if (field.layerReference === "layer") settings.values[field.id] = remap[settings.values[field.id]];
        else if (field.layerReference === "mask") {
            /** @type {(old: number) => number} */
            const move = field.layerReorder === "reach" ? reach : old => remap[old];
            const mask = settings.values[field.id];
            settings.values[field.id] = remap.reduce((result, next, old) => (result | ((mask >>> old) & 1) << move(old)) >>> 0, 0);
        }
    }
    settings.layers = order.map(old => ({...settings.layers[old], reference: remap[settings.layers[old].reference]}));
    // The layers a behaviour or combo may act on are layers by what they hold.
    behaviors.rows.forEach(row => {row.allowedLayers = follow(row.allowedLayers);});
    combos.rows.forEach(row => {row.allowedLayers = follow(row.allowedLayers);});
    result.profile = encodeProfileBlob({domains: encodeProfileDomains({rgb, behaviors, combos, settings, pdModes}, validated.codecOptions)}).toString("base64");
    validateSnapshot(result); return result;
}
/** @param {unknown} document */
const summary = document => summaryOf(validateSnapshot(document));
/** @param {DecodedProfile} value */
function summaryOf(value) {
    return {layers: value.document.layers.length, behaviors: value.behaviors.rows.length, combos: value.combos.rows.length,
        macros: value.document.macros.filter(Boolean).length,
        names: value.settings.names.map((name, index) => layerName(value.settings.names, index))};
}
module.exports = {LAYERS, MACRO_SLOTS, MACRO_BANK_BYTES, MACRO_BANK_MAX_BYTES, FILE_MAX_BYTES, encodeNamedProfile, comboTableOf, createSnapshot, validateSnapshot, materializeProfile, olderDomains, currentDomain, macroSlots, macroBank, validateViaMacro, fingerprint, fingerprintOf, decodedOf, reorderLayers, summary, summaryOf};
