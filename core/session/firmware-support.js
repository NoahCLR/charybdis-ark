// @ts-check
"use strict";
// Ark supports only current firmware: the exact Profile Wire and schema
// versions of the base it was built for (D-L64), which imply everything the
// keyboard does, so nothing past these gates asks whether it has a feature.
// The feature word only describes the build (firmware D-F28). The gates answer
// different questions. A read needs the current base; a complete document also
// needs every domain, current layers and a known action ABI. Complete Apply
// adds a build that saves and copies to the slave half. The live mutation
// diagnostic additionally checks the link, candidate transfer and established
// read compatibility.
const {LAYERS} = require("../data/charybdis-layout");
const {knownActionAbi} = require("../schema/actions");
const {PROFILE_BLOB_V1} = require("../schema/profile-blob-v1");
const {KEY_BEHAVIOR_LIMITS} = require("../schema/key-behavior-domain-v1");
const {PROFILE_WIRE_DOMAINS, PROFILE_DOMAIN_MASK} = require("../schema/profile-domains");
const {RAW_HID_REPORT_SIZE} = require("../transport/device-adapter");
const {PROFILE_ACTIVE_KIND, PROFILE_STATE_FLAGS,
    PROFILE_WIRE_KNOWN_MASKS, PROFILE_WIRE_V1} = require("../protocol/profile-wire-v1");
/** @typedef {import("./types.js").DeviceCapabilities} Caps */
/** @typedef {import("./types.js").ProfileStatus} Status */

const SUPPORTED_PROFILE_PROTOCOL = Object.freeze({major: PROFILE_WIRE_V1.PROTOCOL_MAJOR, minor: PROFILE_WIRE_V1.PROTOCOL_MINOR});
const SUPPORTED_PROFILE_SCHEMA = Object.freeze({major: PROFILE_BLOB_V1.SCHEMA_MAJOR, minor: PROFILE_BLOB_V1.SCHEMA_MINOR});
const PROFILE_DOMAIN_FLAGS = Object.freeze({RGB: PROFILE_WIRE_DOMAINS.RGB, KEY_BEHAVIORS: PROFILE_WIRE_DOMAINS.KEY_BEHAVIORS});
const REQUIRED_PROFILE_DOMAIN_MASK = PROFILE_DOMAIN_FLAGS.RGB | PROFILE_DOMAIN_FLAGS.KEY_BEHAVIORS;
const REQUIRED_LIVE_MUTATION_FEATURES = PROFILE_WIRE_KNOWN_MASKS.CURRENT_MUTATION_FEATURES;
/** @param {Partial<Caps> | null | undefined} capabilities */
const hasCurrentLayers = capabilities => capabilities?.compiledLayerCount === LAYERS;
// Compared unsigned: a mask with bit 31 is positive, `&` gives it back negative.
/** @param {number | undefined} flags @param {number} mask */
const hasAll = (flags, mask) => (((Number(flags) || 0) & mask) >>> 0) === mask >>> 0;

// The exact base, major and minor (D-L64): a later minor is a later capability
// Ark does not know, an earlier one lacks one it relies on.
/** @param {{major?: number, minor?: number} | undefined} actual @param {{major: number, minor: number}} expected */
const sameVersion = (actual, expected) => actual?.major === expected.major && actual?.minor === expected.minor;
/** @param {Partial<Caps> | null | undefined} capabilities */
const isCurrentBase = capabilities => sameVersion(capabilities?.protocol, SUPPORTED_PROFILE_PROTOCOL)
    && sameVersion(capabilities?.schema, SUPPORTED_PROFILE_SCHEMA);

/** @param {Partial<Caps> | null | undefined} capabilities @returns {capabilities is Partial<Caps>} */
const canEdit = capabilities => isCurrentBase(capabilities) && hasCurrentLayers(capabilities)
    && ((capabilities?.supportedDomainMask || 0) & PROFILE_DOMAIN_MASK) === PROFILE_DOMAIN_MASK
    && knownActionAbi(capabilities?.actionAbiDigest ?? 0);

// This is the complete Apply's firmware gate, not the live status diagnostic.
/** @param {Partial<Caps> | null | undefined} capabilities */
const canApply = capabilities => canEdit(capabilities) && hasAll(capabilities.featureFlags, REQUIRED_LIVE_MUTATION_FEATURES);

/** @param {Partial<Caps> | null | undefined} capabilities */
const canRead = capabilities => evaluateProfileCompatibility(capabilities).compatible;

// Keep the old entry point for portable-session clients while panels import
// this module directly rather than loading the Apply orchestrator for a gate.
const supportsCompleteProfile = canEdit;

/** @param {Partial<Caps> | null | undefined} capabilities @param {boolean} [writing] @returns {asserts capabilities is Partial<Caps>} */
function requireReady(capabilities, writing = false) {
    if (!(writing ? canApply(capabilities) : canEdit(capabilities))) {
        throw Object.assign(new Error("Complete profile backup and Apply need current firmware on both halves. Your current keyboard configuration has not been changed."), {code: "FIRMWARE_UPDATE_REQUIRED"});
    }
}

