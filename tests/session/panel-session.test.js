"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {applyLayerEdit, buildPanelModel: projectPanelModel, observeService, discardDraftForDevice, layerEditDocument, panelRequest, routeMessage, startLayerEdit} = require("../../core/session/panel-session");
const {fingerprint, summary, validateSnapshot} = require("../../core/model/portable-profile");
const {document} = require("../fixtures/pd-profile");

const capabilities = {compiledLayerCount: 16, supportedDomainMask: 31, actionAbiDigest: 0x837cf479, featureFlags: require("../../core/protocol/profile-wire-v1").PROFILE_WIRE_KNOWN_MASKS.CURRENT_PAIR_FEATURES};
const snapshot = () => {
    const doc = document();
    return {document: doc, fingerprint: fingerprint(doc), summary: summary(doc), limits: {brightnessMax: 200}};
};
const device = {id: "kb", manufacturer: "Bastard Keyboards", product: "Charybdis 4x6"};
const connected = (extra = {}) => ({connected: true, busy: false, selectedDeviceId: "kb", devices: [device], capabilities, ...extra});

// Lifecycle cases use the same explicit notification then projection as the
// panel loop. Their existing state and editability assertions remain intact.
const buildPanelModel = (session, state) => {observeService(session, state); return projectPanelModel(session, state);};

// A panel session exactly as panel-loop.js keeps one, with the first complete
// read already in: publishing it opens the draft.
function panelWithDraft() {
    const read = snapshot();
    const session = {service: {portable: read}};
    buildPanelModel(session, connected());
    return session;
}

test("projecting a model does not open a draft or observe a new connection", () => {
    const session = {service: {portable: snapshot()}};
    projectPanelModel(session, connected({connectionToken: 1}));
    assert.equal(session.draft, undefined, "projection cannot open a draft");
    observeService(session, connected({connectionToken: 1}));
    session.draft.stage({type: "updateLayoutKeys", draftRevision: session.draft.revision, layer: "Layer 1", changes: [{layoutIndex: 0, keycode: "KC_B"}]});
    const before = session.draft.view(connected({connectionToken: 1}));
    projectPanelModel(session, connected({connectionToken: 2}));
    assert.deepEqual(session.draft.view(connected({connectionToken: 1})), before, "projection cannot mark a retained draft stale");
    const changed = structuredClone(session.draft.document); changed.macros[0] = Buffer.from("test").toString("base64");
    session.portableReview = Object.freeze({document: changed, before: snapshot()});
    const first = projectPanelModel(session, connected({connectionToken: 1}));
    const second = projectPanelModel(session, connected({connectionToken: 1}));
    assert.deepEqual(first, second, "repeated projection preserves the model and leaves the import review untouched");
});

test("a complete read opens one draft, and later publishes keep it", () => {
    const session = panelWithDraft();
    const draft = session.draft;
    assert.ok(draft, "the draft opens on the first complete read");
    buildPanelModel(session, connected());
    assert.equal(session.draft, draft, "publishing again does not replace it");
    const legacy = {service: {portable: snapshot()}};
    buildPanelModel(legacy, connected({capabilities: {...capabilities, compiledLayerCount: 5}}));
    assert.equal(legacy.draft, undefined, "a five-layer keyboard stays read-only");
});

test("draft edits are staged, and refused when stale, draftless or on the wrong keyboard", () => {
    const session = panelWithDraft();
    const draft = session.draft;
    const edit = {type: "updateLayoutKeys", layer: "Layer 1", changes: [{layoutIndex: 0, keycode: "KC_B"}]};
    assert.equal(routeMessage(session, {...edit, draftId: draft.id, draftRevision: draft.revision}, connected()), "staged");
    assert.equal(draft.dirty, true);
    assert.ok(session.acceptedEdit, "the model reply carries the accepted edit");

    assert.throws(() => routeMessage(session, {...edit, draftId: "older", draftRevision: draft.revision}, connected()), /older draft/);
    assert.throws(() => routeMessage(session, {...edit, draftId: draft.id, draftRevision: draft.revision}, connected({busy: true})), /Reconnect/);
    assert.throws(() => routeMessage(session, {...edit, draftId: draft.id, draftRevision: draft.revision}, connected({selectedDeviceId: "other"})), /Reconnect/);
    assert.throws(() => routeMessage({service: {}}, edit, connected()), /no editable draft/, "no draft means read-only, never a direct write");
    assert.throws(() => routeMessage(session, {type: "undoProfileDraft", draftId: "older"}, connected()), /older draft/, "draft controls are checked too");
});

