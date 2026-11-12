// @ts-check
"use strict";

// The text replacement list as a person edits it: entries, each one
// replacement with the inputs that produce it (firmware
// autocorrect-domain.md, where a replacement is a correction and an input
// a typo; the code here keeps those names). Every function works on the
// domain's own model, the list the codec decodes and encodes, so an edit
// changes it in place and the codec writes the canonical order.
//
// An input is written as a person types it: a whole word, or with `*`
// where other letters may go (`recieve*` the start of a word, `*mnet` the
// end, `*tihng*` anywhere). The `*` is notation: the list stores the letters
// and where they match (D-L84). How a replacement fires is its own: as you
// type, after the Leader key, or both (firmware D-F71, D-L91); its inputs are
// one list whichever, and after the Leader key an input is its whole text.
//
// An edit that would make a list the keyboard refuses, or an entry the chosen
// host layout cannot type, is refused here in plain words. What only
// misbehaves (an entry a layout change left untypable, a replacement another
// entry changes again, a short input with `*`, a macro that is empty) is
// a warning: found on the list, never a refusal.

const {AUTOCORRECT_DOMAIN_V1, AUTOCORRECT_MATCH, AUTOCORRECT_TRIGGER, firesAsTyped, matchesPart, triggerOf, autocorrectCounts, sizeOfCounts, correctionProblem, entryKey, entryOfKey, foldTypo, isMacroSlot, playsMacro, typoProblem} = require("../schema/autocorrect-domain-v1");
const {AUTOCORRECT_APOSTROPHE, foldWordCharacter} = require("../data/autocorrect-words");
const {typoFinder, wordsOf} = require("./autocorrect-matcher");
const {layoutTypes} = require("../data/host-layouts");
const {macroDefaultName, settingsPath} = require("./vocabulary");

/**
 * @typedef {import("../schema/autocorrect-domain-v1.js").AutocorrectList} AutocorrectList
 * @typedef {import("../schema/autocorrect-domain-v1.js").Entry} Entry
 * @typedef {Entry["typos"][number]} Typo
 * @typedef {{correction: string, macro?: undefined} | {macro: number, correction?: undefined}} Target what names an entry: its text, or the macro slot it plays
 * @typedef {readonly (string | undefined)[]} MacroNames the macros' names, by slot
 * @typedef {{layout: number, layoutName?: string, macroNames?: MacroNames, emptyMacros?: ReadonlySet<number>}} Host the host layout the keyboard types through and its name; the macros' names, and the slots that hold none
 * @typedef {{kind: typeof WARNING[keyof typeof WARNING], entry: string, typo?: string, text: string}} Warning what misbehaves, on the entry of that key and, when it is one input's, that typo
 */

/** @param {string} message */
const refuse = message => Object.assign(new Error(message), {code: "AUTOCORRECT_EDIT_REFUSED"});
/** @param {string} text */
const quoted = text => `“${text}”`;
const BYTES = "accented letters take two or more each";
// An input with `*` and fewer letters than this is warned about.
const SHORT_INPUT_LETTERS = 4;
// Where other letters may go, in an input as it is written.
const STAR = "*";
const STAR_HINT = `Put ${STAR} only at the start or the end, where other letters may go.`;

const WARNING = Object.freeze({UNTYPABLE: "untypable", CHAIN: "chain", LOOP: "loop", SHORT_PART: "shortPart", INSIDE_CORRECTION: "insideCorrection", EMPTY_MACRO: "emptyMacro"});

// The characters of `text` the layout cannot type, each once.
/** @param {string} text @param {Host} host */
const untypable = (text, host) => [...new Set(text)].filter(character => !layoutTypes(host.layout, character));
/** @param {string} text @param {Host} host @param {string} what */
function requireTypable(text, host, what) {
    const missing = untypable(text, host);
    if (missing.length) throw refuse(`${host.layoutName || "The chosen host layout"} cannot type ${missing.map(quoted).join(", ")}, so the keyboard could not ${what}.`);
}

