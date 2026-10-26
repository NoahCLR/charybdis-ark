"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {encodeProfileBlob, PROFILE_DOMAIN_IDS} = require("../../core/schema/profile-blob-v1");
const {
    CANDIDATE_ADMISSION,
    CANDIDATE_ERROR,
    CANDIDATE_OPERATION,
    CANDIDATE_STATE,
    CandidateRequestIdSequence,
    CandidateTransactionIdSequence,
    buildCandidateAbortRequest,
    buildCandidateBeginRequest,
    buildCandidateChunkRequest,
    buildCandidateReuseRequest,
    buildCandidateCommitRequest,
    buildCandidateStatusRequest,
    buildCandidateValidateRequest,
    candidateMetadataForBlob,
    candidateMutationResponseMatcher,
    decodeCandidateAcknowledgement,
    decodeCandidateErrorResponse,
    decodeCandidateStatusResponse,
    readCandidateStatus,
} = require("../../core/protocol/profile-candidate-v1");

function goldenFixtures() {
    const fixturePath = path.resolve(__dirname, "../../upstream/firmware/tests/fixtures/profile_candidate_v1.fixture");
    const entries = {};
    for (const line of fs.readFileSync(fixturePath, "utf8").split(/\r?\n/)) {
        if (!line || line.startsWith("#")) continue;
        const [name, hex] = line.split("=");
        entries[name] = Buffer.from(hex, "hex");
    }
    return entries;
}

test("reuse bounds and source identities are canonical before encoding", () => {
    const source = {kind: 1, origin: 0, generation: 7, digest: 123, crc32: 456};
    const range = {offset: 20, sourceOffset: 40, length: 1024, source};
    const request = buildCandidateReuseRequest(0x1234, range);
    assert.equal(request[2], 0x1b);
    // Profile Wire 2: destination, source and length are 32 bits each.
    assert.equal(request.readUInt32LE(5), 20);
    assert.equal(request.readUInt32LE(9), 40);
    assert.equal(request.readUInt32LE(13), 1024);
    assert.equal(request.readUInt32LE(17), 7);
    assert.equal(request.readUInt32LE(21), 123);
    assert.equal(request.readUInt32LE(25), 456);
    assert.equal(request[31], 0);
    for (const invalid of [{length: 0}, {length: 1025}, {offset: 130048 - 1023}, {sourceOffset: 130048 - 1023}, {offset: 0x20000},
        {source: {...source, generation: 0}}, {source: {...source, origin: 2}}, {source: {...source, kind: 2}},
        {source: {...source, kind: 0, origin: 255}}]) {
        assert.throws(() => buildCandidateReuseRequest(0x1234, {...range, ...invalid}), RangeError);
    }
    const compiled = buildCandidateReuseRequest(0x1234, {...range, source: {...source, kind: 0, origin: 255, generation: 0}});
    assert.equal(compiled[29], 0); assert.equal(compiled[30], 255);
});

test("JavaScript emits the exact candidate frames consumed by the firmware fixture", () => {
    assert.equal(CANDIDATE_ERROR.TIMEOUT, 19);
    assert.equal(CANDIDATE_ERROR.PEER_SUPERSEDED, 20);
    assert.equal(CANDIDATE_ERROR.PEER_PREPARE_YIELDED, 21);
    assert.equal(CANDIDATE_ERROR.POSTCOMMIT_AUTHORITY_LOST, 22);
    assert.equal(CANDIDATE_ERROR.PEER_COMMIT_CONFLICT, 23);
    assert.equal(CANDIDATE_ERROR.PEER_TRANSFER_FAILED, 24);
    assert.equal(CANDIDATE_STATE.PREPARING_PEER, 8);
    assert.equal(CANDIDATE_STATE.CONVERGING_PEER, 9);
    const fixtures = goldenFixtures();
    const metadata = {
        schemaMajor: 4,
        schemaMinor: 1,
        requestedDomains: 3,
        flags: 0,
        payloadLength: 8,
        crc32: 0x11223344,
        digest: 0x88776655,
        actionAbiDigest: 0xccbbaa99,
        storeFormatVersion: 6,
    };
    assert.deepEqual(buildCandidateBeginRequest(0x1234, metadata), fixtures["begin-request"]);
    assert.deepEqual(
        buildCandidateChunkRequest(0x1234, 0, Buffer.from("4e4c503104010001", "hex")),
        fixtures["chunk-request"]
    );
    assert.deepEqual(buildCandidateValidateRequest(0x1234), fixtures["validate-request"]);
    assert.deepEqual(buildCandidateCommitRequest(0x1234), fixtures["commit-request"]);
    assert.deepEqual(buildCandidateAbortRequest(0x1234), fixtures["abort-request"]);
    assert.deepEqual(buildCandidateStatusRequest(0x41), fixtures["operation-status-request"]);
    for (const report of [
        buildCandidateBeginRequest(0x1234, metadata),
        buildCandidateChunkRequest(0x1234, 0, Buffer.alloc(20)),
        buildCandidateValidateRequest(0x1234),
        buildCandidateCommitRequest(0x1234),
        buildCandidateAbortRequest(0x1234),
        buildCandidateStatusRequest(0x41),
    ]) {
        assert.equal(report.length, 32);
    }
});

