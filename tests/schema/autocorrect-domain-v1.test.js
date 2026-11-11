"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {AUTOCORRECT_DOMAIN_V1, AUTOCORRECT_KIND, AUTOCORRECT_MATCH, entryKey, entryOfKey, encodeAutocorrectDomain, decodeAutocorrectDomain, autocorrectDomainSize, foldTypo, typoProblem, correctionProblem} = require("../../core/schema/autocorrect-domain-v1");
const {decodeProfileBlob} = require("../../core/schema/profile-blob-v1");
const fixture = require("../../upstream/firmware/tests/fixtures/autocorrect_domain_v1.json");

/** @param {string} name */
const fixtureDomain = name => {
    const text = fs.readFileSync(path.resolve(__dirname, `../../upstream/firmware/tests/fixtures/${name}`), "utf8");
    return decodeProfileBlob(Buffer.from(/** @type {RegExpMatchArray} */ (text.match(/^profile\.hex=(.+)$/m))[1], "hex")).domains.find(domain => domain.id === 0x80);
};
const reject = (fn, code) => assert.throws(fn, error => error.code === code, code);
// The fixture's entries, their matches as the stored numbers; a macro entry
// names its slot and has no text.
const listOf = entries => ({entries: entries.map(entry => ({correction: entry.correction ?? "", ...(entry.macro === undefined ? {} : {macro: entry.macro}),
    typos: entry.typos.map(({typo, match}) => ({typo, match: fixture.matches.indexOf(match)}))}))});
// Entries compared whatever order they are written in.
const sorted = list => list.entries.map(entry => ({...entry, typos: entry.typos.slice().sort((a, b) => Buffer.compare(Buffer.from(a.typo), Buffer.from(b.typo)))}))
    .sort((a, b) => Buffer.compare(Buffer.from(entryKey(a)), Buffer.from(entryKey(b))));

test("the ceilings and the match numbers are the firmware's", () => {
    assert.deepEqual({corrections: AUTOCORRECT_DOMAIN_V1.MAX_CORRECTIONS, typos: AUTOCORRECT_DOMAIN_V1.MAX_TYPOS, bytesPerTypo: AUTOCORRECT_DOMAIN_V1.TEXT_MAX,
        bytesPerCorrection: AUTOCORRECT_DOMAIN_V1.CORRECTION_MAX, macroSlots: AUTOCORRECT_DOMAIN_V1.MACRO_SLOTS, textBytes: AUTOCORRECT_DOMAIN_V1.MAX_TEXT_BYTES, domainBytes: AUTOCORRECT_DOMAIN_V1.MAX_SIZE}, fixture.ceilings);
    assert.deepEqual([AUTOCORRECT_MATCH.WHOLE_WORD, AUTOCORRECT_MATCH.START, AUTOCORRECT_MATCH.END, AUTOCORRECT_MATCH.ANYWHERE],
        ["whole word", "start of word", "end of word", "anywhere"].map(word => fixture.matches.indexOf(word)));
});

test("every valid vector encodes to the firmware's bytes, whatever order its entries are written in, and decodes back", () => {
    for (const vector of fixture.valid) {
        const list = listOf(vector.entries), bytes = Buffer.from(vector.hex, "hex");
        assert.equal(encodeAutocorrectDomain(list).toString("hex"), vector.hex, vector.name);
        const reversed = {entries: list.entries.slice().reverse().map(entry => ({...entry, typos: entry.typos.slice().reverse()}))};
        assert.equal(encodeAutocorrectDomain(reversed).toString("hex"), vector.hex, `${vector.name}, reversed`);
        assert.equal(autocorrectDomainSize(list), bytes.length, vector.name);
        assert.deepEqual(sorted(decodeAutocorrectDomain(bytes)), sorted(list), vector.name);
    }
});

test("a decoded list is in the stored order: corrections by their bytes, each with its typos by theirs", () => {
    const small = fixture.valid.find(vector => vector.name === "small");
    const list = decodeAutocorrectDomain(Buffer.from(small.hex, "hex"));
    assert.deepEqual(list.entries.map(entry => entry.correction), ["a lot", "because", "café", "doesn't", "iPhone", "ment", "the", "thing", "un", "über"]);
    assert.deepEqual(list.entries[1].typos, [{typo: "beacuse", match: 0}, {typo: "becasue", match: 0}, {typo: "becuase", match: 0}]);
    assert.deepEqual(list.entries[7].typos, [{typo: "tihng", match: 3}]);
});

