// @ts-check
"use strict";
const {PROFILE_PAYLOAD_V1, readCommittedPayload, readCompiledPayload} = require("../protocol/profile-payload-v1");
const {PROFILE_ACTIVE_KIND} = require("../protocol/profile-wire-v1");
const {PROFILE_BLOB_V1, crc32, fnv1a32} = require("../schema/profile-blob-v1");

// GET committed serves the newest saved record, which may not be running yet.
// Compiled defaults have no record origin; saved profiles must match all three
// parts of the active identity, even when their bytes happen to be identical.
/** @param {import("../protocol/types.js").PayloadRead} read @param {import("./types.js").ProfileStatus} status */
function payloadMatchesActive({metadata}, status) {
    return (status.activeKind === PROFILE_ACTIVE_KIND.COMPILED_ONLY || status.activeKind === PROFILE_ACTIVE_KIND.COMMITTED)
        && metadata.generation === status.activeGeneration && metadata.digest === status.activeDigest
        && (status.activeKind === PROFILE_ACTIVE_KIND.COMPILED_ONLY || metadata.originHalf === status.activeOriginHalf);
}

// One connection's verified reads. Compiled defaults are immutable while the
// firmware runs: a reader reuses them on its connection, and may start from
// the defaults an earlier connection verified (`compiled`), which it takes
// only for a keyboard whose metadata names exactly those bytes. A committed
// read always downloads bytes unless a caller is deduplicating the same read
// sequence, or passes bytes the keyboard just served from that saved record
// itself (`sameAs`, checked against its length, CRC and digest). There is
// deliberately no way to seed this cache with authored bytes from an Apply
// target.
class ProfilePayloadReader {
    /** @type {Map<number, import("../protocol/types.js").PayloadRead>} */
    #reads = new Map();
    /** @type {((read: import("../protocol/types.js").PayloadRead) => void) | undefined} */
    #onCompiled;
    /**
     * @param {import("../transport/types.js").RequestConnection} connection
     * @param {{compiled?: import("../protocol/types.js").PayloadRead, onCompiled?: (read: import("../protocol/types.js").PayloadRead) => void}} [options]
     */
    constructor(connection, {compiled, onCompiled} = {}) {
        this.connection = connection;
        this.#onCompiled = typeof onCompiled === "function" ? onCompiled : undefined;
        if (compiled && verifiedCompiled(compiled)) this.#reads.set(PROFILE_PAYLOAD_V1.COMPILED_VALUE, copyRead(compiled));
    }
    /** @param {Omit<import("../protocol/types.js").PayloadReadOptions, 'previous' | 'sameAs'>} [options] */
    readCompiled(options = {}) { return this.#read(PROFILE_PAYLOAD_V1.COMPILED_VALUE, options, true); }
    /** @param {Omit<import("../protocol/types.js").PayloadReadOptions, 'previous'> & {reuse?: boolean}} [options] */
    readCommitted({reuse = false, ...options} = {}) { return this.#read(PROFILE_PAYLOAD_V1.VALUE, options, reuse); }
    /** @param {number} value @param {Omit<import("../protocol/types.js").PayloadReadOptions, 'previous'>} options @param {boolean} reuse */
    async #read(value, options, reuse) {
        const previous = reuse ? this.#reads.get(value) : undefined;
        // A failed attempt must not leave an older read eligible for reuse.
        this.#reads.delete(value);
        const compiled = value === PROFILE_PAYLOAD_V1.COMPILED_VALUE;
        const read = compiled ? readCompiledPayload : readCommittedPayload;
        const result = await read(this.connection, {...options, previous});
        this.#reads.set(value, copyRead(result));
        if (compiled) this.#onCompiled?.(copyRead(result));
        return result;
    }
}

/** @param {import("../protocol/types.js").PayloadRead} read @returns {import("../protocol/types.js").PayloadRead} */
function copyRead(read) {
    return {metadata: {...read.metadata, schema: {...read.metadata.schema}}, bytes: Buffer.from(read.bytes)};
}

// Compiled defaults carry generation zero, and their bytes must pass the
// checks a download does.
/** @param {import("../protocol/types.js").PayloadRead} read */
function verifiedCompiled({metadata, bytes}) {
    return metadata.generation === 0 && bytes.length === metadata.payloadLength && crc32(bytes) === metadata.crc32 && fnv1a32(bytes) === metadata.digest;
}

// The last verified compiled defaults as a shell keeps them between runs, and
// back. Anything unreadable, oversized or failing its own checks is no copy.
const STORED_COMPILED_VERSION = 1;
/** @param {import("../protocol/types.js").PayloadRead} read */
function encodeCompiledRead({metadata, bytes}) {
    return JSON.stringify({version: STORED_COMPILED_VERSION, metadata, bytes: Buffer.from(bytes).toString("base64")});
}
/** @param {unknown} text @returns {import("../protocol/types.js").PayloadRead | undefined} */
function decodeCompiledRead(text) {
    if (typeof text !== "string" || text.length > 2 * PROFILE_BLOB_V1.MAX_SIZE) return undefined;
    try {
        const stored = JSON.parse(text);
        const m = stored?.metadata;
        const integer = /** @param {unknown} value @param {number} max */ (value, max) => Number.isInteger(value) && /** @type {number} */ (value) >= 0 && /** @type {number} */ (value) <= max;
        if (stored?.version !== STORED_COMPILED_VERSION || typeof stored.bytes !== "string" || !m || typeof m !== "object"
            || ![m.layoutVersion, m.chunkSize, m.domainMask, m.originHalf, m.flags, m.schema?.major, m.schema?.minor].every(value => integer(value, 0xff))
            || !integer(m.payloadLength, PROFILE_BLOB_V1.MAX_SIZE) || ![m.generation, m.digest, m.crc32].every(value => integer(value, 0xffffffff))) return undefined;
        // The order decodePayloadMetadata gives, which reuse compares exactly.
        const metadata = {layoutVersion: m.layoutVersion, chunkSize: m.chunkSize, payloadLength: m.payloadLength, generation: m.generation, digest: m.digest,
            crc32: m.crc32, schema: {major: m.schema.major, minor: m.schema.minor}, domainMask: m.domainMask, originHalf: m.originHalf, flags: m.flags};
        const read = {metadata, bytes: Buffer.from(stored.bytes, "base64")};
        return verifiedCompiled(read) ? read : undefined;
    } catch {
        return undefined;
    }
}

module.exports = {ProfilePayloadReader, payloadMatchesActive, encodeCompiledRead, decodeCompiledRead};
