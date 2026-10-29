// @ts-check
"use strict";
const {u8: assertU8, u16: assertU16, u32: assertU32, asBytes, protocolError, zeroRange} = require("../schema/bytes");

const {profileDomain, PROFILE_DOMAIN_MASK} = require("../schema/profile-domains");
const {requestHandled} = require("./raw-hid-unhandled");
const {RAW_HID_REPORT_SIZE, normalizeRawHidReport} = require("../transport/device-adapter");
const {PROFILE_BLOB_V1, crc32, decodeProfileBlob, fnv1a32} = require("../schema/profile-blob-v1");
const {
    PROFILE_WIRE_V1,
    buildProfileGetRequest,
    decodeProfileResponse,
    profileResponseMatcher,
} = require("./profile-wire-v1");

const PROFILE_CANDIDATE_V1 = Object.freeze({
    COMMAND_SET: 0x07,
    COMMAND_SAVE: 0x09,
    CHANNEL: PROFILE_WIRE_V1.CHANNEL,
    VALUE_BEGIN: 0x10,
    VALUE_CHUNK: 0x11,
    VALUE_VALIDATE: 0x12,
    VALUE_COMMIT: 0x13,
    VALUE_ABORT: 0x14,
    VALUE_STATUS: 0x18,
    CHUNK_MAX: 20,
    REUSE_MAX: 1024,
    VALUE_REUSE: 0x1b,
    VALUE_STREAM_CHUNK: 0x1c,
    MIN_BLOB_SIZE: PROFILE_BLOB_V1.HEADER_SIZE,
    // A 128 KiB flash slot less its 1 KiB record (firmware D-F29). Lengths and
    // offsets on the wire are 32 bits (Profile Wire 2, firmware D-F28); this
    // is the slot's ceiling, not the frame's.
    MAX_BLOB_SIZE: PROFILE_BLOB_V1.MAX_SIZE,
    // Status page 0 (layout 2) is the candidate's progress, page 3 (layout 1)
    // where its error is; pages 1 and 2 (layout 2) the copy to the slave half.
    STATUS_LAYOUT_VERSION: 2,
    ERROR_PAGE: 3,
    ERROR_LAYOUT_VERSION: 1,
    PEER_STATUS_LAYOUT_VERSION: 2,
    STATUS_PAYLOAD_SIZE: 25,
    // Store format 6, the one current firmware writes. Profile Wire 2 implies
    // it, so BEGIN no longer carries it; bytes 24–31 stay zero.
    STORE_FORMAT: 6,
    SCHEMA_MAJOR: 4,
    SCHEMA_MINOR: 3,
    KNOWN_DOMAIN_MASK: PROFILE_DOMAIN_MASK,
});

const CANDIDATE_ADMISSION = Object.freeze({
    QUEUED: 0,
    MALFORMED: 1,
    BUSY: 2,
    UNSUPPORTED: 3,
    REJECTED: 4,
});

const CANDIDATE_STATE = Object.freeze({
    IDLE: 0,
    RECEIVING: 1,
    COMPLETE: 2,
    VALIDATING: 3,
    VALIDATED: 4,
    REJECTED: 5,
    COMMITTING: 6,
    ACTIVATING: 7,
    PREPARING_PEER: 8,
    CONVERGING_PEER: 9,
    AUTHORITY_FAILED: 10,
});

const CANDIDATE_STATE_NAMES = Object.freeze(Object.fromEntries(
    Object.entries(CANDIDATE_STATE).map(([name, value]) => [value, name])
));

const CANDIDATE_OPERATION = Object.freeze({
    NONE: 0,
    BEGIN: 1,
    CHUNK: 2,
    VALIDATE: 3,
    ABORT: 4,
    COMMIT: 5,
    REUSE: 6,
});

const CANDIDATE_STATUS_FLAGS = Object.freeze({
    MAILBOX_PENDING: 1 << 0,
    POISONED: 1 << 1,
    KNOWN_MASK: (1 << 0) | (1 << 1),
});

const CANDIDATE_ERROR = Object.freeze({
    NONE: 0,
    MALFORMED_FRAME: 1,
    MAILBOX_BUSY: 2,
    INVALID_TRANSACTION: 3,
    WRONG_TRANSACTION: 4,
    INVALID_STATE: 5,
    INCOMPATIBLE_SCHEMA: 6,
    UNSUPPORTED_DOMAIN: 7,
    INCOMPATIBLE_ACTION_ABI: 8,
    CAPACITY_EXCEEDED: 9,
    OUT_OF_ORDER: 10,
    CONFLICTING_RETRY: 11,
    CHECKSUM_MISMATCH: 12,
    STORAGE_FAILURE: 13,
    VALIDATION_REJECTED: 14,
    UNSUPPORTED_OPERATION: 15,
    POISONED: 16,
    ACTIVATION_FAILED: 17,
    DURABILITY_UNKNOWN: 18,
    TIMEOUT: 19,
    PEER_SUPERSEDED: 20,
    PEER_PREPARE_YIELDED: 21,
    POSTCOMMIT_AUTHORITY_LOST: 22,
    PEER_COMMIT_CONFLICT: 23,
    PEER_TRANSFER_FAILED: 24,
});

