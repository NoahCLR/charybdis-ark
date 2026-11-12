// @ts-check
"use strict";

// Whole-profile findings shown before Apply. Layer reachability lives in its
// own walk; these checks cover actions that the firmware accepts but cannot
// perform, and destination limits that would refuse the save.
const {gestureTimingFindings} = require("./gesture-timing");
const {inertBehaviorFindings} = require("./inert-behaviors");
const {layerReach} = require("./layer-reach");
const {compareFindings} = require("./compare-findings");
const {baseLighting} = require("./settings-editor");
const {shortcutPresent} = require("../schema/settings-domain-v1");
const {hostSettings} = require("../schema/host-settings");
const {inspectMacroPlayback, readStoredMacro} = require("./macro-input");
const {pointingMacros} = require("./pointing-taps");
const {inertLinkLayers, inertLinkReason, linkNamed} = require("./pointing-links");
const {PROFILE_ACTION_KINDS: ACTION} = require("../schema/profile-blob-v1");
const {actionName, isLeaderKey, sendsLeader} = require("../schema/actions");
const {profileFacts} = require("./layer-walk");
const {entryKey, firesAfterLeader, triggerOf} = require("../schema/autocorrect-domain-v1");
const {REVIEW_AREAS, VOCABULARY, macroDefaultName, settingsPath, slotName, word} = require("./vocabulary");
const {WARNING, entryOfKey, listWarnings, replacementSaid, untypableFix} = require("./autocorrect-list");
const {macroName} = require("../../rules/qmk-keycodes.mjs");

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
            if (shortcutPresent(shortcut)) continue;
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

// Where the profile sends the Leader key (firmware D-F71): its keys, then
// the behaviours and combos with a step or output that names it.
/** @param {import("./types.js").DecodedProfile} decoded @returns {import("../../contracts/model.js").FindingPlace[]} */
function leaderPlaces(decoded) {
    /** @type {import("../../contracts/model.js").FindingPlace[]} */
    const places = [];
    profileFacts(decoded).layers.forEach((codes, layer) => codes.forEach((code, layoutIndex) => {if (isLeaderKey(code)) places.push({kind: "key", layer, layoutIndex});}));
    for (const row of decoded.behaviors?.rows || []) {
        if (row.steps.some(step => [step.tap, step.hold?.action, step.longHold?.action].some(sendsLeader))) places.push({kind: "behaviour", keycode: actionName(row.target)});
    }
    (decoded.combos?.rows || []).forEach((combo, index) => {if (sendsLeader(combo.output)) places.push({kind: "combo", index});});
    return places;
}
// Replacements that fire after the Leader key with no Leader key to press,
// and a Leader key with nothing on the list that fires after it (D-L91): the
// keyboard accepts both, and either does nothing.
/** @param {import("./types.js").DecodedProfile} decoded @returns {import("../../contracts/model.js").Finding[]} */
function leaderFindings(decoded) {
    const list = decoded.autocorrect || {entries: []}, leading = list.entries.filter(entry => firesAfterLeader(triggerOf(entry))), count = leading.length;
    const places = leaderPlaces(decoded);
    if (count && !places.length) {
        return [{kind: "leaderWithoutKey", level: "warning", layers: [], identity: String(count), count,
            title: `${count} replacement${count === 1 ? " fires" : "s fire"} after a Leader key there is not`,
            detail: `${count === 1 ? "A replacement fires" : `${count} replacements fire`} after the Leader key, and no key, behaviour or combo sends it, so the keyboard never waits for ${count === 1 ? "its inputs" : "theirs"}.`,
            fix: "Put the Leader key on a key, in a behaviour or as a combo's output, or make those replacements fire as you type.", place: {kind: "autocorrect", entry: entryKey(leading[0])}}];
    }
    if (places.length && !count) {
        return [{kind: "leaderWithoutInputs", level: "warning", layers: [], identity: String(places.length), count: places.length,
            title: `The Leader key has nothing to send`,
            detail: `${places.length === 1 ? "A key, behaviour or combo sends" : `${places.length} keys, behaviours or combos send`} the Leader key, and no replacement on your text replacement list fires after it, so it does nothing.`,
            fix: "Make a replacement fire after Leader in Text replacement, or take the Leader key off.", place: places[0]}];
    }
    return [];
}

