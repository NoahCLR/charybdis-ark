"use strict";
// Developer-only: re-pin or check the imported snapshots in upstream/.
//
//   node scripts/refresh-upstream.js --firmware PATH --qmk PATH [--check]
//                                    [--firmware-rev REV] [--qmk-rev REV]
//
// Every file comes from a committed blob, never a working tree, and nothing is
// fetched. --check rebuilds each file from the commit its manifest entry pins
// and fails on any difference. Without it, every file is re-pinned to one
// revision per repository (default: firmware's local dev, and the BK commit
// that firmware's qmk-pin.json names), the manifest and QMK version stamp are
// rewritten, and the keycode catalog is regenerated.
// Adding a file is still a manifest edit; this tool refreshes what is listed.
const fs = require("node:fs");
const path = require("node:path");
const {createHash} = require("node:crypto");
const {execFileSync} = require("node:child_process");

const REPOSITORIES = {
    firmware: {url: "https://github.com/NoahCLR/charybdis-4x6", trunk: "dev"},
    qmk: {url: "https://github.com/NoahCLR/bastardkb-qmk", trunk: "noah-userspace-contracts-dev"},
};
const LINK_NOTE = "Relative Markdown links resolve locally where available, otherwise to pinned upstream URLs.";
const STAMP_PATH = "upstream/qmk/version.txt";
const STAMP_NOTE = "Version stamp synthesized as `git describe --tags --exclude 'v2*'` of the pinned QMK commit; not an upstream source file.";
const LINK = /(\]\()([^)\s]+)(\))/g;

const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const git = (root, args, encoding = "utf8") => execFileSync("git", ["-C", root, ...args], {encoding, maxBuffer: 64 << 20});

function repositoryOf(url) {
    const name = Object.keys(REPOSITORIES).find(key => REPOSITORIES[key].url === url);
    if (!name) throw new Error(`Unknown upstream repository: ${url}`);
    return name;
}

// Links to another imported file of the same repository stay as written (the
// imports mirror the source layout); every other relative link is pinned.
function transformMarkdown(text, {sourcePath, localPath, url, commit, imported}) {
    return text.replace(LINK, (whole, open, target, close) => {
        if (/^[a-z][a-z0-9+.-]*:|^#|^\//i.test(target)) return whole;
        const [file, ...anchor] = target.split("#");
        const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(sourcePath), file));
        if (resolved.startsWith("../")) throw new Error(`${sourcePath} links outside its repository: ${target}`);
        const suffix = anchor.length ? `#${anchor.join("#")}` : "";
        const local = imported.get(resolved);
        if (local) {
            const relative = path.posix.relative(path.posix.dirname(localPath), local);
            return path.posix.normalize(file) === relative ? whole : `${open}${relative}${suffix}${close}`;
        }
        return `${open}${url}/blob/${commit}/${resolved}${suffix}${close}`;
    });
}

function qmkStamp(root, commit) {
    // The stack's own vYYYY.MM.DD tags sit on the QMK trunk; name upstream QMK.
    return `${git(root, ["describe", "--tags", "--exclude", "v2*", commit]).trim()}\n`;
}

// Build every listed file from `commits` (repository -> full commit), or from
// each entry's own pinned source when `commits` is omitted.
function render(manifest, roots, commits) {
    const imported = {firmware: new Map(), qmk: new Map()};
    for (const file of manifest.files) {
        if (file.sourcePath) imported[repositoryOf(manifest.sources[file.source].repository)].set(file.sourcePath, file.path);
    }
    return manifest.files.map(file => {
        const repository = repositoryOf(manifest.sources[file.source].repository);
        const commit = commits ? commits[repository] : manifest.sources[file.source].commit;
        const root = roots[repository];
        if (file.path === STAMP_PATH) {
            const bytes = Buffer.from(qmkStamp(root, commit));
            return {file, repository, commit, source: bytes, output: bytes};
        }
        let source;
        try {
            source = git(root, ["show", `${commit}:${file.sourcePath}`], "buffer");
        } catch {
            throw new Error(`${file.sourcePath} does not exist at ${repository} ${commit.slice(0, 12)}`);
        }
        const output = file.path.endsWith(".md")
            ? Buffer.from(transformMarkdown(source.toString("utf8"), {
                sourcePath: file.sourcePath, localPath: file.path, url: REPOSITORIES[repository].url, commit,
                imported: imported[repository],
            }))
            : source;
        return {file, repository, commit, source, output};
    });
}

