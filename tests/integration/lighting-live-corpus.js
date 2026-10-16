// @ts-check
"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs");
const v = require("../../upstream/firmware/tests/fixtures/lighting_live_v1.json");
const {decodeLiveCapability, decodeLiveFacts, decodeLiveStatus, decodeLiveResponse, buildLiveRead, buildLiveControl} = require("../../core/protocol/lighting-live-v1");
const {crc32} = require("../../core/schema/profile-blob-v1");
const cap = decodeLiveCapability(Buffer.from(v.capability, "hex"));
assert.equal(decodeLiveFacts(Buffer.from(v.facts, "hex"), cap, 1).profile.digest, 0x55667788);
assert.equal(decodeLiveStatus(v.reports.slice(35, 38).map(c => Buffer.from(c.response, "hex").subarray(7))).snapshotId, 1);
assert.equal(crc32(Buffer.from(v.frame, "hex")), v.frameCrc32);
const lines = [v.capability, v.frame, String(v.frameCrc32)];
for (const c of v.reports) {
    const q = Buffer.from(c.request, "hex");decodeLiveResponse(Buffer.from(c.response, "hex"), q);
    // The last reports deliberately carry malformed/reserved fields.
    const canonical = q[0] === 8 && !q.subarray(9).some(Boolean) ? buildLiveRead(q[2], q[4], q.readUInt32LE(5), q[3]) : q;
    assert.deepEqual(canonical, q);lines.push(`${canonical.toString("hex")} ${c.response}`);
}
lines.push(`LIFECYCLE ${v.lifecycle.length}`);
for (const c of v.lifecycle) {
    const q = Buffer.from(c.request, "hex"), op = q[4];
    const request = buildLiveControl(op, q[3], {owner: [...q.subarray(5, 13)], token: q.readUInt32LE(13), revision: q.readUInt32LE(op === 2 ? 13 : 17), digest: q.readUInt32LE(17), frameBytes: q.readUInt16LE(21), crc32: q.readUInt32LE(23), offset: q.readUInt16LE(21), bytes: q.subarray(24, 24 + q[23]), renewal: q.readUInt32LE(21)});
    assert.deepEqual(request, q);decodeLiveResponse(Buffer.from(c.admission, "hex"), request);decodeLiveResponse(Buffer.from(c.completion, "hex"), request);
    lines.push(`${request.toString("hex")} ${c.admission} ${c.completion}`);
}
fs.writeFileSync(process.argv[2], lines.join("\n") + "\n");
