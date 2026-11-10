// @ts-check
"use strict";

// Ark's starter list: fixes for common English typos, written for Ark, each
// input a whole word, grouped under the word each should be. It is in
// Ark's own list format, as Export writes one, so it is read the way a file
// is. Nothing typed in it is an English word
// (tests/data/autocorrect-starter.test.js).

/** @type {{version: number, replacements: {replacement: string, inputs: string[]}[]}} */
const AUTOCORRECT_STARTER = require("./autocorrect-starter.json");

module.exports = {AUTOCORRECT_STARTER};
