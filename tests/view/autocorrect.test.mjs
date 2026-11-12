import assert from "node:assert/strict";
import test from "node:test";
import {addedReplacement, autocorrectRows, bytesWords, countWords, freeWords, importLines, leaderTriedWords, openEntry, replacementOf, textCount, triedAfter, triedWords, usageWords} from "../../webview/view/autocorrect.mjs";

// An entry as core publishes it: a replacement's text, or a number for the
// macro slot it plays, then its inputs as it is written. Its label is core's
// name for it: its text, or its macro's name after the mark of one that plays.
const macros = [{defaultName: "Macro 0"}, {defaultName: "Macro 1"}, {name: "Address", defaultName: "Macro 2"}, {defaultName: "Macro 3"}, {defaultName: "Macro 4"}, {name: "", defaultName: "Macro 5"}];
const entry = (correction, ...typed) => ({...(typeof correction === "number" ? {id: `\u0001macro:${correction}`, label: `${macros[correction].name || macros[correction].defaultName}`, correction: "", macro: correction}
    : {id: correction, label: correction, correction}), warnings: [], typos: typed.map((form) => ({typo: form.replace(/\*/g, ""), input: form, warnings: []}))});
const view = {entries: [entry("the", "teh", "hte"), entry("because", "becuase", "becasue", "beacuse"), entry("iPhone", "iphone"), entry("Äpfel", "aepfel"), entry("thing", "*tihng*"), entry(5, "sig"), entry(2, "addr", "adres", "adress")]};
const shown = (options) => autocorrectRows(view, {macros, ...options}).map((row) => row.entry.label);

test("the list is shown by replacement as a dictionary orders words, a macro by its macro's name", () => {
    assert.deepEqual(shown(), ["Address", "Äpfel", "because", "iPhone", "Macro 5", "the", "thing"]);
    assert.deepEqual(autocorrectRows(null), []);
});

test("the editor opens the entry picked while the list has it, else the first shown, and never none while the list has one", () => {
    const rows = autocorrectRows(view, {macros});
    assert.equal(openEntry(view, rows, "the", macros).id, "the");
    assert.equal(openEntry(view, rows, null, macros).macro, 2, "the first of the list as it is shown");
    assert.equal(openEntry(view, rows, "gone", macros).macro, 2, "an entry that is gone gives way to the first");
    assert.equal(openEntry(view, autocorrectRows(view, {query: "iph", macros}), "the", macros).id, "the", "a search does not close the entry open");
    assert.equal(openEntry(view, autocorrectRows(view, {query: "iph", macros}), null, macros).id, "iPhone", "with none picked, the first it shows");
    // A search that shows nothing leaves the list's first entry open: the
    // empty pattern is for a list with no replacements.
    assert.deepEqual(autocorrectRows(view, {query: "zzz", macros}), []);
    assert.equal(openEntry(view, [], null, macros).macro, 2, "none shown and none picked: the first of the list");
    assert.equal(openEntry(view, [], "the", macros).id, "the");
    assert.equal(openEntry({entries: []}, [], "the", macros), null, "only a list with no replacements has none open");
});

test("a search is a plain one over what core publishes, whatever its case: a replacement's label, or an input as it is written", () => {
    assert.deepEqual(shown({query: " THE "}), ["the"]);
    assert.deepEqual(autocorrectRows(view, {query: "iph", macros}), [{entry: view.entries[2], found: []}], "a replacement that matches marks no input");
    assert.deepEqual(autocorrectRows(view, {query: "bec", macros}).map((row) => row.found), [[]]);
    assert.deepEqual(autocorrectRows(view, {query: "casue", macros}), [{entry: view.entries[1], found: ["becasue"]}], "an input shows the replacement it is for");
    assert.deepEqual(autocorrectRows(view, {query: "te", macros}).map((row) => [row.entry.correction, row.found]), [["the", ["teh", "hte"]]]);
    assert.deepEqual(autocorrectRows(view, {query: "*tihng*", macros}).map((row) => row.found), [["tihng"]], "as it is written, with its *");
    assert.deepEqual(autocorrectRows(view, {query: "tihng", macros}).map((row) => row.found), [["tihng"]], "or without");
    assert.deepEqual(autocorrectRows(view, {query: "*", macros}).map((row) => row.entry.id), ["thing"], "a * finds the inputs written with one");
    assert.deepEqual(shown({query: "addre"}), ["Address"], "a macro by its name");
    assert.deepEqual(autocorrectRows(view, {query: "sig", macros}).map((row) => [row.entry.macro, row.found]), [[5, ["sig"]]]);
    assert.deepEqual(shown({query: "zzz"}), []);
});

