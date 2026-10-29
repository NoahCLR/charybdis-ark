// @ts-check
"use strict";

// The web build: the web version of Ark as a complete static site in
// dist/web/, ready to publish as it is. core/, webview/ and the rules/ both
// run stay the sources it bundles as they are.
//
//     index.html                the page (web/index.html, with the names below)
//     _headers                  what Cloudflare Pages sends with it (web/_headers)
//     shell-<hash>.js           the page's shell (web/page.mjs), with the core it runs;
//                               it loads the panel, or on a phone shows a notice instead
//     core-<hash>.js            core/ for the web page (web/core.mjs)
//     chunk-<hash>.js           what shell and core share
//     worker-<hash>.js          the shell's clock (web/sleep-worker.js)
//     panel-<hash>.js           the panel (webview/app.mjs)
//     styles-<hash>.css         its styles
//
// Every file but index.html carries a hash of its content in its name, so a
// release can never be served a previous release's file. index.html names them
// itself — the page fetches nothing — and says which version and commit it was
// built from: package.json's version, and the commit from git or from
// ARK_COMMIT. dist/web-manifest.json, beside the site rather than in it, says
// which hashed file is which, for tests and tools; it is never published.
//
// The page's Content Security Policy is POLICY, below, and nowhere else: the
// page carries it in a <meta> tag, so it holds under any server, and _headers
// sends it with frame-ancestors, which only a header can set. _headers also
// keeps index.html from being cached and lets every hashed file be cached for
// good, by one rule per file the build wrote.
//
// The build fails if node-hid, its adapter (core/transport/node-hid-adapter.js,
// which only Node scripts load), fs or any other Node built-in would reach a
// bundle. The page passes the WebHID adapter to the device service itself.

const {execFileSync} = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const {builtinModules} = require("node:module");
const esbuild = require("esbuild");

const APP_ROOT = path.resolve(__dirname, "..");
const OUTDIR = path.join(APP_ROOT, "dist", "web");
// Beside the site it describes, so publishing the folder never publishes it.
/** @param {string} outdir */
const manifestFileFor = (outdir) => path.join(path.dirname(outdir), `${path.basename(outdir)}-manifest.json`);
const NODE_HID_ADAPTER = path.join(APP_ROOT, "core", "transport", "node-hid-adapter.js");

// A current Chrome, which WebHID needs anyway.
const TARGET = ["chrome120"];
const NODE_BUILTINS = new Set(builtinModules);
const NATIVE_PACKAGES = ["node-hid"];
// What a bundle may take from node_modules: the buffer package and its two dependencies.
/** @type {Record<"core" | "panel" | "worker", string[]>} */
const PACKAGES = {core: ["buffer", "base64-js", "ieee754"], panel: [], worker: []};

// The page's policy: scripts, styles and the worker from the page's own origin,
// the panel's inline style attributes, and no connection anywhere. Its HTML
// sinks take markup only through the panel's one policy (webview/lib/dom.mjs
// html) and the worker's URL only through the page's (web/page.mjs).
const POLICY = ["default-src 'none'", "script-src 'self'", "worker-src 'self'", "style-src 'self'",
    "style-src-attr 'unsafe-inline'", "connect-src 'none'", "base-uri 'none'", "form-action 'none'",
    "require-trusted-types-for 'script'", "trusted-types ark-html ark-worker"];
// Only a header can say who may frame the page; in a <meta> tag Chrome ignores
// it and says so in the console.
const HEADER_ONLY_POLICY = ["frame-ancestors 'none'"];
const pagePolicy = () => POLICY.join("; ");
const headerPolicy = () => [...POLICY, ...HEADER_ONLY_POLICY].join("; ");
// A hashed file never changes under its name; the page itself is asked for
// afresh every time (no-cache revalidates, so an unchanged page is a cheap 304,
// and a release shows on the next load).
const IMMUTABLE = "public, max-age=31536000, immutable";

