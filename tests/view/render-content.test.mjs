import test from "node:test";
import assert from "node:assert/strict";
import {sameEditorContent} from "../../webview/view/render-content.mjs";

test("only explicitly transient read status can keep an editor", () => {
    const before = {load: {state: "ready", phase: "read-layout", operationId: 1}, device: {connected: true, health: {busy: true}},
        draft: {id: "draft", revision: 3, busy: true}, vocabulary: {host: "macos"}, layers: [], diagnostics: [],
        portable: {busy: true}, shell: {theme: "dark"}};
    const next = structuredClone(before);
    Object.assign(next, {diagnostics: ["New read"], apply: {id: 1}, postApplyRead: {step: "profile"}});
    Object.assign(next.load, {phase: "read-profile", operationId: 2, progress: {done: 25, total: 100}});
    next.device.health.phase = "read-profile";
    next.portable.progress = "Reading macros";
    next.shell.progress = "Reading";
    assert.equal(sameEditorContent(before, next), true);
    for (const [field, value] of Object.entries({...before, futureModelField: 1})) {
        if (["diagnostics", "load"].includes(field)) continue;
        assert.equal(sameEditorContent(before, {...before, [field]: value === 1 ? 2 : null}), false, field);
    }
    for (const mutate of [m => {m.draft.busy = false;}, m => {m.vocabulary.host = "windows";},
        m => {m.device.connected = false;}, m => {m.device.health.error = "Disconnected";},
        m => {m.load.state = "unavailable";}, m => {m.load.futureField = "Changed";}, m => {m.load.connectionToken = 2;}, m => {m.portable.busy = false;}, m => {m.shell.theme = "light";}]) {
        const changed = structuredClone(before); mutate(changed);
        assert.equal(sameEditorContent(before, changed), false);
    }
    assert.equal(sameEditorContent(null, before), false);
});

// The cases a publish brings, on the model core publishes for the demo's
// draft, as the panel receives it: a copy of the posted model laid over a
// copy of the catalog (webview/catalog.mjs).
test("a model posted again, or laid over the catalog posted again, keeps the editor; a draft's change does not", async () => {
    const {createRequire} = await import("node:module");
    const require = createRequire(import.meta.url);
    const {openDraft, panelModel} = require("../fixtures/published-model.js");
    const {postedModel} = require("../../core/session/panel-loop.js");
    const {panelCatalog} = require("../../core/model/profile-model.js");
    const {withCatalog} = await import("../../webview/catalog.mjs");
    const catalog = structuredClone(panelCatalog());
    const {draft, state} = openDraft();
    const received = (under = catalog) => withCatalog(structuredClone(postedModel(panelModel(draft, state))), under);
    const before = received();

    assert.equal(sameEditorContent(before, received()), true, "the same draft posted again");
    assert.equal(sameEditorContent(before, received(structuredClone(panelCatalog()))), true, "over the catalog posted again");
    const status = received();
    Object.assign(status, {diagnostics: ["Connected"], apply: {id: 4}, postApplyRead: {step: "profile"}});
    status.load = {...status.load, phase: "read-profile", operationId: 9, operationBusy: true};
    status.device = {...status.device, health: {...status.device?.health, phase: "read-profile"}};
    assert.equal(sameEditorContent(before, status), true, "status only");
    const progress = received();
    progress.load = {...progress.load, progress: {done: 3, total: 9}};
    progress.shell = {...progress.shell, progress: "Reading"};
    progress.portable = {...progress.portable, progress: "Reading macros"};
    assert.equal(sameEditorContent(before, progress), true, "progress only");

    draft.stage({type: "updateMacro", keycode: "MACRO_0", payload: "777", name: "Greeting", draftId: draft.id, draftRevision: draft.revision});
    assert.equal(sameEditorContent(before, received()), false, "the draft changed");
});

// The same content is what JSON would write the same, compared in place.
test("content is compared as JSON writes it, a record's order included", () => {
    const model = {load: {state: "ready"}, macros: [{name: "A", note: undefined}], records: {a: 1, b: 2}, count: NaN};
    assert.equal(sameEditorContent(model, {...model, macros: [{name: "A"}]}), true, "a field left undefined is one left out");
    assert.equal(sameEditorContent(model, {...model, count: null}), true, "a number JSON cannot write is null");
    assert.equal(sameEditorContent(model, {...model, records: {b: 2, a: 1}}), false, "a record is drawn in its order");
    assert.equal(sameEditorContent(model, {...model, macros: [{name: "A"}, null]}), false);
    assert.equal(sameEditorContent(model, {...model, macros: {0: {name: "A"}}}), false, "an array is not a record");
    assert.equal(sameEditorContent(model, {...model, records: {a: 1, b: "2"}}), false);
    assert.equal(sameEditorContent(model, {...model, records: {a: 1}}), false);
    assert.equal(sameEditorContent(model, {...model, records: {a: 1, b: 2, c: undefined}}), true);
});
