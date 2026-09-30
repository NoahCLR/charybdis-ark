"use strict";
// Developer and CI tool: does this Ark agree with a firmware's contract?
//
//   node scripts/check-agreement.js --firmware PATH --qmk PATH
//                                   [--report FILE] [--markdown FILE]
//
// Firmware states its contract (tests/host/run_contract_probe.sh: the Profile
// Wire capability pages the keyboard answers, its BK pin, its fixture hashes);
// this judges it with Ark's own runtime code. Contract checks fail the run:
// the pages decode with Ark's Profile Wire decoder, Ark knows the action-ABI
// digest, protocol and schema versions are ones Ark speaks, Ark's BK keycode
// and layout inputs equal those at firmware's BK pin (--qmk must contain that
// commit), and Ark's pinned fixtures equal firmware's. Everything else
// (firmware version, compiled-default digest, capacities) is reported only:
// it changes with ordinary keymap edits. Never loaded by the app; reads only
// the checkouts it is given and runs firmware's probe with the host compiler.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {createHash} = require("node:crypto");
const {execFileSync} = require("node:child_process");
const {decodeCapabilityPages} = require("../core/protocol/profile-wire-v1");
const {knownActionAbi, KNOWN_ACTION_ABIS} = require("../core/schema/actions");
const {PROFILE_BLOB_V1, PROFILE_BLOB_V2} = require("../core/schema/profile-blob-v1");

const FIRMWARE = "https://github.com/NoahCLR/charybdis-4x6";
const QMK = "https://github.com/NoahCLR/bastardkb-qmk";
const PROTOCOL_MAJORS = [1];
const SCHEMA_MAJORS = [PROFILE_BLOB_V1.SCHEMA_MAJOR, PROFILE_BLOB_V2.SCHEMA_MAJOR];

const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const hex = value => `0x${(value >>> 0).toString(16).padStart(8, "0")}`;

function readContract(firmwareRoot, qmkRoot) {
    const probe = path.join(firmwareRoot, "tests/host/run_contract_probe.sh");
    if (!fs.existsSync(probe)) throw new Error(`firmware at ${firmwareRoot} cannot state its contract (no tests/host/run_contract_probe.sh); it predates the agreement check`);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ark-agreement-"));
    try {
        const output = path.join(dir, "contract.json");
        execFileSync("sh", [probe, "--output", output], {env: {...process.env, QMK_ROOT: qmkRoot}, stdio: ["ignore", "ignore", "inherit"]});
        return JSON.parse(fs.readFileSync(output, "utf8"));
    } finally {
        fs.rmSync(dir, {recursive: true, force: true});
    }
}

