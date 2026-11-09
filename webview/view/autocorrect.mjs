// @ts-check
// What the Autocorrect screen draws of the list core publishes
// (`model.autocorrect`): which entries a search shows and in what order,
// which of them a typo found, and a typo as its chip reads. The list's rules
// are core's; nothing here judges an entry.

import {vocabulary, word} from "./vocabulary.mjs";

/**
 * @typedef {import("../../contracts/panel.js").AutocorrectEntry} Entry
 * @typedef {import("../../contracts/panel.js").AutocorrectView} View
 * @typedef {{entry: Entry, found: string[]}} Row an entry and the typos of it the search found
 */

// The orders the list can be shown in: by correction, as a dictionary lists
// words, or the corrections with the most typos first.
export const AUTOCORRECT_SORTS = /** @type {const} */ (["correction", "typos"]);
/** @typedef {typeof AUTOCORRECT_SORTS[number]} Sort */
// The match a typo has when none is chosen: the whole word. The stored number
// (core/schema/autocorrect-domain-v1.js AUTOCORRECT_MATCH), pinned by
// tests/view/enum-drift.test.mjs.
export const WHOLE_WORD = 0;

const collator = new Intl.Collator("en", {sensitivity: "base"});

// The entries a search shows, in the chosen order. A search matches a
// correction or a typo, whatever its case; `found` names the typos it
// matched in an entry whose correction it did not, which the screen opens.
/** @param {View | null | undefined} view @param {{query?: string, sort?: Sort}} [options] @returns {Row[]} */
export function autocorrectRows(view, {query = "", sort = "correction"} = {}) {
    const needle = query.trim().toLowerCase();
    /** @type {Row[]} */
    const rows = [];
    for (const entry of view?.entries || []) {
        if (!needle || entry.correction.toLowerCase().includes(needle)) rows.push({entry, found: []});
        else {
            const found = entry.typos.filter((typo) => typo.typo.includes(needle)).map((typo) => typo.typo);
            if (found.length) rows.push({entry, found});
        }
    }
    return rows.sort((a, b) => (sort === "typos" ? b.entry.typos.length - a.entry.typos.length : 0) || collator.compare(a.entry.correction, b.entry.correction)
        || (a.entry.correction < b.entry.correction ? -1 : 1));
}

// Where a typo matches, in the vocabulary's words; nothing for the whole
// word, which a chip leaves unsaid.
/** @param {import("./vocabulary.mjs").VocabularyModel | null | undefined} model @param {number} match */
export const matchWords = (model, match) => match === WHOLE_WORD ? "" : word(vocabulary(model).autocorrectMatches, match).toLowerCase();

// The list's size in words: "3 corrections · 7 typos".
/** @param {View["usage"]} usage */
export const countWords = (usage) => `${usage.corrections.toLocaleString("en-US")} correction${usage.corrections === 1 ? "" : "s"} · ${usage.typos.toLocaleString("en-US")} typo${usage.typos === 1 ? "" : "s"}`;

// How full the list is, as its meter shows it: the largest share any of its
// ceilings is used to.
/** @param {View["usage"]} usage */
export const usageShare = (usage) => Math.min(100, 100 * Math.max(usage.corrections / usage.maxCorrections, usage.typos / usage.maxTypos, usage.textBytes / usage.maxTextBytes, usage.bytes / usage.capacity));

// The largest list file read, and what a larger one is told: core's own
// (IMPORT_MAX_BYTES and IMPORT_TOO_LARGE in core/model/autocorrect-import.js).
export const LIST_FILE_MAX_BYTES = 262144;
export const LIST_FILE_TOO_LARGE = "This file is too large for an autocorrect list.";
// The formats a list is saved in, by the extension core names each with.
export const LIST_FILE_FORMATS = /** @type {const} */ (["txt", "csv", "json"]);

/** @param {number} count @param {string} one @param {string} many */
const counted = (count, one, many) => `${count.toLocaleString("en-US")} ${count === 1 ? one : many}`;

// What importing a file one way would do, as the lines its preview shows:
// each a sentence, with the names it is about where it has some.
/** @param {import("../../contracts/messages.js").AutocorrectImportOutcome} outcome @param {{maxTypos: number, maxCorrections: number}} holds @returns {{kind: "new" | "added" | "duplicates" | "refused" | "unfit" | "removed" | "nothing", text: string, names?: string[]}[]} */
export function importLines(outcome, holds) {
    /** @param {{typos: string[]}[]} groups */
    const typos = (groups) => groups.reduce((total, group) => total + group.typos.length, 0);
    /** @type {ReturnType<typeof importLines>} */
    const lines = [];
    if (outcome.removed) lines.push({kind: "removed", text: `${counted(outcome.removed, "entry", "entries")} in your list now ${outcome.removed === 1 ? "is" : "are"} removed.`});
    if (outcome.newCorrections.length) lines.push({kind: "new", text: `${counted(outcome.newCorrections.length, "new correction", "new corrections")}, with ${counted(typos(outcome.newCorrections), "typo", "typos")}.`,
        names: outcome.newCorrections.map((entry) => entry.correction)});
    if (outcome.addedTypos.length) lines.push({kind: "added", text: `${counted(typos(outcome.addedTypos), "typo", "typos")} added to ${counted(outcome.addedTypos.length, "correction", "corrections")} you already have.`,
        names: outcome.addedTypos.map((entry) => `${entry.correction} ← ${entry.typos.join(" ")}`)});
    if (outcome.duplicates) lines.push({kind: "duplicates", text: `${counted(outcome.duplicates, "typo is", "typos are")} already in the list, and skipped.`});
    if (outcome.unfit) lines.push({kind: "unfit", text: `${counted(outcome.unfit, "typo does", "typos do")} not fit: the keyboard holds ${holds.maxCorrections.toLocaleString("en-US")} corrections and ${holds.maxTypos.toLocaleString("en-US")} typos.`});
    if (outcome.refused.length) lines.push({kind: "refused", text: `${counted(outcome.refused.length, "line is", "lines are")} refused:`,
        names: outcome.refused.map((row) => `${row.line === null ? "" : `${row.line}: `}${row.text} — ${row.reason}`)});
    if (!outcome.newCorrections.length && !outcome.addedTypos.length && !outcome.removed) lines.unshift({kind: "nothing", text: "Nothing in it would change your list."});
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
/** @param {{fired: readonly {correction: string, typo: string}[], undone: boolean}} tried */
export function triedWords(tried) {
    if (tried.undone) return "Backspace put the word back as you typed it. Ending it again leaves it alone.";
    const last = tried.fired.at(-1);
    return last ? `“${last.typo}” was corrected to “${last.correction}”.` : "";
}
