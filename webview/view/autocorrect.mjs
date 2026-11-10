// @ts-check
// What the Text replacement screen draws of the list core publishes
// (`model.autocorrect`): which entries a search shows, in what order, and
// which of their inputs it found, how a replacement is named, which entry is
// open, and the list's size in words. The list's rules are core's; nothing here judges an
// entry. The code keeps the keyboard's names for the two parts of an entry:
// a replacement is a `correction` and an input a `typo` (GLOSSARY.md).

/**
 * @typedef {import("../../contracts/panel.js").AutocorrectEntry} Entry
 * @typedef {import("../../contracts/panel.js").AutocorrectView} View
 * @typedef {import("../../contracts/edits.js").AutocorrectReplacement} Replacement
 * @typedef {readonly {name?: string, defaultName?: string, empty?: boolean, keycode?: string}[] | null | undefined} Macros the model's macro slots, in slot order
 * @typedef {{entry: Entry, found: string[]}} Row an entry and the inputs of it the search found, by their stored letters
 */

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

// The entries a search shows, as a dictionary lists words. A search matches a
// replacement's text or its macro's name, or one of its inputs, whatever its
// case; `found` names the inputs it matched in an entry whose replacement it
// did not, which the screen marks.
/** @param {View | null | undefined} view @param {{query?: string, macros?: Macros}} [options] @returns {Row[]} */
export function autocorrectRows(view, {query = "", macros} = {}) {
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
    return rows.sort((a, b) => collator.compare(name(a.entry), name(b.entry)) || (a.entry.id < b.entry.id ? -1 : 1));
}

// The entry the editor shows: the one picked, while the list still has it,
// else the first of the rows shown, as every bank opens on its first item.
/** @param {View | null | undefined} view @param {readonly Row[]} rows @param {string | null} picked */
export const openEntry = (view, rows, picked) => (view?.entries || []).find((entry) => entry.id === picked) || rows[0]?.entry || null;

// Whether text replacement is switched off in the profile: its switch is a
// Host setting (core/model/settings-editor.js), published with the others.
/** @param {{configDefaults?: readonly {id: string, fields: readonly {macro: string, enabled?: boolean}[]}[]} | null | undefined} model */
export const switchedOff = (model) => (model?.configDefaults || []).some((section) => section.id === "autocorrect" && section.fields.some((field) => field.macro === "autocorrect" && field.enabled === false));

/** @param {number} count */
const n = (count) => count.toLocaleString("en-US");
/** @param {number} count @param {string} one @param {string} many */
const counted = (count, one, many) => `${n(count)} ${count === 1 ? one : many}`;

// The list's size in words: "3 replacements · 7 inputs".
/** @param {View["usage"]} usage */
export const countWords = (usage) => `${counted(usage.corrections, "replacement", "replacements")} · ${counted(usage.typos, "input", "inputs")}`;

// What the list uses of the count the keyboard caps first, as a bank says how
// many of its slots are used: "7 of 1,024 inputs". A replacement always has
// an input, so its own ceiling is never the one met.
/** @param {View["usage"]} usage */
export const usageWords = (usage) => `${n(usage.typos)} of ${n(usage.maxTypos)} inputs`;

// The list's bytes of the memory it has, as Macro memory says its own.
/** @param {View["usage"]} usage */
export const bytesWords = (usage) => `${n(usage.bytes)} / ${n(usage.capacity)} bytes`;

// A replacement's text against the bytes one may hold, as a name's counter
// says where a name stands (view/names.mjs).
const encoder = new TextEncoder();
/** @param {string} text @param {number} max */
export function textCount(text, max) {
    const used = encoder.encode(text.trim()).length;
    return {used, max, over: used > max, label: `${n(used)} / ${n(max)} bytes`};
}

// How full the list's memory is, as its one meter shows it: the largest
// share any of its ceilings is used to.
/** @param {View["usage"]} usage */
export const usageShare = (usage) => Math.min(100, 100 * Math.max(usage.typos / usage.maxTypos, usage.textBytes / usage.maxTextBytes, usage.bytes / usage.capacity));

// What is typed into the field that adds inputs, as the inputs it holds: split
// at spaces and commas.
/** @param {string} text @returns {string[]} */
export const inputTokens = (text) => String(text ?? "").split(/[\s,]+/).filter(Boolean);

// The entry the list already has for a replacement being made: the same text
// exactly, or the same macro. The screen offers to open it instead.
/** @param {View | null | undefined} view @param {{kind: "text" | "macro", text: string, macro: number | null}} adding */
export const joinedEntry = (view, adding) => (view?.entries || []).find((entry) => adding.kind === "macro"
    ? adding.macro !== null && entry.macro === adding.macro : entry.macro === undefined && entry.correction === adding.text.trim()) || null;

// The replacement a new one names so far, or null while it names none.
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
    /** @param {{inputs: string[]}[]} groups */
    const inputs = (groups) => groups.reduce((total, group) => total + group.inputs.length, 0);
    /** @type {ReturnType<typeof importLines>} */
    const lines = [];
    if (outcome.removed) lines.push({kind: "removed", text: `${counted(outcome.removed, "replacement", "replacements")} in your list now ${outcome.removed === 1 ? "is" : "are"} removed.`});
    if (outcome.newReplacements.length) lines.push({kind: "new", text: `${counted(outcome.newReplacements.length, "new replacement", "new replacements")}, with ${counted(inputs(outcome.newReplacements), "input", "inputs")}.`,
        names: outcome.newReplacements.map((entry) => entry.label)});
    if (outcome.addedInputs.length) lines.push({kind: "added", text: `${counted(inputs(outcome.addedInputs), "more input", "more inputs")} for ${counted(outcome.addedInputs.length, "replacement", "replacements")} you already have.`,
        names: outcome.addedInputs.map((entry) => `${entry.inputs.join(" ")} → ${entry.label}`)});
    if (outcome.duplicates) lines.push({kind: "duplicates", text: `${n(outcome.duplicates)} ${outcome.duplicates === 1 ? "is" : "are"} already in the list, and skipped.`});
    if (outcome.unfit) lines.push({kind: "unfit", text: `${n(outcome.unfit)} ${outcome.unfit === 1 ? "does" : "do"} not fit: the keyboard holds ${n(holds.maxTypos)} inputs.`});
    if (outcome.refused.length) lines.push({kind: "refused", text: `${counted(outcome.refused.length, "line is", "lines are")} refused:`,
        names: outcome.refused.map((row) => `${row.line === null ? "" : `${row.line}: `}${row.text} — ${row.reason}`)});
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
    return last.macro === undefined ? `“${last.typo}” was replaced with “${last.correction}”.` : `“${last.typo}” plays macro “${macroLabel(macros, last.macro)}”.`;
}