// A macro as the screens call it: its name, or "Macro 5".
/** @param {number} slot @param {MacroNames} [macroNames] */
const macroCalled = (slot, macroNames) => macroNames?.[slot] || macroDefaultName(slot);
// A replacement as it is named wherever one is listed, the one way to name
// it: its text, or the macro it plays by that macro's name ("Sign-off"). The
// bank, the editor's title, Review and an import's summary all read this; the
// panel publishes it as each entry's `label`. A macro's is told apart by the
// macros' mark, which the interface draws before it wherever it lists one
// (Review's `mark`, an entry's `macro`), never by a character in the name.
/** @param {{correction?: string, macro?: number}} target @param {MacroNames} [macroNames] */
const replacementCalled = (target, macroNames) => target.macro === undefined ? String(target.correction) : macroCalled(target.macro, macroNames);
// The same inside a sentence: its text in quotes, or "the macro “Sign-off”".
/** @param {{correction?: string, macro?: number}} target @param {MacroNames} [macroNames] */
const replacementSaid = (target, macroNames) => target.macro === undefined ? quoted(String(target.correction)) : `the macro ${quoted(macroCalled(target.macro, macroNames))}`;
/** @param {Target} target @param {Host} [host] */
const called = (target, host) => replacementSaid(target, host?.macroNames);

// A replacement's text as it is stored: what was typed, without the spaces
// around it.
/** @param {unknown} text */
function correctionOf(text) {
    const correction = typeof text === "string" ? text.trim() : "";
    if (!correction) throw refuse("Type the replacement.");
    const problem = correctionProblem(correction);
    if (problem?.code === "INVALID_TEXT_LENGTH") throw refuse(`A replacement is at most ${AUTOCORRECT_DOMAIN_V1.CORRECTION_MAX} bytes of text; ${BYTES}. Use a macro for something longer.`);
    if (problem) throw refuse("A replacement is one line of text: it cannot hold a tab, a line break or another control character. Use a macro for more than one line.");
    return correction;
}

// What an edit names as its replacement: `macro`, a slot, or `correction`,
// text. One of them.
/** @param {{correction?: unknown, macro?: unknown} | null | undefined} named @returns {Target} */
function targetOf(named) {
    if (named?.macro !== undefined) {
        if (!isMacroSlot(named.macro)) throw refuse("Choose one of the keyboard's macros.");
        if (named.correction !== undefined && named.correction !== "") throw refuse("A replacement is text or a macro, not both.");
        return {macro: named.macro};
    }
    return {correction: correctionOf(named?.correction)};
}

// An input as it is written, read: its letters as they are stored,
// trimmed and folded with the firmware's table, and where it matches, from
// the `*` at its start, its end or both.
/** @param {unknown} text @returns {Typo} */
function inputOf(text) {
    const written = typeof text === "string" ? text.trim() : "";
    if (!written) throw refuse("Type an input.");
    const start = written.endsWith(STAR), end = written.startsWith(STAR);
    const letters = written.slice(end ? 1 : 0, start && written.length > 1 ? -1 : undefined);
    if (!letters) throw refuse(`${quoted(written)} has no letters. ${STAR_HINT}`);
    if (letters.includes(STAR)) throw refuse(`${quoted(written)} has ${STAR} where it cannot go. ${STAR_HINT}`);
    const other = [...letters].find(character => character !== AUTOCORRECT_APOSTROPHE && foldWordCharacter(character) === undefined);
    if (other !== undefined) throw refuse(`An input is one word: letters and digits, with an apostrophe only between them; ${other === " " ? "a space" : quoted(other)} is neither.`);
    const typo = /** @type {string} */ (foldTypo(letters));
    const problem = typoProblem(typo);
    if (problem?.code === "INVALID_TEXT_LENGTH") throw refuse(`An input is at most ${AUTOCORRECT_DOMAIN_V1.TEXT_MAX} bytes; ${BYTES}.`);
    if (problem) throw refuse("An input may hold an apostrophe only between two letters or digits.");
    return {typo, match: start && end ? AUTOCORRECT_MATCH.ANYWHERE : start ? AUTOCORRECT_MATCH.START : end ? AUTOCORRECT_MATCH.END : AUTOCORRECT_MATCH.WHOLE_WORD};
}
// A trigger's name, as an edit and the screen give it (the vocabulary's
// inputModes keys), by its number.
const TRIGGER_NAMES = /** @type {const} */ (["word", "leader", "both"]);
// How a replacement fires, as an edit or a file gives it, by name or number:
// the trigger's number, as a word ends when it gives none.
/** @param {unknown} trigger @returns {number} */
function triggerFrom(trigger) {
    if (trigger === undefined || trigger === null) return AUTOCORRECT_TRIGGER.AS_TYPED;
    const number = typeof trigger === "string" ? TRIGGER_NAMES.indexOf(/** @type {typeof TRIGGER_NAMES[number]} */ (trigger)) : trigger;
    if (!(/** @type {readonly number[]} */ (Object.values(AUTOCORRECT_TRIGGER))).includes(/** @type {number} */ (number))) throw refuse("A replacement fires as you type, after the Leader key, or both.");
    return /** @type {number} */ (number);
}
// A field's text as the inputs it holds: split at spaces, since an input
// never holds one. The field that adds inputs and a spreadsheet's inputs
// cell are both read by it.
/** @param {unknown} text @returns {string[]} */
const splitInputs = text => String(text ?? "").split(/\s+/).filter(Boolean);
// A stored input as it is written, with its `*`.
/** @param {{typo: string, match: number}} typo */
const inputForm = typo => `${typo.match === AUTOCORRECT_MATCH.END || typo.match === AUTOCORRECT_MATCH.ANYWHERE ? STAR : ""}${typo.typo}${typo.match === AUTOCORRECT_MATCH.START || typo.match === AUTOCORRECT_MATCH.ANYWHERE ? STAR : ""}`;

