"use strict";
// The demo through the shared host loop, as a host runs it: with no keyboard,
// the bundled profile opens in a real draft, edits stage and show in the
// review, Apply is refused, Export saves the draft, a profile file can replace
// it, and leaving with edits not exported asks first.
const test = require("node:test");
const assert = require("node:assert/strict");
const {openPanelLoop} = require("../../core/session/panel-loop");
const {fingerprint} = require("../../core/model/portable-profile");
const {fakeKeyboardAdapter} = require("../fixtures/fake-keyboard");
const {document32: pdDocument} = require("../fixtures/pd-slots-32");
const {ACTION_ABI} = require("../../core/schema/actions");
const {
    DEMO_CAPABILITIES, DEMO_DEVICE_ID, DEMO_LIMITS, DEMO_OPTIONS, demoProfile, demoRefusal, demoSnapshot, demoState, panelState,
} = require("../../core/session/demo-session");

function recordingHost(extra = {}) {
    const host = {
        posted: [], errors: [], exports: [], chosen: [],
        post: (message) => {host.posted.push(message);},
        showError: (text) => {host.errors.push(text);},
        progress: async (title, work) => work(),
        saveRecovery: async () => {throw new Error("the demo never saves a recovery copy");},
        chooseProfile: async () => host.chosen.shift(),
        saveExport: async (file) => {host.exports.push(file); return "/exports/" + file.fileName;},
        ...extra,
    };
    return host;
}
const last = (host) => host.posted[host.posted.length - 1];

// The loop over the fake keyboard, unplugged until `plugIn()`.
async function unplugged(host = recordingHost()) {
    const keyboard = fakeKeyboardAdapter({document: pdDocument()});
    const devices = keyboard.devices;
    keyboard.devices = [];
    const loop = openPanelLoop(host, {adapter: keyboard, defaultTimeoutMs: 200});
    await loop.handleMessage({type: "ready"});
    return {loop, host, plugIn: () => {keyboard.devices = devices;}};
}
const send = (loop, host, message) => {
    const draft = last(host).model.draft;
    return loop.handleMessage(draft ? {draftId: draft.id, draftRevision: draft.revision, ...message} : message);
};
const dpiEdit = {type: "updateConfigDefaults", sectionId: "normalPointerSpeed", fields: [{macro: "normalDpi", value: "1400"}, {macro: "snipingDpi", value: "200"}]};

test("the demo stands in for current firmware: what the 32-slot keyboard reports, less what only a keyboard has", async () => {
    const host = recordingHost();
    const loop = openPanelLoop(host, {adapter: fakeKeyboardAdapter({document: demoProfile(), brightnessMax: DEMO_LIMITS.brightnessMax}), defaultTimeoutMs: 200});
    try {
        await loop.handleMessage({type: "ready"});
        const {firmwareVersion, compiledDefaultDigest, ...reported} = loop.session.service.capabilities;
        assert.ok(firmwareVersion && compiledDefaultDigest);
        assert.deepEqual(JSON.parse(JSON.stringify(DEMO_CAPABILITIES)), reported);
        assert.equal(DEMO_CAPABILITIES.actionAbiDigest, ACTION_ABI);
        assert.deepEqual(loop.session.service.portable.limits, DEMO_LIMITS);
    } finally {
        await loop.close();
    }
    assert.equal(DEMO_OPTIONS.effects[0].name, "SOLID_COLOR");
    assert.deepEqual(DEMO_OPTIONS.effects.map((effect) => effect.id), DEMO_OPTIONS.effects.map((_, index) => index + 1));
});

test("the demo checks current profiles as Import does and refuses older backups", () => {
    const snapshot = demoSnapshot(demoProfile());
    assert.equal(snapshot.fingerprint, fingerprint(demoProfile()));
    assert.deepEqual(snapshot.limits, DEMO_LIMITS);
    assert.equal(snapshot.options, DEMO_OPTIONS);
    assert.equal(demoSnapshot(pdDocument()).document.actionAbiDigest, ACTION_ABI);
    assert.throws(() => demoSnapshot({...pdDocument(), actionAbiDigest: 0x1d3fcacc}), {code: "INVALID_PORTABLE_PROFILE"});
    assert.throws(() => demoSnapshot({...pdDocument(), version: 1}), {code: "INVALID_PORTABLE_PROFILE"});
    assert.throws(() => demoSnapshot("{}"), /supported Charybdis profile/);
    assert.throws(() => demoSnapshot("not json"), /not a valid profile/);
});

test("the demo is offered with no keyboard, and not over a keyboard or its unapplied edits", () => {
    assert.equal(demoRefusal({}, {connected: false}), "");
    assert.match(demoRefusal({}, {connected: true}), /keyboard is connected/);
    assert.match(demoRefusal({}, {connected: false, busy: true}), /working/);
    assert.match(demoRefusal({draft: {dirty: true}}, {connected: false}), /changes for a keyboard/);
    assert.equal(demoState().connected, true, "inside the session the demo is the draft's device");
    assert.equal(demoState().selectedDeviceId, DEMO_DEVICE_ID);
    assert.equal(panelState({service: {snapshot: () => "service"}}), "service");
});

