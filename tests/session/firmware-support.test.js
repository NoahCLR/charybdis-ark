// @ts-check
"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const support = require("../../core/session/firmware-support");
const {PROFILE_DOMAINS, PROFILE_DOMAIN_MASK, PROFILE_WIRE_DOMAINS: DOMAINS} = require("../../core/schema/profile-domains");
const {PROFILE_WIRE_FEATURES: FEATURES, PROFILE_WIRE_KNOWN_MASKS: MASKS, PROFILE_STATE_FLAGS: FLAGS, PROFILE_ACTIVE_KIND: KIND} = require("../../core/protocol/profile-wire-v1");
const {capabilities} = require("../fixtures/portable-restore");

// The feature word's bits, one at a time. Bit 31 included: written 2 ** bit,
// since 1 << 31 is negative.
const bits = mask => Array.from({length: 32}, (_, bit) => 2 ** bit).filter(bit => mask & bit);
const MUTATION = MASKS.CURRENT_MUTATION_FEATURES;
const complete = {...capabilities, supportedDomainMask: PROFILE_DOMAIN_MASK, featureFlags: MASKS.CURRENT_PAIR_FEATURES};
const read = {...complete, featureFlags: 0, supportedDomainMask: DOMAINS.RGB | DOMAINS.KEY_BEHAVIORS};
// Earlier and later bases: Profile Wire 1 with schema 3, and either version
// off by one in its major or its minor (D-L64).
const otherBases = [
    {protocol: {major: 1, minor: 0}, schema: {major: 3, minor: 0}},
    {protocol: {major: 2, minor: 1}}, {protocol: {major: 3, minor: 0}}, {protocol: {major: 1, minor: 0}},
    {schema: {major: 4, minor: 2}}, {schema: {major: 4, minor: 4}}, {schema: {major: 5, minor: 0}}, {schema: {major: 3, minor: 0}},
];

test("reads accept reported capacities and require the exact current base", () => {
    assert.deepEqual(support.SUPPORTED_PROFILE_PROTOCOL, {major: 2, minor: 0});
    assert.deepEqual(support.SUPPORTED_PROFILE_SCHEMA, {major: 4, minor: 3});
    const partial = {...read, compiledLayerCount: 8, actionAbiDigest: 0, candidateChunkMax: 0};
    assert.equal(support.canRead(partial), true, "no feature bit is needed to read");
    assert.equal(support.canEdit(partial), false);
    assert.equal(support.canApply(partial), false);
    for (const base of otherBases) assert.equal(support.canRead({...partial, ...base}), false, JSON.stringify(base));
    for (const domain of [DOMAINS.RGB, DOMAINS.KEY_BEHAVIORS]) {
        assert.equal(support.canRead({...partial, supportedDomainMask: partial.supportedDomainMask & ~domain}), false);
    }
});

