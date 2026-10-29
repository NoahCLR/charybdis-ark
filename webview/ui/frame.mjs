// @ts-check
// The frame: who the keyboard is, where you are, and the one gate every change
// passes through on its way to the device.

// Selector assertions refer to elements created by this module's authored markup.
import * as controls from "../view/controls.mjs";
import {el, esc} from "../lib/dom.mjs";
import {getModel, post, render, state} from "../store.mjs";
import {changesKept, statusBesideCount} from "../view/review.mjs";
import {postApplyReadText} from "../view/readiness.mjs";
import {isScreenId, screenAvailable, screenGroups} from "../view/screens.mjs";
import {buildLine, commitUrl, githubMark, shellOf, themeLabel} from "../view/shell-panel.mjs";
import {boardOutlineMarkup} from "../view/geometry.mjs";
import {demoOf} from "../view/demo.mjs";
import {openHistory} from "./history.mjs";
import {bindKeyboardMenu, keyboardMenu} from "./keyboard-menu.mjs";
import {restartOffer} from "../view/edit-mode.mjs";
import {commitBarState} from "../view/commit-bar.mjs";
import {ariaShortcut, shortcut} from "../view/shortcuts.mjs";

// The review opens at once; the core marks it reviewed when it answers.
function openReview() {
    state.overlay = "review";
    post(controls.control("reviewProfileDraft"));
    render();
}

export function rail() {
    const model = getModel();
    const draft = model?.draft;
    const shell = shellOf(model);

    const nav = screenGroups().map((group) => `<div class="rail-group">${esc(group.group)}</div>` + group.items.map(({id, definition}) => `
        <button class="nav-item" data-screen="${esc(id)}" aria-current="${state.screen === id}"
            ${screenAvailable(model, id) ? "" : "disabled"}>
            ${definition.icon}<span>${esc(definition.label)}</span>
        </button>`).join("")).join("");

    const node = el(`<aside class="rail">
        <div class="rail-device">
            ${boardOutlineMarkup("rail-board")}
            <div class="rail-mark">Charybdis Ark</div>
            ${keyboardMenu()}
        </div>
        <nav class="rail-nav">${nav}</nav>
        ${shell.progress ? `<div class="rail-progress" role="status">${spinner()}<span>${esc(shell.progress)}</span></div>` : ""}
        ${railMessage()}
        ${draft ? `<div class="rail-foot">
            <button class="btn tiny ghost rail-history" data-act="history"
                data-tip="Every step of the draft, newest first, with what each one changed. Go back or forward to any of them.">Draft history${draft && draft.historyLength > 1 ? ` <span class="c">${draft.historyLength - 1}</span>` : ""}</button>
            <button class="btn tiny ghost icon" data-act="undo" aria-label="Undo" aria-keyshortcuts="${ariaShortcut("Z")}" ${draft?.canUndo ? "" : "disabled"}
                data-tip="${esc(draft?.undoLabel ? `Undo: ${draft.undoLabel} (${shortcut("Z")})${draft.live ? ". The keyboard takes it back at once." : ""}` : draft?.live ? `Undo the last edit (${shortcut("Z")}). The keyboard takes it back at once.` : `Undo the last edit in the draft (${shortcut("Z")}). The keyboard is not touched until you save.`)}">↺</button>
            <button class="btn tiny ghost icon" data-act="redo" aria-label="Redo" aria-keyshortcuts="${ariaShortcut("Z", {shift: true})}" ${draft?.canRedo ? "" : "disabled"}
                data-tip="${esc(draft?.redoLabel ? `Redo: ${draft.redoLabel} (${shortcut("Z", {shift: true})})` : `Redo the edit you just undid (${shortcut("Z", {shift: true})}).`)}">↻</button>
        </div>` : ""}
        ${railBuild(shell.build)}
    </aside>`);

    /** @type {NodeListOf<HTMLElement>} */ (node.querySelectorAll("[data-screen]")).forEach((button) => button.addEventListener("click", () => {
        const id = button.dataset.screen;
        if (!isScreenId(id)) return;
        state.screen = id;
        render();
    }));
    /** @type {HTMLButtonElement | null} */ (node.querySelector('[data-act="dismiss"]'))?.addEventListener("click", () => { state.notice = ""; state.error = ""; render(); });
    bindKeyboardMenu(node);
    // Draft history, undo and redo show once there is a draft to step through.
    /** @type {HTMLButtonElement | null} */ (node.querySelector('[data-act="history"]'))?.addEventListener("click", openHistory);
    /** @type {HTMLButtonElement | null} */ (node.querySelector('[data-act="undo"]'))?.addEventListener("click", () => post(controls.control("undoProfileDraft")));
    /** @type {HTMLButtonElement | null} */ (node.querySelector('[data-act="redo"]'))?.addEventListener("click", () => post(controls.control("redoProfileDraft")));
    return node;
}