test("commit uses custom-save framing and the shared acknowledgement contract", () => {
    const fixtures = goldenFixtures();
    const request = buildCandidateCommitRequest(0x1234);
    assert.equal(request[0], 0x09);
    assert.equal(request[2], 0x13);
    assert.deepEqual(request, fixtures["commit-request"]);
    assert.deepEqual(decodeCandidateAcknowledgement(fixtures["commit-queued-ack"], request), {
        admission: CANDIDATE_ADMISSION.QUEUED,
        admissionName: "QUEUED",
        errorId: CANDIDATE_ERROR.NONE,
        errorName: "NONE",
        frameOffset: 0xff,
        transactionId: 0x1234,
        valueId: 0x13,
    });
});

test("mutation acknowledgment correlation includes operation and both transaction bytes", () => {
    const fixtures = goldenFixtures();
    const request = fixtures["begin-request"];
    const queued = decodeCandidateAcknowledgement(fixtures["begin-queued-ack"], request);
    assert.deepEqual(queued, {
        admission: CANDIDATE_ADMISSION.QUEUED,
        admissionName: "QUEUED",
        errorId: CANDIDATE_ERROR.NONE,
        errorName: "NONE",
        frameOffset: 0xff,
        transactionId: 0x1234,
        valueId: 0x10,
    });
    const malformed = decodeCandidateAcknowledgement(fixtures["begin-malformed-ack"], request);
    assert.equal(malformed.admission, CANDIDATE_ADMISSION.MALFORMED);
    assert.equal(malformed.errorId, CANDIDATE_ERROR.MALFORMED_FRAME);
    assert.equal(malformed.frameOffset, 8);

    for (const offset of [2, 3, 4]) {
        const mismatch = Buffer.from(fixtures["begin-queued-ack"]);
        mismatch[offset] ^= 1;
        assert.equal(candidateMutationResponseMatcher(mismatch, request), false);
        assert.throws(
            () => decodeCandidateAcknowledgement(mismatch, request),
            (error) => error.code === "CORRELATION_MISMATCH"
        );
    }
});

