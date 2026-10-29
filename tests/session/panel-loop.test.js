"use strict";
const {editLayers} = require("../fixtures/profile-document");
const test = require("node:test");
const assert = require("node:assert/strict");
const {exportedProfile, openPanelLoop, postedModel} = require("../../core/session/panel-loop");
const {FakeDeviceAdapter} = require("../../core/transport/fake-device-adapter");
const {LIVE_LINK_ERROR_CODES, liveLinkError} = require("../../core/transport/device-adapter");
const {fingerprint, summary} = require("../../core/model/portable-profile");
const {document} = require("../fixtures/pd-profile");
const {document: currentDocument} = require("../fixtures/portable-profile");
const {fakeKeyboardAdapter, fakeKeyboard} = require("../fixtures/fake-keyboard");
const {fakeShell} = require("../fixtures/panel-loop");
const {PHASE} = require("../../core/model/vocabulary");

const capabilities = {protocol: {major: 2, minor: 0}, schema: {major: 4, minor: 3}, compiledLayerCount: 16, supportedDomainMask: 127, actionAbiDigest: 0x67df11b3, featureFlags: require("../../core/protocol/profile-wire-v1").PROFILE_WIRE_KNOWN_MASKS.CURRENT_PAIR_FEATURES};
const snapshot = () => {
    const doc = document();
    return {document: doc, fingerprint: fingerprint(doc), summary: summary(doc), limits: {brightnessMax: 200}};
};
const device = {id: "kb", manufacturer: "Bastard Keyboards", product: "Charybdis 4x6"};

test("Apply progress updates do not rebuild or post the complete panel model", () => {
    const shell = fakeShell();
    const loop = openPanelLoop(shell, {adapter: new FakeDeviceAdapter()});
    loop.session.draft = {id: "draft-777", revision: 3};
    const apply = {id: 777, state: "applying", current: "stage", steps: [], bytes: {completed: 12, total: 120}};
    loop.session.service.reportApplyProgress(apply);
    assert.deepEqual(shell.posted, [{type: "applyProgress", apply, draftId: "draft-777", draftRevision: 3}]);
    assert.deepEqual(loop.session.service.snapshot().liveApply, apply, "full snapshots retain the latest progress");
});

test("read progress posts only a small operation-correlated view", async t => {
    const shell = fakeShell();
    const loop = openPanelLoop(shell, {adapter: fakeKeyboardAdapter({document: currentDocument()}), defaultTimeoutMs: 200});
    t.after(() => loop.close());
    const service = loop.session.service;
    await loop.handleMessage({type: "refresh"});
    const draft = loop.session.draft, deviceId = service.snapshot().selectedDeviceId;
    assert.ok(draft, "a complete read opens the draft");
    const reads = [];
    const post = shell.post;
    shell.post = message => {if (message.type === "readProgress") reads.push(message); return post(message);};
    const state = await service.readLayout();
    assert.ok(reads.length > 1, "the layout read reports its counter as it goes");
    for (const message of reads) {
        assert.deepEqual(Object.keys(message).sort(), ["draftId", "draftRevision", "read", "type"]);
        assert.deepEqual({...message.read, progress: undefined}, {source: "layout", progress: undefined, operationId: state.operationId,
            phase: PHASE.READ_LAYOUT, selectedDeviceId: deviceId, connectionToken: state.connectionToken});
        assert.equal(message.draftId, draft.id);
        assert.equal(message.draftRevision, draft.revision);
    }
    const final = reads.at(-1).read.progress;
    assert.equal(final.done, final.total);
});

// Ark reads only current firmware: a keyboard whose settings are another
// version opens nothing, is told to update, and refuses edits.
test("a keyboard storing settings in another version is not read, and is told to update", async t => {
    const shell = fakeShell();
    const adapter = fakeKeyboardAdapter({document: currentDocument(), settingsVersion: 7});
    const loop = openPanelLoop(shell, {adapter, defaultTimeoutMs: 200});
    t.after(() => loop.close());
    await loop.handleMessage({type: "refresh"});
    const {model, notice} = last(shell);
    assert.equal(loop.session.draft, undefined, "no draft opens");
    assert.equal(model.load.state, "unavailable");
    assert.match(notice, /Ark supports only current firmware\. Update both halves/);
    assert.equal(loop.session.service.snapshot().layout, null, "nothing more is read");
    await loop.handleMessage({type: "updateCustomKey", keycode: "CUSTOM_KEY_1", name: "Late"});
    assert.match(last(shell).notice, /no editable draft/);
    assert.deepEqual(adapter.keyboard.mutations, []);
});

const last = (shell) => shell.posted[shell.posted.length - 1];

