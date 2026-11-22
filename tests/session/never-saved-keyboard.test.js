"use strict";
// A keyboard that never saved a profile, through the panel loop the page
// runs: what every keyboard is after a firmware update whose compiled
// defaults changed, and what a new one is. It runs its compiled defaults
// until its first live edit, and from then a working copy over them, which no
// half saved: profile status names generation 0 and origin half 255 (Profile
// Wire, "Profile status"), as the edit status names its saved base.
//
// The path here is the one a person takes after such an update: connect,
// bring a whole backup in, look again, review, Save; and opening Ark on a
// keyboard already running that backup unsaved.
const assert = require("node:assert/strict");
const test = require("node:test");
const {fakeShell, lastMessage, lastModel, notices, openLoop} = require("../fixtures/panel-loop");
const {liveKeyboard} = require("../fixtures/live-keyboard");
const {compiled, document, settings} = require("../fixtures/portable-profile");
const {editSettingsDomain} = require("../fixtures/profile-document");
const {validateSnapshot} = require("../../core/model/portable-profile");
const {SETTING} = require("../../core/schema/settings-domain-v1");
const {EDIT_MODE, PROFILE_EDIT_V1} = require("../../core/protocol/profile-edit-v1");
const {PROFILE_ACTIVE_KIND, PROFILE_ORIGIN_COMPILED, decodeStatusPages} = require("../../core/protocol/profile-wire-v1");

// The firmware's own profile: an empty layout, no combos.
const defaults = () => compiled();
// A person's whole backup: keys on three layers, two combos and its own layer
// names, so the keymap, combos and settings all differ from the defaults.
function backup() {
    const layers = Array.from({length: 16}, () => Array(60).fill(0));
    for (const layer of [0, 1, 2]) for (let position = 0; position < 40; position++) layers[layer][position] = 0x04 + ((layer * 7 + position) % 26);
    // MO(1) and MO(2), so its layers are reached.
    layers[0][0] = 0x5221; layers[0][1] = 0x5222;
    const policy = settings();
    policy.names = ["Base", "Number", "Symbol", "Navigation", ...policy.names.slice(4)];
    return compiled({layers, policy, combos: [
        {id: 0, inputs: [4, 5], output: 8, termMs: 50, followsDefault: true, mustHold: false, mustTap: false, ordered: false},
        {id: 1, inputs: [6, 7], output: 9, termMs: 50, followsDefault: true, mustHold: false, mustTap: false, ordered: false}]});
}
/** @param {import("../../core/model/types.js").PortableDocument} doc */
const bytesOf = doc => Buffer.from(validateSnapshot(doc).candidate);

/** @param {import("node:test").TestContext} t @param {{mode?: number, running?: Buffer, shell?: ReturnType<typeof fakeShell>} & Record<string, unknown>} [options] */
async function open(t, {mode = EDIT_MODE.LIVE_REVIEW, running, shell, ...options} = {}) {
    const keyboard = liveKeyboard({document: defaults(), compiledOnly: true, mode, ...options});
    // Unsaved edits it already ran before Ark opened.
    if (running) keyboard.externalEdit(running);
    return openLoop(t, {keyboard, ...(shell && {shell})});
}

// Profile status as the keyboard answers it now, read off the wire.
/** @param {ReturnType<typeof liveKeyboard>} keyboard */
function wireStatus(keyboard) {
    const page = (/** @type {number} */ at) => {
        const request = Buffer.alloc(32); request.set([0x08, 0, 0x02, 1, at]);
        return keyboard.answer(request)[0].subarray(7, 32);
    };
    return decodeStatusPages([page(0), page(1)]);
}
/** @param {ReturnType<typeof liveKeyboard>} keyboard */
const sets = keyboard => keyboard.mutations.length;

