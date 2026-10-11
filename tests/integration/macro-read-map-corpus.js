// @ts-check
"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs");
const {readViaStorage, VIA_STORAGE, viaStorageDigest} = require("../../core/protocol/via-storage-v1");
const fixture = fs.readFileSync(process.argv[2]), capacity = Number(process.argv[3]), mode = process.argv[4];
const digest = fixture.readUInt32LE(0), bitmap = fixture.subarray(4, 36), compatible = fixture[36], layout = fixture.subarray(37, 1957), macros = fixture.subarray(1957);
assert.equal(macros.length, capacity);
assert.equal(compatible, mode === "nonstandard" ? 0 : 1);
const metadata = Buffer.alloc(13); metadata[0] = 1; metadata.writeUInt16LE(256, 1); metadata.writeUInt16LE(capacity, 3);
metadata.writeUInt32LE(7, 5); metadata.writeUInt32LE(digest, 9);
let exchanges = 0;
/** @type {import("../../core/transport/types.js").RequestConnection} */
const device = {async request(report) {
    const request = Buffer.from(report);
    const reply = Buffer.from(request);
    if (request[0] === 8) {
        reply.fill(0, 5);
        if (!compatible) {reply[5] = 3; return reply;}
        const length = Math.ceil(Math.ceil(capacity / 256) / 8), page = request[4];
        const payload = page === 0 ? metadata : bitmap.subarray((page - 1) * 25, Math.min(page * 25, length));
        reply[6] = payload.length; payload.copy(reply, 7);
    } else if (request[0] === VIA_STORAGE.LAYER_COUNT) reply[1] = 16;
    else if (request[0] === VIA_STORAGE.MACRO_COUNT) reply[1] = 128;
    else if (request[0] === VIA_STORAGE.MACRO_SIZE) reply.writeUInt16BE(capacity, 1);
    else {
        const bytes = request[0] === VIA_STORAGE.LAYOUT_READ ? layout : macros;
        bytes.copy(reply, 4, request.readUInt16BE(1), request.readUInt16BE(1) + request[3]);
        if (request[0] === VIA_STORAGE.MACRO_READ) exchanges++;
    }
    return reply;
}};
(async () => {
    const read = await readViaStorage(device, {capabilities: {}, storageIdentity: {generation: 7, digest}});
    assert.deepEqual(read.layout, layout); assert.deepEqual(read.macros, macros);
    if (compatible) assert.equal(viaStorageDigest(read), digest);
    if (mode === "empty") assert.equal(exchanges, 0);
    else if (mode === "sparse") assert.ok(exchanges <= 20);
    else assert.equal(exchanges, Math.ceil(capacity / 28));
    console.log(`Ark reconstructs firmware's ${mode} ${capacity}-byte bank exactly in ${exchanges} macro exchanges`);
})().catch(error => {console.error(error); process.exitCode = 1;});
