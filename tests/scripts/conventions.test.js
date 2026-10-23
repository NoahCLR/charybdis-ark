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

// Source with its comments blanked, so a rule can match across lines while
// lines keep their numbers.
const uncommented = source => source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, comment => comment.replace(/[^\n]/g, " "));
const lineAt = (source, index) => source.slice(0, index).split("\n").length;

// Whether an area takes edits is the store's canEdit(area) and writable(),
// which read the published draft.editable; every other module asks them,
// never the draft.
const draftEditable = [
    /\bdraft\s*(?:\?\.|\.)\s*editable\b/g,
    /\bdraft\s*(?:\?\.)?\s*\[\s*["'`]editable["'`]\s*\]/g,
    /\bdraft\s*:\s*\{[^{}]*\beditable\b/g,
    /\{[^{}]*\beditable\b[^{}]*\}\s*=[^;]*?\bdraft\b/g,
];
const readsDraftEditable = source => {
    const code = uncommented(source);
    return [...new Set(draftEditable.flatMap(pattern => Array.from(code.matchAll(pattern), match => lineAt(code, match.index))))];
};

test("the editable check catches a module reading the draft", () => {
    for (const sample of ["const on = model.draft.editable;", "if (getModel()?.draft?.editable) post(message);",
        "const {editable, busy} = model.draft || {};", "const {draft: {editable}} = model;", "return model.draft[\"editable\"];",
        "const {\n    editable,\n    busy\n} = model.draft;", "const {draft: {\n    editable}} = model;", "const on = model.draft\n    .editable;"]) {
        assert.equal(readsDraftEditable(sample).length, 1, sample);
    }
    for (const sample of ["const editable = canEdit(\"settings\");", "const editable = writable() && !field.readOnly;",
        "export function durationControl(field, editable, submit) {", "// reads draft.editable through the store",
        "/* draft.editable */ const on = writable();"]) {
        assert.deepEqual(readsDraftEditable(sample), [], sample);
    }
});

test("only the store reads whether the draft takes edits", () => {
    const violations = sources("webview").filter(file => file !== path.join("webview", "store.mjs"))
        .flatMap(file => readsDraftEditable(read(file)).map(line => `${file}:${line}`));
    assert.deepEqual(violations, [], "ask canEdit(area) or writable() in webview/store.mjs");
});

// A screen posts what a builder returns (webview/view/edits.mjs,
// pointing-config.mjs, controls.mjs) or a message the store hands back, never
// an object it assembled inline. Syntactic: an object literal that is the
// argument, or one of its branches (a conditional, ||, a parenthesised group),
// rather than an argument to a builder inside it.
function postsInlineObjects(source) {
    const code = uncommented(source);
    const lines = [];
    for (const match of code.matchAll(/\bpost(?:LeavingDemo)?\s*\(/g)) {
        // Each enclosing bracket of the argument: "call", "group" or "literal".
        const stack = [];
        for (let at = match.index + match[0].length; at < code.length; at++) {
            const c = code[at];
            if (c === '"' || c === "'" || c === "`") {
                for (at++; at < code.length && code[at] !== c; at++) if (code[at] === "\\") at++;
            } else if (c === "(") {
                stack.push(/[\w$)\]]\s*$/.test(code.slice(Math.max(0, at - 40), at)) ? "call" : "group");
            } else if (c === "[" || c === "{") {
                if (c === "{" && stack.every(kind => kind === "group")) { lines.push(lineAt(code, match.index)); break; }
                stack.push("literal");
            } else if (c === ")" || c === "]" || c === "}") {
                if (!stack.length) break;
                stack.pop();
            }
        }
    }
    return lines;
}

test("the posting check catches an object assembled inline", () => {
    for (const sample of ["post({type: \"setKey\", layer, index, keycode});", "post({...edits.setKey(layer, index, keycode), keycode: other});",
        "postLeavingDemo({type: \"leaveDemo\"});", "button.addEventListener(\"click\", () => post(\n    {type: \"refresh\"}));",
        "post(live ? {type: \"saveDraft\"} : controls.applyDraft());", "post(({type: \"refresh\"}));", "post(message || {type: \"refresh\"});"]) {
        assert.equal(postsInlineObjects(sample).length, 1, sample);
    }
    for (const sample of ["post(edits.setKey(layer.name, index, keycode));", "post(controls.control(\"refresh\"));",
        "if (message) post(message);", "post(leave.message);", "postLeavingDemo(chooseKeyboard());",
        "post(edits.keyFeedback(feedback, null, null, {locality: value}));", "post(live ? controls.saveDraft(true) : controls.applyDraft(true));",
        "post(edits.settingsSection(section, (field) => { return field.macro === \"x\"; }));", "post(controls.control(\"{\"));"]) {
        assert.deepEqual(postsInlineObjects(sample), [], sample);
    }
});

test("screens post only builder output", () => {
    const violations = sources("webview").flatMap(file => postsInlineObjects(read(file)).map(line => `${file}:${line}`));
    assert.deepEqual(violations, [], "build the message in webview/view/edits.mjs, pointing-config.mjs or controls.mjs");
});