test("a replacement of 128 bytes and macro replacements decode as written: text first, then macros by slot", () => {
    const long = decodeAutocorrectDomain(Buffer.from(fixture.valid.find(vector => vector.name === "long").hex, "hex"));
    assert.equal(Buffer.byteLength(long.entries.find(entry => entry.typos[0].typo === "sigoff").correction), AUTOCORRECT_DOMAIN_V1.CORRECTION_MAX);
    const macros = decodeAutocorrectDomain(Buffer.from(fixture.valid.find(vector => vector.name === "macros").hex, "hex"));
    assert.deepEqual(macros.entries, [
        {correction: "sam@example.com", typos: [{typo: "myemail", match: 0}]},
        {correction: "the", typos: [{typo: "teh", match: 0}]},
        {correction: "", macro: 3, typos: [{typo: "addr", match: 0}, {typo: "adres", match: 0}]},
        {correction: "", macro: 127, typos: [{typo: "sigfull", match: 0}]},
    ]);
    assert.deepEqual([AUTOCORRECT_KIND.TEXT, AUTOCORRECT_KIND.MACRO], [0, 1]);
    // An entry's key tells a macro from any text, and reads back.
    assert.deepEqual(macros.entries.map(entry => entryOfKey(entryKey(entry))), [{correction: "sam@example.com"}, {correction: "the"}, {macro: 3}, {macro: 127}]);
});

test("every invalid vector is refused with the firmware's reason, table and row", () => {
    assert.ok(fixture.invalid.length >= 40);
    for (const vector of fixture.invalid) {
        assert.throws(() => decodeAutocorrectDomain(Buffer.from(vector.hex, "hex")), error => {
            assert.deepEqual({code: error.code, table: error.table ?? null, row: error.row ?? null}, vector.error, vector.name);
            return true;
        }, vector.name);
    }
});

test("both firmware profile fixtures hold a list Ark reads and writes back byte for byte", () => {
    for (const name of ["populated_profile_v4.fixture", "maximum_profile_v4.fixture"]) {
        const domain = fixtureDomain(name);
        assert.ok(domain, name);
        assert.equal(domain.version, AUTOCORRECT_DOMAIN_V1.VERSION, name);
        const list = decodeAutocorrectDomain(domain.payload);
        assert.ok(list.entries.length > 0, name);
        assert.deepEqual(encodeAutocorrectDomain(list), domain.payload, name);
    }
    const maximum = decodeAutocorrectDomain(fixtureDomain("maximum_profile_v4.fixture").payload);
    assert.equal(maximum.entries.length, AUTOCORRECT_DOMAIN_V1.MAX_CORRECTIONS);
    assert.equal(fixtureDomain("maximum_profile_v4.fixture").payload.length, AUTOCORRECT_DOMAIN_V1.MAX_SIZE);
});

test("the encoder refuses what the keyboard would, by the keyboard's reason", () => {
    const one = (correction, typo, match = 0) => ({entries: [{correction, typos: [{typo, match}]}]});
    reject(() => encodeAutocorrectDomain({entries: [{correction: "the", typos: []}]}), "FIRST_TYPO");
    reject(() => encodeAutocorrectDomain(one("", "teh")), "INVALID_TEXT_LENGTH");
    reject(() => encodeAutocorrectDomain(one("the", "")), "INVALID_TEXT_LENGTH");
    reject(() => encodeAutocorrectDomain(one("a".repeat(129), "teh")), "INVALID_TEXT_LENGTH");
    assert.doesNotThrow(() => encodeAutocorrectDomain(one("a".repeat(128), "teh")));
    reject(() => encodeAutocorrectDomain(one("the", "a".repeat(33))), "INVALID_TEXT_LENGTH");
    const plays = (macro, typo, match = 0, correction = "") => ({entries: [{correction, macro, typos: [{typo, match}]}]});
    reject(() => encodeAutocorrectDomain(plays(128, "sig")), "INVALID_MACRO");
    reject(() => encodeAutocorrectDomain(plays(-1, "sig")), "INVALID_MACRO");
    reject(() => encodeAutocorrectDomain(plays(3, "sig", 1)), "INVALID_MATCH");
    reject(() => encodeAutocorrectDomain(plays(3, "sig", 0, "both")), "INVALID_TEXT_LENGTH");
    reject(() => encodeAutocorrectDomain({entries: [...plays(3, "sig").entries, ...plays(3, "sgi").entries]}), "ORDER");
    assert.doesNotThrow(() => encodeAutocorrectDomain(plays(0, "sig")));
    reject(() => encodeAutocorrectDomain(one("the", "é".repeat(17))), "INVALID_TEXT_LENGTH");
    reject(() => encodeAutocorrectDomain(one("the\u0007", "teh")), "INVALID_TEXT");
    reject(() => encodeAutocorrectDomain(one("the", "Teh")), "NOT_FOLDED");
    reject(() => encodeAutocorrectDomain(one("the", "t-h")), "NOT_A_WORD");
    reject(() => encodeAutocorrectDomain(one("the", "teh'")), "NOT_A_WORD");
    reject(() => encodeAutocorrectDomain(one("the", "the")), "TYPO_IS_CORRECTION");
    reject(() => encodeAutocorrectDomain(one("the", "teh", 4)), "INVALID_MATCH");
    reject(() => encodeAutocorrectDomain({entries: [{correction: "the", typos: [{typo: "teh", match: 0}]}, {correction: "the", typos: [{typo: "hte", match: 0}]}]}), "ORDER");
    reject(() => encodeAutocorrectDomain({entries: [{correction: "the", typos: [{typo: "teh", match: 0}]}, {correction: "ten", typos: [{typo: "teh", match: 0}]}]}), "ORDER");
    assert.doesNotThrow(() => encodeAutocorrectDomain(one("iPhone", "iphone")));
});

