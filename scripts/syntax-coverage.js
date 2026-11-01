// @ts-check
"use strict";

// TypeScript already parses its configured source files. Node's test runner
// parses test entries; explicitly check the remaining JavaScript and shell
// runners, without starting Node once for every file in the repository.
const fs = require("node:fs");
const path = require("node:path");
const {spawnSync} = require("node:child_process");

/** @param {string} root @returns {string[]} */
function sourceFiles(root) {
    /** @param {string} directory @returns {string[]} */
    const walk = directory => fs.readdirSync(path.join(root, directory), {withFileTypes: true}).flatMap(entry => {
        const name = path.join(directory, entry.name);
        return entry.isDirectory() ? walk(name) : /\.(m?js|sh)$/.test(name) ? [name] : [];
    });
    return ["core", "rules", "tests", "web", "webview", "scripts", "browser-tests"].flatMap(walk)
        .concat(["playwright.config.js"]);
}

/** @param {string} root */
function syntaxCoverage(root) {
    // The compiler lists real paths, so a root reached through a link
    // (macOS's /tmp) is compared by its real path too.
    root = fs.realpathSync(root);
    const script = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).scripts.typecheck;
    const configs = Array.from(script.matchAll(/tsc -p ([\w.-]+)/g), match => match[1]);
    if (!configs.length) throw new Error("No TypeScript checks found in scripts.typecheck.");
    const typed = new Set(configs.flatMap(name => {
        // Ask the installed compiler rather than reimplement its extends,
        // include/exclude and imported-file rules (TS 7 has no legacy API).
        const result = spawnSync(path.join(root, "node_modules/.bin/tsc"), ["-p", name, "--listFilesOnly"], {cwd: root, encoding: "utf8"});
        if (result.error) throw result.error;
        if (result.status !== 0) throw new Error(result.stderr || result.stdout || `Cannot read ${name}.`);
        return result.stdout.trim().split(/\r?\n/).map(file => path.resolve(root, file));
    }));
    const sources = sourceFiles(root);
    return sources.map(file => ({file, checker: file.endsWith(".sh") ? "shell"
        : typed.has(path.resolve(root, file)) ? "typescript"
        : /(?:^|\/)tests\/.*\.test\.(m?js)$/.test(file) ? "test"
        : "node"}));
}

if (require.main === module) {
    const root = path.resolve(__dirname, "..");
    const coverage = syntaxCoverage(root);
    const remaining = coverage.filter(({checker}) => checker === "node" || checker === "shell");
    console.log(`Syntax: ${coverage.length - remaining.length} files parsed by TypeScript/tests; ${remaining.length} explicit checks.`);
    for (const {file, checker} of remaining) {
        const result = spawnSync(checker === "shell" ? "sh" : process.execPath,
            [checker === "shell" ? "-n" : "--check", file], {cwd: root, stdio: "inherit"});
        if (result.error) throw result.error;
        if (result.status !== 0) process.exit(result.status ?? 1);
    }
}

module.exports = {sourceFiles, syntaxCoverage};