const CANDIDATE_ERROR_NAMES = Object.freeze(Object.fromEntries(
    Object.entries(CANDIDATE_ERROR).map(([name, value]) => [value, name])
));

const CANDIDATE_ADMISSION_NAMES = Object.freeze(Object.fromEntries(
    Object.entries(CANDIDATE_ADMISSION).map(([name, value]) => [value, name])
));

const ProfileCandidateProtocolError = protocolError("ProfileCandidateProtocolError", "answer");

class CandidateTransactionIdSequence {
    /** @param {number} [start] */
    constructor(start = 1) {
        this.value = assertU16(start, "Candidate transaction id", {nonzero: true});
    }

    next() {
        const current = this.value;
        this.value = current === 0xffff ? 1 : current + 1;
        return current;
    }
}

class CandidateRequestIdSequence {
    /** @param {number} [start] */
    constructor(start = 1) {
        this.value = assertU8(start, "Candidate status request id", {nonzero: true});
    }

    next() {
        const current = this.value;
        this.value = current === 0xff ? 1 : current + 1;
        return current;
    }
}

/** @param {number} transactionId @param {import("./types.js").CandidateMetadataInput} metadata */
function buildCandidateBeginRequest(transactionId, metadata) {
    const normalizedTransactionId = assertU16(transactionId, "Candidate transaction id", {nonzero: true});
    const normalized = normalizeCandidateMetadata(metadata);
    const report = buildMutationHeader(PROFILE_CANDIDATE_V1.VALUE_BEGIN, normalizedTransactionId);
    // Profile Wire 2 dropped the always-zero flags byte and the store format
    // (implied by the version) to make room for a 32-bit length.
    report[5] = normalized.schemaMajor;
    report[6] = normalized.schemaMinor;
    report[7] = normalized.requestedDomains;
    report.writeUInt32LE(normalized.payloadLength, 8);
    report.writeUInt32LE(normalized.crc32, 12);
    report.writeUInt32LE(normalized.digest, 16);
    report.writeUInt32LE(normalized.actionAbiDigest, 20);
    return report;
}

/** @param {number} transactionId @param {number} offset @param {Uint8Array} value */
function buildCandidateChunkRequest(transactionId, offset, value) {
    const normalizedTransactionId = assertU16(transactionId, "Candidate transaction id", {nonzero: true});
    const normalizedOffset = assertU32(offset, "Candidate chunk offset");
    const bytes = asBytes(value, "Candidate chunk");
    if (bytes.length < 1 || bytes.length > PROFILE_CANDIDATE_V1.CHUNK_MAX) {
        throw new RangeError(`Candidate chunk must contain 1 through ${PROFILE_CANDIDATE_V1.CHUNK_MAX} bytes.`);
    }
    if (normalizedOffset >= PROFILE_CANDIDATE_V1.MAX_BLOB_SIZE || normalizedOffset + bytes.length > PROFILE_CANDIDATE_V1.MAX_BLOB_SIZE) {
        throw new RangeError(`Candidate chunk must end at or before byte ${PROFILE_CANDIDATE_V1.MAX_BLOB_SIZE}.`);
    }
    const report = buildMutationHeader(PROFILE_CANDIDATE_V1.VALUE_CHUNK, normalizedTransactionId);
    report.writeUInt32LE(normalizedOffset, 5);
    report[9] = bytes.length;
    bytes.copy(report, 10);
    return report;
}

