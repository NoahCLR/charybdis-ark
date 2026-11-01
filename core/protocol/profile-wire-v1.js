// @ts-check
"use strict";
const {PROFILE_DOMAIN_MASK} = require("../schema/profile-domains");

const {requestHandled} = require("./raw-hid-unhandled");
const {RAW_HID_REPORT_SIZE, normalizeRawHidReport} = require("../transport/device-adapter");

const PROFILE_WIRE_V1 = Object.freeze({
    // Profile Wire 2.0 opens the new base (firmware D-F28): every profile
    // length and offset is 32 bits, and the feature word holds only what a
    // build varies by. Ark requires this version exactly (D-L64).
    PROTOCOL_MAJOR: 2,
    PROTOCOL_MINOR: 0,
    // Response layout 3 (firmware D-F28): page 1 the ceilings that fit a byte,
    // page 2 the wider ones. Any other layout is refused.
    CAPABILITY_LAYOUT: 3,
    CAPABILITY_PAGE_COUNT: 3,
    CHANNEL: 0x00,
    COMMAND_GET: 0x08,
    PAYLOAD_OFFSET: 7,
    PAYLOAD_SIZE: 25,
    STATUS_PAGE_COUNT: 2,
    VALUE_CAPABILITIES: 0x01,
    VALUE_STATUS: 0x02,
});

const PROFILE_WIRE_STATUS = Object.freeze({
    OK: 0,
    MALFORMED: 1,
    UNKNOWN_PAGE: 2,
    UNAVAILABLE: 3,
});

// The feature word describes the build, never a step in the firmware's
// history: everything the base does is implied by its version (firmware
// D-F28, which retired every Profile Wire 1 bit). The bits are in firmware's
// profile-wire-v1/hid-channel.md, "The feature word".
const PROFILE_WIRE_FEATURES = Object.freeze({
    // One half of a split pair: a save copies the profile to the slave half.
    SPLIT_KEYBOARD: 1 << 0,
    // Candidate writes (with reuse and streaming chunks), durable commit and
    // activation; set once the live-profile owner reports.
    SAVES: 1 << 1,
    // The build has a pointing device.
    POINTING: 1 << 2,
});

// Apply needs a build that saves and copies to the slave half;
// CURRENT_PAIR_FEATURES is everything the flashable pair reports. Reading needs
// no bit: the version says what the keyboard does (session/firmware-support.js).
const F = PROFILE_WIRE_FEATURES;
const CURRENT_MUTATION_FEATURES = (F.SPLIT_KEYBOARD | F.SAVES) >>> 0;
const PROFILE_WIRE_KNOWN_MASKS = Object.freeze({
    FEATURE_FLAGS: (F.SPLIT_KEYBOARD | F.SAVES | F.POINTING) >>> 0,
    CURRENT_MUTATION_FEATURES,
    CURRENT_PAIR_FEATURES: (CURRENT_MUTATION_FEATURES | F.POINTING) >>> 0,
    STATE_FLAGS: 0x03ff,
    SUPPORTED_DOMAINS: PROFILE_DOMAIN_MASK,
});

const PROFILE_ACTIVE_KIND = Object.freeze({
    COMPILED_ONLY: 0,
    COMMITTED: 1,
    PREVIEW: 2,
    PENDING: 3,
    // Unsaved live edits (firmware D-F32): the keyboard runs its working copy.
    // Status page 0's active digest then carries the working copy's revision,
    // and page 1's generation and origin are its saved base's.
    WORKING: 4,
});

const PROFILE_STATE_FLAGS = Object.freeze({
    ACTIVE_IS_COMPILED_DEFAULT: 1 << 0,
    COMMITTED_VALID: 1 << 1,
    CANDIDATE_PENDING: 1 << 2,
    PREVIEW_ACTIVE: 1 << 3,
    PEER_KNOWN: 1 << 4,
    PEER_CONVERGED: 1 << 5,
    WAITING_SAFE_BOUNDARY: 1 << 6,
    DIGESTS_UNAVAILABLE: 1 << 7,
    // The slave half never acknowledged a cancelled save's ABORT. No save
    // starts until it confirms; a slave half that never does needs a restart.
    PEER_CLEANUP_PENDING: 1 << 8,
    // A slot holds a profile in an earlier store format or retired test
    // layout (firmware D-F28). The
    // keyboard neither reads nor converts it and runs its compiled defaults
    // until a profile is saved (D-L64).
    STORED_EARLIER_FORMAT: 1 << 9,
});


