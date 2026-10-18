// @ts-check
// The macro bank as the Macros list shows it: the slots in use first, the
// empty ones folded behind a count, the first free slot for "+ New macro",
// macro memory in one line, and what is wrong with a stored macro in words.
// Pure, so the rules are tested apart from the screen (tests/view/macro-bank.test.mjs).
import {macroMatches} from "./macro.mjs";

/** @typedef {Pick<import("../../contracts/panel.js").MacroSlot, "keycode" | "name" | "empty" | "available">} BankSlot */
/** @typedef {NonNullable<import("../../contracts/panel.js").PublishedModel["macroBank"]>} MacroMemory */

// Above this share of macro memory the reserve sentence is worth reading.
export const MEMORY_NEAR_FULL = 0.8;

/**
 * The bank split for the list: slots in use (and the open slot, empty or not,
 * so the one being edited is always on screen), then the empty slots behind
 * their fold. A search shows every slot it finds, empty ones included.
 * @template {BankSlot} T @param {readonly T[]} bank @param {{query?: string, current?: string | null}} [options]
 * @returns {{shown: {slot: T, index: number}[], folded: {slot: T, index: number}[], firstFree: T | undefined}}
 */
export function macroBankList(bank, {query = "", current = null} = {}) {
    const searching = Boolean(String(query).trim());
    /** @type {{slot: T, index: number}[]} */
    const shown = [];
    /** @type {{slot: T, index: number}[]} */
    const folded = [];
    bank.forEach((slot, index) => {
        if (!macroMatches(slot, query)) return;
        // A slot with a name is in use, as the count says, even with no steps.
        const used = !slot.empty || Boolean(slot.name);
        (used || searching || slot.keycode === current ? shown : folded).push({slot, index});
    });
    const firstFree = bank.find(slot => slot.empty && !slot.name && slot.available !== false);
    return {shown, folded, firstFree};
}

/** How many slots are in use: holding steps or a name. @param {readonly BankSlot[]} bank */
export const macrosInUse = bank => bank.filter(slot => !slot.empty || Boolean(slot.name)).length;

/**
 * Macro memory in one line ("408 of 34,903 bytes"), and Ark's reserve sentence
 * only when it matters: a slot has no room left, or use passes 80 %.
 * @param {MacroMemory | null | undefined} memory
 */
export function macroMemoryLine(memory) {
    if (!memory) return null;
    const format = (/** @type {number} */ value) => value.toLocaleString("en-US");
    const share = memory.capacity ? memory.stored / memory.capacity : 0;
    const closed = memory.slots - memory.available;
    const near = closed > 0 || share > MEMORY_NEAR_FULL;
    const note = near ? `Every empty slot keeps room for ${memory.reserveTaps} key taps${closed
        ? `, so ${closed} slot${closed === 1 ? " is" : "s are"} unavailable until a macro is shortened or cleared` : ""}. A key tap takes 3 bytes; text takes its UTF-8 bytes.` : "";
    return {text: `${format(memory.stored)} of ${format(memory.capacity)} bytes`, share: Math.min(1, share), level: closed ? "over" : near ? "near" : "", note};
}

/**
 * What stops a stored macro playing, in words, or "" when nothing does. A
 * macro whose text needs Unicode entry the computer settings do not give is
 * fixed in Settings → Your computer; the bank tile keeps its name and says why.
 * @param {Pick<import("../../contracts/panel.js").MacroSlot, "playable" | "playbackError" | "needsUnicodeSetup"> | null | undefined} slot
 */
export function macroProblem(slot) {
    if (!slot || slot.playable !== false && !slot.needsUnicodeSetup) return "";
    return slot.playbackError || (slot.needsUnicodeSetup ? "Its text needs Unicode entry, which Settings → Your computer does not set up." : "It cannot play with the current settings.");
}

const MODIFIER = /^KC_(LCTL|LSFT|LALT|LGUI|RCTL|RSFT|RALT|RGUI|LEFT_CTRL|LEFT_SHIFT|LEFT_ALT|LEFT_GUI|RIGHT_CTRL|RIGHT_SHIFT|RIGHT_ALT|RIGHT_GUI|LCMD|RCMD|LWIN|RWIN|LOPT|ROPT)$/;

/**
 * Whether a macro is one shortcut: a single chord of modifiers and one other
 * key. A custom key sends that too, held while the key is held. Returns the
 * chord's keys, or null.
 * @param {readonly import("./types.js").MacroStep[]} steps @param {Readonly<Record<string, string>>} [aliases]
 */
export function singleShortcut(steps, aliases = {}) {
    if (steps.length !== 1) return null;
    const [step] = steps;
    if (step.kind !== "tap" || step.keys.length < 2) return null;
    const plain = step.keys.filter(key => !MODIFIER.test(aliases[key] || key));
    return plain.length === 1 ? [...step.keys] : null;
}
