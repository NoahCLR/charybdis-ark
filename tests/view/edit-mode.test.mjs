import assert from "node:assert/strict";
import test from "node:test";
import {APPLY, LIVE, LIVE_REVIEW, STOPPED_WORDS, editModeChoices, editsAreLive, liveSaveState, questionWords, quietWords, restartOffer, switchQuestion} from "../../webview/view/edit-mode.mjs";
import {RESTART_NEEDED} from "../../webview/view/keyboard-view.mjs";
import * as controls from "../../webview/view/controls.mjs";

import {createRequire} from "node:module";

const {openDraft, panelModel, profileDocument} = createRequire(import.meta.url)("../fixtures/published-model");

// The edit mode and its words as core publishes them for a keyboard in
// `mode`, under the draft a test describes.
const {draft: opened, state} = openDraft(profileDocument());
/** @type {Map<string, any>} */
const published = new Map();
/** @param {number} mode @param {{conflict?: boolean, notStored?: boolean}} [flags] */
const publishedMode = (mode, {conflict = false, notStored = false} = {}) => {
    const key = `${mode} ${conflict} ${notStored}`;
    if (!published.has(key)) published.set(key, panelModel(opened, {...state, editMode: {mode, conflict, notStored, counter: 1, slaveMode: mode, slaveCounter: 1, slaveKnown: true, agreed: !conflict}}));
    return published.get(key);
};
/** @param {object} draft @param {number} mode @param {{conflict?: boolean, notStored?: boolean}} [flags] */
const model = (draft, mode = LIVE_REVIEW, flags = {}) => {
    const {vocabulary, editMode} = publishedMode(mode, flags);
    return /** @type {any} */ ({vocabulary, editMode, draft});
};

test("the edit mode a test writes over is the shape core publishes", () => {
    assert.deepEqual(publishedMode(LIVE, {conflict: true, notStored: true}).editMode, {mode: LIVE, conflict: true, offered: [LIVE, LIVE_REVIEW, APPLY], notStored: true});
});

test("the switch offers all three modes in the order core offers them, and shows a mode it does not offer only when a keyboard reports it", () => {
    assert.deepEqual(editModeChoices(model({}))?.choices.map(choice => [choice.value, choice.label, choice.offered]),
        [[LIVE, "Live edit", true], [LIVE_REVIEW, "Live preview + save", true], [APPLY, "Review and save", true]]);
    // Core offers every mode, so a keyboard reporting one it leaves out is
    // written by hand, over the edit mode core publishes.
    const live = model({}, LIVE);
    assert.deepEqual(editModeChoices({...live, editMode: {...live.editMode, offered: [LIVE_REVIEW, APPLY]}})?.choices.map(choice => [choice.label, choice.offered]), [["Live preview + save", true], ["Review and save", true], ["Live edit", false]]);
    assert.equal(editModeChoices(model({}, LIVE, {notStored: true}))?.notStored, true, "a mode the keyboard has not stored yet is flagged");
    assert.equal(editModeChoices({}), null);
});

test("leaving Live edit asks nothing (the keyboard saves first); entering it asks as Live preview + save does", () => {
    assert.equal(switchQuestion(model({live: {unsaved: true}, dirty: true}, LIVE), APPLY), null);
    assert.equal(switchQuestion(model({live: {unsaved: true}, dirty: true}, LIVE), LIVE_REVIEW), null);
    assert.equal(switchQuestion(model({live: {unsaved: true}, dirty: true}, LIVE_REVIEW), LIVE), "saveOrRevert");
    assert.equal(switchQuestion(model({live: null, dirty: true}, APPLY), LIVE), "sendOrDiscard");
    assert.equal(switchQuestion(model({live: {unsaved: true}, dirty: true}, APPLY), LIVE), "saveOrRevert", "a Review and save keyboard still running unsaved edits settles them first");
    assert.match(questionWords("saveOrRevert", 1, {mode: LIVE, from: LIVE_REVIEW}).detail, /In Live edit the keyboard saves edits by itself/);
    assert.match(questionWords("sendOrDiscard", 2, {mode: LIVE}).detail, /saves it by itself a moment later/);
    assert.match(questionWords("sendOrDiscard", 2, {mode: LIVE_REVIEW}).detail, /runs unsaved until you save it/);
});

