// @ts-check
// How edits reach the keyboard (firmware D-F32, plan answers 1 and 3), as the
// panel shows it: which mode is on, which Ark offers, what switching has to
// ask first, and in the live modes what the keyboard says of its own saving.
// Pure, so the rules are tested without a screen.

import {editModeWords} from "./vocabulary.mjs";
import {confirmText} from "./checks.mjs";

export const APPLY = 0;
export const LIVE = 1;
export const LIVE_REVIEW = 2;

/** @typedef {import("../../contracts/panel.js").PublishedModel} Model */
/** @typedef {NonNullable<Model["draft"]>} Draft */

// The mode switch: the keyboard's mode and the choices offered. A mode a
// keyboard reports that this Ark does not offer is shown, not offered.
/** @param {Partial<Model> | null | undefined} model */
export function editModeChoices(model) {
    const mode = model?.editMode;
    if (!mode) return null;
    const offered = [...mode.offered];
    if (!offered.includes(mode.mode)) offered.push(mode.mode);
    return {mode: mode.mode, conflict: mode.conflict, notStored: Boolean(mode.notStored),
        choices: offered.map((value) => ({value, ...editModeWords(model, value), offered: mode.offered.includes(value)}))};
}

// Whether the draft is the keyboard's working copy (edits are sent at once).
/** @param {Partial<Model> | null | undefined} model */
export const editsAreLive = (model) => Boolean(model?.draft?.live);

// What switching to `mode` has to ask first. The keyboard changes its mode
// only with nothing unsaved, so a live draft with unsaved edits asks Save or
// Revert whichever way it goes, and so does choosing the same mode again to
// settle halves that stored different modes; outside Live, that is: in Live
// the keyboard saves them itself, so leaving it asks nothing. Entering a live
// mode with an Apply draft asks Send or Discard; anything else switches at once.
/** @param {Partial<Model> | null | undefined} model @param {number} mode @returns {null | 'saveOrRevert' | 'sendOrDiscard'} */
export function switchQuestion(model, mode) {
    const draft = model?.draft, current = model?.editMode?.mode;
    if (!draft || (mode === current && !model?.editMode?.conflict)) return null;
    if (draft.live?.unsaved) return current === LIVE ? null : "saveOrRevert";
    if (!draft.live && mode !== APPLY && draft.dirty) return "sendOrDiscard";
    return null;
}

// The words for the switch's question and its two answers, for the way it
// goes. `checks` are the traps and warnings Save (or Send) confirms: the
// question lists them, so answering it is the confirmation.
/** @param {'saveOrRevert' | 'sendOrDiscard'} question @param {number} changes @param {{mode?: number, from?: number, label?: string, checks?: readonly import("../../contracts/model.js").Check[]}} [context] */
export function questionWords(question, changes, {mode = question === "saveOrRevert" ? APPLY : LIVE_REVIEW, from, label = "the new mode", checks = []} = {}) {
    const count = `${changes} change${changes === 1 ? "" : "s"}`;
    const confirm = checks.length ? ` ${confirmText(checks, question === "saveOrRevert" ? "save" : "send")}` : "";
    if (question === "saveOrRevert") {
        const why = mode === from ? "Choosing the mode again settles halves that stored different ones, and the keyboard does that only with nothing unsaved"
            : mode === APPLY ? "In Apply, edits wait in Ark until you apply them, so the keyboard can switch only with nothing unsaved"
                : mode === LIVE ? "In Live the keyboard saves edits by itself, so it can switch only with nothing unsaved"
                    : `The keyboard switches to ${label} only with nothing unsaved`;
        return {title: "Save or revert first?", checks,
            detail: `The keyboard runs ${changes === 1 ? "a change that is" : `${count} that are`} not saved. ${why}: save them on the keyboard, or revert to what is saved.${confirm}`,
            answers: [{pending: /** @type {const} */ ("revert"), label: "Revert"}, {pending: /** @type {const} */ ("save"), label: checks.length ? "Save anyway" : "Save on keyboard", primary: true}]};
    }
    const how = mode === LIVE
        ? "In Live every edit takes effect on the keyboard at once, and the keyboard saves it by itself a moment later. Send the draft to the keyboard now, or discard it."
        : "In Live + review every edit takes effect on the keyboard at once. Send the draft to the keyboard now (it runs unsaved until you save it), or discard it.";
    return {title: "Send your draft live?", checks,
        detail: `Your draft holds ${count}. ${how} If the keyboard refuses it, Ark stays in Apply with your draft.${confirm}`,
        answers: [{pending: /** @type {const} */ ("discard"), label: "Discard draft"}, {pending: /** @type {const} */ ("send"), label: checks.length ? "Send anyway" : "Send live", primary: true}]};
}

