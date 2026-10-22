// @ts-check
"use strict";

// Live edits on the wire (firmware D-F32, profile-wire-v1.md "Live Edits"):
// the frames that send an edit to the keyboard's working copy, Save it,
// Revert it, set the edit mode and restart the keyboard (firmware D-F34),
// and the reads that say where the working copy is. One report per call; the order of an edit, polling and retries are
// the session's (core/session/live-edit-coordinator.js).

const {u8, u16, u32, asBytes, protocolError} = require("../schema/bytes");
const {crc32} = require("../schema/profile-blob-v1");
const {requestHandled} = require("./raw-hid-unhandled");
const {RAW_HID_REPORT_SIZE, normalizeRawHidReport} = require("../transport/device-adapter");
const {PROFILE_WIRE_V1, buildProfileGetRequest, decodeProfileResponse, profileResponseMatcher} = require("./profile-wire-v1");

const PROFILE_EDIT_V1 = Object.freeze({
    COMMAND_SET: 0x07,
    COMMAND_GET: PROFILE_WIRE_V1.COMMAND_GET,
    CHANNEL: PROFILE_WIRE_V1.CHANNEL,
    VALUE_BEGIN: 0x20,
    VALUE_SPLICE: 0x21,
    VALUE_DATA: 0x22,
    VALUE_COMMIT: 0x23,
    VALUE_ABORT: 0x24,
    VALUE_SAVE: 0x25,
    VALUE_REVERT: 0x26,
    VALUE_MODE: 0x27,
    // SET only: restart both halves, confirmed by "REST" (firmware D-F34).
    VALUE_RESTART: 0x28,
    RESTART_CONFIRM: 0x54534552,
    // GET values: the edit status (pages 0–3), the active profile (paged,
    // wide), the runtime overrides and QMK's live values, the edit mode.
    VALUE_STATUS: 0x20,
    VALUE_ACTIVE: 0x21,
    VALUE_RUNTIME: 0x22,
    STATUS_LAYOUT: 1,
    ACTIVE_LAYOUT: 1,
    STATUS_PAGES: 4,
    AUTO_SAVE_LAYOUT: 1,
    MAX_SPLICES: 8,
    DATA_MAX: 22,
    PAGE_SIZE: PROFILE_WIRE_V1.PAYLOAD_SIZE,
});

// What a SET answered (byte 5), and the edit status's last result.
const EDIT_RESULT = Object.freeze({
    OK: 0, QUEUED: 1, STALE: 2, BUSY: 3, INVALID_ARGUMENT: 4, INVALID_STATE: 5,
    WRONG_TRANSACTION: 6, OUT_OF_ORDER: 7, CAPACITY_EXCEEDED: 8, CHECKSUM_MISMATCH: 9,
    UNSUPPORTED_DOMAIN: 10, INVALID_SPLICE: 11, VALIDATION_REJECTED: 12, NOT_CLEAN: 13,
    READ_ERROR: 14, ABORTED: 15, PUBLICATION_FAILED: 16,
});
const EDIT_RESULT_NAMES = Object.freeze(Object.fromEntries(Object.entries(EDIT_RESULT).map(([name, value]) => [value, name])));

const EDIT_PHASE = Object.freeze({IDLE: 0, RECEIVING: 1, LOADING: 2, VALIDATING: 3, WAITING_SAFE: 4, REVERTING: 5});

// Edit status page 0 flags (and the SET reply's bytes 15–16).
const EDIT_FLAGS = Object.freeze({
    UNSAVED: 1 << 0,
    PEER_REQUIRED: 1 << 1,
    PEER_CONVERGED: 1 << 2,
    PEER_KNOWN: 1 << 3,
    EDITS_BLOCKED: 1 << 4,
    SAVED_COMPILED: 1 << 5,
    SAVING: 1 << 6,
    MODE_CONFLICT: 1 << 7,
    WAITING_SAFE: 1 << 8,
    STORAGE_PAUSED: 1 << 9,
    // The other half's save waits for a quiet keyboard; the other half
    // refused this working copy, as an edit and as a whole copy (apart until
    // Revert or an Apply; Save is BUSY); the edit mode is not stored yet.
    PEER_STORAGE_PAUSED: 1 << 10,
    PEER_REFUSED: 1 << 11,
    MODE_NOT_STORED: 1 << 12,
    ADJUSTMENT_PENDING: 1 << 13,
    // The master half's profile storage stopped, or the slave half says its
    // did: only a restart clears it (firmware D-F34).
    STOPPED: 1 << 14,
    PEER_STOPPED: 1 << 15,
});
const KNOWN_EDIT_FLAGS = 0xffff;

