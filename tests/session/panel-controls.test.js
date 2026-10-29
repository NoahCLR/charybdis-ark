"use strict";
const {profileLayers, editLayers} = require("../fixtures/profile-document");
const test = require("node:test");
const assert = require("node:assert/strict");
const {draftControl, portableControl, readKeyboard} = require("../../core/session/panel-controls");
const {buildPanelModel} = require("../../core/session/panel-session");
const {followRead} = require("../../core/session/draft-follow");
const {ProfileDraftSession} = require("../../core/session/profile-draft-session");
const {fingerprint, summary} = require("../../core/model/portable-profile");
const {document} = require("../fixtures/pd-profile");
const {FAILURE_WORDS} = require("../../core/model/vocabulary");

const capabilities = {protocol: {major: 2, minor: 0}, schema: {major: 4, minor: 3}, compiledLayerCount: 16, supportedDomainMask: 127, actionAbiDigest: 0x67df11b3, featureFlags: require("../../core/protocol/profile-wire-v1").PROFILE_WIRE_KNOWN_MASKS.CURRENT_PAIR_FEATURES};
const snapshot = () => {
    const doc = document();
    return {document: doc, fingerprint: fingerprint(doc), summary: summary(doc), limits: {brightnessMax: 200}};
};
const device = {id: "kb", manufacturer: "Bastard Keyboards", product: "Charybdis 4x6"};

// A device service that records what it is asked. Its editor read finds the
// complete profile and its read after a save says each step; what each reads
// is the service's (profile-device-service.test.js).
function fakeService(extra = {}) {
    const calls = [];
    const record = (name, value) => async (...args) => { calls.push(name); return typeof value === "function" ? value(...args) : value; };
    const state = {connected: true, busy: false, selectedDeviceId: "kb", devices: [device], capabilities,
        layout: {state: "read", layers: []}, committed: {state: "read", source: "device", generation: 7, failures: []}};
    const service = {
        calls, capabilities, portable: snapshot(),
        snapshot: () => state,
        readForEditor: record("readForEditor", () => ({kind: "read", portable: service.portable})),
        readBack: record("readBack", (onStep = () => {}) => {for (const step of ["layout", "profile", "combos", "baseRgb"]) onStep(step);}),
        readKeyboardProfile: record("readKeyboardProfile", () => service.portable),
        readPortableProfile: record("readPortableProfile", () => service.portable),
        restorePortableProfile: record("restorePortableProfile", async (doc, options) => {
            const path = await options.saveRecovery(doc);
            assert.ok(path, "a recovery copy is written before the keyboard is changed");
            return {...snapshot(), document: doc, fingerprint: fingerprint(doc)};
        }),
        ...extra,
    };
    return service;
}
const shell = () => {
    const saved = [], made = [];
    return {saved, made, progress: async (title, work) => work(), saveRecovery: async (doc, about) => { saved.push(doc); made.push(about); return `/recovery/${saved.length}.json`; }};
};
function sessionWithDraft() {
    const service = fakeService();
    const session = {service};
    followRead(session, service.portable, service.snapshot());
    buildPanelModel(session, service.snapshot());
    return session;
}
const stage = (session, change) => session.draft.stage({draftId: session.draft.id, draftRevision: session.draft.revision, ...change});

test("reading the keyboard says what it read, or that there is none", async () => {
    const service = fakeService();
    const session = {service};
    assert.equal(await readKeyboard(session, undefined, shell()), true);
    assert.match(session.notice, /saved profile, generation 7/);
    const empty = {service: fakeService({readForEditor: async () => ({kind: "none"})})};
    assert.equal(await readKeyboard(empty, undefined, shell()), false);
    assert.match(empty.notice, /Chrome has no Charybdis this page may open yet/);
    const failed = {service: fakeService({readForEditor: async () => ({kind: "read", failure: new Error("interrupted")})})};
    assert.equal(await readKeyboard(failed, undefined, shell()), false);
    assert.match(failed.notice, /Macros and global settings could not be read/);
});

