// @ts-check
"use strict";

// The one profile format the keyboard stores: schema 3.0, up to 65,504 bytes
// (one 64 KiB slot less its header, firmware D-F14).
// Earlier schemas and domain versions are refused, as the firmware refuses
// them (firmware D-F10).
const PROFILE_BLOB_V1 = Object.freeze({
    MAGIC: "NLP1",
    HEADER_SIZE: 8,
    DOMAIN_HEADER_SIZE: 4,
    ACTION_SIZE: 4,
    SCHEMA_MAJOR: 3,
    SCHEMA_MINOR: 0,
    CANONICAL_FLAG: 1,
    KNOWN_FLAGS: 1,
    MAX_SIZE: 65504,
});

const PROFILE_DOMAIN_IDS = Object.freeze({
    RGB: 0x10,
    KEY_BEHAVIORS: 0x20,
    COMBOS: 0x30,
    SETTINGS: 0x40,
    PD_MODES: 0x50,
});

// Each domain's one version, as the firmware's registry has them
// (profile_domain_registry.h).
/** @type {Readonly<Record<number, number>>} */
const PROFILE_DOMAIN_VERSIONS = Object.freeze({
    [PROFILE_DOMAIN_IDS.RGB]: 4,
    [PROFILE_DOMAIN_IDS.KEY_BEHAVIORS]: 2,
    [PROFILE_DOMAIN_IDS.COMBOS]: 3,
    [PROFILE_DOMAIN_IDS.SETTINGS]: 6,
    [PROFILE_DOMAIN_IDS.PD_MODES]: 3,
});
/** @param {number} major @param {number} minor */
function assertSchema(major, minor) {
    if (major !== PROFILE_BLOB_V1.SCHEMA_MAJOR || minor !== PROFILE_BLOB_V1.SCHEMA_MINOR) {
        throw profileBlobError("INCOMPATIBLE_SCHEMA", `Profile blob schema ${major}.${minor} is not supported.`);
    }
}

const PROFILE_ACTION_KINDS = Object.freeze({
    NONE: 0,
    QMK_KEYCODE: 1,
    LAYER_MOMENTARY: 2,
    LAYER_LOCK: 3,
    PD_MODE_MOMENTARY: 4,
    PD_MODE_LOCK: 5,
    VIA_MACRO: 6,
    // Kind 7 named the retired user macros under earlier action vocabularies.
    CUSTOM_KEY: 7,
});

const PROFILE_ACTION_LIMITS = Object.freeze({
    maxLogicalLayers: 16,
    maxPdModes: 32,
    maxViaMacroSlots: 128,
    maxCustomKeys: 128,
});

const MAGIC_BYTES = Buffer.from(PROFILE_BLOB_V1.MAGIC, "ascii");

class ProfileBlobProtocolError extends Error {
    /** @param {string} code @param {string} message @param {Record<string, unknown>} [details] */
    constructor(code, message, details = {}) {
        super(message);
        this.name = "ProfileBlobProtocolError";
        this.code = code;
        Object.assign(this, details);
    }
}

/** @param {import("./types.js").BlobInput} [profile] @param {import("./types.js").BlobOptions} [options] */
function encodeProfileBlob(profile = {}, options = {}) {
    if (!profile || typeof profile !== "object") {
        throw new TypeError("Profile blob input must be an object.");
    }
    assertSchema(profile.schema?.major ?? PROFILE_BLOB_V1.SCHEMA_MAJOR, profile.schema?.minor ?? PROFILE_BLOB_V1.SCHEMA_MINOR);
    const domainVersions = normalizeDomainVersions(options.domainVersions);
    if (profile.domains !== undefined && !Array.isArray(profile.domains)) {
        throw new TypeError("Profile blob domains must be an array.");
    }
    const inputDomains = profile.domains || [];
    if (inputDomains.length > 0xff) {
        throw profileBlobError("CAPACITY_EXCEEDED", "Profile blob cannot contain more than 255 domains.");
    }
    const domains = inputDomains.map((domain) => normalizeDomain(domain, domainVersions));
    domains.sort((left, right) => left.id - right.id);
    assertUniqueDomains(domains);

    const encodedDomains = domains.map((domain) => encodeDomainEnvelope(domain, {domainVersions}));
    const totalLength = PROFILE_BLOB_V1.HEADER_SIZE + encodedDomains.reduce((total, domain) => total + domain.length, 0);
    if (totalLength > PROFILE_BLOB_V1.MAX_SIZE) {
        throw profileBlobError("CAPACITY_EXCEEDED", `Profile blob is ${totalLength} bytes; maximum is ${PROFILE_BLOB_V1.MAX_SIZE}.`);
    }

    const output = Buffer.alloc(totalLength);
    MAGIC_BYTES.copy(output, 0);
    output[4] = PROFILE_BLOB_V1.SCHEMA_MAJOR;
    output[5] = PROFILE_BLOB_V1.SCHEMA_MINOR;
    output[6] = domains.length;
    output[7] = PROFILE_BLOB_V1.CANONICAL_FLAG;
    /** @type {number} */
    let offset = PROFILE_BLOB_V1.HEADER_SIZE;
    for (const domain of encodedDomains) {
        domain.copy(output, offset);
        offset += domain.length;
    }
    return output;
}