/** @param {Awaited<ReturnType<typeof open>>} loop @param {import("../../core/model/types.js").PortableDocument} doc */
async function importBackup({send, session}, doc) {
    await send({type: "reviewPortableProfile", text: JSON.stringify(doc), name: "mine.charybdis.json"});
    assert.ok(session.portableReview, "the backup is reviewed against the keyboard first");
    await send({type: "restorePortableProfile"});
    // A backup that adds a warning or a trap asks first, as any live edit does.
    if (session.liveProposal) await send({type: "confirmLiveEdit", proposal: session.liveProposal.id});
}

// Review, then Save with the checks confirmed, as the commit bar posts them.
/** @param {Awaited<ReturnType<typeof open>>} loop */
async function reviewAndSave({send}) {
    await send({type: "reviewProfileDraft"});
    await send({type: "saveProfileDraft", confirmChecks: true});
}

test("the fake never-saved keyboard answers status as firmware does: origin 255 only while a working copy runs over its defaults", async t => {
    const {keyboard} = await open(t);
    const idle = wireStatus(keyboard);
    assert.deepEqual([idle.activeKind, idle.activeGeneration, idle.activeOriginHalf, idle.committedGeneration, idle.committedOriginHalf],
        [PROFILE_ACTIVE_KIND.COMPILED_ONLY, 0, 0, 0, 0]);
    keyboard.externalEdit(bytesOf(backup()));
    const working = wireStatus(keyboard);
    assert.deepEqual([working.activeKind, working.activeGeneration, working.activeOriginHalf, working.committedGeneration, working.committedOriginHalf],
        [PROFILE_ACTIVE_KIND.WORKING, 0, PROFILE_ORIGIN_COMPILED, 0, 0]);
    assert.equal(working.stateFlags & 0x3, 0, "neither its compiled defaults nor a saved profile runs");
});

// What a keyboard on the starter firmware answered in exactly this state
// (never saved, a whole profile running unsaved at revision 1, Live preview +
// save, both halves agreeing), page by page: profile status, the four edit
// status pages and the active profile's metadata. The fake answers the same
// bytes but for what is that keyboard's own: its digests, its session, its
// transactions and its profile's length.
test("the fake answers the pages that tell this state as the keyboard itself did", async t => {
    const {keyboard} = await open(t);
    keyboard.externalEdit(bytesOf(backup()));
    /** @type {[value: number, page: number, answered: string, own: [from: number, to: number][]][]} */
    const pages = [
        [0x02, 0, "010230001d6fac1d1d6fac1d01000000000000000000000004", [[4, 12]]],
        [0x02, 1, "00000000ff0000000000000000000000000000000000000000", []],
        [0x20, 0, "01002f00827f18800100000000000000ff00ebb30000020000", [[4, 8], [18, 20]]],
        [0x20, 1, "00000100827f18800100000003000000000000000000000002", [[2, 8]]],
        [0x20, 2, "00ffffffffffff0000000000000000000000ed1d0000000000", [[18, 22]]],
        [0x20, 3, "0100000000000000000000000000b80b000000000000000000", []],
        [0x21, 0, "0119ed1d0000827f18800100000000000000ffff0100000000", [[2, 10]]],
    ];
    for (const [value, at, answered, own] of pages) {
        const request = Buffer.alloc(32); request.set([0x08, 0, value, 1, at]);
        const reply = keyboard.answer(request)[0], expected = Buffer.from(answered, "hex"), payload = Buffer.from(reply.subarray(7, 32));
        for (const [from, to] of own) {payload.fill(0, from, to); expected.fill(0, from, to);}
        assert.deepEqual([reply[5], reply[6]], [0, 25], `value 0x${value.toString(16)} page ${at} answers a whole page`);
        assert.equal(payload.toString("hex"), expected.toString("hex"), `value 0x${value.toString(16)} page ${at}`);
    }
});