// How the client's edits reach the keyboard, stored on the keyboard outside
// every profile. A keyboard never set is in Live + review.
const EDIT_MODE = Object.freeze({APPLY: 0, LIVE: 1, LIVE_REVIEW: 2});
const SPLICE_FLAGS = Object.freeze({CREATE: 1 << 0, DROP: 1 << 1});

const ProfileEditProtocolError = protocolError("ProfileEditProtocolError");

/** @param {number} value @param {number} transactionId */
function header(value, transactionId) {
    const report = Buffer.alloc(RAW_HID_REPORT_SIZE);
    report[0] = PROFILE_EDIT_V1.COMMAND_SET;
    report[1] = PROFILE_EDIT_V1.CHANNEL;
    report[2] = value;
    report.writeUInt16LE(u16(transactionId, "transactionId", {nonzero: true}), 3);
    return report;
}

/** @param {number} transactionId @param {{session: number, revision: number, splices: number, insertTotal: number, replacement?: boolean}} begin */
function buildEditBeginRequest(transactionId, {session, revision, splices, insertTotal, replacement = false}) {
    const report = header(PROFILE_EDIT_V1.VALUE_BEGIN, transactionId);
    const count = u8(splices, "splice count");
    if (replacement ? count !== 0 : count < 1 || count > PROFILE_EDIT_V1.MAX_SPLICES) throw new RangeError(replacement ? "A replacement has no splices." : "An edit has 1 to 8 splices.");
    report.writeUInt32LE(u32(session, "session"), 5);
    report.writeUInt32LE(u32(revision, "revision"), 9);
    report[13] = count;
    report[14] = replacement ? 1 : 0;
    report.writeUInt32LE(u32(insertTotal, "inserted bytes"), 15);
    return report;
}

/** @param {number} transactionId @param {number} index @param {import("./types.js").EditSplice} splice */
function buildEditSpliceRequest(transactionId, index, {domainId, offset, remove, insert, create = false, drop = false}) {
    const report = header(PROFILE_EDIT_V1.VALUE_SPLICE, transactionId);
    report[5] = u8(index, "splice index");
    report[6] = u8(domainId, "domain id", {nonzero: true});
    report[7] = (create ? SPLICE_FLAGS.CREATE : 0) | (drop ? SPLICE_FLAGS.DROP : 0);
    if (create && drop) throw new RangeError("A splice cannot both create and drop a domain.");
    report.writeUInt32LE(u32(offset, "splice offset"), 8);
    report.writeUInt32LE(u32(remove, "removed bytes"), 12);
    report.writeUInt32LE(u32(insert, "inserted bytes"), 16);
    return report;
}

/** @param {number} transactionId @param {number} offset @param {Uint8Array} bytes */
function buildEditDataRequest(transactionId, offset, bytes) {
    const data = asBytes(bytes, "edit data");
    if (data.length < 1 || data.length > PROFILE_EDIT_V1.DATA_MAX) throw new RangeError(`An edit data report carries 1 to ${PROFILE_EDIT_V1.DATA_MAX} bytes.`);
    const report = header(PROFILE_EDIT_V1.VALUE_DATA, transactionId);
    report.writeUInt32LE(u32(offset, "stream offset"), 5);
    report[9] = data.length;
    data.copy(report, 10);
    return report;
}

/** @param {number} transactionId @param {Uint8Array} stream the whole inserted stream */
function buildEditCommitRequest(transactionId, stream) {
    const report = header(PROFILE_EDIT_V1.VALUE_COMMIT, transactionId);
    report.writeUInt32LE(crc32(asBytes(stream, "edit stream")), 5);
    return report;
}

/** @param {number} transactionId */
const buildEditAbortRequest = (transactionId) => header(PROFILE_EDIT_V1.VALUE_ABORT, transactionId);