class ProfileWireProtocolError extends Error {
    /** @param {string} code @param {string} message @param {Record<string, unknown>} [details] */
    constructor(code, message, details = {}) {
        super(message);
        this.name = "ProfileWireProtocolError";
        this.code = code;
        // Its text names bytes and layouts (schema/bytes.js protocolError).
        this.fault = "answer";
        Object.assign(this, details);
    }
}

/** @param {number} value @param {string} label @param {{nonzero?: boolean}} [options] */
function assertByte(value, label, {nonzero = false} = {}) {
    if (!Number.isInteger(value) || value < (nonzero ? 1 : 0) || value > 0xff) {
        throw new RangeError(`${label} must be ${nonzero ? "a nonzero " : "an "}8-bit integer.`);
    }
    return value;
}

// A page is 16 bits: its low byte goes in request byte 4 and its high byte in
// byte 5, which only the wide readbacks (GET 0x04..0x07) read; every other
// value's byte 5 stays zero.
/** @param {number} valueId @param {number} page @param {number} requestId */
function buildProfileGetRequest(valueId, page, requestId) {
    const report = Buffer.alloc(RAW_HID_REPORT_SIZE);
    report[0] = PROFILE_WIRE_V1.COMMAND_GET;
    report[1] = PROFILE_WIRE_V1.CHANNEL;
    report[2] = assertByte(valueId, "valueId");
    report[3] = assertByte(requestId, "requestId", {nonzero: true});
    if (!Number.isInteger(page) || page < 0 || page > 0xffff) throw new RangeError("page must be a 16-bit integer.");
    report[4] = page & 0xff;
    report[5] = page >> 8;
    return report;
}

/** @param {Uint8Array} response @param {Uint8Array} request */
function profileResponseMatcher(response, request) {
    const actual = normalizeRawHidReport(response, "Profile Wire response");
    const expected = normalizeRawHidReport(request, "Profile Wire request");
    return actual[0] === expected[0]
        && actual[1] === expected[1]
        && actual[2] === expected[2]
        && actual[3] === expected[3]
        && actual[4] === expected[4];
}

// options.allowShortPayload is for reads whose last page is legitimately
// partial, such as the tail chunk of a committed payload. It stays opt-in so
// the fixed-size status and capability pages keep failing on a short read,
// where a short page really does mean something is wrong.
/** @param {Uint8Array} response @param {Uint8Array} request @param {{allowShortPayload?: boolean}} [options] */
function decodeProfileResponse(response, request, options = {}) {
    const report = Buffer.from(normalizeRawHidReport(response, "Profile Wire response"));
    if (!profileResponseMatcher(report, request)) {
        throw new ProfileWireProtocolError(
            "CORRELATION_MISMATCH",
            "Profile Wire response does not match the request correlation header."
        );
    }
    const status = report[5];
    const payloadLength = report[6];
    if (payloadLength > PROFILE_WIRE_V1.PAYLOAD_SIZE) {
        throw new ProfileWireProtocolError("MALFORMED_RESPONSE", "Profile Wire payload length exceeds one report.");
    }
    for (let index = PROFILE_WIRE_V1.PAYLOAD_OFFSET + payloadLength; index < RAW_HID_REPORT_SIZE; index += 1) {
        if (report[index] !== 0) {
            throw new ProfileWireProtocolError("NONCANONICAL_RESPONSE", "Profile Wire response has nonzero trailing bytes.");
        }
    }
    if (status !== PROFILE_WIRE_STATUS.OK) {
        throw new ProfileWireProtocolError("DEVICE_REJECTED", `Profile Wire request failed with status ${status}.`, {status});
    }
    if (payloadLength !== PROFILE_WIRE_V1.PAYLOAD_SIZE && !options.allowShortPayload) {
        throw new ProfileWireProtocolError("MALFORMED_RESPONSE", "Successful Profile Wire read pages must contain 25 bytes.");
    }
    if (payloadLength === 0) {
        throw new ProfileWireProtocolError("MALFORMED_RESPONSE", "A successful Profile Wire read page cannot be empty.");
    }
    return report.subarray(PROFILE_WIRE_V1.PAYLOAD_OFFSET, PROFILE_WIRE_V1.PAYLOAD_OFFSET + payloadLength);
}

