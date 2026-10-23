// @ts-check
"use strict";

// Whole-profile findings shown before Apply. Layer reachability lives in its
// own walk; these checks cover actions that the firmware accepts but cannot
// perform, and destination limits that would refuse the save.
const {gestureTimingFindings} = require("./gesture-timing");
const {inertBehaviorFindings} = require("./inert-behaviors");
const {layerReach, compareFindings} = require("./layer-reach");
const {baseLighting} = require("./settings-editor");
const {decodeMacroPayload} = require("../schema/macro-payload");
const {hostSettings} = require("../schema/host-settings");
const {inspectMacroPlayback} = require("./macro-input");
const {pointingMacros} = require("./pointing-taps");
const {PROFILE_ACTION_KINDS: ACTION} = require("../schema/profile-blob-v1");
const {actionName} = require("../schema/actions");
const {VOCABULARY} = require("./vocabulary");

// A behaviour step that sends a custom key sends only its shortcut (firmware
// D-F26). The keyboard accepts a step naming a custom key without one, which
// then does nothing; the profile carries it and the check says so.
/** @param {import("./types.js").DecodedProfile} decoded @returns {import("../../contracts/model.js").Finding[]} */
function shortcutlessCustomKeySteps(decoded) {
    const shortcuts = decoded.settings.customKeyShortcuts || [], names = decoded.settings.customKeyNames || [];
    /** @type {import("../../contracts/model.js").Finding[]} */
    const findings = [];
    for (const row of decoded.behaviors?.rows || []) {
        const keycode = actionName(row.target);
        for (const step of row.steps) for (const [tier, action] of /** @type {const} */ ([["tap", step.tap], ["hold", step.hold?.action], ["long", step.longHold?.action]])) {
            if (action?.kind !== ACTION.CUSTOM_KEY) continue;
            const shortcut = shortcuts[action.operand];
            if (shortcut && (shortcut.mods || shortcut.key)) continue;
            // The custom key as the Custom keys screen calls it.
            const name = names[action.operand] ? `custom key “${names[action.operand]}”` : `custom key ${action.operand}`;
            findings.push({kind: "shortcutlessCustomKeyStep", level: "warning", layers: [], identity: `${keycode}:${step.tapIndex}:${tier}:${action.operand}`,
                title: `${keycode}: press ${step.tapIndex + 1} ${VOCABULARY.tiers[tier].toLowerCase()} sends ${name}, which has no shortcut`,
                detail: "A behaviour step sends a custom key's shortcut only, never its own behaviour. This custom key has no shortcut, so the step does nothing.",
                fix: "Give the custom key a shortcut on the Custom keys screen, or choose another action.", place: {kind: "behaviour", keycode}});
        }
    }
    return findings;
}

/** @param {import("./types.js").DecodedProfile} decoded @param {import("./types.js").ProfileDestination} [destination] @returns {import("../../contracts/model.js").Finding[]} */
function profileFindings(decoded, destination = {}) {
    /** @type {import("../../contracts/model.js").Finding[]} */
    const findings = [...layerReach(decoded), ...gestureTimingFindings(decoded), ...shortcutlessCustomKeySteps(decoded), ...inertBehaviorFindings(decoded)];
    for (const [slot, count] of Object.entries(decoded.danglingPdBindings || {})) {
        if (!count) continue;
        findings.push({kind: "inertPointing", level: "warning", layers: [], identity: `${slot}:${count}`, count,
            title: `${count} action${count === 1 ? "" : "s"} reach empty pointing slot ${Number(slot) + 1}`,
            detail: "Keys, behaviours or combo outputs still name this empty slot. The keyboard accepts them but does nothing when they run.",
            fix: "Configure the slot or replace the actions that reach it.", place: {kind: "pointing", slot: Number(slot)}});
    }
    const host = hostSettings(decoded.settings.values, destination.detectedHostOs);
    const emptyMacros = new Set();
    (decoded.macroSlots || []).forEach((bytes, index) => {
        if (!bytes.length) { emptyMacros.add(index); return; }
        const payload = decodeMacroPayload(bytes);
        if (!payload) emptyMacros.add(index);
        const playback = inspectMacroPlayback(payload, host);
        if (!playback.error) return;
        findings.push({kind: "unplayableMacro", level: "warning", layers: [], identity: `${index}:${playback.code}:${playback.error}`,
            title: `Macro ${index} cannot play with the settings in Your computer`,
            detail: `${playback.error} The keyboard stores this macro, but pressing it does nothing.`,
            fix: "Fix the macro or change Settings → Your computer before playing it.", place: {kind: "macro", index}});
    });
    for (const output of pointingMacros(decoded.pdModes || [])) {
        const where = {kind: /** @type {const} */ ("pointing"), slot: output.slot};
        if (emptyMacros.has(output.macro)) {
            findings.push({kind: "inertPointingMacro", level: "warning", layers: [], identity: `${output.slot}:${output.label}:${output.macro}`,
                title: `${output.name}: ${output.label} runs empty macro ${output.macro}`,
                detail: "This macro has no steps, so it does nothing yet and leaves a once-per-movement gesture available.",
                fix: "Add steps in Macros, or choose another output.", place: where});
        }
    }
    const lighting = baseLighting(decoded.settings.values);
    const max = destination.brightnessMax;
    if (max !== undefined && Number.isInteger(max) && lighting.brightness > max) {
        findings.push({kind: "brightnessBlocker", level: "blocker", layers: [], identity: String(lighting.brightness),
            title: `Background effect brightness exceeds this keyboard's limit of ${max}`,
            detail: `This profile stores brightness ${lighting.brightness}; the keyboard accepts at most ${max}. Apply will refuse the profile.`,
            fix: `Set the background effect brightness to ${max} or lower.`, place: {kind: "settings", area: "Lighting", section: "rgbAppearance", stage: "base"}});
    }
    if (Array.isArray(destination.effects) && !destination.effects.some(effect => effect.id === lighting.effect)) {
        findings.push({kind: "effectBlocker", level: "blocker", layers: [], identity: String(lighting.effect),
            title: `Background effect ${lighting.effect} is unavailable on this keyboard`,
            detail: "The connected firmware does not advertise this effect. Apply will refuse the profile.",
            fix: "Choose a background effect this keyboard reports.", place: {kind: "settings", area: "Lighting", section: "rgbAppearance", stage: "base"}});
    }
    return findings;
}

/** @param {import("./types.js").DecodedProfile | null} keyboard @param {import("./types.js").DecodedProfile} draft @param {readonly number[] | undefined} order @param {import("./types.js").ProfileDestination} [destination] @returns {import("../../contracts/model.js").Check[]} */
function draftProfileChecks(keyboard, draft, order, destination) {
    return compareFindings(keyboard ? profileFindings(keyboard, destination) : [], profileFindings(draft, destination), order);
}

module.exports = {profileFindings, draftProfileChecks};
