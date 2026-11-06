// @ts-check
// A bank of slots (Macros, Custom keys, Pointing modes) opens on what is in it: the slots in
// use, in slot order, and New, which picks the first free slot. The unused
// slots fold behind one disclosure after them, which draws them after it, in
// slot order, so nothing already shown moves. The slot open in the editor, and
// one the draft changed, always show. A search looks through every slot.

/**
 * @template T
 * @param {readonly T[]} slots every slot, in slot order
 * @param {{inUse: (slot: T) => boolean, free: (slot: T) => boolean, keep: (slot: T) => boolean,
 *   matches: (slot: T) => boolean, searching: boolean, open: boolean}} rule
 *   inUse: it holds something; free: New may pick it; keep: it shows folded or not
 *   (the open slot, one the draft changed); open: the disclosure is open
 * @returns {{shown: T[], revealed: T[], folded: number, firstFree: T | null}}
 *   shown: drawn before the disclosure (every match, while searching);
 *   revealed: drawn after it, while it is open; folded: how many it holds
 */
export function slotBank(slots, {inUse, free, keep, matches, searching, open}) {
    if (searching) return {shown: slots.filter(matches), revealed: [], folded: 0, firstFree: slots.find(free) ?? null};
    const lead = (/** @type {T} */ slot) => inUse(slot) || keep(slot);
    const rest = slots.filter((slot) => !lead(slot));
    return {shown: slots.filter(lead), revealed: open ? rest : [], folded: rest.length, firstFree: slots.find(free) ?? null};
}

// The disclosure's words, for a bank of `count` slots.
/** @param {number} count */
export const allSlotsLabel = (count) => `Show all ${count} slots`;

// What a group of empty slots is called where a list groups what it lists
// (Lighting's pointing modes, a grouped table's band), as its layer list's
// empty layers are (view/empty-layers.mjs), and what they are.
export const EMPTY_SLOTS_TITLE = "Empty slots";
export const EMPTY_SLOTS_TIP = "The slots with no pointing mode in them.";
