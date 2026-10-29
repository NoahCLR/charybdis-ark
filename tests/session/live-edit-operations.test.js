"use strict";
// The working copy's operations, each run as one operation of the device
// service: refused before they start without a keyboard, and followed by a
// fresh status read whether they worked or not.
const assert = require("node:assert/strict");
const test = require("node:test");
const {connectedService} = require("../fixtures/connected-service");
const {liveKeyboard} = require("../fixtures/live-keyboard");
const {document} = require("../fixtures/portable-profile");
const {editLayers} = require("../fixtures/profile-document");
const {validateSnapshot} = require("../../core/model/portable-profile");
const {testClock} = require("../fixtures/panel-loop");
const {FakeDeviceAdapter} = require("../../core/transport/fake-device-adapter");
const {ProfileDeviceService} = require("../../core/session/profile-device-service");
const {EDIT_MODE, EDIT_RESULT} = require("../../core/protocol/profile-edit-v1");
const {PROFILE_ACTIVE_KIND} = require("../../core/protocol/profile-wire-v1");
const {PHASE} = require("../../core/model/vocabulary");
const {flushWorkingCopy, postLiveEdit, readWorkingCopy, restartKeyboard, revertWorkingCopy, saveWorkingCopy, setEditMode} = require("../../core/session/live-edit-operations");

/** @param {import("node:test").TestContext} t @param {{mode?: number}} [options] */
async function live(t, {mode} = {}) {
    const keyboard = liveKeyboard({document: document(), ...(mode === undefined ? {} : {mode})});
    const clock = testClock();
    const connected = await connectedService(t, {keyboard}, {now: clock.now, sleep: clock.sleep});
    let refreshes = 0;
    const refresh = connected.service.refreshStatus.bind(connected.service);
    connected.service.refreshStatus = async () => {refreshes++; return refresh();};
    // What the service publishes, as each change is published.
    /** @type {{liveWaiting: unknown, portableProgress: string}[]} */
    const published = [];
    const emit = connected.service.emitChange.bind(connected.service);
    connected.service.emitChange = () => {published.push({liveWaiting: connected.service.liveWaiting, portableProgress: connected.service.portableProgress}); emit();};
    return {...connected, keyboard, clock, published, refreshes: () => refreshes};
}
/** @param {(layers: number[][]) => void} change */
const target = change => {const next = document(); editLayers(next, change); return Buffer.from(next.profile, "base64");};

test("without a keyboard each operation is refused before it starts, and recorded", async () => {
    const service = new ProfileDeviceService({adapter: new FakeDeviceAdapter()});
    const identity = {session: 1, revision: 1};
    /** @type {[() => Promise<unknown>, string][]} */
    const refusals = [
        [() => postLiveEdit(service, {from: Buffer.alloc(0), to: Buffer.alloc(0), defaults: Buffer.alloc(0), identity}), "Connect the keyboard before editing it."],
        [() => saveWorkingCopy(service, identity), "Connect the keyboard before saving."],
        [() => revertWorkingCopy(service, identity), "Connect the keyboard before reverting it."],
        [() => flushWorkingCopy(service, async () => "recovery"), "Connect the keyboard before changing how edits reach it."],
        [() => readWorkingCopy(service), "Connect the keyboard before reading it."],
        [() => restartKeyboard(service), "Connect the keyboard before restarting it."],
        [() => setEditMode(service, EDIT_MODE.APPLY), "Connect the keyboard before changing how edits reach it."],
    ];
    for (const [operation, message] of refusals) {
        await assert.rejects(operation(), {message});
        assert.equal(service.snapshot().error?.message, message);
    }
    assert.equal(service.busy, false);
});

