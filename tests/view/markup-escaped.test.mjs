import {test} from "node:test";
import assert from "node:assert/strict";
import {readdirSync, readFileSync} from "node:fs";
import {dirname, join, relative, resolve} from "node:path";
import {fileURLToPath} from "node:url";

// Markup is built from template strings, and every value from the keyboard, a
// file or the shell reaches it through esc() (CODING_STANDARDS.md). This reads
// every webview module and judges each ${…} in a markup template (one with a
// tag in it) and each value handed to el(), innerHTML, outerHTML or
// insertAdjacentHTML. A value passes when it is
// - esc(…), a literal, a number by construction (arithmetic, a comparison,
//   Number(…), Math.…(…), .length, a callback's index…) or a markup template,
//   which is judged where it is written;
// - a conditional, ||, ?? or + whose printed parts pass, or && whose last does;
// - an array of passing items, or a .map() whose callback returns passing
//   values, joined with a passing separator;
// - a name, call or property bound only to passing values, as the function
//   scope it is read in sees it: a const, a function whose every return
//   passes, an object literal's property, a list's element, a named function's
//   parameter when every caller in the webview passes a passing argument;
//   imports are followed into the module they name;
// - a call to a helper in SAFE_HELPERS, or an expression in PASSES_ON_PURPOSE.
// Anything else is reported with its file and line: escape it, or say here why
// it is safe. It reads source, so it is syntactic: it cannot see types; a
// function handed on as a value makes its parameters unknown, as a.b = x or
// a[i] = x makes a; callers outside webview/ are not seen.

// Helpers whose results are markup or text that needs no escaping, where the
// check cannot see it from their returns.
const SAFE_HELPERS = {
    css: "a CSS colour, rgb() of three numbers (lib/colour.mjs)",
};

// Interpolations that pass for a reason the check cannot see, per module.
/** @type {[file: string, expressions: string[], why: string][]} */
const PASSES_ON_PURPOSE = [
    ["webview/lib/dom.mjs", ["String(markup).trim()"], "el() itself: what callers hand it is judged at each call"],
    ["webview/ui/checks.mjs", ["show(check)", "source(check)"], "the Show and source buttons the review overlay passes in, built from escaped templates there"],
    ["webview/ui/custom-keys.mjs", ['keyFields(model, key).join("")'], "an empty slot and placedOn()'s layer chips, both markup templates"],
    ["webview/ui/device.mjs", ["value"], "kv() rows hold markup their callers escaped, as its @param says"],
    ["webview/ui/groups.mjs", ['group.rows.join("")'], "each tab's table rows, markup templates built by that tab"],
    ["webview/ui/hover.mjs", ['own.join("")', 'reachSections(model, layer, target, -1, [], {foot: false}).join("")', 'sections.join("")'], "reachSections() returns the hover card's sections, markup templates it pushes"],
    ["webview/ui/keys/behaviours-tab.mjs", ["note"], "viewBehaviourNote() and comboNote(): escaped layer names and marked combo keys"],
    ["webview/ui/keys/combos-tab.mjs", ["reachedBy"], "keysReach() and reachText(): marked key names and escaped layer names"],
    ["webview/ui/keys/macros-tab.mjs", ["reachedBy"], "reachLabel(): marked key names and escaped layer names"],
    ["webview/ui/keys/pointing-tab.mjs", ["reachedBy"], "keysReach() and branchReach(): marked key names and escaped layer names"],
    ["webview/ui/keys/key-tab.mjs", ["stackRows(model, layer, position)"], "the layer stack's rows, markup templates joined"],
    ["webview/ui/layerbar.mjs", ["tint"], "a style attribute holding layerSwatch()'s css() colour"],
    ["webview/ui/macros/editor.mjs", ["placedOn(model, slot)", "chips"], "layer chips, markup templates of escaped names and layer swatches"],
    ["webview/ui/pointing/form-controls.mjs", ["options.labelHtml"], "the movement arms' labels: an arrow constant and an escaped label (pointing/movement.mjs)"],
    ["webview/ui/review-items.mjs", ['head.map(row).join("")', 'rest.map(row).join("")', "show", "discard"], "field rows from field(), and the Show and Discard buttons the review overlay builds"],
    ["webview/ui/frame.mjs", ["definition.icon", "liveStatus(draft)"], "a screen's authored SVG icon (view/screens.mjs), and the live status lines, markup templates"],
    ["webview/view/geometry.mjs", ['keys.join("")'], "the outline's key rectangles, templates of GEO numbers"],
];

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

// --- Tokens ------------------------------------------------------------------
// Enough of JavaScript to find template literals and the expressions in them.
// A token is {t, v, start, end}: its kind t (id, num, str, re, p for a
// punctuator, tpl for a template with its text and expression parts), its
// text v and its source offsets.

const BEFORE_EXPRESSION = new Set(["return", "typeof", "case", "do", "else", "in", "of", "new", "delete", "void", "throw", "instanceof", "yield", "await"]);
const PUNCTUATORS = [">>>=", "...", "===", "!==", "**=", "<<=", ">>=", ">>>", "??=", "&&=", "||=", "=>", "==", "!=", "<=", ">=",
    "&&", "||", "??", "?.", "++", "--", "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=", "**", "<<", ">>"];
const OPEN = new Set(["(", "[", "{"]), CLOSE = new Set([")", "]", "}"]);