test("an edit names a replacement by its text or its slot", () => {
    assert.deepEqual([replacementOf(view.entries[0]), replacementOf(view.entries[5])], [{correction: "the"}, {macro: 5}]);
});

test("the counts and the memory read what the keyboard holds, in core's own figures, and no ceiling of replacements is shown", () => {
    const usage = {corrections: 1, typos: 1200, maxTypos: 2048, textBytes: 10, maxTextBytes: 20480, bytes: 34, capacity: 34826, share: 34 / 34826, free: 100, textMax: 32, correctionMax: 128, shortInput: 4};
    assert.equal(countWords(usage), "1 replacement · 1,200 inputs");
    assert.equal(countWords({corrections: 2, typos: 1}), "2 replacements · 1 input");
    assert.equal(usageWords(usage), "1,200 of 2,048 inputs");
    assert.equal(usageWords({...usage, typos: 15, maxTypos: 1024}), "15 of 1,024 inputs");
    assert.equal(bytesWords({...usage, bytes: 1234}), "1,234 / 34,826 bytes", "as Macro memory says its own");
    assert.deepEqual([freeWords({...usage, free: 20422}), freeWords({...usage, free: 1}), freeWords({...usage, free: 0})], ["20,422 bytes free", "1 byte free", "0 bytes free"], "as Macro memory says what is free");
    assert.deepEqual(textCount(" café ", 128), {used: 5, max: 128, over: false, label: "5 / 128 bytes"}, "bytes, of the text as it is stored");
    assert.equal(textCount("x".repeat(129), 128).over, true);
});

test("a replacement being made names its text or its macro, and nothing while it has neither", () => {
    assert.deepEqual(addedReplacement({kind: "text", text: " the ", macro: null}), {correction: " the "}, "core trims it");
    assert.equal(addedReplacement({kind: "text", text: "  ", macro: 3}), null);
    assert.deepEqual(addedReplacement({kind: "macro", text: "the", macro: 3}), {macro: 3});
    assert.equal(addedReplacement({kind: "macro", text: "the", macro: null}), null);
});

