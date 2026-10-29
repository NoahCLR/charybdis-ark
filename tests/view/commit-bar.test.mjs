import assert from "node:assert/strict";
import test from "node:test";
import {createRequire} from "node:module";
import {commitBarState} from "../../webview/view/commit-bar.mjs";
import {LIVE, LIVE_REVIEW, STOPPED_WORDS} from "../../webview/view/edit-mode.mjs";
import {RESTART_NEEDED} from "../../webview/view/keyboard-view.mjs";
import {macroMessage} from "../../webview/view/edits.mjs";

const {openDraft, panelModel, profileDocument} = createRequire(import.meta.url)("../fixtures/published-model");

// What core publishes for a connected keyboard under a draft holding one
// edit; each test writes over the draft, the Apply or the device as the
// state it names would publish them.
const {draft: opened, state} = openDraft(profileDocument(), {edits: [macroMessage("MACRO_0", "{KC_A}")]});
const published = panelModel(opened, state);
/** @param {{draft?: object, apply?: object | null, liveWait?: object | null, device?: object, health?: object}} [over] @returns {any} */
const model = ({draft = {}, apply = null, liveWait = null, device = {}, health = {}} = {}) => ({...published,
    draft: {...published.draft, ...draft}, apply, liveWait,
    device: {...published.device, ...device, health: {...published.device.health, ...health}}});
// One Apply's steps, the second running.
const steps = [{id: "check", label: "Check the keyboard", state: "done"}, {id: "upload", label: "Send the profile", state: "active"}, {id: "verify", label: "Check both halves", state: "pending"}];
// The keyboard's saving under a live draft, nothing to say.
const keyboard = {saving: false, autoSaving: false, savedByKeyboard: false, saveFailed: false, storagePaused: false, stopped: false, slaveStopped: false, quietMs: 3000};
/** @param {object} [live] */
const liveDraft = (live = {}) => ({live: {mode: LIVE_REVIEW, unsaved: true, converged: true, keyboard, ...live}});
const kind = (/** @type {any} */ given, /** @type {any} */ options) => commitBarState(given, options)?.kind ?? null;

test("the published draft holding an edit leads to the review", () => {
    assert.equal(published.draft.dirty, true);
    assert.deepEqual(commitBarState(published), {kind: "review"});
    assert.equal(kind(model({draft: {dirty: false}})), null, "nothing to save, no bar");
    assert.equal(commitBarState(null), null);
    assert.equal(kind({...published, draft: null}), null, "no draft, no bar");
});

test("an Apply running names its step; once done, the read back", () => {
    const apply = {id: 4, state: "applying", steps};
    assert.deepEqual(commitBarState(model({draft: {busy: true}, apply})), {kind: "applying", apply, step: 2});
    assert.equal(kind(model({draft: {busy: true}, apply: {id: 4, state: "done", steps}})), "readback");
});

test("a failed Apply stays until it is dismissed", () => {
    const apply = {id: 4, state: "failed", steps, failure: {label: "Send the profile", reason: "It stopped.", verdict: "Nothing was saved."}};
    assert.deepEqual(commitBarState(model({apply})), {kind: "failed", apply});
    assert.equal(kind(model({apply}), {applyDismissed: 3}), "failed", "another Apply's dismissal");
    assert.equal(kind(model({apply}), {applyDismissed: 4}), "review", "dismissed, the draft's own bar");
    assert.equal(kind(model({draft: {busy: true}, apply})), "busy", "the keyboard working again comes first");
});

test("a live edit the keyboard holds says what to let go of", () => {
    const wait = {title: "Let go of the keys", detail: "Shift is held", cancellable: true};
    assert.deepEqual(commitBarState(model({draft: {busy: true}, liveWait: wait})), {kind: "held", wait});
    assert.equal(kind(model({draft: {busy: false}, liveWait: wait})), "review", "only while the keyboard is busy with it");
});

test("other work with the keyboard says what it is doing, and whether it writes", () => {
    const busy = (/** @type {string} */ phase) => { const bar = commitBarState(model({draft: {busy: true}, health: {phase}})); return bar?.kind === "busy" ? bar.busy : null; };
    assert.deepEqual(busy("read-layout"), {detail: published.vocabulary.phases["read-layout"].busy, writes: false});
    assert.deepEqual(busy("restore-complete"), {detail: published.vocabulary.phases["restore-complete"].busy, writes: true}, "a write keeps the saved profile running");
    assert.deepEqual(busy("connected"), {detail: "Finishing the current step", writes: false}, "a phase with no busy words");
});

test("a draft from another keyboard, or one the keyboard changed under, is settled first", () => {
    assert.equal(kind(model({draft: {matching: false}})), "otherKeyboard");
    assert.equal(kind(model({draft: {matching: false, stale: true}})), "otherKeyboard");
    assert.equal(kind(model({draft: {stale: true}})), "stale");
    assert.equal(kind(model({draft: {stale: true, ...liveDraft()}})), "reread", "a live draft is what the keyboard runs, so it is read again");
});

test("a keyboard that stopped saving or needs a restart takes the bar in every edit mode", () => {
    assert.deepEqual(commitBarState(model({health: {restartNeeded: true}})), {kind: "restart", offer: {kind: "restartNeeded", title: RESTART_NEEDED.label, detail: RESTART_NEEDED.detail}});
    const stopped = commitBarState(model({draft: liveDraft({keyboard: {...keyboard, stopped: true}})}));
    assert.deepEqual(stopped, {kind: "restart", offer: {kind: "stopped", title: STOPPED_WORDS.title, detail: STOPPED_WORDS.detail}});
    assert.equal(kind(model({draft: {dirty: false}, health: {restartNeeded: true}})), "restart", "with nothing in the draft too");
});

test("the live modes: the keyboard's failed save, Live edit's own saving, and Live preview + save", () => {
    const failed = commitBarState(model({draft: liveDraft({keyboard: {...keyboard, saveFailed: true}})}));
    assert.equal(failed?.kind, "saveFailed");
    assert.equal(failed?.kind === "saveFailed" && failed.saving.action, "save");
    const auto = commitBarState(model({draft: liveDraft({mode: LIVE})}));
    assert.equal(auto?.kind, "liveEdit");
    assert.equal(auto?.kind === "liveEdit" && auto.saving?.title, "Not saved yet");
    assert.equal(kind(model({draft: liveDraft({mode: LIVE, slaveRefused: true})})), "livePreview", "halves apart: Revert is the only way on");
    assert.equal(kind(model({draft: liveDraft()})), "livePreview");
    assert.equal(kind(model({draft: {...liveDraft({unsaved: false}), dirty: true}})), "livePreview", "edits undone back to what is saved still run");
    assert.equal(kind(model({draft: {...liveDraft({unsaved: true}), dirty: false}})), "livePreview");
    assert.equal(kind(model({draft: {...liveDraft({unsaved: false}), dirty: false}})), null, "nothing unsaved, no bar");
});
