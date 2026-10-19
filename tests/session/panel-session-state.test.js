"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {assertBound, beginRead, boundDraft, closeEditors, draftBinding, endRead, replaceDraft, setDraft, takeOutbox, whileApplying, whilePanelBusy} = require("../../core/session/panel-session-state");
const {ProfileDraftSession} = require("../../core/session/profile-draft-session");
const {DEMO_CAPABILITIES, DEMO_DEVICE_ID, demoProfile, demoSnapshot, demoState} = require("../../core/session/demo-session");
const {fingerprint, summary} = require("../../core/model/portable-profile");
const {document} = require("../fixtures/pd-profile");

const capabilities = {protocol: {major: 2, minor: 0}, schema: {major: 4, minor: 0}, compiledLayerCount: 16, supportedDomainMask: 127, actionAbiDigest: 0x6fd70b90, featureFlags: require("../../core/protocol/profile-wire-v1").PROFILE_WIRE_KNOWN_MASKS.CURRENT_PAIR_FEATURES};
const snapshot = () => {
    const doc = document();
    return {document: doc, fingerprint: fingerprint(doc), summary: summary(doc), limits: {brightnessMax: 200}};
};
const connected = (extra = {}) => ({connected: true, busy: false, selectedDeviceId: "kb", connectionToken: 1, capabilities, ...extra});
const withDraft = (extra = {}) => ({draft: new ProfileDraftSession(snapshot(), "kb", capabilities, 1), ...extra});
const reason = (session, state) => draftBinding(session, state).reason;

test("a draft is editable on its own keyboard, over its own connection, current and idle", () => {
    assert.deepEqual(draftBinding(withDraft(), connected()), {editable: true, reason: ""});
});

test("each thing that stands between the draft and an edit is named", () => {
    assert.equal(reason({}, connected()), "no-draft");
    assert.equal(reason(withDraft(), connected({selectedDeviceId: "other"})), "other-keyboard");
    assert.equal(reason(withDraft(), connected({connected: false})), "disconnected");
    assert.equal(reason(withDraft(), connected({connectionToken: 2})), "connection-changed");
    assert.equal(reason(withDraft(), connected({connectionToken: undefined})), "connection-changed", "no token is not the draft's token");
    assert.equal(reason(withDraft(), connected({capabilities: {...capabilities, compiledLayerCount: 5}})), "unsupported");
    assert.equal(reason(withDraft(), connected({capabilities: {...capabilities, protocol: {major: 1, minor: 0}}})), "unsupported", "firmware on an earlier base takes no edit");
    const stale = withDraft();
    stale.draft.noteConnection(9);
    assert.equal(reason(stale, connected()), "stale");
    assert.equal(reason(withDraft(), connected({busy: true})), "busy");
    assert.equal(reason(withDraft({portableBusy: true}), connected()), "busy");
    assert.equal(reason(withDraft({readBusy: true}), connected()), "busy");
});

test("busy is named only when nothing else stands in the way", () => {
    assert.equal(reason(withDraft({readBusy: true}), connected({connectionToken: 2})), "connection-changed");
    const stale = withDraft({portableBusy: true});
    stale.draft.noteConnection(9);
    assert.equal(reason(stale, connected({busy: true})), "stale");
});

test("the demo's draft is editable with no keyboard behind it", () => {
    const session = {draft: new ProfileDraftSession(demoSnapshot(demoProfile()), DEMO_DEVICE_ID, DEMO_CAPABILITIES), demo: {name: "demo", fileName: null, exported: null}};
    assert.deepEqual(draftBinding(session, demoState()), {editable: true, reason: ""});
    assert.equal(reason(session, {...demoState(), busy: true}), "busy");
});

test("Apply asks the draft the same question of the device service", async () => {
    const service = (state) => ({snapshot: () => state, restorePortableProfile: async () => {throw new Error("must not write");}});
    const dirty = () => {
        const draft = new ProfileDraftSession(snapshot(), "kb", capabilities, 1);
        draft.stage({type: "updateLayoutKeys", draftRevision: draft.revision, layer: "Layer 1", changes: [{layoutIndex: 0, keycode: "KC_B"}]});
        draft.review(draft.revision);
        return draft;
    };
    const save = async () => "/recovery.json";
    for (const state of [connected({connected: false}), connected({selectedDeviceId: "other"})]) {
        const draft = dirty();
        await assert.rejects(draft.apply(service(state), draft.revision, save), /Reconnect the keyboard this draft belongs to/);
    }
    const draft = dirty();
    await assert.rejects(draft.apply(service(connected({connectionToken: 2})), draft.revision, save), /Review this draft against the connected keyboard/);
});

