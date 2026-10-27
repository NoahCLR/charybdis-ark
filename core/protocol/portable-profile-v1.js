// @ts-check
"use strict";
const {isUnhandledEcho, orUnhandled} = require("./raw-hid-unhandled");
const {buildProfileGetRequest, decodeProfileResponse, profileResponseMatcher} = require("./profile-wire-v1");
const {crc32, firmwareUpdateRequired, fnv1a32} = require("../schema/profile-blob-v1");
const {SETTINGS, decodeSettings} = require("../schema/settings-domain-v1");
/** @param {string} message */
const fail = message => Object.assign(new Error(message), {code: "PORTABLE_PROFILE_UNAVAILABLE"});
/** @param {import("../transport/types.js").RequestConnection} connection @param {number} value @param {number} pageIndex @param {import("./types.js").RequestIds} ids */
async function page(connection, value, pageIndex, ids) {
    const request = buildProfileGetRequest(value, pageIndex, ids.next());
    const response = await connection.request(request, {matchResponse: orUnhandled(profileResponseMatcher, request)});
    if (isUnhandledEcho(response, request) || response[5] !== 0) throw fail("The keyboard refused a complete-profile read: Ark supports only current firmware. Update both halves, then read the keyboard again.");
    return Buffer.from(decodeProfileResponse(response, request, {allowShortPayload: true}));
}
/** @param {import("../transport/types.js").RequestConnection} connection @param {import("./types.js").RequestIds} ids */
async function readSettings(connection, ids) {
    const before = await page(connection, 7, 0, ids);
    if (before.length !== 12 || before[0] !== 1 || before[1] !== 25) throw fail("Invalid settings metadata.");
    const length = before.readUInt16LE(2);
    if (length < 1 || length > SETTINGS.MAX_SIZE) throw fail("Invalid settings capacity.");
    const chunks = [];
    for (let offset = 0; offset < length; offset += 25) {
        const bytes = await page(connection, 7, 1 + offset / 25, ids);
        if (bytes.length !== Math.min(25, length - offset)) throw fail("Truncated settings read.");
        chunks.push(bytes);
    }
    const bytes = Buffer.concat(chunks), after = await page(connection, 7, 0, ids);
    if (!before.equals(after) || crc32(bytes) !== before.readUInt32LE(4) || fnv1a32(bytes) !== before.readUInt32LE(8)) throw fail("Keyboard settings changed during the read. Try again.");
    if (bytes[0] !== SETTINGS.VERSION) throw firmwareUpdateRequired();
    decodeSettings(bytes);
    return bytes;
}
/** @param {import("../transport/types.js").RequestConnection} connection @param {import("./types.js").RequestIds} ids */
async function readSettingsLimits(connection, ids) {
    const request = buildProfileGetRequest(8, 1, ids.next());
    const response = await connection.request(request, {matchResponse: orUnhandled(profileResponseMatcher, request)});
    const bytes = decodeProfileResponse(response, request, {allowShortPayload: true});
    if (bytes.length !== 2 || bytes[0] !== 1) throw fail("Unsupported keyboard settings limits.");
    return {brightnessMax: bytes[1]};
}
module.exports = {readSettings, readSettingsLimits};
