// @ts-check
"use strict";
const {LIGHTING_REGISTRIES} = require("../schema/lighting-kinds-v1");
const {buildProfileGetRequest, decodeProfileResponse, profileResponseMatcher, ProfileWireProtocolError} = require("./profile-wire-v1");
const LIGHTING_FEATURE = 0x80000000;
/** @param {Uint8Array[]} pages @returns {import('../schema/lighting-types.js').LightingCapabilities} */
function decodeLightingCapabilities(pages) {
    /** @param {string} message @returns {never} */
    const fail = message => {throw new ProfileWireProtocolError("MALFORMED_RESPONSE", message);};
    if (pages.length !== 15 || pages.some(p => !(p instanceof Uint8Array))) fail("Lighting capabilities need all 15 pages.");
    const p = pages[0];
    if (p.length !== 10 || p[0] !== 1 || p[1] !== 5 || (p[2] | p[3] << 8) !== 8192 || p[4] !== 128 || p[5] !== 4 || p[6] !== 16 || p[7] < 2 || p[8] !== 58 || p[9] !== 7) fail("Unsupported lighting capability bounds.");
    /** @type {Record<import('../schema/lighting-types.js').LightingRegistry, number[]>} */
    const registries = {facts: [], targets: [], paints: [], timings: [], ruleExtensions: [], domainExtensions: [], things: []};
    LIGHTING_REGISTRIES.forEach((name, r) => {
        for (let h = 0; h < 2; h++) {
            const bitmap = pages[1 + 2 * r + h];
            if (bitmap.length !== 18 || bitmap[0] !== r || bitmap[1] !== 128 * h) fail("Lighting bitmap page does not match its registry and range.");
            for (let bit = 0; bit < 128; bit++) if (bitmap[2 + (bit >> 3)] & 1 << (bit & 7)) registries[name].push(h * 128 + bit);
        }
    });
    return {layoutVersion: p[0], domainVersion: p[1], payloadBudget: p[2] | p[3] << 8, paletteMaximum: p[4], conditionsPerRule: p[5], partParameterMaximum: p[6], tapDepth: p[7], ledCount: p[8], registries};
}
/** @param {import('../transport/types.js').RequestConnection} connection @param {import('./types.js').ReadOptions} [options] */
async function readLightingCapabilities(connection, options = {}) {
    const pages = [];
    for (let page = 0; page < 15; page++) {
        const request = buildProfileGetRequest(0x0d, page, options.nextRequestId?.() ?? page + 1);
        const response = await connection.request(request, {matchResponse: profileResponseMatcher, signal: options.signal, timeoutMs: options.timeoutMs});
        pages.push(decodeProfileResponse(response, request, {allowShortPayload: true}));
    }
    return decodeLightingCapabilities(pages);
}
module.exports = {LIGHTING_FEATURE, decodeLightingCapabilities, readLightingCapabilities};