test("candidate status uses normal request correlation and decodes structured locations", async () => {
    const fixtures = goldenFixtures();
    const request = fixtures["operation-status-request"];
    assert.deepEqual(decodeCandidateStatusResponse(fixtures["operation-status-response"], request), {
        layoutVersion: 2,
        state: CANDIDATE_STATE.REJECTED,
        lastOperation: CANDIDATE_OPERATION.VALIDATE,
        flags: 3,
        mailboxPending: true,
        poisoned: true,
        transactionId: 0x1234,
        nextOffset: 8,
        payloadLength: 8,
        digest: 0x88776655,
        // Page 0 names the error; where it is comes from page 3.
        error: {
            id: CANDIDATE_ERROR.VALIDATION_REJECTED,
            name: "VALIDATION_REJECTED",
            domainId: 0xff,
            tableId: 0xff,
            rowIndex: 0xffff,
            tapIndex: 0xff,
            fieldId: 0xff,
            byteOffset: 0xffffffff,
        },
        operationSequence: 0x3344,
        errorSequence: 0x6677,
    });
    const errorRequest = buildCandidateStatusRequest(0x41, 3);
    assert.deepEqual(decodeCandidateErrorResponse(fixtures["operation-error-response"], errorRequest), {
        id: CANDIDATE_ERROR.VALIDATION_REJECTED,
        name: "VALIDATION_REJECTED",
        domainId: 0x20,
        tableId: 2,
        rowIndex: 5,
        tapIndex: 3,
        fieldId: 4,
        // A 32-bit offset, past what a 16-bit one could say.
        byteOffset: 0x11122,
        transactionId: 0x1234,
        operationSequence: 0x3344,
        errorSequence: 0x6677,
    });

    const pages = [];
    const connection = {
        async request(actual, options) {
            pages.push(actual[4]);
            assert.deepEqual(actual, actual[4] === 3 ? errorRequest : request);
            const response = fixtures[actual[4] === 3 ? "operation-error-response" : "operation-status-response"];
            assert.equal(options.matchResponse(response, actual), true);
            return response;
        },
    };
    const joined = await readCandidateStatus(connection, {requestId: 0x41});
    assert.deepEqual(pages, [0, 3]);
    assert.equal(joined.transactionId, 0x1234);
    assert.deepEqual(joined.error, {id: CANDIDATE_ERROR.VALIDATION_REJECTED, name: "VALIDATION_REJECTED",
        domainId: 0x20, tableId: 2, rowIndex: 5, tapIndex: 3, fieldId: 4, byteOffset: 0x11122});

    const commit = decodeCandidateStatusResponse(fixtures["commit-status-response"], request);
    assert.equal(commit.state, CANDIDATE_STATE.ACTIVATING);
    assert.equal(commit.lastOperation, CANDIDATE_OPERATION.COMMIT);
    assert.equal(commit.transactionId, 0x1234);
    assert.equal(commit.digest, 0x88776655);
    assert.equal(commit.error.id, CANDIDATE_ERROR.NONE);
    assert.equal(commit.operationSequence, 0x3345);
});

test("an error page is kept only when it belongs to the page 0 it follows", async () => {
    const fixtures = goldenFixtures();
    // The error moved between the reads: page 3's error sequence is newer.
    const moved = Buffer.from(fixtures["operation-error-response"]);
    moved.writeUInt16LE(0x6678, 7 + 16);
    const otherOperation = Buffer.from(fixtures["operation-error-response"]);
    otherOperation.writeUInt16LE(0x3345, 7 + 14);
    for (const [name, stale] of [["error sequence", moved], ["operation sequence", otherOperation]]) {
        const pages = [];
        let errorReads = 0;
        const connection = {async request(actual) {
            pages.push(actual[4]);
            if (actual[4] !== 3) return fixtures["operation-status-response"];
            // The second error read belongs to page 0 again.
            return errorReads++ === 0 ? stale : fixtures["operation-error-response"];
        }};
        const status = await readCandidateStatus(connection, {requestId: 0x41});
        assert.deepEqual(pages, [0, 3, 0, 3], `${name}: page 0 is read again`);
        assert.equal(status.error.byteOffset, 0x11122);
    }
    // An error that never settles keeps page 0's id and an unknown location.
    let reads = 0;
    const restless = {async request(actual) {
        reads++;
        if (actual[4] !== 3) return fixtures["operation-status-response"];
        return moved;
    }};
    const unsettled = await readCandidateStatus(restless, {requestId: 0x41});
    assert.equal(reads, 6);
    assert.equal(unsettled.error.id, CANDIDATE_ERROR.VALIDATION_REJECTED);
    assert.equal(unsettled.error.byteOffset, 0xffffffff);
    // A status with no error never asks for page 3.
    const asked = [];
    const quiet = {async request(actual) { asked.push(actual[4]); return fixtures["commit-status-response"]; }};
    await readCandidateStatus(quiet, {requestId: 0x41});
    assert.deepEqual(asked, [0]);
    // Page 3 without an error must carry every sentinel.
    const none = Buffer.from(fixtures["operation-error-response"]);
    none[7 + 1] = 0;
    assert.throws(() => decodeCandidateErrorResponse(none, buildCandidateStatusRequest(0x41, 3)), /sentinels/);
    assert.throws(() => buildCandidateStatusRequest(0x41, 1), /page 0 or the error page/);
});