test("dropped files use the chooser's validation and review without opening a shell dialog or writing", async () => {
    const service = fakeService();
    const shell = fakeShell({chooseProfile: () => {throw new Error("a drop must not open a chooser");}});
    const loop = openPanelLoop(shell, {service});
    loop.serviceChanged();
    const draft = loop.session.draft;
    const message = (text) => ({type: "reviewPortableProfile", text, name: "desk.charybdis.json",
        draftId: draft.id, draftRevision: draft.revision});
    const before = draft.document;
    const changed = structuredClone(before);
    editLayers(changed, layers => layers[0][0] = 5);
    await loop.handleMessage(message(JSON.stringify(changed)));
    const review = loop.session.portableReview;
    assert.equal(last(shell).model.portable.review.fileName, "desk.charybdis.json");
    assert.deepEqual(draft.document, before);
    assert.deepEqual(service.calls, []);
    assert.deepEqual(shell.recoveries, []);
    for (const text of ["not json", "{}", undefined, " ".repeat(100001), "é".repeat(50001)]) {
        await loop.handleMessage(message(text));
        assert.match(last(shell).notice, /^Failed/);
        assert.equal(loop.session.portableReview, review, "a refused file preserves the existing review");
        assert.deepEqual(draft.document, before);
        assert.equal(loop.session.portableBusy, false);
    }
    await loop.handleMessage({...message(JSON.stringify(changed)), draftId: "old"});
    assert.match(last(shell).notice, /Read the keyboard/);
    await loop.handleMessage({...message(JSON.stringify(changed)), draftRevision: -1});
    assert.match(last(shell).notice, /^Failed/);
    service.snapshot().connected = false;
    await loop.handleMessage(message(JSON.stringify(changed)));
    assert.match(last(shell).notice, /Read the keyboard/);
    assert.deepEqual(service.calls, []);
});

// A connected keyboard with a complete profile, as panel-controls.test.js fakes it.
function fakeService(extra = {}) {
    const calls = [];
    const record = (name, value) => async (...args) => {calls.push(name); return typeof value === "function" ? value(...args) : value;};
    const state = {connected: true, busy: false, selectedDeviceId: "kb", devices: [device], capabilities,
        layout: {state: "read", layers: []}, committed: {state: "read", source: "device", generation: 7, failures: []}};
    const service = {
        calls, capabilities, portable: snapshot(),
        snapshot: () => state,
        readForEditor: record("readForEditor", async () => ({kind: "read", portable: await service.readKeyboardProfile()})),
        readKeyboardProfile: record("readKeyboardProfile", () => service.portable),
        readPortableProfile: record("readPortableProfile", () => service.portable),
        close: record("close"),
        ...extra,
    };
    return service;
}
function loopWithDraft(shell = fakeShell(), extra) {
    const loop = openPanelLoop(shell, {service: fakeService(extra)});
    loop.serviceChanged();
    assert.ok(loop.session.draft, "the first publish of a complete read opens the draft");
    shell.posted.length = 0;
    return loop;
}

test("fresh reads follow clean drafts, retain dirty edits, and rebase only the comparison", async () => {
    const shell = fakeShell(), service = fakeService(), loop = openPanelLoop(shell, {service});
    loop.serviceChanged();
    const draft = loop.session.draft, id = draft.id;
    const next = structuredClone(draft.document); editLayers(next, layers => layers[0][0] = 5);
    service.portable = {...snapshot(), document: next, fingerprint: fingerprint(next), summary: summary(next)};
    loop.serviceChanged();
    assert.equal(loop.session.draft, draft);
    assert.equal(draft.id, id);
    assert.deepEqual(draft.document, next, "a clean draft follows what was freshly read");
    await loop.handleMessage({type: "updateLayoutKeys", draftId: id, draftRevision: draft.revision,
        layer: "Layer 1", changes: [{layoutIndex: 0, keycode: "KC_B"}]});
    const edits = structuredClone(draft.document);
    service.portable = snapshot();
    loop.serviceChanged();
    assert.equal(draft.dirty, true);
    assert.equal(draft.stale, true);
    assert.deepEqual(draft.document, edits, "another read preserves local edits");
    await loop.handleMessage({type: "rebaseProfileDraft", draftId: id, draftRevision: draft.revision});
    assert.equal(draft.stale, false);
    assert.equal(last(shell).model.draft.reviewed, true);
    assert.deepEqual(draft.document, edits, "rebase changes the comparison, not the authored draft");
});

