"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const {createHash} = require("node:crypto");
const {execFileSync} = require("node:child_process");
const {judge, markdown} = require("../scripts/check-agreement");

const FIRMWARE = "https://github.com/NoahCLR/charybdis-4x6";
const QMK = "https://github.com/NoahCLR/bastardkb-qmk";
// Capability pages as firmware's contract probe states them (action-ABI digest
// 0x837cf479, schema 3, sixteen layers).
const PAGES = ["0203010003002014027fdf0f0079f47c8300000100dff0d215", "1010800500801010203a088080e0ffe0ff000057281f000000", "80020500000100202040000000000000000000000000000000"];
const sha = text => createHash("sha256").update(text).digest("hex");

function setup() {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "ark-agreement-test-"));
    const qmk = path.join(base, "qmk");
    fs.mkdirSync(path.join(qmk, "data"), {recursive: true});
    const git = (...args) => execFileSync("git", ["-C", qmk, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", ...args], {encoding: "utf8"}).trim();
    git("init", "-q");
    fs.writeFileSync(path.join(qmk, "data/keycodes.hjson"), "{}\n");
    git("add", "."); git("commit", "-qm", "bk");
    const pin = git("rev-parse", "HEAD");
    const manifest = {sources: {firmware: {repository: FIRMWARE, commit: "f".repeat(40)}, qmk: {repository: QMK, commit: pin}},
        files: [{path: "upstream/qmk/data/keycodes.hjson", source: "qmk", sourcePath: "data/keycodes.hjson", sourceSha256: sha("{}\n")},
            {path: "upstream/firmware/tests/fixtures/a.fixture", source: "firmware", sourcePath: "tests/fixtures/a.fixture", sourceSha256: sha("a")},
            {path: "upstream/qmk/version.txt", source: "qmk", sourcePath: null, sourceSha256: sha("0.1.0\n")}]};
    const contract = {capabilityPages: [...PAGES], qmkPin: {commit: pin}, fixtures: {"tests/fixtures/a.fixture": sha("a")}, firmwareCommit: "e".repeat(40)};
    return {base, qmk, git, pin, manifest, contract};
}

test("a firmware whose contract Ark speaks agrees, with informational fields reported only", () => {
    const {base, qmk, manifest, contract} = setup();
    try {
        const result = judge(contract, manifest, qmk);
        assert.equal(result.agrees, true, JSON.stringify(result.checks));
        assert.equal(result.info["compiled-default digest"], "0x15d2f0df");
        assert.match(markdown(result), /agrees/);
    } finally {fs.rmSync(base, {recursive: true, force: true});}
});

test("each contract check can fail on its own", () => {
    const {base, qmk, git, manifest, contract} = setup();
    try {
        const failing = changed => judge({...contract, ...changed}, manifest, qmk).checks.filter(check => !check.ok).map(check => check.name);
        // An action-ABI digest Ark does not know (bytes 13..16 of page 0).
        const unknown = Buffer.from(PAGES[0], "hex"); unknown.writeUInt32LE(0x12345678, 13);
        assert.deepEqual(failing({capabilityPages: [unknown.toString("hex"), PAGES[1], PAGES[2]]}), ["action-ABI digest is known to Ark"]);
        // Pages Ark's decoder rejects: more layers than the logical capacity.
        const inconsistent = Buffer.from(PAGES[1], "hex"); inconsistent[0] = 17;
        assert.deepEqual(failing({capabilityPages: [PAGES[0], inconsistent.toString("hex"), PAGES[2]]}), ["Profile Wire capability pages decode with Ark's decoder"]);
        // A schema Ark cannot read (byte 4 of page 0).
        const schema = Buffer.from(PAGES[0], "hex"); schema[4] = 9;
        assert.deepEqual(failing({capabilityPages: [schema.toString("hex"), PAGES[1], PAGES[2]]}), ["profile schema is one Ark reads"]);
        // Firmware's golden bytes moved past what Ark pinned.
        assert.deepEqual(failing({fixtures: {"tests/fixtures/a.fixture": sha("b")}}), ["Ark's pinned fixtures equal the firmware's"]);
        // Firmware builds with a BK whose keycodes differ from Ark's inputs.
        fs.writeFileSync(path.join(qmk, "data/keycodes.hjson"), "{\"KC_NEW\": 1}\n");
        git("commit", "-qam", "renumber"); const moved = git("rev-parse", "HEAD");
        assert.deepEqual(failing({qmkPin: {commit: moved}}), ["Ark's BK keycode and layout inputs equal firmware's BK pin"]);
        assert.deepEqual(failing({qmkPin: undefined}), ["Ark's BK keycode and layout inputs equal firmware's BK pin"]);
    } finally {fs.rmSync(base, {recursive: true, force: true});}
});