test("candidate codecs reject noncanonical padding, invalid bounds, and unknown status values", () => {
    const fixtures = goldenFixtures();
    assert.throws(() => buildCandidateChunkRequest(1, 0, Buffer.alloc(0)), /1 through 20/);
    assert.throws(() => buildCandidateChunkRequest(1, 130032, Buffer.alloc(20)), /end at or before/);
    assert.equal(buildCandidateChunkRequest(1, 130028, Buffer.alloc(20)).readUInt32LE(5), 130028, "the last chunk of a full slot");
    assert.equal(buildCandidateChunkRequest(1, 130028, Buffer.alloc(20))[9], 20);
    assert.throws(() => buildCandidateAbortRequest(0), /nonzero/);

    const badAck = Buffer.from(fixtures["begin-queued-ack"]);
    badAck[31] = 1;
    assert.throws(() => decodeCandidateAcknowledgement(badAck, fixtures["begin-request"]), (error) => error.code === "NONCANONICAL_RESPONSE");
    const badQueued = Buffer.from(fixtures["begin-queued-ack"]);
    badQueued[7] = 0;
    assert.throws(() => decodeCandidateAcknowledgement(badQueued, fixtures["begin-request"]), /queued acknowledgment/);

    const reserved = Buffer.from(fixtures["operation-status-response"]);
    reserved[7 + 23] = 1;
    assert.throws(() => decodeCandidateStatusResponse(reserved, fixtures["operation-status-request"]), /reserved/);
    const layout1 = Buffer.from(fixtures["operation-status-response"]);
    layout1[7] = 1;
    assert.throws(() => decodeCandidateStatusResponse(layout1, fixtures["operation-status-request"]), /layout 1/);

    const badStatus = Buffer.from(fixtures["operation-status-response"]);
    badStatus[8] = 11;
    assert.throws(() => decodeCandidateStatusResponse(badStatus, fixtures["operation-status-request"]), /Unknown candidate state/);

    const preparing = Buffer.from(fixtures["commit-status-response"]);
    preparing[8] = CANDIDATE_STATE.PREPARING_PEER;
    assert.equal(decodeCandidateStatusResponse(preparing, fixtures["operation-status-request"]).state, CANDIDATE_STATE.PREPARING_PEER);
    const converging = Buffer.from(preparing);
    converging[8] = CANDIDATE_STATE.CONVERGING_PEER;
    assert.equal(decodeCandidateStatusResponse(converging, fixtures["operation-status-request"]).state, CANDIDATE_STATE.CONVERGING_PEER);
    const failed = Buffer.from(preparing);
    failed[8] = CANDIDATE_STATE.AUTHORITY_FAILED;
    assert.equal(decodeCandidateStatusResponse(failed, fixtures["operation-status-request"]).state, CANDIDATE_STATE.AUTHORITY_FAILED);
});

const SCHEMA_4 = {major: 4, minor: 1};

test("metadata is derived from the canonical blob and its exact domain mask", () => {
    const blob = encodeProfileBlob({
        schema: SCHEMA_4,
        domains: [{id: PROFILE_DOMAIN_IDS.RGB, version: 4, payload: Buffer.alloc(3)}],
    });
    const metadata = candidateMetadataForBlob(blob, {actionAbiDigest: 0x12345678});
    assert.equal(metadata.schemaMajor, 4);
    assert.equal(metadata.schemaMinor, 1);
    assert.equal(metadata.requestedDomains, 1);
    assert.equal(metadata.payloadLength, blob.length);
    assert.equal(metadata.actionAbiDigest, 0x12345678);
    assert.equal(metadata.storeFormatVersion, 6);
    assert.notEqual(metadata.crc32, metadata.digest);
    assert.throws(
        () => candidateMetadataForBlob(blob, {actionAbiDigest: 1, requestedDomains: 2}),
        (error) => error.code === "DOMAIN_MASK_MISMATCH"
    );
});

test("every candidate begin carries a 32-bit length and zero reserved bytes", () => {
    const blob = encodeProfileBlob({schema: SCHEMA_4, domains: []});
    const metadata = candidateMetadataForBlob(blob, {actionAbiDigest: 0x12345678});
    const report = buildCandidateBeginRequest(0x4321, metadata);
    assert.deepEqual([report[5], report[6]], [4, 1]);
    assert.equal(report.readUInt32LE(8), blob.length);
    assert.equal(report.readUInt32LE(20), 0x12345678);
    assert.equal(report.readUInt32LE(24), 0);
    assert.equal(report.readUInt32LE(28), 0);
});

