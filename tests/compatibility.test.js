"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const {execFileSync} = require("node:child_process");
const {parse, run, RUNNERS} = require("../scripts/check-compatibility");

test("compatibility paths are explicit and arguments reject ambiguity", () => {
    assert.throws(() => parse([]), /Required --firmware/);
    assert.throws(() => parse(["--live"]), /Missing value/);
    assert.throws(() => parse(["--live", "a", "--live", "b"]), /duplicate/);
    assert.throws(() => parse(["--publish", "--publish"]), /duplicate/);
    assert.equal(parse(["--firmware", "f", "--live", "l", "--qmk", "q", "--report", "r", "--publish"]).publish, true);
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
        const sha = text => require("node:crypto").createHash("sha256").update(text).digest("hex");
        const pinned = [["tests/fixtures/golden.fixture", "bytes"], ["docs/architecture/spec.md", "spec"]];
        const pin = execFileSync("git", ["-C", roots.firmware, "rev-parse", "HEAD"], {encoding: "utf8"}).trim();
        execFileSync("git", ["-C", roots.firmware, "update-ref", "refs/remotes/origin/main", pin]);
        write(roots.live, "upstream/manifest.json", JSON.stringify({format: 1, sources: {firmware: {commit: pin}},
            files: pinned.map(([file, text]) => ({path: `upstream/firmware/${file}`, source: "firmware", sourcePath: file, sourceSha256: sha(text)}))}));
        for (const [file, text] of pinned) write(roots.firmware, file, text);
        for (const file of ["quantum/quantum_keycodes.h", "quantum/keycodes.h", "platforms/marker"]) write(roots.qmk, file);
        for (const file of ["tests/host/noah_host_qmk_env.sh", "users/noah/source_manifest.mk", "tests/host/profile_pd_v1_test.c"]) write(roots.firmware, file);
        const script = '# Live-owned runner\nnode -e \'if (!process.env.CHARYBDIS_LIVE_ROOT.endsWith("/live") || !process.env.QMK_ROOT.endsWith("/qmk") || !process.env.FIRMWARE_ROOT.endsWith("/firmware")) process.exit(9)\'\n';
        for (const file of RUNNERS) write(roots.live, file, script);
        const args = report => ["--firmware", roots.firmware, "--live", roots.live, "--qmk", roots.qmk, "--report", path.join(base, report)];
        assert.equal(run(args("pass.json")), 0);
        let report = JSON.parse(fs.readFileSync(path.join(base, "pass.json")));
        assert.equal(report.results.length, 5); assert.equal(report.passed, true);
        assert.deepEqual(report.upstream, {pin, pinPublished: true, publishedRef: "refs/remotes/origin/main", fixtures: [], specs: []});
        assert.equal(run([...args("published.json"), "--publish"]), 0);
        execFileSync("git", ["-C", roots.firmware, "update-ref", "-d", "refs/remotes/origin/main"]);
        assert.equal(run(args("local-pin.json")), 0);
        assert.equal(JSON.parse(fs.readFileSync(path.join(base, "local-pin.json"))).upstream.pinPublished, false);
        assert.equal(run([...args("unpublished.json"), "--publish"]), 1);
        report = JSON.parse(fs.readFileSync(path.join(base, "unpublished.json")));
        assert.equal(report.passed, false); assert.equal(report.publish, true); assert.equal(report.results.length, 0);
        assert.equal(report.checkouts.live.dirty, true); assert.match(report.checkouts.live.revision, /^[a-f0-9]{40}$/);
        assert.throws(() => run(args("pass.json")), /EEXIST/);
        write(roots.live, RUNNERS[1], script + 'exit 7\n');
        assert.equal(run(args("fail.json")), 1);
        report = JSON.parse(fs.readFileSync(path.join(base, "fail.json")));
        assert.equal(report.passed, false); assert.equal(report.results.length, 2); assert.equal(report.results[1].exitCode, 7);
        write(roots.live, RUNNERS[1], script);
        write(roots.firmware, "docs/architecture/spec.md", "spec, revised");
        assert.equal(run(args("lagging-spec.json")), 0);
        report = JSON.parse(fs.readFileSync(path.join(base, "lagging-spec.json")));
        assert.equal(report.passed, true); assert.deepEqual(report.upstream.specs, [{path: "docs/architecture/spec.md", missing: false}]);
        fs.unlinkSync(path.join(roots.firmware, "tests/fixtures/golden.fixture"));
        assert.equal(run(args("stale-fixture.json")), 1);
        report = JSON.parse(fs.readFileSync(path.join(base, "stale-fixture.json")));
        assert.equal(report.passed, false); assert.equal(report.results.length, 0);
        assert.deepEqual(report.upstream.fixtures, [{path: "tests/fixtures/golden.fixture", missing: true}]);
        fs.unlinkSync(path.join(roots.live, RUNNERS[0]));
        assert.throws(() => run(args("missing.json")), /Live checkout is missing/);
    } finally {fs.rmSync(base, {recursive:true, force:true});}
});
