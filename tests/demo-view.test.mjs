// The demo as the panel reads it (webview/view/demo.mjs): what the model says
// about it, the messages its controls post, and when leaving asks first.
import assert from "node:assert/strict";
import test from "node:test";
import {DEMO_WORDS, demoOf, leaveDemo, leaving, openDemo, openDemoProfile} from "../webview/view/demo.mjs";
import {screenAvailable} from "../webview/view/readiness.mjs";

test("a model without the demo neither has it nor offers it", () => {
    assert.deepEqual(demoOf(undefined), {active: false, offered: false, name: null, fileName: null, unsaved: false, applyNeedsKeyboard: ""});
    assert.equal(demoOf({demo: {offered: true}}).offered, true);
});

test("the demo's controls post these messages", () => {
    assert.deepEqual(openDemo(), {type: "openDemo"});
    assert.deepEqual(openDemoProfile(), {type: "openDemoProfile"});
    assert.deepEqual(leaveDemo(), {type: "leaveDemo"});
    assert.match(DEMO_WORDS.status, /Demo · no keyboard/);
    assert.match(DEMO_WORDS.banner, /No keyboard is connected/);
});

test("leaving the demo asks first only when edits would be lost, and then says so in what it posts", () => {
    const outside = leaving({demo: {active: false}}, {type: "refresh"});
    assert.deepEqual(outside, {ask: null, message: {type: "refresh"}});
    const saved = leaving({demo: {active: true, unsaved: false}, draft: {changes: [{}]}}, leaveDemo());
    assert.deepEqual(saved, {ask: null, message: {type: "leaveDemo"}});

    const unsaved = {demo: {active: true, unsaved: true}, draft: {changes: [{}, {}]}};
    const leave = leaving(unsaved, {type: "chooseKeyboard"});
    assert.deepEqual(leave.message, {type: "chooseKeyboard", discardDemo: true});
    assert.equal(leave.ask.title, "Leave the demo?");
    assert.match(leave.ask.detail, /Your 2 changes in the demo have not been exported/);
    assert.match(leave.ask.detail, /Export saves them/);
    const replace = leaving(unsaved, openDemoProfile());
    assert.equal(replace.ask.title, "Open another profile file?");
    assert.equal(replace.ask.confirm, "Open without exporting");
    assert.deepEqual(replace.message, {type: "openDemoProfile", discardDemo: true});
});

test("the Device screen is open in the demo, where no keyboard is connected", () => {
    const demo = {load: {state: "ready"}, device: {connected: false, demo: true}, portable: {available: true}, demo: {active: true}};
    for (const screen of ["keys", "lighting", "profile", "device"]) assert.equal(screenAvailable(demo, screen), true, screen);
});