/** @param {import("./types.js").DecodedProfile} decoded @param {import("./types.js").ProfileDestination} [destination] @returns {import("../../contracts/model.js").Finding[]} */
function profileFindings(decoded, destination = {}) {
    /** @type {import("../../contracts/model.js").Finding[]} */
    const findings = [...layerReach(decoded), ...gestureTimingFindings(decoded), ...shortcutlessCustomKeySteps(decoded), ...inertBehaviorFindings(decoded), ...leaderFindings(decoded)];
    for (const [slot, count] of Object.entries(decoded.danglingPointingKeys || {})) {
        if (!count) continue;
        findings.push({kind: "inertPointing", level: "warning", layers: [], identity: `${slot}:${count}`, count,
            title: `${count} action${count === 1 ? " reaches" : "s reach"} ${slotName(undefined, Number(slot))}, an empty pointing slot`,
            detail: "Keys, behaviours or combo outputs still name this empty slot. The keyboard accepts them but does nothing when they run.",
            fix: "Configure the slot or replace the actions that reach it.", place: {kind: "pointing", slot: Number(slot)}});
    }
    // A layer the keyboard ignores in a link, the pointer layer or a default
    // layer: stored and carried, since the pointing domain accepts it, and
    // said here (the editor refuses to add one; settings or a reorder can).
    for (const slot of decoded.pdModes || []) {
        if (!slot.kind) continue;
        const inert = inertLinkLayers(decoded.settings, linkNamed(slot));
        for (let layer = 0; inert >>> layer; layer++) {
            if (!(inert & (1 << layer))) continue;
            findings.push({kind: "inertPointingLink", level: "warning", layers: [layer], identity: `${slot.id}:${layer}`,
                title: `${slotName(slot)}'s link names a layer the keyboard ignores in it`,
                detail: inertLinkReason(decoded.settings, layer),
                fix: "Take the layer out of the mode's link.", place: {kind: "pointing", slot: slot.id}});
        }
    }
    const host = hostSettings(decoded.settings.values, destination.detectedHostOs);
    const emptyMacros = new Set();
    (decoded.macroSlots || []).forEach((bytes, index) => {
        if (!bytes.length) { emptyMacros.add(index); return; }
        const payload = readStoredMacro(bytes);
        if (!payload) emptyMacros.add(index);
        const playback = inspectMacroPlayback(payload, host);
        if (!playback.error) return;
        findings.push({kind: "unplayableMacro", level: "warning", layers: [], identity: `${index}:${playback.code}:${playback.error}`,
            title: `${macroDefaultName(index)} cannot play with the settings in ${VOCABULARY.settingsSections.host}`,
            detail: `${playback.error} The keyboard stores this macro, but pressing it does nothing.`,
            fix: `Fix the macro or change ${settingsPath("host", "host")} before playing it.`, place: {kind: "macro", index, keycode: macroName(index)}});
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
    // Text replacements the host layout cannot type (D-L84): the keyboard
    // skips them, so they are carried and said once, however many there are.
    // A layout changed on the Host screen is what leaves them so.
    const layoutName = word(VOCABULARY.hostLayouts, host.layout);
    const macroNames = decoded.settings.macroNames || [];
    const listed = listWarnings(decoded.autocorrect || {entries: []}, {layout: host.layout, layoutName, macroNames, emptyMacros});
    /** @param {string} key */
    const calledEntry = key => replacementSaid(entryOfKey(key), macroNames);
    const silent = listed.filter(warning => warning.kind === WARNING.UNTYPABLE);
    if (silent.length) {
        const named = [...new Set(silent.map(warning => warning.entry))];
        findings.push({kind: "untypableAutocorrect", level: "warning", layers: [], identity: silent.map(warning => `${warning.entry}:${warning.typo ?? ""}`).join("|"), count: named.length,
            title: `${layoutName} cannot type ${named.length} text replacement${named.length === 1 ? "" : "s"}`,
            detail: `${layoutName} cannot type a character in ${named.slice(0, 8).map(calledEntry).join(", ")}${named.length > 8 ? ` and ${named.length - 8} more` : ""}. The keyboard stores them and skips them.`,
            fix: untypableFix(" on the Text replacement screen"), place: {kind: "autocorrect", entry: named[0]}});
    }
    // A replacement that plays an empty macro, as a pointing mode that runs
    // one is said: the keyboard accepts it and does nothing.
    for (const warning of listed.filter(entry => entry.kind === WARNING.EMPTY_MACRO)) {
        const named = entryOfKey(warning.entry);
        if (!("macro" in named)) continue;
        findings.push({kind: "inertAutocorrectMacro", level: "warning", layers: [], identity: String(named.macro),
            title: `A text replacement plays empty macro ${named.macro}`,
            detail: "This macro has no steps, so the keyboard leaves what you typed as it is.",
            fix: "Add steps in Macros, or choose another replacement.", place: {kind: "autocorrect", entry: warning.entry}});
    }
    const lighting = baseLighting(decoded.settings.values);
    const max = destination.brightnessMax;
    if (max !== undefined && Number.isInteger(max) && lighting.brightness > max) {
        findings.push({kind: "brightnessBlocker", level: "blocker", layers: [], identity: String(lighting.brightness),
            title: `Background effect brightness exceeds this keyboard's limit of ${max}`,
            detail: `This profile stores brightness ${lighting.brightness}; the keyboard accepts at most ${max}, so it refuses the profile.`,
            fix: `Set the background effect brightness to ${max} or lower.`, place: {kind: "settings", area: REVIEW_AREAS.lighting, section: "rgbAppearance", stage: "base"}});
    }
    if (Array.isArray(destination.effects) && !destination.effects.some(effect => effect.id === lighting.effect)) {
        findings.push({kind: "effectBlocker", level: "blocker", layers: [], identity: String(lighting.effect),
            title: `Background effect ${lighting.effect} is unavailable on this keyboard`,
            detail: "The connected firmware does not advertise this effect, so the keyboard refuses the profile.",
            fix: "Choose a background effect this keyboard reports.", place: {kind: "settings", area: REVIEW_AREAS.lighting, section: "rgbAppearance", stage: "base"}});
    }
    return findings;
}

/** @param {import("./types.js").DecodedProfile | null} keyboard @param {import("./types.js").DecodedProfile} draft @param {readonly number[] | undefined} order @param {import("./types.js").ProfileDestination} [destination] @returns {import("../../contracts/model.js").Check[]} */
function draftProfileChecks(keyboard, draft, order, destination) {
    return compareFindings(keyboard ? profileFindings(keyboard, destination) : [], profileFindings(draft, destination), order);
}

module.exports = {profileFindings, draftProfileChecks};
