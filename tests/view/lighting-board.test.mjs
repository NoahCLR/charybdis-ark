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
    assert.equal(feedback.textLocality, "RGB_KEY_HALF", "the demo's locality follows the key");
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
    assert.deepEqual([shows(view, {stage: "pd", replacementRow: "textColor"}).replacementActive, shows(view, {stage: "pd"}).standIn], [null, undefined]);
});

test("each replacement case paints by its own locality (D-L93)", () => {
    const view = layerView({...model, rgb: {...model.rgb, autocorrectFeedback: {...model.rgb.autocorrectFeedback, macroLocality: "RGB_LEFT_HALF", undoLocality: "RGB_KEYS_ONLY"}}}, 0, []);
    const case_ = (/** @type {string} */ row) => shows(view, {stage: "autocorrect", replacementRow: row});
    assert.deepEqual(["textColor", "macroColor", "undoColor"].map((row) => case_(row).replacementActive?.locality), ["RGB_KEY_HALF", "RGB_LEFT_HALF", "RGB_KEYS_ONLY"]);
    assert.equal(case_("macroColor").standIn, undefined, "a half follows no key, so none is ringed");
    assert.match(said(case_("macroColor").caption), /· Replaced by a macro flashing, painting left half$/);
    assert.match(said(case_("undoColor").caption), /painting only the trigger key · Backspace stands in/);
});

// Behaviour feedback (D-L93, firmware D-F73): the board shows the picked
// case from the first key in the view whose behaviour has it, by that
// case's own locality.
test("on Behaviour feedback the board shows the picked case from a key whose behaviour has it, by its own locality", () => {
    const view = layerView(model, 0, []);
    const feedback = model.rgb.keyBehaviorFeedback;
    const hold = shows(view, {stage: "key", feedbackRow: "holdActiveColor"});
    // The demo's first key with a hold on Base is 1, with a long hold and a double tap Escape (0), with a triple tap Left GUI (48).
    assert.deepEqual(hold.behaviourActive, {owner: "KEY_FEEDBACK_GROUP_HOLD_ACTIVE", color: feedback.holdActiveColor, locality: "RGB_KEY_HALF", triggerIndex: 1});
    assert.equal(hold.standIn, 1, "ringed on the board");
    assert.equal(said(hold.caption), "Base over the background effect · Hold active showing, painting the half holding the trigger key · a key with it stands in for the key that shows it");
    assert.deepEqual(["longHoldActiveColor", "branch:0", "branch:1"].map((row) => shows(view, {stage: "key", feedbackRow: row}).standIn), [0, 0, 48]);
    const triple = shows(view, {stage: "key", feedbackRow: "branch:1"});
    assert.deepEqual([triple.behaviourActive?.owner, triple.behaviourActive?.color], ["KEY_FEEDBACK_GROUP_TAP_COUNT_3", feedback.tapBranches[1].color]);
    assert.match(said(triple.caption), /· Triple tap showing, painting /);
    assert.equal(shows(view, {stage: "key"}).behaviourActive?.owner, "KEY_FEEDBACK_GROUP_TAP_COMMITTED", "the first case until one is picked");
    // One case's locality moves it alone.
    const moved = {...model, rgb: {...model.rgb, keyBehaviorFeedback: {...feedback, holdActiveLocality: "RGB_BOTH_HALVES",
        tapBranches: feedback.tapBranches.map((/** @type {any} */ branch, /** @type {number} */ index) => index === 1 ? {...branch, locality: "RGB_KEYS_ONLY"} : branch)}}};
    const both = lightingBoard(layerView(moved, 0, []), {stage: "key", pointingSlot: 0, comboPreview: null, feedbackRow: "holdActiveColor"});
    assert.deepEqual([both.behaviourActive?.locality, both.standIn], ["RGB_BOTH_HALVES", undefined]);
    assert.match(said(both.caption), /· Hold active showing, painting all LEDs$/);
    assert.equal(lightingBoard(layerView(moved, 0, []), {stage: "key", pointingSlot: 0, comboPreview: null, feedbackRow: "branch:1"}).behaviourActive?.locality, "RGB_KEYS_ONLY");
    assert.equal(lightingBoard(layerView(moved, 0, []), {stage: "key", pointingSlot: 0, comboPreview: null, feedbackRow: "tapCommittedColor"}).behaviourActive?.locality, "RGB_KEY_HALF");
    // No key on any layer has a quadruple tap: the keyboard never shows it, and the board says so.
    const bare = publishedModel(profileDocument({keys: {0: {0: "KC_A"}}}));
    bare.rgb.stages = bare.rgb.stages.map((/** @type {any} */ stage) => ({...stage, enabled: true}));
    const none = lightingBoard(layerView(bare, 0, []), {stage: "key", pointingSlot: 0, comboPreview: null, feedbackRow: "branch:2"});
    assert.deepEqual([none.behaviourActive, none.standIn], [null, undefined]);
    assert.match(said(none.caption), /· no key has Quadruple tap, so the keyboard never shows it$/);
    // Off its tab, or with the stage off, it shows nothing.
    assert.equal(shows(view, {stage: "autocorrect", feedbackRow: "holdActiveColor"}).behaviourActive, null);
    const off = {...model, rgb: {...model.rgb, stages: model.rgb.stages.map((/** @type {any} */ stage) => stage.id === "key" ? {...stage, enabled: false} : stage)}};
    const dark = lightingBoard(layerView(off, 0, []), {stage: "key", pointingSlot: 0, comboPreview: null, feedbackRow: "holdActiveColor"});
    assert.deepEqual([dark.behaviourActive, dark.standIn, said(dark.caption)], [null, undefined, "Base over the background effect"]);
});

