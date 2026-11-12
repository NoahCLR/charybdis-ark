import assert from "node:assert/strict";
import test from "node:test";
import {createRequire} from "node:module";
import {layerView} from "../../webview/view/layer-view.mjs";
import {lightingBoard} from "../../webview/view/lighting-board.mjs";
import {comboHeld} from "../../webview/view/combo-held.mjs";
import {said, slotCalled} from "../../webview/view/vocabulary.mjs";

const {profileDocument, publishedModel} = createRequire(import.meta.url)("../fixtures/published-model.js");
const model = publishedModel();
const shows = (view, picked) => lightingBoard(view, {stage: "layers", pointingSlot: 0, comboPreview: null, ...picked});

test("off Pointing modes and Combo feedback the board shows the view as it is, running and holding nothing", () => {
    const view = layerView(model, 0, []);
    const board = shows(view);
    assert.deepEqual([board.shown, board.held, board.pdActive, board.comboActive], [view, null, null, null]);
    assert.equal(said(board.caption), "Base over the background effect");
    // A layer above the base is said as the Keymap's preview says it, base included.
    assert.equal(said(shows(layerView(model, 5, [])).caption), "Function on top of Base, over the background effect");
    assert.equal(said(shows(layerView(model, 5, [1, 4])).caption), "Function on top of Pointing, Number and Base, over the background effect");
});

test("on Pointing modes the board runs the picked mode from its trigger key, and an empty slot runs nothing", () => {
    const view = layerView(model, 0, []);
    const running = (model.pdModes || []).find((slot) => slot.kind);
    const board = shows(view, {stage: "pd", pointingSlot: running.id});
    assert.ok(board.pdActive, "the picked mode runs");
    assert.match(said(board.caption), new RegExp(`· ${slotCalled(model, running.id)} held, painting `));
    const empty = (model.pdModes || []).find((slot) => !slot.kind);
    assert.equal(shows(view, {stage: "pd", pointingSlot: empty.id}).pdActive, null);
});

test("on Combo feedback the board holds a combo of this view, turning on the layers it holds", () => {
    const view = layerView(model, 0, []);
    const c13 = shows(view, {stage: "combo", comboPreview: {id: 13, keys: []}});
    assert.equal(c13.held?.combo.badge, "C13");
    assert.deepEqual([c13.shown.at, c13.comboActive], [5, null], "C13 holds Function, whose own light shows the hold");
    assert.match(said(c13.caption), /C13 held, holding .+, whose own light shows the hold/);
    // Its layers stay layers, for the screen to mark.
    const say = {layer: (/** @type {any} */ layer) => `[${layer?.displayName}]`, text: (/** @type {string} */ words) => words};
    assert.equal(said(c13.caption, say), "[Function] on top of [Base], over the background effect · C13 held, holding [Function], whose own light shows the hold"
        + " · click a ringed key to hold it from that key");
    const c3 = shows(view, {stage: "combo", comboPreview: {id: 3, keys: []}});
    assert.deepEqual(c3.comboActive, comboHeld(view, {id: 3, keys: []})?.active);
    assert.match(said(c3.caption), /· C3 held, painting /);
});

test("a combo running a pointing mode runs it from the combo's keys, its feedback painting beneath", () => {
    const doc = profileDocument({keys: {0: {0: "KC_A", 1: "KC_B"}}, combos: [{inputs: ["KC_A", "KC_B"], output: "PD_MODE_1"}]});
    const published = publishedModel(doc);
    const board = lightingBoard(layerView(published, 0, []), {stage: "combo", pointingSlot: 0, comboPreview: null});
    assert.deepEqual(board.pdActive?.triggerIndex, board.held?.held, "the mode starts from the keys holding the combo");
    assert.equal(board.comboActive?.beneath, true);
    assert.match(said(board.caption), new RegExp(`C0 held, painting .+ beneath ${slotCalled(published, 1)}, which it runs`));
});

