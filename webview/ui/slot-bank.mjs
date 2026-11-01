// @ts-check
// The slot bank's own controls (view/slot-bank.mjs): New, which opens the
// first free slot in the editor with its name ready to type, and the one
// disclosure the unused slots fold behind, its open state kept per bank.
import {DISCLOSURE, el, esc} from "../lib/dom.mjs";
import {render, state} from "../store.mjs";
import {allSlotsLabel} from "../view/slot-bank.mjs";

// Whether this bank ("macros", "customKeys") shows every slot.
/** @param {string} bank */
export const allSlotsShown = (bank) => state.allSlotsShown.includes(bank);

/**
 * @param {string} bank
 * @param {{noun: string, count: number, free: boolean, canEdit: boolean, pick: () => void}} options
 *   noun: what New makes ("macro"); count: every slot; free: a slot is free; pick: opens the first free one
 */
export function slotBankControls(bank, {noun, count, free, canEdit, pick}) {
    const open = allSlotsShown(bank);
    const add = /** @type {HTMLButtonElement} */ (el(`<button type="button" class="mslot new-slot" data-act="new-slot" ${free && canEdit ? "" : "disabled"}
        data-tip="${free ? `Open the first free slot, to make a ${esc(noun)} in it.` : "Every slot is in use."}"><span class="v">+ New ${esc(noun)}</span></button>`));
    add.addEventListener("click", () => {
        pick();
        render();
        /** @type {HTMLInputElement | null} */ (document.querySelector(".name-titlebar [data-name]"))?.focus();
    });
    const toggle = /** @type {HTMLButtonElement} */ (el(`<button type="button" class="all-slots" data-all-slots="${esc(bank)}" aria-expanded="${open}">${DISCLOSURE}<span>${esc(allSlotsLabel(count))}</span></button>`));
    toggle.addEventListener("click", () => {
        state.allSlotsShown = open ? state.allSlotsShown.filter((each) => each !== bank) : [...state.allSlotsShown, bank];
        render();
    });
    return {add, toggle};
}
