// @ts-check
"use strict";

// The autocorrect list as a person edits it: entries, each one correction
// with the typos that become it (firmware autocorrect-domain.md). Every
// function here works on the domain's own model, the list the codec decodes
// and encodes, so an edit changes it in place and the codec writes the
// canonical order.
//
// An edit that would make a list the keyboard refuses, or an entry the chosen
// host layout cannot type, is refused here in plain words. What only
// misbehaves (an entry a layout change left untypable, a correction another
// entry changes again, a short part-of-word typo) is a warning: found on the
// list, never a refusal.

const {AUTOCORRECT_DOMAIN_V1, AUTOCORRECT_MATCH, autocorrectDomainSize, correctionProblem, foldTypo, typoProblem} = require("../schema/autocorrect-domain-v1");
const {AUTOCORRECT_APOSTROPHE, foldWordCharacter} = require("../data/autocorrect-words");
const {firingTypo, wordsOf} = require("./autocorrect-matcher");
const {layoutTypes} = require("../data/host-layouts");

/**
 * @typedef {import("../schema/autocorrect-domain-v1.js").AutocorrectList} AutocorrectList
 * @typedef {import("../schema/autocorrect-domain-v1.js").Entry} Entry
 * @typedef {Entry["typos"][number]} Typo
 * @typedef {{layout: number, layoutName?: string}} Host the host layout the keyboard types through, and its name
 * @typedef {{kind: typeof WARNING[keyof typeof WARNING], correction: string, typo?: string, text: string}} Warning
 */

/** @param {string} message */
const refuse = message => Object.assign(new Error(message), {code: "AUTOCORRECT_EDIT_REFUSED"});
/** @param {string} text */
const quoted = text => `“${text}”`;
const BYTES = `at most ${AUTOCORRECT_DOMAIN_V1.TEXT_MAX} bytes; accented letters take two or more each`;
// A part-of-word typo with fewer letters than this is warned about.
const SHORT_PART_LETTERS = 4;

const WARNING = Object.freeze({UNTYPABLE: "untypable", CHAIN: "chain", LOOP: "loop", SHORT_PART: "shortPart", INSIDE_CORRECTION: "insideCorrection"});

// The characters of `text` the layout cannot type, each once.
/** @param {string} text @param {Host} host */
const untypable = (text, host) => [...new Set(text)].filter(character => !layoutTypes(host.layout, character));
/** @param {string} text @param {Host} host @param {string} what */
function requireTypable(text, host, what) {
    const missing = untypable(text, host);
    if (missing.length) throw refuse(`${host.layoutName || "The chosen host layout"} cannot type ${missing.map(quoted).join(", ")}, so the keyboard could not ${what}.`);
}

// A correction as it is stored: what was typed, without the spaces around it.
/** @param {unknown} text */
function correctionOf(text) {
    const correction = typeof text === "string" ? text.trim() : "";
    if (!correction) throw refuse("Type the correction.");
    const problem = correctionProblem(correction);
    if (problem?.code === "INVALID_TEXT_LENGTH") throw refuse(`A correction is ${BYTES}.`);
    if (problem) throw refuse("A correction cannot hold a tab, a line break or another control character.");
    return correction;
}

// A typo as it is stored: trimmed and folded with the firmware's table.
/** @param {unknown} text */
function typoOf(text) {
    const typed = typeof text === "string" ? text.trim() : "";
    if (!typed) throw refuse("Type a typo.");
    const other = [...typed].find(character => character !== AUTOCORRECT_APOSTROPHE && foldWordCharacter(character) === undefined);
    if (other !== undefined) throw refuse(`A typo is letters and digits, with an apostrophe only between them; ${quoted(other)} is neither.`);
    const typo = /** @type {string} */ (foldTypo(typed));
    const problem = typoProblem(typo);
    if (problem?.code === "INVALID_TEXT_LENGTH") throw refuse(`A typo is ${BYTES}.`);
    if (problem) throw refuse("A typo may hold an apostrophe only between two letters or digits.");
    return typo;
}

