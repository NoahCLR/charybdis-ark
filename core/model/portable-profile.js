// @ts-check
"use strict";

/**
 * @typedef {import("./types.js").PortableDocument} PortableDocument
 * @typedef {import("./types.js").DecodedProfile} DecodedProfile
 * @typedef {import("./types.js").ProfileDestination} ProfileDestination
 * @typedef {{kind: number, operand: number}} WalkAction
 */
const {keycodeAction, knownActionAbi, pdSlotOfCode} = require("../schema/actions");
const {decodeProfileBlob, decodeStoredProfileBlob, encodeProfileBlob, crc32, fnv1a32, PROFILE_BLOB_V1, PROFILE_DOMAIN_VERSIONS, ProfileBlobProtocolError} = require("../schema/profile-blob-v1");
const {ALL_LAYERS, COMBO_DOMAIN_VERSION, encodeComboDomain} = require("../schema/combo-domain-v1");
const {SETTING, SETTING_FIELDS, decodeSettings} = require("../schema/settings-domain-v1");
const {CHARYBDIS_4X6_LAYOUT_MATRIX, LAYERS, matrixPosition} = require("../data/charybdis-layout");
const {LAYER_LOCK_BASE, LAYER_LOCK_SLOTS} = require("../data/user-keycodes");
const {layerName} = require("./vocabulary");
const {decodeMacroPayload} = require("../schema/macro-payload");
const {hostSettings} = require("../schema/host-settings");
const {profileDepthOptions} = require("../schema/profile-depth");

