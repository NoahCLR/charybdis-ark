// @ts-check
"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const {PROFILE_EDIT_V1, EDIT_RESULT, EDIT_MODE, buildEditBeginRequest, buildEditSpliceRequest, buildEditDataRequest, buildEditCommitRequest,
    buildEditAbortRequest, buildSaveRequest, buildRevertRequest, buildEditModeRequest, buildRestartRequest, decodeEditReply, decodeEditStatusPages, decodeEditModePage,
    decodeRuntimePage, decodeActiveMetadata, readActiveProfile, sendEditRequest, decodeAutoSavePage} = require("../../core/protocol/profile-edit-v1");
const {crc32} = require("../../core/schema/profile-blob-v1");

/** @param {string} hex */
const frame = hex => {const bytes = Buffer.alloc(32); Buffer.from(hex.replace(/\s/g, ""), "hex").copy(bytes); return bytes;};

test("SET frames carry the firmware's fields at the firmware's offsets (profile-wire-v1/live-edits.md)", () => {
    assert.deepEqual(buildEditBeginRequest(0x1234, {session: 0xa1b2c3d4, revision: 7, splices: 2, insertTotal: 300}),
        frame("07 00 20 3412 d4c3b2a1 07000000 02 00 2c010000"));
    assert.deepEqual(buildEditBeginRequest(1, {session: 1, revision: 0, splices: 0, insertTotal: 74801, replacement: true}),
        frame("07 00 20 0100 01000000 00000000 00 01 31240100"));
    assert.throws(() => buildEditBeginRequest(1, {session: 1, revision: 0, splices: 9, insertTotal: 1}), RangeError);
    assert.throws(() => buildEditBeginRequest(1, {session: 1, revision: 0, splices: 1, insertTotal: 1, replacement: true}), RangeError);
    assert.deepEqual(buildEditSpliceRequest(2, 1, {domainId: 0x60, offset: 0x10000, remove: 2, insert: 3}),
        frame("07 00 21 0200 01 60 00 00000100 02000000 03000000"));
    assert.equal(buildEditSpliceRequest(2, 0, {domainId: 0x30, offset: 0, remove: 0, insert: 9, create: true})[7], 1);
    assert.equal(buildEditSpliceRequest(2, 0, {domainId: 0x30, offset: 0, remove: 9, insert: 0, drop: true})[7], 2);
    assert.deepEqual(buildEditDataRequest(3, 22, Buffer.from([9, 8, 7])), frame("07 00 22 0300 16000000 03 090807"));
    assert.throws(() => buildEditDataRequest(3, 0, Buffer.alloc(23)), RangeError);
    const stream = Buffer.from("live edit");
    const commit = buildEditCommitRequest(4, stream);
    assert.equal(commit.readUInt32LE(5), crc32(stream));
    assert.ok(commit.subarray(9).every(byte => byte === 0));
    assert.deepEqual(buildEditAbortRequest(4), frame("07 00 24 0400"));
    assert.deepEqual(buildSaveRequest(5, {session: 2, revision: 3}), frame("07 00 25 0500 02000000 03000000"));
    assert.deepEqual(buildRevertRequest(5, {session: 2, revision: 3}), frame("07 00 26 0500 02000000 03000000"));
    assert.deepEqual(buildEditModeRequest(6, EDIT_MODE.LIVE_REVIEW), frame("07 00 27 0600 02"));
    assert.throws(() => buildEditModeRequest(6, 3), RangeError);
    assert.throws(() => buildEditAbortRequest(0), RangeError);
});