test("the model carries the draft's steps only while the history sheet is open", () => {
    const session = panelWithDraft();
    assert.equal(buildPanelModel(session, connected()).draft.steps, undefined, "closed, the history stays in the host");
    assert.equal(routeMessage(session, {type: "openProfileDraftHistory"}, connected()), "none");
    const steps = buildPanelModel(session, connected()).draft.steps;
    assert.deepEqual(steps.map((entry) => [entry.label, entry.current]), [["Read from the keyboard", true]]);
    session.readBusy = true;
    routeMessage(session, {type: "closeProfileDraftHistory"}, connected());
    assert.equal(session.historyOpen, false, "closing is heard even while the keyboard is being read");
});

test("only an object naming its type is taken as a panel request", () => {
    const request = {type: "jumpProfileDraft", step: 1, draftId: "d", draftRevision: 2};
    assert.equal(panelRequest(request), request, "taken as posted; each route checks its own payload");
    assert.deepEqual(panelRequest({type: "somethingElse"}), {type: "somethingElse"}, "an unknown type is still answered by the router");
    for (const value of [null, undefined, "ready", 7, [], {}, {type: 7}, {type: null}]) assert.equal(panelRequest(value), null);
});

test("every other message names the handler that answers it", () => {
    const session = panelWithDraft();
    const id = session.draft.id;
    assert.equal(routeMessage(session, {type: "undoProfileDraft", draftId: id}, connected()), "draft");
    assert.equal(routeMessage(session, {type: "jumpProfileDraft", draftId: id, step: 0}, connected()), "draft",
        "going to a history entry is a draft control, like undo");
    assert.equal(routeMessage(session, {type: "applyProfileDraft", draftId: id}, connected()), "draft");
    assert.equal(routeMessage(session, {type: "discardProfileDraftChanges", draftId: id, group: 0}, connected()), "draft",
        "discarding part of the draft is a draft control, never an apply");
    assert.equal(routeMessage(session, {type: "choosePortableProfile"}, connected()), "portable");
    assert.equal(routeMessage(session, {type: "refresh"}, connected()), "read");
    assert.equal(session.readBusy, true);
    assert.throws(() => routeMessage(session, {type: "refresh"}, connected()), /current operation/, "a second read is refused explicitly");
    assert.equal(routeMessage(session, {type: "ready"}, connected()), "none", "a reloaded panel is answered with the model");
    assert.equal(routeMessage(session, {type: "setTheme", theme: "dark"}, connected()), "none", "a host control starts nothing, so it is answered");
    session.readBusy = false;
    assert.equal(routeMessage(session, {type: "ready"}, connected()), "read");
    session.readBusy = false;
    assert.equal(routeMessage(session, {type: "selectDevice", deviceId: "kb"}, connected()), "read");
    session.readBusy = false;
    session.portableReview = {before: snapshot()};
    session.portableLayers = startLayerEdit(snapshot(), session.draft.revision);
    assert.equal(routeMessage(session, {type: "selectDevice", deviceId: "other"}, connected({devices: [device, {id: "other"}]})), "read");
    assert.equal(session.resetDraftForms, true, "switching devices clears unfinished form text, but keeps the host draft");
    assert.equal(session.portableReview, undefined, "a file review belongs to the previous keyboard");
    assert.equal(session.portableLayers, undefined, "a layer editor belongs to the previous keyboard");
    session.readBusy = false;
    assert.throws(() => routeMessage(session, {type: "selectDevice", deviceId: "missing"}, connected()), /current device list/);
    assert.throws(() => routeMessage(session, {type: "refresh"}, connected({busy: true})), /current operation/, "another device operation blocks readback explicitly");
    assert.equal(routeMessage(session, {type: "ready"}, connected({busy: true})), "none", "a reloaded panel waits on the model, not a refusal");
    assert.equal(routeMessage(session, {type: "somethingNew"}, connected()), "none");
    assert.throws(() => routeMessage({...session, portableBusy: true}, {type: "refresh"}, connected()), /current operation/, "a busy backup returns an explicit refusal");
});

test("the connected keyboard is listed by the name it stores, before it reconnects under it", () => {
    const session = panelWithDraft();
    const two = {devices: [{...device, label: "Charybdis 4x6"}, {id: "other", product: "Charybdis 4x6", label: "Charybdis 4x6"}]};
    const labels = (extra) => buildPanelModel(session, connected({...two, ...extra})).devices.map(({label}) => label);
    assert.deepEqual(labels({}), ["Keyboard 1 · Charybdis 4x6", "Keyboard 2 · Charybdis 4x6"], "unread, two keyboards of one name are numbered");
    assert.deepEqual(labels({storedKeyboardName: ""}), ["Keyboard 1 · Charybdis 4x6", "Keyboard 2 · Charybdis 4x6"], "the built-in name changes nothing");
    assert.deepEqual(labels({storedKeyboardName: "Desk"}), ["Desk", "Charybdis 4x6"], "a stored name tells it apart");
    const model = buildPanelModel(session, connected({storedKeyboardName: "Desk"}));
    assert.equal(model.device.label, "Desk");
    assert.equal(model.keyboardName.name, "", "the card shows the draft's name");
    assert.deepEqual(labels({storedKeyboardName: "Desk", selectedDeviceId: "other"}), ["Charybdis 4x6", "Desk"], "only the connected keyboard's name is known");
    assert.deepEqual(labels({storedKeyboardName: "Desk", connected: false}), ["Keyboard 1 · Charybdis 4x6", "Keyboard 2 · Charybdis 4x6"]);
});