test("reading with no keyboard attached answers with a notice through the shell", async () => {
    const shell = fakeShell();
    const loop = openPanelLoop(shell, {adapter: new FakeDeviceAdapter({devices: []})});
    await loop.handleMessage({type: "ready"});
    const reply = last(shell);
    assert.equal(reply.type, "model");
    assert.match(reply.notice, /Chrome has no Charybdis this page may open yet/);
    assert.equal(loop.session.readBusy, false);
    assert.equal(reply.model.selectedDeviceId, "");
    assert.deepEqual(shell.errors, []);
    await loop.close();
});

test("an overlapping panel read answers with a busy refusal while the first read stays active", async () => {
    let enter, finish;
    const entered = new Promise(resolve => {enter = resolve;}), gate = new Promise(resolve => {finish = resolve;});
    const shell = fakeShell();
    const service = fakeService({readKeyboardProfile: async () => {enter(); await gate; return service.portable;}});
    const loop = openPanelLoop(shell, {service});
    loop.serviceChanged();
    const owner = loop.handleMessage({type: "refresh"});
    await entered;
    try {
        const calls = service.calls.slice();
        await loop.handleMessage({type: "refresh"});
        assert.match(last(shell).notice, /Failed.*current operation/);
        assert.equal(last(shell).model.load.state, "loading");
        assert.equal(loop.session.readBusy, true);
        assert.deepEqual(service.calls, calls, "the refusal starts no service request");
    } finally {finish(); await owner; await loop.close();}
});

test("an export refused after disconnect reports the same failure in the notice and device diagnostics", async () => {
    const shell = fakeShell();
    const loop = openPanelLoop(shell, {adapter: new FakeDeviceAdapter()});
    try {
        loop.session.service.setError(new Error("Earlier failure"));
        await loop.handleMessage({type: "exportPortableProfile"});
        const reply = last(shell), error = loop.session.service.snapshot().error;
        assert.equal(error.message, "Connect the keyboard and wait for the current operation to finish.");
        assert.ok(error.code, "the failure keeps its code");
        assert.equal(reply.notice, `Failed: ${error.message}`, "the notice reads as its sentence, without the code");
        assert.equal(reply.model.device.health.error, error.message);
        assert.match(loop.session.service.snapshot().diagnostics.at(-1), /Connect the keyboard and wait/);
        assert.deepEqual(shell.exports, []);
        assert.equal(loop.session.portableBusy, false);
    } finally {await loop.close();}
});

test("a keyboard that never answers becomes a failure notice and a shell error", async () => {
    const shell = fakeShell();
    const adapter = new FakeDeviceAdapter();
    const loop = openPanelLoop(shell, {adapter, defaultTimeoutMs: 20});
    await loop.handleMessage({type: "refresh"});
    assert.ok(adapter.lastConnection().writes.length, "the loop reached the device through the injected adapter");
    assert.equal(shell.errors.length, 1);
    assert.equal(last(shell).notice, `Failed: ${shell.errors[0]}`, "the failed connection's own error, without its code");
    assert.equal(loop.session.readBusy, false, "a failed read leaves the panel free to try again");
    await loop.close();
});

test("a read publishes what it read", async () => {
    const shell = fakeShell();
    const service = fakeService();
    const loop = openPanelLoop(shell, {service});
    await loop.handleMessage({type: "ready"});
    assert.deepEqual(shell.posted.map((message) => message.type), ["catalog", "model"], "one answer, after the catalog");
    assert.match(last(shell).notice, /saved profile, generation 7/);
    assert.equal(loop.session.readReady, true);
    assert.ok(last(shell).model.draft, "the model carries the draft the read opened");
});

test("a staged edit is answered with the model and the accepted edit", async () => {
    const shell = fakeShell(), loop = loopWithDraft(shell), draft = loop.session.draft;
    await loop.handleMessage({type: "updateLayoutKeys", draftId: draft.id, draftRevision: draft.revision,
        layer: "Layer 0", changes: [{layoutIndex: 0, keycode: "KC_A"}]});
    assert.equal(shell.posted.length, 1);
    assert.ok(last(shell).acceptedEdit, "the panel learns its edit was accepted");
    assert.equal(last(shell).model.draft.dirty, true);
    assert.equal(last(shell).notice, undefined);
    assert.deepEqual(shell.errors, []);
});

