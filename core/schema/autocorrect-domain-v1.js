// @ts-check
"use strict";
const {copyBytes, protocolError} = require("./bytes");
const {AUTOCORRECT_APOSTROPHE, foldWordCharacter} = require("../data/autocorrect-words");

// Autocorrect list domain 0x80, version 1 (firmware
// profile-wire-v1/autocorrect-domain.md): the typos the keyboard corrects and
// what each becomes. An entry is one correction, stored once, with every typo
// that becomes it; each typo says where it matches a word.
//
// Little-endian: a header [corrections u16, typos u16, part-of-word typos
// u16, text bytes u16]; a six-byte row per correction [text offset u16,
// length u8, zero, first typo u16]; a six-byte row per typo [text offset u16,
// length u8, match u8, correction u16]; the part index, one u16 typo index
// per typo whose match is not the whole word; then the text, every
// correction's bytes and then every typo's, in row order, back to back.
//
// One list has one encoding: corrections and typos each ascend strictly by
// their UTF-8 bytes, so neither is stored twice and a typo names one
// correction. A typo holds folded word characters only, with an apostrophe
// allowed between two of them. The decoder refuses what the firmware's
// validator refuses, by the same reason, table and row; the encoder writes
// the canonical order whatever order the entries are given in.
const AUTOCORRECT_DOMAIN_V1 = Object.freeze({
    VERSION: 1,
    MAX_CORRECTIONS: 1024,
    MAX_TYPOS: 1024,
    TEXT_MAX: 32,
    MAX_TEXT_BYTES: 20480,
    MAX_SIZE: 34824,
    HEADER_SIZE: 8,
    ROW_SIZE: 6,
    PART_ROW_SIZE: 2,
});
// Where a typo matches a word, as the typo row stores it.
const AUTOCORRECT_MATCH = Object.freeze({WHOLE_WORD: 0, START: 1, END: 2, ANYWHERE: 3});
// The table a refusal names, as the firmware numbers them.
const TABLE = Object.freeze({CORRECTIONS: 0, TYPOS: 1, PART_INDEX: 2});

const AutocorrectDomainError = protocolError("AutocorrectDomainError", "ark");
/** @typedef {{correction: string, typos: {typo: string, match: number}[]}} Entry */
/** @typedef {{entries: Entry[]}} AutocorrectList */
/** @typedef {{maxCorrections?: number, maxTypos?: number, maxTextBytes?: number}} Ceilings */

/** @param {string} code @param {string} message @param {number} [table] @param {number} [row] */
const refuse = (code, message, table, row) => new AutocorrectDomainError(code, message, {...(table === undefined ? {} : {table}), ...(row === undefined ? {} : {row})});

// One canonical UTF-8 character from `bytes` at `index`: its scalar and size,
// or null for an overlong form, a surrogate, a value past U+10FFFF, a control
// character, or one cut off by `end`.
/** @param {Uint8Array} bytes @param {number} index @param {number} end */
function utf8Character(bytes, index, end) {
    const lead = bytes[index];
    const size = lead < 0x80 ? 1 : lead >= 0xc2 && lead <= 0xdf ? 2 : lead >= 0xe0 && lead <= 0xef ? 3 : lead >= 0xf0 && lead <= 0xf4 ? 4 : 0;
    if (!size || index + size > end) return null;
    let value = size === 1 ? lead : lead & (size === 2 ? 0x1f : size === 3 ? 0x0f : 0x07);
    for (let i = 1; i < size; i += 1) {
        if ((bytes[index + i] & 0xc0) !== 0x80) return null;
        value = (value << 6) | (bytes[index + i] & 0x3f);
    }
    if (value < 0x20 || (value >= 0x7f && value < 0xa0) || (size === 3 && value < 0x800) || (size === 4 && value < 0x10000) || (value >= 0xd800 && value <= 0xdfff) || value > 0x10ffff) return null;
    return {value, size};
}

// Why these bytes cannot be a correction's text, or a typo's: the firmware's
// reason, or null. A correction is any canonical text without control
// characters; a typo is folded word characters, an apostrophe only between
// two of them.
/** @param {Uint8Array} bytes @param {boolean} typo @returns {"INVALID_TEXT" | "NOT_A_WORD" | "NOT_FOLDED" | null} */
function textReason(bytes, typo) {
    for (let index = 0; index < bytes.length;) {
        const character = utf8Character(bytes, index, bytes.length);
        if (!character) return "INVALID_TEXT";
        const text = String.fromCodePoint(character.value);
        if (typo && !(text === AUTOCORRECT_APOSTROPHE && index !== 0 && index + character.size !== bytes.length)) {
            const folded = foldWordCharacter(text);
            if (folded === undefined) return "NOT_A_WORD";
            if (folded !== text) return "NOT_FOLDED";
        }
        index += character.size;
    }
    return null;
}

