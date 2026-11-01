// @ts-check
// Step 1 of a mode, What the ball does: Scroll or Send keys, as two large
// choices, each saying what it does. A radio group, so the arrow keys move
// between them. The editor redraws its form for the kind picked; an empty
// slot starts a mode of it.
import {el, esc} from "../../lib/dom.mjs";
import {AXIS, KIND, axisReads} from "../../view/pointing-config.mjs";
import {word} from "../../view/vocabulary.mjs";
import {words} from "./common.mjs";

/** @param {import("../../../contracts/panel.js").PublishedModel} model @param {number} slotId @param {number | null} kind @param {{disabled: boolean, pick: (kind: number) => void}} options */
export function kindChoice(model, slotId, kind, {disabled, pick}) {
    const kinds = words(model).kinds;
    /** @param {number} value @param {string} art @param {string} what */
    const choice = (value, art, what) => `<label class="pd-kind">
        <input type="radio" name="pointing:${esc(slotId)}:kind" value="${value}" data-f="pointing:${esc(slotId)}:kind:${value}" ${kind === value ? "checked" : ""} ${disabled ? "disabled" : ""}>
        <span class="pd-kind-art" aria-hidden="true">${art}</span>
        <span class="pd-kind-text"><b>${esc(word(kinds, value))}</b><span class="note">${esc(what)}</span></span></label>`;
    const node = el(`<div class="pd-kinds" role="radiogroup" aria-label="What the ball does">
        ${choice(KIND.SCROLLING, WHEEL, "The ball scrolls the page.")}
        ${choice(KIND.DIRECTIONAL, cross(AXIS.DOMINANT), "Each direction sends a key or shortcut.")}</div>`);
    // The choice redraws or starts the form; it never stages the record as it is.
    node.addEventListener("change", (event) => {
        event.stopPropagation();
        pick(Number(/** @type {HTMLInputElement} */ (event.target).value));
    });
    return node;
}

const WHEEL = `<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="15"/><path d="M24 4l-4 5h8zM24 44l-4-5h8z"/><rect x="21" y="16" width="6" height="16" rx="3"/></svg>`;
/** @param {number} axis */
const cross = (axis) => {
    const reads = axisReads(axis);
    return `<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="13"/><circle cx="24" cy="24" r="2.5" class="dot"/>
        ${reads.includes("up") ? `<path d="M24 3l-4 5h8z"/>` : ""}${reads.includes("down") ? `<path d="M24 45l-4-5h8z"/>` : ""}
        ${reads.includes("left") ? `<path d="M3 24l5-4v8z"/>` : ""}${reads.includes("right") ? `<path d="M45 24l-5-4v8z"/>` : ""}</svg>`;
};
