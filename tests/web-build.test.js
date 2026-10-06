"use strict";

// The web build (scripts/build-web.js): hashed names and a manifest naming
// them, nothing a browser cannot have, and an entry whose every export exists.
// That the bundle behaves as Node does is browser-tests/web-build.spec.js's.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {buildWeb} = require("../scripts/build-web");

const temporary = () => fs.mkdtempSync(path.join(os.tmpdir(), "ark-web-"));

test("every file the build writes is named by its content, and the manifest says which is which", async () => {
    const outdir = temporary();
    try {
        fs.writeFileSync(path.join(outdir, "core-OLDRELEASE.js"), "");
        const manifest = await buildWeb({outdir});
        assert.deepEqual(Object.keys(manifest).sort(), ["core", "panel", "styles"]);
        assert.match(manifest.core, /^core-[A-Z0-9]{8}\.js$/);
        assert.match(manifest.panel, /^panel-[A-Z0-9]{8}\.js$/);
        assert.match(manifest.styles, /^styles-[A-Z0-9]{8}\.css$/);
        assert.deepEqual(JSON.parse(fs.readFileSync(path.join(outdir, "manifest.json"), "utf8")), manifest);
        assert.deepEqual(fs.readdirSync(outdir).sort(), [...Object.values(manifest), "manifest.json"].sort(), "an earlier build's files are gone");

        // The same sources give the same names; the hash follows the content.
        assert.deepEqual(await buildWeb({outdir}), manifest);
        const core = fs.readFileSync(path.join(outdir, manifest.core), "utf8");
        assert.ok(!core.includes("node-hid-adapter.js") && !/require\("(node:)?(fs|crypto|path)"\)/.test(core), "the core bundle carries no Node module");
        assert.ok(core.includes("web/no-native-hid.js"), "the native adapter's stand-in takes its place");
        const panel = fs.readFileSync(path.join(outdir, manifest.panel), "utf8");
        assert.ok(!panel.includes("core/"), "the panel bundle is the renderer alone");
    } finally {
        fs.rmSync(outdir, {recursive: true, force: true});
    }
});

test("the build fails when something would pull node-hid, fs or vscode into a bundle", async () => {
    const outdir = temporary();
    try {
        for (const [name, source] of [
            ["node-hid", 'module.exports = require("node-hid");'],
            ["fs", 'module.exports = require("fs");'],
            ["node:fs", 'module.exports = require("node:fs");'],
            ["node:crypto", 'module.exports = require("node:crypto");'],
            ["vscode", 'module.exports = require("vscode");'],
            ["the node-hid adapter's own dependency", `module.exports = require(${JSON.stringify(path.join(__dirname, "..", "core", "transport", "node-hid-adapter.js"))});`],
        ]) {
            const entry = path.join(outdir, "entry.js");
            fs.writeFileSync(entry, source);
            if (name.startsWith("the node-hid adapter")) {
                // From outside core/ the adapter is not swapped, so its own
                // require("node-hid") is what the build has to refuse.
                await assert.rejects(buildWeb({outdir: path.join(outdir, "out"), entries: {core: entry}}), /node-hid cannot be in the web build/);
                continue;
            }
            await assert.rejects(buildWeb({outdir: path.join(outdir, "out"), entries: {core: entry}}), new RegExp(`${name} cannot be in the web build`), name);
        }
    } finally {
        fs.rmSync(outdir, {recursive: true, force: true});
    }
});

test("the entry exports what it names, under Node as in the bundle", async () => {
    const core = await import("../web/core.mjs");
    const missing = Object.entries(core).filter(([, value]) => value === undefined).map(([name]) => name);
    assert.deepEqual(missing, []);
    assert.equal(core.Buffer, Buffer, "under Node the entry's Buffer is Node's own");
    assert.equal(typeof core.ProfileDraftSession, "function");
    assert.equal(typeof core.profileBlob.decodeProfileBlob, "function");
});

test("without an adapter, the browser's device service fails with a stable code", () => {
    const {NodeHidDeviceAdapter} = require("../web/no-native-hid");
    assert.throws(() => new NodeHidDeviceAdapter(), {code: "NATIVE_MODULE_UNAVAILABLE"});
});
