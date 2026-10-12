// @ts-check
"use strict";
// Firmware facts have several intentionally different gates. Independent
// reads need a supported read surface; complete documents also need every
// domain, current layers and a known action ABI. Complete Apply adds the
// atomic feature. The live mutation diagnostic additionally checks the link,
// candidate transfer and established read compatibility.
const {LAYERS} = require("../data/charybdis-layout");
const {knownActionAbi} = require("../schema/actions");
const {PROFILE_BLOB_V1} = require("../schema/profile-blob-v1");
const {PROFILE_WIRE_DOMAINS, PROFILE_DOMAIN_MASK} = require("../schema/profile-domains");
const {RAW_HID_REPORT_SIZE} = require("../transport/device-adapter");
const {PROFILE_ACTIVE_KIND, PROFILE_STATE_FLAGS, PROFILE_WIRE_FEATURES,
    PROFILE_WIRE_KNOWN_MASKS, PROFILE_WIRE_V1, VIA_READS} = require("../protocol/profile-wire-v1");
/** @typedef {import("./types.js").DeviceCapabilities} Caps */
/** @typedef {import("./types.js").ProfileStatus} Status */
/** @typedef {Awaited<ReturnType<typeof import("../protocol/profile-wire-v1.js").readViaIdentity>>} ViaIdentity */

const SUPPORTED_PROFILE_PROTOCOL = Object.freeze({major: 1, minor: 0});
const SUPPORTED_PROFILE_SCHEMA = Object.freeze({major: PROFILE_BLOB_V1.SCHEMA_MAJOR, minor: PROFILE_BLOB_V1.SCHEMA_MINOR});
const PROFILE_DOMAIN_FLAGS = Object.freeze({RGB: PROFILE_WIRE_DOMAINS.RGB, KEY_BEHAVIORS: PROFILE_WIRE_DOMAINS.KEY_BEHAVIORS});
const REQUIRED_PROFILE_DOMAIN_MASK = PROFILE_DOMAIN_FLAGS.RGB | PROFILE_DOMAIN_FLAGS.KEY_BEHAVIORS;
const REQUIRED_LIVE_MUTATION_FEATURES = PROFILE_WIRE_FEATURES.CANDIDATE_WRITE
    | PROFILE_WIRE_FEATURES.PERSISTENT_COMMIT
    | PROFILE_WIRE_FEATURES.RUNTIME_ACTIVATION
    | PROFILE_WIRE_FEATURES.PEER_RECONCILIATION
    | PROFILE_WIRE_FEATURES.ATOMIC_LOGICAL_APPLY;
/** @param {Partial<Caps> | null | undefined} capabilities */
const hasCurrentLayers = capabilities => capabilities?.compiledLayerCount === LAYERS;

/** @param {Partial<Caps> | null | undefined} capabilities @returns {capabilities is Partial<Caps>} */
const canEdit = capabilities => hasCurrentLayers(capabilities)
    && ((capabilities?.supportedDomainMask || 0) & PROFILE_DOMAIN_MASK) === PROFILE_DOMAIN_MASK
    && knownActionAbi(capabilities?.actionAbiDigest ?? 0);

// This is the complete Apply's firmware gate, not the live status diagnostic.
/** @param {Partial<Caps> | null | undefined} capabilities */
const canApply = capabilities => canEdit(capabilities)
    && Boolean((capabilities.featureFlags || 0) & PROFILE_WIRE_FEATURES.ATOMIC_LOGICAL_APPLY);

/** @param {Partial<Caps> | null | undefined} capabilities @param {Partial<ViaIdentity> | null} [viaIdentity] */
const canRead = (capabilities, viaIdentity) => evaluateProfileCompatibility(capabilities, viaIdentity).compatible;

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
function canCapture(status, allowCandidate = false) {
    const active = status.activeKind === PROFILE_ACTIVE_KIND.COMMITTED || status.activeKind === PROFILE_ACTIVE_KIND.COMPILED_ONLY;
    return active && Boolean(status.stateFlags & PROFILE_STATE_FLAGS.PEER_CONVERGED) && canReadIdentity(status, allowCandidate);
}

/** @param {Pick<Status, "stateFlags">} status */
const identityStateFlags = status => status.stateFlags & ~PROFILE_STATE_FLAGS.CANDIDATE_PENDING;