/** @param {number} value @param {number} transactionId @param {{session: number, revision: number}} identity */
function identityRequest(value, transactionId, {session, revision}) {
    const report = header(value, transactionId);
    report.writeUInt32LE(u32(session, "session"), 5);
    report.writeUInt32LE(u32(revision, "revision"), 9);
    return report;
}
/** @param {number} transactionId @param {{session: number, revision: number}} identity */
const buildSaveRequest = (transactionId, identity) => identityRequest(PROFILE_EDIT_V1.VALUE_SAVE, transactionId, identity);
/** @param {number} transactionId @param {{session: number, revision: number}} identity */
const buildRevertRequest = (transactionId, identity) => identityRequest(PROFILE_EDIT_V1.VALUE_REVERT, transactionId, identity);
// Restart: the confirmation is what keeps a stray report from restarting
// the keyboard. Taken in any state; the keyboard drops off USB right after
// its answer.
/** @param {number} transactionId */
function buildRestartRequest(transactionId) {
    const report = header(PROFILE_EDIT_V1.VALUE_RESTART, transactionId);
    report.writeUInt32LE(PROFILE_EDIT_V1.RESTART_CONFIRM, 5);
    return report;
}
/** @param {number} transactionId @param {number} mode */
function buildEditModeRequest(transactionId, mode) {
    if (!(/** @type {number[]} */ (Object.values(EDIT_MODE))).includes(mode)) throw new RangeError("Unknown edit mode.");
    const report = header(PROFILE_EDIT_V1.VALUE_MODE, transactionId);
    report[5] = mode;
    return report;
}

/** @param {Uint8Array} response @param {Uint8Array} request */
function editReplyMatcher(response, request) {
    const actual = normalizeRawHidReport(response, "edit reply"), sent = normalizeRawHidReport(request, "edit request");
    return actual.subarray(0, 5).equals(sent.subarray(0, 5));
}

// The answer to every SET: its result and where the working copy is now. A
// restart's answer also says, in byte 17, whether the slave half took it.
/** @param {Uint8Array} response @param {Uint8Array} request @returns {import("./types.js").EditReply} */
function decodeEditReply(response, request) {
    const report = Buffer.from(normalizeRawHidReport(response, "edit reply"));
    if (!editReplyMatcher(report, request)) throw new ProfileEditProtocolError("CORRELATION_MISMATCH", "The edit reply does not match its request.");
    const restart = report[2] === PROFILE_EDIT_V1.VALUE_RESTART;
    if (report.subarray(restart ? 18 : 17).some(byte => byte !== 0) || (restart && report[17] > 1)) throw new ProfileEditProtocolError("NONCANONICAL_RESPONSE", "The edit reply has nonzero trailing bytes.");
    const result = report[5], flags = report.readUInt16LE(15);
    if (!(result in EDIT_RESULT_NAMES)) throw new ProfileEditProtocolError("INCOMPATIBLE_RESPONSE", `Unknown edit result ${result}.`);
    if (flags & ~KNOWN_EDIT_FLAGS) throw new ProfileEditProtocolError("INCOMPATIBLE_RESPONSE", "The edit reply has unknown flags.");
    return {result, resultName: EDIT_RESULT_NAMES[result], phase: report[6], session: report.readUInt32LE(7), revision: report.readUInt32LE(11), flags,
        ...(restart ? {peerAcknowledged: report[17] === 1} : {})};
}

/** @param {import("../transport/types.js").RequestConnection} connection @param {Buffer} request @param {import("./types.js").ReadOptions} [options] */
async function sendEditRequest(connection, request, options = {}) {
    const response = await requestHandled(connection, request, {matchResponse: editReplyMatcher, signal: options.signal, timeoutMs: options.timeoutMs}, "a live edit");
    return decodeEditReply(response, request);
}

