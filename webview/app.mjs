// Charybdis Ark — the webview.
//
// It renders the `model` the host posts and posts typed edits back. It holds
// no device state of its own: the draft lives in the host, so what is drawn is
// always what would be applied.

import {el, esc} from "./lib/dom.mjs";
import {captureContentScroll, captureKeysBenchHeight, revealSelectedContentRow, restoreContentScroll, restoreKeysBenchHeight} from "./lib/scroll.mjs";
import {activateOnKey, captureFocus, focusDialog, restoreFocus, trapTab} from "./lib/focus.mjs";
import {closeComboBuilder, getModel, layerName, post, postLeavingDemo, render as rerender, resetDraftForms, setModel, setRenderer, state, writable} from "./store.mjs";
import {historyAction} from "./view/edits.mjs";
import {chooseKeyboard, hostOf, otherTheme, setTheme} from "./view/host.mjs";
import {DEMO_WORDS, demoOf, leaveDemo, openDemo, openDemoProfile} from "./view/demo.mjs";
import {readScreen, screenAvailable} from "./view/readiness.mjs";
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

const root = document.getElementById("root");
let lastStackKey = null;   // the keyboard and layer stack the previewed layer set was picked on
let renderedScreen = null;

const SCREENS = {
    keys: screenKeys,
    lighting: screenLighting,
    settings: screenSettings,
    device: screenDevice,
    mouse: screenMouse,
    pointing: screenPointing,
    macros: screenMacros,
    customKeys: screenCustomKeys,
    profile: screenProfile,
};

const kv = (rows) => `<dl class="kv" style="grid-template-columns:170px 1fr">${rows
    .map(([key, value]) => `<dt>${esc(key)}</dt><dd>${esc(value ?? "—")}</dd>`).join("")}</dl>`;
const whatWasRead = (model) => `<div class="card"><div class="card-h"><h3>What was read</h3></div>
    <div class="list">${(model?.diagnostics || []).map((note) =>
        `<div class="list-row" style="grid-template-columns:1fr"><span class="note">${esc(note)}</span></div>`).join("")
        || `<div class="list-row"><span class="note">Nothing has been read yet.</span></div>`}</div></div>`;

function screenDevice() {
    const model = getModel();
    if (demoOf(model).active) return screenDemoDevice(model);
    const device = model?.device || {};
    const main = el(`<div class="main">${topbar(
        "Device",
        "What the keyboard says about itself. Everything this app shows comes from here — it never reads a firmware repository.",
        `<button class="btn" data-act="read" ${device.health?.busy ? "disabled" : ""}>Read from keyboard</button>`,
    )}
        <div class="content"><div class="pad" style="max-width:940px;display:grid;gap:14px">
            <div class="grid2">
                <div class="card"><div class="card-h"><h3>Connection</h3>
                    <span class="right"><span class="chip"><i class="dot ${device.connected ? "on" : "err"}"></i>${device.connected ? "connected" : "disconnected"}</span></span></div>
                    <div class="card-b">${kv([
                        ["Product", device.label],
                        ["Status", device.subtitle],
                        ["Phase", device.health?.phase],
                    ])}</div></div>
                <div class="card"><div class="card-h"><h3>Committed profile</h3>
                    <span class="right"><span class="chip"><i class="dot ${device.health?.converged ? "on" : "draft"}"></i>${device.health?.converged ? "both halves agree" : "halves not converged"}</span></span></div>
                    <div class="card-b">${kv([
                        ["Generation and digest", device.summary],
                        ["Recovery", device.health?.recoveryPending ? "pending" : "clear"],
                        ["Draft", model?.draft ? `${model.draft.changes.length} change${model.draft.changes.length === 1 ? "" : "s"}` : "none"],
                    ])}</div></div>
            </div>
            ${whatWasRead(model)}
        </div></div></div>`);
    main.querySelector('[data-act="read"]').addEventListener("click", () => post({type: "refresh"}));
    return main;
}

