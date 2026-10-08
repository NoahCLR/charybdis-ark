"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {exportedProfile, openPanelLoop} = require("../../core/session/panel-loop");
const {FakeDeviceAdapter} = require("../../core/transport/fake-device-adapter");
const {LIVE_LINK_ERROR_CODES, liveLinkError} = require("../../core/transport/device-adapter");
const {fingerprint, summary} = require("../../core/model/portable-profile");
const {document} = require("../fixtures/pd-profile");

const capabilities = {compiledLayerCount: 8, supportedDomainMask: 31, actionAbiDigest: 0xf79c6151, featureFlags: 0};
const snapshot = () => {
    const doc = document();
    return {document: doc, fingerprint: fingerprint(doc), summary: summary(doc), limits: {brightnessMax: 200}};
};
const device = {id: "kb", manufacturer: "Bastard Keyboards", product: "Charybdis 4x6"};

// A host that records everything the loop hands it.
function fakeHost(extra = {}) {
    const host = {
        posted: [], errors: [], recoveries: [], exports: [],
        post: (message) => {host.posted.push(message);},
        showError: (text) => {host.errors.push(text);},
        progress: async (title, work) => work(),
        saveRecovery: async (doc) => {host.recoveries.push(doc); return `/recovery/${host.recoveries.length}.json`;},
        chooseProfile: async () => undefined,
        saveExport: async (file) => {host.exports.push(file); return "/exports/" + file.fileName;},
        ...extra,
    };
    return host;
}
const last = (host) => host.posted[host.posted.length - 1];

// A connected keyboard with a complete profile, as panel-controls.test.js fakes it.
function fakeService(extra = {}) {
    const calls = [];
    const record = (name, value) => async (...args) => {calls.push(name); return typeof value === "function" ? value(...args) : value;};
    const state = {connected: true, busy: false, selectedDeviceId: "kb", devices: [device], capabilities,
        layout: {state: "read", layers: []}, committed: {state: "read", source: "device", generation: 7, failures: []}};
    const service = {
        calls, capabilities, portable: snapshot(),
        snapshot: () => state,
        enumerate: record("enumerate"), connect: record("connect"), refresh: record("refresh"),
        readLayout: record("readLayout"), readCommittedProfile: record("readCommittedProfile"),
        readBaseRgb: record("readBaseRgb"), readCombos: record("readCombos"),
        readPortableProfile: record("readPortableProfile", () => service.portable),
        close: record("close"),
        ...extra,
    };
    return service;
}
function loopWithDraft(host = fakeHost(), extra) {
    const loop = openPanelLoop(host, {service: fakeService(extra)});
    loop.publish();
    assert.ok(loop.session.draft, "the first publish of a complete read opens the draft");
    host.posted.length = 0;
    return loop;
}

test("reading with no keyboard attached answers with a notice through the host", async () => {
    const host = fakeHost();
    const loop = openPanelLoop(host, {adapter: new FakeDeviceAdapter({devices: []})});
    await loop.handleMessage({type: "ready"});
    const reply = last(host);
    assert.equal(reply.type, "model");
    assert.match(reply.notice, /No Charybdis Raw HID interface found/);
    assert.equal(loop.session.readBusy, false);
    assert.equal(reply.model.selectedDeviceId, "");
    assert.deepEqual(host.errors, []);
    await loop.close();
});

test("a keyboard that never answers becomes a failure notice and a host error", async () => {
    const host = fakeHost();
    const adapter = new FakeDeviceAdapter();
    const loop = openPanelLoop(host, {adapter, defaultTimeoutMs: 20});
    await loop.handleMessage({type: "refresh"});
    assert.ok(adapter.lastConnection().writes.length, "the loop reached the device through the injected adapter");
    assert.equal(host.errors.length, 1);
    assert.match(last(host).notice, /^Failed: /);
    assert.equal(last(host).notice, `Failed: ${host.errors[0]}`);
    assert.equal(loop.session.readBusy, false, "a failed read leaves the panel free to try again");
    await loop.close();
});

test("a read connects, reads in order and publishes what it read", async () => {
    const host = fakeHost();
    const service = fakeService();
    const loop = openPanelLoop(host, {service});
    await loop.handleMessage({type: "ready"});
    assert.deepEqual(service.calls, ["enumerate", "refresh", "readLayout", "readCommittedProfile", "readBaseRgb", "readCombos", "readPortableProfile"]);
    assert.equal(host.posted.length, 1, "one answer");
    assert.match(last(host).notice, /committed profile generation 7/);
    assert.equal(loop.session.readReady, true);
    assert.ok(last(host).model.draft, "the model carries the draft the read opened");
});

test("a staged edit is answered with the model and the accepted edit", async () => {
    const host = fakeHost(), loop = loopWithDraft(host), draft = loop.session.draft;
    await loop.handleMessage({type: "updateLayoutKeys", draftId: draft.id, draftRevision: draft.revision,
        layers: [{layer: "Layer 0", changes: [{layoutIndex: 0, keycode: "KC_A"}]}]});
    assert.equal(host.posted.length, 1);
    assert.ok(last(host).acceptedEdit, "the panel learns its edit was accepted");
    assert.equal(last(host).model.draft.dirty, true);
    assert.equal(last(host).notice, undefined);
    assert.deepEqual(host.errors, []);
});

