// @ts-check
// How edits reach the keyboard (firmware D-F32, plan answers 1 and 3), as the
// panel shows it: which mode is on, which Ark offers, what switching has to
// ask first, and in the live modes what the keyboard says of its own saving.
// Pure, so the rules are tested without a screen.

import {editModeWords} from "./vocabulary.mjs";
import {confirmText} from "./checks.mjs";
import {shortcut} from "./shortcuts.mjs";

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
    const confirm = checks.length ? ` ${confirmText(checks, question === "saveOrRevert" ? "save" : "sendDraft")}` : "";
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

// A DPI or lighting key change still reaching both halves, in any edit mode:
// it is the keyboard's own, not an edit waiting to be saved.
const ADJUSTMENT = Object.freeze({kind: /** @type {const} */ ("adjustment"), tone: /** @type {const} */ ("draft"), title: "Keyboard adjustment pending",
    detail: "A DPI or lighting key change is waiting to reach both halves. Release held keys; Ark will read it when it takes effect.", action: null});

// How long the keyboard in Live waits with no edit and no key held before it
// saves, in the words core gives the interval it reports (`quietWords`).
/** @param {{quietWords?: string} | null | undefined} keyboard */
export const quietWords = (keyboard) => keyboard?.quietWords || "a few seconds";

/**
 * Where a live keyboard's edits stand, by what it says (edit status), as one
 * line with its tone and the one action that helps. Null when there is
 * nothing to say. Live + review's ordinary "unsaved" is the commit bar's own.
 * Under an Apply draft the keyboard can say only that an adjustment is
 * pending. `adjustment: false` asks what stands beneath one.
 * @param {Draft | null | undefined} draft
 * @param {{adjustment?: boolean}} [options]
 * @returns {null | {kind: 'stopped' | 'refused' | 'failed' | 'adjustment' | 'saving' | 'pending' | 'saved', tone: 'err' | 'warn' | 'draft' | 'ok', title: string, detail: string, action: null | 'restart' | 'revert' | 'save'}}
 */
export function liveSaveState(draft, {adjustment = true} = {}) {
    const live = draft?.live, keyboard = live ? live.keyboard : draft?.keyboard;
    const adjusting = adjustment && keyboard?.adjustmentPending;
    if (!live) return adjusting ? ADJUSTMENT : null;
    // Stopped outranks everything: "catching up" and "not ready" were what
    // a stopped keyboard used to look like.
    if (keyboard?.stopped || keyboard?.peerStopped) return {kind: "stopped", tone: "err", title: STOPPED_WORDS.title, detail: STOPPED_WORDS.detail, action: "restart"};
    if (live.apart) return {kind: "refused", tone: "err", title: "Halves apart",
        detail: `The slave half refused these edits, so the halves run different profiles and nothing can be saved. Revert puts both back on the saved profile; Undo (${shortcut("Z")}) sends the edits again.`, action: "revert"};
    if (adjusting) return ADJUSTMENT;
    if (keyboard?.saveFailed && live.unsaved) return {kind: "failed", tone: "err", title: "The keyboard could not save",
        detail: "Its edits still run, unsaved; unplugging it now loses them. Save again, or Revert to the saved profile.", action: "save"};
    if (live.mode !== LIVE) return null;
    if (live.unsaved && keyboard?.saving) return {kind: "saving", tone: "draft", title: "Saving on the keyboard",
        detail: keyboard.storagePaused ? "The keyboard writes flash once no key is held." : "The keyboard is writing these edits to both halves.", action: null};
    if (live.unsaved) return {kind: "pending", tone: "draft", title: "Not saved yet",
        detail: `The keyboard saves these edits by itself after ${quietWords(keyboard)} without typing, with or without Ark. Unplugging it sooner loses them.`, action: null};
    if (keyboard?.savedByKeyboard) return {kind: "saved", tone: "ok", title: "Saved by the keyboard",
        detail: "The keyboard saved its edits by itself; they survive a replug.", action: null};
    return null;
}

