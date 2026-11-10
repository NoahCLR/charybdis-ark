"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const {AUTOCORRECT_FILE_FORMATS, IMPORT_MAX_BYTES, entriesOf, exportAutocorrect, parseAutocorrectFile, planImport, previewImport, rowsOf, starterFile} = require("../../core/model/autocorrect-import");
const {typoOf} = require("../../core/model/autocorrect-list");
const {AUTOCORRECT_MATCH: MATCH, encodeAutocorrectDomain} = require("../../core/schema/autocorrect-domain-v1");
const {US_HOST_LAYOUT} = require("../../core/data/host-layouts");

const US = {layout: US_HOST_LAYOUT, layoutName: "US"};
const CEILINGS = {maxCorrections: 1024, maxTypos: 1024, maxTextBytes: 20480};
// A list from rows: a replacement's text, or a number for the macro slot it
// plays, then its typed forms, each its letters or [letters, match].
const list = (...entries) => ({entries: entries.map(([correction, ...typos]) => ({...(typeof correction === "number" ? {correction: "", macro: correction} : {correction}),
    typos: typos.map(typo => typeof typo === "string" ? {typo, match: MATCH.WHOLE_WORD} : {typo: typo[0], match: typo[1]})}))});
const shape = value => value.entries.map(entry => [entry.macro ?? entry.correction, ...entry.typos.map(typo => typo.match ? [typo.typo, typo.match] : typo.typo)]);
// A file's rows as the list they would make, each typed form read as the
// list editor reads it.
const listed = rows => ({entries: entriesOf(rows).map(entry => ({...(entry.macro === undefined ? {correction: entry.correction} : {correction: "", macro: entry.macro}), typos: entry.typos.map(typoOf)}))});
const read = (text, name) => { const file = parseAutocorrectFile(text, name); return {format: file.format, entries: shape(listed(file.rows)), refused: file.refused}; };
const invalid = (fn, pattern) => assert.throws(fn, error => error.code === "AUTOCORRECT_IMPORT_INVALID" && pattern.test(error.message), String(pattern));

test("QMK's text format: colons say where a typed form matches, comments and blank lines are skipped, one replacement's lines are one entry", () => {
    const file = read(["# my typos", "", ":teh: -> the", "  :hte:   ->   the  ", "tihng -> thing", ":nu -> un", "mnet: -> ment", "alot -> a lot", ":becuase: -> because", "   # indented comment"].join("\n"), "list.txt");
    assert.equal(file.format, "txt");
    // No colons is anywhere (*x*), one before is the start (x*), one after the end (*x), both the whole word.
    assert.deepEqual(file.entries, [["the", "teh", "hte"], ["thing", ["tihng", MATCH.ANYWHERE]], ["un", ["nu", MATCH.START]], ["ment", ["mnet", MATCH.END]], ["a lot", ["alot", MATCH.ANYWHERE]], ["because", "becuase"]]);
    assert.deepEqual(file.refused, []);
    assert.deepEqual(read(":teh: -> the\r\n:hte: -> the\r\n", "windows.txt").entries, [["the", "teh", "hte"]], "CRLF line ends");
    assert.deepEqual(read("x -> a -> b", "arrow.txt").entries, [["a -> b", ["x", MATCH.ANYWHERE]]], "the first arrow divides the line");
    assert.deepEqual(read(":pnumber: -> +31 6 1234 5678\n:sig: => 12\n", "more.txt").entries, [["+31 6 1234 5678", "pnumber"], [12, "sig"]], "any line of text, and the firmware's own way to name a macro");
});

test("QMK's text format refuses a line by its number, and reads the rest", () => {
    const file = read([":teh: -> the", "no arrow here", " -> the", ":: -> the", "teh ->", ":hte: -> the", ":sig: => soon"].join("\n"), "list.txt");
    assert.deepEqual(file.entries, [["the", "teh", "hte"]]);
    assert.deepEqual(file.refused, [
        {line: 2, text: "no arrow here", reason: "It has no “->” between what is typed and its replacement."},
        {line: 3, text: "-> the", reason: "It has nothing typed before “->”."},
        {line: 4, text: ":: -> the", reason: "It has nothing typed before “->”."},
        {line: 5, text: "teh ->", reason: "It has no replacement after “->”."},
        {line: 7, text: ":sig: => soon", reason: "“=>” is followed by a macro's number."}]);
});

