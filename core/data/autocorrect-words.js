// @ts-check
"use strict";

// The characters a typo in the autocorrect list may hold, and what each folds
// to, generated from the firmware's pinned fixture by
// scripts/generate-autocorrect-words.js. The keyboard folds a typed word with
// the same table, so a typo is stored folded and matches whatever its case.

const data = require("./autocorrect-words.json");

/** @type {Map<string, string>} */
const FOLDS = new Map(Array.from(data.characters, (character, index) => [character, data.folded[index]]));

// What a word character folds to; undefined for a character that is not one.
/** @param {string} character one character @returns {string | undefined} */
function foldWordCharacter(character) {
    return FOLDS.get(character);
}

module.exports = {AUTOCORRECT_APOSTROPHE: data.apostrophe, WORD_CHARACTER_COUNT: FOLDS.size, foldWordCharacter};
