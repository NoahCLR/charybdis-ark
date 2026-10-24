"use strict";
// Each half's flash pauses (GET 0x0D) on the Keyboard screen's Diagnostics:
// read only while that fold is open or by its Read keyboard, never by the
// live watch, and never alongside another operation.
const assert = require("node:assert/strict");
const test = require("node:test");
const {PHASE} = require("../../core/model/vocabulary");
const {FLASH_PAUSES_V1} = require("../../core/protocol/flash-pauses-v1");
const {EDIT_MODE} = require("../../core/protocol/profile-edit-v1");
const {PULL_WAIT_MS, readFlashFigures} = require("../../core/session/flash-pauses");
const {openPanelLoop} = require("../../core/session/panel-loop");
const {checkLive} = require("../../core/session/live-watch");
const {connectedService} = require("../fixtures/connected-service");
const {fakeKeyboardAdapter} = require("../fixtures/fake-keyboard");
const {liveKeyboard} = require("../fixtures/live-keyboard");
const {document} = require("../fixtures/portable-profile");

function deferred() {
    let resolve;
    const promise = new Promise(done => {resolve = done;});
    return {promise, resolve};
}
/** @param {{requests: Buffer[]}} keyboard */
const pausePages = keyboard => keyboard.requests.filter(request => request[0] === 0x08 && request[2] === FLASH_PAUSES_V1.VALUE).map(request => request[4]);

// Holds the keyboard's answers to GET 0x0D until `release()`, as a slow
// keyboard would, so a test can act while the read is out.
/** @param {ReturnType<typeof fakeKeyboardAdapter>} adapter */
function holdPauses(adapter) {
    const keyboard = adapter.keyboard, answer = keyboard.answer.bind(keyboard);
    /** @type {Buffer[]} */
    const held = [];
    const out = deferred();
    keyboard.answer = report => {
        const responses = answer(report);
        if (report[0] !== 0x08 || report[2] !== FLASH_PAUSES_V1.VALUE) return responses;
        held.push(...responses); out.resolve();
        return [];
    };
    return {out: out.promise, release() {
        keyboard.answer = answer;
        held.splice(0).forEach(response => adapter.lastConnection().emitReport(response));
    }};
}

function fakeShell() {
    const shell = {
        posted: [], errors: [],
        post: (message) => {shell.posted.push(message);},
        showError: (text) => {shell.errors.push(text);},
        saveRecovery: async () => "/recovery/1.json",
        saveExport: async () => undefined,
    };
    return shell;
}
const model = shell => shell.posted.filter(message => message.type === "model").at(-1)?.model;

/** @param {import("node:test").TestContext} t @param {{keyboard?: object, waits?: number[]}} [options] */
async function open(t, {keyboard, waits = [], read = true} = {}) {
    const shell = fakeShell();
    const adapter = fakeKeyboardAdapter(keyboard ? {keyboard} : {document: document()});
    const loop = openPanelLoop(shell, {adapter, defaultTimeoutMs: 300, sleep: async ms => {waits.push(ms);}});
    t.after(() => loop.close());
    if (read) await loop.handleMessage({type: "refresh"});
    return {shell, adapter, loop, session: loop.session, waits};
}

test("the service reads both halves into its snapshot; the slave half is not measured until the master half has pulled it", async t => {
    const {service, keyboard} = await connectedService(t);
    assert.equal(service.snapshot().flashPauses, null, "nothing is read on connecting");
    assert.equal(await service.readFlashPauses(), true);
    let pauses = service.snapshot().flashPauses;
    assert.equal(pauses.state, "read");
    assert.deepEqual(pauses.master, {physicalHalf: 1, longestEraseUs: 49045, longestProgramUs: 632, longestStorageStepUs: 49310, lastSaveUs: 790000, lastSaveFlashUs: 114000, saves: 1});
    assert.equal(pauses.slave, null, "page 1 answered unavailable");
    assert.equal(await service.readFlashPauses(), true);
    pauses = service.snapshot().flashPauses;
    assert.equal(pauses.slave.physicalHalf, 0);
    assert.equal(pauses.slave.longestProgramUs, 1007);
    assert.equal(keyboard.flashPauses.pulls, 1);
    assert.equal(service.snapshot().busy, false, "a background read holds no operation");
});

test("a failed read is published as unavailable and keeps the connection", async t => {
    const {service, keyboard} = await connectedService(t);
    keyboard.flashPauses.master[24] = 9;
    assert.equal(await service.readFlashPauses(), true);
    const pauses = service.snapshot().flashPauses;
    assert.equal(pauses.state, "unavailable");
    assert.match(pauses.error, /reserved byte/);
    assert.equal(service.snapshot().connected, true);
    assert.equal(service.snapshot().error, null, "a diagnostic read is no failure of the keyboard");
});

test("it is not read while an operation holds the keyboard", async t => {
    const {service, keyboard} = await connectedService(t);
    const gate = deferred(); t.after(gate.resolve);
    const owner = service.runOperation(PHASE.READ_PROFILE, () => gate.promise);
    try {
        assert.equal(await service.readFlashPauses(), false);
        assert.deepEqual(pausePages(keyboard), []);
    } finally {gate.resolve(); await owner;}
    assert.equal(service.snapshot().flashPauses, null);
});