// The keyboard's answer to a page past the end of a paged value: what a
// value that got shorter during a read answers (profile-payload-v1.js,
// profile-edit-v1.js read page 0 again on it).
/** @param {unknown} error */
const isUnknownPage = error => error instanceof ProfileWireProtocolError && error.code === "DEVICE_REJECTED"
    && /** @type {{status?: number}} */ (/** @type {unknown} */ (error)).status === PROFILE_WIRE_STATUS.UNKNOWN_PAGE;

/** @param {Uint8Array} buffer @param {number} offset */
function readU16(buffer, offset) {
    return buffer[offset] | (buffer[offset + 1] << 8);
}

/** @param {Uint8Array} buffer @param {number} offset */
function readU32(buffer, offset) {
    return (
        buffer[offset]
        | (buffer[offset + 1] << 8)
        | (buffer[offset + 2] << 16)
        | (buffer[offset + 3] << 24)
    ) >>> 0;
}

/** @param {Uint8Array[]} pages */
function decodeCapabilityPages(pages) {
    assertPageSet(pages, PROFILE_WIRE_V1.CAPABILITY_PAGE_COUNT, "capability");
    const identity = pages[0];
    const capacity = pages[1];
    const wide = pages[2];
    if (identity[0] !== PROFILE_WIRE_V1.CAPABILITY_LAYOUT || identity[1] !== PROFILE_WIRE_V1.CAPABILITY_PAGE_COUNT) {
        throw new ProfileWireProtocolError("INCOMPATIBLE_RESPONSE", "Unsupported Profile Wire capability layout: Ark supports only current firmware. Update both halves.");
    }
    assertZeroRange(capacity, 16, 25, "capability page 1");
    assertZeroRange(wide, 18, 25, "capability page 2");
    const decoded = {
        responseVersion: identity[0],
        protocol: {major: identity[2], minor: identity[3]},
        schema: {major: identity[4], minor: identity[5]},
        reportSize: identity[6],
        candidateChunkMax: identity[7],
        statusPageCount: identity[8],
        featureFlags: readU32(identity, 9),
        actionAbiDigest: readU32(identity, 13),
        firmwareVersion: readU32(identity, 17),
        compiledDefaultDigest: readU32(identity, 21),
        compiledLayerCount: capacity[0],
        maxLogicalLayers: capacity[1],
        maxBehaviorRows: capacity[2],
        maxTapStepsPerBehavior: capacity[3],
        maxCombos: capacity[4],
        maxKeysPerCombo: capacity[5],
        maxReusableRgbGroups: capacity[6],
        maxRgbStageGroupRows: capacity[7],
        physicalLedCount: capacity[8],
        ledBitmapSize: capacity[9],
        customKeySlots: capacity[10],
        macroSlots: capacity[11],
        supportedDomainMask: capacity[12],
        nameMaxBytes: capacity[13],
        layerMaskBits: capacity[14],
        placementPositions: capacity[15],
        maxPopulatedBehaviorSteps: readU16(wide, 0),
        profileSlotSize: readU32(wide, 2),
        maxProfilePayload: readU32(wide, 6),
        profileSlotPayload: readU32(wide, 10),
        macroBytes: readU32(wide, 14),
    };
    assertKnownMask(decoded.featureFlags, PROFILE_WIRE_KNOWN_MASKS.FEATURE_FLAGS, "capability feature flags");
    assertKnownMask(decoded.supportedDomainMask, PROFILE_WIRE_KNOWN_MASKS.SUPPORTED_DOMAINS, "supported domain mask");
    if (decoded.reportSize !== RAW_HID_REPORT_SIZE) {
        throw new ProfileWireProtocolError("INCOMPATIBLE_RESPONSE", `Firmware advertises ${decoded.reportSize}-byte reports; ${RAW_HID_REPORT_SIZE} are required.`);
    }
    if (decoded.statusPageCount !== PROFILE_WIRE_V1.STATUS_PAGE_COUNT) {
        throw new ProfileWireProtocolError("INCOMPATIBLE_RESPONSE", `Firmware advertises ${decoded.statusPageCount} status pages; ${PROFILE_WIRE_V1.STATUS_PAGE_COUNT} are required.`);
    }
    if (decoded.candidateChunkMax > 20) {
        throw new ProfileWireProtocolError("MALFORMED_RESPONSE", "Candidate chunk capacity exceeds the 32-byte Profile Wire frame.");
    }
    if (((decoded.featureFlags & PROFILE_WIRE_FEATURES.SAVES) !== 0) !== (decoded.candidateChunkMax > 0)) {
        throw new ProfileWireProtocolError("MALFORMED_RESPONSE", "Save support and candidate chunk capacity disagree.");
    }
    if (decoded.compiledLayerCount > decoded.maxLogicalLayers) {
        throw new ProfileWireProtocolError("MALFORMED_RESPONSE", "Compiled layer count exceeds the advertised logical-layer capacity.");
    }
    if (decoded.physicalLedCount > decoded.ledBitmapSize * 8) {
        throw new ProfileWireProtocolError("MALFORMED_RESPONSE", "LED bitmap capacity is smaller than the advertised physical LED count.");
    }
    if (decoded.maxProfilePayload > decoded.profileSlotPayload || decoded.profileSlotPayload >= decoded.profileSlotSize) {
        throw new ProfileWireProtocolError("MALFORMED_RESPONSE", "Profile payload and slot capacities are internally inconsistent.");
    }
    return decoded;
}