test("in Live edit the keyboard's own saving is said from its status; flags show with the one way on", () => {
    const keyboard = {saving: false, autoSaving: false, savedByKeyboard: false, saveFailed: false, storagePaused: false, quietMs: 3000, quietWords: "3 seconds"};
    /** @param {object} live */
    const draft = live => /** @type {any} */ ({live: {mode: LIVE, unsaved: false, converged: true, keyboard, ...live}});
    assert.equal(liveSaveState(/** @type {any} */ ({live: null})), null);
    assert.equal(liveSaveState(draft({})), null, "nothing to say");
    assert.deepEqual((({kind, title}) => [kind, title])(/** @type {any} */ (liveSaveState(draft({unsaved: true})))), ["pending", "Not saved yet"]);
    assert.match(/** @type {any} */ (liveSaveState(draft({unsaved: true}))).detail, /after 3 seconds without typing/);
    assert.match(/** @type {any} */ (liveSaveState(draft({unsaved: true, keyboard: {...keyboard, quietMs: 5000, quietWords: "5 seconds"}}))).detail, /after 5 seconds without typing/);
    assert.equal(quietWords(null), "a few seconds", "no keyboard to say");
    assert.equal(liveSaveState(draft({unsaved: true, keyboard: {...keyboard, saving: true, storagePaused: true}}))?.detail, "The keyboard finishes saving once no key is held.");
    assert.equal(liveSaveState(draft({keyboard: {...keyboard, savedByKeyboard: true}}))?.title, "Saved by the keyboard");
    assert.equal(liveSaveState(draft({unsaved: true, keyboard: {...keyboard, saveFailed: true}}))?.action, "save");
    assert.equal(liveSaveState(draft({unsaved: true, slaveRefused: true, keyboard: {...keyboard, saveFailed: true}}))?.action, "revert", "the halves apart come first: Save is refused");
    assert.equal(liveSaveState(draft({keyboard: {...keyboard, adjustmentPending: true}}))?.title, "Keyboard adjustment pending");
    assert.equal(liveSaveState(draft({mode: LIVE_REVIEW, keyboard: {...keyboard, adjustmentPending: true}}))?.kind, "adjustment");
    // Live preview + save: the commit bar says "unsaved" itself; only trouble
    // is said here.
    assert.equal(liveSaveState(draft({mode: LIVE_REVIEW, unsaved: true})), null);
    assert.equal(liveSaveState(draft({mode: LIVE_REVIEW, unsaved: true, slaveRefused: true}))?.kind, "refused");
});

// A DPI or lighting key change still reaching both halves is the keyboard's
// own: never "not saved yet", and said under a Review and save draft too.
test("a pending keyboard adjustment is said as itself in every edit mode", () => {
    const keyboard = {saving: false, autoSaving: false, savedByKeyboard: false, saveFailed: false, storagePaused: false, stopped: false, slaveStopped: false, quietMs: 3000};
    const adjusting = {...keyboard, adjustmentPending: true};
    const changes = (count) => Array.from({length: count}, () => ({}));
    /** @param {object} live @param {number} [count] */
    const liveDraft = (live, count = 0) => /** @type {any} */ ({changes: changes(count), dirty: count > 0, live: {unsaved: false, converged: true, keyboard: adjusting, ...live}, keyboard: adjusting});
    const words = {kind: "adjustment", tone: "draft", title: "Keyboard adjustment pending",
        detail: "A DPI or lighting key change is waiting to reach both halves. Release held keys; Ark will read it when it takes effect.", action: null};

    // Live edit, nothing unsaved: not "Not saved yet".
    assert.deepEqual(liveSaveState(liveDraft({mode: LIVE})), words);
    // Live edit and Live preview + save with unsaved changes: not "Not saved
    // yet".
    assert.deepEqual(liveSaveState(liveDraft({mode: LIVE, unsaved: true}, 2)), words);
    assert.deepEqual(liveSaveState(liveDraft({mode: LIVE_REVIEW, unsaved: true}, 2)), words);
    // A Review and save draft: the keyboard's own status, outside `live`.
    const apply = (keyboardView, count = 1) => /** @type {any} */ ({changes: changes(count), dirty: count > 0, live: null, keyboard: keyboardView});
    assert.deepEqual(liveSaveState(apply(adjusting)), words);
    assert.deepEqual(liveSaveState(apply(adjusting, 0)), words, "with no edits in the draft too");
    assert.equal(liveSaveState(apply(keyboard)), null, "nothing else is said under an Apply draft");
    assert.equal(liveSaveState(apply(null)), null);

    // What stands beneath it, asked for on its own: Live edit's own "not saved
    // yet".
    assert.equal(liveSaveState(liveDraft({mode: LIVE, unsaved: true}, 2), {adjustment: false})?.kind, "pending");
    assert.equal(liveSaveState(liveDraft({mode: LIVE}), {adjustment: false}), null);
    assert.equal(liveSaveState(liveDraft({mode: LIVE_REVIEW, unsaved: true}, 2), {adjustment: false}), null);
    assert.equal(liveSaveState(apply(adjusting), {adjustment: false}), null);
    // A stopped keyboard and halves apart outrank it.
    assert.equal(liveSaveState(liveDraft({mode: LIVE, keyboard: {...adjusting, stopped: true}}))?.kind, "stopped");
    assert.equal(liveSaveState(liveDraft({mode: LIVE_REVIEW, unsaved: true, slaveRefused: true}))?.kind, "refused");
});

