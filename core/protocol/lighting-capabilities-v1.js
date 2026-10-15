// @ts-check
"use strict";
const {LIGHTING_REGISTRIES} = require("../schema/lighting-kinds-v1");
const {buildProfileGetRequest, decodeProfileResponse, profileResponseMatcher, ProfileWireProtocolError, PROFILE_WIRE_STATUS} = require("./profile-wire-v1");
const LIGHTING_FEATURE = 0x80000000;
/** @param {Uint8Array[]} pages @param {Record<number, Uint8Array>} [modulePages] @returns {import('../schema/lighting-types.js').LightingCapabilities} */
function decodeLightingCapabilities(pages, modulePages = {}) {
    /** @param {string} message @returns {never} */
    const fail = message => {throw new ProfileWireProtocolError("MALFORMED_RESPONSE", message);};
    if ((pages.length !== 15 && pages.length !== 16) || pages.some(p => !(p instanceof Uint8Array))) fail("Lighting capabilities need all 15 pages.");
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
    /** @type {import('../schema/lighting-types.js').LightingWorkingCapabilities | undefined} */
    let working;
    const w = pages[15];
    if (w?.length) {
        if (w.length !== 8) fail("Malformed lighting working-memory page.");
        working = {model: w[0], capacity: w[1] | w[2] << 8, ownerBytes: w[3], descriptorBytes: w[4], slotHeaderBytes: w[5], memberBase: w[6], alignment: w[7], modules: {}};
        // Unknown layouts are retained, never interpreted as model1.
        if (working.model === 1 && (working.ownerBytes < 1 || working.ownerBytes > 32 || w[4] !== 12 || w[5] !== 12 || w[6] !== 5 || w[7] !== 4)) fail("Unsupported model1 lighting layout.");
        for (const [id, bytes] of Object.entries(modulePages)) {
            const kind = Number(id);
            if (!bytes.length) continue;
            if (bytes.length !== 4 || bytes[0] !== kind || !registries.facts.includes(kind) || !bytes[1] || !bytes[3] || bytes[2] !== 255 && bytes[2] >= 16) fail("Malformed lighting module bounds.");
            working.modules[kind] = {domain: bytes[1], selectorParameter: bytes[2], maximumMembers: bytes[3]};
        }
    }
    return {layoutVersion: p[0], domainVersion: p[1], payloadBudget: p[2] | p[3] << 8, paletteMaximum: p[4], conditionsPerRule: p[5], partParameterMaximum: p[6], tapDepth: p[7], ledCount: p[8], registries, ...(working ? {working} : {})};
}
/** @param {import('../transport/types.js').RequestConnection} connection @param {import('./types.js').ReadOptions} [options] */
async function readLightingCapabilities(connection, options = {}) {
    /** @param {number} page */
    const read = async page => {
        const request = buildProfileGetRequest(0x0d, page, options.nextRequestId?.() ?? (page % 255) + 1);
        const response = await connection.request(request, {matchResponse: profileResponseMatcher, signal: options.signal, timeoutMs: options.timeoutMs});
        try {return decodeProfileResponse(response, request, {allowShortPayload: true});}
        catch (error) {
            if (page >= 15 && error instanceof ProfileWireProtocolError && error.code === "DEVICE_REJECTED" && /** @type {Error & {status?: number}} */ (error).status === PROFILE_WIRE_STATUS.UNKNOWN_PAGE) return new Uint8Array();
            throw error;
        }
    };
    const pages = [];
    for (let page = 0; page < 16; page++) pages.push(await read(page));
    const base = decodeLightingCapabilities(pages);
    /** @type {Record<number, Uint8Array>} */ const modules = {};
    if (base.working?.model === 1) for (const id of base.registries.facts) if (id < 128) modules[id] = await read(128 + id);
    return decodeLightingCapabilities(pages, modules);
}
module.exports = {LIGHTING_FEATURE, decodeLightingCapabilities, readLightingCapabilities};
