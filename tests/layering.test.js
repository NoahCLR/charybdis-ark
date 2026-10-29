"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const {builtinModules} = require("node:module");
const path = require("node:path");
const test = require("node:test");

// The structure only holds if something checks it. These assertions encode the
// rules in docs/architecture/README.md so a violating import fails here rather than being noticed
// later, which is how the 14,539-line file this app replaced came to exist.

const APP_ROOT = path.resolve(__dirname, "..");

// A layer may import from itself and from the layers listed here. `data` is
// inert vendored content with no dependencies of its own, so anything may read
// it without creating a cycle. `rules` is the shared firmware rules root
// (D-L73), outside core/: the layers that interpret a profile may run it, but
// not inert data, nor transport, which moves bytes without knowing what they mean.
const ALLOWED_IMPORTS = {
    data: [],
    transport: ["data"],
    schema: ["rules", "data"],
    protocol: ["transport", "schema", "rules", "data"],
    model: ["schema", "rules", "data"],
    session: ["transport", "protocol", "model", "schema", "rules", "data"],
};

// The shared rules root, and the one part of the interface that may run it:
// view/ turns the model into what is drawn, purely and under test, so a rule is
// interpreted there and nowhere else. The store, screens and DOM helpers reach
// a rule through view/; the shell runs core, which carries its own.
const RULES = "rules";
const RULES_IN_THE_INTERFACE = path.join("webview", "view");

// The packages a layer or root may name, exactly today's: transport's node-hid
// adapter, for Node scripts (the web build refuses it), and the shell's
// `buffer` polyfill, which the web build injects. Anything else, a Node
// built-in included, is refused.
const ALLOWED_PACKAGES = {
    transport: ["node-hid"],
    web: ["buffer/"],
};

// The one part of the interface the shell may import: webview/view/'s pure
// helpers, which the phone notice draws the keyboard and the footer with when
// it shows instead of the interface. The interface never imports the shell.
const INTERFACE_IN_THE_SHELL = RULES_IN_THE_INTERFACE;

function isNodeBuiltin(specifier) {
    return specifier.startsWith("node:") || builtinModules.includes(specifier);
}

function sourceFiles(dir, declarations = false) {
    const root = path.join(APP_ROOT, dir);
    if (!fs.existsSync(root)) {
        return [];
    }
    return fs
        .readdirSync(root, {recursive: true, withFileTypes: true})
        .filter((entry) => entry.isFile() && /\.(js|mjs|ts|mts|cts)$/.test(entry.name)
            && (declarations || !/\.d\.(ts|mts|cts)$/.test(entry.name)))
        .map((entry) => path.join(entry.parentPath || entry.path, entry.name));
}

