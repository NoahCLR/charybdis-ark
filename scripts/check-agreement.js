"use strict";
// @ts-check
// Developer and CI tool: does this Ark agree with a firmware's contract?
//
//   node scripts/check-agreement.js --firmware PATH --qmk PATH
//                                   [--report FILE] [--markdown FILE]
//
// Firmware states its contract (tests/host/run_contract_probe.sh: the Profile
// Wire capability pages the keyboard answers, its BK pin, its fixture hashes);
// this judges it with Ark's own runtime code. Contract checks fail the run:
// the pages decode with Ark's Profile Wire decoder, the Profile Wire and
// schema versions are exactly the base Ark requires (major and minor, D-L64:
// the version implies everything the keyboard does), Ark knows the action-ABI
// digest, the firmware supports every profile domain Ark registers, it is a
// split build that saves (what Apply needs; the feature word holds only build
// differences), Ark's BK keycode and layout inputs equal those at firmware's
// BK pin (--qmk must contain that commit), and Ark's pinned fixtures equal
// firmware's. Everything else (firmware version, compiled-default digest,
// capacities, the pointing bit) is reported only: it changes with ordinary
// keymap edits or build options. Never loaded by the app; reads only
// the checkouts it is given and runs firmware's probe, which compiles in
// firmware's build image (Docker must be running).
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {createHash} = require("node:crypto");
const {execFileSync} = require("node:child_process");
const {decodeCapabilityPages, PROFILE_WIRE_KNOWN_MASKS} = require("../core/protocol/profile-wire-v1");
const {knownActionAbi, KNOWN_ACTION_ABIS} = require("../core/schema/actions");
const {PROFILE_DOMAIN_MASK} = require("../core/schema/profile-domains");
const {SUPPORTED_PROFILE_PROTOCOL, SUPPORTED_PROFILE_SCHEMA} = require("../core/session/firmware-support");

const FIRMWARE = "https://github.com/NoahCLR/charybdis-4x6";
const QMK = "https://github.com/NoahCLR/bastardkb-qmk";
/** @param {{major: number, minor: number}} version */
const shown = version => `${version.major}.${version.minor}`;
/** @param {{major: number, minor: number}} actual @param {{major: number, minor: number}} expected */
const same = (actual, expected) => actual.major === expected.major && actual.minor === expected.minor;

/**
 * @param {string | NodeJS.ArrayBufferView} bytes
 */
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
/**
 * @param {number} value
 */
const hex = value => `0x${(value >>> 0).toString(16).padStart(8, "0")}`;

/**
 * @param {string} firmwareRoot
 * @param {string} qmkRoot
 * @returns {import("./contract-types.js").FirmwareContract}
 */
function readContract(firmwareRoot, qmkRoot) {
    const probe = path.join(firmwareRoot, "tests/host/run_contract_probe.sh");
    if (!fs.existsSync(probe)) throw new Error(`firmware at ${firmwareRoot} cannot state its contract (no tests/host/run_contract_probe.sh); it predates the agreement check`);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ark-agreement-"));
    try {
        const output = path.join(dir, "contract.json");
        execFileSync("sh", [probe, "--output", output], {env: {...process.env, QMK_ROOT: qmkRoot}, stdio: ["ignore", "ignore", "inherit"]});
        // Produced by the explicitly selected firmware contract probe. Ark
        // still decodes and checks its capability bytes below.
        return /** @type {import("./contract-types.js").FirmwareContract} */ (JSON.parse(fs.readFileSync(output, "utf8")));
    } finally {
        fs.rmSync(dir, {recursive: true, force: true});
    }
}

/**
 * @param {import("./contract-types.js").FirmwareContract} contract
 * @param {import("./contract-types.js").UpstreamManifest} manifest
 * @param {string} qmkRoot
 * @returns {import("./contract-types.js").AgreementReport}
 */
