// @ts-check
// Charybdis Ark — the webview.
//
// It renders the `model` the host posts and posts typed edits back. It holds
// no device state of its own: the draft lives in the host, so what is drawn is
// always what would be applied.

import {createPanelMessages} from "./messages.mjs";
import * as controls from "./view/controls.mjs";
import {el, esc} from "./lib/dom.mjs";
import {captureContentScroll, captureKeysBenchHeight, revealSelectedContentRow, revealSelectedListRow, restoreContentScroll, restoreKeysBenchHeight} from "./lib/scroll.mjs";
import {activateOnKey, captureFocus, focusDialog, restoreFocus, trapTab} from "./lib/focus.mjs";
import {mountNumberEntry} from "./lib/number-entry.mjs";
import {getModel, post, postLeavingDemo, setRenderer, state} from "./store.mjs";
import {historyAction} from "./view/edits.mjs";
import {chooseKeyboard, hostOf, otherTheme, setTheme} from "./view/host.mjs";
import {DEMO_WORDS, demoOf, leaveDemo, openDemo, openDemoProfile} from "./view/demo.mjs";
import {readScreen, screenAvailable} from "./view/readiness.mjs";
import {SCREENS, screenDefinition, secondaryScreen} from "./view/screens.mjs";
import {bindLayerIndex, hideHover, mountHover} from "./ui/hover.mjs";
import {pickerOverlay} from "./ui/picker.mjs";
import {keysShortcut, screenKeys} from "./ui/keys.mjs";
import {historyOverlay} from "./ui/history.mjs";
import {closeLayers} from "./ui/layers.mjs";
import {screenLighting} from "./ui/lighting.mjs";
import {screenSettings} from "./ui/settings.mjs";
import {screenMouse} from "./ui/mouse.mjs";
import {screenPointing} from "./ui/pointing.mjs";
import {screenMacros, receiveMacroValidation} from "./ui/macros.mjs";
import {reconcileRecording} from "./ui/macros/recorder.mjs";
import {macroClipboardShortcut, macroHistoryShortcut} from './ui/macros/history.mjs';
import {macroStepShortcut} from "./ui/macros/steps.mjs";
import {screenCustomKeys} from "./ui/custom-keys.mjs";
import {screenProfile} from "./ui/profile.mjs";
import {screenDevice} from "./ui/device.mjs";
import {reviewOverlay} from "./ui/review-overlay.mjs";
import {leaveDemoOverlay} from "./ui/leave-demo.mjs";
import {commitBar, rail, topbar} from "./ui/shell.mjs";

const root = /** @type {HTMLElement} */ (document.getElementById("root"));
/** @type {import("./view/screens.mjs").ScreenId | null} */
let renderedScreen = null;

const SCREEN_RENDERERS = {
    screenKeys, screenLighting, screenSettings, screenDevice, screenMouse,
    screenPointing, screenMacros, screenCustomKeys, screenProfile,
};

/** @param {{keepScreen?: boolean}} [options] */
function render({keepScreen = false} = {}) {
    reconcileRecording();
    const keptScreen = keepScreen && renderedScreen === state.screen ? root.querySelector(".app > .main") : null;
    const scroll = captureContentScroll(root, renderedScreen, state.screen);
    const benchHeight = captureKeysBenchHeight(root, renderedScreen, state.screen, state.resetBenchHeight);
    state.resetBenchHeight = false;
    const focus = captureFocus(root);
    hideHover();
    const model = getModel();
    root.replaceChildren();
    const demo = demoOf(model);
    const app = el(`<div class="app${demo.active ? " demo" : ""}"></div>`);
    if (demo.active) app.appendChild(demoBanner(demo));
    app.appendChild(rail());
    const read = screenAvailable(model, state.screen) ? null : readScreen(model, state.screen);
    const screen = keptScreen || (read ? readPlaceholder(read, model) : SCREENS[state.screen].render(SCREEN_RENDERERS));
    if (keptScreen) {
        keptScreen.querySelector(":scope > .commit")?.remove();
        const detail = keptScreen.querySelector(".read-placeholder > p");
        if (read && detail) detail.textContent = read.detail;
    }
    app.appendChild(screen);
    const bar = commitBar();
    if (bar) screen.appendChild(bar);
    root.appendChild(app);
    const theme = hostOf(model).theme;
    root.querySelector('[data-act="theme"]')?.addEventListener("click", () => post(setTheme(otherTheme(theme))));
    restoreKeysBenchHeight(root, benchHeight);
    restoreContentScroll(root, scroll);
    revealSelectedContentRow(root);
    revealSelectedListRow(root);
    renderedScreen = state.screen;

    const picker = pickerOverlay();
    if (picker) root.appendChild(picker);
    const review = reviewOverlay();
    if (review) root.appendChild(review);
    const history = historyOverlay();
    if (history) root.appendChild(history);
    const leave = leaveDemoOverlay();
    if (leave) root.appendChild(leave);
    restoreFocus(root, focus);
    focusDialog(root);
    reveal();
}

