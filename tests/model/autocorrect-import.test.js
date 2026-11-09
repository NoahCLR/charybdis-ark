"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const {AUTOCORRECT_FILE_FORMATS, AUTOCORRECT_MATCH_WORDS, IMPORT_MAX_BYTES, entriesOf, exportAutocorrect, parseAutocorrectFile, planImport, previewImport, rowsOf, starterFile} = require("../../core/model/autocorrect-import");
const {AUTOCORRECT_MATCH: MATCH, encodeAutocorrectDomain} = require("../../core/schema/autocorrect-domain-v1");
const {US_HOST_LAYOUT} = require("../../core/data/host-layouts");

const US = {layout: US_HOST_LAYOUT, layoutName: "US"};
const CEILINGS = {maxCorrections: 1024, maxTypos: 1024, maxTextBytes: 20480};
const list = (...entries) => ({entries: entries.map(([correction, ...typos]) => ({correction, typos: typos.map(typo => typeof typo === "string" ? {typo, match: MATCH.WHOLE_WORD} : {typo: typo[0], match: typo[1]})}))});
const shape = value => value.entries.map(entry => [entry.correction, ...entry.typos.map(typo => typo.match ? [typo.typo, typo.match] : typo.typo)]);
const read = (text, name) => { const file = parseAutocorrectFile(text, name); return {format: file.format, entries: shape({entries: entriesOf(file.rows)}), refused: file.refused}; };
const invalid = (fn, pattern) => assert.throws(fn, error => error.code === "AUTOCORRECT_IMPORT_INVALID" && pattern.test(error.message), String(pattern));

test("QMK's text format: colons say where a typo matches, comments and blank lines are skipped, one correction's lines are one entry", () => {
    const file = read(["# my typos", "", ":teh: -> the", "  :hte:   ->   the  ", "tihng -> thing", ":nu -> un", "mnet: -> ment", "alot -> a lot", ":becuase: -> because", "   # indented comment"].join("\n"), "list.txt");
    assert.equal(file.format, "txt");
    assert.deepEqual(file.entries, [["the", "teh", "hte"], ["thing", ["tihng", MATCH.ANYWHERE]], ["un", ["nu", MATCH.START]], ["ment", ["mnet", MATCH.END]], ["a lot", ["alot", MATCH.ANYWHERE]], ["because", "becuase"]]);
    assert.deepEqual(file.refused, []);
    assert.deepEqual(read(":teh: -> the\r\n:hte: -> the\r\n", "windows.txt").entries, [["the", "teh", "hte"]], "CRLF line ends");
    assert.deepEqual(read("x -> a -> b", "arrow.txt").entries, [["a -> b", ["x", MATCH.ANYWHERE]]], "the first arrow divides the line");
});

test("QMK's text format refuses a line by its number, and reads the rest", () => {
    const file = read([":teh: -> the", "no arrow here", " -> the", ":: -> the", "teh ->", ":hte: -> the"].join("\n"), "list.txt");
    assert.deepEqual(file.entries, [["the", "teh", "hte"]]);
    assert.deepEqual(file.refused, [
        {line: 2, text: "no arrow here", reason: "It has no “->” between a typo and its correction."},
        {line: 3, text: "-> the", reason: "It has no typo before “->”."},
        {line: 4, text: ":: -> the", reason: "It has no typo before “->”."},
        {line: 5, text: "teh ->", reason: "It has no correction after “->”."}]);
});

test("a spreadsheet's CSV: typos, correction and match; several typos in a cell; an empty or missing match is the whole word", () => {
    const file = read(["becuase becasue beacuse,because", "tihng,thing,anywhere", "nu,un,start", "mnet,ment,END", "teh,the,", "hte , the , whole word", "tehn,then,Start of word"].join("\n"), "list.csv");
    assert.equal(file.format, "csv");
    assert.deepEqual(file.entries, [["because", "becuase", "becasue", "beacuse"], ["thing", ["tihng", MATCH.ANYWHERE]], ["un", ["nu", MATCH.START]], ["ment", ["mnet", MATCH.END]], ["the", "teh", "hte"], ["then", ["tehn", MATCH.START]]]);
    assert.deepEqual(file.refused, []);
    // The row's match is each of its typos'.
    assert.deepEqual(read("becuase becasue,because,end", "a.csv").entries, [["because", ["becuase", MATCH.END], ["becasue", MATCH.END]]]);
});