test("the ceilings are held when encoding, each by its own count", () => {
    const many = count => ({entries: Array.from({length: count}, (_, index) => ({correction: `c${index}`, typos: [{typo: `t${index}`, match: 0}]}))});
    assert.doesNotThrow(() => encodeAutocorrectDomain(many(1024)));
    assert.throws(() => encodeAutocorrectDomain(many(1025)), error => error.code === "CAPACITY_EXCEEDED" && error.limit === "autocorrectCorrections" && error.most === 1024);
    const wide = {entries: [{correction: "x", typos: Array.from({length: 1025}, (_, index) => ({typo: `t${index}`, match: 0}))}]};
    assert.throws(() => encodeAutocorrectDomain(wide), error => error.code === "CAPACITY_EXCEEDED" && error.limit === "autocorrectTypos" && error.most === 1024);
    const long = {entries: Array.from({length: 400}, (_, index) => ({correction: `${String(index).padStart(4, "0")}${"c".repeat(28)}`, typos: [{typo: `${String(index).padStart(4, "0")}${"t".repeat(28)}`, match: 0}]}))};
    assert.throws(() => encodeAutocorrectDomain(long), error => error.code === "CAPACITY_EXCEEDED" && error.limit === "autocorrectText" && error.most === 20480);
    assert.throws(() => encodeAutocorrectDomain(many(3), {maxCorrections: 2}), error => error.code === "CAPACITY_EXCEEDED" && error.most === 2);
});

test("a typo is folded with the firmware's table, and what cannot be one says why", () => {
    for (const [character, folded] of fixture.wordCharacters) assert.equal(foldTypo(character), folded, character);
    assert.equal(foldTypo("TeH"), "teh");
    assert.equal(foldTypo("Dosen'T"), "dosen't");
    assert.equal(foldTypo("ÜBER"), "über");
    assert.equal(foldTypo("t-h"), undefined);
    assert.equal(typoProblem("teh"), null);
    assert.equal(typoProblem("")?.code, "INVALID_TEXT_LENGTH");
    assert.equal(typoProblem("te h")?.code, "NOT_A_WORD");
    assert.equal(typoProblem("'teh")?.code, "NOT_A_WORD");
    assert.equal(typoProblem("Teh")?.code, "NOT_FOLDED");
    assert.equal(typoProblem("a".repeat(33))?.code, "INVALID_TEXT_LENGTH");
    assert.equal(correctionProblem("a lot"), null);
    assert.equal(correctionProblem("")?.code, "INVALID_TEXT_LENGTH");
    assert.equal(correctionProblem("a\tb")?.code, "INVALID_TEXT");
    assert.equal(correctionProblem("+31 6 1234 5678, sam@example.com!"), null);
    assert.equal(correctionProblem("é".repeat(64)), null);
    assert.equal(correctionProblem("é".repeat(65))?.code, "INVALID_TEXT_LENGTH");
    assert.equal(correctionProblem("two\nlines")?.code, "INVALID_TEXT");
    assert.equal(correctionProblem("\ud800")?.code, "INVALID_TEXT");
});
