"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const {execFileSync} = require("node:child_process");
const {parse, run, RUNNERS} = require("../scripts/check-compatibility");

test("compatibility paths are explicit and arguments reject ambiguity", () => {
    assert.throws(() => parse([]), /Required --firmware/);
    assert.throws(() => parse(["--live"]), /Missing value/);
    assert.throws(() => parse(["--live", "a", "--live", "b"]), /duplicate/);
    assert.throws(() => run(["--firmware", "/missing-compat-firmware", "--live", ".", "--qmk", ".", "--report", "/tmp/unused"]), /Missing firmware checkout/);
});

test("bridge selects explicit checkouts, records dirty state, and stops on failure", () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "live compatibility "));
    try {
        const roots = {};
        const write = (root, file, text = "") => {const p = path.join(root, file); fs.mkdirSync(path.dirname(p), {recursive:true}); fs.writeFileSync(p, text);};
        for (const name of ["firmware", "live", "qmk"]) {
            const root = roots[name] = path.join(base, name); fs.mkdirSync(root);
            execFileSync("git", ["init", "-q", root]);
            write(root, "marker", name);
            execFileSync("git", ["-C", root, "add", "."]);
            execFileSync("git", ["-C", root, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "fixture"]);
        }
        for (const file of ["package.json", "core/schema/macro-payload.js", "tests/fixtures/pd-profile.js"]) write(roots.live, file);
        for (const file of ["quantum/quantum_keycodes.h", "quantum/keycodes.h", "platforms/marker"]) write(roots.qmk, file);
        for (const file of ["tests/host/noah_host_qmk_env.sh", "users/noah/source_manifest.mk", "tests/host/profile_pd_v1_test.c"]) write(roots.firmware, file);
        const script = '# Live-owned runner\nnode -e \'if (!process.env.CHARYBDIS_LIVE_ROOT.endsWith("/live") || !process.env.QMK_ROOT.endsWith("/qmk") || !process.env.FIRMWARE_ROOT.endsWith("/firmware")) process.exit(9)\'\n';
        for (const file of RUNNERS) write(roots.live, file, script);
        const args = report => ["--firmware", roots.firmware, "--live", roots.live, "--qmk", roots.qmk, "--report", path.join(base, report)];
        assert.equal(run(args("pass.json")), 0);
        let report = JSON.parse(fs.readFileSync(path.join(base, "pass.json")));
        assert.equal(report.results.length, 5); assert.equal(report.passed, true);
        assert.equal(report.checkouts.live.dirty, true); assert.match(report.checkouts.live.revision, /^[a-f0-9]{40}$/);
        assert.throws(() => run(args("pass.json")), /EEXIST/);
        write(roots.live, RUNNERS[1], script + 'exit 7\n');
        assert.equal(run(args("fail.json")), 1);
        report = JSON.parse(fs.readFileSync(path.join(base, "fail.json")));
        assert.equal(report.passed, false); assert.equal(report.results.length, 2); assert.equal(report.results[1].exitCode, 7);
        fs.unlinkSync(path.join(roots.live, RUNNERS[0]));
        assert.throws(() => run(args("missing.json")), /Live checkout is missing/);
    } finally {fs.rmSync(base, {recursive:true, force:true});}
});
