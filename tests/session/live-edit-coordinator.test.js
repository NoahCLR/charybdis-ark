"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const {connectedService} = require("../fixtures/connected-service");
const {liveKeyboard} = require("../fixtures/live-keyboard");
const {document} = require("../fixtures/portable-profile");
const {editLayers} = require("../fixtures/profile-document");
const {validateSnapshot} = require("../../core/model/portable-profile");
const {LiveEditCoordinator, TransactionIds, DEFAULT_TIMING} = require("../../core/session/live-edit-coordinator");
const {EDIT_MODE, EDIT_RESULT} = require("../../core/protocol/profile-edit-v1");
const {PROFILE_ACTIVE_KIND} = require("../../core/protocol/profile-wire-v1");

/** @param {import("node:test").TestContext} t @param {object} [options] */
async function live(t, options = {}) {
    const keyboard = liveKeyboard({document: document(), ...options});
    const connected = await connectedService(t, {keyboard}, {sleep: async () => {}});
    return {...connected, keyboard};
}
/** @param {(layers: number[][]) => void} change */
const target = change => {const next = document(); editLayers(next, change); return Buffer.from(next.profile, "base64");};

test("Live + review reads the working copy and the saved profile as one pair", async t => {
    const {service, keyboard} = await live(t);
    assert.equal(service.snapshot().editMode.mode, EDIT_MODE.LIVE_REVIEW);
    let read = await service.readKeyboardProfile();
    assert.ok(read.live, "the read carries the working copy's identity");
    assert.equal(read.live.unsaved, false);
    assert.equal(read.fingerprint, read.saved.fingerprint, "with nothing unsaved the keyboard runs what is saved");
    // An edit elsewhere: the next read shows it unsaved against the saved profile.
    keyboard.externalEdit(target(layers => {layers[0][7] = 0x04;}));
    read = await service.readKeyboardProfile();
    assert.equal(read.live.unsaved, true);
    assert.equal(read.status.activeKind, PROFILE_ACTIVE_KIND.WORKING);
    assert.notEqual(read.fingerprint, read.saved.fingerprint);
    assert.equal(validateSnapshot(read.document).layers[0][7], 0x04);
    assert.equal(validateSnapshot(read.saved.document).layers[0][7], 0);
    assert.equal(service.snapshot().committed.source, "working");
});

test("an edit sends only what changed, is published on both halves, and names the new revision", async t => {
    const {service, keyboard} = await live(t);
    const read = await service.readKeyboardProfile();
    const to = target(layers => {layers[0][9] = 0x05;});
    const result = await service.postLiveEdit({from: read.live.working, to, defaults: read.live.defaults, identity: read.live});
    assert.equal(result.revision, read.live.revision + 1);
    assert.equal(result.converged, true);
    assert.ok(result.sent <= 2, "one key's bytes, not its domain");
    assert.ok(result.bytes.equals(keyboard.working), "Ark knows the bytes the keyboard runs without reading them back");
    assert.ok(keyboard.saved.equals(Buffer.from(document().profile, "base64")), "nothing is saved");
    // An unchanged target sends nothing.
    const again = await service.postLiveEdit({from: result.bytes, to, defaults: read.live.defaults, identity: result});
    assert.equal(again.sent, 0);
});

test("a stale edit is refused with the keyboard's current pair; a refused one changes nothing", async t => {
    const {service, keyboard} = await live(t);
    const read = await service.readKeyboardProfile();
    keyboard.externalEdit(target(layers => {layers[0][1] = 0x06;}));
    await assert.rejects(service.postLiveEdit({from: read.live.working, to: target(layers => {layers[0][2] = 0x07;}), defaults: read.live.defaults, identity: read.live}),
        {code: "LIVE_EDIT_STALE"});
    const fresh = await service.readKeyboardProfile();
    keyboard.faults.refuse = EDIT_RESULT.VALIDATION_REJECTED;
    const before = keyboard.working;
    await assert.rejects(service.postLiveEdit({from: fresh.live.working, to: target(layers => {layers[0][2] = 0x07;}), defaults: fresh.live.defaults, identity: fresh.live}),
        error => error.code === "LIVE_EDIT_REFUSED" && /checks refused/.test(error.message));
    assert.ok(keyboard.working.equals(before));
    assert.equal(service.snapshot().error.code, "LIVE_EDIT_REFUSED", "a refusal is recorded like any failed operation");
});

