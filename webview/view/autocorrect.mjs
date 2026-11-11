// @ts-check
// What the Text replacement screen draws of the list core publishes
// (`model.autocorrect`): which entries a search shows, in what order, and
// which of their inputs it found, which entry is open, and the list's size in
// words. The list's rules are core's, and so is what a replacement is called
// (each entry's `label`): nothing here judges an entry, names one, or reads
// what is typed into inputs. The code keeps the keyboard's names for the two
// parts of an entry: a replacement is a `correction` and an input a `typo`
// (GLOSSARY.md).

import {nameCount} from "./names.mjs";
import {macroNamed} from "./vocabulary.mjs";

/**
 * @typedef {import("../../contracts/panel.js").AutocorrectEntry} Entry
 * @typedef {import("../../contracts/panel.js").AutocorrectView} View
 * @typedef {import("../../contracts/edits.js").AutocorrectReplacement} Replacement
 * @typedef {readonly {name?: string, defaultName?: string, empty?: boolean, keycode?: string}[] | null | undefined} Macros the model's macro slots, in slot order
 * @typedef {{entry: Entry, found: string[]}} Row an entry and the inputs of it the search found, by their stored letters
 */

const collator = new Intl.Collator("en", {sensitivity: "base"});

// What an edit names an entry by: its text, or its macro slot.
/** @param {Pick<Entry, "correction" | "macro">} entry @returns {Replacement} */
export const replacementOf = (entry) => entry.macro === undefined ? {correction: entry.correction} : {macro: entry.macro};

// The entries a search shows, as a dictionary lists words: a text by itself,
// a macro's by the macro's name. A search is a plain one over what core
// publishes, whatever its case: a replacement's label, or an input as it is
// written, with its `*`. `found` names the inputs it matched in an entry
// whose replacement it did not, which the screen marks.
/** @param {View | null | undefined} view @param {{query?: string, macros?: Macros}} [options] @returns {Row[]} */
export function autocorrectRows(view, {query = "", macros} = {}) {
    const needle = query.trim().toLowerCase();
    /** @type {Row[]} */
    const rows = [];
    for (const entry of view?.entries || []) {
        if (!needle || entry.label.toLowerCase().includes(needle)) rows.push({entry, found: []});
        else {
            const found = entry.typos.filter((typo) => typo.input.toLowerCase().includes(needle)).map((typo) => typo.typo);
            if (found.length) rows.push({entry, found});
        }
    }
    /** @param {Entry} entry */
    const name = (entry) => entry.macro === undefined ? entry.correction : macroNamed(macros?.[entry.macro]) || entry.label;
    return rows.sort((a, b) => collator.compare(name(a.entry), name(b.entry)) || (a.entry.id < b.entry.id ? -1 : 1));
}

// The entry the editor shows: the one picked, while the list still has it,
// else the first of the rows shown, as every bank opens on its first item,
// else, when a search shows none, the first of the list: a list that has
// replacements always has one open.
/** @param {View | null | undefined} view @param {readonly Row[]} rows @param {string | null} picked @param {Macros} [macros] */
export const openEntry = (view, rows, picked, macros) => (view?.entries || []).find((entry) => entry.id === picked) || rows[0]?.entry || autocorrectRows(view, {macros})[0]?.entry || null;

/** @param {number} count */
const n = (count) => count.toLocaleString("en-US");
/** @param {number} count @param {string} one @param {string} many */
const counted = (count, one, many) => `${n(count)} ${count === 1 ? one : many}`;

// The list's size in words: "3 replacements · 7 inputs".
/** @param {Pick<View["usage"], "corrections" | "typos">} usage */
export const countWords = (usage) => `${counted(usage.corrections, "replacement", "replacements")} · ${counted(usage.typos, "input", "inputs")}`;

// What the list uses of the count the keyboard caps first, as a bank says how
// many of its slots are used: "7 of 1,024 inputs". A replacement always has
// an input, so its own ceiling is never the one met.
/** @param {View["usage"]} usage */
export const usageWords = (usage) => `${n(usage.typos)} of ${n(usage.maxTypos)} inputs`;

// The list's bytes of the memory it has, and what it can still grow by, as
// Macro memory says its own. How full its meter is drawn is core's too
// (`usage.share`), the same figure the Keyboard screen's Memory panel draws.
/** @param {View["usage"]} usage */
export const bytesWords = (usage) => `${n(usage.bytes)} / ${n(usage.capacity)} bytes`;
/** @param {View["usage"]} usage */
export const freeWords = (usage) => `${n(usage.free)} ${usage.free === 1 ? "byte" : "bytes"} free`;

// A replacement's text against the bytes one may hold, as it is stored,
// without the spaces around it: a name's counter (view/names.mjs).
/** @param {string} text @param {number} max */
export const textCount = (text, max) => nameCount(text.trim(), max);