test("CSV as Excel, Numbers and Google Sheets save it: a header in any column order, semicolons, quoted fields, a BOM, CRLF", () => {
    assert.deepEqual(read("correction,typos,match\r\nbecause,becuase becasue,whole word\r\nthing,tihng,anywhere\r\n", "sheets.csv").entries, [["because", "becuase", "becasue"], ["thing", ["tihng", MATCH.ANYWHERE]]]);
    assert.deepEqual(read("Match;Typo;Correction\nstart;nu;un\n;teh;the\n", "numbers.csv").entries, [["un", ["nu", MATCH.START]], ["the", "teh"]], "any column order, a singular name, semicolons");
    assert.deepEqual(read("﻿typos;correction\r\nbecuase;because\r\n", "excel-nl.csv").entries, [["because", "becuase"]], "a byte order mark and no match column");
    assert.deepEqual(read('typos,correction\nhowver,"however, though"\nsaid,"he said ""hi"""\n"alot",a lot\n', "quoted.csv").entries,
        [["however, though", "howver"], ['he said "hi"', "said"], ["a lot", "alot"]], "a quoted field keeps its commas and doubled quotes");
    assert.deepEqual(read("typos;correction\nteh;the\n\n\nhte;the\n", "blank.csv").entries, [["the", "teh", "hte"]], "blank rows are skipped");
    assert.deepEqual(read("teh;the;whole word\n", "plain.csv").entries, [["the", "teh"]], "no header, semicolons");
    assert.deepEqual(read('teh,"two\nlines"\nhte,the\n', "multi.csv").refused, [], "a quoted line break stays in its field");
    assert.equal(parseAutocorrectFile('teh,"two\nlines"\nhte,the\n', "multi.csv").rows[1].line, 3, "and the next row keeps its own line number");
});

test("CSV refuses a row by its number: too few or too many columns, an unknown match, an empty cell", () => {
    const file = read(["typos,correction,match", "teh,the,whole word", "justone", "a,b,c,d", "nu,un,sometimes", ",the,start", "hte,,end", "tehn,then,"].join("\n"), "bad.csv");
    assert.deepEqual(file.entries, [["the", "teh"], ["then", "tehn"]]);
    assert.deepEqual(file.refused.map(({line, reason}) => [line, reason]), [
        [3, "It has 1 column; a row is its typos, its correction and, if you like, where they match."],
        [4, "It has 4 columns; a row is its typos, its correction and, if you like, where they match."],
        [5, "“sometimes” is not where a typo can match: use whole word, start, end or anywhere."],
        [6, "It has no typo."],
        [7, "It has no correction."]]);
    assert.deepEqual(read("typos,correction\nteh,the,start\n", "wide.csv").refused.map(({line}) => line), [2], "more columns than the header names");
    invalid(() => parseAutocorrectFile("correction,match\nthe,start\n", "no-typos.csv"), /needs a “typos” column and a “correction” column/);
});

test("Ark's JSON: the exported shape, read back; another version or shape is refused whole, a bad entry by its number", () => {
    const text = JSON.stringify({version: 1, entries: [{correction: "because", typos: [{typo: "becuase", match: "whole word"}, {typo: "becasue"}]}, {correction: "thing", typos: [{typo: "tihng", match: "anywhere"}]}]});
    assert.deepEqual(read(text, "list.json"), {format: "json", entries: [["because", "becuase", "becasue"], ["thing", ["tihng", MATCH.ANYWHERE]]], refused: []});
    invalid(() => parseAutocorrectFile("{not json", "list.json"), /not a valid autocorrect list/);
    invalid(() => parseAutocorrectFile("[]", "list.json"), /it has no entries/);
    invalid(() => parseAutocorrectFile('{"version": 1}', "list.json"), /it has no entries/);
    invalid(() => parseAutocorrectFile('{"version": 2, "entries": []}', "list.json"), /version 2 of the format; this Ark reads version 1/);
    invalid(() => parseAutocorrectFile('{"entries": []}', "list.json"), /an unknown of the format|version an unknown/);
    const bad = read(JSON.stringify({version: 1, entries: [{correction: "the", typos: [{typo: "teh"}]}, {correction: 7, typos: []}, {correction: "then", typos: []}, {correction: "un", typos: [{typo: "nu", match: "sometimes"}, {typo: 4}]}, "x"]}), "bad.json");
    assert.deepEqual(bad.entries, [["the", "teh"]]);
    assert.deepEqual(bad.refused.map(({line, reason}) => [line, reason]), [[2, "It is not a correction with its typos."], [3, "It has no typo."],
        [4, "“sometimes” is not where a typo can match: use whole word, start, end or anywhere."], [4, "One of its typos is not text."], [5, "It is not a correction with its typos."]]);
});