/** @param {number} flags */
const flagsOf = flags => ({
    unsaved: Boolean(flags & EDIT_FLAGS.UNSAVED),
    peerRequired: Boolean(flags & EDIT_FLAGS.PEER_REQUIRED),
    peerConverged: Boolean(flags & EDIT_FLAGS.PEER_CONVERGED),
    peerKnown: Boolean(flags & EDIT_FLAGS.PEER_KNOWN),
    editsBlocked: Boolean(flags & EDIT_FLAGS.EDITS_BLOCKED),
    savedCompiled: Boolean(flags & EDIT_FLAGS.SAVED_COMPILED),
    saving: Boolean(flags & EDIT_FLAGS.SAVING),
    modeConflict: Boolean(flags & EDIT_FLAGS.MODE_CONFLICT),
    waitingSafe: Boolean(flags & EDIT_FLAGS.WAITING_SAFE),
    storagePaused: Boolean(flags & EDIT_FLAGS.STORAGE_PAUSED),
    peerStoragePaused: Boolean(flags & EDIT_FLAGS.PEER_STORAGE_PAUSED),
    peerRefused: Boolean(flags & EDIT_FLAGS.PEER_REFUSED),
    modeNotStored: Boolean(flags & EDIT_FLAGS.MODE_NOT_STORED),
    adjustmentPending: Boolean(flags & EDIT_FLAGS.ADJUSTMENT_PENDING),
    stopped: Boolean(flags & EDIT_FLAGS.STOPPED),
    peerStopped: Boolean(flags & EDIT_FLAGS.PEER_STOPPED),
});

// Edit status: page 0 this half, page 1 the other half and the save, page 2
// where the last refused edit failed, page 3 the keyboard's own saves.
/** @param {Buffer[]} pages @returns {import("./types.js").EditStatus} */
function decodeEditStatusPages([local, peer, error, auto]) {
    for (const page of [peer, error]) if (!page || page.length !== 25) throw new ProfileEditProtocolError("MALFORMED_RESPONSE", "An edit status page has 25 bytes.");
    if (error.subarray(22).some(byte => byte !== 0)) throw new ProfileEditProtocolError("NONCANONICAL_RESPONSE", "Reserved edit status bytes must be zero.");
    return {
        ...decodeEditProgress(local),
        peer: {phase: peer[0], lastResult: peer[1], transactionId: peer.readUInt16LE(2), session: peer.readUInt32LE(4), revision: peer.readUInt32LE(8),
            unsaved: Boolean(peer[12] & 1), savedCompiled: Boolean(peer[12] & 2), mode: peer[24]},
        save: {phase: peer[13], lastResult: peer[14], lastError: peer[15], transactionId: peer.readUInt16LE(16), lastTransactionId: peer.readUInt16LE(18)},
        insertedReceived: peer.readUInt32LE(20),
        refusal: {validatorResult: error[0], domainId: error[1], tableId: error[2], row: error.readUInt16LE(3), step: error[5], field: error[6],
            byteOffset: error.readUInt32LE(7), detailKind: error[11], detailCode: error.readUInt16LE(12)},
        safeBoundaryReasons: error.readUInt32LE(14), activeLength: error.readUInt32LE(18),
        autoSave: decodeAutoSavePage(auto),
    };
}

// Page 3: the saves the keyboard made by itself (Live, and adjustment keys in
// Apply) since this USB half booted. The counter names an event between
// polls; only a success counts, and a failure is the save's on page 1.
/** @param {Buffer} page @returns {import("./types.js").AutoSaveStatus} */
function decodeAutoSavePage(page) {
    if (!page || page.length !== 25) throw new ProfileEditProtocolError("MALFORMED_RESPONSE", "An edit status page has 25 bytes.");
    if (page[0] !== PROFILE_EDIT_V1.AUTO_SAVE_LAYOUT) throw new ProfileEditProtocolError("INCOMPATIBLE_RESPONSE", `Unsupported automatic save layout ${page[0]}.`);
    if (page[1] & ~3) throw new ProfileEditProtocolError("INCOMPATIBLE_RESPONSE", "The automatic save status has unknown flags.");
    if (page.subarray(16).some(byte => byte !== 0)) throw new ProfileEditProtocolError("NONCANONICAL_RESPONSE", "Reserved edit status bytes must be zero.");
    return {inProgress: Boolean(page[1] & 1), lastWasAutomatic: Boolean(page[1] & 2), count: page.readUInt32LE(2),
        revision: page.readUInt32LE(6), generation: page.readUInt32LE(10), quietMs: page.readUInt16LE(14)};
}

