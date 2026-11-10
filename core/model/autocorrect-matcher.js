// @ts-check
"use strict";

// What the keyboard does with a list as text is typed, read over the
// characters a computer would show (firmware autocorrect-v1.md): which typo
// fires when a word ends, the case its correction takes, what the host layout
// can type under Caps Lock, and the undo. It is the one matcher: Try it shows
// its result, the list's warnings ask it which typo fires, and the firmware's
// behaviour fixture holds it to the keyboard (tests/model). What needs a key,
// a timing or a setting (shortcuts, held keys, macro keys, the queue) has no
// form in text and is not here. A replacement that plays a macro is: the
// input goes and the macro's text, when it is only text, takes its
// place.

const {AUTOCORRECT_DOMAIN_V1, AUTOCORRECT_MATCH, entryKey, playsMacro} = require("../schema/autocorrect-domain-v1");
const {AUTOCORRECT_APOSTROPHE, capitalOfWordCharacter, foldWordCharacter} = require("../data/autocorrect-words");
const {hostLayout} = require("../data/host-layouts");

/**
 * @typedef {import("../schema/autocorrect-domain-v1.js").AutocorrectList} AutocorrectList
 * @typedef {import("../schema/autocorrect-domain-v1.js").Entry} Entry
 * @typedef {Entry["typos"][number]} Typo
 * @typedef {{layout: number, macos?: boolean}} Host the host layout the keyboard types through; `macos` when the host's system is macOS though the layout is not one of its own
 * @typedef {{entry: Entry, typo: Typo, characters: string[]}} Listed a typo with its entry, and its characters
 * @typedef {{whole: Map<string, Listed>, parts: Listed[]}} Index a list's whole-word typos by their text, and its part-of-word typos in the domain's byte order
 * @typedef {{entry: Entry, typo: Typo, start: number, end: number}} Fired the typo that fires on a word, and the characters of the word it matched
 * @typedef {(slot: number) => {text: string | null} | null} Macros what a macro slot plays: its text when it types only text, `text: null` when it does more, and null for a slot that is empty or cannot play
 * @typedef {Replaced & {start: number, end: number}} Mark where a standing replacement's text is in the text tried, by its offsets
 * @typedef {{entry: string, correction: string, typo: string, macro?: number}} Replaced a replacement that fired: its entry's key, its text ("" for a macro), the input, and the macro slot it played
 */

// The keyboard follows this many characters of a word, and types no
// correction that takes more key strokes than this, erasing included.
const WORD_MAX = 32, STROKES_MAX = 288;
const BACKSPACE = "\b";
// Enter and Tab end a word and print nothing a Backspace could take back.
const ENDS_WITHOUT_UNDO = new Set(["\n", "\t"]);

/** @param {string} character */
const isWordCharacter = character => character === AUTOCORRECT_APOSTROPHE || foldWordCharacter(character) !== undefined;
/** @param {string} character */
const folded = character => foldWordCharacter(character) ?? character;
/** @param {string} character */
const isCapital = character => folded(character) !== character;

/** @param {AutocorrectList} list @returns {Index} */
function indexed(list) {
    /** @type {Index} */
    const index = {whole: new Map(), parts: []};
    for (const entry of list.entries) for (const typo of entry.typos) {
        const listed = {entry, typo, characters: [...typo.typo]};
        if (typo.match === AUTOCORRECT_MATCH.WHOLE_WORD) index.whole.set(typo.typo, listed); else index.parts.push(listed);
    }
    index.parts.sort((a, b) => Buffer.compare(Buffer.from(a.typo.typo), Buffer.from(b.typo.typo)));
    return index;
}

// Where in a folded word a part-of-word typo sits: its start, its end, or
// the first place it is found; -1 when it does not fit.
/** @param {string[]} word @param {Listed} part */
function placeOf(word, part) {
    const {characters} = part, last = word.length - characters.length;
    if (last < 0) return -1;
    const first = part.typo.match === AUTOCORRECT_MATCH.END ? last : 0;
    for (let at = first; at <= (part.typo.match === AUTOCORRECT_MATCH.ANYWHERE ? last : first); at++) {
        if (characters.every((character, offset) => word[at + offset] === character)) return at;
    }
    return -1;
}

