"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const {BackgroundReads, WATCH_MISSES, missableConnection} = require("../../core/session/background-reads");
const {connectedService} = require("../fixtures/connected-service");
const {liveKeyboard} = require("../fixtures/live-keyboard");
const {document} = require("../fixtures/portable-profile");
const {testClock} = require("../fixtures/panel-loop");
const {PHASE} = require("../../core/model/vocabulary");
const {PROFILE_EDIT_V1} = require("../../core/protocol/profile-edit-v1");
const {FLASH_PAUSES_V1} = require("../../core/protocol/flash-pauses-v1");

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

// A live keyboard, connected; each request of a background read waits
// `watchTimeoutMs`. `hold(value)` keeps the answer to each GET of that value
// until `release()`; `silence(value)` leaves them unanswered.
/** @param {import("node:test").TestContext} t @param {number} [watchTimeoutMs] */
async function watched(t, watchTimeoutMs = 50) {
    const keyboard = liveKeyboard({document: document()});
    const {now, sleep} = testClock();
    const {service, adapter} = await connectedService(t, {keyboard}, {now, sleep, watchTimeoutMs});
    /** @type {{value: number, silent: boolean, held: (() => void)[]} | undefined} */
    let stopped;
    adapter.onWrite = ({connection, report}) => {
        const responses = adapter.keyboard.answer(report);
        const answer = () => queueMicrotask(() => responses.forEach(response => connection.emitReport(response)));
        if (stopped && report[0] === PROFILE_EDIT_V1.COMMAND_GET && report[2] === stopped.value) {
            if (!stopped.silent) stopped.held.push(answer);
        } else answer();
    };
    const writes = () => adapter.lastConnection().writes.length;
    return {service, keyboard, writes,
        hold: (/** @type {number} */ value) => {stopped = {value, silent: false, held: []};},
        silence: (/** @type {number} */ value) => {stopped = {value, silent: true, held: []};},
        release: () => {const held = stopped?.held || []; stopped = undefined; held.forEach(answer => answer());}};
}

test("a background read is skipped, never queued, while an operation or another background read holds the keyboard", async t => {
    // Held answers never time out here.
    const {service, writes, hold, release} = await watched(t, 60_000);
    /** @type {() => void} */
    let finish = () => {};
    const owner = service.runOperation(PHASE.READ_PROFILE, () => new Promise(resolve => {finish = () => resolve(undefined);}));
    const sent = writes();
    assert.equal(await service.readLiveStatus(), undefined);
    assert.equal(await service.readFlashPauses(), false);
    finish(); await owner;
    assert.equal(writes(), sent, "nothing was asked of the keyboard while the operation held it");
    hold(FLASH_PAUSES_V1.VALUE);
    const out = service.readFlashPauses();
    await new Promise(resolve => setImmediate(resolve));
    const outSent = writes();
    assert.equal(await service.readLiveStatus(), undefined);
    assert.equal(await service.readFlashPauses(), false);
    assert.equal(writes(), outSent, "nor while another background read was out");
    release();
    assert.equal(await out, true);
    assert.ok(await service.readLiveStatus(), "with nothing out, the look is made");
});

test("a look is made only at a keyboard with an edit mode", async t => {
    const {service, adapter} = await connectedService(t, {document: document()});
    const sent = adapter.lastConnection().writes.length;
    assert.equal(await service.readLiveStatus(), undefined);
    assert.equal(adapter.lastConnection().writes.length, sent);
});

test(`${WATCH_MISSES} unanswered looks in a row lose the keyboard, each one said in the diagnostics`, async t => {
    const {service, silence, release} = await watched(t);
    silence(PROFILE_EDIT_V1.VALUE_STATUS);
    for (let look = 1; look < WATCH_MISSES; look++) {
        assert.equal(await service.readLiveStatus(), undefined);
        assert.equal(service.snapshot().diagnostics.at(-1), `Charybdis 4x6 missed a status look (${look} in a row).`);
    }
    assert.equal(service.snapshot().connected, true, "a missed look keeps the keyboard");
    release();
    assert.ok(await service.readLiveStatus(), "an answered look starts the count again");
    silence(PROFILE_EDIT_V1.VALUE_STATUS);
    for (let look = 1; look < WATCH_MISSES; look++) await service.readLiveStatus();
    assert.equal(service.snapshot().connected, true);
    await service.readLiveStatus();
    assert.equal(service.snapshot().connected, false, "the last miss loses it");
    assert.equal(service.takeLost()?.unanswered, true);
});
