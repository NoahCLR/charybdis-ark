// @ts-check
// Hovering: the hover card (webview/ui/hover-card.mjs) beside a key of a board
// that opens cards (data-card: the Keymap's, not Lighting's), with the
// behaviours its combos run beside that, and any other control's data-tip at
// the pointer (D-L80). A control reached by the keyboard shows its tip too,
// above the control since no pointer is there, and a screen reader hears it
// as the control's description: the focused control is described by
// `describe`, which holds its tip's words while it has the focus. Escape
// (app.mjs) or leaving the control hides it.

// Selector assertions refer to elements created by this module's authored markup.
import {el, html} from "../lib/dom.mjs";
import {behaviourCards, hoverCard} from "./hover-card.mjs";

// A control with words to show: one drawn with an empty tip has none, and a
// tipped control around it answers instead.
const TIPPED = '[data-tip]:not([data-tip=""])';
const tip = el(`<div class="tip" role="tooltip" hidden></div>`);
const describe = el(`<div id="ark-focus-tip" hidden></div>`);
// The control the focus tip describes.
/** @type {{control: Element} | null} */
let described = null;
const card = el(`<div class="hovercard" hidden></div>`);
// Where the pointer is, so a tip opens there and not at its control: a wide
// row's tip would otherwise sit far from the pointer resting on one end of it.
let pointer = {x: 0, y: 0};
// The control whose tip is open or on its way. Crossing the control's own
// children fires mouseover again; the tip stays where it opened.
/** @type {HTMLElement | null} */
let shown = null;
// Where the control last pressed was: its tip said what it would do, and it
// is doing it, so the tip stays away until the pointer has left that place
// and come back. The place, not the element, since a render redraws the
// control under the pointer.
/** @type {DOMRect | null} */
let pressed = null;
/** @param {DOMRect} rect @param {MouseEvent} event */
const within = (rect, event) => event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
// The behaviours the key's combos run, each in its own card beside the key.
const side = el(`<div class="hovercard-side" hidden></div>`);
let timer = 0;

/** @param {HTMLElement} root */
export function mountHover(root) {
    document.body.append(tip, card, side, describe);
    root.addEventListener("mousemove", (event) => { pointer = {x: event.clientX, y: event.clientY}; }, {capture: true, passive: true});
    root.addEventListener("mouseover", (event) => {
        pointer = {x: event.clientX, y: event.clientY};
        const key = /** @type {SVGElement | null} */ (/** @type {Element} */ (event.target).closest("[data-key][data-card]"));
        const hinted = /** @type {HTMLElement | null} */ (/** @type {Element} */ (event.target).closest(TIPPED));
        // Still on the control whose tip is open or on its way: nothing to redo.
        if (hinted && hinted === shown && !key) return;
        clearTimeout(timer);
        // A key being dragged to a swap is not a key being read.
        if (/** @type {HTMLElement | null} */ (document.querySelector(".kc.dragging"))) { hideHover(); return; }
        if (key) {
            const rect = key.getBoundingClientRect();
            timer = setTimeout(() => {
                // A key the layer has no position for has nothing to show.
                card.innerHTML = html(hoverCard(Number(key.dataset.key)));
                if (!card.innerHTML) { hideHover(); return; }
                place(card, rect, 14);
                side.innerHTML = html(behaviourCards(Number(key.dataset.key))); placeSide(rect);
            }, 140);
            tip.hidden = true; shown = null;
            return;
        }
        card.hidden = true; side.hidden = true;
        // A tip that only names its control (data-tip-names) is for when the
        // control shows no words of its own, as the rail's icons do in a
        // narrow window.
        if (pressed && !within(pressed, event)) pressed = null;
        if (hinted && !pressed && !(hinted.hasAttribute("data-tip-names") && hinted.innerText.trim())) {
            // The open tip already says this, and the pointer is still about
            // the same control (one a render redrew under it, one nested in
            // the last, or the last after crossing one nested in it): the tip
            // stays where it opened.
            const about = !shown || !shown.isConnected || shown.contains(hinted) || hinted.contains(shown);
            if (!tip.hidden && !tip.dataset.focus && about && tip.textContent === hinted.dataset.tip) { shown = hinted; return; }
            shown = hinted;
            timer = setTimeout(() => { tip.textContent = hinted.dataset.tip ?? ""; delete tip.dataset.focus; placeAtPointer(tip); }, 260);
            return;
        }
        tip.hidden = true; shown = null;
    }, true);
    root.addEventListener("pointerdown", (event) => {
        const control = /** @type {Element} */ (event.target).closest(TIPPED);
        pressed = control?.getBoundingClientRect() ?? null;
        if (pressed) { clearTimeout(timer); tip.hidden = true; shown = null; }
    }, true);
    // Leaving the page (not a child of it: mouseleave caught in capture fires
    // for every element left, and would hide a tip at each child crossed).
    root.addEventListener("mouseleave", hideHover);
    root.addEventListener("focusin", (event) => focusTip(/** @type {Element} */ (event.target)));
    root.addEventListener("focusout", (event) => {
        if (described?.control === event.target) undescribe();
        if (tip.dataset.focus) { clearTimeout(timer); tip.hidden = true; delete tip.dataset.focus; }
    });
    addEventListener("scroll", hideHover, true);
}