/** @param {NonNullable<ReturnType<typeof readScreen>>} read @param {import("../contracts/panel.js").PublishedModel | null} model */
function readPlaceholder(read, model) {
    const loading = read.state === "loading";
    // Without a keyboard, a host with a picker offers it first.
    const choose = hostOf(model).chooseKeyboard && !model?.device?.connected;
    // Without a keyboard the demo is offered beside it; a host that cannot
    // reach one at all still offers it, where the host says so.
    const demoHere = demoOf(model).offered && (read.state !== "blocked" || Boolean(hostOf(model).blocked?.demo));
    const screenTitle = screenDefinition(state.screen)?.title || "Keyboard";
    const secondary = secondaryScreen(model, state.screen);
    const screen = el(`<div class="main">${topbar(screenTitle, "Ark changes what your Charybdis does — keys, layers, lighting, macros and the trackball — and saves nothing until you review it.")}
        <div class="content"><div class="pad"><div class="read-placeholder" role="status" aria-live="polite">
            ${loading ? '<span class="spin" aria-hidden="true"></span>' : '<i class="dot err" aria-hidden="true"></i>'}
            <h2>${esc(read.title)}</h2><p>${esc(read.detail)}</p>
            ${loading ? '<p class="note">The menus open when their keyboard data is ready.</p>'
                : read.state === "blocked" ? (demoHere ? `<div class="read-actions">${exploreButton("primary")}</div>` : "")
                : `<div class="read-actions">${choose ? '<button class="btn primary" data-act="choose-keyboard">Choose keyboard</button>' : ""}
                    ${model?.device?.connected || !hostOf(model).chooseKeyboard ? '<button class="btn primary" data-act="retry">Read keyboard</button>' : ""}
                    ${demoHere ? exploreButton("ghost") : ""}
                    ${secondary ? `<button class="btn ghost" data-act="secondary">${esc(secondary.label)}</button>` : ""}</div>`}
        </div></div></div></div>`);
    screen.querySelector('[data-act="explore-demo"]')?.addEventListener("click", () => post(openDemo()));
    screen.querySelector('[data-act="choose-keyboard"]')?.addEventListener("click", () => post(chooseKeyboard()));
    screen.querySelector('[data-act="retry"]')?.addEventListener("click", () => post(controls.control("refresh")));
    screen.querySelector('[data-act="secondary"]')?.addEventListener("click", () => {if (!secondary) return; state.screen = secondary.screen; render();});
    return screen;
}

/** @param {string} tone */
const exploreButton = (tone) => `<button class="btn ${tone}" data-act="explore-demo" data-tip="${esc(DEMO_WORDS.exploreTip)}">${esc(DEMO_WORDS.explore)}</button>`;

// The demo's strip across the window: it is a demo, nothing is connected, and
// the two things only the demo has, another file and the way out.
/** @param {ReturnType<typeof demoOf>} demo */
function demoBanner(demo) {
    const node = el(`<div class="demo-banner" role="status">
        <i class="dot demo" aria-hidden="true"></i><strong>${esc(DEMO_WORDS.status)}</strong>
        <span class="copy">${esc(DEMO_WORDS.banner)}${demo.fileName ? ` <span class="mono">${esc(demo.fileName)}</span>` : ""}</span>
        <span class="acts"><button class="btn tiny" data-act="open-demo-profile"
                data-tip="Open one of your saved .charybdis.json backup files in the demo, in place of this setup.">Open a backup file…</button>
            <button class="btn tiny ghost" data-act="leave-demo" data-tip="Close the demo and go back to connecting a keyboard.">Leave demo</button></span>
    </div>`);
    /** @type {HTMLButtonElement} */ (node.querySelector('[data-act="open-demo-profile"]')).addEventListener("click", () => postLeavingDemo(openDemoProfile()));
    /** @type {HTMLButtonElement} */ (node.querySelector('[data-act="leave-demo"]')).addEventListener("click", () => postLeavingDemo(leaveDemo()));
    return node;
}

