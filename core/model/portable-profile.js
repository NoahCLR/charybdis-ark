// @ts-check
"use strict";

/**
 * @typedef {import("./types.js").PortableDocument} PortableDocument
 * @typedef {import("./types.js").DomainsContext} DomainsContext
 * @typedef {import("./types.js").OpenDomain} OpenDomain
 * @typedef {import("./types.js").ReadDomain} ReadDomain
 * @typedef {import("../schema/profile-domains-types.js").DomainKey} DomainKey
 * @typedef {import("../schema/profile-domains-types.js").DomainModels} DomainModels
 * @typedef {import("../schema/profile-domains-types.js").DomainOptions} DomainOptions
 * @typedef {import("./types.js").DecodedProfile} DecodedProfile
 * @typedef {import("./types.js").ProfileDestination} ProfileDestination
 * @typedef {{kind: number, operand: number}} WalkAction
 */
const {keycodeAction, knownActionAbi, pointingSlotOfCode} = require("../schema/actions");
const {decodeProfileBlob, decodeStoredProfileBlob, encodeProfileBlob, crc32, fnv1a32, PROFILE_BLOB_V1, ProfileBlobProtocolError} = require("../schema/profile-blob-v1");
const {COMBO_DOMAIN_VERSION, encodeComboDomain} = require("../schema/combo-domain-v1");
const {SETTING, SETTING_FIELDS, decodeSettings} = require("../schema/settings-domain-v1");
const {ALL_LAYERS, CHARYBDIS_4X6_LAYOUT_MATRIX, LAYERS, matrixPosition} = require("../data/charybdis-layout");
const {LAYER_LOCK_BASE, LAYER_LOCK_SLOTS} = require("../data/user-keycodes");
const {QK, inBlock, LAYER_FORMS, LAYER_FORM_LAYERS, layerModLayer, layerTapLayer, withLayerModLayer, withLayerTapLayer} = require("../../rules/qmk-keycodes.mjs");
const {layerName, PROFILE_FULL_WORDS} = require("./vocabulary");
const {reorderLinkRefusal} = require("./pointing-links");
const {reorderShortcutRefusal} = require("./shortcut-layers");
const {readStoredMacro} = require("./macro-input");
const {MACRO_LIMITS} = require("../../rules/macro-payload.mjs");
const {MACRO_DOMAIN_V1} = require("../schema/macro-domain-v1");
const {hostSettings} = require("../schema/host-settings");
const {answered} = require("../schema/bytes");
const {profileDepthOptions} = require("../schema/profile-depth");
const {POINTING_SLOT_COUNT} = require("../data/pd-mode-keys");