test("a file's format is its name's extension, else what it holds; one that is no list is refused whole", () => {
    assert.equal(parseAutocorrectFile('{"version": 1, "entries": []}', "pasted").format, "json");
    assert.equal(parseAutocorrectFile(":teh: -> the", "notes").format, "txt");
    assert.equal(parseAutocorrectFile("teh,the", "LIST.CSV").format, "csv");
    assert.equal(parseAutocorrectFile("teh,the").format, "csv");
    invalid(() => parseAutocorrectFile(7, "x.txt"), /not text/);
    invalid(() => parseAutocorrectFile("a".repeat(IMPORT_MAX_BYTES + 1), "big.txt"), /too large for an autocorrect list/);
    assert.doesNotThrow(() => parseAutocorrectFile(`# ${"a".repeat(IMPORT_MAX_BYTES - 2)}`, "edge.txt"));
});

test("an import is planned by the list editor's rules: new corrections, typos added, duplicates skipped, lines refused with the reason", () => {
    const current = list(["the", "teh"], ["then", "tehn"]);
    const rows = parseAutocorrectFile([":teh: -> the", ":hte: -> the", ":Becuase: -> because", ":becasue: -> because", ":tehn: -> ten", ":thne: -> thne", ":t-h: -> the", ":uber: -> über", "", ":hte: -> the"].join("\n"), "in.txt").rows;
    const plan = planImport(current, rows, "add", US, CEILINGS);
    assert.deepEqual(shape(plan.list), [["the", "teh", "hte"], ["then", "tehn"], ["because", "becuase", "becasue"]]);
    assert.deepEqual(plan.newCorrections, [{correction: "because", typos: ["becuase", "becasue"]}]);
    assert.deepEqual(plan.addedTypos, [{correction: "the", typos: ["hte"]}]);
    assert.equal(plan.duplicates, 2, "one the list had, one the file gives twice");
    assert.deepEqual(plan.refused, [
        {line: 5, text: "tehn → ten", reason: "“tehn” already corrects to “then”."},
        {line: 6, text: "thne → thne", reason: "“thne” is the correction itself."},
        {line: 7, text: "t-h → the", reason: "A typo is letters and digits, with an apostrophe only between them; “-” is neither."},
        {line: 8, text: "uber → über", reason: "US cannot type “ü”, so the keyboard could not type this correction."}]);
    assert.deepEqual([plan.unfit, plan.removed], [0, 0]);
    assert.deepEqual(shape(current), [["the", "teh"], ["then", "tehn"]], "the list given is left as it is");
    assert.doesNotThrow(() => encodeAutocorrectDomain(plan.list));
});

test("replacing starts from nothing, so only the file can conflict with itself; it says how many entries go", () => {
    const current = list(["the", "teh"], ["then", "tehn"]);
    const rows = parseAutocorrectFile(":tehn: -> ten\n:teh: -> the\n:teh: -> tea\n", "in.txt").rows;
    const plan = planImport(current, rows, "replace", US, CEILINGS);
    assert.deepEqual(shape(plan.list), [["ten", "tehn"], ["the", "teh"]]);
    assert.deepEqual(plan.newCorrections.map(entry => entry.correction), ["ten", "the"]);
    assert.deepEqual(plan.addedTypos, []);
    assert.deepEqual(plan.refused, [{line: 3, text: "teh → tea", reason: "“teh” already corrects to “the”."}]);
    assert.equal(plan.removed, 2);
});

test("a file over what the keyboard holds says how much does not fit, by each ceiling", () => {
    const rows = rowsOf(Array.from({length: 6}, (_, index) => ({correction: `word${index}`, typos: [{typo: `wrod${index}`}, {typo: `wodr${index}`}]})));
    assert.deepEqual([planImport(list(), rows, "add", US, {...CEILINGS, maxTypos: 5}).unfit, planImport(list(), rows, "add", US, {...CEILINGS, maxCorrections: 2}).unfit], [7, 8]);
    const text = planImport(list(), rows, "add", US, {...CEILINGS, maxTextBytes: 34});
    assert.deepEqual([text.unfit, shape(text.list)], [8, [["word0", "wrod0", "wodr0"], ["word1", "wrod1", "wodr1"]]], "fifteen bytes an entry");
    // A typo for a correction the list has still fits when corrections are full.
    const full = planImport(list(["word0", "wrd"]), rows, "add", US, {...CEILINGS, maxCorrections: 1});
    assert.deepEqual([full.unfit, shape(full.list)], [10, [["word0", "wrd", "wrod0", "wodr0"]]]);
    // A row that would be refused anyway is refused, not counted as lacking room.
    const refused = planImport(list(["the", "teh"]), parseAutocorrectFile(":teh: -> ten\n:hte: -> the\n", "a.txt").rows, "add", US, {...CEILINGS, maxTypos: 1});
    assert.deepEqual([refused.unfit, refused.refused.length], [1, 1]);
});

