"use strict";
const {isUnhandledEcho} = require("./via-unhandled-v1");

const {RAW_HID_REPORT_SIZE, normalizeRawHidReport} = require("../transport/device-adapter");
const {readRegion, VIA_STORAGE} = require("./via-storage-v1");

const VIA_LAYOUT_COMMANDS = Object.freeze({
    GET_KEYCODE: 0x04,
    SET_KEYCODE: 0x05,
    UNHANDLED: 0xff,
});

// The board's layout lives in data/, where every layer can read it; the wire
// codec below keeps using it under the same name.
const {CHARYBDIS_4X6_LAYOUT_MATRIX} = require("../data/charybdis-layout");

class ViaLayoutError extends Error {
    constructor(code, message, details = {}) {
        super(message);
        this.name = "ViaLayoutError";
        this.code = code;
        Object.assign(this, details);
    }
}

function buildViaGetKeycodeRequest(entry) {
    const normalized = normalizeEntry(entry);
    const report = Buffer.alloc(RAW_HID_REPORT_SIZE);
    report[0] = VIA_LAYOUT_COMMANDS.GET_KEYCODE;
    report[1] = normalized.layer;
    report[2] = normalized.row;
    report[3] = normalized.column;
    return report;
}

function viaKeycodeResponseMatcher(response, request) {
    const actual = normalizeRawHidReport(response, "VIA keycode response");
    const expected = normalizeRawHidReport(request, "VIA keycode request");
    return isUnhandledEcho(actual, expected)
        || (actual[0] === expected[0]
            && actual[1] === expected[1]
            && actual[2] === expected[2]
            && actual[3] === expected[3]);
}

function decodeViaGetKeycodeResponse(response, request) {
    const report = handledResponse(response, request, VIA_LAYOUT_COMMANDS.GET_KEYCODE);
    assertZeroRange(report, 6, RAW_HID_REPORT_SIZE, "VIA get-keycode response");
    return (report[4] << 8) | report[5];
}

async function readViaKeycode(connection, entry, options = {}) {
    assertConnection(connection);
    const request = buildViaGetKeycodeRequest(entry);
    const response = await connection.request(request, requestOptions(options));
    return decodeViaGetKeycodeResponse(response, request);
}

// VIA's buffer read covers all 10 x 6 matrix coordinates, including the four
// unused positions per layer. Decode just the visible layout in its authored
// order. Sixteen layers need 69 reports rather than 896 single-key reads.
async function readViaLayout(connection, options = {}) {
    assertConnection(connection);
    const layerCount = options.layerCount;
    if (!Number.isInteger(layerCount) || layerCount < 1 || layerCount > 16) {
        throw new ViaLayoutError("VIA_LAYOUT_INVALID_ARGUMENT", "layerCount must be an integer from 1 through 16.");
    }

    const bytes = await readRegion(connection, VIA_STORAGE.LAYOUT_READ, layerCount * 10 * 6 * 2, {
        signal: options.signal, timeoutMs: options.timeoutMs,
        onProgress: progress => {
            const done = Array.from({length: layerCount}, (_, layer) => CHARYBDIS_4X6_LAYOUT_MATRIX
                .filter(([row, column]) => ((layer * 10 + row) * 6 + column) * 2 + 2 <= progress.done).length).reduce((sum, count) => sum + count, 0);
            options.onProgress?.({done, total: layerCount * CHARYBDIS_4X6_LAYOUT_MATRIX.length,
                layer: Math.min(layerCount - 1, Math.floor(done / CHARYBDIS_4X6_LAYOUT_MATRIX.length))});
        },
    });
    return decodeViaLayout(bytes, layerCount);
}

// The editor and complete capture use the same matrix bytes and ordering.
function decodeViaLayout(bytes, layerCount) {
    if (!Number.isInteger(layerCount) || layerCount < 1 || layerCount > 16 || !(bytes instanceof Uint8Array)
        || bytes.length !== layerCount * 120) throw new ViaLayoutError("VIA_LAYOUT_INVALID_ARGUMENT", "Invalid layout bytes or layer count.");
    const buffer = Buffer.from(bytes);
    return Array.from({length: layerCount}, (_, layer) => ({layer,
        positions: CHARYBDIS_4X6_LAYOUT_MATRIX.map(([row, column], layoutIndex) => ({layoutIndex, row, column,
            keycode: buffer.readUInt16BE(((layer * 10 + row) * 6 + column) * 2)}))}));
}

function normalizeEntry(entry, options = {}) {
    const normalized = {};
    for (const name of ["layer", "row", "column"]) {
        const value = Number(entry?.[name]);
        if (!Number.isInteger(value) || value < 0 || value > 0xff) {
            throw new RangeError(`${name} must be an 8-bit integer.`);
        }
        normalized[name] = value;
    }
    if (options.requireKeycode) {
        const keycode = Number(entry?.keycode);
        if (!Number.isInteger(keycode) || keycode < 0 || keycode > 0xffff) {
            throw new RangeError("keycode must be a 16-bit integer.");
        }
        normalized.keycode = keycode;
    }
    return normalized;
}

function handledResponse(response, request, command) {
    const report = Buffer.from(normalizeRawHidReport(response, "VIA keycode response"));
    if (report[0] === VIA_LAYOUT_COMMANDS.UNHANDLED) {
        throw new ViaLayoutError("VIA_LAYOUT_REJECTED", "Firmware rejected the standard VIA keymap command.");
    }
    if (!viaKeycodeResponseMatcher(report, request) || report[0] !== command) {
        throw new ViaLayoutError("VIA_LAYOUT_CORRELATION_MISMATCH", "VIA keycode response does not match its request.");
    }
    return report;
}

function requestOptions(options) {
    return {
        matchResponse: viaKeycodeResponseMatcher,
        signal: options.signal,
        timeoutMs: options.timeoutMs,
    };
}

function assertConnection(connection) {
    if (!connection || typeof connection.request !== "function") {
        throw new TypeError("connection must provide request(report, options).");
    }
}

function assertZeroRange(buffer, start, end, label) {
    for (let index = start; index < end; index += 1) {
        if (buffer[index] !== 0) throw new ViaLayoutError("VIA_LAYOUT_NONCANONICAL_RESPONSE", `${label} has nonzero reserved bytes.`);
    }
}

module.exports = {
    CHARYBDIS_4X6_LAYOUT_MATRIX,
    VIA_LAYOUT_COMMANDS,
    ViaLayoutError,
    buildViaGetKeycodeRequest,
    decodeViaGetKeycodeResponse,
    readViaKeycode,
    readViaLayout,
    decodeViaLayout,
    viaKeycodeResponseMatcher,
};
