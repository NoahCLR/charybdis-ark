"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const {createHash} = require("node:crypto");
const {execFileSync} = require("node:child_process");
const {transformMarkdown, check, refresh} = require("../../scripts/refresh-upstream");

const FIRMWARE = "https://github.com/NoahCLR/charybdis-4x6";
const QMK = "https://github.com/NoahCLR/bastardkb-qmk";
const sha = bytes => createHash("sha256").update(bytes).digest("hex");

test("links to other imports stay as written; every other relative link is pinned", () => {
    const imported = new Map([["docs/spec/b.md", "upstream/firmware/docs/spec/b.md"], ["GLOSSARY.md", "upstream/firmware/GLOSSARY.md"]]);
    const options = {sourcePath: "docs/spec/wire/a.md", localPath: "upstream/firmware/docs/spec/wire/a.md", url: FIRMWARE, commit: "c".repeat(40), imported};
    const text = "[b](../b.md#x) [words](../../../GLOSSARY.md) [readme](../../../README.md#top) [site](https://example.com/a.md) [here](#local)";
    assert.equal(transformMarkdown(text, options),
        `[b](../b.md#x) [words](../../../GLOSSARY.md) [readme](${FIRMWARE}/blob/${"c".repeat(40)}/README.md#top) [site](https://example.com/a.md) [here](#local)`);
    assert.throws(() => transformMarkdown("[out](../../../../x.md)", options), /outside its repository/);
});

test("refresh re-pins from committed trunks, check reproduces it and catches drift", () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "ark-upstream-"));
    try {
        const repo = name => {
            const root = path.join(base, name);
            fs.mkdirSync(root);
            const git = (...args) => execFileSync("git", ["-C", root, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", ...args], {encoding: "utf8"}).trim();
            git("init", "-q");
            const write = (file, text) => { fs.mkdirSync(path.dirname(path.join(root, file)), {recursive: true}); fs.writeFileSync(path.join(root, file), text); };
            const commit = message => { git("add", "-A"); git("commit", "-qm", message); return git("rev-parse", "HEAD"); };
            return {root, git, write, commit};
        };
        const firmware = repo("firmware"), qmk = repo("qmk"), ark = path.join(base, "ark");

        firmware.write("docs/spec/a.md", "See [b](b.md) and [plan](../plans/p.md).\n");
        firmware.write("docs/spec/b.md", "B\n");
        firmware.write("docs/plans/p.md", "Plan\n");
        firmware.write("tests/fixtures/f.fixture", "01\n");
        const oldFirmware = firmware.commit("old");
        firmware.git("branch", "-M", "dev");
        qmk.write("data/keycodes.hjson", "{}\n");
        const oldQmk = qmk.commit("old");
        qmk.git("tag", "0.1.0");
        qmk.git("branch", "-M", "noah-userspace-contracts-dev");

        const entry = (file, source, sourcePath) => ({path: file, source, sourcePath});
        fs.mkdirSync(path.join(ark, "upstream"), {recursive: true});
        fs.writeFileSync(path.join(ark, "upstream/manifest.json"), JSON.stringify({format: 1,
            sources: {firmware: {repository: FIRMWARE, commit: oldFirmware}, qmk: {repository: QMK, commit: oldQmk}},
            files: [entry("upstream/firmware/docs/spec/a.md", "firmware", "docs/spec/a.md"),
                entry("upstream/firmware/docs/spec/b.md", "firmware", "docs/spec/b.md"),
                entry("upstream/firmware/tests/fixtures/f.fixture", "firmware", "tests/fixtures/f.fixture"),
                entry("upstream/qmk/data/keycodes.hjson", "qmk", "data/keycodes.hjson"),
                entry("upstream/qmk/version.txt", "qmk", null)]}));
        const roots = {firmware: firmware.root, qmk: qmk.root};

        // First import: from the trunks, which are still the old commits.
        refresh(ark, roots, {}, {catalog: false});
        const a = path.join(ark, "upstream/firmware/docs/spec/a.md");
        assert.equal(fs.readFileSync(a, "utf8"), `See [b](b.md) and [plan](${FIRMWARE}/blob/${oldFirmware}/docs/plans/p.md).\n`);
        assert.equal(fs.readFileSync(path.join(ark, "upstream/qmk/version.txt"), "utf8"), "0.1.0\n");
        assert.deepEqual(check(ark, roots), []);

        // The trunks advance: one spec changes, a fixture changes, and the stack
        // tags QMK with its own release tag, which must not become the stamp.
        firmware.write("docs/spec/b.md", "B, revised\n");
        firmware.write("tests/fixtures/f.fixture", "02\n");
        firmware.write("README.md", "working tree only, never committed\n");
        const newFirmware = firmware.commit("new");
        fs.writeFileSync(path.join(firmware.root, "docs/spec/b.md"), "uncommitted edit\n");
        qmk.write("README", "x\n");
        qmk.commit("new");
        qmk.git("tag", "v2026.01.01");

        const report = refresh(ark, roots, {}, {catalog: false});
        const manifest = JSON.parse(fs.readFileSync(path.join(ark, "upstream/manifest.json"), "utf8"));
        assert.equal(manifest.sources.firmware.commit, newFirmware);
        assert.deepEqual(report.content.sort(), ["upstream/firmware/docs/spec/b.md", "upstream/firmware/tests/fixtures/f.fixture", "upstream/qmk/version.txt"]);
        assert.deepEqual(report.links, ["upstream/firmware/docs/spec/a.md"]);
        assert.deepEqual(report.fixtures, ["upstream/firmware/tests/fixtures/f.fixture"]);
        assert.equal(fs.readFileSync(path.join(ark, "upstream/firmware/docs/spec/b.md"), "utf8"), "B, revised\n", "committed blob, not the working tree");
        assert.match(fs.readFileSync(path.join(ark, "upstream/qmk/version.txt"), "utf8"), /^0\.1\.0-1-g[0-9a-f]+\n$/);
        for (const file of manifest.files) assert.equal(file.sha256, sha(fs.readFileSync(path.join(ark, file.path))), file.path);
        assert.deepEqual(check(ark, roots), []);

        fs.appendFileSync(path.join(ark, "upstream/firmware/tests/fixtures/f.fixture"), "tampered\n");
        assert.match(check(ark, roots).join("\n"), /f\.fixture differs from its pinned source/);
        fs.writeFileSync(path.join(ark, "upstream/firmware/tests/fixtures/f.fixture"), "02\n");

        // Once firmware pins its BK commit, Ark's BK inputs follow that pin,
        // not the BK dev head (which has moved on past it).
        firmware.write("qmk-pin.json", JSON.stringify({repository: QMK, commit: oldQmk}));
        firmware.commit("pin BK");
        const repinned = refresh(ark, roots, {}, {catalog: false});
        assert.equal(JSON.parse(fs.readFileSync(path.join(ark, "upstream/manifest.json"), "utf8")).sources.qmk.commit, oldQmk);
        assert.equal(fs.readFileSync(path.join(ark, "upstream/qmk/version.txt"), "utf8"), "0.1.0\n");
        assert.deepEqual(repinned.fixtures, []);
        assert.deepEqual(check(ark, roots), []);
    } finally {fs.rmSync(base, {recursive: true, force: true});}
});

