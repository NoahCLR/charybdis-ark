"use strict";
const {isUnhandledEcho, orUnhandled} = require("./via-unhandled-v1");
const {buildProfileGetRequest, decodeProfileResponse, profileResponseMatcher} = require("./profile-wire-v1");
const {fnv1a32} = require("../schema/profile-blob-v1");

const COMBO_READBACK_V1 = Object.freeze({VALUE: 0x06, VERSION: 3, MAX_ROWS: 128, MAX_INPUTS: 16, MAX_LAYERS: 16, PAGES_PER_ROW: 2});
const fail = (code, message) => Object.assign(new Error(message), {code});

// Version 3, the only one the keyboard reports (firmware D-F14). Page 0 is
// metadata: the default window and hold threshold once, bytes 10-13. Page 1
// holds each layer's combo reference layer. Row n is pages 2 + 2n and 3 + 2n:
// page A its index, count, output, window, flags (bit 3 follows the default,
// bit 4 disabled), allowed layers and inputs 0..6; page B inputs 7..15. The
// digest covers metadata bytes 0..5 and 10..24, then every later page in order.
// `pages` is the reference page followed by each row's two pages.
function decodeComboPages(metadata, pages) {
    if (!(metadata instanceof Uint8Array) || metadata.length !== 25) throw fail("COMBO_MALFORMED", "Invalid combo metadata length.");
    const data = Buffer.from(metadata), version = data[0];
    if (version !== COMBO_READBACK_V1.VERSION) throw fail("COMBO_INCOMPATIBLE", "Unsupported combo readback version.");
    const [count, maxInputs, layerCount, enabled, flags] = data.subarray(1, 6);
    if (count > COMBO_READBACK_V1.MAX_ROWS || maxInputs !== COMBO_READBACK_V1.MAX_INPUTS || layerCount < 1 || layerCount > COMBO_READBACK_V1.MAX_LAYERS || enabled > 1 || flags & ~63
        || data[14] !== COMBO_READBACK_V1.PAGES_PER_ROW || data.subarray(15).some(Boolean)) {
        throw fail("COMBO_MALFORMED", "Invalid combo limits, policy or reserved bytes.");
    }
    if (!Array.isArray(pages) || pages.length !== 1 + COMBO_READBACK_V1.PAGES_PER_ROW * count || pages.some(page => !(page instanceof Uint8Array) || page.length !== 25)) {
        throw fail("COMBO_MALFORMED", "Invalid combo page count or length.");
    }
    const references = Buffer.from(pages[0]);
    const layerReferences = [...references.subarray(0, layerCount)];
    if (layerReferences.some(layer => layer >= layerCount) || references.subarray(layerCount).some(Boolean)) throw fail("COMBO_MALFORMED", "Invalid combo layer references.");
    if ((flags & 32) && layerReferences.some(layer => layer !== layerReferences[0])) throw fail("COMBO_MALFORMED", "A fixed combo reference must use the same layer throughout.");
    const bank = 2 ** layerCount;
    const rows = Array.from({length: count}, (_, id) => {
        const a = Buffer.from(pages[1 + 2 * id]), b = Buffer.from(pages[2 + 2 * id]);
        const inputCount = a[1], rowFlags = a[6], allowedLayers = a.readUInt32LE(7);
        const slots = Buffer.concat([a.subarray(11, 25), b.subarray(0, 18)]);
        if (a[0] !== id || inputCount < 2 || inputCount > COMBO_READBACK_V1.MAX_INPUTS || rowFlags & ~31 || allowedLayers >= bank || slots.subarray(2 * inputCount).some(Boolean) || b.subarray(18).some(Boolean)) {
            throw fail("COMBO_MALFORMED", "Invalid combo row index, input count, flags, layers or padding.");
        }
        const inputs = Array.from({length: inputCount}, (_, index) => slots.readUInt16LE(2 * index));
        if (inputs.includes(0) || new Set(inputs).size !== inputs.length) throw fail("COMBO_MALFORMED", "Combo inputs must be distinct nonzero keycodes.");
        return {id, inputs, output: a.readUInt16LE(2), termMs: a.readUInt16LE(4), followsDefault: Boolean(rowFlags & 8), mustHold: Boolean(rowFlags & 1), mustTap: Boolean(rowFlags & 2), ordered: Boolean(rowFlags & 4),
            enabled: !(rowFlags & 16), allowedLayers};
    });
    const defaultTermMs = data.readUInt16LE(10), holdTermMs = data.readUInt16LE(12);
    if (rows.some(row => row.followsDefault && row.termMs !== defaultTermMs)) throw fail("COMBO_MALFORMED", "A combo that follows the default window reports another.");
    const digest = data.readUInt32LE(6);
    if (fnv1a32(Buffer.concat([data.subarray(0, 6), data.subarray(10), ...pages.map(page => Buffer.from(page))])) !== digest) {
        throw fail("COMBO_CORRUPT", "Combo readback does not match the keyboard's digest.");
    }
    return {version, defaultTermMs, holdTermMs, rows, enabled: Boolean(enabled), noTimer: Boolean(flags & 1), strictTimer: Boolean(flags & 2), customTrigger: Boolean(flags & 4), customRelease: Boolean(flags & 8), customRepress: Boolean(flags & 16), fixedReference: Boolean(flags & 32), layerReferences, digest};
}

async function readDeviceCombos(connection, options = {}) {
    let nextId = 0;
    const read = async page => {
        const id = options.nextRequestId ? options.nextRequestId() : (nextId = nextId % 255 + 1);
        const request = buildProfileGetRequest(COMBO_READBACK_V1.VALUE, page, id);
        const response = await connection.request(request, {
            matchResponse: orUnhandled(profileResponseMatcher, request),
        });
        if (isUnhandledEcho(response, request)) throw fail("COMBO_UNSUPPORTED", "This firmware does not expose combos. Flash the updated firmware pair to read them.");
        return Buffer.from(decodeProfileResponse(response, request));
    };
    for (let attempt = 0; attempt < 2; attempt++) {
        const before = await read(0);
        if (before[0] !== COMBO_READBACK_V1.VERSION || before[1] > COMBO_READBACK_V1.MAX_ROWS) throw fail("COMBO_INCOMPATIBLE", "Unsupported combo readback version or capacity: update both halves to firmware with 16 layers.");
        const pages = [];
        for (let index = 1; index <= COMBO_READBACK_V1.PAGES_PER_ROW * before[1] + 1; index++) pages.push(await read(index));
        if (!before.equals(await read(0))) continue;
        return decodeComboPages(before, pages);
    }
    throw fail("COMBO_CHANGED", "Combo settings changed during readback. Read from keyboard again.");
}

module.exports = {COMBO_READBACK_V1, decodeComboPages, readDeviceCombos};