test("a spreadsheet's CSV as Ark writes it: replacement and typed, each typed form with its own *, a macro in a column of its own", () => {
    const file = read(["replacement,typed", "because,becuase becasue beacuse", "thing,*tihng*", "un,nu*", "ment,*mnet", "the,teh hte", '"+31 6 1234 5678",pnumber', "receive,recieve* reciev"].join("\n"), "list.csv");
    assert.equal(file.format, "csv");
    assert.deepEqual(file.entries, [["because", "becuase", "becasue", "beacuse"], ["thing", ["tihng", MATCH.ANYWHERE]], ["un", ["nu", MATCH.START]], ["ment", ["mnet", MATCH.END]], ["the", "teh", "hte"],
        ["+31 6 1234 5678", "pnumber"], ["receive", ["recieve", MATCH.START], "reciev"]]);
    assert.deepEqual(file.refused, []);
    assert.deepEqual(read("replacement,typed,macro\nthe,teh,\n,sig sgi,5\n", "macros.csv").entries, [["the", "teh"], [5, "sig", "sgi"]]);
    assert.deepEqual(read("typed,macro\nsig,5\n", "only-macros.csv").entries, [[5, "sig"]], "a sheet of macros needs no replacement column");
});

test("an older spreadsheet is still read: typos, correction and match, where a match stands for a form written without *", () => {
    const file = read(["becuase becasue beacuse,because", "tihng,thing,anywhere", "nu,un,start", "mnet,ment,END", "teh,the,", "hte , the , whole word", "tehn,then,Start of word"].join("\n"), "list.csv");
    assert.deepEqual(file.entries, [["because", "becuase", "becasue", "beacuse"], ["thing", ["tihng", MATCH.ANYWHERE]], ["un", ["nu", MATCH.START]], ["ment", ["mnet", MATCH.END]], ["the", "teh", "hte"], ["then", ["tehn", MATCH.START]]]);
    assert.deepEqual(file.refused, []);
    // The row's match is each of its typed forms'.
    assert.deepEqual(read("becuase becasue,because,end", "a.csv").entries, [["because", ["becuase", MATCH.END], ["becasue", MATCH.END]]]);
    assert.deepEqual(read("correction,typos,match\r\nbecause,becuase becasue,whole word\r\nthing,tihng,anywhere\r\n", "sheets.csv").entries, [["because", "becuase", "becasue"], ["thing", ["tihng", MATCH.ANYWHERE]]]);
    // A * the form is written with says where it matches, whatever the column says.
    assert.deepEqual(read("correction,typos,match\nreceive,recieve*,whole word\n", "both.csv").entries, [["receive", ["recieve", MATCH.START]]]);
});

test("CSV as Excel, Numbers and Google Sheets save it: a header in any column order, semicolons, quoted fields, a BOM, CRLF", () => {
    assert.deepEqual(read("Match;Typo;Correction\nstart;nu;un\n;teh;the\n", "numbers.csv").entries, [["un", ["nu", MATCH.START]], ["the", "teh"]], "any column order, a singular name, semicolons");
    assert.deepEqual(read("Typed;Replacement\nnu*;un\n", "new.csv").entries, [["un", ["nu", MATCH.START]]], "Ark's names in any order and case");
    assert.deepEqual(read("﻿typos;correction\r\nbecuase;because\r\n", "excel-nl.csv").entries, [["because", "becuase"]], "a byte order mark and no match column");
    assert.deepEqual(read('typed,replacement\nhowver,"however, though"\nsaid,"he said ""hi"""\n"alot",a lot\n', "quoted.csv").entries,
        [["however, though", "howver"], ['he said "hi"', "said"], ["a lot", "alot"]], "a quoted field keeps its commas and doubled quotes");
    assert.deepEqual(read("typos;correction\nteh;the\n\n\nhte;the\n", "blank.csv").entries, [["the", "teh", "hte"]], "blank rows are skipped");
    assert.deepEqual(read("teh;the;whole word\n", "plain.csv").entries, [["the", "teh"]], "no header, semicolons: the older columns");
    assert.deepEqual(read('teh,"two\nlines"\nhte,the\n', "multi.csv").refused, [], "a quoted line break stays in its field");
    assert.equal(parseAutocorrectFile('teh,"two\nlines"\nhte,the\n', "multi.csv").rows[1].line, 3, "and the next row keeps its own line number");
});