test("in Live preview + save a whole backup comes in on a never-saved keyboard, is read again, reviewed and saved", async t => {
    const loop = await open(t), {keyboard, shell, session, send, look} = loop;
    assert.ok(session.draft.live, "the draft is what the keyboard runs");
    assert.deepEqual([session.draft.live.savedGeneration, session.draft.live.savedOrigin, session.draft.dirty], [0, PROFILE_ORIGIN_COMPILED, false]);
    const mine = backup();
    await importBackup(loop, mine);
    assert.doesNotMatch(lastMessage(shell).notice || "", /^Failed/);
    assert.ok(keyboard.working?.equals(bytesOf(mine)), "the keyboard runs the whole backup, unsaved");
    assert.equal(keyboard.generation, 0);
    assert.equal(session.draft.dirty, true);
    assert.equal(session.draft.live.unsaved, true);
    // Every look and read from here meets a working copy over the defaults.
    assert.equal(await look(), false, "the watch's look finds nothing new");
    await session.service.refreshStatus();
    assert.equal(session.service.snapshot().status.activeKind, PROFILE_ACTIVE_KIND.WORKING);
    assert.equal(session.service.snapshot().status.activeOriginHalf, PROFILE_ORIGIN_COMPILED);
    const draft = session.draft, history = draft.history.length, before = sets(keyboard);
    await loop.loop.handleMessage({type: "refresh"});
    assert.doesNotMatch(lastMessage(shell).notice || "", /^Failed|MALFORMED/);
    assert.equal(session.draft, draft, "Read keyboard keeps the draft: the keyboard vouches for its session and revision");
    assert.equal(draft.history.length, history);
    assert.equal(draft.stale, false);
    assert.equal(sets(keyboard), before, "reading sends the keyboard nothing");
    assert.ok(lastModel(shell).draft.live.unsaved);
    assert.ok(session.draft.live.working.equals(bytesOf(mine)));
    assert.ok(session.draft.view({}).changes.length > 0, "review compares the backup with the compiled defaults");
    // Review and Save: the first profile this keyboard ever saves.
    await send({type: "saveProfileDraft"});
    assert.match(lastMessage(shell).notice, /Review/);
    await reviewAndSave(loop);
    assert.match(lastMessage(shell).notice, /Saved on both halves/);
    assert.equal(keyboard.generation, 1);
    assert.equal(keyboard.working, null);
    assert.ok(keyboard.saved.equals(bytesOf(mine)));
    assert.equal(shell.recoveries.length, 1);
    assert.ok(bytesOf(shell.recoveries[0]).equals(bytesOf(defaults())), "the recovery copy is the compiled defaults it ran before");
    assert.deepEqual([session.draft.dirty, session.draft.live.unsaved, session.draft.live.savedGeneration, session.draft.live.savedOrigin], [false, false, 1, 0]);
    // And it reads as a saved keyboard from then on.
    await loop.loop.handleMessage({type: "refresh"});
    const status = session.service.snapshot().status;
    assert.deepEqual([status.activeKind, status.activeGeneration, status.activeOriginHalf, status.committedGeneration], [PROFILE_ACTIVE_KIND.COMMITTED, 1, 0, 1]);
    assert.equal(session.draft.dirty, false);
    assert.deepEqual(notices(shell).filter(notice => /^Failed/.test(notice)), ["Failed: Review the keyboard's unsaved edits before saving them."],
        "nothing failed but the Save made before its review");
});

