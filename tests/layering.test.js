"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

// The structure only holds if something checks it. These assertions encode the
// rules in docs/architecture/README.md so a violating import fails here rather than being noticed
// later, which is how the 14,539-line file this app replaced came to exist.

const APP_ROOT = path.resolve(__dirname, "..");

// A layer may import from itself and from the layers listed here. `data` is
// inert vendored content with no dependencies of its own, so anything may read
// it without creating a cycle.
const ALLOWED_IMPORTS = {
    data: [],
    transport: ["data"],
    schema: ["data"],
    protocol: ["transport", "schema", "data"],
    model: ["schema", "data"],
    session: ["transport", "protocol", "model", "schema", "data"],
};

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

function requiresIn(file) {
    return Array.from(fs.readFileSync(file, "utf8").matchAll(/require\("([^"]+)"\)/g)).map((m) => m[1]);
}

function importsIn(file) {
    return Array.from(fs.readFileSync(file, "utf8").matchAll(/\bfrom\s+(["'])([^"']+)\1/g)).map((m) => m[2]);
}

function typeImportsIn(file) {
    const source = fs.readFileSync(file, "utf8");
    const expressions = Array.from(source.matchAll(/\bimport\(\s*(["'])([^"']+)\1\s*\)/g)).map(match => match[2]);
    return /\.d\.(ts|mts|cts)$/.test(file) ? [...expressions, ...importsIn(file)] : expressions;
}

test("type dependencies follow the runtime layer rules", () => {
    for (const file of sourceFiles("core", true)) {
        const layer = path.basename(path.dirname(file));
        for (const target of typeImportsIn(file)) {
            assert.notEqual(target, "vscode", `${file} imports the VS Code shell's types below it`);
            if (!target.startsWith(".")) continue;
            const relative = path.relative(APP_ROOT, path.resolve(path.dirname(file), target));
            if (relative.startsWith(`contracts${path.sep}`)) continue;
            assert.ok(relative.startsWith(`core${path.sep}`), `${file} imports types outside core or contracts: ${target}`);
            const targetLayer = relative.split(path.sep)[1];
            assert.ok(targetLayer === layer || ALLOWED_IMPORTS[layer]?.includes(targetLayer), `${file} imports ${targetLayer} types above ${layer}`);
        }
    }
    for (const file of sourceFiles("webview", true)) {
        for (const target of typeImportsIn(file)) {
            if (!target.startsWith(".")) continue;
            const relative = path.relative(APP_ROOT, path.resolve(path.dirname(file), target));
            assert.ok(relative.startsWith(`webview${path.sep}`) || relative.startsWith(`contracts${path.sep}`), `${file} imports types outside the interface or posted contracts: ${target}`);
        }
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
    for (const dir of ["core", "webview", "web"]) {
        for (const file of sourceFiles(dir)) {
            for (const target of [...requiresIn(file), ...importsIn(file)]) {
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

        for (const target of requiresIn(file)) {
            if (!target.startsWith(".")) {
                continue;
            }
            const resolved = path.resolve(path.dirname(file), target);
            const targetLayer = path.basename(path.dirname(resolved));
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

test("the extension shell reaches core only through session/", () => {
    // What a shell does with a panel is core/session/panel-loop.js; a shell that
    // needed a lower layer would be doing the loop's work itself.
    const core = requiresIn(path.join(APP_ROOT, "extension.js")).filter((target) => target.startsWith("./core/"));
    assert.ok(core.length, "extension.js runs the shared panel loop");
    for (const target of core) {
        assert.ok(target.startsWith("./core/session/"), `extension.js imports ${target}; only core/session/ is the shell's`);
    }
});

test("only the extension shell knows about VS Code", () => {
    for (const dir of ["core", "scripts", "webview", "web"]) {
        for (const file of sourceFiles(dir)) {
            const text = fs.readFileSync(file, "utf8");
            assert.ok(
                !/require\("vscode"\)|from "vscode"/.test(text),
                `${path.relative(APP_ROOT, file)} imports vscode; only extension.js may`
            );
        }
    }
});

test("the webview stays a renderer", () => {
    // The interface renders the model the core posts and nothing else. It does
    // not reach into core/ at all — not even the vendored catalog, which
    // arrives inside the model like every other device fact.
    const forbidden = ["core/", "../core"];
    for (const file of sourceFiles("webview")) {
        for (const target of [...requiresIn(file), ...importsIn(file)]) {
            assert.ok(
                !forbidden.some((prefix) => target.includes(prefix)),
                `${path.relative(APP_ROOT, file)} imports ${target}; the UI must render the posted model instead`
            );
        }
    }
});

test("nothing we author mentions the firmware repository", () => {
    // The one sanctioned QMK reader is the catalog generator, which is a build
    // step producing a checked-in file rather than a runtime dependency.
    const authored = [...sourceFiles("core"), ...sourceFiles("webview"), ...sourceFiles("web"), path.join(APP_ROOT, "extension.js")];
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
    for (const file of sourceFiles("webview")) {
        const text = fs.readFileSync(file, "utf8");
        for (const capability of ['require("node:fs")', 'require("fs")', "readFileSync", "writeFileSync", "child_process"]) {
            assert.ok(
                !text.includes(capability),
                `${path.relative(APP_ROOT, file)} uses ${capability}; the ported UI must stay a renderer`
            );
        }
    }
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