test("switching keyboards preserves a dirty draft without showing it as editable on the other device", () => {
    const session = panelWithDraft();
    const original = session.draft;
    const edit = {type: "updateLayoutKeys", layer: "Layer 1", changes: [{layoutIndex: 0, keycode: "KC_B"}]};
    original.stage({...edit, draftRevision: original.revision});
    session.service.portable = snapshot();
    const other = connected({selectedDeviceId: "other", devices: [device, {id: "other", label: "Another Charybdis"}]});
    const model = buildPanelModel(session, other);
    assert.equal(session.draft, original);
    assert.equal(model.draft.matching, false);
    assert.equal(model.selectedDeviceId, "other");
    assert.deepEqual(model.devices.map(({id}) => id), ["kb", "other"]);
    assert.throws(() => routeMessage(session, {...edit, draftId: original.id, draftRevision: original.revision}, other), /Reconnect/);

    original.reset(snapshot());
    session.service.portable = snapshot();
    buildPanelModel(session, other);
    assert.notEqual(session.draft, original, "a clean draft follows the newly selected keyboard");
    assert.equal(session.draft.deviceId, "other");
});

test("the panel marks a retained draft stale after reconnecting to the same device choice", () => {
    const session = {service: {portable: snapshot()}};
    buildPanelModel(session, connected({connectionToken: 1}));
    session.draft.stage({type: "updateLayoutKeys", draftRevision: session.draft.revision, layer: "Layer 1", changes: [{layoutIndex: 0, keycode: "KC_B"}]});
    session.service.portable = snapshot();
    const model = buildPanelModel(session, connected({connectionToken: 2}));
    assert.equal(model.draft.matching, true);
    assert.equal(model.draft.connectionChanged, true);
    assert.equal(model.draft.stale, true);
});

test("a new connection blocks draft edits before portable readback finishes", () => {
    const session = {service: {portable: snapshot()}};
    buildPanelModel(session, connected({connectionToken: 1}));
    session.draft.stage({type: "updateLayoutKeys", draftRevision: session.draft.revision, layer: "Layer 1", changes: [{layoutIndex: 0, keycode: "KC_B"}]});
    session.service.portable = undefined;
    const current = connected({connectionToken: 2});
    const model = buildPanelModel(session, current);
    assert.equal(model.draft.connectionChanged, true);
    assert.equal(model.draft.stale, true);
    assert.throws(() => routeMessage(session, {type: "updateLayoutKeys", draftId: session.draft.id, draftRevision: session.draft.revision}, current), /Reconnect/);
});

// What the model offers and what the router takes are one rule
// (panel-session-state.js draftBinding): an edit the panel could post from a
// model is staged exactly when that model says the draft is editable.
test("the published editability is what the router accepts, connection changes included", () => {
    const edit = {type: "updateLayoutKeys", layer: "Layer 1", changes: [{layoutIndex: 0, keycode: "KC_B"}]};
    const other = {id: "other", label: "Another Charybdis"};
    const unsupported = {...capabilities, actionAbiDigest: 0x1d3fcacc};
    /** @param {string} label @param {(session: object) => object} arrange returns the state the panel answers to */
    const agree = (label, arrange, expected) => {
        const session = {service: {portable: snapshot()}};
        buildPanelModel(session, connected({connectionToken: 1}));
        const state = arrange(session);
        const draft = session.draft;
        const model = buildPanelModel(session, state);
        let staged;
        try {staged = routeMessage(session, {...edit, draftId: draft.id, draftRevision: draft.revision}, state) === "staged";}
        catch {staged = false;}
        assert.equal(Boolean(model.draft?.editable), expected, `${label}: the model`);
        assert.equal(model.draft?.reason === "", expected, `${label}: the model's reason`);
        assert.equal(staged, expected, `${label}: the router`);
    };
    agree("the draft's own keyboard, idle", () => connected({connectionToken: 1}), true);
    agree("a device operation running", () => connected({connectionToken: 1, busy: true}), false);
    agree("a backup running", (session) => {session.portableBusy = true; return connected({connectionToken: 1});}, false);
    agree("another keyboard selected", () => connected({connectionToken: 1, selectedDeviceId: "other", devices: [device, other]}), false);
    agree("disconnected", () => connected({connectionToken: 1, connected: false}), false);
    agree("reconnected over a new connection", () => connected({connectionToken: 2}), false);
    agree("firmware that cannot hold a complete profile", () => connected({connectionToken: 1, capabilities: unsupported}), false);
    agree("a stale draft", (session) => {session.draft.noteConnection(3); return connected({connectionToken: 1});}, false);
});