test("an edit waits for the slave half before it says both halves hold it", async t => {
    const {service, keyboard} = await live(t);
    const read = await service.readKeyboardProfile();
    keyboard.faults.slaveLag = 3;
    const result = await service.postLiveEdit({from: read.live.working, to: target(layers => {layers[1][0] = 0x08;}), defaults: read.live.defaults, identity: read.live});
    assert.equal(result.converged, true);
    const coordinator = new LiveEditCoordinator(service.connection, {requestIds: service.requestIds, sleep: async () => {}, timing: {slaveMs: -1}});
    keyboard.faults.slaveLag = 50;
    const late = await coordinator.post({from: result.bytes, to: target(layers => {layers[1][1] = 0x09;}), defaults: read.live.defaults, identity: result, capacity: 130048});
    assert.equal(late.converged, false, "an edit the slave half has not taken yet is not shown as applied on both");
});

test("a lost answer ends the connection; reading again says whether the edit landed, and nothing is replayed", async t => {
    const {service, keyboard, id} = await live(t);
    const read = await service.readKeyboardProfile();
    keyboard.faults.loseReply = 0x23;
    await assert.rejects(service.postLiveEdit({from: read.live.working, to: target(layers => {layers[2][0] = 0x0a;}), defaults: read.live.defaults, identity: read.live}), {code: "TIMEOUT"});
    assert.equal(service.snapshot().connected, false);
    await service.connect(id);
    const after = await service.readKeyboardProfile();
    assert.equal(after.live.unsaved, true);
    assert.equal(validateSnapshot(after.document).layers[2][0], 0x0a, "the keyboard took it before the answer was lost");
    assert.equal(keyboard.events.filter(event => event === "published").length, 1, "nothing was sent twice");
});

test("Save writes the working copy as the saved profile; Revert puts the saved one back", async t => {
    const {service, keyboard} = await live(t);
    let read = await service.readKeyboardProfile();
    const edited = await service.postLiveEdit({from: read.live.working, to: target(layers => {layers[3][0] = 0x0c;}), defaults: read.live.defaults, identity: read.live});
    const saved = await service.saveWorkingCopy(edited);
    assert.equal(saved.saved, true);
    assert.equal(saved.unsaved, false);
    assert.equal(keyboard.generation, 43);
    assert.ok(keyboard.saved.equals(edited.bytes));
    read = await service.readKeyboardProfile();
    const again = await service.postLiveEdit({from: read.live.working, to: target(layers => {layers[3][0] = 0x0c; layers[3][1] = 0x0d;}), defaults: read.live.defaults, identity: read.live});
    const reverted = await service.revertWorkingCopy(again);
    assert.equal(reverted.unsaved, false);
    assert.equal(reverted.revision, again.revision + 1, "Revert changes the working copy, so it advances the revision");
    assert.equal(keyboard.working, null);
    // Nothing unsaved: Save writes nothing.
    assert.equal((await service.saveWorkingCopy(reverted)).saved, false);
    keyboard.faults.saveFails = EDIT_RESULT.PUBLICATION_FAILED;
    const third = await service.postLiveEdit({from: keyboard.saved, to: target(layers => {layers[4][0] = 0x0e;}), defaults: read.live.defaults, identity: reverted});
    await assert.rejects(service.saveWorkingCopy(third), {code: "LIVE_EDIT_REFUSED"});
    assert.ok(keyboard.working, "a failed save leaves the working copy as it was");
});

// A coordinator on a clock of its own: every wait moves it on, and `at(ms,
// run)` runs `run` once the clock has passed `ms`.
/** @param {Awaited<ReturnType<typeof live>>["service"]} service */
function clocked(service) {
    const clock = {ms: 0}, due = /** @type {{at: number, run: () => void}[]} */ ([]);
    const coordinator = new LiveEditCoordinator(service.connection, {requestIds: service.requestIds, now: () => clock.ms, sleep: async ms => {
        clock.ms += ms;
        for (const job of due.filter(job => clock.ms >= job.at)) {due.splice(due.indexOf(job), 1); job.run();}
    }});
    return {coordinator, clock, at: (/** @type {number} */ at, /** @type {() => void} */ run) => {due.push({at, run});}};
}
const ABORT = 0x24;

