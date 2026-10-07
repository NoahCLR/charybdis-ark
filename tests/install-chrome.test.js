"use strict";
// The CI Chrome install retries an attempt that stalls or fails (scripts/install-chrome.sh).
const assert = require("node:assert/strict");
const {spawnSync} = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const SCRIPT = path.join(__dirname, "..", "scripts", "install-chrome.sh");
const hasTimeout = spawnSync("sh", ["-c", "command -v timeout"]).status === 0;

// Each attempt runs the fake npx, which follows the next line of its plan:
// "hang" sleeps past the limit, "fail" exits 1, "ok" succeeds.
function install(plan) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "install-chrome-"));
    fs.writeFileSync(path.join(dir, "plan"), plan.join("\n") + "\n");
    fs.writeFileSync(path.join(dir, "npx"), `#!/bin/sh
step=$(head -n 1 "${dir}/plan"); sed -i.bak 1d "${dir}/plan"
echo "$*" >> "${dir}/calls"
case "$step" in hang) exec sleep 30 ;; fail) exit 1 ;; *) exit 0 ;; esac
`, {mode: 0o755});
    fs.writeFileSync(path.join(dir, "sudo"), `#!/bin/sh\necho "$*" >> "${dir}/sudo-calls"\n`, {mode: 0o755});
    const result = spawnSync("sh", [SCRIPT], {
        env: {...process.env, PATH: `${dir}:${process.env.PATH}`, ARK_CHROME_INSTALL_SECONDS: "1"},
        encoding: "utf8",
    });
    const calls = fs.readFileSync(path.join(dir, "calls"), "utf8").trim().split("\n");
    const sudoFile = path.join(dir, "sudo-calls");
    const sudo = fs.existsSync(sudoFile) ? fs.readFileSync(sudoFile, "utf8").trim().split("\n") : [];
    fs.rmSync(dir, {recursive: true, force: true});
    return {status: result.status, stderr: result.stderr, calls, sudo};
}

test("a stalled or failed Chrome install is retried", {skip: !hasTimeout && "needs timeout(1)"}, () => {
    const done = install(["hang", "fail", "ok"]);
    assert.equal(done.status, 0, done.stderr);
    assert.equal(done.calls.length, 3);
    assert.deepEqual([...new Set(done.calls)], ["playwright install --with-deps chromium"]);
    assert.match(done.stderr, /attempt 1 failed or took over 1s; retrying/);
    // The apt-get a stopped attempt started as root would hold apt's lock.
    assert.deepEqual(done.sudo.slice(0, 3), ["pkill -KILL -x apt-get", "pkill -KILL -x dpkg", "dpkg --configure -a"]);
    assert.equal(done.sudo.length, 6, "cleaned up before each of the two retries");
});

test("Chrome install gives up after three attempts", {skip: !hasTimeout && "needs timeout(1)"}, () => {
    const failed = install(["hang", "hang", "hang", "ok"]);
    assert.notEqual(failed.status, 0);
    assert.equal(failed.calls.length, 3);
    assert.match(failed.stderr, /3 times; giving up/);
});

test("a normal Chrome install runs once", {skip: !hasTimeout && "needs timeout(1)"}, () => {
    const done = install(["ok"]);
    assert.equal(done.status, 0, done.stderr);
    assert.equal(done.calls.length, 1);
    assert.deepEqual(done.sudo, []);
});