test("a refused edit is answered too, with the refusal as a notice", async () => {
    const shell = fakeShell(), loop = loopWithDraft(shell), draft = loop.session.draft;
    await loop.handleMessage({type: "updateLayoutKeys", draftId: "an older draft", draftRevision: draft.revision,
        layer: "Layer 0", changes: [{layoutIndex: 0, keycode: "KC_A"}]});
    assert.equal(shell.posted.length, 1, "a refusal still publishes, so the panel is not left waiting");
    assert.equal(last(shell).acceptedEdit, undefined);
    assert.match(last(shell).notice, /^Failed: This edit belongs to an older draft/);
    assert.doesNotMatch(last(shell).notice, /\[[A-Z_]+\]/, "no operation-failure code shows");
    assert.equal(shell.errors.length, 1);
    assert.equal(loop.session.draft.dirty, false, "nothing was staged");
    // Even a message nobody knows is answered.
    await loop.handleMessage({type: "somethingElse"});
    assert.equal(shell.posted.length, 2);
});

test("an error with a code reaches the panel as its sentence, without the code", async () => {
    const timeout = async () => {throw liveLinkError(LIVE_LINK_ERROR_CODES.TIMEOUT, "The keyboard did not answer.");};
    const shell = fakeShell(), loop = loopWithDraft(shell, {readPortableProfile: timeout});
    await loop.handleMessage({type: "exportPortableProfile"});
    assert.equal(last(shell).notice, "Failed: The keyboard did not answer.");
    assert.deepEqual(shell.errors, ["The keyboard did not answer."]);
    assert.deepEqual(shell.exports, [], "nothing is saved when the read fails");
    assert.equal(loop.session.portableBusy, false);
    // The finished control publishes, then the failure publishes its notice.
    assert.equal(shell.posted.length, 2);
});

// An Apply or Save cut short says first what happened to the profile
// (interruption.js), so its notice is that sentence with no "Failed:" ahead
// of it; the reply still says it is a failure.
test("a failure that states its verdict is the notice as it is, still marked as a failure", async () => {
    const verdict = "Nothing was saved: the keyboard kept the profile it had.";
    const cut = async () => {throw Object.assign(new Error(`${verdict} The keyboard was disconnected or restarted.`), {code: "DISCONNECTED", verdict});};
    const shell = fakeShell(), loop = loopWithDraft(shell, {readPortableProfile: cut});
    await loop.handleMessage({type: "exportPortableProfile"});
    assert.equal(last(shell).notice, `${verdict} The keyboard was disconnected or restarted.`);
    assert.equal(last(shell).failed, true);
    const other = fakeShell(), plain = loopWithDraft(other, {readPortableProfile: async () => {throw new Error("The keyboard did not answer.");}});
    await plain.handleMessage({type: "exportPortableProfile"});
    assert.equal(last(other).notice, "Failed: The keyboard did not answer.");
    assert.equal(last(other).failed, true);
    await plain.handleMessage({type: "somethingElse"});
    assert.equal(last(other).failed, undefined, "a later reply carries no failure");
});

test("export hands the shell what to save, and says where it went", async () => {
    const shell = fakeShell(), loop = loopWithDraft(shell);
    await loop.handleMessage({type: "exportPortableProfile"});
    assert.equal(shell.exports.length, 1);
    const [file] = shell.exports;
    assert.equal(file.text, JSON.stringify(loop.session.service.portable.document, null, 2) + "\n");
    assert.match(file.fileName, /^charybdis-\d{4}-\d{2}-\d{2}\.charybdis\.json$/);
    assert.equal(last(shell).notice, "Complete keyboard profile exported to /exports/" + file.fileName);
    assert.equal(shell.posted.length, 1);

    // A cancelled save says nothing, but is still answered.
    const cancelled = fakeShell({saveExport: async () => undefined}), quiet = loopWithDraft(cancelled);
    await quiet.handleMessage({type: "exportPortableProfile"});
    assert.equal(cancelled.posted.length, 1);
    assert.equal(last(cancelled).notice, undefined);
});

test("the exported file is the document as text, named for its day", () => {
    const read = snapshot();
    assert.deepEqual(exportedProfile(read, new Date("2026-10-06T21:30:00Z")), {
        fileName: "charybdis-2026-10-06.charybdis.json",
        text: JSON.stringify(read.document, null, 2) + "\n",
    });
});

test("the retired PD upgrade export is no message any shell runs", async () => {
    const seen = [];
    const shell = fakeShell({exportPdUpgrade: async (session) => {seen.push(session);}}), loop = loopWithDraft(shell);
    const posted = shell.posted.length;
    await loop.handleMessage({type: "exportPdUpgrade"});
    assert.equal(shell.posted.length, posted + 1, "an unknown message is answered with the model");
    assert.equal(last(shell).type, "model");
    assert.deepEqual(seen, [], "not even a shell that still has the function");
    assert.deepEqual(shell.errors, []);
});

