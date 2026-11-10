import assert from "node:assert/strict";
import test from "node:test";
import {addedReplacement, autocorrectRows, bytesWords, countWords, importLines, joinedEntry, macroLabel, openEntry, replacementLabel, replacementOf, switchedOff, textCount, triedAfter, triedWords, inputTokens, usageShare, usageWords} from "../../webview/view/autocorrect.mjs";

// An entry as core publishes it: a replacement's text, or a number for the
// macro slot it plays, then its inputs as it is written.
const STAR = {"x": 0, "x*": 1, "*x": 2, "*x*": 3};
const entry = (correction, ...typed) => ({...(typeof correction === "number" ? {id: `\u0001macro:${correction}`, correction: "", macro: correction} : {id: correction, correction}), warnings: [],
    typos: typed.map((form) => ({typo: form.replace(/\*/g, ""), input: form, match: STAR[form.replace(/[^*]+/, "x")], warnings: []}))});
const view = {entries: [entry("the", "teh", "hte"), entry("because", "becuase", "becasue", "beacuse"), entry("iPhone", "iphone"), entry("Äpfel", "aepfel"), entry("thing", "*tihng*"), entry(5, "sig"), entry(2, "addr", "adres", "adress")]};
const macros = [{defaultName: "Macro 0"}, {defaultName: "Macro 1"}, {name: "Address", defaultName: "Macro 2"}, {defaultName: "Macro 3"}, {defaultName: "Macro 4"}, {name: "", defaultName: "Macro 5"}];
const shown = (options) => autocorrectRows(view, {macros, ...options}).map((row) => replacementLabel(row.entry, macros));

test("the list is shown by replacement as a dictionary orders words, a macro by its name", () => {
    assert.deepEqual(shown(), ["Address", "Äpfel", "because", "iPhone", "Macro 5", "the", "thing"]);
    assert.deepEqual(autocorrectRows(null), []);
});

test("the editor opens the entry picked while the list has it, else the first shown", () => {
    const rows = autocorrectRows(view, {macros});
    assert.equal(openEntry(view, rows, "the").id, "the");
    assert.equal(openEntry(view, rows, null).macro, 2, "the first of the list as it is shown");
    assert.equal(openEntry(view, rows, "gone").macro, 2, "an entry that is gone gives way to the first");
    assert.equal(openEntry(view, autocorrectRows(view, {query: "iph", macros}), "the").id, "the", "a search does not close the entry open");
    assert.equal(openEntry({entries: []}, [], "the"), null);
});

test("a search matches a replacement, a macro's name or something typed, whatever its case, and names what it found typed", () => {
    assert.deepEqual(shown({query: " THE "}), ["the"]);
    assert.deepEqual(autocorrectRows(view, {query: "iph", macros}), [{entry: view.entries[2], found: []}], "a replacement that matches marks nothing typed");
    assert.deepEqual(autocorrectRows(view, {query: "bec", macros}).map((row) => row.found), [[]]);
    assert.deepEqual(autocorrectRows(view, {query: "casue", macros}), [{entry: view.entries[1], found: ["becasue"]}], "something typed shows the replacement it is typed for");
    assert.deepEqual(autocorrectRows(view, {query: "te", macros}).map((row) => [row.entry.correction, row.found]), [["the", ["teh", "hte"]]]);
    assert.deepEqual(autocorrectRows(view, {query: "*tihng*", macros}).map((row) => row.found), [["tihng"]], "as it is written, with its *");
    assert.deepEqual(shown({query: "addre"}), ["Address"], "a macro by its name");
    assert.deepEqual(autocorrectRows(view, {query: "sig", macros}).map((row) => [row.entry.macro, row.found]), [[5, ["sig"]]]);
    assert.deepEqual(shown({query: "zzz"}), []);
});

test("a replacement is named by its text or its macro, and an edit names it by text or slot", () => {
    assert.deepEqual(view.entries.map((row) => replacementLabel(row, macros)), ["the", "because", "iPhone", "Äpfel", "thing", "Macro 5", "Address"]);
    assert.equal(macroLabel(null, 9), "Macro 9", "a slot the model has not named");
    assert.deepEqual([replacementOf(view.entries[0]), replacementOf(view.entries[5])], [{correction: "the"}, {macro: 5}]);
});