// A pending candidate is allowed when comparing the base under an acquired
// lease. A preview and conflicts always block the stable identity read.
/** @param {Pick<Status, "stateFlags" | "conflictCount">} status @param {boolean} [allowCandidate] */
function canReadIdentity(status, allowCandidate = true) {
    const blocked = PROFILE_STATE_FLAGS.PREVIEW_ACTIVE | (allowCandidate ? 0 : PROFILE_STATE_FLAGS.CANDIDATE_PENDING);
    return !(status.stateFlags & blocked) && !status.conflictCount;
}

/** @param {Pick<Status, "stateFlags" | "conflictCount" | "activeKind">} status @param {boolean} [allowCandidate] */
function canSnapshot(status, allowCandidate = false) {
    const active = status.activeKind === PROFILE_ACTIVE_KIND.COMMITTED || status.activeKind === PROFILE_ACTIVE_KIND.COMPILED_ONLY;
    return active && Boolean(status.stateFlags & PROFILE_STATE_FLAGS.PEER_CONVERGED) && canReadIdentity(status, allowCandidate);
}

/** @param {Pick<Status, "stateFlags">} status */
const identityStateFlags = status => status.stateFlags & ~PROFILE_STATE_FLAGS.CANDIDATE_PENDING;

// Independent device views, read when a complete read fails, keep per-area
// gates. A failed domain prevents behaviours/pointing editing but does not
// close combos; a custom-key view does not acquire an extra layer-count
// requirement.
/** @param {import("./types.js").DeviceModelInput} state */
function editableDomains(state) {
    const committed = state.committed?.state === "read";
    const mask = state.capabilities?.supportedDomainMask || 0;
    const complete = committed && !state.committed?.failures?.length && !state.busy;
    const currentLayers = hasCurrentLayers(state.capabilities) && !state.busy;
    return {
        busy: Boolean(state.busy), behaviors: Boolean(mask & PROFILE_WIRE_DOMAINS.KEY_BEHAVIORS) && complete,
        pointing: Boolean(mask & PROFILE_WIRE_DOMAINS.PD_MODES) && complete,
        combos: Boolean(mask & PROFILE_WIRE_DOMAINS.COMBOS) && committed && !state.busy,
        macros: Boolean(state.macroView) && currentLayers, settings: Boolean(state.settingsView) && currentLayers,
        customKeys: Boolean(state.customKeyView) && !state.busy,
    };
}

// Read compatibility deliberately ignores capacities and the action ABI:
// the keyboard advertises its capacities; editors and Apply enforce them.
/** @param {Partial<Caps> | null | undefined} capabilities */
function evaluateProfileCompatibility(capabilities) {
    const checks = [
        versionCheck("Profile Wire version", capabilities?.protocol, SUPPORTED_PROFILE_PROTOCOL),
        versionCheck("Profile schema", capabilities?.schema, SUPPORTED_PROFILE_SCHEMA),
        equalityCheck("Raw HID report size", capabilities?.reportSize, RAW_HID_REPORT_SIZE),
        minimumCheck("Status pages", capabilities?.statusPageCount, PROFILE_WIRE_V1.STATUS_PAGE_COUNT),
        maskCheck("Required profile domains", capabilities?.supportedDomainMask, REQUIRED_PROFILE_DOMAIN_MASK),
    ];
    const reasons = checks.filter((check) => !check.ok).map((check) => check.message);
    return {
        compatible: reasons.length === 0,
        reasons,
        checks,
        requiredDomainMask: REQUIRED_PROFILE_DOMAIN_MASK,
    };
}

/** @param {string} label @param {number | undefined} actual @param {number | undefined} expected */
function equalityCheck(label, actual, expected) {
    const ok = Number(actual) === Number(expected);
    return {label, ok, actual, limit: expected, message: ok ? "" : `${label} is ${actual}; Charybdis Ark requires ${expected}.`};
}

/** @param {string} label @param {{major?: number, minor?: number} | undefined} actual @param {{major: number, minor: number}} expected */
function versionCheck(label, actual, expected) {
    const ok = sameVersion(actual, expected);
    const shown = `${actual?.major}.${actual?.minor}`, limit = `${expected.major}.${expected.minor}`;
    return {label, ok, actual: shown, limit, message: ok ? "" : `${label} is ${shown}; Charybdis Ark requires ${limit}. Update both halves.`};
}

/** @param {string} label @param {number | undefined} actual @param {number} expected */
function minimumCheck(label, actual, expected) {
    const ok = typeof actual === "number" && Number.isInteger(actual) && actual >= expected;
    return {label, ok, actual, limit: expected, message: ok ? "" : `${label} is ${actual}; at least ${expected} is required.`};
}

