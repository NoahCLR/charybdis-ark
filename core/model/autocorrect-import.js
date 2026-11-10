// @ts-check
"use strict";

// The text replacement list as files (D-L85): QMK's text format, a
// spreadsheet's CSV and Ark's own JSON, read and written here; and what a
// file would do to the list, worked out before anything changes. Every format
// can give one replacement many typed forms: lines and rows with the same
// replacement, spelled exactly alike, are one entry.
//
// Ark's own two formats write a typed form as the screen does, with `*` where
// other letters may go; QMK's writes the same thing with colons. Files Ark
// wrote before, and files written by hand, name the two parts `correction`
// and `typos` (QMK's and the firmware's words) and may give where a typed
// form matches in a `match` column or field: all of it is still read.
//
// A file is untrusted. Reading one never throws for a line it cannot take:
// the line is refused with its number and the reason, and the rest is read.
// Only a file that is not a list at all (too large, not JSON, another
// version) is refused whole.

const {AUTOCORRECT_MATCH, entryKey, isMacroSlot, playsMacro} = require("../schema/autocorrect-domain-v1");
const {addTypos, findEntry, findTypo, macroCalled, targetOf, typedForm, typedOf, typoOf} = require("./autocorrect-list");
const {AUTOCORRECT_STARTER} = require("../data/autocorrect-starter");

/**
 * @typedef {import("../schema/autocorrect-domain-v1.js").AutocorrectList} AutocorrectList
 * @typedef {import("../schema/autocorrect-domain-v1.js").Entry} Entry
 * @typedef {import("./autocorrect-list.js").Host} Host
 * @typedef {"txt" | "csv" | "json"} Format
 * @typedef {{line: number, correction?: string, macro?: number, typo: string, match?: number}} Row one typed form as a file gives it, written with its `*` or with an older file's match beside it, the text or macro slot it produces, and the line or row it is on
 * @typedef {{line: number | null, text: string, reason: string}} Refused a line a file or the list refused, and why
 * @typedef {Required<import("../schema/autocorrect-domain-v1.js").Ceilings>} Ceilings
 */

// A list of 1,024 typed forms is a few tens of kilobytes in any format; this
// leaves room for comments and a spreadsheet's quoting.
const IMPORT_MAX_BYTES = 262144;
// What a file over IMPORT_MAX_BYTES is told, wherever it is refused.
const IMPORT_TOO_LARGE = "This file is too large for a text replacement list.";
const FORMATS = /** @type {const} */ (["txt", "csv", "json"]);
const JSON_VERSION = 1;
// Where a typed form matches, as an older file's `match` says it in words.
/** @type {Readonly<Record<string, number>>} */
const MATCH_BY_WORD = Object.freeze({"whole word": 0, "whole": 0, "start": 1, "start of word": 1, "end": 2, "end of word": 2, "anywhere": 3, "anywhere in a word": 3});
const NO_SUCH_MATCH = "is not where something typed can match: use whole word, start, end or anywhere, or write it with *.";
// The columns of a spreadsheet, by the names its header may give them: Ark's
// own first, then the older ones.
const CSV_COLUMNS = /** @type {const} */ ({replacement: ["replacement", "correction"], typed: ["typed", "typos", "typo"], match: ["match"], macro: ["macro"]});
const CSV_HEADER = /** @type {const} */ (["replacement", "typed"]);

/** @param {string} message */
const invalid = message => Object.assign(new Error(message), {code: "AUTOCORRECT_IMPORT_INVALID"});
/** @param {string} text */
const quoted = text => `“${text}”`;