test("posted data that is no request is answered with the model, never run", async () => {
    const shell = fakeShell(), loop = loopWithDraft(shell);
    const draft = loop.session.draft, revision = draft.revision;
    const posted = shell.posted.length;
    for (const message of [null, undefined, "ready", 7, [], {}, {type: 7}, {type: null, draftId: draft.id}]) await loop.handleMessage(message);
    assert.equal(shell.posted.length, posted + 8, "each is answered once");
    assert.ok(shell.posted.slice(posted).every((reply) => reply.type === "model" && reply.notice === undefined));
    assert.equal(loop.session.draft, draft);
    assert.equal(draft.revision, revision, "nothing was staged");
    assert.ok(!loop.session.readBusy, "nothing was read");
    assert.deepEqual(shell.errors, []);
});

test("closing the loop closes the device service", async () => {
    const service = fakeService(), loop = openPanelLoop(fakeShell(), {service});
    await loop.close();
    assert.deepEqual(service.calls, ["close"]);
});

test("the shell's words say no keyboard was found, and its sleep reaches the device service", async () => {
    const shell = fakeShell({words: {noneFound: "Choose keyboard and pick yours."}});
    const sleep = async () => {};
    const loop = openPanelLoop(shell, {adapter: new FakeDeviceAdapter({devices: []}), sleep});
    assert.equal(loop.session.service.sleep, sleep, "the service polls with the shell's sleep");
    assert.equal(loop.session.shell, shell);
    await loop.handleMessage({type: "ready"});
    assert.equal(last(shell).notice, "Choose keyboard and pick yours.");
    assert.equal(last(shell).model.shell.words.noneFound, "Choose keyboard and pick yours.");
    assert.equal(openPanelLoop(fakeShell(), {adapter: new FakeDeviceAdapter()}).session.service.sleep, undefined, "the timer's otherwise");
    await loop.close();
});

test("messages meant for a shell's own controls are answered, never run", async () => {
    const shell = fakeShell(), loop = loopWithDraft(shell);
    for (const message of [{type: "chooseKeyboard"}, {type: "forgetKeyboard"}, {type: "setTheme", theme: "light"}, {type: "downloadRecovery", id: 1}]) {
        await loop.handleMessage(message);
        assert.equal(last(shell).type, "model");
    }
    assert.equal(shell.posted.length, 4);
    assert.deepEqual(shell.errors, []);
});

test("the panel offers no PD upgrade export", async () => {
    const shell = fakeShell(), loop = loopWithDraft(shell);
    loop.serviceChanged();
    assert.equal("pdUpgradeAvailable" in last(shell).model.portable, false);
});


test("live macro validation replies inline without staging, history, toasts or device calls", async () => {
    const service = fakeService(), shell = fakeShell(), loop = openPanelLoop(shell, {service});
    loop.serviceChanged(); shell.posted.length = 0;
    const draft = loop.session.draft, before = structuredClone(draft.document), revision = draft.revision;
    const message = {type: "validateMacro", keycode: "MACRO_17", payload: "{{KC_A}}\nhello", requestId: 777,
        draftId: draft.id, draftRevision: revision};
    await loop.handleMessage(message);
    assert.deepEqual(last(shell), {...message, type: "macroValidation", validation: require("../../core/model/macro-editor").macroInputStatus(draft.current, message, draft.capabilities)});
    assert.equal(last(shell).validation.error, "");
    await loop.handleMessage({...message, payload: "a".repeat(35000)});
    assert.equal(last(shell).validation.code, "MACRO_BANK_FULL");
    await loop.handleMessage({...message, payload: "{+KC_A}"});
    assert.match(last(shell).validation.error, /Release/);
    for (const stale of [{draftId: "old"}, {draftRevision: revision - 1}]) {
        await loop.handleMessage({...message, ...stale});
        assert.ok(last(shell).validation.error);
    }
    for (const blocked of [{connected: false}, {selectedDeviceId: "other"}, {busy: true}, {connectionToken: "new"}]) {
        const state = service.snapshot(), saved = {...state};
        Object.assign(state, blocked);
        await loop.handleMessage(message);
        assert.ok(last(shell).validation.error);
        Object.assign(state, saved);
        for (const key of Object.keys(blocked)) if (!(key in saved)) delete state[key];
    }
    assert.deepEqual(draft.document, before);
    assert.equal(draft.revision, revision);
    assert.equal(draft.dirty, false);
    assert.deepEqual(shell.errors, []);
    assert.deepEqual(service.calls, []);
    assert.ok(shell.posted.every(reply => reply.type === "macroValidation"));
});