// A current-format file contains one complete canonical schema-4 blob.
// Keymap and macro streams are decoded editor views, never extra authorities.
// Document version 5 refuses the former separate layers/macros format (D-L64).
const MACRO_SLOTS = 128;
// Base64 for 130,048 bytes plus the small JSON envelope fits in 192 KiB.
const FILE_MAX_BYTES = 196608;
const DOCUMENT_VERSION = 5;
const {DOCUMENT_PROFILE_DOMAINS, PROFILE_DOMAIN_IDS, PROFILE_DOMAIN_MASK, domainCodec, encodeProfileDomains} = require("../schema/profile-domains");
/** @type {readonly number[]} */
const DOMAIN_IDS = DOCUMENT_PROFILE_DOMAINS.map(domain => domain.id);
/** @param {number} id @param {Buffer} payload */
const domain = (id, payload) => ({id, version: PROFILE_DOMAIN_VERSIONS[id], payload});
/** @param {string} message */
const fail = message => Object.assign(new Error(message), {code: "INVALID_PORTABLE_PROFILE"});
// What a backup in another format than current firmware's is told.
const OLDER_FORMAT = "This profile is in a format current firmware does not store, so Ark cannot read it. Export a new backup from a keyboard on current firmware.";
const PHYSICAL_MATRIX_SLOTS = new Set(CHARYBDIS_4X6_LAYOUT_MATRIX.map((position, layoutIndex) => matrixPosition(layoutIndex)));
/** @param {unknown} value @param {number} max @param {string} label */
function base64(value, max, label) {
    if (typeof value !== "string" || value.length > Math.ceil(max / 3) * 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw fail(`Invalid ${label}.`);
    const bytes = Buffer.from(value, "base64");
    if (bytes.length > max || bytes.toString("base64") !== value) throw fail(`Invalid ${label}.`);
    return bytes;
}
/** @param {Buffer} bytes @param {import("../schema/types.js").MacroOptions} [options] */
function validateMacro(bytes, {textEntry = false, layout} = {}) {
    decodeMacroPayload(bytes, {textEntry, layout});
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
// Firmware's macro domain capacity, including all slot terminators.
const MACRO_BANK_BYTES = 34903;
// The whole profile the keyboard runs, every domain: each domain its active
// profile holds, otherwise the compiled default the firmware falls back to
// (a profile saved without the keymap or macros types the authored ones), and
// the settings as the keyboard reports them. Combos are the profile's like
// any other domain, and it is their only durable owner (firmware D-F32), so
// they are taken as stored: rebuilt from the table the keyboard runs, a combo
// on a custom key or sending MO(5) came back as native keycodes, the same
// keys in other bytes. The running table still says whether the keyboard has
// combo hooks a profile cannot hold, and stands in only for a keyboard that
// stores no combos at all.
/** @param {Uint8Array} active @param {Uint8Array} defaults @param {import("./types.js").NativeComboTable} combos @param {Buffer} settings */
function materializeProfile(active, defaults, combos, settings) {
    if (!combos || combos.noTimer || combos.customTrigger || combos.customRelease || combos.customRepress || combos.strictTimer || combos.fixedReference) throw fail("This keyboard uses combo hooks or timing that cannot be represented by a portable profile.");
    const live = decodeStoredProfileBlob(active), fallback = decodeStoredProfileBlob(defaults);
    /** @param {number} id */
    const stored = id => live.domains.find(d => d.id === id) || fallback.domains.find(d => d.id === id);
    /** @type {import("../schema/types.js").ProfileDomain[]} */
    const domains = [PROFILE_DOMAIN_IDS.RGB, PROFILE_DOMAIN_IDS.KEY_BEHAVIORS, PROFILE_DOMAIN_IDS.PD_MODES, PROFILE_DOMAIN_IDS.KEYMAP, PROFILE_DOMAIN_IDS.MACROS].map(id => {
        const found = stored(id);
        if (!found) throw fail("The keyboard did not report every profile domain.");
        return found;
    });
    decodeSettings(settings);
    domains.push(stored(PROFILE_DOMAIN_IDS.COMBOS) || domain(PROFILE_DOMAIN_IDS.COMBOS, encodeComboDomain(comboTableOf(combos))), domain(PROFILE_DOMAIN_IDS.SETTINGS, settings));
    return encodeProfileBlob({domains});
}
// The whole profile as stored bytes say it, every domain: each domain the
// profile holds, otherwise the compiled default the firmware falls back to.
// Live + review compares the saved profile with the working copy this way
// (firmware D-F32: settings readback reports the stored values, and the
// profile is their only durable owner), and a live edit's splices are made
// against these bytes, so they must be the keyboard's own, not a re-encoding.
/** @param {Uint8Array} stored @param {Uint8Array} defaults */
function materializeStored(stored, defaults) {
    const own = decodeStoredProfileBlob(stored), fallback = decodeStoredProfileBlob(defaults);
    const domains = DOMAIN_IDS.map(id => {
        const found = own.domains.find(d => d.id === id) || fallback.domains.find(d => d.id === id);
        if (!found) throw fail("The keyboard did not report every profile domain.");
        return found;
    });
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
/** @param {{profile: Buffer, actionAbiDigest: number}} snapshot */
function createSnapshot({profile, actionAbiDigest}) {
    /** @type {PortableDocument} */
    const document = {format: "charybdis-profile", version: DOCUMENT_VERSION, keyboard: "charybdis-4x6", actionAbiDigest,
        profile: profile.toString("base64")};
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
    if (candidate.version !== DOCUMENT_VERSION || !knownActionAbi(candidate.actionAbiDigest)) throw fail(OLDER_FORMAT);
    if (Object.keys(candidate).some(key => !["format", "version", "keyboard", "actionAbiDigest", "profile"].includes(key))) throw fail("This profile contains unsupported fields.");
    const profile = base64(candidate.profile, PROFILE_BLOB_V1.MAX_SIZE, "profile data");
    let domains;
    try {domains = decodeProfileBlob(profile).domains;} catch (error) {
        if (error instanceof ProfileBlobProtocolError && ["INCOMPATIBLE_SCHEMA", "UNKNOWN_DOMAIN_VERSION"].includes(error.code)) throw fail(OLDER_FORMAT);
        throw error;
    }
    if (domains.map(d => d.id).join() !== DOMAIN_IDS.join()) throw fail("The profile is missing configuration. Partial profiles cannot be restored as a complete backup.");
    /** @param {import("../schema/profile-domains-types.js").DomainKey} key */
    const payload = key => /** @type {import("../schema/types.js").ProfileDomain} */ (domains.find(domain => domain.id === domainCodec(key).id)).payload;
    const layers = domainCodec("keymap").decode(payload("keymap"));
    const macros = domainCodec("macros").decode(payload("macros"));
    macros.forEach(slot => validateMacro(slot));
    const pdModes = domainCodec("pdModes").decode(payload("pdModes"));
    const codecOptions = profileDepthOptions(capabilities, payload("rgb"));
    const rgb = domainCodec("rgb").decode(payload("rgb"), codecOptions), behaviors = domainCodec("behaviors").decode(payload("behaviors"), codecOptions),
        combos = domainCodec("combos").decode(payload("combos")), settings = domainCodec("settings").decode(payload("settings"));
    // With Unicode playback on, a held ordinary key cannot span text the
    // layout leaves to Unicode entry.
    if (settings.values[SETTING.UNICODE_HOST_MODE] & 0x100) for (const macro of macros) validateMacro(macro, {textEntry: true, layout: hostSettings(settings.values).layout});
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
    if (capabilities && (candidate.actionAbiDigest !== capabilities.actionAbiDigest || capabilities.compiledLayerCount !== LAYERS || ((capabilities.supportedDomainMask ?? 0) & PROFILE_DOMAIN_MASK) !== PROFILE_DOMAIN_MASK)) throw fail(`The connected firmware does not support this profile's action vocabulary or ${LAYERS}-layer storage.`);
    // The macro domain includes any optional unused tail. A destination
    // validates its advertised limit without constructing another storage bank.
    const stored = payload("macros").length;
    const macroCapacity = capabilities?.macroBytes ?? MACRO_BANK_BYTES;
    if (stored > macroCapacity) throw fail(`Macros need ${stored} bytes; this keyboard holds ${macroCapacity}.`);
    // This same complete blob is both the portable profile and the candidate.
    const candidateBytes = profile;
    if (capabilities?.maxProfilePayload !== undefined && candidateBytes.length > capabilities.maxProfilePayload) throw fail(`The profile needs ${candidateBytes.length} bytes with its keymap and macros; this keyboard holds ${capabilities.maxProfilePayload}.`);
    return {document: /** @type {PortableDocument} */ (candidate), profile, candidate: candidateBytes, layers, macroSlots: macros, settings, rgb, behaviors, combos, pdModes, codecOptions, danglingPdBindings: Object.fromEntries(danglingPdBindings)};
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
/** @param {Pick<DecodedProfile, 'document' | 'profile'>} snapshot */
function fingerprintOf({document, profile}) {
    return `${document.actionAbiDigest}:${crc32(profile)}:${fnv1a32(profile)}`;
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
    const layers = order.map(old => validated.layers[old].map(native));
    if (order[0] !== 0) {
        layers[0] = layers[0].map((code, slot) => PHYSICAL_MATRIX_SLOTS.has(slot) && code === 0x0001 ? 0x0000 : code);
        layers[remap[0]] = layers[remap[0]].map((code, slot) => PHYSICAL_MATRIX_SLOTS.has(slot) && code === 0x0000 ? 0x0001 : code);
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
    const changed = encodeProfileDomains({rgb, behaviors, combos, settings, pdModes, keymap: layers}, validated.codecOptions);
    // Reordering layers never rewrites macro streams or their allowed unused tail.
    result.profile = encodeProfileBlob({domains: decodeProfileBlob(validated.profile).domains.map(domain => changed.find(row => row.id === domain.id) || domain)}).toString("base64");
    validateSnapshot(result); return result;
}
/** @param {unknown} document */
const summary = document => summaryOf(validateSnapshot(document));
/** @param {DecodedProfile} value */
function summaryOf(value) {
    return {layers: value.layers.length, behaviors: value.behaviors.rows.length, combos: value.combos.rows.length,
        macros: value.macroSlots.filter(bytes => bytes.length).length,
        names: value.settings.names.map((name, index) => layerName(value.settings.names, index))};
}
module.exports = {LAYERS, MACRO_SLOTS, MACRO_BANK_BYTES, FILE_MAX_BYTES, DOCUMENT_VERSION, encodeNamedProfile, comboTableOf, createSnapshot, validateSnapshot, materializeProfile, materializeStored, validateMacro, fingerprint, fingerprintOf, decodedOf, reorderLayers, summary, summaryOf};