const REASONS = Object.freeze({
    INVALID_TEXT_LENGTH: `is empty or longer than ${AUTOCORRECT_DOMAIN_V1.TEXT_MAX} bytes`,
    INVALID_TEXT: "is not text the keyboard stores",
    NOT_A_WORD: "holds a character that is not a letter or digit a keyboard layout types, or an apostrophe first or last",
    NOT_FOLDED: "holds a capital letter",
});

/** @param {string} text @param {boolean} typo @returns {{code: keyof typeof REASONS, reason: string} | null} */
function textProblem(text, typo) {
    // A lone surrogate has no UTF-8 form; Buffer would write U+FFFD for it.
    if (typeof text !== "string" || /\p{Cs}/u.test(text)) return {code: "INVALID_TEXT", reason: REASONS.INVALID_TEXT};
    const bytes = Buffer.from(text, "utf8");
    const code = bytes.length === 0 || bytes.length > AUTOCORRECT_DOMAIN_V1.TEXT_MAX ? "INVALID_TEXT_LENGTH" : textReason(bytes, typo);
    return code ? {code, reason: REASONS[code]} : null;
}
// Why this text cannot be stored as a typo, or as a correction: the
// firmware's reason code and its words, or null when it can.
/** @param {string} typo */
const typoProblem = typo => textProblem(typo, true);
/** @param {string} correction */
const correctionProblem = correction => textProblem(correction, false);

// A typo as it is stored: each word character folded with the firmware's
// table, apostrophes kept. Undefined when it holds anything else.
/** @param {string} text @returns {string | undefined} */
function foldTypo(text) {
    let folded = "";
    for (const character of String(text)) {
        const fold = character === AUTOCORRECT_APOSTROPHE ? character : foldWordCharacter(character);
        if (fold === undefined) return undefined;
        folded += fold;
    }
    return folded;
}

// The canonical domain's size for this list.
/** @param {AutocorrectList} list */
function autocorrectDomainSize(list) {
    let typos = 0, parts = 0, text = 0;
    for (const entry of list.entries) {
        text += Buffer.byteLength(entry.correction, "utf8");
        for (const typo of entry.typos) {typos += 1; parts += typo.match === AUTOCORRECT_MATCH.WHOLE_WORD ? 0 : 1; text += Buffer.byteLength(typo.typo, "utf8");}
    }
    return AUTOCORRECT_DOMAIN_V1.HEADER_SIZE + AUTOCORRECT_DOMAIN_V1.ROW_SIZE * (list.entries.length + typos) + AUTOCORRECT_DOMAIN_V1.PART_ROW_SIZE * parts + text;
}

