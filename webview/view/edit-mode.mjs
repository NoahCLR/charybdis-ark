// @ts-check
// How edits reach the keyboard (firmware D-F32, plan answers 1 and 3), as the
// panel shows it: which mode is on, which Ark offers, and what switching has
// to ask first. Pure, so the rules are tested without a screen.

import {editModeWords} from "./vocabulary.mjs";
import {confirmText} from "./checks.mjs";

export const APPLY = 0;
export const LIVE = 1;
export const LIVE_REVIEW = 2;

/** @typedef {import("../../contracts/panel.js").PublishedModel} Model */

// The mode switch: the keyboard's mode and the choices offered. Live, which a
// later Ark adds, is shown when a keyboard reports it, but not offered.
/** @param {Partial<Model> | null | undefined} model */
export function editModeChoices(model) {
    const mode = model?.editMode;
    if (!mode) return null;
    const offered = [...mode.offered];
    if (!offered.includes(mode.mode)) offered.push(mode.mode);
    return {mode: mode.mode, conflict: mode.conflict,
        choices: offered.map((value) => ({value, ...editModeWords(model, value), offered: mode.offered.includes(value)}))};
}

// Whether the draft is the keyboard's working copy (edits are sent at once).
/** @param {Partial<Model> | null | undefined} model */
export const editsAreLive = (model) => Boolean(model?.draft?.live);

// What switching to `mode` has to ask first. The keyboard changes its mode
// only with nothing unsaved, so a live draft with unsaved edits asks Save or
// Revert whichever way it goes, and so does choosing the same mode again to
// settle halves that stored different modes; entering Live + review with an
// Apply draft asks Send or Discard; anything else switches at once.
/** @param {Partial<Model> | null | undefined} model @param {number} mode @returns {null | 'saveOrRevert' | 'sendOrDiscard'} */
export function switchQuestion(model, mode) {
    const draft = model?.draft;
    if (!draft || (mode === model?.editMode?.mode && !model?.editMode?.conflict)) return null;
    if (draft.live?.unsaved) return "saveOrRevert";
    if (!draft.live && mode !== APPLY && draft.dirty) return "sendOrDiscard";
    return null;
}

// The words for the switch's question and its two answers, for the way it
// goes. `checks` are the traps and warnings Save (or Send) confirms: the
// question lists them, so answering it is the confirmation.
/** @param {'saveOrRevert' | 'sendOrDiscard'} question @param {number} changes @param {{mode?: number, from?: number, label?: string, checks?: readonly import("../../contracts/model.js").Check[]}} [context] */
export function questionWords(question, changes, {mode = APPLY, from, label = "the new mode", checks = []} = {}) {
    const count = `${changes} change${changes === 1 ? "" : "s"}`;
    const confirm = checks.length ? ` ${confirmText(checks, question === "saveOrRevert" ? "save" : "send")}` : "";
    if (question === "saveOrRevert") {
        const why = mode === from ? "Choosing the mode again settles halves that stored different ones, and the keyboard does that only with nothing unsaved"
            : mode === APPLY ? "In Apply, edits wait in Ark until you apply them, so the keyboard can switch only with nothing unsaved"
                : `The keyboard switches to ${label} only with nothing unsaved`;
        return {title: "Save or revert first?", checks,
            detail: `The keyboard runs ${changes === 1 ? "a change that is" : `${count} that are`} not saved. ${why}: save them on the keyboard, or revert to what is saved.${confirm}`,
            answers: [{pending: /** @type {const} */ ("revert"), label: "Revert"}, {pending: /** @type {const} */ ("save"), label: checks.length ? "Save anyway" : "Save on keyboard", primary: true}]};
    }
    return {title: "Send your draft live?", checks,
        detail: `Your draft holds ${count}. In Live + review every edit takes effect on the keyboard at once. Send the draft to the keyboard now (it runs unsaved until you save it), or discard it. If the keyboard refuses it, Ark stays in Apply with your draft.${confirm}`,
        answers: [{pending: /** @type {const} */ ("discard"), label: "Discard draft"}, {pending: /** @type {const} */ ("send"), label: checks.length ? "Send anyway" : "Send live", primary: true}]};
}
