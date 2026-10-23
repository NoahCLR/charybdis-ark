import assert from "node:assert/strict";
import test from "node:test";
import {APPLY, LIVE, LIVE_REVIEW, STOPPED_WORDS, editModeChoices, editsAreLive, liveSaveState, questionWords, quietWords, railSaveLine, railSaveLines, switchQuestion} from "../../webview/view/edit-mode.mjs";
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
    const keyboard = {saving: false, autoSaving: false, savedByKeyboard: false, saveFailed: false, storagePaused: false, quietMs: 3000, quietWords: "3 seconds"};
    /** @param {object} live */
    const draft = live => /** @type {any} */ ({live: {mode: LIVE, unsaved: false, converged: true, keyboard, ...live}});
    assert.equal(liveSaveState(/** @type {any} */ ({live: null})), null);
    assert.equal(liveSaveState(draft({})), null, "nothing to say");
    assert.deepEqual((({kind, title}) => [kind, title])(/** @type {any} */ (liveSaveState(draft({unsaved: true})))), ["pending", "Not saved yet"]);
    assert.match(/** @type {any} */ (liveSaveState(draft({unsaved: true}))).detail, /after 3 seconds without typing/);
    assert.match(/** @type {any} */ (liveSaveState(draft({unsaved: true, keyboard: {...keyboard, quietMs: 5000, quietWords: "5 seconds"}}))).detail, /after 5 seconds without typing/);
    assert.equal(quietWords(null), "a few seconds", "no keyboard to say");
    assert.equal(liveSaveState(draft({unsaved: true, keyboard: {...keyboard, saving: true, storagePaused: true}}))?.detail, "The keyboard writes flash once no key is held.");
    assert.equal(liveSaveState(draft({keyboard: {...keyboard, savedByKeyboard: true}}))?.title, "Saved by the keyboard");
    assert.equal(liveSaveState(draft({unsaved: true, keyboard: {...keyboard, saveFailed: true}}))?.action, "save");
    assert.equal(liveSaveState(draft({unsaved: true, apart: true, keyboard: {...keyboard, saveFailed: true}}))?.action, "revert", "the halves apart come first: Save is refused");
    assert.equal(liveSaveState(draft({keyboard: {...keyboard, adjustmentPending: true}}))?.title, "Keyboard adjustment pending");
    assert.equal(liveSaveState(draft({mode: LIVE_REVIEW, keyboard: {...keyboard, adjustmentPending: true}}))?.kind, "adjustment");
    // Live + review: the commit bar says "unsaved" itself; only trouble is said here.
    assert.equal(liveSaveState(draft({mode: LIVE_REVIEW, unsaved: true})), null);
    assert.equal(liveSaveState(draft({mode: LIVE_REVIEW, unsaved: true, apart: true}))?.kind, "refused");
});