// One rule decides whether the draft may be changed against the keyboard
// (panel-session-state.js draftBinding). The model publishes it, and every
// request that would change the draft or write it answers to the same rule:
// an edit, a macro check, an import review and Apply.
test("the published binding is what edits, macro checks, imports and Apply answer to", async () => {
    const edit = (draft) => ({type: "updateLayoutKeys", draftId: draft.id, draftRevision: draft.revision,
        layer: "Layer 0", changes: [{layoutIndex: 0, keycode: "KC_A"}]});
    const cases = [
        ["idle", {}, ""],
        ["another keyboard selected", {selectedDeviceId: "other", devices: [device, {...device, id: "other"}]}, "other-keyboard"],
        ["disconnected", {connected: false}, "disconnected"],
        ["a device operation running", {busy: true}, "busy"],
        ["reconnected over a new connection", {connectionToken: "new"}, "connection-changed"],
        ["firmware without complete profile editing", {capabilities: {...capabilities, compiledLayerCount: 8}}, "unsupported"],
    ];
    for (const [label, blocked, reason] of cases) {
        const service = fakeService(), shell = fakeShell(), loop = openPanelLoop(shell, {service});
        loop.serviceChanged();
        const draft = loop.session.draft;
        // A reviewed draft with one change, so only the binding stands between it and Apply.
        await loop.handleMessage(edit(draft));
        await loop.handleMessage({type: "reviewProfileDraft", draftId: draft.id, draftRevision: draft.revision});
        assert.equal(draft.reviewedRevision, draft.revision, `${label}: reviewed`);
        Object.assign(service.snapshot(), blocked);
        const revision = draft.revision, document = structuredClone(draft.document);
        // What the panel is told.
        loop.serviceChanged();
        assert.equal(last(shell).model.draft.editable, !reason, `${label}: model.draft.editable`);
        assert.equal(last(shell).model.draft.reason, reason, `${label}: model.draft.reason`);
        if (!reason) continue;
        // What core takes, asked before any model has noticed (the connection token).
        shell.posted.length = 0;
        await loop.handleMessage({...edit(draft), layer: "Layer 0", changes: [{layoutIndex: 1, keycode: "KC_B"}]});
        assert.match(last(shell).notice, /^Failed/, `${label}: the edit is refused`);
        await loop.handleMessage({type: "validateMacro", keycode: "MACRO_1", payload: "hi", requestId: 1, draftId: draft.id, draftRevision: draft.revision});
        assert.ok(last(shell).validation.error, `${label}: the macro check is refused`);
        await loop.handleMessage({type: "reviewPortableProfile", text: JSON.stringify(document), name: "a.charybdis.json", draftId: draft.id, draftRevision: draft.revision});
        assert.match(last(shell).notice, /^Failed/, `${label}: the import is refused`);
        await loop.handleMessage({type: "applyProfileDraft", confirmChecks: true, draftId: draft.id, draftRevision: draft.revision});
        assert.match(last(shell).notice, /^Failed: (Reconnect|Review this draft against|The keyboard changed)/, `${label}: Apply is refused`);
        assert.equal(draft.revision, revision, `${label}: nothing was staged`);
        assert.deepEqual(draft.document, document);
        assert.equal(loop.session.portableReview, undefined);
        assert.deepEqual(shell.recoveries, [], `${label}: Apply wrote no recovery copy`);
        assert.equal(service.calls.includes("restorePortableProfile"), false);
    }
});

test("a reconnect refuses keeping an already-open import or layer review", async () => {
    for (const type of ["restorePortableProfile", "savePortableLayers"]) {
        const service = fakeService(), shell = fakeShell(), loop = openPanelLoop(shell, {service});
        loop.serviceChanged();
        const draft = loop.session.draft;
        await loop.handleMessage(type === "savePortableLayers" ? {type: "managePortableLayers"}
            : {type: "reviewPortableProfile", text: JSON.stringify(draft.document), draftId: draft.id, draftRevision: draft.revision});
        const editor = type === "savePortableLayers" ? loop.session.portableLayers : loop.session.portableReview;
        assert.ok(editor, "the review opened before reconnecting");
        service.snapshot().connectionToken = "new";
        const revision = draft.revision;
        await loop.handleMessage({type});
        assert.match(last(shell).notice, /^Failed: Read the keyboard/);
        assert.equal(draft.revision, revision);
        assert.deepEqual(shell.recoveries, []);
        assert.equal(service.calls.includes("restorePortableProfile"), false);
    }
});

test("demo macros use the same live validation without a keyboard", async () => {
    const service = fakeService(), shell = fakeShell(), loop = openPanelLoop(shell, {service});
    service.snapshot().connected = false;
    await loop.handleMessage({type: "openDemo"});
    const draft = loop.session.draft;
    assert.ok(loop.session.demo, "validation is exercised in the demo, not a keyboard draft");
    await loop.handleMessage({type: "validateMacro", keycode: "MACRO_17", payload: "literal {{braces}}", requestId: 1,
        draftId: draft.id, draftRevision: draft.revision});
    assert.equal(last(shell).type, "macroValidation");
    assert.equal(last(shell).validation.error, "");
    assert.deepEqual(service.calls, []);
});


