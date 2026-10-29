"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const {BackgroundReads, WATCH_MISSES, missableConnection, readFlashPauses, readLiveStatus} = require("../../core/session/background-reads");

test("a background read is out until it settles, failed or not", async () => {
    const reads = new BackgroundReads();
    assert.equal(reads.out, undefined);
    /** @type {(value: string) => void} */
    let finish = () => {};
    const running = reads.run(() => new Promise(resolve => {finish = resolve;}));
    const out = reads.out;
    assert.ok(out instanceof Promise, "an operation waits for this");
    finish("read");
    assert.equal(await running, "read");
    await out;
    assert.equal(reads.out, undefined);
    await assert.rejects(reads.run(async () => {throw new Error("missed");}), /missed/);
    assert.equal(reads.out, undefined, "a failed read is out no longer");
});

test("each request of a missable read waits the watch's timeout and fails alone", async () => {
    /** @type {unknown[]} */
    const sent = [];
    const connection = {request: async (report, options) => {sent.push([report, options]); return "answer";}};
    const missable = missableConnection(connection, 50);
    assert.equal(await missable.request(Buffer.from([1]), {timeoutMs: 9000, expect: 2}), "answer");
    await missable.request(Buffer.from([2]));
    assert.deepEqual(sent, [[Buffer.from([1]), {timeoutMs: 50, expect: 2, softTimeout: true}], [Buffer.from([2]), {timeoutMs: 50, softTimeout: true}]]);
});

// Only what the background reads touch of the device service.
/** @param {{busy?: boolean, request?: () => Promise<unknown>}} [options] */
function quietService({busy = false, request = async () => {throw new Error("not asked");}} = {}) {
    /** @type {unknown[]} */
    const abandoned = [];
    /** @type {string[]} */
    const diagnostics = [];
    let requests = 0;
    const connection = {connected: true, request: async () => {requests++; return request();}, abandon: async (/** @type {unknown} */ error) => {abandoned.push(error);}};
    const service = {busy, connection, requestIds: {next: () => 1}, editMode: {mode: 2}, watchTimeoutMs: 50, missedLooks: 0, connectionPublicId: "charybdis-1",
        liveCoordinator: () => ({options: {nextRequestId: () => 1}}), deviceLabel: () => "Charybdis 4x6",
        addDiagnostic: (/** @type {string} */ text) => diagnostics.push(text), emitChange: () => {}};
    return {service, abandoned, diagnostics, requests: () => requests};
}

test("a background read is skipped, never queued, while an operation or another background read holds the keyboard", async () => {
    const held = quietService({busy: true});
    const reads = new BackgroundReads();
    assert.equal(await readLiveStatus(held.service, reads), undefined);
    assert.equal(await readFlashPauses(held.service, reads), false);
    const quiet = quietService();
    /** @type {() => void} */
    let finish = () => {};
    const out = reads.run(() => new Promise(resolve => {finish = () => resolve(undefined);}));
    assert.equal(await readLiveStatus(quiet.service, reads), undefined);
    assert.equal(await readFlashPauses(quiet.service, reads), false);
    finish(); await out;
    assert.equal(held.requests() + quiet.requests(), 0, "nothing was asked of the keyboard");
});

test(`${WATCH_MISSES} unanswered looks in a row lose the keyboard, each one said in the diagnostics`, async () => {
    const late = Object.assign(new Error("late"), {soft: true});
    const {service, abandoned, diagnostics} = quietService({request: async () => {throw late;}});
    const reads = new BackgroundReads();
    for (let look = 1; look < WATCH_MISSES; look++) assert.equal(await readLiveStatus(service, reads), undefined);
    assert.deepEqual(abandoned, []);
    assert.equal(diagnostics.at(-1), `Charybdis 4x6 missed a status look (${WATCH_MISSES - 1} in a row).`);
    await readLiveStatus(service, reads);
    assert.deepEqual(abandoned, [late]);
});
