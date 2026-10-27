"use strict";
// Restarting the keyboard from Ark (firmware D-F34), through the panel loop
// the page runs, against a keyboard with a working copy that can stop saving
// and restart: the unsaved edits are kept with a recovery copy, the keyboard
// restarts, comes back and is read again, and the edits go back unsaved.
const assert = require("node:assert/strict");
const test = require("node:test");
const {openPanelLoop} = require("../../core/session/panel-loop");
const {BOOT, booting, fakeKeyboardAdapter} = require("../fixtures/fake-keyboard");
const {liveKeyboard} = require("../fixtures/live-keyboard");
const {document} = require("../fixtures/portable-profile");
const {EDIT_MODE} = require("../../core/protocol/profile-edit-v1");
const {LOST_WORDS, RESTART_WORDS} = require("../../core/session/keyboard-reconnect");
const {RESTART_LABEL} = require("../../core/session/keyboard-restart");
const {PHASE} = require("../../core/model/vocabulary");
const {STARTING, STARTING_WORDS} = require("../../core/session/keyboard-starting");
const {PROFILE_ACTIVE_KIND} = require("../../core/protocol/profile-wire-v1");
const {validateSnapshot} = require("../../core/model/portable-profile");
const {replaceDomain} = require("../../core/schema/profile-domains");
const {encodeKeymapDomain} = require("../../core/schema/keymap-domain-v1");

function fakeShell({recoveryFails = false} = {}) {
    const shell = {
        posted: [], errors: [], recoveries: [], made: [],
        post: (message) => {shell.posted.push(message);},
        showError: (text) => {shell.errors.push(text);},
        saveRecovery: async (doc, about) => {if (recoveryFails) return undefined; shell.recoveries.push(doc); shell.made.push(about); return `/recovery/${shell.recoveries.length}.json`;},
        saveExport: async () => undefined,
    };
    return shell;
}
const model = shell => shell.posted.filter(message => message.type === "model").at(-1).model;
const notices = shell => shell.posted.filter(message => message.notice).map(message => message.notice);

/** @param {import("node:test").TestContext} t @param {{mode?: number, recoveryFails?: boolean, comesBack?: boolean, boot?: Parameters<ReturnType<typeof booting>["boot"]>[0], clock?: {now: number}, newId?: boolean, serial?: boolean}} [options] */
async function open(t, {mode = EDIT_MODE.LIVE_REVIEW, recoveryFails = false, comesBack = true, boot, clock, newId = false, serial = true} = {}) {
    const keyboard = booting(liveKeyboard({document: document(), mode}));
    const shell = fakeShell({recoveryFails});
    const adapter = fakeKeyboardAdapter({keyboard});
    // The service's clock, when the test keeps one, moves only as it waits.
    const time = clock ? {now: () => clock.now, sleep: async ms => {clock.now += ms;}} : {sleep: async () => {}};
    const loop = openPanelLoop(shell, {adapter, defaultTimeoutMs: 300, ...time,
        reconnect: {sleep: () => new Promise(resolve => setTimeout(resolve, 5)), waitMs: comesBack ? 5000 : 50}});
    t.after(() => loop.close());
    // The keyboard drops off USB just after it answers, and comes back under
    // the same name and serial number, unless the test says it does not:
    // node-hid lists it under a new path each time, a browser shows no serial.
    if (!serial) adapter.devices = adapter.devices.map(({serialNumber, ...device}) => device);
    const devices = newId ? adapter.devices.map(device => ({...device, id: `${device.id}-again`})) : adapter.devices;
    keyboard.restarting.onRestart = () => {
        // Back on USB, it starts as the firmware does (D-F61), when the test says.
        if (boot) keyboard.boot(boot);
        adapter.lastConnection().emitDisconnect(new Error("restarted"));
        adapter.devices = [];
        loop.serviceChanged();
        if (comesBack) setTimeout(() => {adapter.devices = devices;}, 15);
    };
    await loop.handleMessage({type: "refresh"});
    /** @param {object} message */
    const send = message => loop.handleMessage({draftId: loop.session.draft?.id, draftRevision: loop.session.draft?.revision, ...message});
    /** @param {number} layoutIndex @param {string} keycode */
    const key = (layoutIndex, keycode) => send({type: "updateLayoutKeys", layer: "Layer 0", changes: [{layoutIndex, keycode}]});
    return {keyboard, shell, loop, send, key, adapter, session: loop.session};
}