test("a view where no combo fires says so", () => {
    const doc = profileDocument({keys: {0: {0: "KC_A"}}});
    const board = lightingBoard(layerView(publishedModel(doc), 0, []), {stage: "combo", pointingSlot: 0, comboPreview: null});
    assert.equal(board.held, null);
    assert.match(said(board.caption), /· no combo fires in this view$/);
});

test("on Replacement feedback the board flashes the picked case from the key standing in for the one that caused it", () => {
    const view = layerView(model, 0, []);
    const feedback = model.rgb.autocorrectFeedback;
    assert.equal(feedback.locality, "RGB_KEY_HALF", "the demo's locality follows the key");
    const text = shows(view, {stage: "autocorrect", replacementRow: "textColor"});
    // The demo's Space is key 49 and its first Backspace key 54.
    assert.deepEqual(text.replacementActive, {owner: "AUTOCORRECT_FEEDBACK_GROUP_TEXT", color: feedback.textColor, locality: "RGB_KEY_HALF", triggerIndex: 49});
    assert.equal(text.standIn, 49, "ringed on the board");
    assert.deepEqual([text.shown, text.held, text.pdActive, text.comboActive], [view, null, null, null]);
    assert.equal(said(text.caption), "Base over the background effect · Replaced with text flashing, painting the half holding the trigger key · Space stands in for the key that ended the word");
    const macro = shows(view, {stage: "autocorrect", replacementRow: "macroColor"});
    assert.deepEqual([macro.replacementActive?.owner, macro.replacementActive?.color, macro.standIn], ["AUTOCORRECT_FEEDBACK_GROUP_MACRO", feedback.macroColor, 49]);
    const undo = shows(view, {stage: "autocorrect", replacementRow: "undoColor"});
    assert.deepEqual([undo.replacementActive?.owner, undo.replacementActive?.color, undo.standIn], ["AUTOCORRECT_FEEDBACK_GROUP_UNDO", feedback.undoColor, 54]);
    assert.match(said(undo.caption), /· Replacement undone flashing, painting the half holding the trigger key · Backspace stands in for the key that undid it$/);
    assert.equal(shows(view, {stage: "autocorrect"}).replacementActive?.owner, "AUTOCORRECT_FEEDBACK_GROUP_TEXT", "the first case until one is picked");
    // Off its tab, no flash shows.
    assert.deepEqual([shows(view, {stage: "key", replacementRow: "textColor"}).replacementActive, shows(view, {stage: "key"}).standIn], [null, undefined]);
});

test("a flash that follows no key rings none, a case that is off says so, and a stage that is off flashes nothing", () => {
    const withFeedback = (/** @type {object} */ change, /** @type {object} */ rgb = {}) => ({...model, rgb: {...model.rgb, autocorrectFeedback: {...model.rgb.autocorrectFeedback, ...change}, ...rgb}});
    const both = lightingBoard(layerView(withFeedback({locality: "RGB_BOTH_HALVES"}), 0, []), {stage: "autocorrect", pointingSlot: 0, comboPreview: null, replacementRow: "textColor"});
    assert.equal(both.standIn, undefined);
    assert.equal(both.replacementActive?.triggerIndex, 49, "the key is still the one that caused it");
    assert.match(said(both.caption), /· Replaced with text flashing, painting both halves$/);
    const dark = lightingBoard(layerView(withFeedback({macroColor: {h: "40", s: "0", v: "0"}}), 0, []), {stage: "autocorrect", pointingSlot: 0, comboPreview: null, replacementRow: "macroColor"});
    assert.ok(dark.replacementActive, "its accents in a colour of their own still light");
    assert.match(said(dark.caption), /· Replaced by a macro is off, so it does not flash · Space stands in/);
    const off = lightingBoard(layerView(withFeedback({}, {stages: model.rgb.stages.map((/** @type {any} */ stage) => stage.id === "autocorrect" ? {...stage, enabled: false} : stage)}), 0, []),
        {stage: "autocorrect", pointingSlot: 0, comboPreview: null, replacementRow: "textColor"});
    assert.deepEqual([off.replacementActive, off.standIn], [null, undefined]);
    assert.equal(said(off.caption), "Base over the background effect");
    // A profile with no Space key: the flash paints as the keyboard paints one whose key it cannot tell.
    const bare = publishedModel(profileDocument({keys: {0: {0: "KC_A"}}}));
    bare.rgb.stages = bare.rgb.stages.map((/** @type {any} */ stage) => ({...stage, enabled: true}));
    bare.rgb.autocorrectFeedback = {...model.rgb.autocorrectFeedback, locality: "RGB_KEYS_ONLY"};
    const none = lightingBoard(layerView(bare, 0, []), {stage: "autocorrect", pointingSlot: 0, comboPreview: null, replacementRow: "undoColor"});
    assert.deepEqual([none.replacementActive?.triggerIndex, none.standIn], [undefined, undefined]);
    assert.match(said(none.caption), /painting only the trigger key · no Backspace key to stand in, so it paints as when the keyboard cannot tell the key$/);
});

