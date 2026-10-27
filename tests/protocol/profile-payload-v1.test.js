"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {RAW_HID_REPORT_SIZE} = require("../../core/transport/device-adapter");
const {PROFILE_WIRE_STATUS, PROFILE_WIRE_V1} = require("../../core/protocol/profile-wire-v1");
const {crc32, fnv1a32} = require("../../core/schema/profile-blob-v1");
const {
    PROFILE_PAYLOAD_V1,
    chunkCount,
    decodePayloadMetadata,
    readCommittedPayload,
} = require("../../core/protocol/profile-payload-v1");

const {metadataPage, payloadOf, payloadDevice} = require("../fixtures/profile-payload");

test("reads a committed payload and verifies it against the reported digest", async () => {
    const bytes = payloadOf(60);
    const device = payloadDevice({bytes, generation: 9});

    const {metadata, bytes: read} = await readCommittedPayload(device);

    assert.deepEqual(read, bytes);
    assert.equal(metadata.generation, 9);
    assert.equal(metadata.payloadLength, 60);
    assert.equal(metadata.crc32, crc32(bytes));
    assert.equal(metadata.digest, fnv1a32(bytes));
    assert.deepEqual(metadata.schema, {major: 1, minor: 0});

    // Metadata, three chunks, then metadata again to prove coherence.
    assert.deepEqual(device.requests, [0, 1, 2, 3, 0]);
});

test("a payload whose last chunk is partial is reassembled exactly", async () => {
    for (const length of [1, 24, 25, 26, 49, 50, 51]) {
        const bytes = payloadOf(length);
        const read = await readCommittedPayload(payloadDevice({bytes, generation: 1}));
        assert.deepEqual(read.bytes, bytes, `length ${length}`);
        assert.equal(read.bytes.length, length);
    }
});

test("progress is reported in payload bytes, ending at the full length", async () => {
    const bytes = payloadOf(60);
    const seen = [];
    await readCommittedPayload(payloadDevice({bytes, generation: 1}), {onProgress: (value) => seen.push(value)});

    assert.equal(seen.length, chunkCount({payloadLength: 60, chunkSize: 25}));
    assert.deepEqual(seen.at(0), {done: 25, total: 60});
    assert.deepEqual(seen.at(-1), {done: 60, total: 60});
});

test("a commit landing mid-read is detected and the read is retried", async () => {
    const first = payloadOf(60);
    const second = payloadOf(45);
    // Serve the first attempt from `first`, then have its closing metadata
    // report generation 5, as a commit landing mid-read would.
    let metadataReads = 0;
    const device = {
        async request(report) {
            const request = Buffer.from(report);
            const page = request[4];
            const firstAttempt = metadataReads < 2;
            const state = firstAttempt ? {bytes: first, generation: 4} : {bytes: second, generation: 5};

            let payload;
            if (page === 0) {
                metadataReads += 1;
                // The closing read of attempt one is where the change shows up.
                payload = metadataReads === 2
                    ? metadataPage({bytes: second, generation: 5})
                    : metadataPage(state);
            } else {
                payload = state.bytes.subarray((page - 1) * 25, page * 25);
            }

            const response = Buffer.alloc(RAW_HID_REPORT_SIZE);
            request.copy(response, 0, 0, 5);
            response[5] = PROFILE_WIRE_STATUS.OK;
            response[6] = payload.length;
            payload.copy(response, PROFILE_WIRE_V1.PAYLOAD_OFFSET);
            return response;
        },
    };

    const {metadata, bytes} = await readCommittedPayload(device);
    assert.equal(metadata.generation, 5);
    assert.deepEqual(bytes, second, "the retry must return the new generation, not a mix of both");
});

test("a payload that never settles fails rather than returning a torn read", async () => {
    let generation = 0;
    const device = {
        async request(report) {
            const request = Buffer.from(report);
            const page = request[4];
            const bytes = payloadOf(30);
            if (page === 0) {
                generation += 1;
            }
            const payload = page === 0
                ? metadataPage({bytes, generation})
                : bytes.subarray((page - 1) * 25, page * 25);
            const response = Buffer.alloc(RAW_HID_REPORT_SIZE);
            request.copy(response, 0, 0, 5);
            response[5] = PROFILE_WIRE_STATUS.OK;
            response[6] = payload.length;
            payload.copy(response, PROFILE_WIRE_V1.PAYLOAD_OFFSET);
            return response;
        },
    };

    await assert.rejects(readCommittedPayload(device, {generationRetries: 2}), (error) => {
        assert.equal(error.code, "GENERATION_UNSTABLE");
        assert.equal(error.attempts, 3);
        return true;
    });
});