test("Ark opens on a never-saved keyboard that already runs a whole backup unsaved, and saves it", async t => {
    const mine = backup();
    const loop = await open(t, {running: bytesOf(mine)}), {keyboard, shell, session} = loop;
    const state = session.service.snapshot();
    assert.equal(state.connected, true);
    assert.equal(state.error ?? null, null);
    assert.deepEqual([state.status.activeKind, state.status.activeGeneration, state.status.activeOriginHalf], [PROFILE_ACTIVE_KIND.WORKING, 0, PROFILE_ORIGIN_COMPILED]);
    assert.deepEqual(notices(shell).filter(notice => /^Failed|MALFORMED/.test(notice)), []);
    const draft = session.draft;
    assert.ok(draft?.live, "the draft is its working copy");
    assert.deepEqual([draft.dirty, draft.live.unsaved, draft.live.savedGeneration, draft.live.savedOrigin], [true, true, 0, PROFILE_ORIGIN_COMPILED]);
    assert.ok(draft.live.working.equals(bytesOf(mine)));
    assert.ok(draft.live.saved.equals(bytesOf(defaults())), "what a replug would put back is the compiled defaults");
    assert.equal(lastModel(shell).draft.live.unsaved, true);
    assert.equal(sets(keyboard), 0, "opening sends the keyboard nothing");
    await reviewAndSave(loop);
    assert.match(lastMessage(shell).notice, /Saved on both halves/);
    assert.equal(keyboard.generation, 1);
    assert.ok(keyboard.saved.equals(bytesOf(mine)));
});

test("Revert on a never-saved keyboard puts its compiled defaults back, and undo sends the backup again", async t => {
    const mine = backup();
    const loop = await open(t, {running: bytesOf(mine)}), {keyboard, shell, session, send} = loop;
    await send({type: "revertProfileDraft"});
    assert.match(lastMessage(shell).notice, /Reverted/);
    assert.equal(keyboard.working, null);
    assert.equal(keyboard.generation, 0);
    assert.deepEqual([session.draft.dirty, session.draft.live.unsaved], [false, false]);
    const reverted = wireStatus(keyboard);
    assert.deepEqual([reverted.activeKind, reverted.activeOriginHalf], [PROFILE_ACTIVE_KIND.COMPILED_ONLY, 0]);
    await loop.loop.handleMessage({type: "refresh"});
    assert.equal(session.draft.dirty, false);
    await send({type: "undoProfileDraft"});
    if (session.liveProposal) await send({type: "confirmLiveEdit", proposal: session.liveProposal.id});
    assert.ok(keyboard.working?.equals(bytesOf(mine)), "undo is one live edit back to the backup");
    assert.equal(wireStatus(keyboard).activeOriginHalf, PROFILE_ORIGIN_COMPILED);
});

test("a first key edit on a never-saved keyboard is read again, saved, and edited again", async t => {
    const loop = await open(t, {document: document()}), {keyboard, shell, session, key} = loop;
    await key(0, 10, "KC_X");
    assert.ok(keyboard.working);
    assert.equal(wireStatus(keyboard).activeOriginHalf, PROFILE_ORIGIN_COMPILED);
    await key(0, 11, "KC_Y");
    assert.equal(keyboard.events.filter(event => event === "published").length, 2, "a second edit lands on the working copy");
    await loop.loop.handleMessage({type: "refresh"});
    assert.equal(session.draft.dirty, true);
    assert.equal(session.draft.history.length, 3, "the same running keyboard keeps its history");
    await reviewAndSave(loop);
    assert.match(lastMessage(shell).notice, /Saved on both halves/);
    assert.equal(keyboard.generation, 1);
    await key(0, 12, "KC_Z");
    assert.deepEqual([wireStatus(keyboard).activeKind, wireStatus(keyboard).activeGeneration, wireStatus(keyboard).activeOriginHalf], [PROFILE_ACTIVE_KIND.WORKING, 1, 0]);
});