/** @param {unknown} value @param {import("./types.js").BlobOptions} [options] */
function decodeProfileBlob(value, options = {}) {
    const bytes = copyBytes(value, "Profile blob");

    if (bytes.length < PROFILE_BLOB_V1.HEADER_SIZE) {
        throw profileBlobError("TRUNCATED", `Profile blob needs an ${PROFILE_BLOB_V1.HEADER_SIZE}-byte header.`);
    }
    const domainVersions = normalizeDomainVersions(options.domainVersions);
    if (!bytes.subarray(0, MAGIC_BYTES.length).equals(MAGIC_BYTES)) {
        throw profileBlobError("INVALID_MAGIC", `Profile blob magic must be ${PROFILE_BLOB_V1.MAGIC}.`);
    }
    assertSchema(bytes[4], bytes[5]);
    if (bytes.length > PROFILE_BLOB_V1.MAX_SIZE) {
        throw profileBlobError("CAPACITY_EXCEEDED", `Profile blob is ${bytes.length} bytes; maximum is ${PROFILE_BLOB_V1.MAX_SIZE}.`);
    }
    if ((bytes[7] & ~PROFILE_BLOB_V1.KNOWN_FLAGS) !== 0) {
        throw profileBlobError("RESERVED_FLAGS", `Profile blob flags contain unknown bits 0x${(bytes[7] & ~PROFILE_BLOB_V1.KNOWN_FLAGS).toString(16)}.`);
    }
    if (bytes[7] !== PROFILE_BLOB_V1.CANONICAL_FLAG) {
        throw profileBlobError("NONCANONICAL", "Profile blob must set exactly the canonical-encoding flag.");
    }

    const domainCount = bytes[6];
    const domains = [];
    /** @type {number} */
    let offset = PROFILE_BLOB_V1.HEADER_SIZE;
    let previousId = -1;
    for (let index = 0; index < domainCount; index += 1) {
        const decoded = readDomainEnvelope(bytes, offset, {domainVersions});
        if (decoded.domain.id === previousId) {
            throw profileBlobError("DUPLICATE_DOMAIN", `Profile domain 0x${hexByte(decoded.domain.id)} appears more than once.`, {domainId: decoded.domain.id});
        }
        if (decoded.domain.id < previousId) {
            throw profileBlobError("DOMAIN_ORDER", "Profile domains must appear in strictly ascending id order.", {domainId: decoded.domain.id});
        }
        domains.push(decoded.domain);
        previousId = decoded.domain.id;
        offset = decoded.nextOffset;
    }
    if (offset !== bytes.length) {
        throw profileBlobError("TRAILING_BYTES", `Profile blob has ${bytes.length - offset} trailing byte${bytes.length - offset === 1 ? "" : "s"} after its declared domains.`);
    }
    return {
        magic: PROFILE_BLOB_V1.MAGIC,
        schema: {major: bytes[4], minor: bytes[5]},
        flags: bytes[7],
        domains,
        byteLength: bytes.length,
        digest: fnv1a32(bytes),
        crc32: crc32(bytes),
    };
}