/** @param {number} transactionId @param {{offset: number, sourceOffset: number, length: number, source: import("./types.js").ReuseSource}} range */
function buildCandidateReuseRequest(transactionId, {offset, sourceOffset, length, source}) {
    const report = buildMutationHeader(PROFILE_CANDIDATE_V1.VALUE_REUSE, assertU16(transactionId, "Candidate transaction id", {nonzero: true}));
    offset = assertU32(offset, "Reuse destination offset");
    sourceOffset = assertU32(sourceOffset, "Reuse source offset");
    length = assertU32(length, "Reuse length", {nonzero: true});
    if (length > PROFILE_CANDIDATE_V1.REUSE_MAX || offset + length > PROFILE_CANDIDATE_V1.MAX_BLOB_SIZE || sourceOffset + length > PROFILE_CANDIDATE_V1.MAX_BLOB_SIZE) throw new RangeError("Reuse range exceeds the candidate bounds.");
    const kind = assertU8(source.kind, "Reuse source kind"), origin = assertU8(source.origin, "Reuse source origin");
    const generation = assertU32(source.generation, "Reuse source generation");
    if ((kind === 0 && (origin !== 255 || generation !== 0)) || (kind === 1 && (origin > 1 || generation === 0)) || kind > 1) throw new RangeError("Reuse source must identify compiled defaults or a committed generation.");
    report.writeUInt32LE(offset, 5); report.writeUInt32LE(sourceOffset, 9); report.writeUInt32LE(length, 13);
    report.writeUInt32LE(generation, 17); report.writeUInt32LE(assertU32(source.digest, "Reuse source digest"), 21);
    report.writeUInt32LE(assertU32(source.crc32, "Reuse source CRC32"), 25); report[29] = kind; report[30] = origin;
    return report;
}

/** @param {number} transactionId */
function buildCandidateValidateRequest(transactionId) {
    return buildMutationHeader(
        PROFILE_CANDIDATE_V1.VALUE_VALIDATE,
        assertU16(transactionId, "Candidate transaction id", {nonzero: true})
    );
}

/** @param {number} transactionId */
function buildCandidateCommitRequest(transactionId) {
    return buildMutationHeader(
        PROFILE_CANDIDATE_V1.VALUE_COMMIT,
        assertU16(transactionId, "Candidate transaction id", {nonzero: true}),
        PROFILE_CANDIDATE_V1.COMMAND_SAVE
    );
}

/** @param {number} transactionId */
function buildCandidateAbortRequest(transactionId) {
    return buildMutationHeader(
        PROFILE_CANDIDATE_V1.VALUE_ABORT,
        assertU16(transactionId, "Candidate transaction id", {nonzero: true})
    );
}

/** @param {number} requestId @param {number} [page] */
function buildCandidateStatusRequest(requestId, page = 0) {
    if (page !== 0 && page !== PROFILE_CANDIDATE_V1.ERROR_PAGE) throw new RangeError("Candidate status is read from page 0 or the error page.");
    return buildProfileGetRequest(
        PROFILE_CANDIDATE_V1.VALUE_STATUS,
        page,
        assertU8(requestId, "Candidate status request id", {nonzero: true})
    );
}

/** @param {Uint8Array} response @param {Uint8Array} request */
function candidateMutationResponseMatcher(response, request) {
    const actual = normalizeRawHidReport(response, "Candidate mutation response");
    const expected = normalizeRawHidReport(request, "Candidate mutation request");
    return actual[0] === expected[0]
        && actual[1] === expected[1]
        && actual[2] === expected[2]
        && actual[3] === expected[3]
        && actual[4] === expected[4];
}

/** @param {Uint8Array} response @param {Uint8Array} request */
function decodeCandidateAcknowledgement(response, request) {
    const report = Buffer.from(normalizeRawHidReport(response, "Candidate mutation response"));
    if (!candidateMutationResponseMatcher(report, request)) {
        throw candidateProtocolError(
            "CORRELATION_MISMATCH",
            "Candidate acknowledgment does not match the operation and transaction id."
        );
    }
    assertZeroRange(report, 8, RAW_HID_REPORT_SIZE, "Candidate acknowledgment");
    const admission = report[5];
    const errorId = report[6];
    const frameOffset = report[7];
    if (!/** @type {number[]} */ (Object.values(CANDIDATE_ADMISSION)).includes(admission)) {
        throw candidateProtocolError("MALFORMED_RESPONSE", `Unknown candidate admission id ${admission}.`);
    }
    assertKnownCandidateError(errorId);
    if (admission === CANDIDATE_ADMISSION.QUEUED && (errorId !== CANDIDATE_ERROR.NONE || frameOffset !== 0xff)) {
        throw candidateProtocolError("NONCANONICAL_RESPONSE", "A queued acknowledgment must not contain an error location.");
    }
    if (admission === CANDIDATE_ADMISSION.BUSY && (errorId !== CANDIDATE_ERROR.MAILBOX_BUSY || frameOffset !== 0xff)) {
        throw candidateProtocolError("NONCANONICAL_RESPONSE", "A busy acknowledgment must report only the mailbox-busy error.");
    }
    if (admission === CANDIDATE_ADMISSION.MALFORMED
        && (errorId !== CANDIDATE_ERROR.MALFORMED_FRAME || frameOffset >= RAW_HID_REPORT_SIZE)) {
        throw candidateProtocolError("NONCANONICAL_RESPONSE", "A malformed acknowledgment must identify a malformed frame byte.");
    }
    if (admission === CANDIDATE_ADMISSION.UNSUPPORTED
        && (errorId !== CANDIDATE_ERROR.UNSUPPORTED_OPERATION || frameOffset !== 0xff)) {
        throw candidateProtocolError("NONCANONICAL_RESPONSE", "An unsupported acknowledgment must report only the unsupported-operation error.");
    }
    if (admission === CANDIDATE_ADMISSION.REJECTED && (errorId === CANDIDATE_ERROR.NONE || (frameOffset !== 0xff && frameOffset >= RAW_HID_REPORT_SIZE))) {
        throw candidateProtocolError("NONCANONICAL_RESPONSE", "A rejected acknowledgment must identify the admission failure.");
    }
    return {
        admission,
        admissionName: CANDIDATE_ADMISSION_NAMES[admission],
        errorId,
        errorName: CANDIDATE_ERROR_NAMES[errorId],
        frameOffset,
        transactionId: report.readUInt16LE(3),
        valueId: report[2],
    };
}

