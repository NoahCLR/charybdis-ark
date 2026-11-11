// @ts-check
"use strict";
const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict");
const {execFileSync} = require("node:child_process");
const {AUTOCORRECT_DOMAIN_V1, AUTOCORRECT_MATCH, encodeAutocorrectDomain, decodeAutocorrectDomain, foldTypo} = require("../../core/schema/autocorrect-domain-v1");
const probe = process.argv[2], dir = process.argv[3], firmware = process.argv[4];
// The selected firmware's own vectors, which may be newer than Ark's pin.
const fixture = JSON.parse(fs.readFileSync(path.join(firmware, "tests/fixtures/autocorrect_domain_v1.json"), "utf8"));

// The validator's reason numbers, as its field ids (autocorrect-domain.md).
const REASONS = ["OK", "INVALID_ARGUMENT", "READ_ERROR", "INVALID_LENGTH", "CAPACITY_EXCEEDED", "INVALID_OFFSET", "INVALID_TEXT_LENGTH", "INVALID_KIND", "INVALID_TEXT",
    "ORDER", "INVALID_MATCH", "INVALID_REFERENCE", "FIRST_TYPO", "NOT_A_WORD", "NOT_FOLDED", "TYPO_IS_CORRECTION", "PART_INDEX", "INVALID_MACRO"];

let runs = 0;
// What the firmware makes of these bytes: its refusal, or the list as its
// lookups read it. The domain sits past 64 KiB of a larger read, as it does
// in a whole profile.
/** @param {Buffer} bytes */
function firmwareReads(bytes) {
    const file = path.join(dir, "input.bin"), offset = runs++ % 2 ? 70000 : 65500;
    fs.writeFileSync(file, Buffer.concat([Buffer.alloc(offset, 0xa5), bytes]));
    const lines = execFileSync(probe, [file, String(offset), String(bytes.length)], {encoding: "utf8"}).trim().split("\n");
    if (lines[0] !== "valid") {
        const [, code, table, row] = lines[0].split(" ").map(Number);
        return {error: {code: REASONS[code], table: table === 255 ? null : table, row: row === 65535 ? null : row}};
    }
    const parts = /** @type {string} */ (lines.at(-1)).split(" ").slice(1).map(Number);
    return {parts, typos: lines.slice(1, -1).map(line => {
        // A macro correction is `m` and its slot; a text one its bytes.
        const [typo, match, correction] = line.split(" ");
        return {typo: Buffer.from(typo, "hex").toString("utf8"), match: Number(match), ...(correction.startsWith("m") ? {macro: Number(correction.slice(1))} : {correction: Buffer.from(correction, "hex").toString("utf8")})};
    })};
}
// The same of Ark's decoder.
/** @param {Buffer} bytes */
function arkReads(bytes) {
    let list;
    try {list = decodeAutocorrectDomain(bytes);} catch (error) {
        const refusal = /** @type {{code: string, table?: number, row?: number}} */ (error);
        return {error: {code: refusal.code, table: refusal.table ?? null, row: refusal.row ?? null}};
    }
    const typos = list.entries.flatMap(entry => entry.typos.map(typo => ({...typo, ...(entry.macro === undefined ? {correction: entry.correction} : {macro: entry.macro})})))
        .sort((a, b) => Buffer.compare(Buffer.from(a.typo), Buffer.from(b.typo)));
    return {typos, parts: typos.flatMap((typo, row) => typo.match === AUTOCORRECT_MATCH.WHOLE_WORD ? [] : [row])};
}
/** @param {Buffer} bytes @param {string} label */
function agree(bytes, label) {
    const c = firmwareReads(bytes), js = arkReads(bytes);
    assert.deepEqual(js, c, label);
    // What both accept, Ark writes back byte for byte.
    if (!c.error) assert.deepEqual(encodeAutocorrectDomain(decodeAutocorrectDomain(bytes)), bytes, label);
    return c;
}

const match = /** @param {string} word */ word => fixture.matches.indexOf(word);
/** @param {{correction?: string, macro?: number, typos: {typo: string, match: string}[]}[]} entries */
const listOf = entries => ({entries: entries.map(entry => ({correction: entry.correction ?? "", ...(entry.macro === undefined ? {} : {macro: entry.macro}), typos: entry.typos.map(typo => ({typo: typo.typo, match: match(typo.match)}))}))});

// The firmware's vectors: Ark encodes each valid one to its bytes, and both
// sides judge every one alike, refusals by reason, table and row.
for (const vector of fixture.valid) {
    const bytes = Buffer.from(vector.hex, "hex");
    assert.deepEqual(encodeAutocorrectDomain(listOf(vector.entries)), bytes, vector.name);
    assert.equal(agree(bytes, vector.name).error, undefined, vector.name);
}
for (const vector of fixture.invalid) assert.deepEqual(agree(Buffer.from(vector.hex, "hex"), vector.name).error, vector.error, vector.name);