test("a corrupted payload is refused, not decoded", async () => {
    const bytes = payloadOf(50);
    // Report a digest and CRC for different content than the chunks carry.
    const wrong = payloadOf(50);
    wrong[10] ^= 0xff;

    const crcOnly = payloadDevice({bytes, generation: 1, crc: crc32(wrong)});
    await assert.rejects(readCommittedPayload(crcOnly), (error) => {
        assert.equal(error.code, "PAYLOAD_CORRUPT");
        assert.match(error.message, /CRC/);
        return true;
    });

    // A CRC can collide where the digest does not, so both are checked.
    const digestOnly = payloadDevice({bytes, generation: 1, digest: fnv1a32(wrong)});
    await assert.rejects(readCommittedPayload(digestOnly), (error) => {
        assert.equal(error.code, "PAYLOAD_CORRUPT");
        assert.match(error.message, /digest/);
        return true;
    });
});

test("metadata that does not describe a readable payload is refused", () => {
    const bytes = payloadOf(10);
    for (const [overrides, code] of [
        // Layout 1 is Profile Wire 1's, with a 16-bit length.
        [{layoutVersion: 1}, "INCOMPATIBLE_RESPONSE"],
        [{layoutVersion: 3}, "INCOMPATIBLE_RESPONSE"],
        [{chunkSize: 0}, "MALFORMED_RESPONSE"],
        [{chunkSize: 26}, "MALFORMED_RESPONSE"],
        [{payloadLength: 0}, "MALFORMED_RESPONSE"],
    ]) {
        assert.throws(
            () => decodePayloadMetadata(metadataPage({bytes, generation: 1, ...overrides})),
            (error) => {
                assert.equal(error.code, code, JSON.stringify(overrides));
                return true;
            }
        );
    }
});

test("wide pages address a whole 52 KiB slot", () => {
    // Pages are 16 bits: past 255 pages, up to 53,216 bytes; the length is 32
    // bits (layout 2), so a profile past 64 KiB is described too.
    for (const payloadLength of [25 * 256, 53216, 65536, 131040]) {
        assert.equal(decodePayloadMetadata(metadataPage({bytes: payloadOf(10), generation: 1, payloadLength})).payloadLength, payloadLength);
    }
});

test("a payload past page 255 is read through wide pages", async () => {
    // 255 chunks plus metadata fit one byte of page index; one byte more needs page 256.
    const over = payloadOf(25 * 255 + 1), device = payloadDevice({bytes: over, generation: 1});
    assert.deepEqual((await readCommittedPayload(device)).bytes, over);
    assert.ok(device.requests.includes(256), "the last chunk is page 256");
});

test("metadata with nonzero reserved bytes is refused", () => {
    const page = metadataPage({bytes: payloadOf(10), generation: 1});
    page[PROFILE_PAYLOAD_V1.METADATA_SIZE] = 1;
    assert.throws(() => decodePayloadMetadata(page), (error) => {
        assert.equal(error.code, "NONCANONICAL_RESPONSE");
        return true;
    });
});

test("reads require a connection that can issue requests", async () => {
    await assert.rejects(() => readCommittedPayload({}), TypeError);
    await assert.rejects(
        () => readCommittedPayload(payloadDevice({bytes: payloadOf(10), generation: 1}), {generationRetries: 99}),
        TypeError
    );
});