test("CSV refuses a row by its number: too few or too many columns, an unknown match, an empty cell, a macro that is none", () => {
    const file = read(["typos,correction,match", "teh,the,whole word", "justone", "a,b,c,d", "nu,un,sometimes", ",the,start", "hte,,end", "tehn,then,"].join("\n"), "bad.csv");
    assert.deepEqual(file.entries, [["the", "teh"], ["then", "tehn"]]);
    assert.deepEqual(file.refused.map(({line, reason}) => [line, reason]), [
        [3, "It has 1 column; a row is a replacement and what is typed for it."],
        [4, "It has 4 columns; a row is a replacement and what is typed for it."],
        [5, "“sometimes” is not where something typed can match: use whole word, start, end or anywhere, or write it with *."],
        [6, "It has nothing typed."],
        [7, "It has no replacement."]]);
    assert.deepEqual(read("typed,replacement\nteh,the,start\n", "wide.csv").refused.map(({line}) => line), [2], "more columns than the header names");
    assert.deepEqual(read("replacement,typed,macro\nthe,teh,5\n,sig,five\n", "macro.csv").refused.map(({line, reason}) => [line, reason]),
        [[2, "It has a replacement and a macro; a row has one of them."], [3, "“five” is not a macro's number."]]);
    invalid(() => parseAutocorrectFile("replacement,match\nthe,start\n", "no-typed.csv"), /needs a “replacement” column and a “typed” column/);
});

test("Ark's JSON: replacements with what is typed for each, read back; the shape Ark wrote before is still read", () => {
    const text = JSON.stringify({version: 1, replacements: [{replacement: "because", typed: ["becuase", "becasue"]}, {replacement: "thing", typed: ["*tihng*"]}, {macro: 5, typed: ["sig"]}]});
    assert.deepEqual(read(text, "list.json"), {format: "json", entries: [["because", "becuase", "becasue"], ["thing", ["tihng", MATCH.ANYWHERE]], [5, "sig"]], refused: []});
    const older = JSON.stringify({version: 1, entries: [{correction: "because", typos: [{typo: "becuase", match: "whole word"}, {typo: "becasue"}]}, {correction: "thing", typos: [{typo: "tihng", match: "anywhere"}]}]});
    assert.deepEqual(read(older, "list.json"), {format: "json", entries: [["because", "becuase", "becasue"], ["thing", ["tihng", MATCH.ANYWHERE]]], refused: []});
    // The names mix: an older entry may sit in a newer list, and a typed form may be given either way.
    assert.deepEqual(read(JSON.stringify({version: 1, replacements: [{correction: "un", typos: ["nu*", {typed: "nnu", match: "start"}]}]}), "mixed.json").entries, [["un", ["nu", MATCH.START], ["nnu", MATCH.START]]]);
});

test("JSON of another version or shape is refused whole, a bad entry by its number", () => {
    invalid(() => parseAutocorrectFile("{not json", "list.json"), /not a valid text replacement list/);
    invalid(() => parseAutocorrectFile("[]", "list.json"), /it has no replacements/);
    invalid(() => parseAutocorrectFile('{"version": 1}', "list.json"), /it has no replacements/);
    invalid(() => parseAutocorrectFile('{"version": 2, "replacements": []}', "list.json"), /version 2 of the format; this Ark reads version 1/);
    invalid(() => parseAutocorrectFile('{"entries": []}', "list.json"), /version an unknown of the format/);
    const bad = read(JSON.stringify({version: 1, replacements: [{replacement: "the", typed: ["teh"]}, {replacement: 7, typed: []}, {replacement: "then", typed: []},
        {correction: "un", typos: [{typo: "nu", match: "sometimes"}, {typo: 4}]}, "x", {macro: "five", typed: ["sig"]}, {macro: 5, replacement: "both", typed: ["sig"]}]}), "bad.json");
    assert.deepEqual(bad.entries, [["the", "teh"]]);
    assert.deepEqual(bad.refused.map(({line, reason}) => [line, reason]), [[2, "It is not a replacement with what is typed for it."], [3, "It has nothing typed."],
        [4, "“sometimes” is not where something typed can match: use whole word, start, end or anywhere, or write it with *."], [4, "Something typed for it is not text."],
        [5, "It is not a replacement with what is typed for it."], [6, "Its macro is not a macro's number."], [7, "It is not a replacement with what is typed for it."]]);
});