// A reconnect never sends a draft back by itself: the draft follows the
// keyboard, not the other way round. Only a restart the person asked Ark for
// puts kept edits back (keyboard-restart.js).
test("after a replug the draft shows the never-saved keyboard's defaults again, and Ark sends it nothing", async t => {
    const loop = await open(t), {keyboard, shell, session} = loop;
    await importBackup(loop, backup());
    assert.ok(keyboard.working);
    const before = sets(keyboard);
    // The same running keyboard, connected again: its working copy is there.
    await session.service.disconnect();
    await loop.loop.handleMessage({type: "refresh"});
    assert.equal(session.draft.dirty, true);
    assert.equal(session.draft.stale, false);
    assert.equal(sets(keyboard), before);
    // Unplugged and back: it boots its compiled defaults, the edits are gone.
    keyboard.replug();
    await loop.loop.handleMessage({type: "refresh"});
    assert.match(lastMessage(shell).notice, /restarted .* unsaved edits are gone/);
    assert.deepEqual([session.draft.dirty, session.draft.live.unsaved, session.draft.live.savedGeneration], [false, false, 0]);
    assert.ok(session.draft.live.working.equals(bytesOf(defaults())));
    assert.equal(keyboard.working, null);
    assert.equal(sets(keyboard), before, "nothing was sent back to the keyboard");
    assert.equal(await loop.look(), false);
    assert.equal(sets(keyboard), before);
});

test("in Live edit a never-saved keyboard takes the backup and saves it by itself", async t => {
    const loop = await open(t, {mode: EDIT_MODE.LIVE}), {keyboard, shell, session, look} = loop;
    const mine = backup();
    await importBackup(loop, mine);
    assert.ok(keyboard.working?.equals(bytesOf(mine)));
    assert.equal(wireStatus(keyboard).activeOriginHalf, PROFILE_ORIGIN_COMPILED);
    assert.equal(await look(), false, "unsaved over the defaults is nothing new");
    await session.service.refreshStatus();
    assert.equal(session.service.snapshot().status.activeOriginHalf, PROFILE_ORIGIN_COMPILED);
    assert.equal(keyboard.autoSave(), true);
    assert.equal(await look(), true, "the keyboard's own save is news");
    assert.deepEqual([session.draft.dirty, session.draft.live.unsaved, session.draft.live.savedGeneration, session.draft.live.savedOrigin], [false, false, 1, 0]);
    assert.equal(lastModel(shell).draft.live.unsaved, false);
    assert.deepEqual(notices(shell).filter(notice => /^Failed/.test(notice)), []);
});

test("in Review and save a never-saved keyboard opens a draft of its defaults, and the first look finds nothing changed", async t => {
    const loop = await open(t, {mode: EDIT_MODE.APPLY}), {keyboard, shell, session, look} = loop;
    assert.ok(session.draft && !session.draft.live, "the draft is Ark's own");
    assert.equal(session.draft.dirty, false);
    const reads = keyboard.requests.length;
    assert.equal(await look(), false, "a keyboard that saved nothing has not moved");
    assert.ok(keyboard.requests.length - reads < 10, "and is not read again");
    assert.deepEqual(notices(shell).filter(notice => /changed by itself/.test(notice)), []);
    // The backup becomes the draft, and nothing reaches the keyboard before Save.
    await importBackup(loop, backup());
    assert.equal(session.draft.dirty, true);
    assert.equal(keyboard.working, null);
    assert.equal(sets(keyboard), 0);
});

// Its own keys can still change what it runs (DPI, lighting): a working copy
// over the defaults, which a Review and save keyboard is then read live for.
test("in Review and save a key adjustment on a never-saved keyboard is read, live, until the keyboard saves it", async t => {
    const {withPayload} = require("../fixtures/profile-document");
    const {encodeKeymapDomain} = require("../../core/schema/keymap-domain-v1");
    const loop = await open(t, {mode: EDIT_MODE.APPLY}), {keyboard, shell, session, look} = loop;
    const layers = validateSnapshot(defaults()).layers.map(layer => [...layer]); layers[0][3] = 0x04;
    keyboard.externalEdit(withPayload(keyboard.saved, "keymap", () => encodeKeymapDomain(layers)));
    assert.equal(wireStatus(keyboard).activeOriginHalf, PROFILE_ORIGIN_COMPILED);
    await session.service.refreshStatus();
    assert.equal(session.service.snapshot().status.activeOriginHalf, PROFILE_ORIGIN_COMPILED);
    await loop.loop.handleMessage({type: "refresh"});
    assert.deepEqual(notices(shell).filter(notice => /^Failed|MALFORMED/.test(notice)), []);
    assert.ok(session.draft.live, "unsaved edits on the keyboard are read live, which only Save or Revert settles");
    assert.deepEqual([session.draft.live.mode, session.draft.live.unsaved, session.draft.live.savedGeneration], [EDIT_MODE.APPLY, true, 0]);
    assert.equal(keyboard.autoSave(), true);
    assert.equal(await look(), true);
    assert.ok(session.draft && !session.draft.live, "saved, it is a Review and save draft again");
    assert.equal(session.draft.dirty, false);
    assert.equal(session.service.snapshot().status.activeKind, PROFILE_ACTIVE_KIND.COMMITTED);
});

