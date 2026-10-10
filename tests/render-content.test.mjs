import test from "node:test";
import assert from "node:assert/strict";
import {sameEditorContent} from "../webview/view/render-content.mjs";

test("only explicitly transient read status can keep an editor", () => {
    const before = {load: {state: "ready", phase: "reading layout", operationId: 1}, device: {connected: true, health: {busy: true}},
        draft: {id: "draft", revision: 3, busy: true}, vocabulary: {host: "macos"}, layers: [], diagnostics: [],
        portable: {busy: true}, host: {theme: "dark"}};
    const next = structuredClone(before);
    Object.assign(next, {diagnostics: ["New read"], apply: {id: 1}, postApplyRead: {step: "profile"}});
    Object.assign(next.load, {phase: "reading profile", operationId: 2, progress: {done: 25, total: 100}});
    next.device.health.phase = "reading profile";
    next.portable.progress = "Reading macros";
    next.host.progress = "Reading";
    assert.equal(sameEditorContent(before, next), true);
    for (const [field, value] of Object.entries({...before, futureModelField: 1})) {
        if (["diagnostics", "load"].includes(field)) continue;
        assert.equal(sameEditorContent(before, {...before, [field]: value === 1 ? 2 : null}), false, field);
    }
    for (const mutate of [m => {m.draft.busy = false;}, m => {m.vocabulary.host = "windows";},
        m => {m.device.connected = false;}, m => {m.device.health.error = "Disconnected";},
        m => {m.load.state = "unavailable";}, m => {m.load.futureField = "Changed";}, m => {m.load.connectionToken = 2;}, m => {m.portable.busy = false;}, m => {m.host.theme = "light";}]) {
        const changed = structuredClone(before); mutate(changed);
        assert.equal(sameEditorContent(before, changed), false);
    }
    assert.equal(sameEditorContent(null, before), false);
});
