// @ts-check
"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const {CONTROLS, controlsOn, panelControl, writingProfile} = require("../../core/session/panel-control-registry");
const {DRAFT_CONTROLS, PORTABLE_MESSAGES, DEMO_MESSAGES, routeMessage} = require("../../core/session/panel-session");
const {DRAFT_ACTIONS, PORTABLE_ACTIONS, draftControl} = require("../../core/session/panel-controls");
const {DEMO_ACTIONS, DEMO_WORDS} = require("../../core/session/demo-session");
const {openPanelLoop} = require("../../core/session/panel-loop");
const {ProfileDraftSession} = require("../../core/session/profile-draft-session");
const {fingerprint, summary} = require("../../core/model/portable-profile");
const {document} = require("../fixtures/pd-profile");

const capabilities = {compiledLayerCount: 16, supportedDomainMask: 31, actionAbiDigest: 0x837cf479, featureFlags: require("../../core/protocol/profile-wire-v1").PROFILE_WIRE_KNOWN_MASKS.CURRENT_PAIR_FEATURES};
const state = (extra = {}) => ({connected: true, busy: false, selectedDeviceId: "kb", connectionToken: 1, devices: [{id: "kb"}], capabilities, ...extra});
function session() {
    const doc = document(), snapshot = {document: doc, fingerprint: fingerprint(doc), summary: summary(doc), limits: {brightnessMax: 200}};
    return {service: {portable: snapshot}, draft: new ProfileDraftSession(snapshot, "kb", capabilities, 1)};
}
function request(type, current) {
    return {type, draftId: current.draft.id, draftRevision: current.draft.revision, deviceId: "kb"};
}

// contracts/ remains inert declarations; keyed payload groups mirror the
// registry routes, as the edit-payload map mirrors the draft-edit registry.
test("every contracted control has exactly one registered route", () => {
    const text = fs.readFileSync(path.join(__dirname, "../../contracts/messages.d.ts"), "utf8");
    const body = /export interface ControlPayloads \{\n([\s\S]*?)\n\}/.exec(text);
    assert.ok(body);
    const actual = {};
    for (const group of body[1].matchAll(/^ {4}(\w+): \{\n([\s\S]*?)^ {4}\};/gm)) {
        actual[group[1]] = [...group[2].matchAll(/^ {8}(\w+):/gm)].map(match => match[1]).sort();
    }
    assert.deepEqual(Object.values(actual).flat().sort(), Object.keys(CONTROLS).sort());
    for (const [route, types] of Object.entries(actual)) assert.deepEqual([...controlsOn(route)].sort(), types, route);
    assert.deepEqual([...DRAFT_CONTROLS].sort(), [...controlsOn("draft")].sort());
    assert.deepEqual([...PORTABLE_MESSAGES].sort(), [...controlsOn("portable")].sort());
    assert.deepEqual([...DEMO_MESSAGES].sort(), [...controlsOn("demo")].sort());
});

test("every policy is complete and every routed action resolves", () => {
    for (const [type, entry] of Object.entries(CONTROLS)) {
        assert.equal(panelControl(type), entry);
        assert.ok(Object.isFrozen(entry), type);
        assert.ok(["none", "apply", "import", "profile", "inspect"].includes(entry.binding), type);
        assert.ok(["allow", "refuse", "ignore", "leave", "export", "open", "replace", "close", "host-leave"].includes(entry.demo), type);
        assert.ok(["panel", "apply", "restore", "read", "view", "host", "inspect"].includes(entry.phase), type);
        assert.equal(typeof entry.identity, "boolean", type);
        const handlers = {draft: DRAFT_ACTIONS, portable: PORTABLE_ACTIONS, demo: DEMO_ACTIONS}[entry.route];
        if (handlers && entry.action !== "export") assert.equal(typeof handlers[entry.action], "function", type);
        else assert.ok(["export", "read", "select", "openHistory", "closeHistory", "chooseKeyboard", "forgetKeyboard", "setTheme", "downloadRecovery", "validateMacro"].includes(entry.action), type);
    }
    for (const [route, handlers] of Object.entries({draft: DRAFT_ACTIONS, portable: PORTABLE_ACTIONS, demo: DEMO_ACTIONS})) {
        const actions = Object.values(CONTROLS).filter(entry => entry.route === route && entry.action !== "export").map(entry => entry.action).sort();
        assert.deepEqual(Object.keys(handlers).sort(), actions, route + " has no orphan actions");
    }
    for (const type of [undefined, null, "", "constructor", "toString", "__proto__", "unknownControl"]) assert.equal(panelControl(type), undefined);
});

