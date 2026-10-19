"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const {PROFILE_PAYLOAD_V1} = require("../../core/protocol/profile-payload-v1");
const {ProfilePayloadReader, encodeCompiledRead, decodeCompiledRead} = require("../../core/session/profile-payload-reader");
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

// A reconnect, or Ark opened again, need not download the firmware's defaults
// again: a new reader may start from the last verified copy, which it uses
// only when the keyboard's metadata names exactly those bytes.
test("a new connection's reader reuses verified compiled defaults only for the same bytes", async () => {
    const bytes = payloadOf(60);
    const first = payloadDevice({bytes, generation: 0}, PROFILE_PAYLOAD_V1.COMPILED_VALUE);
    /** @type {import("../../core/protocol/types.js").PayloadRead[]} */
    const kept = [];
    await new ProfilePayloadReader(first, {onCompiled: read => kept.push(read)}).readCompiled();
    assert.equal(kept.length, 1);
    kept[0].bytes[0] ^= 1;
    const again = payloadDevice({bytes, generation: 0}, PROFILE_PAYLOAD_V1.COMPILED_VALUE);
    await assert.doesNotReject(new ProfilePayloadReader(again, {compiled: kept[0]}).readCompiled());
    assert.deepEqual(again.requests, [0, 1, 2, 3, 0], "a copy that fails its own checks is no copy: the defaults download");
    kept[0].bytes[0] ^= 1;
    const same = payloadDevice({bytes, generation: 0}, PROFILE_PAYLOAD_V1.COMPILED_VALUE);
    assert.deepEqual((await new ProfilePayloadReader(same, {compiled: kept[0]}).readCompiled()).bytes, bytes);
    assert.deepEqual(same.requests, [0, 0], "the same firmware's defaults: metadata only");
    const other = payloadOf(61);
    const flashed = payloadDevice({bytes: other, generation: 0}, PROFILE_PAYLOAD_V1.COMPILED_VALUE);
    assert.deepEqual((await new ProfilePayloadReader(flashed, {compiled: kept[0]}).readCompiled()).bytes, other);
    assert.deepEqual(flashed.requests, [0, 1, 2, 3, 0], "other firmware: its own defaults");
    const committed = payloadDevice({bytes, generation: 9});
    await new ProfilePayloadReader(committed, {compiled: kept[0]}).readCommitted({reuse: true});
    assert.deepEqual(committed.requests, [0, 1, 2, 3, 0], "compiled defaults never stand in for a saved profile");
});

test("compiled defaults kept between runs come back only whole and verified", async () => {
    const bytes = payloadOf(60);
    const device = payloadDevice({bytes, generation: 0}, PROFILE_PAYLOAD_V1.COMPILED_VALUE);
    /** @type {import("../../core/protocol/types.js").PayloadRead[]} */
    const kept = [];
    await new ProfilePayloadReader(device, {onCompiled: read => kept.push(read)}).readCompiled();
    const text = encodeCompiledRead(kept[0]);
    const restored = decodeCompiledRead(text);
    assert.ok(restored);
    const again = payloadDevice({bytes, generation: 0}, PROFILE_PAYLOAD_V1.COMPILED_VALUE);
    await new ProfilePayloadReader(again, {compiled: restored}).readCompiled();
    assert.deepEqual(again.requests, [0, 0], "a restored copy is reused like a kept one");
    const stored = JSON.parse(text);
    const tampered = Buffer.from(stored.bytes, "base64"); tampered[3] ^= 1;
    for (const bad of [undefined, 42, "", "{", JSON.stringify({...stored, version: 2}), JSON.stringify({...stored, bytes: tampered.toString("base64")}),
        JSON.stringify({...stored, metadata: {...stored.metadata, generation: 9}}), JSON.stringify({...stored, metadata: {...stored.metadata, payloadLength: 1e9}}), "x".repeat(300000)]) {
        assert.equal(decodeCompiledRead(bad), undefined);
    }
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

// The firmware's validated maximum profile exercises real envelopes and all
// seven domains beyond a uint16 byte offset, not just synthetic metadata.
test("a complete seven-domain profile above 64 KiB survives payload readback", async () => {
    const text = require("node:fs").readFileSync(require("node:path").resolve(__dirname,
        "../../upstream/firmware/tests/fixtures/maximum_profile_v4.fixture"), "utf8");
    const bytes = Buffer.from(text.match(/^profile\.hex=(.*)$/m)[1], "hex");
    const {decodeProfileBlob, encodeProfileBlob} = require("../../core/schema/profile-blob-v1");
    assert.ok(bytes.length > 65535);
    const device = payloadDevice({bytes, generation: 9, schemaMajor: 4, schemaMinor: 0, domainMask: 127});
    const read = await new ProfilePayloadReader(device).readCommitted();
    assert.deepEqual(read.bytes, bytes);
    assert.deepEqual(encodeProfileBlob(decodeProfileBlob(read.bytes)), bytes);
    assert.equal(device.requests.at(-2), Math.ceil(bytes.length / 25));
    assert.ok(device.requests.at(-2) < 65536, "the 16-bit page index covers the flash slot");
});
