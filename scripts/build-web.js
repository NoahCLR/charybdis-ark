"use strict";

// The web build: core/ and the panel bundled for Chrome, for the web version of
// Ark. The VS Code extension never uses it and has no build step; core/ and
// webview/ stay the sources it runs as they are.
//
// Every file written carries a hash of its content in its name, so a release
// can never be served a previous release's file. manifest.json, the one name
// that does not change, says which file is which:
//
//     {"core": "core-<hash>.js", "panel": "panel-<hash>.js", "styles": "styles-<hash>.css"}
//
// The build fails if node-hid, fs, vscode or any other Node built-in would
// reach a bundle. node-hid-adapter.js is the one module core/ loads that cannot
// run in a browser; web/no-native-hid.js takes its place.

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
const PACKAGES = {core: ["buffer", "base64-js", "ieee754"], panel: []};

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

// Builds into `outdir`, emptied first so no earlier release's file lingers, and
// returns the manifest it wrote.
async function buildWeb({outdir = OUTDIR, entries = {core: "web/core.mjs"}} = {}) {
    fs.rmSync(outdir, {recursive: true, force: true});
    fs.mkdirSync(outdir, {recursive: true});
    const manifest = {
        ...await bundle("core", entries, outdir, {inject: [path.join(APP_ROOT, "web", "buffer.mjs")]}),
        ...await bundle("panel", {panel: "webview/app.mjs", styles: "webview/styles.css"}, outdir),
    };
    fs.writeFileSync(path.join(outdir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    return manifest;
}

if (require.main === module) {
    buildWeb().then((manifest) => {
        for (const [name, file] of Object.entries(manifest)) console.log(`${name.padEnd(7)}${path.relative(APP_ROOT, path.join(OUTDIR, file))}`);
        console.log(`written ${path.relative(APP_ROOT, path.join(OUTDIR, "manifest.json"))}`);
    }).catch((error) => {
        console.error(error.errors?.length ? error.errors.map((entry) => entry.text).join("\n") : String(error.message || error));
        process.exit(1);
    });
}

module.exports = {buildWeb, OUTDIR};