test("a file's format is its name's extension, else what it holds; one that is no list is refused whole", () => {
    assert.equal(parseAutocorrectFile('{"version": 1, "replacements": []}', "pasted").format, "json");
    assert.equal(parseAutocorrectFile(":teh: -> the", "notes").format, "txt");
    assert.equal(parseAutocorrectFile(":teh: -> the\n:sig: => 3", "notes").format, "txt");
    assert.equal(parseAutocorrectFile("teh,the", "LIST.CSV").format, "csv");
    assert.equal(parseAutocorrectFile("teh,the").format, "csv");
    invalid(() => parseAutocorrectFile(7, "x.txt"), /not text/);
    invalid(() => parseAutocorrectFile("a".repeat(IMPORT_MAX_BYTES + 1), "big.txt"), /too large for a text replacement list/);
    assert.doesNotThrow(() => parseAutocorrectFile(`# ${"a".repeat(IMPORT_MAX_BYTES - 2)}`, "edge.txt"));
});

test("an import is planned by the list editor's rules: new replacements, typed forms added, duplicates skipped, lines refused with the reason", () => {
    const current = list(["the", "teh"], ["then", "tehn"]);
    const rows = parseAutocorrectFile([":teh: -> the", ":hte: -> the", ":Becuase: -> because", "becasue -> because", ":tehn: -> ten", ":thne: -> thne", ":t-h: -> the", ":uber: -> über", "", ":hte: -> the", ":sig: => 5", ":si*g: -> x", ":addr => 6", ":far: => 128"].join("\n"), "in.txt").rows;
    const plan = planImport(current, rows, "add", {...US, macroNames: Object.assign([], {5: "Sign-off"})}, CEILINGS);
    assert.deepEqual(shape(plan.list), [["the", "teh", "hte"], ["then", "tehn"], ["because", "becuase", ["becasue", MATCH.ANYWHERE]], [5, "sig"]]);
    assert.deepEqual(plan.newReplacements, [{label: "because", typed: ["becuase", "*becasue*"]}, {label: "Macro “Sign-off”", typed: ["sig"]}], "what is typed is listed as it is written");
    assert.deepEqual(plan.addedTyped, [{label: "the", typed: ["hte"]}]);
    assert.equal(plan.duplicates, 2, "one the list had, one the file gives twice");
    assert.deepEqual(plan.refused, [
        {line: 5, text: "tehn → ten", reason: "“tehn” is already typed for “then”."},
        {line: 6, text: "thne → thne", reason: "“thne” is the replacement itself."},
        {line: 7, text: "t-h → the", reason: "What you type is one word: letters and digits, with an apostrophe only between them; “-” is neither."},
        {line: 8, text: "uber → über", reason: "US cannot type “ü”, so the keyboard could not type this replacement."},
        {line: 12, text: "si*g → x", reason: "“si*g” has * where it cannot go. Put * only at the start or the end, where other letters may go."},
        {line: 13, text: "addr → macro “Macro 6”", reason: "A macro plays for a whole word only: take the * out of “addr*”."},
        {line: 14, text: "far → macro 128", reason: "Choose one of the keyboard's macros."}]);
    assert.deepEqual([plan.unfit, plan.removed], [0, 0]);
    assert.deepEqual(shape(current), [["the", "teh"], ["then", "tehn"]], "the list given is left as it is");
    assert.doesNotThrow(() => encodeAutocorrectDomain(plan.list));
});