test("an edit, Save and Revert each read the keyboard's status after them, a refused one too", async t => {
    const {service, keyboard, refreshes} = await live(t);
    const read = await service.readKeyboardProfile();
    const edited = await postLiveEdit(service, {from: read.live.working, to: target(layers => {layers[3][0] = 0x0c;}), defaults: read.live.defaults, identity: read.live});
    assert.equal(refreshes(), 1);
    assert.ok((await readWorkingCopy(service)).bytes.equals(keyboard.working), "what the keyboard runs, read as one revision");
    keyboard.faults.saveFails = EDIT_RESULT.PUBLICATION_FAILED;
    const said = [];
    const emit = service.emitChange.bind(service);
    service.emitChange = () => {said.push(service.portableProgress); emit();};
    await assert.rejects(saveWorkingCopy(service, edited), {code: "LIVE_EDIT_REFUSED"});
    service.emitChange = emit;
    assert.equal(refreshes(), 2, "a failed Save reads the status as well");
    assert.ok(said.includes("Saving on both halves"), "it said it was saving");
    assert.equal(said.at(-1), "", "and stopped saying so when it failed");
    const reverted = await revertWorkingCopy(service, edited);
    assert.equal(reverted.unsaved, false);
    assert.equal(refreshes(), 3);
    assert.equal(service.snapshot().liveWaiting, null, "nothing is held once Revert ends");
});

test("an edit resolves with what the keyboard runs now and its new revision, and names the transaction it took whole", async t => {
    const {service, keyboard, refreshes} = await live(t);
    const read = await service.readKeyboardProfile();
    /** @type {number[]} */
    const committed = [];
    const edited = await postLiveEdit(service, {from: read.live.working, to: target(layers => {layers[3][0] = 0x0c;}), defaults: read.live.defaults, identity: read.live},
        {onCommitted: transactionId => committed.push(transactionId)});
    assert.ok(keyboard.working && edited.bytes.equals(keyboard.working), "the bytes the keyboard runs now");
    assert.deepEqual([edited.session, edited.revision], [keyboard.session, keyboard.revision]);
    assert.equal(edited.revision, read.live.revision + 1);
    assert.deepEqual([edited.converged, edited.slaveRefused, edited.cancelled], [true, false, undefined]);
    assert.ok(edited.sent > 0);
    assert.equal(committed.length, 1, "the keyboard took one transaction whole");
    assert.equal(refreshes(), 1);
    assert.equal(service.status?.activeKind, PROFILE_ACTIVE_KIND.WORKING, "the status read after it says the keyboard runs unsaved edits");
    assert.deepEqual([service.busy, service.liveWaiting, service.snapshot().error], [false, null, null]);
    const same = await postLiveEdit(service, {from: edited.bytes, to: edited.bytes, defaults: read.live.defaults, identity: edited});
    assert.deepEqual([same.sent, same.revision], [0, edited.revision], "nothing to change sends nothing");
    assert.equal(keyboard.revision, edited.revision);
});

test("an edit the keyboard refuses rejects, is recorded, and the status is read after it", async t => {
    const {service, keyboard, refreshes} = await live(t);
    const read = await service.readKeyboardProfile();
    keyboard.faults.refuse = EDIT_RESULT.VALIDATION_REJECTED;
    await assert.rejects(postLiveEdit(service, {from: read.live.working, to: target(layers => {layers[3][0] = 0x0c;}), defaults: read.live.defaults, identity: read.live}),
        {code: "LIVE_EDIT_REFUSED", message: "The keyboard refused the edit: the keyboard's checks refused the result."});
    assert.equal(service.snapshot().error?.code, "LIVE_EDIT_REFUSED");
    assert.equal(keyboard.working, null, "the keyboard runs what it ran");
    assert.equal(refreshes(), 1);
    assert.deepEqual([service.busy, service.liveWaiting], [false, null]);
});

