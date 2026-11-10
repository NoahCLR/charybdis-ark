// @ts-check
// What the Text replacement screen draws of the list core publishes
// (`model.autocorrect`): which entries a search shows and in what order,
// which of them something typed found, how a replacement is named, and the
// list's size in words. The list's rules are core's; nothing here judges an
// entry. The code keeps the keyboard's names for the two parts of an entry:
// a replacement is a `correction` and a typed form a `typo` (GLOSSARY.md).

/**
 * @typedef {import("../../contracts/panel.js").AutocorrectEntry} Entry
 * @typedef {import("../../contracts/panel.js").AutocorrectView} View
 * @typedef {import("../../contracts/edits.js").AutocorrectReplacement} Replacement
 * @typedef {readonly {name?: string, defaultName?: string, empty?: boolean, keycode?: string}[] | null | undefined} Macros the model's macro slots, in slot order
 * @typedef {{entry: Entry, found: string[]}} Row an entry and the typed forms of it the search found, by their stored letters
 */

// The orders the list can be shown in: by replacement, as a dictionary lists
// words, or the replacements with the most typed for them first.
export const AUTOCORRECT_SORTS = /** @type {const} */ (["replacement", "typed"]);
/** @typedef {typeof AUTOCORRECT_SORTS[number]} Sort */

const collator = new Intl.Collator("en", {sensitivity: "base"});

// A macro as the screens call it: its name, or what it is called without one.
/** @param {Macros} macros @param {number} slot */
export const macroLabel = (macros, slot) => macros?.[slot]?.name || macros?.[slot]?.defaultName || `Macro ${slot}`;

// A replacement as its row shows it: its text, or the macro it plays.
/** @param {Pick<Entry, "correction" | "macro">} entry @param {Macros} macros */
export const replacementLabel = (entry, macros) => entry.macro === undefined ? entry.correction : macroLabel(macros, entry.macro);

// What an edit names an entry by: its text, or its macro slot.
/** @param {Pick<Entry, "correction" | "macro">} entry @returns {Replacement} */
export const replacementOf = (entry) => entry.macro === undefined ? {correction: entry.correction} : {macro: entry.macro};

// The entries a search shows, in the chosen order. A search matches a
// replacement's text or its macro's name, or something typed for it, whatever
// its case; `found` names the typed forms it matched in an entry whose
// replacement it did not, which the screen marks.
/** @param {View | null | undefined} view @param {{query?: string, sort?: Sort, macros?: Macros}} [options] @returns {Row[]} */
export function autocorrectRows(view, {query = "", sort = "replacement", macros} = {}) {
    const needle = query.trim().toLowerCase().replace(/^\*|\*$/g, "");
    /** @type {Row[]} */
    const rows = [];
    for (const entry of view?.entries || []) {
        if (!needle || replacementLabel(entry, macros).toLowerCase().includes(needle)) rows.push({entry, found: []});
        else {
            const found = entry.typos.filter((typo) => typo.typo.includes(needle)).map((typo) => typo.typo);
            if (found.length) rows.push({entry, found});
        }
    }
    /** @param {Entry} entry */
    const name = (entry) => replacementLabel(entry, macros);
    return rows.sort((a, b) => (sort === "typed" ? b.entry.typos.length - a.entry.typos.length : 0) || collator.compare(name(a.entry), name(b.entry))
        || (a.entry.id < b.entry.id ? -1 : 1));
}

// Whether text replacement is switched off in the profile: its switch is a
// Host setting (core/model/settings-editor.js), published with the others.
/** @param {{configDefaults?: readonly {id: string, fields: readonly {macro: string, enabled?: boolean}[]}[]} | null | undefined} model */
export const switchedOff = (model) => (model?.configDefaults || []).some((section) => section.id === "autocorrect" && section.fields.some((field) => field.macro === "autocorrect" && field.enabled === false));

/** @param {number} count */
const n = (count) => count.toLocaleString("en-US");
/** @param {number} count @param {string} one @param {string} many */
const counted = (count, one, many) => `${n(count)} ${count === 1 ? one : many}`;

// The list's size in words: "3 replacements · 7 typed".
/** @param {View["usage"]} usage */
export const countWords = (usage) => `${counted(usage.corrections, "replacement", "replacements")} · ${n(usage.typos)} typed`;

// What the list uses of what the keyboard holds for it: what is typed, the
// count the keyboard caps first, and its bytes. A replacement always has
// something typed for it, so its own ceiling is never the one met.
/** @param {View["usage"]} usage */
export const memoryWords = (usage) => `${n(usage.typos)} of ${n(usage.maxTypos)} typed · ${n(usage.bytes)} of ${n(usage.capacity)} bytes`;