test("with no keyboard the demo opens the bundled profile in a real draft, and never says it is a keyboard", async () => {
    const {loop, host} = await unplugged();
    try {
        let {model} = last(host);
        assert.equal(model.demo.offered, true);
        assert.equal(model.demo.active, false);
        assert.equal(model.load.state, "unavailable");

        await loop.handleMessage({type: "openDemo"});
        ({model} = last(host));
        assert.deepEqual(host.errors, []);
        assert.equal(model.demo.active, true);
        assert.equal(model.demo.offered, false);
        assert.equal(model.load.state, "ready");
        assert.equal(model.draft.matching, true);
        assert.equal(model.draft.dirty, false);
        assert.equal(loop.session.draft.current.fingerprint, fingerprint(demoProfile()));
        // The header and diagnostics say demo: no keyboard, generation or halves.
        assert.equal(model.device.connected, false);
        assert.equal(model.device.demo, true);
        assert.equal(model.device.label, "Demo");
        assert.doesNotMatch(JSON.stringify(model.device), /generation|halves agree|Charybdis/);
        assert.equal(model.device.health.profile, "demo");
        assert.ok(model.diagnostics.every((line) => !/generation/.test(line)));
        assert.deepEqual(model.devices, []);
        assert.equal(model.apply, null);
        assert.equal("pdUpgradeAvailable" in model.portable, false, "no host offers the retired PD upgrade export");
        assert.equal(model.profileIdentity.originHalf, DEMO_DEVICE_ID);
        assert.equal(model.portable.usage.source, "demo", "an unedited demo is the demo setup, not a keyboard's");

        // A panel that loads again stays in the demo.
        await loop.handleMessage({type: "ready"});
        assert.equal(last(host).model.demo.active, true);
    } finally {
        await loop.close();
    }
});

test("in the demo an edit stages, checks and shows in the review; Apply is refused and nothing is written", async () => {
    const {loop, host} = await unplugged();
    try {
        await loop.handleMessage({type: "openDemo"});
        await send(loop, host, dpiEdit);
        let {model, notice} = last(host);
        assert.doesNotMatch(String(notice), /Failed/);
        assert.equal(model.draft.dirty, true);
        assert.equal(model.demo.unsaved, true);
        assert.ok(model.draft.changes.some((change) => /DPI|speed/i.test(JSON.stringify(change))));
        assert.ok(Array.isArray(model.draft.checks));
        assert.equal(model.portable.usage.source, "draft");

        await send(loop, host, {type: "reviewProfileDraft"});
        assert.equal(last(host).model.draft.reviewed, true);
        await send(loop, host, {type: "applyProfileDraft", confirmChecks: true});
        ({notice} = last(host));
        assert.match(notice, /^Failed \[DEMO_REFUSED\]: Apply needs a keyboard/);
        await send(loop, host, {type: "rebaseProfileDraft"});
        assert.match(last(host).notice, /DEMO_REFUSED/);
        assert.equal(last(host).model.draft.dirty, true, "the draft is kept");

        // Undo and Discard all work on the demo's draft as on a keyboard's.
        await send(loop, host, {type: "discardProfileDraft"});
        ({model} = last(host));
        assert.equal(model.draft.dirty, false);
        await send(loop, host, {type: "undoProfileDraft"});
        assert.equal(last(host).model.draft.dirty, true);
    } finally {
        await loop.close();
    }
});

test("Export saves the demo's draft, edits and all; leaving afterwards asks nothing", async () => {
    const {loop, host} = await unplugged();
    try {
        await loop.handleMessage({type: "openDemo"});
        await send(loop, host, dpiEdit);
        const current = loop.session.draft.current;
        await send(loop, host, {type: "exportPortableProfile"});
        assert.equal(host.exports.length, 1);
        const [file] = host.exports;
        assert.match(file.fileName, /^charybdis-demo-\d{4}-\d\d-\d\d\.charybdis\.json$/);
        assert.equal(fingerprint(JSON.parse(file.text)), current.fingerprint, "the file holds the draft, not the demo profile");
        assert.match(last(host).notice, /Demo setup exported to \/exports\/.+Import it on your keyboard/);
        assert.equal(last(host).model.demo.unsaved, false);

        await loop.handleMessage({type: "leaveDemo"});
        assert.equal(last(host).notice, "Left the demo.");
        assert.equal(last(host).model.demo.active, false);
        assert.equal(last(host).model.demo.offered, true);
        assert.equal(last(host).model.draft, undefined);
        assert.equal(last(host).model.load.state, "unavailable");
    } finally {
        await loop.close();
    }
});