/** @param {unknown} match */
function matchOf(match) {
    if (match === undefined) return AUTOCORRECT_MATCH.WHOLE_WORD;
    if (!Number.isInteger(match) || /** @type {number} */ (match) < AUTOCORRECT_MATCH.WHOLE_WORD || /** @type {number} */ (match) > AUTOCORRECT_MATCH.ANYWHERE) throw refuse("Choose where it matches: the whole word, the start or end of a word, or anywhere in a word.");
    return /** @type {number} */ (match);
}

// The entry and typo a typo is stored under, whatever its case; undefined
// when the list does not hold it.
/** @param {AutocorrectList} list @param {string} typo @returns {{entry: Entry, typo: Typo} | undefined} */
function findTypo(list, typo) {
    const folded = foldTypo(String(typo).trim());
    for (const entry of list.entries) {
        const found = entry.typos.find(row => row.typo === folded);
        if (found) return {entry, typo: found};
    }
    return undefined;
}
/** @param {AutocorrectList} list @param {string} correction */
const findEntry = (list, correction) => list.entries.find(entry => entry.correction === correction);
/** @param {AutocorrectList} list @param {string} typo */
function storedTypo(list, typo) {
    const found = findTypo(list, typo);
    if (!found) throw refuse(`${quoted(typo)} is no longer in the list.`);
    return found;
}
/** @param {AutocorrectList} list @param {string} correction */
function storedEntry(list, correction) {
    const entry = findEntry(list, correction);
    if (!entry) throw refuse(`${quoted(correction)} is no longer in the list.`);
    return entry;
}
// A typo may be put under `correction` only when it is not that word and no
// other correction has it.
/** @param {AutocorrectList} list @param {string} typo @param {string} correction @param {Typo} [self] the typo being changed, which may keep its own spelling */
function requireFree(list, typo, correction, self) {
    if (typo === correction) throw refuse(`${quoted(typo)} is the correction itself.`);
    const held = findTypo(list, typo);
    if (!held || held.typo === self) return;
    throw refuse(held.entry.correction === correction ? `${quoted(typo)} is already a typo of ${quoted(correction)}.` : `${quoted(typo)} already corrects to ${quoted(held.entry.correction)}.`);
}
/** @param {AutocorrectList} list @param {Entry} entry */
function dropIfEmpty(list, entry) {
    if (!entry.typos.length) list.entries.splice(list.entries.indexOf(entry), 1);
}

// Adds typos to a correction, making the entry when the list has none of
// that exact spelling. All of it is checked before anything changes.
/** @param {AutocorrectList} list @param {unknown} correctionText @param {readonly {typo: unknown, match?: unknown}[]} typos @param {Host} host */
function addTypos(list, correctionText, typos, host) {
    const correction = correctionOf(correctionText);
    if (!Array.isArray(typos) || !typos.length) throw refuse("A correction needs at least one typo.");
    const existing = findEntry(list, correction);
    if (!existing) requireTypable(correction, host, "type this correction");
    /** @type {Typo[]} */
    const added = [];
    for (const row of typos) {
        const typo = typoOf(row?.typo), match = matchOf(row?.match);
        if (added.some(other => other.typo === typo)) throw refuse(`${quoted(typo)} is there twice.`);
        requireFree(list, typo, correction);
        requireTypable(typo, host, "see this typo typed");
        added.push({typo, match});
    }
    if (existing) existing.typos.push(...added);
    else list.entries.push({correction, typos: added});
}