// An input an edit or a file gives: written with its `*`, or its letters
// with the match a file's older form stored beside them.
/** @param {{typo?: unknown, match?: unknown} | null | undefined} row @returns {Typo} */
function typoOf(row) {
    const typed = inputOf(row?.typo);
    if (row?.match === undefined || typed.match !== AUTOCORRECT_MATCH.WHOLE_WORD) return typed;
    if (!Number.isInteger(row.match) || /** @type {number} */ (row.match) < AUTOCORRECT_MATCH.WHOLE_WORD || /** @type {number} */ (row.match) > AUTOCORRECT_MATCH.ANYWHERE) throw refuse(`Ark cannot tell where ${quoted(typed.typo)} goes in a word. Write it with ${STAR} where other letters may go.`);
    return {typo: typed.typo, match: /** @type {number} */ (row.match)};
}

// The entry and typo stored as exactly this text, whatever its match: one
// text is one input.
/** @param {AutocorrectList} list @param {string} text @returns {{entry: Entry, typo: Typo} | undefined} */
function heldTypo(list, text) {
    for (const entry of list.entries) {
        const found = entry.typos.find(row => row.typo === text);
        if (found) return {entry, typo: found};
    }
    return undefined;
}
// The entry and typo an edit names: by its stored text, else as it may be
// written, whatever its case and `*`; undefined when the list does not hold it.
/** @param {AutocorrectList} list @param {string} typo @returns {{entry: Entry, typo: Typo} | undefined} */
function findTypo(list, typo) {
    const text = String(typo).trim();
    for (const wanted of [String(typo), foldTypo(text.replace(/^\*|\*$/g, ""))]) {
        const found = wanted === undefined ? undefined : heldTypo(list, wanted);
        if (found) return found;
    }
    return undefined;
}
// The entry a text, a macro slot or an entry's key names.
/** @param {AutocorrectList} list @param {string | Target} named */
function findEntry(list, named) {
    const key = typeof named === "string" ? named : entryKey(named);
    return list.entries.find(entry => entryKey(entry) === key);
}
/** @param {AutocorrectList} list @param {string} typo */
function storedTypo(list, typo) {
    const found = findTypo(list, typo);
    if (!found) throw refuse(`${quoted(typo)} is no longer in the list.`);
    return found;
}
/** @param {AutocorrectList} list @param {Target} target @param {Host} host */
function storedEntry(list, target, host) {
    const entry = findEntry(list, target);
    if (!entry) throw refuse(`The replacement ${called(target, host)} is no longer in the list.`);
    return entry;
}
// An input may be put under a replacement only when it is not that text,
// no other replacement has it, whatever its match (one text is one input),
// and for a macro it is a whole word.
/** @param {AutocorrectList} list @param {Typo} typo @param {Target} target @param {Host} host @param {Typo} [self] the typo being changed, which may keep its own spelling */
function requireFree(list, typo, target, host, self) {
    if (target.macro !== undefined && matchesPart(typo.match)) throw refuse(`A macro plays for a whole word: take the ${STAR} out of ${quoted(inputForm(typo))}.`);
    if (typo.typo === target.correction) throw refuse(`${quoted(typo.typo)} is the replacement itself.`);
    const held = heldTypo(list, typo.typo);
    if (!held || held.typo === self) return;
    throw refuse(entryKey(held.entry) === entryKey(target) ? `${quoted(typo.typo)} is already an input for ${called(target, host)}.` : `${quoted(typo.typo)} is already an input for ${called(targetOfEntry(held.entry), host)}.`);
}
/** @param {Entry} entry @returns {Target} */
const targetOfEntry = entry => entry.macro === undefined ? {correction: entry.correction} : {macro: entry.macro};
// A new entry for a replacement, firing as given: one that fires as you type
// says nothing of it, as the codec writes it.
/** @param {Target} target @param {number} [trigger] @returns {Entry} */
const newEntry = (target, trigger = AUTOCORRECT_TRIGGER.AS_TYPED) => ({...(target.macro === undefined ? {correction: target.correction} : {correction: "", macro: target.macro}), ...(trigger === AUTOCORRECT_TRIGGER.AS_TYPED ? {} : {trigger}), typos: []});
/** @param {AutocorrectList} list @param {Entry} entry */
function dropIfEmpty(list, entry) {
    if (!entry.typos.length) list.entries.splice(list.entries.indexOf(entry), 1);
}