function tokenize(source) {
    let at = 0;
    const regexAllowed = (previous) => !previous || (previous.t === "p" && !CLOSE.has(previous.v))
        || (previous.t === "id" && BEFORE_EXPRESSION.has(previous.v));
    const fail = (what, start) => { throw new Error(`${what} at offset ${start}`); };
    function tokens(inTemplate) {
        const out = [];
        let depth = 0;
        while (at < source.length) {
            const c = source[at], start = at;
            if (/\s/.test(c)) { at++; continue; }
            if (source.startsWith("//", at)) { const end = source.indexOf("\n", at); at = end < 0 ? source.length : end; continue; }
            if (source.startsWith("/*", at)) { const end = source.indexOf("*/", at + 2); if (end < 0) fail("unterminated comment", start); at = end + 2; continue; }
            if (c === '"' || c === "'") {
                for (at++; source[at] !== c; at += source[at] === "\\" ? 2 : 1) if (at >= source.length || source[at] === "\n") fail("unterminated string", start);
                at++;
                out.push({t: "str", v: source.slice(start, at), start, end: at});
            } else if (c === "`") {
                out.push(template());
            } else if (/[A-Za-z_$]/.test(c)) {
                while (/[\w$]/.test(source[at] ?? "")) at++;
                out.push({t: "id", v: source.slice(start, at), start, end: at});
            } else if (/\d/.test(c) || (c === "." && /\d/.test(source[at + 1] ?? ""))) {
                while (/[\w.]/.test(source[at] ?? "")) at++;
                out.push({t: "num", v: source.slice(start, at), start, end: at});
            } else if (c === "/" && regexAllowed(out.at(-1))) {
                let inClass = false;
                for (at++; inClass || source[at] !== "/"; at++) {
                    if (at >= source.length || source[at] === "\n") fail("unterminated regular expression", start);
                    if (source[at] === "\\") at++;
                    else if (source[at] === "[") inClass = true;
                    else if (source[at] === "]") inClass = false;
                }
                for (at++; /[a-z]/.test(source[at] ?? "");) at++;
                out.push({t: "re", v: source.slice(start, at), start, end: at});
            } else {
                if (c === "{") depth++;
                if (c === "}" && depth-- === 0 && inTemplate) { at++; return out; }
                const v = PUNCTUATORS.find((p) => source.startsWith(p, at)) ?? c;
                at += v.length;
                out.push({t: "p", v, start, end: at});
            }
        }
        if (inTemplate) fail("unterminated template expression", at);
        return out;
    }
    function template() {
        const start = at++, parts = [];
        let text = "";
        for (;;) {
            if (at >= source.length) fail("unterminated template", start);
            if (source[at] === "\\") { text += source.slice(at, at + 2); at += 2; continue; }
            if (source[at] === "`") { at++; break; }
            if (source.startsWith("${", at)) {
                parts.push({text});
                text = "";
                at += 2;
                parts.push({expr: tokens(true)});
                continue;
            }
            text += source[at++];
        }
        parts.push({text});
        return {t: "tpl", parts, start, end: at};
    }
    return tokens(false);
}

// --- Token lists ---------------------------------------------------------------

const punct = (token) => token?.t === "p" ? token.v : "";
const isMarkup = (tpl) => tpl.parts.some((part) => "text" in part && /<\/?[a-z]/i.test(part.text));
function closing(tokens, i) {
    for (let j = i, depth = 0; j < tokens.length; j++) {
        if (OPEN.has(punct(tokens[j]))) depth++;
        if (CLOSE.has(punct(tokens[j])) && --depth === 0) return j;
    }
    return -1;
}
function opening(tokens, i) {
    for (let j = i, depth = 0; j >= 0; j--) {
        if (CLOSE.has(punct(tokens[j]))) depth++;
        if (OPEN.has(punct(tokens[j])) && --depth === 0) return j;
    }
    return -1;
}
// The pieces between top-level binary operators in `ops`.
function splitTop(tokens, ops) {
    const pieces = [[]];
    let depth = 0;
    tokens.forEach((token, i) => {
        const v = punct(token);
        if (OPEN.has(v)) depth++;
        if (CLOSE.has(v)) depth--;
        const previous = tokens[i - 1];
        const binary = ops.includes(",") || (previous && (previous.t !== "p" || CLOSE.has(previous.v)));
        if (depth === 0 && ops.includes(v) && binary) pieces.push([]);
        else pieces.at(-1).push(token);
    });
    return pieces;
}
// An expression from i up to a top-level ; or , or the end of its block.
function until(tokens, i) {
    const expr = [];
    for (let j = i, depth = 0; j < tokens.length; j++) {
        const v = punct(tokens[j]);
        if (OPEN.has(v)) depth++;
        if (CLOSE.has(v) && depth-- === 0) break;
        if (depth === 0 && (v === ";" || v === ",")) break;
        expr.push(tokens[j]);
    }
    return expr;
}
const wrapped = (tokens) => tokens.length > 1 && OPEN.has(punct(tokens[0])) && closing(tokens, 0) === tokens.length - 1;
// c ? a : b at the top level.
function conditional(tokens) {
    for (let i = 0, depth = 0, question = -1, nested = 0; i < tokens.length; i++) {
        const v = punct(tokens[i]);
        if (OPEN.has(v)) depth++;
        if (CLOSE.has(v)) depth--;
        if (depth) continue;
        if (v === "?") { if (question < 0) question = i; else nested++; }
        if (v === ":" && question >= 0 && nested-- === 0) return [tokens.slice(question + 1, i), tokens.slice(i + 1)];
    }
    return null;
}
// A primary (name, literal or bracketed group) followed by .name, [..] and (..) links.
function chain(tokens) {
    const first = tokens[0];
    if (!first || (first.t === "p" && !OPEN.has(first.v))) return null;
    const head = OPEN.has(first.v) ? tokens.slice(0, closing(tokens, 0) + 1) : [first];
    if (!head.length) return null;
    const links = [];
    let i = head.length;
    while (i < tokens.length) {
        const v = punct(tokens[i]);
        if ((v === "." || v === "?.") && tokens[i + 1]?.t === "id") { links.push({name: tokens[i + 1].v}); i += 2; }
        else if (v === "?." && (tokens[i + 1]?.v === "(" || tokens[i + 1]?.v === "[")) i++;
        else if (v === "(" || v === "[") { const j = closing(tokens, i); links.push({[v === "(" ? "call" : "index"]: tokens.slice(i + 1, j)}); i = j + 1; }
        else return null;
    }
    return {head, links};
}
// What a function literal returns (every return in its body, nested ones too), or null.
// The same literal always gives the same results, so they name the function.
const RESULTS = new WeakMap();
function functionResults(fn) {
    const first = fn[0]?.v === "async" ? fn[1] : fn[0];
    if (!first) return null;
    if (!RESULTS.has(first)) RESULTS.set(first, resultsOf(fn));
    return RESULTS.get(first);
}
function resultsOf(fn) {
    let i = fn[0]?.v === "async" ? 1 : 0;
    if (fn[i]?.v === "function") {
        if (fn[++i]?.t === "id") i++;
        const body = closing(fn, i) + 1;
        return returns(fn.slice(body, closing(fn, body) + 1));
    }
    if (fn[i]?.t === "id" && fn[i + 1]?.v === "=>") i += 2;
    else if (fn[i]?.v === "(" && fn[closing(fn, i) + 1]?.v === "=>") i = closing(fn, i) + 2;
    else return null;
    const body = fn.slice(i);
    return body[0]?.v === "{" && closing(body, 0) === body.length - 1 ? returns(body) : [body];
}
const returns = (block) => block.flatMap((token, i) => token.t === "id" && token.v === "return" ? [until(block, i + 1)] : []);
const names = (tokens) => tokens.filter((token) => token.t === "id").map((token) => token.v);

