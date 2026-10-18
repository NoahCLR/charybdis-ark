// @ts-check
// The shell: who the keyboard is, where you are, and the one gate every change
// passes through on its way to the device.

// Selector assertions refer to elements created by this module's authored markup.
import * as controls from "../view/controls.mjs";
import {el, esc} from "../lib/dom.mjs";
import {getModel, post, postLeavingDemo, render, setPreference, state} from "../store.mjs";
import {halvesWords, phaseWords} from "../view/vocabulary.mjs";
import {statusBesideCount} from "../view/review.mjs";
import {busyText, postApplyReadText, screenAvailable} from "../view/readiness.mjs";
import {isScreenId, screenGroups} from "../view/screens.mjs";
import {buildLine, chooseKeyboard, forgetKeyboard, commitUrl, githubMark, hostOf, themeLabel} from "../view/host.mjs";
import {boardOutlineMarkup} from "../view/geometry.mjs";
import {demoOf} from "../view/demo.mjs";
import {openHistory} from "./history.mjs";

// The review opens at once; the host marks it reviewed when it answers.
function openReview() {
    state.overlay = "review";
    post(controls.control("reviewProfileDraft"));
    render();
}

export function rail() {
    const model = getModel();
    /** @type {Partial<import("../../contracts/panel.js").PublishedModel["device"]>} */
    const device = model?.device || {};
    /** @type {Partial<import("../../contracts/panel.js").PublishedModel["device"]["health"]>} */
    const health = device.health || {};
    const draft = model?.draft;
    const host = hostOf(model);
    const demo = demoOf(model);
    const devices = model?.devices || [];
    // A keyboard that went to take its new name is shown under it, coming back.
    const reconnecting = model?.reconnecting;
    // With more than one keyboard, the keyboard's name is where to pick another.
    const name = reconnecting ? `<span class="rail-product">${esc(reconnecting.name || "Charybdis")}</span>` : devices.length > 1 ? `<select class="rail-product rail-picker" id="rail-device-picker" data-f="rail:device" data-act="select-device"
                aria-label="Keyboard" title="${esc(device.label || "")}" ${health.busy ? "disabled" : ""}>
                ${devices.map((entry) => `<option value="${esc(entry.id)}" ${entry.id === model?.selectedDeviceId ? "selected" : ""}>${esc(entry.label)}</option>`).join("")}
            </select>` : `<span class="rail-product">${esc(device.label || "No keyboard connected")}</span>`;
    /** @param {string} tone @param {string} text @param {string} tip */
    const line = (tone, text, tip) =>
        `<div class="stat" data-tip="${esc(tip)}"><i class="dot ${tone}"></i> ${esc(text)}</div>`;

    // The keyboard's line never changes shape: what it is doing and whether
    // its halves agree are the dot's colour, said in words on hover. The
    // screen and the Device tab say the rest, with Read where it helps.
    const busyWords = health.busy ? `${phaseWords(model, health.phase)?.label || "Working"}. ` : "";
    const halves = halvesWords(model, health.halves);
    // The status chip says it in words: the halves' state, or that nothing
    // (or the demo) is connected; its tip says the rest.
    const keyboardDot = demo.active
        ? {tone: "demo", words: "Demo", tip: "Nothing is connected. The demo runs Ark's own draft over a demo setup; only Apply needs a keyboard."}
        : reconnecting ? {tone: "", words: "Reconnecting", tip: "Reconnecting so the keyboard takes its new name. It comes back by itself in a moment."}
        : !device.connected ? {tone: "", words: "Not connected", tip: "No keyboard is connected."}
        : {tone: health.halves === "agree" ? "ok" : health.halves === "unread" ? "" : "warn", words: halves.label, tip: `${busyWords}${halves.label}. ${halves.detail}`};

    const nav = screenGroups().map((group) => `<div class="rail-group">${esc(group.group)}</div>` + group.items.map(({id, definition}) => `
        <button class="nav-item" data-screen="${id}" aria-current="${state.screen === id}"
            ${screenAvailable(model, id) ? "" : "disabled"}>
            ${definition.icon}<span>${esc(definition.label)}</span>
        </button>`).join("")).join("");

    const node = el(`<aside class="rail">
        <div class="rail-device">
            <div class="rail-brand">${boardOutlineMarkup("rail-board")}<span class="rail-mark">Charybdis Ark</span></div>
            <div class="rail-keyboard">
                ${name}
                <span class="rail-chip" data-tip="${esc(keyboardDot.tip)}">
                    <i class="dot ${keyboardDot.tone}${(health.busy || reconnecting) && !demo.active ? " busy" : ""}" data-tip="${esc(keyboardDot.tip)}"></i>
                    <span>${esc(keyboardDot.words)}</span></span></div>
            ${host.chooseKeyboard ? `<div class="rail-choose">
                <button class="btn tiny" data-act="choose-keyboard" ${health.busy ? "disabled" : ""}
                    data-tip="Pick a Charybdis in the browser's list. Once chosen, it reconnects by itself next time.">Choose keyboard</button>
                ${device.connected && !demo.active ? `<button class="btn tiny ghost" data-act="forget-keyboard" ${health.busy ? "disabled" : ""}
                    data-tip="Let go of this keyboard. The page will not open it again until you choose it.">Disconnect</button>` : ""}</div>` : ""}
            <div class="rail-status">
                ${demo.active ? "" : health.restartNeeded
                    ? line("err", "Restart the keyboard",
                        "The slave half did not confirm a cancelled save, so the keyboard refuses new saves. Unplug the USB cable (not the cable between the halves), wait a few seconds and plug it back in. Nothing was lost.")
                    : health.recoveryPending ? line("warn", "Save in progress", "The keyboard keeps a copy of its previous profile until both halves confirm a save.") : ""}
            </div>
        </div>
        <nav class="rail-nav">${nav}</nav>
        ${host.progress ? `<div class="rail-progress" role="status">${spinner()}<span>${esc(host.progress)}</span></div>` : ""}
        ${railMessage()}
        <div class="rail-foot">
            ${draft ? `<button class="btn text rail-history" data-act="history"
                data-tip="Every step of the draft, newest first, with what each one changed. Go back or forward to any of them.">Draft history${draft.historyLength > 1 ? ` <span class="c">${draft.historyLength - 1}</span>` : ""}</button>
            <button class="btn text icon" data-act="undo" ${draft.canUndo ? "" : "disabled"} aria-label="Undo" aria-keyshortcuts="Meta+Z"
                data-tip="${esc(draft.undoLabel ? `Undo: ${draft.undoLabel} (⌘Z)` : "Undo the last edit in the draft (⌘Z). The keyboard is not touched until you apply.")}">↺</button>
            <button class="btn text icon" data-act="redo" ${draft.canRedo ? "" : "disabled"} aria-label="Redo" aria-keyshortcuts="Shift+Meta+Z"
                data-tip="${esc(draft.redoLabel ? `Redo: ${draft.redoLabel} (⇧⌘Z)` : "Redo the edit you just undid (⇧⌘Z).")}">↻</button>` : ""}
            ${railMenu(host)}
        </div>
    </aside>`);

    /** @type {NodeListOf<HTMLElement>} */ (node.querySelectorAll("[data-screen]")).forEach((button) => button.addEventListener("click", () => {
        const id = button.dataset.screen;
        if (!isScreenId(id)) return;
        state.screen = id;
        render();
    }));
    /** @type {HTMLButtonElement | null} */ (node.querySelector('[data-act="dismiss"]'))?.addEventListener("click", () => { state.notice = ""; state.error = ""; render(); });
    // From the demo, reading or choosing a keyboard leaves it, asking first.
    /** @type {HTMLButtonElement | null} */ (node.querySelector('[data-act="choose-keyboard"]'))?.addEventListener("click", () => postLeavingDemo(chooseKeyboard()));
    /** @type {HTMLButtonElement | null} */ (node.querySelector('[data-act="forget-keyboard"]'))?.addEventListener("click", () => post(forgetKeyboard()));
    /** @type {HTMLSelectElement | null} */ (node.querySelector('[data-act="select-device"]'))?.addEventListener("change", (event) => post(controls.selectDevice(/** @type {HTMLSelectElement} */ (event.target).value)));
    /** @type {HTMLButtonElement | null} */ (node.querySelector('[data-act="more"]'))?.addEventListener("click", () => { state.railMenu = !state.railMenu; render(); });
    /** @type {HTMLInputElement | null} */ (node.querySelector('[data-act="show-keycodes"]'))?.addEventListener("change", (event) => {
        setPreference("showKeycodes", /** @type {HTMLInputElement} */ (event.target).checked);
        render();
    });
    // Draft history, undo and redo show once there is a draft to step through.
    /** @type {HTMLButtonElement | null} */ (node.querySelector('[data-act="history"]'))?.addEventListener("click", openHistory);
    /** @type {HTMLButtonElement | null} */ (node.querySelector('[data-act="undo"]'))?.addEventListener("click", () => post(controls.control("undoProfileDraft")));
    /** @type {HTMLButtonElement | null} */ (node.querySelector('[data-act="redo"]'))?.addEventListener("click", () => post(controls.control("redoProfileDraft")));
    return node;
}