test("a retained dirty draft adopts the reconnected keyboard's capabilities at rebase", async t => {
    const shell = fakeShell();
    const adapter = fakeKeyboardAdapter({document: currentDocument()});
    const loop = openPanelLoop(shell, {adapter, defaultTimeoutMs: 200});
    t.after(() => loop.close());
    await loop.handleMessage({type: "refresh"});
    const draft = loop.session.draft;
    await loop.handleMessage({type: "updateLayoutKeys", draftId: draft.id, draftRevision: draft.revision,
        layer: "Layer 0", changes: [{layoutIndex: 0, keycode: "KC_A"}]});
    await loop.session.service.disconnect();
    adapter.keyboard = fakeKeyboard({document: currentDocument(), firmwareVersion: 0x00020000});
    await loop.handleMessage({type: "refresh"});
    assert.equal(loop.session.draft, draft, "reconnect preserves the authored draft");
    assert.equal(draft.capabilities.firmwareVersion, 0x00010000, "a retained draft keeps its interpretation until rebase");
    await loop.handleMessage({type: "rebaseProfileDraft", draftId: draft.id, draftRevision: draft.revision});
    assert.equal(last(shell).model.draft.editable, true);
    assert.equal(draft.capabilities.firmwareVersion, 0x00020000);
    await loop.handleMessage({type: "updateMacro", draftId: draft.id, draftRevision: draft.revision,
        keycode: "MACRO_0", payload: "a".repeat(600)});
    assert.equal(last(shell).model.macros[0].payload.length, 600);
});

// What every model of a build starts from goes to the panel once, as the
// catalog, and each model without it, saying what it lays over it
// (panel-loop.js postedModel); the panel lays it back (webview/catalog.mjs).
const {buildPanelModel} = require("../../core/session/panel-session");
const {buildDeviceModel} = require("../../core/session/device-model");
const {panelState} = require("../../core/session/demo-session");
const {panelCatalog} = require("../../core/model/profile-model");
const {withCatalog} = require("../../webview/catalog.mjs");
const types = (shell) => shell.posted.map((message) => message.type);

test("the catalog goes before the first model, once, and again after each ready", async () => {
    const shell = fakeShell(), loop = openPanelLoop(shell, {service: fakeService()});
    loop.publish();
    loop.publish();
    assert.deepEqual(types(shell), ["catalog", "model", "model"]);
    assert.equal(shell.posted[0].catalog, panelCatalog(), "the one the build made");
    shell.posted.length = 0;
    await loop.handleMessage({type: "ready"});
    assert.deepEqual(types(shell), ["catalog", "model"], "a panel that loaded again gets it again, before its answer");
    shell.posted.length = 0;
    await loop.handleMessage({type: "refresh"});
    assert.deepEqual(types(shell), ["model"]);
    shell.posted.length = 0;
    loop.ready();
    assert.deepEqual(types(shell), ["catalog", "model"], "and so does one its shell answers itself");
});

test("a posted model leaves the catalog's fields out, and laid back under it is the model core built", async () => {
    const shell = fakeShell(), loop = loopWithDraft(shell), catalog = panelCatalog();
    for (const what of ["a keyboard's draft", "the demo"]) {
        if (what === "the demo") {
            loop.session.service.snapshot().connected = false;
            await loop.handleMessage({type: "openDemo"});
            assert.ok(loop.session.demo);
        } else loop.publish();
        const posted = last(shell).model;
        for (const field of Object.keys(catalog)) assert.ok(!(field in posted), `${what}: ${field} is the catalog's`);
        assert.deepEqual(withCatalog(posted, shell.catalog), buildPanelModel(loop.session, panelState(loop.session)), what);
        const laid = posted.catalogOverlay;
        assert.ok(laid.qmkKeycodes.length < catalog.qmkKeycodes.length / 2, `${what}: only the entries its profile names (${laid.qmkKeycodes.length})`);
        assert.ok(Object.keys(laid.qmkKeyLabels).length < Object.keys(catalog.qmkKeyLabels).length, `${what}: and the labels`);
        assert.equal(laid.leds, undefined, `${what}: nothing over what no profile changes`);
        assert.equal(laid.qmkSpellings, undefined);
        assert.equal(laid.qmkKeyKinds, undefined, `${what}: nor over what its keys are`);
    }
});

