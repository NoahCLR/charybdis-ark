import assert from "node:assert/strict";
import test from "node:test";
import {APPLY, LIVE, LIVE_REVIEW, editModeChoices, editsAreLive, questionWords, switchQuestion} from "../../webview/view/edit-mode.mjs";
import * as controls from "../../webview/view/controls.mjs";

const vocabulary = {editModes: {
    0: {id: "apply", label: "Apply", detail: "a"}, 1: {id: "live", label: "Live", detail: "b"}, 2: {id: "liveReview", label: "Live + review", detail: "c"},
}};
/** @param {object} draft @param {number} mode */
const model = (draft, mode = LIVE_REVIEW) => /** @type {any} */ ({vocabulary, editMode: {mode, conflict: false, offered: [APPLY, LIVE_REVIEW]}, draft});

test("the switch offers Apply and Live + review, and shows Live only when a keyboard reports it", () => {
    assert.deepEqual(editModeChoices(model({}))?.choices.map(choice => [choice.label, choice.offered]), [["Apply", true], ["Live + review", true]]);
    assert.deepEqual(editModeChoices(model({}, LIVE))?.choices.map(choice => [choice.label, choice.offered]), [["Apply", true], ["Live + review", true], ["Live", false]]);
    assert.equal(editModeChoices({}), null);
});

test("leaving Live + review with unsaved edits asks Save or Revert; entering it with a draft asks Send or Discard", () => {
    assert.equal(switchQuestion(model({live: {unsaved: true}, dirty: true}), APPLY), "saveOrRevert");
    assert.equal(switchQuestion(model({live: {unsaved: false}, dirty: false}), APPLY), null);
    assert.equal(switchQuestion(model({live: null, dirty: true}, APPLY), LIVE_REVIEW), "sendOrDiscard");
    assert.equal(switchQuestion(model({live: null, dirty: false}, APPLY), LIVE_REVIEW), null);
    assert.equal(switchQuestion(model({live: {unsaved: true}}), LIVE_REVIEW), null, "staying in a mode asks nothing");
    assert.equal(editsAreLive(model({live: {unsaved: false}})), true);
    assert.equal(editsAreLive(model({live: null})), false);
});

test("each question's answers post the mode with what happens to the work first", () => {
    const save = questionWords("saveOrRevert", 2);
    assert.match(save.detail, /2 changes that are not saved/);
    assert.match(questionWords("saveOrRevert", 1).detail, /a change that is not saved/);
    assert.deepEqual(save.answers.map(answer => answer.pending), ["revert", "save"]);
    const send = questionWords("sendOrDiscard", 1);
    assert.match(send.detail, /1 change\b/);
    assert.deepEqual(send.answers.map(answer => answer.pending), ["discard", "send"]);
    assert.deepEqual(controls.setEditMode(APPLY, "save"), {type: "setEditMode", mode: 0, pending: "save"});
    assert.deepEqual(controls.setEditMode(LIVE_REVIEW), {type: "setEditMode", mode: 2});
    assert.deepEqual(controls.saveDraft(true), {type: "saveProfileDraft", confirmChecks: true});
    assert.deepEqual(controls.revertDraft(), {type: "revertProfileDraft"});
    assert.deepEqual(controls.confirmLiveEdit(4), {type: "confirmLiveEdit", proposal: 4});
    assert.deepEqual(controls.cancelLiveEdit(4), {type: "cancelLiveEdit", proposal: 4});
});

test("unsaved edits ask Save or Revert whichever way the mode goes, and for settling a conflict", () => {
    assert.equal(switchQuestion(model({live: {unsaved: true}}, LIVE), LIVE_REVIEW), "saveOrRevert", "the keyboard refuses any change while unsaved");
    const conflicted = {...model({live: {unsaved: false}}), editMode: {mode: LIVE_REVIEW, conflict: true, offered: [APPLY, LIVE_REVIEW]}};
    assert.equal(switchQuestion(conflicted, LIVE_REVIEW), null, "settling with nothing unsaved switches at once");
    assert.equal(switchQuestion({...conflicted, draft: {live: {unsaved: true}}}, LIVE_REVIEW), "saveOrRevert");
    assert.match(questionWords("saveOrRevert", 1, {mode: APPLY, from: LIVE_REVIEW}).detail, /In Apply/);
    assert.match(questionWords("saveOrRevert", 1, {mode: LIVE_REVIEW, from: LIVE, label: "Live + review"}).detail, /switches to Live \+ review only with nothing unsaved/);
    assert.match(questionWords("saveOrRevert", 1, {mode: LIVE_REVIEW, from: LIVE_REVIEW}).detail, /settles halves/);
});

test("the question lists the checks Save or Send confirms", () => {
    const checks = /** @type {any[]} */ ([{level: "warning", title: "A key is unreachable", status: "existing"}]);
    const save = questionWords("saveOrRevert", 1, {checks});
    assert.match(save.detail, /Save these edits with this warning\?/);
    assert.equal(save.answers[1].label, "Save anyway");
    assert.deepEqual(save.checks, checks);
    assert.match(questionWords("sendOrDiscard", 1, {checks}).detail, /Send this edit with this warning\?/);
    assert.deepEqual(controls.setEditMode(LIVE_REVIEW, "send", true), {type: "setEditMode", mode: 2, pending: "send", confirmChecks: true});
});
