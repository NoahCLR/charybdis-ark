// @ts-check
"use strict";

// The profile's domain contract, in canonical envelope order. Codec imports
// are deferred because those codecs also use the blob envelope and actions.
// Reading this registry's metadata never loads a codec. Every domain is in
// the portable document's single profile blob; editors use decoded views.
/** @typedef {import("./profile-domains-types.js").DomainOptions} DomainOptions */
const PROFILE_DOMAINS = Object.freeze([
    Object.freeze({name: "RGB", id: 0x10, key: "rgb", readKey: "rgb", version: 4, wireBit: 1 << 0, area: "lighting", document: "profile",
        /** @param {import("./types.js").RgbInput} value @param {DomainOptions} [options] @returns {Buffer} */
        encode: (value, options = {}) => require("./rgb-domain-v1").encodeRgbDomainV1(value, options.rgb),
        /** @param {Uint8Array} bytes @param {DomainOptions} [options] @returns {import("./profile-domains-types.js").DomainModels["rgb"]} */
        decode: (bytes, options = {}) => require("./rgb-domain-v1").decodeRgbDomainV1(bytes, options.rgb)}),
    Object.freeze({name: "KEY_BEHAVIORS", id: 0x20, key: "behaviors", readKey: "keyBehaviors", version: 2, wireBit: 1 << 1, area: "behaviours", document: "profile",
        /** @param {{rows: import("./types.js").BehaviorRowInput[]}} value @param {DomainOptions} [options] @returns {Buffer} */
        encode: (value, options = {}) => require("./key-behavior-domain-v1").encodeKeyBehaviorDomain(value, options.behaviors),
        /** @param {Uint8Array} bytes @param {DomainOptions} [options] @returns {import("./profile-domains-types.js").DomainModels["behaviors"]} */
        decode: (bytes, options = {}) => require("./key-behavior-domain-v1").decodeKeyBehaviorDomain(bytes, options.behaviors)}),
    Object.freeze({name: "COMBOS", id: 0x30, key: "combos", readKey: "combos", version: 3, wireBit: 1 << 2, area: "combos", document: "profile",
        /** @param {import("./types.js").ComboInput} value @returns {Buffer} */
        encode: value => require("./combo-domain-v1").encodeComboDomain(value),
        /** @param {Uint8Array} bytes @param {DomainOptions} [_options] @returns {import("./profile-domains-types.js").DomainModels["combos"]} */
        decode: (bytes, _options = {}) => require("./combo-domain-v1").decodeComboDomain(bytes)}),
    Object.freeze({name: "SETTINGS", id: 0x40, key: "settings", readKey: "settings", version: 9, wireBit: 1 << 3, area: "settings", document: "profile",
        /** @param {import("./types.js").SettingsDomain} value @returns {Buffer} */
        encode: value => require("./settings-domain-v1").encodeSettings(value),
        /** @param {Buffer} bytes @param {DomainOptions} [_options] @returns {import("./profile-domains-types.js").DomainModels["settings"]} */
        decode: (bytes, _options = {}) => require("./settings-domain-v1").decodeSettings(bytes)}),
    Object.freeze({name: "PD_MODES", id: 0x50, key: "pdModes", readKey: "pdModes", version: 4, wireBit: 1 << 4, area: "pointing", document: "profile",
        /** @param {import("./types.js").PdSlot[]} value @returns {Buffer} */
        encode: value => require("./pd-mode-domain-v1").encodePdDomain(value),
        /** @param {Uint8Array} bytes @param {DomainOptions} [_options] @returns {import("./profile-domains-types.js").DomainModels["pdModes"]} */
        decode: (bytes, _options = {}) => require("./pd-mode-domain-v1").decodePdDomain(bytes)}),
    // The keyboard read decodes these two into the editor's layout and macro
    // views, not into its domain readback, so they have no readKey.
    Object.freeze({name: "KEYMAP", id: 0x60, key: "keymap", readKey: undefined, version: 1, wireBit: 1 << 5, area: "keys", document: "profile",
        /** @param {readonly (readonly number[])[]} value @returns {Buffer} */
        encode: value => require("./keymap-domain-v1").encodeKeymapDomain(value),
        /** @param {Uint8Array} bytes @param {DomainOptions} [_options] @returns {import("./profile-domains-types.js").DomainModels["keymap"]} */
        decode: (bytes, _options = {}) => require("./keymap-domain-v1").decodeKeymapDomain(bytes)}),
    Object.freeze({name: "MACROS", id: 0x70, key: "macros", readKey: undefined, version: 1, wireBit: 1 << 6, area: "macros", document: "profile",
        /** @param {readonly Uint8Array[]} value @returns {Buffer} */
        encode: value => require("./macro-domain-v1").encodeMacroDomain(value),
        /** @param {Uint8Array} bytes @param {DomainOptions} [_options] @returns {import("./profile-domains-types.js").DomainModels["macros"]} */
        decode: (bytes, _options = {}) => require("./macro-domain-v1").decodeMacroDomain(bytes)}),
]);
/** @typedef {typeof PROFILE_DOMAINS[number]} ProfileDomain */
/** @typedef {ProfileDomain['name']} DomainName */
/** @type {Readonly<{[K in DomainName]: Extract<ProfileDomain, {name: K}>['id']}>} */
const PROFILE_DOMAIN_IDS = Object.freeze(/** @type {{[K in DomainName]: Extract<ProfileDomain, {name: K}>['id']}} */ (Object.fromEntries(PROFILE_DOMAINS.map(domain => [domain.name, domain.id]))));
/** @type {Readonly<{[K in ProfileDomain['id']]: Extract<ProfileDomain, {id: K}>['version']} & Record<number, number>>} */
const PROFILE_DOMAIN_VERSIONS = Object.freeze(/** @type {{[K in ProfileDomain['id']]: Extract<ProfileDomain, {id: K}>['version']}} */ (Object.fromEntries(PROFILE_DOMAINS.map(domain => [domain.id, domain.version]))));
/** @type {Readonly<{[K in DomainName]: number}>} */
const PROFILE_WIRE_DOMAINS = Object.freeze(/** @type {{[K in DomainName]: number}} */ (Object.fromEntries(PROFILE_DOMAINS.map(domain => [domain.name, domain.wireBit]))));
/** @type {number} */
const PROFILE_DOMAIN_MASK = PROFILE_DOMAINS.reduce((mask, domain) => mask | domain.wireBit, 0);

