// @ts-check
// Switching the edit mode from the rail's keyboard menu, the question
// switching asks, and the question a live edit asks before it adds a trap or
// warning.

import * as controls from "../view/controls.mjs";
import {el, esc} from "../lib/dom.mjs";
import {getModel, post, render as rerender, state} from "../store.mjs";
import {questionWords, switchQuestion} from "../view/edit-mode.mjs";
import {editModeWords} from "../view/vocabulary.mjs";
import {checksToConfirm, confirmText} from "../view/checks.mjs";

// Choosing a mode in the rail's keyboard menu: what switching has to ask
// first opens as a question; otherwise the mode is posted at once. Choosing
// the mode on already settles halves that stored different ones.
/** @param {number} mode */
export function chooseMode(mode) {
    const question = switchQuestion(getModel(), mode);
    if (question) {
        state.modeAsk = {mode, question};
        state.overlay = "editMode";
        rerender();
        return;
    }
    post(controls.setEditMode(/** @type {0 | 1 | 2} */ (mode)));
}

export function editModeOverlay() {
    const ask = state.modeAsk, model = getModel();
    if (state.overlay !== "editMode" || !ask || !model?.draft) return null;
    const words = questionWords(ask.question, model.draft.changes.length,
        {mode: ask.mode, from: model.editMode?.mode, label: editModeWords(model, ask.mode).label, checks: checksToConfirm(model.draft.checks)});
    const node = el(`<div class="scrim"><div class="sheet edit-mode-ask" role="alertdialog" aria-modal="true" aria-label="${esc(words.title)}">
        <div class="sheet-h"><h2>${esc(words.title)}</h2></div>
        <div class="sheet-b"><p>${esc(words.detail)}</p>${words.checks.length
            ? `<ul class="live-ask-checks">${words.checks.map((check) => `<li><i class="dot ${check.level === "trap" ? "err" : "warn"}"></i> ${esc(check.title)}</li>`).join("")}</ul>` : ""}</div>
        <div class="sheet-f"><button class="btn ghost" data-act="cancel">Cancel</button>
            <span class="right">${words.answers.map((answer) => `<button class="btn${answer.primary ? " primary" : ""}" data-pending="${esc(answer.pending)}">${esc(answer.label)}</button>`).join("")}</span></div>
    </div></div>`);
    const close = () => {state.overlay = null; state.modeAsk = null; rerender();};
    node.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const answer = /** @type {HTMLButtonElement | null} */ (target.closest("[data-pending]"));
        if (answer) {
            const pending = /** @type {'save' | 'revert' | 'send' | 'discard'} */ (answer.dataset.pending);
            post(controls.setEditMode(/** @type {0 | 1 | 2} */ (ask.mode), pending, (pending === "save" || pending === "send") && words.checks.length > 0));
            close();
        } else if (event.target === node || target.closest('[data-act="cancel"]')) close();
    });
    return node;
}

// A live edit that would add a trap or warning waits here, unsent, until the
// person sends it anyway or goes back (plan answer 2).
export function liveProposalOverlay() {
    const model = getModel(), proposal = model?.liveProposal;
    if (!proposal || state.overlay === "review") return null;
    const hasTrap = proposal.checks.some((check) => check.level === "trap");
    const node = el(`<div class="scrim"><div class="sheet live-ask ${hasTrap ? "trap" : "warning"}" role="alertdialog" aria-modal="true" aria-label="Confirm this edit">
        <div class="sheet-h"><h2>${hasTrap ? "This edit adds a trap" : "This edit adds a warning"}</h2></div>
        <div class="sheet-b"><p>${esc(proposal.label ? `${proposal.label}. ` : "")}${esc(confirmText(proposal.checks, "send"))}</p>
            <ul class="live-ask-checks">${proposal.checks.map((check) => `<li><i class="dot ${check.level === "trap" ? "err" : "warn"}"></i> ${esc(check.title)}</li>`).join("")}</ul>
            <p class="note">Nothing has been sent. Sent, it takes effect on the keyboard at once; Revert or a replug puts back what is saved.</p></div>
        <div class="sheet-f"><button class="btn ghost" data-act="back">Go back</button>
            <span class="right"><button class="btn primary" data-act="send">Send anyway</button></span></div>
    </div></div>`);
    node.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        if (target.closest('[data-act="send"]')) post(controls.confirmLiveEdit(proposal.id));
        else if (event.target === node || target.closest('[data-act="back"]')) post(controls.cancelLiveEdit(proposal.id));
    });
    return node;
}