test("an edit held by a key publishes what holds it while it waits, once, and nothing once it lands", async t => {
    const {service, keyboard, clock, published} = await live(t);
    const read = await service.readKeyboardProfile();
    keyboard.hold(1);
    clock.at(clock.now() + 500, () => keyboard.release());
    const edited = await postLiveEdit(service, {from: read.live.working, to: target(layers => {layers[3][0] = 0x0c;}), defaults: read.live.defaults, identity: read.live});
    assert.equal(edited.cancelled, undefined);
    assert.ok(keyboard.working && edited.bytes.equals(keyboard.working), "it landed on the release");
    const waiting = published.filter(change => change.liveWaiting).map(change => change.liveWaiting);
    assert.deepEqual(waiting, [{kind: "edit", reasons: 1, cancelling: false}], "the same wait is published once, however often Ark looks");
    assert.equal(published.at(-1)?.liveWaiting, null);
    assert.equal(service.liveWaiting, null);
});

test("Cancel edit while a key holds the edit resolves as cancelled, with the bytes the keyboard ran before", async t => {
    const {service, keyboard, clock, published} = await live(t);
    const read = await service.readKeyboardProfile();
    keyboard.hold(1);
    let cancelled = false;
    clock.at(clock.now() + 200, () => {cancelled = service.cancelLiveEdit();});
    const edited = await postLiveEdit(service, {from: read.live.working, to: target(layers => {layers[3][0] = 0x0c;}), defaults: read.live.defaults, identity: read.live});
    assert.equal(cancelled, true, "Cancel edit was taken while the keyboard held it");
    assert.equal(edited.cancelled, true);
    assert.ok(edited.bytes.equals(read.live.working));
    assert.deepEqual([edited.session, edited.revision, edited.sent], [read.live.session, read.live.revision, 0]);
    assert.equal(keyboard.working, null, "the keyboard runs what it ran");
    assert.ok(published.some(change => /** @type {{cancelling?: boolean} | null} */ (change.liveWaiting)?.cancelling), "the wait said it was cancelling");
    assert.equal(service.liveWaiting, null);
    assert.equal(service.cancelLiveEdit(), false, "nothing is held now");
});

test("Save resolves with the edit status after it, says it is saving while it waits, and stops saying so", async t => {
    const {service, keyboard, published, refreshes} = await live(t);
    const read = await service.readKeyboardProfile();
    const generation = keyboard.generation;
    const edited = await postLiveEdit(service, {from: read.live.working, to: target(layers => {layers[3][0] = 0x0c;}), defaults: read.live.defaults, identity: read.live});
    keyboard.faults.savePauses = 3;
    const saved = await saveWorkingCopy(service, edited);
    assert.equal(saved.saved, true);
    assert.equal(saved.unsaved, false);
    assert.equal(saved.savedGeneration, generation + 1);
    assert.deepEqual([keyboard.working, keyboard.generation], [null, generation + 1], "the keyboard wrote a new generation");
    const said = published.map(change => change.portableProgress).filter(Boolean);
    assert.ok(said.includes("Waiting for a quiet keyboard to save"), "it said the keyboard waits for quiet");
    assert.equal(service.portableProgress, "");
    assert.equal(refreshes(), 2, "the edit and the Save each read the status after them");
    assert.equal(service.status?.activeKind, PROFILE_ACTIVE_KIND.COMMITTED, "the status read after it says the keyboard runs what it saved");
    const again = await saveWorkingCopy(service, saved);
    assert.equal(again.saved, false, "nothing unsaved: nothing is written");
    assert.equal(keyboard.generation, generation + 1);
    assert.equal(refreshes(), 3);
});

test("Revert resolves with the keyboard back on its saved profile, a Revert held by a key published while it waits", async t => {
    const {service, keyboard, clock, published, refreshes} = await live(t);
    const read = await service.readKeyboardProfile();
    const saved = keyboard.saved, generation = keyboard.generation;
    const edited = await postLiveEdit(service, {from: read.live.working, to: target(layers => {layers[3][0] = 0x0c;}), defaults: read.live.defaults, identity: read.live});
    keyboard.hold(1 << 4);
    clock.at(clock.now() + 500, () => keyboard.release());
    const reverted = await revertWorkingCopy(service, edited);
    assert.deepEqual([reverted.unsaved, reverted.converged, reverted.slaveRefused], [false, true, false]);
    assert.equal(reverted.session, keyboard.session);
    assert.equal(keyboard.working, null);
    assert.ok(keyboard.saved.equals(saved), "it runs what it saved");
    assert.equal(keyboard.generation, generation, "and nothing was written");
    assert.deepEqual(published.filter(change => change.liveWaiting).map(change => change.liveWaiting), [{kind: "revert", reasons: 1 << 4, cancelling: false}]);
    assert.equal(service.liveWaiting, null);
    assert.equal(refreshes(), 2);
    assert.equal(service.status?.activeKind, PROFILE_ACTIVE_KIND.COMMITTED);
});