// Respells a correction where it stands. Respelling it to a correction the
// list already has joins the two: its typos go to that one.
/** @param {AutocorrectList} list @param {string} from @param {unknown} toText @param {Host} host */
function respellCorrection(list, from, toText, host) {
    const entry = storedEntry(list, from), to = correctionOf(toText);
    if (to === from) return;
    if (entry.typos.some(row => row.typo === to)) throw refuse(`${quoted(to)} is one of its typos; a typo cannot be its own correction.`);
    const target = findEntry(list, to);
    if (!target) {
        requireTypable(to, host, "type this correction");
        entry.correction = to;
        return;
    }
    target.typos.push(...entry.typos);
    list.entries.splice(list.entries.indexOf(entry), 1);
}

// Changes one typo: its spelling, where it matches, or the correction it
// belongs to (made when the list has none of that spelling). A correction
// left with no typo goes.
/** @param {AutocorrectList} list @param {string} typoText @param {{to?: unknown, match?: unknown, correction?: unknown}} change @param {Host} host */
function changeTypo(list, typoText, change, host) {
    const {entry, typo} = storedTypo(list, typoText);
    const correction = change.correction === undefined ? entry.correction : correctionOf(change.correction);
    const to = change.to === undefined ? typo.typo : typoOf(change.to);
    const match = change.match === undefined ? typo.match : matchOf(change.match);
    const target = findEntry(list, correction);
    if (to !== typo.typo) requireTypable(to, host, "see this typo typed");
    if (!target) requireTypable(correction, host, "type this correction");
    requireFree(list, to, correction, typo);
    typo.typo = to;
    typo.match = match;
    if (target === entry) return;
    entry.typos.splice(entry.typos.indexOf(typo), 1);
    if (target) target.typos.push(typo);
    else list.entries.push({correction, typos: [typo]});
    dropIfEmpty(list, entry);
}

/** @param {AutocorrectList} list @param {string} typoText */
function removeTypo(list, typoText) {
    const {entry, typo} = storedTypo(list, typoText);
    entry.typos.splice(entry.typos.indexOf(typo), 1);
    dropIfEmpty(list, entry);
}

/** @param {AutocorrectList} list @param {string} correction */
function removeEntry(list, correction) {
    list.entries.splice(list.entries.indexOf(storedEntry(list, correction)), 1);
}

// What the keyboard stores of this list: its counts, its text, and the
// domain's bytes.
/** @param {AutocorrectList} list */
function listUsage(list) {
    const typos = list.entries.reduce((total, entry) => total + entry.typos.length, 0);
    const textBytes = list.entries.reduce((total, entry) => total + Buffer.byteLength(entry.correction) + entry.typos.reduce((sum, typo) => sum + Buffer.byteLength(typo.typo), 0), 0);
    return {corrections: list.entries.length, typos, textBytes, bytes: autocorrectDomainSize(list)};
}