/** @param {AutocorrectList} list @param {Ceilings} [ceilings] @returns {Buffer} */
function encodeAutocorrectDomain(list, {maxCorrections = AUTOCORRECT_DOMAIN_V1.MAX_CORRECTIONS, maxTypos = AUTOCORRECT_DOMAIN_V1.MAX_TYPOS, maxTextBytes = AUTOCORRECT_DOMAIN_V1.MAX_TEXT_BYTES} = {}) {
    if (!list || !Array.isArray(list.entries)) throw refuse("INVALID_LIST", "An autocorrect list is its entries.");
    /** @param {string} limit @param {number} count @param {number} most @param {string} what */
    const full = (limit, count, most, what) => new AutocorrectDomainError("CAPACITY_EXCEEDED", `The autocorrect list has ${count} ${what}; the keyboard holds ${most}.`, {limit, most, count});
    const corrections = list.entries.map((entry, index) => {
        const problem = correctionProblem(entry?.correction);
        if (problem) throw refuse(problem.code, `Correction ${index} ${problem.reason}.`, TABLE.CORRECTIONS, index);
        if (!Array.isArray(entry.typos) || !entry.typos.length) throw refuse("FIRST_TYPO", `The correction “${entry.correction}” has no typo.`, TABLE.CORRECTIONS, index);
        return {bytes: Buffer.from(entry.correction, "utf8"), entry};
    }).sort((a, b) => Buffer.compare(a.bytes, b.bytes));
    if (corrections.length > maxCorrections) throw full("autocorrectCorrections", corrections.length, maxCorrections, "corrections");
    const typos = corrections.flatMap(({bytes: correction, entry}, correctionIndex) => entry.typos.map(typo => {
        const problem = typoProblem(typo?.typo);
        if (problem) throw refuse(problem.code, `A typo of “${entry.correction}” ${problem.reason}.`, TABLE.TYPOS);
        if (!Number.isInteger(typo.match) || typo.match < AUTOCORRECT_MATCH.WHOLE_WORD || typo.match > AUTOCORRECT_MATCH.ANYWHERE) throw refuse("INVALID_MATCH", `The typo “${typo.typo}” has no such match.`, TABLE.TYPOS);
        const bytes = Buffer.from(typo.typo, "utf8");
        if (bytes.equals(correction)) throw refuse("TYPO_IS_CORRECTION", `The typo “${typo.typo}” is its own correction.`, TABLE.TYPOS);
        return {bytes, match: typo.match, correction: correctionIndex};
    })).sort((a, b) => Buffer.compare(a.bytes, b.bytes));
    if (typos.length > maxTypos) throw full("autocorrectTypos", typos.length, maxTypos, "typos");
    corrections.forEach((row, index) => {if (index && row.bytes.equals(corrections[index - 1].bytes)) throw refuse("ORDER", `The correction “${row.entry.correction}” is in the list twice.`, TABLE.CORRECTIONS, index);});
    typos.forEach((row, index) => {if (index && row.bytes.equals(typos[index - 1].bytes)) throw refuse("ORDER", `The typo “${row.bytes.toString("utf8")}” is in the list twice.`, TABLE.TYPOS, index);});
    const textBytes = corrections.reduce((total, row) => total + row.bytes.length, 0) + typos.reduce((total, row) => total + row.bytes.length, 0);
    if (textBytes > maxTextBytes) throw full("autocorrectText", textBytes, maxTextBytes, "bytes of text");
    const parts = typos.flatMap((row, index) => row.match === AUTOCORRECT_MATCH.WHOLE_WORD ? [] : [index]);
    const {HEADER_SIZE, ROW_SIZE, PART_ROW_SIZE} = AUTOCORRECT_DOMAIN_V1;
    const output = Buffer.alloc(HEADER_SIZE + ROW_SIZE * (corrections.length + typos.length) + PART_ROW_SIZE * parts.length + textBytes);
    output.writeUInt16LE(corrections.length, 0); output.writeUInt16LE(typos.length, 2); output.writeUInt16LE(parts.length, 4); output.writeUInt16LE(textBytes, 6);
    const firstTypo = new Map();
    typos.forEach((row, index) => {if (!firstTypo.has(row.correction)) firstTypo.set(row.correction, index);});
    const textArea = output.length - textBytes;
    let at = HEADER_SIZE, text = 0;
    corrections.forEach((row, index) => {
        output.writeUInt16LE(text, at); output[at + 2] = row.bytes.length; output.writeUInt16LE(firstTypo.get(index), at + 4);
        row.bytes.copy(output, textArea + text); text += row.bytes.length; at += ROW_SIZE;
    });
    for (const row of typos) {
        output.writeUInt16LE(text, at); output[at + 2] = row.bytes.length; output[at + 3] = row.match; output.writeUInt16LE(row.correction, at + 4);
        row.bytes.copy(output, textArea + text); text += row.bytes.length; at += ROW_SIZE;
    }
    for (const index of parts) {output.writeUInt16LE(index, at); at += PART_ROW_SIZE;}
    return output;
}