/** @type {import("esbuild").Plugin} */
const browserOnly = {
    name: "browser-only",
    setup(build) {
        build.onResolve({filter: /.*/}, (args) => {
            const name = args.path.split("/")[0];
            if (NODE_BUILTINS.has(args.path) || args.path.startsWith("node:") || NATIVE_PACKAGES.includes(name)) {
                const importer = args.importer ? path.relative(APP_ROOT, args.importer) : "the entry";
                return {errors: [{text: `${args.path} cannot be in the web build (imported by ${importer})`}]};
            }
            if (args.importer && path.resolve(path.dirname(args.importer), args.path).replace(/\.js$/, "") === NODE_HID_ADAPTER.replace(/\.js$/, "")) {
                return {errors: [{text: `${path.relative(APP_ROOT, NODE_HID_ADAPTER)} cannot be in the web build (imported by ${path.relative(APP_ROOT, args.importer)})`}]};
            }
            return undefined;
        });
    },
};

// The metafile names every input a bundle took. A package that is not listed,
// or the node-hid adapter, fails the build even if it resolved quietly.
/** @param {import("esbuild").Metafile} metafile @param {keyof typeof PACKAGES} bundle */
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
/** @param {import("esbuild").Metafile} metafile @param {string} outdir @returns {Record<string, string>} */
function outputsOf(metafile, outdir) {
    /** @type {Record<string, string>} */
    const names = {};
    for (const [file, output] of Object.entries(metafile.outputs)) {
        if (!output.entryPoint) continue;
        const entry = path.basename(file).replace(/-[A-Z0-9]+\.(js|css)$/, "");
        names[entry] = path.relative(outdir, path.resolve(APP_ROOT, file));
    }
    return names;
}

/**
 * @param {keyof typeof PACKAGES} name
 * @param {NonNullable<import("esbuild").BuildOptions["entryPoints"]>} entryPoints
 * @param {string} outdir
 * @param {Omit<import("esbuild").BuildOptions, "metafile"> & {metafile?: true}} [options]
 */
async function bundled(name, entryPoints, outdir, options = {}) {
    const result = await esbuild.build({
        absWorkingDir: APP_ROOT,
        entryPoints,
        outdir,
        bundle: true,
        format: "esm",
        platform: "browser",
        target: TARGET,
        entryNames: "[name]-[hash]",
        // Minified for the wire; names are kept, so an error's stack and a
        // class's name still read as they do in the source.
        minify: true,
        keepNames: true,
        legalComments: "eof",
        metafile: true,
        logLevel: "silent",
        plugins: [browserOnly],
        ...options,
    });
    checkInputs(result.metafile, name);
    return {names: outputsOf(result.metafile, outdir), inputs: Object.keys(result.metafile.inputs)};
}

// The written file for each entry, by the entry's name.
/** @param {Parameters<typeof bundled>} args */
const bundle = async (...args) => (await bundled(...args)).names;

