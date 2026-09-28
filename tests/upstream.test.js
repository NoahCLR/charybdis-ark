"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const {createHash} = require("node:crypto");
const {execFileSync} = require("node:child_process");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const manifest = require("../upstream/manifest.json");

test("imported contracts match their pinned provenance and checksums", () => {
    assert.equal(manifest.format, 1);
    const listed = new Set();
    for (const file of manifest.files) {
        assert.ok(!listed.has(file.path), `duplicate input: ${file.path}`);
        listed.add(file.path);
        const source = manifest.sources[file.source];
        assert.ok(source, `missing source for ${file.path}`);
        assert.match(source.commit, /^[a-f0-9]{40}$/);
        assert.match(file.sourceSha256, /^[a-f0-9]{64}$/);
        assert.ok(file.path.startsWith("upstream/"));
        const resolved = path.resolve(root, file.path);
        assert.ok(resolved.startsWith(path.join(root, "upstream") + path.sep));
        assert.equal(fs.lstatSync(resolved).isSymbolicLink(), false, file.path);
        assert.equal(createHash("sha256").update(fs.readFileSync(resolved)).digest("hex"), file.sha256, file.path);
        if (!file.transformation) assert.equal(file.sha256, file.sourceSha256, file.path);
    }
    for (const entry of fs.readdirSync(path.join(root, "upstream"), {recursive: true, withFileTypes: true})) {
        if (!entry.isFile()) continue;
        const relative = path.relative(root, path.join(entry.parentPath || entry.path, entry.name)).split(path.sep).join("/");
        if (["upstream/README.md", "upstream/AGENTS.md", "upstream/manifest.json"].includes(relative)) continue;
        assert.ok(listed.has(relative), `unrecorded upstream input: ${relative}`);
    }
});

test("catalog CLI reproduces its output from local inputs outside the app cwd", () => {
    const output = execFileSync(process.execPath, [path.join(root, "scripts/generate-keycode-catalog.js"), "--check"], {
        cwd: os.tmpdir(), encoding: "utf8",
    });
    assert.match(output, /catalog/);
});

test("authored relative file references stay inside this repository", () => {
    // Catch a return to ../../../../tests/fixtures or sibling QMK paths,
    // including filesystem reads, not just imports. Runtime is further fenced
    // by layering.test.js; isolated-checkout verification exercises resolution.
    for (const dir of ["core", "webview", "tests", "scripts"]) {
        for (const entry of fs.readdirSync(path.join(root, dir), {recursive: true, withFileTypes: true})) {
            if (!entry.isFile() || !/\.(?:js|mjs)$/.test(entry.name)) continue;
            const file = path.join(entry.parentPath || entry.path, entry.name);
            const source = fs.readFileSync(file, "utf8");
            for (const match of source.matchAll(/["'`](\.\.\/[^"'`\s]*)["'`]/g)) {
                const resolved = path.resolve(path.dirname(file), match[1]);
                assert.ok(resolved === root || resolved.startsWith(root + path.sep), `${path.relative(root, file)} reaches outside the repository: ${match[1]}`);
            }
        }
    }
});