// The format a file is in: by its name's extension, else by what it holds.
/** @param {string} text @param {string} [name] @returns {Format} */
function formatOf(text, name = "") {
    const extension = /\.([a-z]+)$/i.exec(name)?.[1].toLowerCase();
    if (extension === "txt" || extension === "csv" || extension === "json") return extension;
    if (/^\s*[{[]/.test(text)) return "json";
    // QMK's text has an arrow on every line that is not a comment; a
    // spreadsheet may only hold one inside a replacement.
    const lines = text.replace(/^\ufeff/, "").split(/\r\n|\r|\n/).map(line => line.trim()).filter(line => line && !line.startsWith("#"));
    return lines.length > 0 && lines.every(line => line.includes("->") || line.includes("=>")) ? "txt" : "csv";
}

// QMK's autocorrect dictionary: `typo -> correction` a line, `#` comments
// and blank lines skipped. A colon before the typo is the start of a word,
// after it the end, both the whole word, neither anywhere in a word: the
// same four matches Ark writes with `*`. `:typo: => 12` plays macro slot 12,
// as the firmware's own authored list writes it.
/** @param {string} text @returns {{rows: Row[], refused: Refused[]}} */
function parseText(text) {
    /** @type {Row[]} */
    const rows = [];
    /** @type {Refused[]} */
    const refused = [];
    text.split(/\r\n|\r|\n/).forEach((raw, index) => {
        const line = index + 1, content = raw.trim();
        if (!content || content.startsWith("#")) return;
        const plays = !content.includes("->") && content.includes("=>");
        const arrow = content.indexOf(plays ? "=>" : "->");
        if (arrow < 0) { refused.push({line, text: content, reason: "It has no “->” between what is typed and its replacement."}); return; }
        const pattern = content.slice(0, arrow).trim(), correction = content.slice(arrow + 2).trim();
        const start = pattern.startsWith(":"), end = pattern.length > 1 && pattern.endsWith(":");
        const typo = pattern.slice(start ? 1 : 0, end ? -1 : undefined).trim();
        if (!typo || !correction) { refused.push({line, text: content, reason: typo ? `It has no replacement after “${plays ? "=>" : "->"}”.` : `It has nothing typed before “${plays ? "=>" : "->"}”.`}); return; }
        const match = start && end ? AUTOCORRECT_MATCH.WHOLE_WORD : start ? AUTOCORRECT_MATCH.START : end ? AUTOCORRECT_MATCH.END : AUTOCORRECT_MATCH.ANYWHERE;
        if (plays && !/^\d+$/.test(correction)) { refused.push({line, text: content, reason: "“=>” is followed by a macro's number."}); return; }
        rows.push(plays ? {line, macro: Number(correction), typo, match} : {line, correction, typo, match});
    });
    return {rows, refused};
}

// A CSV file's records (RFC 4180): fields split by `separator`, a quoted
// field holding separators, line breaks and doubled quotes. Each record
// says the line it starts on.
/** @param {string} text @param {string} separator @returns {{line: number, fields: string[]}[]} */
function csvRecords(text, separator) {
    /** @type {{line: number, fields: string[]}[]} */
    const records = [];
    let fields = /** @type {string[]} */ ([]), field = "", quotedField = false, inQuotes = false, line = 1, startLine = 1;
    const endField = () => { fields.push(quotedField ? field : field.trim()); field = ""; quotedField = false; };
    const endRecord = () => {
        endField();
        if (fields.length > 1 || fields[0] !== "") records.push({line: startLine, fields});
        fields = [];
        startLine = line + 1;
    };
    for (let index = 0; index < text.length; index++) {
        const character = text[index];
        if (inQuotes) {
            if (character === '"' && text[index + 1] === '"') { field += '"'; index++; }
            else if (character === '"') inQuotes = false;
            else { field += character; if (character === "\n") line++; }
        } else if (character === '"' && field.trim() === "") { inQuotes = true; quotedField = true; field = ""; }
        else if (character === separator) endField();
        else if (character === "\n" || character === "\r") {
            if (character === "\r" && text[index + 1] === "\n") index++;
            endRecord();
            line++;
        } else field += character;
    }
    if (field !== "" || fields.length) endRecord();
    return records;
}

// A spreadsheet's CSV, as Excel, Numbers and Google Sheets save one: columns
// `replacement,typed` under a header row that names them, in any order, with
// `macro` beside them when a row plays one; comma or semicolon between them;
// a byte order mark allowed. The typed cell may hold several typed forms
// with spaces between them, each with its own `*`. An older file's header
// says `correction`, `typos` and `match`, and one without a header row is
// read as that file's columns were: typos, correction, match.
/** @param {string} text @returns {{rows: Row[], refused: Refused[]}} */
function parseCsv(text) {
    const body = text.replace(/^﻿/, "");
    const first = body.split(/\r\n|\r|\n/).find(line => line.trim()) || "";
    const outside = first.replace(/"(?:[^"]|"")*"/g, "");
    const separator = (outside.match(/;/g) || []).length > (outside.match(/,/g) || []).length ? ";" : ",";
    const records = csvRecords(body, separator);
    /** @type {Row[]} */
    const rows = [];
    /** @type {Refused[]} */
    const refused = [];
    let columns = {typed: 0, replacement: 1, match: 2, macro: -1};
    const names = (records[0]?.fields || []).map(name => name.trim().toLowerCase());
    /** @param {keyof typeof CSV_COLUMNS} column */
    const columnOf = column => names.findIndex(name => /** @type {readonly string[]} */ (CSV_COLUMNS[column]).includes(name));
    const known = Object.values(CSV_COLUMNS).flat();
    const named = names.length >= 2 && names.every(name => /** @type {readonly string[]} */ (known).includes(name)) && new Set(names).size === names.length;
    if (named) {
        columns = {typed: columnOf("typed"), replacement: columnOf("replacement"), match: columnOf("match"), macro: columnOf("macro")};
        if (columns.typed < 0 || (columns.replacement < 0 && columns.macro < 0)) throw invalid("This spreadsheet's header row needs a “replacement” column and a “typed” column.");
    }
    const width = named ? names.length : undefined;
    /** @param {string[]} fields @param {number} column */
    const cell = (fields, column) => (column < 0 ? "" : fields[column] ?? "").trim();
    for (const {line, fields} of named ? records.slice(1) : records) {
        const shown = fields.join(separator === ";" ? "; " : ", ");
        if (fields.length < 2 || fields.length > (width ?? 3)) {
            refused.push({line, text: shown, reason: `It has ${fields.length} column${fields.length === 1 ? "" : "s"}; a row is a replacement and what is typed for it.`});
            continue;
        }
        const correction = cell(fields, columns.replacement), typos = cell(fields, columns.typed).split(/\s+/).filter(Boolean), macro = cell(fields, columns.macro);
        const word = cell(fields, columns.match).toLowerCase();
        const match = word === "" ? undefined : MATCH_BY_WORD[word];
        if (word !== "" && match === undefined) { refused.push({line, text: shown, reason: `${quoted(word)} ${NO_SUCH_MATCH}`}); continue; }
        if (macro && correction) { refused.push({line, text: shown, reason: "It has a replacement and a macro; a row has one of them."}); continue; }
        if (macro && !/^\d+$/.test(macro)) { refused.push({line, text: shown, reason: `${quoted(macro)} is not a macro's number.`}); continue; }
        if ((!correction && !macro) || !typos.length) { refused.push({line, text: shown, reason: typos.length ? "It has no replacement." : "It has nothing typed."}); continue; }
        for (const typo of typos) rows.push(macro ? {line, macro: Number(macro), typo, match} : {line, correction, typo, match});
    }
    return {rows, refused};
}

// Ark's own format, as Export writes it:
// {"version": 1, "replacements": [{"replacement": "because", "typed": ["becuase", "recieve*"]}, {"macro": 5, "typed": ["sig"]}]}
// The form Ark wrote before is still read:
// {"version": 1, "entries": [{"correction": "because", "typos": [{"typo": "becuase", "match": "whole word"}]}]}
/** @param {string} text @returns {{rows: Row[], refused: Refused[]}} */
function parseJson(text) {
    /** @type {unknown} */
    let value;
    try { value = JSON.parse(text.replace(/^﻿/, "")); } catch { throw invalid("This file is not a valid text replacement list."); }
    const file = /** @type {{version?: unknown, replacements?: unknown, entries?: unknown} | null} */ (value);
    const listed = file && typeof file === "object" && !Array.isArray(file) ? file.replacements ?? file.entries : undefined;
    if (!Array.isArray(listed)) throw invalid("This file is not a text replacement list: it has no replacements.");
    if (file?.version !== JSON_VERSION) throw invalid(`This text replacement list is in version ${typeof file?.version === "number" ? file.version : "an unknown"} of the format; this Ark reads version ${JSON_VERSION}.`);
    /** @type {Row[]} */
    const rows = [];
    /** @type {Refused[]} */
    const refused = [];
    listed.forEach((/** @type {unknown} */ raw, index) => {
        const line = index + 1, entry = /** @type {{replacement?: unknown, correction?: unknown, macro?: unknown, typed?: unknown, typos?: unknown} | null} */ (raw);
        const correction = entry?.replacement ?? entry?.correction, typed = entry?.typed ?? entry?.typos, macro = entry?.macro;
        const shown = typeof correction === "string" ? correction : macro !== undefined ? `macro ${String(macro)}` : `replacement ${line}`;
        if (!entry || !Array.isArray(typed) || (macro === undefined ? typeof correction !== "string" : correction !== undefined)) { refused.push({line, text: shown, reason: "It is not a replacement with what is typed for it."}); return; }
        if (macro !== undefined && !Number.isInteger(macro)) { refused.push({line, text: shown, reason: "Its macro is not a macro's number."}); return; }
        if (!typed.length) { refused.push({line, text: shown, reason: "It has nothing typed."}); return; }
        for (const item of typed) {
            const older = /** @type {{typo?: unknown, typed?: unknown, match?: unknown} | null} */ (typeof item === "string" ? {typo: item} : item);
            const typo = older?.typo ?? older?.typed;
            const word = older?.match === undefined ? undefined : typeof older.match === "string" ? older.match.trim().toLowerCase() : "";
            const match = word === undefined ? undefined : MATCH_BY_WORD[word];
            if (typeof typo !== "string") refused.push({line, text: shown, reason: "Something typed for it is not text."});
            else if (word !== undefined && match === undefined) refused.push({line, text: `${typo} → ${shown}`, reason: `${quoted(String(older?.match))} ${NO_SUCH_MATCH}`});
            else rows.push(macro === undefined ? {line, correction: /** @type {string} */ (correction), typo, match} : {line, macro: /** @type {number} */ (macro), typo, match});
        }
    });
    return {rows, refused};
}

// A file's typos, one a row, with the lines it could not read. `name` picks
// the format by its extension.
/** @param {unknown} text @param {string} [name] @returns {{format: Format, rows: Row[], refused: Refused[]}} */
function parseAutocorrectFile(text, name) {
    if (typeof text !== "string") throw invalid("This file is not text.");
    if (Buffer.byteLength(text) > IMPORT_MAX_BYTES) throw invalid(IMPORT_TOO_LARGE);
    const format = formatOf(text, name);
    return {format, ...(format === "txt" ? parseText(text) : format === "csv" ? parseCsv(text) : parseJson(text))};
}

/** @param {Row} row */
const namedBy = row => row.macro === undefined ? {correction: row.correction} : {macro: row.macro};
// A row as a sentence shows it: what is typed, an arrow, the replacement.
/** @param {Row} row @param {Host} host */
const shownRow = (row, host) => `${row.typo} → ${row.macro === undefined ? row.correction : isMacroSlot(row.macro) ? `macro ${quoted(macroCalled(row.macro, host))}` : `macro ${row.macro}`}`;

// Rows as entries, each replacement once with its typed forms in the order
// given, as an import posts them back: written with their `*`, with an older
// file's match beside one that has none.
/** @param {readonly Row[]} rows @returns {import("../../contracts/edits.js").AutocorrectEntryEdit[]} */
function entriesOf(rows) {
    /** @type {Map<string, import("../../contracts/edits.js").AutocorrectEntryEdit>} */
    const entries = new Map();
    for (const row of rows) {
        const key = row.macro === undefined ? `t${row.correction}` : `m${row.macro}`;
        const entry = entries.get(key) ?? {...(row.macro === undefined ? {correction: String(row.correction)} : {macro: row.macro}), typos: []};
        entries.set(key, entry);
        entry.typos.push({typo: row.typo, ...(row.match === undefined ? {} : {match: /** @type {import("../../contracts/edits.js").AutocorrectMatch} */ (row.match)})});
    }
    return [...entries.values()];
}
/** @param {readonly {correction?: string, macro?: number, typos: readonly {typo: string, match?: number}[]}[]} entries @returns {Row[]} */
const rowsOf = entries => entries.flatMap((entry, index) => entry.typos.map(typo => ({line: index + 1, ...(entry.macro === undefined ? {correction: String(entry.correction)} : {macro: entry.macro}), typo: typo.typo, match: typo.match})));

// What rows would do to a list, added to it or replacing it, by the list
// editor's own rules: `list` after it, the replacements it makes with what is
// typed for each, the typed forms it adds to replacements the list has, how
// many it skips as already there, the rows it refuses with the reason, and
// how many do not fit what the keyboard holds. The list given is left as it
// is.
/** @param {AutocorrectList} current @param {readonly Row[]} rows @param {"add" | "replace"} mode @param {Host} host @param {Ceilings} ceilings */
function planImport(current, rows, mode, host, ceilings) {
    /** @param {AutocorrectList} list @returns {AutocorrectList} */
    const copied = list => ({entries: list.entries.map(entry => ({...entry, typos: entry.typos.map(typo => ({...typo}))}))});
    /** @type {AutocorrectList} */
    const list = mode === "replace" ? {entries: []} : copied(current);
    const had = new Set(list.entries.map(entryKey));
    /** @type {Map<string, {label: string, typed: string[]}>} */
    const made = new Map(), added = new Map();
    /** @type {Refused[]} */
    const refused = [];
    let duplicates = 0, unfit = 0, typos = list.entries.reduce((total, entry) => total + entry.typos.length, 0);
    let textBytes = list.entries.reduce((total, entry) => total + Buffer.byteLength(entry.correction) + entry.typos.reduce((sum, typo) => sum + Buffer.byteLength(typo.typo), 0), 0);
    for (const row of rows) {
        try {
            const target = targetOf(namedBy(row)), typo = typoOf(row);
            const key = entryKey(target);
            const held = findTypo(list, typo.typo), entry = findEntry(list, target);
            if (held && entryKey(held.entry) === key) { duplicates++; continue; }
            // What it would take of what the keyboard holds.
            const bytes = Buffer.byteLength(typo.typo) + (entry || target.macro !== undefined ? 0 : Buffer.byteLength(target.correction));
            const fits = typos + 1 <= ceilings.maxTypos && (entry || list.entries.length + 1 <= ceilings.maxCorrections) && textBytes + bytes <= ceilings.maxTextBytes;
            // Checked all the same when it lacks room, so a row that would be refused anyway is not counted as one that only lacks room.
            addTypos(fits ? list : copied(list), target, [typo], host);
            if (!fits) { unfit++; continue; }
            typos++; textBytes += bytes;
            const group = had.has(key) ? added : made;
            const listed = group.get(key) ?? {label: target.macro === undefined ? target.correction : `Macro ${quoted(macroCalled(target.macro, host))}`, typed: []};
            group.set(key, listed);
            listed.typed.push(typedForm(typo));
        } catch (error) {
            refused.push({line: row.line, text: shownRow(row, host), reason: error instanceof Error ? error.message : String(error)});
        }
    }
    return {list, newReplacements: [...made.values()], addedTyped: [...added.values()], duplicates, refused, unfit,
        // What replacing would take away: the entries the list has now.
        removed: mode === "replace" ? current.entries.length : 0};
}

// A file read and judged against a list both ways, for the owner to choose:
// what the file holds that could be read, and what Add and Replace would
// each do with it.
/** @param {AutocorrectList} current @param {{format: Format | "starter", rows: readonly Row[], refused: readonly Refused[]}} file @param {Host} host @param {Ceilings} ceilings */
function previewImport(current, file, host, ceilings) {
    /** @param {"add" | "replace"} mode */
    const outcome = mode => {
        const {list, refused, ...plan} = planImport(current, file.rows, mode, host, ceilings);
        return {...plan, refused: [...file.refused, ...refused], replacements: list.entries.length, typed: list.entries.reduce((total, entry) => total + entry.typos.length, 0)};
    };
    return {format: file.format, entries: entriesOf(file.rows), add: outcome("add"), replace: outcome("replace")};
}

// The starter list (core/data/autocorrect-starter.js), read as a file is.
function starterFile() {
    const {rows, refused} = parseJson(JSON.stringify(AUTOCORRECT_STARTER));
    return {format: /** @type {const} */ ("starter"), rows, refused};
}

// ── writing ─────────────────────────────────────────────────────────────

/** @param {AutocorrectList} list */
const exportJson = list => `${JSON.stringify({version: JSON_VERSION, replacements: list.entries.map(entry => ({
    ...(playsMacro(entry) ? {macro: entry.macro} : {replacement: entry.correction}), typed: entry.typos.map(typedForm)}))}, null, 2)}\n`;

// QMK's form, a line a typed form. It has no way to say a macro, so a
// replacement that plays one is left out, and the file says how many were.
/** @param {AutocorrectList} list */
function exportText(list) {
    const text = list.entries.filter(entry => !playsMacro(entry)), macros = list.entries.length - text.length;
    const lines = text.flatMap(entry => entry.typos.map(typo =>
        `${typo.match === AUTOCORRECT_MATCH.WHOLE_WORD || typo.match === AUTOCORRECT_MATCH.START ? ":" : ""}${typo.typo}${typo.match === AUTOCORRECT_MATCH.WHOLE_WORD || typo.match === AUTOCORRECT_MATCH.END ? ":" : ""} -> ${entry.correction}`));
    if (macros) lines.unshift(`# ${macros} replacement${macros === 1 ? " that plays a macro is" : "s that play a macro are"} not in this file: this format holds text only.`);
    return lines.join("\n") + (lines.length ? "\n" : "");
}

/** @param {string} field */
const csvField = field => /[",;\r\n]|^\s|\s$/.test(field) ? `"${field.replaceAll('"', '""')}"` : field;
// A row a replacement, with what is typed for it, spaces between, so it
// opens in a spreadsheet one replacement a row. A list with a replacement
// that plays a macro has a third column for the macro's number.
/** @param {AutocorrectList} list */
function exportCsv(list) {
    const macros = list.entries.some(playsMacro);
    const lines = [[...CSV_HEADER, ...(macros ? ["macro"] : [])].join(",")];
    for (const entry of list.entries) lines.push([entry.correction, entry.typos.map(typedForm).join(" "), ...(macros ? [playsMacro(entry) ? String(entry.macro) : ""] : [])].map(csvField).join(","));
    return `${lines.join("\r\n")}\r\n`;
}

// A list as a file in one of the three formats.
/** @param {AutocorrectList} list @param {Format} format */
function exportAutocorrect(list, format) {
    if (!FORMATS.includes(format)) throw invalid("Choose a text, CSV or JSON file.");
    return format === "txt" ? exportText(list) : format === "csv" ? exportCsv(list) : exportJson(list);
}

module.exports = {AUTOCORRECT_FILE_FORMATS: FORMATS, IMPORT_MAX_BYTES, IMPORT_TOO_LARGE, entriesOf, exportAutocorrect, parseAutocorrectFile, planImport, previewImport, rowsOf, starterFile};