test("the read's slow steps run behind the shell's progress, in the shell's words", async () => {
    const titles = [];
    const progress = async (title, work) => {titles.push(title); return work();};
    const service = fakeService({readForEditor: async (_id, hooks) => {
        for (const step of ["complete", "layout", "profile"]) await hooks.progress(step, async () => {});
        return {kind: "read", failure: new Error("interrupted")};
    }});
    await readKeyboard({service}, undefined, {...shell(), progress});
    assert.deepEqual(titles, ["Reading the keyboard's complete profile", "Reading keys and layers", "Reading the keyboard's saved profile"]);
});

test("a failed committed-profile read keeps the layout and the optional reads, and says what failed", async () => {
    const state = {connected: true, selectedDeviceId: "kb", devices: [device], capabilities,
        layout: {state: "read", layers: []}, committed: {state: "reading"}, error: null};
    const service = fakeService({snapshot: () => state, capabilities: state.capabilities,
        readForEditor: async () => {
            state.error = {code: "TIMEOUT", message: "The keyboard did not answer."};
            return {kind: "read", failure: new Error("The read was interrupted.")};
        }});
    const session = {service};
    assert.equal(await readKeyboard(session, undefined, shell()), false);
    assert.equal(session.notice, "The keyboard profile could not be read. The keyboard did not answer. Macros and global settings could not be read. The read was interrupted.");
});

// The decoder's own text (which chunk, how many bytes) is for the
// diagnostics; a notice says in words that an answer did not decode. A
// decoder marks its errors so (schema/bytes.js protocolError).
test("a read whose answer did not decode says so in words, never in the decoder's", async () => {
    const decodeError = () => Object.assign(new Error("Chunk 258 returned 1 bytes where 3 were expected."), {code: "MALFORMED_RESPONSE", fault: "answer"});
    const state = {connected: true, selectedDeviceId: "kb", devices: [device], capabilities,
        layout: {state: "read", layers: []}, committed: {state: "reading"}, error: null};
    const service = fakeService({snapshot: () => state, capabilities: state.capabilities,
        readForEditor: async () => {
            state.error = {code: "MALFORMED_RESPONSE", message: decodeError().message, fault: "answer"};
            return {kind: "read", failure: decodeError()};
        }});
    const session = {service};
    assert.equal(await readKeyboard(session, undefined, shell()), false);
    assert.doesNotMatch(session.notice, /Chunk|bytes where/);
    assert.equal(session.notice, `The keyboard profile could not be read. ${FAILURE_WORDS.unreadable} Macros and global settings could not be read. ${FAILURE_WORDS.unreadable}`);
});

test("a keyboard not on current firmware is told to update", async () => {
    const service = fakeService({readForEditor: async () => ({kind: "firmware"})});
    const session = {service};
    assert.equal(await readKeyboard(session, undefined, shell()), false);
    assert.match(session.notice, /the only one Ark supports\. Update both halves/);
    // Firmware with every feature that stores an older domain version is told
    // so by the complete snapshot, in its words.
    const failure = Object.assign(new Error("stores its profile in a format Ark does not read"), {code: "FIRMWARE_UPDATE_REQUIRED"});
    const stored = {service: fakeService({readForEditor: async () => ({kind: "firmware", failure})})};
    assert.equal(await readKeyboard(stored, undefined, shell()), false);
    assert.equal(stored.notice, "stores its profile in a format Ark does not read");
});

test("a failed device read fails the whole read with its own error", async () => {
    const service = fakeService({readForEditor: async () => {throw Object.assign(new Error("lost"), {code: "DISCONNECTED"});}});
    await assert.rejects(readKeyboard({service}, undefined, shell()), {code: "DISCONNECTED"});
});

test("rebasing against an incomplete recovery capture retains the authored draft", async () => {
    const session = sessionWithDraft(), draft = session.draft;
    stage(session, {type: "updateLayoutKeys", layer: "Layer 1", changes: [{layoutIndex: 0, keycode: "KC_B"}]});
    const document = structuredClone(draft.document);
    const recovery = {incomplete: true, fingerprint: "incomplete:device", document: {format: "charybdis-recovery-capture"}};
    session.service.readPortableProfile = async () => recovery;
    await draftControl(session, {type: "rebaseProfileDraft", draftRevision: draft.revision}, shell());
    assert.equal(draft.baseSnapshot.incomplete, true);
    assert.deepEqual(draft.document, document);
    assert.equal(draft.stale, false);
    assert.equal(draft.view(session.service.snapshot()).reviewed, true);
});

