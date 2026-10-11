// @ts-check
"use strict";
const {isUnhandledEcho, orUnhandled} = require("./via-unhandled-v1");

const {RAW_HID_REPORT_SIZE, normalizeRawHidReport} = require("../transport/device-adapter");
const {ProfileWireProtocolError, buildProfileGetRequest, decodeProfileResponse, profileResponseMatcher} = require("./profile-wire-v1");

const VIA_STORAGE = Object.freeze({MACRO_COUNT: 0x0c, MACRO_SIZE: 0x0d, MACRO_READ: 0x0e, MACRO_WRITE: 0x0f, LAYER_COUNT: 0x11, LAYOUT_READ: 0x12, LAYOUT_WRITE: 0x13, CHUNK: 28});
/** @param {string} message */
const fail = message => Object.assign(new Error(message), {code: "VIA_STORAGE_INVALID"});
// Legacy defaults for callers without a device. Live transfers use the bank
// capacity reported by VIA and checked against Profile Wire; offsets are
// relative to that bank and fit the protocol's 16-bit field.
const VIA_REGION_BYTES = 12288, LAYOUT_BYTES = 1920, MACRO_BANK_BYTES = 10327;
/** @param {{layout: Buffer, macros: Buffer}} storage */
function viaStorageDigest({layout, macros}) {
    if (!Buffer.isBuffer(layout) || layout.length !== LAYOUT_BYTES || !Buffer.isBuffer(macros) || (macros.length < 129 || macros.length > 65535)) throw fail("Unsupported keyboard storage geometry.");
    let hash = 2166136261;
    /** @param {number} byte */
    const hashByte = byte => {hash = Math.imul((hash ^ byte) >>> 0, 16777619) >>> 0;};
    for (const [id, bytes] of /** @type {[number, Buffer][]} */ ([[1, Buffer.from([1, 0])], [2, layout], [3, Buffer.alloc(0)], [4, macros]])) {
        hashByte(id); hashByte(bytes.length & 255); hashByte(bytes.length >>> 8);
        for (const byte of bytes) hashByte(byte);
    }
    return hash >>> 0;
}

/** @param {import("../transport/types.js").RequestConnection} connection @param {Buffer} request @param {import("../transport/types.js").RequestOptions} [options] */
async function exchange(connection, request, options = {}) {
    const response = normalizeRawHidReport(await connection.request(request, {...options, matchResponse: orUnhandled((data) => data[0] === request[0], request)}), "VIA storage response");
    if (isUnhandledEcho(response, request)) throw fail("The keyboard does not support this storage operation.");
    return response;
}

/** @param {import("../transport/types.js").RequestConnection} connection @param {number} command @param {number} width */
async function scalar(connection, command, width) {
    const request = Buffer.alloc(RAW_HID_REPORT_SIZE); request[0] = command;
    const response = await exchange(connection, request);
    if (response.subarray(1 + width).some(byte => byte !== 0)) throw fail("Invalid storage capacity response.");
    return width === 1 ? response[1] : response.readUInt16BE(1);
}

/** @param {import("../transport/types.js").RequestConnection} connection @param {number} command @param {number} length @param {import("./types.js").ReadRegionOptions} [options] */
async function readRegion(connection, command, length, {startOffset = 0, capacity = VIA_REGION_BYTES, onProgress = () => {}, signal, timeoutMs} = {}) {
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 65535 || !Number.isInteger(length) || length < 1 || length > capacity || !Number.isInteger(startOffset) || startOffset < 0 || startOffset + length > capacity) throw fail("Invalid storage size.");
    const bytes = Buffer.alloc(length);
    for (let offset = 0; offset < length; offset += VIA_STORAGE.CHUNK) {
        const count = Math.min(VIA_STORAGE.CHUNK, length - offset);
        const request = Buffer.alloc(RAW_HID_REPORT_SIZE);
        request[0] = command; request.writeUInt16BE(startOffset + offset, 1); request[3] = count;
        const response = await exchange(connection, request, {signal, timeoutMs});
        if (!response.subarray(0, 4).equals(request.subarray(0, 4)) || response.subarray(4 + count).some(byte => byte !== 0)) throw fail("Invalid storage chunk response.");
        response.copy(bytes, offset, 4, 4 + count);
        onProgress({done: offset + count, total: length});
    }
    return bytes;
}

/** @param {Buffer} current @param {Buffer} target @param {{end?: number}} [options] @returns {import("./types.js").StorageRange[]} */
function changedRanges(current, target, {end = target?.length} = {}) {
    if (!Buffer.isBuffer(current) || !Buffer.isBuffer(target) || current.length !== target.length || !Number.isInteger(end) || end < 0 || end > target.length) throw fail("Invalid storage comparison.");
    /** @type {import("./types.js").StorageRange[]} */
    const ranges = [];
    for (let offset = 0; offset < end; offset += VIA_STORAGE.CHUNK) {
        const rangeEnd = Math.min(offset + VIA_STORAGE.CHUNK, end);
        if (!current.subarray(offset, rangeEnd).equals(target.subarray(offset, rangeEnd))) {
            const prior = ranges.at(-1);
            if (prior && prior.offset + prior.bytes.length === offset) prior.bytes = target.subarray(prior.offset, rangeEnd);
            else ranges.push({offset, bytes: target.subarray(offset, rangeEnd)});
        }
    }
    return ranges;
}