// A keyboard that stopped saving (firmware D-F34) says so, for either half;
// nothing but a restart clears it, so that is the one thing offered.
export const STOPPED_WORDS = Object.freeze({
    title: "The keyboard stopped saving",
    detail: "Restart it to continue. Ark keeps any unsaved edits and puts them back once it is back; typing works meanwhile.",
    rail: "Stopped saving · Restart",
    tip: "The keyboard stopped saving and refuses Save, Revert and edits until it restarts. Restart it from the bar below; unplugging works too, but loses unsaved edits.",
});

/**
 * Where a live keyboard's edits stand, by what it says (edit status), as one
 * line with its tone and the one action that helps. Null when there is
 * nothing to say. Live + review's ordinary "unsaved" is the commit bar's own.
 * @param {Draft | null | undefined} draft
 * @returns {null | {kind: 'stopped' | 'refused' | 'failed' | 'saving' | 'pending' | 'saved', tone: 'err' | 'warn' | 'draft' | 'ok', title: string, detail: string, action: null | 'restart' | 'revert' | 'save'}}
 */
export function liveSaveState(draft) {
    const live = draft?.live, keyboard = live?.keyboard;
    if (!live) return null;
    // Stopped outranks everything: "catching up" and "not ready" were what
    // a stopped keyboard used to look like.
    if (keyboard?.stopped || keyboard?.peerStopped) return {kind: "stopped", tone: "err", title: STOPPED_WORDS.title, detail: STOPPED_WORDS.detail, action: "restart"};
    if (live.apart) return {kind: "refused", tone: "err", title: "Halves apart",
        detail: "The slave half refused these edits, so the halves run different profiles and nothing can be saved. Revert puts both back on the saved profile; Undo (⌘Z) sends the edits again.", action: "revert"};
    if (keyboard?.adjustmentPending) return {kind: "pending", tone: "draft", title: "Keyboard adjustment pending",
        detail: "A DPI or lighting key change is waiting to reach both halves. Release held keys; Ark will read it when it takes effect.", action: null};
    if (keyboard?.saveFailed && live.unsaved) return {kind: "failed", tone: "err", title: "The keyboard could not save",
        detail: "Its edits still run, unsaved; unplugging it now loses them. Save again, or Revert to the saved profile.", action: "save"};
    if (live.mode !== LIVE) return null;
    const seconds = Math.round((keyboard?.quietMs || 3000) / 1000);
    if (live.unsaved && keyboard?.saving) return {kind: "saving", tone: "draft", title: "Saving on the keyboard",
        detail: keyboard.storagePaused ? "The keyboard writes flash once no key is held." : "The keyboard is writing these edits to both halves.", action: null};
    if (live.unsaved) return {kind: "pending", tone: "draft", title: "Not saved yet",
        detail: `The keyboard saves these edits by itself after ${seconds} second${seconds === 1 ? "" : "s"} without typing, with or without Ark. Unplugging it sooner loses them.`, action: null};
    if (keyboard?.savedByKeyboard) return {kind: "saved", tone: "ok", title: "Saved by the keyboard",
        detail: "The keyboard saved its edits by itself; they survive a replug.", action: null};
    return null;
}