// What will misbehave in this list on this host layout, entry by entry in
// the list's order. None of it stops a save.
/** @param {AutocorrectList} list @param {Host} host @returns {Warning[]} */
function listWarnings(list, host) {
    const layout = host.layoutName || "The chosen host layout";
    // What fires on each correction's own words: a correction that is itself
    // corrected, and the part-of-word typos that match inside a correction.
    /** @type {Map<Entry, Entry>} */
    const corrected = new Map();
    /** @type {Map<Typo, string>} */
    const inside = new Map();
    for (const entry of list.entries) for (const word of wordsOf(entry.correction)) {
        const fired = firingTypo(list, word);
        if (!fired) continue;
        // A typo that is its own correction in other capitals (iphone for
        // iPhone) leaves the word as it is typed.
        if (fired.end - fired.start === [...word].length) {if (fired.entry !== entry && !corrected.has(entry)) corrected.set(entry, fired.entry);}
        else if (!inside.has(fired.typo)) inside.set(fired.typo, entry.correction);
    }
    /** @type {Warning[]} */
    const warnings = [];
    for (const entry of list.entries) {
        const {correction} = entry;
        const missing = untypable(correction, host);
        if (missing.length) warnings.push({kind: WARNING.UNTYPABLE, correction, text: `${layout} cannot type ${missing.map(quoted).join(", ")}, so this entry will not fire.`});
        const next = corrected.get(entry);
        if (next && corrected.get(next) === entry) warnings.push({kind: WARNING.LOOP, correction, text: `${quoted(next.correction)} and ${quoted(correction)} correct to each other.`});
        else if (next) warnings.push({kind: WARNING.CHAIN, correction, text: `${quoted(correction)} is itself a typo, corrected to ${quoted(next.correction)}: typing it gives ${quoted(next.correction)}.`});
        for (const typo of entry.typos) {
            const unseen = missing.length ? [] : untypable(typo.typo, host);
            if (unseen.length) warnings.push({kind: WARNING.UNTYPABLE, correction, typo: typo.typo, text: `${layout} cannot type ${unseen.map(quoted).join(", ")}, so this typo will not fire.`});
            if (typo.match === AUTOCORRECT_MATCH.WHOLE_WORD) continue;
            if ([...typo.typo].length < SHORT_PART_LETTERS) warnings.push({kind: WARNING.SHORT_PART, correction, typo: typo.typo, text: `${quoted(typo.typo)} matches part of a word and is shorter than four letters, so it can fire inside words you meant.`});
            const within = inside.get(typo);
            if (within !== undefined) warnings.push({kind: WARNING.INSIDE_CORRECTION, correction, typo: typo.typo, text: `${quoted(typo.typo)} also matches inside the correction ${quoted(within)}, so typing that word changes it.`});
        }
    }
    return warnings;
}

// The entries of two lists side by side, for a review of one against the
// other: an entry with the same correction in both; an entry only the first
// has beside the one only the second has that took most of its typos (the
// same entry, respelled); then what is left of either alone.
/** @param {AutocorrectList} before @param {AutocorrectList} after @returns {{before?: Entry, after?: Entry}[]} */
function pairEntries(before, after) {
    const kept = new Set(before.entries.map(entry => entry.correction));
    const fresh = new Set(after.entries.filter(entry => !kept.has(entry.correction)));
    return [...before.entries.map(entry => {
        const same = findEntry(after, entry.correction);
        if (same) return {before: entry, after: same};
        const typos = new Set(entry.typos.map(typo => typo.typo));
        /** @type {Entry | undefined} */
        let respelled, shared = 0;
        for (const candidate of fresh) {
            const count = candidate.typos.filter(typo => typos.has(typo.typo)).length;
            if (count > shared) {respelled = candidate; shared = count;}
        }
        if (respelled) fresh.delete(respelled);
        return respelled ? {before: entry, after: respelled} : {before: entry};
    }), ...[...fresh].map(entry => ({after: entry}))];
}

// Puts one entry of `mine` back to what `theirs` holds. The entry is named
// by its correction, and by both spellings when one list respelled it:
// whichever of them `mine` has goes, and whichever `theirs` has comes back
// with its typos, each taken from the entry of `mine` that has it now.
/** @param {AutocorrectList} mine @param {AutocorrectList} theirs @param {string} correction @param {string} [respelled] */
function restoreEntry(mine, theirs, correction, respelled) {
    mine.entries = mine.entries.filter(entry => entry.correction !== correction && entry.correction !== respelled);
    for (const spelling of [correction, ...(respelled === undefined ? [] : [respelled])]) {
        const stored = findEntry(theirs, spelling);
        if (!stored) continue;
        for (const typo of stored.typos) {
            const held = findTypo(mine, typo.typo);
            if (!held) continue;
            held.entry.typos.splice(held.entry.typos.indexOf(held.typo), 1);
            dropIfEmpty(mine, held.entry);
        }
        mine.entries.push({correction: stored.correction, typos: stored.typos.map(typo => ({...typo}))});
    }
}

module.exports = {WARNING, addTypos, changeTypo, correctionOf, findEntry, findTypo, listUsage, listWarnings, pairEntries, removeEntry, removeTypo, respellCorrection, restoreEntry, typoOf};