// Where an error is, when there is none: every field its sentinel.
const NO_ERROR_LOCATION = Object.freeze({domainId: 0xff, tableId: 0xff, rowIndex: 0xffff, tapIndex: 0xff, fieldId: 0xff, byteOffset: 0xffffffff});

// Page 0 (layout 2): the candidate's progress and its error id. The error's
// location is on page 3 (decodeCandidateErrorResponse), joined by
// readCandidateStatus; decoded alone, the location is the no-error sentinels.
/** @param {Uint8Array} response @param {Uint8Array} request */
function decodeCandidateStatusResponse(response, request) {
    const payload = decodeProfileResponse(response, request);
    if (payload.length !== PROFILE_CANDIDATE_V1.STATUS_PAYLOAD_SIZE) {
        throw candidateProtocolError("MALFORMED_RESPONSE", "Candidate status must contain exactly 25 payload bytes.");
    }
    if (payload[0] !== PROFILE_CANDIDATE_V1.STATUS_LAYOUT_VERSION) {
        throw candidateProtocolError("INCOMPATIBLE_RESPONSE", `Unsupported candidate status layout ${payload[0]}.`);
    }
    const state = payload[1];
    const lastOperation = payload[2];
    const flags = payload[3];
    const errorId = payload[18];
    if (!/** @type {number[]} */ (Object.values(CANDIDATE_STATE)).includes(state)) {
        throw candidateProtocolError("INCOMPATIBLE_RESPONSE", `Unknown candidate state ${state}.`);
    }
    if (!/** @type {number[]} */ (Object.values(CANDIDATE_OPERATION)).includes(lastOperation)) {
        throw candidateProtocolError("INCOMPATIBLE_RESPONSE", `Unknown candidate operation ${lastOperation}.`);
    }
    if ((flags & ~CANDIDATE_STATUS_FLAGS.KNOWN_MASK) !== 0) {
        throw candidateProtocolError("INCOMPATIBLE_RESPONSE", `Candidate status contains unknown flag bits 0x${(flags & ~CANDIDATE_STATUS_FLAGS.KNOWN_MASK).toString(16)}.`);
    }
    assertKnownCandidateError(errorId);
    if (payload[23] !== 0 || payload[24] !== 0) {
        throw candidateProtocolError("NONCANONICAL_RESPONSE", "Candidate status reserved bytes must be zero.");
    }
    return {
        layoutVersion: payload[0],
        state,
        lastOperation,
        flags,
        mailboxPending: (flags & CANDIDATE_STATUS_FLAGS.MAILBOX_PENDING) !== 0,
        poisoned: (flags & CANDIDATE_STATUS_FLAGS.POISONED) !== 0,
        transactionId: payload.readUInt16LE(4),
        nextOffset: payload.readUInt32LE(6),
        payloadLength: payload.readUInt32LE(10),
        digest: payload.readUInt32LE(14),
        error: {id: errorId, name: CANDIDATE_ERROR_NAMES[errorId], ...NO_ERROR_LOCATION},
        operationSequence: payload.readUInt16LE(19),
        // Advances whenever the error or its location changes, including
        // between mailbox items, so page 3 can be tied to this page.
        errorSequence: payload.readUInt16LE(21),
    };
}

