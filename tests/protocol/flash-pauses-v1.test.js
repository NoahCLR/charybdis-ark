"use strict";
// GET 0x0D, each half's flash pauses (firmware profile-wire-v1/hid-channel.md,
// "Flash pauses"). No firmware fixture holds a page, so these bytes follow
// the spec's table: flags, physical half, five 32-bit µs figures, a 16-bit
// save count and a zero byte.
const test = require("node:test"), assert = require("node:assert/strict");
const {FLASH_PAUSES_V1, decodeFlashPausePage, readFlashPauses} = require("../../core/protocol/flash-pauses-v1");

/** @param {{flags?: number, half?: number, erase?: number, program?: number, step?: number, save?: number, saveFlash?: number, saves?: number, last?: number}} [fields] */
function page({flags = 1, half = 1, erase = 49045, program = 632, step = 49310, save = 790000, saveFlash = 114000, saves = 1, last = 0} = {}) {
    const bytes = Buffer.alloc(25);
    bytes[0] = flags; bytes[1] = half;
    bytes.writeUInt32LE(erase, 2); bytes.writeUInt32LE(program, 6); bytes.writeUInt32LE(step, 10);
    bytes.writeUInt32LE(save, 14); bytes.writeUInt32LE(saveFlash, 18); bytes.writeUInt16LE(saves, 22);
    bytes[24] = last;
    return bytes;
}

// Answers GET 0x0D as the master half does: `pages[n]` is page n's payload,
// or a status for a page that does not answer OK.
/** @param {Record<number, Buffer | number>} pages */
function keyboard(pages) {
    const asked = [];
    return {asked, async request(request, options) {
        assert.equal(request[2], FLASH_PAUSES_V1.VALUE); assert.equal(request[5], 0, "a byte page");
        asked.push(request[4]);
        const reply = Buffer.alloc(32); request.copy(reply, 0, 0, 5);
        const answer = pages[request[4]] ?? 2;
        if (typeof answer === "number") reply[5] = answer;
        else {reply[6] = answer.length; answer.copy(reply, 7);}
        assert(options.matchResponse(reply, request));
        return reply;
    }};
}
let id = 0;
const ids = {next: () => (id = id % 255 + 1)};

test("decodes a page's figures verbatim, in microseconds, with the side it reports", () => {
    assert.deepEqual(decodeFlashPausePage(page()), {physicalHalf: 1, longestEraseUs: 49045, longestProgramUs: 632,
        longestStorageStepUs: 49310, lastSaveUs: 790000, lastSaveFlashUs: 114000, saves: 1});
    assert.equal(decodeFlashPausePage(page({half: 0})).physicalHalf, 0, "left");
    assert.equal(decodeFlashPausePage(page({half: 0xff})).physicalHalf, 0xff, "not provisioned");
    const zero = decodeFlashPausePage(page({erase: 0, program: 0, step: 0, save: 0, saveFlash: 0, saves: 0}));
    assert.deepEqual([zero.longestEraseUs, zero.lastSaveUs, zero.saves], [0, 0, 0], "zeros are the keyboard's, kept");
    const wide = decodeFlashPausePage(page({save: 0xffffffff, saves: 0xffff}));
    assert.deepEqual([wide.lastSaveUs, wide.saves], [0xffffffff, 0xffff], "unsigned to the top of each field");
});

test("a page without figures is not measured yet, never zeros", () => {
    assert.equal(decodeFlashPausePage(page({flags: 0})), null);
});

test("refuses a malformed or wrongly sized page", () => {
    for (const [bytes, what] of [
        [page({flags: 2}), "an unknown flag"], [page({flags: 3}), "an unknown flag beside figures"],
        [page({half: 2}), "a physical half that is neither left, right nor unset"],
        [page({last: 1}), "a nonzero last byte"],
        [page().subarray(0, 24), "a short page"], [Buffer.concat([page(), Buffer.alloc(1)]), "a long page"],
    ]) assert.throws(() => decodeFlashPausePage(bytes), error => error.code === "INVALID_FLASH_PAUSES", what);
});

test("reads the master half's page 0 and the slave half's page 1", async () => {
    const connection = keyboard({0: page({half: 1}), 1: page({half: 0, erase: 48708, program: 1007, save: 410000, saveFlash: 117000})});
    const read = await readFlashPauses(connection, ids);
    assert.deepEqual(connection.asked, [0, 1]);
    assert.equal(read.master.physicalHalf, 1);
    assert.equal(read.master.longestEraseUs, 49045);
    assert.equal(read.slave.physicalHalf, 0);
    assert.equal(read.slave.longestProgramUs, 1007);
});

test("page 1 before the master half has pulled the slave half's figures (status 3) is not measured yet", async () => {
    const read = await readFlashPauses(keyboard({0: page(), 1: 3}), ids);
    assert.equal(read.slave, null);
    assert.equal(read.master.longestEraseUs, 49045);
    assert.equal((await readFlashPauses(keyboard({0: page({flags: 0}), 1: 3}), ids)).master, null);
});

test("any other refusal fails the read: page 0 unavailable, an unknown page, a malformed page", async () => {
    await assert.rejects(readFlashPauses(keyboard({0: 3, 1: page()}), ids), error => error.code === "DEVICE_REJECTED" && error.status === 3);
    await assert.rejects(readFlashPauses(keyboard({0: page(), 1: 2}), ids), error => error.code === "DEVICE_REJECTED" && error.status === 2);
    await assert.rejects(readFlashPauses(keyboard({0: page(), 1: page({last: 7})}), ids), error => error.code === "INVALID_FLASH_PAUSES");
    await assert.rejects(readFlashPauses(keyboard({0: page().subarray(0, 20), 1: page()}), ids), error => error.code === "MALFORMED_RESPONSE");
});

test("a keyboard that does not route 0x0D is refused as unhandled", async () => {
    const connection = {async request(request, options) {
        const echo = Buffer.from(request); echo[0] = 0xff;
        assert(options.matchResponse(echo, request));
        return echo;
    }};
    await assert.rejects(readFlashPauses(connection, ids), error => error.code === "UNHANDLED");
});
