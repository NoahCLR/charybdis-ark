// @ts-check
"use strict";

// The text replacement list as files (D-L85): QMK's text format, a
// spreadsheet's CSV and Ark's own JSON, read and written here; and what a
// file would do to the list, worked out before anything changes. Every format
// can give one replacement many inputs: lines and rows with the same
// replacement, spelled exactly alike, are one entry.
//
// Ark's own two formats write an input as the screen does, with `*` where
// other letters may go; QMK's writes the same thing with colons. Files Ark
// wrote before, and files written by hand, name the two parts `correction`
// and `typos` (QMK's and the firmware's words), or `typed` (Ark's word
// before it said input), and may give where an input matches in a `match`
// column or field: all of it is still read.
//
// A file is untrusted. Reading one never throws for a line it cannot take:
// the line is refused with its number and the reason, and the rest is read.
// Only a file that is not a list at all (too large, not JSON, another
// version) is refused whole.

const {AUTOCORRECT_DOMAIN_V1, AUTOCORRECT_MATCH, autocorrectCounts, sizeOfCounts, entryKey, isMacroSlot, playsMacro} = require("../schema/autocorrect-domain-v1");
const {addTypos, findEntry, findTypo, replacementCalled, replacementSaid, splitInputs, targetOf, inputForm, typoOf} = require("./autocorrect-list");
const {AUTOCORRECT_STARTER} = require("../data/autocorrect-starter");

/**
 * @typedef {import("../schema/autocorrect-domain-v1.js").AutocorrectList} AutocorrectList
 * @typedef {import("../schema/autocorrect-domain-v1.js").Entry} Entry
 * @typedef {import("./autocorrect-list.js").Host} Host
 * @typedef {"txt" | "csv" | "json"} Format
 * @typedef {{line: number, correction?: string, macro?: number, typo: string, match?: number}} Row one input as a file gives it, written with its `*` or with an older file's match beside it, the text or macro slot it produces, and the line or row it is on
 * @typedef {{line: number | null, text: string, reason: string}} Refused a line a file or the list refused, and why
 * @typedef {Required<import("../schema/autocorrect-domain-v1.js").Ceilings> & {capacity?: number, sharedFree?: number}} Ceilings what the keyboard holds of a list: its counts and text, the bytes of its domain (`capacity`), and the bytes the profile it is part of may still grow by (`sharedFree`)
 */

// A list of 1,024 inputs is a few tens of kilobytes in any format; this
// leaves room for comments and a spreadsheet's quoting.
const IMPORT_MAX_BYTES = 262144;
// What a file over IMPORT_MAX_BYTES is told, wherever it is refused.
const IMPORT_TOO_LARGE = "This file is too large for a text replacement list.";
const FORMATS = /** @type {const} */ (["txt", "csv", "json"]);
const JSON_VERSION = 1;
// Where an input matches, as an older file's `match` says it in words.
/** @type {Readonly<Record<string, number>>} */
const MATCH_BY_WORD = Object.freeze({"whole word": 0, "whole": 0, "start": 1, "start of word": 1, "end": 2, "end of word": 2, "anywhere": 3, "anywhere in a word": 3});
// What a `match` Ark cannot read is told. The four an older file may say are
// read; a message never names them, since an input is written with `*`.
const NO_SUCH_MATCH = "does not say where an input goes in a word. Leave it empty, and write the input with * where other letters may go.";
// A byte order mark, which a spreadsheet may write first and Ark writes for one.
const BOM = "\ufeff";
// The columns of a spreadsheet, by the names its header may give them: Ark's
// own first, then the older ones.
const CSV_COLUMNS = /** @type {const} */ ({replacement: ["replacement", "correction"], inputs: ["inputs", "input", "typed", "typos", "typo"], match: ["match"], macro: ["macro"]});
const CSV_HEADER = /** @type {const} */ (["replacement", "inputs"]);

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
    const lines = withoutBom(text).split(/\r\n|\r|\n/).map(line => line.trim()).filter(line => line && !line.startsWith("#"));
    return lines.length > 0 && lines.every(line => line.includes("->") || line.includes("=>")) ? "txt" : "csv";
}

