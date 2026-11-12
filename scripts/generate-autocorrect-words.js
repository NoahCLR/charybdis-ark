#!/usr/bin/env node
"use strict";
// @ts-check

// Generates core/data/autocorrect-words.json from the firmware's autocorrect
// domain fixture, pinned in
// upstream/firmware/tests/fixtures/autocorrect_domain_v2.json.
//
// A typo in the autocorrect list holds word characters only, each already
// case-folded, and the keyboard folds a typed word with the same table before
// it looks it up (firmware autocorrect-domain.md). Ark keeps the firmware's
// table and never derives its own, so the two cannot disagree about which
// characters a typo may hold or what a capital folds to.
//
//   node scripts/generate-autocorrect-words.js [--check]

const fs = require("node:fs");
const path = require("node:path");

const APP_ROOT = path.resolve(__dirname, "..");
const FIXTURE_RELATIVE_PATH = path.join("upstream", "firmware", "tests", "fixtures", "autocorrect_domain_v2.json");
const OUTPUT_RELATIVE_PATH = path.join("core", "data", "autocorrect-words.json");
const AUTOCORRECT_WORDS_FORMAT = "charybdis-autocorrect-words-v1";

/**
 * @param {import("./contract-types.js").AutocorrectDomainFixture} fixture
 */
function buildAutocorrectWords(fixture) {
    if (fixture?.version !== 2 || !Array.isArray(fixture.wordCharacters) || typeof fixture.apostrophe !== "string") throw new Error("Unsupported autocorrect domain fixture.");
    const pairs = fixture.wordCharacters;
    if (pairs.some(pair => !Array.isArray(pair) || pair.length !== 2 || pair.some(character => typeof character !== "string" || [...character].length !== 1))) throw new Error("A word character and its fold are one character each.");
    return {
        format: AUTOCORRECT_WORDS_FORMAT,
        generatedFrom: FIXTURE_RELATIVE_PATH.split(path.sep).join("/"),
        apostrophe: fixture.apostrophe,
        // Every word character, in the fixture's order, and beside each the
        // character it folds to.
        characters: pairs.map(([character]) => character).join(""),
        folded: pairs.map(([, folded]) => folded).join(""),
    };
}

/**
 * @param {string[]} argv
 */
function main(argv) {
    const check = argv.includes("--check");
    /** @type {import("./contract-types.js").AutocorrectDomainFixture} */
    const fixture = JSON.parse(fs.readFileSync(path.join(APP_ROOT, FIXTURE_RELATIVE_PATH), "utf8"));
    const serialized = `${JSON.stringify(buildAutocorrectWords(fixture), null, 1)}\n`;
    const outputPath = path.join(APP_ROOT, OUTPUT_RELATIVE_PATH);
    if (check) {
        const current = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, "utf8") : "";
        if (current !== serialized) {
            console.error(`${OUTPUT_RELATIVE_PATH} is stale against ${FIXTURE_RELATIVE_PATH}. Re-run without --check to regenerate.`);
            process.exitCode = 1;
            return;
        }
        console.log(`autocorrect words are current: ${fixture.wordCharacters.length} characters`);
        return;
    }
    fs.writeFileSync(outputPath, serialized);
    console.log(`wrote ${OUTPUT_RELATIVE_PATH}: ${fixture.wordCharacters.length} characters`);
}

if (require.main === module) main(process.argv.slice(2));

module.exports = {buildAutocorrectWords, AUTOCORRECT_WORDS_FORMAT, FIXTURE_RELATIVE_PATH, OUTPUT_RELATIVE_PATH};