function judge(contract, manifest, qmkRoot) {
    /** @type {import("./contract-types.js").AgreementCheck[]} */
    const checks = [];
    /**
     * @param {string} name
     * @param {boolean} ok
     * @param {string} detail
     */
    const add = (name, ok, detail) => checks.push({name, ok, detail});
    let decoded = null;
    try {
        const pages = contract.capabilityPages.map(page => Uint8Array.from(Buffer.from(page, "hex")));
        decoded = decodeCapabilityPages(pages);
        add("Profile Wire capability pages decode with Ark's decoder", true, `${pages.length} pages`);
    } catch (error) {
        add("Profile Wire capability pages decode with Ark's decoder", false, (error instanceof Error ? error.message : String(error)));
    }
    if (decoded) {
        add("Profile Wire version is the one Ark requires", same(decoded.protocol, SUPPORTED_PROFILE_PROTOCOL),
            `firmware ${shown(decoded.protocol)}; Ark ${shown(SUPPORTED_PROFILE_PROTOCOL)}`);
        add("profile schema is the one Ark reads", same(decoded.schema, SUPPORTED_PROFILE_SCHEMA),
            `firmware ${shown(decoded.schema)}; Ark ${shown(SUPPORTED_PROFILE_SCHEMA)}`);
        add("action-ABI digest is known to Ark", knownActionAbi(decoded.actionAbiDigest),
            `firmware ${hex(decoded.actionAbiDigest)}; Ark knows ${KNOWN_ACTION_ABIS.map(hex).join(", ")}`);
        const domainsMissing = PROFILE_DOMAIN_MASK & ~decoded.supportedDomainMask;
        add("firmware supports every profile domain Ark registers", domainsMissing === 0,
            `firmware 0x${decoded.supportedDomainMask.toString(16)}; Ark 0x${PROFILE_DOMAIN_MASK.toString(16)}${domainsMissing ? `, missing 0x${domainsMissing.toString(16)}` : ""}`);
        const required = PROFILE_WIRE_KNOWN_MASKS.CURRENT_MUTATION_FEATURES;
        const missing = (required & ~decoded.featureFlags) >>> 0;
        add("firmware is a split build that saves", missing === 0,
            `firmware ${hex(decoded.featureFlags)}; Apply needs ${hex(required)}${missing ? `, missing ${hex(missing)}` : ""}`);
    }

    // BK inputs: Ark's keycode and layout snapshots against firmware's BK pin.
    const pin = contract.qmkPin && contract.qmkPin.commit;
    const qmkFiles = manifest.files.filter(
        /** @returns {file is import("./contract-types.js").UpstreamFile & {sourcePath: string}} */
        file => manifest.sources[file.source].repository === QMK && Boolean(file.sourcePath));
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
    // Only the QMK version stamp has a null source path. Firmware entries
    // mirror committed source files, and fixtures are selected by that path.
    const fixtures = manifest.files.filter(
        /** @returns {file is import("./contract-types.js").UpstreamFile & {sourcePath: string}} */
        file => manifest.sources[file.source].repository === FIRMWARE && /** @type {string} */ (file.sourcePath).startsWith("tests/fixtures/"));
    const fixtureDiffers = fixtures.filter(file => contract.fixtures[file.sourcePath] !== file.sourceSha256)
        .map(file => file.sourcePath + (contract.fixtures[file.sourcePath] ? "" : " (missing)"));
    add("Ark's pinned fixtures equal the firmware's", fixtureDiffers.length === 0,
        fixtureDiffers.length ? `differ: ${fixtureDiffers.join(", ")}` : `${fixtures.length} fixtures`);

    /** @type {Record<string, string | number>} */
    const info = decoded ? {
        "firmware commit": contract.firmwareCommit ? contract.firmwareCommit.slice(0, 12) : "unknown",
        "BK pin": pin ? pin.slice(0, 12) : "none",
        "firmware version": hex(decoded.firmwareVersion),
        "compiled-default digest": hex(decoded.compiledDefaultDigest),
        "layers": `${decoded.compiledLayerCount} of ${decoded.maxLogicalLayers}`,
        "custom keys": decoded.customKeySlots,
        "Profile macros": `${decoded.macroSlots} slots, ${decoded.macroBytes} bytes`,
        "feature flags": hex(decoded.featureFlags),
        "domains": `0x${decoded.supportedDomainMask.toString(16)}`,
    } : {};
    return {format: 1, agrees: checks.every(check => check.ok), checks, info};
}

/**
 * @param {import("./contract-types.js").AgreementReport} result
 */
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

/**
 * @param {string[]} argv
 * @returns {{firmware: string, qmk: string, report?: string, markdown?: string}}
 */
function parse(argv) {
    /** @type {Record<string, string | undefined>} */
    const flags = {};
    /** @type {Record<string, string | undefined>} */
    const names = {"--firmware": "firmware", "--qmk": "qmk", "--report": "report", "--markdown": "markdown"};
    for (let i = 0; i < argv.length; i += 2) {
        const name = names[argv[i]];
        if (!name || flags[name] !== undefined || !argv[i + 1] || argv[i + 1].startsWith("--")) throw new Error(`Invalid argument ${argv[i]}`);
        flags[name] = argv[i + 1];
    }
    if (!flags.firmware || !flags.qmk) throw new Error("Pass --firmware PATH --qmk PATH [--report FILE] [--markdown FILE]");
    // Required paths have been checked; the remaining named options are strings.
    return /** @type {{firmware: string, qmk: string, report?: string, markdown?: string}} */ (flags);
}

/**
 * @param {string[]} argv
 * @param {string} arkRoot
 */
function run(argv, arkRoot = path.resolve(__dirname, "..")) {
    const flags = parse(argv);
    /** @type {import("./contract-types.js").UpstreamManifest} */
    const manifest = JSON.parse(fs.readFileSync(path.join(arkRoot, "upstream/manifest.json"), "utf8"));
    const result = judge(readContract(path.resolve(flags.firmware), path.resolve(flags.qmk)), manifest, path.resolve(flags.qmk));
    const text = markdown(result);
    process.stdout.write(text);
    if (flags.report) fs.writeFileSync(flags.report, JSON.stringify(result, null, 2) + "\n");
    if (flags.markdown) fs.writeFileSync(flags.markdown, text);
    return result.agrees ? 0 : 1;
}

if (require.main === module) {
    try {process.exitCode = run(process.argv.slice(2));} catch (error) {console.error((error instanceof Error ? error.message : String(error))); process.exitCode = 1;}
}
module.exports = {judge, markdown, run};
