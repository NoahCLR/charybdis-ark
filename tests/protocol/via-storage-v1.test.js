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
    assert.throws(() => viaStorageDigest({layout: device.layout, macros: Buffer.alloc(128)}), /geometry/);
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
        await assert.rejects(readViaStorage(device, {capabilities: {compiledLayerCount: 16, viaMacroSlots: 128, viaMacroBytes: 10327}}), /geometry/);
    }
    // Every read and write stays inside the 12 KiB region; its last chunk is reachable.
    const edge = {request: async data => Buffer.from(data)};
    assert.equal((await readRegion(edge, VIA_STORAGE.MACRO_READ, 28, {startOffset: VIA_REGION_BYTES - 28})).length, 28);
    await assert.rejects(readRegion(edge, VIA_STORAGE.MACRO_READ, VIA_REGION_BYTES + 1), /size/);
    await assert.rejects(readRegion(edge, VIA_STORAGE.MACRO_READ, 2, {startOffset: VIA_REGION_BYTES - 1}), /size/);
    await assert.rejects(writeRegion(edge, VIA_STORAGE.MACRO_WRITE, Buffer.alloc(2), {startOffset: VIA_REGION_BYTES - 1}), /payload/);
    await assert.rejects(writeRegion({request: async data => {const r = Buffer.from(data); r[4]++; return r;}}, 0x13, Buffer.alloc(30)), /acknowledge/);
});

test("the expanded bank is read, hashed and written through its last offset with bounded ranges", async () => {
    // Use an independent device adapter with the larger backing allocation.
    const layout = Buffer.alloc(1920), macros = Buffer.alloc(34903), requests = [];
    const connection = {async request(request) {
        requests.push(Buffer.from(request));
        const reply = Buffer.from(request);
        if (request[0] === 8) {reply[0] = 255; return reply;}
        if (request[0] === VIA_STORAGE.LAYER_COUNT) reply[1] = 16;
        else if (request[0] === VIA_STORAGE.MACRO_COUNT) reply[1] = 128;
        else if (request[0] === VIA_STORAGE.MACRO_SIZE) reply.writeUInt16BE(macros.length, 1);
        else {
            const bank = [VIA_STORAGE.LAYOUT_READ, VIA_STORAGE.LAYOUT_WRITE].includes(request[0]) ? layout : macros;
            const offset = request.readUInt16BE(1), count = request[3];
            assert.ok(offset + count <= bank.length);
            if ([VIA_STORAGE.LAYOUT_READ, VIA_STORAGE.MACRO_READ].includes(request[0])) bank.copy(reply, 4, offset, offset + count);
            else request.copy(bank, offset, 4, count + 4);
        }
        return reply;
    }};
    const capabilities = {compiledLayerCount: 16, viaMacroSlots: 128, viaMacroBytes: macros.length};
    const read = await readViaStorage(connection, {capabilities});
    assert.equal(read.macros.length, 34903);
    const digest = viaStorageDigest(read);
    const target = Buffer.from(read.macros); target[30000] = 97;
    requests.length = 0;
    await writeViaMacros(connection, target, {current: read.macros});
    assert.deepEqual(macros, target);
    assert.ok(requests.length <= 3, "a late edit writes one changed chunk and two validity bytes");
    assert.equal(requests[0].readUInt16BE(1), 34902);
    assert.equal(requests.at(-1).readUInt16BE(1), 34902);
    assert.notEqual(viaStorageDigest({layout, macros}), digest);
    await assert.rejects(readViaStorage(connection, {capabilities: {...capabilities, viaMacroBytes: 10327}}), /different storage geometry/);
    await assert.rejects(writeRegion(connection, VIA_STORAGE.MACRO_WRITE, Buffer.alloc(2), {startOffset: 34902, capacity: 34903}), /payload/);
});

function sparseKeyboard(capacity = 34903) {
    const layout = Buffer.alloc(1920), macros = Buffer.alloc(capacity), requests = [];
    const metadata = () => {
        const page = Buffer.alloc(13); page[0] = 1; page.writeUInt16LE(256, 1); page.writeUInt16LE(macros.length, 3);
        page.writeUInt32LE(7, 5); page.writeUInt32LE(viaStorageDigest({layout, macros}), 9); return page;
    };
    const bitmap = () => {
        const page = Buffer.alloc(Math.ceil(Math.ceil(capacity / 256) / 8));
        for (let i = 0; i < macros.length; i++) if (macros[i]) page[Math.floor(i / 2048)] |= 1 << (Math.floor(i / 256) % 8);
        return page;
    };
    const device = {layout, macros, requests, metadata, bitmap, map: true, mutateReply: reply => reply, async request(request) {
        requests.push(Buffer.from(request)); const reply = Buffer.from(request);
        if (request[0] === 8) {
            if (!device.map) {reply[0] = 255; return reply;}
            reply.fill(0, 5); const payload = request[4] === 0 ? metadata() : bitmap().subarray((request[4] - 1) * 25, request[4] * 25);
            reply[6] = payload.length; payload.copy(reply, 7); return device.mutateReply(reply);
        }
        if (request[0] === VIA_STORAGE.LAYER_COUNT) reply[1] = 16;
        else if (request[0] === VIA_STORAGE.MACRO_COUNT) reply[1] = 128;
        else if (request[0] === VIA_STORAGE.MACRO_SIZE) reply.writeUInt16BE(macros.length, 1);
        else {
            const bank = request[0] === VIA_STORAGE.LAYOUT_READ ? layout : macros;
            const offset = request.readUInt16BE(1), count = request[3]; bank.copy(reply, 4, offset, offset + count);
        }
        return device.mutateReply(reply);
    }};
    return device;
}
test("fresh macro reads skip confirmed zero blocks but preserve the exact full bank", async () => {
    for (const occupied of [0, 1024, 34903]) {
        const device = sparseKeyboard(); device.macros.fill(97, 0, occupied); device.macros[34902] = 0;
        const progress = [], read = await readViaStorage(device, {capabilities: {}, onProgress: value => progress.push(value)});
        assert.deepEqual(read.macros, device.macros);
        const transfers = device.requests.filter(request => request[0] === VIA_STORAGE.MACRO_READ);
        assert.equal(transfers.length, occupied === 0 ? 0 : occupied === 1024 ? 37 : 1247);
        assert.equal(progress.at(-1).done, progress.at(-1).total);
    }
});

