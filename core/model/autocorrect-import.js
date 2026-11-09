// @ts-check
"use strict";

// The autocorrect list as files (D-L85): QMK's text format, a spreadsheet's
// CSV and Ark's own JSON, read and written here; and what a file would do to
// the list, worked out before anything changes. Every format can give one
// correction many typos: lines and rows with the same correction, spelled
// exactly alike, are one entry.
//
// A file is untrusted. Reading one never throws for a line it cannot take:
// the line is refused with its number and the reason, and the rest is read.
// Only a file that is not a list at all (too large, not JSON, another
// version) is refused whole.

const {AUTOCORRECT_MATCH} = require("../schema/autocorrect-domain-v1");
const {addTypos, correctionOf, findEntry, findTypo, typoOf} = require("./autocorrect-list");
const {AUTOCORRECT_STARTER} = require("../data/autocorrect-starter");

/**
 * @typedef {import("../schema/autocorrect-domain-v1.js").AutocorrectList} AutocorrectList
 * @typedef {import("../schema/autocorrect-domain-v1.js").Entry} Entry
 * @typedef {import("./autocorrect-list.js").Host} Host
 * @typedef {"txt" | "csv" | "json"} Format
 * @typedef {{line: number, correction: string, typo: string, match: number}} Row one typo as a file gives it, with the line or row it is on
 * @typedef {{line: number | null, text: string, reason: string}} Refused a line a file or the list refused, and why
 * @typedef {Required<import("../schema/autocorrect-domain-v1.js").Ceilings>} Ceilings
 */

// A list of 1,024 typos is a few tens of kilobytes in any format; this
// leaves room for comments and a spreadsheet's quoting.
const IMPORT_MAX_BYTES = 262144;
// What a file over IMPORT_MAX_BYTES is told, wherever it is refused.
const IMPORT_TOO_LARGE = "This file is too large for an autocorrect list.";
const FORMATS = /** @type {const} */ (["txt", "csv", "json"]);
const JSON_VERSION = 1;
// Where a typo matches, as each format writes it. CSV and JSON use words; a
// file may also say them the long way, as the screen does.
const MATCH_WORDS = /** @type {const} */ (["whole word", "start", "end", "anywhere"]);
/** @type {Readonly<Record<string, number>>} */
const MATCH_BY_WORD = Object.freeze({"whole word": 0, "whole": 0, "start": 1, "start of word": 1, "end": 2, "end of word": 2, "anywhere": 3, "anywhere in a word": 3});
const CSV_HEADER = /** @type {const} */ (["correction", "typos", "match"]);

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
    // spreadsheet may only hold one inside a correction.
    const lines = text.replace(/^\ufeff/, "").split(/\r\n|\r|\n/).map(line => line.trim()).filter(line => line && !line.startsWith("#"));
    return lines.length > 0 && lines.every(line => line.includes("->")) ? "txt" : "csv";
}