test("complete editing pins the exact base, every registered domain, current layers and the known ABI", () => {
    assert.equal(support.canEdit({...complete, featureFlags: 0}), true, "no feature bit is added to this gate");
    assert.equal(support.isCurrentBase(complete), true);
    for (const base of otherBases) {
        assert.equal(support.isCurrentBase({...complete, ...base}), false, JSON.stringify(base));
        assert.equal(support.canEdit({...complete, ...base}), false, JSON.stringify(base));
    }
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

test("complete Apply adds a split build that saves and keeps its refusal stable", () => {
    assert.equal(MUTATION, FEATURES.SPLIT_KEYBOARD | FEATURES.SAVES);
    assert.equal(support.canApply({...complete, featureFlags: FEATURES.POINTING}), false);
    assert.equal(support.canApply({...complete, featureFlags: MUTATION}), true, "pointing is a build difference, not an Apply need");
    for (const feature of bits(MUTATION)) assert.equal(support.canApply({...complete, featureFlags: MUTATION & ~feature}), false, feature.toString(16));
    assert.doesNotThrow(() => support.requireReady({...complete, featureFlags: 0}));
    assert.throws(() => support.requireReady({...complete, featureFlags: 0}, true), {
        code: "FIRMWARE_UPDATE_REQUIRED",
        message: "Complete profile backups and saving need current firmware on both halves. Your keyboard's profile has not been changed.",
    });
    assert.throws(() => support.requireReady({...complete, supportedDomainMask: DOMAINS.RGB}), {code: "FIRMWARE_UPDATE_REQUIRED"});
    assert.throws(() => support.requireReady({...complete, ...otherBases[0]}), {code: "FIRMWARE_UPDATE_REQUIRED"});
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

test("snapshot and identity reads retain the lease, active-profile, conflict and convergence distinctions", () => {
    const stable = {stateFlags: FLAGS.PEER_CONVERGED, conflictCount: 0, activeKind: KIND.COMMITTED};
    for (const activeKind of [KIND.COMMITTED, KIND.COMPILED_ONLY]) assert.equal(support.canSnapshot({...stable, activeKind}), true);
    for (const activeKind of [KIND.PREVIEW, KIND.PENDING]) assert.equal(support.canSnapshot({...stable, activeKind}), false);
    assert.equal(support.canSnapshot({...stable, stateFlags: FLAGS.PEER_KNOWN}), false);
    assert.equal(support.canReadIdentity({...stable, stateFlags: 0}), true, "identity read does not acquire a convergence gate");
    const leased = {...stable, stateFlags: stable.stateFlags | FLAGS.CANDIDATE_PENDING};
    assert.equal(support.canSnapshot(leased), false);
    assert.equal(support.canSnapshot(leased, true), true);
    assert.equal(support.canReadIdentity(leased), true);
    assert.equal(support.canReadIdentity(leased, false), false);
    for (const blocked of [{...stable, stateFlags: stable.stateFlags | FLAGS.PREVIEW_ACTIVE}, {...stable, conflictCount: 1}]) {
        for (const allowCandidate of [true, false]) {
            assert.equal(support.canSnapshot(blocked, allowCandidate), false);
            assert.equal(support.canReadIdentity(blocked, allowCandidate), false);
        }
    }
    assert.equal(support.identityStateFlags(leased), FLAGS.PEER_CONVERGED);
    for (const flag of Object.values(FLAGS).filter(flag => flag !== FLAGS.CANDIDATE_PENDING)) {
        assert.equal(support.identityStateFlags({stateFlags: flag | FLAGS.CANDIDATE_PENDING}), flag);
    }
});

test("read diagnostic reasons and their order stay stable", () => {
    const result = support.evaluateProfileCompatibility({});
    assert.deepEqual(result.reasons, [
        "Profile Wire version is undefined.undefined; Charybdis Ark requires 2.0. Update both halves.",
        "Profile schema is undefined.undefined; Charybdis Ark requires 4.3. Update both halves.",
        "Raw HID report size is undefined; Charybdis Ark requires 32.",
        "Status pages is undefined; at least 2 is required.",
        "Required profile domains mask 0x0 does not include required mask 0x3.",
    ]);
    assert.deepEqual(support.evaluateProfileCompatibility({...complete, ...otherBases[0]}).reasons, [
        "Profile Wire version is 1.0; Charybdis Ark requires 2.0. Update both halves.",
        "Profile schema is 3.0; Charybdis Ark requires 4.3. Update both halves.",
    ]);
});

test("live mutation readiness keeps its additional transfer and slave-half diagnostic gate", () => {
    const compatible = {compatible: true, reasons: []};
    const status = {slaveKnown: true, slaveConverged: true, candidatePending: true};
    const caps = {...complete, featureFlags: support.REQUIRED_LIVE_MUTATION_FEATURES, candidateChunkMax: 20};
    assert.deepEqual(support.evaluateLiveMutationCompatibility(caps, compatible, true, status), {
        available: true, reasons: [], requiredFeatureMask: support.REQUIRED_LIVE_MUTATION_FEATURES, slaveReady: true, recoveryPending: true,
    });
    for (const feature of [FEATURES.SPLIT_KEYBOARD, FEATURES.SAVES]) {
        assert.equal(support.evaluateLiveMutationCompatibility({...caps, featureFlags: caps.featureFlags & ~feature}, compatible, true, status).available, false);
    }
    assert.deepEqual(support.evaluateLiveMutationCompatibility({featureFlags: 0, candidateChunkMax: 0}, {compatible: false, reasons: ["earlier read failure"]}, false).reasons, [
        "Connect to the keyboard before sending it edits.", "earlier read failure",
        `Firmware features 0x0 do not include a split build that saves (0x${MUTATION.toString(16)}).`,
        "Firmware does not advertise a candidate upload chunk size.",
    ]);
    assert.equal(support.evaluateLiveMutationCompatibility(caps, compatible, true).reasons.at(-1), "Live profile status has not been read yet.");
    assert.equal(support.evaluateLiveMutationCompatibility(caps, compatible, true, {...status, slaveKnown: false}).reasons.at(-1),
        "The slave half has not been detected over the cable between the halves.");
    assert.equal(support.evaluateLiveMutationCompatibility(caps, compatible, true, {...status, slaveConverged: false}).reasons.at(-1),
        "The two keyboard halves have not established a converged profile state yet.");
});

test("the support names have one home: neither the portable session nor the device service reexports them", () => {
    const portable = require("../../core/session/portable-profile-session");
    const service = require("../../core/session/profile-device-service");
    // The support names are imported from firmware-support.js, their one home.
    for (const name of ["requireReady", "canEdit", "evaluateProfileCompatibility", "evaluateLiveMutationCompatibility", "SUPPORTED_PROFILE_SCHEMA",
        "SUPPORTED_PROFILE_PROTOCOL", "PROFILE_DOMAIN_FLAGS", "REQUIRED_PROFILE_DOMAIN_MASK", "REQUIRED_LIVE_MUTATION_FEATURES"]) {
        assert.notEqual(support[name], undefined, name);
        assert.equal(name in portable, false, name);
        assert.equal(name in service, false, name);
    }
});

test("firmwareView says what the firmware reports about itself and its ceilings, nothing it does not", () => {
    assert.equal(support.firmwareView(null), null);
    const view = support.firmwareView({...complete, firmwareVersion: 0x00010203, compiledDefaultDigest: 0xabc});
    assert.equal(view?.version, "1.2.3");
    assert.equal(view?.versionWord, "0x00010203");
    assert.equal(view?.defaultsDigest, "0x00000ABC");
    assert.equal(view?.worksWithArk, true);
    assert.equal(view?.layers, complete.compiledLayerCount);
    assert.equal(view?.tapCounts, complete.maxTapStepsPerBehavior);
    assert.equal(view?.repeatHz, 100);
    const old = support.firmwareView({...complete, featureFlags: 0, firmwareVersion: 0, physicalLedCount: undefined});
    assert.equal(old?.worksWithArk, false);
    assert.equal(old?.version, null, "no version is said rather than 0.0.0");
    assert.equal(old?.leds, null);
});
