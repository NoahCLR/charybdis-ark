// @ts-check
"use strict";

// The profile's domain contract, in canonical envelope order. Codec imports
// are deferred because those codecs also use the blob envelope and actions.
// Reading this registry's metadata never loads a codec.
/** @typedef {import("./profile-domains-types.js").DomainOptions} DomainOptions */
const PROFILE_DOMAINS = Object.freeze([
    Object.freeze({name: "RGB", id: 0x10, key: "rgb", readKey: "rgb", version: 4, wireBit: 1 << 0, area: "lighting",
        /** @param {import("./types.js").RgbInput} value @param {DomainOptions} [options] @returns {Buffer} */
        encode: (value, options = {}) => require("./rgb-domain-v1").encodeRgbDomainV1(value, options.rgb),
        /** @param {Uint8Array} bytes @param {DomainOptions} [options] @returns {import("./profile-domains-types.js").DomainModels["rgb"]} */
        decode: (bytes, options = {}) => require("./rgb-domain-v1").decodeRgbDomainV1(bytes, options.rgb)}),
    Object.freeze({name: "KEY_BEHAVIORS", id: 0x20, key: "behaviors", readKey: "keyBehaviors", version: 2, wireBit: 1 << 1, area: "behaviours",
        /** @param {{rows: import("./types.js").BehaviorRowInput[]}} value @param {DomainOptions} [options] @returns {Buffer} */
        encode: (value, options = {}) => require("./key-behavior-domain-v1").encodeKeyBehaviorDomain(value, options.behaviors),
        /** @param {Uint8Array} bytes @param {DomainOptions} [options] @returns {import("./profile-domains-types.js").DomainModels["behaviors"]} */
        decode: (bytes, options = {}) => require("./key-behavior-domain-v1").decodeKeyBehaviorDomain(bytes, options.behaviors)}),
    Object.freeze({name: "COMBOS", id: 0x30, key: "combos", readKey: "combos", version: 3, wireBit: 1 << 2, area: "combos",
        /** @param {import("./types.js").ComboInput} value @returns {Buffer} */
        encode: value => require("./combo-domain-v1").encodeComboDomain(value),
        /** @param {Uint8Array} bytes @param {DomainOptions} [_options] @returns {import("./profile-domains-types.js").DomainModels["combos"]} */
        decode: (bytes, _options = {}) => require("./combo-domain-v1").decodeComboDomain(bytes)}),
    Object.freeze({name: "SETTINGS", id: 0x40, key: "settings", readKey: "settings", version: 8, wireBit: 1 << 3, area: "settings",
        /** @param {import("./types.js").SettingsDomain} value @returns {Buffer} */
        encode: value => require("./settings-domain-v1").encodeSettings(value),
        /** @param {Buffer} bytes @param {DomainOptions} [_options] @returns {import("./profile-domains-types.js").DomainModels["settings"]} */
        decode: (bytes, _options = {}) => require("./settings-domain-v1").decodeSettings(bytes)}),
    Object.freeze({name: "PD_MODES", id: 0x50, key: "pdModes", readKey: "pdModes", version: 3, wireBit: 1 << 4, area: "pointing",
        /** @param {import("./types.js").PdSlot[]} value @returns {Buffer} */
        encode: value => require("./pd-mode-domain-v1").encodePdDomain(value),
        /** @param {Uint8Array} bytes @param {DomainOptions} [_options] @returns {import("./profile-domains-types.js").DomainModels["pdModes"]} */
        decode: (bytes, _options = {}) => require("./pd-mode-domain-v1").decodePdDomain(bytes)}),
]);
/** @typedef {typeof PROFILE_DOMAINS[number]} ProfileDomain */
/** @typedef {ProfileDomain['name']} DomainName */
/** @type {Readonly<{[K in DomainName]: Extract<ProfileDomain, {name: K}>['id']}>} */
const PROFILE_DOMAIN_IDS = Object.freeze(/** @type {{[K in DomainName]: Extract<ProfileDomain, {name: K}>['id']}} */ (Object.fromEntries(PROFILE_DOMAINS.map(domain => [domain.name, domain.id]))));
/** @type {Readonly<{[K in ProfileDomain['id']]: Extract<ProfileDomain, {id: K}>['version']} & Record<number, number>>} */
const PROFILE_DOMAIN_VERSIONS = Object.freeze(/** @type {{[K in ProfileDomain['id']]: Extract<ProfileDomain, {id: K}>['version']}} */ (Object.fromEntries(PROFILE_DOMAINS.map(domain => [domain.id, domain.version]))));
// Every version of each domain up to the current one. A live keyboard that
// stores an older version is read through these, translated to the current
// version to be shown, and never written (D-L63); backups admit older domains
// through their own translation (core/model/backup-translation.js).
/** @type {Readonly<Record<number, number[]>>} */
const READABLE_DOMAIN_VERSIONS = Object.freeze(Object.fromEntries(PROFILE_DOMAINS.map(domain => [domain.id, Array.from({length: domain.version}, (_, index) => index + 1)])));
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

/** @param {import("./profile-domains-types.js").DomainModels} models @param {DomainOptions} [options] */
function encodeProfileDomains(models, options = {}) {
    /** @template {import("./profile-domains-types.js").DomainKey} K @param {K} key */
    const encode = key => domainCodec(key).encode(models[key], options);
    return PROFILE_DOMAINS.map(domain => ({id: domain.id, version: domain.version, payload: encode(domain.key)}));
}

// Rewrite an envelope payload while retaining its identity and the other
// domains. Callers choose how to edit the payload; the blob keeps its own
// canonical ordering, capacity and version checks.
/** @param {Uint8Array} bytes @param {number} id @param {(payload: Buffer) => Buffer} change @param {(profile: import("./types.js").BlobInput) => Buffer} [encode] @returns {Buffer} */
function replaceDomain(bytes, id, change, encode = require("./profile-blob-v1").encodeProfileBlob) {
    const blob = require("./profile-blob-v1").decodeProfileBlob(bytes);
    return encode({...blob, domains: blob.domains.map(domain => domain.id === id ? {...domain, payload: change(domain.payload)} : domain)});
}

module.exports = {PROFILE_DOMAINS, PROFILE_DOMAIN_IDS, PROFILE_DOMAIN_VERSIONS, READABLE_DOMAIN_VERSIONS, PROFILE_WIRE_DOMAINS, PROFILE_DOMAIN_MASK, profileDomain, domainCodec, encodeProfileDomains, replaceDomain};
