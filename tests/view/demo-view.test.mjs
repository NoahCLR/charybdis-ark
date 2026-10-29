// The demo as the panel reads it (webview/view/demo.mjs): what the model says
// about it, the messages its controls post, and when leaving asks first.
import assert from "node:assert/strict";
import test from "node:test";
import {DEMO_WORDS, demoOf, leaveDemo, leaving, openDemo, openDemoProfile} from "../../webview/view/demo.mjs";
import {screenAvailable} from "../../webview/view/screens.mjs";
import {setKey} from "../../webview/view/edits.mjs";
import {createRequire} from "node:module";

const require = createRequire(import.meta.url);
const {buildPanelModel} = require("../../core/session/panel-session");
const demoSession = require("../../core/session/demo-session");
const {panelModel} = require("../fixtures/published-model");

const SETTINGS_EDIT = {type: "updateConfigDefaults", sectionId: "normalPointerSpeed", fields: [{macro: "normalDpi", value: "1400"}, {macro: "snipingDpi", value: "200"}]};

// The panel's model in the demo as core publishes it, with `edits` staged in
// its draft and, if `exported`, the result exported.
/** @param {object[]} [edits] @param {boolean} [exported] */
function inDemo(edits = [], exported = false) {
    /** @type {any} */
    const session = {service: {portable: null, snapshot: () => ({connected: false, busy: false, devices: []})}};
    demoSession.openDemo(session, session.service.snapshot());
    for (const edit of edits) session.draft.stage({...edit, draftId: session.draft.id, draftRevision: session.draft.revision});
    if (exported) session.demo.exported = session.draft.current.fingerprint;
    return /** @type {any} */ (buildPanelModel(session, demoSession.panelState(session)));
}

test("a model without the demo neither has it nor offers it", () => {
    assert.deepEqual(demoOf(undefined), {active: false, offered: false, name: null, fileName: null, unsaved: false, applyNeedsKeyboard: ""});
    assert.equal(demoOf(panelModel(undefined, {connected: false, busy: false, devices: [], phase: "empty"})).offered, true, "offered with no keyboard");
});

test("the demo's controls post these messages", () => {
    assert.deepEqual(openDemo(), {type: "openDemo"});
    assert.deepEqual(openDemoProfile(), {type: "openDemoProfile"});
    assert.deepEqual(leaveDemo(), {type: "leaveDemo"});
    assert.match(DEMO_WORDS.status, /Demo · no keyboard/);
    assert.match(DEMO_WORDS.banner, /No keyboard is connected/);
});

test("leaving the demo asks first only when edits would be lost, and then says so in what it posts", () => {
    const outside = leaving(panelModel(undefined, {connected: false, busy: false, devices: [], phase: "empty"}), {type: "refresh"});
    assert.deepEqual(outside, {ask: null, message: {type: "refresh"}});
    const saved = leaving(inDemo([SETTINGS_EDIT], true), leaveDemo());
    assert.deepEqual(saved, {ask: null, message: {type: "leaveDemo"}});

    const unsaved = inDemo([SETTINGS_EDIT, setKey("Layer 0", 0, "KC_Q")]);
    assert.equal(unsaved.draft.changes.length, 2);
    const leave = leaving(unsaved, {type: "chooseKeyboard"});
    assert.deepEqual(leave.message, {type: "chooseKeyboard", discardDemo: true});
    assert.equal(leave.ask.title, "Leave the demo?");
    assert.match(leave.ask.detail, /Your 2 changes in the demo have not been exported/);
    assert.match(leave.ask.detail, /Export profile keeps them as a backup/);
    const replace = leaving(unsaved, openDemoProfile());
    assert.equal(replace.ask.title, "Open another backup?");
    assert.equal(replace.ask.confirm, "Open without exporting");
    assert.deepEqual(replace.message, {type: "openDemoProfile", discardDemo: true});
});

test("the Device screen is open in the demo, where no keyboard is connected", () => {
    const demo = inDemo();
    assert.equal(demo.device.connected, false);
    for (const screen of ["keys", "lighting", "profile", "device"]) assert.equal(screenAvailable(demo, screen), true, screen);
});