test("apply writes a recovery copy through the shell, then reads the keyboard again", async () => {
    const session = sessionWithDraft(), draft = session.draft, h = shell();
    const readSteps = [];
    session.service.emitChange = () => readSteps.push([session.postApplyReadStep, session.applyRunning]);
    stage(session, {type: "updateLayoutKeys", layer: "Layer 0", changes: [{layoutIndex: 0, keycode: "KC_A"}]});
    draft.review(draft.revision);
    session.service.calls.length = 0;
    await draftControl(session, {type: "applyProfileDraft", draftRevision: draft.revision}, h);
    assert.equal(h.saved.length, 1);
    assert.deepEqual(h.made, [{cause: "apply", keyboard: "Bastard Keyboards Charybdis 4x6"}], "named for the Apply and the keyboard it came from");
    assert.deepEqual(session.service.calls, ["restorePortableProfile", "readBack"]);
    assert.deepEqual(readSteps, [["layout", true], ["profile", true], ["combos", true], ["baseRgb", true]]);
    assert.equal(session.postApplyReadStep, undefined, "the readback state clears when Apply finishes");
    assert.equal(session.applyRunning, false, "a later operation is not drawn as this Apply's readback");
    assert.match(session.notice, /Recovery copy: \/recovery\/1\.json/);
    assert.match(session.notice, /both halves and verified/);
    assert.equal(session.resetDraftForms, true);
});

test("after Apply, Put back makes what the keyboard held before it the draft, one undoable step", async () => {
    const session = sessionWithDraft(), draft = session.draft, h = shell();
    stage(session, {type: "updateLayoutKeys", layer: "Layer 0", changes: [{layoutIndex: 0, keycode: "KC_A"}]});
    draft.review(draft.revision);
    await assert.rejects(draftControl(session, {type: "putBackProfile", draftRevision: draft.revision}, h), /no copy from before a save/);
    await draftControl(session, {type: "applyProfileDraft", draftRevision: draft.revision}, h);
    assert.ok(session.beforeApply, "the copy saved before Apply is kept for Put back");
    assert.deepEqual(session.beforeApply.document, h.saved[0]);
    assert.equal(buildPanelModel(session, session.service.snapshot()).portable.putBack, session.beforeApply.savedAt);
    // The fake keyboard saves the target itself; stand in what a real one held.
    const before = snapshot().document;
    session.beforeApply.document = before;
    await draftControl(session, {type: "putBackProfile", draftRevision: session.draft.revision}, h);
    assert.equal(fingerprint(session.draft.document), fingerprint(before));
    const view = session.draft.view(session.service.snapshot());
    assert.equal(view.dirty, true);
    assert.equal(view.undoLabel, "Put back what the keyboard had before the save");
});

test("an Apply that renames the keyboard expects it to reconnect, and a readback its restart cuts short is no failure", async () => {
    const {RECONNECT_WORDS} = require("../../core/session/keyboard-reconnect");
    for (const name of ["Desk", device.product]) for (const interrupted of [false, true]) {
        const session = sessionWithDraft(), expecting = [];
        session.service.expectReconnect = (on) => {expecting.push(on);};
        if (interrupted) session.service.readBack = async () => {session.service.snapshot().connected = false; throw new Error("The keyboard disconnected while its profile was being read.");};
        stage(session, {type: "renameKeyboard", name});
        session.draft.review(session.draft.revision);
        await draftControl(session, {type: "applyProfileDraft", draftRevision: session.draft.revision}, shell());
        assert.deepEqual(session.reconnect, {deviceId: "kb", serialNumber: "", name, otherDevices: [], startedAt: session.reconnect.startedAt, dropped: false,
            saved: "Complete profile saved to both halves and verified. Recovery copy: /recovery/1.json"});
        assert.deepEqual(expecting, [true]);
        assert.equal(session.notice, `Complete profile saved to both halves and verified. Recovery copy: /recovery/1.json ${RECONNECT_WORDS.waiting}`,
            interrupted ? "the keyboard is read again once it is back, so the cut-short read is not reported" : "");
    }
    // A save that leaves the name alone expects nothing.
    const session = sessionWithDraft();
    stage(session, {type: "updateLayoutKeys", layer: "Layer 0", changes: [{layoutIndex: 0, keycode: "KC_A"}]});
    session.draft.review(session.draft.revision);
    await draftControl(session, {type: "applyProfileDraft", draftRevision: session.draft.revision}, shell());
    assert.equal(session.reconnect, undefined);
    assert.doesNotMatch(session.notice, /Reconnecting/);
});

