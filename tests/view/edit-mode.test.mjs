import assert from "node:assert/strict";
import test from "node:test";
import {APPLY, LIVE, LIVE_REVIEW, STOPPED_WORDS, editModeChoices, editsAreLive, liveSaveState, questionWords, switchQuestion} from "../../webview/view/edit-mode.mjs";
import * as controls from "../../webview/view/controls.mjs";

const vocabulary = {editModes: {
    0: {id: "apply", label: "Apply", detail: "a"}, 1: {id: "live", label: "Live", detail: "b"}, 2: {id: "liveReview", label: "Live + review", detail: "c"},
}};
/** @param {object} draft @param {number} mode */
const model = (draft, mode = LIVE_REVIEW, offered = [APPLY, LIVE, LIVE_REVIEW]) => /** @type {any} */ ({vocabulary, editMode: {mode, conflict: false, offered}, draft});

test("the switch offers all three modes, and shows a mode it does not offer only when a keyboard reports it", () => {
    assert.deepEqual(editModeChoices(model({}))?.choices.map(choice => [choice.label, choice.offered]), [["Apply", true], ["Live", true], ["Live + review", true]]);
    assert.deepEqual(editModeChoices(model({}, LIVE, [APPLY, LIVE_REVIEW]))?.choices.map(choice => [choice.label, choice.offered]), [["Apply", true], ["Live + review", true], ["Live", false]]);
    assert.equal(editModeChoices({...model({}), editMode: {mode: LIVE, conflict: false, offered: [APPLY, LIVE, LIVE_REVIEW], notStored: true}})?.notStored, true, "a mode the keyboard has not stored yet is flagged");
    assert.equal(editModeChoices({}), null);
});

test("leaving Live asks nothing (the keyboard saves first); entering it asks as Live + review does", () => {
    assert.equal(switchQuestion(model({live: {unsaved: true}, dirty: true}, LIVE), APPLY), null);
    assert.equal(switchQuestion(model({live: {unsaved: true}, dirty: true}, LIVE), LIVE_REVIEW), null);
    assert.equal(switchQuestion(model({live: {unsaved: true}, dirty: true}, LIVE_REVIEW), LIVE), "saveOrRevert");
    assert.equal(switchQuestion(model({live: null, dirty: true}, APPLY), LIVE), "sendOrDiscard");
    assert.equal(switchQuestion(model({live: {unsaved: true}, dirty: true}, APPLY), LIVE), "saveOrRevert", "an Apply keyboard still running unsaved edits settles them first");
    assert.match(questionWords("saveOrRevert", 1, {mode: LIVE, from: LIVE_REVIEW}).detail, /In Live the keyboard saves edits by itself/);
    assert.match(questionWords("sendOrDiscard", 2, {mode: LIVE}).detail, /saves it by itself a moment later/);
    assert.match(questionWords("sendOrDiscard", 2, {mode: LIVE_REVIEW}).detail, /runs unsaved until you save it/);
});

test("in Live the keyboard's own saving is said from its status; flags show with the one way on", () => {
    const keyboard = {saving: false, autoSaving: false, savedByKeyboard: false, saveFailed: false, storagePaused: false, quietMs: 3000};
    /** @param {object} live */
    const draft = live => /** @type {any} */ ({live: {mode: LIVE, unsaved: false, converged: true, keyboard, ...live}});
    assert.equal(liveSaveState(/** @type {any} */ ({live: null})), null);
    assert.equal(liveSaveState(draft({})), null, "nothing to say");
    assert.deepEqual((({kind, title}) => [kind, title])(/** @type {any} */ (liveSaveState(draft({unsaved: true})))), ["pending", "Not saved yet"]);
    assert.match(/** @type {any} */ (liveSaveState(draft({unsaved: true}))).detail, /after 3 seconds without typing/);
    assert.equal(liveSaveState(draft({unsaved: true, keyboard: {...keyboard, saving: true, storagePaused: true}}))?.detail, "The keyboard writes flash once no key is held.");
    assert.equal(liveSaveState(draft({keyboard: {...keyboard, savedByKeyboard: true}}))?.title, "Saved by the keyboard");
    assert.equal(liveSaveState(draft({unsaved: true, keyboard: {...keyboard, saveFailed: true}}))?.action, "save");
    assert.equal(liveSaveState(draft({unsaved: true, apart: true, keyboard: {...keyboard, saveFailed: true}}))?.action, "revert", "the halves apart come first: Save is refused");
    assert.equal(liveSaveState(draft({keyboard: {...keyboard, adjustmentPending: true}}))?.title, "Keyboard adjustment pending");
    assert.equal(liveSaveState(draft({mode: LIVE_REVIEW, keyboard: {...keyboard, adjustmentPending: true}}))?.kind, "pending");
    // Live + review: the commit bar says "unsaved" itself; only trouble is said here.
    assert.equal(liveSaveState(draft({mode: LIVE_REVIEW, unsaved: true})), null);
    assert.equal(liveSaveState(draft({mode: LIVE_REVIEW, unsaved: true, apart: true}))?.kind, "refused");
});

// Firmware D-F34: a keyboard that stopped saving used to look like "not
// ready" and "the slave half is catching up". Now one state says so, for
// either half, in every live mode, ahead of anything else, with Restart.
test("a keyboard that stopped saving outranks every other state and offers Restart", () => {
    const keyboard = {saving: false, autoSaving: false, savedByKeyboard: false, saveFailed: false, storagePaused: false, stopped: false, peerStopped: false, quietMs: 3000};
    /** @param {object} live */
    const draft = live => /** @type {any} */ ({live: {mode: LIVE_REVIEW, unsaved: true, converged: false, keyboard, ...live}});
    for (const flag of ["stopped", "peerStopped"]) for (const mode of [LIVE, LIVE_REVIEW]) {
        const state = liveSaveState(draft({mode, apart: true, keyboard: {...keyboard, saveFailed: true, saving: true, adjustmentPending: true, [flag]: true}}));
        assert.deepEqual(state, {kind: "stopped", tone: "err", title: STOPPED_WORDS.title, detail: STOPPED_WORDS.detail, action: "restart"});
    }
    assert.equal(STOPPED_WORDS.title, "The keyboard stopped saving");
    assert.match(STOPPED_WORDS.detail, /^Restart it to continue\./);
    assert.notEqual(liveSaveState(draft({keyboard}))?.kind, "stopped", "a keyboard catching up is not stopped");
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
    assert.deepEqual(controls.restartKeyboard(), {type: "restartKeyboard"});
    assert.deepEqual(controls.setEditMode(LIVE_REVIEW), {type: "setEditMode", mode: 2});
    assert.deepEqual(controls.saveDraft(true), {type: "saveProfileDraft", confirmChecks: true});
    assert.deepEqual(controls.revertDraft(), {type: "revertProfileDraft"});
    assert.deepEqual(controls.confirmLiveEdit(4), {type: "confirmLiveEdit", proposal: 4});
    assert.deepEqual(controls.cancelLiveEdit(4), {type: "cancelLiveEdit", proposal: 4});
});

test("unsaved edits ask Save or Revert whichever way the mode goes, and for settling a conflict", () => {
    assert.equal(switchQuestion(model({live: {unsaved: true}}, LIVE_REVIEW), LIVE), "saveOrRevert", "the keyboard refuses any change while unsaved");
    assert.equal(switchQuestion(model({live: {unsaved: true}}, LIVE), LIVE_REVIEW), null, "except from Live, where the keyboard saves first");
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
