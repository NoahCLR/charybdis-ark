// @ts-check
"use strict";
const {validateSnapshot} = require("../model/portable-profile");
const {baseLighting} = require("../model/settings-editor");
const {profilePlacementProblem} = require("../model/profile-placement");
const {LAYERS} = require("../data/charybdis-layout");

// What the keyboard would refuse of a profile, said before a restore sends
// anything (profile-device-service.js): a brightness past the limit it
// reports, a lighting effect it lacks, or an action where it cannot run it.
// What is checked is what would be written. Throws the refusal.
/** @param {import("../model/types.js").PortableDocument} document @param {Pick<import("./types.js").ReadSnapshot, "limits" | "options">} facts @param {Partial<import("./types.js").DeviceCapabilities> | undefined} capabilities */
function checkRestorable(document, {limits, options}, capabilities) {
    const target = validateSnapshot(document, capabilities);
    const lighting = baseLighting(target.settings.values);
    const brightness = lighting.brightness;
    if (limits && limits.brightnessMax !== undefined && brightness > limits.brightnessMax) throw Object.assign(new Error(`This profile's brightness exceeds the keyboard's reported limit of ${limits.brightnessMax}. Lower the brightness before restoring it.`), {code: "SETTINGS_LIMIT_EXCEEDED"});
    const effect = lighting.effect;
    if (options && !options.effects.some(item => item.id === effect)) throw Object.assign(new Error("This profile uses a lighting effect unavailable on this keyboard."), {code: "SETTINGS_LIMIT_EXCEEDED"});
    // The keyboard refuses a profile whose actions sit where it cannot run
    // them; say which one before anything is sent.
    const misplaced = profilePlacementProblem(Buffer.from(target.document.profile, "base64"), {layerCount: capabilities?.compiledLayerCount ?? LAYERS,
        capabilities});
    if (misplaced) throw Object.assign(new Error(`${misplaced} Fix it before saving this profile.`), {code: "PLACEMENT_REFUSED"});
}

module.exports = {checkRestorable};
