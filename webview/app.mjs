// @ts-check
// Charybdis Ark — the webview.
//
// It renders the `model` the host posts and posts typed edits back. It holds
// no device state of its own: the draft lives in the host, so what is drawn is
// always what would be applied.

import {createPanelMessages} from "./messages.mjs";
import * as controls from "./view/controls.mjs";
import {el, esc} from "./lib/dom.mjs";
import {captureContentScroll, captureKeysBenchHeight, revealSelectedContentRow, restoreContentScroll, restoreKeysBenchHeight} from "./lib/scroll.mjs";
import {activateOnKey, captureFocus, focusDialog, restoreFocus, trapTab} from "./lib/focus.mjs";
import {closeComboBuilder, getModel, post, postLeavingDemo, render as rerender, setRenderer, state, writable} from "./store.mjs";
import {historyAction} from "./view/edits.mjs";
import {chooseKeyboard, hostOf, otherTheme, setTheme} from "./view/host.mjs";
import {DEMO_WORDS, demoOf, leaveDemo, openDemo, openDemoProfile} from "./view/demo.mjs";
import {phaseWords} from "./view/vocabulary.mjs";
import {readScreen, screenAvailable} from "./view/readiness.mjs";
import {SCREENS, screenDefinition, secondaryScreen} from "./view/screens.mjs";
import {discardLabel, groupNote, placeState, reviewBlocks, statusSummary, stillShown} from "./view/review.mjs";
import {bindLayerIndex, hideHover, mountHover} from "./ui/hover.mjs";
import {pickerOverlay} from "./ui/picker.mjs";
import {keysShortcut, screenKeys} from "./ui/keys.mjs";
import {reviewColumns, reviewItem} from "./ui/review-items.mjs";
import {checksSection} from "./ui/checks.mjs";
import {checkSourceGroup, checksToConfirm, confirmText} from "./view/checks.mjs";
import {historyOverlay} from "./ui/history.mjs";
import {closeLayers} from "./ui/layers.mjs";
import {screenLighting} from "./ui/lighting.mjs";
import {screenSettings} from "./ui/settings.mjs";
import {screenMouse} from "./ui/mouse.mjs";
import {screenPointing} from "./ui/pointing.mjs";
import {screenMacros, receiveMacroValidation} from "./ui/macros.mjs";
import {screenCustomKeys} from "./ui/custom-keys.mjs";
import {screenProfile} from "./ui/profile.mjs";
import {commitBar, rail, topbar, unavailable} from "./ui/shell.mjs";

const root = /** @type {HTMLElement} */ (document.getElementById("root"));
/** @type {import("./view/screens.mjs").ScreenId | null} */
let renderedScreen = null;

const SCREEN_RENDERERS = {
    screenKeys, screenLighting, screenSettings, screenDevice, screenMouse,
    screenPointing, screenMacros, screenCustomKeys, screenProfile,
};

/** @param {readonly (readonly [string, unknown])[]} rows */
const kv = (rows) => `<dl class="kv device-kv">${rows
    .map(([key, value]) => `<dt>${esc(key)}</dt><dd>${esc(value ?? "—")}</dd>`).join("")}</dl>`;
/** @param {import("../contracts/panel.js").PublishedModel | null} model */
const whatWasRead = (model) => `<div class="card"><div class="card-h"><h3>What was read</h3></div>
    <div class="list">${(model?.diagnostics || []).map((note) =>
        `<div class="list-row note-row"><span class="note">${esc(note)}</span></div>`).join("")
        || `<div class="list-row"><span class="note">Nothing has been read yet.</span></div>`}</div></div>`;
/** @param {string} dot @param {string} words */
const chip = (dot, words) => `<span class="right"><span class="chip"><i class="dot ${esc(dot)}"></i>${esc(words)}</span></span>`;