// A current-format file contains one complete canonical schema-4 blob.
// Keymap and macro streams are decoded editor views, never extra authorities.
// Document version 5 refuses the former separate layers/macros format (D-L64).
// Base64 for 130,048 bytes plus the small JSON envelope fits in 192 KiB.
const FILE_MAX_BYTES = 196608;
// What a file over FILE_MAX_BYTES is told, wherever it is refused.
const FILE_TOO_LARGE = "This file is too large for a backup.";
const DOCUMENT_VERSION = 5;
const {DOCUMENT_PROFILE_DOMAINS, PROFILE_DOMAIN_IDS, PROFILE_DOMAIN_MASK, domainCodec, PROFILE_DOMAIN_VERSIONS} = require("../schema/profile-domains");
/** @type {readonly number[]} */
const DOMAIN_IDS = DOCUMENT_PROFILE_DOMAINS.map(domain => domain.id);
/** @param {number} id @param {Buffer} payload */
const domain = (id, payload) => ({id, version: PROFILE_DOMAIN_VERSIONS[id], payload});
/** @param {string} message */
const fail = message => Object.assign(new Error(message), {code: "INVALID_PORTABLE_PROFILE"});
// What a key reaching past the keyboard's layers is told.
const OUTSIDE_LAYERS = "A key in this profile reaches a layer the keyboard does not have.";
// What a backup whose profile does not decode is told; why it did not is
// the failure's cause, for the diagnostics.
const DAMAGED = "The profile in this file is damaged, so Ark cannot read it.";
/** @param {unknown} cause */
const damaged = cause => Object.assign(fail(DAMAGED), {cause});
// What a backup in another format than current firmware's is told.
const OLDER_FORMAT = "This profile is in a format current firmware does not store, so Ark cannot read it. Export a new backup from a keyboard on current firmware.";
const PHYSICAL_MATRIX_SLOTS = new Set(CHARYBDIS_4X6_LAYOUT_MATRIX.map((position, layoutIndex) => matrixPosition(layoutIndex)));
/** @param {unknown} value @param {number} max @param {string} refusal what a value that is not canonical base64 is told */
function base64(value, max, refusal) {
    if (typeof value !== "string" || value.length > Math.ceil(max / 3) * 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw fail(refusal);
    const bytes = Buffer.from(value, "base64");
    if (bytes.length > max || bytes.toString("base64") !== value) throw fail(refusal);
    return bytes;
}
// The most digits a stored delay may have.
const DELAY_DIGITS = String(MACRO_LIMITS.maxDelayMs).length;
/** @param {Buffer} bytes @param {import("../schema/types.js").MacroOptions} [options] */
function validateMacro(bytes, {textEntry = false, layout} = {}) {
    readStoredMacro(bytes, {textEntry, layout});
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
            while (index < bytes.length && bytes[index] >= 48 && bytes[index] <= 57 && digits.length < DELAY_DIGITS) digits += String.fromCharCode(bytes[index++]);
            if (!digits || Number(digits) > MACRO_LIMITS.maxDelayMs || bytes[index++] !== 124) throw fail("A macro in this profile has a delay the keyboard cannot play.");
        } else {
            const k = bytes[index++];
            if (![1, 2, 3].includes(type) || !key(k)) throw fail("A macro in this profile presses a key the keyboard cannot play.");
            if (type === 1 && held.has(k)) throw fail("A macro in this profile taps a key it is already holding.");
            if (type === 2) {if (held.has(k) || held.size >= MACRO_LIMITS.maxHeldKeys) throw fail(`A macro in this profile holds a key it is already holding, or more than ${MACRO_LIMITS.maxHeldKeys} keys at once.`); held.add(k);}
            if (type === 3 && !held.delete(k)) throw fail("A macro in this profile releases a key it is not holding.");
        }
    }
    if (held.size) throw fail("A macro in this profile ends with keys still held.");
}
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
    if (!combos || combos.noTimer || combos.customTrigger || combos.customRelease || combos.customRepress || combos.strictTimer || combos.fixedReference) throw fail("This keyboard's firmware changes how combos work in ways a profile cannot hold, so Ark cannot read its profile.");
    const live = decodeStoredProfileBlob(active), fallback = decodeStoredProfileBlob(defaults);
    /** @param {number} id */
    const stored = id => live.domains.find(d => d.id === id) || fallback.domains.find(d => d.id === id);
    /** @type {import("../schema/types.js").ProfileDomain[]} */
    const domains = [PROFILE_DOMAIN_IDS.RGB, PROFILE_DOMAIN_IDS.KEY_BEHAVIORS, PROFILE_DOMAIN_IDS.PD_MODES, PROFILE_DOMAIN_IDS.KEYMAP, PROFILE_DOMAIN_IDS.MACROS].map(id => {
        const found = stored(id);
        if (!found) throw fail("The keyboard did not report every part of its profile. Read it again.");
        return found;
    });
    answered(() => decodeSettings(settings));
    domains.push(stored(PROFILE_DOMAIN_IDS.COMBOS) || domain(PROFILE_DOMAIN_IDS.COMBOS, encodeComboDomain(comboTableOf(combos))), domain(PROFILE_DOMAIN_IDS.SETTINGS, settings));
    return encodeProfileBlob({domains});
}
// The whole profile as stored bytes say it, every domain: each domain the
// profile holds, otherwise the compiled default the firmware falls back to.
// Live preview + save compares the saved profile with the working copy this
// way (firmware D-F32: settings readback reports the stored values, and the
// profile is their only durable owner), and a live edit's splices are made
// against these bytes, so they must be the keyboard's own, not a re-encoding.
/** @param {Uint8Array} stored @param {Uint8Array} defaults */
function materializeStored(stored, defaults) {
    const own = decodeStoredProfileBlob(stored), fallback = decodeStoredProfileBlob(defaults);
    const domains = DOMAIN_IDS.map(id => {
        const found = own.domains.find(d => d.id === id) || fallback.domains.find(d => d.id === id);
        if (!found) throw fail("The keyboard did not report every part of its profile. Read it again.");
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
// A backup of profile bytes the keyboard sent (its complete read, or its saved
// profile and working copy): a check they fail is the keyboard's answer not
// reading, never a file's (schema/bytes.js answered).
/** @param {{profile: Buffer, actionAbiDigest: number}} snapshot */
function createSnapshot({profile, actionAbiDigest}) {
    /** @type {PortableDocument} */
    const document = {format: "charybdis-profile", version: DOCUMENT_VERSION, keyboard: "charybdis-4x6", actionAbiDigest,
        profile: profile.toString("base64")};
    answered(() => validateSnapshot(document)); return document;
}
/** @param {unknown} value @param {ProfileDestination} [capabilities] @returns {DecodedProfile} */
function validateSnapshot(value, capabilities) {
    if (typeof value === "string") {
        if (Buffer.byteLength(value) > FILE_MAX_BYTES) throw fail(FILE_TOO_LARGE);
        try {value = JSON.parse(value);} catch {throw fail("This file is not a valid backup.");}
    }
    // Inspect the unvalidated object; its complete shape is established below.
    const candidate = /** @type {Partial<Record<keyof PortableDocument, unknown>> | null | undefined} */ (value);
    if (!candidate || candidate.format !== "charybdis-profile" || candidate.keyboard !== "charybdis-4x6" || typeof candidate.actionAbiDigest !== "number" || !Number.isInteger(candidate.actionAbiDigest) || candidate.actionAbiDigest < 1 || candidate.actionAbiDigest > 0xffffffff) throw fail("Choose a Charybdis backup.");
    if (candidate.version !== DOCUMENT_VERSION || !knownActionAbi(candidate.actionAbiDigest)) throw fail(OLDER_FORMAT);
    if (Object.keys(candidate).some(key => !["format", "version", "keyboard", "actionAbiDigest", "profile"].includes(key))) throw fail("This file holds more than a backup from current firmware does, so Ark cannot read it.");
    const profile = base64(candidate.profile, PROFILE_BLOB_V1.MAX_SIZE, DAMAGED);
    let domains;
    try {domains = decodeProfileBlob(profile).domains;} catch (error) {
        if (error instanceof ProfileBlobProtocolError && ["INCOMPATIBLE_SCHEMA", "UNKNOWN_DOMAIN_VERSION"].includes(error.code)) throw fail(OLDER_FORMAT);
        throw damaged(error);
    }
    if (domains.map(d => d.id).join() !== DOMAIN_IDS.join()) throw fail("This backup is missing part of the profile. Ark imports only a complete backup.");
    /** @param {import("../schema/profile-domains-types.js").DomainKey} key */
    const payload = key => /** @type {import("../schema/types.js").ProfileDomain} */ (domains.find(domain => domain.id === domainCodec(key).id)).payload;
    /** @template {import("../schema/profile-domains-types.js").DomainKey} K @param {K} key @param {Parameters<import("../schema/profile-domains-types.js").DomainCodec<K>["decode"]>[1]} [options] */
    const decoded = (key, options) => {
        try {return domainCodec(key).decode(payload(key), options);}
        catch (error) {throw damaged(error);}
    };
    const layers = decoded("keymap");
    const macros = decoded("macros");
    macros.forEach(slot => validateMacro(slot));
    const pdModes = decoded("pdModes");
    const codecOptions = profileDepthOptions(capabilities, payload("rgb"));
    const rgb = decoded("rgb", codecOptions), behaviors = decoded("behaviors", codecOptions),
        combos = decoded("combos"), settings = decoded("settings");
    // With Unicode playback on, a held ordinary key cannot span text the
    // layout leaves to Unicode entry.
    if (settings.values[SETTING.UNICODE_HOST_MODE] & 0x100) for (const macro of macros) validateMacro(macro, {textEntry: true, layout: hostSettings(settings.values).layout});
    if (rgb.layerColors.length !== LAYERS || rgb.layerColors.some(row => row.layerId >= LAYERS)) throw fail(`The lighting in this profile does not cover all ${LAYERS} layers.`);
    // A key for an empty slot is allowed, because the keyboard allows it:
    // the mode keycodes are a fixed registry, and the runtime refuses to
    // activate a slot whose record is empty rather than misbehaving
    // (`noah_active_profile_pd_for_mask` returns nothing, and both activate and lock
    // bail out on that). So a pointing-mode key stays where it is and does
    // nothing until its slot is configured again. They are counted here so the
    // interface can say so before anyone wonders why a key went quiet.
    /** @type {Map<number, number>} */
    const danglingPointingKeys = new Map();
    /** @param {number | undefined} id */
    const checkPd = id => {
        if (id === undefined || pdModes[id]?.kind) return;
        danglingPointingKeys.set(id, (danglingPointingKeys.get(id) || 0) + 1);
    };
    /** @param {number} code */
    const checkNativePd = code => checkPd(pointingSlotOfCode(code));
    layers.flat().forEach(checkNativePd);
    /** @param {WalkAction} action */
    const checkAction = action => {
        if ([4, 5].includes(action.kind)) checkPd(action.operand);
        if (action.kind === 1) checkNativePd(action.operand);
        if ([2, 3].includes(action.kind) && action.operand >= LAYERS) throw fail("A behaviour or combo in this profile reaches a layer the keyboard does not have.");
    };
    walkActions(behaviors, checkAction); walkActions(combos, checkAction);
    if (capabilities && (candidate.actionAbiDigest !== capabilities.actionAbiDigest || capabilities.compiledLayerCount !== LAYERS || ((capabilities.supportedDomainMask ?? 0) & PROFILE_DOMAIN_MASK) !== PROFILE_DOMAIN_MASK)) throw fail("The keyboard's firmware cannot take this profile: it was made for other firmware. Update both halves to current firmware.");
    // The macro domain includes any optional unused tail. A destination
    // validates its advertised limit without constructing another storage bank.
    const stored = payload("macros").length;
    const macroCapacity = capabilities?.macroBytes ?? MACRO_DOMAIN_V1.MAX_SIZE;
    if (stored > macroCapacity) throw fail(`Macros need ${stored} bytes; this keyboard holds ${macroCapacity}.`);
    // This same complete blob is both the portable profile and the candidate.
    const candidateBytes = profile;
    if (capabilities?.maxProfilePayload !== undefined && candidateBytes.length > capabilities.maxProfilePayload) throw fail(`The profile needs ${candidateBytes.length} bytes with its keymap and macros; this keyboard holds ${capabilities.maxProfilePayload}.`);
    return {document: /** @type {PortableDocument} */ (candidate), profile, candidate: candidateBytes, layers, macroSlots: macros, settings, rgb, behaviors, combos, pdModes, codecOptions, danglingPointingKeys: Object.fromEntries(danglingPointingKeys)};
}

// An edit a byte format refused as too large for the keyboard: the person's
// edit, said in words (PROFILE_FULL_WORDS), by the count it went past where
// the format names one (its `limit` and `most`), otherwise as `full`, its own
// text kept beneath for the diagnostics. Any other refusal is left as it is.
/** @param {unknown} error @param {string} full */
function tooFull(error, full) {
    const details = /** @type {{code?: unknown, limit?: unknown, most?: unknown} | null | undefined} */ (error);
    if (details?.code !== "CAPACITY_EXCEEDED") return error;
    const counted = typeof details.limit === "string" && typeof details.most === "number" && Object.hasOwn(PROFILE_FULL_WORDS.counts, details.limit)
        ? PROFILE_FULL_WORDS.counts[details.limit](details.most) : undefined;
    return Object.assign(new Error(counted ?? full), {code: "PROFILE_FULL", cause: error});
}
// The brightest a colour may be: the keyboard's reported limit, or the
// codec's whole range when none was read.
/** @param {DomainsContext["limits"]} limits */
const brightnessCeiling = (limits) => limits?.brightnessMax ?? 255;
// The codec options a document's domains are read and written with: the tap
// depth the keyboard reports, or the one the document's RGB palette counts;
// and the brightness the keyboard allows. A behaviour edit also checks every
// row's actions against the keyboard's action slots (`checkActions`), since
// the keyboard refuses a profile whose actions sit where it cannot run them;
// any other edit keeps the rows it does not touch as they are.
/** @param {Uint8Array} rgbPayload @param {DomainsContext & {checkActions?: boolean}} context @returns {DomainOptions} */
function domainOptions(rgbPayload, {capabilities, limits, checkActions}) {
    const depth = profileDepthOptions(capabilities, rgbPayload);
    const actionLimits = {maxPdModes: POINTING_SLOT_COUNT, maxLogicalLayers: capabilities?.compiledLayerCount,
        maxMacroSlots: capabilities?.macroSlots, maxCustomKeys: capabilities?.customKeySlots};
    return {rgb: {maximumBrightness: brightnessCeiling(limits), ...depth.rgb},
        behaviors: {...depth.behaviors, ...(checkActions ? {actionLimits} : {})}};
}
// Opens a profile blob's domains as models: each decoded the first time it
// is opened, with the document's codec options, and the same model handed
// back after that; `isOpen` says whether it has been.
/** @param {ReturnType<typeof decodeProfileBlob>} blob @param {DomainsContext & {checkActions?: boolean}} context */
function domainsOf(blob, context) {
    /** @param {DomainKey} key */
    const payload = key => {
        const found = blob.domains.find(domain => domain.id === domainCodec(key).id);
        if (!found) throw fail("This backup is missing part of the profile. Ark imports only a complete backup.");
        return found.payload;
    };
    const options = domainOptions(payload("rgb"), context);
    /** @type {Map<DomainKey, DomainModels[DomainKey]>} */
    const opened = new Map();
    /** @type {OpenDomain} */
    const open = Object.assign(/** @type {ReadDomain} */ (key => {
        if (!opened.has(key)) opened.set(key, domainCodec(key).decode(payload(key), options));
        return /** @type {DomainModels[typeof key]} */ (opened.get(key));
    }), {isOpen: (/** @type {DomainKey} */ key) => opened.has(key)});
    return {open, opened, options};
}
// A document's domains to read, each decoded once when first opened, with
// the options its edits use. Nothing opened here is written back.
/** @param {PortableDocument} document @param {DomainsContext} [context] @returns {ReadDomain} */
function readProfileDomains(document, context = {}) {
    return domainsOf(decodeProfileBlob(Buffer.from(document.profile, "base64")), context).open;
}
// The one way to change a document's domains. `change` opens each domain it
// edits and changes that model in place; each opened domain is decoded once
// and encoded again, and every other domain keeps its bytes; with none
// opened, the document itself is the result. `read` is the document as it
// stands, checked against the keyboard once (the caller's `decoded` when it
// is of this very document) and never written back. A result too large for
// the keyboard is refused in words (tooFull: `full`, or the profile words),
// and the document it makes is checked as any other is; a behaviour edit
// checks every row's actions (`checkActions`, domainOptions).
/** @param {PortableDocument} document @param {DomainsContext & {full?: string, checkActions?: boolean}} context @param {(open: OpenDomain, read: () => DecodedProfile) => void} change @returns {PortableDocument} */
function editProfileDomains(document, context, change) {
    let result;
    /** @type {DecodedProfile | undefined} */
    let decoded = context.decoded?.document === document ? context.decoded : undefined;
    const read = () => decoded ??= validateSnapshot(document, context.capabilities);
    try {
        const blob = decodeProfileBlob(Buffer.from(document.profile, "base64"));
        const {open, opened, options} = domainsOf(blob, context);
        change(open, read);
        /** @template {DomainKey} K @param {K} key @param {DomainModels[K]} value */
        const encode = (key, value) => domainCodec(key).encode(value, options);
        const domains = blob.domains.map(domain => {
            const key = DOCUMENT_PROFILE_DOMAINS.find(row => row.id === domain.id)?.key;
            return key && opened.has(key) ? {...domain, payload: encode(key, /** @type {DomainModels[typeof key]} */ (opened.get(key)))} : domain;
        });
        result = opened.size ? {...document, profile: encodeProfileBlob({...blob, domains}).toString("base64")} : document;
    } catch (error) {throw tooFull(error, context.full ?? PROFILE_FULL_WORDS.profile);}
    if (result === document) read(); else validateSnapshot(result, context.capabilities);
    return result;
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
// RGB colour and per-layer settings, and what points at it (the pointer and
// sniping layers). With keysFollow, the default, every layer key
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
// startup layers are slots in the same way. The pointer and sniping layers
// and the combo references name a layer by what it holds, so they follow it.
// A pointing slot's link is renumbered as layer keys are, base swap and
// keysFollow included: the layers its key turns on are what a layer key turns
// on, and the layers that start it are what such keys reach, so the keys that
// started a mode still start it, and a link never lands on the base. A move
// that would still leave a link ignored, or one layer starting two modes, is
// refused in words (pointing-links.js reorderLinkRefusal). A custom key's
// shortcut layers are what a layer key turns on, so they are renumbered the
// same way; one that would land on a default layer is refused in words too
// (shortcut-layers.js reorderShortcutRefusal).
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
    validateSnapshot(document);
    if (!Array.isArray(order) || order.length !== LAYERS || new Set(order).size !== LAYERS || order.some(id => !Number.isInteger(id) || id < 0 || id >= LAYERS)) throw fail("Include every layer once.");
    /** @type {number[]} */
    const remap = []; order.forEach((old, next) => {remap[old] = next;});
    /** @param {number} old */
    const reach = old => (old === 0 ? 0 : old === order[0] ? remap[0] : keysFollow ? remap[old] : old);
    const renumbers = keysFollow || order[0] !== 0;
    /** @param {number} code */
    function native(code) {
        if (!renumbers) return code;
        if (inBlock(code, QK.LAYER_TAP)) {const layer = layerTapLayer(code); if (layer >= LAYERS) throw fail(OUTSIDE_LAYERS); return withLayerTapLayer(code, reach(layer));}
        for (const start of [...Object.values(LAYER_FORMS), LAYER_LOCK_BASE]) {
            const width = start === LAYER_LOCK_BASE ? LAYER_LOCK_SLOTS : LAYER_FORM_LAYERS;
            if (code >= start && code < start + width) {if (code - start >= LAYERS) throw fail(OUTSIDE_LAYERS); return start + reach(code - start);}
        }
        // Layer-mod stores a four-bit layer followed by five modifier bits.
        if (inBlock(code, QK.LAYER_MOD)) {const layer = layerModLayer(code); if (layer >= LAYERS) throw fail(OUTSIDE_LAYERS); return withLayerModLayer(code, reach(layer));}
        return code;
    }
    // Reordering layers never rewrites macro streams or their allowed unused
    // tail: the macros are never opened.
    return editProfileDomains(document, {full: PROFILE_FULL_WORDS.name}, open => {
        const keymap = open("keymap");
        const layers = order.map(old => keymap[old].map(native));
        if (order[0] !== 0) {
            layers[0] = layers[0].map((code, slot) => PHYSICAL_MATRIX_SLOTS.has(slot) && code === 0x0001 ? 0x0000 : code);
            layers[remap[0]] = layers[remap[0]].map((code, slot) => PHYSICAL_MATRIX_SLOTS.has(slot) && code === 0x0000 ? 0x0001 : code);
        }
        keymap.splice(0, keymap.length, ...layers);
        const rgb = open("rgb"), behaviors = open("behaviors"), combos = open("combos"), settings = open("settings"), pdModes = open("pdModes");
        const settingsBefore = {values: settings.values.slice(), names: settings.names.slice()}, slotsBefore = structuredClone(pdModes);
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
        // A pointing slot's link moves as the layer keys do.
        /** @param {number} mask */
        const reached = mask => remap.reduce((moved, _next, old) => (moved | ((mask >>> old) & 1) << reach(old)) >>> 0, 0);
        pdModes.forEach(slot => {slot.linkedLayers = reached(slot.linkedLayers); slot.linkTurnsOn = reached(slot.linkTurnsOn);});
        const linkRefusal = reorderLinkRefusal(settingsBefore, settings, slotsBefore, pdModes, reached, keysFollow);
        if (linkRefusal) throw fail(linkRefusal);
        // So do a custom key's shortcut layers (firmware D-F26).
        const shortcutsBefore = {...settings, names: settingsBefore.names, customKeyShortcuts: settings.customKeyShortcuts};
        settings.customKeyShortcuts = settings.customKeyShortcuts.map(shortcut => ({...shortcut, layers: reached(shortcut.layers)}));
        const shortcutRefusal = reorderShortcutRefusal(shortcutsBefore, settings, reached, keysFollow);
        if (shortcutRefusal) throw fail(shortcutRefusal);
    });
}
/** @param {unknown} document */
const summary = document => summaryOf(validateSnapshot(document));
/** @param {DecodedProfile} value */
function summaryOf(value) {
    return {layers: value.layers.length, behaviors: value.behaviors.rows.length, combos: value.combos.rows.length,
        macros: value.macroSlots.filter(bytes => bytes.length).length,
        names: value.settings.names.map((name, index) => layerName(value.settings.names, index))};
}
module.exports = {FILE_MAX_BYTES, FILE_TOO_LARGE, DOCUMENT_VERSION, brightnessCeiling, editProfileDomains, readProfileDomains, comboTableOf, createSnapshot, validateSnapshot, materializeProfile, materializeStored, validateMacro, fingerprint, fingerprintOf, decodedOf, reorderLayers, summary, summaryOf};
