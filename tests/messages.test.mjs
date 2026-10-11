// The renderer's reply handler (webview/messages.mjs): a progress reply only
// changes the model while it still belongs to the read or draft it came from.
// The branches tested here touch no page, so a stub host is enough.
import assert from "node:assert/strict";
import test from "node:test";

globalThis.acquireVsCodeApi = () => ({postMessage() {}});
const {getModel, setModel} = await import("../webview/store.mjs");
const {createPanelMessages} = await import("../webview/messages.mjs");

function surface() {
    const calls = {refresh: 0, render: 0, validations: []};
    const receive = createPanelMessages({
        root: {querySelector: () => null},
        refreshCommitBar: () => { calls.refresh++; },
        render: () => { calls.render++; },
        receiveMacroValidation: (message) => { calls.validations.push(message); },
    });
    return {receive, calls};
}
const reading = () => ({
    device: {connected: true}, selectedDeviceId: "kb",
    load: {state: "loading", phase: "layout", operationId: 3, operationBusy: true, connectionToken: 1, progress: null},
    draft: {id: "d1", revision: 2, busy: true}, apply: null,
    postApplyRead: {step: "layout", progress: null}, portable: {available: true, busy: false, review: null, layers: null, usage: null},
});
const read = (fields = {}) => ({type: "readProgress", draftId: "d1", draftRevision: 2,
    read: {source: "layout", progress: {done: 4, total: 56}, operationId: 3, phase: "layout", selectedDeviceId: "kb", connectionToken: 1, ...fields}});

test("a read counter of the current read updates its progress without a render", () => {
    const {receive, calls} = surface();
    setModel(reading());
    receive(read());
    assert.deepEqual(getModel().load.progress, {done: 4, total: 56});
    assert.deepEqual(getModel().postApplyRead, {step: "layout", progress: {done: 4, total: 56}});
    assert.equal(calls.refresh, 1);
    assert.equal(calls.render, 0);
});

test("a read counter from another read, keyboard, connection or draft is dropped", () => {
    const {receive, calls} = surface();
    const model = reading();
    setModel(model);
    receive(read({operationId: 2}));
    receive(read({phase: "profile"}));
    receive(read({selectedDeviceId: "other"}));
    receive(read({connectionToken: 2}));
    receive({...read(), draftId: "d0"});
    receive({...read(), draftRevision: 1});
    assert.equal(getModel(), model);
    assert.equal(calls.refresh, 0);
    setModel({...model, load: {...model.load, operationBusy: false}});
    receive(read());
    assert.equal(getModel().load.progress, null, "nothing is reading");
});

test("an Apply's progress is kept only for the busy draft it belongs to, never going back", () => {
    const {receive, calls} = surface();
    setModel(reading());
    const apply = (id, fields = {}) => ({type: "applyProgress", draftId: "d1", draftRevision: 2, apply: {id, state: "applying"}, ...fields});
    receive(apply(5));
    assert.equal(getModel().apply.id, 5);
    receive(apply(4));
    receive(apply(6, {draftId: "d0"}));
    receive(apply(6, {draftRevision: 3}));
    assert.equal(getModel().apply.id, 5);
    assert.equal(calls.refresh, 1);
    assert.equal(calls.render, 0);
});

test("a macro inspection goes to its editor, and an unknown reply changes nothing", () => {
    const {receive, calls} = surface();
    const model = reading();
    setModel(model);
    const validation = {type: "macroValidation", keycode: "VIA_MACRO_0", payload: "hi", requestId: 7, validation: {error: "", code: ""}};
    receive(validation);
    assert.deepEqual(calls.validations, [validation]);
    receive({type: "somethingElse"});
    receive(null);
    assert.equal(getModel(), model);
    assert.deepEqual([calls.refresh, calls.render], [0, 0]);
});
