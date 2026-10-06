"use strict";

// The web build (scripts/build-web.js): a complete static site of hashed files,
// a page that names them itself, the headers it is published with, nothing a
// browser cannot have, and an entry whose every export exists. That the bundle behaves as Node does, and that the
// page works, is browser-tests/web-build.spec.js's and web-page.spec.js's.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {buildInfo, buildWeb, headerPolicy, pagePolicy, IMMUTABLE} = require("../scripts/build-web");
const {checkStaticSite, parseHeaders} = require("../scripts/check-static-site");

const temporary = () => fs.mkdtempSync(path.join(os.tmpdir(), "ark-web-"));
// The build writes its manifest beside the site, so each test builds into a
// folder inside its own temporary directory.
// The page's attributes as the browser reads them.
const unescape = (html) => html.replace(/&#(\d+);/g, (match, code) => String.fromCharCode(Number(code)));

test("every file the build writes is named by its content, and the manifest beside it says which is which", async () => {
    const root = temporary();
    const outdir = path.join(root, "web");
    try {
        fs.mkdirSync(outdir);
        fs.writeFileSync(path.join(outdir, "core-OLDRELEASE.js"), "");
        fs.writeFileSync(path.join(outdir, "manifest.json"), "{}");
        const build = {version: "1.2.3", commit: "abc123"};
        const manifest = await buildWeb({outdir, build});
        assert.deepEqual(Object.keys(manifest).sort(), ["core", "host", "panel", "styles", "worker"]);
        assert.match(manifest.core, /^core-[A-Z0-9]{8}\.js$/);
        assert.match(manifest.host, /^host-[A-Z0-9]{8}\.js$/);
        assert.match(manifest.worker, /^worker-[A-Z0-9]{8}\.js$/);
        assert.match(manifest.panel, /^panel-[A-Z0-9]{8}\.js$/);
        assert.match(manifest.styles, /^styles-[A-Z0-9]{8}\.css$/);
        assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, "web-manifest.json"), "utf8")), manifest, "the manifest is beside the site, never published");
        const written = fs.readdirSync(outdir).sort();
        const chunks = written.filter((name) => /^chunk-[A-Z0-9]{8}\.js$/.test(name));
        assert.ok(chunks.length, "host and core share their code");
        assert.deepEqual(written, [...Object.values(manifest), ...chunks, "_headers", "index.html"].sort(), "an earlier build's files are gone");

        // The same sources give the same names; the hash follows the content.
        assert.deepEqual(await buildWeb({outdir, build}), manifest);
        // core/ for a browser is the core entry with the chunk it shares with the host.
        const core = [manifest.core, ...chunks].map((file) => fs.readFileSync(path.join(outdir, file), "utf8")).join("\n");
        assert.ok(!core.includes("node-hid-adapter.js") && !/require\("(node:)?(fs|crypto|path)"\)/.test(core), "the core bundle carries no Node module");
        assert.ok(core.includes("web/no-native-hid.js"), "the native adapter's stand-in takes its place");
        const panel = fs.readFileSync(path.join(outdir, manifest.panel), "utf8");
        assert.ok(!panel.includes("core/"), "the panel bundle is the renderer alone");
        assert.deepEqual(checkStaticSite(outdir, {project: root}), [], "what the build writes is ready to publish");
    } finally {
        fs.rmSync(root, {recursive: true, force: true});
    }
});