/** @param {Uint8Array[]} pages */
function decodeStatusPages(pages) {
    assertPageSet(pages, PROFILE_WIRE_V1.STATUS_PAGE_COUNT, "status");
    const identity = pages[0];
    const generation = pages[1];
    if (identity[0] !== 1 || identity[1] !== PROFILE_WIRE_V1.STATUS_PAGE_COUNT) {
        throw new ProfileWireProtocolError("INCOMPATIBLE_RESPONSE", "Unsupported Profile Wire status layout.");
    }
    assertZeroRange(generation, 23, 25, "status page 1");
    const decoded = {
        responseVersion: identity[0],
        stateFlags: readU16(identity, 2),
        sourceDigest: readU32(identity, 4),
        compiledDefaultDigest: readU32(identity, 8),
        activeDigest: readU32(identity, 12),
        pendingDigest: readU32(identity, 16),
        committedDigest: readU32(identity, 20),
        activeKind: identity[24],
        activeGeneration: readU32(generation, 0),
        activeOriginHalf: generation[4],
        committedGeneration: readU32(generation, 5),
        committedOriginHalf: generation[9],
        slaveGeneration: readU32(generation, 10),
        slaveOriginHalf: generation[14],
        candidateTransactionId: readU16(generation, 15),
        lastCommittedTransactionId: readU16(generation, 17),
        conflictCount: readU16(generation, 19),
        validationState: generation[21],
        lastError: generation[22],
    };
    assertKnownMask(decoded.stateFlags, PROFILE_WIRE_KNOWN_MASKS.STATE_FLAGS, "status state flags");
    if (!/** @type {number[]} */ (Object.values(PROFILE_ACTIVE_KIND)).includes(decoded.activeKind)) {
        throw new ProfileWireProtocolError("INCOMPATIBLE_RESPONSE", `Unknown active profile kind ${decoded.activeKind}.`);
    }
    for (const [label, value] of /** @type {[string, number][]} */ ([
        ["active origin half", decoded.activeOriginHalf],
        ["committed origin half", decoded.committedOriginHalf],
        ["slave half's generation origin", decoded.slaveOriginHalf],
    ])) {
        if (value > 1) {
            throw new ProfileWireProtocolError("MALFORMED_RESPONSE", `${label} must be 0 or 1.`);
        }
    }
    return {
        ...decoded,
        candidatePending: (decoded.stateFlags & PROFILE_STATE_FLAGS.CANDIDATE_PENDING) !== 0,
        slaveKnown: (decoded.stateFlags & PROFILE_STATE_FLAGS.PEER_KNOWN) !== 0,
        slaveConverged: (decoded.stateFlags & PROFILE_STATE_FLAGS.PEER_CONVERGED) !== 0,
        waitingSafeBoundary: (decoded.stateFlags & PROFILE_STATE_FLAGS.WAITING_SAFE_BOUNDARY) !== 0,
        slaveCleanupPending: (decoded.stateFlags & PROFILE_STATE_FLAGS.PEER_CLEANUP_PENDING) !== 0,
        storedEarlierFormat: (decoded.stateFlags & PROFILE_STATE_FLAGS.STORED_EARLIER_FORMAT) !== 0,
    };
}

