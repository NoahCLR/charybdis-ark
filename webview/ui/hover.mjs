// @ts-check
// Hovering: the hover card (webview/ui/hover-card.mjs) beside the key, with the
// behaviours its combos run beside that, and any other control's data-tip
// above it. A control reached by the keyboard shows its tip too, and a screen
// reader hears it as the control's description: the focused control is
// described by `describe`, which holds its tip's words while it has the focus.
// Escape (app.mjs) or leaving the control hides it.

// Selector assertions refer to elements created by this module's authored markup.
import {el, html} from "../lib/dom.mjs";
import {behaviourCards, hoverCard} from "./hover-card.mjs";

const tip = el(`<div class="tip" role="tooltip" hidden></div>`);
const describe = el(`<div id="ark-focus-tip" hidden></div>`);
// The control the focus tip describes, and the description it had before.
/** @type {{control: Element, before: string | null} | null} */
let described = null;
const card = el(`<div class="hovercard" hidden></div>`);
// Where the control last pressed was: its tip said what it would do, and it
// is doing it, so the tip stays away until the pointer has left that place
// and come back. The place, not the element, since a render redraws the
// control under the pointer.
/** @type {DOMRect | null} */
let pressed = null;
/** @param {DOMRect} rect @param {MouseEvent} event */
const within = (rect, event) => event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
// The behaviours the key's combos run, each in its own card beside the key's.
const side = el(`<div class="hovercard-side" hidden></div>`);
let timer = 0;

/** @param {HTMLElement} root */
export function mountHover(root) {
    document.body.append(tip, card, side, describe);
    root.addEventListener("mouseover", (event) => {
        const key = /** @type {SVGElement | null} */ (/** @type {Element} */ (event.target).closest("[data-key]"));
        const hinted = /** @type {HTMLElement | null} */ (/** @type {Element} */ (event.target).closest("[data-tip]"));
        clearTimeout(timer);
        // A key being dragged to a swap is not a key being read.
        if (/** @type {HTMLElement | null} */ (document.querySelector(".kc.dragging"))) { hideHover(); return; }
        if (key) {
            const rect = key.getBoundingClientRect();
            timer = setTimeout(() => {
                // A key the layer has no position for has nothing to show.
                card.innerHTML = html(hoverCard(Number(key.dataset.key)));
                if (!card.innerHTML) { hideHover(); return; }
                place(card, rect, 14, true);
                side.innerHTML = html(behaviourCards(Number(key.dataset.key))); placeSide(rect);
            }, 140);
            tip.hidden = true;
            return;
        }
        card.hidden = true; side.hidden = true;
        // A tip that only names its control (data-tip-names) is for when the
        // control shows no words of its own, as the rail's icons do in a
        // narrow window.
        if (pressed && !within(pressed, event)) pressed = null;
        if (hinted && !pressed && !(hinted.hasAttribute("data-tip-names") && hinted.innerText.trim())) {
            const rect = hinted.getBoundingClientRect();
            timer = setTimeout(() => { tip.textContent = hinted.dataset.tip ?? ""; delete tip.dataset.focus; place(tip, rect, 8); }, 260);
            return;
        }
        tip.hidden = true;
    }, true);
    root.addEventListener("pointerdown", (event) => {
        const control = /** @type {Element} */ (event.target).closest("[data-tip]");
        pressed = control?.getBoundingClientRect() ?? null;
        if (pressed) { clearTimeout(timer); tip.hidden = true; }
    }, true);
    root.addEventListener("mouseleave", hideHover, true);
    root.addEventListener("focusin", (event) => focusTip(/** @type {Element} */ (event.target)));
    root.addEventListener("focusout", (event) => {
        if (described?.control === event.target) undescribe();
        if (tip.dataset.focus) { clearTimeout(timer); tip.hidden = true; delete tip.dataset.focus; }
    });
    addEventListener("scroll", hideHover, true);
}

export function hideHover() { clearTimeout(timer); tip.hidden = true; delete tip.dataset.focus; card.hidden = true; side.hidden = true; }

// The tip of the control the focus is on, or of what holds it (a switch's
// label): its words become the control's description at once, and the tip
// shows above it a moment later when the focus came from the keyboard. A tip
// that only names its control adds nothing to its name.
/** @param {Element} control */
function focusTip(control) {
    if (described && described.control !== control) undescribe();
    const hinted = /** @type {HTMLElement | null} */ (control.closest("[data-tip]"));
    const words = hinted && !hinted.hasAttribute("data-tip-names") ? hinted.dataset.tip?.trim() ?? "" : "";
    if (!words || !hinted || words === control.getAttribute("aria-label")) return;
    describe.textContent = words;
    if (described?.control !== control) {
        const before = control.getAttribute("aria-describedby");
        described = {control, before};
        control.setAttribute("aria-describedby", [before, describe.id].filter(Boolean).join(" "));
    }
    if (!control.matches(":focus-visible")) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
        if (!control.isConnected || document.activeElement !== control) return;
        card.hidden = true; side.hidden = true;
        tip.textContent = words;
        tip.dataset.focus = "true";
        place(tip, hinted.getBoundingClientRect(), 8);
    }, 260);
}

function undescribe() {
    if (!described) return;
    const {control, before} = described;
    described = null;
    if (before) control.setAttribute("aria-describedby", before);
    else control.removeAttribute("aria-describedby");
}

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

/** @param {HTMLElement} node @param {DOMRect} rect @param {number} [gap] @param {boolean} [beside] */
function place(node, rect, gap = 10, beside = false) {
    node.hidden = false;
    const box = node.getBoundingClientRect();
    let left, top;
    if (beside) {
        const right = rect.right + gap;
        left = right + box.width < innerWidth - 10 ? right : rect.left - gap - box.width;
        top = rect.top + rect.height / 2 - box.height / 2;
    } else {
        left = rect.left + rect.width / 2 - box.width / 2;
        top = rect.top - box.height - gap;
        if (top < 10) top = rect.bottom + gap;
    }
    node.style.left = `${Math.max(10, Math.min(left, innerWidth - box.width - 10))}px`;
    node.style.top = `${Math.max(10, Math.min(top, innerHeight - box.height - 10))}px`;
}