// The theme toggle sits at the top right of every screen, the Keyboard
// screen's own header included.
/** @param {string} title @param {string} subtitle @param {string} [actions] */
export const topbar = (title, subtitle, actions = "") => `<header class="topbar">
    <div><h1>${esc(title)}</h1><p class="sub">${esc(subtitle)}</p></div>
    <div class="topbar-actions">${actions}${themeToggle()}</div>
</header>`;

const THEME_ICONS = {
    dark: '<svg viewBox="0 0 16 16"><path d="M13.2 10.1A5.6 5.6 0 0 1 5.9 2.8a5.6 5.6 0 1 0 7.3 7.3z"/></svg>',
    light: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="2.8"/><path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1"/></svg>',
};
export function themeToggle() {
    const theme = shellOf(getModel()).theme;
    return `<button class="btn tiny ghost icon theme-toggle" data-act="theme" data-theme-now="${esc(theme)}"
        aria-label="${esc(themeLabel(theme))}" data-tip="${esc(themeLabel(theme))}">${THEME_ICONS[theme]}</button>`;
}

// What the keyboard or the shell last said — a read, a save, a refusal — sits
// in the rail's free space above the draft history: not over the screen being
// worked in, and below the navigation so nothing moves when it appears.
// The build the page came from, as a link to its commit on GitHub, in a new
// tab so the draft stays where it is.
/** @param {import("../../contracts/model.js").ShellPanel["build"]} build */
function railBuild(build) {
    if (!build) return "";
    const url = commitUrl(build);
    return url
        ? `<a class="rail-build" href="${esc(url)}" target="_blank" rel="noopener" title="This build's commit on GitHub">${githubMark("rail-build-mark")}<span>${esc(buildLine(build))}</span></a>`
        : `<div class="rail-build"><span>${esc(buildLine(build))}</span></div>`;
}

function railMessage() {
    const model = getModel();
    const error = state.error || model?.device?.health?.error;
    const message = error || state.notice;
    if (!message) return "";
    return `<div class="rail-message ${error ? "err" : ""}" role="status">
        <span>${esc(message)}</span>
        <button class="btn tiny ghost icon" data-act="dismiss" aria-label="Dismiss">✕</button></div>`;
}

// One Apply's steps, as the keyboard reports them. The running step carries
// what it is doing now and, where there is one, how many bytes are through.
/** @param {import("../../contracts/model.js").ApplyView} apply */
function applySteps(apply) {
    const rows = apply.steps.map((step) => {
        const current = step.state === "active";
        const counted = current && apply.bytes
            ? `<span class="ap-bar"><i style="width:${Math.round((apply.bytes.completed / apply.bytes.total) * 100)}%"></i></span>
               <span class="ap-bytes" style="min-width:${`${apply.bytes.total} / ${apply.bytes.total} bytes`.length}ch">${esc(apply.bytes.completed)} / ${esc(apply.bytes.total)} bytes</span>` : "";
        return `<li class="${esc(step.state)}"><span class="mark">${step.state === "active" ? spinner() : ""}</span>
            <span class="lbl">${esc(step.label)}</span>
            ${current && (apply.detail || counted) ? `<span class="ap-detail"><span class="ap-text" title="${esc(apply.detail)}">${esc(apply.detail)}</span>${counted}</span>` : ""}</li>`;
    }).join("");
    return `<ol class="ap-steps">${rows}</ol>`;
}

// The core republishes the panel for every read page. Start each replacement
// at the same document-time phase so the spinner keeps rotating smoothly.
function spinner() {
    const time = Number(document.timeline?.currentTime ?? performance.now());
    return `<span class="spin" aria-hidden="true" style="animation-delay:-${Math.round(time % 800)}ms"></span>`;
}