// The replacement a new one names so far, or null while it names none.
/** @param {{kind: "text" | "macro", text: string, macro: number | null}} adding @returns {Replacement | null} */
export const addedReplacement = (adding) => adding.kind === "macro" ? (adding.macro === null ? null : {macro: adding.macro}) : adding.text.trim() ? {correction: adding.text} : null;

// The largest list file read, and what a larger one is told: core's own
// (IMPORT_MAX_BYTES and IMPORT_TOO_LARGE in core/model/autocorrect-import.js).
export const LIST_FILE_MAX_BYTES = 262144;
export const LIST_FILE_TOO_LARGE = "This file is too large for a text replacement list.";

// What importing a file one way would do, as the lines its preview shows:
// each a sentence, with the names it is about where it has some.
/** @param {import("../../contracts/messages.js").AutocorrectImportOutcome} outcome @returns {{kind: "new" | "added" | "duplicates" | "refused" | "unfit" | "removed" | "nothing", text: string, names?: {text: string, macro?: boolean}[]}[]} */
export function importLines(outcome) {
    /** @param {{inputs: string[]}[]} groups */
    const inputs = (groups) => groups.reduce((total, group) => total + group.inputs.length, 0);
    /** @type {ReturnType<typeof importLines>} */
    const lines = [];
    if (outcome.removed) lines.push({kind: "removed", text: `${counted(outcome.removed, "replacement", "replacements")} in your list now ${outcome.removed === 1 ? "is" : "are"} deleted.`});
    if (outcome.newReplacements.length) lines.push({kind: "new", text: `${counted(outcome.newReplacements.length, "new replacement", "new replacements")}, with ${counted(inputs(outcome.newReplacements), "input", "inputs")}.`,
        names: outcome.newReplacements.map((entry) => ({text: entry.label, ...(entry.macro ? {macro: true} : {})}))});
    if (outcome.addedInputs.length) lines.push({kind: "added", text: `${counted(inputs(outcome.addedInputs), "more input", "more inputs")} for ${counted(outcome.addedInputs.length, "replacement", "replacements")} you already have.`,
        names: outcome.addedInputs.map((entry) => ({text: `${entry.inputs.join(" ")} → ${entry.label}`, ...(entry.macro ? {macro: true} : {})}))});
    if (outcome.duplicates) lines.push({kind: "duplicates", text: `${n(outcome.duplicates)} ${outcome.duplicates === 1 ? "is" : "are"} already in the list, and skipped.`});
    // What stopped the first of them is core's to say (`unfitWhy`).
    if (outcome.unfit) lines.push({kind: "unfit", text: `${n(outcome.unfit)} ${outcome.unfit === 1 ? "does" : "do"} not fit: ${outcome.unfitWhy}.`});
    if (outcome.refused.length) lines.push({kind: "refused", text: `${counted(outcome.refused.length, "line is", "lines are")} refused:`,
        names: outcome.refused.map((row) => ({text: `${row.line === null ? "" : `${row.line}: `}${row.text} — ${row.reason}`}))});
    if (!outcome.newReplacements.length && !outcome.addedInputs.length && !outcome.removed) lines.unshift({kind: "nothing", text: "Nothing in it would change your list."});
    return lines;
}

// ── try it ──────────────────────────────────────────────────────────────

// Backspace in what was typed into the Try it box, as the core reads it.
const BACKSPACE = "\b";

// What the Try it box holds after an edit, as the keyboard would have seen
// it: `before`, text that was there, and `typed`, the keys since. Text added
// at the end was typed; one character gone from the end was a Backspace.
// Anything else (an edit in the middle, a word deleted, a paste over a
// selection) is what a cursor key or a click is to the keyboard: the text
// stands as it is and the next key starts a word afresh.
/** @param {{before: string, typed: string, text: string}} tried what the box held and how it came to @param {string} value what it holds now @returns {{before: string, typed: string}} */
export function triedAfter(tried, value) {
    const {before, typed, text} = tried;
    if (value.startsWith(text)) return {before, typed: typed + value.slice(text.length)};
    if (text.startsWith(value) && [...text.slice(value.length)].length === 1) return {before, typed: typed + BACKSPACE};
    return {before: value, typed: ""};
}

// What the line under the Try it box says of the last thing that happened.
/** @param {{fired: readonly {correction: string, typo: string, macro?: number}[], undone: boolean}} tried @param {Macros} [macros] */
export function triedWords(tried, macros) {
    if (tried.undone) return "Backspace put the word back as you typed it. Ending it again leaves it alone.";
    const last = tried.fired.at(-1);
    if (!last) return "";
    return last.macro === undefined ? `“${last.typo}” was replaced with “${last.correction}”.` : `“${last.typo}” plays the macro “${macroNamed(macros?.[last.macro])}”.`;
}