// QMK's autocorrect dictionary: `typo -> correction` a line, `#` comments
// and blank lines skipped. A colon before the typo is the start of a word,
// after it the end, both the whole word, neither anywhere in a word.
/** @param {string} text @returns {{rows: Row[], refused: Refused[]}} */
function parseText(text) {
    /** @type {Row[]} */
    const rows = [];
    /** @type {Refused[]} */
    const refused = [];
    text.split(/\r\n|\r|\n/).forEach((raw, index) => {
        const line = index + 1, content = raw.trim();
        if (!content || content.startsWith("#")) return;
        const arrow = content.indexOf("->");
        if (arrow < 0) { refused.push({line, text: content, reason: "It has no “->” between a typo and its correction."}); return; }
        const pattern = content.slice(0, arrow).trim(), correction = content.slice(arrow + 2).trim();
        const start = pattern.startsWith(":"), end = pattern.length > 1 && pattern.endsWith(":");
        const typo = pattern.slice(start ? 1 : 0, end ? -1 : undefined).trim();
        if (!typo || !correction) { refused.push({line, text: content, reason: typo ? "It has no correction after “->”." : "It has no typo before “->”."}); return; }
        rows.push({line, correction, typo, match: start && end ? AUTOCORRECT_MATCH.WHOLE_WORD : start ? AUTOCORRECT_MATCH.START : end ? AUTOCORRECT_MATCH.END : AUTOCORRECT_MATCH.ANYWHERE});
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

// A spreadsheet's CSV, as Excel, Numbers and Google Sheets save one:
// columns `typos,correction[,match]`, or any order under a header row that
// names them; comma or semicolon between them; a byte order mark allowed.
// The typos cell may hold several typos with spaces between them, and the
// row's match is each one's.
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
    // A header row names its columns; without one they are typos,
    // correction, match.
    let columns = {typos: 0, correction: 1, match: 2};
    const names = (records[0]?.fields || []).map(name => name.trim().toLowerCase());
    const named = names.length >= 2 && names.every(name => ["typo", "typos", "correction", "match"].includes(name)) && new Set(names).size === names.length;
    if (named) {
        const typos = names.findIndex(name => name === "typo" || name === "typos"), correction = names.indexOf("correction");
        if (typos < 0 || correction < 0) throw invalid("This spreadsheet's header row needs a “typos” column and a “correction” column.");
        columns = {typos, correction, match: names.indexOf("match")};
    }
    const width = named ? names.length : undefined;
    for (const {line, fields} of named ? records.slice(1) : records) {
        const shown = fields.join(separator === ";" ? "; " : ", ");
        if (fields.length < 2 || fields.length > (width ?? 3) || (width !== undefined && fields.length < Math.max(columns.typos, columns.correction) + 1)) {
            refused.push({line, text: shown, reason: `It has ${fields.length} column${fields.length === 1 ? "" : "s"}; a row is its typos, its correction and, if you like, where they match.`});
            continue;
        }
        const correction = (fields[columns.correction] ?? "").trim(), typos = (fields[columns.typos] ?? "").trim().split(/\s+/).filter(Boolean);
        const word = (columns.match < 0 ? "" : fields[columns.match] ?? "").trim().toLowerCase();
        const match = word === "" ? AUTOCORRECT_MATCH.WHOLE_WORD : MATCH_BY_WORD[word];
        if (match === undefined) { refused.push({line, text: shown, reason: `${quoted(word)} is not where a typo can match: use whole word, start, end or anywhere.`}); continue; }
        if (!correction || !typos.length) { refused.push({line, text: shown, reason: correction ? "It has no typo." : "It has no correction."}); continue; }
        for (const typo of typos) rows.push({line, correction, typo, match});
    }
    return {rows, refused};
}

// Ark's own format, as Export writes it:
// {"version": 1, "entries": [{"correction": "because", "typos": [{"typo": "becuase", "match": "whole word"}]}]}
/** @param {string} text @returns {{rows: Row[], refused: Refused[]}} */
function parseJson(text) {
    /** @type {unknown} */
    let value;
    try { value = JSON.parse(text.replace(/^﻿/, "")); } catch { throw invalid("This file is not a valid autocorrect list."); }
    const file = /** @type {{version?: unknown, entries?: unknown} | null} */ (value);
    if (!file || typeof file !== "object" || Array.isArray(file) || !Array.isArray(file.entries)) throw invalid("This file is not an autocorrect list: it has no entries.");
    if (file.version !== JSON_VERSION) throw invalid(`This autocorrect list is in version ${typeof file.version === "number" ? file.version : "an unknown"} of the format; this Ark reads version ${JSON_VERSION}.`);
    /** @type {Row[]} */
    const rows = [];
    /** @type {Refused[]} */
    const refused = [];
    file.entries.forEach((/** @type {unknown} */ raw, index) => {
        const line = index + 1, entry = /** @type {{correction?: unknown, typos?: unknown} | null} */ (raw);
        const shown = typeof entry?.correction === "string" ? entry.correction : `entry ${line}`;
        if (!entry || typeof entry.correction !== "string" || !Array.isArray(entry.typos)) { refused.push({line, text: shown, reason: "It is not a correction with its typos."}); return; }
        if (!entry.typos.length) { refused.push({line, text: shown, reason: "It has no typo."}); return; }
        for (const item of entry.typos) {
            const typo = /** @type {{typo?: unknown, match?: unknown} | null} */ (item);
            const word = typo?.match === undefined ? "whole word" : typeof typo.match === "string" ? typo.match.trim().toLowerCase() : "";
            const match = MATCH_BY_WORD[word];
            if (!typo || typeof typo.typo !== "string") refused.push({line, text: shown, reason: "One of its typos is not text."});
            else if (match === undefined) refused.push({line, text: `${typo.typo} → ${shown}`, reason: `${quoted(String(typo.match))} is not where a typo can match: use whole word, start, end or anywhere.`});
            else rows.push({line, correction: entry.correction, typo: typo.typo, match});
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

// Rows as entries, each correction once with its typos in the order given.
/** @param {readonly Row[]} rows @returns {Entry[]} */
function entriesOf(rows) {
    /** @type {Map<string, Entry>} */
    const entries = new Map();
    for (const row of rows) {
        const entry = entries.get(row.correction) ?? {correction: row.correction, typos: []};
        entries.set(row.correction, entry);
        entry.typos.push({typo: row.typo, match: row.match});
    }
    return [...entries.values()];
}
/** @param {readonly {correction: string, typos: readonly {typo: string, match?: number}[]}[]} entries @returns {Row[]} */
const rowsOf = entries => entries.flatMap((entry, index) => entry.typos.map(typo => ({line: index + 1, correction: entry.correction, typo: typo.typo, match: typo.match ?? AUTOCORRECT_MATCH.WHOLE_WORD})));

// What rows would do to a list, added to it or replacing it, by the list
// editor's own rules: `list` after it, the corrections it makes with their
// typos, the typos it adds to corrections the list has, how many it skips as
// already there, the rows it refuses with the reason, and how many do not
// fit what the keyboard holds. The list given is left as it is.
/** @param {AutocorrectList} current @param {readonly Row[]} rows @param {"add" | "replace"} mode @param {Host} host @param {Ceilings} ceilings */
function planImport(current, rows, mode, host, ceilings) {
    /** @type {AutocorrectList} */
    const list = mode === "replace" ? {entries: []} : {entries: current.entries.map(entry => ({correction: entry.correction, typos: entry.typos.map(typo => ({...typo}))}))};
    const had = new Set(list.entries.map(entry => entry.correction));
    /** @type {Map<string, string[]>} */
    const made = new Map(), added = new Map();
    /** @type {Refused[]} */
    const refused = [];
    let duplicates = 0, unfit = 0, typos = list.entries.reduce((total, entry) => total + entry.typos.length, 0);
    let textBytes = list.entries.reduce((total, entry) => total + Buffer.byteLength(entry.correction) + entry.typos.reduce((sum, typo) => sum + Buffer.byteLength(typo.typo), 0), 0);
    for (const row of rows) {
        const shown = `${row.typo} → ${row.correction}`;
        try {
            const correction = correctionOf(row.correction), typo = typoOf(row.typo);
            const held = findTypo(list, typo), entry = findEntry(list, correction);
            if (held && held.entry.correction === correction) { duplicates++; continue; }
            if (held) throw new Error(`${quoted(typo)} already corrects to ${quoted(held.entry.correction)}.`);
            // What it would take of what the keyboard holds.
            const bytes = Buffer.byteLength(typo) + (entry ? 0 : Buffer.byteLength(correction));
            if (typos + 1 > ceilings.maxTypos || (!entry && list.entries.length + 1 > ceilings.maxCorrections) || textBytes + bytes > ceilings.maxTextBytes) {
                // Checked all the same, so a row that would be refused anyway is not counted as one that only lacks room.
                addTypos({entries: list.entries.map(other => ({...other, typos: [...other.typos]}))}, correction, [{typo, match: row.match}], host);
                unfit++;
                continue;
            }
            addTypos(list, correction, [{typo, match: row.match}], host);
            typos++; textBytes += bytes;
            const group = had.has(correction) ? added : made;
            group.set(correction, [...(group.get(correction) || []), typo]);
        } catch (error) {
            refused.push({line: row.line, text: shown, reason: error instanceof Error ? error.message : String(error)});
        }
    }
    /** @param {Map<string, string[]>} group */
    const listed = group => [...group].map(([correction, typos]) => ({correction, typos}));
    return {list, newCorrections: listed(made), addedTypos: listed(added), duplicates, refused, unfit,
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
        return {...plan, refused: [...file.refused, ...refused], corrections: list.entries.length, typos: list.entries.reduce((total, entry) => total + entry.typos.length, 0)};
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
const exportJson = list => `${JSON.stringify({version: JSON_VERSION, entries: list.entries.map(entry => ({correction: entry.correction,
    typos: entry.typos.map(typo => ({typo: typo.typo, match: MATCH_WORDS[typo.match]}))}))}, null, 2)}\n`;

// QMK's form, a line a typo.
/** @param {AutocorrectList} list */
const exportText = list => list.entries.flatMap(entry => entry.typos.map(typo =>
    `${typo.match === AUTOCORRECT_MATCH.WHOLE_WORD || typo.match === AUTOCORRECT_MATCH.START ? ":" : ""}${typo.typo}${typo.match === AUTOCORRECT_MATCH.WHOLE_WORD || typo.match === AUTOCORRECT_MATCH.END ? ":" : ""} -> ${entry.correction}`)).join("\n") + (list.entries.length ? "\n" : "");

/** @param {string} field */
const csvField = field => /[",;\r\n]|^\s|\s$/.test(field) ? `"${field.replaceAll('"', '""')}"` : field;
// A row a correction and match, that correction's typos with spaces between
// them, so it opens in a spreadsheet one word a row.
/** @param {AutocorrectList} list */
function exportCsv(list) {
    const lines = [CSV_HEADER.join(",")];
    for (const entry of list.entries) for (const [match, word] of MATCH_WORDS.entries()) {
        const typos = entry.typos.filter(typo => typo.match === match).map(typo => typo.typo);
        if (typos.length) lines.push([entry.correction, typos.join(" "), word].map(csvField).join(","));
    }
    return `${lines.join("\r\n")}\r\n`;
}

// A list as a file in one of the three formats.
/** @param {AutocorrectList} list @param {Format} format */
function exportAutocorrect(list, format) {
    if (!FORMATS.includes(format)) throw invalid("Choose a text, CSV or JSON file.");
    return format === "txt" ? exportText(list) : format === "csv" ? exportCsv(list) : exportJson(list);
}

module.exports = {AUTOCORRECT_FILE_FORMATS: FORMATS, AUTOCORRECT_MATCH_WORDS: MATCH_WORDS, IMPORT_MAX_BYTES, IMPORT_TOO_LARGE, JSON_VERSION, entriesOf, exportAutocorrect, parseAutocorrectFile, planImport, previewImport, rowsOf, starterFile};
