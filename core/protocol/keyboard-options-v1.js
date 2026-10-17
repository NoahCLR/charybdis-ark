// @ts-check
"use strict";
const {isUnhandledEcho, orUnhandled, unhandledError} = require("./via-unhandled-v1");
const {buildProfileGetRequest, decodeProfileResponse, profileResponseMatcher} = require("./profile-wire-v1");
/** @param {string} message */
const fail = message => Object.assign(new Error(message), {code: "INVALID_KEYBOARD_OPTIONS"});

/** @param {import("../transport/types.js").RequestConnection} connection @param {import("./types.js").RequestIds} ids @param {number} page */
async function readPage(connection, ids, page) {
    const request = buildProfileGetRequest(8, page, ids.next());
    const response = await connection.request(request, {matchResponse: orUnhandled(profileResponseMatcher, request)});
    if (isUnhandledEcho(response, request)) throw unhandledError(`keyboard options page ${page}`);
    return Buffer.from(decodeProfileResponse(response, request, {allowShortPayload: true}));
}
/** @param {import("../transport/types.js").RequestConnection} connection @param {import("./types.js").RequestIds} ids */
async function readKeyboardOptions(connection, ids) {
    const metadata = await readPage(connection, ids, 2);
    if (metadata.length !== 9 || metadata[0] !== 1 || metadata[1] !== 25 || metadata[5] !== 13 || !metadata[4] || metadata.readUInt16LE(6) & ~0x1fff || metadata[8] & ~15) throw fail("Unsupported keyboard options metadata.");
    const length = metadata.readUInt16LE(2), count = metadata[4];
    if (length !== 26 + 64 * count || length > 253 * 25) throw fail("Invalid keyboard options capacity.");
    const chunks = [];
    for (let offset = 0; offset < length; offset += 25) {
        const bytes = await readPage(connection, ids, 3 + offset / 25);
        if (bytes.length !== Math.min(25, length - offset)) throw fail("Truncated keyboard options.");
        chunks.push(bytes);
    }
    if (!metadata.equals(await readPage(connection, ids, 2))) throw fail("Keyboard options changed during readback. Read the keyboard again.");
    const bytes = Buffer.concat(chunks), masks = Array.from({length: 13}, (_, i) => bytes.readUInt16LE(i * 2));
    if (masks.some(mask => !mask || (mask & (mask - 1))) || new Set(masks).size !== 13) throw fail("Invalid keyboard option bit assignments.");
    const effects = Array.from({length: count}, (_, i) => {
        const field = bytes.subarray(26 + i * 64, 26 + (i + 1) * 64), end = field.indexOf(0);
        if (end < 1 || field.subarray(end).some(Boolean)) throw fail("Invalid lighting effect name padding.");
        const name = field.subarray(0, end).toString("ascii");
        if (!/^[A-Z][A-Z0-9_]*$/.test(name) || !Buffer.from(name, "ascii").equals(field.subarray(0, end))) throw fail("Invalid lighting effect name.");
        return {id: i + 1, name};
    });
    return {effects, keymapMasks: masks, supportedKeymapOptions: metadata.readUInt16LE(6), ledFlags: metadata[8]};
}
module.exports = {readKeyboardOptions};
