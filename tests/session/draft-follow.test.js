"use strict";
// How the open draft follows what Ark reads: each case says what the draft and
// the session hold after a read, a failed read, or a draft put in place.
const test = require("node:test");
const assert = require("node:assert/strict");
const {LIVE_READ_RETRIES, endRetries, followRead, followService, forgetRead, keepStale, readAndFollow, readFailed, replaceFromRead, retryPending, takeNews, takeRead} = require("../../core/session/draft-follow");
const {ProfileDraftSession} = require("../../core/session/profile-draft-session");
const {fingerprint, summary, validateSnapshot} = require("../../core/model/portable-profile");
const {replaceDomain} = require("../../core/schema/profile-domains");
const {encodeKeymapDomain} = require("../../core/schema/keymap-domain-v1");
const {document} = require("../fixtures/pd-profile");
const {editMacros} = require("../fixtures/profile-document");
const {openLoop} = require("../fixtures/panel-loop");
const {liveKeyboard} = require("../fixtures/live-keyboard");
const {document: liveDocument} = require("../fixtures/portable-profile");
const {EDIT_MODE} = require("../../core/protocol/profile-edit-v1");

const capabilities = {protocol: {major: 2, minor: 0}, schema: {major: 4, minor: 3}, compiledLayerCount: 16, supportedDomainMask: 127, actionAbiDigest: 0x67df11b3, featureFlags: require("../../core/protocol/profile-wire-v1").PROFILE_WIRE_KNOWN_MASKS.CURRENT_PAIR_FEATURES};
/** @param {(doc: object) => void} [change] */
const snapshot = (change) => {
    const doc = document();
    change?.(doc);
    return {document: doc, fingerprint: fingerprint(doc), summary: summary(doc), limits: {brightnessMax: 200}};
};
const elsewhere = () => snapshot(doc => editMacros(doc, macros => macros[0] = Buffer.from("elsewhere").toString("base64")));
const connected = (extra = {}) => ({connected: true, busy: false, selectedDeviceId: "kb", devices: [{id: "kb"}], capabilities, ...extra});
const edit = {type: "updateLayoutKeys", layer: "Layer 1", changes: [{layoutIndex: 0, keycode: "KC_B"}]};
const moved = () => Object.assign(new Error("The keyboard kept changing."), {code: "PROFILE_CHANGED"});

// A session over a service that reads what `reads` gives, in turn, and says
// it is in `state`.
/** @param {object} state @param {(() => object)[]} [reads] */
function sessionOn(state, reads = []) {
    const service = {portable: undefined, snapshot: () => state,
        readKeyboardProfile: async () => {const read = reads.shift()(); service.portable = read; return read;}};
    return {service};
}

test("a complete read opens the draft once, and later reads of the keyboard refresh it", () => {
    const session = sessionOn(connected()), read = snapshot();
    followRead(session, read, connected());
    const draft = session.draft;
    assert.ok(draft, "the first complete read opens the draft");
    assert.equal(session.observedPortable, read);
    followRead(session, read, connected());
    assert.equal(session.draft, draft, "a read already followed changes nothing");
    const changed = elsewhere();
    followRead(session, changed, connected());
    assert.equal(session.draft, draft, "an untouched draft follows the keyboard in place");
    assert.equal(draft.current.fingerprint, changed.fingerprint, "and shows what it holds now");
    assert.equal(draft.stale, false);
    // With edits, the draft keeps them and waits, stale, for a review.
    draft.stage({...edit, draftRevision: draft.revision});
    followRead(session, snapshot(), connected());
    assert.equal(draft.dirty, true);
    assert.equal(draft.stale, true, "the keyboard changed under the edits");

    const incomplete = sessionOn(connected());
    followRead(incomplete, {incomplete: true, fingerprint: "incomplete:device", document: {format: "charybdis-recovery-capture"}}, connected());
    assert.equal(incomplete.draft, undefined, "an incomplete read opens nothing");
    const legacy = sessionOn(connected());
    followRead(legacy, snapshot(), connected({capabilities: {...capabilities, compiledLayerCount: 5}}));
    assert.equal(legacy.draft, undefined, "nor does a keyboard Ark cannot edit");
});

test("a service notice follows the service's read and the connection it came over", () => {
    const session = sessionOn(connected({connectionToken: 1}));
    session.service.portable = snapshot();
    followService(session, connected({connectionToken: 1}));
    const draft = session.draft;
    assert.ok(draft);
    draft.stage({...edit, draftRevision: draft.revision});
    followService(session, connected({connectionToken: 2}));
    assert.equal(session.draft, draft, "the edits stay");
    assert.equal(draft.connectionChanged, true);
    assert.equal(draft.stale, true, "but the draft is no longer the connection's");
    // An untouched draft closes when another keyboard is chosen.
    const clean = sessionOn(connected());
    followRead(clean, snapshot(), connected());
    followService(clean, connected({selectedDeviceId: "other"}));
    assert.equal(clean.draft, undefined);
});