// A place asked for by a jump — the review's Show — is scrolled to and marked
// for a moment, once, so the eye lands on it among its neighbours.
function reveal() {
    if (!state.reveal) return;
    const target = root.querySelector(state.reveal);
    state.reveal = null;
    if (!target) return;
    target.scrollIntoView({block: "center"});
    target.classList.add("revealed");
    setTimeout(() => target.classList.remove("revealed"), 1600);
}

setRenderer(render);
bindLayerIndex(() => state.layer);
mountHover(root);
mountNumberEntry(root);

function refreshCommitBar() {
    const main = root.querySelector(".main"), previous = main?.querySelector(":scope > .commit"), next = commitBar();
    if (previous && next) previous.replaceWith(next);
    else if (next && main) main.append(next);
    else previous?.remove();
}

const receivePanelMessage = createPanelMessages({root, refreshCommitBar, render, receiveMacroValidation});
// Host replies cross the message boundary as copies; their authored shapes are
// checked in both hosts. Device values have already passed core's validators.
addEventListener("message", (event) => receivePanelMessage(/** @type {import("../contracts/messages.js").PanelResponse} */ (event.data)));

// A field that holds text keeps its own undo: ⌘Z there edits the text, not
// the draft. Macro editor focus uses step history; elsewhere it steps the
// draft, as the rail ↺ ↻ buttons do.
const TEXT_INPUTS = new Set(["text", "search", "number", "email", "url", "tel", "password"]);
/** @param {EventTarget | null} target */
const editsText = (target) => Boolean(target instanceof Element && target.closest("textarea, [contenteditable]:not([contenteditable=\"false\"])"))
    || (target instanceof HTMLInputElement && TEXT_INPUTS.has(target.type));

/** @param {KeyboardEvent} event */
function historyShortcut(event) {
    const inDialog = state.picker || state.overlay || (event.target instanceof Element && event.target.closest('.scrim'));
    const action = historyAction(event, {editingText: editsText(event.target), busy: Boolean(state.recording || state.retarget || inDialog)});
    if (!action) return false;
    if (macroHistoryShortcut(event, action)) return true;
    event.preventDefault();
    const draft = getModel()?.draft;
    if (!draft || draft.busy) return true;
    if (action === "undo" && draft.canUndo) post(controls.control("undoProfileDraft"));
    if (action === "redo" && draft.canRedo) post(controls.control("redoProfileDraft"));
    return true;
}

// Board and macro-step shortcuts take their keys before anything else on the page hears
// them. An extension that turns Backspace into Back listens on the window from
// before Ark loads, so Ark's ordinary listener would come too late, and deleting
// a key would also leave Ark.
addEventListener("keydown", (event) => {
    if (historyShortcut(event) || keysShortcut(event) || macroClipboardShortcut(event) || macroStepShortcut(event)) event.stopImmediatePropagation();
}, true);
addEventListener("keydown", (event) => {
    if (trapTab(root, event) || activateOnKey(event)) return;
    if (event.key !== "Escape") return;
    hideHover();
    if (state.picker) { state.picker = null; render(); return; }
    if (state.retarget) { state.retarget = null; render(); return; }
    if (state.layersOpen) { closeLayers(); render(); return; }
    if (state.overlay) {
        // Leaving the review by Esc is leaving it by Close.
        if (state.overlay === "review") post(controls.control("closeProfileDraftReview"));
        if (state.overlay === "history") post(controls.control("closeProfileDraftHistory"));
        state.overlay = null;
        state.leaveDemo = null;
        render();
    }
});
addEventListener("resize", () => {
    /** @type {HTMLElement | null} */ (root.querySelector(".keys-pad .bench"))?.style.removeProperty("min-height");
});

// A dropped file must never navigate away from Ark and lose the draft,
// including outside the Import card or while that card is disabled.
for (const type of /** @type {const} */ (["dragover", "drop"])) addEventListener(type, (event) => {
    if (Array.from(event.dataTransfer?.types || []).includes("Files")) event.preventDefault();
});

render();
post(controls.control("ready"));