/** @param {string} text */
const withoutBom = text => text.startsWith(BOM) ? text.slice(BOM.length) : text;

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
        if (arrow < 0) { refused.push({line, text: content, reason: "It has no “->” between the input and its replacement."}); return; }
        const pattern = content.slice(0, arrow).trim(), correction = content.slice(arrow + 2).trim();
        const start = pattern.startsWith(":"), end = pattern.length > 1 && pattern.endsWith(":");
        const typo = pattern.slice(start ? 1 : 0, end ? -1 : undefined).trim();
        if (!typo || !correction) { refused.push({line, text: content, reason: typo ? `It has no replacement after “${plays ? "=>" : "->"}”.` : `It has no input before “${plays ? "=>" : "->"}”.`}); return; }
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
// `replacement,inputs` under a header row that names them, in any order, with
// `macro` beside them when a row plays one; comma or semicolon between them;
// a byte order mark allowed. The inputs cell may hold several inputs
// with spaces between them, each with its own `*`. An older file's header
// says `typed`, or `correction`, `typos` and `match`, and one without a header row is
// read as that file's columns were: typos, correction, match. A spreadsheet
// may pad its rows with empty cells at the end: they are no columns.
/** @param {string} text @returns {{rows: Row[], refused: Refused[]}} */
function parseCsv(text) {
    const body = withoutBom(text);
    const first = body.split(/\r\n|\r|\n/).find(line => line.trim()) || "";
    const outside = first.replace(/"(?:[^"]|"")*"/g, "");
    const separator = (outside.match(/;/g) || []).length > (outside.match(/,/g) || []).length ? ";" : ",";
    const records = csvRecords(body, separator);
    /** @type {Row[]} */
    const rows = [];
    /** @type {Refused[]} */
    const refused = [];
    let columns = {inputs: 0, replacement: 1, match: 2, macro: -1};
    const names = (records[0]?.fields || []).map(name => name.trim().toLowerCase());
    while (names.length && names[names.length - 1] === "") names.pop();
    /** @param {keyof typeof CSV_COLUMNS} column */
    const columnOf = column => names.findIndex(name => /** @type {readonly string[]} */ (CSV_COLUMNS[column]).includes(name));
    const known = Object.values(CSV_COLUMNS).flat();
    const named = names.length >= 2 && names.every(name => /** @type {readonly string[]} */ (known).includes(name)) && new Set(names).size === names.length;
    if (named) {
        columns = {inputs: columnOf("inputs"), replacement: columnOf("replacement"), match: columnOf("match"), macro: columnOf("macro")};
        if (columns.inputs < 0 || (columns.replacement < 0 && columns.macro < 0)) throw invalid("This spreadsheet's header row needs a “replacement” column and an “inputs” column.");
    }
    const width = named ? names.length : undefined;
    /** @param {string[]} fields @param {number} column */
    const cell = (fields, column) => (column < 0 ? "" : fields[column] ?? "").trim();
    for (const record of named ? records.slice(1) : records) {
        const {line} = record, fields = record.fields.slice();
        while (fields.length > (width ?? 3) && fields[fields.length - 1] === "") fields.pop();
        const shown = fields.join(separator === ";" ? "; " : ", ");
        if (fields.length < 2 || fields.length > (width ?? 3)) {
            refused.push({line, text: shown, reason: `It has ${fields.length} column${fields.length === 1 ? "" : "s"}; a row is a replacement and its inputs.`});
            continue;
        }
        const correction = cell(fields, columns.replacement), typos = splitInputs(cell(fields, columns.inputs)), macro = cell(fields, columns.macro);
        const word = cell(fields, columns.match).toLowerCase();
        const match = word === "" ? undefined : MATCH_BY_WORD[word];
        if (word !== "" && match === undefined) { refused.push({line, text: shown, reason: `${quoted(word)} ${NO_SUCH_MATCH}`}); continue; }
        if (macro && correction) { refused.push({line, text: shown, reason: "It has a replacement and a macro; a row has one of them."}); continue; }
        if (macro && !/^\d+$/.test(macro)) { refused.push({line, text: shown, reason: `${quoted(macro)} is not a macro's number.`}); continue; }
        if ((!correction && !macro) || !typos.length) { refused.push({line, text: shown, reason: typos.length ? "It has no replacement." : "It has no inputs."}); continue; }
        for (const typo of typos) rows.push(macro ? {line, macro: Number(macro), typo, match} : {line, correction, typo, match});
    }
    return {rows, refused};
}