test("restoring a named backup over an incomplete read expects the safe USB restart", async () => {
    const {RECONNECT_WORDS} = require("../../core/session/keyboard-reconnect");
    const {editKeyboardName} = require("../../core/model/keyboard-name");
    const service = fakeService(), before = {...service.portable, incomplete: true};
    const named = editKeyboardName(service.portable, {name: "Desk", expectedFingerprint: service.portable.fingerprint});
    const session = {service, portableReview: {before, document: named}};
    const expecting = [];
    service.expectReconnect = (on) => {expecting.push(on);};
    service.readBack = async () => {service.snapshot().connected = false; throw new Error("USB restarted");};
    await portableControl(session, {type: "restorePortableProfile"}, shell());
    assert.equal(session.reconnect?.name, "Desk");
    assert.deepEqual(expecting, [true]);
    assert.match(session.notice, /Interrupted data retained for diagnosis: \/recovery\/1\.json/);
    assert.ok(session.notice.endsWith(RECONNECT_WORDS.waiting));
    assert.doesNotMatch(session.notice, /Reading the keyboard again failed/);
});

test("a failed post-Apply read clears its progress stage and is said after the save", async () => {
    const session = sessionWithDraft();
    stage(session, {type: "updateLayoutKeys", layer: "Layer 0", changes: [{layoutIndex: 0, keycode: "KC_A"}]});
    session.draft.review(session.draft.revision);
    session.service.readBack = async () => {throw new Error("The readback was interrupted.");};
    await draftControl(session, {type: "applyProfileDraft", draftRevision: session.draft.revision}, shell());
    assert.equal(session.postApplyReadStep, undefined);
    assert.equal(session.applyRunning, false);
    assert.match(session.notice, /^Complete profile saved to both halves and verified\. Reading the keyboard again failed\. The readback was interrupted\. Recovery copy: \/recovery\/1\.json$/);
});

test("a destination blocker refuses Apply before recovery or HID", async () => {
    const service = fakeService(), h = shell();
    service.portable.limits.brightnessMax = 50;
    const session = {service};
    followRead(session, service.portable, service.snapshot());
    buildPanelModel(session, service.snapshot());
    stage(session, {type: "updateMacro", keycode: "MACRO_0", payload: "hello"});
    session.draft.review(session.draft.revision);
    assert.equal(session.draft.hasBlockers(), true);
    await assert.rejects(draftControl(session, {type: "applyProfileDraft", draftRevision: session.draft.revision, confirmChecks: true}, h), /blockers/);
    assert.equal(h.saved.length, 0);
    assert.deepEqual(service.calls, []);
});

test("a draft that can lock a layer with no way back applies only once the trap is confirmed", async () => {
    const session = sessionWithDraft(), draft = session.draft, h = shell();
    stage(session, {type: "updateLayoutKeys", layer: "Layer 0", changes: [{layoutIndex: 0, keycode: "TG(1)"}]});
    stage(session, {type: "updateLayoutKeys", layer: "Layer 1", changes: [{layoutIndex: 0, keycode: "KC_B"}]});
    const trap = draft.view({}).checks.find((check) => check.level === "trap");
    assert.equal(trap.status, "new");
    assert.deepEqual(trap.layers, [1]);
    assert.deepEqual(trap.path, ["Tap TG(1) on Base"]);
    draft.review(draft.revision);
    session.service.calls.length = 0;
    await assert.rejects(draftControl(session, {type: "applyProfileDraft", draftRevision: draft.revision}, h), /Confirm them in the review/);
    assert.deepEqual(session.service.calls, [], "nothing reaches the keyboard");
    assert.equal(h.saved.length, 0);
    await draftControl(session, {type: "applyProfileDraft", draftRevision: draft.revision, confirmChecks: true}, h);
    assert.equal(session.service.calls[0], "restorePortableProfile");
});

