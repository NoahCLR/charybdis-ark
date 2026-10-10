"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {execFileSync, spawnSync} = require("node:child_process");
const {createHash} = require("node:crypto");

const {checkPins} = require("./check-pins");

const RUNNERS = ["qmk_portable_editor", "qmk_portable_profile", "macro_program_size", "profile_compiled_defaults_v1", "profile_pd_v1", "profile_rgb_v1", "candidate_transfer"]
    .map(name => `tests/integration/run_${name}_tests.sh`);
const usage = "npm run test:compat -- --firmware PATH --ark PATH --qmk PATH --report NEW_FILE.json [--publish]";
// A pin is published when the firmware checkout's last-fetched dev, its trunk, contains it.
const PUBLISHED_REF = "refs/remotes/origin/dev";

function parse(argv) {
    const flags = {};
    for (let i = 0; i < argv.length; i++) {
        const key = argv[i];
        if (key === "--publish" && !flags.publish) { flags.publish = true; continue; }
        if (!["--firmware", "--ark", "--qmk", "--report"].includes(key) || flags[key.slice(2)] !== undefined) throw new Error(`Unknown or duplicate argument: ${key}. Usage: ${usage}`);
        const value = argv[++i];
        if (!value || value.startsWith("--")) throw new Error(`Missing value for ${key}. Usage: ${usage}`);
        flags[key.slice(2)] = value;
    }
    for (const key of ["firmware", "ark", "qmk", "report"]) if (!flags[key]) throw new Error(`Required --${key}. Usage: ${usage}`);
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

// Local refs only: the bridge never fetches, so fetch the firmware checkout first
// for a current answer. An unknown pin or missing ref is unpublished.
function pinPublished(firmwareRoot, pin) {
    if (!/^[a-f0-9]{40}$/.test(pin || "")) return false;
    const result = spawnSync("git", ["-C", firmwareRoot, "merge-base", "--is-ancestor", pin, PUBLISHED_REF], {stdio: "ignore"});
    return result.status === 0;
}

// Compare Ark's pinned firmware inputs with the selected firmware working copy.
// A pinned fixture that differs means Ark's own tests check stale bytes, so it
// fails; a pinned spec that differs only lags and is reported.
function compareUpstream(arkRoot, firmwareRoot) {
    const manifest = JSON.parse(fs.readFileSync(path.join(arkRoot, "upstream/manifest.json"), "utf8"));
    const pin = manifest.sources.firmware?.commit;
    const result = {pin, pinPublished: pinPublished(firmwareRoot, pin), publishedRef: PUBLISHED_REF, fixtures: [], specs: []};
    for (const file of manifest.files) {
        if (manifest.sources[file.source]?.repository !== "https://github.com/NoahCLR/charybdis-4x6") continue;
        const source = path.join(firmwareRoot, file.sourcePath);
        const sha = fs.existsSync(source) ? createHash("sha256").update(fs.readFileSync(source)).digest("hex") : null;
        if (sha === file.sourceSha256) continue;
        (file.sourcePath.endsWith(".md") ? result.specs : result.fixtures).push({path: file.sourcePath, missing: sha === null});
    }
    return result;
}

function run(argv) {
    if (argv.length === 1 && argv[0] === "--help") { console.log(usage); return 0; }
    const flags = parse(argv);
    const checkouts = {
        firmware: checkout("firmware", flags.firmware, ["tests/host/noah_host_qmk_env.sh", "users/noah/source_manifest.mk", "tests/host/profile_pd_v1_test.c"]),
        ark: checkout("Ark", flags.ark, [...RUNNERS, "package.json", "upstream/manifest.json", "core/schema/macro-payload.js", "tests/fixtures/pd-profile.js"]),
        qmk: checkout("QMK", flags.qmk, ["quantum/quantum_keycodes.h", "quantum/keycodes.h", "platforms"]),
    };
    const reportPath = path.resolve(flags.report);
    // Keep the report out of checkout status and never overwrite an existing file.
    for (const entry of Object.values(checkouts)) if (reportPath === entry.path || reportPath.startsWith(entry.path + path.sep)) throw new Error("Place --report outside the three checkouts.");
    const fd = fs.openSync(reportPath, "wx");
    const report = {format: 1, publish: Boolean(flags.publish), startedAt: new Date().toISOString(), node: process.version, checkouts, results: [], passed: false};
    const write = () => { fs.ftruncateSync(fd, 0); fs.writeSync(fd, JSON.stringify(report, null, 2) + "\n", 0, "utf8"); };
    try {
        write();
        for (const [name, info] of Object.entries(checkouts)) console.log(`${name}: ${info.path}\n  ${info.revision} (${info.dirty ? "dirty" : "clean"})`);
        report.upstream = compareUpstream(checkouts.ark.path, checkouts.firmware.path);
        report.upstream.pins = checkPins(JSON.parse(fs.readFileSync(path.join(checkouts.ark.path, "upstream/manifest.json"))),
            {firmware: checkouts.firmware.path, qmk: checkouts.qmk.path});
        write();
        const unpublished = report.upstream.pins.filter(pin => !pin.published);
        if (unpublished.length) {
            console.error(`Unpublished pins: ${unpublished.map(pin => pin.name).join(", ")}`);
            if (flags.publish) return 1;
        }
        const describe = entry => `  ${entry.path}${entry.missing ? " (missing in firmware)" : ""}`;
        if (report.upstream.specs.length) console.log(`\nWarning: upstream/ specs lag the selected firmware (pinned ${report.upstream.pin}):\n${report.upstream.specs.map(describe).join("\n")}`);
        if (!report.upstream.pinPublished) {
            const message = `upstream/ pins firmware ${report.upstream.pin}, which the firmware checkout's ${PUBLISHED_REF} does not contain`;
            if (flags.publish) { console.error(`\n${message}. Push and merge that commit, or re-pin to one on dev, before publishing (upstream/README.md).`); return 1; }
            console.log(`\nWarning: ${message}; fine locally, but --publish will fail.`);
        }
        if (report.upstream.fixtures.length) {
            console.error(`\nupstream/ fixtures differ from the selected firmware; refresh them from a committed firmware revision (upstream/README.md):\n${report.upstream.fixtures.map(describe).join("\n")}`);
            return 1;
        }
        const env = {...process.env, FIRMWARE_ROOT: checkouts.firmware.path, CHARYBDIS_ARK_ROOT: checkouts.ark.path, QMK_ROOT: checkouts.qmk.path, QMK_HOME: checkouts.qmk.path};
        for (const runner of RUNNERS) {
            console.log(`\nRunning ${runner}`);
            const result = spawnSync("sh", [path.join(checkouts.ark.path, runner)], {cwd: checkouts.firmware.path, env, stdio: "inherit"});
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
module.exports = {parse, checkout, compareUpstream, run, RUNNERS};
