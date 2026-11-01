// @ts-check
// Step 1 of a mode, What the ball does: its movement, Scroll or Send keys, as
// two large choices, each saying what it does in the vocabulary's words. A
// radio group, so the arrow keys move between them. The editor redraws its
// form for the movement picked; an empty slot starts a mode of it.
import {el, esc} from "../../lib/dom.mjs";
import {KIND} from "../../view/pointing-config.mjs";
import {word} from "../../view/vocabulary.mjs";
import {words} from "./common.mjs";

/** @param {import("../../../contracts/panel.js").PublishedModel} model @param {number} slotId @param {number | null} kind @param {{disabled: boolean, pick: (kind: number) => void}} options */
export function movementChoice(model, slotId, kind, {disabled, pick}) {
    const {kinds, kindsDo, movementLabel} = words(model);
    /** @param {number} value @param {string} art */
    const choice = (value, art) => `<label class="pd-kind">
        <input type="radio" name="pointing:${esc(slotId)}:kind" value="${value}" data-f="pointing:${esc(slotId)}:kind:${value}" ${kind === value ? "checked" : ""} ${disabled ? "disabled" : ""}>
        <span class="pd-kind-art" aria-hidden="true">${art}</span>
        <span class="pd-kind-text"><b>${esc(word(kinds, value))}</b><span class="note">${esc(word(kindsDo, value))}</span></span></label>`;
    const node = el(`<div class="pd-kinds" role="radiogroup" aria-label="${esc(movementLabel)}">
        ${choice(KIND.SCROLLING, WHEEL)}${choice(KIND.DIRECTIONAL, CROSS)}</div>`);
    // The choice redraws or starts the form; it never stages the record as it is.
    node.addEventListener("change", (event) => {
        event.stopPropagation();
        pick(Number(/** @type {HTMLInputElement} */ (event.target).value));
    });
    return node;
}

const WHEEL = `<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="15"/><path d="M24 4l-4 5h8zM24 44l-4-5h8z"/><rect x="21" y="16" width="6" height="16" rx="3"/></svg>`;
// The ball with an arrow for each direction it reads, four for Send keys.
const CROSS = `<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="13"/><circle cx="24" cy="24" r="2.5" class="dot"/>
    <path d="M24 3l-4 5h8z"/><path d="M24 45l-4-5h8z"/><path d="M3 24l5-4v8z"/><path d="M45 24l-5-4v8z"/></svg>`;