// Page 3 (layout 1, firmware D-F28): where the error is, with the transaction,
// operation sequence and error sequence of the page 0 it belongs to.
/** @param {Uint8Array} response @param {Uint8Array} request */
function decodeCandidateErrorResponse(response, request) {
    const payload = decodeProfileResponse(response, request);
    if (payload.length !== PROFILE_CANDIDATE_V1.STATUS_PAYLOAD_SIZE || payload[0] !== PROFILE_CANDIDATE_V1.ERROR_LAYOUT_VERSION) {
        throw candidateProtocolError("INCOMPATIBLE_RESPONSE", "Unsupported candidate error page layout.");
    }
    const errorId = payload[1];
    assertKnownCandidateError(errorId);
    if (payload.subarray(18).some(Boolean)) {
        throw candidateProtocolError("NONCANONICAL_RESPONSE", "Candidate error page reserved bytes must be zero.");
    }
    const location = {
        domainId: payload[2],
        tableId: payload[3],
        rowIndex: payload.readUInt16LE(4),
        tapIndex: payload[6],
        fieldId: payload[7],
        byteOffset: payload.readUInt32LE(8),
    };
    if (errorId === CANDIDATE_ERROR.NONE && Object.entries(NO_ERROR_LOCATION).some(([field, value]) => location[/** @type {keyof typeof location} */ (field)] !== value)) {
        throw candidateProtocolError("NONCANONICAL_RESPONSE", "Candidate status without an error must use all location sentinels.");
    }
    return {
        id: errorId,
        name: CANDIDATE_ERROR_NAMES[errorId],
        ...location,
        transactionId: payload.readUInt16LE(12),
        operationSequence: payload.readUInt16LE(14),
        errorSequence: payload.readUInt16LE(16),
    };
}

// Reads of page 0 before the error page's location is given up on. Validation,
// commit and slave-half events can replace the error between the two reads;
// each replacement moves the error sequence, and the pair is reread.
const ERROR_PAGE_ATTEMPTS = 3;

/** @param {import("../transport/types.js").RequestConnection} connection @param {import("./types.js").ReadOptions} [options] */
async function readCandidateStatus(connection, options = {}) {
    if (!connection || typeof connection.request !== "function") {
        throw new TypeError("connection must provide request(report, options).");
    }
    const fixedRequestId = options.nextRequestId ? undefined
        : assertU8(options.requestId === undefined ? 1 : options.requestId, "Candidate status request id", {nonzero: true});
    const requestId = () => options.nextRequestId ? assertNextRequestId(options.nextRequestId) : /** @type {number} */ (fixedRequestId);
    /** @param {number} page @param {string} label */
    const read = async (page, label) => {
        const request = buildCandidateStatusRequest(requestId(), page);
        const response = await requestHandled(connection, request, {
            matchResponse: profileResponseMatcher,
            signal: options.signal,
            timeoutMs: options.timeoutMs,
        }, label);
        return {response, request};
    };
    let status;
    for (let attempt = 0; attempt < ERROR_PAGE_ATTEMPTS; attempt += 1) {
        const progress = await read(0, "the candidate status read");
        status = decodeCandidateStatusResponse(progress.response, progress.request);
        if (status.error.id === CANDIDATE_ERROR.NONE) return status;
        const located = await read(PROFILE_CANDIDATE_V1.ERROR_PAGE, "the candidate error read");
        const error = decodeCandidateErrorResponse(located.response, located.request);
        if (error.id === status.error.id && error.transactionId === status.transactionId
            && error.operationSequence === status.operationSequence && error.errorSequence === status.errorSequence) {
            const {transactionId, operationSequence, errorSequence, ...where} = error;
            return {...status, error: where};
        }
    }
    // The error kept moving: its id on page 0 stands, its location is unknown.
    return /** @type {NonNullable<typeof status>} */ (status);
}