// The keyboard of 2026-10-19: unsaved edits, then its storage stopped.
async function stoppedWithEdits(t, options) {
    const opened = await open(t, options);
    await opened.key(10, "KC_X");
    const edited = opened.keyboard.working;
    opened.keyboard.raised.stopped = true;
    // The live watch's look, as between edits.
    opened.loop.session.draft.observeLiveStatus(await opened.loop.session.service.readLiveStatus());
    opened.loop.publish();
    return {...opened, edited};
}

test("a stopped keyboard says so instead of 'not ready' or 'catching up', and refuses Save plainly", async t => {
    const {shell, send, session} = await stoppedWithEdits(t);
    const live = model(shell).draft.live;
    assert.equal(live.keyboard.stopped, true);
    assert.equal(live.keyboard.slaveStopped, false);
    await send({type: "reviewProfileDraft"});
    await send({type: "saveProfileDraft", confirmChecks: true});
    const said = notices(shell).at(-1);
    assert.match(said, /stopped saving\. Restart it to continue/);
    assert.doesNotMatch(said, /not ready/);
    assert.ok(session.draft.live.unsaved, "nothing was saved");
});

test("Restart keeps the unsaved edits, restarts both halves and puts them back unsaved (Live + review)", async t => {
    const {keyboard, shell, loop, send, session, edited} = await stoppedWithEdits(t);
    const sessionBefore = keyboard.session;
    await send({type: "restartKeyboard"});
    // The recovery copy holds what the keyboard ran: the unsaved edits.
    assert.equal(shell.recoveries.length, 1);
    assert.equal(shell.recoveries[0].profile, edited.toString("base64"));
    assert.deepEqual(shell.made, [{cause: "restart", keyboard: model(shell).device.label}], "named for the restart and this keyboard");
    assert.equal(keyboard.restarting.restarts, 1);
    assert.match(notices(shell).at(-1), /Restarting the keyboard… Ark keeps its unsaved edits/);
    await loop.reconnected();
    assert.equal(loop.session.reconnect, undefined);
    assert.notEqual(keyboard.session, sessionBefore, "a new boot");
    assert.ok(keyboard.working?.equals(edited), "the edits run on the keyboard again");
    assert.ok(!keyboard.saved.equals(edited), "and are not saved");
    const published = model(shell);
    assert.equal(published.device.connected, true);
    assert.equal(published.draft.live.unsaved, true);
    assert.equal(published.draft.live.keyboard.stopped, false);
    assert.equal(session.draft.history.at(-1).label, RESTART_LABEL);
    const said = notices(shell).at(-1);
    assert.ok(said.startsWith(RESTART_WORDS.back()), said);
    assert.match(said, /Your unsaved edits are back on the keyboard, not saved yet: review and save them\./);
    // And they save as any edit does.
    await send({type: "reviewProfileDraft"});
    await send({type: "saveProfileDraft", confirmChecks: true});
    assert.equal(keyboard.working, null);
    assert.ok(keyboard.saved.equals(edited));
});

test("a keyboard still starting when it is back is waited for, then read, and the edits go back unsaved", async t => {
    const {keyboard, shell, loop, send, session, edited} = await stoppedWithEdits(t, {boot: BOOT});
    await send({type: "restartKeyboard"});
    await loop.reconnected();
    assert.ok(keyboard.working?.equals(edited), "the edits run on the keyboard again");
    assert.ok(!keyboard.saved.equals(edited), "and are not saved");
    const published = model(shell);
    assert.equal(published.device.health.error, "", "no health error");
    assert.equal(published.draft.live.unsaved, true);
    assert.equal(session.draft.history.at(-1).label, RESTART_LABEL);
    const said = notices(shell).at(-1);
    assert.ok(said.startsWith(RESTART_WORDS.back()), said);
    assert.match(said, /Your unsaved edits are back on the keyboard, not saved yet: review and save them\./);
    assert.ok(shell.posted.some(message => message.type === "model" && message.model.load.state === "loading"
        && message.model.load.phase === PHASE.STARTING), "the panel said it waited for the keyboard to finish starting");
});

test("a keyboard that does not finish starting says so and names the recovery copy; read later, it gets the edits back", async t => {
    const clock = {now: 0};
    const {keyboard, shell, loop, send, edited} = await stoppedWithEdits(t, {clock, boot: [{activeKind: PROFILE_ACTIVE_KIND.PENDING, stateFlags: 0xb2, reads: Infinity}]});
    await send({type: "restartKeyboard"});
    const since = clock.now;
    await loop.reconnected();
    assert.ok(clock.now - since >= STARTING.WAIT_MS, "it waited the bound");
    const said = notices(shell).at(-1);
    assert.ok(said.startsWith(STARTING_WORDS.timeout), said);
    assert.equal(said.match(/recovery copy: \/recovery\/1\.json/g)?.length, 1, "the recovery copy, named once");
    assert.equal(keyboard.working, null, "nothing was put back on a keyboard still starting");
    // It finishes; reading it then puts the edits back.
    keyboard.boot([]);
    await send({type: "refresh"});
    assert.ok(keyboard.working?.equals(edited));
    assert.match(notices(shell).at(-1), /Your unsaved edits are back on the keyboard, not saved yet/);
});