test("an import's preview says what it would do in sentences, with the names each is about", () => {
    const outcome = {replacements: 5, inputs: 9, removed: 0, duplicates: 2, unfit: 3, unfitWhy: "the keyboard holds 1,024 inputs",
        newReplacements: [{label: "because", inputs: ["becuase", "becasue"]}, {label: "Sign-off", macro: true, inputs: ["sig"]}],
        addedInputs: [{label: "the", inputs: ["hte", "tthe*"]}],
        refused: [{line: 4, text: "teh → ten", reason: "“teh” is already an input for “the”."}, {line: null, text: "x", reason: "Why."}]};
    assert.deepEqual(importLines(outcome), [
        {kind: "new", text: "2 new replacements, with 3 inputs.", names: [{text: "because"}, {text: "Sign-off", macro: true}]},
        {kind: "added", text: "2 more inputs for 1 replacement you already have.", names: [{text: "hte tthe* → the"}]},
        {kind: "duplicates", text: "2 are already in the list, and skipped."},
        {kind: "unfit", text: "3 do not fit: the keyboard holds 1,024 inputs."},
        {kind: "refused", text: "2 lines are refused:", names: [{text: "4: teh → ten — “teh” is already an input for “the”."}, {text: "x — Why."}]}]);
    const replace = importLines({...outcome, removed: 1, newReplacements: [outcome.newReplacements[0]], addedInputs: [], duplicates: 1, unfit: 1, unfitWhy: "the keyboard's profile is full", refused: [outcome.refused[0]]});
    assert.deepEqual(replace.map((line) => line.text), ["1 replacement in your list now is deleted.", "1 new replacement, with 2 inputs.", "1 is already in the list, and skipped.",
        "1 does not fit: the keyboard's profile is full.", "1 line is refused:"], "a replacement is deleted, and what stopped the first that did not fit is core's to say");
    assert.deepEqual(importLines({...outcome, newReplacements: [], addedInputs: [], unfit: 0, refused: []}).map((line) => line.kind), ["nothing", "duplicates"]);
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

test("the line under Try it says what fired last, a macro by its name, or that Backspace put the word back", () => {
    assert.equal(triedWords({fired: [], undone: false}), "");
    assert.equal(triedWords({fired: [{entry: "the", correction: "the", typo: "hte"}, {entry: "thing", correction: "thing", typo: "tihng"}], undone: false}), "“tihng” was replaced with “thing”.");
    assert.equal(triedWords({fired: [{entry: "\u0001macro:2", correction: "", typo: "addr", macro: 2}], undone: false}, macros), "“addr” plays the macro “Address”.");
    assert.equal(triedWords({fired: [{entry: "\u0001macro:5", correction: "", typo: "sig", macro: 5}], undone: false}, macros), "“sig” plays the macro “Macro 5”.");
    assert.match(triedWords({fired: [{entry: "the", correction: "the", typo: "hte"}], undone: true}), /^Backspace put the word back/);
});

// What Try it's After Leader field says of core's answer (D-L91).
test("the After Leader line says what the leader would do, in plain words, and nothing for an empty field", () => {
    assert.equal(leaderTriedWords("", {state: "none"}), "");
    assert.equal(leaderTriedWords("pn", null), "");
    assert.equal(leaderTriedWords("pn", {state: "none"}), "Nothing on your list fires after Leader, so the Leader key does nothing.");
    assert.equal(leaderTriedWords("pn", {state: "sends", input: "pn", entry: "x", label: "+31 6 1234 5678", finishing: false, passedOver: false}), "“pn” sends “+31 6 1234 5678”, and that is all the computer sees.");
    assert.equal(leaderTriedWords("abc", {state: "sends", input: "abc", entry: "alpha", label: "alpha", finishing: true, passedOver: false}), "Enter sends “alpha”, and that is all the computer sees.");
    assert.equal(leaderTriedWords("sig", {state: "sends", input: "sig", entry: "m", label: "Sign-off", macro: 5, finishing: false, passedOver: false}), "“sig” plays the macro “Sign-off”, and that is all the computer sees.");
    assert.equal(leaderTriedWords("ub", {state: "sends", input: "ub", entry: "über", label: "über", finishing: false, passedOver: true}), "“ub” is a leader input, but the keyboard cannot type its replacement here: nothing is sent.");
    assert.equal(leaderTriedWords("sig", {state: "sends", input: "sig", entry: "m", label: "Sign-off", macro: 5, finishing: false, passedOver: true}), "“sig” is a leader input, but the keyboard cannot play its macro: nothing is sent.");
    assert.equal(leaderTriedWords("ab", {state: "waits", sends: null, longer: ["abc", "abcd", "abce", "abcf"]}), "Waiting for more: it could become “abc”, “abcd”, “abce” and 1 more.");
    assert.equal(leaderTriedWords("abc", {state: "waits", sends: "alpha", longer: ["abcd"]}), "Waiting: Enter, or a pause, sends “alpha”; “abcd” could still follow.");
    assert.equal(leaderTriedWords("ax", {state: "drops", held: "ax"}), "No leader input begins with “ax”: the keyboard drops what you typed, and nothing reaches the computer.");
});