// Candidate status page 1: how far a save's copy to the slave half has got,
// and the slave half's last answer. The phase names mirror
// noah_profile_candidate_v1_peer_phase_t; the reasons mirror
// noah_profile_split_v1_status_t.
const CANDIDATE_PEER_PHASE = Object.freeze({
    IDLE: 0, BINDING: 1, BEGINNING: 2, SENDING: 3, PREPARING: 4, PREPARED: 5, COMMITTING: 6, ABORTING: 7, STOPPED: 8, WAITING: 9,
});
const CANDIDATE_PEER_PHASE_NAMES = Object.freeze(Object.fromEntries(Object.entries(CANDIDATE_PEER_PHASE).map(([name, value]) => [value, name])));
const SPLIT_STATUS_NAMES = Object.freeze([
    "OK", "INVALID_FRAME", "INCOMPATIBLE", "STALE", "CONFLICT", "CORRUPT", "BUSY", "RANGE_ERROR", "DIGEST_MISMATCH", "STORAGE_ERROR", "VALIDATION_ERROR",
]);
const CANDIDATE_PEER_FLAGS = Object.freeze({CLEANUP_PENDING: 1 << 0, MASTER: 1 << 1, WAITING_SAFE_BOUNDARY: 1 << 2, KNOWN_MASK: 0x07});
// Why the slave half last answered BUSY, and what it held then; these mirror
// noah_profile_split_v1_busy_reason_t, noah_profile_other_half_store_state_t and
// noah_profile_split_transfer_owner_t.
const PEER_BUSY_REASON_NAMES = Object.freeze(["UNSPECIFIED", "ADMITTED", "MAILBOX_FULL", "OTHER_COPY", "NO_LEASE", "STORE_WORKING", "PULLING", "CONVERGENCE_ONLY"]);
const PEER_STORE_STATE_NAMES = Object.freeze(["UNINITIALIZED", "IDLE", "RECEIVING", "VALIDATING", "PREPARING", "PREPARED", "COMMITTING", "COMMITTED", "REJECTED", "RECONCILE_REQUIRED"]);
const PEER_TRANSFER_OWNER_NAMES = Object.freeze(["NONE", "REMOTE_PUSH", "LOCAL_PULL"]);
// noah_profile_storage_admission_owner_t: who holds the slave half's storage.
const PEER_ADMISSION_NAMES = Object.freeze(["NONE", "HOST", "PEER"]);

/** @param {number} requestId */
function buildCandidateSlaveStatusRequest(requestId) {
    return buildProfileGetRequest(PROFILE_CANDIDATE_V1.VALUE_STATUS, 1, assertU8(requestId, "Candidate slave-half status request id", {nonzero: true}));
}

/** @param {Uint8Array} response @param {Uint8Array} request */
function decodeCandidateSlaveStatusResponse(response, request) {
    const payload = decodeProfileResponse(response, request);
    if (payload.length !== PROFILE_CANDIDATE_V1.STATUS_PAYLOAD_SIZE || payload[0] !== PROFILE_CANDIDATE_V1.PEER_STATUS_LAYOUT_VERSION) {
        throw candidateProtocolError("INCOMPATIBLE_RESPONSE", "Unsupported candidate slave-half status layout.");
    }
    const phase = payload[1];
    const lastStatus = payload[2];
    const flags = payload[3];
    if (CANDIDATE_PEER_PHASE_NAMES[phase] === undefined) {
        throw candidateProtocolError("INCOMPATIBLE_RESPONSE", `Unknown slave-half transfer phase ${phase}.`);
    }
    if (SPLIT_STATUS_NAMES[lastStatus] === undefined) {
        throw candidateProtocolError("INCOMPATIBLE_RESPONSE", `Unknown slave-half status ${lastStatus}.`);
    }
    if ((flags & ~CANDIDATE_PEER_FLAGS.KNOWN_MASK) !== 0) {
        throw candidateProtocolError("INCOMPATIBLE_RESPONSE", "Candidate slave-half status contains unknown flag bits.");
    }
    // Layout 2 packs the transfer owner (low nibble) and the storage admission
    // (high nibble) into the last byte.
    const [busyReason, busyStoreState] = payload.subarray(22, 24);
    const busyOwner = payload[24] & 0x0f, busyAdmission = payload[24] >> 4;
    if (PEER_BUSY_REASON_NAMES[busyReason] === undefined || PEER_STORE_STATE_NAMES[busyStoreState] === undefined || PEER_TRANSFER_OWNER_NAMES[busyOwner] === undefined || PEER_ADMISSION_NAMES[busyAdmission] === undefined) {
        throw candidateProtocolError("INCOMPATIBLE_RESPONSE", "Unknown slave-half busy detail.");
    }
    return {
        phase,
        phaseName: CANDIDATE_PEER_PHASE_NAMES[phase],
        lastStatus,
        lastStatusName: SPLIT_STATUS_NAMES[lastStatus],
        cleanupPending: (flags & CANDIDATE_PEER_FLAGS.CLEANUP_PENDING) !== 0,
        master: (flags & CANDIDATE_PEER_FLAGS.MASTER) !== 0,
        waitingSafeBoundary: (flags & CANDIDATE_PEER_FLAGS.WAITING_SAFE_BOUNDARY) !== 0,
        transferOffset: payload.readUInt32LE(4),
        transferLength: payload.readUInt32LE(8),
        retryCount: payload.readUInt32LE(12),
        transportFailureCount: payload.readUInt32LE(16),
        // The slave half's BUSY replies in a row, and the last one that said
        // why (never the routine "admitted" reply to a new request).
        busyStreak: payload.readUInt16LE(20),
        busyReason: PEER_BUSY_REASON_NAMES[busyReason],
        busyStoreState: PEER_STORE_STATE_NAMES[busyStoreState],
        busyOwner: PEER_TRANSFER_OWNER_NAMES[busyOwner],
        busyAdmission: PEER_ADMISSION_NAMES[busyAdmission],
    };
}