test("sparse reads keep stale tail bytes and the incomplete-write marker", async () => {
    const device = sparseKeyboard(); device.macros.write("hello"); device.macros[30000] = 99;
    const read = await readViaStorage(device, {capabilities: {}});
    assert.deepEqual(read.macros, device.macros);
    assert.equal(device.requests.filter(r => r[0] === VIA_STORAGE.MACRO_READ).length, 20);
    device.macros[34902] = 1;
    await assert.rejects(readViaStorage(device, {capabilities: {}}), /incomplete/);
    assert.deepEqual((await readViaStorage(device, {capabilities: {}, allowIncomplete: true})).macros, device.macros);
});
test("legacy and unavailable maps use the full-bank read", async () => {
    for (const status of [null, 2, 3]) {
        const device = sparseKeyboard(); device.macros[30000] = 99;
        if (status === null) device.map = false;
        else device.mutateReply = r => {if (r[0] === 8) {r.fill(0, 5); r[5] = status;} return r;};
        assert.deepEqual((await readViaStorage(device, {capabilities: {}})).macros, device.macros);
        assert.equal(device.requests.filter(r => r[0] === VIA_STORAGE.MACRO_READ).length, 1247);
    }
});
test("malformed maps and false zero claims fail rather than silently falling back", async () => {
    for (const corrupt of [
        r => {if (r[4] === 0) r[7] = 2;},
        r => {if (r[4] === 0) r.writeUInt16LE(128, 8);},
        r => {if (r[4] === 0) r.writeUInt16LE(10327, 10);},
        r => {if (r[4] === 0) r.writeUInt32LE(0, 12);},
        r => {if (r[4] === 1) {r[6] = 17; r[24] = 0;}},
        r => {if (r[4] === 1) r[24] |= 0x80;},
        r => {if (r[4] === 1) r[7] = 0;},
        r => {r[3]++;},
        r => {r.fill(0, 5); r[5] = 1;},
    ]) {
        const device = sparseKeyboard(); device.macros.write("hello");
        device.mutateReply = r => {if (r[0] === 8) corrupt(r); return r;};
        await assert.rejects(readViaStorage(device, {capabilities: {}}));
    }
});
test("a changed generation, digest, or captured storage identity rejects a sparse read", async () => {
    for (const field of [5, 9]) {
        const device = sparseKeyboard(); let metadataReads = 0;
        device.mutateReply = r => {if (r[0] === 8 && r[4] === 0 && ++metadataReads === 2) r[7 + field] ^= 1; return r;};
        await assert.rejects(readViaStorage(device, {capabilities: {}}), /changed during/);
    }
    const device = sparseKeyboard();
    await assert.rejects(readViaStorage(device, {capabilities: {}, storageIdentity: {generation: 8, digest: device.metadata().readUInt32LE(9)}}), /changed before/);
});
test("corrupt macro bytes are caught by the complete reconstructed digest", async () => {
    const device = sparseKeyboard(); device.macros.write("hello");
    device.mutateReply = r => {if (r[0] === VIA_STORAGE.MACRO_READ) r[4] ^= 1; return r;};
    await assert.rejects(readViaStorage(device, {capabilities: {}}), /storage digest/);
});

test("the maximum VIA capacity uses two bitmap pages and preserves its final byte", async () => {
    const device = sparseKeyboard(65535); device.macros[65533] = 99;
    assert.deepEqual((await readViaStorage(device, {capabilities: {}})).macros, device.macros);
    assert.deepEqual(device.requests.filter(r => r[0] === 8).map(r => r[4]), [0, 1, 2, 0]);
    assert.equal(device.requests.filter(r => r[0] === VIA_STORAGE.MACRO_READ).length, 10);
});

test("a map that becomes unavailable after admission fails the capture", async () => {
    for (const status of [null, 2, 3]) {
        const device = sparseKeyboard(); let mapReads = 0;
        device.mutateReply = r => {
            if (r[0] === 8 && ++mapReads === 2) {
                if (status === null) {r.fill(0, 5); r[0] = 255;}
                else {r.fill(0, 5); r[5] = status;}
            }
            return r;
        };
        await assert.rejects(readViaStorage(device, {capabilities: {}}));
        assert.equal(device.requests.filter(r => r[0] === VIA_STORAGE.MACRO_READ).length, 0);
    }
});