// The subtitle is one line; a window too narrow for it ends it in an
// ellipsis and keeps the whole of it as the line's tooltip.
/** @param {string} title @param {string} subtitle @param {string} [actions] */
export const topbar = (title, subtitle, actions = "") => `<header class="topbar">
    <div><h1>${esc(title)}</h1><p class="sub" title="${esc(subtitle)}">${esc(subtitle)}</p></div>
    ${actions ? `<div class="topbar-actions">${actions}</div>` : ""}
</header>`;

const THEME_ICONS = {
    dark: '<svg viewBox="0 0 16 16"><path d="M13.2 10.1A5.6 5.6 0 0 1 5.9 2.8a5.6 5.6 0 1 0 7.3 7.3z"/></svg>',
    light: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="2.8"/><path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1"/></svg>',
};
/** @param {import("../../contracts/model.js").HostPanel} host */
function themeToggle(host) {
    const theme = host.theme;
    if (!theme) return "";
    return `<button class="btn text theme-toggle" data-act="theme" data-theme-now="${esc(theme)}">${THEME_ICONS[theme]}<span>${esc(themeLabel(theme))}</span></button>`;
}

// The rail's "⋯" menu: how the panel is shown, and which build it is. The
// theme is there where the host leaves it to the panel (a web page); VS Code
// sets its own. Show keycodes is remembered per host (view/preferences.mjs).
/** @param {import("../../contracts/model.js").HostPanel} host */
function railMenu(host) {
    const open = state.railMenu;
    return `<div class="rail-more">
        <button class="btn text icon" data-act="more" aria-label="More options" aria-haspopup="true" aria-expanded="${open}"
            data-tip="Theme, Show keycodes and this build">⋯</button>
        ${open ? `<div class="rail-menu" role="group" aria-label="More options">
            ${themeToggle(host)}
            <label class="sw" data-tip="Show the QMK keycode beside each key's name, everywhere in Ark. The key you are editing always shows its own.">
                <input type="checkbox" data-f="rail:show-keycodes" data-act="show-keycodes" ${state.showKeycodes ? "checked" : ""}><span class="track"></span>
                <span class="txt">Show keycodes</span></label>
            ${railBuild(host.build)}
        </div>` : ""}
    </div>`;
}

