// @ts-check
"use strict";
const {normalizeRawHidReport} = require("../transport/device-adapter");
const {isUnhandledEcho} = require("./via-unhandled-v1");
const {buildProfileGetRequest, decodeProfileResponse, profileResponseMatcher, ProfileWireProtocolError} = require("./profile-wire-v1");
/** @typedef {import('../../contracts/lighting-live.js').LightingLiveCapability} Capability */
/** @typedef {import('../../contracts/lighting-live.js').LightingLiveStatus} Status */
const SLICE_LENGTHS = Object.freeze({1: 2, 2: 1, 3: 11, 4: 16, 5: 61, 7: 40, 8: 180, 9: 64, 10: 11, 11: 40, 12: 180, 13: 1, 14: 8, 15: 2, 16: 1, 17: 1, 18: 1});
const LIVE = Object.freeze({FACTS: 14, STATUS: 15, CONTROL: 29, CAPTURE: 1, BEGIN: 2, CHUNK: 3, PUBLISH: 4, RENEW: 5, END: 6});
const LIVE_STATUS = Object.freeze({OK: 0, MALFORMED: 1, UNKNOWN_PAGE: 2, UNAVAILABLE: 3, PENDING: 4, STALE: 5, BUSY: 6, RANGE: 7, CONFLICT: 8, PROFILE_CHANGED: 9, PEER_UNAVAILABLE: 10});
/** @param {string} code @param {string} message @returns {never} */
function fail(code, message) {throw new ProfileWireProtocolError(code, message);}
/** @param {number} n @param {number} max @param {boolean} [nonzero] */
function integer(n, max, nonzero = false) {if (!Number.isInteger(n) || n < (nonzero ? 1 : 0) || n > max) fail("LIVE_RANGE", "Invalid lighting request identity or bounds.");return n;}
/** @param {Uint8Array} input @returns {Capability} */
function decodeLiveCapability(input) {
    const p = Buffer.from(input);
    if (p.length !== 25 || p[0] !== 1 || p[1] & ~3 || p[2] !== 1 || p[3] !== 1 || p[4] !== 14 || p[5] !== 15 || p[6] !== 29 || p[7] !== 8 || p[8] < 2 || p[8] > 64 || !p[9] || p[9] >= p[8] || p.readUInt16LE(10) !== 3 * p[8] || p.readUInt16LE(12) !== 2000 || p.readUInt16LE(14) > 5307 || p[16] !== 48 || p[17] !== 1 || p.readUInt16LE(18) !== 2000 || p.readUInt16LE(20) !== 500 || p.subarray(22).some(Boolean)) fail("LIVE_CAPABILITY", "This keyboard's Live lighting format or bounds are not supported by this Ark.");
    return {facts: Boolean(p[1] & 1), frame: Boolean(p[1] & 2), chunkMax: p[7], ledCount: p[8], leftCount: p[9], frameBytes: p.readUInt16LE(10), leaseMs: p.readUInt16LE(12), factsBytes: p.readUInt16LE(14), metadataBytes: p[16], stagingLeaseMs: p.readUInt16LE(18), renewMs: p.readUInt16LE(20)};
}
/** @param {import('../transport/types.js').RequestConnection} connection @param {import('./types.js').ReadOptions} [options] @returns {Promise<import('../../contracts/lighting-live.js').LightingLiveSupport>} */
async function readLiveCapability(connection, options = {}) {
    const request = buildProfileGetRequest(13, 16, options.nextRequestId?.() ?? 1);
    const reply = await connection.request(request, {signal: options.signal, timeoutMs: options.timeoutMs, matchResponse: liveResponseMatcher});
    try {
        if (isUnhandledEcho(reply, request)) return {available: false, reason: "This firmware does not offer Live lighting."};
        const capability = decodeLiveCapability(decodeProfileResponse(reply, request, {allowShortPayload: true}));
        return {available: capability.facts || capability.frame, reason: capability.facts || capability.frame ? "" : "This keyboard does not offer Live lighting or temporary frames.", capability};
    } catch (error) {
        if (!(error instanceof ProfileWireProtocolError)) throw error;
        return {available: false, reason: error.code === "DEVICE_REJECTED" ? "This firmware does not offer Live lighting. Update both halves to use it." : "This keyboard's Live lighting information is not supported. Update Ark and both halves together."};
    }
}
/** @param {number} value @param {number} page @param {number} identity @param {number} requestId */
function buildLiveRead(value, page, identity, requestId) {
    if (value !== LIVE.FACTS && value !== LIVE.STATUS || !identity && (value === LIVE.FACTS || page)) fail("LIVE_IDENTITY", "A lighting page needs its exact nonzero capture or status identity.");
    const r = Buffer.alloc(32);r.set([8, 0, value, integer(requestId, 255, true), integer(page, 255)]);r.writeUInt32LE(integer(identity, 0xffffffff), 5);return r;
}
/** @param {number} operation @param {number} requestId @param {{owner?: number[]; token?: number; revision?: number; digest?: number; frameBytes?: number; crc32?: number; offset?: number; bytes?: Uint8Array; renewal?: number}} [fields] */
function buildLiveControl(operation, requestId, fields = {}) {
    const r = Buffer.alloc(32);r.set([7, 0, 29, integer(requestId, 255, true), integer(operation, 6, true)]);
    if (operation === LIVE.CAPTURE) return r;
    if (!fields.owner || fields.owner.length !== 8 || !fields.owner.some(Boolean) || fields.owner.some(n => !Number.isInteger(n) || n < 0 || n > 255)) fail("LIVE_IDENTITY", "A temporary frame needs a fresh owner identity.");
    r.set(fields.owner, 5);
    if (operation === LIVE.BEGIN) {
        r.writeUInt32LE(integer(fields.revision ?? 0, 0xffffffff, true), 13);r.writeUInt32LE(integer(fields.digest ?? -1, 0xffffffff), 17);
        r.writeUInt16LE(integer(fields.frameBytes ?? 0, 192, true), 21);r.writeUInt32LE(integer(fields.crc32 ?? -1, 0xffffffff), 23);
    } else {
        r.writeUInt32LE(integer(fields.token ?? 0, 0xffffffff, true), 13);r.writeUInt32LE(integer(fields.revision ?? 0, 0xffffffff, true), 17);
        if (operation === LIVE.CHUNK) {
            const bytes = fields.bytes ?? new Uint8Array();integer(bytes.length, 8, true);r.writeUInt16LE(integer(fields.offset ?? -1, 192), 21);r[23] = bytes.length;r.set(bytes, 24);
        } else if (operation === LIVE.RENEW) r.writeUInt32LE(integer(fields.renewal ?? 0, 0xffffffff, true), 21);
    }
    return r;
}
/** @param {Uint8Array} response @param {Uint8Array} request */
function liveResponseMatcher(response, request) {return profileResponseMatcher(response, request) || isUnhandledEcho(response, request);}
/** @param {Uint8Array} response @param {Uint8Array} request */
function decodeLiveResponse(response, request) {
    const r = Buffer.from(normalizeRawHidReport(response, "Lighting Live response"));
    if (isUnhandledEcho(r, request)) fail("LIVE_UNAVAILABLE", "This keyboard does not handle Live lighting.");
    if (!request[3] || !profileResponseMatcher(r, request)) fail("LIVE_CORRELATION", "Lighting reply belongs to a different request.");
    if (r[5] > 10 || r[6] > 25 || r.subarray(7 + r[6]).some(Boolean) || r[5] && r[6] || request[0] === 7 && r[6]) fail("LIVE_MALFORMED", "Lighting reply has invalid status, length or padding.");
    return {status: r[5], payload: r.subarray(7, 7 + r[6])};
}
/** @param {Uint8Array[]} pages @returns {Status} */
function decodeLiveStatus(pages) {
    if (pages.length !== 3 || pages.some(p => p.length !== 25)) fail("LIVE_MALFORMED", "Lighting status needs three complete pages.");
    const [a, b, c] = pages.map(p => Buffer.from(p)), revision = a.readUInt32LE();
    if (!revision || b.readUInt32LE() !== revision || c.readUInt32LE() !== revision) fail("LIVE_STALE", "Lighting status changed during the read.");
    const p = a.subarray(4), q = b.subarray(4), s = c.subarray(4);
    if (p[0] !== 1 || p[1] > 6 || p[3] > 10 || p[4] > 8 || p[5] > 6 || p[6] & ~30 || p[19] > 10 || p[20] & ~2 || q[20] > 1 || s[4] > 1) fail("LIVE_MALFORMED", "Lighting status uses an unsupported layout.");
    return {revision, operation: p[1], requestId: p[2], result: p[3], state: p[4], rpc: p[5], flags: p[6], token: p.readUInt32LE(7), frameRevision: p.readUInt32LE(11), offset: p.readUInt16LE(15), frameBytes: p.readUInt16LE(17), peerResult: p[19], guard: p[20], owner: [...q.subarray(0, 8)], started: q.readUInt32LE(8), renewal: q.readUInt32LE(12), crc32: q.readUInt32LE(16), role: q[20], snapshotId: s.readUInt32LE(), snapshotReady: Boolean(s[4]), profileDigest: s.readUInt32LE(5), generation: s.readUInt32LE(9), captured: s.readUInt32LE(13), peerEpoch: s.readUInt32LE(17)};
}
/** @param {Uint8Array} input @param {Capability} cap @param {number} identity @returns {import('../../contracts/lighting-live.js').LightingLiveSample} */
function decodeLiveFacts(input, cap, identity) {
    const p = Buffer.from(input);
    if (p.length !== 48 + cap.factsBytes || p[0] !== 1 || p[1] !== 1 || p[2] !== 1 || p[3] !== 1 || !identity || p.readUInt32LE(4) !== identity || p.readUInt16LE(42) !== p.length || p[45] !== cap.ledCount || p[46] !== cap.leftCount || !p[47] || p[47] > 64) fail("LIVE_MALFORMED", "Lighting sample has unsupported source, identity or geometry.");
    /** @type {Record<number, number[]>} */ const slices = {};let at = 48, prior = 0;
    for (let n = 0; n < p[44]; n++) {
        if (at + 3 > p.length) fail("LIVE_MALFORMED", "Lighting sample has a truncated slice header.");
        const id = p[at], size = p.readUInt16LE(at + 1);at += 3;
        if (id <= prior || !size || at + size > p.length) fail("LIVE_MALFORMED", "Lighting sample has invalid slice order or bounds.");
        if (p[47] !== 60 || /** @type {Record<number, number>} */ (SLICE_LENGTHS)[id] !== size) fail("LIVE_UNSUPPORTED_FACTS", "This sample uses a fact producer layout this Ark cannot interpret.");
        slices[id] = [...p.subarray(at, at + size)];at += size;prior = id;
    }
    if (at !== p.length) fail("LIVE_MALFORMED", "Lighting sample has trailing bytes.");
    return {id: identity, captured: p.readUInt32LE(8), generation: p.readUInt32LE(12), keymapGeneration: p.readUInt32LE(16), profile: {generation: p.readUInt32LE(20), crc32: p.readUInt32LE(24), digest: p.readUInt32LE(28), compiledDigest: p.readUInt32LE(32), actionAbi: p.readUInt32LE(36), kind: p[40], origin: p[41]}, source: "master-main", ledCount: p[45], leftCount: p[46], matrixKeys: p[47], slices};
}
module.exports = {LIVE, LIVE_STATUS, decodeLiveCapability, readLiveCapability, buildLiveRead, buildLiveControl, liveResponseMatcher, decodeLiveResponse, decodeLiveStatus, decodeLiveFacts};
