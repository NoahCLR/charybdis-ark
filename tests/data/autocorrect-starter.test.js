"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const zlib = require("node:zlib");

const {AUTOCORRECT_STARTER} = require("../../core/data/autocorrect-starter");
const {planImport, starterFile} = require("../../core/model/autocorrect-import");
const {listWarnings} = require("../../core/model/autocorrect-list");
const {AUTOCORRECT_MATCH, encodeAutocorrectDomain} = require("../../core/schema/autocorrect-domain-v1");
const {hostLayouts} = require("../../core/data/host-layouts");

// English words from SCOWL (tests/fixtures/english-words/README.md says which
// and under what licence), in small letters.
const WORDS = new Set(zlib.gunzipSync(fs.readFileSync(path.join(__dirname, "../fixtures/english-words/words.txt.gz"))).toString("utf8").split("\n").filter(Boolean));
const typos = AUTOCORRECT_STARTER.replacements.flatMap(entry => entry.inputs.map(typo => ({typo, correction: entry.replacement})));

test("the word list is the one its README describes", () => {
    assert.equal(WORDS.size, 166444);
    for (const word of ["the", "because", "doesn't", "colour", "color", "whether", "wether", "dose", "form", "calender"]) assert.ok(WORDS.has(word), word);
    for (const word of ["teh", "becuase", "recieve", "definately"]) assert.equal(WORDS.has(word), false, word);
    const copyright = fs.readFileSync(path.join(__dirname, "../fixtures/english-words/SCOWL-Copyright.txt"), "utf8");
    assert.match(copyright, /Copyright 2000-2018 by Kevin Atkinson/);
    assert.match(copyright, /Permission to use, copy, modify, distribute and sell these word\s+lists/);
});

test("the starter list is a few hundred whole-word typos, grouped by the word each should be, in Ark's own list format", () => {
    assert.equal(AUTOCORRECT_STARTER.version, 1);
    assert.ok(typos.length >= 300 && typos.length <= 1024, `${typos.length} inputs`);
    assert.ok(AUTOCORRECT_STARTER.replacements.length >= 150, `${AUTOCORRECT_STARTER.replacements.length} replacements`);
    assert.ok(typos.every(typo => !typo.typo.includes("*")), "whole word only: none is written with *");
    assert.equal(new Set(AUTOCORRECT_STARTER.replacements.map(entry => entry.replacement)).size, AUTOCORRECT_STARTER.replacements.length, "each replacement once");
    assert.ok(AUTOCORRECT_STARTER.replacements.every(entry => entry.inputs.length >= 1 && entry.macro === undefined), "each a word with something typed for it, none a macro");
});

test("no typo in the starter list is an English word, and every correction is made of them", () => {
    assert.deepEqual(typos.filter(typo => WORDS.has(typo.typo)).map(typo => `${typo.typo} → ${typo.correction}`), []);
    const unknown = AUTOCORRECT_STARTER.replacements.filter(entry => !entry.replacement.toLowerCase().split(" ").every(word => WORDS.has(word))).map(entry => entry.replacement);
    assert.deepEqual(unknown, []);
});

test("the starter list passes every check of the list editor on every host layout, and fits the keyboard", () => {
    const file = starterFile();
    for (const layout of hostLayouts()) {
        const host = {layout: layout.id, layoutName: layout.name};
        const plan = planImport({entries: []}, file.rows, "add", host, {maxCorrections: 1024, maxTypos: 1024, maxTextBytes: 20480});
        assert.deepEqual(plan.refused, [], layout.slug);
        assert.deepEqual([plan.duplicates, plan.unfit], [0, 0], layout.slug);
        assert.equal(plan.list.entries.length, AUTOCORRECT_STARTER.replacements.length);
        assert.deepEqual(listWarnings(plan.list, host), [], layout.slug);
        assert.ok(plan.list.entries.every(entry => entry.typos.every(typo => typo.match === AUTOCORRECT_MATCH.WHOLE_WORD)));
        assert.doesNotThrow(() => encodeAutocorrectDomain(plan.list));
    }
});
