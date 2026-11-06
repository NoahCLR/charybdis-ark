// @ts-check
// One numbered step of a pointing mode's card: its number, title and an
// optional hint on the right, over the body it returns. A configured mode
// reads four of them; an empty slot offers the first, so making a mode there
// leaves the choice where it was.
import {el, esc} from "../../lib/dom.mjs";

/** @param {HTMLElement} steps the card's `.pd-steps` body @param {number | string} slot @param {number} n @param {string} title @param {string} [hint] */
export function step(steps, slot, n, title, hint = "") {
    const node = el(`<section class="pd-step" aria-labelledby="pd-step-${esc(slot)}-${n}">
        <div class="pd-step-h"><span class="pd-n" aria-hidden="true">${n}</span><h4 id="pd-step-${esc(slot)}-${n}">${esc(title)}</h4>${hint ? `<span class="note">${esc(hint)}</span>` : ""}</div>
        <div class="pd-step-b"></div></section>`);
    steps.append(node);
    return /** @type {HTMLElement} */ (node.querySelector(".pd-step-b"));
}