// The Device screen in the demo: what stands in for a keyboard, and that it
// is not one. Reading a keyboard from here leaves the demo, asking first.
function screenDemoDevice(model) {
    const device = model?.device || {}, demo = demoOf(model);
    const main = el(`<div class="main">${topbar(
        "Device",
        "No keyboard is connected. The demo stands in for one running current firmware, so every screen works; nothing here reaches a keyboard.",
        `<button class="btn" data-act="read" ${device.health?.busy ? "disabled" : ""}>Read from keyboard</button>`,
    )}
        <div class="content"><div class="pad" style="max-width:940px;display:grid;gap:14px">
            <div class="grid2">
                <div class="card"><div class="card-h"><h3>Connection</h3>
                    <span class="right"><span class="chip"><i class="dot demo"></i>no keyboard</span></span></div>
                    <div class="card-b">${kv([
                        ["Product", device.label],
                        ["Status", device.subtitle],
                    ])}</div></div>
                <div class="card"><div class="card-h"><h3>Demo setup</h3>
                    <span class="right"><span class="chip"><i class="dot demo"></i>demo</span></span></div>
                    <div class="card-b">${kv([
                        ["Opened", demo.fileName || demo.name],
                        ["Draft", model?.draft ? `${model.draft.changes.length} change${model.draft.changes.length === 1 ? "" : "s"}` : "none"],
                    ])}</div></div>
            </div>
            ${whatWasRead(model)}
        </div></div></div>`);
    main.querySelector('[data-act="read"]').addEventListener("click", () => postLeavingDemo({type: "refresh"}));
    return main;
}