// The typo that fires on a finished, folded word: the whole-word typo that
// is the word, else the part-of-word typo with the most characters that fits,
// the first in the domain's order of equal ones. `takes` says whether the
// keyboard can type a candidate's correction there; one it cannot is passed
// over as if it were not listed.
/** @param {Index} index @param {string[]} word @param {(fired: Fired) => boolean} [takes] @returns {Fired | null} */
function choose(index, word, takes = () => true) {
    const text = word.join("");
    const whole = Buffer.byteLength(text) <= AUTOCORRECT_DOMAIN_V1.TEXT_MAX ? index.whole.get(text) : undefined;
    if (whole) {
        const fired = {entry: whole.entry, typo: whole.typo, start: 0, end: word.length};
        if (takes(fired)) return fired;
    }
    /** @type {Fired | null} */
    let best = null;
    for (const part of index.parts) {
        if (best && part.characters.length <= best.end - best.start) continue;
        const start = placeOf(word, part);
        if (start < 0) continue;
        const fired = {entry: part.entry, typo: part.typo, start, end: start + part.characters.length};
        if (takes(fired)) best = fired;
    }
    return best;
}

// The words of a text, folded: letters and digits with apostrophes between
// them. Apostrophes at a word's start or end are not part of it.
/** @param {string} text @returns {string[]} */
function wordsOf(text) {
    /** @type {string[]} */
    const words = [];
    let word = "";
    const end = () => {
        const trimmed = word.replace(/^'+|'+$/g, "");
        if (trimmed) words.push(trimmed);
        word = "";
    };
    for (const character of text) {
        if (isWordCharacter(character)) word += folded(character); else end();
    }
    end();
    return words;
}

// The typo that fires on a folded word on a host that types everything, and
// the characters of the word it matched.
/** @param {AutocorrectList} list @param {string} word @returns {Fired | null} */
function firingTypo(list, word) {
    return choose(indexed(list), [...word]);
}

// How many key strokes show this character on this host under its Caps Lock;
// none when nothing the layout types shows it. Caps Lock changes letters
// only: a letter goes out as the stroke of its other case, except on macOS,
// which shows a capital whatever Shift does and so types no small letter.
/** @param {import("../data/types.js").HostLayout | null} layout @param {boolean} macos @param {boolean} capsLock @param {string} character */
function strokesFor(layout, macos, capsLock, character) {
    let typed = character;
    if (capsLock) {
        const capital = capitalOfWordCharacter(character);
        if (capital !== undefined) {
            if (macos) return 0;
            typed = capital;
        } else if (isCapital(character) && !macos) typed = folded(character);
    }
    return layout?.strokes[typed]?.length ?? 0;
}

// The case a correction takes, judged on the matched part of the word as the
// computer shows it: every letter a capital, the first letter a capital, or
// as the correction is written.
/** @param {string[]} matched @param {string[]} correction @returns {"capitals" | "first" | "written"} */
function formOf(matched, correction) {
    const capitals = matched.filter(isCapital).length;
    const smalls = matched.filter(character => capitalOfWordCharacter(character) !== undefined).length;
    if (capitals >= 2 && !smalls) return "capitals";
    if (capitals !== 1 || !isCapital(matched[0])) return "written";
    // A correction written with capitals keeps exactly those.
    return correction.some(isCapital) ? "written" : "first";
}