// The firmware never drops an edit waiting for a safe boundary: it publishes
// once nothing is held (live-edits.md, "Checking and publishing"). Shift held
// through a rename once made Ark call that edit failed after 5 s.
test("an edit held by a key waits for the release with no limit, says what holds it, and is published once", async t => {
    const {service, keyboard} = await live(t);
    const read = await service.readKeyboardProfile();
    const {coordinator, clock, at} = clocked(service);
    keyboard.hold(0b1000_0001);
    at(13000, () => keyboard.release());
    /** @type {unknown[]} */
    const seen = [];
    const to = target(layers => {layers[0][3] = 0x05;});
    const result = await coordinator.post({from: read.live.working, to, defaults: read.live.defaults, identity: read.live, capacity: 130048}, {onWaiting: waiting => {seen.push(waiting);}});
    assert.ok(clock.ms >= 13000, "it waited for the release");
    assert.equal(result.revision, read.live.revision + 1);
    assert.ok(result.bytes.equals(keyboard.working));
    assert.equal(result.cancelled, undefined);
    assert.equal(keyboard.events.filter(event => event === "published").length, 1);
    assert.ok(!keyboard.mutations.some(request => request[2] === ABORT), "nothing was aborted");
    assert.deepEqual(seen[0], {kind: "edit", reasons: 0b1000_0001, cancelling: false}, "page 2 says a key and a one-shot layer hold it");
    assert.equal(seen.at(-1), null, "the wait ends when the edit publishes");
});

test("Cancel edit aborts an edit held by a key, and the keyboard runs what it ran before", async t => {
    const {service, keyboard} = await live(t);
    const read = await service.readKeyboardProfile();
    const {coordinator, at} = clocked(service);
    keyboard.hold();
    /** @type {boolean[]} */
    const asked = [];
    at(2000, () => {asked.push(coordinator.cancelWaiting());});
    /** @type {unknown[]} */
    const seen = [];
    const result = await coordinator.post({from: read.live.working, to: target(layers => {layers[0][4] = 0x06;}), defaults: read.live.defaults, identity: read.live, capacity: 130048},
        {onWaiting: waiting => {seen.push(waiting);}});
    assert.deepEqual(asked, [true]);
    assert.equal(result.cancelled, true);
    assert.deepEqual([result.session, result.revision], [read.live.session, read.live.revision]);
    assert.ok(result.bytes.equals(read.live.working));
    assert.equal(keyboard.working, null, "nothing unsaved: the edit never took effect");
    assert.equal(keyboard.mutations.filter(request => request[2] === ABORT).length, 1, "one abort");
    assert.ok(seen.some(waiting => /** @type {{cancelling?: boolean} | null} */ (waiting)?.cancelling), "the wait says it is being cancelled");
    assert.equal(coordinator.cancelWaiting(), false, "nothing waits now");
    keyboard.release();
    assert.equal(keyboard.events.filter(event => event === "published").length, 0);
});

test("Cancel edit that comes as the keys are let go finds the edit landed, and says so", async t => {
    const {service, keyboard} = await live(t);
    const read = await service.readKeyboardProfile();
    const {coordinator, at} = clocked(service);
    keyboard.hold();
    at(1000, () => {coordinator.cancelWaiting(); keyboard.release();});
    const result = await coordinator.post({from: read.live.working, to: target(layers => {layers[0][7] = 0x09;}), defaults: read.live.defaults, identity: read.live, capacity: 130048});
    assert.equal(result.cancelled, undefined);
    assert.equal(result.cancelTooLate, true);
    assert.ok(result.bytes.equals(keyboard.working), "the edit runs");
    assert.ok(!keyboard.mutations.some(request => request[2] === ABORT), "no abort for an edit already published");
});

