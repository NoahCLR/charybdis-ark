import assert from "node:assert/strict";
import test from "node:test";
import {createRequire} from "node:module";
import {layerCalled, layerCalledAt, layersOnTop, listed, macroNamed, phraseSentence, phrasesJoined, phrasesListed, said, slotCalled, slotNamed} from "../../webview/view/vocabulary.mjs";
import {layerView} from "../../webview/view/layer-view.mjs";

const require = createRequire(import.meta.url);
const {openDraft, panelModel, profileDocument, publishedModel} = require("../fixtures/published-model.js");

// A layer and a pointing slot are named as core names them, a name a person
// gave or core's words for one without (displayName): the interface makes up
// no name of its own.
test("every layer and pointing slot core publishes is named by core, and the interface reads that name", () => {
    const model = publishedModel(profileDocument({settings: (settings) => { settings.names[1] = ""; settings.names[2] = "Navigation"; }}));
    const {draft, state} = openDraft();
    const shown = panelModel(draft, state);
    for (const published of [model, shown]) {
        assert.ok(published.layers.length, "the model has layers");
        for (const layer of published.layers) {
            assert.ok(layer.displayName, `layer ${layer.index} has a name`);
            assert.equal(layerCalled(layer), layer.displayName);
            assert.equal(layerCalledAt(published, layer.index), layer.displayName);
        }
    }
    assert.deepEqual(model.layers.slice(0, 3).map(layerCalled), ["Base", "Layer 1", "Navigation"], "a layer with no name by core's words for it");
    for (const slot of model.pdModes) assert.equal(slotCalled(model, slot.id), slot.displayName || assert.fail(`slot ${slot.id} has no name`));
    assert.equal(slotCalled(model, 6), "Slot 6", "an empty slot by core's words for it");
    assert.equal(layerCalled(undefined), "");
    // A model built by hand may leave out core's name; the layer or slot then
    // reads by the name it stores, never as nothing.
    assert.equal(layerCalled({name: "Numbers"}), "Numbers");
    assert.equal(layerCalledAt({layers: [{index: 2, name: "Symbols"}]}, 2), "Symbols");
    assert.equal(slotCalled({pdModes: [{id: 3, displayName: "", name: "Zoom"}]}, 3), "Zoom");
    assert.equal(slotNamed({displayName: "Zoom", name: "zoom"}), "Zoom", "core's name first");
    assert.equal(layerCalledAt(model, 99), "", "a layer the model has not is no name");
});

test("names in prose join with and, the last two only", () => {
    assert.deepEqual([[], ["Base"], ["Base", "Numbers"], ["Base", "Numbers", "Symbols"]].map(listed),
        ["", "Base", "Base and Numbers", "Base, Numbers and Symbols"]);
});

test("a macro slot reads by its own name, core's name for it, or its keycode when the keyboard did not report it", () => {
    const [first, second] = publishedModel(profileDocument()).macros;
    assert.equal(macroNamed({...first, name: "Sign-off"}), "Sign-off");
    assert.equal(macroNamed({...second, name: ""}), second.defaultName, "core names one with none");
    assert.match(second.defaultName, /^Macro \d+$/);
    assert.equal(macroNamed(undefined, "MACRO_9"), "MACRO_9");
});

// The layers a board shows are said the same way on Keymap and Lighting: the
// top one, then the ones under it down to the base, which a layer of its own
// still sits on.
test("the layers a view shows read top first, down to the base", () => {
    const model = publishedModel();
    assert.equal(said(layersOnTop(layerView(model, 0, []))), "Base", "the base alone sits on nothing");
    assert.equal(said(layersOnTop(layerView(model, 5, []))), "Function on top of Base");
    assert.equal(said(layersOnTop(layerView(model, 5, [1, 4]))), "Function on top of Pointing, Number and Base");
    // Where a screen marks them, each layer is written its way.
    const marked = {layer: (/** @type {any} */ layer) => `[${layer?.displayName}]`, text: (/** @type {string} */ words) => words};
    assert.equal(said(layersOnTop(layerView(model, 5, [1, 4])), marked), "[Function] on top of [Pointing], [Number] and [Base]");
});

test("a phrase is said with each layer its way and every other word its own", () => {
    const say = {layer: (/** @type {any} */ layer) => `[${layer?.displayName}]`, text: (/** @type {string} */ words) => `«${words}»`};
    const base = {index: 0, displayName: "Base"};
    assert.equal(said(["on ", {layer: base}, " & up"], say), "«on »[Base]« & up»");
    assert.equal(said(["on ", {layer: base}]), "on Base", "plainly by default");
    assert.equal(said([{layer: undefined}]), "", "a layer the board lacks reads as nothing");
    assert.deepEqual(phrasesListed([["a"], ["b"], ["c"]]), ["a", ", ", "b", " and ", "c"]);
    assert.deepEqual(phrasesJoined([["a"], ["b"]], "; "), ["a", "; ", "b"]);
    assert.deepEqual(phraseSentence(["on ", {layer: base}]), ["On ", {layer: base}]);
});