test("a refused edit is answered too, with the refusal as a notice", async () => {
    const host = fakeHost(), loop = loopWithDraft(host), draft = loop.session.draft;
    await loop.handleMessage({type: "updateLayoutKeys", draftId: "an older draft", draftRevision: draft.revision,
        layers: [{layer: "Layer 0", changes: [{layoutIndex: 0, keycode: "KC_A"}]}]});
    assert.equal(host.posted.length, 1, "a refusal still publishes, so the panel is not left waiting");
    assert.equal(last(host).acceptedEdit, undefined);
    assert.match(last(host).notice, /^Failed: This edit belongs to an older draft/);
    assert.equal(host.errors.length, 1);
    assert.equal(loop.session.draft.dirty, false, "nothing was staged");
    // Even a message nobody knows is answered.
    await loop.handleMessage({type: "somethingElse"});
    assert.equal(host.posted.length, 2);
});

test("an error with a code reaches the panel with its code", async () => {
    const timeout = async () => {throw liveLinkError(LIVE_LINK_ERROR_CODES.TIMEOUT, "The keyboard did not answer.");};
    const host = fakeHost(), loop = loopWithDraft(host, {readPortableProfile: timeout});
    await loop.handleMessage({type: "exportPortableProfile"});
    assert.equal(last(host).notice, "Failed [TIMEOUT]: The keyboard did not answer.");
    assert.deepEqual(host.errors, ["The keyboard did not answer."]);
    assert.deepEqual(host.exports, [], "nothing is saved when the read fails");
    assert.equal(loop.session.portableBusy, false);
    // The finished control publishes, then the failure publishes its notice.
    assert.equal(host.posted.length, 2);
});

test("export hands the host what to save, and says where it went", async () => {
    const host = fakeHost(), loop = loopWithDraft(host);
    await loop.handleMessage({type: "exportPortableProfile"});
    assert.equal(host.exports.length, 1);
    const [file] = host.exports;
    assert.equal(file.text, JSON.stringify(loop.session.service.portable.document, null, 2) + "\n");
    assert.match(file.fileName, /^charybdis-\d{4}-\d{2}-\d{2}\.charybdis\.json$/);
    assert.equal(last(host).notice, "Complete keyboard profile exported to /exports/" + file.fileName);
    assert.equal(host.posted.length, 1);

    // A cancelled save says nothing, but is still answered.
    const cancelled = fakeHost({saveExport: async () => undefined}), quiet = loopWithDraft(cancelled);
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

test("the retired PD upgrade export is no message any host runs", async () => {
    const seen = [];
    const host = fakeHost({exportPdUpgrade: async (session) => {seen.push(session);}}), loop = loopWithDraft(host);
    const posted = host.posted.length;
    await loop.handleMessage({type: "exportPdUpgrade"});
    assert.equal(host.posted.length, posted + 1, "an unknown message is answered with the model");
    assert.equal(last(host).type, "model");
    assert.deepEqual(seen, [], "not even a host that still has the function");
    assert.deepEqual(host.errors, []);
});

test("closing the loop closes the device service", async () => {
    const service = fakeService(), loop = openPanelLoop(fakeHost(), {service});
    await loop.close();
    assert.deepEqual(service.calls, ["close"]);
});

test("the host's words say no keyboard was found, and its sleep reaches the device service", async () => {
    const host = fakeHost({words: {noneFound: "Choose keyboard and pick yours."}});
    const sleep = async () => {};
    const loop = openPanelLoop(host, {adapter: new FakeDeviceAdapter({devices: []}), sleep});
    assert.equal(loop.session.service.sleep, sleep, "the service polls with the host's sleep");
    assert.equal(loop.session.host, host);
    await loop.handleMessage({type: "ready"});
    assert.equal(last(host).notice, "Choose keyboard and pick yours.");
    assert.equal(last(host).model.host.words.noneFound, "Choose keyboard and pick yours.");
    assert.equal(openPanelLoop(fakeHost(), {adapter: new FakeDeviceAdapter()}).session.service.sleep, undefined, "the timer's otherwise");
    await loop.close();
});

test("messages meant for a host's own controls are answered, never run", async () => {
    const host = fakeHost(), loop = loopWithDraft(host);
    for (const message of [{type: "chooseKeyboard"}, {type: "setTheme", theme: "light"}, {type: "downloadRecovery", id: 1}]) {
        await loop.handleMessage(message);
        assert.equal(last(host).type, "model");
    }
    assert.equal(host.posted.length, 3);
    assert.deepEqual(host.errors, []);
});

test("the panel offers no PD upgrade export", async () => {
    const host = fakeHost(), loop = loopWithDraft(host);
    loop.publish();
    assert.equal("pdUpgradeAvailable" in last(host).model.portable, false);
});