// The Device screen: what the keyboard says about itself, in two cards (its
// connection, and the setup it holds) over what was read. In the demo it says
// what stands in for a keyboard, and that it is not one; reading a keyboard
// from there leaves the demo, asking first.
function screenDevice() {
    const model = getModel();
    const device = model?.device, demo = demoOf(model);
    const changes = model?.draft ? `${model.draft.changes.length} change${model.draft.changes.length === 1 ? "" : "s"}` : "none";
    const page = demo.active ? {
        sub: "No keyboard is connected. The demo stands in for one running current firmware, so every screen works; nothing here reaches a keyboard.",
        connectionChip: chip("demo", "no keyboard"),
        connectionBody: kv([
            ["Product", device?.label],
            ["Status", device?.subtitle],
        ]),
        setupTitle: "Demo setup",
        setupChip: chip("demo", "demo"),
        setupBody: kv([
            ["Opened", demo.fileName || demo.name],
            ["Draft", changes],
        ]),
        read: () => postLeavingDemo(controls.control("refresh")),
    } : {
        sub: "What the keyboard says about itself. Everything this app shows comes from here — it never reads a firmware repository.",
        connectionChip: chip(device?.connected ? "on" : "err", device?.connected ? "connected" : "disconnected"),
        connectionBody: `${kv([
            ["Product", device?.label],
            ["Status", device?.subtitle],
            ["Phase", phaseWords(model, device?.health?.phase)?.label],
        ])}<p class="note">The master half connects over USB; the slave half connects to it through the cable between the halves.</p>`,
        setupTitle: "Committed profile",
        setupChip: chip(device?.health?.converged ? "on" : "draft", device?.health?.converged ? "both halves agree" : "halves not converged"),
        setupBody: kv([
            ["Generation and digest", device?.summary],
            ["Recovery", device?.health?.recoveryPending ? "pending" : "clear"],
            ["Draft", changes],
        ]),
        read: () => post(controls.control("refresh")),
    };
    const main = el(`<div class="main">${topbar(
        "Device",
        page.sub,
        `<button class="btn" data-act="read" ${device?.health?.busy ? "disabled" : ""}>Read from keyboard</button>`,
    )}
        <div class="content"><div class="pad stack device-pad">
            <div class="grid2">
                <div class="card"><div class="card-h"><h3>Connection</h3>
                    ${page.connectionChip}</div>
                    <div class="card-b">${page.connectionBody}</div></div>
                <div class="card"><div class="card-h"><h3>${page.setupTitle}</h3>
                    ${page.setupChip}</div>
                    <div class="card-b">${page.setupBody}</div></div>
            </div>
            ${whatWasRead(model)}
        </div></div></div>`);
    /** @type {HTMLButtonElement} */ (main.querySelector('[data-act="read"]')).addEventListener("click", page.read);
    return main;
}

