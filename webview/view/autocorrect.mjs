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