test("refresh removes imports the manifest no longer lists; check reports unlisted files", () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "ark-upstream-moved-"));
    try {
        const firmware = path.join(base, "firmware"), qmk = path.join(base, "qmk"), ark = path.join(base, "ark");
        const git = (root, ...args) => execFileSync("git", ["-C", root, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", ...args], {encoding: "utf8"}).trim();
        const write = (root, file, text) => { fs.mkdirSync(path.dirname(path.join(root, file)), {recursive: true}); fs.writeFileSync(path.join(root, file), text); };
        for (const [root, branch, file] of [[firmware, "dev", "docs/architecture/wire.md"], [qmk, "noah-userspace-contracts-dev", "data/keycodes.hjson"]]) {
            fs.mkdirSync(root);
            git(root, "init", "-q");
            write(root, file, "x\n");
            git(root, "add", "-A"); git(root, "commit", "-qm", "old"); git(root, "branch", "-M", branch);
        }
        git(qmk, "tag", "0.1.0");
        const manifestPath = path.join(ark, "upstream/manifest.json");
        const writeManifest = files => write(ark, "upstream/manifest.json", JSON.stringify({format: 1,
            sources: {firmware: {repository: FIRMWARE, commit: "0".repeat(40)}, qmk: {repository: QMK, commit: "0".repeat(40)}},
            files: files.map(([file, source, sourcePath]) => ({path: file, source, sourcePath}))}));
        const qmkFiles = [["upstream/qmk/data/keycodes.hjson", "qmk", "data/keycodes.hjson"], ["upstream/qmk/version.txt", "qmk", null]];
        write(ark, "upstream/README.md", "Ark's own\n");
        write(ark, "upstream/AGENTS.md", "Ark's own\n");
        writeManifest([["upstream/firmware/docs/architecture/wire.md", "firmware", "docs/architecture/wire.md"], ...qmkFiles]);
        const roots = {firmware, qmk};
        assert.deepEqual(refresh(ark, roots, {}, {catalog: false}).removed, []);

        // Firmware moves the spec into a folder of its own; the manifest follows.
        fs.mkdirSync(path.join(firmware, "docs/spec/wire"), {recursive: true});
        git(firmware, "mv", "docs/architecture/wire.md", "docs/spec/wire/README.md");
        git(firmware, "commit", "-qm", "move");
        writeManifest([["upstream/firmware/docs/spec/wire/README.md", "firmware", "docs/spec/wire/README.md"], ...qmkFiles]);
        const report = refresh(ark, roots, {}, {catalog: false});
        assert.deepEqual(report.removed, ["upstream/firmware/docs/architecture/wire.md"]);
        assert.equal(fs.existsSync(path.join(ark, "upstream/firmware/docs/architecture")), false, "emptied folders go too");
        assert.equal(fs.readFileSync(path.join(ark, "upstream/firmware/docs/spec/wire/README.md"), "utf8"), "x\n");
        assert.equal(fs.readFileSync(path.join(ark, "upstream/README.md"), "utf8"), "Ark's own\n");
        assert.equal(fs.readFileSync(path.join(ark, "upstream/AGENTS.md"), "utf8"), "Ark's own\n");
        assert.ok(fs.existsSync(manifestPath));
        assert.deepEqual(check(ark, roots), []);

        write(ark, "upstream/firmware/docs/spec/stray.md", "left behind\n");
        assert.deepEqual(check(ark, roots), ["upstream/firmware/docs/spec/stray.md is not listed in the manifest"]);
    } finally {fs.rmSync(base, {recursive: true, force: true});}
});