function reviewOverlay() {
    const model = getModel();
    const draft = model?.draft;
    if (!model || state.overlay !== "review" || !draft?.dirty) return null;
    // Discarding goes back to the keyboard's value; it waits while the draft
    // is out of step with the keyboard or busy, as editing does.
    const canDiscard = writable();
    /** @type {Map<import("../contracts/model.js").Check, number | undefined>} */
    const sourceByCheck = new Map();
    /** @type {Map<number | null | undefined, {warning: number, trap: number}>} */
    const sourceCounts = new Map();
    for (const check of draft.checks) {
        const group = checkSourceGroup(check, draft.changes);
        if (group === null) continue;
        sourceByCheck.set(check, group);
        const count = sourceCounts.get(group) || {warning: 0, trap: 0};
        if (check.level === "warning" || check.level === "trap") count[check.level] += check.kind === "trapOverflow" ? (check.count ?? 1) : 1;
        sourceCounts.set(group, count);
    }
    /** @param {number | null | undefined} group */
    const sourceLabel = (group) => {
        const count = sourceCounts.get(group);
        if (!count) return "";
        return `Source of ${[count.trap && `${count.trap} trap${count.trap === 1 ? "" : "s"}`, count.warning && `${count.warning} warning${count.warning === 1 ? "" : "s"}`].filter(Boolean).join(" and ")}`;
    };
    /** @param {import("../contracts/model.js").ReviewChange} entry @param {number} index @param {string} discard @param {boolean} titleSlot @param {string} source */
    const item = (entry, index, discard, titleSlot, source) => reviewItem(model, entry, {discard, titleSlot, sourceLabel: source,
        show: stillShown(entry) && placeState(entry.place, model.layers) ? `<button class="btn tiny ghost" data-show="${index}"
            data-tip="Close the review and open this where it is edited.">Show</button>` : ""});
    const demo = demoOf(model);
    const columns = reviewColumns("What changes", demo.active ? "In the demo setup" : "On the keyboard", "In your draft");
    const discardable = draft.changes.every((change) => Number.isInteger(change.group));
    /** @type {import("../contracts/model.js").ReviewChange[]} */
    const shown = [];
    const sections = reviewBlocks(draft.changes).map(({area, blocks, count}) => `<section class="rv-sect">
        <div class="sect-h"><h4>${esc(area)}</h4><span class="right tag">${count}</span></div>
        ${columns}
        ${((titleSlot) => blocks.map((block) => {
            const grouped = block.size > 1;
            const source = sourceCounts.get(block.group);
            const sourceClass = source ? ` source-${source.trap ? "trap" : "warning"}` : "";
            const discard = discardable ? `<button class="btn tiny ghost" data-discard="${esc(block.group)}" ${canDiscard ? "" : "disabled"}
                data-tip="${esc(grouped ? `Put these ${block.size} changes back to what the keyboard holds. They were made together, so they go back together.` : "Put this change back to what the keyboard holds.")}">${esc(discardLabel(block))}</button>` : "";
            const items = block.items.map((entry, index) => item(entry, shown.push(entry) - 1, grouped ? "" : discard, titleSlot, index === 0 ? sourceLabel(block.group) : "")).join("");
            return grouped
                ? `<div class="rv-block grouped${sourceClass}" data-group="${esc(block.group)}"><div class="rv-group-h"><span class="rv-group-t"><span>${esc(block.title || "Made together")}</span>
                    <span class="note">${esc(groupNote(block))}</span></span><span class="rv-act wide">${discard}</span></div>${items}</div>`
                : `<div class="rv-block${sourceClass}" data-group="${esc(block.group)}">${items}</div>`;
        }).join(""))(blocks.some((block) => block.items.some((entry) => entry.titleMark)))}</section>`).join("");
    const summary = statusSummary(draft.changes);
    // Checks that point at a key or a combo open it as review items do.
    /** @type {import("../contracts/model.js").Check[]} */
    const checked = [];
    const checks = checksSection(draft.checks, (check) => check.status !== "fixed" && placeState(check.place, model.layers)
        ? `<button class="btn tiny ghost" data-show-check="${checked.push(check) - 1}" data-tip="Close the review and open this where it is edited.">Show</button>` : "",
    (check) => {
        const group = sourceByCheck.get(check);
        if (group === undefined) return "";
        const change = draft.changes.find((entry) => entry.group === group);
        if (!change) return "";
        return `<button class="ck-source" data-check-source="${group}" type="button">From draft: ${esc(change.groupTitle || change.title)} ↓</button>`;
    });
    // Ask about active warnings and traps for this revision before writing.
    const confirmChecks = checksToConfirm(draft.checks);
    const confirming = confirmChecks.length && state.confirmChecks === draft.revision;
    const hasTrap = confirmChecks.some((check) => check.level === "trap");
    const blockers = draft.checks.filter((check) => check.level === "blocker" && check.status !== "fixed");
    const canApply = draft.reviewed && draft.connected && !draft.stale && !blockers.length;
    const node = el(`<div class="scrim"><div class="sheet" role="dialog" aria-modal="true" aria-label="Review changes">
        <div class="sheet-h"><h2>Review ${draft.changes.length} change${draft.changes.length === 1 ? "" : "s"}</h2>
            ${summary ? `<span class="note">${esc(summary)}</span>` : ""}
            <span class="right"><button class="btn ghost" data-act="close">Keep editing</button></span></div>
        <div class="sheet-b rv">
            ${checks}
            ${sections}
            <div class="rv-apply-note"><div class="callout warn">${demo.active ? esc(demo.applyNeedsKeyboard)
                : "Apply writes a recovery copy, stages the changed blocks on both halves, then publishes one generation. The keyboard keeps running its saved profile until both halves confirm. If it is interrupted, the recovery copy restores it."}</div></div>
        </div>
        ${demo.active ? `<div class="sheet-f demo-apply"><span class="note"><i class="dot demo"></i> ${esc(DEMO_WORDS.status)}</span>
            <span class="right"><button class="btn" data-act="close">Keep editing</button>
                <button class="btn primary" data-act="export">Export…</button></span></div>`
        : confirming ? `<div class="sheet-f ck-confirm ${hasTrap ? "trap" : "warning"}" role="alertdialog" aria-label="Confirm profile checks">
            <span class="ck-confirm-t"><i class="dot ${hasTrap ? "err" : "warn"}"></i>${esc(confirmText(confirmChecks))}</span>
            <span class="right"><button class="btn" data-act="unconfirm">Go back</button>
                <button class="btn primary" data-act="apply-anyway" ${canApply ? "" : "disabled"}>Apply anyway</button></span></div>`
        : `<div class="sheet-f"><span class="note">${esc(model?.device?.label || "")} · ${esc(model?.device?.summary || "")}</span>
            <span class="right"><button class="btn" data-act="close">Cancel</button>
                <button class="btn primary" data-act="apply" ${canApply ? "" : "disabled"}
                    ${blockers.length ? `data-tip="${esc("Resolve the blockers in Checks before applying.")}"` : confirmChecks.length ? `data-tip="${esc("Warnings and traps will be asked about before anything is written.")}"` : ""}>Apply to keyboard</button></span></div>`}
    </div></div>`);
    // Pointing at a group's Discard lights what it takes back, in every area
    // the group reaches.
    /** @type {NodeListOf<HTMLButtonElement>} */ (node.querySelectorAll(".rv-block.grouped [data-discard]")).forEach((button) => {
        const parts = node.querySelectorAll(`.rv-block.grouped[data-group="${button.dataset.discard}"]`);
        button.addEventListener("mouseenter", () => parts.forEach((part) => part.classList.add("lit")));
        button.addEventListener("mouseleave", () => parts.forEach((part) => part.classList.remove("lit")));
    });
    node.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        if (target.closest('[data-act="export"]')) {
            post(controls.control("exportPortableProfile"));
            return;
        }
        const discard = /** @type {HTMLButtonElement | null} */ (target.closest("[data-discard]"));
        if (discard) {
            post(controls.discardChanges(Number(discard.dataset.discard)));
            return;
        }
        const showCheck = /** @type {HTMLButtonElement | null} */ (target.closest("[data-show-check]"));
        if (showCheck) {
            Object.assign(state, placeState(checked[Number(showCheck.dataset.showCheck)].place, model.layers), {overlay: null, confirmChecks: null});
            post(controls.control("closeProfileDraftReview"));
            rerender();
            return;
        }
        const source = /** @type {HTMLButtonElement | null} */ (target.closest("[data-check-source]"));
        if (source) {
            const parts = node.querySelectorAll(`.rv-block[data-group="${source.dataset.checkSource}"]`);
            parts[0]?.scrollIntoView({behavior: "smooth", block: "center"});
            parts.forEach((part) => part.classList.add("source-focus"));
            setTimeout(() => parts.forEach((part) => part.classList.remove("source-focus")), 2000);
            return;
        }
        if (target.closest('[data-act="unconfirm"]')) {
            state.confirmChecks = null;
            rerender();
            return;
        }
        if (target.closest('[data-act="apply-anyway"]')) {
            state.overlay = null;
            state.confirmChecks = null;
            post(controls.applyDraft(true));
            rerender();
            return;
        }
        const show = /** @type {HTMLButtonElement | null} */ (target.closest("[data-show]"));
        if (show) {
            Object.assign(state, placeState(shown[Number(show.dataset.show)].place, model.layers), {overlay: null});
            post(controls.control("closeProfileDraftReview"));
            rerender();
            return;
        }
        // The sheet closes at once; the host's answer only refreshes what it says.
        if (event.target === node || target.closest('[data-act="close"]')) {
            state.overlay = null;
            state.confirmChecks = null;
            post(controls.control("closeProfileDraftReview"));
            rerender();
        }
        if (target.closest('[data-act="apply"]')) {
            if (confirmChecks.length) {
                state.confirmChecks = draft.revision;
                rerender();
                return;
            }
            state.overlay = null;
            post(controls.applyDraft());
            rerender();
        }
    });
    return node;
}