test("a host's own modifier names are laid over the catalog's words; a host with none lays nothing", () => {
    const catalog = panelCatalog();
    const plain = postedModel(buildDeviceModel({})), mac = buildDeviceModel({settingsView: {host: {effective: 1}}});
    assert.equal(plain.catalogOverlay.vocabulary, undefined);
    const posted = postedModel(mac);
    assert.deepEqual(Object.keys(posted.catalogOverlay.vocabulary).sort(), ["modifiers", "pickerModifiers", "thirdLevel"]);
    assert.deepEqual(withCatalog(posted, catalog), mac);
    assert.equal(withCatalog(posted, catalog).vocabulary.pickerModifiers.find(({value}) => value === "G").label, "Command");
    assert.equal(withCatalog(posted, catalog).vocabulary.thirdLevel, "Option", "a Mac's third level is typed with Option");
    assert.equal(panelCatalog().vocabulary.thirdLevel, "AltGr");
});

test("a field that does not start from the catalog's is posted whole", () => {
    const catalog = panelCatalog();
    const model = buildPanelModel({service: {portable: null}}, {connected: false, devices: [], phase: PHASE.EMPTY});
    const {KC_A: _, ...labels} = model.qmkKeyLabels;
    const odd = {...model, qmkKeyLabels: labels, qmkKeycodes: model.qmkKeycodes.slice(1), qmkKeycodeSource: "another catalogue"};
    const posted = postedModel(odd);
    assert.equal(posted.qmkKeyLabels, labels, "a record without one of the catalog's keys");
    assert.equal(posted.qmkKeycodes, odd.qmkKeycodes, "an array shorter than the catalog's");
    assert.equal(posted.qmkKeycodeSource, "another catalogue");
    for (const field of ["qmkKeyLabels", "qmkKeycodes", "qmkKeycodeSource"]) assert.equal(posted.catalogOverlay[field], undefined, field);
    assert.ok(!("leds" in posted) && !("qmkSpellings" in posted), "the catalog's own are still left out");
    assert.deepEqual(withCatalog(posted, catalog), odd);
});

test("the catalog is built once and frozen, and a model shares what its profile names nothing on", () => {
    const catalog = panelCatalog(), model = buildDeviceModel({});
    assert.equal(panelCatalog(), catalog);
    for (const value of [catalog, catalog.qmkKeycodes, catalog.qmkKeycodes[0], catalog.qmkKeyLabels, catalog.vocabulary, catalog.leds]) assert.ok(Object.isFrozen(value));
    const at = catalog.qmkKeycodes.findIndex((entry) => entry.value === "KC_A");
    assert.equal(model.qmkKeycodes[at], catalog.qmkKeycodes[at]);
    assert.equal(model.leds, catalog.leds);
    assert.equal(catalog.qmkKeycodes.find((entry) => entry.value === "QK_MACRO_0").offered, false, "the picker's offer is the catalog's");
});

test("what each key is, by every name, is the catalog's for a profile on current firmware; a model without those names posts its own", () => {
    const {openDraft, panelModel} = require("../fixtures/published-model");
    const catalog = panelCatalog(), {draft, state} = openDraft();
    assert.equal(panelModel(draft, state).qmkKeyKinds, catalog.qmkKeyKinds, "the catalog's own object");
    assert.ok(Object.isFrozen(catalog.qmkKeyKinds));
    assert.deepEqual(["KC_TRANSPARENT", "KC_NO", "MACRO_0", "MACRO_127", "CUSTOM_KEY_127"].map((name) => catalog.qmkKeyKinds[name]),
        ["transparent", "disabled", "macro", "macro", "customKey"]);
    const empty = buildDeviceModel({}), posted = postedModel(empty);
    assert.ok(!("MACRO_0" in empty.qmkKeyKinds), "no profile names its macros");
    assert.equal(posted.qmkKeyKinds, empty.qmkKeyKinds, "so its kinds are posted whole");
    assert.deepEqual(withCatalog(posted, catalog), empty);
});

// Keyboards that come and go while an operation runs are looked at again
// once it ends; a loop closed before then looks no more.
test("a closed panel loop does not look at the keyboards again after a running operation", async t => {
    t.mock.timers.enable({apis: ["setTimeout"]});
    let enumerated = 0;
    const loop = openPanelLoop(fakeShell(), {service: fakeService({enumerate: async () => {enumerated++;}})});
    loop.session.service.snapshot().busy = true;
    await loop.keyboardsChanged();
    await loop.close();
    loop.session.service.snapshot().busy = false;
    t.mock.timers.tick(1000);
    await new Promise(setImmediate);
    assert.equal(enumerated, 0);
});