test("Apply is routed only for a draft bound to its keyboard; the draft judges the rest as it writes", () => {
    const session = {service: {portable: snapshot()}};
    buildPanelModel(session, connected({connectionToken: 1}));
    const message = {type: "applyProfileDraft", draftId: session.draft.id, draftRevision: session.draft.revision};
    assert.equal(routeMessage(session, message, connected({connectionToken: 1})), "draft");
    assert.throws(() => routeMessage(session, message, connected({connectionToken: 1, connected: false})), /^Error: Reconnect the keyboard this draft belongs to/);
    assert.throws(() => routeMessage(session, message, connected({connectionToken: 1, busy: true})), /wait for its current operation/);
    assert.throws(() => routeMessage(session, message, connected({connectionToken: 2})), /Review this draft against the connected keyboard/);
    session.draft.noteConnection(3);
    assert.equal(routeMessage(session, message, connected({connectionToken: 1})), "draft", "a stale draft refuses Apply itself, asking for a review");
    assert.equal(routeMessage({service: {}}, {type: "applyProfileDraft"}, connected()), "draft", "with no draft, the control says so itself");
});

test("a new connection is refused before any model has noticed it, and the next model agrees", () => {
    const session = {service: {portable: snapshot()}};
    buildPanelModel(session, connected({connectionToken: 1}));
    const draft = session.draft, reconnected = connected({connectionToken: 2});
    assert.equal(draft.stale, false, "nothing has marked the draft stale yet");
    assert.throws(() => routeMessage(session, {type: "updateLayoutKeys", layer: "Layer 1", changes: [{layoutIndex: 0, keycode: "KC_B"}],
        draftId: draft.id, draftRevision: draft.revision}, reconnected), /Reconnect/);
    assert.equal(draft.dirty, false);
    const published = buildPanelModel(session, reconnected).draft;
    assert.equal(published.editable, false);
    assert.equal(published.reason, "connection-changed");
});

test("discarding an old draft on a legacy keyboard clears it without opening an eight-layer draft", () => {
    const session = panelWithDraft();
    const legacy = connected({selectedDeviceId: "old", capabilities: {...capabilities, compiledLayerCount: 5}});
    discardDraftForDevice(session, legacy);
    assert.equal(session.draft, undefined);
    assert.equal(session.resetDraftForms, true);
    assert.equal(buildPanelModel(session, legacy).draft, undefined);
});

test("a clean draft closes automatically when selecting a legacy keyboard", () => {
    const session = panelWithDraft();
    const legacy = connected({selectedDeviceId: "old", capabilities: {...capabilities, compiledLayerCount: 5}});
    assert.equal(buildPanelModel(session, legacy).draft, undefined);
    assert.equal(session.resetDraftForms, true);
});

test("an eight-slot action vocabulary cannot offer portable profile controls", () => {
    const session = panelWithDraft();
    const unsupported = connected({capabilities: {...capabilities, actionAbiDigest: 0x1d3fcacc}});
    const model = buildPanelModel(session, unsupported);
    assert.equal(model.portable.available, false);
    assert.equal(model.draft, undefined);
});

test("an unsupported vocabulary keeps unapplied edits read-only even with the same device ID", () => {
    const session = panelWithDraft(), draft = session.draft;
    draft.stage({type: "updateLayoutKeys", draftRevision: draft.revision, layer: "Layer 1", changes: [{layoutIndex: 0, keycode: "KC_B"}]});
    const unsupported = connected({capabilities: {...capabilities, actionAbiDigest: 0x1d3fcacc}});
    const model = buildPanelModel(session, unsupported);
    assert.equal(session.draft, draft, "unapplied edits remain available for the original firmware");
    assert.equal(model.draft.dirty, true);
    assert.equal(model.draft.matching, false);
    assert.equal(model.draft.connected, false);
    assert.equal(model.load.state, "unavailable");
    assert.throws(() => routeMessage(session, {type: "updateLayoutKeys", draftId: draft.id, draftRevision: draft.revision}, unsupported), /Reconnect/);
});

test("an in-flight read keeps the panel busy across service operation gaps", () => {
    const session = panelWithDraft();
    assert.equal(routeMessage(session, {type: "refresh"}, connected()), "read");
    const model = buildPanelModel(session, connected({busy: false}));
    assert.equal(model.device.health.busy, true);
    assert.equal(model.portable.busy, true);
    assert.equal(model.draft.busy, true);
    assert.throws(() => routeMessage(session, {type: "refresh"}, connected()), /current operation/);
    session.readBusy = false;
    assert.equal(buildPanelModel(session, connected({busy: false})).device.health.busy, false);
});

