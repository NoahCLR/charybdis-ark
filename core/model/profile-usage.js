// @ts-check
"use strict";

// How full the keyboard's profile is, told the way its owner thinks of it: how
// much of the profile's storage is used (maxProfilePayload, as the firmware
// advertises it), and how many of each thing they set up against how many the
// keyboard holds. Behaviours, tap counts, combos, LED groups and LED overrides
// are counted against the limits the firmware refuses an edit past; macros,
// custom keys and pointing modes are fixed sets of slots, counted as how many
// are in use, the way their own screens count them. Macro slots can also be
// unavailable: every empty one keeps room in the shared profile space, and
// when that runs short the highest empty ones have none (macro-editor.js
// macroBudget).
//
// The bytes are the canonical blob the snapshot already holds, so the total is
// exactly what Apply would write. Keymap and macro steps are included.

const {decodedOf} = require("./portable-profile");
const {profileMacroBudget} = require("./macro-editor");
const {PROFILE_ACTION_KINDS: ACTION, PROFILE_DOMAIN_IDS, decodeProfileBlob} = require("../schema/profile-blob-v1");
const {shortcutPresent} = require("../schema/settings-domain-v1");

/** @param {number | undefined} value @returns {value is number} */
const positive = value => typeof value === "number" && Number.isInteger(value) && value > 0;
/** @type {WeakMap<import("./types.js").DecodedProfile, {capabilities: import("./types.js").ProfileDestination, usage: import("../../contracts/model.js").ProfileUsage}>} */
const cache = new WeakMap();

// The RGB domain's payload, whose header counts the LED groups and overrides.
// A validated complete profile always contains RGB. The schema's own decoder
// walks the envelopes, so their width is written once (schema 4: 32 bits).
/** @param {Buffer} profile @returns {Buffer} */
function rgbPayload(profile) {
    const rgb = decodeProfileBlob(profile).domains.find(domain => domain.id === PROFILE_DOMAIN_IDS.RGB);
    if (!rgb) throw new Error("A complete profile carries its lighting.");
    return rgb.payload;
}

/**
 * The profile's use of its storage and its counts, or null when there is
 * nothing true to show: no complete snapshot, or firmware that does not
 * advertise its profile size. A limit is listed only when the firmware
 * advertises it; the fixed slots are always listed.
 */
/** @param {import("./types.js").ProfileSnapshot | null | undefined} snapshot @param {import("./types.js").ProfileDestination} [capabilities] @returns {import("../../contracts/model.js").ProfileUsage | null} */
function profileUsage(snapshot, capabilities) {
    if (!snapshot?.document || snapshot.incomplete || !capabilities || !positive(capabilities.maxProfilePayload)) return null;
    // Keyed by the decoded form, which a draft revision keeps for its lifetime
    // while its snapshot object is made afresh on every read.
    const decoded = decodedOf(snapshot), cached = cache.get(decoded);
    if (cached?.capabilities === capabilities) return cached.usage;

    const {profile, settings, behaviors, combos, pdModes, macroSlots} = decoded;
    // RGB header: byte 4 is the group count; bytes 6, 8, 9 and 11 count the
    // layer, pointing, combo and key-feedback override rows.
    const lighting = rgbPayload(profile);
    // A custom key is in use once it has a name, a shortcut or a behaviour, as
    // the Custom keys screen marks its tile; a pointing slot once it has a mode.
    const behaved = new Set(behaviors.rows.filter(row => row.target.kind === ACTION.CUSTOM_KEY).map(row => row.target.operand));
    const customKeys = settings.customKeyNames.filter((name, slot) =>
        name || shortcutPresent(settings.customKeyShortcuts[slot]) || behaved.has(slot)).length;
    // A macro slot is in use once it has steps; the rest are free unless the
    // macro memory has no room left for them.
    const macros = profileMacroBudget(decoded, capabilities);
    const counts = /** @type {[string, number, number | undefined, number?][]} */ ([
        ["behaviours", behaviors.rows.length, capabilities.maxBehaviorRows],
        ["behaviourSteps", behaviors.populatedStepCount, capabilities.maxPopulatedBehaviorSteps],
        ["combos", combos.rows.length, capabilities.maxCombos],
        ["lightingGroups", lighting[4], capabilities.maxReusableRgbGroups],
        ["lightingGroupRows", lighting[6] + lighting[8] + lighting[9] + lighting[11], capabilities.maxRgbStageGroupRows],
        ["macros", macroSlots.length - macros.empty, macroSlots.length, macros.outOfRoom.size],
        ["customKeys", customKeys, settings.customKeyNames.length],
        ["pointingModes", pdModes.filter(slot => slot.kind).length, pdModes.length],
    ]).filter(([, , limit]) => positive(limit)).map(([id, used, limit, unavailable]) =>
        ({id, used, limit: /** @type {number} */ (limit), ...(unavailable ? {unavailable} : {})}));

    const usage = {used: decoded.candidate.length, capacity: capabilities.maxProfilePayload, counts};
    cache.set(decoded, {capabilities, usage});
    return usage;
}

module.exports = {profileUsage};
