// @ts-check
"use strict";

// A write-side adapter at the same report seam as fake-keyboard. The original
// fake stays read-only for previews. This fake models the host-visible durable
// decision and two VIA banks, not firmware scheduling or flash hardware.
const assert = require("node:assert/strict");
const {fakeKeyboard} = require("./fake-keyboard");
const {createSnapshot, validateSnapshot, macroBank} = require("../../core/model/portable-profile");
const {crc32, fnv1a32, decodeProfileBlob} = require("../../core/schema/profile-blob-v1");
const {VIA_STORAGE, viaStorageDigest} = require("../../core/protocol/via-storage-v1");
const {PROFILE_WIRE_V1, PROFILE_STATE_FLAGS} = require("../../core/protocol/profile-wire-v1");
const {PROFILE_CANDIDATE_V1: C, CANDIDATE_STATE: S, CANDIDATE_OPERATION: O,
    CANDIDATE_ERROR: E, CANDIDATE_ADMISSION: A, buildCandidateBeginRequest, buildCandidateValidateRequest, buildCandidateCommitRequest, buildCandidateAbortRequest, buildCandidateChunkRequest,
    buildCandidateReuseRequest} = require("../../core/protocol/profile-candidate-v1");
const {LOGICAL_VIA_STAGE_V1: V, LOGICAL_VIA_STATE: VS, buildLogicalViaBeginRequest, buildLogicalViaVerifyRequest, buildLogicalViaChunkRequest} = require("../../core/protocol/logical-via-stage-v1");