// The bar commitBarState names, drawn with what it does.
export function commitBar() {
    const model = getModel();
    const bar = commitBarState(model, state);
    const draft = model?.draft;
    if (!bar || !model || !draft) return null;

    if (bar.kind === "applying") {
        return el(`<div class="commit applying ap">
            <div class="ap-head"><strong>Saving to the keyboard</strong>
                <span class="muted">step ${esc(bar.step)} of ${bar.apply.steps.length}</span></div>
            ${applySteps(bar.apply)}
            <div class="note">The keyboard keeps running its saved profile until both halves confirm.</div></div>`);
    }
    if (bar.kind === "readback") {
        return el(`<div class="commit applying readback" role="status" aria-live="polite">
            ${spinner()}<strong>Saved — reading back the keyboard</strong>
            <span class="readback-detail">${esc(postApplyReadText(model, model.postApplyRead))}</span>
            <span class="readback-note">Editing resumes when this read finishes.</span></div>`);
    }
    // What was saved is core's verdict, in the words the notice starts with too.
    if (bar.kind === "failed") {
        const apply = bar.apply;
        const node = el(`<div class="commit ap failed">
            <div class="ap-head"><i class="dot err"></i><strong>Save stopped at: ${esc(apply.failure?.label)}</strong></div>
            <p class="ap-reason">${esc(apply.failure?.reason)}</p>
            <p class="ap-saved">${esc(apply.failure?.verdict)}</p>
            ${applySteps(apply)}
            <div class="ap-actions"><button class="btn ghost tiny" data-act="dismiss">Dismiss</button>
                <button class="btn tiny" data-act="read">Read keyboard</button></div></div>`);
        /** @type {HTMLButtonElement} */ (node.querySelector('[data-act="dismiss"]')).addEventListener("click", () => {
            state.applyDismissed = apply.id;
            render();
        });
        /** @type {HTMLButtonElement} */ (node.querySelector('[data-act="read"]')).addEventListener("click", () => post(controls.control("refresh")));
        return node;
    }

    // What to let go of, and Cancel edit for an edit.
    if (bar.kind === "held") {
        const wait = bar.wait;
        const node = el(`<div class="commit applying held" role="status" aria-live="polite">
            <span class="n">${spinner()} <strong>${esc(wait.title)}</strong>
            <span class="muted">${esc(wait.detail)}</span></span>
            ${wait.cancellable ? `<span class="sep"></span>
            <button class="btn ghost" data-act="cancel-edit" data-tip="Cancel this edit. The keyboard keeps running what it ran before.">Cancel edit</button>` : ""}</div>`);
        /** @type {HTMLButtonElement | null} */ (node.querySelector('[data-act="cancel-edit"]'))?.addEventListener("click", () => post(controls.abortLiveEdit()));
        return node;
    }
    if (bar.kind === "busy") {
        return el(`<div class="commit applying">
            <span class="n">${spinner()} <strong>Working with the keyboard</strong>
            <span class="muted">${esc(bar.busy.detail)}</span></span>
            ${bar.busy.writes ? `<span class="sep"></span>
            <span class="note">the keyboard keeps running its saved profile until both halves confirm</span>` : ""}</div>`);
    }
    if (bar.kind === "otherKeyboard") {
        const node = el(`<div class="commit draft">
            <span class="n"><i class="dot draft"></i> <strong>Draft belongs to another keyboard</strong>
            <span class="muted">${draft.changes.length} change${draft.changes.length === 1 ? "" : "s"} kept locally. Select that keyboard to continue${model.device?.connected ? ", or discard the draft here" : ""}.</span></span>
            <span class="sep"></span>
            ${model.device?.connected ? '<button class="btn ghost" data-act="discard">Discard draft</button>' : ""}</div>`);
        /** @type {HTMLButtonElement | null} */ (node.querySelector('[data-act="discard"]'))?.addEventListener("click", () => post(controls.control("discardProfileDraft")));
        return node;
    }
    if (bar.kind === "reread") {
        const node = el(`<div class="commit draft">
            <span class="n"><i class="dot draft"></i> <strong>${draft.connectionChanged ? "Keyboard connection changed" : "Read the keyboard again"}</strong>
            <span class="muted">the draft is what the keyboard runs, so Ark reads it again before the next edit</span></span>
            <span class="sep"></span>
            <button class="btn" data-act="rebase">Read keyboard</button></div>`);
        /** @type {HTMLButtonElement} */ (node.querySelector('[data-act="rebase"]')).addEventListener("click", () => post(controls.control("rebaseProfileDraft")));
        return node;
    }
    if (bar.kind === "stale") {
        const node = el(`<div class="commit draft">
            <span class="n"><i class="dot draft"></i> <strong>${draft.connectionChanged ? "Keyboard connection changed" : "The keyboard changed"}</strong>
            <span class="muted">${draft.connectionChanged ? "Review the current keyboard before continuing" : "since this draft began"} — ${esc(changesKept(draft.changes.length))}</span></span>
            <span class="sep"></span>
            <button class="btn" data-act="rebase">Review against the keyboard</button>
            <button class="btn ghost" data-act="discard">Discard draft</button></div>`);
        /** @type {HTMLButtonElement} */ (node.querySelector('[data-act="rebase"]')).addEventListener("click", () => post(controls.control("rebaseProfileDraft")));
        /** @type {HTMLButtonElement} */ (node.querySelector('[data-act="discard"]')).addEventListener("click", () => post(controls.control("discardProfileDraft")));
        return node;
    }
    if (bar.kind === "restart") return restartBar(draft, bar.offer);
    if (bar.kind === "saveFailed" || bar.kind === "liveEdit" || bar.kind === "livePreview") return liveCommitBar(draft, bar);

    // One way on: the review, where Apply lives. What the draft holds is said
    // by what happened to it, which fits where a list of areas did not. In the
    // demo the review has Export where Apply would be.
    const demo = demoOf(model).active;
    const node = el(`<div class="commit">
        <span class="n"><i class="dot draft"></i> <strong>${draft.changes.length} change${draft.changes.length === 1 ? "" : "s"}</strong>
        <span class="muted">in your draft</span></span>
        ${statusBesideCount(draft.changes) ? `<span class="peek"><span class="note">${esc(statusBesideCount(draft.changes))}</span></span>` : ""}
        <span class="sep"></span>
        <button class="btn ghost tiny" data-act="discard"
            data-tip="${demo ? "Put every change back to the demo profile." : "Put every change back to what the keyboard holds."} Undo (${shortcut("Z")}) brings them back.">Discard all</button>
        <button class="btn primary" data-act="review"
            data-tip="${demo ? "See every change and what the checks find. Saving needs a keyboard; Export profile keeps it as a backup." : "See every change, then save the draft to both halves as one generation."}">${demo ? "Review changes" : "Review and save"}</button></div>`);
    /** @type {HTMLButtonElement} */ (node.querySelector('[data-act="review"]')).addEventListener("click", openReview);
    /** @type {HTMLButtonElement} */ (node.querySelector('[data-act="discard"]')).addEventListener("click", () => post(controls.control("discardProfileDraft")));
    return node;
}