// --- What each module binds a name to -------------------------------------------

const DECLARE = new Set(["const", "let", "var"]);
const ASSIGN = new Set(["=", "+=", "-=", "||=", "??=", "&&="]);
const CALLBACKS = new Set(["map", "flatMap", "forEach", "filter", "some", "every", "find", "findIndex"]);
const MODULE_SCOPE = Object.freeze({start: -1, end: Infinity});
const isMember = (token) => [".", "?."].includes(punct(token));

// Every name a module binds, each binding with the function scope it is seen
// in ({start, end} source offsets): {value} | {fn: results} | {unknown} |
// {from, name} (an import) | {namespace} | {element: list, property?} (a
// callback's or for-of's item) | {of, property} (destructured from a value) |
// {param: {owner, fn, at}, property?} (a named function's parameter, which
// holds what its callers pass). `fallback` is a default value.
function bindings(tokens) {
    const map = new Map(), scopes = [], assignments = [];
    const scopeAt = (at) => scopes.reduce((inner, scope) => scope.start < at && at <= scope.end && scope.start > inner.start ? scope : inner, MODULE_SCOPE);
    const bind = (name, binding, scope) => map.set(name, [...(map.get(name) || []), {...binding, scope}]);

    // Walks every token list, templates' expressions included.
    const walk = (list, visit) => list.forEach((token, i) => {
        if (token.t === "tpl") token.parts.forEach((part) => part.expr && walk(part.expr, visit));
        visit(list, i);
    });
    // A function literal at token i (`function` or `=>`): its parameter
    // list, where the literal starts (`open`) and its extent.
    function functionAt(list, i) {
        const {t, v} = list[i];
        if (t === "id" && v === "function") {
            const open = list[i + 1]?.t === "id" ? i + 2 : i + 1, close = closing(list, open), end = closing(list, close + 1);
            return {params: list.slice(open + 1, close), open: i, scope: {start: list[i].start, end: list[end].end}, literal: list.slice(i, end + 1)};
        }
        if (t !== "p" || v !== "=>") return null;
        const begin = list[i - 1]?.t === "id" ? i - 1 : opening(list, i - 1);
        const body = list[i + 1]?.v === "{" ? list.slice(i + 1, closing(list, i + 1) + 1) : until(list, i + 1);
        const last = body.at(-1) ?? list[i];
        return {params: list[i - 1]?.t === "id" ? [list[i - 1]] : list.slice(begin + 1, i - 1), open: begin,
            scope: {start: list[begin].start, end: last.end}, literal: list.slice(begin, i + 1 + body.length)};
    }
    walk(tokens, (list, i) => { const fn = functionAt(list, i); if (fn) scopes.push(fn.scope); });

    const value = (expr) => {
        const results = functionResults(expr);
        return results ? {fn: results} : {value: expr};
    };
    // The list a callback starting at `open` is called on, or null.
    function receiverOf(list, open) {
        if (list[open - 1]?.v !== "(" || !CALLBACKS.has(list[open - 2]?.v) || !isMember(list[open - 3])) return null;
        // Walk back over the receiver: names, .names, calls and indexes.
        let j = open - 4;
        for (;;) {
            if (CLOSE.has(punct(list[j]))) {
                j = opening(list, j) - 1;
                if (CLOSE.has(punct(list[j])) || (list[j]?.t === "id" && !BEFORE_EXPRESSION.has(list[j].v))) continue;
                break;
            }
            if (list[j]?.t !== "id") break;
            j--;
            if (!isMember(list[j])) break;
            j--;
        }
        const receiver = list.slice(j + 1, open - 3);
        return receiver.length ? receiver : null;
    }
    // The name a member chain ending at token `end` starts from: a in a.b[c].d.
    function rootOf(list, end) {
        for (let j = end; ;) {
            if (punct(list[j]) === "]" || punct(list[j]) === ")") { j = opening(list, j) - 1; continue; }
            if (list[j]?.t !== "id") return null;
            if (!isMember(list[j - 1])) return list[j];
            j -= 2;
        }
    }
    // The name a function literal starting at `open` is declared or assigned as.
    function nameOf(list, open) {
        if (list[open]?.v === "function" && list[open + 1]?.t === "id") return list[open + 1].v;
        const at = list[open - 1]?.v === "async" ? open - 1 : open;
        return list[at - 1]?.v === "=" && list[at - 2]?.t === "id" && !isMember(list[at - 3]) ? list[at - 2].v : null;
    }
    // Binds the names in a pattern (a parameter, or a declaration's target)
    // to what `source` says each holds.
    function pattern(param, source, scope) {
        const [first, second] = param;
        if (source && first?.t === "id" && (param.length === 1 || second?.v === "=")) bind(first.v, {...source, fallback: param.slice(2)}, scope);
        else if (source && first?.v === "{" && closing(param, 0) === param.length - 1) {
            splitTop(param.slice(1, -1), [","]).forEach((entry) => {
                const colon = entry[1]?.v === ":" ? 2 : 0;
                const local = entry[colon];
                if (local?.t === "id" && entry[0].t === "id" && (entry.length === colon + 1 || entry[colon + 1]?.v === "=")) {
                    bind(local.v, {...source, property: entry[0].v, fallback: entry.slice(colon + 2)}, scope);
                } else names(entry).forEach((name) => bind(name, {unknown: true}, scope));
            });
        } else names(param).forEach((name) => bind(name, {unknown: true}, scope));
    }

    walk(tokens, (list, i) => {
        const {t, v} = list[i], previous = list[i - 1], next = list[i + 1];
        const fn = functionAt(list, i);
        if (fn) {
            // A callback's first parameter is an element of the list it is
            // called on, its second the index: a number.
            const receiver = receiverOf(list, fn.open), name = nameOf(list, fn.open);
            const owner = functionResults(fn.literal);
            splitTop(fn.params, [","]).forEach((param, at) => {
                if (receiver && at === 1 && param.length === 1) bind(param[0].v, {value: [{t: "num", v: "0"}]}, fn.scope);
                else pattern(param, receiver && at === 0 ? {element: receiver} : name && owner ? {param: {owner, fn: name, at}} : null, fn.scope);
            });
            if (t === "id" && next?.t === "id") bind(next.v, {fn: owner}, scopeAt(list[i].start));
        } else if (t === "id" && v === "import" && next?.v === "{") {
            const end = closing(list, i + 1), from = list[end + 2].v.slice(1, -1);
            splitTop(list.slice(i + 2, end), [","]).filter((piece) => piece.length).forEach((piece) => bind(piece.at(-1).v, {from, name: piece[0].v}, MODULE_SCOPE));
        } else if (t === "id" && v === "import" && next?.v === "*") {
            bind(list[i + 3].v, {namespace: list[i + 5].v.slice(1, -1)}, MODULE_SCOPE);
        } else if (t === "id" && v === "catch" && next?.v === "(") {
            names(list.slice(i + 2, closing(list, i + 1))).forEach((name) => bind(name, {unknown: true}, scopeAt(list[i].start)));
        } else if (t === "id" && DECLARE.has(v)) {
            const scope = scopeAt(list[i].start);
            for (let j = i + 1; ; j++) {
                const target = list[j];
                if (!target || (!OPEN.has(punct(target)) && target.t !== "id")) break;
                const end = OPEN.has(punct(target)) ? closing(list, j) : j;
                const operator = list[end + 1]?.v;
                const held = operator === "=" || operator === "of" ? until(list, end + 2) : null;
                // const x = value; for (const x of list); const {a, b: c} = value
                const source = !held ? null : operator === "of" ? {element: held} : target.t === "id" ? value(held) : {of: held};
                if (target.t === "id" && source && !source.of) bind(target.v, source, scope);
                else if (target.t === "id" && !operator) {} // declared here, assigned later
                else if (target.v === "{" && source?.of) pattern(list.slice(j, end + 1), {of: held}, scope);
                else names(list.slice(j, end + 1)).forEach((name) => bind(name, {unknown: true}, scope));
                j = end + 1 + (held ? 1 + held.length : 0);
                if (list[j]?.v !== ",") break;
            }
        } else if (t === "id" && next?.v === "." && ["push", "unshift"].includes(list[i + 2]?.v) && list[i + 3]?.v === "(" && !isMember(previous)) {
            // list.push(a, b) puts a and b in the list.
            assignments.push([v, {value: [{t: "p", v: "["}, ...list.slice(i + 4, closing(list, i + 3)), {t: "p", v: "]"}]}, list[i].start]);
        } else if (t === "id" && ["=", "+=", "||=", "??="].includes(punct(next)) && !isMember(previous) && !DECLARE.has(previous?.v)) {
            assignments.push([v, value(until(list, i + 2)), list[i].start]);
        } else if (t === "p" && ASSIGN.has(v) && (punct(previous) === "]" || (previous?.t === "id" && isMember(list[i - 2])))) {
            // a.b = x or a[i] = x changes what a holds: its literal no longer says.
            const root = rootOf(list, i - 1);
            if (root) assignments.push([root.v, {unknown: true}, root.start]);
        } else if (t === "id" && v === "Object" && isMember(next) && list[i + 2]?.v === "assign" && list[i + 4]?.t === "id") {
            assignments.push([list[i + 4].v, {unknown: true}, list[i + 4].start]);
        }
    });
    // An assignment changes the name it is seen to assign, wherever that was declared.
    for (const [name, binding, at] of assignments) bind(name, binding, visible(map, name, at)[0]?.scope ?? MODULE_SCOPE);
    return map;
}
// The bindings of `name` seen at offset `at` (module scope when undefined):
// those of the innermost scope that binds it.
function visible(map, name, at) {
    const seen = (map.get(name) || []).filter(({scope}) => at === undefined ? scope === MODULE_SCOPE : scope.start < at && at <= scope.end);
    const inner = seen.reduce((best, {scope}) => scope.start > best.start ? scope : best, MODULE_SCOPE);
    return seen.filter(({scope}) => scope === inner);
}