/** @param {import("./types.js").DomainInput} domain @param {import("./types.js").BlobOptions} [options] */
function encodeDomainEnvelope(domain, options = {}) {
    const domainVersions = normalizeDomainVersions(options.domainVersions);
    const normalized = normalizeDomain(domain, domainVersions);
    const output = Buffer.alloc(PROFILE_BLOB_V1.DOMAIN_HEADER_SIZE + normalized.payload.length);
    output[0] = normalized.id;
    output[1] = normalized.version;
    output.writeUInt16LE(normalized.payload.length, 2);
    normalized.payload.copy(output, PROFILE_BLOB_V1.DOMAIN_HEADER_SIZE);
    return output;
}

/** @param {unknown} value @param {import("./types.js").BlobOptions} [options] */
function decodeDomainEnvelope(value, options = {}) {
    const bytes = copyBytes(value, "Profile domain envelope");
    const decoded = readDomainEnvelope(bytes, 0, options);
    if (decoded.nextOffset !== bytes.length) {
        throw profileBlobError("TRAILING_BYTES", "Profile domain envelope has trailing bytes.");
    }
    return decoded.domain;
}

/** @param {unknown} value @param {number} [offset] @param {import("./types.js").BlobOptions} [options] */
function readDomainEnvelope(value, offset = 0, options = {}) {
    const bytes = value instanceof Buffer ? value : copyBytes(value, "Profile domain data");
    const domainVersions = normalizeDomainVersions(options.domainVersions);
    if (!Number.isInteger(offset) || offset < 0 || offset > bytes.length) {
        throw new RangeError("Domain offset must be within the input buffer.");
    }
    if (bytes.length - offset < PROFILE_BLOB_V1.DOMAIN_HEADER_SIZE) {
        throw profileBlobError("TRUNCATED", "Profile domain envelope is missing its four-byte header.", {offset});
    }
    const id = bytes[offset];
    const version = bytes[offset + 1];
    assertKnownDomain(id, version, domainVersions);
    const payloadLength = bytes.readUInt16LE(offset + 2);
    const nextOffset = offset + PROFILE_BLOB_V1.DOMAIN_HEADER_SIZE + payloadLength;
    if (nextOffset > bytes.length) {
        throw profileBlobError("TRUNCATED", `Profile domain 0x${hexByte(id)} declares ${payloadLength} payload bytes but only ${bytes.length - offset - PROFILE_BLOB_V1.DOMAIN_HEADER_SIZE} remain.`, {domainId: id, offset});
    }
    return {
        domain: {
            id,
            version,
            payload: Buffer.from(bytes.subarray(offset + PROFILE_BLOB_V1.DOMAIN_HEADER_SIZE, nextOffset)),
        },
        nextOffset,
    };
}

/** @param {import("./types.js").ActionInput} action @param {import("./types.js").ActionOptions} [options] */
function encodeSemanticAction(action, options = {}) {
    const normalized = normalizeSemanticAction(action, options);
    const output = Buffer.alloc(PROFILE_BLOB_V1.ACTION_SIZE);
    output[0] = normalized.kind;
    output[1] = normalized.flags;
    output.writeUInt16LE(normalized.operand, 2);
    return output;
}

/** @param {unknown} value @param {import("./types.js").ActionOptions} [options] */
function decodeSemanticAction(value, options = {}) {
    const bytes = copyBytes(value, "Semantic action");
    if (bytes.length !== PROFILE_BLOB_V1.ACTION_SIZE) {
        throw profileBlobError("INVALID_LENGTH", `Semantic action must be exactly ${PROFILE_BLOB_V1.ACTION_SIZE} bytes.`);
    }
    return readSemanticAction(bytes, 0, options).action;
}

/** @param {unknown} value @param {number} [offset] @param {import("./types.js").ActionOptions} [options] */
function readSemanticAction(value, offset = 0, options = {}) {
    const bytes = value instanceof Buffer ? value : copyBytes(value, "Semantic action data");
    if (!Number.isInteger(offset) || offset < 0 || offset > bytes.length) {
        throw new RangeError("Action offset must be within the input buffer.");
    }
    if (bytes.length - offset < PROFILE_BLOB_V1.ACTION_SIZE) {
        throw profileBlobError("TRUNCATED", "Semantic action is truncated.", {offset});
    }
    const action = normalizeSemanticAction({
        kind: bytes[offset],
        flags: bytes[offset + 1],
        operand: bytes.readUInt16LE(offset + 2),
    }, options);
    return {action, nextOffset: offset + PROFILE_BLOB_V1.ACTION_SIZE};
}