/** @param {import("../transport/types.js").RequestConnection} connection @param {number} command @param {Buffer} target @param {Buffer} current @param {import("./types.js").WriteRegionOptions & {end?: number}} [options] */
async function writeChangedRegion(connection, command, target, current, {onProgress = () => {}, end = target?.length, capacity = target?.length} = {}) {
    const ranges = changedRanges(current, target, {end});
    const total = ranges.reduce((sum, range) => sum + range.bytes.length, 0);
    let completed = 0;
    for (const range of ranges) {
        await writeRegion(connection, command, range.bytes, {startOffset: range.offset, capacity, onProgress: progress => onProgress({completed: completed + progress.completed, total})});
        completed += range.bytes.length;
    }
    return ranges;
}

/** @param {import("../transport/types.js").RequestConnection} connection @param {number} command @param {Buffer} bytes @param {import("./types.js").WriteRegionOptions} [options] */
async function writeRegion(connection, command, bytes, {onProgress = () => {}, startOffset = 0, capacity = VIA_REGION_BYTES} = {}) {
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 65535 || !Buffer.isBuffer(bytes) || bytes.length < 1 || bytes.length > capacity || !Number.isInteger(startOffset) || startOffset < 0 || startOffset + bytes.length > capacity) throw fail("Invalid storage payload.");
    for (let offset = 0; offset < bytes.length; offset += VIA_STORAGE.CHUNK) {
        const count = Math.min(VIA_STORAGE.CHUNK, bytes.length - offset);
        const request = Buffer.alloc(RAW_HID_REPORT_SIZE);
        request[0] = command; request.writeUInt16BE(startOffset + offset, 1); request[3] = count;
        bytes.copy(request, 4, offset, offset + count);
        const response = await exchange(connection, request);
        if (!response.equals(request)) throw fail("The keyboard did not acknowledge the storage write.");
        onProgress({completed: offset + count, total: bytes.length});
    }
}

// Optional GET 0x0c describes exact nonzero storage, including stale tail
// bytes. A bitmap omission is a firmware assertion of zero, never a guess
// based on macro slot contents. Verify the reconstructed whole-store digest.
/** @param {import("../transport/types.js").RequestConnection} connection @param {number} page @param {() => number} nextRequestId @param {boolean} [optional] */
async function macroMapPage(connection, page, nextRequestId, optional = false) {
    const request = buildProfileGetRequest(0x0c, page, nextRequestId());
    const response = normalizeRawHidReport(await connection.request(request, {matchResponse: orUnhandled(profileResponseMatcher, request)}));
    if (isUnhandledEcho(response, request)) {
        if (optional) return null;
        throw fail("The macro read map became unavailable. Read the keyboard again.");
    }
    try { return Buffer.from(decodeProfileResponse(response, request, {allowShortPayload: true})); }
    catch (error) {
        if (optional && error instanceof ProfileWireProtocolError && error.code === "DEVICE_REJECTED" && "status" in error && typeof error.status === "number" && [2, 3].includes(error.status) && response[6] === 0) return null;
        throw error;
    }
}
/** @param {import("../transport/types.js").RequestConnection} connection @param {number} capacity @param {Buffer} layout @param {{nextRequestId: () => number, storageIdentity?: import("./types.js").StorageIdentity, onProgress: (progress: import("../../contracts/model.js").CountedProgress) => void}} options */
async function readSparseMacros(connection, capacity, layout, {nextRequestId, storageIdentity, onProgress}) {
    const before = await macroMapPage(connection, 0, nextRequestId, true);
    if (!before) return null;
    if (before.length !== 13 || before[0] !== 1 || before.readUInt16LE(1) !== 256 || before.readUInt16LE(3) !== capacity || before.readUInt32LE(5) === 0) throw fail("Invalid macro read map metadata.");
    if (storageIdentity && (before.readUInt32LE(5) !== storageIdentity.generation || before.readUInt32LE(9) !== storageIdentity.digest)) throw fail("Keyboard storage changed before the macro read. Read the keyboard again.");
    const blocks = Math.ceil(capacity / 256), bitmapLength = Math.ceil(blocks / 8), parts = [];
    for (let offset = 0; offset < bitmapLength; offset += 25) {
        const part = await macroMapPage(connection, 1 + offset / 25, nextRequestId);
        if (!part || part.length !== Math.min(25, bitmapLength - offset)) throw fail("Truncated macro read map.");
        parts.push(part);
    }
    const bitmap = Buffer.concat(parts);
    if (blocks % 8 && (bitmap.at(-1) ?? 0) & (255 << (blocks % 8))) throw fail("Invalid reserved macro read map bits.");
    /** @type {{start: number, end: number}[]} */
    const ranges = [];
    for (let block = 0; block < blocks; block++) {
        if (!(bitmap[Math.floor(block / 8)] & (1 << (block % 8)))) continue;
        const start = block * 256, end = Math.min(capacity, start + 256), prior = ranges.at(-1);
        if (prior?.end === start) prior.end = end;
        else ranges.push({start, end});
    }
    const total = ranges.reduce((sum, range) => sum + range.end - range.start, 0), bytes = Buffer.alloc(capacity);
    let done = 0;
    onProgress({done, total});
    for (const range of ranges) {
        const part = await readRegion(connection, VIA_STORAGE.MACRO_READ, range.end - range.start, {startOffset: range.start, capacity,
            onProgress: progress => onProgress({done: done + progress.done, total})});
        part.copy(bytes, range.start); done += part.length;
    }
    const after = await macroMapPage(connection, 0, nextRequestId);
    if (!after || !before.equals(after)) throw fail("Keyboard storage changed during the macro read. Read the keyboard again.");
    if (viaStorageDigest({layout, macros: bytes}) !== before.readUInt32LE(9)) throw fail("The reconstructed macro bank does not match the keyboard's storage digest.");
    return bytes;
}