// How full the list's memory is, as its one meter shows it: the largest
// share any of its ceilings is used to.
/** @param {View["usage"]} usage */
export const usageShare = (usage) => Math.min(100, 100 * Math.max(usage.typos / usage.maxTypos, usage.textBytes / usage.maxTextBytes, usage.bytes / usage.capacity));

// What is typed into a field of typed forms, as the forms it holds: split at
// spaces and commas.
/** @param {string} text @returns {string[]} */
export const typedTokens = (text) => String(text ?? "").split(/[\s,]+/).filter(Boolean);

// The entry a replacement being added would join, if the list has it: the
// same text exactly, or the same macro.
/** @param {View | null | undefined} view @param {{kind: "text" | "macro", text: string, macro: number | null}} adding */
export const joinedEntry = (view, adding) => (view?.entries || []).find((entry) => adding.kind === "macro"
    ? adding.macro !== null && entry.macro === adding.macro : entry.macro === undefined && entry.correction === adding.text.trim()) || null;

// The replacement the add row names, or null while it names none.
/** @param {{kind: "text" | "macro", text: string, macro: number | null}} adding @returns {Replacement | null} */
export const addedReplacement = (adding) => adding.kind === "macro" ? (adding.macro === null ? null : {macro: adding.macro}) : adding.text.trim() ? {correction: adding.text} : null;

// The largest list file read, and what a larger one is told: core's own
// (IMPORT_MAX_BYTES and IMPORT_TOO_LARGE in core/model/autocorrect-import.js).
export const LIST_FILE_MAX_BYTES = 262144;
export const LIST_FILE_TOO_LARGE = "This file is too large for a text replacement list.";
// The formats a list is saved in, by the extension core names each with.
export const LIST_FILE_FORMATS = /** @type {const} */ (["txt", "csv", "json"]);

// What importing a file one way would do, as the lines its preview shows:
// each a sentence, with the names it is about where it has some.
/** @param {import("../../contracts/messages.js").AutocorrectImportOutcome} outcome @param {{maxTypos: number}} holds @returns {{kind: "new" | "added" | "duplicates" | "refused" | "unfit" | "removed" | "nothing", text: string, names?: string[]}[]} */
export function importLines(outcome, holds) {
    /** @param {{typed: string[]}[]} groups */
    const typed = (groups) => groups.reduce((total, group) => total + group.typed.length, 0);
    /** @type {ReturnType<typeof importLines>} */
    const lines = [];
    if (outcome.removed) lines.push({kind: "removed", text: `${counted(outcome.removed, "replacement", "replacements")} in your list now ${outcome.removed === 1 ? "is" : "are"} removed.`});
    if (outcome.newReplacements.length) lines.push({kind: "new", text: `${counted(outcome.newReplacements.length, "new replacement", "new replacements")}, with ${n(typed(outcome.newReplacements))} typed for ${outcome.newReplacements.length === 1 ? "it" : "them"}.`,
        names: outcome.newReplacements.map((entry) => entry.label)});
    if (outcome.addedTyped.length) lines.push({kind: "added", text: `${n(typed(outcome.addedTyped))} more typed for ${counted(outcome.addedTyped.length, "replacement", "replacements")} you already have.`,
        names: outcome.addedTyped.map((entry) => `${entry.typed.join(" ")} → ${entry.label}`)});
    if (outcome.duplicates) lines.push({kind: "duplicates", text: `${n(outcome.duplicates)} ${outcome.duplicates === 1 ? "is" : "are"} already in the list, and skipped.`});
    if (outcome.unfit) lines.push({kind: "unfit", text: `${n(outcome.unfit)} ${outcome.unfit === 1 ? "does" : "do"} not fit: the keyboard holds ${n(holds.maxTypos)} typed forms.`});
    if (outcome.refused.length) lines.push({kind: "refused", text: `${counted(outcome.refused.length, "line is", "lines are")} refused:`,
        names: outcome.refused.map((row) => `${row.line === null ? "" : `${row.line}: `}${row.text} — ${row.reason}`)});
    if (!outcome.newReplacements.length && !outcome.addedTyped.length && !outcome.removed) lines.unshift({kind: "nothing", text: "Nothing in it would change your list."});
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
    return last.macro === undefined ? `“${last.typo}” was replaced with “${last.correction}”.` : `“${last.typo}” plays macro “${macroLabel(macros, last.macro)}”.`;
}