test("a SET reply says the result and where the working copy is", () => {
    const request = buildSaveRequest(5, {session: 2, revision: 3});
    const reply = Buffer.from(request); reply.fill(0, 5);
    reply[5] = EDIT_RESULT.STALE; reply[6] = 0; reply.writeUInt32LE(9, 7); reply.writeUInt32LE(11, 11); reply.writeUInt16LE(0b101, 15);
    assert.deepEqual(decodeEditReply(reply, request), {result: 2, resultName: "STALE", phase: 0, session: 9, revision: 11, flags: 5});
    const other = Buffer.from(reply); other[3] = 6;
    assert.throws(() => decodeEditReply(other, request), {code: "CORRELATION_MISMATCH"});
    const trailing = Buffer.from(reply); trailing[20] = 1;
    assert.throws(() => decodeEditReply(trailing, request), {code: "NONCANONICAL_RESPONSE"});
    const unknown = Buffer.from(reply); unknown[5] = 17;
    assert.throws(() => decodeEditReply(unknown, request), {code: "INCOMPATIBLE_RESPONSE"});
    const refusedSlave = Buffer.from(reply); refusedSlave.writeUInt16LE(0x3800, 15);
    assert.equal(decodeEditReply(refusedSlave, request).flags, 0x3800);
    // Bits 14 and 15 (firmware D-F34): a stopped keyboard; every bit is now known.
    const stopped = Buffer.from(reply); stopped.writeUInt16LE(0xc000, 15);
    assert.equal(decodeEditReply(stopped, request).flags, 0xc000);
    // Byte 17 belongs to a restart's answer only.
    const extra = Buffer.from(reply); extra[17] = 1;
    assert.throws(() => decodeEditReply(extra, request), {code: "NONCANONICAL_RESPONSE"});
});

test("a restart carries its confirmation, and its answer says whether the slave half took it", () => {
    const request = buildRestartRequest(0x0102);
    assert.deepEqual(request, frame("07 00 28 0201 52455354"));
    assert.equal(request.subarray(5, 9).toString("latin1"), "REST");
    assert.throws(() => buildRestartRequest(0), RangeError);
    const reply = Buffer.from(request); reply.fill(0, 5);
    reply[5] = EDIT_RESULT.OK; reply.writeUInt16LE(0x4000, 15); reply[17] = 1;
    assert.deepEqual(decodeEditReply(reply, request), {result: 0, resultName: "OK", phase: 0, session: 0, revision: 0, flags: 0x4000, slaveAcknowledged: true});
    reply[17] = 0;
    assert.equal(decodeEditReply(reply, request).slaveAcknowledged, false);
    for (const [at, value] of [[17, 2], [18, 1], [31, 1]]) {
        const broken = Buffer.from(reply); broken[at] = value;
        assert.throws(() => decodeEditReply(broken, request), {code: "NONCANONICAL_RESPONSE"});
    }
});

