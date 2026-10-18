// @ts-check
import {el, esc} from "../../lib/dom.mjs";
import {AXIS, DIAGONALS, DIRECTIONS, SCROLL_AXES, axisReads, scrollAxesOf} from "../../view/pointing-config.mjs";
import {ARROWS, words} from "./common.mjs";

/** @typedef {ReturnType<typeof import("./form-controls.mjs").formControls>} FormControls */
/** @param {import("../../../contracts/panel.js").PublishedModel} model @param {import("../surface-types.js").PresentedSlot} slot @param {boolean} scrolling @param {FormControls} controls */
export function movement(model, slot, scrolling, {select, shortcut, modifiers}) {
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
        // What moving toward a direction with no shortcut does, shown only
        // when a direction it reads is empty; "Send both neighbours" only
        // where there are neighbours to send, in eight directions (or as
        // stored).
        const body = /** @type {HTMLElement} */ (card.querySelector(".card-b"));
        const eight = slot.axis === AXIS.EIGHT;
        const read = [...reads.map((direction) => slot.directions?.[direction]), ...(eight ? DIAGONALS.map(([diagonal]) => slot.diagonals?.[diagonal]) : [])];
        const empty = read.some((tap) => !Number(tap?.keycode) && !(typeof tap?.keycode === "string" && tap.keycode !== "0"));
        if (empty || (slot.emptyDirection ?? 0) !== 0) {
            const choices = words(model).emptyDirection.filter(([value]) => value !== 1 || eight || slot.emptyDirection === 1);
            body.append(select("When a direction is empty", choices, slot.emptyDirection ?? 0, "emptyDirection",
                {tip: "Moving toward a direction with no shortcut: its neighbours take over its share; both neighbours are sent (a diagonal's two straight directions, a straight direction's two diagonals, so in eight directions only); or the move does nothing."}));
        }
        body.append(select("How often it sends", words(model).directionOutput, slot.directionOutput ?? 0, "directionOutput",
            {tip: "Every step sends the shortcut again each time the ball moves a step further. Once per movement sends it once, however far the ball goes; it sends again when the ball moves back the other way, or after a 150 ms pause. Turning toward another direction sends nothing more."}));
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
            <div class="card-b stack"><div class="pd-split pd-split-top"></div></div></div>`);
        const lower = /** @type {HTMLElement} */ (card.querySelector(".pd-split"));
        const axes = scrollAxesOf(slot);
        lower.append(select("Scrolls", words(model).scrollAxes, axes, "scrollAxes",
            {tip: "Which way this mode scrolls. With one axis, a swipe the other way does nothing, and its slight drift does not scroll the allowed axis."}));
        // Reversing an axis the mode does not scroll does nothing, so only
        // the axes it scrolls are offered (a stored choice stays shown).
        const invert = Number(slot.scroll?.invert ?? 0);
        const reversible = words(model).invert.filter(([value]) => value === invert || axes === SCROLL_AXES.BOTH
            || (axes === SCROLL_AXES.HORIZONTAL ? !(value & 2) : !(value & 1)));
        lower.append(select("Reverse scrolling", reversible, invert, "invert",
            {tip: "Which axes scroll the other way from the ball. Your computer's natural scrolling setting flips them again."}));
        /** @type {HTMLElement} */ (card.querySelector(".card-b")).append(modifiers(words(model).heldModifiers, slot.heldModifiers, "heldModifiers"));
        return card;
    }

}