test("the counts and the meter read what the keyboard holds, and no ceiling of replacements is shown", () => {
    const usage = {corrections: 1, maxCorrections: 1024, typos: 1200, maxTypos: 2048, textBytes: 10, maxTextBytes: 20480, bytes: 34, capacity: 34824, free: 100, textMax: 32, correctionMax: 128};
    assert.equal(countWords(usage), "1 replacement · 1,200 inputs");
    assert.equal(countWords({...usage, corrections: 2, typos: 1}), "2 replacements · 1 input");
    assert.equal(usageWords(usage), "1,200 of 2,048 inputs");
    assert.equal(usageWords({...usage, typos: 15, maxTypos: 1024}), "15 of 1,024 inputs");
    assert.equal(bytesWords({...usage, bytes: 1234}), "1,234 / 34,824 bytes", "as Macro memory says its own");
    assert.deepEqual(textCount(" café ", 128), {used: 5, max: 128, over: false, label: "5 / 128 bytes"}, "bytes, of the text as it is stored");
    assert.equal(textCount("x".repeat(129), 128).over, true);
    assert.equal(usageShare(usage), 100 * 1200 / 2048, "the fullest ceiling");
    assert.equal(usageShare({...usage, typos: 5000}), 100);
    assert.equal(usageShare({...usage, typos: 0, corrections: 1024}), 100 * 34 / 34824, "the replacements' own ceiling is never the one met");
});

test("what is typed into the add row becomes inputs at spaces and commas, and its replacement is text or a macro", () => {
    assert.deepEqual(inputTokens("  becuase becasue,recieve*\tbeacuse "), ["becuase", "becasue", "recieve*", "beacuse"]);
    assert.deepEqual(inputTokens(""), []);
    assert.deepEqual(addedReplacement({kind: "text", text: " the ", macro: null}), {correction: " the "}, "core trims it");
    assert.equal(addedReplacement({kind: "text", text: "  ", macro: 3}), null);
    assert.deepEqual(addedReplacement({kind: "macro", text: "the", macro: 3}), {macro: 3});
    assert.equal(addedReplacement({kind: "macro", text: "the", macro: null}), null);
    assert.equal(joinedEntry(view, {kind: "text", text: " the ", macro: null}), view.entries[0], "the same text joins its entry");
    assert.equal(joinedEntry(view, {kind: "text", text: "The", macro: null}), null, "another spelling is another replacement");
    assert.equal(joinedEntry(view, {kind: "macro", text: "", macro: 5}), view.entries[5]);
    assert.equal(joinedEntry(view, {kind: "macro", text: "the", macro: 9}), null);
});

test("text replacement is off when its Host switch is, and only then", () => {
    const section = (enabled) => ({configDefaults: [{id: "host", fields: [{macro: "hostOs"}]}, {id: "autocorrect", fields: [{macro: "autocorrect", enabled}]}]});
    assert.deepEqual([switchedOff(section(false)), switchedOff(section(true)), switchedOff({configDefaults: []}), switchedOff(null)], [true, false, false, false]);
});

test("an import's preview says what it would do in sentences, with the names each is about", () => {
    const holds = {maxTypos: 1024};
    const outcome = {replacements: 5, inputs: 9, removed: 0, duplicates: 2, unfit: 3,
        newReplacements: [{label: "because", inputs: ["becuase", "becasue"]}, {label: "Macro “Sign-off”", inputs: ["sig"]}],
        addedInputs: [{label: "the", inputs: ["hte", "tthe*"]}],
        refused: [{line: 4, text: "teh → ten", reason: "“teh” is already an input for “the”."}, {line: null, text: "x", reason: "Why."}]};
    assert.deepEqual(importLines(outcome, holds), [
        {kind: "new", text: "2 new replacements, with 3 inputs.", names: ["because", "Macro “Sign-off”"]},
        {kind: "added", text: "2 more inputs for 1 replacement you already have.", names: ["hte tthe* → the"]},
        {kind: "duplicates", text: "2 are already in the list, and skipped."},
        {kind: "unfit", text: "3 do not fit: the keyboard holds 1,024 inputs."},
        {kind: "refused", text: "2 lines are refused:", names: ["4: teh → ten — “teh” is already an input for “the”.", "x — Why."]}]);
    const replace = importLines({...outcome, removed: 1, newReplacements: [outcome.newReplacements[0]], addedInputs: [], duplicates: 1, unfit: 1, refused: [outcome.refused[0]]}, holds);
    assert.deepEqual(replace.map((line) => line.text), ["1 replacement in your list now is removed.", "1 new replacement, with 2 inputs.", "1 is already in the list, and skipped.",
        "1 does not fit: the keyboard holds 1,024 inputs.", "1 line is refused:"]);
    assert.deepEqual(importLines({...outcome, newReplacements: [], addedInputs: [], unfit: 0, refused: []}, holds).map((line) => line.kind), ["nothing", "duplicates"]);
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
    assert.equal(triedWords({fired: [{entry: "\u0001macro:2", correction: "", typo: "addr", macro: 2}], undone: false}, macros), "“addr” plays macro “Address”.");
    assert.equal(triedWords({fired: [{entry: "\u0001macro:5", correction: "", typo: "sig", macro: 5}], undone: false}, macros), "“sig” plays macro “Macro 5”.");
    assert.match(triedWords({fired: [{entry: "the", correction: "the", typo: "hte"}], undone: true}), /^Backspace put the word back/);
});