function reviewOverlay() {
    const model = getModel();
    const draft = model?.draft;
    if (state.overlay !== "review" || !draft?.dirty) return null;
    // Discarding goes back to the keyboard's value; it waits while the draft
    // is out of step with the keyboard or busy, as editing does.
    const canDiscard = writable();
    const sourceByCheck = new Map(), sourceCounts = new Map();
    for (const check of draft.checks) {
        const group = checkSourceGroup(check, draft.changes);
        if (group === null) continue;
        sourceByCheck.set(check, group);
        const count = sourceCounts.get(group) || {warning: 0, trap: 0};
        count[check.level] += check.kind === "trapOverflow" ? check.count : 1;
        sourceCounts.set(group, count);
    }
    const sourceLabel = (group) => {
        const count = sourceCounts.get(group);
        if (!count) return "";
        return `Source of ${[count.trap && `${count.trap} trap${count.trap === 1 ? "" : "s"}`, count.warning && `${count.warning} warning${count.warning === 1 ? "" : "s"}`].filter(Boolean).join(" and ")}`;
    };
    const item = (entry, index, discard, titleSlot, source) => reviewItem(model, entry, {discard, titleSlot, sourceLabel: source,
        show: stillShown(entry) && placeState(entry.place, model.layers) ? `<button class="btn tiny ghost" data-show="${index}"
            data-tip="Close the review and open this where it is edited.">Show</button>` : ""});
    const demo = demoOf(model);
    const columns = reviewColumns("What changes", demo.active ? "In the demo setup" : "On the keyboard", "In your draft");
    const discardable = draft.changes.every((change) => Number.isInteger(change.group));
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
    const checked = [];
    const checks = checksSection(draft.checks, (check) => check.status !== "fixed" && placeState(check.place, model.layers)
        ? `<button class="btn tiny ghost" data-show-check="${checked.push(check) - 1}" data-tip="Close the review and open this where it is edited.">Show</button>` : "",
    (check) => {
        const group = sourceByCheck.get(check);
        if (group === undefined) return "";
        const change = draft.changes.find((entry) => entry.group === group);
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
            <span class="right" style="margin-left:auto"><button class="btn ghost" data-act="close">Keep editing</button></span></div>
        <div class="sheet-b rv">
            ${checks}
            ${sections}
            <div style="padding:14px 18px 18px"><div class="callout warn">${demo.active ? esc(demo.applyNeedsKeyboard)
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
    node.querySelectorAll(".rv-block.grouped [data-discard]").forEach((button) => {
        const parts = node.querySelectorAll(`.rv-block.grouped[data-group="${button.dataset.discard}"]`);
        button.addEventListener("mouseenter", () => parts.forEach((part) => part.classList.add("lit")));
        button.addEventListener("mouseleave", () => parts.forEach((part) => part.classList.remove("lit")));
    });
    node.addEventListener("click", (event) => {
        if (event.target.closest('[data-act="export"]')) {
            post({type: "exportPortableProfile"});
            return;
        }
        const discard = event.target.closest("[data-discard]");
        if (discard) {
            post({type: "discardProfileDraftChanges", group: Number(discard.dataset.discard)});
            return;
        }
        const showCheck = event.target.closest("[data-show-check]");
        if (showCheck) {
            Object.assign(state, placeState(checked[Number(showCheck.dataset.showCheck)].place, model.layers), {overlay: null, confirmChecks: null});
            post({type: "closeProfileDraftReview"});
            rerender();
            return;
        }
        const source = event.target.closest("[data-check-source]");
        if (source) {
            const parts = node.querySelectorAll(`.rv-block[data-group="${source.dataset.checkSource}"]`);
            parts[0]?.scrollIntoView({behavior: "smooth", block: "center"});
            parts.forEach((part) => part.classList.add("source-focus"));
            setTimeout(() => parts.forEach((part) => part.classList.remove("source-focus")), 2000);
            return;
        }
        if (event.target.closest('[data-act="unconfirm"]')) {
            state.confirmChecks = null;
            rerender();
            return;
        }
        if (event.target.closest('[data-act="apply-anyway"]')) {
            state.overlay = null;
            state.confirmChecks = null;
            post({type: "applyProfileDraft", confirmChecks: true});
            rerender();
            return;
        }
        const show = event.target.closest("[data-show]");
        if (show) {
            Object.assign(state, placeState(shown[Number(show.dataset.show)].place, model.layers), {overlay: null});
            post({type: "closeProfileDraftReview"});
            rerender();
            return;
        }
        // The sheet closes at once; the host's answer only refreshes what it says.
        if (event.target === node || event.target.closest('[data-act="close"]')) {
            state.overlay = null;
            state.confirmChecks = null;
            post({type: "closeProfileDraftReview"});
            rerender();
        }
        if (event.target.closest('[data-act="apply"]')) {
            if (confirmChecks.length) {
                state.confirmChecks = draft.revision;
                rerender();
                return;
            }
            state.overlay = null;
            post({type: "applyProfileDraft"});
            rerender();
        }
    });
    return node;
}

function render() {
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
    const screen = read ? readPlaceholder(read, model) : (SCREENS[state.screen] || screenKeys)();
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

function readPlaceholder(read, model) {
    const loading = read.state === "loading";
    // Without a keyboard, a host with a picker offers it first.
    const choose = hostOf(model).chooseKeyboard && !model?.device?.connected;
    // Without a keyboard the demo is offered beside it; a host that cannot
    // reach one at all still offers it, where the host says so.
    const demoHere = demoOf(model).offered && (read.state !== "blocked" || Boolean(hostOf(model).blocked?.demo));
    const screenTitle = state.screen === "profile" ? "Profile & backups" : state.screen === "device" ? "Device" : "Keyboard";
    const secondary = screenAvailable(model, "profile") && state.screen !== "profile"
        ? {screen: "profile", label: "Profile & backups"}
        : screenAvailable(model, "device") && state.screen !== "device"
            ? {screen: "device", label: "Device details"} : null;
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
    screen.querySelector('[data-act="retry"]')?.addEventListener("click", () => post({type: "refresh"}));
    screen.querySelector('[data-act="secondary"]')?.addEventListener("click", () => {state.screen = secondary.screen; render();});
    return screen;
}

const exploreButton = (tone) => `<button class="btn ${tone}" data-act="explore-demo" data-tip="${esc(DEMO_WORDS.exploreTip)}">${esc(DEMO_WORDS.explore)}</button>`;

// The demo's strip across the window: it is a demo, nothing is connected, and
// the two things only the demo has, another file and the way out.
function demoBanner(demo) {
    const node = el(`<div class="demo-banner" role="status">
        <i class="dot demo" aria-hidden="true"></i><strong>${esc(DEMO_WORDS.status)}</strong>
        <span class="copy">${esc(DEMO_WORDS.banner)}${demo.fileName ? ` <span class="mono">${esc(demo.fileName)}</span>` : ""}</span>
        <span class="acts"><button class="btn tiny" data-act="open-demo-profile"
                data-tip="Open one of your exported .charybdis.json profiles in the demo, in place of this setup.">Open a profile file…</button>
            <button class="btn tiny ghost" data-act="leave-demo" data-tip="Close the demo and go back to connecting a keyboard.">Leave demo</button></span>
    </div>`);
    node.querySelector('[data-act="open-demo-profile"]').addEventListener("click", () => postLeavingDemo(openDemoProfile()));
    node.querySelector('[data-act="leave-demo"]').addEventListener("click", () => postLeavingDemo(leaveDemo()));
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
        if (event.target === node || event.target.closest('[data-act="stay"]')) close();
        else if (event.target.closest('[data-act="export"]')) {
            close();
            post({type: "exportPortableProfile"});
        } else if (event.target.closest('[data-act="confirm-leave"]')) {
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

let inDemo = false;   // whether the last model was the demo's

addEventListener("message", (event) => {
    const message = event.data;
    if (message?.type === "macroValidation") { receiveMacroValidation(message); return; }
    if (message?.type !== "model") return;
    setModel(message.model);
    // Leaving the demo goes back to where a keyboard is connected, or the demo
    // explored again; a screen of the demo's would only say it is unavailable.
    const demoNow = Boolean(message.model?.demo?.active);
    if (inDemo && !demoNow) state.screen = "keys";
    inDemo = demoNow;
    // A host that leaves the theme to the panel says which; otherwise the
    // host's own theme (VS Code's body class) holds.
    const theme = hostOf(message.model).theme;
    if (theme) document.documentElement.dataset.theme = theme;
    else delete document.documentElement.dataset.theme;
    // The host reports a refused edit as a notice prefixed "Failed"; that is a
    // failure, so it is shown as one rather than as a neutral message.
    if (message.notice) {
        const failed = /^Failed/.test(message.notice);
        state.error = failed ? message.notice : "";
        state.notice = failed ? "" : message.notice;
    }
    if (message.resetDraftForms) resetDraftForms();
    // A combo builder waiting on Keep or Delete closes when the host accepts
    // the edit, and stays open with its fields when the host refuses it. A
    // builder for a combo that no longer exists closes too.
    if (state.combo.awaiting) {
        if (/^Failed/.test(message.notice || "")) state.combo.awaiting = false;
        else closeComboBuilder();
    }
    if (state.combo.editId !== null && !(message.model?.combos || []).some((combo) => combo.id === state.combo.editId)) closeComboBuilder();
    const layerCount = message.model?.layers?.length || 0;
    if (state.layer >= layerCount) state.layer = 0;
    // A previewed set names layers by their place in the stack, so it is
    // dropped when the keyboard or the order under it changes.
    const stackKey = `${message.model?.device?.label || ""}|${message.model?.device?.connected ? 1 : 0}|${(message.model?.layers || []).map(layerName).join("\u0001")}`;
    if (stackKey !== lastStackKey) state.layersOn = [];
    lastStackKey = stackKey;
    const positions = message.model?.layers?.[state.layer]?.positions || [];
    if (!positions.some((position) => position.layoutIndex === state.selected)) {
        state.selected = positions[0]?.layoutIndex ?? 0;
    }
    if (state.overlay === "review" && !message.model?.draft?.dirty) state.overlay = null;
    if (state.overlay === "history" && !message.model?.draft) { state.overlay = null; post({type: "closeProfileDraftHistory"}); }
    if (state.overlay === "leaveDemo" && !message.model?.demo?.active) { state.overlay = null; state.leaveDemo = null; }
    render();
});

// A field that holds text keeps its own undo: ⌘Z there edits the text, not
// the draft. Everywhere else it steps the draft, as the ↺ ↻ buttons do.
const TEXT_INPUTS = new Set(["text", "search", "number", "email", "url", "tel", "password"]);
const editsText = (target) => Boolean(target?.closest?.("textarea, [contenteditable]:not([contenteditable=\"false\"])"))
    || (target?.tagName === "INPUT" && TEXT_INPUTS.has(target.type));

function historyShortcut(event) {
    const action = historyAction(event, {editingText: editsText(event.target), busy: Boolean(state.recording || state.retarget)});
    if (!action) return false;
    event.preventDefault();
    const draft = getModel()?.draft;
    if (!draft || draft.busy) return true;
    if (action === "undo" && draft.canUndo) post({type: "undoProfileDraft"});
    if (action === "redo" && draft.canRedo) post({type: "redoProfileDraft"});
    return true;
}

addEventListener("keydown", (event) => {
    if (trapTab(root, event) || activateOnKey(event)) return;
    if (historyShortcut(event) || keysShortcut(event)) return;
    if (event.key !== "Escape") return;
    hideHover();
    if (state.picker) { state.picker = null; render(); return; }
    if (state.retarget) { state.retarget = null; render(); return; }
    if (state.layersOpen) { closeLayers(); render(); return; }
    if (state.overlay) {
        // Leaving the review by Esc is leaving it by Keep editing.
        if (state.overlay === "review") post({type: "closeProfileDraftReview"});
        if (state.overlay === "history") post({type: "closeProfileDraftHistory"});
        state.overlay = null;
        state.leaveDemo = null;
        render();
    }
});
addEventListener("resize", () => {
    root.querySelector(".keys-pad .bench")?.style.removeProperty("min-height");
});

// A dropped file must never navigate away from Ark and lose the draft,
// including outside the Import card or while that card is disabled.
for (const type of ["dragover", "drop"]) addEventListener(type, (event) => {
    if (Array.from(event.dataTransfer?.types || []).includes("Files")) event.preventDefault();
});

render();
post({type: "ready"});