// --- Judging ---------------------------------------------------------------------

const NUMBER_OPERATORS = ["-", "*", "/", "%", "**", "|", "&", "^", "<<", ">>", ">>>", "===", "!==", "==", "!=", "<", ">", "<=", ">="];
const NUMBER_CALLS = /^(?:Number|Boolean|parseInt|parseFloat|Math\.\w+|Number\.\w+|Array\.isArray)$/;
const NUMBER_METHODS = new Set(["toFixed", "toPrecision", "indexOf", "lastIndexOf", "findIndex", "includes", "has", "some", "every", "test", "startsWith", "endsWith"]);
const LITERALS = new Set(["true", "false", "null", "undefined"]);

function analyse(files, read, {helpers = SAFE_HELPERS} = {}) {
    const modules = new Map();
    function load(file) {
        if (!modules.has(file)) {
            const source = read(file);
            let tokens;
            try { tokens = tokenize(source); } catch (error) { throw new Error(`${file}: ${error.message}`); }
            modules.set(file, {file, source, tokens, bindings: bindings(tokens)});
        }
        return modules.get(file);
    }
    const target = (module, from) => from.startsWith(".") ? load(resolve(dirname(module.file), from)) : null;
    // Each answer is worked out once; one asked again while it is being worked
    // out (a cycle) gets `onCycle`.
    const PENDING = Symbol("pending");
    let tokenIds = 0;
    const span = (expr) => expr.length ? `${expr[0].id ??= ++tokenIds}:${expr.at(-1).id ??= ++tokenIds}` : "";
    function remembered(compute, key, onCycle) {
        const cache = new Map();
        return (...args) => {
            const at = key(...args);
            if (cache.has(at)) { const known = cache.get(at); return known === PENDING ? onCycle : known; }
            cache.set(at, PENDING);
            const result = compute(...args);
            cache.set(at, result);
            return result;
        };
    }

    // The values `name` seen at offset `at` in `module` may hold, each as
    // {module, value} or {module, fn}; null when unknown. Without `at`, the
    // module's own top-level name (an export).
    const bound = (module, name, at) => {
        const list = visible(module.bindings, name, at);
        return list.length ? boundIn(module, name, list) : null;
    };
    const boundIn = remembered(boundTo, (module, name, list) => `${module.file}\0${name}\0${list[0].scope.start}`, null);
    function boundTo(module, name, list) {
        const found = [];
        for (const binding of list) {
            if (binding.unknown) return null;
            if (binding.namespace) return [{namespace: target(module, binding.namespace)}];
            const fallback = binding.fallback?.length ? [{module, value: binding.fallback}] : [];
            let held;
            if (binding.of) held = step({module, value: binding.of}, {name: binding.property});
            else if (binding.element) {
                const elements = elementsOf(module, binding.element);
                const all = elements && (binding.property ? elements.map((item) => step(item, {name: binding.property})) : elements);
                held = all && !all.includes(null) ? all.flat() : null;
            } else if (binding.param) held = argumentsFor(module, binding.param, binding.property);
            else if (binding.from) {
                const into = target(module, binding.from);
                held = into && bound(into, binding.name);
            } else held = [{module, ...binding}];
            if (!held) return null;
            found.push(...held, ...fallback);
        }
        return found;
    }
    // Where a function is called: every reference to it, in every module, by
    // the names that module sees it by. Null when it is also handed on as a
    // value, so its callers are unknown.
    let ownerIds = 0;
    const callSites = remembered(sitesOf, (module, owner) => String(owner.id ??= ++ownerIds), null);
    function sitesOf(module, owner) {
        const found = [];
        const refersTo = (caller, binding) => binding.fn === owner && caller === module
            || Boolean(binding.from && (bound(target(caller, binding.from) ?? module, binding.name) || []).some((item) => item.fn === owner));
        for (const caller of modules.values()) {
            const names = new Set([...caller.bindings].filter(([, list]) => list.some((binding) => refersTo(caller, binding))).map(([name]) => name));
            const namespaces = new Set([...caller.bindings].filter(([, list]) => list.some((binding) => binding.namespace && target(caller, binding.namespace) === module)).map(([name]) => name));
            const viaNamespace = (tokens, i) => isMember(tokens[i - 1]) && tokens[i - 2]?.t === "id" && namespaces.has(tokens[i - 2].v)
                && visible(module.bindings, tokens[i].v).some((binding) => binding.fn === owner);
            const visit = (tokens) => {
                let skipUntil = -1;
                tokens.forEach((token, i) => {
                    if (token.t === "tpl") token.parts.forEach((part) => part.expr && visit(part.expr));
                    // Import and export lists name the function without using it.
                    if ((token.v === "import" || token.v === "export") && tokens[i + 1]?.v === "{") skipUntil = closing(tokens, i + 1);
                    if (i <= skipUntil || token.t !== "id" || ["function", "const", "let", "var"].includes(tokens[i - 1]?.v)) return;
                    const named = names.has(token.v) && !isMember(tokens[i - 1]) && visible(caller.bindings, token.v, token.start).some((binding) => refersTo(caller, binding));
                    if (!named && !viaNamespace(tokens, i)) return;
                    if (tokens[i + 1]?.v === "(") found.push({module: caller, args: tokens.slice(i + 2, closing(tokens, i + 1))});
                    else if (tokens[i - 1]?.v === "(" && CALLBACKS.has(tokens[i - 2]?.v) && tokens[i + 1]?.v === ")") found.push({module: caller, callback: true});
                    else found.push(null);
                });
            };
            visit(caller.tokens);
        }
        return found.includes(null) ? null : found;
    }
    // What callers pass a named function's parameter (or that property of it).
    const argumentsFor = remembered(passedTo, (module, {owner, at}, property) => `${owner.id ??= ++ownerIds}\0${at}\0${property}`, null);
    function passedTo(module, {owner, at}, property) {
        const calls = callSites(module, owner);
        if (!calls) return null;
        const passed = [];
        for (const call of calls) {
            if (call.callback) {
                if (at === 1 && !property) passed.push({module: call.module, value: [{t: "num", v: "0"}]});
                else return null;
                continue;
            }
            const args = splitTop(call.args, [","]);
            if (args.slice(0, at + 1).some((arg) => arg[0]?.v === "...")) return null;
            const arg = call.args.length ? args[at] : undefined;
            if (!arg?.length) { passed.push({module, value: [{t: "id", v: "undefined"}]}); continue; }
            if (!property) { passed.push({module: call.module, value: arg}); continue; }
            // A destructured parameter: that property of what is passed.
            if (arg[0].v === "{" && closing(arg, 0) === arg.length - 1) {
                const entries = splitTop(arg.slice(1, -1), [","]).filter((piece) => piece.length);
                if (entries.some((piece) => piece[0].v === "...")) return null;
                const given = objectProperty(entries, property);
                passed.push({module: call.module, value: given ?? [{t: "id", v: "undefined"}]});
                continue;
            }
            const found = step({module: call.module, value: arg}, {name: property});
            if (!found) return null;
            passed.push(...found);
        }
        return passed;
    }
    // The elements of a list: of an array literal, or of one a name or call
    // holds, through .filter(), .slice() and the like.
    function elementsOf(module, expr) {
        let list = expr;
        for (;;) {
            const open = punct(list.at(-1)) === ")" ? opening(list, list.length - 1) : -1;
            if (open < 2 || !["filter", "slice", "reverse", "sort"].includes(list[open - 1].v) || ![".", "?."].includes(punct(list[open - 2]))) break;
            list = list.slice(0, open - 2);
        }
        const held = values(module, list);
        if (!held) return null;
        const all = held.map((item) => item.value ? step(item, {index: []}) : null);
        return all.includes(null) ? null : all.flat();
    }
    // The values an expression may evaluate to, each {module, value} or
    // {module, fn}, looking through names, calls and properties; null when unknown.
    const values = remembered(valuesOf, (module, expr) => span(expr), null);
    function valuesOf(module, expr) {
        if (!expr.length) return null;
        if (wrapped(expr) && expr[0].v === "(") return values(module, expr.slice(1, -1));
        const branches = conditional(expr) || splitTop(expr, ["||", "??"]);
        if (branches.length > 1) {
            const all = branches.map((branch) => values(module, branch));
            return all.includes(null) ? null : all.flat();
        }
        const results = functionResults(expr);
        if (results) return [{module, fn: results}];
        const parsed = chain(expr);
        const group = parsed && parsed.head[0].v === "(" && parsed.links.length;
        if (!parsed || (parsed.head[0].t !== "id" && !group)) return [{module, value: expr}];
        let current = group ? values(module, parsed.head) : bound(module, parsed.head[0].v, parsed.head[0].start);
        for (const link of parsed.links) {
            if (!current) return null;
            const next = current.map((item) => step(item, link));
            current = next.includes(null) ? null : next.flat();
        }
        return current;
    }
    // What one link (.name, [index] or (call)) of a chain gives on a value.
    const stepValue = remembered((item, link) => stepFrom(item, link), (item, link) => `${span(item.value)}\0${link.name ?? (link.call ? "()" : "[]")}`, null);
    const step = (item, link) => item.value ? stepValue(item, link) : stepFrom(item, link);
    function stepFrom(item, link) {
        if (item.namespace) return "name" in link ? bound(item.namespace, link.name) : null;
        if (link.call) return item.fn ? item.fn.map((result) => ({module: item.module, value: result})) : null;
        const expr = item.value;
        if (!expr) return null;
        if (OPEN.has(expr[0].v) && expr[0].v !== "(" && closing(expr, 0) === expr.length - 1) {
            const entries = splitTop(expr.slice(1, -1), [","]).filter((piece) => piece.length);
            if (entries.some((piece) => piece[0].v === "...")) return null;
            if (expr[0].v === "[") return link.index ? entries.map((piece) => ({module: item.module, value: piece})) : null;
            const properties = link.index ? entries.map((piece) => piece.slice(piece.findIndex((token) => token.v === ":") + 1))
                : [objectProperty(entries, link.name)];
            if (properties.includes(null)) return null;
            const all = properties.map((property) => values(item.module, property));
            return all.includes(null) ? null : all.flat();
        }
        // Any other expression: find what it holds first.
        const inner = values(item.module, expr);
        if (!inner) return null;
        const all = inner.map((value) => value.value === expr ? null : step(value, link));
        return all.includes(null) ? null : all.flat();
    }
    // The value of `name` among an object literal's entries, or null.
    function objectProperty(entries, name) {
        for (const piece of entries) {
            if (piece[0]?.v === name && piece.length === 1) return piece;
            if (piece[0]?.v === name && piece[1]?.v === ":") return piece.slice(2);
            if (piece[0]?.v === name && piece[1]?.v === "(") return [{t: "id", v: "function"}, ...piece];
        }
        return null;
    }
    // The parts of `expr` that may print unescaped text into markup; [] when it is safe.
    const unsafe = remembered(unsafeIn, (module, expr) => span(expr), []);
    function unsafeIn(module, expr) {
        if (!expr.length) return [];
        if (wrapped(expr) && expr[0].v === "(") return unsafe(module, expr.slice(1, -1));
        const branches = conditional(expr);
        if (branches) return branches.flatMap((branch) => unsafe(module, branch));
        for (const ops of [["||", "??"], ["&&"], NUMBER_OPERATORS, ["+"]]) {
            const pieces = splitTop(expr, ops);
            if (pieces.length < 2) continue;
            if (ops === NUMBER_OPERATORS) return [];
            return (ops[0] === "&&" ? pieces.slice(-1) : pieces).flatMap((piece) => unsafe(module, piece));
        }
        const first = expr[0];
        if (["!", "-", "+", "~"].includes(punct(first)) || first.v === "typeof") return [];
        if (expr.length === 1 && (first.t === "str" || first.t === "num" || LITERALS.has(first.v))) return [];
        if (expr.length === 1 && first.t === "tpl") return isMarkup(first) ? [] : first.parts.flatMap((part) => part.expr ? unsafe(module, part.expr) : []);
        if (first.v === "[" && closing(expr, 0) === expr.length - 1) return items(module, expr) ? [] : [expr];
        const parsed = chain(expr);
        if (parsed && safeChain(module, parsed)) return [];
        // Look through what the expression names: every value it may hold must pass.
        const found = parsed?.head[0].t === "id" || (parsed?.head[0].v === "(" && parsed.links.length) ? values(module, expr) : null;
        const pass = Boolean(found?.length) && found.every((item) => item.value && item.value !== expr
            && unsafe(item.module, item.value).length === 0);
        return pass ? [] : [expr];
    }
    function safeChain(module, {head, links}) {
        const last = links.at(-1), before = links.at(-2);
        if (!last) return false;
        if (last.name === "length" || last.name === "size") return true;
        if (!last.call) return false;
        const callee = head.length === 1 && head[0].t === "id" && links.slice(0, -1).every((link) => "name" in link)
            ? [head[0].v, ...links.slice(0, -1).map((link) => link.name)].join(".") : null;
        if (callee === "esc" || NUMBER_CALLS.test(callee ?? "")) return true;
        if (callee === "String") return unsafe(module, last.call).length === 0;
        if (callee && helpers[callee]) return true;
        if (before && NUMBER_METHODS.has(before.name)) return true;
        if (before?.name === "join") return unsafe(module, last.call).length === 0 && joined(module, head, links.slice(0, -2));
        // A helper reached through a namespace import: ns.helper(…).
        const path = callee?.split(".") ?? [];
        return path.length === 2 && Boolean(helpers[path[1]]) && Boolean(bound(module, path[0], head[0].start)?.[0]?.namespace);
    }
    // What .join() is called on: passing items, or a .map() of a passing callback.
    function joined(module, head, links) {
        let i = links.length;
        while (i >= 2 && links[i - 1].call && ["filter", "slice", "reverse", "sort", "flat"].includes(links[i - 2].name)) i -= 2;
        if (i >= 2 && links[i - 1].call && ["map", "flatMap"].includes(links[i - 2].name)) return callbackPasses(module, links[i - 1].call);
        if (i) return false;
        if (head[0].v === "[") return items(module, head);
        // A list held by a name: what it was made from, and what was pushed on it.
        const found = values(module, head);
        return Boolean(found?.length) && found.every((item) => {
            if (!item.value) return false;
            if (item.value[0].v === "[" && closing(item.value, 0) === item.value.length - 1) return items(item.module, item.value);
            const parsed = chain(item.value);
            return Boolean(parsed) && item.value !== head && joined(item.module, parsed.head, parsed.links);
        });
    }
    const items = (module, array) => splitTop(array.slice(1, -1), [","]).every((piece) =>
        !piece.length || unsafe(module, piece[0].v === "..." ? piece.slice(1) : piece).length === 0);
    function callbackPasses(module, args) {
        const callback = splitTop(args, [","])[0];
        if (callback.length === 1 && callback[0].t === "id") {
            if (callback[0].v === "esc" || helpers[callback[0].v]) return true;
            const found = bound(module, callback[0].v, callback[0].start);
            return Boolean(found?.length) && found.every((item) => item.fn && item.fn.every((result) => unsafe(item.module, result).length === 0));
        }
        const results = functionResults(callback);
        return Boolean(results) && results.every((result) => unsafe(module, result).length === 0);
    }

    // Where markup is made: markup templates, and what el() and the HTML setters are handed.
    function sink(tokens, i) {
        const {t, v} = tokens[i], previous = tokens[i - 1], next = tokens[i + 1];
        if (t !== "id") return null;
        if (v === "el" && next?.v === "(" && ![".", "?."].includes(punct(previous)) && previous?.v !== "function") return splitTop(tokens.slice(i + 2, closing(tokens, i + 1)), [","])[0];
        if ((v === "innerHTML" || v === "outerHTML") && [".", "?."].includes(punct(previous)) && ["=", "+="].includes(punct(next))) return until(tokens, i + 2);
        if (v === "insertAdjacentHTML" && next?.v === "(") return splitTop(tokens.slice(i + 2, closing(tokens, i + 1)), [","])[1] ?? null;
        return null;
    }
    files.forEach(load);
    const violations = [];
    for (const file of files) {
        const module = load(file);
        const name = relative(ROOT, file).split("\\").join("/");
        const report = (expr) => violations.push({file: name, line: module.source.slice(0, expr[0].start).split("\n").length,
            expression: module.source.slice(expr[0].start, expr.at(-1).end).replace(/\s+/g, " ")});
        const visit = (tokens) => tokens.forEach((token, i) => {
            if (token.t === "tpl") {
                for (const part of token.parts) if (part.expr && isMarkup(token)) unsafe(module, part.expr).forEach(report);
                for (const part of token.parts) if (part.expr) visit(part.expr);
            }
            const handed = sink(tokens, i);
            if (handed) unsafe(module, handed).forEach(report);
        });
        visit(module.tokens);
    }
    return violations;
}

