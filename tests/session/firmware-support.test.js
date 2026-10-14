// @ts-check
"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const support = require("../../core/session/firmware-support");
const {PROFILE_DOMAINS, PROFILE_DOMAIN_MASK, PROFILE_WIRE_DOMAINS: DOMAINS} = require("../../core/schema/profile-domains");
const {PROFILE_WIRE_FEATURES: FEATURES, PROFILE_STATE_FLAGS: FLAGS, PROFILE_ACTIVE_KIND: KIND} = require("../../core/protocol/profile-wire-v1");
const {capabilities} = require("../fixtures/portable-restore");

const READ_FEATURES = FEATURES.READ_SURFACE | FEATURES.STORAGE_LAYOUT | FEATURES.RGB_SCHEMA | FEATURES.KEY_BEHAVIOR_SCHEMA;
const via = {protocolVersion: 12, firmwareVersion: capabilities.firmwareVersion};
const complete = {...capabilities, supportedDomainMask: PROFILE_DOMAIN_MASK};
const read = {...complete, featureFlags: READ_FEATURES, supportedDomainMask: DOMAINS.RGB | DOMAINS.KEY_BEHAVIORS};

test("independent reads accept the reported capacities without acquiring the complete-document gate", () => {
    const partial = {...read, compiledLayerCount: 8, actionAbiDigest: 0, candidateChunkMax: 0,
        schema: {major: read.schema.major, minor: 99}, protocol: {major: read.protocol.major, minor: 99}};
    for (const protocolVersion of [12, 13]) assert.equal(support.canRead(partial, {...via, protocolVersion}), true);
    assert.equal(support.canEdit(partial), false);
    assert.equal(support.canApply(partial), false);
    for (const feature of [FEATURES.READ_SURFACE, FEATURES.STORAGE_LAYOUT, FEATURES.RGB_SCHEMA, FEATURES.KEY_BEHAVIOR_SCHEMA]) {
        assert.equal(support.canRead({...partial, featureFlags: READ_FEATURES & ~feature}, via), false);
    }
    for (const domain of [DOMAINS.RGB, DOMAINS.KEY_BEHAVIORS]) {
        assert.equal(support.canRead({...partial, supportedDomainMask: partial.supportedDomainMask & ~domain}, via), false);
    }
});

test("complete editing pins every registered domain, current layers and the known ABI", () => {
    assert.equal(support.canEdit({...complete, featureFlags: 0}), true, "read or mutation features are not added to this gate");
    for (const domain of PROFILE_DOMAINS) {
        assert.equal(support.canEdit({...complete, supportedDomainMask: PROFILE_DOMAIN_MASK & ~domain.wireBit}), false, domain.key);
    }
    for (const compiledLayerCount of [0, 8, 15, 17]) {
        assert.equal(support.hasCurrentLayers({...complete, compiledLayerCount}), false);
        assert.equal(support.canEdit({...complete, compiledLayerCount}), false);
    }
    assert.equal(support.canEdit({...complete, actionAbiDigest: 0}), false);
    for (const absent of [null, undefined, {}]) {
        assert.equal(support.canEdit(absent), false);
        assert.equal(support.canApply(absent), false);
        assert.equal(support.hasCurrentLayers(absent), false);
    }
});

test("complete Apply adds exactly the atomic firmware requirement and keeps its refusal stable", () => {
    assert.equal(support.canApply({...complete, featureFlags: 0}), false);
    assert.equal(support.canApply({...complete, featureFlags: FEATURES.ATOMIC_LOGICAL_APPLY | FEATURES.LIGHTING_RULES}), true);
    assert.doesNotThrow(() => support.requireReady({...complete, featureFlags: 0}));
    assert.throws(() => support.requireReady({...complete, featureFlags: 0}, true), {
        code: "FIRMWARE_UPDATE_REQUIRED",
        message: "Complete profile backup and Apply need current firmware on both halves. Your current keyboard configuration has not been changed.",
    });
    assert.throws(() => support.requireReady({...complete, supportedDomainMask: DOMAINS.RGB}), {code: "FIRMWARE_UPDATE_REQUIRED"});
});

test("independent editor gates keep partial-read, busy and per-view behavior", () => {
    const views = {macroView: {}, settingsView: {}, customKeyView: {}};
    const state = {capabilities: complete, committed: {state: "read"}, ...views};
    const all = {busy: false, behaviors: true, pointing: true, combos: true, macros: true, settings: true, customKeys: true};
    assert.deepEqual(support.editableDomains(state), all);
    assert.deepEqual(support.editableDomains({...state, busy: true}), {
        busy: true, behaviors: false, pointing: false, combos: false, macros: false, settings: false, customKeys: false,
    });
    assert.deepEqual(support.editableDomains({...state, committed: {state: "read", failures: [{domainId: 16, message: "bad"}]}}),
        {...all, behaviors: false, pointing: false});
    assert.deepEqual(support.editableDomains({...state, capabilities: {...complete, compiledLayerCount: 8}}),
        {...all, macros: false, settings: false});
    assert.deepEqual(support.editableDomains({...state, committed: null, macroView: null, settingsView: null}),
        {...all, behaviors: false, pointing: false, combos: false, macros: false, settings: false});
    for (const [domain, area] of [[DOMAINS.KEY_BEHAVIORS, "behaviors"], [DOMAINS.PD_MODES, "pointing"], [DOMAINS.COMBOS, "combos"]]) {
        assert.deepEqual(support.editableDomains({...state, capabilities: {...complete, supportedDomainMask: PROFILE_DOMAIN_MASK & ~domain}}),
            {...all, [area]: false});
    }
});