// Adds inputs to a replacement, making the entry when the list has none
// of that exact text or macro, firing as `trigger` says (as you type when it
// says nothing). All of it is checked before anything changes.
/** @param {AutocorrectList} list @param {{correction?: unknown, macro?: unknown}} named @param {readonly {typo: unknown, match?: unknown}[]} typos @param {Host} host @param {unknown} [trigger] */
function addTypos(list, named, typos, host, trigger) {
    const target = targetOf(named), fires = triggerFrom(trigger);
    if (!Array.isArray(typos) || !typos.length) throw refuse("A replacement needs at least one input.");
    const existing = findEntry(list, target);
    if (!existing && target.macro === undefined) requireTypable(target.correction, host, "type this replacement");
    /** @type {Typo[]} */
    const added = [];
    for (const row of typos) {
        const typo = typoOf(row);
        if (added.some(other => other.typo === typo.typo)) throw refuse(`${quoted(typo.typo)} is there twice.`);
        requireFree(list, typo, target, host);
        requireTypable(typo.typo, host, "see this input");
        added.push(typo);
    }
    if (existing) existing.typos.push(...added);
    else list.entries.push({...newEntry(target, fires), typos: added});
}

// How a replacement fires (D-L91): as you type, after the Leader key, or
// both. Its inputs stay as they are.
/** @param {AutocorrectList} list @param {{correction?: unknown, macro?: unknown}} named @param {unknown} trigger @param {Host} host */
function setTrigger(list, named, trigger, host) {
    const target = named?.macro !== undefined ? targetOf(named) : /** @type {Target} */ ({correction: String(named?.correction ?? "")});
    const entry = storedEntry(list, target, host), fires = triggerFrom(trigger);
    if (fires === AUTOCORRECT_TRIGGER.AS_TYPED) delete entry.trigger; else entry.trigger = fires;
}