test("edit status pages decode both halves, the save, the last refusal and the keyboard's own saves", () => {
    const local = Buffer.alloc(25), slave = Buffer.alloc(25), error = Buffer.alloc(25), auto = Buffer.alloc(25);
    auto[0] = 1; auto[1] = 0b10; auto.writeUInt32LE(3, 2); auto.writeUInt32LE(12, 6); auto.writeUInt32LE(42, 10); auto.writeUInt16LE(3000, 14);
    local[0] = 1; local[1] = 4; local.writeUInt16LE(0b1_0000_1111, 2); local.writeUInt32LE(0xdeadbeef, 4); local.writeUInt32LE(12, 8);
    local.writeUInt32LE(42, 12); local[16] = 1; local[17] = EDIT_RESULT.QUEUED; local.writeUInt16LE(7, 18); local.writeUInt16LE(8, 20); local[22] = 2; local[23] = 3;
    slave[0] = 1; slave.writeUInt32LE(0xdeadbeef, 4); slave.writeUInt32LE(11, 8); slave[12] = 1; slave[13] = 2; slave.writeUInt16LE(30, 16); slave.writeUInt32LE(40, 20); slave[24] = 2;
    error[0] = 5; error[1] = 0x60; error.writeUInt32LE(99, 7); error.writeUInt32LE(3, 14); error.writeUInt32LE(5000, 18);
    const status = decodeEditStatusPages([local, slave, error, auto]);
    assert.equal(status.unsaved, true); assert.equal(status.slaveRequired, true); assert.equal(status.slaveConverged, true); assert.equal(status.slaveKnown, true);
    assert.equal(status.waitingSafe, true); assert.equal(status.saving, false);
    assert.deepEqual([status.session, status.revision, status.savedGeneration, status.savedOrigin, status.mode], [0xdeadbeef, 12, 42, 1, 2]);
    assert.deepEqual(status.slave, {phase: 1, lastResult: 0, transactionId: 0, session: 0xdeadbeef, revision: 11, unsaved: true, savedCompiled: false, mode: 2});
    assert.equal(status.save.phase, 2); assert.equal(status.save.transactionId, 30);
    assert.equal(status.refusal.domainId, 0x60); assert.equal(status.refusal.byteOffset, 99); assert.equal(status.activeLength, 5000);
    assert.deepEqual(status.autoSave, {inProgress: false, lastWasAutomatic: true, count: 3, revision: 12, generation: 42, quietMs: 3000});
    assert.deepEqual([status.slaveStoragePaused, status.slaveRefused, status.modeNotStored], [false, false, false]);
    // Bits 10–12: the slave half's save waits, the slave half refused this
    // working copy, the edit mode is not stored yet. Bit 13 is a queued key
    // adjustment; bits 14 and 15 a stopped master half and slave half (D-F34).
    const flagged = Buffer.from(local); flagged.writeUInt16LE(0x3c00, 2);
    assert.deepEqual((({slaveStoragePaused, slaveRefused, modeNotStored, adjustmentPending}) => [slaveStoragePaused, slaveRefused, modeNotStored, adjustmentPending])(decodeEditStatusPages([flagged, slave, error, auto])), [true, true, true, true]);
    assert.deepEqual([status.stopped, status.slaveStopped], [false, false]);
    for (const [bits, expected] of [[0x4000, [true, false]], [0x8000, [false, true]], [0xc000, [true, true]]]) {
        const page = Buffer.from(local); page.writeUInt16LE(bits, 2);
        const decoded = decodeEditStatusPages([page, slave, error, auto]);
        assert.deepEqual([decoded.stopped, decoded.slaveStopped], expected);
    }
    const layout = Buffer.from(local); layout[0] = 2;
    assert.throws(() => decodeEditStatusPages([layout, slave, error, auto]), {code: "INCOMPATIBLE_RESPONSE"});
    for (const broken of [(page) => {page[0] = 2;}, (page) => {page[1] = 4;}, (page) => {page[16] = 1;}]) {
        const page = Buffer.from(auto); broken(page);
        assert.throws(() => decodeAutoSavePage(page), /automatic save|Reserved/);
    }
    assert.throws(() => decodeAutoSavePage(Buffer.alloc(24)), {code: "MALFORMED_RESPONSE"});
});

test("the mode, runtime and active-profile pages decode, refusing what they never carry", () => {
    const mode = Buffer.from([2, 5, 0, 0, 0, 2, 5, 0, 0, 0, 5]);
    assert.deepEqual(decodeEditModePage(mode), {mode: 2, counter: 5, slaveMode: 2, slaveCounter: 5, slaveKnown: true, conflict: false, agreed: true});
    assert.throws(() => decodeEditModePage(Buffer.from([...mode.subarray(0, 10), 8])), {code: "INCOMPATIBLE_RESPONSE"});
    const runtime = Buffer.alloc(24); runtime.set([1, 0, 1, 1]); runtime.writeUInt16LE(1200, 4); runtime.writeUInt32LE(0xc8ff00, 12);
    const decoded = decodeRuntimePage(runtime);
    assert.deepEqual(decoded.combos, {master: true, override: false});
    assert.deepEqual(decoded.behaviours, {master: true, override: true});
    assert.equal(decoded.live.defaultDpi, 1200); assert.equal(decoded.live.rgbColor, 0xc8ff00);
    runtime[1] = 2;
    assert.throws(() => decodeRuntimePage(runtime), {code: "NONCANONICAL_RESPONSE"});
    const metadata = Buffer.alloc(25); metadata.set([1, 25]); metadata.writeUInt32LE(30, 2); metadata.writeUInt32LE(7, 6); metadata.writeUInt32LE(3, 10);
    metadata.writeUInt32LE(42, 14); metadata[18] = 1; metadata[19] = 0x7f; metadata[20] = 1;
    assert.deepEqual(decodeActiveMetadata(metadata), {length: 30, session: 7, revision: 3, savedGeneration: 42, savedOrigin: 1, domainMask: 0x7f, unsaved: true});
});