function judge(contract, manifest, qmkRoot) {
    const checks = [];
    const add = (name, ok, detail) => checks.push({name, ok, detail});
    let decoded = null;
    try {
        const pages = contract.capabilityPages.map(page => Uint8Array.from(Buffer.from(page, "hex")));
        decoded = decodeCapabilityPages(pages);
        add("Profile Wire capability pages decode with Ark's decoder", true, `${pages.length} pages`);
    } catch (error) {
        add("Profile Wire capability pages decode with Ark's decoder", false, error.message);
    }
    if (decoded) {
        add("Profile Wire protocol is one Ark speaks", PROTOCOL_MAJORS.includes(decoded.protocol.major),
            `firmware ${decoded.protocol.major}.${decoded.protocol.minor}; Ark ${PROTOCOL_MAJORS.join(", ")}`);
        add("profile schema is one Ark reads", SCHEMA_MAJORS.includes(decoded.schema.major),
            `firmware ${decoded.schema.major}.${decoded.schema.minor}; Ark ${SCHEMA_MAJORS.join(", ")}`);
        add("action-ABI digest is known to Ark", knownActionAbi(decoded.actionAbiDigest),
            `firmware ${hex(decoded.actionAbiDigest)}; Ark knows ${KNOWN_ACTION_ABIS.map(hex).join(", ")}`);
    }

    // BK inputs: Ark's keycode and layout snapshots against firmware's BK pin.
    const pin = contract.qmkPin && contract.qmkPin.commit;
    const qmkFiles = manifest.files.filter(file => manifest.sources[file.source].repository === QMK && file.sourcePath);
    const bkDiffers = [];
    for (const file of qmkFiles) {
        let bytes;
        try {
            bytes = execFileSync("git", ["-C", qmkRoot, "show", `${pin}:${file.sourcePath}`], {maxBuffer: 64 << 20});
        } catch {
            bkDiffers.push(`${file.sourcePath} (missing at the pin)`);
            continue;
        }
        if (sha256(bytes) !== file.sourceSha256) bkDiffers.push(file.sourcePath);
    }
    add("Ark's BK keycode and layout inputs equal firmware's BK pin", Boolean(pin) && bkDiffers.length === 0,
        !pin ? "firmware names no BK pin" : bkDiffers.length ? `differ: ${bkDiffers.join(", ")}` : `${qmkFiles.length} files at ${pin.slice(0, 10)}`);

    // Fixtures: Ark's pinned golden bytes against the firmware's current ones.
    const fixtures = manifest.files.filter(file => manifest.sources[file.source].repository === FIRMWARE && file.sourcePath.startsWith("tests/fixtures/"));
    const fixtureDiffers = fixtures.filter(file => contract.fixtures[file.sourcePath] !== file.sourceSha256)
        .map(file => file.sourcePath + (contract.fixtures[file.sourcePath] ? "" : " (missing)"));
    add("Ark's pinned fixtures equal the firmware's", fixtureDiffers.length === 0,
        fixtureDiffers.length ? `differ: ${fixtureDiffers.join(", ")}` : `${fixtures.length} fixtures`);

    const info = decoded ? {
        "firmware commit": contract.firmwareCommit ? contract.firmwareCommit.slice(0, 12) : "unknown",
        "BK pin": pin ? pin.slice(0, 12) : "none",
        "firmware version": hex(decoded.firmwareVersion),
        "compiled-default digest": hex(decoded.compiledDefaultDigest),
        "layers": `${decoded.compiledLayerCount} of ${decoded.maxLogicalLayers}`,
        "custom keys": decoded.customKeySlots,
        "VIA macros": `${decoded.viaMacroSlots} slots, ${decoded.viaMacroBytes} bytes`,
        "feature flags": hex(decoded.featureFlags),
        "domains": `0x${decoded.supportedDomainMask.toString(16)}`,
    } : {};
    return {format: 1, agrees: checks.every(check => check.ok), checks, info};
}

function markdown(result) {
    const lines = [`**Ark ↔ firmware agreement: ${result.agrees ? "agrees" : "DOES NOT AGREE"}**`, "",
        "| Check | Result | Detail |", "| --- | --- | --- |"];
    for (const check of result.checks) lines.push(`| ${check.name} | ${check.ok ? "✓" : "✗"} | ${check.detail} |`);
    if (Object.keys(result.info).length) {
        lines.push("", "| Reported (not compared) | Value |", "| --- | --- |");
        for (const [key, value] of Object.entries(result.info)) lines.push(`| ${key} | ${value} |`);
    }
    return lines.join("\n") + "\n";
}

function parse(argv) {
    const flags = {};
    const names = {"--firmware": "firmware", "--qmk": "qmk", "--report": "report", "--markdown": "markdown"};
    for (let i = 0; i < argv.length; i += 2) {
        const name = names[argv[i]];
        if (!name || flags[name] !== undefined || !argv[i + 1] || argv[i + 1].startsWith("--")) throw new Error(`Invalid argument ${argv[i]}`);
        flags[name] = argv[i + 1];
    }
    if (!flags.firmware || !flags.qmk) throw new Error("Pass --firmware PATH --qmk PATH [--report FILE] [--markdown FILE]");
    return flags;
}

function run(argv, arkRoot = path.resolve(__dirname, "..")) {
    const flags = parse(argv);
    const manifest = JSON.parse(fs.readFileSync(path.join(arkRoot, "upstream/manifest.json"), "utf8"));
    const result = judge(readContract(path.resolve(flags.firmware), path.resolve(flags.qmk)), manifest, path.resolve(flags.qmk));
    const text = markdown(result);
    process.stdout.write(text);
    if (flags.report) fs.writeFileSync(flags.report, JSON.stringify(result, null, 2) + "\n");
    if (flags.markdown) fs.writeFileSync(flags.markdown, text);
    return result.agrees ? 0 : 1;
}

if (require.main === module) {
    try {process.exitCode = run(process.argv.slice(2));} catch (error) {console.error(error.message); process.exitCode = 1;}
}
module.exports = {judge, markdown, run};
