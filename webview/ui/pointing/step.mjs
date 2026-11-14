// @ts-check
// One numbered step of a pointing mode's card: its number, title, an
// optional info mark beside the title saying what its choices mean (D-L96),
// and an optional hint on the right, over the body it returns. A configured
// mode reads four of them; an empty slot offers the first, so making a mode
// there leaves the choice where it was.
import {el, esc} from "../../lib/dom.mjs";
import {attachInfoMarks, infoMark} from "../info-mark.mjs";

/** @param {HTMLElement} steps the card's `.pd-steps` body @param {number | string} slot @param {number} n @param {string} title @param {string} [hint] @param {{rows?: readonly import("../info-mark.mjs").InfoRow[], parts?: readonly import("../info-mark.mjs").InfoPart[]}} [about] */
export function step(steps, slot, n, title, hint = "", {rows = [], parts = []} = {}) {
    const info = rows.length || parts.length ? infoMark({id: `pd-info-${slot}-${n}`, label: `About step ${n}, ${title}`, heading: title, rows, parts}) : "";
    const node = el(`<section class="pd-step" aria-labelledby="pd-step-${esc(slot)}-${n}">
        <div class="pd-step-h"><span class="pd-n" aria-hidden="true">${n}</span><h4 id="pd-step-${esc(slot)}-${n}">${esc(title)}</h4>${info}${hint ? `<span class="note">${esc(hint)}</span>` : ""}</div>
        <div class="pd-step-b"></div></section>`);
    attachInfoMarks(node);
    steps.append(node);
    return /** @type {HTMLElement} */ (node.querySelector(".pd-step-b"));
}