test("leaving Live edit with nothing unsaved saves nothing and keeps no recovery copy", async t => {
    const {service, keyboard, refreshes} = await live(t, {mode: EDIT_MODE.LIVE});
    const generation = keyboard.generation;
    /** @type {unknown[]} */
    const recoveries = [];
    const flushed = await flushWorkingCopy(service, async saved => {recoveries.push(saved); return "recovery";});
    assert.deepEqual([flushed.saved, flushed.unsaved], [false, false]);
    assert.deepEqual(recoveries, []);
    assert.equal(keyboard.generation, generation);
    assert.equal(refreshes(), 1);
    assert.equal(service.portableProgress, "");
});

test("leaving Live edit keeps a recovery copy of what is saved, then the keyboard saves what it has not", async t => {
    const {service, keyboard, published, refreshes} = await live(t, {mode: EDIT_MODE.LIVE});
    const before = keyboard.saved;
    keyboard.externalEdit(target(layers => {layers[0][9] = 0x06;}));
    const working = keyboard.working;
    /** @type {import("../../core/model/types.js").PortableDocument[]} */
    const recoveries = [];
    const flushed = await flushWorkingCopy(service, async saved => {recoveries.push(saved); return "recovery";});
    assert.equal(recoveries.length, 1);
    assert.ok(Buffer.from(recoveries[0].profile, "base64").equals(before), "the recovery copy is the profile saved before");
    assert.deepEqual([flushed.saved, flushed.unsaved], [true, false]);
    assert.equal(keyboard.working, null);
    assert.ok(working && keyboard.saved.equals(working), "the keyboard saved what it ran");
    assert.ok(published.some(change => change.portableProgress === "Saving what the keyboard has not saved yet"));
    assert.equal(service.portableProgress, "");
    assert.equal(refreshes(), 1);
    assert.deepEqual([service.busy, service.snapshot().error], [false, null]);
});

test("a keyboard that moves before its recovery copy is saved is looked at again, and the copy kept of what it then holds", async t => {
    const {service, keyboard} = await live(t, {mode: EDIT_MODE.LIVE});
    keyboard.externalEdit(target(layers => {layers[0][9] = 0x06;}));
    // A key adjustment lands between Ark's look at the status and its read
    // of what is saved.
    let moved = false;
    const emit = service.emitChange;
    service.emitChange = () => {
        if (!moved && service.portableProgress === "Saving what the keyboard has not saved yet") {moved = true; keyboard.externalEdit(target(layers => {layers[0][9] = 0x07;}));}
        emit();
    };
    let recoveries = 0;
    const flushed = await flushWorkingCopy(service, async () => {recoveries++; return "recovery";});
    assert.equal(moved, true);
    assert.equal(recoveries, 1, "no recovery copy is kept of the pair that moved");
    assert.equal(flushed.saved, true);
    assert.equal(flushed.revision, keyboard.revision);
    assert.equal(keyboard.working, null);
    assert.equal(validateSnapshot({...document(), profile: keyboard.saved.toString("base64")}).layers[0][9], 0x07, "the newest pair is saved");
});