/** @param {import("../transport/types.js").RequestConnection} connection @param {import("./types.js").ReadOptions} [options] */
async function readCandidateSlaveStatus(connection, options = {}) {
    if (typeof options.nextRequestId !== "function") throw new TypeError("nextRequestId must be a function.");
    const request = buildCandidateSlaveStatusRequest(assertNextRequestId(options.nextRequestId));
    const response = await requestHandled(connection, request, {matchResponse: profileResponseMatcher, signal: options.signal, timeoutMs: options.timeoutMs}, "the candidate slave-half status read");
    return decodeCandidateSlaveStatusResponse(response, request);
}

// The candidate is the complete profile; firmware assigns its one generation.
/** @overload @param {Uint8Array} value @param {import("./types.js").CandidateBlobOptions} options @returns {import("./types.js").CandidateMetadata} */
/** @param {Uint8Array} value @param {Partial<import("./types.js").CandidateBlobOptions>} [options] @returns {import("./types.js").CandidateMetadata} */
function candidateMetadataForBlob(value, options = {}) {
    const blob = asBytes(value, "Candidate profile blob");
    const storeFormatVersion = options.storeFormatVersion ?? PROFILE_CANDIDATE_V1.STORE_FORMAT;
    const maximum = options.capabilities?.maxProfilePayload ?? PROFILE_CANDIDATE_V1.MAX_BLOB_SIZE;
    if (blob.length > maximum) throw new RangeError(`Candidate profile blob exceeds the keyboard's ${maximum}-byte capacity.`);
    if (blob.length < PROFILE_CANDIDATE_V1.MIN_BLOB_SIZE || blob.length > PROFILE_CANDIDATE_V1.MAX_BLOB_SIZE) {
        throw new RangeError(`Candidate profile blob must contain ${PROFILE_CANDIDATE_V1.MIN_BLOB_SIZE} through ${PROFILE_CANDIDATE_V1.MAX_BLOB_SIZE} bytes.`);
    }
    const decoded = decodeProfileBlob(blob);
    assertCurrentSchema(decoded.schema.major, decoded.schema.minor);
    let derivedDomains = 0;
    for (const domain of decoded.domains) {
        derivedDomains |= profileDomain(domain.id)?.wireBit ?? 0;
    }
    const requestedDomains = options.requestedDomains === undefined
        ? derivedDomains
        : assertDomainMask(options.requestedDomains);
    if (requestedDomains !== derivedDomains) {
        throw requestError(
            "DOMAIN_MASK_MISMATCH",
            `Requested domain mask 0x${requestedDomains.toString(16)} does not match blob domains 0x${derivedDomains.toString(16)}.`,
            {derivedDomains, requestedDomains}
        );
    }
    return {
        schemaMajor: decoded.schema.major,
        schemaMinor: decoded.schema.minor,
        requestedDomains,
        flags: 0,
        payloadLength: blob.length,
        crc32: crc32(blob),
        digest: fnv1a32(blob),
        actionAbiDigest: assertU32(options.actionAbiDigest, "Action-ABI digest"),
        storeFormatVersion,
    };
}

/** @param {import("./types.js").CandidateMetadataInput} metadata @returns {import("./types.js").CandidateMetadata} */
function normalizeCandidateMetadata(metadata) {
    if (!metadata || typeof metadata !== "object") {
        throw new TypeError("Candidate metadata must be an object.");
    }
    const flags = assertU8(metadata.flags === undefined ? 0 : metadata.flags, "Candidate flags");
    if (flags !== 0) {
        throw new RangeError("Candidate flags must be zero.");
    }
    const payloadLength = assertU32(metadata.payloadLength, "Candidate payload length");
    if (payloadLength < PROFILE_CANDIDATE_V1.MIN_BLOB_SIZE || payloadLength > PROFILE_CANDIDATE_V1.MAX_BLOB_SIZE) {
        throw new RangeError(`Candidate payload length must be ${PROFILE_CANDIDATE_V1.MIN_BLOB_SIZE} through ${PROFILE_CANDIDATE_V1.MAX_BLOB_SIZE}.`);
    }
    const schemaMajor = assertU8(metadata.schemaMajor, "Candidate schema major");
    const schemaMinor = assertU8(metadata.schemaMinor, "Candidate schema minor");
    assertCurrentSchema(schemaMajor, schemaMinor);
    // Not on the wire since Profile Wire 2, which implies it; a caller that
    // names another format is refused rather than silently ignored.
    const storeFormatVersion = assertU8(metadata.storeFormatVersion ?? PROFILE_CANDIDATE_V1.STORE_FORMAT, "Candidate store format");
    if (storeFormatVersion !== PROFILE_CANDIDATE_V1.STORE_FORMAT) {
        throw new RangeError(`Candidate store format must be ${PROFILE_CANDIDATE_V1.STORE_FORMAT}.`);
    }
    return {
        schemaMajor,
        schemaMinor,
        requestedDomains: assertDomainMask(metadata.requestedDomains),
        flags,
        payloadLength,
        crc32: assertU32(metadata.crc32, "Candidate CRC32"),
        digest: assertU32(metadata.digest, "Candidate digest"),
        actionAbiDigest: assertU32(metadata.actionAbiDigest, "Candidate action-ABI digest"),
        storeFormatVersion,
    };
}