test("a draft with a warning requires confirmation before writing a recovery copy or HID", async () => {
    const session = sessionWithDraft(), draft = session.draft, h = shell();
    stage(session, {type: "updateLayoutKeys", layer: "Layer 0", changes: [{layoutIndex: 0, keycode: "KC_A"}]});
    draft.checks = () => [{level: "warning", status: "new", title: "Nothing reaches Number"}];
    draft.review(draft.revision);
    session.service.calls.length = 0;
    await assert.rejects(draftControl(session, {type: "applyProfileDraft", draftRevision: draft.revision}, h), /Confirm them in the review/);
    assert.deepEqual(session.service.calls, []);
    assert.equal(h.saved.length, 0);
    await draftControl(session, {type: "applyProfileDraft", draftRevision: draft.revision, confirmChecks: true}, h);
    assert.equal(session.service.calls[0], "restorePortableProfile");
});

test("an apply that finished with the slave half unplugged says so instead of claiming a readback", async () => {
    const session = sessionWithDraft(), draft = session.draft, h = shell();
    const restore = session.service.restorePortableProfile;
    session.service.restorePortableProfile = async (doc, options) => ({...await restore(doc, options), slaveUnseen: true});
    stage(session, {type: "updateLayoutKeys", layer: "Layer 0", changes: [{layoutIndex: 0, keycode: "KC_A"}]});
    draft.review(draft.revision);
    await draftControl(session, {type: "applyProfileDraft", draftRevision: draft.revision}, h);
    assert.match(session.notice, /slave half confirmed its copy but is not connected now/);
    assert.doesNotMatch(session.notice, /verified/);
});

test("discarding the draft of an unchanged keyboard is an undoable step, and leaving review un-reviews", async () => {
    const session = sessionWithDraft(), draft = session.draft;
    stage(session, {type: "updateLayoutKeys", layer: "Layer 0", changes: [{layoutIndex: 0, keycode: "KC_A"}]});
    draft.review(draft.revision);
    await draftControl(session, {type: "closeProfileDraftReview", draftRevision: draft.revision});
    assert.equal(draft.view({}).reviewed, false);
    await draftControl(session, {type: "discardProfileDraft", draftRevision: draft.revision});
    assert.equal(session.draft, draft, "the same draft, one step further");
    assert.equal(draft.dirty, false);
    assert.match(session.notice, /Undo/);
    assert.equal(draft.view({}).canUndo, true);
    await assert.rejects(draftControl(session, {type: "somethingElse", draftRevision: draft.revision}), /Unsupported draft control/);
});

test("layer edits and imports are kept in the draft; without one they restore to the keyboard", async () => {
    const session = sessionWithDraft(), draft = session.draft;
    await portableControl(session, {type: "managePortableLayers"});
    assert.ok(session.portableLayers);
    const names = [...session.portableLayers.names];
    names[4] = "Mouse";
    await portableControl(session, {type: "savePortableLayers", names});
    assert.equal(session.portableLayers, undefined);
    assert.equal(draft.current.summary.names[4], "Mouse", "the rename went into the draft");
    assert.equal(draft.view({}).undoLabel, "Renamed Pointer to Mouse", "the step is named by what it did");

    const text = JSON.stringify(document());
    await portableControl(session, {type: "choosePortableProfile"}, {chooseProfile: async () => text});
    assert.ok(session.portableReview, "a chosen file opens for review first");
    assert.equal(session.portableReview.fileName, null, "a shell that gives only the text leaves the file unnamed");
    await portableControl(session, {type: "choosePortableProfile"}, {chooseProfile: async () => ({text, name: "desk.charybdis.json"})});
    const review = buildPanelModel(session, session.service.snapshot()).portable.review;
    assert.equal(review.fileName, "desk.charybdis.json");
    assert.deepEqual(review.differences, [], "compared with the keyboard, not the draft: the draft's rename is not a difference of this file");
    const changed = new ProfileDraftSession(snapshot(), "kb", capabilities);
    changed.stage({type: "updateMacro", keycode: "MACRO_2", payload: "hello", draftRevision: changed.revision});
    await portableControl(session, {type: "choosePortableProfile"}, {chooseProfile: async () => JSON.stringify(changed.document)});
    assert.deepEqual(buildPanelModel(session, session.service.snapshot()).portable.review.differences, [{unit: "macro:2", title: "Macro 2", status: "added", place: {kind: "macro", index: 2, keycode: "MACRO_2"}}],
        "each difference by what it is, what happened and where it is edited, without its fields");
    await portableControl(session, {type: "cancelPortableReview"});
    assert.equal(session.portableReview, undefined);

    const bare = {service: fakeService()}, h = shell();
    bare.portableReview = {document: document(), before: bare.service.portable};
    await portableControl(bare, {type: "restorePortableProfile"}, h);
    assert.deepEqual(bare.service.calls, ["restorePortableProfile", "readBack"]);
    assert.match(bare.notice, /Recovery copy: \/recovery\/1\.json/);
    assert.deepEqual(h.made, [{cause: "restore", keyboard: "Bastard Keyboards Charybdis 4x6"}], "named for the restore");
});