test("a checking phase that never ends still times out after the short limit", async t => {
    const {service, keyboard} = await live(t);
    const read = await service.readKeyboardProfile();
    const {coordinator, clock} = clocked(service);
    keyboard.faults.checking = true;
    await assert.rejects(coordinator.post({from: read.live.working, to: target(layers => {layers[0][5] = 0x07;}), defaults: read.live.defaults, identity: read.live, capacity: 130048}),
        {code: "LIVE_EDIT_PENDING", message: /has not finished the edit/});
    assert.ok(clock.ms > DEFAULT_TIMING.editMs && clock.ms < DEFAULT_TIMING.editMs + 1000, "the short limit, not an endless wait");
});

test("a Revert held by a key waits for the release the same way, and is not cancelled", async t => {
    const {service, keyboard} = await live(t);
    const read = await service.readKeyboardProfile();
    const edited = await service.postLiveEdit({from: read.live.working, to: target(layers => {layers[0][6] = 0x08;}), defaults: read.live.defaults, identity: read.live});
    const {coordinator, clock, at} = clocked(service);
    keyboard.hold(1 << 4);
    /** @type {boolean[]} */
    const asked = [];
    at(1000, () => {asked.push(coordinator.cancelWaiting());});
    at(9000, () => keyboard.release());
    /** @type {unknown[]} */
    const seen = [];
    const reverted = await coordinator.revert(edited, {onWaiting: waiting => {seen.push(waiting);}});
    assert.ok(clock.ms >= 9000);
    assert.equal(reverted.unsaved, false);
    assert.equal(keyboard.working, null);
    assert.deepEqual(asked, [false], "the keyboard refuses to abort its own Revert");
    assert.deepEqual(seen[0], {kind: "revert", reasons: 1 << 4, cancelling: false});
    assert.ok(!keyboard.mutations.some(request => request[2] === ABORT));
});

test("the edit mode is set and confirmed, and refused while edits are unsaved", async t => {
    const {service, keyboard} = await live(t);
    const read = await service.readKeyboardProfile();
    await service.postLiveEdit({from: read.live.working, to: target(layers => {layers[5][0] = 0x0f;}), defaults: read.live.defaults, identity: read.live});
    await assert.rejects(service.setEditMode(EDIT_MODE.APPLY), {code: "LIVE_EDIT_NOT_CLEAN"});
    keyboard.replug();
    await assert.rejects(service.setEditMode(9), /Unknown edit mode/);
    assert.equal((await service.setEditMode(EDIT_MODE.APPLY)).mode, EDIT_MODE.APPLY);
    assert.equal(keyboard.mode, EDIT_MODE.APPLY);
    // In Apply the keyboard is read and applied as before.
    const applyRead = await service.readKeyboardProfile();
    assert.equal(applyRead.live, undefined);
});

test("an edit mode change says to connect an unplugged slave half at once, and waits for a key change to reach both halves", async t => {
    const {service, keyboard} = await live(t);
    await service.readKeyboardProfile();
    const modeChanges = () => keyboard.requests.filter(r => r[0] === 0x07 && r[2] === 0x27).length;
    // The keyboard stays BUSY until the slave half is back: asked once, never again.
    keyboard.faults.slaveAbsent = true;
    const before = modeChanges();
    await assert.rejects(service.setEditMode(EDIT_MODE.APPLY), error => error.code === "LIVE_SLAVE_ABSENT" && /Connect the cable between the halves/.test(error.message));
    assert.equal(modeChanges() - before, 1, "no silent retry while the slave half is unplugged");
    delete keyboard.faults.slaveAbsent;
    // A DPI or lighting key change not yet saved: NOT_CLEAN, said as such.
    keyboard.raised.adjustmentPending = true;
    await assert.rejects(service.setEditMode(EDIT_MODE.APPLY), error => error.code === "LIVE_EDIT_NOT_CLEAN" && /key change has not reached both halves/.test(error.message));
    keyboard.raised.adjustmentPending = false;
    assert.equal((await service.setEditMode(EDIT_MODE.APPLY)).mode, EDIT_MODE.APPLY);
});