/** @param {import("../transport/types.js").RequestConnection} connection @param {number} value @param {number} page @param {import("./types.js").ReadOptions & {nextRequestId: () => number}} options */
async function getPage(connection, value, page, options) {
    const request = buildProfileGetRequest(value, page, options.nextRequestId());
    const response = await requestHandled(connection, request, {matchResponse: profileResponseMatcher, signal: options.signal, timeoutMs: options.timeoutMs},
        `Profile Wire value ${value} page ${page}`);
    return Buffer.from(decodeProfileResponse(response, request, {allowShortPayload: true}));
}

// Page 0 alone: this half's working copy, what polling an edit needs.
/** @param {Buffer} local @returns {import("./types.js").EditProgress} */
function decodeEditProgress(local) {
    if (!local || local.length !== 25) throw new ProfileEditProtocolError("MALFORMED_RESPONSE", "An edit status page has 25 bytes.");
    if (local[0] !== PROFILE_EDIT_V1.STATUS_LAYOUT) throw new ProfileEditProtocolError("INCOMPATIBLE_RESPONSE", `Unsupported edit status layout ${local[0]}.`);
    const flags = local.readUInt16LE(2);
    if (flags & ~KNOWN_EDIT_FLAGS) throw new ProfileEditProtocolError("INCOMPATIBLE_RESPONSE", "The edit status has unknown flags.");
    if (local[24] !== 0) throw new ProfileEditProtocolError("NONCANONICAL_RESPONSE", "Reserved edit status bytes must be zero.");
    return {
        phase: local[1], flags, ...flagsOf(flags),
        session: local.readUInt32LE(4), revision: local.readUInt32LE(8),
        savedGeneration: local.readUInt32LE(12), savedOrigin: local[16],
        lastResult: local[17], lastTransactionId: local.readUInt16LE(18), transactionId: local.readUInt16LE(20),
        mode: local[22], splicesReceived: local[23],
    };
}
/** @param {import("../transport/types.js").RequestConnection} connection @param {import("./types.js").ReadOptions & {nextRequestId: () => number}} options */
async function readEditProgress(connection, options) {
    return decodeEditProgress(await getPage(connection, PROFILE_EDIT_V1.VALUE_STATUS, 0, options));
}

/** @param {import("../transport/types.js").RequestConnection} connection @param {import("./types.js").ReadOptions & {nextRequestId: () => number}} options */
async function readEditStatus(connection, options) {
    const pages = [];
    for (let page = 0; page < PROFILE_EDIT_V1.STATUS_PAGES; page++) pages.push(await getPage(connection, PROFILE_EDIT_V1.VALUE_STATUS, page, options));
    return decodeEditStatusPages(pages);
}

/** @param {Buffer} page @returns {import("./types.js").EditModeRead} */
function decodeEditModePage(page) {
    if (page.length !== 11) throw new ProfileEditProtocolError("MALFORMED_RESPONSE", "The edit mode page has 11 bytes.");
    if (page[10] & ~7) throw new ProfileEditProtocolError("INCOMPATIBLE_RESPONSE", "The edit mode page has unknown flags.");
    return {mode: page[0], counter: page.readUInt32LE(1), peerMode: page[5], peerCounter: page.readUInt32LE(6),
        peerKnown: Boolean(page[10] & 1), conflict: Boolean(page[10] & 2), agreed: Boolean(page[10] & 4)};
}
/** @param {import("../transport/types.js").RequestConnection} connection @param {import("./types.js").ReadOptions & {nextRequestId: () => number}} options */
async function readEditMode(connection, options) {
    return decodeEditModePage(await getPage(connection, PROFILE_EDIT_V1.VALUE_MODE, 0, options));
}

// The toggles' stored masters and runtime overrides, then QMK's live values
// in the settings scalars' encodings.
/** @param {Buffer} page @returns {import("./types.js").RuntimeRead} */
function decodeRuntimePage(page) {
    if (page.length !== 24) throw new ProfileEditProtocolError("MALFORMED_RESPONSE", "The runtime page has 24 bytes.");
    if (page.subarray(0, 4).some(byte => byte > 1)) throw new ProfileEditProtocolError("NONCANONICAL_RESPONSE", "Toggle bytes are 0 or 1.");
    return {
        combos: {master: page[0] === 1, override: page[1] === 1},
        behaviours: {master: page[2] === 1, override: page[3] === 1},
        live: {defaultDpi: page.readUInt16LE(4), snipingDpi: page.readUInt16LE(6), rgbMode: page.readUInt32LE(8), rgbColor: page.readUInt32LE(12),
            defaultLayers: page.readUInt32LE(16), keymapOptions: page.readUInt32LE(20)},
    };
}
/** @param {import("../transport/types.js").RequestConnection} connection @param {import("./types.js").ReadOptions & {nextRequestId: () => number}} options */
async function readRuntime(connection, options) {
    return decodeRuntimePage(await getPage(connection, PROFILE_EDIT_V1.VALUE_RUNTIME, 0, options));
}