for (const [label, options] of [["with its serial number", {}], ["without a serial number, as in a browser", {serial: false}]]) {
    test(`a keyboard back under a new device id ${label} is the same keyboard: the edits go back to it, and save`, async t => {
        const {keyboard, shell, loop, send, session, edited} = await stoppedWithEdits(t, {newId: true, boot: BOOT, ...options});
        const before = loop.session.service.snapshot().selectedDeviceId;
        await send({type: "restartKeyboard"});
        await loop.reconnected();
        assert.notEqual(loop.session.service.snapshot().selectedDeviceId, before, "listed under a new device id");
        assert.ok(keyboard.working?.equals(edited), "the edits run on the restarted keyboard");
        assert.equal(session.draft.live.session, keyboard.session, "the draft follows its new session");
        const published = model(shell);
        assert.equal(published.draft.matching, true);
        assert.equal(published.draft.editable, true);
        assert.match(notices(shell).at(-1), /Your unsaved edits are back on the keyboard, not saved yet/);
        await send({type: "reviewProfileDraft"});
        await send({type: "saveProfileDraft", confirmChecks: true});
        assert.equal(keyboard.working, null);
        assert.ok(keyboard.saved.equals(edited), "saved");
    });
}

test("a restart that timed out, then replugged under a new device id, still gets its edits back once followed back", async t => {
    const clock = {now: 0};
    const {keyboard, shell, loop, send, adapter, edited} = await stoppedWithEdits(t, {clock, newId: true, boot: [{activeKind: PROFILE_ACTIVE_KIND.PENDING, stateFlags: 0xb2, reads: Infinity}]});
    await send({type: "restartKeyboard"});
    await loop.reconnected();
    assert.ok(notices(shell).at(-1).startsWith(STARTING_WORDS.timeout));
    // Unplugged and plugged back in: listed under yet another device id.
    adapter.lastConnection().emitDisconnect(new Error("Unplugged."));
    adapter.devices = adapter.devices.map(device => ({...device, id: `${device.id}-third`}));
    keyboard.boot([]);
    loop.serviceChanged();
    await loop.reconnected();
    assert.ok(keyboard.working?.equals(edited), "the edits run on the keyboard");
    assert.equal(model(shell).draft.matching, true);
    const said = notices(shell).at(-1);
    assert.ok(said.startsWith(LOST_WORDS.back("disconnected")), said);
    assert.match(said, /Your unsaved edits are back on the keyboard, not saved yet/);
});

test("in Live the put-back edits are left for the keyboard's own save", async t => {
    const {keyboard, shell, loop, send, edited} = await stoppedWithEdits(t, {mode: EDIT_MODE.LIVE});
    await send({type: "restartKeyboard"});
    await loop.reconnected();
    assert.ok(keyboard.working?.equals(edited));
    assert.match(notices(shell).at(-1), /back on the keyboard, which saves them in a moment/);
    keyboard.autoSave();
    assert.ok(keyboard.saved.equals(edited));
});

test("with nothing unsaved a restart saves no recovery copy and puts nothing back", async t => {
    const {keyboard, shell, loop, send} = await open(t);
    keyboard.raised.stopped = true;
    loop.session.draft.observeLiveStatus(await loop.session.service.readLiveStatus());
    await send({type: "restartKeyboard"});
    assert.equal(shell.recoveries.length, 0);
    await loop.reconnected();
    assert.equal(keyboard.working, null);
    assert.equal(notices(shell).at(-1), RESTART_WORDS.back());
});

test("the working copy read failing falls back to the draft's own copy of it", async t => {
    const {keyboard, shell, loop, send, edited} = await stoppedWithEdits(t);
    keyboard.faults.workingReadFails = true;
    await send({type: "restartKeyboard"});
    assert.equal(shell.recoveries[0].profile, edited.toString("base64"));
    await loop.reconnected();
    assert.ok(keyboard.working?.equals(edited));
});

