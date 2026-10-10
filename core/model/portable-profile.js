"use strict";
const {keycodeAction, knownActionAbi, pdSlotOfCode} = require("../schema/actions");
const {decodePdDomain, encodePdDomain} = require("../schema/pd-mode-domain-v1");
const {decodeProfileBlob, encodeProfileBlob, crc32, fnv1a32, PROFILE_BLOB_V1, PROFILE_DOMAIN_VERSIONS} = require("../schema/profile-blob-v1");
const {decodeRgbDomainV1, encodeRgbDomainV1} = require("../schema/rgb-domain-v1");
const {decodeKeyBehaviorDomain, encodeKeyBehaviorDomain} = require("../schema/key-behavior-domain-v1");
const {ALL_LAYERS, COMBO_DOMAIN_VERSION, decodeComboDomain, encodeComboDomain} = require("../schema/combo-domain-v1");
const {SETTING, decodeSettings, encodeSettings} = require("../schema/settings-domain-v1");
const {CHARYBDIS_4X6_LAYOUT_MATRIX} = require("../data/charybdis-layout");
const {LAYER_LOCK_BASE, LAYER_LOCK_SLOTS} = require("../data/user-keycodes");
const {layerName} = require("./vocabulary");
const {decodeMacroPayload} = require("../schema/macro-payload");
const {supportsUnicodeMacros, supportsMacroProtection} = require("../schema/macro-payload");
const {hostSettings, supportsHostLayouts, LAYOUT_MASK, MACOS_ISO} = require("../schema/host-settings");
const {profileDepthOptions} = require("../schema/profile-depth");