// Firmware D-F34: a keyboard that stopped saving used to look like "not
// ready" and "the slave half is catching up". Now one state says so, for
// either half, in every live mode, ahead of anything else, with Restart.
test("a keyboard that stopped saving outranks every other state and offers Restart", () => {
    const keyboard = {saving: false, autoSaving: false, savedByKeyboard: false, saveFailed: false, storagePaused: false, stopped: false, slaveStopped: false, quietMs: 3000};
    /** @param {object} live */
    const draft = live => /** @type {any} */ ({live: {mode: LIVE_REVIEW, unsaved: true, converged: false, keyboard, ...live}});
    for (const flag of ["stopped", "slaveStopped"]) for (const mode of [LIVE, LIVE_REVIEW]) {
        const state = liveSaveState(draft({mode, slaveRefused: true, keyboard: {...keyboard, saveFailed: true, saving: true, adjustmentPending: true, [flag]: true}}));
        assert.deepEqual(state, {kind: "stopped", tone: "err", title: STOPPED_WORDS.title, detail: STOPPED_WORDS.detail, action: "restart"});
    }
    assert.equal(STOPPED_WORDS.title, "The keyboard stopped saving");
    assert.match(STOPPED_WORDS.detail, /^Restart it to continue\./);
    assert.notEqual(liveSaveState(draft({keyboard}))?.kind, "stopped", "a keyboard catching up is not stopped");
});

// Under a Review and save draft too: the look between edits reads the same
// flags, so a stopped half is said with Restart, ahead of a pending
// adjustment, and not as a keyboard that is not ready.
test("a Review and save draft's keyboard that stopped saving says so for either half and offers Restart", () => {
    const keyboard = {saving: false, autoSaving: false, savedByKeyboard: false, saveFailed: false, storagePaused: false, adjustmentPending: false, stopped: false, slaveStopped: false, quietMs: 3000};
    /** @param {object} flags @param {number} [count] */
    const apply = (flags, count = 2) => /** @type {any} */ ({changes: Array.from({length: count}, () => ({})), dirty: count > 0, live: null, keyboard: {...keyboard, ...flags}});
    for (const flag of ["stopped", "slaveStopped"]) for (const count of [0, 2]) {
        const draft = apply({adjustmentPending: true, [flag]: true}, count);
        assert.deepEqual(liveSaveState(draft), {kind: "stopped", tone: "err", title: STOPPED_WORDS.title, detail: STOPPED_WORDS.detail, action: "restart"}, `${flag}, ${count} changes`);
    }
    assert.equal(liveSaveState(apply({})), null, "a keyboard saving normally says nothing");
});

