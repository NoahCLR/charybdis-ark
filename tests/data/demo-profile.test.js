"use strict";
// The demo's profile is data the app ships (core/data/demo-profile.charybdis.json),
// an export of a real keyboard, kept exactly as Ark exported it. These hold it
// to what the demo promises: it is a complete profile for current firmware,
// it decodes under the current schema without being upgraded, and it opens a
// draft in which every area can be edited.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {validateSnapshot, fingerprint, summary} = require("../../core/model/portable-profile");
const {ACTION_ABI} = require("../../core/schema/actions");
const {DEMO_CAPABILITIES, DEMO_DEVICE_ID} = require("../../core/session/demo-session");
const {ProfileDraftSession} = require("../../core/session/profile-draft-session");
const {buildPanelModel} = require("../../core/session/panel-session");
const {demoState, openDemo} = require("../../core/session/demo-session");

const FILE = path.join(__dirname, "../../core/data/demo-profile.charybdis.json");
const text = fs.readFileSync(FILE, "utf8");

test("the demo profile is an export, byte for byte as Ark writes one", () => {
    const document = JSON.parse(text);
    assert.equal(text, JSON.stringify(document, null, 2) + "\n");
    assert.deepEqual(Object.keys(document), ["format", "version", "keyboard", "actionAbiDigest", "layers", "profile", "macros"]);
});

test("the demo profile decodes under the current schema, for current firmware, unchanged", () => {
    const document = JSON.parse(text);
    const decoded = validateSnapshot(document, DEMO_CAPABILITIES);
    assert.equal(decoded.document, document, "nothing about it needed upgrading");
    assert.equal(document.version, 3);
    assert.equal(document.keyboard, "charybdis-4x6");
    assert.equal(document.actionAbiDigest, ACTION_ABI, "the 32-slot action vocabulary, 0x837cf479");
    assert.equal(document.layers.length, 16);
    assert.equal(document.macros.length, 128);
    assert.equal(decoded.pdModes.length, 32);
    assert.ok(decoded.profile.length <= DEMO_CAPABILITIES.maxProfilePayload);
    assert.ok(decoded.macros.length <= DEMO_CAPABILITIES.viaMacroBytes);
    assert.deepEqual(decoded.danglingPdBindings, {}, "no key reaches an empty pointing slot");
    assert.equal(summary(document).names.length, 16);
});

test("the demo profile is complete: it opens a draft in which every area can be edited", () => {
    const document = JSON.parse(text);
    const snapshot = {document, fingerprint: fingerprint(document), summary: summary(document)};
    assert.doesNotThrow(() => new ProfileDraftSession(snapshot, DEMO_DEVICE_ID, DEMO_CAPABILITIES));
    const session = {service: {snapshot: () => ({connected: false, devices: []}), portable: null}};
    openDemo(session, {connected: false});
    const model = buildPanelModel(session, demoState());
    assert.equal(model.load.state, "ready");
    assert.equal(model.layers.length, 16);
    for (const area of ["behaviorEditing", "settingsEditing", "macroEditing", "customKeyEditing", "pdModeEditing"]) {
        assert.equal(model[area]?.writable, true, area);
    }
    assert.notEqual(model.comboReadback.writable, false);
    assert.equal(model.portable.available, true);
    assert.equal(model.pdModes.length, 32);
    assert.deepEqual(model.draft.checks.filter((check) => check.level === "blocker"), [], "nothing in it blocks a save");
});