/** @param {{keepScreen?: boolean}} [options] */
function render({keepScreen = false} = {}) {
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
    const screen = el(`<div class="main">${topbar(screenTitle, "The keyboard's current data appears here when this screen is available.")}
        <div class="content"><div class="pad"><div class="read-placeholder" role="status" aria-live="polite">
            ${loading ? '<span class="spin" aria-hidden="true"></span>' : '<i class="dot err" aria-hidden="true"></i>'}
            <h2>${esc(read.title)}</h2><p>${esc(read.detail)}</p>
            ${loading ? '<p class="note">The menus open when their keyboard data is ready.</p>'
                : read.state === "blocked" ? (demoHere ? `<div class="read-actions">${exploreButton("primary")}</div>` : "")
                : `<div class="read-actions">${choose ? '<button class="btn primary" data-act="choose-keyboard">Choose keyboard</button>' : ""}
                    <button class="btn ${choose ? "ghost" : "primary"}" data-act="retry">Read keyboard</button>
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
                data-tip="Open one of your exported .charybdis.json profiles in the demo, in place of this setup.">Open a profile file…</button>
            <button class="btn tiny ghost" data-act="leave-demo" data-tip="Close the demo and go back to connecting a keyboard.">Leave demo</button></span>
    </div>`);
    /** @type {HTMLButtonElement} */ (node.querySelector('[data-act="open-demo-profile"]')).addEventListener("click", () => postLeavingDemo(openDemoProfile()));
    /** @type {HTMLButtonElement} */ (node.querySelector('[data-act="leave-demo"]')).addEventListener("click", () => postLeavingDemo(leaveDemo()));
    return node;
}

// Leaving the demo, or replacing its file, with edits not exported: asked
// once, with Export offered first.
function leaveDemoOverlay() {
    const leave = state.leaveDemo;
    if (state.overlay !== "leaveDemo" || !leave) return null;
    const node = el(`<div class="scrim"><div class="sheet leave-demo" role="alertdialog" aria-modal="true" aria-label="${esc(leave.ask.title)}">
        <div class="sheet-h"><h2>${esc(leave.ask.title)}</h2></div>
        <div class="sheet-b"><p>${esc(leave.ask.detail)}</p></div>
        <div class="sheet-f"><button class="btn ghost" data-act="stay">Stay in the demo</button>
            <span class="right"><button class="btn" data-act="confirm-leave">${esc(leave.ask.confirm)}</button>
                <button class="btn primary" data-act="export">Export…</button></span></div>
    </div></div>`);
    const close = () => {state.overlay = null; state.leaveDemo = null; rerender();};
    node.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        if (event.target === node || target.closest('[data-act="stay"]')) close();
        else if (target.closest('[data-act="export"]')) {
            close();
            post(controls.control("exportPortableProfile"));
        } else if (target.closest('[data-act="confirm-leave"]')) {
            // Posted from this click, so a host that opens a picker or a file
            // chooser for it still can.
            post(leave.message);
            close();
        }
    });
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
// the draft. Everywhere else it steps the draft, as the ↺ ↻ buttons do.
const TEXT_INPUTS = new Set(["text", "search", "number", "email", "url", "tel", "password"]);
/** @param {EventTarget | null} target */
const editsText = (target) => Boolean(target instanceof Element && target.closest("textarea, [contenteditable]:not([contenteditable=\"false\"])"))
    || (target instanceof HTMLInputElement && TEXT_INPUTS.has(target.type));

/** @param {KeyboardEvent} event */
function historyShortcut(event) {
    const action = historyAction(event, {editingText: editsText(event.target), busy: Boolean(state.recording || state.retarget)});
    if (!action) return false;
    event.preventDefault();
    const draft = getModel()?.draft;
    if (!draft || draft.busy) return true;
    if (action === "undo" && draft.canUndo) post(controls.control("undoProfileDraft"));
    if (action === "redo" && draft.canRedo) post(controls.control("redoProfileDraft"));
    return true;
}

// The board's shortcuts take their keys before anything else on the page hears
// them. An extension that turns Backspace into Back listens on the window from
// before Ark loads, so Ark's ordinary listener would come too late, and deleting
// a key would also leave Ark.
addEventListener("keydown", (event) => {
    if (historyShortcut(event) || keysShortcut(event)) event.stopImmediatePropagation();
}, true);
addEventListener("keydown", (event) => {
    if (trapTab(root, event) || activateOnKey(event)) return;
    if (event.key !== "Escape") return;
    hideHover();
    if (state.picker) { state.picker = null; render(); return; }
    if (state.retarget) { state.retarget = null; render(); return; }
    if (state.layersOpen) { closeLayers(); render(); return; }
    if (state.overlay) {
        // Leaving the review by Esc is leaving it by Keep editing.
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
