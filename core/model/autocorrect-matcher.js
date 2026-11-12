// @ts-check
"use strict";

// What the keyboard does with a list as text is typed, read over the
// characters a computer would show (firmware autocorrect-v1.md): which typo
// fires when a word ends, the case its correction takes, what the host layout
// can type under Caps Lock, and the undo. It is the one matcher: Try it shows
// its result, the list's warnings ask it which typo fires, and the firmware's
// behaviour fixture holds it to the keyboard (tests/model). What needs a key,
// a timing or a setting (shortcuts, held keys, macro keys, the queue, the
// leader's timeout) has no form in text and is not here. A replacement that
// plays a macro is: the input goes and the macro's text, when it is only
// text, takes its place. So is the leader (firmware D-F71): U+0010 stands
// for the Leader key, after which what is typed is held, never shown, and
// sent as the replacement of an input that fires after it, or dropped. A
// replacement fires as you type, after the Leader key, or both.

const {AUTOCORRECT_DOMAIN_V1, AUTOCORRECT_MATCH, entryKey, firesAfterLeader, firesAsTyped, playsMacro, triggerOf} = require("../schema/autocorrect-domain-v1");
const {AUTOCORRECT_APOSTROPHE, capitalOfWordCharacter, foldWordCharacter} = require("../data/autocorrect-words");
const {hostLayout} = require("../data/host-layouts");

/**
 * @typedef {import("../schema/autocorrect-domain-v1.js").AutocorrectList} AutocorrectList
 * @typedef {import("../schema/autocorrect-domain-v1.js").Entry} Entry
 * @typedef {Entry["typos"][number]} Typo
 * @typedef {{layout: number, macos?: boolean}} Host the host layout the keyboard types through; `macos` when the host's system is macOS though the layout is not one of its own
 * @typedef {{entry: Entry, typo: Typo, length: number}} Listed a typo with its entry, and how many characters it has
 * @typedef {{whole: Map<string, Listed>, parts: Listed[], leaders: Map<string, Listed>}} Index the whole-word typos of a list's replacements that fire as you type, by their text, their part-of-word typos, the longest first and equally long ones in the domain's byte order, and the typos of those that fire after the leader by their text, whatever their match
 * @typedef {{entry: Entry, typo: Typo, start: number, end: number}} Fired the typo that fires on a word, and the characters of the word it matched
 * @typedef {(slot: number) => {text: string | null} | null} Macros what a macro slot plays: its text when it types only text, `text: null` when it does more, and null for a slot that is empty or cannot play
 * @typedef {Replaced & {start: number, end: number}} Mark where a standing replacement's text is in the text tried, by its offsets
 * @typedef {{entry: string, correction: string, typo: string, macro?: number, leader?: true}} Replaced a replacement that fired: its entry's key, its text ("" for a macro), the input, the macro slot it played, and `leader` when the leader sent it
 * @typedef {{state: "sends", entry: Entry, typo: Typo, at: number, finishing: boolean} | {state: "waits", exact: Listed | null, longer: Listed[]} | {state: "drops", at: number}} Leading what the leader does with characters typed after it: send an entry's replacement on the character at `at` (on Enter or the timeout when `finishing`), wait with what Enter would send and the inputs it could still become, or drop what is held on the character at `at`
 */

// The keyboard follows this many characters of a word, and types no
// correction that takes more key strokes than this, erasing included.
const WORD_MAX = 32, STROKES_MAX = 288;
const BACKSPACE = "\b";
// The Leader key, as the firmware's behaviour fixture writes it in a screen.
const LEADER = "\u0010";
// Enter and Tab end a word and print nothing a Backspace could take back.
const ENDS_WITHOUT_UNDO = new Set(["\n", "\t"]);

/** @param {string} character */
const isWordCharacter = character => character === AUTOCORRECT_APOSTROPHE || foldWordCharacter(character) !== undefined;
/** @param {string} character */
const folded = character => foldWordCharacter(character) ?? character;
/** @param {string} character */
const isCapital = character => folded(character) !== character;

// Two texts in the order of their UTF-8 bytes, which is the order of their
// characters' code points, compared without encoding either. A string's own
// order is by UTF-16 units, where a character outside the basic plane (two
// surrogates) falls below U+E000 to U+FFFF; in bytes it is above them.
/** @param {string} a @param {string} b */
function byBytes(a, b) {
    const shared = Math.min(a.length, b.length);
    for (let at = 0; at < shared; at++) {
        const x = a.charCodeAt(at), y = b.charCodeAt(at);
        if (x === y) continue;
        const outsideX = x >= 0xd800 && x <= 0xdfff, outsideY = y >= 0xd800 && y <= 0xdfff;
        return outsideX === outsideY ? x - y : outsideX ? 1 : -1;
    }
    return a.length - b.length;
}

// A list's typos as the matcher looks them up. Made once for a text or a
// whole list's warnings: making it is a pass over every typo and a sort.
/** @param {AutocorrectList} list @returns {Index} */
function indexed(list) {
    /** @type {Index} */
    const index = {whole: new Map(), parts: [], leaders: new Map()};
    for (const entry of list.entries) for (const typo of entry.typos) {
        const listed = {entry, typo, length: [...typo.typo].length}, trigger = triggerOf(entry);
        if (firesAfterLeader(trigger)) index.leaders.set(typo.typo, listed);
        if (!firesAsTyped(trigger)) continue;
        if (typo.match === AUTOCORRECT_MATCH.WHOLE_WORD) index.whole.set(typo.typo, listed);
        else index.parts.push(listed);
    }
    index.parts.sort((a, b) => b.length - a.length || byBytes(a.typo.typo, b.typo.typo));
    return index;
}

