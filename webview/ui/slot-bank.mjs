// @ts-check
// The slot bank's own controls (view/slot-bank.mjs): New, which opens the
// first free slot in the editor with its name ready to type, and the one
// disclosure the unused slots fold behind, its open state kept per bank. A
// grouped table of slots (Lighting's pointing modes) folds them under its
// last band instead, the same open state kept (toggleAllSlots), worded as
// view/slot-bank.mjs words it.
import {disclosureButton} from "./disclosure.mjs";
import {el, esc} from "../lib/dom.mjs";
import {render, state} from "../store.mjs";
import {allSlotsLabel} from "../view/slot-bank.mjs";

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
