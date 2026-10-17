// @ts-check
"use strict";

// How full the keyboard's profile is: one block the behaviours, combos,
// lighting, pointing modes, settings and every name share, against the size the
// firmware advertises (maxProfilePayload). Each area also has a counted limit;
// the profile can fill up before any of them is reached.
//
// The bytes are the canonical blob the snapshot already holds, so the areas add
// up to exactly what Apply would write. Macro steps live in the separate VIA
// bank (macro-editor.js macroBudget) and are not counted here.

const {decodedOf} = require("./portable-profile");
const {PROFILE_BLOB_V1, PROFILE_DOMAIN_IDS} = require("../schema/profile-blob-v1");

const {profileDomain} = require("../schema/profile-domains");
// The order the areas are listed in: what an edit most often grows first.
const AREAS = ["behaviours", "combos", "names", "lighting", "pointing", "settings"];

// Bytes the settings domain spends on names: a length byte plus the text of
// each layer, macro and custom-key name, and the keyboard's own.
/** @param {Pick<import("../schema/types.js").SettingsDomain, 'names' | 'macroNames' | 'customKeyNames' | 'keyboardName'>} settings */
function nameBytes(settings) {
    const records = [...settings.names, ...settings.macroNames, ...settings.customKeyNames, settings.keyboardName];
    return records.reduce((total, name) => total + 1 + Buffer.byteLength(name), 0);
}

/** @param {number | undefined} value @returns {value is number} */
const positive = value => typeof value === "number" && Number.isInteger(value) && value > 0;
/** @type {WeakMap<import("./types.js").DecodedProfile, {capabilities: import("./types.js").ProfileDestination, usage: import("../../contracts/model.js").ProfileUsage}>} */
const cache = new WeakMap();

/**
 * The profile's use of its block, or null when there is nothing true to show:
 * no complete snapshot, or firmware that does not advertise its profile size.
 * Counts are listed only for limits the firmware advertises.
 */
/** @param {import("./types.js").ProfileSnapshot | null | undefined} snapshot @param {import("./types.js").ProfileDestination} [capabilities] @returns {import("../../contracts/model.js").ProfileUsage | null} */
function profileUsage(snapshot, capabilities) {
    if (!snapshot?.document || snapshot.incomplete || !capabilities || !positive(capabilities.maxProfilePayload)) return null;
    // Keyed by the decoded form, which a draft revision keeps for its lifetime
    // while its snapshot object is made afresh on every read.
    const decoded = decodedOf(snapshot), cached = cache.get(decoded);
    if (cached?.capabilities === capabilities) return cached.usage;

    const profile = decoded.profile;
    /** @type {Record<string, number>} */
    const bytes = Object.fromEntries(AREAS.map(area => [area, 0]));
    bytes.settings += PROFILE_BLOB_V1.HEADER_SIZE;
    /** @type {Buffer | undefined} */
    let rgb;
    for (let offset = /** @type {number} */ (PROFILE_BLOB_V1.HEADER_SIZE); offset < profile.length;) {
        const id = profile[offset], length = profile.readUInt16LE(offset + 2), end = offset + PROFILE_BLOB_V1.DOMAIN_HEADER_SIZE + length;
        if (id === PROFILE_DOMAIN_IDS.RGB) rgb = profile.subarray(end - length, end);
        bytes[/** @type {NonNullable<ReturnType<typeof profileDomain>>} */ (profileDomain(id)).area] += end - offset;
        offset = end;
    }
    const names = nameBytes(decoded.settings);
    bytes.names += names;
    bytes.settings -= names;

    // RGB header: byte 4 is the group count; bytes 6, 8, 9 and 11 count the
    // layer, pointing, combo and key-feedback group rows.
    // A validated complete profile always contains RGB.
    const lighting = /** @type {Buffer} */ (rgb);
    const counts = /** @type {[string, number, number | undefined][]} */ ([
        ["behaviours", decoded.behaviors.rows.length, capabilities.maxBehaviorRows],
        ["behaviourSteps", decoded.behaviors.populatedStepCount, capabilities.maxPopulatedBehaviorSteps],
        ["combos", decoded.combos.rows.length, capabilities.maxCombos],
        ["lightingGroups", lighting[4], capabilities.maxReusableRgbGroups],
        ["lightingGroupRows", lighting[6] + lighting[8] + lighting[9] + lighting[11], capabilities.maxRgbStageGroupRows],
    ]).filter(([, , limit]) => positive(limit)).map(([id, used, limit]) => ({id, used, limit: /** @type {number} */ (limit)}));

    const usage = {
        used: profile.length,
        capacity: capabilities.maxProfilePayload,
        areas: AREAS.map(id => ({id, bytes: bytes[id]})),
        counts,
    };
    cache.set(decoded, {capabilities, usage});
    return usage;
}

module.exports = {profileUsage, AREAS};