/** @param {import("../transport/types.js").RequestConnection} connection @param {import("./types.js").StorageReadOptions} [options] */
async function readViaStorage(connection, {capabilities, matrixRows = 10, matrixColumns = 6, allowIncomplete = false, onProgress = () => {}, nextRequestId, storageIdentity} = {}) {
    const layers = await scalar(connection, VIA_STORAGE.LAYER_COUNT, 1);
    const macroSlots = await scalar(connection, VIA_STORAGE.MACRO_COUNT, 1);
    const macroCapacity = await scalar(connection, VIA_STORAGE.MACRO_SIZE, 2);
    if (layers < 1 || layers > 16 || macroSlots < 1 || macroSlots > 128 || macroCapacity < macroSlots + 1 || macroCapacity > 65535 || matrixRows !== 10 || matrixColumns !== 6) throw fail("Unsupported keyboard storage geometry.");
    for (const [field, value] of /** @type {[keyof import("./types.js").StorageCapabilities, number][]} */ ([["compiledLayerCount", layers], ["viaMacroSlots", macroSlots], ["viaMacroBytes", macroCapacity]])) {
        if (capabilities?.[field] !== undefined && capabilities[field] !== value) throw fail("VIA and Profile Wire report different storage geometry.");
    }
    const layout = await readRegion(connection, VIA_STORAGE.LAYOUT_READ, layers * matrixRows * matrixColumns * 2, {capacity: layers * matrixRows * matrixColumns * 2, onProgress: progress => onProgress({region: "layout", ...progress})});
    let requestId = 0;
    /** @param {import("../../contracts/model.js").CountedProgress} progress */
    const macroProgress = progress => onProgress({region: "macros", ...progress});
    const macros = (capabilities && await readSparseMacros(connection, macroCapacity, layout, {nextRequestId: nextRequestId || (() => requestId = requestId % 255 + 1), storageIdentity, onProgress: macroProgress}))
        || await readRegion(connection, VIA_STORAGE.MACRO_READ, macroCapacity, {capacity: macroCapacity, onProgress: macroProgress});
    if (!allowIncomplete && macros[macros.length - 1] !== 0) throw fail("A macro write is incomplete. Import your recovery profile before taking another backup.");
    return {layers, macroSlots, macroCapacity, matrixRows, matrixColumns, layout, macros};
}

/** @param {import("../transport/types.js").RequestConnection} connection @param {Buffer} bytes @param {{current?: Buffer, onProgress?: (progress: {completed: number, total: number}) => void}} [options] */
async function writeViaMacros(connection, bytes, {current, onProgress = () => {}} = {}) {
    if (!Buffer.isBuffer(bytes) || bytes.length < 2 || bytes.at(-1) !== 0) throw fail("Invalid macro bank.");
    if (current !== undefined && (!Buffer.isBuffer(current) || current.length !== bytes.length)) throw fail("Invalid current macro bank.");
    if (current?.equals(bytes)) return [];
    await writeRegion(connection, VIA_STORAGE.MACRO_WRITE, Buffer.from([1]), {startOffset: bytes.length - 1, capacity: bytes.length});
    let ranges;
    if (current) {
        ranges = await writeChangedRegion(connection, VIA_STORAGE.MACRO_WRITE, bytes, current, {end: bytes.length - 1, onProgress});
    } else {
        const pending = Buffer.from(bytes); pending[pending.length - 1] = 1;
        await writeRegion(connection, VIA_STORAGE.MACRO_WRITE, pending, {onProgress, capacity: bytes.length});
        ranges = [{offset: 0, bytes: bytes.subarray(0, -1)}];
    }
    await writeRegion(connection, VIA_STORAGE.MACRO_WRITE, Buffer.from([0]), {startOffset: bytes.length - 1, capacity: bytes.length});
    return ranges;
}

module.exports = {VIA_STORAGE, VIA_REGION_BYTES, LAYOUT_BYTES, MACRO_BANK_BYTES, viaStorageDigest, readViaStorage, readRegion, writeRegion, changedRanges, writeChangedRegion, writeViaMacros};
