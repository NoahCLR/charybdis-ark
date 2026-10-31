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
    const files = ["core", "rules", "webview", "web", "scripts"].flatMap(sources)
        .concat(["playwright.config.js"]);
    assert.deepEqual(files.filter(file => !/^\/\/ @ts-check\s*$/m.test(read(file))), []);
});

test("screen colours use the model or CSS ink tokens", () => {
    // rgb(...) in the colour editor's readable output is prose; a numeric
    // literal in a CSS colour function or a hex colour is authored paint.
    const literal = /#[\da-f]{3,8}\b|rgba?\(\s*\d/i;
    assert.deepEqual(sources("webview/ui").filter(file => literal.test(read(file))), []);
});

// The page requires Trusted Types (scripts/build-web.js): markup reaches an
// HTML sink only through webview/lib/dom.mjs `html`, and the one script the
// page starts by URL is web/page.mjs's worker, so a sink that does neither
// would fail in the page, not in Node's tests. The policy passes markup as it
// is, so what it is handed is safe only because
// tests/view/markup-escaped.test.mjs judges it, and that check sees only a
// webview module setting `.innerHTML` or `.outerHTML` with `=` or calling
// `.insertAdjacentHTML(…)`. Syntactic: markup set so, unless it is one html(…)
// call and nothing more; a compound assignment, whose string joins what is
// there; a sink named any other way (by a quoted name, as a key, as
// Object.assign or Reflect.set take it, or insertAdjacentHTML not called
// there and then), which the escape check never judges;
// any HTML sink in web/, which that check does not read and which cannot reach
// the panel's policy; and any sink the page never needs, which no policy here
// passes: the unsafe HTML setters and parsers, document.write, srcdoc and a
// worker or imported script started by URL.
const HTML_SETTERS = [
    /\.\s*(?:inner|outer)HTML\s*(=|\+=|\?\?=|\|\|=|&&=)(?!=)/g,
    /\.\s*insertAdjacentHTML\s*\(/g,
];
const UNJUDGED_SINK = /(?<!\.\s*)\b(?:innerHTML|outerHTML|insertAdjacentHTML)\b|\.\s*insertAdjacentHTML\b(?!\s*\()/g;
const UNPOLICED_SINK = /\b(?:setHTMLUnsafe|parseHTMLUnsafe|DOMParser|parseFromString|createContextualFragment|srcdoc|importScripts)\b|\bdocument\s*\.\s*write(?:ln)?\s*\(|\bnew\s+(?:Shared)?Worker\s*\(/g;
// The page's own worker, started through its policy (web/page.mjs).
const HTML_SINK_ALLOWED = [
    {file: "web/page.mjs", line: "try {worker = new Worker(scripts ? scripts.createScriptURL(workerUrl) : workerUrl);} catch {worker = undefined;}"},
];
// The expression from `at` to where it ends: a `;` or `,` outside brackets, or
// the bracket that closes around it.
const expressionAt = (code, at) => {
    let depth = 0;
    for (let end = at; end < code.length; end++) {
        const c = code[end];
        if (c === '"' || c === "'" || c === "`") {
            for (end++; end < code.length && code[end] !== c; end++) if (code[end] === "\\") end++;
        } else if ("([{".includes(c)) depth++;
        else if (")]}".includes(c)) { if (!depth--) return code.slice(at, end); }
        else if ((c === ";" || c === ",") && !depth) return code.slice(at, end);
    }
    return code.slice(at);
};
const throughPolicy = expression => {
    const value = expression.trim();
    return value.startsWith("html(") && value === `html(${expressionAt(value, 5)})`;
};
// The lines of a module whose markup or script URL skips the page's policies,
// or its escape check; in the shell (`shell`), every HTML sink.
const htmlSinks = (source, shell = false) => {
    const code = uncommented(source);
    const unpoliced = HTML_SETTERS.flatMap(pattern => Array.from(code.matchAll(pattern)).filter(match => {
        if (shell || match[1] && match[1] !== "=") return true;
        let at = match.index + match[0].length;
        if (match[0].endsWith("(")) at += expressionAt(code, at).length + 1;
        return !throughPolicy(expressionAt(code, at));
    }));
    return [...new Set([...unpoliced, ...code.matchAll(UNJUDGED_SINK), ...code.matchAll(UNPOLICED_SINK)].map(match => lineAt(code, match.index)))].sort((a, b) => a - b);
};

test("the HTML sink check catches markup that skips the policy or the escape check", () => {
    for (const sample of ["card.innerHTML = hoverCard(index);", "node.outerHTML = `<b>${name}</b>`;", "h3.insertAdjacentHTML(\"afterend\", mark(field));",
        "card.innerHTML += raw;", "card.innerHTML += html(raw);", "card[\"innerHTML\"] = raw;", "card['outerHTML'] = raw;",
        "card[\"innerHTML\"] = html(markup);", "card[`outerHTML`] = html(markup);", "card[\"insertAdjacentHTML\"](\"afterend\", html(markup));",
        "Object.assign(card, {innerHTML: raw});", "Object.assign(card, {hidden: false, \"innerHTML\": raw});",
        "Object.assign(card, {innerHTML: html(markup), hidden: false});", "Object.assign(card, {innerHTML});", "Reflect.set(card, \"innerHTML\", html(markup));",
        "h3.insertAdjacentHTML?.(\"afterend\", raw);", "h3.insertAdjacentHTML.call(h3, \"afterend\", raw);",
        "card.innerHTML = html(a) + raw;", "card.innerHTML = html(a)\n    + raw;", "card.innerHTML = raw || html(a);", "h3.insertAdjacentHTML(\"afterend\", html(a) + raw);",
        "card.setHTMLUnsafe(raw);", "const doc = Document.parseHTMLUnsafe(raw);", "document.write(raw);", "document.writeln(raw);",
        "const doc = new DOMParser().parseFromString(raw, \"text/html\");", "const doc = parser.parseFromString(raw, \"text/html\");",
        "const part = document.createRange().createContextualFragment(raw);", "frame.srcdoc = raw;", "frame.setAttribute(\"srcdoc\", raw);",
        "const second = new Worker(url);", "const shared = new SharedWorker(url);", "importScripts(url);"]) {
        assert.equal(htmlSinks(sample).length, 1, sample);
    }
    for (const sample of ["card.innerHTML = html(hoverCard(index));", "h3.insertAdjacentHTML(\"afterend\", html(mark(field)));", "if (!card.innerHTML) return;", "side.hidden = !side.innerHTML;",
        "if (card.innerHTML === \"\") return;", "if (card.innerHTML != last) return;", "card?.innerHTML === last;",
        "card.innerHTML = html(`<b>${esc(name)}</b>`);", "card.innerHTML = html(hoverCard(index, {open: true}));", "// card.innerHTML = raw;", "/* document.write(raw) */"]) {
        assert.deepEqual(htmlSinks(sample), [], sample);
    }
    // The shell sets no markup at all.
    for (const sample of ["notice.innerHTML = html(`<b>${esc(name)}</b>`);", "root.insertAdjacentHTML(\"beforeend\", html(markup));"]) {
        assert.equal(htmlSinks(sample, true).length, 1, sample);
    }
    assert.deepEqual(htmlSinks("if (!notice.innerHTML) return;", true), []);
});

test("markup reaches the page's HTML sinks only through its Trusted Types policy", () => {
    const found = ["webview", "web"].flatMap(sources).map(posix).flatMap(file => {
        const source = read(file), lines = source.split("\n");
        return htmlSinks(source, file.startsWith("web/")).map(at => ({file, line: lines[at - 1].trim(), at}));
    });
    assert.deepEqual(found.filter(sink => !isAllowed(HTML_SINK_ALLOWED, sink)).map(sink => `${sink.file}:${sink.at}: ${sink.line}`), [],
        "set markup in webview/ only, as .innerHTML = html(…) or .insertAdjacentHTML(…, html(…)) from webview/lib/dom.mjs; start no other script by URL");
    assert.deepEqual(HTML_SINK_ALLOWED.filter(allow => !found.some(sink => isAllowed([allow], sink))), [], "drop an allowed line the check no longer finds");
});

test("semantic domain lookups do not use a position's stored keycode name", () => {
    const badLookup = /keyIdentity\([^;\n]*\b(?:position|pos)\.keycode\)\.(?:behaviour|pointing|macro|customKey)\b|(?:macroNamesOf|placementsOf)\([^;\n]*\b(?:position|pos)\.keycode\b|(?<![!=])===(?!=)\s*(?:position|pos)\.keycode\b/;
    // inputOn accepts native or semantic combo input names: it checks both.
    // The action-use matcher also accepts native catalogue names/values.
    const compatibilityLines = [
        'const inputOn = (name, position) => name === position.keycode || name === keyMeaning(position);',
    ];
    const violations = ["webview/view", "webview/ui"].flatMap(sources).flatMap(file => read(file).split("\n")
        .filter(line => badLookup.test(line) && !compatibilityLines.includes(line.trim())).map(line => `${file}: ${line.trim()}`));
    assert.deepEqual(violations, []);
});

test("the page's backup chooser holds a file to the backup's byte limit", () => {
    assert.match(read("web/web-shell.mjs"), /file\.size > FILE_MAX_BYTES\b/);
});

// Source with its comments blanked, so a rule can match across lines while
// lines keep their numbers.
const uncommented = source => source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, comment => comment.replace(/[^\n]/g, " "));
const lineAt = (source, index) => source.slice(0, index).split("\n").length;

// Whether an area takes edits is editGate(model, area) (webview/view/edit-gate.mjs),
// which reads the published draft.editable; every other module asks it,
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
    for (const sample of ["const editable = editGate(model, \"settings\").editable;", "const editable = gate.editable && !field.readOnly;",
        "export function durationControl(field, editable, submit) {", "// reads draft.editable through the edit gate",
        "/* draft.editable */ const on = editGate(model, \"keys\").editable;"]) {
        assert.deepEqual(readsDraftEditable(sample), [], sample);
    }
});

test("only the edit gate reads whether the draft takes edits", () => {
    const violations = sources("webview").filter(file => file !== path.join("webview", "view", "edit-gate.mjs"))
        .flatMap(file => readsDraftEditable(read(file)).map(line => `${file}:${line}`));
    assert.deepEqual(violations, [], "ask editGate(model, area) in webview/view/edit-gate.mjs");
});

// Which key a spelling is, and whether two spellings are one key, is
// keyIdentity(model, spelling) (webview/view/key-identity.mjs), which reads
// the published alias table; every other module asks it, never the table.
// The keycode grammar's reader (keycode-expression.mjs) takes the whole table
// into the names an expression stores by.
test("only the key identity reads the keycode alias table", () => {
    const allowed = ["key-identity.mjs", "keycode-expression.mjs"].map(name => path.join("webview", "view", name));
    const violations = sources("webview").filter(file => !allowed.includes(file)).flatMap(file => {
        const code = uncommented(read(file));
        return Array.from(code.matchAll(/\bqmkKeycodeAliases\b/g), match => `${file}:${lineAt(code, match.index)}`);
    });
    assert.deepEqual(violations, [], "ask keyIdentity(model, spelling) in webview/view/key-identity.mjs");
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

// Each fact below has one home (docs/architecture/README.md, "Facts and their
// homes"); a module imports it from there. A check names its exceptions in an
// allow-list, each with its reason, and a sample of what it catches.
const posix = file => file.split(path.sep).join("/");
// Every match of `pattern` in a module's code, comments blanked, as
// `file:line: text`, less the allowed lines: `{file, line}` pairs naming the
// trimmed line exactly, so an allowed line that changes is checked again.
const matches = (directories, pattern) => directories.flatMap(sources).map(posix).flatMap(file => {
    const source = read(file), code = uncommented(source), lines = source.split("\n");
    return [...new Set(Array.from(code.matchAll(pattern), match => lineAt(code, match.index)))]
        .map(at => ({file, line: lines[at - 1].trim(), at}));
});
const isAllowed = (allowed, found) => allowed.some(allow => allow.file === found.file && allow.line === found.line);
const literals = (directories, pattern, allowed = []) => matches(directories, pattern)
    .filter(found => !isAllowed(allowed, found)).map(found => `${found.file}:${found.at}: ${found.line}`);
// An allowed line the check no longer finds is stale.
const staleAllowed = (directories, pattern, allowed) => {
    const found = matches(directories, pattern);
    return allowed.filter(allow => !found.some(match => isAllowed([allow], match)));
};

// QMK's keycode layout lives in rules/qmk-keycodes.mjs and the keyboard's
// own blocks in core/data/user-keycodes.js. A number in QMK's keycode space
// from the mod-taps up (0x2000–0x7fff: mod-taps, layer keys and their 0x52xx
// forms, macros, the keyboard's blocks) is written only there; elsewhere it is
// a block's `first` or a helper's result. Written in decimal it is caught
// where it meets a keycode: compared with, assigned to or masked into a name
// that says code (8192–32767 are too common elsewhere, as times and sizes).
const KEYCODE_LITERAL = new RegExp([
    String.raw`(?<![\w.])0x[2-7][\da-f]{3}(?![\w.])`,
    String.raw`\b\w*code\w*(?:\??\.\w+)*\s*(?:[!=]==?|[<>]=?|\?\?|\|\||=(?!=)|[&|^](?![&|]))\s*(?:8(?:19[2-9]|[2-9]\d\d)|9\d{3}|[12]\d{4}|3[01]\d{3}|32[0-7]\d\d)(?![\w.])`,
].join("|"), "gi");
const KEYCODE_HOMES = new Set([
    "rules/qmk-keycodes.mjs",
    "core/data/user-keycodes.js",
]);
const KEYCODE_LITERAL_ALLOWED = [
    // The interface may not import core: its copy of the keyboard's
    // layer-lock block, pinned by tests/view/enum-drift.test.mjs.
    {file: "webview/view/keycode-expression.mjs", line: "export const LAYER_LOCK_BASE = 0x7ec0, LAYER_LOCK_SLOTS = 16;"},
];

test("the keycode check catches a QMK keycode written as a number", () => {
    for (const sample of ["const code = 0x5220 | layer;", "if (code >= 0x4000 && code <= 0x4FFF) return;", "return 0x7e00;",
        "if (keycode === 20992) return;", "const code = 32448 + slot;", "if (entry.keycode >= 16384) return;"]) {
        assert.equal(uncommented(sample).match(KEYCODE_LITERAL)?.length, sample.includes("0x4000") ? 2 : 1, sample);
    }
    for (const sample of ["const code = QK.MOMENTARY.first | layer;", "const mask = 0x1fff;", "const crc = 0xffffffff;", "// LT(1, KC_A) is 0x4104",
        "const WAIT_MS = 15000;", "if (keycode < 256) return;", "const timeoutMs = 10000;"]) {
        assert.equal(uncommented(sample).match(KEYCODE_LITERAL), null, sample);
    }
});

test("QMK keycode numbers are written only in their homes", () => {
    const violations = literals(["core", "rules", "webview", "web"], KEYCODE_LITERAL, KEYCODE_LITERAL_ALLOWED).filter(found => !KEYCODE_HOMES.has(found.split(":")[0]));
    assert.deepEqual(violations, [], "import the block or helper from rules/qmk-keycodes.mjs or core/data/user-keycodes.js");
    assert.deepEqual(staleAllowed(["webview"], KEYCODE_LITERAL, KEYCODE_LITERAL_ALLOWED), [], "drop an allowed line the check no longer finds");
});

// The layer count is LAYERS and the whole bank ALL_LAYERS, in
// core/data/charybdis-layout.js, with layersOfMask and layersAbove beside
// them. A layer set is masked with ALL_LAYERS, never 0xffff, and a count of
// layers is LAYERS, never 16. Syntactic: 0xffff as a mask operand, 0xffff
// beside a value that names layers, and a 16 that sizes or bounds layers.
const LAYER_LITERAL = new RegExp([
    String.raw`(?:\?\?|(?<![&|])[&|])\s*0xffff(?![\w.])`,
    String.raw`(?<![\w.])0xffff\s*(?:[&|](?![&|])|<<|>>)`,
    String.raw`\b\w*layers?\w*\s*,\s*0xffff(?![\w.])`,
    String.raw`\{\s*length\s*:\s*16\s*\}`,
    String.raw`\bnew\s+Array\(\s*16\s*\)`,
    String.raw`\(\s*1\s*<<\s*16\s*\)\s*-\s*1(?![\w.])`,
    String.raw`\b\w*layers?\w*(?:\??\.\w+)*\s*(?:=|[<>]=?|[!=]==?|\?\?|\|\|)\s*16(?![\w.])`,
].join("|"), "gi");
const LAYER_LITERAL_ALLOWED = [
    // The homes: the layer count, and the keyboard's layer-lock block, one
    // lock per layer it may have.
    {file: "core/data/charybdis-layout.js", line: "const LAYERS = 16, MATRIX_ROWS = 10, MATRIX_COLUMNS = 6;"},
    {file: "core/data/user-keycodes.js", line: "const CUSTOM_KEY_SLOTS = 128, LAYER_LOCK_SLOTS = 16;"},
    // QMK's four-bit layer field in LT() and LM(), not the keyboard's count.
    {file: "rules/qmk-keycodes.mjs", line: "const LAYER_FORM_LAYERS = 32, PACKED_LAYERS = 16;"},
    // The interface's copies, pinned by tests/view/enum-drift.test.mjs.
    {file: "webview/view/layout.mjs", line: "export const LAYERS = 16, ALL_LAYERS = 2 ** LAYERS - 1;"},
    {file: "webview/view/keycode-expression.mjs", line: "export const LAYER_LOCK_BASE = 0x7ec0, LAYER_LOCK_SLOTS = 16;"},
    // 16-bit fields that hold no layers: a transaction's sequence number and
    // the firmware version's major part.
    {file: "core/session/candidate-upload-coordinator.js", line: "const sequence = (baseline.operationSequence + admitted) & 0xffff;"},
    {file: "core/session/firmware-support.js", line: "version: known ? `${(/** @type {number} */ (version) >>> 16) & 0xffff}.${(/** @type {number} */ (version) >>> 8) & 0xff}.${/** @type {number} */ (version) & 0xff}` : null,"},
];

test("the layer check catches a layer count or mask written as a number", () => {
    for (const sample of ["const allowed = combo.allowedLayers ?? 0xffff;", "const locks = state & 0xffff;", "return wholeUpTo(layers, 0xffff);",
        "const list = Array.from({length: 16}, (_, layer) => layer);", "const layers = model?.layers?.length || 16;", "function f({layerCount = 16} = {}) {}",
        "if (layer >= 16) return;", "const above = (0xffff << (layer + 1)) & 0xffff;", "const slots = new Array(16).fill(0);", "const all = (1 << 16) - 1;"]) {
        assert.ok(uncommented(sample).match(LAYER_LITERAL), sample);
    }
    for (const sample of ["const allowed = combo.allowedLayers ?? ALL_LAYERS;", "if (keycode > 0xffff) return false;", "const held = state >>> 16;",
        "const maxInputs = 16;", "const header = Buffer.alloc(16);", "// layers & 0xffff", "return row !== 0xffff && row !== undefined;"]) {
        assert.equal(uncommented(sample).match(LAYER_LITERAL), null, sample);
    }
});

test("layer counts and masks come from the layout data", () => {
    assert.deepEqual(literals(["core", "rules", "webview"], LAYER_LITERAL, LAYER_LITERAL_ALLOWED), [],
        "import LAYERS, ALL_LAYERS, layersOfMask or layersAbove from core/data/charybdis-layout.js (in the interface, webview/view/layout.mjs)");
    assert.deepEqual(staleAllowed(["core", "rules", "webview"], LAYER_LITERAL, LAYER_LITERAL_ALLOWED), [], "drop an allowed line the check no longer finds");
});

// The words for a value core publishes live in core/model/vocabulary.js and
// reach the interface as model.vocabulary (D-L33). Syntactic: a table of three
// or more entries whose every word is a quoted phrase a person reads (it has
// a capital or a space), kept as a table (`const NAME = …`, frozen or not) or
// indexed where it stands (`{…}[key]`). A table is an object of phrases
// (`{off: "Off", …}`), an object of objects of phrases (`{macros: {label:
// "Macros", what: "…"}, …}`), or a list of pairs, an id then its phrase
// (`[["up", "Up"], …]`), a Map of them included. A table named as words
// (`…_WORDS`, `…_LABELS`, `…_TITLES`) counts whatever its phrases look like.
const phrase = String.raw`(?:"[^"\n]*"|'[^'\n]*'|\x60[^\x60\n$]*\x60)`;
const key = String.raw`(?:[\w$]+|"[^"\n]*"|'[^'\n]*'|\[[\w$.]+\])`;
const wordEntry = String.raw`${key}\s*:\s*${phrase}`;
const objectEntry = String.raw`${key}\s*:\s*\{[^{}]*\}`;
const pairEntry = String.raw`\[\s*(?:"[^"\n]*"|'[^'\n]*'|-?\d+|0x[\da-f]+)\s*,\s*${phrase}\s*\]`;
const named = String.raw`(?:\b(?:const|let|var)\s+([\w$]+)\s*=\s*(?:Object\.freeze\(\s*|new\s+Map\(\s*)?)?`;
/** @param {string} open @param {string} entry @param {string} close @param {number} [least] */
const table = (open, entry, close, least = 3) => new RegExp(String.raw`${named}${open}\s*${entry}(?:\s*,\s*${entry}){${least - 1},}\s*,?\s*${close}(\s*\[)?`, "gi");
const WORD_TABLE = table(String.raw`\{`, wordEntry, String.raw`\}`);
const OBJECT_TABLE = table(String.raw`\{`, objectEntry, String.raw`\}`);
// A list of pairs is a table from two: an object of two phrases is as often
// one message (`{title: …, detail: …}`), a list of two pairs never.
const PAIR_TABLE = table(String.raw`\[`, pairEntry, String.raw`\]`, 2);
const readsAsWords = text => /[A-Z]/.test(text.charAt(0)) && /[a-z]/.test(text) || /^[A-Za-z]+(?: [^ ]+)+$/.test(text);
const namedAsWords = name => /(?:WORDS|LABELS|TITLES)$/.test(name ?? "");
const phrasesIn = text => Array.from(text.matchAll(new RegExp(String.raw`(?:^|[:,\[{]\s*)(${phrase})(?=\s*[,}\]])`, "g")), match => match[1].slice(1, -1));
// Each table as `NAME` (or its keys or ids, when it has no name), less those
// whose phrases are not all words. An object of objects is one whose every
// entry holds a phrase; a list of pairs is read by its phrases alone.
const wordTables = source => {
    const code = uncommented(source);
    /** @param {RegExp} pattern @param {(text: string) => string[][]} groups @param {(text: string) => string[]} ids */
    const found = (pattern, groups, ids) => Array.from(code.matchAll(pattern)).filter(match => match[1] || match[2]).flatMap(match => {
        const sets = groups(match[0]);
        const words = sets.every(set => set.length) && (namedAsWords(match[1]) || sets.flat().every(readsAsWords));
        return words ? [match[1] ?? ids(match[0]).join(",")] : [];
    });
    const keysOf = (text, pattern) => Array.from(text.matchAll(new RegExp(String.raw`(${key})\s*:\s*${pattern}`, "g")), match => match[1]);
    return [
        ...found(WORD_TABLE, text => [phrasesIn(text)], text => keysOf(text, phrase)),
        ...found(OBJECT_TABLE, text => Array.from(text.slice(1).matchAll(/\{[^{}]*\}/g), inner => phrasesIn(inner[0])), text => keysOf(text.slice(1), String.raw`\{`)),
        ...found(PAIR_TABLE, text => [Array.from(text.matchAll(new RegExp(pairEntry, "gi")), pair => phrasesIn(pair[0]).at(-1) ?? "")],
            text => Array.from(text.matchAll(/\[\s*("[^"\n]*"|'[^'\n]*'|-?\d+|0x[\da-f]+)\s*,/gi), match => match[1])),
    ];
};
const WORD_TABLES_ALLOWED = new Set([
    // The demo's own panel text, which no keyboard stores.
    "webview/view/demo.mjs#DEMO_WORDS",
    // The Keys workbench's reach groups, what each says when it lists
    // nothing, and the routes a Custom keys or Macros reach line counts, are
    // the interface's own grouping of what the layers reach (reach-groups.mjs,
    // tab-reach.mjs); no keyboard stores them.
    "webview/view/reach-groups.mjs#GROUP_TITLES",
    "webview/view/tab-reach.mjs#EMPTY_WORDS",
    "webview/view/reach-groups.mjs#ROUTE_WORDS",
    // The commit bar's own question before it saves or sends, one part of
    // the sentence confirmText composes from the page's other words; it
    // names no value the keyboard stores, as the page's buttons do not.
    "webview/view/checks.mjs#ask",
]);

test("the word table check catches a table of words", () => {
    for (const sample of ["const KIND_WORDS = {0: \"Off\", 1: \"Directional\", 2: \"Scrolling\"};", "export const AXES = Object.freeze({\n    0: \"Vertical\",\n    1: \"Horizontal\",\n    2: \"Dominant axis\",\n});",
        "const word = {hold: \"on while held\", lock: \"locked on\", move: \"moved to\"}[kind];",
        "const COUNTS = {\n    combos: {label: \"Combos\", what: \"Combos on any layer.\"},\n    macros: {label: \"Macros\", what: \"Macro slots with steps.\", fixed: true},\n    keys: {label: \"Custom keys\", what: \"Named keys.\"},\n};",
        "export const STEPS = [\n    [\"text\", \"Text\"], [\"tap\", \"Key or chord\"], [\"delay\", \"Delay\"],\n];", "const ORDER = [[0, \"Off\"], [1, \"Directional\"], [2, \"Scrolling\"]];",
        "export const ROUTE_WORDS = Object.freeze({here: \"key\", branches: \"behaviour\", combos: \"combo\"});",
        "const TWO = [[\"up\", \"Up\"], [\"down\", \"Down\"]];", "const KINDS = new Map([[0, \"Off\"], [1, \"Directional\"], [2, \"Scrolling\"]]);"]) {
        assert.equal(wordTables(sample).length, 1, sample);
    }
    for (const sample of ["return {title: \"Screen unavailable\", detail: \"Choose a screen.\", state: \"unavailable\"};", "const TIERS = {tap: \"tap\", hold: \"hold\", long: \"longHold\"};",
        "const KEYS = {Space: \"KC_SPC\", Enter: \"KC_ENT\", Tab: \"KC_TAB\"};", "const words = {off: \"Off\", on: \"On\"};", "// const X = {a: \"A b\", b: \"B c\", c: \"C d\"};",
        "const MODES = {a: {id: \"x_y\", kind: \"tap\"}, b: {id: \"z\", kind: \"hold\"}, c: {id: \"w\", kind: \"long\"}};", "const SIZES = {a: {w: 1, h: 2}, b: {w: 3, h: 4}, c: {w: 5, h: 6}};",
        "const ALIASES = [[\"KC_A\", \"KC_B\"], [\"KC_C\", \"KC_D\"], [\"KC_E\", \"KC_F\"]];", "const SAID = {title: \"Save in progress\", detail: \"Wait for it.\"};",
        "const KEYS_BY = {here: \"key\", branches: \"behaviour\", combos: \"combo\"};"]) {
        assert.deepEqual(wordTables(sample), [], sample);
    }
});

test("the interface keeps no table of words of its own", () => {
    const violations = sources("webview").map(posix).flatMap(file => wordTables(read(file)).map(name => `${file}#${name}`))
        .filter(table => !WORD_TABLES_ALLOWED.has(table));
    assert.deepEqual(violations, [], "put the words in core/model/vocabulary.js and read them from model.vocabulary");
    const found = new Set(sources("webview").map(posix).flatMap(file => wordTables(read(file)).map(name => `${file}#${name}`)));
    assert.deepEqual([...WORD_TABLES_ALLOWED].filter(table => !found.has(table)), [], "drop an allowed table the check no longer finds");
});