test("capture and identity reads retain the lease, active-profile, conflict and convergence distinctions", () => {
    const stable = {stateFlags: FLAGS.PEER_CONVERGED, conflictCount: 0, activeKind: KIND.COMMITTED};
    for (const activeKind of [KIND.COMMITTED, KIND.COMPILED_ONLY]) assert.equal(support.canCapture({...stable, activeKind}), true);
    for (const activeKind of [KIND.PREVIEW, KIND.PENDING]) assert.equal(support.canCapture({...stable, activeKind}), false);
    assert.equal(support.canCapture({...stable, stateFlags: FLAGS.PEER_KNOWN}), false);
    assert.equal(support.canReadIdentity({...stable, stateFlags: 0}), true, "identity read does not acquire a convergence gate");
    const leased = {...stable, stateFlags: stable.stateFlags | FLAGS.CANDIDATE_PENDING};
    assert.equal(support.canCapture(leased), false);
    assert.equal(support.canCapture(leased, true), true);
    assert.equal(support.canReadIdentity(leased), true);
    assert.equal(support.canReadIdentity(leased, false), false);
    for (const blocked of [{...stable, stateFlags: stable.stateFlags | FLAGS.PREVIEW_ACTIVE}, {...stable, conflictCount: 1}]) {
        for (const allowCandidate of [true, false]) {
            assert.equal(support.canCapture(blocked, allowCandidate), false);
            assert.equal(support.canReadIdentity(blocked, allowCandidate), false);
        }
    }
    assert.equal(support.identityStateFlags(leased), FLAGS.PEER_CONVERGED);
    for (const flag of Object.values(FLAGS).filter(flag => flag !== FLAGS.CANDIDATE_PENDING)) {
        assert.equal(support.identityStateFlags({stateFlags: flag | FLAGS.CANDIDATE_PENDING}), flag);
    }
});

test("read diagnostic reasons and their order stay stable", () => {
    const result = support.evaluateProfileCompatibility({}, null);
    assert.deepEqual(result.reasons, [
        "Protocol major is undefined; Charybdis Ark requires 1.",
        "Schema major is undefined; Charybdis Ark requires 3.",
        "VIA protocol version is undefined; Charybdis Ark supports 12 or 13.",
        "VIA firmware version is undefined; Charybdis Ark requires undefined.",
        "Raw HID report size is undefined; Charybdis Ark requires 32.",
        "Status pages is undefined; at least 2 is required.",
        "Required Profile Wire features mask 0x0 does not include required mask 0xf.",
        "Required profile domains mask 0x0 does not include required mask 0x3.",
    ]);
});

test("live mutation readiness keeps its additional transfer and peer diagnostic gate", () => {
    const compatible = {compatible: true, reasons: []};
    const status = {peerKnown: true, peerConverged: true, candidatePending: true};
    const caps = {...complete, featureFlags: support.REQUIRED_LIVE_MUTATION_FEATURES, candidateChunkMax: 20};
    assert.deepEqual(support.evaluateLiveMutationCompatibility(caps, compatible, true, status), {
        available: true, reasons: [], requiredFeatureMask: support.REQUIRED_LIVE_MUTATION_FEATURES, peerReady: true, recoveryPending: true,
    });
    for (const feature of [FEATURES.CANDIDATE_WRITE, FEATURES.PERSISTENT_COMMIT, FEATURES.RUNTIME_ACTIVATION,
        FEATURES.PEER_RECONCILIATION, FEATURES.ATOMIC_LOGICAL_APPLY]) {
        assert.equal(support.evaluateLiveMutationCompatibility({...caps, featureFlags: caps.featureFlags & ~feature}, compatible, true, status).available, false);
    }
    assert.deepEqual(support.evaluateLiveMutationCompatibility({featureFlags: 0, candidateChunkMax: 0}, {compatible: false, reasons: ["earlier read failure"]}, false).reasons, [
        "Connect to the keyboard before applying a live profile.", "earlier read failure",
        "Firmware mutation flags 0x0 do not include required persistent split apply mask 0x1360.",
        "Firmware does not advertise a candidate upload chunk size.",
    ]);
    assert.equal(support.evaluateLiveMutationCompatibility(caps, compatible, true).reasons.at(-1), "Live profile status has not been read yet.");
    assert.equal(support.evaluateLiveMutationCompatibility(caps, compatible, true, {...status, peerKnown: false}).reasons.at(-1),
        "The slave half has not been detected over the cable between the halves.");
    assert.equal(support.evaluateLiveMutationCompatibility(caps, compatible, true, {...status, peerConverged: false}).reasons.at(-1),
        "The two keyboard halves have not established a converged profile state yet.");
});

test("legacy portable and service entry points reexport the single support implementation", () => {
    const portable = require("../../core/session/portable-profile-session");
    const service = require("../../core/session/profile-device-service");
    assert.equal(portable.requireReady, support.requireReady);
    assert.equal(portable.supportsCompleteProfile, support.canEdit);
    for (const name of ["evaluateProfileCompatibility", "evaluateLiveMutationCompatibility", "SUPPORTED_PROFILE_SCHEMA",
        "SUPPORTED_PROFILE_PROTOCOL", "PROFILE_DOMAIN_FLAGS", "REQUIRED_PROFILE_DOMAIN_MASK", "REQUIRED_LIVE_MUTATION_FEATURES"]) {
        assert.equal(service[name], support[name], name);
    }
});
