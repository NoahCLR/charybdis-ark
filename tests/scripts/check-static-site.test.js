"use strict";

// scripts/check-static-site.js: the gate before publishing. A real build
// passes; server code, a stray file, a cache rule on the wrong file, a
// missing header or a missing or widened policy fails.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {buildWeb} = require("../../scripts/build-web");
const {checkStaticSite, parseHeaders} = require("../../scripts/check-static-site");

const BUILD = {version: "1.2.3", commit: "abc123"};

// Builds once, then hands each case a fresh copy of the site and an empty
// project directory to break.
async function sites() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ark-site-"));
    await buildWeb({outdir: path.join(root, "web"), build: BUILD});
    let count = 0;
    const fresh = () => {
        const at = path.join(root, `case-${count++}`);
        fs.cpSync(path.join(root, "web"), path.join(at, "web"), {recursive: true});
        fs.mkdirSync(path.join(at, "project"));
        return {site: path.join(at, "web"), project: path.join(at, "project")};
    };
    return {fresh, done: () => fs.rmSync(root, {recursive: true, force: true})};
}

test("what the web build writes is static files only", async () => {
    const {fresh, done} = await sites();
    try {
        const {site, project} = fresh();
        assert.deepEqual(checkStaticSite(site, {project}), []);
    } finally {
        done();
    }
});

test("server code fails the check, wherever Pages would find it", async () => {
    const {fresh, done} = await sites();
    try {
        const cases = [
            ["a _worker.js file", ({site}) => fs.writeFileSync(path.join(site, "_worker.js"), "export default {}"), /_worker\.js in the published folder is server code/],
            ["a _worker.js folder", ({site}) => fs.mkdirSync(path.join(site, "_worker.js")), /_worker\.js in the published folder is server code/],
            ["functions/ in the site", ({site}) => fs.mkdirSync(path.join(site, "functions")), /functions in the published folder is server code/],
            ["functions/ where wrangler runs", ({project}) => fs.mkdirSync(path.join(project, "functions")), /would be deployed as Pages Functions/],
            ["_routes.json", ({site}) => fs.writeFileSync(path.join(site, "_routes.json"), "{}"), /_routes\.json in the published folder/],
        ];
        for (const [name, breakIt, expected] of cases) {
            const at = fresh();
            breakIt(at);
            const problems = checkStaticSite(at.site, {project: at.project});
            assert.equal(problems.length, 1, `${name}: ${problems.join("; ")}`);
            assert.match(problems[0], expected, name);
        }
    } finally {
        done();
    }
});

test("anything the build does not write fails the check", async () => {
    const {fresh, done} = await sites();
    try {
        const cases = [
            ["manifest.json", ({site}) => fs.writeFileSync(path.join(site, "manifest.json"), "{}"), /manifest\.json is not a file the web build writes/],
            ["an unhashed script", ({site}) => fs.writeFileSync(path.join(site, "app.js"), ""), /app\.js is not a file the web build writes/],
            ["a folder", ({site}) => fs.mkdirSync(path.join(site, "assets")), /assets is not a plain file/],
            ["a link", ({site}) => fs.symlinkSync(path.join(site, "index.html"), path.join(site, "page.html")), /page\.html is not a plain file/],
            ["no index.html", ({site}) => fs.rmSync(path.join(site, "index.html")), /index\.html is missing/],
        ];
        for (const [name, breakIt, expected] of cases) {
            const at = fresh();
            breakIt(at);
            assert.match(checkStaticSite(at.site, {project: at.project}).join("\n"), expected, name);
        }
        assert.match(checkStaticSite(path.join(os.tmpdir(), "ark-no-such-site"))[0], /is not a folder/);
    } finally {
        done();
    }
});

test("_headers has to cache exactly the hashed files for good, and the page never", async () => {
    const {fresh, done} = await sites();
    try {
        const edit = (change) => {
            const at = fresh();
            const file = path.join(at.site, "_headers");
            fs.writeFileSync(file, change(fs.readFileSync(file, "utf8"), fs.readdirSync(at.site)));
            return checkStaticSite(at.site, {project: at.project}).join("\n");
        };
        const hashedOf = (files) => files.filter((name) => /-[A-Z0-9]{8}\.(js|css)$/.test(name)).sort();
        assert.match(edit((text, files) => text.replace(`/${hashedOf(files)[0]}\n`, "/not-hashed.js\n")), /marks \/not-hashed\.js immutable, which is not a hashed file here/);
        assert.match(edit((text, files) => text.replace(`/${hashedOf(files)[0]}\n`, "/index.html\n")), /_headers names \/index\.html twice/);
        assert.match(edit((text, files) => text.replace(new RegExp(`/${hashedOf(files)[0].replace(".", "\\.")}\\n[^\\n]*\\n`), "")), /does not mark .+ immutable/);
        assert.match(edit((text) => text.replace("/index.html\n  Cache-Control: no-cache", "/index.html\n  Cache-Control: public, max-age=3600")), /lets \/index\.html be cached/);
        assert.match(edit((text) => text.replace("/*\n", "/*\n  Cache-Control: public, max-age=60\n")), /sets Cache-Control for every file/);
        assert.match(edit((text) => `  X-Orphan: 1\n${text}`), /a header before any path/);
        assert.match(edit((text) => text.replace(/^  X-Robots-Tag: .*\n/m, "")), /lets search engines index the page/);
    } finally {
        done();
    }
});

