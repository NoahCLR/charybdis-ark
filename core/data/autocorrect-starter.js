// @ts-check
"use strict";

// Ark's starter autocorrect list: common English typos, written for Ark,
// every one matching the whole word, grouped under the word each should be.
// It is in Ark's own list format, as Export writes one, so it is read the
// way a file is. No typo in it is an English word
// (tests/data/autocorrect-starter.test.js).

/** @type {{version: number, entries: {correction: string, typos: {typo: string, match: string}[]}[]}} */
const AUTOCORRECT_STARTER = require("./autocorrect-starter.json");

module.exports = {AUTOCORRECT_STARTER};
