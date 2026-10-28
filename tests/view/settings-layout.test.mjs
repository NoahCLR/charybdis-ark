// The Settings screens' layout (view/settings-layout.mjs): which sections
// each draws, in what order, and which screen a section is edited on.
import assert from "node:assert/strict";
import test from "node:test";
import {createRequire} from "node:module";
import {SETTINGS_SCREENS, fieldParts, screenOfSection, sectionPath, sectionsOn} from "../../webview/view/settings-layout.mjs";

const require = createRequire(import.meta.url);
const portable = require("../../core/model/portable-profile");
const {buildSnapshotModel} = require("../../core/session/device-model");
const {DEMO_CAPABILITIES, DEMO_LIMITS, DEMO_OPTIONS} = require("../../core/session/demo-session");
const {document} = require("../fixtures/pd-profile");
const doc = document();
const snapshot = {document: doc, fingerprint: portable.fingerprint(doc), summary: portable.summary(doc), limits: DEMO_LIMITS, options: DEMO_OPTIONS};
const model = buildSnapshotModel(snapshot, DEMO_CAPABILITIES, {editable: true, reason: null});
const sections = model.configDefaults;
const byId = (id) => sections.find((section) => section.id === id);
const ids = (screen) => sectionsOn(sections, screen).map((section) => section.id);

test("each Settings screen draws its sections in the order a person reads them", () => {
    assert.deepEqual(Object.keys(SETTINGS_SCREENS), ["behaviours", "combos", "pointer", "host"]);
    assert.deepEqual(ids("behaviours"), ["keyTiming", "behaviorSettings"], "Tap & hold timing, then where behaviours run");
    assert.deepEqual(ids("combos"), ["comboSettings", "comboReferences"], "Combos, then Combo layer matching");
    assert.deepEqual(ids("pointer"), ["normalPointerSpeed", "sniping", "autoMouse"], "everything Mouse had");
    assert.deepEqual(ids("host"), ["host", "keyboardOptions"], "Your computer, then Key swaps & typing");
    assert.deepEqual(sectionsOn(sections, "keys"), [], "a screen that is not a Settings one draws none");
});

test("every section the keyboard's model files under Settings or Mouse is on one Settings screen, except Default layers", () => {
    const drawn = Object.keys(SETTINGS_SCREENS).flatMap(ids);
    assert.equal(new Set(drawn).size, drawn.length, "no section is drawn twice");
    const filed = sections.filter((section) => section.area === "Settings" || section.area === "Mouse").map((section) => section.id);
    assert.deepEqual(filed.filter((id) => !drawn.includes(id)), ["startupLayers"], "moving the base layer stands in for a Default layers editor");
    assert.ok(byId("startupLayers"), "the stored value is still published, for the review and checks");
    assert.ok(!drawn.some((id) => byId(id).area === "Lighting"), "lighting is set on Lighting");
});

test("a section is edited on the screen that draws it", () => {
    assert.equal(screenOfSection("keyTiming"), "behaviours");
    assert.equal(screenOfSection("comboReferences"), "combos");
    assert.equal(screenOfSection("autoMouse"), "pointer");
    assert.equal(screenOfSection("keyboardOptions"), "host");
    assert.equal(screenOfSection("startupLayers"), null, "Default layers has no editor");
    assert.equal(screenOfSection("lightingPower"), null, "Lighting draws its own");
    assert.equal(screenOfSection(undefined), null);
});

test("Key swaps & typing lists its fields under what they change", () => {
    assert.deepEqual(fieldParts(byId("keyboardOptions").fields).map(({part, fields}) => [part, fields.length]), [["Modifiers", 7], ["Keys", 3], ["Typing", 3]]);
    assert.deepEqual(fieldParts(byId("keyTiming").fields).map(({part}) => part), [""], "a section without parts is one");
});

// The behaviour editor's timing note names where the defaults are edited,
// from the rail's group, the screen's label and the section's.
test("a section's path is the rail's group, its screen and its label", () => {
    assert.equal(sectionPath(sections, "keyTiming"), "Settings · Behaviours · Tap & hold timing");
    assert.equal(sectionPath(sections, "comboReferences"), "Settings · Combos · Combo layer matching");
    assert.equal(sectionPath(undefined, "keyTiming"), "Settings · Behaviours", "a section the model has not published is left out");
});
