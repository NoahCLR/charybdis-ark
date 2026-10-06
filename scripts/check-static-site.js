"use strict";

// Checks that a folder is static files only before it is published to
// Cloudflare Pages: nothing there that Pages would run as server code, and
// nothing the web build does not write. The publish workflow runs it on
// dist/web/ after the browser tests and before Wrangler; run it locally the
// same way after `npm run build:web`.
//
//     node scripts/check-static-site.js [folder] [--project DIR]
//
// Pages runs code from two places: a _worker.js (a file, or a folder) in the
// published folder, and a functions/ folder in the directory `wrangler pages
// deploy` runs from (--project, the current directory by default), or in the
// published folder itself. Any of them fails the check, as does a _routes.json,
// which only means something with Functions.
//
// Beyond that the folder must hold exactly what scripts/build-web.js writes:
// index.html, _headers and content-hashed .js and .css files, as plain files,
// no folders or links. _headers must mark exactly those hashed files immutable
// and keep the page itself out of the cache, and keep every file out of search
// engines.

const fs = require("node:fs");
const path = require("node:path");

const HASHED = /^[a-z]+-[A-Z0-9]{8}\.(js|css)$/;
const SERVER_CODE = ["_worker.js", "functions", "_routes.json"];

// _headers as {path: [header lines]}, comments and blank lines skipped.
function parseHeaders(text) {
    const rules = new Map();
    let current = null;
    for (const line of text.split(/\r?\n/)) {
        if (!line.trim() || line.trimStart().startsWith("#")) continue;
        if (/^\s/.test(line)) {
            if (!current) throw new Error(`_headers has a header before any path: ${line.trim()}`);
            rules.get(current).push(line.trim());
        } else {
            current = line.trim();
            if (rules.has(current)) throw new Error(`_headers names ${current} twice`);
            rules.set(current, []);
        }
    }
    return rules;
}

function headerProblems(text, hashedFiles) {
    let rules;
    try {rules = parseHeaders(text);} catch (error) {return [error.message];}
    const problems = [];
    const cacheOf = (rule) => (rules.get(rule) || []).filter((line) => /^cache-control:/i.test(line));
    const immutable = [...rules.keys()].filter((rule) => cacheOf(rule).some((line) => /immutable/i.test(line)));
    for (const rule of immutable) {
        if (!hashedFiles.includes(rule.slice(1))) problems.push(`_headers marks ${rule} immutable, which is not a hashed file here`);
    }
    for (const file of hashedFiles) {
        if (!immutable.includes(`/${file}`)) problems.push(`_headers does not mark ${file} immutable`);
    }
    for (const page of ["/", "/index.html"]) {
        if (!cacheOf(page).some((line) => /no-cache|no-store/i.test(line))) problems.push(`_headers lets ${page} be cached`);
    }
    if (!rules.has("/*")) problems.push("_headers sets no headers for every file (/*)");
    else if (!rules.get("/*").some((line) => /^x-robots-tag:.*\bnoindex\b/i.test(line))) problems.push("_headers lets search engines index the page: /* sends no X-Robots-Tag: noindex");
    if (rules.has("/*") && cacheOf("/*").length) problems.push("_headers sets Cache-Control for every file (/*), which joins every other rule's");
    return problems;
}

function checkStaticSite(site, {project = process.cwd()} = {}) {
    if (!fs.existsSync(site) || !fs.statSync(site).isDirectory()) return [`${site} is not a folder; run npm run build:web first`];
    const problems = [];
    for (const name of SERVER_CODE) {
        if (fs.existsSync(path.join(site, name))) problems.push(`${name} in the published folder is server code`);
    }
    if (fs.existsSync(path.join(project, "functions"))) problems.push(`${path.join(project, "functions")} would be deployed as Pages Functions`);

    const entries = fs.readdirSync(site, {withFileTypes: true});
    const hashed = [];
    for (const entry of entries) {
        if (SERVER_CODE.includes(entry.name)) continue;
        if (!entry.isFile()) problems.push(`${entry.name} is not a plain file`);
        else if (HASHED.test(entry.name)) hashed.push(entry.name);
        else if (entry.name !== "index.html" && entry.name !== "_headers") problems.push(`${entry.name} is not a file the web build writes`);
    }
    for (const name of ["index.html", "_headers"]) {
        if (!entries.some((entry) => entry.name === name && entry.isFile())) problems.push(`${name} is missing`);
    }
    if (entries.some((entry) => entry.name === "_headers" && entry.isFile())) {
        problems.push(...headerProblems(fs.readFileSync(path.join(site, "_headers"), "utf8"), hashed));
    }
    return problems;
}

if (require.main === module) {
    const args = process.argv.slice(2);
    const at = args.indexOf("--project");
    const project = at >= 0 ? args[at + 1] : process.cwd();
    const site = args.find((arg, index) => !arg.startsWith("--") && index !== at + 1) || path.join("dist", "web");
    const problems = checkStaticSite(site, {project});
    if (problems.length) {
        console.error(`${site} is not ready to publish:\n  ${problems.join("\n  ")}`);
        process.exit(1);
    }
    console.log(`${site} is static files only: ${fs.readdirSync(site).length} files, no server code`);
}

module.exports = {checkStaticSite, parseHeaders};