// Changes a replacement where it stands: its text respelled, text made a
// macro, or a macro made text. Changing it to a replacement the list already
// has joins the two: its inputs go to that one.
/** @param {AutocorrectList} list @param {{correction?: unknown, macro?: unknown}} from @param {{correction?: unknown, macro?: unknown}} to @param {Host} host */
function changeReplacement(list, from, to, host) {
    const source = from?.macro !== undefined ? targetOf(from) : /** @type {Target} */ ({correction: String(from?.correction ?? "")});
    const entry = storedEntry(list, source, host), next = targetOf(to);
    if (entryKey(next) === entryKey(entry)) return;
    for (const typo of entry.typos) {
        if (next.macro !== undefined && matchesPart(typo.match)) throw refuse(`A macro plays for a whole word: take the ${STAR} out of ${quoted(inputForm(typo))} first.`);
        if (typo.typo === next.correction) throw refuse(`${quoted(typo.typo)} is one of its inputs; an input cannot be its own replacement.`);
    }
    const target = findEntry(list, next);
    if (!target) {
        if (next.macro === undefined) requireTypable(next.correction, host, "type this replacement");
        const made = newEntry(next);
        entry.correction = made.correction;
        if (made.macro === undefined) delete entry.macro; else entry.macro = made.macro;
        return;
    }
    target.typos.push(...entry.typos);
    list.entries.splice(list.entries.indexOf(entry), 1);
}

// Writes one input anew where it is: its letters and its `*`.
/** @param {AutocorrectList} list @param {string} typoText @param {unknown} to @param {Host} host */
function changeTypo(list, typoText, to, host) {
    const {entry, typo} = storedTypo(list, typoText);
    const next = inputOf(to);
    if (next.typo !== typo.typo) requireTypable(next.typo, host, "see this input");
    requireFree(list, next, targetOfEntry(entry), host, typo);
    typo.typo = next.typo;
    typo.match = next.match;
}

/** @param {AutocorrectList} list @param {string} typoText */
function removeTypo(list, typoText) {
    const {entry, typo} = storedTypo(list, typoText);
    entry.typos.splice(entry.typos.indexOf(typo), 1);
    dropIfEmpty(list, entry);
}

/** @param {AutocorrectList} list @param {{correction?: unknown, macro?: unknown}} named @param {Host} host */
function removeEntry(list, named, host) {
    const target = named?.macro !== undefined ? targetOf(named) : /** @type {Target} */ ({correction: String(named?.correction ?? "")});
    list.entries.splice(list.entries.indexOf(storedEntry(list, target, host)), 1);
}

// What the keyboard stores of this list: its counts, the inputs that fire
// after the Leader key among them, its text, and the domain's bytes.
/** @param {AutocorrectList} list */
function listUsage(list) {
    const counts = autocorrectCounts(list);
    return {corrections: counts.corrections, typos: counts.typos, leaders: counts.leaders, textBytes: counts.textBytes, bytes: sizeOfCounts(counts)};
}

// What to do about entries a layout change left untypable, said the same
// wherever it is said: under the screen's notice and in Review's check.
/** @param {string} [where] */
const untypableFix = (where = "") => `Change ${settingsPath("host", "host")} back, or edit the replacements marked${where}.`;