test("candidate identity comes entirely from the blob and action vocabulary", () => {
    const blob = encodeProfileBlob({schema: SCHEMA_4, domains: []});
    const metadata = candidateMetadataForBlob(blob, {actionAbiDigest: 1});
    assert.equal(metadata.payloadLength, blob.length);
    assert.equal(metadata.digest, require("../../core/schema/profile-blob-v1").fnv1a32(blob));
    assert.ok(buildCandidateBeginRequest(1, metadata).subarray(24).every(byte => byte === 0));
    assert.throws(() => candidateMetadataForBlob(blob, {}), /Action-ABI digest/);
});

test("every store format but current firmware's 6 is refused, the custom-only format 0 included", () => {
    const blob = encodeProfileBlob({schema: SCHEMA_4, domains: []});
    const metadata = candidateMetadataForBlob(blob, {actionAbiDigest: 1});
    for (const storeFormatVersion of [0, 1, 2, 3, 4, 5, 7]) {
        assert.throws(() => buildCandidateBeginRequest(1, {...metadata, storeFormatVersion}), /store format/);
    }
    // Profile Wire 2 implies the format, so leaving it out means format 6.
    assert.deepEqual(buildCandidateBeginRequest(1, {...metadata, storeFormatVersion: undefined}), buildCandidateBeginRequest(1, metadata));
    // Format 0 carried no binding; dropping it as well changes nothing.
    assert.throws(() => buildCandidateBeginRequest(1, {...metadata, storeFormatVersion: 0}), /store format/);
});

test("only schema 4.1 candidates are built, up to the 130,048-byte payload", () => {
    const schema1 = Buffer.from("4e4c503101000001", "hex");
    assert.throws(() => candidateMetadataForBlob(schema1, {actionAbiDigest: 1}), (error) => error.code === "INCOMPATIBLE_SCHEMA");
    const metadata = candidateMetadataForBlob(encodeProfileBlob({schema: SCHEMA_4, domains: []}), {actionAbiDigest: 1});
    assert.throws(() => buildCandidateBeginRequest(1, {...metadata, schemaMajor: 1}), (error) => error.code === "INCOMPATIBLE_SCHEMA");
    for (const schemaMinor of [0, 2]) assert.throws(() => buildCandidateBeginRequest(1, {...metadata, schemaMinor}), (error) => error.code === "INCOMPATIBLE_SCHEMA");
    assert.throws(() => candidateMetadataForBlob(Buffer.from("4e4c503104000001", "hex"), {actionAbiDigest: 1}), (error) => error.code === "INCOMPATIBLE_SCHEMA", "schema 4.0");
    assert.throws(() => candidateMetadataForBlob(Buffer.from("4e4c503102000001", "hex"), {actionAbiDigest: 1}), (error) => error.code === "INCOMPATIBLE_SCHEMA");
    assert.throws(() => candidateMetadataForBlob(Buffer.from("4e4c503103000001", "hex"), {actionAbiDigest: 1}), (error) => error.code === "INCOMPATIBLE_SCHEMA");
    assert.throws(() => buildCandidateBeginRequest(1, {...metadata, schemaMajor: 3}), (error) => error.code === "INCOMPATIBLE_SCHEMA");
    assert.equal(buildCandidateBeginRequest(1, {...metadata, payloadLength: 130048}).readUInt32LE(8), 130048);
    // A length whose low 16 bits are in range but whose high bytes are not.
    assert.throws(() => buildCandidateBeginRequest(1, {...metadata, payloadLength: 0x20000 + 8}), /payload length/);
    assert.throws(() => buildCandidateBeginRequest(1, {...metadata, payloadLength: 130049}), /payload length/);
});

test("request and transaction id allocators wrap without emitting zero", () => {
    const requests = new CandidateRequestIdSequence(0xfe);
    const transactions = new CandidateTransactionIdSequence(0xfffe);
    assert.deepEqual([requests.next(), requests.next(), requests.next()], [0xfe, 0xff, 1]);
    assert.deepEqual([transactions.next(), transactions.next(), transactions.next()], [0xfffe, 0xffff, 1]);
    assert.throws(() => new CandidateRequestIdSequence(0), /nonzero/);
    assert.throws(() => new CandidateTransactionIdSequence(0), /nonzero/);
});