/** @param {import("../transport/types.js").RequestConnection} connection @param {number} valueId @param {number} pageCount @param {import("./types.js").ReadOptions} [options] */
async function readProfilePages(connection, valueId, pageCount, options = {}) {
    if (!connection || typeof connection.request !== "function") {
        throw new TypeError("connection must provide request(report, options).");
    }
    let requestId = options.requestId === undefined ? 1 : assertByte(options.requestId, "requestId", {nonzero: true});
    const nextRequestId = options.nextRequestId;
    if (nextRequestId !== undefined && typeof nextRequestId !== "function") {
        throw new TypeError("nextRequestId must be a function.");
    }
    const pages = [];
    for (let page = 0; page < pageCount; page += 1) {
        const currentRequestId = nextRequestId
            ? assertByte(nextRequestId(), "requestId", {nonzero: true})
            : requestId;
        const request = buildProfileGetRequest(valueId, page, currentRequestId);
        const response = await requestHandled(connection, request, {
            matchResponse: profileResponseMatcher,
            signal: options.signal,
            timeoutMs: options.timeoutMs,
        }, `Profile Wire page ${page} of value ${valueId}`);
        pages.push(Buffer.from(decodeProfileResponse(response, request)));
        requestId = currentRequestId === 0xff ? 1 : currentRequestId + 1;
    }
    return pages;
}

/** @param {import("../transport/types.js").RequestConnection} connection @param {import("./types.js").ReadOptions} [options] */
async function readProfileCapabilities(connection, options) {
    return decodeCapabilityPages(await readProfilePages(connection, PROFILE_WIRE_V1.VALUE_CAPABILITIES, PROFILE_WIRE_V1.CAPABILITY_PAGE_COUNT, options));
}

/** @param {import("../transport/types.js").RequestConnection} connection @param {import("./types.js").ReadOptions} [options] */
async function readProfileStatus(connection, options) {
    return decodeStatusPages(await readProfilePages(connection, PROFILE_WIRE_V1.VALUE_STATUS, PROFILE_WIRE_V1.STATUS_PAGE_COUNT, options));
}

/** @param {Uint8Array[]} pages @param {number} count @param {string} label */
function assertPageSet(pages, count, label) {
    if (!Array.isArray(pages) || pages.length !== count || pages.some((page) => !(page instanceof Uint8Array) || page.byteLength !== PROFILE_WIRE_V1.PAYLOAD_SIZE)) {
        throw new ProfileWireProtocolError("MALFORMED_RESPONSE", `Profile Wire ${label} response requires ${count} complete pages.`);
    }
}

/** @param {Uint8Array} buffer @param {number} start @param {number} end @param {string} label */
function assertZeroRange(buffer, start, end, label) {
    for (let index = start; index < end; index += 1) {
        if (buffer[index] !== 0) {
            throw new ProfileWireProtocolError("NONCANONICAL_RESPONSE", `${label} has nonzero reserved bytes.`);
        }
    }
}

/** @param {number} value @param {number} knownMask @param {string} label */
function assertKnownMask(value, knownMask, label) {
    const unknown = (Number(value) >>> 0) & (~knownMask >>> 0);
    if (unknown !== 0) {
        throw new ProfileWireProtocolError("INCOMPATIBLE_RESPONSE", `${label} contains unknown bits 0x${unknown.toString(16)}.`);
    }
}

module.exports = {
    PROFILE_WIRE_STATUS,
    PROFILE_ACTIVE_KIND,
    PROFILE_STATE_FLAGS,
    PROFILE_WIRE_KNOWN_MASKS,
    PROFILE_WIRE_FEATURES,
    PROFILE_WIRE_V1,
    ProfileWireProtocolError,
    buildProfileGetRequest,
    decodeCapabilityPages,
    decodeProfileResponse,
    decodeStatusPages,
    isUnknownPage,
    profileResponseMatcher,
    readProfileCapabilities,
    readProfilePages,
    readProfileStatus,
};