test("a keyboard that does not answer the edit mode is read as before", async t => {
    const {service} = await connectedService(t, {document: document()});
    assert.equal(service.snapshot().editMode, null);
    assert.equal((await service.readKeyboardProfile()).live, undefined);
});

test("transaction ids are nonzero and skip the one the keyboard last finished", () => {
    const ids = new TransactionIds(0xffff);
    assert.equal(ids.next(), 0xffff);
    assert.equal(ids.next(1), 2);
    assert.equal(ids.next(), 3);
});

test("transaction ids skip one still being received and any an earlier connection left", () => {
    const ids = new TransactionIds(5);
    assert.equal(ids.next(5, 6), 7);
    ids.retire(8);
    assert.equal(ids.next(), 9);
});

/** @param {Awaited<ReturnType<typeof live>>} connected @param {Partial<import("../../core/session/live-edit-coordinator").DEFAULT_TIMING>} [timing] */
const coordinatorOf = ({service}, timing = {}) => new LiveEditCoordinator(service.connection, {requestIds: service.requestIds, sleep: async () => {}, timing});
// An edit begun on the keyboard by someone else (or by Ark on a lost
// connection), never finished.
/** @param {ReturnType<typeof liveKeyboard>} keyboard @param {number} transactionId */
const beginElsewhere = (keyboard, transactionId) => {
    const {buildEditBeginRequest} = require("../../core/protocol/profile-edit-v1");
    keyboard.answer(buildEditBeginRequest(transactionId, {session: keyboard.session, revision: keyboard.revision, splices: 1, insertTotal: 1}));
    assert.equal(keyboard.receiving, transactionId);
};

test("an edit the slave half refuses is sent to it whole once; refused again, the halves are apart until Revert", async t => {
    const connected = await live(t), {service, keyboard} = connected;
    const read = await service.readKeyboardProfile();
    // Refused once: the whole copy follows, and the next edit waits for it.
    keyboard.faults.slaveRefuses = 1; keyboard.faults.slaveCatchUp = 40;
    const first = await coordinatorOf(connected, {slaveMs: -1}).post({from: read.live.working, to: target(layers => {layers[1][2] = 0x04;}), defaults: read.live.defaults, identity: read.live, capacity: 130048});
    assert.deepEqual([first.converged, first.slaveRefused], [false, false], "catching up, not apart");
    const second = await service.postLiveEdit({from: first.bytes, to: target(layers => {layers[1][2] = 0x04; layers[1][3] = 0x05;}), defaults: read.live.defaults, identity: first});
    assert.deepEqual([second.converged, second.slaveRefused], [true, false], "the next edit waited for the slave half to catch up");
    // Refused twice: apart. Save and new edits stop at once, saying Revert.
    keyboard.faults.slaveRefuses = 2;
    const third = await service.postLiveEdit({from: second.bytes, to: target(layers => {layers[1][4] = 0x06;}), defaults: read.live.defaults, identity: second});
    assert.deepEqual([third.converged, third.slaveRefused], [false, true]);
    await assert.rejects(service.saveWorkingCopy(third), error => error.code === "LIVE_HALVES_APART" && /Revert/.test(error.message));
    await assert.rejects(service.postLiveEdit({from: third.bytes, to: target(layers => {layers[1][5] = 0x07;}), defaults: read.live.defaults, identity: third}), {code: "LIVE_HALVES_APART"});
    assert.equal((await service.readKeyboardProfile()).live.slaveRefused, true, "a read says the halves are apart");
    const reverted = await service.revertWorkingCopy(third);
    assert.deepEqual([reverted.converged, reverted.slaveRefused], [true, false]);
});

test("an edit being received holds the keyboard for 15 s, then ends ABORTED", async t => {
    const connected = await live(t), {keyboard} = connected;
    beginElsewhere(keyboard, 0x1234);
    const coordinator = coordinatorOf(connected, {busyMs: -1});
    const read = await connected.service.readKeyboardProfile().catch(error => error);
    assert.equal(read.code, "LIVE_EDIT_PENDING", "a read never trusts a profile with an edit on its way");
    await assert.rejects(coordinator.post({from: keyboard.saved, to: target(layers => {layers[2][1] = 0x04;}), defaults: keyboard.saved, identity: keyboard, capacity: 130048}),
        error => error.result === "BUSY", "a new edit while one is received is BUSY, never a replacement");
    keyboard.elapse(15001);
    const progress = await coordinator.progress();
    assert.deepEqual([progress.phase, progress.lastResult, progress.lastTransactionId], [0, EDIT_RESULT.ABORTED, 0x1234]);
});