function importsIn(file, source = fs.readFileSync(file, "utf8")) {
    return Array.from(source.matchAll(/\bfrom\s+(["'])([^"']+)\1/g)).map((m) => m[2]);
}

// What a module loads when it runs: static imports and re-exports,
// side-effect imports and require().
function runtimeImportsIn(file, source = fs.readFileSync(file, "utf8")) {
    return [
        ...source.matchAll(/\bfrom\s+(["'])([^"']+)\1/g),
        ...source.matchAll(/\bimport\s+(["'])([^"']+)\1/g),
        ...source.matchAll(/\brequire\(\s*(["'])([^"']+)\1\s*\)/g),
    ].map(match => match[2]);
}

// Every module a file names, at runtime or as a type: import() included.
function specifiersIn(file, source = fs.readFileSync(file, "utf8")) {
    return [...runtimeImportsIn(file, source), ...typeImportsIn(file, source)];
}

// The packages and Node built-ins a file names that its layer or root may not.
function refusedPackagesIn(file, source = fs.readFileSync(file, "utf8")) {
    const relative = path.relative(APP_ROOT, file).split(path.sep);
    const allowed = ALLOWED_PACKAGES[relative[0] === "core" ? relative[1] : relative[0]] ?? [];
    return specifiersIn(file, source).filter(target => !target.startsWith(".") && !allowed.includes(target));
}

// The relative imports between the shell and the interface that neither may
// make: the interface naming web/, or the shell naming the interface outside
// webview/view/. Runtime and type imports alike.
function refusedShellImportsIn(file, source = fs.readFileSync(file, "utf8")) {
    const from = path.relative(APP_ROOT, file).split(path.sep)[0];
    return specifiersIn(file, source).filter(target => {
        if (!target.startsWith(".")) return false;
        const relative = path.relative(APP_ROOT, path.resolve(path.dirname(file), target));
        if (from === "webview") return rootOf(file, target) === "web";
        if (from === "web") return rootOf(file, target) === "webview" && !relative.startsWith(`${INTERFACE_IN_THE_SHELL}${path.sep}`);
        return false;
    });
}

// The repository folder a relative specifier lands in: a core layer by its
// name, anything else by its root (`rules`, `contracts`, `webview`).
function rootOf(file, target) {
    const relative = path.relative(APP_ROOT, path.resolve(path.dirname(file), target)).split(path.sep);
    return relative[0] === "core" ? relative[1] : relative[0];
}

// import() as a type or an expression, a template literal included.
function typeImportsIn(file, source = fs.readFileSync(file, "utf8")) {
    const expressions = Array.from(source.matchAll(/\bimport\(\s*(["'`])([^"'`]+)\1\s*\)/g)).map(match => match[2]);
    return /\.d\.(ts|mts|cts)$/.test(file) ? [...expressions, ...importsIn(file, source)] : expressions;
}

test("type dependencies follow the runtime layer rules", () => {
    for (const file of sourceFiles("core", true)) {
        const layer = path.basename(path.dirname(file));
        for (const target of typeImportsIn(file)) {
            if (!target.startsWith(".")) continue;
            const relative = path.relative(APP_ROOT, path.resolve(path.dirname(file), target));
            if (relative.startsWith(`contracts${path.sep}`)) continue;
            assert.ok(relative.startsWith(`core${path.sep}`) || relative.startsWith(`${RULES}${path.sep}`), `${file} imports types outside core, rules or contracts: ${target}`);
            const targetLayer = rootOf(file, target);
            assert.ok(targetLayer === layer || ALLOWED_IMPORTS[layer]?.includes(targetLayer), `${file} imports ${targetLayer} types above ${layer}`);
        }
    }
    for (const file of sourceFiles("webview", true)) {
        for (const target of typeImportsIn(file)) {
            if (!target.startsWith(".")) continue;
            const relative = path.relative(APP_ROOT, path.resolve(path.dirname(file), target));
            assert.ok(relative.startsWith(`webview${path.sep}`) || relative.startsWith(`contracts${path.sep}`) || relative.startsWith(`${RULES}${path.sep}`), `${file} imports types outside the interface, the shared rules or posted contracts: ${target}`);
        }
    }
    // tsconfig.json checks core with its type tests, so they may bring in
    // nothing core/ could lean on unseen.
    const coreTypeTests = path.join(APP_ROOT, "tests", "types", "core.ts");
    for (const target of specifiersIn(coreTypeTests).concat(importsIn(coreTypeTests))) {
        const relative = path.relative(APP_ROOT, path.resolve(path.dirname(coreTypeTests), target));
        assert.ok(target.startsWith(".") && /^(core|contracts)$/.test(relative.split(path.sep)[0]), `tests/types/core.ts imports ${target}; core's type tests import only core/ and contracts/`);
    }
});

test("shared panel contracts are inert and depend only on themselves", () => {
    for (const file of sourceFiles("contracts", true)) {
        assert.ok(/\.d\.(ts|mts|cts)$/.test(file), `${file} puts executable code in contracts`);
        for (const target of typeImportsIn(file)) {
            assert.ok(target.startsWith("."), `${file} imports an external type dependency: ${target}`);
            const relative = path.relative(APP_ROOT, path.resolve(path.dirname(file), target));
            assert.ok(relative.startsWith(`contracts${path.sep}`), `${file} imports types outside contracts: ${target}`);
        }
    }
    for (const dir of ["core", "webview", "web", RULES]) {
        for (const file of sourceFiles(dir)) {
            for (const target of runtimeImportsIn(file)) {
                if (!target.startsWith(".")) continue;
                const relative = path.relative(APP_ROOT, path.resolve(path.dirname(file), target));
                assert.ok(!relative.startsWith(`contracts${path.sep}`), `${file} imports a panel contract at runtime`);
            }
        }
    }
});

test("core layers import only downward", () => {
    for (const file of sourceFiles("core")) {
        const layer = path.basename(path.dirname(file));
        const allowed = ALLOWED_IMPORTS[layer];
        assert.ok(allowed, `${file} sits in an undeclared layer: ${layer}`);

        for (const target of runtimeImportsIn(file)) {
            if (!target.startsWith(".")) {
                continue;
            }
            const targetLayer = rootOf(file, target);
            if (targetLayer === layer) {
                continue;
            }
            assert.ok(
                allowed.includes(targetLayer),
                `${path.relative(APP_ROOT, file)} imports ${targetLayer}/, which ${layer}/ may not depend on`
            );
        }
    }
});

test("each layer names only its own packages, and no Node built-in", () => {
    // Types included: a layer that names a package's types leans on it too.
    for (const dir of ["core", RULES, "webview", "web"]) {
        for (const file of sourceFiles(dir, true)) {
            assert.deepEqual(refusedPackagesIn(file), [], `${path.relative(APP_ROOT, file)} names a package or Node built-in its layer may not`);
        }
    }
    const planted = (where, source) => refusedPackagesIn(path.join(APP_ROOT, where), source);
    assert.deepEqual(planted("core/schema/x.js", 'const fs = require("node:fs"); require("node-hid");'), ["node:fs", "node-hid"]);
    assert.deepEqual(planted("core/transport/x.js", 'require("node-hid"); /** @type {import("node-hid").Device} */'), []);
    assert.deepEqual(planted("core/model/x.js", 'import {x} from "lodash";'), ["lodash"]);
    assert.deepEqual(planted("web/x.mjs", 'export {Buffer} from "buffer/"; import "buffer";'), ["buffer"]);
});

test("the interface never imports the shell, and the shell only the interface's view", () => {
    for (const dir of ["webview", "web"]) {
        for (const file of sourceFiles(dir, true)) {
            assert.deepEqual(refusedShellImportsIn(file), [], `${path.relative(APP_ROOT, file)} crosses between the shell and the interface`);
        }
    }
    const planted = (where, source) => refusedShellImportsIn(path.join(APP_ROOT, where), source);
    assert.deepEqual(planted("webview/x.mjs", 'import {x} from "../web/phone.mjs"; /** @type {import("../web/types.js").T} */'),
        ["../web/phone.mjs", "../web/types.js"]);
    assert.deepEqual(planted("web/x.mjs", 'import {x} from "../webview/store.mjs"; import {y} from "../webview/ui/frame.mjs";'),
        ["../webview/store.mjs", "../webview/ui/frame.mjs"]);
    assert.deepEqual(planted("web/x.mjs", 'import {GEO} from "../webview/view/geometry.mjs";'), []);
});

test("the webview stays a renderer", () => {
    // The interface renders the model the core posts and nothing else. It does
    // not reach into core/ at all — not even the vendored catalog, which
    // arrives inside the model like every other device fact.
    const forbidden = ["core/", "../core"];
    for (const file of sourceFiles("webview")) {
        for (const target of specifiersIn(file)) {
            assert.ok(
                !forbidden.some((prefix) => target.includes(prefix)),
                `${path.relative(APP_ROOT, file)} imports ${target}; the UI must render the posted model instead`
            );
        }
    }
});

test("shared rules import only each other and use nothing of a shell", () => {
    // Core loads a rule with require() and the interface by relative import, so
    // a rule is a synchronous ES module of plain computation over primitives:
    // nothing from core/, the interface or contracts/, no package, no Node
    // built-in and no page global. Checked on the code, comments set aside.
    const capabilities = [/\brequire\b/, /\bmodule\b/, /\bexports\b/, /\bprocess\b/, /\bBuffer\b/, /\b__(dirname|filename)\b/,
        /\bglobal(This)?\b/, /\bwindow\b/, /\bdocument\b/, /\bnavigator\b/, /\b(local|session)Storage\b/, /\bindexedDB\b/,
        /\bfetch\b/, /\bself\b/, /\bHTML\w*Element\b/, /\bnode:/];
    const files = sourceFiles(RULES, true);
    assert.ok(files.length, "the rules root has its modules");
    for (const file of files) {
        const name = path.relative(APP_ROOT, file);
        assert.ok(file.endsWith(".mjs"), `${name} is not an ES module`);
        for (const target of specifiersIn(file)) {
            assert.ok(target.startsWith(".") && rootOf(file, target) === RULES, `${name} imports ${target}; a rule imports only rules/`);
        }
        const code = fs.readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")
            .replace(/(["'])(?:\\.|(?!\1).)*\1/g, "\"\"");
        for (const capability of capabilities) {
            assert.ok(!capability.test(code), `${name} uses ${capability.source}; a rule runs in core and the page alike`);
        }
        assert.doesNotThrow(() => require(file), `${name} loads synchronously with require()`);
    }
});

test("only the interface's view runs a shared rule, and the shell none", () => {
    for (const dir of ["webview", "web"]) {
        for (const file of sourceFiles(dir, true)) {
            const inView = path.relative(APP_ROOT, file).startsWith(`${RULES_IN_THE_INTERFACE}${path.sep}`);
            for (const target of specifiersIn(file)) {
                if (!target.startsWith(".") || rootOf(file, target) !== RULES) continue;
                assert.ok(inView, `${path.relative(APP_ROOT, file)} imports ${target}; only webview/view/ runs a shared rule`);
            }
        }
    }
});

test("nothing we author mentions the firmware repository", () => {
    // The one sanctioned QMK reader is the catalog generator, which is a build
    // step producing a checked-in file rather than a runtime dependency.
    const authored = [...sourceFiles("core"), ...sourceFiles(RULES), ...sourceFiles("webview"), ...sourceFiles("web")];
    for (const file of authored) {
        const text = fs.readFileSync(file, "utf8");
        // Matched on word boundaries: the rule is about the firmware's files,
        // not about any identifier that happens to contain their spelling —
        // `config.heldModifiers` is not a reference to config.h.
        for (const marker of [/\bkeymap\.c\b/, /\brgb_config\.c\b/, /\bconfig\.h\b/, /bastardkb-qmk/, /qmk_firmware/, /\.hjson\b/]) {
            assert.ok(
                !marker.test(text),
                `${path.relative(APP_ROOT, file)} references ${marker.source}; this app must not read the repository`
            );
        }
    }
});

test("the UI cannot touch the filesystem", () => {
    // The one rule is enforced as a capability, not as wording: whatever a
    // tooltip says, the interface must have no way to read or write a file.
    // No Node built-in by any import, static, dynamic or require(), nor the
    // calls themselves.
    const capabilities = ["readFileSync", "writeFileSync", "child_process"];
    const used = (file, text) => [...new Set([...specifiersIn(file, text).filter(isNodeBuiltin),
        ...capabilities.filter(capability => text.includes(capability))])];
    for (const file of [...sourceFiles("webview"), ...sourceFiles(RULES), ...sourceFiles("web")]) {
        assert.deepEqual(used(file, fs.readFileSync(file, "utf8")), [],
            `${path.relative(APP_ROOT, file)} reaches Node; the UI must stay a renderer`);
    }
    const planted = path.join(APP_ROOT, "webview", "ui", "x.mjs");
    assert.deepEqual(used(planted, 'import fs from "node:fs";'), ["node:fs"]);
    assert.deepEqual(used(planted, 'import {spawn} from "child_process";'), ["child_process"]);
    assert.deepEqual(used(planted, 'export * from "fs/promises"; import "os";'), ["fs/promises", "os"]);
    assert.deepEqual(used(planted, 'const fs = await import("node:fs"); const p = await import(`path`);'), ["node:fs", "path"]);
    assert.deepEqual(used(planted, 'const fs = require("fs");'), ["fs"]);
    assert.deepEqual(used(planted, 'import {Buffer} from "buffer/";'), []);
});

test("every core module has a test in the matching layer", () => {
    const untested = [];
    for (const file of sourceFiles("core")) {
        const layer = path.basename(path.dirname(file));
        const name = path.basename(file, ".js");
        const expected = path.join(APP_ROOT, "tests", layer, `${name}.test.js`);
        if (!fs.existsSync(expected)) {
            untested.push(`${layer}/${name}`);
        }
    }
    // transport.test.js covers the coordinator and both adapters together.
    const covered = new Set(["transport/request-coordinator", "transport/fake-device-adapter", "transport/device-adapter"]);
    assert.deepEqual(untested.filter((entry) => !covered.has(entry)), []);
});

test("every shared rule has a test", () => {
    const untested = sourceFiles(RULES).map((file) => path.basename(file, ".mjs"))
        .filter((name) => !fs.existsSync(path.join(APP_ROOT, "tests", RULES, `${name}.test.mjs`)));
    assert.deepEqual(untested, []);
});