test("leaving Live edit with no recovery copy saved saves nothing on the keyboard", async t => {
    const {service, keyboard, refreshes} = await live(t, {mode: EDIT_MODE.LIVE});
    const generation = keyboard.generation;
    keyboard.externalEdit(target(layers => {layers[0][9] = 0x06;}));
    const working = keyboard.working;
    await assert.rejects(flushWorkingCopy(service, async () => undefined),
        {code: "RECOVERY_REQUIRED", message: "A recovery copy could not be saved. Nothing was saved on the keyboard."});
    assert.ok(working && keyboard.working?.equals(working), "the edits stay unsaved");
    assert.equal(keyboard.generation, generation);
    assert.equal(service.snapshot().error?.code, "RECOVERY_REQUIRED");
    assert.equal(service.portableProgress, "");
    assert.equal(refreshes(), 1, "the status is read after it all the same");
});

test("reading what the keyboard runs takes its working copy, or its saved profile, and leaves the status alone", async t => {
    const {service, keyboard, refreshes} = await live(t);
    const saved = await readWorkingCopy(service);
    assert.ok(saved.bytes.equals(keyboard.saved), "nothing unsaved: what it saved");
    assert.equal(saved.metadata.length, keyboard.saved.length);
    const read = await service.readKeyboardProfile();
    await postLiveEdit(service, {from: read.live.working, to: target(layers => {layers[3][0] = 0x0c;}), defaults: read.live.defaults, identity: read.live});
    const runs = refreshes();
    const working = await readWorkingCopy(service);
    assert.ok(keyboard.working && working.bytes.equals(keyboard.working), "unsaved edits: what it runs");
    assert.equal(refreshes(), runs, "a read asks for no status after it");
    assert.deepEqual([service.busy, service.phase], [false, PHASE.READ_COMPLETE]);
});

test("a restart resolves with whether the slave half restarts too, and expects the keyboard to drop off USB", async t => {
    const {service, keyboard} = await live(t);
    const read = await service.readKeyboardProfile();
    await postLiveEdit(service, {from: read.live.working, to: target(layers => {layers[3][0] = 0x0c;}), defaults: read.live.defaults, identity: read.live});
    assert.deepEqual(await restartKeyboard(service), {slaveAcknowledged: true});
    assert.deepEqual([service.reconnectExpected, service.reconnectReason], [true, "to restart"]);
    assert.equal(keyboard.restarting.restarts, 1);
    assert.equal(keyboard.working, null, "it boots as from power, with nothing unsaved");
    keyboard.faults.restartUnacknowledged = true;
    assert.deepEqual(await restartKeyboard(service), {slaveAcknowledged: false}, "the slave half did not answer: only the master restarts");
});

test("a restart that fails expects no loss of the keyboard", async t => {
    const {service, keyboard} = await live(t);
    keyboard.faults.noRestart = true;
    await assert.rejects(restartKeyboard(service));
    assert.equal(service.reconnectExpected, false, "losing it now would be a failure");
    assert.equal(keyboard.restarting.restarts, 0);
    assert.ok(service.snapshot().error, "the failure is recorded");
});

test("the edit mode resolves as the keyboard confirms it, kept on the service; a keyboard with unsaved edits keeps its mode", async t => {
    const {service, keyboard} = await live(t);
    assert.equal(service.editMode?.mode, EDIT_MODE.LIVE_REVIEW);
    const applied = await setEditMode(service, EDIT_MODE.APPLY);
    assert.equal(applied?.mode, EDIT_MODE.APPLY);
    assert.equal(applied?.notStored, false);
    assert.equal(service.editMode, applied);
    assert.equal(keyboard.mode, EDIT_MODE.APPLY);
    keyboard.faults.modeWriteFails = true;
    assert.equal((await setEditMode(service, EDIT_MODE.LIVE))?.notStored, true, "a mode not stored yet says so");
    keyboard.externalEdit(target(layers => {layers[0][9] = 0x06;}));
    const kept = service.editMode;
    await assert.rejects(setEditMode(service, EDIT_MODE.APPLY), {code: "LIVE_EDIT_NOT_CLEAN"});
    assert.equal(service.editMode, kept);
    assert.equal(keyboard.mode, EDIT_MODE.LIVE);
});
