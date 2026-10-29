// The store keeps the catalog the core posts and lays it back under each
// posted model (webview/catalog.mjs), so every screen reads the model core
// built; a model that comes before the catalog it needs waits for it. Each
// message arrives as a copy, as across the panel's channel.
import assert from "node:assert/strict";
import test from "node:test";
import {createRequire} from "node:module";

globalThis.acquirePanelApi = () => ({postMessage() {}});
const {getModel} = await import("../../webview/store.mjs");
const {createPanelMessages} = await import("../../webview/messages.mjs");
const {withCatalog} = await import("../../webview/catalog.mjs");
const require = createRequire(import.meta.url);
const {postedModel} = require("../../core/session/panel-loop.js");
const {buildPanelModel} = require("../../core/session/panel-session.js");
const {panelCatalog} = require("../../core/model/profile-model.js");
const {PHASE} = require("../../core/model/vocabulary.js");

const built = (theme = "dark") => buildPanelModel({service: {portable: null}, shell: {panel: () => ({theme})}}, {connected: false, devices: [], phase: PHASE.EMPTY});
const copy = (message) => structuredClone(message);

function surface() {
    const renders = [];
    const receive = createPanelMessages({root: {querySelector: () => null}, refreshCommitBar() {}, render: (options) => renders.push(options), receiveMacroValidation() {}});
    return {receive, renders};
}

test("a posted model is the model core built once the catalog is laid back under it", () => {
    const model = built(), posted = postedModel(model);
    assert.equal(withCatalog(posted, null), null, "not without the catalog");
    assert.deepEqual(withCatalog(copy(posted), copy(panelCatalog())), model);
    const whole = copy(model);
    assert.equal(withCatalog(whole, null), whole, "a whole model, as the preview posts it, is taken as it is");
});

test("the store takes a whole model at once, holds a posted one until the catalog comes, then takes each at once", (t) => {
    const previous = globalThis.document;
    globalThis.document = {documentElement: {dataset: {}}};
    t.after(() => { globalThis.document = previous; });
    const {receive, renders} = surface();

    const whole = copy(built("light"));
    receive({type: "model", model: whole});
    assert.equal(getModel(), whole, "with no catalog yet");
    assert.equal(renders.length, 1);

    const early = built("dark");
    receive(copy({type: "model", model: postedModel(early), notice: "Connected."}));
    assert.equal(getModel(), whole, "a model that needs the catalog waits for it");
    assert.equal(renders.length, 1, "and nothing is drawn from it");

    receive(copy({type: "catalog", catalog: panelCatalog()}));
    assert.deepEqual(getModel(), early, "the catalog takes the model that waited");
    assert.equal(globalThis.document.documentElement.dataset.theme, "dark");
    assert.equal(renders.length, 2);

    const next = built("light");
    receive(copy({type: "model", model: postedModel(next)}));
    assert.deepEqual(getModel(), next, "a later model is taken at once");
    assert.equal(getModel().qmkKeycodes.length, panelCatalog().qmkKeycodes.length);
    assert.equal(renders.length, 3);

    receive(copy({type: "catalog", catalog: panelCatalog()}));
    assert.equal(renders.length, 3, "a catalog alone draws nothing");
});