// Lists Ark writes: every match, text outside ASCII, a typo folded by Ark,
// a correction of 128 bytes, macro corrections at both ends of the slots, and
// a list at every ceiling at once.
const folded = /** @type {string} */ (foldTypo("ÉCOLE"));
const mixed = encodeAutocorrectDomain({entries: [
    {correction: "École", typos: [{typo: folded, match: 0}, {typo: "ecole", match: 1}]},
    {correction: "a lot", typos: [{typo: "alot", match: 0}]},
    {correction: "don't", typos: [{typo: "dont", match: 2}, {typo: "do'nt", match: 3}]},
    {correction: "Z", typos: [{typo: "zz", match: 0}]},
    {correction: `+31 6 1234 5678 | ${"é".repeat(54)}!!`, typos: [{typo: "pnumber", match: 0}]},
    {correction: "", macro: 127, typos: [{typo: "sig", match: 0}]},
    {correction: "", macro: 0, typos: [{typo: "addr", match: 0}, {typo: "adres", match: 0}]},
]});
const read = agree(mixed, "mixed");
assert.deepEqual(read.typos?.map(typo => typo.typo), ["addr", "adres", "alot", "do'nt", "dont", "ecole", "pnumber", "sig", "zz", "école"], "in byte order, as stored");
assert.deepEqual(read.typos?.filter(typo => "macro" in typo).map(typo => [typo.typo, typo.macro]), [["addr", 0], ["adres", 0], ["sig", 127]], "the firmware reads each macro correction's slot");
assert.equal(Buffer.byteLength(/** @type {{correction: string}} */ (read.typos?.find(typo => typo.typo === "pnumber")).correction), AUTOCORRECT_DOMAIN_V1.CORRECTION_MAX, "and a correction at its full length");
// What Ark's encoder refuses of a macro correction, the firmware refuses of the same bytes.
/** @param {(bytes: Buffer) => void} change @param {string} code @param {string} label */
const macroRefused = (change, code, label) => {
    const bytes = encodeAutocorrectDomain({entries: [{correction: "the", typos: [{typo: "teh", match: 0}]}, {correction: "", macro: 5, typos: [{typo: "sig", match: 0}]}]});
    change(bytes);
    assert.equal(agree(bytes, label).error?.code, code, label);
};
// Rows: the header's 8 bytes, the text correction's row at 8, the macro's at 14, then the typos' at 20 and 26.
macroRefused(bytes => bytes.writeUInt16LE(AUTOCORRECT_DOMAIN_V1.MACRO_SLOTS, 14), "INVALID_MACRO", "a macro slot past the slots");
macroRefused(bytes => {bytes[17] = 2;}, "INVALID_KIND", "a kind that is neither");
macroRefused(bytes => {bytes[16] = 1;}, "INVALID_TEXT_LENGTH", "a macro with a text length");
macroRefused(bytes => {bytes[23] = 1;}, "INVALID_MATCH", "a macro's typo matched at the start of a word");
const {MAX_CORRECTIONS, MAX_TYPOS, MAX_TEXT_BYTES, MAX_SIZE} = AUTOCORRECT_DOMAIN_V1;
const text = MAX_TEXT_BYTES / (MAX_CORRECTIONS + MAX_TYPOS);
/** @param {string} lead @param {number} index */
const word = (lead, index) => lead + String(index).padStart(4, "0").replace(/\d/g, digit => "abcdefghij"[Number(digit)]) + "x".repeat(text - 5);
const maximum = encodeAutocorrectDomain({entries: Array.from({length: MAX_CORRECTIONS}, (_, index) => ({correction: word("c", index), typos: [{typo: word("t", index), match: 3}]}))});
assert.equal(maximum.length, MAX_SIZE, "a list at every ceiling is the domain's ceiling");
assert.equal(agree(maximum, "maximum").typos?.length, MAX_TYPOS);
for (const [label, grow] of /** @type {[string, (bytes: Buffer) => void][]} */ ([["one correction more", bytes => bytes.writeUInt16LE(MAX_CORRECTIONS + 1, 0)],
    ["one typo more", bytes => bytes.writeUInt16LE(MAX_TYPOS + 1, 2)], ["one text byte more", bytes => bytes.writeUInt16LE(MAX_TEXT_BYTES + 1, 6)]])) {
    const over = Buffer.from(maximum); grow(over);
    assert.equal(agree(over, label).error?.code, "CAPACITY_EXCEEDED", label);
}

// Every byte of a small list changed three ways: the two sides refuse the
// same changes for the same reason at the same row, and read the rest alike.
const small = Buffer.from(fixture.valid.find(/** @param {{name: string}} vector */ vector => vector.name === "small").hex, "hex");
let accepted = 0, refused = 0;
for (let at = 0; at < small.length; at++) {
    for (const value of new Set([0, 0xff, (small[at] + 1) & 0xff])) {
        if (value === small[at]) continue;
        const bytes = Buffer.from(small); bytes[at] = value;
        if (agree(bytes, `small byte ${at} = ${value}`).error) refused++; else accepted++;
    }
}
assert.ok(accepted > 0 && refused > 0);
// Cut short and run long.
for (const length of [0, 7, 8, small.length - 1]) agree(small.subarray(0, length), `small cut to ${length}`);
agree(Buffer.concat([small, Buffer.from([0])]), "small with a byte after it");

console.log(`Autocorrect domain C↔JS: the firmware's ${fixture.valid.length} valid and ${fixture.invalid.length} invalid vectors, Ark's own lists, a list at every ceiling and ${accepted + refused} single-byte changes (${refused} refused) are judged alike, by reason, table and row; the firmware's lookups read what Ark decodes; wide read offsets are lossless.`);