test("after a reconnect Ark aborts an edit left unfinished and never reuses its id; Revert aborts one too", async t => {
    const connected = await live(t), {service, keyboard, id} = connected;
    beginElsewhere(keyboard, 0x2222);
    await service.disconnect();
    await service.connect(id);
    assert.equal(keyboard.receiving, 0, "the reconnect aborted it");
    assert.ok(keyboard.events.includes("aborted"));
    assert.ok(service.liveCoordinator().transactionIds.retired.has(0x2222));
    const read = await service.readKeyboardProfile();
    beginElsewhere(keyboard, 0x3333);
    const edited = await coordinatorOf(connected, {busyMs: -1}).revert(read.live).catch(error => error);
    assert.equal(keyboard.receiving, 0, "Revert aborts an edit being received");
    assert.equal(edited.unsaved, false);
});

test("Ark records the bytes it sent and checks the keyboard holds a profile of their length", async t => {
    const {service, keyboard} = await live(t);
    const read = await service.readKeyboardProfile();
    keyboard.faults.lengthSkew = 1;
    await assert.rejects(service.postLiveEdit({from: read.live.working, to: target(layers => {layers[2][2] = 0x04;}), defaults: read.live.defaults, identity: read.live}),
        {code: "LIVE_EDIT_MISMATCH"});
    // A replacement records the bytes it sent as they are.
    const coordinator = new LiveEditCoordinator(service.connection, {requestIds: service.requestIds, sleep: async () => {}});
    const fresh = await service.readKeyboardProfile();
    await service.revertWorkingCopy(fresh.live);
    const clean = await service.readKeyboardProfile();
    const to = target(layers => {layers[2][3] = 0x05;});
    const replaced = await coordinator.post({from: clean.live.working, to, defaults: clean.live.defaults, identity: clean.live, capacity: 1, replaceWhenLarge: true});
    assert.ok(replaced.bytes.equals(to)); assert.ok(keyboard.working.equals(to));
});

test("a save waiting for a quiet keyboard on the slave half says so", async t => {
    const {service, keyboard} = await live(t);
    const read = await service.readKeyboardProfile();
    const edited = await service.postLiveEdit({from: read.live.working, to: target(layers => {layers[3][2] = 0x04;}), defaults: read.live.defaults, identity: read.live});
    keyboard.faults.savePauses = 3;
    const seen = [];
    const original = service.emitChange.bind(service);
    service.emitChange = () => {seen.push(service.portableProgress); original();};
    assert.equal((await service.saveWorkingCopy(edited)).saved, true);
    assert.ok(seen.includes("Waiting for a quiet keyboard to write flash"));
});

test("a mode the keyboard could not store yet is said; an unreadable mode is read again later", async t => {
    const {service, keyboard, id} = await live(t);
    keyboard.faults.modeWriteFails = true;
    assert.equal((await service.setEditMode(EDIT_MODE.APPLY)).notStored, true);
    assert.equal(service.snapshot().editMode.notStored, true);
    keyboard.faults.modeReadFails = 2;
    await service.disconnect();
    await service.connect(id);
    assert.equal(service.snapshot().editMode, null, "an unreadable mode is unknown, not fatal");
    assert.equal(service.editModeUnknown, true);
    await service.readKeyboardProfile();
    assert.equal(service.snapshot().editMode.mode, EDIT_MODE.APPLY, "read again before the next read");
    assert.notEqual(service.snapshot().runtime, null, "the toggles are read in Apply too");
});

