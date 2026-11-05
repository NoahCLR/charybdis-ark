// @ts-check
// The slot bank's own controls (view/slot-bank.mjs): New, which opens the
// first free slot in the editor with its name ready to type, and the one
// disclosure the unused slots fold behind, its open state kept per bank. A
// list of slots beside an editor (Lighting's pointing modes) folds its empty
// slots behind the same disclosure, worded as a list of layers words its empty
// layers (ui/empty-layers.mjs).
import {DISCLOSURE, el, esc} from "../lib/dom.mjs";
import {render, state} from "../store.mjs";
import {allSlotsLabel, emptySlotsLabel} from "../view/slot-bank.mjs";

// Whether this bank ("macros", "customKeys", "pointing", "lighting-pointing") shows every slot.
/** @param {string} bank */
export const allSlotsShown = (bank) => state.allSlotsShown.includes(bank);

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
    return {add, toggle: disclosure(bank, "all-slots", allSlotsLabel(count))};
}

// The disclosure at the end of a list of slots, holding its `count` empty
// ones; a slot holds no `noun` ("mode") when it is empty.
/** @param {string} bank @param {number} count @param {string} noun @param {string} [className] */
export const emptySlotsButton = (bank, count, noun, className = "") =>
    disclosure(bank, `empty-slots${className ? ` ${className}` : ""}`, emptySlotsLabel(count),
        allSlotsShown(bank) ? "Hide the empty slots." : `Show the slots with no ${noun} in them.`);

/** @param {string} bank @param {string} className @param {string} label @param {string} [tip] */
function disclosure(bank, className, label, tip = "") {
    const open = allSlotsShown(bank);
    const toggle = /** @type {HTMLButtonElement} */ (el(`<button type="button" class="${esc(className)}" data-all-slots="${esc(bank)}" aria-expanded="${open}"
        ${tip ? `data-tip="${esc(tip)}"` : ""}>${DISCLOSURE}<span>${esc(label)}</span></button>`));
    toggle.addEventListener("click", () => {
        state.allSlotsShown = open ? state.allSlotsShown.filter((each) => each !== bank) : [...state.allSlotsShown, bank];
        render();
    });
    return toggle;
}