/** @param {number} major @param {number} minor */
function assertCurrentSchema(major, minor) {
    if (major !== PROFILE_CANDIDATE_V1.SCHEMA_MAJOR || minor !== PROFILE_CANDIDATE_V1.SCHEMA_MINOR) {
        throw requestError("INCOMPATIBLE_SCHEMA", `Candidates use profile schema ${PROFILE_CANDIDATE_V1.SCHEMA_MAJOR}.${PROFILE_CANDIDATE_V1.SCHEMA_MINOR}; this blob is ${major}.${minor}.`);
    }
}

/** @param {number} valueId @param {number} transactionId @param {number} [command] */
function buildMutationHeader(valueId, transactionId, command = PROFILE_CANDIDATE_V1.COMMAND_SET) {
    const report = Buffer.alloc(RAW_HID_REPORT_SIZE);
    report[0] = command;
    report[1] = PROFILE_CANDIDATE_V1.CHANNEL;
    report[2] = valueId;
    report.writeUInt16LE(transactionId, 3);
    return report;
}

/** @param {number} value */
function assertDomainMask(value) {
    const mask = assertU8(value, "Candidate requested-domain mask");
    if ((mask & ~PROFILE_CANDIDATE_V1.KNOWN_DOMAIN_MASK) !== 0) {
        throw new RangeError(`Candidate requested-domain mask contains unknown bits 0x${(mask & ~PROFILE_CANDIDATE_V1.KNOWN_DOMAIN_MASK).toString(16)}.`);
    }
    return mask;
}

/** @param {number} value */
function assertKnownCandidateError(value) {
    if (!Object.prototype.hasOwnProperty.call(CANDIDATE_ERROR_NAMES, value)) {
        throw candidateProtocolError("INCOMPATIBLE_RESPONSE", `Unknown candidate error id ${value}.`);
    }
}

/** @param {() => number} nextRequestId */
function assertNextRequestId(nextRequestId) {
    if (typeof nextRequestId !== "function") {
        throw new TypeError("nextRequestId must be a function.");
    }
    return assertU8(nextRequestId(), "Candidate status request id", {nonzero: true});
}

/** @param {Uint8Array} buffer @param {number} start @param {number} end @param {string} label */
function assertZeroRange(buffer, start, end, label) {
    zeroRange(buffer, start, end, index => candidateProtocolError("NONCANONICAL_RESPONSE", `${label} has nonzero reserved byte ${index}.`, {frameOffset: index}));
}

/** @param {string} code @param {string} message @param {Record<string, unknown>} [details] */
function candidateProtocolError(code, message, details) {
    return new ProfileCandidateProtocolError(code, message, details);
}
// A request Ark builds that it cannot send: Ark's fault, not the keyboard's
// answer (core/model/vocabulary.js failureSentence).
/** @param {string} code @param {string} message @param {Record<string, unknown>} [details] */
function requestError(code, message, details) {
    return Object.assign(candidateProtocolError(code, message, details), {fault: "ark"});
}

module.exports = {
    CANDIDATE_ADMISSION,
    CANDIDATE_ERROR,
    CANDIDATE_ERROR_NAMES,
    CANDIDATE_OPERATION,
    CANDIDATE_STATE,
    CANDIDATE_STATE_NAMES,
    CandidateRequestIdSequence,
    CandidateTransactionIdSequence,
    PROFILE_CANDIDATE_V1,
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
    normalizeCandidateMetadata,
    readCandidateStatus,
    CANDIDATE_PEER_PHASE,
    buildCandidateSlaveStatusRequest,
    readCandidateSlaveStatus,
};