// Independent device views keep their historical per-area gates. A failed
// domain prevents behaviours/pointing editing but does not close combos; a
// custom-key view does not acquire an extra layer-count requirement.
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
/** @param {Partial<Caps> | null | undefined} capabilities @param {Partial<ViaIdentity> | null} [viaIdentity] */
function evaluateProfileCompatibility(capabilities, viaIdentity = {}) {
    const checks = [
        equalityCheck("Protocol major", capabilities?.protocol?.major, SUPPORTED_PROFILE_PROTOCOL.major),
        equalityCheck("Schema major", capabilities?.schema?.major, SUPPORTED_PROFILE_SCHEMA.major),
        oneOfCheck("VIA protocol version", viaIdentity?.protocolVersion, VIA_READS.SUPPORTED_PROTOCOL_VERSIONS),
        equalityCheck("VIA firmware version", viaIdentity?.firmwareVersion, capabilities?.firmwareVersion),
        equalityCheck("Raw HID report size", capabilities?.reportSize, RAW_HID_REPORT_SIZE),
        minimumCheck("Status pages", capabilities?.statusPageCount, PROFILE_WIRE_V1.STATUS_PAGE_COUNT),
        maskCheck("Required Profile Wire features", capabilities?.featureFlags, PROFILE_WIRE_KNOWN_MASKS.REQUIRED_READ_FEATURES),
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

/** @param {string} label @param {number | undefined} actual @param {readonly number[]} accepted */
function oneOfCheck(label, actual, accepted) {
    const ok = accepted.includes(Number(actual));
    return {label, ok, actual, limit: accepted, message: ok ? "" : `${label} is ${actual}; Charybdis Ark supports ${accepted.join(" or ")}.`};
}

/** @param {string} label @param {number | undefined} actual @param {number} expected */
function minimumCheck(label, actual, expected) {
    const ok = typeof actual === "number" && Number.isInteger(actual) && actual >= expected;
    return {label, ok, actual, limit: expected, message: ok ? "" : `${label} is ${actual}; at least ${expected} is required.`};
}

/** @param {string} label @param {number | undefined} actual @param {number} expected */
function maskCheck(label, actual, expected) {
    const numeric = Number(actual) || 0;
    const ok = (numeric & expected) === expected;
    return {label, ok, actual: numeric, limit: expected, message: ok ? "" : `${label} mask 0x${numeric.toString(16)} does not include required mask 0x${expected.toString(16)}.`};
}

/** @param {Partial<Caps> | null | undefined} capabilities @param {Pick<ReturnType<typeof evaluateProfileCompatibility>, "compatible" | "reasons"> | null | undefined} compatibility @param {boolean} [connected] @param {Partial<Status> | null | undefined} [status] */
function evaluateLiveMutationCompatibility(capabilities, compatibility, connected = true, status) {
    const reasons = [];
    if (!connected) reasons.push("Connect to the keyboard before applying a live profile.");
    if (!compatibility?.compatible) reasons.push(...(compatibility?.reasons || ["Read compatibility has not been established."]));
    const flags = Number(capabilities?.featureFlags) || 0;
    if ((flags & REQUIRED_LIVE_MUTATION_FEATURES) !== REQUIRED_LIVE_MUTATION_FEATURES) {
        reasons.push(`Firmware mutation flags 0x${flags.toString(16)} do not include required persistent split apply mask 0x${REQUIRED_LIVE_MUTATION_FEATURES.toString(16)}.`);
    }
    if (!Number.isInteger(capabilities?.candidateChunkMax) || (capabilities?.candidateChunkMax ?? 0) < 1) {
        reasons.push("Firmware does not advertise a candidate upload chunk size.");
    }
    if (connected && !status) {
        reasons.push("Live profile status has not been read yet.");
    } else if (status && !status.peerKnown) {
        reasons.push("The second keyboard half has not been detected over the split link.");
    } else if (status && !status.peerConverged) {
        reasons.push("The two keyboard halves have not established a converged profile state yet.");
    }
    return {
        available: reasons.length === 0,
        reasons,
        requiredFeatureMask: REQUIRED_LIVE_MUTATION_FEATURES,
        peerReady: Boolean(status?.peerKnown && status?.peerConverged),
        recoveryPending: Boolean(status?.candidatePending),
    };
}


module.exports = {canRead, canEdit, canApply, hasCurrentLayers, editableDomains, canCapture,
    canReadIdentity, identityStateFlags, supportsCompleteProfile, requireReady,
    evaluateProfileCompatibility, evaluateLiveMutationCompatibility, PROFILE_DOMAIN_FLAGS,
    SUPPORTED_PROFILE_PROTOCOL, SUPPORTED_PROFILE_SCHEMA, REQUIRED_PROFILE_DOMAIN_MASK,
    REQUIRED_LIVE_MUTATION_FEATURES};
