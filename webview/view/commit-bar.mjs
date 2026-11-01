// @ts-check
// Which bar the frame shows over the draft, the one gate every change passes
// through on its way to the keyboard: what is happening to it now, or the way
// on from it. The frame draws the bar this names (webview/ui/frame.mjs).

import {busyText} from "./readiness.mjs";
import {LIVE, liveSaveState, restartOffer} from "./edit-mode.mjs";

/**
 * @typedef {import("../../contracts/panel.js").PublishedModel} Model
 * @typedef {{kind: "applying", title: string, apply: import("../../contracts/model.js").ApplyView, step: number}
 *     | {kind: "readback", title: string}
 *     | {kind: "failed", apply: import("../../contracts/model.js").ApplyView}
 *     | {kind: "held", wait: NonNullable<Model["liveWait"]>}
 *     | {kind: "busy", title: string, busy: ReturnType<typeof busyText>}
 *     | {kind: "otherKeyboard"}
 *     | {kind: "reread"}
 *     | {kind: "stale"}
 *     | {kind: "restart", offer: NonNullable<ReturnType<typeof restartOffer>>}
 *     | {kind: "saveFailed", saving: NonNullable<ReturnType<typeof liveSaveState>>}
 *     | {kind: "liveEdit", saving: ReturnType<typeof liveSaveState>}
 *     | {kind: "livePreview"}
 *     | {kind: "review"}} CommitBar
 */

// In order: an Apply running, then reading the keyboard back; a failed one,
// until dismissed (`applyDismissed`, its id), so where it stopped can be read
// after the fact; Ark's own live edit or Revert held until no key is held;
// any other work with the keyboard. Then the draft: one bound to another
// keyboard, one the keyboard changed under (in a live mode the draft is what
// the keyboard runs, so Ark reads it again), a keyboard that stopped saving or
// needs a restart, in any edit mode. Last the edit modes' own ways on: in the
// live modes the keyboard already runs the edits, and in Live edit it saves by
// itself; in Review and save the review. Null for no bar: no draft, or nothing
// in it to save. A bar for work under way carries its title, which the frame
// draws and a screen reader is told (announcements.mjs).
/** @param {Model | null | undefined} model @param {{applyDismissed?: number | null}} [state] @returns {CommitBar | null} */
export function commitBarState(model, {applyDismissed = null} = {}) {
    const draft = model?.draft;
    const apply = model?.apply;
    if (!model || !draft) return null;
    if (draft.busy && apply?.state === "applying") return {kind: "applying", title: "Saving to the keyboard", apply, step: apply.steps.findIndex((step) => step.state === "active") + 1};
    if (draft.busy && apply?.state === "done") return {kind: "readback", title: "Saved — reading back the keyboard"};
    if (!draft.busy && apply?.state === "failed" && applyDismissed !== apply.id) return {kind: "failed", apply};
    if (draft.busy && model.liveWait) return {kind: "held", wait: model.liveWait};
    if (draft.busy) return {kind: "busy", title: "Working with the keyboard", busy: busyText(model.device?.health?.phase, model)};
    if (!draft.matching) return {kind: "otherKeyboard"};
    if (draft.stale) return {kind: draft.live ? "reread" : "stale"};
    const offer = restartOffer(model);
    if (offer) return {kind: "restart", offer};
    if (draft.live) {
        // When the keyboard's own save failed, the bar says so with Save
        // again; edits undone back to what is saved still leave the keyboard
        // on its working copy, so Revert stays the way back.
        const saving = liveSaveState(draft);
        if (saving?.kind === "failed") return {kind: "saveFailed", saving};
        if (!draft.live.unsaved && !draft.dirty) return null;
        return draft.live.mode === LIVE && !draft.live.slaveRefused ? {kind: "liveEdit", saving} : {kind: "livePreview"};
    }
    return draft.dirty ? {kind: "review"} : null;
}

// Whether `text`, a failure's notice or the keyboard's own error, is what a
// failed Apply's bar already says, so the rail leaves it to the bar: an Apply
// cut short's notice is its verdict, why and what to do
// (core/session/portable-profile-session.js withFailure), one refused before
// anything was sent says "Failed:" and why, and the keyboard's error is the
// why alone. Any other text, or one saying more, is the rail's to show.
/** @param {CommitBar | null} bar @param {string | null | undefined} text */
export function barSaysNotice(bar, text) {
    const failure = bar?.kind === "failed" ? bar.apply.failure : null;
    if (!failure || !text) return false;
    return text === [failure.verdict, failure.reason, ...(failure.advice || [])].filter(Boolean).join(" ")
        || text === `Failed: ${failure.reason}` || text === failure.reason;
}

// Why the bar's Restart is off, said beside it, or "" while it can restart:
// a restart needs the keyboard there to take it.
/** @param {Pick<import("../../contracts/panel.js").DraftView, "connected">} draft */
export const restartOffReason = (draft) => (draft.connected ? "" : "Connect the keyboard to restart it.");
