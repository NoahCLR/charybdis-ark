// @ts-check
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const {spawn} = require("node:child_process");
const {createInterface} = require("node:readline");
const {CandidateUploadCoordinator, CandidateUploadError} = require("../../core/session/candidate-upload-coordinator");
const {candidateTransferPlan} = require("../../core/protocol/candidate-transfer-plan");
const {decodeProfileBlob, encodeProfileBlob, crc32, fnv1a32} = require("../../core/schema/profile-blob-v1");
const {decodeSettings, encodeSettings} = require("../../core/schema/settings-domain-v1");
const {document32, CAPABILITIES_32} = require("../fixtures/pointing-slots-32");
const {validateSnapshot} = require("../../core/model/portable-profile");
const [bin, directory, contractFile] = process.argv.slice(2);
const {decodeCapabilityPages} = require("../../core/protocol/profile-wire-v1");
/** @type {unknown} */
const parsedContract = JSON.parse(fs.readFileSync(contractFile, "utf8"));
assert(parsedContract && typeof parsedContract === "object" && "capabilityPages" in parsedContract);
const pages = parsedContract.capabilityPages;
assert(Array.isArray(pages) && pages.every((/** @type {unknown} */ hex) => typeof hex === "string"));
const contract = {capabilityPages: /** @type {string[]} */ (pages)};
const capabilities = decodeCapabilityPages(contract.capabilityPages.map(hex => Buffer.from(hex, "hex")));
/** @param {Buffer} bytes @param {string} name */
function rename(bytes, name) {
    const profile = decodeProfileBlob(bytes), settings = profile.domains.find(d => d.id === 0x40);
    assert(settings, "The profile corpus must contain settings.");
    const decoded = decodeSettings(settings.payload); decoded.names[0] = name;
    settings.payload = encodeSettings(decoded);
    return encodeProfileBlob(profile);
}
/** @param {string} label @param {Buffer} source @param {Buffer} target @param {boolean} optimized @param {boolean} [corruptSource] */
async function run(label, source, target, optimized, corruptSource = false) {
    const input = path.join(directory, `${label}-source.bin`), output = path.join(directory, `${label}-result.bin`);
    fs.writeFileSync(input, source);
    const child = spawn(bin, [input, output, String(CAPABILITIES_32.actionAbiDigest)], {stdio: ["pipe", "pipe", "inherit"]});
    /** @type {Promise<string> | undefined} */
    let pending;
    /** @type {string[]} */
    const lines = [];
    /** @type {{resolve: (line: string) => void, reject: (error: Error) => void}[]} */
    const listeners = [];
    const next = () => {
        const line = lines.shift();
        return line !== undefined ? Promise.resolve(line) : new Promise((resolve, reject) => listeners.push({resolve, reject}));
    };
    const reader = createInterface({input: child.stdout});
    reader.on("line", line => {
        const listener = listeners.shift();
        if (listener) listener.resolve(line); else lines.push(line);
    });
    /** @type {Promise<void>} */
    const closed = new Promise((resolve, reject) => {
        child.on("error", error => {for (const listener of listeners.splice(0)) listener.reject(error); reject(error);});
        child.on("exit", code => {for (const listener of listeners.splice(0)) listener.reject(Error(`Probe exited ${code}`)); code === 0 ? resolve() : reject(Error(`Probe exited ${code}`));});
    });
    // Attach rejection handling while requests run; failures are awaited below.
    closed.catch(() => {});
    assert.equal(await next(), "ready");
    let requests = 0, uploaded = 0, reused = 0;
    /** @param {string} line */
    const exchange = async line => {assert.equal(pending, undefined); pending = next(); child.stdin.write(line + "\n"); try {return await pending;} finally {pending = undefined;}};
    /** @type {import("../../core/transport/types.js").RequestConnection} */
    const connection = {request: async (report, options) => {
        const frame = Buffer.from(report);
        requests++;
        // Profile Wire 2: a chunk's length at byte 9, a reuse's 32-bit length at 13.
        if (frame[0] === 7 && [0x11, 0x1c].includes(frame[2])) uploaded += frame[9];
        if (frame[0] === 7 && frame[2] === 0x1b) reused += frame.readUInt32LE(13);
        const response = Buffer.from(await exchange(frame.toString("hex")), "hex");
        assert(options?.matchResponse, "The coordinator must supply a response matcher.");
        assert.equal(options.matchResponse(response, frame), true); return response;
    }};
    try {
        if (corruptSource) assert.equal(await exchange("corrupt 500"), "ok");
        // Simulated scan opportunities, not a prediction of device timings.
        const coordinator = new CandidateUploadCoordinator(connection, {sleep: async () => {assert.equal(await exchange("tick 20"), "ok");}});
        const uploading = coordinator.upload(target, {actionAbiDigest: CAPABILITIES_32.actionAbiDigest, capabilities,
            ...(optimized ? {baseSource: {bytes: source, kind: 0, origin: 255, generation: 0, crc32: crc32(source), digest: fnv1a32(source)}} : {})});
        if (corruptSource) {
            await assert.rejects(uploading, error => error instanceof CandidateUploadError && error.code === "DEVICE_REJECTED" && error.deviceError?.name === "CHECKSUM_MISMATCH");
            return;
        }
        const result = await uploading;
        assert.equal(result.status.state, 4);
        child.stdin.end(); await closed;
        assert.deepEqual(fs.readFileSync(output), target, "production C store contains the exact target after full semantic validation");
        return {requests, uploaded, reused};
    } finally {child.kill(); reader.close();}
}
(async () => {
    const ordinary = validateSnapshot(document32(), CAPABILITIES_32).candidate;
    const fixture = fs.readFileSync(path.join(__dirname, "../../upstream/firmware/tests/fixtures/maximum_profile_v4.fixture"), "utf8");
    const match = fixture.match(/^profile\.hex=(.*)$/m);
    assert(match, "The maximum profile fixture must contain profile.hex.");
    const maximum = Buffer.from(match[1], "hex");
    assert(maximum.length > 65535, "the complete profile transfer crosses 64 KiB");
    /** @type {[string, Buffer, Buffer][]} */
    const cases = [["ordinary-name", ordinary, rename(ordinary, "Fast Apply")],
        ["maximum-name", maximum, rename(maximum, "Changed name")], ["unchanged-custom", maximum, maximum]];
    for (const [label, source, target] of cases) {
        if (label !== "unchanged-custom") assert.ok(!source.equals(target), "name edit must change the stored profile");
        const before = await run(label + "-full", source, target, false), after = await run(label + "-delta", source, target, true);
        assert(before && after, "Successful corpus uploads must return transfer counters.");
        // A full upload sends every byte; a delta sends exactly what its plan
        // writes and reuses the rest. How small the plan is, is the plan's own test.
        const planned = candidateTransferPlan(target, source).filter(part => part.kind === "write").reduce((sum, part) => sum + part.length, 0);
        assert.equal(before.uploaded, target.length, `${label}: the full upload sends the whole profile`);
        assert.equal(after.uploaded, planned, `${label}: the delta sends what its plan writes`);
        assert.equal(after.uploaded + after.reused, target.length, `${label}: the delta reuses everything else`);
        assert.ok(after.uploaded < before.uploaded, `${label}: the delta sends less than a full upload`);
        assert.ok(after.requests < before.requests / 2);
        console.log(`${label}: custom bytes ${before.uploaded} -> ${after.uploaded}; HID exchanges ${before.requests} -> ${after.requests}; reused ${after.reused}; exact C readback and full validation passed`);
    }
    await run("corrupt-source", maximum, maximum, true, true);
    console.log("Corruption in reused source rejected by the complete C checksum check before commit.");
})().catch(error => {console.error(error); process.exitCode = 1;});
