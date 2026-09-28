"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {execFileSync, spawnSync} = require("node:child_process");

const RUNNERS = ["qmk_portable_editor", "qmk_portable_profile", "macro_program_size", "profile_compiled_defaults_v1", "profile_pd_v1"]
    .map(name => `tests/integration/run_${name}_tests.sh`);
const usage = "npm run test:compat -- --firmware PATH --live PATH --qmk PATH --report NEW_FILE.json";

function parse(argv) {
    const flags = {};
    for (let i = 0; i < argv.length; i++) {
        const key = argv[i];
        if (!["--firmware", "--live", "--qmk", "--report"].includes(key) || flags[key.slice(2)] !== undefined) throw new Error(`Unknown or duplicate argument: ${key}. Usage: ${usage}`);
        const value = argv[++i];
        if (!value || value.startsWith("--")) throw new Error(`Missing value for ${key}. Usage: ${usage}`);
        flags[key.slice(2)] = value;
    }
    for (const key of ["firmware", "live", "qmk", "report"]) if (!flags[key]) throw new Error(`Required --${key}. Usage: ${usage}`);
    return flags;
}

function checkout(label, input, required) {
    if (!fs.existsSync(input) || !fs.statSync(input).isDirectory()) throw new Error(`Missing ${label} checkout: ${input}`);
    const root = fs.realpathSync(input);
    for (const file of required) if (!fs.existsSync(path.join(root, file))) throw new Error(`${label} checkout is missing ${file}: ${root}`);
    const git = args => execFileSync("git", ["-C", root, ...args], {encoding: "utf8", stdio: ["ignore", "pipe", "pipe"]}).trim();
    let revision, status;
    try {
        if (fs.realpathSync(git(["rev-parse", "--show-toplevel"])) !== root) throw new Error("path must be the repository root");
        revision = git(["rev-parse", "HEAD"]);
        status = git(["status", "--porcelain=v1", "--untracked-files=all"]);
    } catch (error) { throw new Error(`Invalid ${label} Git checkout ${root}: ${error.message}`); }
    return {path: root, revision, dirty: Boolean(status), status};
}

function run(argv) {
    if (argv.length === 1 && argv[0] === "--help") { console.log(usage); return 0; }
    const flags = parse(argv);
    const checkouts = {
        firmware: checkout("firmware", flags.firmware, ["tests/host/noah_host_qmk_env.sh", "users/noah/source_manifest.mk", "tests/host/profile_pd_v1_test.c"]),
        live: checkout("Live", flags.live, [...RUNNERS, "package.json", "core/schema/macro-payload.js", "tests/fixtures/pd-profile.js"]),
        qmk: checkout("QMK", flags.qmk, ["quantum/quantum_keycodes.h", "quantum/keycodes.h", "platforms"]),
    };
    const reportPath = path.resolve(flags.report);
    // Keep the report out of checkout status and never overwrite an existing file.
    for (const entry of Object.values(checkouts)) if (reportPath === entry.path || reportPath.startsWith(entry.path + path.sep)) throw new Error("Place --report outside the three checkouts.");
    const fd = fs.openSync(reportPath, "wx");
    const report = {format: 1, startedAt: new Date().toISOString(), node: process.version, checkouts, results: [], passed: false};
    const write = () => { fs.ftruncateSync(fd, 0); fs.writeSync(fd, JSON.stringify(report, null, 2) + "\n", 0, "utf8"); };
    try {
        write();
        for (const [name, info] of Object.entries(checkouts)) console.log(`${name}: ${info.path}\n  ${info.revision} (${info.dirty ? "dirty" : "clean"})`);
        const env = {...process.env, FIRMWARE_ROOT: checkouts.firmware.path, CHARYBDIS_LIVE_ROOT: checkouts.live.path, QMK_ROOT: checkouts.qmk.path, QMK_HOME: checkouts.qmk.path};
        for (const runner of RUNNERS) {
            console.log(`\nRunning ${runner}`);
            const result = spawnSync("sh", [path.join(checkouts.live.path, runner)], {cwd: checkouts.firmware.path, env, stdio: "inherit"});
            report.results.push({runner, exitCode: result.status, signal: result.signal, error: result.error?.message});
            write();
            if (result.status !== 0) return 1;
        }
        report.passed = true;
        return 0;
    } finally {
        report.finishedAt = new Date().toISOString();
        write(); fs.closeSync(fd);
        console.log(`Compatibility report: ${reportPath}`);
    }
}

if (require.main === module) {
    try { process.exitCode = run(process.argv.slice(2)); }
    catch (error) { console.error(`Compatibility check failed: ${error.message}`); process.exitCode = 1; }
}
module.exports = {parse, checkout, run, RUNNERS};
