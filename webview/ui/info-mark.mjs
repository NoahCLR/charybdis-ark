// @ts-check
import {esc} from "../lib/dom.mjs";

// The info mark, the one there is: a small circled i holding what a section
// or an idea means, read once (D-L96). A tip is one control's one line; this
// is where explanations live. A click on the mark, or Enter or Space on it,
// opens its list and keeps it open (data-open) until the mark is pressed
// again, Escape is pressed, or a press lands outside it; opening one closes
// any other. Resting the pointer on the mark previews the list while it
// stays there, and Escape shuts that preview (data-shut) until the pointer
// has left. A screen reader hears the list as the mark's description, and
// the button says whether it is open (aria-expanded). It sits beside a
// heading (Text replacement's sections) or on a corner (the Keymap board's
// shortcuts, keys/board-card.mjs). An open list is kept inside the screen's
// area: moved sideways where it would run off an edge, opened upward where
// there is more room above the mark than under it, and no taller than that
// room, its body scrolling (by the wheel, or the arrow keys from the mark;
// the body itself is no tab stop).
const ICON = `<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.5"/><path d="M8 7.2v4.3"/><circle class="dot" cx="8" cy="4.9" r=".55"/></svg>`;
// The space between a mark and its list (styles.css, .info-pop), and the
// least height a list is given however short the window.
const GAP = 6, LEAST = 96;

/** @typedef {{term: string, mono?: boolean, says: string}} InfoRow */
/** @typedef {{heading: string, lead?: string, rows: readonly InfoRow[]}} InfoPart */

// The mark kept open, by its list's id, so it stays open across the
// renders that redraw it; null when none is.
/** @type {string | null} */
let kept = null;

// An info mark's markup. `label` names the mark and `heading` heads its list
// (`named` names the list where its heading alone would not say what of);
// `lead` is an optional sentence or two before the list; `rows` are its list,
// each a term and what it says, all plain text; a mono term is written as it
// is typed. `parts` follow the rows, each a list of its own under a heading
// of its own (the choices of one field, say), with an optional lead.
// `corner` draws the larger mark that rides a card's top-right corner. A node
// that holds one calls `attachInfoMarks`.
/** @param {{id: string, label: string, heading: string, named?: string, lead?: string, rows?: readonly InfoRow[], parts?: readonly InfoPart[], corner?: boolean}} info */
export function infoMark({id, label, heading, named = heading, lead = "", rows = [], parts = [], corner = false}) {
    const open = kept === id;
    /** @param {readonly InfoRow[]} list */
    const listed = (list) => list.length ? `<dl>${list.map((row) => `<dt${row.mono ? ` class="mono"` : ""}>${esc(row.term)}</dt><dd>${esc(row.says)}</dd>`).join("")}</dl>` : "";
    return `<span class="info-mark${corner ? " corner" : ""}" data-info-mark${open ? " data-open" : ""}>
        <button type="button" class="info-button" aria-label="${esc(label)}" aria-describedby="${esc(id)}" aria-controls="${esc(id)}" aria-expanded="${open}">${ICON}</button>
        <span class="info-pop" id="${esc(id)}" role="group" aria-label="${esc(named)}"><span class="info-body" tabindex="-1"><span class="info-h">${esc(heading)}</span>${lead ? `<span class="info-lead">${esc(lead)}</span>` : ""}${listed(rows)}${parts
            .map((part) => `<span class="info-part">${esc(part.heading)}</span>${part.lead ? `<span class="info-lead">${esc(part.lead)}</span>` : ""}${listed(part.rows)}`).join("")}</span></span></span>`;
}

// Closes the mark kept open, if one is.
const closeKept = () => {
    kept = null;
    document.querySelectorAll("[data-info-mark][data-open]").forEach((mark) => {
        delete /** @type {HTMLElement} */ (mark).dataset.open;
        mark.querySelector(".info-button")?.setAttribute("aria-expanded", "false");
    });
};

// Escape closes the mark kept open, or shuts the list the pointer is
// previewing; true when it did either. Given `within` (a dialog over the
// screen, say), it acts only on a mark inside it.
/** @param {ParentNode} [within] */
export function escapeInfoMark(within = document) {
    // `within` itself, when it is a mark, or a mark inside it.
    /** @param {string} selector */
    const find = (selector) => /** @type {HTMLElement | null} */ (within instanceof Element && within.matches(selector) ? within : within.querySelector(selector));
    const hovered = find("[data-info-mark]:hover");
    if (kept !== null && (within === document || find("[data-info-mark][data-open]"))) {
        closeKept();
        // Closed, it shows no preview under the pointer either.
        if (hovered) hovered.dataset.shut = "";
        return true;
    }
    if (!hovered || hovered.dataset.shut !== undefined) return false;
    hovered.dataset.shut = "";
    return true;
}

