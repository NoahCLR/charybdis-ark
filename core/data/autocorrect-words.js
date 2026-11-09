// @ts-check
"use strict";

// The characters a typo in the autocorrect list may hold, and what each folds
// to, generated from the firmware's pinned fixture by
// scripts/generate-autocorrect-words.js. The keyboard folds a typed word with
// the same table, so a typo is stored folded and matches whatever its case.

const data = require("./autocorrect-words.json");

/** @type {Map<string, string>} */
const FOLDS = new Map(Array.from(data.characters, (character, index) => [character, data.folded[index]]));

// A small letter's capital: the one character that folds to it (firmware
// autocorrect-v1.md, "The fixture"; the firmware's generator refuses two).
/** @type {Map<string, string>} */
const CAPITALS = new Map([...FOLDS].filter(([character, folded]) => folded !== character).map(([character, folded]) => [folded, character]));

// What a word character folds to; undefined for a character that is not one.
/** @param {string} character one character @returns {string | undefined} */
function foldWordCharacter(character) {
    return FOLDS.get(character);
}

// The capital of a small letter; undefined for a character that has none.
/** @param {string} character one character @returns {string | undefined} */
function capitalOfWordCharacter(character) {
    return CAPITALS.get(character);
}

module.exports = {AUTOCORRECT_APOSTROPHE: data.apostrophe, WORD_CHARACTER_COUNT: FOLDS.size, capitalOfWordCharacter, foldWordCharacter};
