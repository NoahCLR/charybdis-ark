"use strict";
const assert = require("node:assert/strict");
const {document32: document} = require("./pd-slots-32");
const {ACTION_ABI} = require("../../core/schema/actions");
const {fingerprint, summary, validateSnapshot} = require("../../core/model/portable-profile");
const {viaStorageDigest} = require("../../core/protocol/via-storage-v1");
// Current firmware: schema 2.0 with every domain, the 32-slot vocabulary.
const capabilities = {compiledLayerCount: 16, supportedDomainMask: 31, featureFlags: 1 << 12, actionAbiDigest: ACTION_ABI, candidateChunkMax: 20, viaMacroBytes: 10327};
function fixture() {
    const source = document(), targetDocument = structuredClone(source), events = [];
    targetDocument.layers[0][0] ^= 1; targetDocument.macros[0] = Buffer.from("hello").toString("base64");
    const target = validateSnapshot(targetDocument), identity = {profile: "base", storageGeneration: 4, storageDigest: 5, settingsCrc: 6, settingsDigest: 7};
    const held = validateSnapshot(source), storage = {layout: held.layout, macros: held.macros};
    const capture = async () => ({document: source, fingerprint: fingerprint(source), summary: summary(source), identity, storage});
    const storageDigest = viaStorageDigest(target);
    const operations = {capture, readIdentity: async () => identity, readCandidate: async () => ({state: 0}),
        createCoordinator: () => ({upload: async (bytes, options) => {events.push("stage"); await options.verifyBase(); return {transactionId: 1, metadata: {digest: 42}};}, commit: async (id, options) => {events.push("commit"); await options.afterDecision();}}),
        createViaCoordinator: () => ({stage: async options => {events.push("via stage"); assert.equal(options.generation, 5); assert.equal(options.digest, storageDigest);}, waitUntilAccepted: async () => {events.push("via accepted");}, abort: async () => {events.push("via abort");}}),
        rollForwardLocal: async (connection, actualTarget, base, layoutRanges, macroRanges) => {events.push("local roll-forward"); assert.equal(actualTarget.profile.equals(target.profile), true); assert.equal(layoutRanges.length, 1); assert.equal(macroRanges.length, 1);},
        waitStorage: async () => {events.push("both halves"); return {ready: true, generation: 5, digest: storageDigest};},
        readStorage: async () => ({ready: true, generation: 5, digest: storageDigest}),
        readStored: async (connection, command, length, options = {}) => (command === 0x12 ? target.layout : target.macros).subarray(options.startOffset || 0, (options.startOffset || 0) + length),
        readProfile: async () => ({activeKind: 1, activeDigest: require("../../core/schema/profile-blob-v1").fnv1a32(target.profile), committedDigest: require("../../core/schema/profile-blob-v1").fnv1a32(target.profile), stateFlags: 32, conflictCount: 0})};
    const options = {operations, expectedFingerprint: fingerprint(source), saveRecovery: async backup => {assert.equal(fingerprint(backup), fingerprint(source)); events.push("backup"); return "/recovery.json";}};
    return {source, targetDocument, target, identity, storage, events, operations, options};
}
module.exports = {capabilities, fixture};