// --- The checks ----------------------------------------------------------------------

const sources = (directory) => readdirSync(directory, {withFileTypes: true}).flatMap((entry) =>
    entry.isDirectory() ? sources(join(directory, entry.name)) : entry.name.endsWith(".mjs") ? [join(directory, entry.name)] : []);

// Judges inline samples as webview/ui/sample.mjs, importing from a sample sibling.
function sample(code, sibling = "") {
    const files = {[join(ROOT, "webview/ui/sample.mjs")]: code, [join(ROOT, "webview/ui/sibling.mjs")]: sibling};
    return analyse([join(ROOT, "webview/ui/sample.mjs")], (file) => files[file] ?? "").map(({expression}) => expression);
}
const webview = (options) => analyse(sources(join(ROOT, "webview")), (file) => readFileSync(file, "utf8"), options);
const onPurpose = ({file, expression}) => PASSES_ON_PURPOSE.some(([where, expressions]) => where === file && expressions.includes(expression));

test("the markup check catches values that are not escaped", () => {
    assert.deepEqual(sample("const node = el(`<b>${model.name}</b>`);"), ["model.name"]);
    assert.deepEqual(sample("card.innerHTML = `<p title=\"${label}\">${esc(text)}</p>`;"), ["label"]);
    assert.deepEqual(sample("const row = (key) => `<li>${key.label}</li>`;"), ["key.label"]);
    assert.deepEqual(sample("card.innerHTML = describe(key);\nconst describe = (key) => key.name;"), ["describe(key)"]);
    assert.deepEqual(sample("const words = `${count} keys`;\nnode.append(el(`<p>${words}</p>`));", ""), ["words"]);
    assert.deepEqual(sample("el(`<ul>${rows.map((row) => `<li>${row.name}</li>`).join(\"\")}</ul>`);"), ["row.name"]);
    assert.deepEqual(sample("el(`<p>${names.join(\" + \")}</p>`);"), ["names.join(\" + \")"]);
    assert.deepEqual(sample("node.insertAdjacentHTML(\"beforeend\", summary);"), ["summary"]);
    assert.deepEqual(sample("import {named} from \"./sibling.mjs\";\nel(`<p>${named(key)}</p>`);", "export const named = (key) => key.name;"), ["named(key)"]);
    // A parameter holds what every caller passes, so one bare argument is enough.
    assert.deepEqual(sample("const cell = (text) => `<td>${text}</td>`;\nel(`<tr>${cell(esc(a))}${cell(b)}</tr>`);"), ["text"]);
    assert.deepEqual(sample("const cell = (text) => `<td>${text}</td>`;\nconst cells = [a].map(cell);"), ["text"]);
    // A literal changed after it was made no longer says what it holds.
    assert.deepEqual(sample("const shown = {label: \"x\"};\nshown.label = model.name;\nel(`<b>${shown.label}</b>`);"), ["shown.label"]);
    assert.deepEqual(sample("const names = [\"x\"];\nnames[0] = model.name;\nel(`<b>${names[0]}</b>`);"), ["names[0]"]);
});