export function hideHover() { clearTimeout(timer); tip.hidden = true; delete tip.dataset.focus; shown = null; card.hidden = true; side.hidden = true; }

// The tip of the control the focus is on, or of what holds it (a switch's
// label): its words become the control's description at once, and the tip
// shows above it a moment later when the focus came from the keyboard. A tip
// that only names its control adds nothing to its name.
/** @param {Element} control */
function focusTip(control) {
    if (described && described.control !== control) undescribe();
    const hinted = /** @type {HTMLElement | null} */ (control.closest(TIPPED));
    const words = hinted && !hinted.hasAttribute("data-tip-names") ? hinted.dataset.tip?.trim() ?? "" : "";
    if (!words || !hinted || words === control.getAttribute("aria-label")) return;
    describe.textContent = words;
    if (described?.control !== control) {
        described = {control};
        control.setAttribute("aria-describedby", [...describedIds(control), describe.id].join(" "));
    }
    if (!control.matches(":focus-visible")) return;
    clearTimeout(timer);
    shown = null;
    timer = setTimeout(() => {
        if (!control.isConnected || document.activeElement !== control) return;
        card.hidden = true; side.hidden = true;
        tip.textContent = words;
        tip.dataset.focus = "true";
        placeAbove(tip, hinted.getBoundingClientRect(), 8);
    }, 260);
}

// Only the tip's own description goes: what the control was given while
// focused (a refused field's reason) stays.
function undescribe() {
    if (!described) return;
    const {control} = described;
    described = null;
    const ids = describedIds(control);
    if (ids.length) control.setAttribute("aria-describedby", ids.join(" "));
    else control.removeAttribute("aria-describedby");
}
// The descriptions a control has besides the tip's.
/** @param {Element} control */
const describedIds = (control) => (control.getAttribute("aria-describedby") || "").split(/\s+/).filter((id) => id && id !== describe.id);

// Beside the key's card, on its far side from the key, or across the key when
// there is no room there.
/** @param {DOMRect} keyRect */
function placeSide(keyRect) {
    side.hidden = !side.innerHTML;
    if (side.hidden) return;
    const main = card.getBoundingClientRect(), box = side.getBoundingClientRect();
    const right = main.left >= keyRect.right;
    let left = right ? main.right + 10 : main.left - 10 - box.width;
    if (left < 10 || left + box.width > innerWidth - 10) left = right ? keyRect.left - 14 - box.width : keyRect.right + 14;
    side.style.left = `${Math.max(10, Math.min(left, innerWidth - box.width - 10))}px`;
    side.style.top = `${Math.max(10, Math.min(main.top, innerHeight - box.height - 10))}px`;
}

// Below and to the right of the pointer, clear of its arrow, as the system's
// own tips sit; above it when the window's bottom is too near. The tip opens
// where the pointer rested and stays there while it stays on the control.
/** @param {HTMLElement} node */
function placeAtPointer(node) {
    node.hidden = false;
    const box = node.getBoundingClientRect();
    let top = pointer.y + 20;
    if (top + box.height > innerHeight - 10) top = pointer.y - 8 - box.height;
    fix(node, box, pointer.x + 12, top);
}

// Beside the key, on whichever side has room, level with its middle.
/** @param {HTMLElement} node @param {DOMRect} rect @param {number} gap */
function place(node, rect, gap) {
    node.hidden = false;
    const box = node.getBoundingClientRect();
    const right = rect.right + gap;
    fix(node, box, right + box.width < innerWidth - 10 ? right : rect.left - gap - box.width, rect.top + rect.height / 2 - box.height / 2);
}

// Over the control's middle, under it when the window's top is too near.
/** @param {HTMLElement} node @param {DOMRect} rect @param {number} gap */
function placeAbove(node, rect, gap) {
    node.hidden = false;
    const box = node.getBoundingClientRect();
    const top = rect.top - box.height - gap;
    fix(node, box, rect.left + rect.width / 2 - box.width / 2, top < 10 ? rect.bottom + gap : top);
}

/** @param {HTMLElement} node @param {DOMRect} box @param {number} left @param {number} top */
function fix(node, box, left, top) {
    node.style.left = `${Math.max(10, Math.min(left, innerWidth - box.width - 10))}px`;
    node.style.top = `${Math.max(10, Math.min(top, innerHeight - box.height - 10))}px`;
}