test("a flash that follows no key rings none, a passthrough case says so, and a stage that is off flashes nothing", () => {
    const withFeedback = (/** @type {object} */ change, /** @type {object} */ rgb = {}) => ({...model, rgb: {...model.rgb, autocorrectFeedback: {...model.rgb.autocorrectFeedback, ...change}, ...rgb}});
    const both = lightingBoard(layerView(withFeedback({textLocality: "RGB_BOTH_HALVES"}), 0, []), {stage: "autocorrect", pointingSlot: 0, comboPreview: null, replacementRow: "textColor"});
    assert.equal(both.standIn, undefined);
    assert.equal(both.replacementActive?.triggerIndex, 49, "the key is still the one that caused it");
    assert.match(said(both.caption), /· Replaced with text flashing, painting all LEDs$/);
    const dark = lightingBoard(layerView(withFeedback({macroColor: {h: "40", s: "0", v: "0"}}), 0, []), {stage: "autocorrect", pointingSlot: 0, comboPreview: null, replacementRow: "macroColor"});
    assert.ok(dark.replacementActive, "its accents in a colour of their own still light");
    assert.match(said(dark.caption), /· Replaced by a macro is passthrough, so it does not flash · Space stands in/);
    const off = lightingBoard(layerView(withFeedback({}, {stages: model.rgb.stages.map((/** @type {any} */ stage) => stage.id === "autocorrect" ? {...stage, enabled: false} : stage)}), 0, []),
        {stage: "autocorrect", pointingSlot: 0, comboPreview: null, replacementRow: "textColor"});
    assert.deepEqual([off.replacementActive, off.standIn], [null, undefined]);
    assert.equal(said(off.caption), "Base over the background effect");
    // A profile with no Space key: the flash paints as the keyboard paints one whose key it cannot tell.
    const bare = publishedModel(profileDocument({keys: {0: {0: "KC_A"}}}));
    bare.rgb.stages = bare.rgb.stages.map((/** @type {any} */ stage) => ({...stage, enabled: true}));
    bare.rgb.autocorrectFeedback = {...model.rgb.autocorrectFeedback, undoLocality: "RGB_KEYS_ONLY"};
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
    placed.rgb.autocorrectFeedback = {...feedback, leadingLocality: "RGB_KEYS_ONLY"};
    const ringed = lightingBoard(layerView(placed, 0, []), {stage: "autocorrect", pointingSlot: 0, comboPreview: null, replacementRow: "leadingColor"});
    assert.deepEqual([ringed.replacementActive?.triggerIndex, ringed.standIn], [30, 30]);
    assert.match(said(ringed.caption), /· Leader waiting held, painting only the trigger key · Leader stands in for the key that began it$/);
    const withFeedback = (/** @type {object} */ change) => ({...model, rgb: {...model.rgb, autocorrectFeedback: {...feedback, ...change}}});
    const left = lightingBoard(layerView(withFeedback({leadingLocality: "RGB_LEFT_HALF"}), 0, []), {stage: "autocorrect", pointingSlot: 0, comboPreview: null, replacementRow: "leadingColor"});
    assert.match(said(left.caption), /· Leader waiting held, painting left half$/);
    const keys = lightingBoard(layerView(withFeedback({leadingLocality: "RGB_KEYS_ONLY"}), 0, []), {stage: "autocorrect", pointingSlot: 0, comboPreview: null, replacementRow: "leadingColor"});
    assert.deepEqual([keys.replacementActive?.triggerIndex, keys.standIn], [undefined, undefined]);
    assert.match(said(keys.caption), /· Leader waiting held, painting only the trigger key · no Leader key to stand in, so it paints as when the keyboard cannot tell the key$/);
    const dark = lightingBoard(layerView(withFeedback({leadingColor: {h: "0", s: "0", v: "0"}}), 0, []), {stage: "autocorrect", pointingSlot: 0, comboPreview: null, replacementRow: "leadingColor"});
    assert.ok(dark.replacementActive, "its accents in a colour of their own still light");
    assert.match(said(dark.caption), /· Leader waiting is passthrough, so it does not light · no Leader key to stand in/);
});