// Where in a folded word a part-of-word typo sits, in characters: its start,
// its end, or the first place it is found; -1 when it does not fit.
/** @param {string} text the word @param {number} length its characters @param {Listed} part */
function placeOf(text, length, part) {
    const {typo, match} = part.typo;
    if (part.length > length) return -1;
    if (match === AUTOCORRECT_MATCH.START) return text.startsWith(typo) ? 0 : -1;
    if (match === AUTOCORRECT_MATCH.END) return text.endsWith(typo) ? length - part.length : -1;
    const at = text.indexOf(typo);
    // A place in the text counts a character outside the basic plane as two.
    return at <= 0 ? at : [...text.slice(0, at)].length;
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
    // The longest come first, so the first that fits and is taken is it.
    for (const part of index.parts) {
        const start = placeOf(text, word.length, part);
        if (start < 0) continue;
        const fired = {entry: part.entry, typo: part.typo, start, end: start + part.length};
        if (takes(fired)) return fired;
    }
    return null;
}

// What is held after the leader, against its inputs: the one it is exactly,
// if any, and those longer that begin with it. Held text past an input's 32
// bytes is no input and begins none.
/** @param {Index} index @param {readonly string[]} held folded @returns {{exact: Listed | null, longer: Listed[]}} */
function leaderMatch(index, held) {
    const text = held.join("");
    if (!text || Buffer.byteLength(text) > AUTOCORRECT_DOMAIN_V1.TEXT_MAX) return {exact: null, longer: []};
    const longer = [...index.leaders.values()].filter(listed => listed.typo.typo.length > text.length && listed.typo.typo.startsWith(text))
        .sort((a, b) => byBytes(a.typo.typo, b.typo.typo));
    return {exact: index.leaders.get(text) ?? null, longer};
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
// the characters of the word it matched: asked of one list for as many words
// as there are, its index made once.
/** @param {AutocorrectList} list @returns {(word: string) => Fired | null} */
function typoFinder(list) {
    const index = indexed(list);
    return word => choose(index, [...word]);
}
/** @param {AutocorrectList} list @param {string} word @returns {Fired | null} */
const firingTypo = (list, word) => typoFinder(list)(word);

// One character typed while leading (firmware autocorrect-v1.md, "The
// leader"): Enter sends what is held when it is an input and drops it when
// not; any other joins what is held, folded, which is then sent when it is an
// input no longer one begins with, dropped when it begins none, and held
// otherwise. What is held after it (null once leading is over) and what it
// sends. Backspace, Tab and the Leader key are the caller's.
/** @param {Index} index @param {readonly string[]} held @param {string} character @returns {{held: string[] | null, sends: Listed | null}} */
function leadStep(index, held, character) {
    if (character === "\n") return {held: null, sends: leaderMatch(index, held).exact};
    if (held.length === WORD_MAX) return {held: null, sends: null};
    const next = [...held, folded(character)];
    const {exact, longer} = leaderMatch(index, next);
    return longer.length ? {held: next, sends: null} : {held: null, sends: exact};
}

// What the leader does with these characters typed after it: each taken by
// leadStep, as the fixture-held typedText takes them, until one sends an
// input or drops what is held; at the end of the text it waits, Enter or the
// timeout to send an input a longer one begins with. It does not ask whether
// the host can type what is sent.
/** @param {AutocorrectList} list @param {string} typed @returns {Leading} */
function leaderOutcome(list, typed) {
    const index = indexed(list);
    /** @type {string[]} */
    let held = [];
    let at = 0;
    for (const character of typed) {
        const step = leadStep(index, held, character);
        if (step.sends) return {state: "sends", entry: step.sends.entry, typo: step.sends.typo, at, finishing: character === "\n"};
        if (!step.held) return {state: "drops", at};
        held = step.held;
        at += character.length;
    }
    return {state: "waits", ...leaderMatch(index, held)};
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
    // What is held after the Leader key, folded; null when not leading.
    /** @type {string[] | null} */
    let held = null;
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

    // What the leader sends: text as written, through this host and under its
    // Caps Lock, with nothing to erase and no undo; a macro as a
    // replacement's plays. One the host cannot type, or a macro that cannot
    // play, is passed over and nothing is sent.
    /** @param {Listed} listed */
    const lead = listed => {
        const {entry, typo} = listed;
        /** @type {Replaced} */
        const sent = {entry: entryKey(entry), correction: entry.correction, typo: typo.typo, ...(playsMacro(entry) ? {macro: entry.macro} : {}), leader: true};
        let text;
        if (playsMacro(entry)) {
            const played = macros(/** @type {number} */ (entry.macro));
            if (!played) return;
            text = [...(played.text ?? "")];
        } else {
            text = [...entry.correction];
            let count = 0;
            for (const character of text) {
                const needed = strokes(character);
                if (!needed || count + needed > STROKES_MAX) return;
                count += needed;
            }
        }
        if (text.length) marked.push({...sent, at: out.length, length: text.length});
        out.push(...text);
        fired.push(sent);
    };
    const hasLeader = index.leaders.size > 0;

    for (const character of screen) {
        undone = false;
        // The Leader key starts leading, or over: the word before it is
        // forgotten. With nothing on the list that fires after it, it does
        // nothing.
        if (character === LEADER) {
            if (hasLeader) {forget(false); held = [];}
            continue;
        }
        if (held) {
            // While leading nothing typed reaches the computer, but Tab.
            if (character === BACKSPACE) {
                if (held.length) held.pop(); else held = null;
                continue;
            }
            if (character === "\t") {held = null; out.push(character); continue;}
            const step = leadStep(index, held, character);
            held = step.held;
            if (step.sends) lead(step.sends);
            continue;
        }
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

module.exports = {LEADER, firingTypo, leaderOutcome, typedText, typoFinder, wordsOf};