test("flushing (leaving Live) waits for the keyboard's own save, saves what is left, and looks again after a key adjustment", async t => {
    const {keyboard, service} = await live(t, {mode: EDIT_MODE.LIVE});
    const read = await service.readKeyboardProfile();
    keyboard.externalEdit(target(layers => {layers[0][9] = 0x06;}));
    keyboard.startAutoSave();
    let polls = 0;
    const coordinator = new LiveEditCoordinator(service.connectedConnection(), {requestIds: service.requestSequence(), sleep: async () => {if (++polls === 3) keyboard.autoSave();}});
    const waited = await coordinator.flush();
    assert.equal(waited.saved, false, "its own save was enough; Ark asked for none");
    assert.ok(polls >= 3);
    assert.equal(keyboard.mutations.filter(report => report[2] === 0x25).length, 0);
    // Unsaved, and a key adjustment between the look and the Save: STALE, so
    // it looks again and saves the keyboard's newest pair.
    keyboard.externalEdit(target(layers => {layers[0][9] = 0x07;}));
    keyboard.faults.stale = true;
    const saved = await coordinator.flush();
    assert.equal(saved.saved, true);
    assert.equal(keyboard.working, null);
    assert.equal(saved.revision, keyboard.revision);
    assert.ok(read.live);
    keyboard.externalEdit(target(layers => {layers[0][9] = 0x08;}));
    keyboard.raised.slaveRefused = true;
    await assert.rejects(coordinator.flush(), {code: "LIVE_HALVES_APART"});
});


// In Live edit the keyboard saves by itself 3 s after an edit, and a save
// holds the profile for its whole length (about 6 s for a 6 KB profile on the
// keyboard, longer for larger ones). An edit made meanwhile waits for it,
// however long it takes, rather than being refused after an ordinary wait.
test("an edit made while the keyboard saves by itself waits for the save to land", async t => {
    const {service, keyboard} = await live(t, {mode: EDIT_MODE.LIVE});
    keyboard.externalEdit(target(layers => {layers[0][9] = 0x06;}));
    const read = await service.readKeyboardProfile();
    keyboard.startAutoSave();
    let clock = 0, sleeps = 0;
    const coordinator = new LiveEditCoordinator(service.connectedConnection(), {requestIds: service.requestSequence(), now: () => clock,
        sleep: async () => {clock += 250; if (++sleeps === 24) keyboard.autoSave();}});
    const result = await coordinator.post({from: read.live.working, to: target(layers => {layers[0][9] = 0x06; layers[0][10] = 0x07;}), defaults: read.live.defaults, identity: read.live, capacity: 130048});
    assert.ok(clock >= 6000, "it waited longer than an ordinary busy wait");
    assert.equal(result.revision, read.live.revision + 1);
    assert.ok(keyboard.events.indexOf("auto-saved") < keyboard.events.lastIndexOf("published"), "the save landed first, then the edit");
    assert.ok(sleeps <= 200, "it asks again at a save's pace, not every few milliseconds");
    // Busy for any other reason still ends after the ordinary wait.
    keyboard.faults.busy = 0x20;
    keyboard.raised.adjustmentPending = true;
    clock = 0;
    await assert.rejects(coordinator.post({from: result.bytes, to: target(layers => {layers[0][11] = 0x08;}), defaults: read.live.defaults, identity: result, capacity: 130048}),
        error => error.result === "BUSY");
    assert.ok(clock < 6000);
});