// The keyboard's own keys reach this state without Ark: a DPI or lighting key
// joins the working copy, and waits there for a Save, or for the keyboard's
// own save after a quiet moment (firmware guide, "Keyboard adjustments"). So
// a never-saved keyboard may already run a working copy over its defaults the
// first time Ark connects, in any edit mode.
for (const mode of [EDIT_MODE.LIVE_REVIEW, EDIT_MODE.LIVE, EDIT_MODE.APPLY]) test(`Ark first connects to a never-saved keyboard its own DPI key already changed (edit mode ${mode})`, async t => {
    const adjusted = defaults();
    editSettingsDomain(adjusted, settings => {settings.values[SETTING.DEFAULT_DPI] += 200;});
    const loop = await open(t, {mode, running: bytesOf(adjusted)}), {keyboard, shell, session, look} = loop;
    const state = session.service.snapshot();
    assert.equal(state.connected, true);
    assert.deepEqual([state.status.activeKind, state.status.activeGeneration, state.status.activeOriginHalf], [PROFILE_ACTIVE_KIND.WORKING, 0, PROFILE_ORIGIN_COMPILED]);
    assert.deepEqual(notices(shell).filter(notice => /^Failed|MALFORMED/.test(notice)), []);
    // Unsaved edits on the keyboard are read live in every mode: only Save,
    // Revert or the keyboard's own save settles them.
    const draft = session.draft;
    assert.ok(draft?.live);
    assert.deepEqual([draft.live.mode, draft.dirty, draft.live.unsaved, draft.live.savedGeneration, draft.live.savedOrigin], [mode, true, true, 0, PROFILE_ORIGIN_COMPILED]);
    assert.equal(draft.view({}).changes.length, 1, "review shows the one adjustment against the compiled defaults");
    assert.equal(sets(keyboard), 0, "connecting sends the keyboard nothing");
    assert.equal(await look(), false);
    if (mode === EDIT_MODE.LIVE_REVIEW) {
        await reviewAndSave(loop);
        assert.match(lastMessage(shell).notice, /Saved on both halves/);
    } else {
        assert.equal(keyboard.autoSave(), true);
        assert.equal(await look(), true, "the keyboard's own save is news");
        assert.equal(Boolean(session.draft.live), mode === EDIT_MODE.LIVE, "a Review and save keyboard is Ark's own draft again once it saved");
    }
    assert.equal(keyboard.generation, 1);
    assert.ok(keyboard.saved.equals(bytesOf(adjusted)));
    assert.equal(session.draft.dirty, false);
    const saved = wireStatus(keyboard);
    assert.deepEqual([saved.activeKind, saved.activeGeneration, saved.activeOriginHalf], [PROFILE_ACTIVE_KIND.COMMITTED, 1, 0]);
});

test("the first Save writes nothing but Save itself: no candidate transfer starts on a never-saved keyboard in a live mode", async t => {
    const loop = await open(t, {running: bytesOf(backup())}), {keyboard} = loop;
    await reviewAndSave(loop);
    assert.deepEqual(keyboard.mutations.map(request => request[2]), [PROFILE_EDIT_V1.VALUE_SAVE]);
    assert.deepEqual(keyboard.unhandled, []);
});