// What the keyboard or the host last said — a read, a save, a refusal — sits
// in the rail's free space above the draft history: not over the screen being
// worked in, and below the navigation so nothing moves when it appears.
// The build the page came from, as a link to its commit on GitHub, in a new
// tab so the draft stays where it is.
/** @param {import("../../contracts/model.js").HostPanel["build"]} build */
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
               <span class="ap-bytes" style="min-width:${`${apply.bytes.total} / ${apply.bytes.total} bytes`.length}ch">${apply.bytes.completed} / ${apply.bytes.total} bytes</span>` : "";
        return `<li class="${step.state}"><span class="mark">${step.state === "active" ? spinner() : ""}</span>
            <span class="lbl">${esc(step.label)}</span>
            ${current && (apply.detail || counted) ? `<span class="ap-detail"><span class="ap-text" title="${esc(apply.detail)}">${esc(apply.detail)}</span>${counted}</span>` : ""}</li>`;
    }).join("");
    return `<ol class="ap-steps">${rows}</ol>`;
}

// The host republishes the panel for every read page. Start each replacement
// at the same document-time phase so the spinner keeps rotating smoothly.
function spinner() {
    const time = Number(document.timeline?.currentTime ?? performance.now());
    return `<span class="spin" aria-hidden="true" style="animation-delay:-${Math.round(time % 800)}ms"></span>`;
}

/** @type {Readonly<Record<string, string>>} */
const SAVED_VERDICT = {
    none: "Nothing was saved. The keyboard kept the profile it had.",
    unknown: "The keyboard may have saved part of it. Read the keyboard to see what it runs now.",
};

export function commitBar() {
    const model = getModel();
    const draft = model?.draft;
    const apply = model?.apply;
    if (!draft) return null;

    if (draft.busy && apply?.state === "applying") {
        const index = apply.steps.findIndex((step) => step.state === "active");
        return el(`<div class="commit applying ap">
            <div class="ap-head"><strong>Applying to the keyboard</strong>
                <span class="muted">step ${index + 1} of ${apply.steps.length}</span></div>
            ${applySteps(apply)}
            <div class="note">The keyboard keeps running its saved profile until both halves confirm.</div></div>`);
    }
    if (draft.busy && apply?.state === "done") {
        return el(`<div class="commit applying readback" role="status" aria-live="polite">
            ${spinner()}<strong>Applied — reading back the keyboard</strong>
            <span class="readback-detail">${esc(postApplyReadText(model.postApplyRead))}</span>
            <span class="readback-note">Editing resumes when this read finishes.</span></div>`);
    }
    // A failed Apply stays on screen until it is dismissed, so where it
    // stopped and why can be read after the fact.
    if (!draft.busy && apply?.state === "failed" && state.applyDismissed !== apply.id) {
        const node = el(`<div class="commit ap failed">
            <div class="ap-head"><i class="dot err"></i><strong>Apply stopped at: ${esc(apply.failure?.label)}</strong></div>
            <p class="ap-reason">${esc(apply.failure?.reason)}</p>
            <p class="ap-saved">${esc(SAVED_VERDICT[apply.failure?.saved ?? ""] || SAVED_VERDICT.unknown)}</p>
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

    if (draft.busy) {
        const busy = busyText(model?.device?.health?.phase, model);
        return el(`<div class="commit applying">
            <span class="n">${spinner()} <strong>Working with the keyboard</strong>
            <span class="muted">${esc(busy.detail)}</span></span>
            ${busy.writes ? `<span class="sep"></span>
            <span class="note">the keyboard keeps running its saved profile until both halves confirm</span>` : ""}</div>`);
    }
    if (!draft.matching) {
        const node = el(`<div class="commit draft">
            <span class="n"><i class="dot draft"></i> <strong>Draft belongs to another keyboard</strong>
            <span class="muted">${draft.changes.length} change${draft.changes.length === 1 ? "" : "s"} kept locally. Select that keyboard to continue${model?.device?.connected ? ", or discard the draft here" : ""}.</span></span>
            <span class="sep"></span>
            ${model?.device?.connected ? '<button class="btn ghost" data-act="discard">Discard draft</button>' : ""}</div>`);
        /** @type {HTMLButtonElement | null} */ (node.querySelector('[data-act="discard"]'))?.addEventListener("click", () => post(controls.control("discardProfileDraft")));
        return node;
    }
    if (draft.stale) {
        const node = el(`<div class="commit draft">
            <span class="n"><i class="dot draft"></i> <strong>${draft.connectionChanged ? "Keyboard connection changed" : "The keyboard changed"}</strong>
            <span class="muted">${draft.connectionChanged ? "Review the current keyboard before continuing" : "since this draft began"} — your ${draft.changes.length} change${draft.changes.length === 1 ? "" : "s"} are kept</span></span>
            <span class="sep"></span>
            <button class="btn" data-act="rebase">Review against the keyboard</button>
            <button class="btn ghost" data-act="discard">Discard draft</button></div>`);
        /** @type {HTMLButtonElement} */ (node.querySelector('[data-act="rebase"]')).addEventListener("click", () => post(controls.control("rebaseProfileDraft")));
        /** @type {HTMLButtonElement} */ (node.querySelector('[data-act="discard"]')).addEventListener("click", () => post(controls.control("discardProfileDraft")));
        return node;
    }
    if (!draft.dirty) return null;

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
            data-tip="${demo ? "Put every change back to the demo setup." : "Put every change back to what the keyboard holds."} Undo (⌘Z) brings them back.">Discard all</button>
        <button class="btn primary" data-act="review"
            data-tip="${demo ? "See every change and what the checks find. Apply needs a keyboard; Save a backup file… keeps the setup." : "See every change, then write the draft to both halves as one generation."}">${demo ? "Review changes" : "Review and apply"}</button></div>`);
    /** @type {HTMLButtonElement} */ (node.querySelector('[data-act="review"]')).addEventListener("click", openReview);
    /** @type {HTMLButtonElement} */ (node.querySelector('[data-act="discard"]')).addEventListener("click", () => post(controls.control("discardProfileDraft")));
    return node;
}

// Read-only reasons, said plainly where the control is.
/** @param {import("../../contracts/panel.js").PublishedModel | null} model */
export function unavailable(model) {
    if (!model?.device?.connected && !demoOf(model).active) return hostOf(model).blocked?.title || hostOf(model).words.noKeyboard || "";
    if (!model?.layers?.length) return "Nothing has been read from the keyboard yet. Choose Read keyboard.";
    if (!model?.draft) return "The keyboard's complete profile could not be read, so edits cannot be drafted here. Read the keyboard again.";
    if (!model.draft.matching) return "The local draft belongs to another keyboard. Select it again or discard the draft here.";
    if (model.draft.stale) return "Review the draft against the current keyboard before editing further.";
    return "";
}