// Bytes the keyboard just served from the same record (`sameAs`) stand in for
// the download only when they have its length, CRC and digest; the metadata is
// still read before and after them.
test("bytes already read stand in for a payload only when they pass its checks", async () => {
    const bytes = payloadOf(60);
    const device = payloadDevice({bytes, generation: 7});
    const same = await readCommittedPayload(device, {sameAs: Buffer.from(bytes)});
    assert.deepEqual(same.bytes, bytes);
    assert.deepEqual(device.requests, [0, 0], "no chunk is downloaded");
    for (const other of [Buffer.concat([bytes, Buffer.from([0])]), Buffer.from(bytes).fill(1, 10, 11), bytes.subarray(1)]) {
        const fresh = payloadDevice({bytes, generation: 7});
        const read = await readCommittedPayload(fresh, {sameAs: other});
        assert.deepEqual(read.bytes, bytes, "the keyboard's own bytes, not the stand-in");
        assert.deepEqual(fresh.requests, [0, 1, 2, 3, 0]);
    }
});

// A save that lands between the chunks (a Live edit keyboard's own save, after
// a rename to a shorter name) shortens the payload under the read: the page
// that comes back short, or past the new end, is the save showing, so page 0
// is read again and the read retried when it moved. Seen on the keyboard on
// 2026-10-24 as "Chunk 258 returned 1 bytes where 3 were expected."
/** @param {{bytes: Buffer, generation: number}} first @param {{bytes: Buffer, generation: number}} second @param {number} landsAfter chunk page after which the save lands @param {{metadataMoves?: boolean}} [options] */
function savingDuringRead(first, second, landsAfter, {metadataMoves = true} = {}) {
    let state = first;
    /** @type {number[]} */
    const requests = [];
    return {
        requests,
        /** @param {Uint8Array} report */
        async request(report) {
            const request = Buffer.from(report);
            const page = request[4] | (request[5] << 8);
            requests.push(page);
            const offset = (page - 1) * 25;
            const past = page !== 0 && offset >= state.bytes.length;
            const payload = page === 0 ? metadataPage(metadataMoves ? state : first) : past ? Buffer.alloc(0) : state.bytes.subarray(offset, offset + 25);
            if (page === landsAfter) state = second;
            const response = Buffer.alloc(RAW_HID_REPORT_SIZE);
            request.copy(response, 0, 0, 5);
            response[5] = past ? PROFILE_WIRE_STATUS.UNKNOWN_PAGE : PROFILE_WIRE_STATUS.OK;
            response[6] = payload.length;
            payload.copy(response, PROFILE_WIRE_V1.PAYLOAD_OFFSET);
            return response;
        },
    };
}

test("a save that shortens the payload between chunks is read again, not refused", async () => {
    // 60 bytes become 58: the last chunk is 8 bytes where 10 were expected.
    // 60 bytes become 50: page 3 is past the new end.
    for (const length of [58, 50]) {
        const first = {bytes: payloadOf(60), generation: 4}, second = {bytes: payloadOf(length).fill(9, 0, 1), generation: 5};
        const device = savingDuringRead(first, second, 2);
        const read = await readCommittedPayload(device);
        assert.equal(read.metadata.generation, 5, `length ${length}`);
        assert.deepEqual(read.bytes, second.bytes, "the new generation, not a mix of both");
        assert.deepEqual(device.requests.slice(0, 5), [0, 1, 2, 3, 0], "page 0 is read again at the page that did not fit");
    }
});

test("a short chunk under unchanged metadata is still a malformed response", async () => {
    const bytes = payloadOf(60);
    // The chunks shorten, but page 0 still names the first payload.
    const device = savingDuringRead({bytes, generation: 4}, {bytes: bytes.subarray(0, 58), generation: 4}, 2, {metadataMoves: false});
    await assert.rejects(readCommittedPayload(device), (error) => {
        assert.equal(error.code, "MALFORMED_RESPONSE");
        return true;
    });
    assert.deepEqual(device.requests, [0, 1, 2, 3, 0], "page 0 was read again before refusing");
    // Past the end, under unchanged metadata: the keyboard's refusal stands.
    const past = savingDuringRead({bytes, generation: 4}, {bytes: bytes.subarray(0, 50), generation: 4}, 2, {metadataMoves: false});
    await assert.rejects(readCommittedPayload(past), (error) => {
        assert.equal(error.code, "DEVICE_REJECTED");
        return true;
    });
    assert.deepEqual(past.requests, [0, 1, 2, 3, 0]);
});