test("a preview judges a file both ways and carries what it holds, for either choice", () => {
    const current = list(["the", "teh"]);
    const file = parseAutocorrectFile(":hte: -> the\n:becuase: -> because\nbroken\n", "in.txt");
    const preview = previewImport(current, file, US, CEILINGS);
    assert.equal(preview.format, "txt");
    assert.deepEqual(shape({entries: preview.entries}), [["the", "hte"], ["because", "becuase"]]);
    assert.deepEqual({corrections: preview.add.corrections, typos: preview.add.typos, removed: preview.add.removed}, {corrections: 2, typos: 3, removed: 0});
    assert.deepEqual({corrections: preview.replace.corrections, typos: preview.replace.typos, removed: preview.replace.removed}, {corrections: 2, typos: 2, removed: 1});
    assert.deepEqual(preview.add.refused, [{line: 3, text: "broken", reason: "It has no “->” between a typo and its correction."}], "the file's own refusals come first");
    assert.deepEqual(preview.add.addedTypos, [{correction: "the", typos: ["hte"]}]);
});

test("exporting, then importing, gives the same list in every format", () => {
    const value = list(["the", "teh", "hte"], ["because", "becuase", ["becasue", MATCH.START], ["beacuse", MATCH.START], ["bcause", MATCH.END]], ["thing", ["tihng", MATCH.ANYWHERE]],
        ["a lot", "alot"], ["doesn't", "dosen't", "doesnt"], ["iPhone", "iphone"], ["however, though", "howver"], ['he said "hi"', "hesaid"], ["semi; colon", "semicolon"], ["a -> b", "ab"], ["café", "cafe"]);
    const canonical = encodeAutocorrectDomain(value);
    assert.deepEqual(AUTOCORRECT_FILE_FORMATS, ["txt", "csv", "json"]);
    for (const format of AUTOCORRECT_FILE_FORMATS) {
        const text = exportAutocorrect(value, format);
        const file = parseAutocorrectFile(text, `list.${format}`);
        assert.deepEqual(file.refused, [], format);
        assert.deepEqual(encodeAutocorrectDomain({entries: entriesOf(file.rows)}), canonical, format);
        assert.equal(parseAutocorrectFile(text).format, format, `${format} is recognised without its name`);
        assert.equal(exportAutocorrect({entries: entriesOf(file.rows)}, format), text, `${format} writes what it read`);
    }
    assert.throws(() => exportAutocorrect(value, "xml"), /text, CSV or JSON/);
});

test("each format is written as documented", () => {
    const value = list(["because", "becuase", "becasue", ["bcause", MATCH.END]], ["thing", ["tihng", MATCH.ANYWHERE]], ["un", ["nu", MATCH.START]], ["a, b", "ab"]);
    assert.deepEqual(AUTOCORRECT_MATCH_WORDS, ["whole word", "start", "end", "anywhere"]);
    assert.equal(exportAutocorrect(value, "txt"), ":becuase: -> because\n:becasue: -> because\nbcause: -> because\ntihng -> thing\n:nu -> un\n:ab: -> a, b\n");
    assert.equal(exportAutocorrect(value, "csv"), 'correction,typos,match\r\nbecause,becuase becasue,whole word\r\nbecause,bcause,end\r\nthing,tihng,anywhere\r\nun,nu,start\r\n"a, b",ab,whole word\r\n');
    assert.deepEqual(JSON.parse(exportAutocorrect(list(["because", "becuase"]), "json")), {version: 1, entries: [{correction: "because", typos: [{typo: "becuase", match: "whole word"}]}]});
    assert.equal(exportAutocorrect(list(), "txt"), "");
    assert.equal(exportAutocorrect(list(), "csv"), "correction,typos,match\r\n");
});

test("the starter list is read as a file is, with nothing refused", () => {
    const file = starterFile();
    assert.equal(file.format, "starter");
    assert.deepEqual(file.refused, []);
    assert.ok(file.rows.length >= 300);
});