// A DPI or lighting key change still reaching both halves is the keyboard's
// own: never "not saved yet", and said under an Apply draft too.
test("a pending keyboard adjustment is said as itself in every edit mode", () => {
    const keyboard = {saving: false, autoSaving: false, savedByKeyboard: false, saveFailed: false, storagePaused: false, stopped: false, peerStopped: false, quietMs: 3000};
    const adjusting = {...keyboard, adjustmentPending: true};
    const changes = (count) => Array.from({length: count}, () => ({}));
    /** @param {object} live @param {number} [count] */
    const liveDraft = (live, count = 0) => /** @type {any} */ ({changes: changes(count), dirty: count > 0, live: {unsaved: false, converged: true, keyboard: adjusting, ...live}, keyboard: adjusting});
    const words = {kind: "adjustment", tone: "draft", text: "Keyboard adjustment pending",
        tip: "A DPI or lighting key change is waiting to reach both halves. Release held keys; Ark will read it when it takes effect."};

    // Live, nothing unsaved: not "Edits not saved yet".
    assert.deepEqual(railSaveLine(liveDraft({mode: LIVE})), words);
    // Live and Live + review with unsaved changes: not "N changes not saved yet".
    assert.deepEqual(railSaveLine(liveDraft({mode: LIVE, unsaved: true}, 2)), words);
    assert.deepEqual(railSaveLine(liveDraft({mode: LIVE_REVIEW, unsaved: true}, 2)), words);
    // An Apply draft: the keyboard's own status, outside `live`.
    const apply = (keyboardView, count = 1) => /** @type {any} */ ({changes: changes(count), dirty: count > 0, live: null, keyboard: keyboardView});
    assert.deepEqual(railSaveLine(apply(adjusting)), words);
    assert.deepEqual(railSaveLine(apply(adjusting, 0)), words, "with no edits in the draft too");
    assert.equal(liveSaveState(apply(adjusting))?.title, "Keyboard adjustment pending");
    assert.equal(railSaveLine(apply(keyboard)), null, "nothing else is said under an Apply draft");
    assert.equal(railSaveLine(apply(null)), null);

    // Beside it, what stands beneath: Live's own "not saved yet" with its
    // count; nothing more in Live + review, whose unsaved line is the rail's own.
    assert.deepEqual(railSaveLines(liveDraft({mode: LIVE, unsaved: true}, 2)).map((line) => line.text), ["Keyboard adjustment pending", "2 changes not saved yet"]);
    assert.deepEqual(railSaveLines(liveDraft({mode: LIVE})).map((line) => line.text), ["Keyboard adjustment pending"]);
    assert.deepEqual(railSaveLines(liveDraft({mode: LIVE_REVIEW, unsaved: true}, 2)).map((line) => line.text), ["Keyboard adjustment pending"]);
    assert.deepEqual(railSaveLines(apply(adjusting)).map((line) => line.text), ["Keyboard adjustment pending"]);
    // Live's own "not saved yet" keeps its count, with no adjustment.
    assert.equal(railSaveLine(liveDraft({mode: LIVE, unsaved: true, keyboard}, 2))?.text, "2 changes not saved yet");
    assert.equal(railSaveLine(liveDraft({mode: LIVE, unsaved: true, keyboard}))?.text, "Edits not saved yet");
    // A stopped keyboard and halves apart outrank it.
    assert.equal(railSaveLine(liveDraft({mode: LIVE, keyboard: {...adjusting, stopped: true}}))?.text, STOPPED_WORDS.rail);
    assert.equal(liveSaveState(liveDraft({mode: LIVE_REVIEW, unsaved: true, apart: true}))?.kind, "refused");
    assert.equal(railSaveLine(liveDraft({mode: LIVE_REVIEW, unsaved: true, apart: true})), null, "the halves apart have their own rail line");
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
    assert.match(questionWords("sendOrDiscard", 1, {checks}).detail, /Send your draft with this warning\?$/);
    const trap = /** @type {any[]} */ ([{level: "trap", title: "Numbers can lock with no way back to Base", status: "new"}]);
    assert.match(questionWords("sendOrDiscard", 3, {checks: trap}).detail, /Send your draft anyway\?$/, "it sends the whole draft, not one edit");
    assert.doesNotMatch(questionWords("sendOrDiscard", 3, {checks: trap}).detail, /this edit/);
    assert.deepEqual(controls.setEditMode(LIVE_REVIEW, "send", true), {type: "setEditMode", mode: 2, pending: "send", confirmChecks: true});
});

// Jumping in the history, renaming and importing reach the keyboard at once
// in the live modes (D-L65, firmware D-F25); in Apply they wait for Apply.
test("history, rename and import words follow the edit mode", async () => {
    const {historyFooter, renameNote, importNote, importCallout} = await import("../../webview/view/edit-mode.mjs");
    const apply = /** @type {any} */ ({live: null});
    const live = /** @type {any} */ ({live: {mode: LIVE}});
    const review = /** @type {any} */ ({live: {mode: LIVE_REVIEW}});

    assert.equal(historyFooter(apply), "Going to a step changes only the draft. The keyboard is not touched until you apply.");
    assert.equal(renameNote(apply), "Your computer and Chrome show this name after Apply; the keyboard reconnects for a moment to take it.");
    assert.equal(importNote(apply), "Choose or drop a complete backup here and review its differences first. Import replaces the local draft; nothing is written to the keyboard until you review and apply it.");
    assert.equal(importCallout(apply), "Nothing is written to the keyboard until you review and apply; the review shows every change field by field.");
    assert.equal(historyFooter(null), historyFooter(apply), "no draft reads as Apply");

    for (const draft of [live, review]) {
        const mode = draft === live ? "Live" : "Live + review";
        assert.doesNotMatch(historyFooter(draft), /not touched|until you apply/, mode);
        assert.match(historyFooter(draft), /sends it to the keyboard at once/, mode);
        assert.doesNotMatch(renameNote(draft), /after Apply/, mode);
        assert.match(renameNote(draft), /reconnects for a moment to take it right after the edit/, mode);
        for (const words of [importNote(draft), importCallout(draft)]) {
            assert.doesNotMatch(words, /until you review and apply/, mode);
            assert.match(words, /Use as draft sends it to the keyboard at once as unsaved edits/, mode);
            assert.match(words, /Revert or unplugging/, mode);
        }
    }
    assert.match(importCallout(review), /Save keeps them/);
    assert.match(importCallout(live), /which the keyboard saves by itself/);
    assert.match(historyFooter(live), /the keyboard then saves by itself/);
    assert.match(historyFooter(review), /unsaved edit/);
});