// A press outside the mark kept open closes it; one press listener serves
// every mark.
let listening = false;
const listen = () => {
    if (listening) return;
    listening = true;
    document.addEventListener("pointerdown", (event) => {
        if (kept === null) return;
        const mark = /** @type {Element} */ (event.target).closest?.("[data-info-mark]");
        if (!mark || mark.querySelector(".info-pop")?.id !== kept) closeKept();
    }, true);
};

// Puts an open list where there is room for it: inside the screen's own
// area (.content, which scrolls under the top bar and beside the rail, and
// clips what leaves it), or the window where a mark sits in none.
/** @param {HTMLElement} mark */
function place(mark) {
    const pop = /** @type {HTMLElement | null} */ (mark.querySelector(".info-pop"));
    if (!pop) return;
    const page = document.documentElement, room = parseFloat(getComputedStyle(page).getPropertyValue("--window-room")) || 0;
    const area = mark.closest(".content")?.getBoundingClientRect() ?? {left: 0, top: 0, right: page.clientWidth, bottom: page.clientHeight};
    const left = Math.max(0, area.left) + room, right = Math.min(page.clientWidth, area.right) - room;
    const top = Math.max(0, area.top) + room, bottom = Math.min(page.clientHeight, area.bottom) - room;
    delete mark.dataset.up;
    pop.style.transform = "";
    pop.style.removeProperty("--info-room");
    pop.style.setProperty("--info-wide", `${Math.max(0, right - left)}px`);
    const anchor = mark.getBoundingClientRect(), height = pop.getBoundingClientRect().height;
    if (!height) return;
    const below = bottom - anchor.bottom - GAP, above = anchor.top - GAP - top;
    const up = height > below && above > below;
    if (up) mark.dataset.up = "";
    if (height > (up ? above : below)) pop.style.setProperty("--info-room", `${Math.max(LEAST, up ? above : below)}px`);
    const box = pop.getBoundingClientRect();
    const over = box.right - right, short = left - box.left;
    const shift = over > 0 ? -Math.min(over, Math.max(0, box.left - left)) : short > 0 ? Math.min(short, Math.max(0, right - box.right)) : 0;
    if (shift) pop.style.transform = `translateX(${shift}px)`;
}

// Wires the marks in `root`, itself included: a press on the mark opens its
// list and keeps it open, or closes it; a list is placed as it opens or is
// previewed, scrolls by the arrow keys while the mark has the focus, closes
// on Escape there before anything around it does, and a shut preview opens
// again once the pointer has left.
/** @param {ParentNode} root */
export function attachInfoMarks(root) {
    listen();
    const marks = /** @type {HTMLElement[]} */ ([...(root instanceof HTMLElement && root.matches("[data-info-mark]") ? [root] : []), ...root.querySelectorAll("[data-info-mark]")]);
    for (const mark of marks) {
        const button = /** @type {HTMLButtonElement} */ (mark.querySelector(".info-button"));
        const id = mark.querySelector(".info-pop")?.id || "";
        button.addEventListener("click", () => {
            const opening = kept !== id;
            closeKept();
            // Pressed shut, it stays shut while the pointer is still on it.
            if (!opening) { mark.dataset.shut = ""; return; }
            kept = id;
            delete mark.dataset.shut;
            mark.dataset.open = "";
            button.setAttribute("aria-expanded", "true");
            place(mark);
        });
        mark.addEventListener("mouseleave", () => delete mark.dataset.shut);
        mark.addEventListener("mouseenter", () => place(mark));
        if (kept === id) requestAnimationFrame(() => place(mark));
        mark.addEventListener("keydown", (event) => {
            // Escape on the mark closes its list, and nothing around it (an
            // editor that closes on Escape, the picker) closes too.
            if (event.key === "Escape" && escapeInfoMark(mark)) { event.preventDefault(); event.stopPropagation(); return; }
            const step = /** @type {Record<string, number>} */ ({ArrowDown: 40, ArrowUp: -40, PageDown: 200, PageUp: -200})[event.key];
            const body = mark.querySelector(".info-body");
            if (!step || !body || body.scrollHeight <= body.clientHeight) return;
            body.scrollBy({top: step});
            event.preventDefault();
        });
    }
}
