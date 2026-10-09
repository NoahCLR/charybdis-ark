"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const {VIA_STORAGE, VIA_REGION_BYTES, LAYOUT_BYTES, MACRO_BANK_BYTES, viaStorageDigest, readViaStorage, readRegion, writeRegion, changedRanges, writeChangedRegion, writeViaMacros} = require("../../core/protocol/via-storage-v1");
// The sixteen-layer keyboard (firmware D-F14): a 1,920-byte keymap (16 layers
// of 10 x 6 keys) and a 10,327-byte macro bank for 128 macro slots, inside a
// 12 KiB VIA region.
function keyboard() {
    const layout = Buffer.alloc(1920, 1), macros = Buffer.alloc(10327);
    return {layout, macros, async request(request) {
        const response = Buffer.from(request), command = request[0];
        if (command === 0x11) response[1] = 16;
        else if (command === 0x0c) response[1] = 128;
        else if (command === 0x0d) response.writeUInt16BE(macros.length, 1);
        else {
            const bytes = [0x12, 0x13].includes(command) ? layout : macros;
            const offset = request.readUInt16BE(1), count = request[3];
            if ([0x0e, 0x12].includes(command)) bytes.copy(response, 4, offset, offset + count);
            else request.copy(bytes, offset, 4, 4 + count);
        }
        return response;
    }};
}
test("reads every matrix position and the entire macro bank, including unused storage", async () => {
    assert.equal(VIA_REGION_BYTES, 12288); assert.equal(LAYOUT_BYTES, 1920); assert.equal(MACRO_BANK_BYTES, 10327);
    const device = keyboard(); device.macros[10000] = 23; device.layout[1919] = 9;
    const read = await readViaStorage(device);
    assert.equal(read.layers, 16); assert.equal(read.macroSlots, 128); assert.equal(read.macroCapacity, 10327);
    assert.deepEqual(read.layout, device.layout); assert.deepEqual(read.macros, device.macros);
});
test("computes the firmware's canonical digest for the complete VIA store", () => {
    const device = keyboard();
    // The algorithm is unchanged; only the region sizes grew. An independent
    // FNV-1a over the canonical frames (id, u16 length, bytes) agrees.
    const fnv = bytes => bytes.reduce((hash, byte) => Math.imul((hash ^ byte) >>> 0, 16777619) >>> 0, 2166136261);
    const frame = (id, bytes) => [id, bytes.length & 255, bytes.length >>> 8, ...bytes];
    const reference = fnv([...frame(1, [1, 0]), ...frame(2, device.layout), ...frame(3, []), ...frame(4, device.macros)]);
    assert.equal(viaStorageDigest(device), 1534821754);
    assert.equal(reference, 1534821754);
    assert.throws(() => viaStorageDigest({layout: Buffer.alloc(1), macros: device.macros}), /geometry/);
    // The eight-layer geometry (960-byte keymap, 7,191-byte macro bank) is refused.
    assert.throws(() => viaStorageDigest({layout: Buffer.alloc(960, 1), macros: device.macros}), /geometry/);
    assert.throws(() => viaStorageDigest({layout: device.layout, macros: Buffer.alloc(7191)}), /geometry/);
});
test("writes across chunk and final partial boundaries with exact acknowledgements", async () => {
    const device = keyboard(), bytes = Buffer.alloc(1920, 17), progress = [];
    await writeRegion(device, VIA_STORAGE.LAYOUT_WRITE, bytes, {onProgress: value => progress.push(value)});
    assert.deepEqual(device.layout, bytes); assert.equal(progress.at(-1).completed, 1920);
});
test("writes only changed byte ranges and reads them back at their absolute offsets", async () => {
    const device = keyboard(), current = Buffer.from(device.layout), target = Buffer.from(current), requests = [];
    target[10] = 4; target[11] = 5; target[900] = 6; target[1919] = 7;
    const request = device.request.bind(device);
    device.request = async bytes => {requests.push(Buffer.from(bytes)); return request(bytes);};
    assert.deepEqual(changedRanges(current, target).map(range => [range.offset, range.bytes.length]), [[0, 28], [896, 28], [1904, 16]]);
    await writeChangedRegion(device, VIA_STORAGE.LAYOUT_WRITE, target, current);
    assert.deepEqual(requests.map(bytes => [bytes.readUInt16BE(1), bytes[3]]), [[0, 28], [896, 28], [1904, 16]]);
    assert.deepEqual(await readRegion(device, VIA_STORAGE.LAYOUT_READ, 2, {startOffset: 10}), target.subarray(10, 12));
    assert.deepEqual(await readRegion(device, VIA_STORAGE.LAYOUT_READ, 2, {startOffset: 1918}), target.subarray(1918, 1920));
});
test("rejects an incomplete macro write and corrupted response headers", async () => {
    const device = keyboard(); device.macros[10326] = 1;
    await assert.rejects(readViaStorage(device), /incomplete/);
    assert.deepEqual((await readViaStorage(device, {allowIncomplete: true})).macros, device.macros);
    await assert.rejects(readRegion({request: async request => {const r = Buffer.from(request); r[2]++; return r;}}, 0x12, 30), /chunk/);
});
test("macro execution stays invalidated until the last acknowledged byte", async () => {
    const device = keyboard(), request = device.request.bind(device), sentinels = [];
    device.request = async bytes => {const response = await request(bytes); sentinels.push(device.macros.at(-1)); return response;};
    const target = Buffer.alloc(10327); target.write("hello");
    await writeViaMacros(device, target);
    assert.ok(sentinels.slice(0, -1).every(value => value === 1));
    assert.equal(sentinels.at(-1), 0); assert.deepEqual(device.macros, target);
});
test("a small macro edit does not transfer the unused macro capacity", async () => {
    const device = keyboard(), current = Buffer.from(device.macros), target = Buffer.from(current), requests = [];
    target.write("hello");
    const request = device.request.bind(device);
    device.request = async bytes => {requests.push(Buffer.from(bytes)); const response = await request(bytes); return response;};
    await writeViaMacros(device, target, {current});
    assert.deepEqual(requests.map(bytes => [bytes.readUInt16BE(1), bytes[3]]), [[10326, 1], [0, 28], [10326, 1]]);
    assert.deepEqual(device.macros, target);
});
test("an interrupted macro transfer stays invalid and can be replaced on retry", async () => {
    const device = keyboard(), request = device.request.bind(device); let writes = 0;
    device.request = async bytes => {if (++writes === 4) throw Error("disconnected"); return request(bytes);};
    const target = Buffer.alloc(10327); target.write("replacement");
    await assert.rejects(writeViaMacros(device, target), /disconnected/);
    assert.equal(device.macros.at(-1), 1);
    device.request = request; await writeViaMacros(device, target);
    assert.deepEqual((await readViaStorage(device)).macros, target);
});
test("rejects unhandled commands, bad capacities and malformed write echoes", async () => {
    await assert.rejects(readViaStorage({request: async (request) => Object.assign(Buffer.from(request), {0: 0xff})}), /not support/);
    const device = keyboard(), request = device.request.bind(device);
    for (const [command, mutate] of [
        [0x11, r => {r[1] = 17;}], [0x11, r => {r[1] = 0;}],
        [0x0c, r => {r[1] = 129;}], [0x0c, r => {r[1] = 0;}],
        [0x0d, r => {r.writeUInt16BE(VIA_REGION_BYTES + 1, 1);}], [0x0d, r => {r.writeUInt16BE(128, 1);}],
    ]) {
        device.request = async data => {const r = await request(data); if (r[0] === command) mutate(r); return r;};
        await assert.rejects(readViaStorage(device), /geometry/);
    }
    // Every read and write stays inside the 12 KiB region; its last chunk is reachable.
    const edge = {request: async data => Buffer.from(data)};
    assert.equal((await readRegion(edge, VIA_STORAGE.MACRO_READ, 28, {startOffset: VIA_REGION_BYTES - 28})).length, 28);
    await assert.rejects(readRegion(edge, VIA_STORAGE.MACRO_READ, VIA_REGION_BYTES + 1), /size/);
    await assert.rejects(readRegion(edge, VIA_STORAGE.MACRO_READ, 2, {startOffset: VIA_REGION_BYTES - 1}), /size/);
    await assert.rejects(writeRegion(edge, VIA_STORAGE.MACRO_WRITE, Buffer.alloc(2), {startOffset: VIA_REGION_BYTES - 1}), /payload/);
    await assert.rejects(writeRegion({request: async data => {const r = Buffer.from(data); r[4]++; return r;}}, 0x13, Buffer.alloc(30)), /acknowledge/);
});
