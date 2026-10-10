"use strict";

// Whole-profile findings shown before Apply. Layer reachability lives in its
// own walk; these checks cover actions that the firmware accepts but cannot
// perform, and destination limits that would refuse the save.
const {gestureTimingFindings} = require("./gesture-timing");
const {layerReach, compareFindings} = require("./layer-reach");
const {baseLighting} = require("./settings-editor");
const {decodeMacroPayload} = require("../schema/macro-payload");
const {hostSettings} = require("../schema/host-settings");
const {inspectMacroPlayback} = require("./macro-input");

function profileFindings(decoded, destination = {}) {
    const findings = [...layerReach(decoded, {legacyGestureTiming: destination.physicalGestureTiming === false, legacyOwnedTapping: destination.ownedTapping === false}), ...gestureTimingFindings(decoded)];
    for (const [slot, count] of Object.entries(decoded.danglingPdBindings || {})) {
        if (!count) continue;
        findings.push({kind: "inertPointing", level: "warning", layers: [], identity: `${slot}:${count}`, count,
            title: `${count} action${count === 1 ? "" : "s"} reach empty pointing slot ${Number(slot) + 1}`,
            detail: "Keys, behaviours or combo outputs still name this empty slot. The keyboard accepts them but does nothing when they run.",
            fix: "Configure the slot or replace the actions that reach it.", place: {kind: "pointing", slot: Number(slot)}});
    }
    const host = hostSettings(decoded.settings.values, destination.detectedHostOs);
    (decoded.document?.macros || []).forEach((encoded, index) => {
        const bytes = Buffer.from(encoded, "base64");
        if (!bytes.length) return;
        const playback = inspectMacroPlayback(decodeMacroPayload(bytes, {unicode: true, protectionSupported: true}), host);
        if (!playback.error) return;
        findings.push({kind: "unplayableMacro", level: "warning", layers: [], identity: `${index}:${playback.code}:${playback.error}`,
            title: playback.code === "MACRO_TOO_LONG" ? `Macro ${index} is too long to play` : `Macro ${index} cannot play with this Host setup`,
            detail: `${playback.error} The keyboard stores this macro, but pressing it does nothing.`,
            fix: "Fix the macro or change Settings → Host before playing it.", place: {kind: "macro", index}});
    });
    const lighting = baseLighting(decoded.settings.values);
    const max = destination.brightnessMax;
    if (Number.isInteger(max) && lighting.brightness > max) {
        findings.push({kind: "brightnessBlocker", level: "blocker", layers: [], identity: String(lighting.brightness),
            title: `Base brightness exceeds this keyboard's limit of ${max}`,
            detail: `This profile stores brightness ${lighting.brightness}; the keyboard accepts at most ${max}. Apply will refuse the profile.`,
            fix: `Set Base Lighting brightness to ${max} or lower.`, place: {kind: "settings", area: "Settings", section: "rgbAppearance"}});
    }
    if (Array.isArray(destination.effects) && !destination.effects.some(effect => effect.id === lighting.effect)) {
        findings.push({kind: "effectBlocker", level: "blocker", layers: [], identity: String(lighting.effect),
            title: `Base lighting effect ${lighting.effect} is unavailable on this keyboard`,
            detail: "The connected firmware does not advertise this effect. Apply will refuse the profile.",
            fix: "Choose a base lighting effect this keyboard reports.", place: {kind: "settings", area: "Settings", section: "rgbAppearance"}});
    }
    return findings;
}

function draftProfileChecks(keyboard, draft, order, destination) {
    return compareFindings(keyboard ? profileFindings(keyboard, destination) : [], profileFindings(draft, destination), order);
}

module.exports = {profileFindings, draftProfileChecks};