// A keyboard that stopped saving (firmware D-F34), for either half, or that
// needs a restart, in every edit mode. A live draft's unsaved edits are kept
// in a recovery copy and put back; a Review and save draft is Ark's own, so the
// restart leaves it as it is, and the bar still counts what it holds.
/** @param {NonNullable<import("../../contracts/panel.js").PublishedModel["draft"]>} draft @param {NonNullable<ReturnType<typeof restartOffer>>} offer */
function restartBar(draft, offer) {
    const tip = draft.live ? "Restart both halves. A recovery copy of any unsaved edits is saved first; the keyboard comes back in a moment and Ark puts them back."
        : "Restart both halves. Your draft stays as it is in Ark; the keyboard comes back in a moment and Ark reads it again.";
    const count = !draft.live && draft.dirty ? draft.changes.length : 0;
    const node = el(`<div class="commit${draft.live ? " live" : ""} ${offer.kind === "stopped" ? "stopped" : "restart-needed"}">
        <span class="n"><i class="dot err"></i> <strong>${esc(offer.title)}</strong>
        <span class="muted">${esc(offer.detail)}</span></span>
        ${count ? `<span class="peek"><span class="note">${count} change${count === 1 ? "" : "s"} in your draft</span></span>` : ""}
        <span class="sep"></span>
        <button class="btn primary" data-act="restart" ${draft.connected ? "" : "disabled"} data-tip="${esc(tip)}">Restart</button></div>`);
    /** @type {HTMLButtonElement} */ (node.querySelector('[data-act="restart"]')).addEventListener("click", () => post(controls.restartKeyboard()));
    return node;
}