test("replacing starts from nothing, so only the file can conflict with itself; it says how many entries go", () => {
    const current = list(["the", "teh"], ["then", "tehn"]);
    const rows = parseAutocorrectFile(":tehn: -> ten\n:teh: -> the\n:teh: -> tea\n", "in.txt").rows;
    const plan = planImport(current, rows, "replace", US, CEILINGS);
    assert.deepEqual(shape(plan.list), [["ten", "tehn"], ["the", "teh"]]);
    assert.deepEqual(plan.newReplacements.map(entry => entry.label), ["ten", "the"]);
    assert.deepEqual(plan.addedTyped, []);
    assert.deepEqual(plan.refused, [{line: 3, text: "teh → tea", reason: "“teh” is already typed for “the”."}]);
    assert.equal(plan.removed, 2);
});

test("a file over what the keyboard holds says how much does not fit, by each ceiling", () => {
    const rows = rowsOf(Array.from({length: 6}, (_, index) => ({correction: `word${index}`, typos: [{typo: `wrod${index}`}, {typo: `wodr${index}`}]})));
    assert.deepEqual([planImport(list(), rows, "add", US, {...CEILINGS, maxTypos: 5}).unfit, planImport(list(), rows, "add", US, {...CEILINGS, maxCorrections: 2}).unfit], [7, 8]);
    const text = planImport(list(), rows, "add", US, {...CEILINGS, maxTextBytes: 34});
    assert.deepEqual([text.unfit, shape(text.list)], [8, [["word0", "wrod0", "wodr0"], ["word1", "wrod1", "wodr1"]]], "fifteen bytes an entry");
    // A typed form for a replacement the list has still fits when replacements are full.
    const full = planImport(list(["word0", "wrd"]), rows, "add", US, {...CEILINGS, maxCorrections: 1});
    assert.deepEqual([full.unfit, shape(full.list)], [10, [["word0", "wrd", "wrod0", "wodr0"]]]);
    // A row that would be refused anyway is refused, not counted as lacking room.
    const refused = planImport(list(["the", "teh"]), parseAutocorrectFile(":teh: -> ten\n:hte: -> the\n", "a.txt").rows, "add", US, {...CEILINGS, maxTypos: 1});
    assert.deepEqual([refused.unfit, refused.refused.length], [1, 1]);
    // A macro replacement takes a row and no text.
    const macros = planImport(list(), rowsOf([{macro: 1, typos: [{typo: "ab"}]}, {macro: 2, typos: [{typo: "cd"}]}]), "add", US, {...CEILINGS, maxTextBytes: 4});
    assert.deepEqual([macros.unfit, shape(macros.list)], [0, [[1, "ab"], [2, "cd"]]]);
});

test("a preview judges a file both ways and carries what it holds, for either choice", () => {
    const current = list(["the", "teh"]);
    const file = parseAutocorrectFile(":hte: -> the\nbecuase -> because\nbroken\n:sig: => 5\n", "in.txt");
    const preview = previewImport(current, file, US, CEILINGS);
    assert.equal(preview.format, "txt");
    assert.deepEqual(preview.entries, [{correction: "the", typos: [{typo: "hte", match: MATCH.WHOLE_WORD}]}, {correction: "because", typos: [{typo: "becuase", match: MATCH.ANYWHERE}]}, {macro: 5, typos: [{typo: "sig", match: MATCH.WHOLE_WORD}]}],
        "what the choice posts back: each typed form as the file gave it");
    assert.deepEqual({replacements: preview.add.replacements, typed: preview.add.typed, removed: preview.add.removed}, {replacements: 3, typed: 4, removed: 0});
    assert.deepEqual({replacements: preview.replace.replacements, typed: preview.replace.typed, removed: preview.replace.removed}, {replacements: 3, typed: 3, removed: 1});
    assert.deepEqual(preview.add.refused, [{line: 3, text: "broken", reason: "It has no “->” between what is typed and its replacement."}], "the file's own refusals come first");
    assert.deepEqual(preview.add.addedTyped, [{label: "the", typed: ["hte"]}]);
    // What it posts back plans to the same list.
    assert.deepEqual(shape(planImport(current, rowsOf(preview.entries), "add", US, CEILINGS).list), shape(planImport(current, file.rows, "add", US, CEILINGS).list));
});