test("the page names its files itself, carries its policy, and says what it was built from", async () => {
    const root = temporary();
    const outdir = path.join(root, "web");
    try {
        const manifest = await buildWeb({outdir, build: {version: "1.2.3", commit: "abc123"}});
        const page = fs.readFileSync(path.join(outdir, "index.html"), "utf8");
        assert.ok(!page.includes("{{"), "every name is filled in");
        assert.ok(page.includes(`href="./${manifest.styles}"`));
        // The host first: it defines acquireVsCodeApi before the panel asks for it.
        assert.ok(page.indexOf(`src="./${manifest.host}"`) < page.indexOf(`src="./${manifest.panel}"`));
        assert.match(page, /Charybdis Ark 1\.2\.3 \(abc123\)/);
        const policy = unescape(page.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1]);
        assert.equal(policy, pagePolicy());
        for (const rule of ["default-src 'none'", "script-src 'self'", "worker-src 'self'", "style-src 'self'", "connect-src 'none'"]) {
            assert.ok(policy.split("; ").includes(rule), rule);
        }
        assert.doesNotMatch(policy, /script-src[^;]*unsafe/, "no inline script");
        assert.doesNotMatch(page, /<script(?![^>]*\bsrc=)/, "every script is a file");
        // The page fetches nothing once loaded: the host names the worker it
        // starts, and nothing it bundles opens a connection.
        const host = fs.readFileSync(path.join(outdir, manifest.host), "utf8");
        assert.ok(host.includes(`"./${manifest.worker}"`), "the host starts the hashed worker");
        assert.ok(host.includes('"abc123"'), "the host carries the build it was made from");
        for (const file of [manifest.host, manifest.panel, ...fs.readdirSync(outdir).filter((name) => name.startsWith("chunk-"))]) {
            assert.doesNotMatch(fs.readFileSync(path.join(outdir, file), "utf8"), /\bfetch\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon/, file);
        }
    } finally {
        fs.rmSync(root, {recursive: true, force: true});
    }
});

test("the page is published with its policy as a header, and only hashed files are cached for good", async () => {
    const root = temporary();
    const outdir = path.join(root, "web");
    try {
        const manifest = await buildWeb({outdir, build: {version: "1.2.3", commit: "abc123"}});
        const rules = parseHeaders(fs.readFileSync(path.join(outdir, "_headers"), "utf8"));
        const header = (rule, name) => (rules.get(rule) || []).filter((line) => line.toLowerCase().startsWith(`${name.toLowerCase()}: `))
            .map((line) => line.slice(name.length + 2));

        // One policy: the header is the page's own, with what only a header can say.
        const page = fs.readFileSync(path.join(outdir, "index.html"), "utf8");
        const meta = unescape(page.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1]);
        assert.deepEqual(header("/*", "Content-Security-Policy"), [headerPolicy()]);
        assert.equal(headerPolicy(), `${meta}; frame-ancestors 'none'`);
        assert.ok(meta.split("; ").includes("connect-src 'none'"));
        assert.ok(!meta.includes("frame-ancestors"), "Chrome ignores frame-ancestors in a meta tag, and says so in the console");
        assert.deepEqual(header("/*", "Permissions-Policy"), ["hid=(self)"]);
        assert.deepEqual(header("/*", "X-Content-Type-Options"), ["nosniff"]);
        assert.deepEqual(header("/*", "Referrer-Policy"), ["no-referrer"]);
        assert.deepEqual(header("/*", "X-Robots-Tag"), ["noindex, nofollow"]);
        assert.match(page, /<meta name="robots" content="noindex, nofollow">/);

        // Pages joins a header named by two matching rules, so Cache-Control
        // comes from exact paths only: the page is revalidated on every load,
        // and each hashed file, and nothing else, is immutable.
        assert.deepEqual(header("/*", "Cache-Control"), []);
        assert.deepEqual(header("/", "Cache-Control"), ["no-cache"]);
        assert.deepEqual(header("/index.html", "Cache-Control"), ["no-cache"]);
        const hashed = fs.readdirSync(outdir).filter((name) => !["index.html", "_headers"].includes(name)).sort();
        assert.ok(Object.values(manifest).every((file) => hashed.includes(file)));
        const immutable = [...rules.keys()].filter((rule) => header(rule, "Cache-Control").includes(IMMUTABLE));
        assert.deepEqual(immutable, hashed.map((name) => `/${name}`));
        assert.ok(rules.size <= 100, "Pages reads at most 100 rules");
    } finally {
        fs.rmSync(root, {recursive: true, force: true});
    }
});

test("the commit comes from git unless the environment names it", () => {
    assert.deepEqual(buildInfo({ARK_COMMIT: "ci-1234"}), {version: require("../package.json").version, commit: "ci-1234"});
    assert.match(buildInfo({}).commit, /^([0-9a-f]{7,}(-dirty)?|unknown)$/);
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