/** @param {import("./types.js").DomainInput} domain @param {Map<number, Set<number>>} domainVersions */
function normalizeDomain(domain, domainVersions) {
    const id = assertU8(domain?.id, "Domain id");
    const version = assertU8(domain?.version, "Domain version");
    assertKnownDomain(id, version, domainVersions);
    const payload = copyBytes(domain?.payload === undefined ? Buffer.alloc(0) : domain.payload, "Domain payload");
    if (payload.length > 0xffff) {
        throw profileBlobError("CAPACITY_EXCEEDED", "Domain payload cannot exceed 65535 bytes.", {domainId: id});
    }
    return {id, version, payload};
}

/** @param {import("./types.js").ActionInput} action @param {import("./types.js").ActionOptions} [options] @returns {import("./types.js").SemanticAction & {flags: 0}} */
function normalizeSemanticAction(action, options = {}) {
    const limits = normalizeActionLimits(options.actionLimits || options);
    const kind = assertU8(action?.kind, "Action kind");
    const flags = action?.flags === undefined ? 0 : assertU8(action.flags, "Action flags");
    const operand = assertU16(action?.operand === undefined ? 0 : action.operand, "Action operand");
    if (flags !== 0) {
        throw profileBlobError("RESERVED_FLAGS", `Semantic action kind ${kind} has unsupported flags 0x${flags.toString(16)}.`, {kind});
    }
    switch (kind) {
        case PROFILE_ACTION_KINDS.NONE:
            if (operand !== 0) {
                throw profileBlobError("INVALID_OPERAND", "The none action requires operand zero.", {kind, operand});
            }
            break;
        case PROFILE_ACTION_KINDS.QMK_KEYCODE:
            break;
        case PROFILE_ACTION_KINDS.LAYER_MOMENTARY:
        case PROFILE_ACTION_KINDS.LAYER_LOCK:
            assertOperandSlot(kind, operand, limits.maxLogicalLayers, "logical layer");
            break;
        case PROFILE_ACTION_KINDS.PD_MODE_MOMENTARY:
        case PROFILE_ACTION_KINDS.PD_MODE_LOCK:
            assertOperandSlot(kind, operand, limits.maxPdModes, "PD mode");
            break;
        case PROFILE_ACTION_KINDS.VIA_MACRO:
            assertOperandSlot(kind, operand, limits.maxViaMacroSlots, "VIA macro slot");
            break;
        case PROFILE_ACTION_KINDS.CUSTOM_KEY:
            assertOperandSlot(kind, operand, limits.maxCustomKeys, "custom key");
            break;
        default:
            throw profileBlobError("UNKNOWN_ACTION_KIND", `Unknown semantic action kind ${kind}.`, {kind});
    }
    return {kind, flags, operand};
}

/** @param {Partial<import("./types.js").ActionLimits>} [options] */
function normalizeActionLimits(options = {}) {
    /** @type {import("./types.js").ActionLimits} */
    const limits = {...PROFILE_ACTION_LIMITS};
    for (const name of /** @type {(keyof import("./types.js").ActionLimits)[]} */ (Object.keys(PROFILE_ACTION_LIMITS))) {
        const fallback = PROFILE_ACTION_LIMITS[name];
        const value = options[name] === undefined ? fallback : Number(options[name]);
        if (!Number.isInteger(value) || value < 0 || value > 0x10000) {
            throw new RangeError(`${name} must be an integer from 0 through 65536.`);
        }
        limits[name] = value;
    }
    return limits;
}