function check(arkRoot, roots) {
    const manifest = JSON.parse(fs.readFileSync(path.join(arkRoot, "upstream/manifest.json"), "utf8"));
    const problems = [];
    for (const {file, source, output} of render(manifest, roots)) {
        const local = path.join(arkRoot, file.path);
        if (!fs.existsSync(local) || !fs.readFileSync(local).equals(output)) problems.push(`${file.path} differs from its pinned source`);
        if (file.sourceSha256 !== sha256(source)) problems.push(`${file.path} sourceSha256 is stale`);
        if (file.sha256 !== sha256(output)) problems.push(`${file.path} sha256 is stale`);
    }
    return problems;
}

function refresh(arkRoot, roots, revisions = {}, {catalog = true} = {}) {
    const manifestPath = path.join(arkRoot, "upstream/manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const commits = {};
    for (const name of Object.keys(REPOSITORIES)) {
        let revision = revisions[name] || REPOSITORIES[name].trunk;
        // BK follows the firmware being pinned: the commit its qmk-pin.json names.
        if (name === "qmk" && !revisions.qmk) {
            try {
                revision = JSON.parse(git(roots.firmware, ["show", `${commits.firmware}:qmk-pin.json`])).commit;
            } catch {
                // Firmware older than its BK pin: fall back to the BK dev branch.
            }
        }
        commits[name] = git(roots[name], ["rev-parse", "--verify", `${revision}^{commit}`]).trim();
    }
    const report = {commits, content: [], links: [], fixtures: []};
    for (const {file, repository, source, output} of render(manifest, roots, commits)) {
        const local = path.join(arkRoot, file.path);
        const before = fs.existsSync(local) ? fs.readFileSync(local) : null;
        if (file.sourceSha256 !== sha256(source)) {
            report.content.push(file.path);
            if (!file.path.endsWith(".md") && file.path !== STAMP_PATH) report.fixtures.push(file.path);
        } else if (!before || !before.equals(output)) {
            report.links.push(file.path);
        }
        fs.mkdirSync(path.dirname(local), {recursive: true});
        fs.writeFileSync(local, output);
        Object.assign(file, {source: repository, sourceSha256: sha256(source), sha256: sha256(output)});
        if (file.path === STAMP_PATH) file.transformation = STAMP_NOTE;
        else if (file.path.endsWith(".md")) file.transformation = LINK_NOTE;
    }
    manifest.sources = Object.fromEntries(Object.entries(commits).map(([name, commit]) => [name, {repository: REPOSITORIES[name].url, commit}]));
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    if (catalog) execFileSync(process.execPath, [path.join(arkRoot, "scripts/generate-keycode-catalog.js")], {cwd: arkRoot, stdio: "inherit"});
    return report;
}

function parse(argv) {
    const flags = {check: false};
    const names = {"--firmware": "firmware", "--qmk": "qmk", "--firmware-rev": "firmwareRev", "--qmk-rev": "qmkRev"};
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === "--check") { flags.check = true; continue; }
        const name = names[argv[i]];
        if (!name || flags[name] !== undefined || !argv[i + 1] || argv[i + 1].startsWith("--")) throw new Error(`Invalid argument ${argv[i]}`);
        flags[name] = argv[++i];
    }
    if (!flags.firmware || !flags.qmk) throw new Error("Pass --firmware PATH --qmk PATH [--check] [--firmware-rev REV] [--qmk-rev REV]");
    if (flags.check && (flags.firmwareRev || flags.qmkRev)) throw new Error("--check uses the manifest's pins; do not pass revisions");
    return flags;
}

function run(argv, arkRoot = path.resolve(__dirname, "..")) {
    const flags = parse(argv);
    const roots = {firmware: path.resolve(flags.firmware), qmk: path.resolve(flags.qmk)};
    if (flags.check) {
        const problems = check(arkRoot, roots);
        for (const problem of problems) console.error(`FAIL: ${problem}`);
        if (!problems.length) console.log("upstream/ matches its pinned sources");
        return problems.length ? 1 : 0;
    }
    const report = refresh(arkRoot, roots, {firmware: flags.firmwareRev, qmk: flags.qmkRev});
    console.log(`Pinned firmware ${report.commits.firmware}, QMK ${report.commits.qmk}`);
    for (const [label, list] of [["Content changed", report.content], ["Pinned links only", report.links]]) {
        console.log(`${label}: ${list.length ? "" : "none"}`);
        for (const file of list) console.log(`  ${file}`);
    }
    if (report.fixtures.length) console.log("Fixture or QMK input bytes changed: review codecs and tests before landing (upstream/README.md step 5).");
    console.log("Next: review the diff, npm run check, npm run keycodes -- --check, and npm run pins once the revisions are published.");
    return 0;
}

if (require.main === module) {
    try {process.exitCode = run(process.argv.slice(2));} catch (error) {console.error(error.message); process.exitCode = 1;}
}
module.exports = {transformMarkdown, qmkStamp, render, check, refresh, run};
