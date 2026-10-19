"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
    PROFILE_STATE_FLAGS,
    PROFILE_WIRE_KNOWN_MASKS,
    PROFILE_WIRE_FEATURES,
    PROFILE_WIRE_V1,
    buildProfileGetRequest,
    decodeCapabilityPages,
    decodeProfileResponse,
    decodeStatusPages,
    profileResponseMatcher,
    readProfileCapabilities,
} = require("../../core/protocol/profile-wire-v1");

function goldenFixtures() {
    const fixturePath = path.resolve(__dirname, "../../upstream/firmware/tests/fixtures/profile_wire_v1_reads.fixture");
    const entries = {};
    for (const line of fs.readFileSync(fixturePath, "utf8").split(/\r?\n/)) {
        if (!line || line.startsWith("#")) continue;
        const [name, hex] = line.split("=");
        entries[name] = Buffer.from(hex, "hex");
    }
    return entries;
}

function response(request, payload, status = 0) {
    const report = Buffer.from(request);
    report.fill(0, 5);
    report[5] = status;
    report[6] = payload.length;
    Buffer.from(payload).copy(report, 7);
    return report;
}

// Capability layout 3 (firmware D-F28): page 1 the ceilings that fit a byte,
// page 2 the wider ones, every byte count 32 bits. A split build that saves
// and has a pointing device, profiles past 64 KiB.
function compiledOnlyPages() {
    const identity = Buffer.alloc(PROFILE_WIRE_V1.PAYLOAD_SIZE);
    identity.set([3, 3, 2, 0, 4, 0, 32, 20, 2, 0x07], 0);
    const capacity = Buffer.from([
        16, 16, 128, 5, 128, 16, 16, 32, 58, 8, 128, 128, 31, 32, 32, 60,
        0, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);
    const wide = Buffer.alloc(PROFILE_WIRE_V1.PAYLOAD_SIZE);
    wide.writeUInt16LE(640, 0);
    wide.writeUInt32LE(131072, 2);
    wide.writeUInt32LE(100000, 6);
    wide.writeUInt32LE(131040, 10);
    wide.writeUInt32LE(70000, 14);
    return [identity, capacity, wide];
}

test("the feature word holds only what a build varies by: split, saves and pointing", () => {
    assert.deepEqual(PROFILE_WIRE_FEATURES, {SPLIT_KEYBOARD: 1, SAVES: 2, POINTING: 4});
    assert.equal(PROFILE_WIRE_KNOWN_MASKS.FEATURE_FLAGS, 0x07);
    for (const flags of [0, 1, 4, 5]) {
        const pages = compiledOnlyPages();
        pages[0].writeUInt32LE(flags, 9);
        pages[0][7] = 0;
        assert.equal(decodeCapabilityPages(pages).featureFlags, flags, "a build that cannot save yet");
    }
    // Every Profile Wire 1 bit is retired: an earlier word is unknown here.
    for (const bit of [3, 4, 19, 24, 31]) {
        const pages = compiledOnlyPages();
        pages[0].writeUInt32LE((pages[0].readUInt32LE(9) | 2 ** bit) >>> 0, 9);
        assert.throws(() => decodeCapabilityPages(pages), (error) => error.code === "INCOMPATIBLE_RESPONSE" && /unknown bits/.test(error.message), `bit ${bit}`);
    }
});

test("save support and the candidate chunk capacity agree", () => {
    const withoutSaves = compiledOnlyPages();
    withoutSaves[0].writeUInt32LE(PROFILE_WIRE_FEATURES.SPLIT_KEYBOARD, 9);
    assert.throws(() => decodeCapabilityPages(withoutSaves), /Save support and candidate chunk capacity disagree/);
    const withoutChunks = compiledOnlyPages();
    withoutChunks[0][7] = 0;
    assert.throws(() => decodeCapabilityPages(withoutChunks), /Save support and candidate chunk capacity disagree/);
});

test("Profile Wire get requests are canonical 32-byte frames", () => {
    const request = buildProfileGetRequest(PROFILE_WIRE_V1.VALUE_CAPABILITIES, 1, 0x42);
    assert.equal(request.length, 32);
    assert.deepEqual(Array.from(request.subarray(0, 5)), [0x08, 0, 1, 0x42, 1]);
    assert.equal(request.subarray(5).every((byte) => byte === 0), true);
    assert.throws(() => buildProfileGetRequest(1, 0, 0), /nonzero/);
    // A wide page: byte 4 its low byte, byte 5 its high byte.
    const wide = buildProfileGetRequest(PROFILE_WIRE_V1.VALUE_PAYLOAD ?? 0x04, 2621, 0x43);
    assert.deepEqual(Array.from(wide.subarray(4, 6)), [2621 & 0xff, 2621 >> 8]);
    assert.equal(wide.subarray(6).every((byte) => byte === 0), true);
    assert.throws(() => buildProfileGetRequest(4, 0x10000, 1), RangeError);
    assert.equal(buildProfileGetRequest(4, 256, 1)[5], 1);
});

test("JavaScript consumes the same golden reports as the C firmware codec", () => {
    const fixtures = goldenFixtures();
    const pages = {};
    for (const prefix of ["capabilities-page-0", "capabilities-page-1", "capabilities-page-2", "status-page-0", "status-page-1"]) {
        const request = fixtures[`${prefix}-request`];
        const actualRequest = buildProfileGetRequest(request[2], request[4], request[3]);
        assert.deepEqual(actualRequest, request);
        pages[prefix] = decodeProfileResponse(fixtures[`${prefix}-response`], request);
    }
    assert.deepEqual(decodeCapabilityPages([pages["capabilities-page-0"], pages["capabilities-page-1"], pages["capabilities-page-2"]]), {
        responseVersion: 3,
        protocol: {major: 2, minor: 0},
        schema: {major: 4, minor: 0},
        reportSize: 32,
        candidateChunkMax: 0,
        statusPageCount: 2,
        featureFlags: 0x05,
        actionAbiDigest: 0x12345678,
        firmwareVersion: 0x00010000,
        compiledDefaultDigest: 0x89abcdef,
        compiledLayerCount: 16,
        maxLogicalLayers: 16,
        maxBehaviorRows: 128,
        maxTapStepsPerBehavior: 5,
        maxPopulatedBehaviorSteps: 640,
        maxCombos: 128,
        maxKeysPerCombo: 16,
        maxReusableRgbGroups: 16,
        maxRgbStageGroupRows: 32,
        physicalLedCount: 58,
        ledBitmapSize: 8,
        customKeySlots: 128,
        macroSlots: 128,
        // The firmware's golden capacities are past 64 KiB, as 32 bits allow.
        maxProfilePayload: 130048,
        profileSlotPayload: 130048,
        profileSlotSize: 131072,
        macroBytes: 70000,
        supportedDomainMask: 3,
        nameMaxBytes: 32,
        layerMaskBits: 32,
        placementPositions: 60,
    });
    assert.deepEqual(decodeStatusPages([pages["status-page-0"], pages["status-page-1"]]), {
        responseVersion: 1,
        stateFlags: 0x00ff,
        sourceDigest: 0x01020304,
        compiledDefaultDigest: 0x11121314,
        activeDigest: 0x21222324,
        pendingDigest: 0x31323334,
        committedDigest: 0x41424344,
        activeKind: 2,
        activeGeneration: 0x51525354,
        activeOriginHalf: 1,
        committedGeneration: 0x61626364,
        committedOriginHalf: 0,
        peerGeneration: 0x71727374,
        peerOriginHalf: 1,
        candidateTransactionId: 0x8182,
        lastCommittedTransactionId: 0x9192,
        conflictCount: 0xa1a2,
        validationState: 0xb1,
        lastError: 0xc1,
        candidatePending: true,
        peerKnown: true,
        peerConverged: true,
        waitingSafeBoundary: true,
        peerCleanupPending: false,
        storedEarlierFormat: false,
    });
});

test("response correlation includes value, request id, and page", () => {
    const request = buildProfileGetRequest(1, 0, 0x41);
    const matching = response(request, Buffer.alloc(25));
    assert.equal(profileResponseMatcher(matching, request), true);
    matching[3] += 1;
    assert.equal(profileResponseMatcher(matching, request), false);
});

test("capability pages decode the bigger profile's capacities", () => {
    const decoded = decodeCapabilityPages(compiledOnlyPages());
    assert.deepEqual(decoded.protocol, {major: 2, minor: 0});
    assert.deepEqual(decoded.schema, {major: 4, minor: 0});
    assert.equal(decoded.featureFlags, 0x07);
    assert.equal(decoded.compiledLayerCount, 16);
    assert.equal(decoded.maxBehaviorRows, 128);
    assert.equal(decoded.maxPopulatedBehaviorSteps, 640);
    assert.equal(decoded.physicalLedCount, 58);
    assert.equal(decoded.supportedDomainMask, 31);
    assert.equal(decoded.maxProfilePayload, 100000);
    assert.equal(decoded.profileSlotPayload, 131040);
    assert.equal(decoded.profileSlotSize, 131072);
    assert.equal(decoded.macroBytes, 70000);
    assert.equal(decoded.nameMaxBytes, 32);
    assert.equal(decoded.placementPositions, 60);
    // Profile Wire 1's layouts 1 and 2 are refused, so is any later one.
    for (const layout of [1, 2, 4]) {
        const older = compiledOnlyPages().map((page) => Buffer.from(page));
        older[0][0] = layout;
        assert.throws(() => decodeCapabilityPages(older), (error) => error.code === "INCOMPATIBLE_RESPONSE" && /Update both halves/.test(error.message));
    }
    // The bytes past each page's fields stay zero.
    for (const [page, offset] of [[1, 16], [1, 24], [2, 18], [2, 24]]) {
        const bytes = compiledOnlyPages().map((value) => Buffer.from(value));
        bytes[page][offset] = 1;
        assert.throws(() => decodeCapabilityPages(bytes), (error) => error.code === "NONCANONICAL_RESPONSE", `page ${page} byte ${offset}`);
    }
    const inconsistent = compiledOnlyPages().map((page) => Buffer.from(page));
    inconsistent[2].writeUInt32LE(131041, 6);
    assert.throws(() => decodeCapabilityPages(inconsistent), /internally inconsistent/);
});

test("patterned capability vectors decode every semantic field exactly", () => {
    const identity = Buffer.alloc(25);
    identity.set([3, 3, 2, 7, 4, 9, 32, 20, 2], 0);
    identity.writeUInt32LE(0x00000003, 9);
    identity.writeUInt32LE(0x12345678, 13);
    identity.writeUInt32LE(0x89abcdef, 17);
    identity.writeUInt32LE(0x0badf00d, 21);
    const capacity = Buffer.alloc(25);
    capacity.set([12, 16, 100, 5, 96, 12, 16, 32, 58, 8, 120, 110, 3, 31, 32, 64], 0);
    const wide = Buffer.alloc(25);
    wide.writeUInt16LE(500, 0);
    wide.writeUInt32LE(0x00030000, 2);
    wide.writeUInt32LE(0x00012345, 6);
    wide.writeUInt32LE(0x0002fff0, 10);
    wide.writeUInt32LE(0x00010203, 14);
    assert.deepEqual(decodeCapabilityPages([identity, capacity, wide]), {
        responseVersion: 3,
        protocol: {major: 2, minor: 7},
        schema: {major: 4, minor: 9},
        reportSize: 32,
        candidateChunkMax: 20,
        statusPageCount: 2,
        featureFlags: 0x00000003,
        actionAbiDigest: 0x12345678,
        firmwareVersion: 0x89abcdef,
        compiledDefaultDigest: 0x0badf00d,
        compiledLayerCount: 12,
        maxLogicalLayers: 16,
        maxBehaviorRows: 100,
        maxTapStepsPerBehavior: 5,
        maxCombos: 96,
        maxKeysPerCombo: 12,
        maxReusableRgbGroups: 16,
        maxRgbStageGroupRows: 32,
        physicalLedCount: 58,
        ledBitmapSize: 8,
        customKeySlots: 120,
        macroSlots: 110,
        supportedDomainMask: 3,
        nameMaxBytes: 31,
        layerMaskBits: 32,
        placementPositions: 64,
        maxPopulatedBehaviorSteps: 500,
        profileSlotSize: 0x00030000,
        maxProfilePayload: 0x00012345,
        profileSlotPayload: 0x0002fff0,
        macroBytes: 0x00010203,
    });
});

test("status pages expose explicit compiled-only state", () => {
    const identity = Buffer.alloc(25);
    identity.set([1, 2, 0x81, 0], 0);
    const decoded = decodeStatusPages([identity, Buffer.alloc(25)]);
    assert.equal(decoded.stateFlags, 0x81);
    assert.equal(decoded.activeKind, 0);
    assert.equal(decoded.activeGeneration, 0);
    assert.equal(decoded.candidatePending, false);
    assert.equal(decoded.peerKnown, false);
    assert.equal(decoded.peerConverged, false);
    assert.equal(decoded.waitingSafeBoundary, false);
});

test("patterned status vectors decode every semantic field exactly", () => {
    const identity = Buffer.alloc(25);
    identity.set([1, 2], 0);
    identity.writeUInt16LE(0x007f, 2);
    identity.writeUInt32LE(0x01020304, 4);
    identity.writeUInt32LE(0x11121314, 8);
    identity.writeUInt32LE(0x21222324, 12);
    identity.writeUInt32LE(0x31323334, 16);
    identity.writeUInt32LE(0x41424344, 20);
    identity[24] = 2;
    const generation = Buffer.alloc(25);
    generation.writeUInt32LE(0x11223344, 0);
    generation[4] = 1;
    generation.writeUInt32LE(0x55667788, 5);
    generation[9] = 0;
    generation.writeUInt32LE(0x99aabbcc, 10);
    generation[14] = 1;
    generation.writeUInt16LE(0x1234, 15);
    generation.writeUInt16LE(0x5678, 17);
    generation.writeUInt16LE(0x9abc, 19);
    generation[21] = 0xde;
    generation[22] = 0xef;
    assert.deepEqual(decodeStatusPages([identity, generation]), {
        responseVersion: 1,
        stateFlags: 0x007f,
        sourceDigest: 0x01020304,
        compiledDefaultDigest: 0x11121314,
        activeDigest: 0x21222324,
        pendingDigest: 0x31323334,
        committedDigest: 0x41424344,
        activeKind: 2,
        activeGeneration: 0x11223344,
        activeOriginHalf: 1,
        committedGeneration: 0x55667788,
        committedOriginHalf: 0,
        peerGeneration: 0x99aabbcc,
        peerOriginHalf: 1,
        candidateTransactionId: 0x1234,
        lastCommittedTransactionId: 0x5678,
        conflictCount: 0x9abc,
        validationState: 0xde,
        lastError: 0xef,
        candidatePending: true,
        peerKnown: true,
        peerConverged: true,
        waitingSafeBoundary: true,
        peerCleanupPending: false,
        storedEarlierFormat: false,
    });
});

test("status says a slot holds a profile in an earlier store format (flag 9)", () => {
    assert.equal(PROFILE_STATE_FLAGS.STORED_EARLIER_FORMAT, 1 << 9);
    const identity = Buffer.alloc(25);
    identity.set([1, 2], 0);
    identity.writeUInt16LE(PROFILE_STATE_FLAGS.STORED_EARLIER_FORMAT | PROFILE_STATE_FLAGS.ACTIVE_IS_COMPILED_DEFAULT, 2);
    const decoded = decodeStatusPages([identity, Buffer.alloc(25)]);
    assert.equal(decoded.storedEarlierFormat, true);
    assert.equal(decoded.activeKind, 0);
    identity.writeUInt16LE(1 << 10, 2);
    assert.throws(() => decodeStatusPages([identity, Buffer.alloc(25)]), /unknown bits 0x400/);
});

test("status reports a cancelled save the peer never confirmed", () => {
    const identity = Buffer.alloc(25);
    identity.set([1, 2], 0);
    identity.writeUInt16LE(PROFILE_STATE_FLAGS.PEER_CLEANUP_PENDING | PROFILE_STATE_FLAGS.PEER_KNOWN, 2);
    const decoded = decodeStatusPages([identity, Buffer.alloc(25)]);
    assert.equal(decoded.peerCleanupPending, true);
    assert.equal(decoded.peerKnown, true);
    assert.equal(decoded.candidatePending, false);
});

test("decoders reject unknown masks, active kinds, and invalid ranges", () => {
    const capabilities = compiledOnlyPages();
    const unknownDomain = capabilities.map((page) => Buffer.from(page));
    unknownDomain[1][12] = 0x80;
    assert.throws(() => decodeCapabilityPages(unknownDomain), (error) => error.code === "INCOMPATIBLE_RESPONSE");
    const invalidChunk = capabilities.map((page) => Buffer.from(page));
    invalidChunk[0][7] = 21;
    assert.throws(() => decodeCapabilityPages(invalidChunk), /chunk capacity/);
    const layers = capabilities.map((page) => Buffer.from(page));
    layers[1][0] = 17;
    assert.throws(() => decodeCapabilityPages(layers), /logical-layer capacity/);
    const leds = capabilities.map((page) => Buffer.from(page));
    leds[1][9] = 7;
    assert.throws(() => decodeCapabilityPages(leds), /LED bitmap/);

    const statusIdentity = Buffer.alloc(25);
    statusIdentity.set([1, 2], 0);
    statusIdentity.writeUInt16LE(PROFILE_WIRE_KNOWN_MASKS.STATE_FLAGS + 1, 2);
    assert.throws(() => decodeStatusPages([statusIdentity, Buffer.alloc(25)]), (error) => error.code === "INCOMPATIBLE_RESPONSE");
    statusIdentity.writeUInt16LE(0, 2);
    statusIdentity[24] = 4;
    assert.throws(() => decodeStatusPages([statusIdentity, Buffer.alloc(25)]), /Unknown active profile kind/);
    statusIdentity[24] = 0;
    const invalidOrigin = Buffer.alloc(25);
    invalidOrigin[4] = 2;
    assert.throws(() => decodeStatusPages([statusIdentity, invalidOrigin]), /origin half/);
});

test("capability read alone reports the firmware identity, with no VIA command", async () => {
    const {fakeKeyboard} = require("../fixtures/fake-keyboard");
    const {document} = require("../fixtures/portable-profile");
    const keyboard = fakeKeyboard({document: document(), firmwareVersion: 0x89abcdef});
    let id = 0;
    const caps = await readProfileCapabilities({request: async report => keyboard.answer(report)[0]}, {nextRequestId: () => ++id});
    assert.equal(caps.firmwareVersion, 0x89abcdef);
    assert.deepEqual(keyboard.requests.map(r => [r[0], r[1], r[2]]), [[8, 0, 1], [8, 0, 1], [8, 0, 1]]);
});

test("decoder rejects error, noncanonical, and mismatched responses", () => {
    const request = buildProfileGetRequest(1, 0, 0x41);
    assert.throws(() => decodeProfileResponse(response(request, Buffer.alloc(0), 1), request), (error) => error.code === "DEVICE_REJECTED" && error.status === 1);

    const noncanonical = response(request, Buffer.alloc(24));
    noncanonical[31] = 1;
    assert.throws(() => decodeProfileResponse(noncanonical, request), (error) => error.code === "NONCANONICAL_RESPONSE");

    const mismatched = response(request, Buffer.alloc(25));
    mismatched[4] = 1;
    assert.throws(() => decodeProfileResponse(mismatched, request), (error) => error.code === "CORRELATION_MISMATCH");
});

test("capability reads serialize through the transport connection", async () => {
    const pages = compiledOnlyPages();
    const requests = [];
    const connection = {
        async request(request, options) {
            requests.push(Buffer.from(request));
            assert.equal(options.matchResponse(response(request, pages[request[4]]), request), true);
            return response(request, pages[request[4]]);
        },
    };
    const decoded = await readProfileCapabilities(connection, {requestId: 0xfe});
    assert.deepEqual(requests.map((request) => request[4]), [0, 1, 2]);
    assert.equal(new Set(requests.map((request) => request[3])).size, 3, "each page has its own request id");
    assert.equal(decoded.maxProfilePayload, 100000);
});

test("what current firmware reports is one set of masks", () => {
    const {CURRENT_MUTATION_FEATURES, CURRENT_PAIR_FEATURES} = PROFILE_WIRE_KNOWN_MASKS;
    // Apply needs a split build that saves; the pair also has pointing.
    assert.equal(CURRENT_MUTATION_FEATURES, PROFILE_WIRE_FEATURES.SPLIT_KEYBOARD | PROFILE_WIRE_FEATURES.SAVES);
    assert.equal(CURRENT_PAIR_FEATURES, PROFILE_WIRE_KNOWN_MASKS.FEATURE_FLAGS);
    assert.equal("CURRENT_FEATURES" in PROFILE_WIRE_KNOWN_MASKS, false, "reading needs no bit: the version says it");
    assert.equal(decodeCapabilityPages(compiledOnlyPages()).featureFlags, CURRENT_PAIR_FEATURES);
});