test("a posted message reaches its draft only while the draft is bound, in the refusal it was given", () => {
    const session = withDraft(), draft = session.draft;
    const message = {draftId: draft.id, draftRevision: draft.revision};
    assert.equal(boundDraft(session, connected(), message, "Refused."), draft);
    assert.throws(() => boundDraft({}, connected(), message, "Refused."), /^Error: Refused\.$/);
    assert.throws(() => boundDraft(session, connected(), {...message, draftId: "older"}, "Refused."), /^Error: Refused\.$/);
    assert.throws(() => boundDraft(session, connected({busy: true}), message, "Refused."), /^Error: Refused\.$/);
    assert.throws(() => boundDraft(session, connected({connectionToken: 2}), message, "Refused."), /^Error: Refused\.$/);
    assert.throws(() => boundDraft(session, connected(), {...message, draftRevision: draft.revision - 1}, "Refused."), /The draft changed/,
        "an older revision is the draft's own refusal");
    draft.noteConnection(9);
    assert.throws(() => boundDraft(session, connected(), message, "Refused."), /The keyboard changed/,
        "a stale draft asks for a review, not a reconnect");
});

test("a refusal may say what stands in the way", () => {
    const words = (reason) => `blocked: ${reason}`;
    assert.throws(() => assertBound(withDraft(), connected({connectionToken: 2}), words), /^Error: blocked: connection-changed$/);
    assert.throws(() => assertBound(withDraft({portableBusy: true}), connected(), words), /^Error: blocked: busy$/);
    assert.throws(() => boundDraft({}, connected(), {}, words), /^Error: blocked: no-draft$/);
    const stale = withDraft();
    stale.draft.noteConnection(9);
    assert.doesNotThrow(() => assertBound(stale, connected(), words), "a stale draft is left to refuse itself");
});

test("the import review and the layer editor close together, the forms only when asked", () => {
    const session = {portableReview: {}, portableLayers: {}, resetDraftForms: undefined};
    closeEditors(session);
    assert.equal(session.portableReview, undefined);
    assert.equal(session.portableLayers, undefined);
    assert.equal(session.resetDraftForms, undefined, "cancelling them leaves the forms alone");
    const moved = {portableReview: {}, portableLayers: {}};
    closeEditors(moved, {resetForms: true});
    assert.equal(moved.portableReview, undefined);
    assert.equal(moved.resetDraftForms, true, "another keyboard, or a kept import, starts the forms again");
});

test("a read shows loading until it ends, and a failed one is not ready", () => {
    const session = {readReady: true};
    beginRead(session);
    assert.deepEqual(session, {readBusy: true, readReady: false});
    assert.equal(draftBinding({...withDraft(), ...session}, connected()).reason, "busy");
    endRead(session, true);
    assert.deepEqual(session, {readBusy: false, readReady: true});
    beginRead(session);
    endRead(session);
    assert.deepEqual(session, {readBusy: false, readReady: false});
});

test("the panel is busy exactly while its own operation runs, failed or not", async () => {
    const session = withDraft();
    assert.equal(await whilePanelBusy(session, async () => {
        assert.equal(draftBinding(session, connected()).reason, "busy");
        return 7;
    }), 7);
    assert.equal(session.portableBusy, false);
    await assert.rejects(whilePanelBusy(session, async () => {throw new Error("no");}), /no/);
    assert.equal(session.portableBusy, false);
});

test("an Apply's readback steps last only while the Apply runs", async () => {
    const session = {};
    await assert.rejects(whileApplying(session, async (step) => {
        assert.equal(session.applyRunning, true);
        step("profile");
        assert.equal(session.postApplyReadStep, "profile");
        throw new Error("readback interrupted");
    }), /readback interrupted/);
    assert.deepEqual(session, {applyRunning: false, postApplyReadStep: undefined});
});

test("a new draft resets the forms; replacing one also closes what was opened against it", () => {
    const next = withDraft().draft;
    const opened = {portableReview: {}, portableLayers: {}};
    setDraft(opened, next);
    assert.equal(opened.draft, next);
    assert.equal(opened.resetDraftForms, true);
    assert.ok(opened.portableReview && opened.portableLayers, "opening a draft keeps the editors");
    const replaced = {draft: withDraft().draft, portableReview: {}, portableLayers: {}};
    replaceDraft(replaced, undefined);
    assert.equal(replaced.draft, undefined);
    assert.equal(replaced.resetDraftForms, true);
    assert.equal(replaced.portableReview, undefined);
    assert.equal(replaced.portableLayers, undefined);
});

test("the outbox is carried by one model, then forgotten", () => {
    const session = {notice: "Saved.", acceptedEdit: {revision: 2}, resetDraftForms: true};
    assert.deepEqual(takeOutbox(session), {notice: "Saved.", acceptedEdit: {revision: 2}, resetDraftForms: true});
    assert.deepEqual(takeOutbox(session), {notice: undefined, acceptedEdit: undefined, resetDraftForms: undefined});
});
