// @ts-check
// The slot bank's own controls (view/slot-bank.mjs): New, which opens the
// first free slot in the editor with its name ready to type, and the one
// disclosure the unused slots fold behind, its open state kept per bank. A
// grouped table of slots (Lighting's pointing modes) folds them under its
// last band instead, the same open state kept (toggleAllSlots), worded as
// view/slot-bank.mjs words it.
//
// Two slots swap by one tile dragged onto another (D-L81), or from the
// keyboard: Shift+Space holds the focused tile, Shift+Space on another drops
// it there, Escape lets go. Either posts the bank's swap; the core moves the
// two with everything that is theirs and every key that reaches them, and
// the screen's selection follows the one that was dragged.
import {disclosureButton} from "./disclosure.mjs";
import {el, esc} from "../lib/dom.mjs";
import {render, state} from "../store.mjs";
import {allSlotsLabel} from "../view/slot-bank.mjs";

// What a tile's tip says of swapping, after what the slot holds.
export const SWAP_TIP = "Drag onto another slot to swap the two, or press Shift+Space here and then on the other slot.";
const HELD_TIP = "Held. Press Shift+Space on another slot to swap the two, or Escape to let go.";
const DRAG_START = 4;

// Whether this tile is the one held for a keyboard swap.
/** @param {string} bank @param {string} key */
const isHeld = (bank, key) => state.heldSlot?.bank === bank && state.heldSlot.key === key;

/**
 * Makes a tile swappable. `keyOf` reads another tile's key, null for a tile
 * that is no slot (New, the disclosure); `onSwap(from, to)` posts the swap
 * and moves the selection.
 * @param {HTMLElement} tile
 * @param {{bank: string, key: string, canEdit: boolean, keyOf: (tile: Element) => string | null, onSwap: (from: string, to: string) => void}} options
 */
export function swappable(tile, {bank, key, canEdit, keyOf, onSwap}) {
    if (!canEdit) return;
    // A held tile is outlined and its tip says what to do next; the page's
    // live region says it too (view/announcements.mjs).
    if (isHeld(bank, key)) {
        tile.classList.add("held");
        tile.dataset.tip = HELD_TIP;
    }
    tile.addEventListener("pointerdown", (event) => dragTile(event, tile, key, keyOf, onSwap));
    tile.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && state.heldSlot) {
            event.preventDefault();
            state.heldSlot = null;
            render();
            return;
        }
        if (!event.shiftKey || !(event.key === " " || event.key === "Enter")) return;
        event.preventDefault();
        const holding = state.heldSlot;
        if (holding && holding.bank === bank && holding.key !== key) {
            state.heldSlot = null;
            onSwap(holding.key, key);
            return;
        }
        state.heldSlot = holding && holding.bank === bank && holding.key === key ? null : {bank, key};
        render();
        /** @type {HTMLElement | null} */ (document.querySelector(`[data-swap-bank="${bank}"][data-swap-key="${CSS.escape(key)}"]`))?.focus();
    });
    tile.dataset.swapBank = bank;
    tile.dataset.swapKey = key;
}

// Drags a tile by the pointer. The tile follows the pointer; the slot under
// it is marked as the drop; releasing there swaps the two. A press that
// never moves is the tile's ordinary click, which picks it.
/** @param {PointerEvent} event @param {HTMLElement} tile @param {string} key @param {(tile: Element) => string | null} keyOf @param {(from: string, to: string) => void} onSwap */
function dragTile(event, tile, key, keyOf, onSwap) {
    if (event.button !== 0) return;
    const grid = tile.parentElement;
    const originX = event.clientX, originY = event.clientY;
    let moved = false;
    /** @type {Element | null} */
    let over = null;
    /** @param {PointerEvent} next */
    const onMove = (next) => {
        const dx = next.clientX - originX, dy = next.clientY - originY;
        if (!moved) {
            if (Math.hypot(dx, dy) < DRAG_START) return;
            moved = true;
            tile.classList.add("dragging");
            grid?.classList.add("swapping");
        }
        tile.style.transform = `translate(${dx}px, ${dy}px)`;
        // The dragged tile takes no pointer events while it drags, so the
        // point under the pointer is the tile beneath it.
        const under = document.elementFromPoint(next.clientX, next.clientY)?.closest(".mslot");
        const target = under && under !== tile && keyOf(under) !== null ? under : null;
        if (target !== over) {
            over?.classList.remove("drop-target");
            target?.classList.add("drop-target");
            over = target;
        }
    };
    const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        tile.classList.remove("dragging");
        grid?.classList.remove("swapping");
        tile.style.transform = "";
        over?.classList.remove("drop-target");
        const to = over ? keyOf(over) : null;
        if (moved && to !== null && to !== key) onSwap(key, to);
    };
    // The window hears the pointer wherever it goes, off the tile included.
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
}

// Whether this bank ("macros", "customKeys", "pointing", "lighting-pointing") shows every slot.
/** @param {string} bank */
export const allSlotsShown = (bank) => state.allSlotsShown.includes(bank);
// Shows this bank's unused slots, or folds them again.
/** @param {string} bank */
export const toggleAllSlots = (bank) => {
    state.allSlotsShown = allSlotsShown(bank) ? state.allSlotsShown.filter((each) => each !== bank) : [...state.allSlotsShown, bank];
};

/**
 * @param {string} bank
 * @param {{noun: string, count: number, free: boolean, canEdit: boolean, pick: () => void}} options
 *   noun: what New makes ("macro"); count: every slot; free: a slot is free; pick: opens the first free one
 */
export function slotBankControls(bank, {noun, count, free, canEdit, pick}) {
    const add = /** @type {HTMLButtonElement} */ (el(`<button type="button" class="mslot new-slot" data-act="new-slot" ${free && canEdit ? "" : "disabled"}
        data-tip="${free ? `Open the first free slot, to make a ${esc(noun)} in it.` : "Every slot is in use."}"><span class="v">+ New ${esc(noun)}</span></button>`));
    add.addEventListener("click", () => {
        pick();
        render();
        /** @type {HTMLInputElement | null} */ (document.querySelector(".name-titlebar [data-name]"))?.focus();
    });
    return {add, toggle: disclosure(bank, allSlotsLabel(count))};
}

/** @param {string} bank @param {string} label */
function disclosure(bank, label) {
    const open = allSlotsShown(bank);
    const toggle = /** @type {HTMLButtonElement} */ (el(disclosureButton(label, {open, className: "all-slots", attrs: `data-all-slots="${esc(bank)}"`})));
    toggle.addEventListener("click", () => {
        toggleAllSlots(bank);
        render();
    });
    return toggle;
}
