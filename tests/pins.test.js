"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const {execFileSync} = require("node:child_process");
const {checkPins} = require("../scripts/check-pins");
test("all firmware aliases and QMK pins must belong to their published trunks", () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "ark-pins-"));
    try {
        const roots = {}, sources = {};
        for (const [name, slug, trunk] of [["firmware", "charybdis-4x6", "dev"], ["qmk", "bastardkb-qmk", "noah-userspace-contracts-dev"]]) {
            const root = roots[name] = path.join(base, name);
            fs.mkdirSync(root);
            const git = (...args) => execFileSync("git", ["-C", root, ...args], {encoding: "utf8"}).trim();
            git("init", "-q");
            git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "--allow-empty", "-qm", "baseline");
            sources[name] = {repository: `https://github.com/NoahCLR/${slug}`, commit: git("rev-parse", "HEAD")};
            git("update-ref", `refs/remotes/origin/${trunk}`, "HEAD");
        }
        sources["firmware-extra"] = {...sources.firmware};
        assert(checkPins({sources}, roots).every(pin => pin.published));
        sources["firmware-extra"].commit = "0".repeat(40);
        assert.deepEqual(checkPins({sources}, roots).filter(pin => !pin.published).map(pin => pin.name), ["firmware-extra"]);
        sources.qmk.commit = "--all";
        assert.equal(checkPins({sources}, roots).find(pin => pin.name === "qmk").published, false);
        sources.qmk.repository = "https://example.invalid/untrusted";
        assert.throws(() => checkPins({sources}, roots), /Unknown pin repository/);
        assert.throws(() => checkPins({sources: {}}, roots), /no sources/);
    } finally {fs.rmSync(base, {recursive: true, force: true});}
});
