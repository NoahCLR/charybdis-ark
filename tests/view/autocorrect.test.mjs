import assert from "node:assert/strict";
import test from "node:test";
import {AUTOCORRECT_SORTS, autocorrectRows, countWords, importLines, matchWords, triedAfter, triedWords, usageShare} from "../../webview/view/autocorrect.mjs";

const entry = (correction, ...typos) => ({correction, warnings: [], typos: typos.map((typo) => ({typo: Array.isArray(typo) ? typo[0] : typo, match: Array.isArray(typo) ? typo[1] : 0, warnings: []}))});
const view = {entries: [entry("the", "teh", "hte"), entry("because", "becuase", "becasue", "beacuse"), entry("iPhone", "iphone"), entry("Äpfel", "aepfel"), entry("thing", ["tihng", 3])]};
const shown = (options) => autocorrectRows(view, options).map((row) => row.entry.correction);

test("the list is shown by correction as a dictionary orders words, or the most typos first", () => {
    assert.deepEqual(AUTOCORRECT_SORTS, ["correction", "typos"]);
    assert.deepEqual(shown(), ["Äpfel", "because", "iPhone", "the", "thing"]);
    assert.deepEqual(shown({sort: "typos"}), ["because", "the", "Äpfel", "iPhone", "thing"]);
    assert.deepEqual(autocorrectRows(null), []);
});

test("a search matches a correction or a typo, whatever its case, and names the typos it found", () => {
    assert.deepEqual(shown({query: " THE "}), ["the"]);
    assert.deepEqual(autocorrectRows(view, {query: "iph"}), [{entry: view.entries[2], found: []}], "a correction that matches is not opened for its typos");
    assert.deepEqual(autocorrectRows(view, {query: "bec"}).map((row) => row.found), [[]]);
    assert.deepEqual(autocorrectRows(view, {query: "casue"}), [{entry: view.entries[1], found: ["becasue"]}]);
    assert.deepEqual(autocorrectRows(view, {query: "te"}).map((row) => [row.entry.correction, row.found]), [["the", ["teh", "hte"]]]);
    assert.deepEqual(shown({query: "zzz"}), []);
});

test("a typo's match is said in the vocabulary's words, the whole word left unsaid", () => {
    const model = {vocabulary: {autocorrectMatches: [[0, "Whole word"], [1, "Start of word"], [2, "End of word"], [3, "Anywhere in a word"]]}};
    assert.deepEqual([0, 1, 2, 3].map((match) => matchWords(model, match)), ["", "start of word", "end of word", "anywhere in a word"]);
});

test("the counts and the meter read what the keyboard holds", () => {
    const usage = {corrections: 1, maxCorrections: 1024, typos: 1200, maxTypos: 2048, textBytes: 10, maxTextBytes: 20480, bytes: 34, capacity: 34824, free: 100, textMax: 32};
    assert.equal(countWords(usage), "1 correction · 1,200 typos");
    assert.equal(countWords({...usage, corrections: 2, typos: 1}), "2 corrections · 1 typo");
    assert.equal(usageShare(usage), 100 * 1200 / 2048, "the fullest ceiling");
    assert.equal(usageShare({...usage, typos: 5000}), 100);
});

test("an import's preview says what it would do in sentences, with the names each is about", () => {
    const holds = {maxCorrections: 1024, maxTypos: 1024};
    const outcome = {corrections: 5, typos: 9, removed: 0, duplicates: 2, unfit: 3,
        newCorrections: [{correction: "because", typos: ["becuase", "becasue"]}, {correction: "then", typos: ["tehn"]}],
        addedTypos: [{correction: "the", typos: ["hte", "tthe"]}],
        refused: [{line: 4, text: "teh → ten", reason: "“teh” already corrects to “the”."}, {line: null, text: "x", reason: "Why."}]};
    assert.deepEqual(importLines(outcome, holds), [
        {kind: "new", text: "2 new corrections, with 3 typos.", names: ["because", "then"]},
        {kind: "added", text: "2 typos added to 1 correction you already have.", names: ["the ← hte tthe"]},
        {kind: "duplicates", text: "2 typos are already in the list, and skipped."},
        {kind: "unfit", text: "3 typos do not fit: the keyboard holds 1,024 corrections and 1,024 typos."},
        {kind: "refused", text: "2 lines are refused:", names: ["4: teh → ten — “teh” already corrects to “the”.", "x — Why."]}]);
    const replace = importLines({...outcome, removed: 1, addedTypos: [], duplicates: 1, unfit: 1, refused: [outcome.refused[0]]}, holds);
    assert.deepEqual(replace.map((line) => line.text), ["1 entry in your list now is removed.", "2 new corrections, with 3 typos.", "1 typo is already in the list, and skipped.",
        "1 typo does not fit: the keyboard holds 1,024 corrections and 1,024 typos.", "1 line is refused:"]);
    assert.deepEqual(importLines({...outcome, newCorrections: [], addedTypos: [], unfit: 0, refused: []}, holds).map((line) => line.kind), ["nothing", "duplicates"]);
});

// Try it reads the box as the keyboard would have seen it typed: text added
// at the end is typing, one character gone from the end a Backspace, and any
// other edit what a click is to the keyboard.
test("what the Try it box holds is read as typing, a Backspace, or text that stands", () => {
    const held = {before: "", typed: "teh", text: "teh"};
    assert.deepEqual(triedAfter(held, "teh "), {before: "", typed: "teh "});
    assert.deepEqual(triedAfter(held, "teh and"), {before: "", typed: "teh and"}, "a paste at the end is typing too");
    assert.deepEqual(triedAfter(held, "te"), {before: "", typed: "teh\b"});
    // The box shows the correction, so the next key is read against that.
    const corrected = {before: "", typed: "teh ", text: "the "};
    assert.deepEqual(triedAfter(corrected, "the"), {before: "", typed: "teh \b"});
    assert.deepEqual(triedAfter(corrected, "the x"), {before: "", typed: "teh x"});
    assert.deepEqual(triedAfter(corrected, "t"), {before: "t", typed: ""}, "a word deleted at once starts afresh");
    assert.deepEqual(triedAfter(corrected, "then the "), {before: "then the ", typed: ""}, "an edit in the middle starts afresh");
    assert.deepEqual(triedAfter({before: "ab", typed: "", text: "ab"}, "a"), {before: "ab", typed: "\b"}, "Backspace into what stood is still a Backspace");
    assert.deepEqual(triedAfter({before: "", typed: "é😀", text: "é😀"}, "é"), {before: "", typed: "é😀\b"}, "one character, whatever its length in code units");
    assert.deepEqual(triedAfter({before: "x", typed: "y", text: "xy"}, ""), {before: "", typed: ""});
});

test("the line under Try it says what fired last, or that Backspace put the word back", () => {
    assert.equal(triedWords({fired: [], undone: false}), "");
    assert.equal(triedWords({fired: [{correction: "the", typo: "hte"}, {correction: "thing", typo: "tihng"}], undone: false}), "“tihng” was corrected to “thing”.");
    assert.match(triedWords({fired: [{correction: "the", typo: "hte"}], undone: true}), /^Backspace put the word back/);
});