test("a queued keyboard adjustment is decoded and blocks new mutations until it publishes", async t => {
    const {service, keyboard} = await live(t);
    const {buildEditBeginRequest, buildSaveRequest, buildRevertRequest, buildEditModeRequest, sendEditRequest} = require("../../core/protocol/profile-edit-v1");
    const {buildCandidateBeginRequest, candidateMetadataForBlob, decodeCandidateAcknowledgement, CANDIDATE_ADMISSION, CANDIDATE_ERROR} = require("../../core/protocol/profile-candidate-v1");
    keyboard.raised.adjustmentPending = true;
    const status = await service.readLiveStatus();
    assert.equal(status.adjustmentPending, true);
    const identity = {session: keyboard.session, revision: keyboard.revision};
    for (const request of [buildEditBeginRequest(101, {...identity, splices: 1, insertTotal: 2}), buildSaveRequest(102, identity), buildRevertRequest(103, identity)]) {
        assert.equal((await sendEditRequest(service.connection, request)).result, EDIT_RESULT.BUSY);
    }
    // A mode change is NOT_CLEAN, as with unsaved edits (firmware #126).
    assert.equal((await sendEditRequest(service.connection, buildEditModeRequest(104, EDIT_MODE.LIVE))).result, EDIT_RESULT.NOT_CLEAN);
    const begin = buildCandidateBeginRequest(105, candidateMetadataForBlob(keyboard.saved, {actionAbiDigest: document().actionAbiDigest}));
    const response = keyboard.answer(begin)[0];
    const ack = decodeCandidateAcknowledgement(response, begin);
    assert.deepEqual([ack.admission, ack.errorId], [CANDIDATE_ADMISSION.BUSY, CANDIDATE_ERROR.MAILBOX_BUSY]);
    keyboard.raised.adjustmentPending = false;
    assert.equal((await service.readLiveStatus()).adjustmentPending, false);
    await sendEditRequest(service.connection, buildEditModeRequest(106, EDIT_MODE.LIVE));
    assert.equal(keyboard.mode, EDIT_MODE.LIVE);
});


test("leaving Live waits for a queued key adjustment even before it becomes unsaved", async t => {
    const {service, keyboard} = await live(t, {mode: EDIT_MODE.LIVE});
    keyboard.raised.adjustmentPending = true;
    let polls = 0;
    const coordinator = new LiveEditCoordinator(service.connectedConnection(), {requestIds: service.requestSequence(), sleep: async () => {
        if (++polls === 3) {
            keyboard.raised.adjustmentPending = false;
            keyboard.externalEdit(target(layers => {layers[0][9] = 0x06;}));
        }
    }});
    const result = await coordinator.flush();
    assert.equal(polls, 3);
    assert.equal(result.saved, true);
    assert.equal(keyboard.working, null);
    assert.equal(validateSnapshot({...document(), profile: keyboard.saved.toString("base64")}).layers[0][9], 0x06);
});

// Firmware D-F34: restart is taken in any state and answers whether the slave
// half acknowledged; a stopped keyboard's refusals say so instead of "not ready".
test("restart is sent with its confirmation and says whether the slave half took it", async t => {
    for (const unanswered of [false, true]) {
        const {service, keyboard} = await live(t);
        keyboard.raised.stopped = true;
        if (unanswered) keyboard.faults.restartUnacknowledged = true;
        const coordinator = service.liveCoordinator();
        assert.deepEqual(await coordinator.restart(), {slaveAcknowledged: !unanswered});
        const sent = keyboard.mutations.at(-1);
        assert.equal(sent[2], 0x28);
        assert.equal(sent.subarray(5, 9).toString("latin1"), "REST");
        assert.equal(keyboard.restarting.restarts, 1);
    }
});

test("a stopped keyboard's refusals name the stop and carry their own code", async t => {
    const {service, keyboard} = await live(t);
    keyboard.raised.slaveStopped = true;
    const status = await service.liveCoordinator().status();
    assert.deepEqual([status.stopped, status.slaveStopped], [false, true]);
    await assert.rejects(service.liveCoordinator().save({session: status.session, revision: status.revision}),
        error => error.code === "LIVE_KEYBOARD_STOPPED" && /The keyboard did not save: the keyboard stopped saving\. Restart it to continue\./.test(error.message));
    // BUSY with flag 15 (the slave half stopped) ends only by a restart: asked once.
    const modeChanges = () => keyboard.requests.filter(r => r[0] === 0x07 && r[2] === 0x27).length;
    const before = modeChanges();
    await assert.rejects(service.liveCoordinator().setMode(EDIT_MODE.LIVE), {code: "LIVE_KEYBOARD_STOPPED"});
    assert.equal(modeChanges() - before, 1, "no retry while a half is stopped");
    keyboard.raised.slaveStopped = false;
    await assert.rejects(service.liveCoordinator().post({from: keyboard.saved, to: target(layers => {layers[0][3] = 0x05;}), identity: {session: 0, revision: 0}, capacity: 130048}),
        error => error.code !== "LIVE_KEYBOARD_STOPPED", "a keyboard that is not stopped is refused as before");
});