// Candidate status page 1, mirroring noah_profile_candidate_v1_handle_peer_status_get.
const {CANDIDATE_PEER_PHASE, buildCandidateSlaveStatusRequest, readCandidateSlaveStatus} = require("../../core/protocol/profile-candidate-v1");
function slaveResponse(request, {status = 0, payload = null} = {}) {
    const response = Buffer.from(request);
    response.fill(0, 5);
    response[5] = status;
    if (payload) {
        response[6] = payload.length;
        payload.copy(response, 7);
    }
    return response;
}
function slavePayload() {
    const payload = Buffer.alloc(25);
    payload[0] = 2;
    payload[1] = CANDIDATE_PEER_PHASE.SENDING;
    payload[2] = 6;
    payload[3] = 0x03;
    payload.writeUInt32LE(40, 4);
    payload.writeUInt32LE(0x10078, 8);
    payload.writeUInt32LE(7, 12);
    payload.writeUInt32LE(2, 16);
    return payload;
}
test("candidate status page 1 reports the copy to the slave half", async () => {
    let ids = 0x50;
    const reply = (options) => ({async request(actual) { return slaveResponse(actual, options); }});
    const slave = await readCandidateSlaveStatus(reply({payload: slavePayload()}), {nextRequestId: () => ids++});
    assert.deepEqual(slave, {phase: CANDIDATE_PEER_PHASE.SENDING, phaseName: "SENDING", lastStatus: 6, lastStatusName: "BUSY",
        cleanupPending: true, master: true, waitingSafeBoundary: false, transferOffset: 40, transferLength: 0x10078, retryCount: 7, transportFailureCount: 2,
        busyStreak: 0, busyReason: "UNSPECIFIED", busyStoreState: "UNINITIALIZED", busyOwner: "NONE", busyAdmission: "NONE"});
    assert.equal(buildCandidateSlaveStatusRequest(0x51)[4], 1, "page 1");
    // Why the slave half keeps saying BUSY: a stale earlier copy it is still receiving.
    // Layout 2 packs the transfer owner (low nibble) and admission (high).
    const busy = slavePayload(); busy.writeUInt16LE(300, 20); busy[22] = 3; busy[23] = 2; busy[24] = 0x21;
    assert.deepEqual(await readCandidateSlaveStatus(reply({payload: busy}), {nextRequestId: () => ids++}).then(({busyStreak, busyReason, busyStoreState, busyOwner, busyAdmission}) => ({busyStreak, busyReason, busyStoreState, busyOwner, busyAdmission})),
        {busyStreak: 300, busyReason: "OTHER_COPY", busyStoreState: "RECEIVING", busyOwner: "REMOTE_PUSH", busyAdmission: "PEER"});
    // The copy is ready and the decision waits for this half to go idle.
    const waiting = slavePayload(); waiting[3] = 0x06;
    assert.equal((await readCandidateSlaveStatus(reply({payload: waiting}), {nextRequestId: () => ids++})).waitingSafeBoundary, true);

    await assert.rejects(readCandidateSlaveStatus(reply({status: 2}), {nextRequestId: () => ids++}), {code: "DEVICE_REJECTED"}, "a refused page is an error");

    for (const [offset, value, pattern] of [[0, 1, /layout/], [1, 10, /phase/], [2, 11, /slave-half status/], [3, 0x08, /flag/], [22, 8, /busy detail/], [23, 10, /busy detail/], [24, 0x03, /busy detail/], [24, 0x30, /busy detail/]]) {
        const payload = slavePayload();
        payload[offset] = value;
        await assert.rejects(readCandidateSlaveStatus(reply({payload}), {nextRequestId: () => ids++}), pattern);
    }
});

test("a candidate fits the capacity the keyboard reports", () => {
    const blob = encodeProfileBlob({schema: SCHEMA_4, domains: []});
    assert.equal(candidateMetadataForBlob(blob, {actionAbiDigest: 1, capabilities: {maxProfilePayload: blob.length}}).payloadLength, blob.length);
    assert.throws(() => candidateMetadataForBlob(blob, {actionAbiDigest: 1, capabilities: {maxProfilePayload: blob.length - 1}}), /capacity/);
});