test("exporting, then importing, gives the same list in every format that can hold it", () => {
    const value = list(["the", "teh", "hte"], ["because", "becuase", ["becasue", MATCH.START], ["beacuse", MATCH.START], ["bcause", MATCH.END]], ["thing", ["tihng", MATCH.ANYWHERE]],
        ["a lot", "alot"], ["doesn't", "dosen't", "doesnt"], ["iPhone", "iphone"], ["however, though", "howver"], ['he said "hi"', "hesaid"], ["semi; colon", "semicolon"], ["a -> b", "ab"], ["café", "cafe"],
        ["+31 6 1234 5678", "pnumber"], ["x".repeat(128), "long"]);
    const canonical = encodeAutocorrectDomain(value);
    assert.deepEqual(AUTOCORRECT_FILE_FORMATS, ["txt", "csv", "json"]);
    for (const format of AUTOCORRECT_FILE_FORMATS) {
        const text = exportAutocorrect(value, format);
        const file = parseAutocorrectFile(text, `list.${format}`);
        assert.deepEqual(file.refused, [], format);
        assert.deepEqual(encodeAutocorrectDomain(listed(file.rows)), canonical, format);
        assert.equal(parseAutocorrectFile(text).format, format, `${format} is recognised without its name`);
        assert.equal(exportAutocorrect(listed(file.rows), format), text, `${format} writes what it read`);
    }
    assert.throws(() => exportAutocorrect(value, "xml"), /text, CSV or JSON/);
    // A replacement that plays a macro goes through Ark's two formats; QMK's
    // has no way to say one, and says how many it left out.
    const played = list(["the", "teh"], [5, "sig", "sgi"], [127, "addr"]);
    for (const format of ["csv", "json"]) assert.deepEqual(encodeAutocorrectDomain(listed(parseAutocorrectFile(exportAutocorrect(played, format), `list.${format}`).rows)), encodeAutocorrectDomain(played), format);
    assert.equal(exportAutocorrect(played, "txt"), "# 2 replacements that play a macro are not in this file: this format holds text only.\n:teh: -> the\n");
    assert.equal(exportAutocorrect(list([5, "sig"]), "txt"), "# 1 replacement that plays a macro is not in this file: this format holds text only.\n");
});

test("each format is written as documented", () => {
    const value = list(["because", "becuase", "becasue", ["bcause", MATCH.END]], ["thing", ["tihng", MATCH.ANYWHERE]], ["un", ["nu", MATCH.START]], ["a, b", "ab"]);
    assert.equal(exportAutocorrect(value, "txt"), ":becuase: -> because\n:becasue: -> because\nbcause: -> because\ntihng -> thing\n:nu -> un\n:ab: -> a, b\n");
    assert.equal(exportAutocorrect(value, "csv"), 'replacement,typed\r\nbecause,becuase becasue *bcause\r\nthing,*tihng*\r\nun,nu*\r\n"a, b",ab\r\n');
    assert.deepEqual(JSON.parse(exportAutocorrect(list(["because", "becuase", ["recieve", MATCH.START]]), "json")), {version: 1, replacements: [{replacement: "because", typed: ["becuase", "recieve*"]}]});
    assert.deepEqual(JSON.parse(exportAutocorrect(list(["the", "teh"], [5, "sig"]), "json")), {version: 1, replacements: [{replacement: "the", typed: ["teh"]}, {macro: 5, typed: ["sig"]}]});
    assert.equal(exportAutocorrect(list(["the", "teh"], [5, "sig"]), "csv"), "replacement,typed,macro\r\nthe,teh,\r\n,sig,5\r\n");
    assert.equal(exportAutocorrect(list(), "txt"), "");
    assert.equal(exportAutocorrect(list(), "csv"), "replacement,typed\r\n");
});

test("the starter list is read as a file is, with nothing refused", () => {
    const file = starterFile();
    assert.equal(file.format, "starter");
    assert.deepEqual(file.refused, []);
    assert.ok(file.rows.length >= 300);
});