/** @param {Buffer} page @returns {import("./types.js").ActiveProfileMetadata} */
function decodeActiveMetadata(page) {
    if (page.length !== 25 || page[0] !== PROFILE_EDIT_V1.ACTIVE_LAYOUT || page[1] !== PROFILE_EDIT_V1.PAGE_SIZE) throw new ProfileEditProtocolError("INCOMPATIBLE_RESPONSE", "Unsupported active profile metadata.");
    if (page[20] & ~1 || page.subarray(21).some(byte => byte !== 0)) throw new ProfileEditProtocolError("NONCANONICAL_RESPONSE", "Reserved active profile bytes must be zero.");
    return {length: page.readUInt32LE(2), session: page.readUInt32LE(6), revision: page.readUInt32LE(10), savedGeneration: page.readUInt32LE(14),
        savedOrigin: page[18], domainMask: page[19], unsaved: Boolean(page[20] & 1)};
}

// The profile the keyboard runs now (its working copy, or the saved profile),
// paged as the saved profile is. Page 0 read again after the bytes with the
// same session and revision proves the bytes are one revision.
/** @param {import("../transport/types.js").RequestConnection} connection @param {import("./types.js").ReadOptions & {nextRequestId: () => number, onProgress?: (progress: {done: number, total: number}) => void, maxLength?: number}} options */
async function readActiveProfile(connection, options) {
    const metadata = decodeActiveMetadata(await getPage(connection, PROFILE_EDIT_V1.VALUE_ACTIVE, 0, options));
    if (metadata.length < 8 || metadata.length > (options.maxLength ?? 130048)) throw new ProfileEditProtocolError("INCOMPATIBLE_RESPONSE", "The active profile's length is out of range.");
    const bytes = Buffer.alloc(metadata.length);
    for (let offset = 0, page = 1; offset < metadata.length; offset += PROFILE_EDIT_V1.PAGE_SIZE, page++) {
        const chunk = await getPage(connection, PROFILE_EDIT_V1.VALUE_ACTIVE, page, options);
        if (chunk.length !== Math.min(PROFILE_EDIT_V1.PAGE_SIZE, metadata.length - offset)) throw new ProfileEditProtocolError("MALFORMED_RESPONSE", "Truncated active profile page.");
        chunk.copy(bytes, offset);
        options.onProgress?.({done: Math.min(metadata.length, offset + chunk.length), total: metadata.length});
    }
    const after = decodeActiveMetadata(await getPage(connection, PROFILE_EDIT_V1.VALUE_ACTIVE, 0, options));
    if (JSON.stringify(after) !== JSON.stringify(metadata)) throw Object.assign(new Error("The keyboard's profile changed while it was being read. Read it again."), {code: "PROFILE_CHANGED"});
    return {metadata, bytes};
}

module.exports = {PROFILE_EDIT_V1, EDIT_RESULT, EDIT_RESULT_NAMES, EDIT_PHASE, EDIT_FLAGS, EDIT_MODE, SPLICE_FLAGS, ProfileEditProtocolError,
    buildEditBeginRequest, buildEditSpliceRequest, buildEditDataRequest, buildEditCommitRequest, buildEditAbortRequest,
    buildSaveRequest, buildRevertRequest, buildEditModeRequest, buildRestartRequest, editReplyMatcher, decodeEditReply, sendEditRequest,
    decodeEditStatusPages, decodeAutoSavePage, readEditStatus, decodeEditProgress, readEditProgress, decodeEditModePage, readEditMode, decodeRuntimePage, readRuntime,
    decodeActiveMetadata, readActiveProfile};
