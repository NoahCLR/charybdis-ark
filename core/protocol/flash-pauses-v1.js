// @ts-check
"use strict";
const {PROFILE_WIRE_STATUS, ProfileWireProtocolError, buildProfileGetRequest, decodeProfileResponse, profileResponseMatcher} = require("./profile-wire-v1");
const {requestHandled} = require("./raw-hid-unhandled");

// GET 0x0D, how long each half's profile-slot flash work stops it (firmware
// D-F29; profile-wire-v1/hid-channel.md, "Flash pauses"). Page 0 is the
// master half's figures, page 1 the slave half's as the master half last
// pulled them over the split link; page 1 answers unavailable until a pull
// has succeeded. Reading page 1 asks for the next pull, so fresh figures
// take a read of it, PULL_MS for the master half to pull, and another read.
const FLASH_PAUSES_V1 = Object.freeze({
    VALUE: 0x0d,
    MASTER_PAGE: 0,
    SLAVE_PAGE: 1,
    FIGURES_PRESENT: 1 << 0,
    // The physical half byte: 0 left, 1 right, 0xFF not provisioned
    // (core/model/vocabulary.js words each).
    PHYSICAL_HALVES: Object.freeze([0, 1, 0xff]),
    // The master half pulls at most once a second.
    PULL_MS: 1000,
});

/** @param {string} message */
const invalid = (message) => Object.assign(new Error(`${message} Read the keyboard again.`), {code: "INVALID_FLASH_PAUSES"});

/** @param {Uint8Array} payload @param {number} offset */
const u32 = (payload, offset) => (payload[offset] | payload[offset + 1] << 8 | payload[offset + 2] << 16 | payload[offset + 3] << 24) >>> 0;

// One half's page: its figures in µs from boot, as it reports them, or null
// when it reports none yet.
/** @param {Uint8Array} payload @returns {import("./types.js").FlashPauses | null} */
function decodeFlashPausePage(payload) {
    if (payload.length !== 25) throw invalid("A flash pause page is not 25 bytes.");
    if (payload[0] & ~FLASH_PAUSES_V1.FIGURES_PRESENT) throw invalid("A flash pause page has unknown flags.");
    if (!FLASH_PAUSES_V1.PHYSICAL_HALVES.includes(payload[1])) throw invalid("A flash pause page names no half.");
    if (payload[24] !== 0) throw invalid("A flash pause page has a nonzero reserved byte.");
    if (!(payload[0] & FLASH_PAUSES_V1.FIGURES_PRESENT)) return null;
    return {
        physicalHalf: payload[1],
        longestEraseUs: u32(payload, 2),
        longestProgramUs: u32(payload, 6),
        longestStorageStepUs: u32(payload, 10),
        lastSaveUs: u32(payload, 14),
        lastSaveFlashUs: u32(payload, 18),
        saves: payload[22] | payload[23] << 8,
    };
}

/** @param {import("../transport/types.js").RequestConnection} connection @param {import("./types.js").RequestIds} ids @param {number} page @param {import("../transport/types.js").RequestOptions} options */
async function readPage(connection, ids, page, options) {
    const request = buildProfileGetRequest(FLASH_PAUSES_V1.VALUE, page, ids.next());
    const response = await requestHandled(connection, request, {...options, matchResponse: profileResponseMatcher}, `flash pause page ${page}`);
    try {
        return decodeFlashPausePage(decodeProfileResponse(response, request));
    } catch (error) {
        const refused = error instanceof ProfileWireProtocolError && /** @type {{status?: number}} */ (/** @type {unknown} */ (error)).status;
        if (page === FLASH_PAUSES_V1.SLAVE_PAGE && refused === PROFILE_WIRE_STATUS.UNAVAILABLE) return null;
        throw error;
    }
}

// Both halves' pages, master then slave; a half that has no figures yet is null.
/** @param {import("../transport/types.js").RequestConnection} connection @param {import("./types.js").RequestIds} ids @param {import("../transport/types.js").RequestOptions} [options] @returns {Promise<import("./types.js").FlashPauseRead>} */
async function readFlashPauses(connection, ids, options = {}) {
    const master = await readPage(connection, ids, FLASH_PAUSES_V1.MASTER_PAGE, options);
    const slave = await readPage(connection, ids, FLASH_PAUSES_V1.SLAVE_PAGE, options);
    return {master, slave};
}

module.exports = {FLASH_PAUSES_V1, decodeFlashPausePage, readFlashPauses};