// Ark's own format, as Export writes it:
// {"version": 1, "replacements": [{"replacement": "because", "inputs": ["becuase", "recieve*"]}, {"macro": 5, "inputs": ["sig"]}]}
// The forms Ark wrote before are still read: `typed` where it now says
// `inputs`, and
// {"version": 1, "entries": [{"correction": "because", "typos": [{"typo": "becuase", "match": "whole word"}]}]}
/** @param {string} text @returns {{rows: Row[], refused: Refused[]}} */
function parseJson(text) {
    /** @type {unknown} */
    let value;
    try { value = JSON.parse(withoutBom(text)); } catch { throw invalid("This file is not a valid text replacement list."); }
    const file = /** @type {{version?: unknown, replacements?: unknown, entries?: unknown} | null} */ (value);
    const listed = file && typeof file === "object" && !Array.isArray(file) ? file.replacements ?? file.entries : undefined;
    if (!Array.isArray(listed)) throw invalid("This file is not a text replacement list: it has no replacements.");
    if (file?.version !== JSON_VERSION) throw invalid(`This text replacement list is in version ${typeof file?.version === "number" ? file.version : "an unknown"} of the format; this Ark reads version ${JSON_VERSION}.`);
    /** @type {Row[]} */
    const rows = [];
    /** @type {Refused[]} */
    const refused = [];
    listed.forEach((/** @type {unknown} */ raw, index) => {
        const line = index + 1, entry = /** @type {{replacement?: unknown, correction?: unknown, macro?: unknown, inputs?: unknown, typed?: unknown, typos?: unknown} | null} */ (raw);
        const correction = entry?.replacement ?? entry?.correction, typed = entry?.inputs ?? entry?.typed ?? entry?.typos, macro = entry?.macro;
        const shown = typeof correction === "string" ? correction : macro !== undefined ? `macro ${String(macro)}` : `replacement ${line}`;
        if (!entry || !Array.isArray(typed) || (macro === undefined ? typeof correction !== "string" : correction !== undefined)) { refused.push({line, text: shown, reason: "It is not a replacement with its inputs."}); return; }
        if (macro !== undefined && !Number.isInteger(macro)) { refused.push({line, text: shown, reason: "Its macro is not a macro's number."}); return; }
        if (!typed.length) { refused.push({line, text: shown, reason: "It has no inputs."}); return; }
        for (const item of typed) {
            const older = /** @type {{typo?: unknown, typed?: unknown, match?: unknown} | null} */ (typeof item === "string" ? {typo: item} : item);
            const typo = older?.typo ?? older?.typed;
            const word = older?.match === undefined ? undefined : typeof older.match === "string" ? older.match.trim().toLowerCase() : "";
            const match = word === undefined ? undefined : MATCH_BY_WORD[word];
            if (typeof typo !== "string") refused.push({line, text: shown, reason: "One of its inputs is not text."});
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
// A row as a refused line shows it: the input, an arrow, the replacement as
// it is named everywhere, or the number a file gave for a macro there is none of.
/** @param {Row} row @param {Host} host */
const shownRow = (row, host) => `${row.typo} → ${row.macro !== undefined && !isMacroSlot(row.macro) ? `macro ${row.macro}` : row.macro !== undefined ? replacementSaid(row, host.macroNames) : replacementCalled(row, host.macroNames)}`;

// Rows as entries, each replacement once with its inputs in the order
// given, as an import posts them back: written with their `*`, with an older
// file's match beside one that has none.
/** @param {readonly Row[]} rows @returns {import("../../contracts/edits.js").AutocorrectEntryEdit[]} */
function entriesOf(rows) {
    /** @type {Map<string, import("../../contracts/edits.js").AutocorrectEntryEdit>} */
    const entries = new Map();
    for (const row of rows) {
        const key = entryKey(row);
        const entry = entries.get(key) ?? {...(row.macro === undefined ? {correction: String(row.correction)} : {macro: row.macro}), typos: []};
        entries.set(key, entry);
        entry.typos.push({typo: row.typo, ...(row.match === undefined ? {} : {match: /** @type {import("../../contracts/edits.js").AutocorrectMatch} */ (row.match)})});
    }
    return [...entries.values()];
}
/** @param {readonly {correction?: string, macro?: number, typos: readonly {typo: string, match?: number}[]}[]} entries @returns {Row[]} */
const rowsOf = entries => entries.flatMap((entry, index) => entry.typos.map(typo => ({line: index + 1, ...(entry.macro === undefined ? {correction: String(entry.correction)} : {macro: entry.macro}), typo: typo.typo, match: typo.match})));

// What rows would do to a list, added to it or replacing it, by the list
// editor's own rules: `list` after it, the replacements it makes with the
// inputs of each, the inputs it adds to replacements the list has, how
// many it skips as already there, the rows it refuses with the reason, and
// how many do not fit what the keyboard holds, with what stopped the first
// of them. Fitting is judged by everything an edit is refused for: the counts,
// the text, the domain's own bytes and the room left in the profile. The list
// given is left as it is.
/** @param {AutocorrectList} current @param {readonly Row[]} rows @param {"add" | "replace"} mode @param {Host} host @param {Ceilings} ceilings */
function planImport(current, rows, mode, host, ceilings) {
    /** @param {AutocorrectList} list @returns {AutocorrectList} */
    const copied = list => ({entries: list.entries.map(entry => ({...entry, typos: entry.typos.map(typo => ({...typo}))}))});
    /** @type {AutocorrectList} */
    const list = mode === "replace" ? {entries: []} : copied(current);
    const had = new Set(list.entries.map(entryKey));
    /** @type {Map<string, {label: string, inputs: string[]}>} */
    const made = new Map(), added = new Map();
    /** @type {Refused[]} */
    const refused = [];
    let duplicates = 0, unfit = 0, unfitWhy = "";
    const counts = autocorrectCounts(list), {ROW_SIZE, PART_ROW_SIZE} = AUTOCORRECT_DOMAIN_V1;
    // The profile grows by what the list grows past the one it holds now.
    const capacity = ceilings.capacity ?? AUTOCORRECT_DOMAIN_V1.MAX_SIZE, mostBytes = Math.min(capacity, sizeOfCounts(autocorrectCounts(current)) + (ceilings.sharedFree ?? Infinity));
    let size = sizeOfCounts(counts);
    for (const row of rows) {
        try {
            const target = targetOf(namedBy(row)), typo = typoOf(row);
            const key = entryKey(target);
            const held = findTypo(list, typo.typo), entry = findEntry(list, target);
            if (held && entryKey(held.entry) === key) { duplicates++; continue; }
            // What it would take of what the keyboard holds, and the first
            // ceiling it would pass, in the words an edit past it is told.
            const text = Buffer.byteLength(typo.typo) + (entry || target.macro !== undefined ? 0 : Buffer.byteLength(target.correction));
            const bytes = text + ROW_SIZE * (entry ? 1 : 2) + (typo.match === AUTOCORRECT_MATCH.WHOLE_WORD ? 0 : PART_ROW_SIZE);
            const full = counts.typos + 1 > ceilings.maxTypos ? `the keyboard holds ${ceilings.maxTypos.toLocaleString("en-US")} inputs`
                : !entry && counts.corrections + 1 > ceilings.maxCorrections ? `the keyboard holds ${ceilings.maxCorrections.toLocaleString("en-US")} replacements`
                : counts.textBytes + text > ceilings.maxTextBytes ? `the list holds ${ceilings.maxTextBytes.toLocaleString("en-US")} bytes of text`
                : size + bytes > capacity ? "text replacement memory is full"
                : size + bytes > mostBytes ? "the keyboard's profile is full" : "";
            // Checked all the same when it lacks room, so a row that would be refused anyway is not counted as one that only lacks room.
            addTypos(full ? copied(list) : list, target, [typo], host);
            if (full) { unfit++; unfitWhy ||= full; continue; }
            counts.typos++; counts.textBytes += text; size += bytes;
            if (!entry) counts.corrections++;
            const group = had.has(key) ? added : made;
            const listed = group.get(key) ?? {label: replacementCalled(target, host.macroNames), ...(target.macro === undefined ? {} : {macro: true}), inputs: []};
            group.set(key, listed);
            listed.inputs.push(inputForm(typo));
        } catch (error) {
            refused.push({line: row.line, text: shownRow(row, host), reason: error instanceof Error ? error.message : String(error)});
        }
    }
    return {list, newReplacements: [...made.values()], addedInputs: [...added.values()], duplicates, refused, unfit, unfitWhy,
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
        // The file's refusals and the list's, in the file's order.
        const lines = [...file.refused, ...refused].map((row, at) => ({row, at})).sort((a, b) => (a.row.line ?? Infinity) - (b.row.line ?? Infinity) || a.at - b.at).map(({row}) => row);
        return {...plan, refused: lines, replacements: list.entries.length, inputs: autocorrectCounts(list).typos};
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
    ...(playsMacro(entry) ? {macro: entry.macro} : {replacement: entry.correction}), inputs: entry.typos.map(inputForm)}))}, null, 2)}\n`;

// QMK's form, a line an input. It has no way to say a macro, so a
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
// A row a replacement, with its inputs, spaces between, so it
// opens in a spreadsheet one replacement a row. A list with a replacement
// that plays a macro has a third column for the macro's number. It starts
// with a byte order mark: without one Excel on Windows reads the file in the
// system's own code page and mangles every accent; Numbers, Google Sheets and
// Ark's own reader take it either way.
/** @param {AutocorrectList} list */
function exportCsv(list) {
    const macros = list.entries.some(playsMacro);
    const lines = [[...CSV_HEADER, ...(macros ? ["macro"] : [])].join(",")];
    for (const entry of list.entries) lines.push([entry.correction, entry.typos.map(inputForm).join(" "), ...(macros ? [playsMacro(entry) ? String(entry.macro) : ""] : [])].map(csvField).join(","));
    return `${BOM}${lines.join("\r\n")}\r\n`;
}

// A list as a file in one of the three formats.
/** @param {AutocorrectList} list @param {Format} format */
function exportAutocorrect(list, format) {
    if (!FORMATS.includes(format)) throw invalid("Choose a text, CSV or JSON file.");
    return format === "txt" ? exportText(list) : format === "csv" ? exportCsv(list) : exportJson(list);
}

module.exports = {AUTOCORRECT_FILE_FORMATS: FORMATS, IMPORT_MAX_BYTES, IMPORT_TOO_LARGE, entriesOf, exportAutocorrect, parseAutocorrectFile, planImport, previewImport, rowsOf, starterFile};
