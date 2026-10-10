"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const {PROFILE_PAYLOAD_V1} = require("../../core/protocol/profile-payload-v1");
const {ProfilePayloadReader} = require("../../core/session/profile-payload-reader");
const {payloadOf, payloadDevice} = require("../fixtures/profile-payload");

test("a verified payload is reused only when explicitly allowed and fresh metadata matches", async () => {
    const bytes = payloadOf(2953), device = payloadDevice({bytes, generation: 9});
    const reader = new ProfilePayloadReader(device);
    const first = await reader.readCommitted();
    assert.equal(device.requests.length, 121);
    first.bytes[0] ^= 1;
    device.requests.length = 0;
    assert.deepEqual((await reader.readCommitted({reuse: true})).bytes, bytes, "returned bytes cannot modify the reader's verified copy");
    assert.deepEqual(device.requests, [0, 0], "both metadata reads still bracket reused bytes");
    device.requests.length = 0;
    await reader.readCommitted();
    assert.equal(device.requests.length, 121, "normal and post-Apply reads always download the bytes");
});

test("a generation or metadata change forces a full download instead of reuse", async () => {
    for (const change of [{generation: 10}, {crc: 123}, {schemaMinor: 1}, {flags: 1}, {originHalf: 0}]) {
        const bytes = payloadOf(60);
        let state = {bytes, generation: 9};
        const requests = [];
        const device = {request: async report => {
            requests.push(report[4]);
            return payloadDevice(state).request(report);
        }};
        const reader = new ProfilePayloadReader(device);
        await reader.readCommitted();
        state = {...state, ...change}; requests.length = 0;
        if (change.crc) await assert.rejects(reader.readCommitted({reuse: true}), /CRC/);
        else await reader.readCommitted({reuse: true});
        assert.deepEqual(requests, [0, 1, 2, 3, 0]);
    }
});

test("compiled defaults reuse stays in its connection and source", async () => {
    const bytes = payloadOf(60), compiled = payloadDevice({bytes, generation: 0}, PROFILE_PAYLOAD_V1.COMPILED_VALUE);
    const committed = payloadDevice({bytes, generation: 0});
    const connection = {request: request => (request[2] === PROFILE_PAYLOAD_V1.VALUE ? committed : compiled).request(request)};
    const reader = new ProfilePayloadReader(connection);
    await reader.readCommitted();
    await reader.readCompiled();
    assert.deepEqual(compiled.requests, [0, 1, 2, 3, 0], "committed bytes are never used as compiled defaults");
    compiled.requests.length = 0;
    await reader.readCompiled();
    assert.deepEqual(compiled.requests, [0, 0]);
    compiled.requests.length = 0;
    await new ProfilePayloadReader(connection).readCompiled();
    assert.deepEqual(compiled.requests, [0, 1, 2, 3, 0], "a new connection reader downloads defaults afresh");
});

test("a commit during metadata-only reuse retries with fresh bytes", async () => {
    const first = {bytes: payloadOf(60), generation: 9}, second = {bytes: payloadOf(45), generation: 10};
    let state = first, readingReuse = false, metadataReads = 0;
    const requests = [];
    const connection = {request: request => {
        requests.push(request[4]);
        if (readingReuse && request[4] === 0 && ++metadataReads === 2) state = second;
        return payloadDevice(state).request(request);
    }};
    const reader = new ProfilePayloadReader(connection);
    await reader.readCommitted();
    readingReuse = true; requests.length = 0;
    const result = await reader.readCommitted({reuse: true});
    assert.equal(result.metadata.generation, 10);
    assert.deepEqual(result.bytes, second.bytes);
    assert.deepEqual(requests, [0, 0, 0, 1, 2, 0]);
});
