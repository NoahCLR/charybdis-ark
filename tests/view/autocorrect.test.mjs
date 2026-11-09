import assert from "node:assert/strict";
import test from "node:test";
import {AUTOCORRECT_SORTS, autocorrectRows, countWords, matchWords, usageShare} from "../../webview/view/autocorrect.mjs";

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
