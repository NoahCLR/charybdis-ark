// @ts-check
"use strict";

// Firmware-owned Raw HID refusal (D-F31): byte 0 is 0xff and bytes 1–31
// echo the request exactly. Only the full correlated echo is a definite
// refusal; unrelated reports must not replace a timeout or disconnect.

const {normalizeRawHidReport} = require("../transport/device-adapter");

const RAW_HID_UNHANDLED = 0xff;

/** @param {Uint8Array} response @param {Uint8Array} request */
function isUnhandledEcho(response, request) {
    const actual = normalizeRawHidReport(response, "Raw HID response");
    const sent = normalizeRawHidReport(request, "Raw HID request");
    return actual[0] === RAW_HID_UNHANDLED && sent[0] !== RAW_HID_UNHANDLED && actual.subarray(1).equals(sent.subarray(1));
}

// A matcher for `request` that also accepts the keyboard's unhandled echo of
// it. The request is bound here, so the matcher works whether or not the
// caller passes it back.
/** @param {(response: Buffer, request: Buffer) => boolean} matcher @param {Buffer} request @returns {(response: Buffer, sent?: Buffer) => boolean} */
const orUnhandled = (matcher, request) => (response, sent = request) =>
    isUnhandledEcho(response, sent) || Boolean(matcher(response, sent));

/** @param {string} what */
function unhandledError(what) {
    return Object.assign(new Error(`The keyboard did not handle ${what}. It may not support it, or may not be ready for it; read the keyboard again.`), {
        code: "UNHANDLED",
        unhandled: true,
    });
}

// Sends a request whose reply is matched by `options.matchResponse`, and turns
// the keyboard's unhandled echo into an UNHANDLED error. The connection stays
// open: the keyboard answered.
/** @param {import("../transport/types.js").RequestConnection} connection @param {Buffer} request @param {import("../transport/types.js").RequestOptions & {matchResponse: (response: Buffer, request: Buffer) => boolean}} options @param {string} what */
async function requestHandled(connection, request, options, what) {
    const response = await connection.request(request, {...options, matchResponse: orUnhandled(options.matchResponse, request)});
    if (isUnhandledEcho(response, request)) throw unhandledError(what);
    return response;
}

module.exports = {RAW_HID_UNHANDLED, isUnhandledEcho, orUnhandled, requestHandled, unhandledError};