test("post-Apply readback keeps the editor visible and reports the current read", () => {
    const session = panelWithDraft();
    session.postApplyReadStep = "layout";
    const model = buildPanelModel(session, connected({busy: true, layout: {state: "reading", progress: {done: 12, total: 56}}}));
    assert.equal(model.load.state, "ready", "the completed editable read stays visible during Apply readback");
    assert.deepEqual(model.postApplyRead, {step: "layout", progress: {done: 12, total: 56}});
    session.postApplyReadStep = "combos";
    assert.deepEqual(buildPanelModel(session, connected({busy: true})).postApplyRead, {step: "combos", progress: null});
});

test("a finished Apply is shown only during its own readback", () => {
    const session = panelWithDraft();
    const done = {id: 1, state: "done", steps: []};
    session.applyRunning = true;
    assert.equal(buildPanelModel(session, connected({busy: true, liveApply: done})).apply, done, "the readback after Apply is drawn as such");
    session.applyRunning = false;
    session.portableBusy = true;
    const exporting = buildPanelModel(session, connected({busy: true, phase: "read-complete", liveApply: done}));
    assert.equal(exporting.draft.busy, true);
    assert.equal(exporting.apply, null, "a later export is not drawn as reading back the Apply");
    session.portableBusy = false;
    const failed = {id: 2, state: "failed", steps: [], failure: {label: "Send", reason: "x", saved: "none"}};
    assert.equal(buildPanelModel(session, connected({liveApply: failed})).apply, failed, "a failed Apply stays until dismissed");
    const applying = {id: 3, state: "applying", steps: []};
    assert.equal(buildPanelModel(session, connected({busy: true, liveApply: applying})).apply, applying);
});

test("configure screens stay gated until a complete editable read finishes", () => {
    const session = {service: {portable: null}, readBusy: true, readReady: false};
    const partial = connected({layout: {state: "read", layers: []}, committed: {state: "read"}});
    assert.equal(buildPanelModel(session, partial).load.state, "loading", "layout and lighting alone do not expose the board");
    session.readBusy = false;
    assert.equal(buildPanelModel(session, partial).load.state, "unavailable", "a failed complete read remains gated");
    session.service.portable = snapshot();
    session.readReady = true;
    assert.equal(buildPanelModel(session, partial).load.state, "ready", "the complete read opens the editable draft");
    session.readBusy = true;
    session.readReady = false;
    assert.equal(buildPanelModel(session, partial).load.state, "loading", "refresh hides the old board across request gaps");
    session.readBusy = false;
    assert.equal(buildPanelModel(session, partial).load.state, "unavailable", "a failed refresh cannot reveal stale readback");
});

test("the model shows the draft's surfaces but the keyboard's own header", () => {
    const session = panelWithDraft();
    const draft = session.draft;
    draft.stage({type: "updateLayoutKeys", draftId: draft.id, draftRevision: draft.revision, layer: "Layer 1", changes: [{layoutIndex: 0, keycode: "KC_B"}]});
    const model = buildPanelModel(session, connected({status: {committedGeneration: 7}}));
    assert.equal(model.draft.dirty, true);
    assert.equal(model.draft.id, draft.id);
    assert.deepEqual(model.profileIdentity, draft.identity());
    assert.match(model.device.subtitle, /local draft/, "the rail says the keyboard still runs what it ran");
    assert.equal(model.layers[1].displayName, draft.current.summary.names[1]);
    assert.equal(model.portable.available, true);
    assert.equal(model.portable.layers, null, "the layer editor is closed until Layers… opens it");
});