test("a layer editor opened on one keyboard cannot replace another keyboard's draft", async () => {
    const session = sessionWithDraft();
    await portableControl(session, {type: "managePortableLayers"});
    const oldEdit = session.portableLayers;
    const firstDraft = session.draft;
    const other = snapshot();
    editLayers(other.document, layers => layers[0][0] = 5);
    other.fingerprint = fingerprint(other.document);
    session.draft = new ProfileDraftSession(other, "other", capabilities);
    session.service.snapshot = () => ({connected: true, selectedDeviceId: "other", capabilities});
    await assert.rejects(portableControl(session, {type: "savePortableLayers", names: oldEdit.names}), /another keyboard/);
    assert.equal(profileLayers(session.draft.document)[0][0], 5);
    assert.notEqual(session.draft.id, firstDraft.id);
});

test("a retained draft cannot save an editor after selecting another keyboard", async () => {
    const session = sessionWithDraft();
    await portableControl(session, {type: "managePortableLayers"});
    const names = session.portableLayers.names;
    session.service.snapshot = () => ({connected: true, selectedDeviceId: "other", capabilities});
    await assert.rejects(portableControl(session, {type: "savePortableLayers", names}), /another keyboard/);
    assert.equal(session.draft.revision, 1);
});

test("the layer panel's keys-follow toggle decides whether layer keys are renumbered", async () => {
    // Base gets MO(4) and TG(1); layer 4 then moves down to 1, swapping past 3 and 2.
    const moveLayer4Down = async (keysFollow) => {
        const session = sessionWithDraft(), draft = session.draft;
        stage(session, {type: "updateLayoutKeys", layer: "Layer 0", changes: [{layoutIndex: 0, keycode: "MO(4)"}, {layoutIndex: 1, keycode: "TG(1)"}]});
        await portableControl(session, {type: "managePortableLayers"});
        assert.equal(session.portableLayers.keysFollow, true, "on by default");
        const layer4Name = session.portableLayers.names[4];
        if (!keysFollow) {
            await portableControl(session, {type: "editPortableLayer", keysFollow: false, names: session.portableLayers.names.map((name, id) => id === 2 ? "Typed" : name)});
            assert.equal(session.portableLayers.keysFollow, false);
            assert.equal(session.portableLayers.names[2], "Typed", "a name typed before the toggle is kept");
        }
        for (let step = 0; step < 3; step++) await portableControl(session, {type: "editPortableLayer", id: 4, direction: -1, names: session.portableLayers.names});
        const before = draft.current.document;
        await portableControl(session, {type: "savePortableLayers", names: session.portableLayers.names});
        const after = draft.current.document;
        assert.deepEqual(profileLayers(after)[1].slice(2), profileLayers(before)[4].slice(2), "layer 4 moved to 1 with its keys");
        assert.equal(draft.current.summary.names[1], layer4Name, "its name moved with it");
        assert.deepEqual(draft.order, [0, 4, 1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], "the draft knows which layer each slot now holds");
        const units = draft.changes().map((row) => row.unit);
        assert.equal(units.filter((unit) => unit === "layerOrder").length, 1, "the move is one item");
        if (keysFollow) assert.deepEqual(units.filter((unit) => unit.startsWith("layout:")).sort(), ["layout:0:0", "layout:0:1"], "only the keys edited before the move");
        return profileLayers(after)[0].slice(0, 2);
    };
    assert.deepEqual(await moveLayer4Down(true), [0x5221, 0x5262], "following: MO(4) becomes MO(1), TG(1) becomes TG(2)");
    assert.deepEqual(await moveLayer4Down(false), [0x5224, 0x5261], "not following: both keep their numbers");
});
