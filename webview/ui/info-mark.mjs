// @ts-check
import {esc} from "../lib/dom.mjs";

// The info mark: a small circled i whose list opens while the pointer is on
// the mark or the list, or the keyboard's focus is on the mark, a screen
// reader hearing the list as the mark's description. Escape shuts it
// (data-shut) until the pointer and the focus have left. The board's corner
// mark (keys/board-card.mjs) is drawn the same way.
export const INFO_ICON = `<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.5"/><path d="M8 7.2v4.3"/><circle class="dot" cx="8" cy="4.9" r=".55"/></svg>`;

/** @typedef {{term: string, mono?: boolean, says: string}} InfoRow */

// An info mark beside a heading. `rows` are its list, each a term and what it
// says, both plain text; a mono term is written as it is typed.
/** @param {{id: string, label: string, heading: string, rows: InfoRow[]}} info */
export function infoMark({id, label, heading, rows}) {
    return `<span class="info-mark" data-info-mark>
        <button type="button" class="info-button" aria-label="${esc(label)}" aria-describedby="${esc(id)}">${INFO_ICON}</button>
        <span class="shortcuts-pop info-pop" id="${esc(id)}" role="group" aria-label="${esc(heading)}"><span class="shortcuts-h">${esc(heading)}</span><dl>${rows
            .map((row) => `<dt${row.mono ? ` class="mono"` : ""}>${esc(row.term)}</dt><dd>${esc(row.says)}</dd>`).join("")}</dl></span></span>`;
}

// Escape shuts an open info mark's list; true when it did.
export function escapeInfoMark() {
    const mark = /** @type {HTMLElement | null} */ (document.querySelector("[data-info-mark]:hover, [data-info-mark]:has(:focus-visible)"));
    if (!mark || mark.dataset.shut !== undefined) return false;
    mark.dataset.shut = "";
    return true;
}

// The list opens again once the pointer and the focus have left.
/** @param {ParentNode} root */
export function attachInfoMarks(root) {
    for (const mark of /** @type {NodeListOf<HTMLElement>} */ (root.querySelectorAll("[data-info-mark]"))) {
        const open = () => delete mark.dataset.shut;
        mark.addEventListener("mouseleave", open);
        mark.addEventListener("focusout", open);
    }
}