// What the page says it was built from.
/** @param {NodeJS.ProcessEnv} [env] @returns {import("../contracts/model.js").BuildInfo} */
function buildInfo(env = process.env) {
    // The committed package manifest owns this required version string.
    /** @type {Pick<typeof import("../package.json"), "version">} */
    const {version} = JSON.parse(fs.readFileSync(path.join(APP_ROOT, "package.json"), "utf8"));
    if (env.ARK_COMMIT) return {version, commit: env.ARK_COMMIT};
    /** @param {...string} args */
    const git = (...args) => execFileSync("git", args, {cwd: APP_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"]}).trim();
    try {
        const dirty = git("status", "--porcelain", "--untracked-files=no") !== "";
        return {version, commit: git("rev-parse", "--short", "HEAD") + (dirty ? "-dirty" : "")};
    } catch {
        return {version, commit: "unknown"};
    }
}

// Fills a {{name}} template from `names`; a name the build does not write fails it.
/**
 * @param {string} template
 * @param {string} file
 * @param {Record<string, string>} names
 * @param {(value: string) => string} [escape]
 */
function fill(template, file, names, escape = (value) => value) {
    return template.replace(/\{\{(\w+)\}\}/g, (match, name) => {
        if (names[name] === undefined) throw new Error(`${file} names ${match}, which the build does not write`);
        return escape(names[name]);
    });
}

// _headers for the hashed files the build wrote: one exact rule each, so no
// splat can ever mark a file immutable whose name does not change with it.
/** @param {Iterable<string>} hashedFiles */
function headersFile(hashedFiles) {
    const hashed = [...hashedFiles].sort().map((file) => `/${file}\n  Cache-Control: ${IMMUTABLE}`).join("\n");
    return fill(fs.readFileSync(path.join(APP_ROOT, "web", "_headers"), "utf8"), "web/_headers", {csp: headerPolicy(), hashed});
}

/** @param {string} value */
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);

// Builds into `outdir`, emptied first so no earlier release's file lingers, and
// returns the manifest it wrote.
/** @param {import("./build-types.js").WebBuildOptions} [options] */
async function buildWeb({outdir = OUTDIR, manifestFile = manifestFileFor(outdir), entries = {core: "web/core.mjs", shell: "web/page.mjs"}, build = buildInfo(), inputs} = {}) {
    fs.rmSync(outdir, {recursive: true, force: true});
    fs.rmSync(manifestFile, {force: true});
    fs.mkdirSync(outdir, {recursive: true});
    // The source files each bundle took, for a caller that asks: minified
    // output no longer names them.
    /** @param {keyof typeof PACKAGES} name @param {{names: Record<string, string>, inputs: string[]}} result */
    const take = (name, result) => {if (inputs) inputs[name] = result.inputs; return result.names;};
    const worker = take("worker", await bundled("worker", {worker: "web/sleep-worker.js"}, outdir, {format: "iife"}));
    const panel = take("panel", await bundled("panel", {panel: "webview/app.mjs", styles: "webview/styles.css"}, outdir));
    const manifest = {
        ...worker,
        ...panel,
        ...take("core", await bundled("core", entries, outdir, {
            inject: [path.join(APP_ROOT, "web", "buffer.mjs")],
            splitting: true,
            chunkNames: "chunk-[hash]",
            define: {
                __ARK_VERSION__: JSON.stringify(build.version),
                __ARK_COMMIT__: JSON.stringify(build.commit),
                __ARK_SLEEP_WORKER__: JSON.stringify(`./${worker.worker}`),
                __ARK_PANEL__: JSON.stringify(`./${panel.panel}`),
            },
        })),
    };
    if (manifest.shell) {
        const names = {...manifest, version: build.version, commit: build.commit, csp: pagePolicy()};
        const page = fill(fs.readFileSync(path.join(APP_ROOT, "web", "index.html"), "utf8"), "web/index.html", names, escapeHtml);
        fs.writeFileSync(path.join(outdir, "index.html"), page);
        fs.writeFileSync(path.join(outdir, "_headers"), headersFile(fs.readdirSync(outdir).filter((name) => name !== "index.html")));
    }
    fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
    return manifest;
}

if (require.main === module) {
    buildWeb().then((manifest) => {
        for (const [name, file] of Object.entries(manifest)) console.log(`${name.padEnd(7)}${path.relative(APP_ROOT, path.join(OUTDIR, file))}`);
        console.log(`written ${path.relative(APP_ROOT, path.join(OUTDIR, "index.html"))}, _headers and ${path.relative(APP_ROOT, manifestFileFor(OUTDIR))}`);
    }).catch(/** @param {unknown} error */ (error) => {
        const details = error && typeof error === "object" ? error : {};
        const errors = "errors" in details ? details.errors : undefined;
        const message = "message" in details ? details.message : undefined;
        console.error(Array.isArray(errors) && errors.length
            ? errors.map(/** @param {unknown} entry */ (entry) => entry && typeof entry === "object" && "text" in entry ? entry.text : undefined).join("\n")
            : String(message || error));
        process.exit(1);
    });
}

module.exports = {buildInfo, buildWeb, bundle, headerPolicy, pagePolicy, manifestFileFor, IMMUTABLE, OUTDIR};