test("no recovery copy, no restart", async t => {
    const {keyboard, shell, send} = await stoppedWithEdits(t, {recoveryFails: true});
    await send({type: "restartKeyboard"});
    assert.equal(keyboard.restarting.restarts, 0);
    assert.match(notices(shell).at(-1), /recovery copy .* could not be saved, so it was not restarted/);
});

test("firmware without restart answers unhandled: nothing happens, and the recovery copy is named", async t => {
    const {keyboard, shell, loop, send} = await stoppedWithEdits(t);
    keyboard.faults.noRestart = true;
    await send({type: "restartKeyboard"});
    assert.equal(keyboard.restarting.restarts, 0);
    assert.equal(loop.session.reconnect, undefined);
    assert.equal(loop.session.restart, undefined);
    const said = notices(shell).at(-1);
    assert.match(said, /firmware cannot restart from Ark, so nothing happened\. Unplug the keyboard/);
    assert.match(said, /recovery copy: \/recovery\/1\.json/);
    assert.equal(model(shell).device.connected, true, "the keyboard is still there");
});

test("a slave half that missed the restart needs no replug once the keyboard is back with it", async t => {
    // Read again, the keyboard answers for both halves, and the half that
    // missed the restart rejoins by itself (firmware D-F34).
    const {keyboard, shell, loop, send, edited} = await stoppedWithEdits(t);
    keyboard.faults.restartUnacknowledged = true;
    await send({type: "restartKeyboard"});
    await loop.reconnected();
    assert.ok(keyboard.working?.equals(edited));
    assert.doesNotMatch(notices(shell).at(-1), /unplug/);
});

test("a restart the slave half missed, of a keyboard that does not come back, says to replug", async t => {
    const {keyboard, shell, loop, send} = await stoppedWithEdits(t, {comesBack: false});
    keyboard.faults.restartUnacknowledged = true;
    await send({type: "restartKeyboard"});
    await loop.reconnected();
    assert.match(notices(shell).at(-1), /slave half did not answer the restart: if the halves do not agree now, unplug the keyboard/);
});

test("a keyboard that stops again at once is told apart: the edits stay in the recovery copy", async t => {
    const {keyboard, shell, loop, send} = await stoppedWithEdits(t);
    keyboard.faults.stopsAgain = true;
    await send({type: "restartKeyboard"});
    await loop.reconnected();
    assert.equal(keyboard.working, null, "nothing was sent to a stopped keyboard");
    const said = notices(shell).at(-1);
    assert.match(said, /stopped saving again at once, so the fault is in its flash or its firmware/);
    assert.match(said, /not put back\. Your unsaved edits are in the recovery copy: \/recovery\/1\.json/);
});

// Under a Review and save draft the edits are Ark's own, not the keyboard's:
// a restart loses nothing, so there is no recovery copy and nothing to put
// back, and the draft stays as it was once the keyboard is back.
/** @param {import("node:test").TestContext} t @param {"stopped" | "slaveStopped"} flag @param {Parameters<typeof open>[1]} [options] */
async function stoppedUnderApply(t, flag, options) {
    const opened = await open(t, {mode: EDIT_MODE.APPLY, ...options});
    await opened.key(10, "KC_X");
    await opened.key(11, "KC_Y");
    opened.keyboard.raised[flag] = true;
    // The live watch's look under a Review and save draft.
    opened.loop.session.draft.observeApplyStatus(await opened.loop.session.service.readLiveStatus());
    opened.loop.publish();
    return opened;
}

for (const [flag, half] of [["stopped", "master"], ["slaveStopped", "slave"]]) {
    test(`under an Apply draft, Restart of a stopped ${half} half keeps the draft and clears the stopped state`, async t => {
        const {keyboard, shell, loop, send, session} = await stoppedUnderApply(t, flag);
        const draft = session.draft, edited = draft.current.fingerprint, steps = draft.history.length;
        assert.equal(model(shell).draft.keyboard[flag], true, "the panel shows the stopped half");
        await send({type: "restartKeyboard"});
        assert.equal(shell.recoveries.length, 0, "nothing on the keyboard to lose");
        assert.equal(keyboard.restarting.restarts, 1);
        assert.equal(notices(shell).at(-1), "Restarting the keyboard…");
        await loop.reconnected();
        assert.equal(keyboard.working, null, "nothing was sent to the keyboard");
        assert.equal(loop.session.draft, draft, "the same draft");
        assert.equal(draft.live, null, "still an Apply draft");
        assert.equal(draft.current.fingerprint, edited, "with its edits");
        assert.equal(draft.history.length, steps, "and its draft history");
        assert.equal(draft.stale, false, "bound to the keyboard it restarted, over its new connection: nothing to review again");
        const published = model(shell);
        assert.equal(published.device.connected, true);
        assert.equal(published.draft.changes.length, 2);
        assert.equal(published.draft.keyboard.stopped, false);
        assert.equal(published.draft.keyboard.slaveStopped, false);
        assert.equal(notices(shell).at(-1), RESTART_WORDS.back());
        // Bound to it, so Apply goes ahead as it would have before the stop.
        assert.equal(draft.bindingTo(loop.session.service.snapshot()), "");
        assert.equal(published.draft.editable, true);
    });
}

