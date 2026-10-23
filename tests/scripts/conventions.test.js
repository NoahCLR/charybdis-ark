"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "../..");
const sources = directory => fs.readdirSync(path.join(root, directory), {withFileTypes: true}).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? sources(file) : /\.m?js$/.test(file) ? [file] : [];
});
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("source modules explicitly opt into JavaScript type checking", () => {
    const files = ["core", "webview", "web", "scripts", "tools"].flatMap(sources)
        .concat(["extension.js", "panel-html.js", "playwright.config.js"]);
    assert.deepEqual(files.filter(file => !/^\/\/ @ts-check\s*$/m.test(read(file))), []);
});

test("screen colours use the model or CSS ink tokens", () => {
    // rgb(...) in the colour editor's readable output is prose; a numeric
    // literal in a CSS colour function or a hex colour is authored paint.
    const literal = /#[\da-f]{3,8}\b|rgba?\(\s*\d/i;
    assert.deepEqual(sources("webview/ui").filter(file => literal.test(read(file))), []);
});

test("semantic domain lookups do not use a position's stored keycode name", () => {
    const badLookup = /(?:behaviourFor|pointingSlotFor|macroKeycodes|macroPlacements|customKeyPlacements)\([^;\n]*\b(?:position|pos)\.keycode\b|(?<![!=])===(?!=)\s*(?:position|pos)\.keycode\b/;
    // inputOn accepts native or semantic combo input names: it checks both.
    // The action-use matcher also accepts native catalogue names/values.
    const compatibilityLines = [
        'const inputOn = (name, position) => name === position.keycode || name === keyMeaning(position);',
    ];
    const violations = ["webview/view", "webview/ui"].flatMap(sources).flatMap(file => read(file).split("\n")
        .filter(line => badLookup.test(line) && !compatibilityLines.includes(line.trim())).map(line => `${file}: ${line.trim()}`));
    assert.deepEqual(violations, []);
});

test("both profile file choosers use the portable document's byte limit", () => {
    assert.equal(require("../../core/session/panel-loop").FILE_MAX_BYTES, require("../../core/model/portable-profile").FILE_MAX_BYTES);
    assert.match(read("extension.js"), /\.size > FILE_MAX_BYTES/);
    assert.match(read("web/web-shell.mjs"), /PROFILE_FILE_LIMIT = FILE_MAX_BYTES/);
});
