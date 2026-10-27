"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const {syntaxCoverage} = require("../../scripts/syntax-coverage");

test("each source keeps a parser, including files outside TypeScript and Node test discovery", () => {
    const coverage = syntaxCoverage(path.resolve(__dirname, "../.."));
    const checker = file => coverage.find(entry => entry.file === file)?.checker;
    assert.equal(checker("web/web-shell.mjs"), "typescript");
    assert.equal(checker("web/sleep-worker.js"), "typescript", "the worker uses its own config");
    assert.equal(checker("scripts/preview.js"), "typescript", "the developer exclude is covered by the preview config");
    assert.equal(checker("webview/ui/board.mjs"), "typescript");
    assert.equal(checker("tests/scripts/syntax-coverage.test.js"), "test");
    assert.equal(checker("playwright.config.js"), "node");
    assert.equal(checker("browser-tests/preview.spec.js"), "node");
    assert.equal(checker("tests/integration/run_profile_rgb_v1_tests.sh"), "shell");
    assert.ok(coverage.every(entry => ["node", "shell", "typescript", "test"].includes(entry.checker)));
});