/** @param {number} id */
const profileDomain = id => PROFILE_DOMAINS.find(domain => domain.id === id);

/** @type {{[K in import("./profile-domains-types.js").DomainKey]: import("./profile-domains-types.js").DomainCodec<K>}} */
const codecs = /** @type {{[K in import("./profile-domains-types.js").DomainKey]: import("./profile-domains-types.js").DomainCodec<K>}} */ (/** @type {unknown} */ (Object.fromEntries(PROFILE_DOMAINS.map(domain => [domain.key, domain]))));

/** @template {import("./profile-domains-types.js").DomainKey} K @param {K} key @returns {import("./profile-domains-types.js").DomainCodec<K>} */
const domainCodec = key => codecs[key];

// The domains a portable document's profile blob holds, in envelope order.
/** @type {readonly ProfileDomain[]} */
const DOCUMENT_PROFILE_DOMAINS = Object.freeze(PROFILE_DOMAINS.filter(domain => domain.document === "profile"));

// The envelopes for the models given, in canonical order: a document's
// profile blob and its candidate both contain all seven.
/** @param {Partial<import("./profile-domains-types.js").DomainModels>} models @param {DomainOptions} [options] */
function encodeProfileDomains(models, options = {}) {
    /** @template {import("./profile-domains-types.js").DomainKey} K @param {K} key */
    const encode = key => domainCodec(key).encode(/** @type {import("./profile-domains-types.js").DomainModels[K]} */ (models[key]), options);
    return PROFILE_DOMAINS.filter(domain => models[domain.key] !== undefined).map(domain => ({id: domain.id, version: domain.version, payload: encode(domain.key)}));
}

// Rewrite an envelope payload while retaining its identity and the other
// domains. Callers choose how to edit the payload; the blob keeps its own
// canonical ordering, capacity and version checks.
/** @param {Uint8Array} bytes @param {number} id @param {(payload: Buffer) => Buffer} change @param {(profile: import("./types.js").BlobInput) => Buffer} [encode] @returns {Buffer} */
function replaceDomain(bytes, id, change, encode = require("./profile-blob-v1").encodeProfileBlob) {
    const blob = require("./profile-blob-v1").decodeProfileBlob(bytes);
    return encode({...blob, domains: blob.domains.map(domain => domain.id === id ? {...domain, payload: change(domain.payload)} : domain)});
}

module.exports = {PROFILE_DOMAINS, DOCUMENT_PROFILE_DOMAINS, PROFILE_DOMAIN_IDS, PROFILE_DOMAIN_VERSIONS, PROFILE_WIRE_DOMAINS, PROFILE_DOMAIN_MASK, profileDomain, domainCodec, encodeProfileDomains, replaceDomain};