// The stand-in shows the case only where the keyboard would (firmware RGB
// domain, Drawing): a behaviour that runs, a hold that is no layer or
// pointing key, and tap committed on a branch with a tap and no hold, or as
// the pulse of a double tap or more.
test("a behaviour that does not run, a layer or pointing hold, and a tap beside a hold stand in for no case they never show", () => {
    /** @param {(behaviours: any[]) => void} change @param {string} row @param {string} [policy] */
    const standIn = (change, row, policy) => {
        const changed = structuredClone(model);
        change(changed.keyBehaviors);
        if (policy) changed.rgb.keyBehaviorFeedback.tapCommitMode = policy;
        return lightingBoard(layerView(changed, 0, []), {stage: "key", pointingSlot: 0, comboPreview: null, feedbackRow: row}).standIn;
    };
    assert.equal(standIn(() => {}, "holdActiveColor"), 1, "the demo's 1 holds a key");
    assert.equal(standIn((rows) => { rows.find((row) => row.keycode === "KC_1").enabled = false; }, "holdActiveColor"), 2, "1's behaviour is off: the next key with a hold");
    assert.equal(standIn((rows) => { rows.find((row) => row.keycode === "KC_1").steps[0].hold.action = "MO(1)"; }, "holdActiveColor"), 2, "a layer hold shows on the layer stage");
    assert.equal(standIn((rows) => { rows.find((row) => row.keycode === "KC_1").steps[0].hold.action = "PD_MODE_1"; }, "holdActiveColor"), 2, "a pointing hold on the pointing stage");
    assert.equal(standIn((rows) => { for (const row of rows) row.enabled = false; }, "holdActiveColor"), undefined, "with every behaviour off, none");
    // Escape (0) has a double tap with a tap and no hold. With only taps
    // beside holds left, tap committed shows only as the pulse of a double tap
    // or more, under the tap-commit policy.
    assert.equal(standIn(() => {}, "tapCommittedColor"), 0);
    const onlyWithHolds = (/** @type {any[]} */ rows) => {
        for (const row of rows) row.steps = row.steps.filter((/** @type {any} */ step) => !(step.tap && !step.hold));
    };
    assert.equal(standIn(onlyWithHolds, "tapCommittedColor", "KEY_FEEDBACK_TAP_COMMIT_OFF"), undefined, "no pulse with the policy off, and every tap has a hold");
    const pulsing = (/** @type {any[]} */ rows) => {
        onlyWithHolds(rows);
        for (const row of rows) row.steps = row.steps.filter((/** @type {any} */ step) => step.tapCount === 0);
        rows.find((/** @type {any} */ row) => row.keycode === "KC_1").steps.push({tapCount: 1, tap: {action: "KC_1"}, hold: {action: "KC_LCTL"}});
    };
    assert.equal(standIn(pulsing, "tapCommittedColor", "KEY_FEEDBACK_TAP_COMMIT_NON_BASE_TAPS"), 1, "a double tap with a hold beside it pulses under the policy");
    assert.equal(standIn(pulsing, "tapCommittedColor", "KEY_FEEDBACK_TAP_COMMIT_OFF"), undefined, "and not without it");
});

// What the board paints for a behaviour case's accents (D-L93, firmware
// D-F75): every state's, then every tap branch's, then the case's own; a tier
// lights neither a tap branch's nor every tap branch's.
test("a behaviour case lights its own accents and every tap branch's only when it is a tap branch", async () => {
    const {keyLight} = await import("../../webview/view/lighting.mjs");
    const published = structuredClone(model);
    const layer = published.layers[0], position = layer.positions.find((/** @type {any} */ entry) => entry.layoutIndex === 13);
    const led = published.leds.keys[13];
    const colour = (/** @type {number} */ h) => ({h: String(h), s: "255", v: "200"});
    const accent = (/** @type {number} */ index, /** @type {string} */ owner, /** @type {number} */ h) => ({index, owner, color: colour(h), ledIndices: [led], leds: `LED ${led}`});
    const feedback = published.rgb.keyBehaviorFeedback;
    /** @param {string} owner @param {any} color */
    const light = (owner, color) => keyLight(published, layer, position, {behaviourActive: {owner, color, locality: "RGB_KEYS_ONLY", triggerIndex: 0}}).colour;
    published.rgb.keyFeedbackAccents = [accent(0, "KEY_FEEDBACK_GROUP_TAP_COUNT_3", 3), accent(1, "KEY_FEEDBACK_GROUP_TAP_BRANCH_ANY", 7), accent(2, "KEY_FEEDBACK_GROUP_ALL", 9)];
    assert.deepEqual(light("KEY_FEEDBACK_GROUP_TAP_COUNT_3", feedback.tapBranches[1].color), colour(3), "the branch's own over every tap branch's, stored before it");
    assert.deepEqual(light("KEY_FEEDBACK_GROUP_TAP_COUNT_2", feedback.tapBranches[0].color), colour(7), "another branch: every tap branch's over every state's");
    assert.deepEqual(light("KEY_FEEDBACK_GROUP_HOLD_ACTIVE", feedback.holdActiveColor), colour(9), "a tier: every state's alone");
    published.rgb.keyFeedbackAccents = [accent(0, "KEY_FEEDBACK_GROUP_TAP_BRANCH_ANY", 0)];
    published.rgb.keyFeedbackAccents[0].color = {h: "0", s: "0", v: "0"};
    assert.deepEqual(light("KEY_FEEDBACK_GROUP_TAP_COUNT_4", feedback.tapBranches[2].color), feedback.tapBranches[2].color, "black takes the branch's colour");
});