// The live modes: the keyboard already runs the edits. In Live preview + save
// the review leads to Save; in Live edit the keyboard saves by itself, so the
// bar only says where that stands. Revert puts back what is saved (undo sends
// the edits again). When the keyboard's own save failed, the bar says so with
// Save again; when the halves are apart, Revert is the only way on.
/** @param {NonNullable<import("../../contracts/panel.js").PublishedModel["draft"]>} draft @param {Extract<import("../view/commit-bar.mjs").CommitBar, {kind: "saveFailed" | "liveEdit" | "livePreview"}>} bar */
function liveCommitBar(draft, bar) {
    const live = /** @type {NonNullable<typeof draft.live>} */ (draft.live);
    if (bar.kind === "saveFailed") {
        const saving = bar.saving;
        const node = el(`<div class="commit live ${esc(saving.kind)}">
            <span class="n"><i class="dot ${esc(saving.tone)}"></i> <strong>${esc(saving.title)}</strong>
            <span class="muted">${esc(saving.detail)}</span></span>
            <span class="sep"></span>
            <button class="btn ghost tiny" data-act="revert"
                data-tip="Put back the profile the keyboard has saved, on both halves. The saved profile stays as it is; Undo (${shortcut("Z")}) sends the edits again.">Revert</button>
            <button class="btn primary" data-act="save-again"
                data-tip="Ask the keyboard to save these edits again, after a recovery copy of what is saved now.">Save again</button></div>`);
        /** @type {HTMLButtonElement} */ (node.querySelector('[data-act="revert"]')).addEventListener("click", () => post(controls.revertDraft()));
        /** @type {HTMLButtonElement} */ (node.querySelector('[data-act="save-again"]')).addEventListener("click", () => post(controls.saveDraft()));
        return node;
    }
    if (bar.kind === "liveEdit") {
        const saving = bar.saving;
        const count = draft.changes.length;
        const node = el(`<div class="commit live auto">
            <span class="n"><i class="dot draft${saving?.kind === "saving" ? " busy" : ""}"></i> <strong>${esc(saving?.title || "Not saved yet")}</strong>
            <span class="muted">${esc(saving?.detail || "")}${live.converged ? "" : " The slave half is catching up."}</span></span>
            <span class="sep"></span>
            <button class="btn ghost tiny" data-act="revert"
                data-tip="Put back the profile the keyboard has saved. The saved profile stays as it is; Undo (${shortcut("Z")}) sends the edits again.">Revert</button>
            ${count ? `<button class="btn ghost tiny" data-act="review" data-tip="See what is not saved yet, against what is saved.">${count} change${count === 1 ? "" : "s"}</button>` : ""}</div>`);
        /** @type {HTMLButtonElement | null} */ (node.querySelector('[data-act="review"]'))?.addEventListener("click", openReview);
        /** @type {HTMLButtonElement} */ (node.querySelector('[data-act="revert"]')).addEventListener("click", () => post(controls.revertDraft()));
        return node;
    }
    const count = draft.changes.length;
    // Edits undone back to what is saved still leave the keyboard on its
    // working copy: Revert is then the way back, with nothing to review.
    const node = el(`<div class="commit live">
        <span class="n"><i class="dot draft"></i> <strong>${count ? `${count} unsaved change${count === 1 ? "" : "s"}` : "Unsaved edits"}</strong>
        <span class="muted">${count ? "running on the keyboard" : "match what is saved"}${live.slaveRefused ? " · the halves are apart" : live.converged ? "" : " · the slave half is catching up"}</span></span>
        ${statusBesideCount(draft.changes) ? `<span class="peek"><span class="note">${esc(statusBesideCount(draft.changes))}</span></span>` : ""}
        <span class="sep"></span>
        <button class="btn ${count && !live.slaveRefused ? "ghost tiny" : "primary"}" data-act="revert"
            data-tip="${live.slaveRefused ? `The slave half refused these edits, so they cannot be saved. Revert puts both halves back on the saved profile; Undo (${shortcut("Z")}) sends the edits again.`
                : `Put back the profile the keyboard has saved. The saved profile stays as it is; Undo (${shortcut("Z")}) sends the edits again.`}">Revert</button>
        ${count && !live.slaveRefused ? `<button class="btn primary" data-act="review"
            data-tip="See every unsaved change against what is saved, then save them on both halves.">Review and save</button>` : ""}</div>`);
    /** @type {HTMLButtonElement | null} */ (node.querySelector('[data-act="review"]'))?.addEventListener("click", openReview);
    /** @type {HTMLButtonElement} */ (node.querySelector('[data-act="revert"]')).addEventListener("click", () => post(controls.revertDraft()));
    return node;
}

// Read-only reasons, said plainly where the control is.
/** @param {import("../../contracts/panel.js").PublishedModel | null} model */
export function unavailable(model) {
    if (!model?.device?.connected && !demoOf(model).active) return shellOf(model).blocked?.title || shellOf(model).words.noKeyboard || "";
    if (!model?.layers?.length) return "Nothing has been read from the keyboard yet. Choose Read keyboard.";
    if (!model?.draft) return "The keyboard's complete profile could not be read, so edits cannot be drafted here. Read the keyboard again.";
    if (!model.draft.matching) return "The local draft belongs to another keyboard. Select it again or discard the draft here.";
    if (model.draft.stale) return "Review the draft against the current keyboard before editing further.";
    return "";
}