/** @param {import('./types.js').FakeKeyboardOptions} options */
function writableKeyboard(options) {
    const source = validateSnapshot(options.document);
    source.macros = macroBank(options.document.macros.map(value => Buffer.from(value, "base64")), 34903);
    const local = {layout: Buffer.from(source.layout), macros: Buffer.from(source.macros)};
    const peer = {layout: Buffer.from(local.layout), macros: Buffer.from(local.macros)};
    let active = Buffer.from(source.profile), activeGeneration = options.generation ?? 42;
    let activeKind = options.compiledOnly ? 0 : 1;
    let peerGeneration = activeGeneration;
    let reader = fakeKeyboard(options), storageGeneration = activeGeneration;
    let candidate = Buffer.alloc(0), transactionId = 0, nextOffset = 0;
    /** @type {number} */
    let candidateState = S.IDLE;
    let digest = 0, checksum = 0, sequence = 0;
    /** @type {number} */
    let operation = O.NONE;
    /** @type {number} */
    let error = E.NONE;
    let viaSequence = 0, viaGeneration = 0, viaDigest = 0, viaTransaction = 0, viaPending = false;
    /** @type {number} */
    let viaState = VS.IDLE;
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
    const keyboard = {requests, mutations, unhandled, events, local, peer, faults, answer,
        get durable() {return durable;}, get active() {return Buffer.from(active);},
        get generation() {return storageGeneration;},
        // Simulate reconnect + firmware roll-forward from the accepted peer
        // bank. No host writes are needed after the durable decision.
        recover() {
            if (!durable) throw Error("There is no durable decision to recover.");
            peer.layout.copy(local.layout); peer.macros.copy(local.macros);
            faults.disconnected = false; activate();
        }};
    function activate() {
        if (faults.authorityFailed) return;
        if (!durable || viaStorageDigest(local) !== viaDigest) return;
        active = Buffer.from(candidate); storageGeneration = viaGeneration; activeGeneration = viaGeneration; activeKind = 1; peerGeneration = viaGeneration;
        candidateState = S.IDLE; viaState = VS.IDLE; activated = true;
        const document = createSnapshot({profile: active, actionAbiDigest: options.document.actionAbiDigest,
            via: {layers: 16, macroSlots: 128, ...local}});
        reader = fakeKeyboard({...options, document, compiled: options.compiled || source.profile, compiledOnly: false, generation: activeGeneration});
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
            const accept = faults.authorityFailed?.accept ?? "acknowledged";
            durable = true; peerGeneration = viaGeneration; candidateState = S.CONVERGING_PEER; events.push("decision");
            if (accept === "acknowledged") viaState = VS.ACCEPTED;
            viaPending = accept === "queued";
            authorityPending = Boolean(faults.authorityFailed);
            if (faults.disconnectAfterDecision) {faults.disconnected = true; throw Object.assign(Error("disconnected after durable decision"), {code: "DISCONNECTED"});}
        }
        const p = Buffer.alloc(25); p.set([1, candidateState, operation, 0]);
        p.writeUInt16LE(transactionId, 4); p.writeUInt16LE(nextOffset, 6); p.writeUInt16LE(candidate.length, 8);
        p.writeUInt32LE(digest, 10); p[14] = error; p.fill(255, 15, 23); p.writeUInt16LE(sequence, 23); return p;
    }
    function viaStatus() {
        const p = Buffer.alloc(18); p.set([1, viaState, viaState === VS.ERROR ? 9 : 0, viaPending ? 1 : 0]);
        p.writeUInt16LE(viaTransaction, 4); p.writeUInt16LE(viaSequence, 6);
        p.writeUInt32LE(viaGeneration, 8); p.writeUInt32LE(viaDigest, 12); return p;
    }
    /** @param {Uint8Array} report */
    function answer(report) {
        if (faults.disconnected) throw Object.assign(Error("disconnected"), {code: "DISCONNECTED"});
        const request = Buffer.from(report); requests.push(request);
        const mutation = request[0] === C.COMMAND_SET || request[0] === C.COMMAND_SAVE || request[0] === VIA_STORAGE.LAYOUT_WRITE || request[0] === VIA_STORAGE.MACRO_WRITE;
        if (mutation) mutations.push(request);
        faults.beforeRequest?.(request, keyboard);
        const reply = serve(request);
        faults.afterRequest?.(request, reply, keyboard);
        if (faults.loseReply === request[2] && mutation) {
            delete faults.loseReply; throw Object.assign(Error("reply lost"), {code: "REQUEST_TIMEOUT"});
        }
        return [reply];
    }
    /** @param {Buffer} r */
    function serve(r) {
        const value = r[2], id = r.readUInt16LE(3);
        if (r[0] === PROFILE_WIRE_V1.COMMAND_GET && r[1] === 0) {
            if (value === C.VALUE_STATUS) {
                if (r.readUInt16LE(4) === 0) return response(r, candidateStatus());
                const p = Buffer.alloc(25); p.set([1, candidateState === S.PREPARING_PEER ? 4 : 0, faults.stallCommit ? 6 : 0, 2]);
                if (faults.stallCommit) {p.writeUInt16LE(3, 16); p[18] = 2;}
                return response(r, p);
            }
            if (value === V.VALUE_STATUS) return response(r, viaStatus());
            // The macro read map, of the bank as it is now.
            if (value === 0x0c) {
                const page = r.readUInt16LE(4), macros = local.macros;
                if (page === 0) {
                    const p = Buffer.alloc(13); p[0] = 1; p.writeUInt16LE(256, 1); p.writeUInt16LE(macros.length, 3);
                    p.writeUInt32LE(storageGeneration, 5); p.writeUInt32LE(viaStorageDigest(local), 9); return response(r, p);
                }
                const bitmap = Buffer.alloc(Math.ceil(Math.ceil(macros.length / 256) / 8));
                for (let i = 0; i < macros.length; i++) if (macros[i]) bitmap[Math.floor(i / 2048)] |= 1 << (Math.floor(i / 256) % 8);
                return response(r, bitmap.subarray((page - 1) * 25, page * 25));
            }
            if (value === 8 && r.readUInt16LE(4) === 0) {
                const p = Buffer.alloc(25); p.set([1, 4]);
                p.writeUInt32LE(storageGeneration, 2); p.writeUInt32LE(viaStorageDigest(local), 6);
                p.writeUInt32LE(peerGeneration, 10); p.writeUInt32LE(viaStorageDigest(peer), 14); p.writeUInt32LE(storageGeneration, 18);
                return response(r, p);
            }
            const reply = reader.answer(r)[0];
            if (value === 2 && r.readUInt16LE(4) === 0) {
                let flags = reply.readUInt16LE(9);
                if (candidateState !== S.IDLE) flags |= PROFILE_STATE_FLAGS.CANDIDATE_PENDING;
                if (faults.cleanupPending) flags |= PROFILE_STATE_FLAGS.PEER_CLEANUP_PENDING;
                if (activated && faults.peerUnseen) flags &= ~(PROFILE_STATE_FLAGS.PEER_KNOWN | PROFILE_STATE_FLAGS.PEER_CONVERGED);
                reply.writeUInt16LE(flags, 9);
            }
            return reply;
        }
        if (r[0] === VIA_STORAGE.LAYOUT_READ || r[0] === VIA_STORAGE.MACRO_READ) {
            const bytes = r[0] === VIA_STORAGE.LAYOUT_READ ? local.layout : local.macros;
            const offset = r.readUInt16BE(1), count = r[3];
            assert.ok(count > 0 && count <= VIA_STORAGE.CHUNK && offset + count <= bytes.length);
            const reply = Buffer.from(r); reply.fill(0, 4); bytes.copy(reply, 4, offset, offset + count); return reply;
        }
        if (r[0] === VIA_STORAGE.LAYOUT_WRITE || r[0] === VIA_STORAGE.MACRO_WRITE) {
            assert.ok(durable && viaState === VS.ACCEPTED, "host VIA writes follow the durable decision and peer acceptance");
            const bytes = r[0] === VIA_STORAGE.LAYOUT_WRITE ? local.layout : local.macros;
            const offset = r.readUInt16BE(1), count = r[3];
            assert.ok(count > 0 && count <= VIA_STORAGE.CHUNK && offset + count <= bytes.length);
            r.copy(bytes, offset, 4, 4 + count); events.push("local write"); activate(); return Buffer.from(r);
        }
        if ((r[0] === C.COMMAND_SET || r[0] === C.COMMAND_SAVE) && r[1] === 0) {
            if (faults.busy === value) {delete faults.busy; return ack(r, A.BUSY, E.MAILBOX_BUSY);}
            if (value === C.VALUE_BEGIN) {
                assert.equal(candidateState, S.IDLE); assert.ok(id > 0);
                assert.deepEqual(r, buildCandidateBeginRequest(id, {schemaMajor: r[5], schemaMinor: r[6], requestedDomains: r[7], flags: r[8],
                    payloadLength: r.readUInt16LE(9), crc32: r.readUInt32LE(11), digest: r.readUInt32LE(15), actionAbiDigest: r.readUInt32LE(19),
                    storeFormatVersion: r[23], viaGeneration: r.readUInt32LE(24), viaDigest: r.readUInt32LE(28)}));
                assert.equal(r[5], C.SCHEMA_MAJOR); assert.equal(r[6], C.SCHEMA_MINOR);
                assert.equal(r[7], 31); assert.equal(r.readUInt32LE(19), options.document.actionAbiDigest);
                assert.ok(r.readUInt32LE(24) > storageGeneration);
                candidate = Buffer.alloc(r.readUInt16LE(9)); transactionId = id; digest = r.readUInt32LE(15); checksum = r.readUInt32LE(11);
                viaGeneration = r.readUInt32LE(24); viaDigest = r.readUInt32LE(28);
                candidateState = S.RECEIVING; nextOffset = 0; operation = O.BEGIN; durable = false; activated = false; error = E.NONE; events.push("begin");
            } else if (value === V.VALUE_BEGIN) {
                assert.equal(id, transactionId); assert.equal(candidateState, S.VALIDATED);
                assert.deepEqual(r, buildLogicalViaBeginRequest(id, viaGeneration, viaDigest));
                local.layout.copy(peer.layout); local.macros.copy(peer.macros); viaTransaction = id;
                viaState = faults.stageError ? VS.ERROR : VS.STAGING; viaSequence++; events.push("via begin"); return ack(r);
            } else if (value === V.VALUE_CHUNK) {
                assert.equal(viaState, VS.STAGING); assert.equal(id, viaTransaction);
                const region = r[5], offset = r.readUInt16LE(6), regionLength = r.readUInt16LE(8), bytes = r.subarray(11, 11 + r[10]);
                assert.deepEqual(r, buildLogicalViaChunkRequest(id, {region, offset, regionLength, bytes, generation: viaGeneration, digest: viaDigest}));
                const bank = region === 2 ? peer.layout : region === 4 ? peer.macros : Buffer.from([1, 0]);
                assert.equal(regionLength, bank.length); bytes.copy(bank, offset); viaSequence++; return ack(r);
            } else if (value === V.VALUE_VERIFY) {
                assert.equal(viaState, VS.STAGING); assert.equal(id, viaTransaction);
                assert.deepEqual(r, buildLogicalViaVerifyRequest(id, viaGeneration, viaDigest));
                assert.equal(viaStorageDigest(peer), viaDigest);
                viaState = VS.STAGED; viaSequence++; events.push("via staged"); return ack(r);
            } else {
                assert.equal(id, transactionId);
                if (value === C.VALUE_CHUNK || value === C.VALUE_STREAM_CHUNK) {
                    const offset = r.readUInt16LE(5), bytes = r.subarray(8, 8 + r[7]);
                    const canonical = buildCandidateChunkRequest(id, offset, bytes); canonical[2] = value; assert.deepEqual(r, canonical);
                    assert.equal(offset, nextOffset); bytes.copy(candidate, offset); nextOffset += bytes.length; operation = O.CHUNK;
                    candidateState = nextOffset === candidate.length ? S.COMPLETE : S.RECEIVING;
                } else if (value === C.VALUE_REUSE) {
                    const offset = r.readUInt16LE(5), sourceOffset = r.readUInt16LE(7), length = r.readUInt16LE(9);
                    const kind = activeKind, bytes = kind === 0 ? options.compiled || source.profile : active;
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
                    assert.equal(candidateState, S.VALIDATED); assert.equal(viaState, VS.STAGED);
                    candidateState = S.PREPARING_PEER; operation = O.COMMIT; commitPolls = 0; events.push("commit");
                } else if (value === C.VALUE_ABORT) {
                    assert.deepEqual(r, buildCandidateAbortRequest(id));
                    if (durable || faults.abortRejected) {events.push("abort refused"); return ack(r, A.REJECTED, E.INVALID_STATE);}
                    local.layout.copy(peer.layout); local.macros.copy(peer.macros);
                    candidateState = S.IDLE; viaState = VS.ABORTED; operation = O.ABORT; events.push("aborted");
                } else throw Error(`Unsupported write ${value}`);
            }
            sequence++; return ack(r);
        }
        const reply = reader.answer(r)[0]; if (reply[0] === 255) unhandled.push(r); return reply;
    }
    return keyboard;
}
module.exports = {writableKeyboard};
