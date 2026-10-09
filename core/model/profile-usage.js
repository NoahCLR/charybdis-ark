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
const {SETTINGS} = require("../schema/settings-domain-v1");

const AREA_OF_DOMAIN = {
    [PROFILE_DOMAIN_IDS.RGB]: "lighting",
    [PROFILE_DOMAIN_IDS.KEY_BEHAVIORS]: "behaviours",
    [PROFILE_DOMAIN_IDS.COMBOS]: "combos",
    [PROFILE_DOMAIN_IDS.SETTINGS]: "settings",
    [PROFILE_DOMAIN_IDS.PD_MODES]: "pointing",
};
// The order the areas are listed in: what an edit most often grows first.
const AREAS = ["behaviours", "combos", "names", "lighting", "pointing", "settings"];

// Bytes the settings domain spends on names: a length byte plus the text of
// each layer, macro and custom-key name.
function nameBytes(settings) {
    const records = [...settings.names, ...settings.macroNames, ...settings.customKeyNames];
    return records.reduce((total, name) => total + 1 + Buffer.byteLength(name), 0);
}

const positive = value => Number.isInteger(value) && value > 0;
const cache = new WeakMap();

/**
 * The profile's use of its block, or null when there is nothing true to show:
 * no complete snapshot, or firmware that does not advertise its profile size.
 * Counts are listed only for limits the firmware advertises.
 */
function profileUsage(snapshot, capabilities) {
    if (!snapshot?.document || snapshot.incomplete || !positive(capabilities?.maxProfilePayload)) return null;
    // Keyed by the decoded form, which a draft revision keeps for its lifetime
    // while its snapshot object is made afresh on every read.
    const decoded = decodedOf(snapshot), cached = cache.get(decoded);
    if (cached?.capabilities === capabilities) return cached.usage;

    const profile = decoded.profile;
    const bytes = Object.fromEntries(AREAS.map(area => [area, 0]));
    bytes.settings += PROFILE_BLOB_V1.HEADER_SIZE;
    let rgb;
    for (let offset = PROFILE_BLOB_V1.HEADER_SIZE; offset < profile.length;) {
        const id = profile[offset], length = profile.readUInt16LE(offset + 2), end = offset + PROFILE_BLOB_V1.DOMAIN_HEADER_SIZE + length;
        if (id === PROFILE_DOMAIN_IDS.RGB) rgb = profile.subarray(end - length, end);
        bytes[AREA_OF_DOMAIN[id]] += end - offset;
        offset = end;
    }
    const names = nameBytes(decoded.settings);
    bytes.names += names;
    bytes.settings -= names;

    // RGB header: byte 4 is the group count; bytes 6, 8, 9 and 11 count the
    // layer, pointing, combo and key-feedback group rows.
    const counts = [
        ["behaviours", decoded.behaviors.rows.length, capabilities.maxBehaviorRows],
        ["behaviourSteps", decoded.behaviors.populatedStepCount, capabilities.maxPopulatedBehaviorSteps],
        ["combos", decoded.combos.rows.length, capabilities.maxCombos],
        ["lightingGroups", rgb[4], capabilities.maxReusableRgbGroups],
        ["lightingGroupRows", rgb[6] + rgb[8] + rgb[9] + rgb[11], capabilities.maxRgbStageGroupRows],
    ].filter(([, , limit]) => positive(limit)).map(([id, used, limit]) => ({id, used, limit}));

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