test("_headers has to send every file the opener policy and HSTS the build writes", async () => {
    const {fresh, done} = await sites();
    try {
        const headers = (change) => {
            const at = fresh();
            const file = path.join(at.site, "_headers");
            fs.writeFileSync(file, change(fs.readFileSync(file, "utf8")));
            return checkStaticSite(at.site, {project: at.project});
        };
        const coop = ["_headers (/*) does not send Cross-Origin-Opener-Policy once, with same-origin"];
        const hsts = ["_headers (/*) does not send Strict-Transport-Security once, with a max-age of a year or more and nothing else"];
        assert.deepEqual(headers((text) => text.replace(/^  Cross-Origin-Opener-Policy: .*\n/m, "")), coop);
        assert.deepEqual(headers((text) => text.replace("Cross-Origin-Opener-Policy: same-origin", "Cross-Origin-Opener-Policy: unsafe-none")), coop);
        assert.deepEqual(headers((text) => text.replace("Cross-Origin-Opener-Policy: same-origin", "Cross-Origin-Opener-Policy: same-origin-allow-popups")), coop);
        assert.deepEqual(headers((text) => text.replace(/^(  Cross-Origin-Opener-Policy: .*)\n/m, "$1\n$1\n")), coop);
        assert.deepEqual(headers((text) => text.replace(/^  Strict-Transport-Security: .*\n/m, "")), hsts);
        assert.deepEqual(headers((text) => text.replace(/Strict-Transport-Security: max-age=\d+/, "Strict-Transport-Security: max-age=86400")), hsts);
        assert.deepEqual(headers((text) => text.replace(/Strict-Transport-Security: max-age=\d+/, "Strict-Transport-Security: max-age=0")), hsts);
        assert.deepEqual(headers((text) => text.replace(/(Strict-Transport-Security: max-age=\d+)/, "$1; includeSubDomains")), hsts);
        assert.deepEqual(headers((text) => text.replace(/^(  Strict-Transport-Security: .*)\n/m, "$1\n$1\n")), hsts);
    } finally {
        done();
    }
});

test("the page's policy is in force in its <meta> tag and as a header", async () => {
    const {fresh, done} = await sites();
    try {
        const edit = (name, change) => {
            const at = fresh();
            const file = path.join(at.site, name);
            fs.writeFileSync(file, change(fs.readFileSync(file, "utf8")));
            return checkStaticSite(at.site, {project: at.project});
        };
        const headers = (change) => edit("_headers", change);
        const page = (change) => edit("index.html", change);
        assert.deepEqual(headers((text) => text.replace(/^  Content-Security-Policy: .*\n/m, "")), ["_headers (/*) carries no Content-Security-Policy"]);
        assert.deepEqual(headers((text) => text.replace(/^(  Content-Security-Policy: .*)\n/m, "$1\n$1\n")), ["_headers sends two Content-Security-Policy headers for every file (/*)"]);
        assert.deepEqual(headers((text) => text.replace("; frame-ancestors 'none'", "")), ["_headers (/*)'s Content-Security-Policy lacks frame-ancestors 'none'"]);
        assert.deepEqual(headers((text) => text.replace("default-src 'none'", "default-src 'self'")), ["_headers (/*)'s Content-Security-Policy lacks default-src 'none'"]);
        assert.deepEqual(headers((text) => text.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")), ["_headers (/*)'s Content-Security-Policy lacks script-src 'self'"]);
        assert.deepEqual(page((html) => html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>\n?/, "")), ["index.html carries no Content-Security-Policy"]);
        assert.deepEqual(page((html) => html.replace("script-src &#39;self&#39;", "script-src *")), ["index.html's Content-Security-Policy lacks script-src 'self'"]);
    } finally {
        done();
    }
});

test("the page's policy allows exactly the Trusted Types policies the page creates", async () => {
    const {fresh, done} = await sites();
    try {
        const edit = (name, change) => {
            const at = fresh();
            const file = path.join(at.site, name);
            fs.writeFileSync(file, change(fs.readFileSync(file, "utf8")));
            return checkStaticSite(at.site, {project: at.project});
        };
        const lacks = (where) => [`${where}'s Content-Security-Policy lacks trusted-types ark-html ark-worker`];
        const twice = (where) => [`${where}'s Content-Security-Policy names trusted-types twice`];
        const header = "_headers (/*)";
        assert.deepEqual(edit("_headers", (text) => text.replace("; trusted-types ark-html ark-worker", "")), lacks(header));
        assert.deepEqual(edit("_headers", (text) => text.replace("; require-trusted-types-for 'script'", "")), [`${header}'s Content-Security-Policy lacks require-trusted-types-for 'script'`]);
        for (const widened of ["trusted-types ark-html ark-worker default", "trusted-types ark-html ark-worker 'allow-duplicates'", "trusted-types *", "trusted-types ark-html"]) {
            assert.deepEqual(edit("_headers", (text) => text.replace("trusted-types ark-html ark-worker", widened)), lacks(header), widened);
            assert.deepEqual(edit("index.html", (html) => html.replace("trusted-types ark-html ark-worker", widened.replace(/'/g, "&#39;"))), lacks("index.html"), widened);
        }
        // A second directive of a name is ignored by the browser, so it can
        // only mislead.
        assert.deepEqual(edit("_headers", (text) => text.replace("trusted-types ark-html ark-worker", "trusted-types ark-html ark-worker; trusted-types default")), twice(header));
        assert.deepEqual(edit("index.html", (html) => html.replace("trusted-types ark-html ark-worker", "trusted-types ark-html ark-worker; Trusted-Types *")), twice("index.html"));
    } finally {
        done();
    }
});

test("_headers parses into rules and their header lines", () => {
    const rules = parseHeaders("# comment\n/*\n  A: 1\n  B: 2\n\n/x.js\n  C: 3\n");
    assert.deepEqual([...rules], [["/*", ["A: 1", "B: 2"]], ["/x.js", ["C: 3"]]]);
});