test("leaving or replacing the demo with edits not exported is refused until the panel has asked", async () => {
    const {loop, host} = await unplugged();
    try {
        await loop.handleMessage({type: "openDemo"});
        await send(loop, host, dpiEdit);
        await loop.handleMessage({type: "leaveDemo"});
        assert.match(last(host).notice, /^Failed \[DEMO_UNSAVED\]/);
        assert.equal(last(host).model.demo.active, true);
        host.chosen.push({text: JSON.stringify(pdDocument()), name: "mine.charybdis.json"});
        await loop.handleMessage({type: "openDemoProfile"});
        assert.match(last(host).notice, /DEMO_UNSAVED/);
        assert.equal(host.chosen.length, 1, "the file chooser is not opened for a refused replacement");
        await loop.handleMessage({type: "leaveDemo", discardDemo: true});
        assert.equal(last(host).model.demo.active, false);
    } finally {
        await loop.close();
    }
});

test("Open a profile file replaces the demo profile with the file, checked as Import checks it", async () => {
    const {loop, host} = await unplugged();
    try {
        // Offered before the demo opens too: it opens the demo on the file.
        host.chosen.push({text: JSON.stringify(pdDocument()), name: "mine.charybdis.json"});
        await loop.handleMessage({type: "openDemoProfile"});
        let {model, notice} = last(host);
        assert.equal(notice, "Opened mine.charybdis.json in the demo.");
        assert.equal(model.demo.active, true);
        assert.equal(model.demo.fileName, "mine.charybdis.json");
        assert.equal(model.draft.dirty, false);
        assert.equal(loop.session.draft.current.document.actionAbiDigest, ACTION_ABI, "brought up to current firmware");
        assert.match(model.device.summary, /mine\.charybdis\.json/);

        // A file Import would refuse is refused, and the demo stays as it was.
        const before = loop.session.draft;
        host.chosen.push({text: "{\"format\": \"something-else\"}", name: "bad.json"});
        await loop.handleMessage({type: "openDemoProfile"});
        assert.match(last(host).notice, /^Failed.*supported Charybdis profile/);
        assert.equal(loop.session.draft, before);
        assert.equal(last(host).model.demo.fileName, "mine.charybdis.json");

        // Cancelling the chooser changes nothing.
        await loop.handleMessage({type: "openDemoProfile"});
        assert.equal(loop.session.draft, before);
    } finally {
        await loop.close();
    }
});

test("Import and Rename & Reorder work on the demo's draft as on a keyboard's", async () => {
    const {loop, host} = await unplugged();
    try {
        await loop.handleMessage({type: "openDemo"});
        host.chosen.push({text: JSON.stringify(pdDocument()), name: "other.charybdis.json"});
        await send(loop, host, {type: "choosePortableProfile"});
        let {model} = last(host);
        assert.equal(model.portable.review.fileName, "other.charybdis.json");
        assert.ok(model.portable.review.differences.length > 0);
        await send(loop, host, {type: "restorePortableProfile"});
        ({model} = last(host));
        assert.doesNotMatch(String(last(host).notice), /Failed/);
        assert.equal(model.portable.review, null);
        assert.equal(model.draft.dirty, true, "the import is staged in the demo's draft");
        assert.equal(model.demo.active, true);

        await send(loop, host, {type: "managePortableLayers"});
        const names = [...last(host).model.portable.layers.names];
        names[1] = "Numbers";
        await send(loop, host, {type: "savePortableLayers", names});
        assert.doesNotMatch(String(last(host).notice), /Failed/);
        assert.equal(last(host).model.layers[1].displayName, "Numbers");
    } finally {
        await loop.close();
    }
});

test("reading a keyboard leaves the demo, once the panel has asked about edits not exported", async () => {
    const {loop, host, plugIn} = await unplugged();
    try {
        await loop.handleMessage({type: "openDemo"});
        await send(loop, host, dpiEdit);
        plugIn();
        await loop.handleMessage({type: "refresh"});
        assert.match(last(host).notice, /DEMO_UNSAVED/);
        assert.equal(last(host).model.demo.active, true);

        await loop.handleMessage({type: "refresh", discardDemo: true});
        const {model} = last(host);
        assert.equal(model.demo.active, false);
        assert.equal(model.demo.offered, false, "not over a connected keyboard");
        assert.equal(model.device.connected, true);
        assert.equal(model.load.state, "ready");
        assert.equal(model.draft.dirty, false, "the keyboard's own draft, not the demo's");
        assert.notEqual(loop.session.draft.deviceId, DEMO_DEVICE_ID);

        await loop.handleMessage({type: "openDemo"});
        assert.match(last(host).notice, /^Failed \[DEMO_REFUSED\]: A keyboard is connected/);
    } finally {
        await loop.close();
    }
});
