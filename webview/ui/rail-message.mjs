// @ts-check
// The rail's message (view/rail-message.mjs says what it says and whether it
// closes by itself). A notice that closes by itself drains a line along its
// foot over its reading time, and closes when the line is empty. While the
// pointer is over it or focus is inside it, the line and the time both stop,
// and go on from where they were once it is left. Closing or dismissing it
// redraws the message alone, never the screen being worked in.

import {el, esc} from "../lib/dom.mjs";
import {announce} from "../lib/announce.mjs";
import {getModel, state} from "../store.mjs";
import {announcements} from "../view/announcements.mjs";
import {commitBarState} from "../view/commit-bar.mjs";
import {railMessageView, readingTime} from "../view/rail-message.mjs";

/**
 * The notice on its way to closing: its whole time, how much is left as of
 * `since`, and whether the pointer or focus holds it there.
 * @typedef {{said: string, total: number, left: number, since: number, held: boolean, timer?: ReturnType<typeof setTimeout>}} Fade
 */
/** @type {Fade | null} */
let fade = null;

const view = () => {
    const model = getModel();
    return railMessageView(model, state, commitBarState(model, state));
};

// How much of the notice's time is left now.
/** @param {Fade} running */
const leftNow = (running) => running.held ? running.left : Math.max(0, running.left - (performance.now() - running.since));

// What the rail and the bars say as it happens is heard through the page's
// own live regions (view/announcements.mjs), not through this, which every
// render draws anew. A render starts the line where it had drained to.
export function railMessage() {
    const message = view();
    if (!message) return "";
    const running = message.fades && fade?.said === message.text ? fade : null;
    const total = Math.round(running?.total || 0), passed = running ? Math.round(running.total - leftNow(running)) : 0;
    return `<div class="rail-message${message.failed ? " err" : ""}${running ? " fades" : ""}${running?.held ? " held" : ""}"${running ? ` style="--fade: ${total}ms; --fade-passed: ${passed}ms"` : ""}>
        <span>${esc(message.text)}</span>
        <button class="btn tiny ghost icon" data-act="dismiss" aria-label="Dismiss">✕</button></div>`;
}

/** @param {ParentNode} node */
export function bindRailMessage(node) {
    /** @type {HTMLButtonElement | null} */ (node.querySelector('.rail-message [data-act="dismiss"]'))?.addEventListener("click", dismiss);
}

// ✕ closes what the rail shows: a failure, a notice, or the keyboard's own
// error until it says something else.
function dismiss() {
    const shown = view();
    if (shown?.source === "error") state.error = "";
    else if (shown?.source === "health") state.healthDismissed = shown.text;
    else if (shown?.source === "notice") {state.notice = ""; stop();}
    redraw();
}

// The message alone, drawn again: what it says now, or nothing. Focus that
// was in the message it replaces has gone with it.
function redraw() {
    const previous = document.querySelector(".rail-message");
    if (!previous) return;
    const markup = railMessage();
    if (markup) {
        const next = el(markup);
        bindRailMessage(next);
        previous.replaceWith(next);
    } else previous.remove();
    focusOn = onMessage(document.activeElement);
    hold();
    announce(announcements(getModel(), state));
}

function stop() {
    clearTimeout(fade?.timer);
    fade = null;
}

/** @param {Fade} running */
function schedule(running) {
    clearTimeout(running.timer);
    running.timer = setTimeout(() => {
        if (fade !== running) return;
        fade = null;
        if (state.notice === running.said && !state.noticeLasting) state.notice = "";
        redraw();
    }, running.left);
}

// Starts the notice just said on its way to closing, if it is one that
// closes by itself, and stops the one before.
export function fadeWhenRead() {
    stop();
    const said = state.notice;
    if (!said || state.noticeLasting) return;
    listen();
    const total = readingTime(said);
    fade = {said, total, left: total, since: performance.now(), held: pointerOn || focusOn};
    if (!fade.held) schedule(fade);
}

// Whether the pointer or focus is on the message decides whether its time
// runs: these two flags alone say it. They are kept from the document's
// events, since a render replaces the message under a pointer that has not
// moved, and start from where the pointer and focus are when first heard.
let pointerOn = false, focusOn = false, listening = false;
/** @param {EventTarget | null} target */
const onMessage = (target) => target instanceof Element && Boolean(target.closest(".rail-message"));
function listen() {
    if (listening) return;
    listening = true;
    pointerOn = Boolean(document.querySelector(".rail-message:hover"));
    focusOn = onMessage(document.activeElement);
    document.addEventListener("pointerover", (event) => {pointerOn = onMessage(event.target); hold();});
    document.documentElement.addEventListener("pointerleave", () => {pointerOn = false; hold();});
    document.addEventListener("focusin", (event) => {focusOn = onMessage(event.target); hold();});
    document.addEventListener("focusout", (event) => {focusOn = onMessage(/** @type {FocusEvent} */ (event).relatedTarget); hold();});
}

// Stops the time and the line while the message is held, and runs them on
// from where they stopped once it is let go.
function hold() {
    const running = fade;
    const held = pointerOn || focusOn;
    if (!running || running.held === held) return;
    running.left = leftNow(running);
    running.since = performance.now();
    running.held = held;
    if (held) clearTimeout(running.timer);
    else schedule(running);
    // The line stops and runs on with the time, so the two stay together.
    document.querySelector(".rail-message.fades")?.classList.toggle("held", held);
}
