"use strict";
const {PROFILE_PAYLOAD_V1, readCommittedPayload, readCompiledPayload} = require("../protocol/profile-payload-v1");

// One connection's verified reads. Compiled defaults are immutable within a
// connection; a committed read always downloads bytes unless a caller is
// deduplicating the same read sequence. There is deliberately no way to seed
// this cache with authored bytes from an Apply target.
class ProfilePayloadReader {
    #reads = new Map();
    constructor(connection) { this.connection = connection; }
    readCompiled(options = {}) { return this.#read(PROFILE_PAYLOAD_V1.COMPILED_VALUE, options, true); }
    readCommitted({reuse = false, ...options} = {}) { return this.#read(PROFILE_PAYLOAD_V1.VALUE, options, reuse); }
    async #read(value, options, reuse) {
        const previous = reuse ? this.#reads.get(value) : undefined;
        // A failed attempt must not leave an older read eligible for reuse.
        this.#reads.delete(value);
        const read = value === PROFILE_PAYLOAD_V1.COMPILED_VALUE ? readCompiledPayload : readCommittedPayload;
        const result = await read(this.connection, {...options, previous});
        this.#reads.set(value, {metadata: {...result.metadata, schema: {...result.metadata.schema}}, bytes: Buffer.from(result.bytes)});
        return result;
    }
}

module.exports = {ProfilePayloadReader};