test("the markup check passes escaped values, markup helpers and numbers", () => {
    const passing = [
        "const node = el(`<b data-f=\"key:${esc(key.name)}\">${esc(model.name)}</b>`);",
        "el(`<p>${keyNameMarked(model, keyName(position), keyMeaning(position))}</p>`);\nexport const keyNameMarked = (model, text, keycode) => esc(text);",
        "el(`<p>${actionMarked(model, keycode)}</p>`);\nexport const actionMarked = (model, keycode) => `<span class=\"mk\">${esc(keycode)}</span>`;",
        "el(`<p>${comboBadge(model, combo.badge)}</p>`);\nfunction comboBadge(model, badge) { return `<i>${esc(badge)}</i>`; }",
        "el(`<input ${editable ? \"\" : \"disabled\"} value=\"${esc(value)}\">`);",
        "el(`<p>${items.length} of ${limit - used} · ${Math.round(share * 100)}% ${Number(value)}</p>`);",
        "el(`<ul>${rows.map((row, index) => `<li data-at=\"${index}\">${esc(row.name)}</li>`).join(\"\")}</ul>`);",
        "const GEO = {keyW: 58};\nel(`<rect width=\"${GEO.keyW}\" x=\"${GEO.keyW / 2}\">`);",
        "const shown = open ? `<b>${esc(name)}</b>` : esc(name);\nel(`<p>${shown}</p>`);",
        "let html = \"\";\nhtml += `<li>${esc(name)}</li>`;\nlist.innerHTML = html;",
        "import {css} from \"./sibling.mjs\";\nel(`<p style=\"color:${css(colour)}\">${[\"a\", esc(b)].join(\" · \")}</p>`);",
        "const words = `${esc(count)} keys`;\nnode.append(el(`<p>${words}</p>`));",
        "const cell = (text) => `<td>${text}</td>`;\nel(`<tr>${cell(esc(a))}${cell(\"b\")}</tr>`);",
        "const TABS = [{id: \"key\", label: \"Key\"}];\nel(`${TABS.map((tab) => `<b data-tab=\"${tab.id}\">${tab.label}</b>`).join(\"\")}`);",
        "function shown() { const label = esc(x); return el(`<b>${label}</b>`); }\nfunction other(label) { return label; }",
    ];
    for (const code of passing) assert.deepEqual(sample(code), [], code);
});

test("every webview value interpolated into markup is escaped or safe", () => {
    const violations = webview().filter((violation) => !onPurpose(violation)).map(({file, line, expression}) => `${file}:${line} ${expression}`);
    assert.deepEqual(violations, [], "wrap the value in esc(), or say in this test why it is safe");
});

test("every value passed on purpose, and every safe helper, is still needed", () => {
    const reported = webview();
    for (const [file, expressions, why] of PASSES_ON_PURPOSE) {
        assert.ok(why.length > 10, `${file}: say why`);
        for (const expression of expressions) assert.ok(reported.some((violation) => violation.file === file && violation.expression === expression), `${file}: ${expression} no longer needs passing`);
    }
    for (const [name, why] of Object.entries(SAFE_HELPERS)) {
        assert.ok(why.length > 10, `${name}: say why`);
        const without = Object.fromEntries(Object.entries(SAFE_HELPERS).filter(([other]) => other !== name));
        assert.ok(webview({helpers: without}).length > reported.length, `${name} is no longer needed`);
    }
});