// What will misbehave in this list on this host layout, entry by entry in
// the list's order. None of it stops a save.
/** @param {AutocorrectList} list @param {Host} host @returns {Warning[]} */
function listWarnings(list, host) {
    const layout = host.layoutName || "The chosen host layout";
    // What fires on each text replacement's own words: a replacement that is
    // itself replaced, and the inputs with `*` that match inside one.
    /** @type {Map<Entry, Entry>} */
    const corrected = new Map();
    /** @type {Map<Typo, string>} */
    const inside = new Map();
    // One finder for the whole list: its index is made once, not per word.
    const fires = typoFinder(list);
    for (const entry of list.entries) for (const word of playsMacro(entry) ? [] : wordsOf(entry.correction)) {
        const fired = fires(word);
        if (!fired) continue;
        // An input that is its own replacement in other capitals (iphone
        // for iPhone) leaves the word as it is typed.
        if (fired.end - fired.start === [...word].length) {if (fired.entry !== entry && !corrected.has(entry)) corrected.set(entry, fired.entry);}
        else if (!inside.has(fired.typo)) inside.set(fired.typo, entry.correction);
    }
    /** @param {Entry} entry */
    const named = entry => called(targetOfEntry(entry), host);
    /** @type {Warning[]} */
    const warnings = [];
    for (const entry of list.entries) {
        const key = entryKey(entry);
        const missing = playsMacro(entry) ? [] : untypable(entry.correction, host);
        if (missing.length) warnings.push({kind: WARNING.UNTYPABLE, entry: key, text: `${layout} cannot type ${missing.map(quoted).join(", ")}, so this replacement will not be typed.`});
        if (entry.macro !== undefined && host.emptyMacros?.has(entry.macro)) warnings.push({kind: WARNING.EMPTY_MACRO, entry: key, text: `${quoted(macroCalled(entry.macro, host.macroNames))} has no steps, so this replacement does nothing yet. Add steps in Macros, or choose another replacement.`});
        const next = corrected.get(entry);
        if (next && corrected.get(next) === entry) warnings.push({kind: WARNING.LOOP, entry: key, text: `${named(next)} and ${named(entry)} replace each other.`});
        else if (next) warnings.push({kind: WARNING.CHAIN, entry: key, text: `${named(entry)} is itself an input for ${named(next)}: typing it gives ${named(next)}.`});
        for (const typo of entry.typos) {
            const unseen = missing.length ? [] : untypable(typo.typo, host);
            if (unseen.length) warnings.push({kind: WARNING.UNTYPABLE, entry: key, typo: typo.typo, text: `${layout} cannot type ${unseen.map(quoted).join(", ")}, so this input will never be seen.`});
            // A `*` matters only as a word ends.
            if (!matchesPart(typo.match) || !firesAsTyped(triggerOf(entry))) continue;
            if ([...typo.typo].length < SHORT_INPUT_LETTERS) warnings.push({kind: WARNING.SHORT_PART, entry: key, typo: typo.typo, text: `${quoted(inputForm(typo))} is a short input with ${STAR}, so it catches many words.`});
            const within = inside.get(typo);
            if (within !== undefined) warnings.push({kind: WARNING.INSIDE_CORRECTION, entry: key, typo: typo.typo, text: `${quoted(inputForm(typo))} also matches inside the replacement ${quoted(within)}, so typing that changes it.`});
        }
    }
    return warnings;
}

// The entries of two lists side by side, for a review of one against the
// other: an entry with the same replacement in both; an entry only the first
// has beside the one only the second has that took most of its inputs
// (the same entry, with another replacement); then what is left of either
// alone.
/** @param {AutocorrectList} before @param {AutocorrectList} after @returns {{before?: Entry, after?: Entry}[]} */
function pairEntries(before, after) {
    const kept = new Set(before.entries.map(entryKey));
    const fresh = new Set(after.entries.filter(entry => !kept.has(entryKey(entry))));
    return [...before.entries.map(entry => {
        const same = findEntry(after, entryKey(entry));
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
// by its key, and by both keys when one list changed its replacement:
// whichever of them `mine` has goes, and whichever `theirs` has comes back
// with its inputs, each taken from the entry of `mine` that has it now.
/** @param {AutocorrectList} mine @param {AutocorrectList} theirs @param {string} key @param {string} [respelled] */
function restoreEntry(mine, theirs, key, respelled) {
    mine.entries = mine.entries.filter(entry => entryKey(entry) !== key && entryKey(entry) !== respelled);
    for (const named of [key, ...(respelled === undefined ? [] : [respelled])]) {
        const stored = findEntry(theirs, named);
        if (!stored) continue;
        for (const typo of stored.typos) {
            const held = heldTypo(mine, typo.typo);
            if (!held) continue;
            held.entry.typos.splice(held.entry.typos.indexOf(held.typo), 1);
            dropIfEmpty(mine, held.entry);
        }
        mine.entries.push({...newEntry(targetOfEntry(stored), triggerOf(stored)), typos: stored.typos.map(typo => ({...typo}))});
    }
}

module.exports = {SHORT_INPUT_LETTERS, TRIGGER_NAMES, WARNING, addTypos, changeReplacement, changeTypo, correctionOf, entryOfKey, findEntry, findTypo, heldTypo, listUsage, listWarnings, pairEntries, removeEntry, removeTypo, replacementCalled, replacementSaid, restoreEntry, setTrigger, splitInputs, targetOf, triggerFrom, inputForm, inputOf, typoOf, untypableFix};