// A portable profile is the keyboard's whole configuration in the one format
// it stores: sixteen layers, the 128 VIA macros, and a schema 3.0 profile with
// every domain (RGB 4, key behaviours 2, combos 3, settings 6, PD 3) in the
// action vocabulary Ark knows (firmware D-F14). The keyboard migrates nothing:
// a backup in an older format is refused here, and translated by
// backup-translation.js before anything else reads it.
const LAYERS = 16, MACRO_SLOTS = 128, MATRIX_KEYS = 60;
// A file holds at most a full 65,504-byte profile in base64, sixteen layers of
// keys and a full macro bank; this ceiling leaves room for all three.
const FILE_MAX_BYTES = 262144;
const DOMAIN_IDS = Object.keys(PROFILE_DOMAIN_VERSIONS).map(Number).sort((a, b) => a - b);
const domain = (id, payload) => ({id, version: PROFILE_DOMAIN_VERSIONS[id], payload});
const fail = message => Object.assign(new Error(message), {code: "INVALID_PORTABLE_PROFILE"});
const u16 = value => Number.isInteger(value) && value >= 0 && value <= 65535;
const PHYSICAL_MATRIX_SLOTS = new Set(CHARYBDIS_4X6_LAYOUT_MATRIX.map(([row, column]) => row * 6 + column));
function base64(value, max, label) {
    if (typeof value !== "string" || value.length > Math.ceil(max / 3) * 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw fail(`Invalid ${label}.`);
    const bytes = Buffer.from(value, "base64");
    if (bytes.length > max || bytes.toString("base64") !== value) throw fail(`Invalid ${label}.`);
    return bytes;
}
// Capture parses the stored format; validateSnapshot gates the destination.
// Unicode bytes must survive capture even before capability checks run.
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
function validateViaMacro(bytes, {unicode = false, textEntry = false, layout, protectionSupported = false} = {}) {
    decodeMacroPayload(bytes, {unicode, textEntry, layout, protectionSupported});
    const held = new Set(); let index = 0;
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
function macroBank(slots, capacity) {
    const size = slots.reduce((total, bytes) => total + bytes.length + 1, 1);
    if (size > capacity) throw fail(`Macros need ${size} bytes; this keyboard has ${capacity}.`);
    const result = Buffer.alloc(capacity); let offset = 0;
    for (const slot of slots) {slot.copy(result, offset); offset += slot.length + 1;}
    return result;
}
function materializeProfile(active, defaults, combos, settings) {
    if (!combos || combos.noTimer || combos.customTrigger || combos.customRelease || combos.customRepress || combos.strictTimer || combos.fixedReference) throw fail("This keyboard uses combo hooks or timing that cannot be represented by a portable profile.");
    const live = decodeProfileBlob(active), fallback = decodeProfileBlob(defaults);
    const domains = [0x10, 0x20, 0x50].map(id => {
        const found = live.domains.find(d => d.id === id) || fallback.domains.find(d => d.id === id);
        if (!found) throw fail("The keyboard did not report every profile domain.");
        return found;
    });
    const table = comboTableOf(combos);
    decodeSettings(settings);
    domains.push(domain(0x30, encodeComboDomain(table)), domain(0x40, settings));
    return encodeProfileBlob({domains});
}
// The combo table the keyboard runs, as it stores it: which combos follow the
// default window, and the two shared values.
function comboTableOf(combos) {
    return {version: COMBO_DOMAIN_VERSION, defaultTermMs: combos.defaultTermMs, holdTermMs: combos.holdTermMs,
        rows: combos.rows.map(row => ({inputs: row.inputs.map(keycodeAction), output: keycodeAction(row.output),
            termMs: row.followsDefault ? null : row.termMs, mustHold: row.mustHold, mustTap: row.mustTap, ordered: row.ordered,
            enabled: row.enabled ?? true, allowedLayers: row.allowedLayers ?? ALL_LAYERS}))};
}
function createSnapshot({profile, via, actionAbiDigest}) {
    const document = {format: "charybdis-profile", version: decodeProfileBlob(profile).schema.major, keyboard: "charybdis-4x6", actionAbiDigest,
        layers: Array.from({length: via.layers}, (_, layer) => Array.from({length: MATRIX_KEYS}, (_, pos) => via.layout.readUInt16BE((layer * MATRIX_KEYS + pos) * 2))),
        profile: profile.toString("base64"), macros: macroSlots(via.macros, via.macroSlots).map(bytes => bytes.toString("base64"))};
    validateSnapshot(document); return document;
}
function validateSnapshot(value, capabilities) {
    if (typeof value === "string") {
        if (Buffer.byteLength(value) > FILE_MAX_BYTES) throw fail("This profile file is too large.");
        try {value = JSON.parse(value);} catch {throw fail("This is not a valid profile file.");}
    }
    if (!value || value.format !== "charybdis-profile" || value.keyboard !== "charybdis-4x6" || !Number.isInteger(value.actionAbiDigest) || value.actionAbiDigest < 1 || value.actionAbiDigest > 0xffffffff) throw fail("Choose a supported Charybdis profile file.");
    if (value.version !== PROFILE_BLOB_V1.SCHEMA_MAJOR || !knownActionAbi(value.actionAbiDigest)) throw fail("This profile is from older firmware, in a format the keyboard no longer stores. Export a new backup from current firmware.");
    if (Object.keys(value).some(key => !["format", "version", "keyboard", "actionAbiDigest", "layers", "profile", "macros"].includes(key))) throw fail("This profile contains unsupported fields.");
    if (!Array.isArray(value.layers) || value.layers.length !== LAYERS || value.layers.some(keys => !Array.isArray(keys) || keys.length !== MATRIX_KEYS || !keys.every(u16))) throw fail(`A complete profile must contain all ${LAYERS} layers.`);
    if (!Array.isArray(value.macros) || value.macros.length !== MACRO_SLOTS) throw fail(`A complete profile must contain all ${MACRO_SLOTS} macro slots.`);
    const macros = value.macros.map(slot => {const bytes = base64(slot, MACRO_BANK_BYTES, "macro"); validateViaMacro(bytes, {unicode: capabilities ? supportsUnicodeMacros(capabilities) : true, protectionSupported: capabilities ? supportsMacroProtection(capabilities) : true}); return bytes;});
    const profile = base64(value.profile, PROFILE_BLOB_V1.MAX_SIZE, "profile data");
    let domains;
    try {domains = decodeProfileBlob(profile).domains;} catch (error) {
        if (["INCOMPATIBLE_SCHEMA", "UNKNOWN_DOMAIN_VERSION"].includes(error.code)) throw fail("This profile is from older firmware, in a format the keyboard no longer stores. Export a new backup from current firmware.");
        throw error;
    }
    if (domains.map(d => d.id).join() !== DOMAIN_IDS.join()) throw fail("The profile is missing configuration. Partial profiles cannot be restored as a complete backup.");
    const pdModes = decodePdDomain(domains[4].payload);
    const codecOptions = profileDepthOptions(capabilities, domains[0].payload);
    const rgb = decodeRgbDomainV1(domains[0].payload, codecOptions.rgb), behaviors = decodeKeyBehaviorDomain(domains[1].payload, codecOptions.behaviors), combos = decodeComboDomain(domains[2].payload), settings = decodeSettings(domains[3].payload);
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
    const danglingPdBindings = new Map();
    const checkPd = id => {
        if (id === undefined || pdModes[id]?.kind) return;
        danglingPdBindings.set(id, (danglingPdBindings.get(id) || 0) + 1);
    };
    const checkNativePd = code => checkPd(pdSlotOfCode(code));
    value.layers.flat().forEach(checkNativePd);
    const checkAction = action => {
        if ([4, 5].includes(action.kind)) checkPd(action.operand);
        if (action.kind === 1) checkNativePd(action.operand);
        if ([2, 3].includes(action.kind) && action.operand >= LAYERS) throw fail("A profile action references a missing layer.");
    };
    walkActions(behaviors, checkAction); walkActions(combos, checkAction);
    const layout = Buffer.alloc(LAYERS * MATRIX_KEYS * 2); value.layers.flat().forEach((v, id) => layout.writeUInt16BE(v, id * 2));
    if (capabilities && (value.actionAbiDigest !== capabilities.actionAbiDigest || capabilities.compiledLayerCount !== LAYERS || (capabilities.supportedDomainMask & 31) !== 31)) throw fail(`The connected firmware does not support this profile's action vocabulary or ${LAYERS}-layer storage.`);
    const bank = macroBank(macros, capabilities?.viaMacroBytes ?? MACRO_BANK_BYTES);
    return {document: value, profile, layout, macros: bank, settings, rgb, behaviors, combos, pdModes, codecOptions, danglingPdBindings: Object.fromEntries(danglingPdBindings)};
}

// A profile with a renamed macro or custom key. Every name fits the settings
// domain, but the whole profile shares one ceiling, so a long name can meet it
// once behaviours, combos and other names have used the room.
function encodeNamedProfile(profile) {
    try {
        return encodeProfileBlob(profile);
    } catch (error) {
        if (error.code !== "CAPACITY_EXCEEDED") throw error;
        throw Object.assign(new Error("The keyboard's profile is full, so this name does not fit. Shorten another name, or remove a behaviour or combo."), {code: "PROFILE_FULL"});
    }
}

function walkActions(value, action) {
    if (!value || typeof value !== "object") return;
    if (Number.isInteger(value.kind) && Number.isInteger(value.operand)) {action(value); return;}
    for (const child of Object.values(value)) if (Array.isArray(child)) child.forEach(v => walkActions(v, action)); else if (child && typeof child === "object") walkActions(child, action);
}
// The fingerprint and summary of a document, from its decoded form when the
// caller already has it, so a document decoded once is not decoded again.
function fingerprintOf({document, profile, layout, macros}) {
    const bytes = Buffer.concat([profile, layout, macros]);
    return `${document.actionAbiDigest}:${crc32(bytes)}:${fnv1a32(bytes)}`;
}
const fingerprint = document => fingerprintOf(validateSnapshot(document));
// A snapshot's decoded form: the one it carries when that belongs to its very
// document (the draft decodes each revision once and hands it on), otherwise
// decoded now. A copy with another document never reuses a stale decode.
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
function reorderLayers(document, order, names, {keysFollow = true} = {}) {
    const validated = validateSnapshot(document), result = JSON.parse(JSON.stringify(document));
    if (!Array.isArray(order) || order.length !== LAYERS || new Set(order).size !== LAYERS || order.some(id => !Number.isInteger(id) || id < 0 || id >= LAYERS)) throw fail("Include every layer once.");
    const remap = []; order.forEach((old, next) => {remap[old] = next;});
    const reach = old => (old === 0 ? 0 : old === order[0] ? remap[0] : keysFollow ? remap[old] : old);
    const renumbers = keysFollow || order[0] !== 0;
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
    const action = a => {if (!renumbers) return; if ([2, 3].includes(a.kind)) a.operand = reach(a.operand); else if (a.kind === 1) a.operand = native(a.operand);};
    walkActions(behaviors, action); walkActions(combos, action);
    rgb.layerColors.forEach(row => {row.layerId = remap[row.layerId];}); rgb.layerColors.sort((a, b) => a.layerId - b.layerId);
    if (order[0] !== 0) {
        const oldBase = rgb.layerColors.find(row => row.layerId === remap[0]);
        if (oldBase.color.s === 0 && oldBase.color.v === 0) {
            const hsv = settings.values[22];
            oldBase.color = {h: hsv & 0xff, s: (hsv >>> 8) & 0xff, v: (hsv >>> 16) & 0xff};
            oldBase.mode = 0; // ALL_KEYS: the base effect covered the whole layer.
        }
    }
    rgb.layerGroupRows.forEach(row => {if (row.selector !== 255) row.selector = remap[row.selector];});
    // A name the editor only showed as a default ("Layer 9" for an unnamed
    // layer) stays unnamed, wherever the layer goes.
    const unnamed = (name, old) => name === layerName([], old) && settings.names[old] === "";
    settings.names = names ? names.map((name, next) => (unnamed(name, order[next]) ? "" : name)) : order.map(old => settings.names[old]);
    settings.values[5] = remap[settings.values[5]]; settings.values[9] = remap[settings.values[9]];
    settings.values[23] = remap.reduce((mask, next, old) => (mask | ((settings.values[23] >>> old) & 1) << reach(old)) >>> 0, 0);
    // Each layer's switches, placements and combo reference go with it; a
    // reference names a layer by what it holds, so it follows that layer.
    const follow = mask => remap.reduce((moved, next, old) => (moved | ((mask >>> old) & 1) << next) >>> 0, 0);
    settings.values[SETTING.LAYER_BEHAVIORS] = follow(settings.values[SETTING.LAYER_BEHAVIORS]);
    settings.values[SETTING.LAYER_COMBOS] = follow(settings.values[SETTING.LAYER_COMBOS]);
    settings.layers = order.map(old => ({...settings.layers[old], reference: remap[settings.layers[old].reference]}));
    // The layers a behaviour or combo may act on are layers by what they hold.
    behaviors.rows.forEach(row => {row.allowedLayers = follow(row.allowedLayers);});
    combos.rows.forEach(row => {row.allowedLayers = follow(row.allowedLayers);});
    result.profile = encodeProfileBlob({domains: [
        domain(16, encodeRgbDomainV1(rgb, validated.codecOptions.rgb)), domain(32, encodeKeyBehaviorDomain(behaviors, validated.codecOptions.behaviors)), domain(48, encodeComboDomain(combos)),
        domain(64, encodeSettings(settings)), domain(80, encodePdDomain(pdModes)),
    ]}).toString("base64");
    validateSnapshot(result); return result;
}
const summary = document => summaryOf(validateSnapshot(document));
function summaryOf(value) {
    return {layers: value.document.layers.length, behaviors: value.behaviors.rows.length, combos: value.combos.rows.length,
        macros: value.document.macros.filter(Boolean).length,
        names: value.settings.names.map((name, index) => layerName(value.settings.names, index))};
}
module.exports = {LAYERS, MACRO_SLOTS, MACRO_BANK_BYTES, FILE_MAX_BYTES, encodeNamedProfile, comboTableOf, createSnapshot, validateSnapshot, materializeProfile, macroSlots, macroBank, validateViaMacro, fingerprint, fingerprintOf, decodedOf, reorderLayers, summary, summaryOf};