// The list, each correction with its typos, in the stored order. The walk
// and its refusals are the firmware validator's, in its order.
/** @param {Uint8Array} value @returns {AutocorrectList} */
function decodeAutocorrectDomain(value) {
    const bytes = copyBytes(value, "Autocorrect domain");
    const {HEADER_SIZE, ROW_SIZE, PART_ROW_SIZE, TEXT_MAX} = AUTOCORRECT_DOMAIN_V1;
    if (bytes.length < HEADER_SIZE) throw refuse("INVALID_LENGTH", `The autocorrect domain is ${bytes.length} bytes, shorter than its header.`);
    const corrections = bytes.readUInt16LE(0), typos = bytes.readUInt16LE(2), partTypos = bytes.readUInt16LE(4), textBytes = bytes.readUInt16LE(6);
    if (corrections > AUTOCORRECT_DOMAIN_V1.MAX_CORRECTIONS || typos > AUTOCORRECT_DOMAIN_V1.MAX_TYPOS || partTypos > typos || textBytes > AUTOCORRECT_DOMAIN_V1.MAX_TEXT_BYTES) throw refuse("CAPACITY_EXCEEDED", "The autocorrect domain counts more than version 1 holds.");
    const typoRows = HEADER_SIZE + ROW_SIZE * corrections, partIndex = typoRows + ROW_SIZE * typos, textArea = partIndex + PART_ROW_SIZE * partTypos;
    if (textArea + textBytes !== bytes.length) throw refuse("INVALID_LENGTH", "The autocorrect domain is not the length its header counts.");
    if (typos && !corrections) throw refuse("INVALID_REFERENCE", "The autocorrect domain has typos and no corrections.");
    let textOffset = 0;
    /** @type {Buffer | null} */
    let previous = null;
    // A row's text: where the one before it ended, above it, and well formed.
    /** @param {number} rowAt @param {number} table @param {number} row @param {() => void} checkRow */
    const takeText = (rowAt, table, row, checkRow) => {
        const length = bytes[rowAt + 2];
        if (length === 0 || length > TEXT_MAX) throw refuse("INVALID_TEXT_LENGTH", `Row ${row} has a text of ${length} bytes.`, table, row);
        if (bytes.readUInt16LE(rowAt) !== textOffset || length > textBytes - textOffset) throw refuse("INVALID_OFFSET", `Row ${row}'s text does not begin where the one before it ended.`, table, row);
        checkRow();
        const text = bytes.subarray(textArea + textOffset, textArea + textOffset + length);
        // The firmware compares a text with the row before it as it reads,
        // so one out of order is refused as that before its characters are judged.
        if (previous && Buffer.compare(text, previous) <= 0) throw refuse("ORDER", `Row ${row} is not above the row before it.`, table, row);
        const reason = textReason(text, table === TABLE.TYPOS);
        if (reason) throw refuse(reason, `Row ${row}'s text ${REASONS[reason]}.`, table, row);
        textOffset += length;
        previous = text;
        return text;
    };
    /** @type {{text: Buffer, typos: {typo: string, match: number}[]}[]} */
    const entries = [];
    for (let row = 0; row < corrections; row += 1) {
        const rowAt = HEADER_SIZE + ROW_SIZE * row;
        const firstTypo = bytes.readUInt16LE(rowAt + 4);
        const text = takeText(rowAt, TABLE.CORRECTIONS, row, () => {
            if (bytes[rowAt + 3] !== 0) throw refuse("RESERVED", `Correction ${row}'s reserved byte is not zero.`, TABLE.CORRECTIONS, row);
            if (firstTypo >= typos) throw refuse("INVALID_REFERENCE", `Correction ${row}'s first typo is past the typos.`, TABLE.CORRECTIONS, row);
        });
        if (bytes.readUInt16LE(typoRows + ROW_SIZE * firstTypo + 4) !== row) throw refuse("FIRST_TYPO", `Correction ${row}'s first typo does not name it.`, TABLE.CORRECTIONS, row);
        entries.push({text, typos: []});
    }
    previous = null;
    let part = 0;
    for (let row = 0; row < typos; row += 1) {
        const rowAt = typoRows + ROW_SIZE * row;
        const match = bytes[rowAt + 3], correction = bytes.readUInt16LE(rowAt + 4);
        const text = takeText(rowAt, TABLE.TYPOS, row, () => {
            if (match > AUTOCORRECT_MATCH.ANYWHERE) throw refuse("INVALID_MATCH", `Typo ${row} has match ${match}.`, TABLE.TYPOS, row);
            if (correction >= corrections) throw refuse("INVALID_REFERENCE", `Typo ${row} names a correction past the corrections.`, TABLE.TYPOS, row);
        });
        if (bytes.readUInt16LE(HEADER_SIZE + ROW_SIZE * correction + 4) > row) throw refuse("FIRST_TYPO", `Typo ${row} names a correction whose first typo comes later.`, TABLE.TYPOS, row);
        if (text.equals(entries[correction].text)) throw refuse("TYPO_IS_CORRECTION", `Typo ${row} equals its correction.`, TABLE.TYPOS, row);
        if (match !== AUTOCORRECT_MATCH.WHOLE_WORD) {
            if (part >= partTypos || bytes.readUInt16LE(partIndex + PART_ROW_SIZE * part) !== row) throw refuse("PART_INDEX", `The part index leaves out typo ${row}.`, TABLE.TYPOS, row);
            part += 1;
        }
        entries[correction].typos.push({typo: text.toString("utf8"), match});
    }
    if (part !== partTypos) throw refuse("PART_INDEX", `Part index row ${part} names no part-of-word typo.`, TABLE.PART_INDEX, part);
    if (textOffset !== textBytes) throw refuse("INVALID_LENGTH", "The autocorrect domain's text holds bytes no row names.");
    return {entries: entries.map(entry => ({correction: entry.text.toString("utf8"), typos: entry.typos}))};
}

module.exports = {AUTOCORRECT_DOMAIN_V1, AUTOCORRECT_MATCH, AutocorrectDomainError, autocorrectDomainSize, correctionProblem, decodeAutocorrectDomain, encodeAutocorrectDomain, foldTypo, typoProblem};