test("every control keeps its route, including history before the busy guard", () => {
    for (const [type, entry] of Object.entries(CONTROLS)) {
        const current = session(), message = request(type, current);
        const route = ["view", "host", "inspect"].includes(entry.route) ? "none" : entry.route;
        assert.equal(routeMessage(current, message, state()), route, type);
        const busy = {...session(), readBusy: true};
        // Work waits out loud; a model request and host controls are answered.
        if (["draft", "portable", "demo", "read"].includes(entry.route) && type !== "ready") assert.throws(() => routeMessage(busy, request(type, busy), state()), /current operation/, type);
        else assert.equal(routeMessage(busy, request(type, busy), state()), "none", type);
        if (entry.route === "view") assert.equal(busy.historyOpen, entry.action === "openHistory", type);
    }
});

test("all draft controls check identity, while portable binding rules retain their distinct fallbacks", () => {
    for (const [type, entry] of Object.entries(CONTROLS)) {
        const current = session(), message = request(type, current);
        if (entry.identity) assert.throws(() => routeMessage(current, {...message, draftId: "old"}, state()), /older draft/, type);
        if (entry.binding === "apply") {
            assert.throws(() => routeMessage(current, message, state({connectionToken: 2})), /Review this draft against the connected keyboard/, type);
            assert.equal(routeMessage({service: {}}, {type}, state()), "draft", "the handler reports a missing draft");
        } else if (entry.binding === "import") {
            assert.throws(() => routeMessage(current, {...message, draftRevision: -1}, state()), /^Error: The draft changed\. Review the current changes before continuing\.$/, type);
            assert.throws(() => routeMessage({service: {}}, {type}, state()), /before importing a profile/, type);
        } else if (entry.binding === "profile") {
            assert.throws(() => routeMessage(current, message, state({connected: false})), /before changing this profile/, type);
            assert.equal(routeMessage({service: {}}, {type}, state()), "portable", "draftless recovery remains available");
            assert.equal(routeMessage(current, {...message, draftRevision: -1}, state()), "portable", "the open review checks its own revision when kept");
        }
    }
});

test("demo refusals and read policies come from the registry", async () => {
    for (const [type, entry] of Object.entries(CONTROLS)) {
        const current = {...session(), demo: {name: "demo"}};
        if (entry.demo === "refuse") {
            await assert.rejects(draftControl(current, request(type, current)), error => error.code === "DEMO_REFUSED" && error.message === DEMO_WORDS.applyNeedsKeyboard, type);
        }
        if (entry.route === "read") assert.equal(routeMessage(current, request(type, current), state()), "none", "the loop leaves the demo explicitly before reading");
    }
    assert.equal(CONTROLS.ready.demo, "ignore");
    assert.equal(CONTROLS.refresh.demo, "leave");
    assert.equal(CONTROLS.selectDevice.demo, "leave");
    assert.equal(CONTROLS.exportPortableProfile.demo, "export");
});

test("registered write phases warn only while Apply or device restore is active", () => {
    assert.equal(writingProfile({}), false);
    assert.equal(writingProfile({applyRunning: true}), true);
    assert.equal(writingProfile({service: {phase: "restore-complete"}}), true);
    for (const phase of ["read-complete", "read-layout", "refresh", "connected", "idle"]) assert.equal(writingProfile({service: {phase}}), false, phase);
    assert.equal(CONTROLS.applyProfileDraft.phase, "apply");
    assert.equal(CONTROLS.restorePortableProfile.phase, "restore");
    assert.equal(CONTROLS.savePortableLayers.phase, "restore");
    assert.equal(CONTROLS.exportPortableProfile.phase, "panel");
});


test("local macro inspection replies before the ordinary busy guard without staging or publishing", async () => {
    const current = session(), replies = [];
    const loop = openPanelLoop({post: response => replies.push(response)}, {service: {snapshot: () => state(), close: async () => {}}});
    Object.assign(loop.session, current, {service: {...current.service, snapshot: () => state()}, readBusy: true, portableBusy: true});
    const revision = current.draft.revision;
    await loop.handleMessage({...request("validateViaMacro", current), keycode: "VIA_MACRO_0", payload: "hello", requestId: 7});
    assert.equal(replies.length, 1);
    assert.equal(replies[0].type, "macroValidation");
    assert.equal(replies[0].requestId, 7);
    assert.match(replies[0].validation.error, /before editing this macro/);
    assert.equal(current.draft.revision, revision);
    assert.equal(loop.session.notice, undefined);
});
