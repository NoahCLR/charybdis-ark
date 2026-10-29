// @ts-check
// Hovering: the hover card (webview/ui/hover-card.mjs) beside the key, with the
// behaviours its combos run beside that, and any other control's data-tip
// above it.

// Selector assertions refer to elements created by this module's authored markup.
import {el, html} from "../lib/dom.mjs";
import {behaviourCards, hoverCard} from "./hover-card.mjs";

const tip = el(`<div class="tip" hidden></div>`);
const card = el(`<div class="hovercard" hidden></div>`);
// The behaviours the key's combos run, each in its own card beside the key's.
const side = el(`<div class="hovercard-side" hidden></div>`);
let timer = 0;

/** @param {HTMLElement} root */
export function mountHover(root) {
    document.body.append(tip, card, side);
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
        if (hinted) {
            const rect = hinted.getBoundingClientRect();
            timer = setTimeout(() => { tip.textContent = hinted.dataset.tip ?? ""; place(tip, rect, 8); }, 260);
            return;
        }
        tip.hidden = true;
    }, true);
    root.addEventListener("mouseleave", hideHover, true);
    addEventListener("scroll", hideHover, true);
}

export function hideHover() { clearTimeout(timer); tip.hidden = true; card.hidden = true; side.hidden = true; }

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
