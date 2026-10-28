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

test("the page's profile file chooser uses the portable document's byte limit", () => {
    assert.equal(require("../../core/session/panel-loop").FILE_MAX_BYTES, require("../../core/model/portable-profile").FILE_MAX_BYTES);
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
// a block's `first` or a helper's result.
const KEYCODE_LITERAL = /(?<![\w.])0x[2-7][\da-f]{3}(?![\w.])/gi;
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
    for (const sample of ["const code = 0x5220 | layer;", "if (code >= 0x4000 && code <= 0x4FFF) return;", "return 0x7e00;"]) {
        assert.equal(uncommented(sample).match(KEYCODE_LITERAL)?.length, sample.includes("0x4000") ? 2 : 1, sample);
    }
    for (const sample of ["const code = QK.MOMENTARY.first | layer;", "const mask = 0x1fff;", "const crc = 0xffffffff;", "// LT(1, KC_A) is 0x4104"]) {
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
// (`[["up", "Up"], …]`). A table named as words (`…_WORDS`, `…_LABELS`,
// `…_TITLES`) counts whatever its phrases look like.
const phrase = String.raw`(?:"[^"\n]*"|'[^'\n]*'|\x60[^\x60\n$]*\x60)`;
const key = String.raw`(?:[\w$]+|"[^"\n]*"|'[^'\n]*'|\[[\w$.]+\])`;
const wordEntry = String.raw`${key}\s*:\s*${phrase}`;
const objectEntry = String.raw`${key}\s*:\s*\{[^{}]*\}`;
const pairEntry = String.raw`\[\s*(?:"[^"\n]*"|'[^'\n]*'|-?\d+|0x[\da-f]+)\s*,\s*${phrase}\s*\]`;
const named = String.raw`(?:\b(?:const|let|var)\s+([\w$]+)\s*=\s*(?:Object\.freeze\(\s*)?)?`;
const table = (open, entry, close) => new RegExp(String.raw`${named}${open}\s*${entry}(?:\s*,\s*${entry}){2,}\s*,?\s*${close}(\s*\[)?`, "gi");
const WORD_TABLE = table(String.raw`\{`, wordEntry, String.raw`\}`);
const OBJECT_TABLE = table(String.raw`\{`, objectEntry, String.raw`\}`);
const PAIR_TABLE = table(String.raw`\[`, pairEntry, String.raw`\]`);
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
    // The Keys workbench's reach groups, and the routes a Custom keys or
    // Macros reach line counts, are the interface's own grouping of what the
    // layers reach (reach-groups.mjs, reach.mjs); no keyboard stores them.
    "webview/view/reach-groups.mjs#GROUP_TITLES",
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
        "export const ROUTE_WORDS = Object.freeze({here: \"key\", branches: \"behaviour\", combos: \"combo\"});"]) {
        assert.equal(wordTables(sample).length, 1, sample);
    }
    for (const sample of ["return {title: \"Screen unavailable\", detail: \"Choose a screen.\", state: \"unavailable\"};", "const TIERS = {tap: \"tap\", hold: \"hold\", long: \"longHold\"};",
        "const KEYS = {Space: \"KC_SPC\", Enter: \"KC_ENT\", Tab: \"KC_TAB\"};", "const words = {off: \"Off\", on: \"On\"};", "// const X = {a: \"A b\", b: \"B c\", c: \"C d\"};",
        "const MODES = {a: {id: \"x_y\", kind: \"tap\"}, b: {id: \"z\", kind: \"hold\"}, c: {id: \"w\", kind: \"long\"}};", "const SIZES = {a: {w: 1, h: 2}, b: {w: 3, h: 4}, c: {w: 5, h: 6}};",
        "const ALIASES = [[\"KC_A\", \"KC_B\"], [\"KC_C\", \"KC_D\"], [\"KC_E\", \"KC_F\"]];", "const TWO = [[\"up\", \"Up\"], [\"down\", \"Down\"]];",
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