// Leader waiting (D-L92, firmware D-F72) follows the Leader key that began
// it: the first key that sends Leader stands in and is ringed, and with none
// it paints as the keyboard paints a case whose key it cannot tell.
test("Leader waiting holds from the Leader key standing in, or as from no key when none sends Leader, and says so", () => {
    const view = layerView(model, 0, []);
    const feedback = model.rgb.autocorrectFeedback;
    assert.deepEqual(feedback.leadingColor, {h: "170", s: "255", v: "200"}, "the compiled blue");
    const leading = shows(view, {stage: "autocorrect", replacementRow: "leadingColor"});
    assert.deepEqual(leading.replacementActive, {owner: "AUTOCORRECT_FEEDBACK_GROUP_LEADING", color: feedback.leadingColor, locality: "RGB_KEY_HALF", triggerIndex: undefined});
    assert.equal(leading.standIn, undefined, "no key is ringed");
    assert.equal(said(leading.caption), "Base over the background effect · Leader waiting held, painting the half holding the trigger key · no Leader key to stand in, so it paints as when the keyboard cannot tell the key");
    const placed = publishedModel(profileDocument({keys: {0: {0: "KC_A", 30: "QK_LEADER"}}}));
    placed.rgb.stages = placed.rgb.stages.map((/** @type {any} */ stage) => ({...stage, enabled: true}));
    placed.rgb.autocorrectFeedback = {...feedback, locality: "RGB_KEYS_ONLY"};
    const ringed = lightingBoard(layerView(placed, 0, []), {stage: "autocorrect", pointingSlot: 0, comboPreview: null, replacementRow: "leadingColor"});
    assert.deepEqual([ringed.replacementActive?.triggerIndex, ringed.standIn], [30, 30]);
    assert.match(said(ringed.caption), /· Leader waiting held, painting only the trigger key · Leader stands in for the key that began it$/);
    const withFeedback = (/** @type {object} */ change) => ({...model, rgb: {...model.rgb, autocorrectFeedback: {...feedback, ...change}}});
    const left = lightingBoard(layerView(withFeedback({locality: "RGB_LEFT_HALF"}), 0, []), {stage: "autocorrect", pointingSlot: 0, comboPreview: null, replacementRow: "leadingColor"});
    assert.match(said(left.caption), /· Leader waiting held, painting left half$/);
    const keys = lightingBoard(layerView(withFeedback({locality: "RGB_KEYS_ONLY"}), 0, []), {stage: "autocorrect", pointingSlot: 0, comboPreview: null, replacementRow: "leadingColor"});
    assert.deepEqual([keys.replacementActive?.triggerIndex, keys.standIn], [undefined, undefined]);
    assert.match(said(keys.caption), /· Leader waiting held, painting only the trigger key · no Leader key to stand in, so it paints as when the keyboard cannot tell the key$/);
    const dark = lightingBoard(layerView(withFeedback({leadingColor: {h: "0", s: "0", v: "0"}}), 0, []), {stage: "autocorrect", pointingSlot: 0, comboPreview: null, replacementRow: "leadingColor"});
    assert.ok(dark.replacementActive, "its accents in a colour of their own still light");
    assert.match(said(dark.caption), /· Leader waiting is off, so it does not light · no Leader key to stand in/);
});