/** @param {(request: Buffer) => Buffer} answer */
const connection = answer => ({request: async (/** @type {Buffer} */ request) => answer(Buffer.from(request))});
/** @param {Buffer} request @param {Buffer} payload */
const ok = (request, payload) => {const reply = Buffer.from(request); reply.fill(0, 5); reply[6] = payload.length; payload.copy(reply, 7); return reply;};

test("the active profile is read whole, and a revision that moves during the read is refused", async () => {
    const bytes = Buffer.from(Array.from({length: 30}, (_, index) => index));
    let revision = 3, id = 0;
    const meta = () => {const page = Buffer.alloc(25); page.set([1, 25]); page.writeUInt32LE(bytes.length, 2); page.writeUInt32LE(7, 6); page.writeUInt32LE(revision, 10); return page;};
    const keyboard = connection(request => {
        assert.equal(request[2], PROFILE_EDIT_V1.VALUE_ACTIVE);
        const page = request.readUInt16LE(4);
        return ok(request, page === 0 ? meta() : bytes.subarray((page - 1) * 25, page * 25));
    });
    const read = await readActiveProfile(keyboard, {nextRequestId: () => (id = id % 255 + 1)});
    assert.ok(read.bytes.equals(bytes)); assert.equal(read.metadata.revision, 3);
    const moving = connection(request => {
        const page = request.readUInt16LE(4);
        if (page === 2) revision++;
        return ok(request, page === 0 ? meta() : bytes.subarray((page - 1) * 25, page * 25));
    });
    await assert.rejects(readActiveProfile(moving, {nextRequestId: () => 1}), {code: "PROFILE_CHANGED"});
});

// A working copy that shortens under the read (an edit to a shorter name)
// answers a short page, or "unknown page" past its new end: page 0 is read
// again, and a moved one is the change, not a malformed answer.
test("a page that no longer fits the active profile reads page 0 again before refusing", async () => {
    for (const [moves, shorter, code] of [[true, 28, "PROFILE_CHANGED"], [true, 20, "PROFILE_CHANGED"], [false, 28, "MALFORMED_RESPONSE"], [false, 20, "DEVICE_REJECTED"]]) {
        let bytes = Buffer.from(Array.from({length: 30}, (_, index) => index)), revision = 3, metadataReads = 0;
        const meta = () => {const page = Buffer.alloc(25); page.set([1, 25]); page.writeUInt32LE(moves ? bytes.length : 30, 2); page.writeUInt32LE(7, 6); page.writeUInt32LE(revision, 10); return page;};
        const keyboard = connection(request => {
            const page = request.readUInt16LE(4);
            if (page === 0) {metadataReads++; return ok(request, meta());}
            const reply = (page - 1) * 25 >= bytes.length ? (() => {const refused = ok(request, Buffer.alloc(0)); refused[5] = 2; return refused;})()
                : ok(request, bytes.subarray((page - 1) * 25, page * 25));
            if (page === 1) {bytes = bytes.subarray(0, shorter); if (moves) revision++;}
            return reply;
        });
        await assert.rejects(readActiveProfile(keyboard, {nextRequestId: () => 1}), {code}, `${shorter} bytes, page 0 moved: ${moves}`);
        assert.equal(metadataReads, 2, "page 0 read again at the page that did not fit");
    }
});

test("an unhandled SET is a definite refusal, not a timeout", async () => {
    const keyboard = connection(request => {const echo = Buffer.from(request); echo[0] = 0xff; return echo;});
    await assert.rejects(sendEditRequest(keyboard, buildEditAbortRequest(1)), {code: "UNHANDLED"});
});
