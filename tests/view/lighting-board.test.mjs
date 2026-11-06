import assert from "node:assert/strict";
import test from "node:test";
import {createRequire} from "node:module";
import {layerView} from "../../webview/view/layer-view.mjs";
import {lightingBoard} from "../../webview/view/lighting-board.mjs";
import {comboHeld} from "../../webview/view/combo-held.mjs";
import {slotCalled} from "../../webview/view/vocabulary.mjs";

const {profileDocument, publishedModel} = createRequire(import.meta.url)("../fixtures/published-model.js");
const model = publishedModel();
const shows = (view, picked) => lightingBoard(view, {stage: "layers", pointingSlot: 0, comboPreview: null, ...picked});

test("off Pointing modes and Combo feedback the board shows the view as it is, running and holding nothing", () => {
    const view = layerView(model, 0, []);
    const board = shows(view);
    assert.deepEqual([board.shown, board.held, board.pdActive, board.comboActive], [view, null, null, null]);
    assert.equal(board.caption, "Base over the background effect");
});

test("on Pointing modes the board runs the picked mode from its trigger key, and an empty slot runs nothing", () => {
    const view = layerView(model, 0, []);
    const running = (model.pdModes || []).find((slot) => slot.kind);
    const board = shows(view, {stage: "pd", pointingSlot: running.id});
    assert.ok(board.pdActive, "the picked mode runs");
    assert.match(board.caption, new RegExp(`· ${slotCalled(model, running.id)} held, painting `));
    const empty = (model.pdModes || []).find((slot) => !slot.kind);
    assert.equal(shows(view, {stage: "pd", pointingSlot: empty.id}).pdActive, null);
});

test("on Combo feedback the board holds a combo of this view, turning on the layers it holds", () => {
    const view = layerView(model, 0, []);
    const c13 = shows(view, {stage: "combo", comboPreview: {id: 13, keys: []}});
    assert.equal(c13.held?.combo.badge, "C13");
    assert.deepEqual([c13.shown.at, c13.comboActive], [5, null], "C13 holds Function, whose own light shows the hold");
    assert.match(c13.caption, /C13 held, holding .+, whose own light shows the hold/);
    const c3 = shows(view, {stage: "combo", comboPreview: {id: 3, keys: []}});
    assert.deepEqual(c3.comboActive, comboHeld(view, {id: 3, keys: []})?.active);
    assert.match(c3.caption, /· C3 held, painting /);
});

test("a combo running a pointing mode runs it from the combo's keys, its feedback painting beneath", () => {
    const doc = profileDocument({keys: {0: {0: "KC_A", 1: "KC_B"}}, combos: [{inputs: ["KC_A", "KC_B"], output: "PD_MODE_1"}]});
    const published = publishedModel(doc);
    const board = lightingBoard(layerView(published, 0, []), {stage: "combo", pointingSlot: 0, comboPreview: null});
    assert.deepEqual(board.pdActive?.triggerIndex, board.held?.held, "the mode starts from the keys holding the combo");
    assert.equal(board.comboActive?.beneath, true);
    assert.match(board.caption, new RegExp(`C0 held, painting .+ beneath ${slotCalled(published, 1)}, which it runs`));
});

test("a view where no combo fires says so", () => {
    const doc = profileDocument({keys: {0: {0: "KC_A"}}});
    const board = lightingBoard(layerView(publishedModel(doc), 0, []), {stage: "combo", pointingSlot: 0, comboPreview: null});
    assert.equal(board.held, null);
    assert.match(board.caption, /· no combo fires in this view$/);
});
