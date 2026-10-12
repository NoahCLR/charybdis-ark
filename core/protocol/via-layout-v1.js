// @ts-check
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
const {CHARYBDIS_4X6_LAYOUT_MATRIX, LAYERS, MATRIX_KEYS, matrixPosition} = require("../data/charybdis-layout");

class ViaLayoutError extends Error {
    /** @param {string} code @param {string} message @param {Record<string, unknown>} [details] */
    constructor(code, message, details = {}) {
        super(message);
        this.name = "ViaLayoutError";
        this.code = code;
        Object.assign(this, details);
    }
}

/** @param {import("./types.js").ViaPosition} entry */
function buildViaGetKeycodeRequest(entry) {
    const normalized = normalizeEntry(entry);
    const report = Buffer.alloc(RAW_HID_REPORT_SIZE);
    report[0] = VIA_LAYOUT_COMMANDS.GET_KEYCODE;
    report[1] = normalized.layer;
    report[2] = normalized.row;
    report[3] = normalized.column;
    return report;
}

/** @param {Uint8Array} response @param {Uint8Array} request */
function viaKeycodeResponseMatcher(response, request) {
    const actual = normalizeRawHidReport(response, "VIA keycode response");
    const expected = normalizeRawHidReport(request, "VIA keycode request");
    return isUnhandledEcho(actual, expected)
        || (actual[0] === expected[0]
            && actual[1] === expected[1]
            && actual[2] === expected[2]
            && actual[3] === expected[3]);
}

/** @param {Uint8Array} response @param {Uint8Array} request */
function decodeViaGetKeycodeResponse(response, request) {
    const report = handledResponse(response, request, VIA_LAYOUT_COMMANDS.GET_KEYCODE);
    assertZeroRange(report, 6, RAW_HID_REPORT_SIZE, "VIA get-keycode response");
    return (report[4] << 8) | report[5];
}

/** @param {import("../transport/types.js").RequestConnection} connection @param {import("./types.js").ViaPosition} entry @param {import("./types.js").ReadOptions} [options] */
async function readViaKeycode(connection, entry, options = {}) {
    assertConnection(connection);
    const request = buildViaGetKeycodeRequest(entry);
    const response = await connection.request(request, requestOptions(options));
    return decodeViaGetKeycodeResponse(response, request);
}

// VIA's buffer read covers all 10 x 6 matrix coordinates, including the four
// unused positions per layer. Decode just the visible layout in its authored
// order. Sixteen layers need 69 reports rather than 896 single-key reads.
/** @param {import("../transport/types.js").RequestConnection} connection @param {Partial<import("./types.js").LayoutReadOptions>} [options] */
async function readViaLayout(connection, options = {}) {
    assertConnection(connection);
    const layerCount = options.layerCount;
    if (layerCount === undefined || !Number.isInteger(layerCount) || layerCount < 1 || layerCount > LAYERS) {
        throw new ViaLayoutError("VIA_LAYOUT_INVALID_ARGUMENT", "layerCount must be an integer from 1 through 16.");
    }

    const bytes = await readRegion(connection, VIA_STORAGE.LAYOUT_READ, layerCount * MATRIX_KEYS * 2, {
        signal: options.signal, timeoutMs: options.timeoutMs,
        onProgress: progress => {
            const done = Array.from({length: layerCount}, (_, layer) => CHARYBDIS_4X6_LAYOUT_MATRIX
                .filter((position, layoutIndex) => (layer * MATRIX_KEYS + matrixPosition(layoutIndex)) * 2 + 2 <= progress.done).length).reduce((sum, count) => sum + count, 0);
            options.onProgress?.({done, total: layerCount * CHARYBDIS_4X6_LAYOUT_MATRIX.length,
                layer: Math.min(layerCount - 1, Math.floor(done / CHARYBDIS_4X6_LAYOUT_MATRIX.length))});
        },
    });
    return decodeViaLayout(bytes, layerCount);
}

// The editor and complete capture use the same matrix bytes and ordering.
/** @param {Uint8Array} bytes @param {number} layerCount */
function decodeViaLayout(bytes, layerCount) {
    if (layerCount === undefined || !Number.isInteger(layerCount) || layerCount < 1 || layerCount > LAYERS || !(bytes instanceof Uint8Array)
        || bytes.length !== layerCount * MATRIX_KEYS * 2) throw new ViaLayoutError("VIA_LAYOUT_INVALID_ARGUMENT", "Invalid layout bytes or layer count.");
    const buffer = Buffer.from(bytes);
    return Array.from({length: layerCount}, (_, layer) => ({layer,
        positions: CHARYBDIS_4X6_LAYOUT_MATRIX.map(([row, column], layoutIndex) => ({layoutIndex, row, column,
            keycode: buffer.readUInt16BE((layer * MATRIX_KEYS + matrixPosition(layoutIndex)) * 2)}))}));
}

/** @param {import("./types.js").ViaPosition} entry @param {{requireKeycode?: boolean}} [options] */
function normalizeEntry(entry, options = {}) {
    /** @type {Record<string, number>} */
    const normalized = {};
    for (const name of /** @type {const} */ (["layer", "row", "column"])) {
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

/** @param {Uint8Array} response @param {Uint8Array} request @param {number} command */
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

/** @param {import("./types.js").ReadOptions} options */
function requestOptions(options) {
    return {
        matchResponse: viaKeycodeResponseMatcher,
        signal: options.signal,
        timeoutMs: options.timeoutMs,
    };
}

/** @param {import("../transport/types.js").RequestConnection} connection */
function assertConnection(connection) {
    if (!connection || typeof connection.request !== "function") {
        throw new TypeError("connection must provide request(report, options).");
    }
}

/** @param {Uint8Array} buffer @param {number} start @param {number} end @param {string} label */
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
