// @ts-check
"use strict";

// A write-side adapter at the same report seam as fake-keyboard. The original
// fake stays read-only for previews. This fake models the host-visible durable
// decision and two VIA banks, not firmware scheduling or flash hardware.
const assert = require("node:assert/strict");
const {fakeKeyboard} = require("./fake-keyboard");
const {LIVE_LINK_ERROR_CODES, liveLinkError} = require("../../core/transport/device-adapter");
const {createSnapshot, validateSnapshot} = require("../../core/model/portable-profile");
const {crc32, fnv1a32, decodeProfileBlob} = require("../../core/schema/profile-blob-v1");
const {PROFILE_WIRE_V1, PROFILE_STATE_FLAGS} = require("../../core/protocol/profile-wire-v1");
const {PROFILE_CANDIDATE_V1: C, CANDIDATE_STATE: S, CANDIDATE_OPERATION: O,
    CANDIDATE_ERROR: E, CANDIDATE_ADMISSION: A, buildCandidateBeginRequest, buildCandidateValidateRequest, buildCandidateCommitRequest, buildCandidateAbortRequest, buildCandidateChunkRequest,
    buildCandidateReuseRequest} = require("../../core/protocol/profile-candidate-v1");

/** @param {import('./types.js').FakeKeyboardOptions} options */
function writableKeyboard(options) {
    const source = validateSnapshot(options.document);
    const local = {profile: Buffer.from(source.profile)};
    const slave = {profile: Buffer.from(source.profile)};
    let active = Buffer.from(source.candidate), activeGeneration = options.generation ?? 42;
    let activeKind = options.compiledOnly ? 0 : 1;
    let slaveGeneration = activeGeneration;
    let reader = fakeKeyboard(options);
    let candidate = Buffer.alloc(0), transactionId = 0, nextOffset = 0;
    /** @type {number} */
    let candidateState = S.IDLE;
    let digest = 0, checksum = 0, sequence = 0, errorSequence = 0, reportedError = 0;
    /** @type {number} */
    let operation = O.NONE;
    /** @type {number} */
    let error = E.NONE;
    let commitPolls = 0, durable = false, activated = false, authorityPending = false;
    /** @type {Buffer[]} */
    const requests = [];
    /** @type {Buffer[]} */
    const mutations = [];
    /** @type {Buffer[]} */
    const unhandled = [];
    /** @type {string[]} */
    const events = [];
    /** @type {import('./types.js').WritableKeyboardFaults} */
    const faults = {};
    const keyboard = {requests, mutations, unhandled, events, local, slave, faults, answer,
        get durable() {return durable;}, get active() {return Buffer.from(active);},
        get generation() {return activeGeneration;},
        // Simulate reconnect + firmware roll-forward from the accepted slave
        // half bank. No host writes are needed after the durable decision.
        recover() {
            if (!durable) throw Error("There is no durable decision to recover.");
            slave.profile = Buffer.from(candidate);
            faults.disconnected = false; activate();
        }};
    function activate() {
        if (faults.authorityFailed) return;
        if (!durable) return;
        local.profile = Buffer.from(candidate); slave.profile = Buffer.from(candidate);
        active = Buffer.from(candidate); activeGeneration++; activeKind = 1; slaveGeneration = activeGeneration;
        candidateState = S.IDLE; activated = true;
        const document = createSnapshot({profile: active, actionAbiDigest: options.document.actionAbiDigest});
        reader = fakeKeyboard({...options, document, compiled: options.compiled || source.candidate, compiledOnly: false, generation: activeGeneration});
        events.push("activated");
    }
    /** @param {Buffer} request @param {Buffer} payload */
    function response(request, payload) {
        const reply = Buffer.from(request); reply.fill(0, 5); reply[6] = payload.length;
        payload.copy(reply, PROFILE_WIRE_V1.PAYLOAD_OFFSET); return reply;
    }
    /** @param {Buffer} request @param {number} [admission] @param {number} [reason] */
    function ack(request, admission = A.QUEUED, reason = E.NONE) {
        const reply = Buffer.from(request); reply.fill(0, 5); reply[5] = admission; reply[6] = reason; reply[7] = 255; return reply;
    }
    function candidateStatus() {
        if (authorityPending) {
            // Terminal until the keyboard restarts; the master half requests
            // no ACCEPT after it.
            authorityPending = false; candidateState = S.AUTHORITY_FAILED; error = /** @type {number} */ (faults.authorityFailed?.error); sequence++; events.push("authority failed");
        }
        if (candidateState === S.PREPARING_PEER && !faults.stallCommit && commitPolls++ > 0) {
            durable = true; candidateState = S.CONVERGING_PEER; events.push("decision");
            authorityPending = Boolean(faults.authorityFailed);
            if (faults.disconnectAfterDecision) {faults.disconnected = true; throw Object.assign(Error("disconnected after durable decision"), {code: "DISCONNECTED"});}
        }
        else if (candidateState === S.CONVERGING_PEER && !authorityPending && !faults.authorityFailed && !faults.stallConvergence) activate();
        // The error sequence moves whenever the error does, as firmware's.
        if (error !== reportedError) {reportedError = error; errorSequence = (errorSequence + 1) & 0xffff;}
        const p = Buffer.alloc(25); p.set([C.STATUS_LAYOUT_VERSION, candidateState, operation, 0]);
        p.writeUInt16LE(transactionId, 4); p.writeUInt32LE(nextOffset, 6); p.writeUInt32LE(candidate.length, 10);
        p.writeUInt32LE(digest, 14); p[18] = error; p.writeUInt16LE(sequence, 19); p.writeUInt16LE(errorSequence, 21); return p;
    }
    // Page 3: where the error is (this fake knows no location), tied to page 0.
    function candidateError() {
        const p = Buffer.alloc(25); p.set([C.ERROR_LAYOUT_VERSION, error]); p.fill(255, 2, 12);
        p.writeUInt16LE(transactionId, 12); p.writeUInt16LE(sequence, 14); p.writeUInt16LE(errorSequence, 16); return p;
    }
    /** @param {Uint8Array} report */
    function answer(report) {
        if (faults.disconnected) throw Object.assign(Error("disconnected"), {code: "DISCONNECTED"});
        const request = Buffer.from(report); requests.push(request);
        const mutation = request[0] === C.COMMAND_SET || request[0] === C.COMMAND_SAVE;
        if (mutation) mutations.push(request);
        faults.beforeRequest?.(request, keyboard);
        const reply = serve(request);
        faults.afterRequest?.(request, reply, keyboard);
        if (faults.loseReply === request[2] && mutation) {
            // Lost as the transport says it: the request timed out.
            delete faults.loseReply; throw liveLinkError(LIVE_LINK_ERROR_CODES.TIMEOUT, "The keyboard did not answer in time.");
        }
        return [reply];
    }
    /** @param {Buffer} r */
    function serve(r) {
        const value = r[2], id = r.readUInt16LE(3);
        if (r[0] === PROFILE_WIRE_V1.COMMAND_GET && r[1] === 0) {
            if (value === C.VALUE_STATUS) {
                if (r.readUInt16LE(4) === 0) return response(r, candidateStatus());
                if (r.readUInt16LE(4) === C.ERROR_PAGE) return response(r, candidateError());
                const p = Buffer.alloc(25); p.set([C.PEER_STATUS_LAYOUT_VERSION, candidateState === S.PREPARING_PEER ? 4 : 0, faults.stallCommit ? 6 : 0, 2]);
                if (faults.stallCommit) {p.writeUInt16LE(3, 20); p[22] = 2;}
                return response(r, p);
            }
            const reply = reader.answer(r)[0];
            if (value === 2 && r.readUInt16LE(4) === 0) {
                let flags = reply.readUInt16LE(9);
                if (candidateState !== S.IDLE) flags |= PROFILE_STATE_FLAGS.CANDIDATE_PENDING;
                if (faults.cleanupPending) flags |= PROFILE_STATE_FLAGS.PEER_CLEANUP_PENDING;
                if (activated && faults.slaveUnseen) flags &= ~(PROFILE_STATE_FLAGS.PEER_KNOWN | PROFILE_STATE_FLAGS.PEER_CONVERGED);
                reply.writeUInt16LE(flags, 9);
            }
            if (value === 2 && r.readUInt16LE(4) === 1 && activated) reply.writeUInt16LE(transactionId, 7 + 17);
            return reply;
        }
        if ((r[0] === C.COMMAND_SET || r[0] === C.COMMAND_SAVE) && r[1] === 0) {
            if (faults.busy === value) {delete faults.busy; return ack(r, A.BUSY, E.MAILBOX_BUSY);}
            if (value === C.VALUE_BEGIN) {
                assert.equal(candidateState, S.IDLE); assert.ok(id > 0);
                assert.deepEqual(r, buildCandidateBeginRequest(id, {schemaMajor: r[5], schemaMinor: r[6], requestedDomains: r[7],
                    payloadLength: r.readUInt32LE(8), crc32: r.readUInt32LE(12), digest: r.readUInt32LE(16), actionAbiDigest: r.readUInt32LE(20)}));
                assert.equal(r[5], C.SCHEMA_MAJOR); assert.equal(r[6], C.SCHEMA_MINOR);
                assert.equal(r[7], 127); assert.equal(r.readUInt32LE(20), options.document.actionAbiDigest);
                assert.ok(r.subarray(24).every(byte => byte === 0), "BEGIN reserved bytes are zero");
                candidate = Buffer.alloc(r.readUInt32LE(8)); transactionId = id; digest = r.readUInt32LE(16); checksum = r.readUInt32LE(12);
                candidateState = S.RECEIVING; nextOffset = 0; operation = O.BEGIN; durable = false; activated = false; error = E.NONE; events.push("begin");
            } else {
                assert.equal(id, transactionId);
                if (value === C.VALUE_CHUNK || value === C.VALUE_STREAM_CHUNK) {
                    const offset = r.readUInt32LE(5), bytes = r.subarray(10, 10 + r[9]);
                    const canonical = buildCandidateChunkRequest(id, offset, bytes); canonical[2] = value; assert.deepEqual(r, canonical);
                    assert.equal(offset, nextOffset); bytes.copy(candidate, offset); nextOffset += bytes.length; operation = O.CHUNK;
                    candidateState = nextOffset === candidate.length ? S.COMPLETE : S.RECEIVING;
                } else if (value === C.VALUE_REUSE) {
                    const offset = r.readUInt32LE(5), sourceOffset = r.readUInt32LE(9), length = r.readUInt32LE(13);
                    const kind = activeKind, bytes = kind === 0 ? options.compiled || source.candidate : active;
                    const sourceIdentity = {kind, generation: kind === 0 ? 0 : activeGeneration, origin: kind === 0 ? 255 : 0, digest: fnv1a32(bytes), crc32: crc32(bytes)};
                    assert.deepEqual(r, buildCandidateReuseRequest(id, {offset, sourceOffset, length, source: sourceIdentity}));
                    assert.equal(offset, nextOffset); bytes.copy(candidate, offset, sourceOffset, sourceOffset + length); nextOffset += length; operation = O.REUSE;
                    candidateState = nextOffset === candidate.length ? S.COMPLETE : S.RECEIVING;
                } else if (value === C.VALUE_VALIDATE) {
                    assert.deepEqual(r, buildCandidateValidateRequest(id));
                    assert.equal(candidateState, S.COMPLETE); assert.equal(crc32(candidate), checksum); assert.equal(fnv1a32(candidate), digest); decodeProfileBlob(candidate);
                    candidateState = S.VALIDATED; operation = O.VALIDATE; events.push("validated");
                } else if (value === C.VALUE_COMMIT) {
                    assert.deepEqual(r, buildCandidateCommitRequest(id));
                    assert.equal(candidateState, S.VALIDATED);
                    candidateState = S.PREPARING_PEER; operation = O.COMMIT; commitPolls = 0; events.push("commit");
                } else if (value === C.VALUE_ABORT) {
                    assert.deepEqual(r, buildCandidateAbortRequest(id));
                    if (durable || faults.abortRejected) {events.push("abort refused"); return ack(r, A.REJECTED, E.INVALID_STATE);}
                    candidateState = S.IDLE; operation = O.ABORT; events.push("aborted");
                } else throw Error(`Unsupported write ${value}`);
            }
            sequence++; return ack(r);
        }
        const reply = reader.answer(r)[0]; if (reply[0] === 255) unhandled.push(r); return reply;
    }
    return keyboard;
}
module.exports = {writableKeyboard};