/** @param {import("./types.js").DomainVersions} [value] */
function normalizeDomainVersions(value) {
    const source = value === undefined ? PROFILE_DOMAIN_VERSIONS : value;
    const entries = source instanceof Map ? Array.from(source.entries()) : Object.entries(source || {});
    /** @type {Map<number, Set<number>>} */
    const versions = new Map();
    for (const [rawId, rawVersion] of entries) {
        const id = assertU8(Number(rawId), "Registered domain id");
        const accepted = rawVersion instanceof Set || Array.isArray(rawVersion)
            ? Array.from(rawVersion)
            : [rawVersion];
        const versionSet = new Set(accepted.map((version) => assertU8(Number(version), "Registered domain version")));
        if (!versionSet.size) {
            throw new TypeError(`Registered domain 0x${hexByte(id)} must accept at least one version.`);
        }
        versions.set(id, versionSet);
    }
    return versions;
}

/** @param {number} id @param {number} version @param {Map<number, Set<number>>} domainVersions */
function assertKnownDomain(id, version, domainVersions) {
    const acceptedVersions = domainVersions.get(id);
    if (!acceptedVersions) {
        throw profileBlobError("UNKNOWN_DOMAIN", `Unknown Profile Wire v1.0 domain 0x${hexByte(id)}.`, {domainId: id});
    }
    if (!acceptedVersions.has(version)) {
        throw profileBlobError("UNKNOWN_DOMAIN_VERSION", `Domain 0x${hexByte(id)} version ${version} is not supported.`, {domainId: id, domainVersion: version});
    }
}

/** @param {import("./types.js").ProfileDomain[]} domains */
function assertUniqueDomains(domains) {
    for (let index = 1; index < domains.length; index += 1) {
        if (domains[index - 1].id === domains[index].id) {
            throw profileBlobError("DUPLICATE_DOMAIN", `Profile domain 0x${hexByte(domains[index].id)} appears more than once.`, {domainId: domains[index].id});
        }
    }
}

/** @param {number} kind @param {number} operand @param {number} count @param {string} label */
function assertOperandSlot(kind, operand, count, label) {
    if (operand >= count) {
        throw profileBlobError("INVALID_OPERAND", `Semantic action kind ${kind} references ${label} ${operand}; valid range is ${count ? `0..${count - 1}` : "empty"}.`, {kind, operand, capacity: count});
    }
}

/** @param {unknown} value */
function fnv1a32(value) {
    const bytes = asBytes(value, "FNV-1a input");
    let hash = 0x811c9dc5;
    for (const byte of bytes) {
        hash ^= byte;
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash >>> 0;
}

/** @param {unknown} value */
function crc32(value) {
    const bytes = asBytes(value, "CRC32 input");
    let crc = 0xffffffff;
    for (const byte of bytes) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit += 1) {
            crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
        }
    }
    return (crc ^ 0xffffffff) >>> 0;
}

/** @param {unknown} value @param {string} label */
function asBytes(value, label) {
    if (!(value instanceof Uint8Array)) {
        throw new TypeError(`${label} must be a Buffer or Uint8Array.`);
    }
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
}

/** @param {unknown} value @param {string} label */
function copyBytes(value, label) {
    return Buffer.from(asBytes(value, label));
}

/** @param {unknown} value @param {string} label */
function assertU8(value, label) {
    const number = Number(value);
    if (!Number.isInteger(number) || number < 0 || number > 0xff) {
        throw new RangeError(`${label} must be an 8-bit integer.`);
    }
    return number;
}

/** @param {unknown} value @param {string} label */
function assertU16(value, label) {
    const number = Number(value);
    if (!Number.isInteger(number) || number < 0 || number > 0xffff) {
        throw new RangeError(`${label} must be a 16-bit integer.`);
    }
    return number;
}

/** @param {string} code @param {string} message @param {Record<string, unknown>} [details] */
function profileBlobError(code, message, details) {
    return new ProfileBlobProtocolError(code, message, details);
}

/** @param {number} value */
function hexByte(value) {
    return Number(value).toString(16).padStart(2, "0");
}

module.exports = {
    PROFILE_ACTION_KINDS,
    PROFILE_ACTION_LIMITS,
    PROFILE_BLOB_V1,
    PROFILE_DOMAIN_IDS,
    PROFILE_DOMAIN_VERSIONS,
    ProfileBlobProtocolError,
    crc32,
    decodeDomainEnvelope,
    decodeProfileBlob,
    decodeSemanticAction,
    encodeDomainEnvelope,
    encodeProfileBlob,
    encodeSemanticAction,
    fnv1a32,
    readDomainEnvelope,
    readSemanticAction,
};