test("Layers… renames and reorders, keeps Base at the bottom, and carries names with a move", () => {
    const before = snapshot();
    const edit = startLayerEdit(before, 3);
    assert.deepEqual(edit.order, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    applyLayerEdit(edit, {type: "editPortableLayer", id: 2, name: "Symbols+"});
    assert.equal(edit.names[2], "Symbols+");
    const typed = [...edit.names];
    typed[4] = "Mouse";
    applyLayerEdit(edit, {type: "editPortableLayer", id: 2, direction: 1, names: typed});
    assert.deepEqual(edit.order.slice(0, 4), [0, 1, 3, 2], "layer 2 moved up one place");
    assert.equal(edit.names[4], "Mouse", "a name typed before the move survives it");
    assert.throws(() => applyLayerEdit(edit, {type: "editPortableLayer", id: 0, direction: 1}), /base stays at the bottom/);
    assert.throws(() => applyLayerEdit(edit, {type: "editPortableLayer", id: 1, direction: -1}), /base stays at the bottom/);
    assert.throws(() => applyLayerEdit(edit, {type: "editPortableLayer", id: 16, name: "x"}), /Read the layers again/);
    assert.throws(() => applyLayerEdit(null, {type: "editPortableLayer", id: 1, name: "x"}), /Read the layers again/);
    assert.throws(() => applyLayerEdit(edit, {type: "savePortableLayers", names: ["only one"]}), /naming them/);

    const saved = validateSnapshot(layerEditDocument(edit));
    assert.equal(saved.settings.names[2], edit.names[3], "the document carries the new order");
    assert.equal(saved.settings.names[3], "Symbols+");
});

test("Layers… checks every posted name by rewriting the document, and each message keeps or refuses them its own way", () => {
    const tooLong = "x".repeat(40);
    const rename = (edit, id, name) => edit.names.map((old, slot) => (slot === id ? name : old));

    // The keys-follow toggle: a boolean only; names posted with it are kept
    // when they are a full list of strings, and otherwise left alone.
    const toggle = startLayerEdit(snapshot(), 3);
    const original = [...toggle.names];
    assert.throws(() => applyLayerEdit(toggle, {type: "editPortableLayer", keysFollow: "no"}), /^Error: Read the layers again before editing them\.$/);
    assert.equal(toggle.keysFollow, true);
    assert.equal(applyLayerEdit(toggle, {type: "editPortableLayer", keysFollow: false}), toggle);
    assert.equal(toggle.keysFollow, false);
    assert.deepEqual(toggle.names, original, "a toggle without names keeps them");
    applyLayerEdit(toggle, {type: "editPortableLayer", keysFollow: true, names: ["short"]});
    assert.equal(toggle.keysFollow, true);
    assert.deepEqual(toggle.names, original, "a list of the wrong length is ignored");
    applyLayerEdit(toggle, {type: "editPortableLayer", keysFollow: false, names: original.map((name, slot) => (slot === 3 ? 3 : name))});
    assert.deepEqual(toggle.names, original, "a list holding a non-name is ignored");
    assert.throws(() => applyLayerEdit(toggle, {type: "editPortableLayer", keysFollow: true, names: rename(toggle, 2, tooLong)}), /at most 32 bytes/);
    assert.equal(toggle.keysFollow, true, "the toggle is taken before the names are refused");
    assert.deepEqual(toggle.names, original, "a refused name is not kept");
    const typed = rename(toggle, 2, "Typed");
    applyLayerEdit(toggle, {type: "editPortableLayer", keysFollow: false, names: typed});
    assert.deepEqual(toggle.names, typed);
    assert.notEqual(toggle.names, typed, "the posted list is copied");
    applyLayerEdit(toggle, {type: "editPortableLayer", id: 2, keysFollow: true, name: "Both"});
    assert.equal(toggle.keysFollow, true);
    assert.equal(toggle.names[2], "Both", "a toggle posted with a row's edit also makes that edit");

    // Save: every name, the right number of them, or the editor is stale.
    const save = startLayerEdit(snapshot(), 3);
    const saved = [...save.names];
    assert.throws(() => applyLayerEdit(save, {type: "savePortableLayers", names: ["only one"]}), /^Error: Read the layers again before naming them\.$/);
    assert.throws(() => applyLayerEdit(save, {type: "savePortableLayers", names: "Base"}), /^Error: Read the layers again before naming them\.$/);
    assert.throws(() => applyLayerEdit(save, {type: "savePortableLayers", names: rename(save, 3, 7)}), /at most 32 bytes/);
    assert.throws(() => applyLayerEdit(save, {type: "savePortableLayers", names: rename(save, 3, tooLong)}), /at most 32 bytes/);
    assert.deepEqual(save.names, saved);
    assert.throws(() => applyLayerEdit(save, {type: "savePortableLayers"}), /^Error: Read the layers again before editing them\.$/);
    const final = rename(save, 3, "Final");
    assert.equal(applyLayerEdit(save, {type: "savePortableLayers", keysFollow: false, names: final}), save);
    assert.deepEqual(save.names, final);
    assert.notEqual(save.names, final);
    assert.equal(save.keysFollow, false);

    // One row's name.
    const one = startLayerEdit(snapshot(), 3);
    const names = [...one.names];
    assert.throws(() => applyLayerEdit(one, {type: "editPortableLayer", id: 2, name: 5}), /^Error: Enter a layer name\.$/);
    assert.throws(() => applyLayerEdit(one, {type: "editPortableLayer", id: 2, name: tooLong}), /at most 32 bytes/);
    assert.deepEqual(one.names, names);
    assert.equal(applyLayerEdit(one, {type: "editPortableLayer", id: 2, name: "Renamed", direction: 1}), one);
    assert.equal(one.names[2], "Renamed");
    assert.deepEqual(one.order.slice(0, 4), [0, 1, 2, 3], "a rename does not also move");

    // A move or Make base keeps the names posted with it when they are a full
    // list of strings, ignores any other list, and refuses a name it cannot store.
    const move = startLayerEdit(snapshot(), 3);
    const kept = [...move.names];
    applyLayerEdit(move, {type: "editPortableLayer", id: 2, direction: 1, names: ["short"]});
    assert.deepEqual(move.order.slice(0, 4), [0, 1, 3, 2], "the move is made");
    assert.deepEqual(move.names, kept, "and the wrong-length list ignored");
    applyLayerEdit(move, {type: "editPortableLayer", id: 2, direction: -1, names: kept.map((name, slot) => (slot === 1 ? null : name))});
    assert.deepEqual(move.order.slice(0, 4), [0, 1, 2, 3]);
    assert.deepEqual(move.names, kept, "a list holding a non-name is ignored");
    assert.throws(() => applyLayerEdit(move, {type: "editPortableLayer", id: 2, to: 5, names: rename(move, 4, tooLong)}), /at most 32 bytes/);
    assert.deepEqual(move.order.slice(0, 4), [0, 1, 2, 3], "a refused name stops the move");
    const moved = rename(move, 4, "Moved");
    applyLayerEdit(move, {type: "editPortableLayer", id: 2, to: 5, names: moved});
    assert.deepEqual(move.names, moved);
    assert.notEqual(move.names, moved);
    const based = rename(move, 6, "New base");
    applyLayerEdit(move, {type: "editPortableLayer", id: 6, makeBase: true, names: based});
    assert.deepEqual(move.names, based);
    assert.equal(move.order[0], 6);
    assert.throws(() => applyLayerEdit(move, {type: "editPortableLayer", id: 6, makeBase: true, names: rename(move, 6, "Again")}), /^Error: That layer is already the base\.$/);
    assert.equal(move.names[6], "Again", "names are kept before the move is refused");
    assert.throws(() => applyLayerEdit(move, {type: "editPortableLayer", id: 3}), /^Error: The base stays at the bottom; use Make base to put another layer there\.$/);
    assert.throws(() => applyLayerEdit(move, {type: "editPortableLayer", id: 1.5, name: "x"}), /^Error: Read the layers again before editing them\.$/);
    assert.equal(validateSnapshot(layerEditDocument(move)).settings.names[0], "Again");
});

test("a layer is dragged to any place above the base, and Make base swaps it with the base", () => {
    const edit = startLayerEdit(snapshot(), 3);
    applyLayerEdit(edit, {type: "editPortableLayer", id: 1, to: 6});
    assert.deepEqual(edit.order, [0, 2, 3, 4, 5, 6, 1, 7, 8, 9, 10, 11, 12, 13, 14, 15], "layer 1 lands in slot 6, the ones between shift down");
    applyLayerEdit(edit, {type: "editPortableLayer", id: 7, to: 1});
    assert.deepEqual(edit.order, [0, 7, 2, 3, 4, 5, 6, 1, 8, 9, 10, 11, 12, 13, 14, 15]);
    assert.throws(() => applyLayerEdit(edit, {type: "editPortableLayer", id: 2, to: 0}), /Make base/);
    assert.throws(() => applyLayerEdit(edit, {type: "editPortableLayer", id: 2, to: 16}), /Make base/);
    assert.throws(() => applyLayerEdit(edit, {type: "editPortableLayer", id: 0, to: 3}), /base stays/);

    applyLayerEdit(edit, {type: "editPortableLayer", id: 5, makeBase: true});
    assert.deepEqual(edit.order, [5, 7, 2, 3, 4, 0, 6, 1, 8, 9, 10, 11, 12, 13, 14, 15], "layer 5 is the base, and the old base takes its slot");
    assert.throws(() => applyLayerEdit(edit, {type: "editPortableLayer", id: 5, makeBase: true}), /already the base/);
    assert.throws(() => applyLayerEdit(edit, {type: "editPortableLayer", id: 5, direction: 1}), /base stays/);
    applyLayerEdit(edit, {type: "editPortableLayer", id: 0, direction: 1});
    assert.deepEqual(edit.order, [5, 7, 2, 3, 4, 6, 0, 1, 8, 9, 10, 11, 12, 13, 14, 15], "the old base moves like any other layer now");
    assert.equal(validateSnapshot(layerEditDocument(edit)).settings.names[0], edit.names[5]);
});

test("the profile meter follows the draft, and is absent without a keyboard or an advertised size", () => {
    const sized = {...capabilities, maxProfilePayload: 5088, maxBehaviorRows: 64};
    const session = {service: {portable: snapshot()}};
    const keyboard = buildPanelModel(session, connected({capabilities: sized})).portable.usage;
    assert.equal(keyboard.source, "keyboard", "with nothing changed, the figures are the keyboard's");
    assert.equal(keyboard.capacity, 5088);
    const draft = session.draft;
    const behaviours = keyboard.counts.find((entry) => entry.id === "behaviours").used;
    routeMessage(session, {type: "saveBehavior", draftId: draft.id, draftRevision: draft.revision,
        behavior: {keycode: "KC_F13", tapHoldTerm: 0, longerHoldTerm: 0, multiTapTerm: 0, steps: []}}, connected({capabilities: sized}));
    const staged = buildPanelModel(session, connected({capabilities: sized})).portable.usage;
    assert.equal(staged.source, "draft");
    assert.equal(staged.used, keyboard.used + 18, "a behaviour without steps costs its 18-byte row");
    assert.equal(staged.counts.find((entry) => entry.id === "behaviours").used, behaviours + 1);
    draft.undo(draft.revision);
    assert.equal(buildPanelModel(session, connected({capabilities: sized})).portable.usage.used, keyboard.used, "undo takes the bytes back");
    assert.equal(buildPanelModel(session, connected({capabilities: sized, connected: false})).portable.usage, null);
    assert.equal(buildPanelModel(session, connected()).portable.usage, null, "firmware that advertises no size shows no meter");
});

test("the model says what its host offers, in the host's words", () => {
    const {HOST_WORDS} = require("../../core/session/panel-session");
    // A session with no host describes the extension's: nothing extra, its words.
    const plain = buildPanelModel(panelWithDraft(), connected());
    assert.deepEqual(plain.host, {chooseKeyboard: false, blocked: null, theme: null, recoveries: null, build: null, progress: null, words: {...HOST_WORDS}});

    const session = panelWithDraft();
    const recoveries = [{id: 1, name: "recovery-1.charybdis.json", savedAt: "2026-10-06T09:00:00.000Z"}];
    session.host = {words: {noKeyboard: "Choose keyboard to connect one."},
        panel: () => ({chooseKeyboard: true, theme: "light", recoveries, build: {version: "1", commit: "abc"}, progress: "Reading"})};
    const model = buildPanelModel(session, connected());
    assert.deepEqual(model.host, {chooseKeyboard: true, blocked: null, theme: "light", recoveries, build: {version: "1", commit: "abc"}, progress: "Reading",
        words: {...HOST_WORDS, noKeyboard: "Choose keyboard to connect one."}});
    session.host.panel = () => ({theme: "sepia", blocked: {title: "No", detail: "Why"}});
    assert.equal(buildPanelModel(session, connected()).host.theme, null, "only a theme the panel has");
    assert.deepEqual(buildPanelModel(session, connected()).host.blocked, {title: "No", detail: "Why"});
});

test("no host or firmware brings back the retired PD upgrade export", () => {
    const session = panelWithDraft();
    session.host = {exportPdUpgrade: async () => {}};
    const state = connected();
    state.capabilities = {...state.capabilities, featureFlags: 1 << 13};
    assert.equal("pdUpgradeAvailable" in buildPanelModel(session, state).portable, false);
});


test("older firmware keeps independent readback while a dirty current draft is retained", () => {
    const {buildDeviceModel} = require("../../core/session/device-model");
    const session = panelWithDraft();
    session.draft.stage({type: "updateLayoutKeys", draftRevision: session.draft.revision, layer: "Layer 0", changes: [{layoutIndex: 0, keycode: "KC_Z"}]});
    const keycode = 4;
    const older = connected({capabilities: {...capabilities, compiledLayerCount: 5}, phase: "connected",
        layout: {state: "read", layers: [{layer: 0, keys: [{layoutIndex: 0, row: 0, column: 0, keycode, resolved: require("../../core/data/keycode-catalog").resolve(keycode)}]}]},
        committed: {state: "read", source: "compiled", byteLength: 321, domains: {}, failures: [{domainId: 0x10, message: "Earlier RGB format"}]},
        combos: {state: "unavailable", error: {message: "Earlier combo format"}}});
    const actual = buildDeviceModel({...older, device});
    const model = buildPanelModel(session, older);
    assert.equal(model.draft.reason, "unsupported");
    assert.equal(model.draft.editable, false);
    assert.deepEqual(model.layers.map(layer => layer.positions), actual.layers.map(layer => layer.positions));
    assert.deepEqual(model.keyBehaviors, actual.keyBehaviors);
    assert.deepEqual(model.rgb, actual.rgb);
    assert.deepEqual(model.combos, actual.combos);
    assert.deepEqual(model.device, actual.device);
    assert.deepEqual(model.diagnostics, actual.diagnostics);
    assert.match(model.diagnostics.join(" "), /Earlier RGB format/);
});
