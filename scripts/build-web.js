"use strict";

// The web build: the web version of Ark as a complete static site in
// dist/web/, ready to publish as it is. The VS Code extension never uses it and
// has no build step; core/ and webview/ stay the sources it runs as they are.
//
//     index.html                the page (web/index.html, with the names below)
//     host-<hash>.js            the page's host (web/page.mjs), with the core it runs
//     core-<hash>.js            core/ for a browser host (web/core.mjs)
//     chunk-<hash>.js           what host and core share
//     worker-<hash>.js          the host's clock (web/sleep-worker.js)
//     panel-<hash>.js           the panel (webview/app.mjs)
//     styles-<hash>.css         its styles
//     manifest.json             which hashed file is which, for tests and tools
//
// Every file but index.html carries a hash of its content in its name, so a
// release can never be served a previous release's file. index.html names them
// itself — the page fetches nothing, manifest.json included — and says which
// version and commit it was built from: package.json's version, and the commit
// from git or from ARK_COMMIT.
//
// The build fails if node-hid, fs, vscode or any other Node built-in would
// reach a bundle. node-hid-adapter.js is the one module core/ loads that cannot
// run in a browser; web/no-native-hid.js takes its place.

const {execFileSync} = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const {builtinModules} = require("node:module");
const esbuild = require("esbuild");

const APP_ROOT = path.resolve(__dirname, "..");
const OUTDIR = path.join(APP_ROOT, "dist", "web");
const NODE_HID_ADAPTER = path.join(APP_ROOT, "core", "transport", "node-hid-adapter.js");
const NO_NATIVE_HID = path.join(APP_ROOT, "web", "no-native-hid.js");

// A current Chrome, which WebHID needs anyway.
const TARGET = ["chrome120"];
const NODE_BUILTINS = new Set(builtinModules);
const HOST_PACKAGES = ["vscode", "node-hid"];
// What a bundle may take from node_modules: the buffer package and its two dependencies.
const PACKAGES = {core: ["buffer", "base64-js", "ieee754"], panel: [], worker: []};

const browserOnly = {
    name: "browser-only",
    setup(build) {
        build.onResolve({filter: /.*/}, (args) => {
            const name = args.path.split("/")[0];
            if (NODE_BUILTINS.has(args.path) || args.path.startsWith("node:") || HOST_PACKAGES.includes(name)) {
                const importer = args.importer ? path.relative(APP_ROOT, args.importer) : "the entry";
                return {errors: [{text: `${args.path} cannot be in the web build (imported by ${importer})`}]};
            }
            if (args.path.startsWith(".") && args.importer
                && path.resolve(path.dirname(args.importer), args.path).replace(/\.js$/, "") === NODE_HID_ADAPTER.replace(/\.js$/, "")) {
                return {path: NO_NATIVE_HID};
            }
            return undefined;
        });
    },
};

// The metafile names every input a bundle took. A package that is not listed,
// or the node-hid adapter, fails the build even if it resolved quietly.
function checkInputs(metafile, bundle) {
    const problems = [];
    for (const input of Object.keys(metafile.inputs)) {
        const absolute = path.resolve(APP_ROOT, input);
        if (absolute === NODE_HID_ADAPTER) problems.push(`${bundle} bundles ${input}`);
        const match = input.match(/node_modules\/((?:@[^/]+\/)?[^/]+)/);
        if (match && !PACKAGES[bundle].includes(match[1])) problems.push(`${bundle} bundles the package ${match[1]}`);
    }
    if (problems.length) throw new Error(`The web build pulled in what a browser cannot have:\n  ${problems.join("\n  ")}`);
}

// The written file for each entry, by the entry's name.
function outputsOf(metafile, outdir) {
    const names = {};
    for (const [file, output] of Object.entries(metafile.outputs)) {
        if (!output.entryPoint) continue;
        const entry = path.basename(file).replace(/-[A-Z0-9]+\.(js|css)$/, "");
        names[entry] = path.relative(outdir, path.resolve(APP_ROOT, file));
    }
    return names;
}

async function bundle(name, entryPoints, outdir, options = {}) {
    const result = await esbuild.build({
        absWorkingDir: APP_ROOT,
        entryPoints,
        outdir,
        bundle: true,
        format: "esm",
        platform: "browser",
        target: TARGET,
        entryNames: "[name]-[hash]",
        metafile: true,
        logLevel: "silent",
        plugins: [browserOnly],
        ...options,
    });
    checkInputs(result.metafile, name);
    return outputsOf(result.metafile, outdir);
}

// What the page says it was built from.
function buildInfo(env = process.env) {
    const {version} = JSON.parse(fs.readFileSync(path.join(APP_ROOT, "package.json"), "utf8"));
    if (env.ARK_COMMIT) return {version, commit: env.ARK_COMMIT};
    const git = (...args) => execFileSync("git", args, {cwd: APP_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"]}).trim();
    try {
        const dirty = git("status", "--porcelain", "--untracked-files=no") !== "";
        return {version, commit: git("rev-parse", "--short", "HEAD") + (dirty ? "-dirty" : "")};
    } catch {
        return {version, commit: "unknown"};
    }
}

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);

// Builds into `outdir`, emptied first so no earlier release's file lingers, and
// returns the manifest it wrote.
async function buildWeb({outdir = OUTDIR, entries = {core: "web/core.mjs", host: "web/page.mjs"}, build = buildInfo()} = {}) {
    fs.rmSync(outdir, {recursive: true, force: true});
    fs.mkdirSync(outdir, {recursive: true});
    const worker = await bundle("worker", {worker: "web/sleep-worker.js"}, outdir, {format: "iife"});
    const manifest = {
        ...worker,
        ...await bundle("core", entries, outdir, {
            inject: [path.join(APP_ROOT, "web", "buffer.mjs")],
            splitting: true,
            chunkNames: "chunk-[hash]",
            define: {
                __ARK_VERSION__: JSON.stringify(build.version),
                __ARK_COMMIT__: JSON.stringify(build.commit),
                __ARK_SLEEP_WORKER__: JSON.stringify(`./${worker.worker}`),
            },
        }),
        ...await bundle("panel", {panel: "webview/app.mjs", styles: "webview/styles.css"}, outdir),
    };
    if (manifest.host) {
        const names = {...manifest, version: build.version, commit: build.commit};
        const page = fs.readFileSync(path.join(APP_ROOT, "web", "index.html"), "utf8")
            .replace(/\{\{(\w+)\}\}/g, (match, name) => {
                if (names[name] === undefined) throw new Error(`web/index.html names ${match}, which the build does not write`);
                return escapeHtml(names[name]);
            });
        fs.writeFileSync(path.join(outdir, "index.html"), page);
    }
    fs.writeFileSync(path.join(outdir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    return manifest;
}

if (require.main === module) {
    buildWeb().then((manifest) => {
        for (const [name, file] of Object.entries(manifest)) console.log(`${name.padEnd(7)}${path.relative(APP_ROOT, path.join(OUTDIR, file))}`);
        console.log(`written ${path.relative(APP_ROOT, path.join(OUTDIR, "index.html"))} and manifest.json`);
    }).catch((error) => {
        console.error(error.errors?.length ? error.errors.map((entry) => entry.text).join("\n") : String(error.message || error));
        process.exit(1);
    });
}

module.exports = {buildInfo, buildWeb, OUTDIR};
