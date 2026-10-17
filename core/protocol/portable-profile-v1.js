// @ts-check
"use strict";
const {isUnhandledEcho, orUnhandled} = require("./via-unhandled-v1");
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
async function readStorageStatus(connection, ids) {
    const bytes = await page(connection, 8, 0, ids);
    if (bytes.length !== 25 || bytes[0] !== 1 || (bytes[1] & ~31)) throw fail("Invalid storage status.");
    const result = {ready: false, flags: bytes[1], generation: bytes.readUInt32LE(2), digest: bytes.readUInt32LE(6), peerGeneration: bytes.readUInt32LE(10), peerDigest: bytes.readUInt32LE(14), acknowledgedGeneration: bytes.readUInt32LE(18), error: bytes[22], conflicts: bytes.readUInt16LE(23)};
    result.ready = result.flags === 4 && !result.error && !result.conflicts && result.generation === result.peerGeneration && result.digest === result.peerDigest;
    return result;
}
/** @param {import("../transport/types.js").RequestConnection} connection @param {import("./types.js").RequestIds} ids */
async function readSettingsLimits(connection, ids) {
    const request = buildProfileGetRequest(8, 1, ids.next());
    const response = await connection.request(request, {matchResponse: orUnhandled(profileResponseMatcher, request)});
    const bytes = decodeProfileResponse(response, request, {allowShortPayload: true});
    if (bytes.length !== 2 || bytes[0] !== 1) throw fail("Unsupported keyboard settings limits.");
    return {brightnessMax: bytes[1]};
}
/** @param {number} ms @returns {Promise<void>} */
const defaultSleep = ms => new Promise(resolve => setTimeout(resolve, ms));
// `sleep` waits between polls; a host whose timers are throttled passes its own.
/** @param {import("../transport/types.js").RequestConnection} connection @param {import("./types.js").RequestIds} ids @param {{timeoutMs?: number, pollMs?: number, sleep?: (ms: number) => Promise<void>}} [options] */
async function waitForStorage(connection, ids, {timeoutMs = 90000, pollMs = 150, sleep = defaultSleep} = {}) {
    const deadline = Date.now() + timeoutMs;
    do {
        const status = await readStorageStatus(connection, ids);
        if (status.ready) return status;
        if (status.conflicts || (status.flags & 2)) throw fail("The halves need storage recovery before restoring a profile.");
        await sleep(pollMs);
    } while (Date.now() < deadline);
    throw fail("The two halves have not finished saving. Keep the recovery file and reconnect both halves.");
}
module.exports = {readSettings, readSettingsLimits, readStorageStatus, waitForStorage};
