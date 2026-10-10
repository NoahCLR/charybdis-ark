"use strict";
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const {spawn} = require("node:child_process");
const {createInterface} = require("node:readline");
const {CandidateUploadCoordinator} = require("../../core/session/candidate-upload-coordinator");
const {decodeProfileBlob, encodeProfileBlob, crc32, fnv1a32} = require("../../core/schema/profile-blob-v1");
const {decodeSettings, encodeSettings} = require("../../core/schema/settings-domain-v1");
const {document32, CAPABILITIES_32} = require("../fixtures/pd-slots-32");
const {validateSnapshot} = require("../../core/model/portable-profile");
const [bin, directory] = process.argv.slice(2);
function rename(bytes, name) {
    const profile = decodeProfileBlob(bytes), settings = profile.domains.find(d => d.id === 0x40);
    const decoded = decodeSettings(settings.payload); decoded.names[0] = name;
    settings.payload = encodeSettings(decoded);
    return encodeProfileBlob(profile);
}
async function run(label, source, target, optimized, corruptSource = false) {
    const input = path.join(directory, `${label}-source.bin`), output = path.join(directory, `${label}-result.bin`);
    fs.writeFileSync(input, source);
    const child = spawn(bin, [input, output, String(CAPABILITIES_32.actionAbiDigest)], {stdio: ["pipe", "pipe", "inherit"]});
    let pending;
    const lines = [], listeners = [];
    const next = () => lines.length ? Promise.resolve(lines.shift()) : new Promise((resolve, reject) => listeners.push({resolve, reject}));
    const reader = createInterface({input: child.stdout});
    reader.on("line", line => listeners.length ? listeners.shift().resolve(line) : lines.push(line));
    const closed = new Promise((resolve, reject) => {
        child.on("error", error => {for (const listener of listeners.splice(0)) listener.reject(error); reject(error);});
        child.on("exit", code => {for (const listener of listeners.splice(0)) listener.reject(Error(`Probe exited ${code}`)); code === 0 ? resolve() : reject(Error(`Probe exited ${code}`));});
    });
    // Attach rejection handling while requests run; failures are awaited below.
    closed.catch(() => {});
    assert.equal(await next(), "ready");
    let requests = 0, uploaded = 0, reused = 0;
    const exchange = async line => {assert.equal(pending, undefined); pending = next(); child.stdin.write(line + "\n"); try {return await pending;} finally {pending = undefined;}};
    const connection = {request: async (frame, options) => {
        requests++;
        if (frame[0] === 7 && [0x11, 0x1c].includes(frame[2])) uploaded += frame[7];
        if (frame[0] === 7 && frame[2] === 0x1b) reused += frame.readUInt16LE(9);
        const response = Buffer.from(await exchange(frame.toString("hex")), "hex");
        assert.equal(options.matchResponse(response, frame), true); return response;
    }};
    try {
        if (corruptSource) assert.equal(await exchange("corrupt 500"), "ok");
        // Simulated scan opportunities, not a prediction of device timings.
        const coordinator = new CandidateUploadCoordinator(connection, {sleep: async () => {assert.equal(await exchange("tick 20"), "ok");}});
        const uploading = coordinator.upload(target, {actionAbiDigest: CAPABILITIES_32.actionAbiDigest, viaGeneration: 2, viaDigest: 123,
            streamChunks: optimized, ...(optimized ? {baseSource: {bytes: source, kind: 0, origin: 255, generation: 0, crc32: crc32(source), digest: fnv1a32(source)}} : {})});
        if (corruptSource) {
            await assert.rejects(uploading, error => error.code === "DEVICE_REJECTED" && error.deviceError.name === "CHECKSUM_MISMATCH");
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
    const ordinary = validateSnapshot(document32(), CAPABILITIES_32).profile;
    const fixture = fs.readFileSync(path.join(__dirname, "../../upstream/firmware/tests/fixtures/maximum_profile_v3.fixture"), "utf8");
    const maximum = Buffer.from(fixture.match(/^profile\.hex=(.*)$/m)[1], "hex");
    for (const [label, source, target] of [["ordinary-name", ordinary, rename(ordinary, "Fast Apply")],
        ["maximum-name", maximum, rename(maximum, "Changed name")], ["unchanged-custom", maximum, maximum]]) {
        if (label !== "unchanged-custom") assert.ok(!source.equals(target), "name edit must change the stored profile");
        const before = await run(label + "-full", source, target, false), after = await run(label + "-delta", source, target, true);
        assert.ok(after.uploaded < before.uploaded / 5);
        assert.ok(after.requests < before.requests / 2);
        console.log(`${label}: custom bytes ${before.uploaded} -> ${after.uploaded}; HID exchanges ${before.requests} -> ${after.requests}; reused ${after.reused}; exact C readback and full validation passed`);
    }
    await run("corrupt-source", maximum, maximum, true, true);
    console.log("Corruption in reused source rejected by the complete C checksum check before commit.");
})().catch(error => {console.error(error); process.exitCode = 1;});
