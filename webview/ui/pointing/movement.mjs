// @ts-check
import {el, esc} from "../../lib/dom.mjs";
import {AXIS, DIAGONALS, DIRECTIONS, axisReads, scrollAxesOf} from "../../view/pointing-config.mjs";
import {ARROWS, SCROLL_LEAD, scrollLabel, words} from "./common.mjs";

/** @typedef {ReturnType<typeof import("./form-controls.mjs").formControls>} FormControls */
/** @param {import("../../../contracts/panel.js").PublishedModel} model @param {import("../surface-types.js").PresentedSlot} slot @param {boolean} scrolling @param {FormControls} controls */
export function movement(model, slot, scrolling, {field, select, shortcut, modifiers}) {
    // ── movement ──────────────────────────────────────────────────────────
    if (!scrolling) {
        const reads = axisReads(slot.axis);
        const card = el(`<div class="card">
            <div class="card-h"><h3>What each direction sends</h3><span class="right" data-axis></span></div>
            <div class="card-b stack"><div class="pd-cross ${slot.axis === AXIS.EIGHT ? "eight" : reads.length === 4 ? "" : reads.includes("up") ? "vertical" : "horizontal"}"></div></div></div>`);
        /** @type {HTMLElement} */ (card.querySelector("[data-axis]")).append(select("Reads", words(model).axes, slot.axis, "axis", {inline: true,
            tip: "Which movement this mode turns into keys. Switching to one axis empties the other axis's shortcuts."}));
        const cross = /** @type {HTMLElement} */ (card.querySelector(".pd-cross"));
        for (const [direction, label] of DIRECTIONS) {
            if (reads.includes(direction)) {
                cross.append(shortcut(label, slot.directions?.[direction]?.keycode, `dir:${direction}`, {
                    klass: `arm ${direction}`, labelHtml: `<b>${ARROWS[direction]}</b> ${esc(label)}`,
                }));
            }
        }
        if (slot.axis === AXIS.EIGHT) {
            for (const [diagonal, label] of DIAGONALS) {
                cross.append(shortcut(label, slot.diagonals?.[diagonal]?.keycode, `diag:${diagonal}`, {
                    klass: `arm ${diagonal}`, labelHtml: `<b>${ARROWS[diagonal]}</b> ${esc(label)}`,
                }));
            }
        }
        // Every directional mode: what moving toward a direction with no
        // shortcut does.
        /** @type {HTMLElement} */ (card.querySelector(".card-b")).append(select("When a direction is empty", words(model).emptyDirection, slot.emptyDirection ?? 0, "emptyDirection",
            {tip: "Moving toward a direction with no shortcut: its neighbours take over its share; both neighbours are sent (a diagonal's two straight directions, a straight direction's two diagonals, so in eight directions only); or the move does nothing."}));
        /** @type {HTMLElement} */ (card.querySelector(".card-b")).append(select("How often it sends", words(model).directionOutput, slot.directionOutput ?? 0, "directionOutput",
            {tip: "Every step sends the shortcut again each time the ball moves a threshold further. Once per movement sends it once, however far the ball goes; it sends again when the ball moves back the other way, or after a 150 ms pause. Turning toward another direction sends nothing more."}));
        cross.append(el(`<div class="hub" aria-hidden="true"><svg viewBox="0 0 64 64">
            <circle cx="32" cy="32" r="22"/><circle cx="32" cy="32" r="3"/>
            ${reads.includes("up") ? `<path d="M32 4l-4 5h8z"/>` : ""}${reads.includes("down") ? `<path d="M32 60l-4-5h8z"/>` : ""}
            ${reads.includes("left") ? `<path d="M4 32l5-4v8z"/>` : ""}${reads.includes("right") ? `<path d="M60 32l-5-4v8z"/>` : ""}
            ${slot.axis === AXIS.EIGHT ? `<path d="M12 12l7 1-6 6z"/><path d="M52 12l-7 1 6 6z"/><path d="M12 52l7-1-6-6z"/><path d="M52 52l-7-1 6-6z"/>` : ""}
            </svg><span class="tag">trackball</span></div>`));
        return card;
    } else {
        const card = el(`<div class="card">
            <div class="card-h"><h3>Scrolling</h3></div>
            <div class="card-b stack"><div class="pd-grid4"></div><div class="pd-split"></div></div></div>`);
        const steps = /** @type {HTMLElement} */ (card.querySelector(".pd-grid4"));
        for (const [key, unit] of SCROLL_LEAD) steps.append(field(scrollLabel(model, key, unit), slot.scroll?.[key], `scroll:${key}`, {unit}));
        const lower = /** @type {HTMLElement} */ (card.querySelector(".pd-split"));
        lower.append(select("Scrolls", words(model).scrollAxes, scrollAxesOf(slot), "scrollAxes",
            {tip: "Which way this mode scrolls. With one axis, a swipe the other way does nothing, and its slight drift does not scroll the allowed axis."}));
        lower.append(select("Reverse scrolling", words(model).invert, slot.scroll?.invert, "invert"));
        lower.append(modifiers(words(model).heldModifiers, slot.heldModifiers, "heldModifiers"));
        return card;
    }

}