test("reading again follows the read, and a failed read leaves the draft stale within the watch's retries", async () => {
    const session = sessionOn(connected(), [elsewhere, () => {throw moved();}, () => {throw moved();}, snapshot, () => {throw new Error("No answer.");}]);
    followRead(session, snapshot(), connected());
    const draft = /** @type {ProfileDraftSession} */ (session.draft);
    assert.equal(await readAndFollow(session), true);
    assert.equal(draft.current.fingerprint, elsewhere().fingerprint, "the draft follows what was read");
    assert.equal(session.observedPortable, session.service.portable);
    // A read the keyboard moved under is retried, a bounded number of times.
    assert.equal(await readAndFollow(session), false, "a failed read resolves, it never rejects");
    assert.equal(draft.stale, true);
    assert.equal(retryPending(session, draft), true);
    assert.equal(await readAndFollow(session), false);
    assert.deepEqual(session.liveReadRetry, {draftId: draft.id, attempts: 2});
    assert.equal(await readAndFollow(session), true);
    assert.equal(session.liveReadRetry, undefined, "a read that worked ends the retries");
    for (let attempt = 0; attempt < LIVE_READ_RETRIES; attempt++) readFailed(session, moved());
    assert.equal(retryPending(session, draft), false, "after the last, reading again is the person's");
    // Any other failure is not retried at all.
    endRetries(session);
    readFailed(session, moved());
    assert.equal(retryPending(session, draft), true);
    assert.equal(await readAndFollow(session), false);
    assert.equal(retryPending(session, draft), false);
    assert.equal(draft.stale, true);
    endRetries(session);
    assert.equal(session.liveReadRetry, undefined);
});

test("a draft given a read takes it even when the panel followed it already", () => {
    const session = sessionOn(connected({selectedDeviceId: "kb2"}));
    followRead(session, snapshot(), connected());
    const draft = /** @type {ProfileDraftSession} */ (session.draft);
    draft.stage({...edit, draftRevision: draft.revision});
    // The keyboard came back under a new device id; the panel's follow
    // passed the draft by, as it was another keyboard's.
    const read = elsewhere();
    followRead(session, read, connected({selectedDeviceId: "kb2"}));
    assert.equal(draft.stale, false, "the read was not this draft's");
    draft.followDevice("kb2");
    takeRead(session, draft, read);
    assert.equal(draft.stale, true, "the draft now knows the keyboard changed under its edits");
    assert.equal(session.observedPortable, read);
});

test("a draft from a read replaces the open one, and one kept over the latest read waits for its own", () => {
    const session = sessionOn(connected());
    followRead(session, snapshot(), connected());
    const before = /** @type {ProfileDraftSession} */ (session.draft);
    session.portableReview = {before: snapshot()};
    const read = elsewhere();
    replaceFromRead(session, read);
    const after = /** @type {ProfileDraftSession} */ (session.draft);
    assert.notEqual(after, before, "the draft starts again from the read");
    assert.equal(after.current.fingerprint, read.fingerprint);
    assert.equal(session.portableReview, undefined, "what was opened against the old draft closes");
    followService(session, connected());
    assert.equal(session.draft, after, "the read is followed, not followed again");

    // The keyboard's latest read is another kind of draft's (a live one),
    // which would replace an untouched draft; the kept draft stays, stale.
    session.service.portable = {...snapshot(), live: {session: 1, revision: 0, mode: EDIT_MODE.LIVE_REVIEW, unsaved: false}};
    keepStale(session, before);
    followService(session, connected());
    assert.equal(session.draft, before);
    assert.equal(before.stale, true);
});

test("a draft no read opened is replaced by the next complete read", () => {
    const read = snapshot();
    const session = sessionOn(connected());
    followRead(session, read, connected());
    session.draft = new ProfileDraftSession(snapshot(), "demo", capabilities);
    forgetRead(session);
    followRead(session, read, connected());
    assert.equal(session.draft.deviceId, "kb", "the keyboard's read is followed again");
});

// A live keyboard tells the draft what a person should hear; that waits
// until the read that says it takes it, once.
/** @param {import("node:test").TestContext} t */
const live = t => openLoop(t, {keyboard: liveKeyboard({document: liveDocument()})});

test("a working copy changed without Ark is news for the draft, said once", async t => {
    const {keyboard, session, key} = await live(t);
    await key(0, 14, "KC_F");
    const draft = session.draft;
    const layers = validateSnapshot({...liveDocument(), profile: keyboard.working.toString("base64")}).layers; layers[3][3] = 0x04;
    keyboard.externalEdit(replaceDomain(keyboard.working, 0x60, () => encodeKeymapDomain(layers)));
    assert.equal(await readAndFollow(session), true);
    assert.equal(session.draft, draft);
    assert.equal(draft.history.length, 1, "the draft starts again from what the keyboard runs");
    assert.equal(takeNews(session, "restarted"), undefined, "taking one kind leaves the other");
    assert.equal(takeNews(session, "changedElsewhere"), true);
    assert.equal(takeNews(session, "changedElsewhere"), undefined, "said once");
});

test("a restart over unsaved edits is news for the draft that saw them, kept or gone", async t => {
    const {keyboard, session, key} = await live(t);
    await key(0, 8, "KC_T");
    keyboard.replug();
    assert.equal(await readAndFollow(session), true);
    assert.equal(session.draft.dirty, false, "the keyboard runs what it saved");
    assert.deepEqual(takeNews(session, "restarted"), {kept: false, mode: EDIT_MODE.LIVE_REVIEW});
    assert.equal(takeNews(session, "restarted"), undefined);
    // News is the draft's: another draft in its place hears none of it.
    await key(0, 9, "KC_S");
    keyboard.replug();
    await readAndFollow(session);
    session.draft = new ProfileDraftSession(snapshot(), "kb", capabilities);
    assert.equal(takeNews(session, "restarted"), undefined);
});
