// @ts-check
import {esc} from "../lib/dom.mjs";

// The info mark, the one there is: a small circled i whose list opens while
// the pointer is on the mark or the list, or the keyboard's focus is on the
// mark, a screen reader hearing the list as the mark's description. Escape
// shuts it (data-shut) until the pointer and the focus have left. It sits
// beside a heading (Text replacement's sections) or on a corner (the Keymap
// board's shortcuts, keys/board-card.mjs). An open list is kept inside the
// screen's area: moved sideways where it would run off an edge, opened upward where
// there is more room above the mark than under it, and no taller than that
// room, its body scrolling (by the wheel, or the arrow keys from the mark;
// the body itself is no tab stop, since the list shows only while the mark
// has the focus).
const ICON = `<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.5"/><path d="M8 7.2v4.3"/><circle class="dot" cx="8" cy="4.9" r=".55"/></svg>`;
// The space between a mark and its list (styles.css, .info-pop), and the
// least height a list is given however short the window.
const GAP = 6, LEAST = 96;

/** @typedef {{term: string, mono?: boolean, says: string}} InfoRow */

// An info mark's markup. `label` names the mark and `heading` heads its list
// (`named` names the list where its heading alone would not say what of);
// `lead` is an optional sentence or two before the list; `rows` are its list,
// each a term and what it says, all plain text; a mono term is written as it
// is typed. `corner` draws the larger mark that rides a card's top-right
// corner. A node that holds one calls `attachInfoMarks`.
/** @param {{id: string, label: string, heading: string, named?: string, lead?: string, rows: readonly InfoRow[], corner?: boolean}} info */
export function infoMark({id, label, heading, named = heading, lead = "", rows, corner = false}) {
    return `<span class="info-mark${corner ? " corner" : ""}" data-info-mark>
        <button type="button" class="info-button" aria-label="${esc(label)}" aria-describedby="${esc(id)}">${ICON}</button>
        <span class="info-pop" id="${esc(id)}" role="group" aria-label="${esc(named)}"><span class="info-body" tabindex="-1"><span class="info-h">${esc(heading)}</span>${lead ? `<span class="info-lead">${esc(lead)}</span>` : ""}<dl>${rows
            .map((row) => `<dt${row.mono ? ` class="mono"` : ""}>${esc(row.term)}</dt><dd>${esc(row.says)}</dd>`).join("")}</dl></span></span></span>`;
}

// Escape shuts an open info mark's list; true when it did.
export function escapeInfoMark() {
    const mark = /** @type {HTMLElement | null} */ (document.querySelector("[data-info-mark]:hover, [data-info-mark]:has(:focus-visible)"));
    if (!mark || mark.dataset.shut !== undefined) return false;
    mark.dataset.shut = "";
    return true;
}

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

// Wires the marks in `root`, itself included: a list is placed as it opens,
// scrolls by the arrow keys while the mark has the focus, and opens again
// once the pointer and the focus have left.
/** @param {ParentNode} root */
export function attachInfoMarks(root) {
    const marks = /** @type {HTMLElement[]} */ ([...(root instanceof HTMLElement && root.matches("[data-info-mark]") ? [root] : []), ...root.querySelectorAll("[data-info-mark]")]);
    for (const mark of marks) {
        const open = () => delete mark.dataset.shut;
        mark.addEventListener("mouseleave", open);
        mark.addEventListener("focusout", open);
        mark.addEventListener("mouseenter", () => place(mark));
        mark.addEventListener("focusin", () => place(mark));
        mark.addEventListener("keydown", (event) => {
            const step = /** @type {Record<string, number>} */ ({ArrowDown: 40, ArrowUp: -40, PageDown: 200, PageUp: -200})[event.key];
            const body = mark.querySelector(".info-body");
            if (!step || !body || body.scrollHeight <= body.clientHeight) return;
            body.scrollBy({top: step});
            event.preventDefault();
        });
    }
}