// A slave half that never confirmed a cancelled save (`health.restartNeeded`)
// leaves the keyboard refusing new saves until it restarts. The bar offers
// Restart for it in every edit mode, in the words the keyboard dot uses; a
// keyboard that also stopped saving is offered Restart once, as stopped.
test("a keyboard that needs a restart is offered Restart in every edit mode, once", () => {
    const keyboard = {saving: false, autoSaving: false, savedByKeyboard: false, saveFailed: false, storagePaused: false, adjustmentPending: false, stopped: false, slaveStopped: false, quietMs: 3000};
    const needs = (draft, restartNeeded = true) => /** @type {any} */ ({device: {connected: true, health: {restartNeeded}}, draft});
    const drafts = {
        "Review and save, clean": {changes: [], dirty: false, live: null, keyboard},
        "Review and save, with edits": {changes: [{}], dirty: true, live: null, keyboard},
        "Live edit": {changes: [], dirty: false, live: {mode: LIVE, unsaved: true, converged: true, keyboard}},
        "Live preview + save": {changes: [{}], dirty: true, live: {mode: LIVE_REVIEW, unsaved: true, converged: true, keyboard}},
    };
    for (const [name, draft] of Object.entries(drafts)) {
        assert.deepEqual(restartOffer(needs(draft)), {kind: "restartNeeded", title: RESTART_NEEDED.label, detail: RESTART_NEEDED.detail}, name);
        assert.equal(restartOffer(needs(draft, false)), null, `${name}: nothing to offer`);
        const stopped = draft.live ? {...draft, live: {...draft.live, keyboard: {...keyboard, stopped: true}}} : {...draft, keyboard: {...keyboard, slaveStopped: true}};
        assert.deepEqual(restartOffer(needs(stopped)), {kind: "stopped", title: STOPPED_WORDS.title, detail: STOPPED_WORDS.detail}, `${name}: stopped says it, one bar`);
    }
    assert.equal(restartOffer(needs(null)), null, "no draft: Restart is a draft control, so the Keyboard screen's steps say it");
    assert.equal(restartOffer({...needs(drafts["Live edit"]), demo: {active: true}}), null, "never in the demo");
});

test("leaving Live preview + save with unsaved edits asks Save or Revert; entering it with a draft asks Send or Discard", () => {
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
    // Save reads as the review's own button does, in every mode.
    assert.deepEqual(save.answers.map(answer => answer.label), ["Revert", "Save to keyboard"]);
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
    const conflicted = model({live: {unsaved: false}}, LIVE_REVIEW, {conflict: true});
    assert.equal(switchQuestion(conflicted, LIVE_REVIEW), null, "settling with nothing unsaved switches at once");
    assert.equal(switchQuestion({...conflicted, draft: {live: {unsaved: true}}}, LIVE_REVIEW), "saveOrRevert");
    assert.match(questionWords("saveOrRevert", 1, {mode: APPLY, from: LIVE_REVIEW}).detail, /In Review and save, edits wait in Ark until you save them/);
    assert.match(questionWords("saveOrRevert", 1, {mode: LIVE_REVIEW, from: LIVE, label: "Live preview + save"}).detail, /switches to Live preview \+ save only with nothing unsaved/);
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
// in the live modes (D-L65, firmware D-F25); in Review and save they wait
// for a save.
test("history, rename and import words follow the edit mode", async () => {
    const {historyFooter, renameNote, importNote, importCallout} = await import("../../webview/view/edit-mode.mjs");
    const apply = /** @type {any} */ ({live: null});
    const live = /** @type {any} */ ({live: {mode: LIVE}});
    const review = /** @type {any} */ ({live: {mode: LIVE_REVIEW}});

    assert.equal(historyFooter(apply), "Going to a step changes only the draft. The keyboard is not touched until you save.");
    assert.equal(renameNote(apply), "Your computer and Chrome show this name once you save; the keyboard reconnects for a moment to take it.");
    assert.equal(importNote(apply), "Choose or drop a complete backup here and review its differences first. Import replaces the local draft; nothing reaches the keyboard until you review and save it.");
    assert.equal(importCallout(apply), "Nothing reaches the keyboard until you review and save; the review shows every change field by field.");
    assert.equal(historyFooter(null), historyFooter(apply), "no draft reads as Review and save");

    for (const draft of [live, review]) {
        const mode = draft === live ? "Live edit" : "Live preview + save";
        assert.doesNotMatch(historyFooter(draft), /not touched|until you save/, mode);
        assert.match(historyFooter(draft), /sends it to the keyboard at once/, mode);
        assert.doesNotMatch(renameNote(draft), /once you save/, mode);
        assert.match(renameNote(draft), /reconnects for a moment to take it right after the edit/, mode);
        for (const words of [importNote(draft), importCallout(draft)]) {
            assert.doesNotMatch(words, /until you review and save/, mode);
            assert.match(words, /Use as draft sends it to the keyboard at once as unsaved edits/, mode);
            assert.match(words, /Revert or unplugging/, mode);
        }
    }
    assert.match(importCallout(review), /Save keeps them/);
    assert.match(importCallout(live), /which the keyboard saves by itself/);
    assert.match(historyFooter(live), /the keyboard then saves by itself/);
    assert.match(historyFooter(review), /unsaved edit/);
});