// The rail's line for it: Live's "not saved yet" with its count, a stopped
// keyboard in short, anything else by its title, the detail on hover. Null
// when there is nothing to say, or only what the rail says another way (the
// halves apart).
/** @param {Draft | null | undefined} draft @param {{adjustment?: boolean}} [options] @returns {null | {kind: NonNullable<ReturnType<typeof liveSaveState>>["kind"], tone: string, text: string, tip: string}} */
export function railSaveLine(draft, options) {
    const saving = liveSaveState(draft, options);
    if (!saving || saving.kind === "refused") return null;
    if (saving.kind === "stopped") return {kind: saving.kind, tone: saving.tone, text: STOPPED_WORDS.rail, tip: STOPPED_WORDS.tip};
    const count = draft?.changes?.length || 0;
    const text = saving.kind === "pending" ? `${count ? `${count} change${count === 1 ? "" : "s"}` : "Edits"} not saved yet` : saving.title;
    return {kind: saving.kind, tone: saving.tone, text, tip: saving.detail};
}

// The rail's lines: a pending adjustment, then what stands beneath it (Live's
// own "not saved yet" keeps its count), so neither is said on the other's
// account.
/** @param {Draft | null | undefined} draft */
export function railSaveLines(draft) {
    const first = railSaveLine(draft);
    const beneath = first?.kind === "adjustment" ? railSaveLine(draft, {adjustment: false}) : null;
    return /** @type {NonNullable<ReturnType<typeof railSaveLine>>[]} */ ([first, beneath].filter(Boolean));
}

// What jumping in the draft history, renaming the keyboard and importing a
// backup do in the draft's edit mode. In Apply they change only the draft; in
// the live modes the draft is the keyboard's working copy, so each reaches
// the keyboard at once (D-L65; a new name by one USB restart, firmware
// D-F25). No draft reads as Apply.
/** @param {Draft | null | undefined} draft */
const liveMode = (draft) => draft?.live ? draft.live.mode : null;
// How unsaved edits on the keyboard are kept or undone, by mode.
/** @param {number} mode */
const unsavedEdits = (mode) => mode === LIVE ? "as unsaved edits, which the keyboard saves by itself after a moment; Revert or unplugging it sooner undoes them."
    : "as unsaved edits: Save keeps them; Revert or unplugging the keyboard undoes them.";

/** @param {Draft | null | undefined} draft */
export function historyFooter(draft) {
    const mode = liveMode(draft);
    if (mode === null) return "Going to a step changes only the draft. The keyboard is not touched until you apply.";
    return mode === LIVE ? "Going to a step sends it to the keyboard at once, as an edit the keyboard then saves by itself."
        : "Going to a step sends it to the keyboard at once, as an unsaved edit.";
}

/** @param {Draft | null | undefined} draft */
export const renameNote = (draft) => liveMode(draft) === null
    ? "Your computer and Chrome show this name after Apply; the keyboard reconnects for a moment to take it."
    : "The keyboard reconnects for a moment to take it right after the edit; your computer and Chrome then show this name.";

// The Import card's note, outside the demo (which says its own).
/** @param {Draft | null | undefined} draft */
export function importNote(draft) {
    const mode = liveMode(draft);
    return `Choose or drop a complete backup here and review its differences first. ${mode === null
        ? "Import replaces the local draft; nothing is written to the keyboard until you review and apply it."
        : `Use as draft sends it to the keyboard at once ${unsavedEdits(mode)}`}`;
}

// What Use as draft does, on the import sheet.
/** @param {Draft | null | undefined} draft */
export function importCallout(draft) {
    const mode = liveMode(draft);
    return mode === null ? "Nothing is written to the keyboard until you review and apply; the review shows every change field by field."
        : `Use as draft sends it to the keyboard at once ${unsavedEdits(mode)}`;
}
