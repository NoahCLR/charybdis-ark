"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const {createHash} = require("node:crypto");
const {execFileSync} = require("node:child_process");
const {transformMarkdown, check, refresh} = require("../scripts/refresh-upstream");

const FIRMWARE = "https://github.com/NoahCLR/charybdis-4x6";
const QMK = "https://github.com/NoahCLR/bastardkb-qmk";
const sha = bytes => createHash("sha256").update(bytes).digest("hex");

test("links to other imports stay as written; every other relative link is pinned", () => {
    const imported = new Map([["docs/architecture/b.md", "upstream/firmware/docs/architecture/b.md"]]);
    const options = {sourcePath: "docs/architecture/a.md", localPath: "upstream/firmware/docs/architecture/a.md", url: FIRMWARE, commit: "c".repeat(40), imported};
    const text = "[b](./b.md#x) [readme](../../README.md#top) [site](https://example.com/a.md) [here](#local)";
    assert.equal(transformMarkdown(text, options),
        `[b](./b.md#x) [readme](${FIRMWARE}/blob/${"c".repeat(40)}/README.md#top) [site](https://example.com/a.md) [here](#local)`);
    assert.throws(() => transformMarkdown("[out](../../../x.md)", options), /outside its repository/);
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

        firmware.write("docs/architecture/a.md", "See [b](b.md) and [plan](../plans/p.md).\n");
        firmware.write("docs/architecture/b.md", "B\n");
        firmware.write("docs/plans/p.md", "Plan\n");
        firmware.write("tests/fixtures/f.fixture", "01\n");
        const oldFirmware = firmware.commit("old");
        firmware.git("branch", "-M", "dev");
        qmk.write("data/keycodes.hjson", "{}\n");
        const oldQmk = qmk.commit("old");
        qmk.git("tag", "0.1.0");
        qmk.git("branch", "-M", "noah-userspace-contracts");

        const entry = (file, source, sourcePath) => ({path: file, source, sourcePath});
        fs.mkdirSync(path.join(ark, "upstream"), {recursive: true});
        fs.writeFileSync(path.join(ark, "upstream/manifest.json"), JSON.stringify({format: 1,
            sources: {firmware: {repository: FIRMWARE, commit: oldFirmware}, qmk: {repository: QMK, commit: oldQmk}},
            files: [entry("upstream/firmware/docs/architecture/a.md", "firmware", "docs/architecture/a.md"),
                entry("upstream/firmware/docs/architecture/b.md", "firmware", "docs/architecture/b.md"),
                entry("upstream/firmware/tests/fixtures/f.fixture", "firmware", "tests/fixtures/f.fixture"),
                entry("upstream/qmk/data/keycodes.hjson", "qmk", "data/keycodes.hjson"),
                entry("upstream/qmk/version.txt", "qmk", null)]}));
        const roots = {firmware: firmware.root, qmk: qmk.root};

        // First import: from the trunks, which are still the old commits.
        refresh(ark, roots, {}, {catalog: false});
        const a = path.join(ark, "upstream/firmware/docs/architecture/a.md");
        assert.equal(fs.readFileSync(a, "utf8"), `See [b](b.md) and [plan](${FIRMWARE}/blob/${oldFirmware}/docs/plans/p.md).\n`);
        assert.equal(fs.readFileSync(path.join(ark, "upstream/qmk/version.txt"), "utf8"), "0.1.0\n");
        assert.deepEqual(check(ark, roots), []);

        // The trunks advance: one spec changes, a fixture changes, and the stack
        // tags QMK with its own release tag, which must not become the stamp.
        firmware.write("docs/architecture/b.md", "B, revised\n");
        firmware.write("tests/fixtures/f.fixture", "02\n");
        firmware.write("README.md", "working tree only, never committed\n");
        const newFirmware = firmware.commit("new");
        fs.writeFileSync(path.join(firmware.root, "docs/architecture/b.md"), "uncommitted edit\n");
        qmk.write("README", "x\n");
        qmk.commit("new");
        qmk.git("tag", "v2026.01.01");

        const report = refresh(ark, roots, {}, {catalog: false});
        const manifest = JSON.parse(fs.readFileSync(path.join(ark, "upstream/manifest.json"), "utf8"));
        assert.equal(manifest.sources.firmware.commit, newFirmware);
        assert.deepEqual(report.content.sort(), ["upstream/firmware/docs/architecture/b.md", "upstream/firmware/tests/fixtures/f.fixture", "upstream/qmk/version.txt"]);
        assert.deepEqual(report.links, ["upstream/firmware/docs/architecture/a.md"]);
        assert.deepEqual(report.fixtures, ["upstream/firmware/tests/fixtures/f.fixture"]);
        assert.equal(fs.readFileSync(path.join(ark, "upstream/firmware/docs/architecture/b.md"), "utf8"), "B, revised\n", "committed blob, not the working tree");
        assert.match(fs.readFileSync(path.join(ark, "upstream/qmk/version.txt"), "utf8"), /^0\.1\.0-1-g[0-9a-f]+\n$/);
        for (const file of manifest.files) assert.equal(file.sha256, sha(fs.readFileSync(path.join(ark, file.path))), file.path);
        assert.deepEqual(check(ark, roots), []);

        fs.appendFileSync(path.join(ark, "upstream/firmware/tests/fixtures/f.fixture"), "tampered\n");
        assert.match(check(ark, roots).join("\n"), /f\.fixture differs from its pinned source/);
    } finally {fs.rmSync(base, {recursive: true, force: true});}
});