// What the keyboard shows for the characters a computer would show with
// autocorrect off, `\b` for Backspace: the text it ends with, the corrections
// that fired and still stand, in order, where what each typed stands in that
// text (`marks`, in the text's own offsets; a part deleted since is no longer
// marked), and whether the last key undid one.
// `before` is text already there that the keyboard did not see typed: the
// first character starts a word after it, and a Backspace into it deletes
// what the keyboard does not know, as on the keyboard.
// `macros` says what each macro slot plays; without it every macro
// replacement is passed over, as one with an empty slot is.
/** @param {AutocorrectList} list @param {Host} host @param {boolean} capsLock @param {string} screen @param {string} [before] @param {Macros} [macros] @returns {{text: string, fired: Replaced[], marks: Mark[], undone: boolean}} */
function typedText(list, host, capsLock, screen, before = "", macros = () => null) {
    const index = indexed(list), layout = hostLayout(host.layout);
    const macos = host.macos ?? layout?.os === "macos";
    /** @param {string} character */
    const strokes = character => strokesFor(layout, macos, capsLock, character);

    const out = [...before];
    /** @type {Replaced[]} */
    const fired = [];
    // What each standing replacement typed, as characters of `out`.
    /** @type {(Replaced & {at: number, length: number})[]} */
    let marked = [];
    // Characters taken off the end take the marks over them along.
    /** @param {number} count */
    const cut = count => {
        out.length -= count;
        marked = marked.flatMap(mark => mark.at >= out.length ? [] : [{...mark, length: Math.min(mark.length, out.length - mark.at)}]);
    };
    /** @type {string[]} */
    let word = [];
    let suspended = false, leftAlone = false, undone = false;
    // After a correction a printing key ended: the word as typed, how many of
    // its characters the correction kept and how many it typed.
    /** @type {{kept: number, typed: number} | null} */
    let undo = null;
    /** @param {boolean} suspend */
    const forget = suspend => {word = []; suspended = suspend; leftAlone = false; undo = null;};

    // The word as a correction leaves it: what stood before the typo, the
    // correction in its case, what followed. Null when this host cannot type
    // what differs, or it is more strokes than a correction types.
    /** @param {Fired} choice @param {string[]} correction @param {ReturnType<typeof formOf>} form */
    const plan = (choice, correction, form) => {
        const text = [...word.slice(0, choice.start),
            ...correction.map((character, at) => form === "capitals" || (form === "first" && at === 0) ? capitalOfWordCharacter(character) ?? character : character),
            ...word.slice(choice.end)];
        let kept = 0;
        while (kept < text.length && kept < word.length && text[kept] === word[kept]) kept++;
        let count = word.length - kept;
        for (const character of text.slice(kept)) {
            const needed = strokes(character);
            if (!needed || count + needed > STROKES_MAX) return null;
            count += needed;
        }
        return {text, kept};
    };
    // In the case the typo was typed in, or else as written.
    /** @param {Fired} choice */
    const corrected = choice => {
        const correction = [...choice.entry.correction];
        const form = formOf(word.slice(choice.start, choice.end), correction);
        return plan(choice, correction, form) || (form === "written" ? null : plan(choice, correction, "written"));
    };
    // The word ended: the typo that fires on it is corrected on screen.
    const endWord = () => {
        let first = 0, end = word.length;
        while (first < end && word[first] === AUTOCORRECT_APOSTROPHE) first++;
        while (end > first && word[end - 1] === AUTOCORRECT_APOSTROPHE) end--;
        if (suspended || leftAlone || first === end) return null;
        const inWord = /** @param {Fired} choice @returns {Fired} */ choice => ({...choice, start: choice.start + first, end: choice.end + first});
        // A macro plays for the whole word, with nothing typed after it that
        // the erase would take along, and only when its slot can play.
        /** @param {Fired} candidate */
        const plays = candidate => candidate.start === 0 && candidate.end === end - first && end === word.length ? macros(/** @type {number} */ (candidate.entry.macro)) : null;
        const choice = choose(index, word.slice(first, end).map(folded), candidate => playsMacro(candidate.entry) ? plays(candidate) !== null : corrected(inWord(candidate)) !== null);
        if (choice && playsMacro(choice.entry)) {
            // The input goes and the macro plays; there is no undo.
            cut(word.length - first);
            const played = [...(plays(choice)?.text ?? "")], macro = {entry: entryKey(choice.entry), correction: "", typo: choice.typo.typo, macro: choice.entry.macro};
            if (played.length) marked.push({...macro, at: out.length, length: played.length});
            out.push(...played);
            fired.push(macro);
            return null;
        }
        const result = choice && corrected(inWord(choice));
        // A word that already reads as the correction would leave it stays.
        if (!choice || !result || (result.kept === result.text.length && result.kept === word.length)) return null;
        cut(word.length - result.kept);
        out.push(...result.text.slice(result.kept));
        const replaced = {entry: entryKey(choice.entry), correction: choice.entry.correction, typo: choice.typo.typo};
        // The word as the replacement leaves it is what is marked.
        marked.push({...replaced, at: out.length - result.text.length, length: result.text.length});
        fired.push(replaced);
        return {kept: result.kept, typed: result.text.length - result.kept};
    };

    for (const character of screen) {
        undone = false;
        if (character === BACKSPACE) {
            if (undo) {
                // The ending character and what the correction typed go, and
                // the word comes back as typed, to be left alone. When the
                // host cannot type it back, Backspace is Backspace.
                const {kept, typed} = undo, back = word.slice(kept);
                undo = null;
                if (back.every(strokes)) {
                    cut(typed + 1);
                    marked.pop();
                    out.push(...back);
                    fired.pop();
                    leftAlone = undone = true;
                    continue;
                }
                forget(false);
            }
            // With no character of the word left, it deletes into text the
            // keyboard no longer knows.
            if (!suspended) {
                if (word.length) word.pop(); else forget(true);
            }
            if (out.length) cut(1);
            continue;
        }
        if (undo) forget(false);
        if (isWordCharacter(character)) {
            if (!suspended) {
                if (word.length === WORD_MAX) forget(true); else word.push(character);
            }
            out.push(character);
            continue;
        }
        const correction = endWord();
        if (correction && !ENDS_WITHOUT_UNDO.has(character)) undo = correction; else forget(false);
        out.push(character);
    }
    // Marks in the text's own offsets, which count a character outside the
    // basic plane as two.
    /** @param {number} characters */
    const offset = characters => out.slice(0, characters).join("").length;
    const marks = marked.map(({at, length, ...replaced}) => ({...replaced, start: offset(at), end: offset(at + length)}));
    return {text: out.join(""), fired, marks, undone};
}

module.exports = {firingTypo, typedText, wordsOf};