test("under an Apply draft, a keyboard changed across the restart leaves the draft to review again", async t => {
    const {keyboard, loop, send, session} = await stoppedUnderApply(t, "stopped");
    const draft = session.draft;
    // Saved by the keyboard's own keys as it came back.
    const layers = validateSnapshot(document()).layers; layers[3][2] = 0x06;
    const restarted = keyboard.restarting.onRestart;
    keyboard.restarting.onRestart = () => {
        keyboard.externalEdit(replaceDomain(keyboard.saved, 0x60, () => encodeKeymapDomain(layers)));
        keyboard.autoSave();
        restarted?.();
    };
    await send({type: "restartKeyboard"});
    await loop.reconnected();
    assert.equal(loop.session.draft, draft);
    assert.equal(draft.stale, true, "what the keyboard holds is no longer what the draft began from");
});

test("under an Apply draft, Apply of a keyboard that stopped saving is refused as stopped, before any recovery copy or write", async t => {
    const {keyboard, shell, send, session} = await stoppedUnderApply(t, "slaveStopped");
    const before = keyboard.mutations.length;
    await send({type: "reviewProfileDraft"});
    await send({type: "applyProfileDraft", confirmChecks: true});
    const said = notices(shell).at(-1);
    assert.match(said, /stopped saving\. Restart it to continue/);
    assert.doesNotMatch(said, /not ready/);
    assert.equal(shell.recoveries.length, 0);
    assert.equal(keyboard.mutations.length, before, "nothing was written");
    assert.equal(session.draft.dirty, true, "the draft is kept");
    assert.equal(model(shell).apply, null, "no Apply began, so the bar still offers Restart");
});

test("under an Apply draft, a look skipped after the restart forgets what the old boot said; the next look says what it finds", async t => {
    const {keyboard, shell, loop, send, session} = await stoppedUnderApply(t, "stopped");
    keyboard.faults.stopsAgain = true;
    const service = session.service, look = service.readLiveStatus;
    await send({type: "restartKeyboard"});
    // The put-back's look is skipped, as one is while the keyboard is busy.
    let skipped = false;
    service.readLiveStatus = async () => {if (!skipped) {skipped = true; return undefined;} return look.call(service);};
    await loop.reconnected();
    assert.ok(skipped);
    assert.equal(model(shell).draft.keyboard, null, "nothing said of the new boot yet, and nothing of the old one");
    assert.equal(notices(shell).at(-1), RESTART_WORDS.back());
    assert.equal(session.draft.observeApplyStatus(await service.readLiveStatus()), true, "the next look finds it stopped");
    assert.equal(session.draft.applyKeyboard?.stopped, true);
});

test("under an Apply draft, a keyboard that stops again at once says so and keeps the draft", async t => {
    const {keyboard, shell, loop, send, session} = await stoppedUnderApply(t, "stopped", {newId: true});
    const draft = session.draft, edited = draft.current.fingerprint;
    keyboard.faults.stopsAgain = true;
    await send({type: "restartKeyboard"});
    await loop.reconnected();
    assert.equal(loop.session.draft, draft);
    assert.equal(draft.current.fingerprint, edited, "the draft keeps its edits");
    assert.equal(draft.stale, false);
    assert.equal(model(shell).draft.keyboard.stopped, true, "still stopped");
    const said = notices(shell).at(-1);
    assert.match(said, /stopped saving again at once, so the fault is in its flash or its firmware/);
    assert.doesNotMatch(said, /unsaved edits/, "an Apply draft had none on the keyboard");
});

test("a keyboard that does not come back says so and names the recovery copy", async t => {
    const {keyboard, shell, loop, send} = await stoppedWithEdits(t, {comesBack: false});
    await send({type: "restartKeyboard"});
    await loop.reconnected();
    assert.equal(keyboard.restarting.restarts, 1);
    const said = notices(shell).at(-1);
    assert.ok(said.startsWith(RESTART_WORDS.timeout), said);
    assert.match(said, /recovery copy: \/recovery\/1\.json/);
});