test("an operation started while the figures are out waits for them before it reads", async t => {
    const {service, adapter, keyboard} = await connectedService(t);
    const pauses = holdPauses(adapter);
    const reading = service.readFlashPauses();
    await pauses.out;
    let ran = false;
    const operation = service.runOperation(PHASE.READ_PROFILE, async () => {ran = true;});
    assert.equal(service.snapshot().busy, true, "the operation holds the keyboard from the start");
    assert.equal(await service.readFlashPauses(), false, "and nothing else reads meanwhile");
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(ran, false, "not alongside the figures");
    pauses.release();
    assert.equal(await reading, true);
    await operation;
    assert.equal(ran, true);
    assert.deepEqual(pausePages(keyboard), [0, 1]);
});

test("Diagnostics opening reads both halves, gives the master half time to pull, and reads again", async t => {
    const {shell, adapter, loop, waits} = await open(t);
    assert.deepEqual(pausePages(adapter.keyboard), [], "reading the keyboard reads no figures");
    assert.equal(model(shell).device.flashPauses, null);
    await loop.handleMessage({type: "readFlashPauses"});
    assert.deepEqual(pausePages(adapter.keyboard), [0, 1, 0, 1]);
    assert.deepEqual(waits.filter(ms => ms === PULL_WAIT_MS), [PULL_WAIT_MS]);
    assert.ok(PULL_WAIT_MS > FLASH_PAUSES_V1.PULL_MS, "longer than the master half's pull interval");
    const pauses = model(shell).device.flashPauses;
    assert.equal(pauses.master.longestEraseUs, 49045);
    assert.equal(pauses.slave.longestEraseUs, 48708);
    const published = shell.posted.filter(message => message.type === "model").map(message => message.model.device.flashPauses);
    assert.ok(published.some(read => read?.state === "read" && read.slave === null), "the first read is shown while the master half pulls");
});

test("Read keyboard reads the figures only when it asks for them, after the keyboard", async t => {
    const {adapter, loop, shell} = await open(t);
    await loop.handleMessage({type: "refresh"});
    assert.deepEqual(pausePages(adapter.keyboard), [], "with the fold closed nothing is read");
    await loop.handleMessage({type: "refresh", flashPauses: true});
    assert.deepEqual(pausePages(adapter.keyboard), [0, 1, 0, 1]);
    const last = adapter.keyboard.requests.findLastIndex(request => request[2] !== FLASH_PAUSES_V1.VALUE);
    assert.ok(last < adapter.keyboard.requests.findIndex(request => request[2] === FLASH_PAUSES_V1.VALUE), "the keyboard is read first");
    assert.equal(model(shell).device.flashPauses.slave.saves, 1);
});

test("nothing is read while the panel holds the keyboard, and the second read waits for nothing that started meanwhile", async t => {
    const {adapter, loop, session} = await open(t);
    session.portableBusy = true;
    await loop.handleMessage({type: "readFlashPauses"});
    assert.deepEqual(pausePages(adapter.keyboard), []);
    session.portableBusy = false;
    assert.equal(await readFlashFigures(session, {publish: () => {}, sleep: async () => {session.applyRunning = true;}}), true);
    assert.deepEqual(pausePages(adapter.keyboard), [0, 1], "an Apply begun during the wait is not read alongside");
    session.applyRunning = false;
});

test("the demo reads nothing and shows sample figures for both halves", async t => {
    const {adapter, loop, shell, session} = await open(t, {read: false});
    await loop.handleMessage({type: "openDemo"});
    assert.ok(session.demo, "the demo is open");
    await loop.handleMessage({type: "readFlashPauses"});
    assert.deepEqual(pausePages(adapter.keyboard), []);
    const pauses = model(shell).device.flashPauses;
    assert.equal(pauses.state, "read");
    assert.equal(pauses.master.physicalHalf, 1);
    assert.equal(pauses.slave.physicalHalf, 0);
});

test("the live watch never reads the figures, and skips its look while they are out", async t => {
    const keyboard = liveKeyboard({document: document(), mode: EDIT_MODE.LIVE});
    const {adapter, session} = await open(t, {keyboard});
    assert.ok(session.draft?.live, "a live draft the watch looks at");
    const statusLooks = () => adapter.keyboard.requests.filter(request => request[0] === 0x08 && request[2] === 0x20).length;
    const looks = statusLooks();
    await checkLive(session);
    assert.ok(statusLooks() > looks, "the watch looks at the keyboard's status");
    assert.deepEqual(pausePages(adapter.keyboard), [], "and never at its flash pauses");
    const pauses = holdPauses(adapter);
    const reading = session.service.readFlashPauses();
    await pauses.out;
    const before = statusLooks();
    assert.equal(await session.service.readLiveStatus(), undefined, "a look is skipped while the figures are out");
    assert.equal(statusLooks(), before);
    pauses.release();
    assert.equal(await reading, true);
});