/** @param {string} label @param {number | undefined} actual @param {number} expected */
function maskCheck(label, actual, expected) {
    const numeric = (Number(actual) || 0) >>> 0;
    const ok = hasAll(numeric, expected);
    return {label, ok, actual: numeric, limit: expected, message: ok ? "" : `${label} mask 0x${numeric.toString(16)} does not include required mask 0x${expected.toString(16)}.`};
}

/** @param {Partial<Caps> | null | undefined} capabilities @param {Pick<ReturnType<typeof evaluateProfileCompatibility>, "compatible" | "reasons"> | null | undefined} compatibility @param {boolean} [connected] @param {Partial<Status> | null | undefined} [status] */
function evaluateLiveMutationCompatibility(capabilities, compatibility, connected = true, status) {
    const reasons = [];
    if (!connected) reasons.push("Connect to the keyboard before applying a live profile.");
    if (!compatibility?.compatible) reasons.push(...(compatibility?.reasons || ["Read compatibility has not been established."]));
    const flags = Number(capabilities?.featureFlags) || 0;
    if (!hasAll(flags, REQUIRED_LIVE_MUTATION_FEATURES)) {
        reasons.push(`Firmware features 0x${flags.toString(16)} do not include a split build that saves (0x${REQUIRED_LIVE_MUTATION_FEATURES.toString(16)}).`);
    }
    if (!Number.isInteger(capabilities?.candidateChunkMax) || (capabilities?.candidateChunkMax ?? 0) < 1) {
        reasons.push("Firmware does not advertise a candidate upload chunk size.");
    }
    if (connected && !status) {
        reasons.push("Live profile status has not been read yet.");
    } else if (status && !status.slaveKnown) {
        reasons.push("The slave half has not been detected over the cable between the halves.");
    } else if (status && !status.slaveConverged) {
        reasons.push("The two keyboard halves have not established a converged profile state yet.");
    }
    return {
        available: reasons.length === 0,
        reasons,
        requiredFeatureMask: REQUIRED_LIVE_MUTATION_FEATURES,
        slaveReady: Boolean(status?.slaveKnown && status?.slaveConverged),
        recoveryPending: Boolean(status?.candidatePending),
    };
}

// What the connected firmware says about itself, for the Keyboard screen and
// Settings' "Built into this firmware": its version (the capability u32, major.minor.patch
// in its top three bytes), whether this Ark works with it, and the ceilings it
// was compiled with. Only what the keyboard reports, or Ark's own schema
// limits; never a guess. Nothing without capabilities.
/** @param {Partial<Caps> | null | undefined} capabilities */
function firmwareView(capabilities) {
    if (!capabilities) return null;
    const version = capabilities.firmwareVersion;
    const known = Number.isInteger(version) && /** @type {number} */ (version) > 0;
    /** @param {unknown} value */
    const count = value => Number.isInteger(value) ? /** @type {number} */ (value) : null;
    return {
        version: known ? `${(/** @type {number} */ (version) >>> 16) & 0xffff}.${(/** @type {number} */ (version) >>> 8) & 0xff}.${/** @type {number} */ (version) & 0xff}` : null,
        versionWord: known ? `0x${/** @type {number} */ (version).toString(16).toUpperCase().padStart(8, "0")}` : null,
        defaultsDigest: Number.isInteger(capabilities.compiledDefaultDigest) ? `0x${/** @type {number} */ (capabilities.compiledDefaultDigest).toString(16).toUpperCase().padStart(8, "0")}` : null,
        worksWithArk: canApply(capabilities),
        readable: canEdit(capabilities),
        layers: count(capabilities.compiledLayerCount),
        tapCounts: count(capabilities.maxTapStepsPerBehavior),
        behaviours: count(capabilities.maxBehaviorRows),
        combos: count(capabilities.maxCombos),
        keysPerCombo: count(capabilities.maxKeysPerCombo),
        macros: count(capabilities.macroSlots),
        macroBytes: count(capabilities.macroBytes),
        customKeys: count(capabilities.customKeySlots),
        leds: count(capabilities.physicalLedCount),
        profileBytes: count(capabilities.maxProfilePayload),
        repeatHz: KEY_BEHAVIOR_LIMITS.maxRepeatHz,
    };
}

module.exports = {firmwareView, canRead, canEdit, canApply, isCurrentBase, hasCurrentLayers, editableDomains, canSnapshot,
    canReadIdentity, identityStateFlags, supportsCompleteProfile, requireReady,
    evaluateProfileCompatibility, evaluateLiveMutationCompatibility, PROFILE_DOMAIN_FLAGS,
    SUPPORTED_PROFILE_PROTOCOL, SUPPORTED_PROFILE_SCHEMA, REQUIRED_PROFILE_DOMAIN_MASK,
    REQUIRED_LIVE_MUTATION_FEATURES};
