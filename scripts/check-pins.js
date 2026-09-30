"use strict";
// Developer-only ancestry check. Never fetches or reads a runtime dependency.
const fs = require("node:fs");
const path = require("node:path");
const {spawnSync} = require("node:child_process");

function checkPins(manifest, roots, refs = {}) {
    const repositories = {
        "https://github.com/NoahCLR/charybdis-4x6": ["firmware", refs.firmware || "refs/remotes/origin/dev"],
        "https://github.com/NoahCLR/bastardkb-qmk": ["qmk", refs.qmk || "refs/remotes/origin/noah-userspace-contracts-dev"],
    };
    if (!manifest.sources || !Object.keys(manifest.sources).length) throw new Error("Manifest has no sources");
    return Object.entries(manifest.sources).map(([name, source]) => {
        const selected = repositories[source.repository];
        if (!selected) throw new Error(`Unknown pin repository for ${name}: ${source.repository}`);
        const [repo, ref] = selected;
        const valid = /^[a-f0-9]{40}$/.test(source.commit || "");
        const result = valid && spawnSync("git", ["-C", roots[repo], "merge-base", "--is-ancestor", source.commit, ref], {stdio: "ignore"});
        return {name, commit: source.commit, repository: source.repository, ref, published: Boolean(result && result.status === 0)};
    });
}

function run(argv) {
    const flags = {};
    for (let i = 0; i < argv.length; i += 2) {
        const key = argv[i];
        if (!["--firmware", "--qmk", "--firmware-ref", "--qmk-ref"].includes(key) || flags[key] || !argv[i + 1] || argv[i + 1].startsWith("--")) throw new Error(`Invalid argument ${key}`);
        flags[key] = argv[i + 1];
    }
    if (!flags["--firmware"] || !flags["--qmk"]) throw new Error("Pass --firmware PATH --qmk PATH (fetch their origin trunks first)");
    const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "../upstream/manifest.json")));
    const pins = checkPins(manifest, {firmware: flags["--firmware"], qmk: flags["--qmk"]}, {firmware: flags["--firmware-ref"], qmk: flags["--qmk-ref"]});
    for (const pin of pins) console.log(`${pin.published ? "PASS" : "FAIL"}: ${pin.name} ${pin.commit} on ${pin.ref}`);
    return pins.every(pin => pin.published) ? 0 : 1;
}
if (require.main === module) {
    try {process.exitCode = run(process.argv.slice(2));} catch (error) {console.error(error.message); process.exitCode = 1;}
}
module.exports = {checkPins, run};
