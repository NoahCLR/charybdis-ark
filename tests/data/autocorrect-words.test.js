"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {buildAutocorrectWords} = require("../../scripts/generate-autocorrect-words");
const fixture = require("../../upstream/firmware/tests/fixtures/autocorrect_domain_v2.json");
const data = require("../../core/data/autocorrect-words.json");
const {AUTOCORRECT_APOSTROPHE, WORD_CHARACTER_COUNT, foldWordCharacter} = require("../../core/data/autocorrect-words");

test("the shipped word characters are generated from the pinned firmware fixture", () => {
    assert.deepEqual(data, buildAutocorrectWords(fixture));
    assert.equal(WORD_CHARACTER_COUNT, fixture.wordCharacters.length);
    assert.equal(AUTOCORRECT_APOSTROPHE, "'");
});

test("every word character folds as the firmware folds it, and nothing else is one", () => {
    for (const [character, folded] of fixture.wordCharacters) assert.equal(foldWordCharacter(character), folded, character);
    assert.equal(foldWordCharacter("A"), "a");
    assert.equal(foldWordCharacter("é"), "é");
    assert.equal(foldWordCharacter("É"), "é");
    assert.equal(foldWordCharacter("7"), "7");
    for (const other of [" ", "-", "'", ".", "🙂", "", "ab"]) assert.equal(foldWordCharacter(other), undefined, JSON.stringify(other));
});

test("a fixture in another shape is refused rather than guessed at", () => {
    assert.throws(() => buildAutocorrectWords({...fixture, version: 1}), /Unsupported/);
    assert.throws(() => buildAutocorrectWords({...fixture, wordCharacters: [["ab", "a"]]}), /one character/);
});
