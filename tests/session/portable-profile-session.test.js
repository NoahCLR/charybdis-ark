"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const {captureProfile, restoreProfile, fingerprint, summary, validateSnapshot} = require("../../core/session/portable-profile-session");
const pd = require("../fixtures/pd-profile");
const {document32: document} = require("../fixtures/pd-slots-32");
const {ACTION_ABI} = require("../../core/schema/actions");
const {changedRanges, viaStorageDigest} = require("../../core/protocol/via-storage-v1");
const {decodeProfileBlob, encodeProfileBlob, fnv1a32} = require("../../core/schema/profile-blob-v1");
const {encodeSettings} = require("../../core/schema/settings-domain-v1");
const {capabilities, fixture} = require("../fixtures/portable-restore");
test("restore saves recovery first, restores both stores, then verifies complete readback", async () => {
    const f = fixture(), views = [];
    f.options.onApplyProgress = view => views.push(view);
    const result = await restoreProfile({}, {}, capabilities, f.targetDocument, f.options);
    const reached = [...new Set(views.map(view => view.current))];
    assert.deepEqual(reached, ["check", "backup", "upload", "stage", "peer", "converge", "local", "verify"],
        "each boundary the fake coordinators pass through is reported, in order");
    assert.equal(views.at(-1).state, "done");
    assert.equal(result.fingerprint, fingerprint(f.targetDocument));
    assert.deepEqual({...result.performance, elapsedMs: 0}, {elapsedMs: 0, baseSource: "device-read", layoutBytes: 28, macroBytes: 28, viaConfigReports: 1, layoutReports: 3, macroReports: 3});
    assert.deepEqual(f.events, ["backup", "stage", "via stage", "commit", "via accepted", "local roll-forward", "both halves"]);
});
test("restore hands the host's sleep to every wait on the way", async () => {
    const f = fixture(), sleep = async () => {}, seen = [];
    const {createCoordinator, createViaCoordinator, waitStorage, readIdentity, capture} = f.operations;
    Object.assign(f.operations, {
        createCoordinator: (connection, options) => {seen.push(["upload", options.sleep]); return createCoordinator(connection, options);},
        createViaCoordinator: (connection, options) => {seen.push(["via", options.sleep]); return createViaCoordinator(connection, options);},
        waitStorage: (connection, ids, options) => {seen.push(["storage", options?.sleep]); return waitStorage(connection, ids, options);},
        readIdentity: (connection, ids, options) => {seen.push(["identity", options?.sleep]); return readIdentity(connection, ids, options);},
        capture: (...args) => {seen.push(["capture", args[6]?.sleep]); return capture(...args);},
    });
    await restoreProfile({}, {}, capabilities, f.targetDocument, {...f.options, sleep});
    assert.deepEqual(seen.map(([name]) => name), ["capture", "upload", "via", "identity", "storage"]);
    assert.ok(seen.every(([, given]) => given === sleep), "each wait is given the host's sleep");
});
test("restore verifies and reuses the reviewed snapshot without rereading its complete payload", async () => {
    const f = fixture();
    let captures = 0, identityReads = 0;
    f.operations.capture = async () => {captures++; throw Error("must not capture");};
    f.operations.readIdentity = async () => {identityReads++; return f.identity;};
    f.options.baseSnapshot = {document: f.source, fingerprint: fingerprint(f.source), summary: summary(f.source), identity: f.identity, storage: f.storage};
    const result = await restoreProfile({}, {}, capabilities, f.targetDocument, f.options);
    assert.equal(captures, 0);
    assert.equal(identityReads, 2);
    assert.equal(result.performance.baseSource, "verified-cache");
    assert.deepEqual(f.events, ["backup", "stage", "via stage", "commit", "via accepted", "local roll-forward", "both halves"]);
});
test("a changed device identity rejects a cached recovery base before saving or staging", async () => {
    const f = fixture();
    f.options.baseSnapshot = {document: f.source, fingerprint: fingerprint(f.source), summary: summary(f.source), identity: f.identity, storage: f.storage};
    f.operations.readIdentity = async () => ({...f.identity, storageGeneration: f.identity.storageGeneration + 1});
    await assert.rejects(restoreProfile({}, {}, capabilities, f.targetDocument, f.options), /changed/);
    assert.deepEqual(f.events, []);
});
test("stale review and failed recovery save perform no device mutations", async () => {
    const f = fixture(); f.options.expectedFingerprint = "stale";
    await assert.rejects(restoreProfile({}, {}, capabilities, f.targetDocument, f.options), /changed/); assert.deepEqual(f.events, []);
    f.options.expectedFingerprint = fingerprint(f.source); f.options.saveRecovery = async () => {throw Error("disk full");};
    await assert.rejects(restoreProfile({}, {}, capabilities, f.targetDocument, f.options), /disk full/); assert.deepEqual(f.events, []);
});
test("changes after acquiring the profile lease prevent commit", async () => {
    const f = fixture();
    f.operations.readIdentity = async () => ({...f.identity, storageDigest: 99});
    await assert.rejects(restoreProfile({}, {}, capabilities, f.targetDocument, f.options), /changed/);
    assert.deepEqual(f.events, ["backup", "stage"]);
});
test("a failure before the commit is sent reports that nothing was saved, not a recovery import", async () => {
    const f = fixture(); f.operations.createViaCoordinator = () => ({stage: async () => {throw Error("disconnected");}, abort: async () => {}});
    await assert.rejects(restoreProfile({}, {}, capabilities, f.targetDocument, f.options), error => error.code === "RESTORE_NOT_SAVED"
        && /Nothing was saved/.test(error.message) && error.message.includes("disconnected") && !error.message.includes("/recovery.json"));
    assert.deepEqual(f.events, ["backup", "stage"]);
});
// The coordinator for a commit that was sent and then stopped answering, as
// on 2026-09-23. Its abort resolves only when the keyboard returns to idle.
function stalledCommit(f, {abortConfirmed}) {
    f.operations.createCoordinator = () => ({
        upload: async (bytes, options) => {f.events.push("stage"); await options.verifyBase(); return {transactionId: 1, metadata: {digest: 42}};},
        commit: async () => {f.events.push("commit"); throw Object.assign(Error("Candidate commit made no observable progress within its firmware-aware wait window."), {code: "COMMIT_OUTCOME_AMBIGUOUS"});},
        abort: async () => {f.events.push("abort"); if (!abortConfirmed) throw Object.assign(Error("could not cancel"), {code: "ABORT_FAILED"}); return {transactionId: 1, status: {state: 0}};},
    });
}
test("a failure carries the step it happened in, why, and what was saved", async () => {
    const f = fixture(), views = [];
    f.options.onApplyProgress = view => views.push(view);
    f.operations.createCoordinator = () => ({
        upload: async (bytes, options) => {await options.verifyBase(); return {transactionId: 1, metadata: {digest: 42}};},
        commit: async () => {throw Object.assign(Error("Candidate commit made no observable progress."), {code: "COMMIT_OUTCOME_AMBIGUOUS", progress: {peer: {lastStatusName: "BUSY"}}});},
        abort: async () => ({transactionId: 1, status: {state: 0}}),
    });
    await assert.rejects(restoreProfile({}, {}, capabilities, f.targetDocument, f.options), error => error.code === "RESTORE_NOT_SAVED"
        && error.step === "peer" && error.stepLabel === "Copy the profile to the slave half"
        && error.reason === "The slave half kept answering that it was busy." && error.saved === "none");
    assert.equal(views.at(-1).state, "failed");
    assert.equal(views.at(-1).failure.step, "peer");

    const early = fixture();
    early.operations.readIdentity = async () => ({...early.identity, storageDigest: 99});
    early.options.baseSnapshot = {document: early.source, fingerprint: fingerprint(early.source), summary: summary(early.source), identity: early.identity, storage: early.storage};
    await assert.rejects(restoreProfile({}, {}, capabilities, early.targetDocument, early.options), error => error.code === "PROFILE_CHANGED"
        && error.step === "check" && error.saved === "none", "a refusal before the upload changed nothing");
});
test("a sent commit the keyboard then cancels is reported as not saved", async () => {
    const f = fixture(); stalledCommit(f, {abortConfirmed: true});
    await assert.rejects(restoreProfile({}, {}, capabilities, f.targetDocument, f.options), error => error.code === "RESTORE_NOT_SAVED"
        && /Nothing was saved/.test(error.message) && /no observable progress/.test(error.message) && !/Unplug/.test(error.message));
    assert.deepEqual(f.events, ["backup", "stage", "via stage", "commit", "abort"], "the keyboard cancels the staged keys and macros with the candidate");
});
test("a sent commit the keyboard never confirms cancelling stays an interrupted restore with its recovery file", async () => {
    const f = fixture(); stalledCommit(f, {abortConfirmed: false});
    await assert.rejects(restoreProfile({}, {}, capabilities, f.targetDocument, f.options), error => error.code === "RESTORE_INCOMPLETE" && error.message.includes("/recovery.json")
        && !/finishes from the slave half's copy/.test(error.message), "no decision was seen, so the keyboard may not finish it");
});
test("a peer that never confirmed the cancel adds restart guidance", async () => {
    const f = fixture(); stalledCommit(f, {abortConfirmed: true});
    f.operations.readProfile = async () => ({peerCleanupPending: true});
    await assert.rejects(restoreProfile({}, {}, capabilities, f.targetDocument, f.options), error => error.code === "RESTORE_NOT_SAVED"
        && /Unplug the USB cable \(not the cable between the halves\)/.test(error.message));
    f.operations.readProfile = async () => {throw Error("unreadable");};
    await assert.rejects(restoreProfile({}, {}, capabilities, f.targetDocument, f.options), error => error.code === "RESTORE_NOT_SAVED" && !/Unplug/.test(error.message),
        "an unreadable status only loses the hint");
});
test("an active target with the slave half out of sight is a completed save, reported as such", async () => {
    const f = fixture();
    const read = f.operations.readProfile;
    f.operations.readProfile = async () => ({...await read(), stateFlags: 0});
    const result = await restoreProfile({}, {}, capabilities, f.targetDocument, f.options);
    assert.equal(result.peerUnseen, true, "the keyboard switched only after the slave half confirmed");
    f.operations.readProfile = read;
    assert.equal((await restoreProfile({}, {}, capabilities, f.targetDocument, f.options)).peerUnseen, false);
    // The slave half being out of sight never excuses a wrong active profile.
    f.operations.readProfile = async () => ({...await read(), stateFlags: 0, activeDigest: 1});
    await assert.rejects(restoreProfile({}, {}, capabilities, f.targetDocument, f.options), /did not confirm the imported profile/);
});
test("a post-decision local-write interruption preserves the peer recovery copy", async () => {
    const f = fixture();
    f.operations.rollForwardLocal = async () => {f.events.push("local roll-forward"); throw Error("disconnected");};
    await assert.rejects(restoreProfile({}, {}, capabilities, f.targetDocument, f.options), error => error.code === "RESTORE_INCOMPLETE" && error.message.includes("/recovery.json")
        && /finishes from the slave half's copy/.test(error.message), "after the decision the keyboard finishes the save itself");
    assert.deepEqual(f.events, ["backup", "stage", "via stage", "commit", "via accepted", "local roll-forward"]);
});
test("mismatching final hardware readback fails verification", async () => {
    const f = fixture(); f.operations.readStored = async () => Buffer.alloc(1);
    await assert.rejects(restoreProfile({}, {}, capabilities, f.targetDocument, f.options), /readback/);
});
test("a concurrent change outside the edited blocks fails whole-store verification", async () => {
    const f = fixture();
    f.operations.readStorage = async () => ({ready: true, generation: 8, digest: viaStorageDigest(f.target) + 1});
    await assert.rejects(restoreProfile({}, {}, capabilities, f.targetDocument, f.options), /confirm/);
});
test("recovery retries allow an incomplete base and prove the repaired target", async () => {
    const f = fixture();
    f.operations.capture = async (connection, ids, caps, progress, candidate, allowIncomplete) => {
        assert.equal(allowIncomplete, true);
        const base = validateSnapshot(f.source);
        return {document: {format: "charybdis-recovery-capture", version: 1, keyboard: "charybdis-4x6", actionAbiDigest: capabilities.actionAbiDigest,
            profile: base.profile.toString("base64"), layout: base.layout.toString("base64"), macros: base.macros.toString("base64")}, incomplete: true, fingerprint: "interrupted", summary: null, identity: f.identity};
    };
    f.options.expectedFingerprint = "interrupted";
    f.options.saveRecovery = async value => {assert.equal(value.format, "charybdis-recovery-capture"); return "/interrupted.diagnostic.json";};
    const restored = await restoreProfile({}, {}, capabilities, f.targetDocument, f.options);
    assert.equal(restored.fingerprint, fingerprint(f.targetDocument));
});
test("a schema-1 profile is refused before recovery, staging or device reads", async () => {
    const f = fixture(), target = structuredClone(f.targetDocument);
    const blob = Buffer.from(target.profile, "base64"); blob[4] = 1;
    target.profile = blob.toString("base64"); target.version = 1;
    f.operations.capture = async () => {throw Error("must not read the keyboard");};
    await assert.rejects(restoreProfile({}, {}, capabilities, target, f.options),
        error => error.code === "INVALID_PORTABLE_PROFILE" && /older firmware/.test(error.message));
    assert.deepEqual(f.events, []);
});
test("older firmware is rejected before any device read or write", async () => {
    const connection = {request: () => {throw Error("must not access device");}};
    for (const incompatible of [
        {...capabilities, compiledLayerCount: 5},
        {...capabilities, supportedDomainMask: 15},
        {...capabilities, actionAbiDigest: 0x1d3fcacc},
    ]) await assert.rejects(captureProfile(connection, {}, incompatible), {code: "FIRMWARE_UPDATE_REQUIRED"});
});
// The commit marker became durable, then a status read failed before the app
// saw CONVERGING_PEER. The app asks the keyboard to cancel, which the keyboard
// refuses after its decision; it never cancels the slave half's staged keys
// and macros itself, which are then the recovery copy the keyboard finishes from.
test("an unobserved decision is left to the keyboard to finish", async () => {
    const f = fixture();
    let durable = false;
    f.operations.createCoordinator = () => ({
        upload: async (bytes, options) => {await options.verifyBase(); return {transactionId: 1, metadata: {digest: 42}};},
        commit: async () => {durable = true; throw Object.assign(Error("Candidate status could not be decoded."), {code: "TRANSPORT_OUTCOME_AMBIGUOUS"});},
        abort: async () => {assert.equal(durable, true); f.events.push("abort refused"); throw Object.assign(Error("invalid state"), {code: "ABORT_FAILED"});},
    });
    await assert.rejects(restoreProfile({}, {}, capabilities, f.targetDocument, f.options), error => error.code === "RESTORE_INCOMPLETE" && error.message.includes("/recovery.json"));
    assert.deepEqual(f.events, ["backup", "via stage", "abort refused"]);
});

// A valid bank whose bytes after the 64th macro are not zero, as a writer
// that shortened the macros leaves it. The document cannot carry those bytes.
function tailedBank(source) {
    const held = validateSnapshot(source), macros = Buffer.from(held.macros);
    macros[macros.length - 20] = 0x41;
    return {layout: Buffer.from(held.layout), macros};
}
function withSetting(source) {
    const result = structuredClone(source), decoded = validateSnapshot(source);
    decoded.settings.values[0] += 1;
    const blob = decodeProfileBlob(decoded.profile);
    result.profile = encodeProfileBlob({schema: blob.schema, domains: blob.domains.map(domain => domain.id === 64 ? {...domain, payload: encodeSettings(decoded.settings)} : domain)}).toString("base64");
    return result;
}
const EDITS = {
    "layout-only": source => {const result = structuredClone(source); result.layers[0][0] ^= 1; return result;},
    "custom-only": withSetting,
    "imported macro": source => ({...JSON.parse(JSON.stringify(source)), macros: source.macros.map((slot, index) => index === 3 ? Buffer.from("imported").toString("base64") : slot)}),
};
const FIXTURES = {
    current: {document, capabilities},
    "six configured slots": {document: pd.document, capabilities: {...capabilities, actionAbiDigest: pd.document().actionAbiDigest}},
};
// Both banks start as the keyboard holds them; the fakes apply exactly the
// ranges the session hands over, the way the staging coordinator and the
// local VIA writes compare them, and report the whole-bank digest.
function transfer(fixtureName, editName, {cached = false} = {}) {
    const {document: make, capabilities: caps} = FIXTURES[fixtureName];
    const source = make(), targetDocument = EDITS[editName](source), target = validateSnapshot(targetDocument, caps);
    const raw = tailedBank(source), peer = {layout: Buffer.from(raw.layout), macros: Buffer.from(raw.macros)}, local = {layout: Buffer.from(raw.layout), macros: Buffer.from(raw.macros)};
    const identity = {profile: "base", storageGeneration: 4, storageDigest: viaStorageDigest(raw), settingsCrc: 6, settingsDigest: 7};
    const events = [], digest = viaStorageDigest(target);
    const apply = (bank, ranges, region) => ranges.forEach(range => range.bytes.copy(bank[region], range.offset));
    const snapshot = {document: source, fingerprint: fingerprint(source), summary: summary(source), identity, storage: raw};
    const operations = {
        capture: async () => {events.push("capture"); return snapshot;}, readIdentity: async () => identity, readCandidate: async () => ({state: 0}),
        createCoordinator: () => ({upload: async (bytes, options) => {await options.verifyBase(); return {transactionId: 1, metadata: {digest: 42}};}, commit: async (id, options) => {await options.afterDecision();}}),
        createViaCoordinator: () => ({
            stage: async ({target: staged, current}) => {for (const region of ["layout", "macros"]) apply(peer, changedRanges(current[region], staged[region]), region);},
            waitUntilAccepted: async () => {},
        }),
        rollForwardLocal: async (connection, staged, base, layoutRanges) => {
            apply(local, layoutRanges, "layout");
            apply(local, changedRanges(base.macros, staged.macros, {end: staged.macros.length - 1}), "macros");
            events.push("local");
        },
        waitStorage: async () => ({ready: true, generation: 5, digest: viaStorageDigest(local)}),
        readStorage: async () => ({ready: true, generation: 5, digest: viaStorageDigest(peer) === viaStorageDigest(local) ? viaStorageDigest(local) : 0}),
        readStored: async (connection, command, length, options = {}) => (command === 0x12 ? local.layout : local.macros).subarray(options.startOffset || 0, (options.startOffset || 0) + length),
        readProfile: async () => ({activeKind: 1, activeDigest: fnv1a32(target.profile), committedDigest: fnv1a32(target.profile), stateFlags: 32, conflictCount: 0}),
    };
    const options = {operations, expectedFingerprint: fingerprint(source), saveRecovery: async () => "/recovery.json", ...(cached ? {baseSnapshot: snapshot} : {})};
    return {caps, targetDocument, target, raw, peer, local, digest, events, options, snapshot};
}
for (const fixtureName of Object.keys(FIXTURES)) {
    for (const editName of Object.keys(EDITS)) {
        for (const cached of [false, true]) {
            test(`a ${editName} ${fixtureName} Apply from a ${cached ? "cached" : "fresh"} read clears stale bytes after the macros`, async () => {
                const t = transfer(fixtureName, editName, {cached});
                const result = await restoreProfile({}, {}, t.caps, t.targetDocument, t.options);
                assert.equal(t.events.includes("capture"), !cached);
                for (const bank of [t.peer, t.local]) {
                    assert.ok(bank.layout.equals(t.target.layout) && bank.macros.equals(t.target.macros), "the stored bank is exactly the target");
                    assert.equal(viaStorageDigest(bank), t.digest);
                }
                const stale = changedRanges(t.raw.macros, t.target.macros, {end: t.target.macros.length - 1});
                assert.ok(stale.some(range => range.offset <= t.raw.macros.length - 20 && range.offset + range.bytes.length > t.raw.macros.length - 20), "the stale bytes are written");
                assert.equal(result.performance.macroBytes, stale.reduce((sum, range) => sum + range.bytes.length, 0), "and nothing that already matches");
                assert.ok(result.storage.macros.equals(t.target.macros), "the result keeps the bank it proved, for the next Apply");
                assert.equal(result.document.macros.length, 128, "the document stays canonical");
            });
        }
    }
}
test("a cached read of the same keyboard without its stored bank is read again", async () => {
    const t = transfer("current", "layout-only", {cached: true});
    t.options.baseSnapshot = {...t.snapshot, storage: undefined};
    await restoreProfile({}, {}, t.caps, t.targetDocument, t.options);
    assert.deepEqual(t.events, ["capture", "local"]);
    assert.ok(t.peer.macros.equals(t.target.macros));
});
test("a cached bank for a keyboard that changed since is never compared against", async () => {
    const t = transfer("current", "layout-only", {cached: true});
    t.options.operations.readIdentity = async () => ({...t.snapshot.identity, storageDigest: t.snapshot.identity.storageDigest + 1});
    await assert.rejects(restoreProfile({}, {}, t.caps, t.targetDocument, t.options), error => error.code === "PROFILE_CHANGED");
    assert.ok(t.peer.macros.equals(t.raw.macros) && t.local.macros.equals(t.raw.macros), "nothing was written");
});
test("a read that lost its stored bank refuses before anything is sent", async () => {
    const t = transfer("current", "layout-only");
    t.options.operations.capture = async () => ({...t.snapshot, storage: undefined});
    await assert.rejects(restoreProfile({}, {}, t.caps, t.targetDocument, t.options), error => error.code === "BASE_STORAGE_UNAVAILABLE" && error.saved === "none");
    assert.ok(t.peer.macros.equals(t.raw.macros));
});

// Current firmware's compiled profile (GET 0x05) carries all five domains,
// with its authored combos and immutable factory settings. A capture takes
// lighting, behaviours and pointing from the running profile and combos and
// settings from their live readbacks, so the factory pair never stands in for
// what the keyboard runs, and no domain appears twice.
const {fakeKeyboard} = require("../fixtures/fake-keyboard");
const {backup32, CAPABILITIES_32} = require("../fixtures/pd-slots-32");
const {settings: currentSettings} = require("../fixtures/portable-profile");
const {encodeComboDomain} = require("../../core/schema/combo-domain-v1");
const {decodeSettings} = require("../../core/schema/settings-domain-v1");
const captureCapabilities = {...CAPABILITIES_32, featureFlags: 1 << 12, candidateChunkMax: 20, viaMacroBytes: 10327};
function wired(keyboard) {
    let id = 0;
    return {connection: {request: async (report) => keyboard.answer(report)[0]}, ids: {next: () => (id = id % 255 + 1)}};
}
function factoryProfile(source) {
    const factory = currentSettings(); factory.values[0] = 1600; factory.names[1] = "Factory";
    const combos = {version: 3, defaultTermMs: 40, holdTermMs: 180, rows: [{inputs: [6, 7].map(operand => ({kind: 1, operand, flags: 0})), output: {kind: 1, operand: 9, flags: 0}, termMs: null, mustHold: false, mustTap: true, ordered: false}]};
    const blob = decodeProfileBlob(Buffer.from(source.profile, "base64"));
    return encodeProfileBlob({schema: blob.schema, domains: blob.domains.map(domain => domain.id === 0x40 ? {...domain, payload: encodeSettings(factory)}
        : domain.id === 0x30 ? {...domain, payload: encodeComboDomain(combos)} : domain)});
}
for (const compiledOnly of [false, true]) {
    test(`a capture ${compiledOnly ? "of a keyboard running its defaults" : "of a committed profile"} keeps the live combos and settings beside a five-domain compiled read`, async () => {
        const source = backup32(), compiled = factoryProfile(source);
        assert.deepEqual(decodeProfileBlob(compiled).domains.map(domain => domain.id), [16, 32, 48, 64, 80], "the compiled read has every domain");
        const keyboard = fakeKeyboard({document: source, compiled, compiledOnly});
        const {connection, ids} = wired(keyboard);
        const captured = await captureProfile(connection, ids, captureCapabilities);
        const reads = new Set(keyboard.requests.filter(r => r[0] === 0x08 && r[1] === 0).map(r => r[2]));
        assert.ok(reads.has(0x05) && reads.has(0x06) && reads.has(0x07), "the compiled, combo and settings reads all ran");
        assert.equal(reads.has(0x04), !compiledOnly);
        const domains = decodeProfileBlob(Buffer.from(captured.document.profile, "base64")).domains;
        assert.deepEqual(domains.map(domain => domain.id), [16, 32, 48, 64, 80], "each domain once, in registry order");
        const live = validateSnapshot(source);
        assert.deepEqual(decodeSettings(domains[3].payload), live.settings, "the live settings, not the factory ones");
        assert.notEqual(decodeSettings(domains[3].payload).values[0], 1600);
        assert.ok(domains[2].payload.equals(decodeProfileBlob(live.profile).domains[2].payload), "the live combos, not the authored defaults");
        assert.equal(captured.fingerprint, fingerprint(source), "the export is the keyboard's effective profile");
    });
}

test("a capture never reads the retired PD page, even from firmware that still advertises bit 13", async () => {
    const source = backup32(), keyboard = fakeKeyboard({document: source});
    const {connection, ids} = wired(keyboard);
    const captured = await captureProfile(connection, ids, {...captureCapabilities, featureFlags: (1 << 12) | (1 << 13)});
    assert.equal(keyboard.requests.some(r => r[0] === 0x08 && r[1] === 0 && r[2] === 0x09), false, "no GET 0x09");
    assert.equal(Object.hasOwn(captured.document, "pdModeSource"), false, "no pointing-mode source is written");
    assert.deepEqual(keyboard.unhandled, []);
});

test("complete capture preserves Unicode bank bytes and still rejects legacy destinations", async () => {
    const source = backup32();
    const text = ' café “hello” 🙂 e\u0301 👩‍💻 ';
    source.macros[0] = Buffer.from(text).toString('base64');
    const keyboard = fakeKeyboard({document:source});
    const {connection, ids} = wired(keyboard);
    const captured = await captureProfile(connection, ids, {...captureCapabilities, featureFlags:captureCapabilities.featureFlags | (1 << 21)});
    assert.deepEqual(captured.document.macros, source.macros);
    assert.equal(captured.fingerprint, fingerprint(source));
    assert.equal(Buffer.from(captured.document.macros[0], 'base64').toString('utf8'), text);
    assert.throws(() => validateSnapshot(captured.document, captureCapabilities), /ASCII/);
    assert.deepEqual(keyboard.mutations, []);
    const malformed = structuredClone(source);
    malformed.macros[0] = Buffer.from([0xc0,0xaf]).toString('base64');
    assert.throws(() => validateSnapshot(malformed), /UTF-8/);
});

test("Apply negotiates transfer extensions and uses the raw stored profile as its source", async () => {
    const {PROFILE_WIRE_FEATURES} = require("../../core/protocol/profile-wire-v1");
    const {crc32} = require("../../core/schema/profile-blob-v1");
    for (const extensions of [0, PROFILE_WIRE_FEATURES.CANDIDATE_REUSE | PROFILE_WIRE_FEATURES.CANDIDATE_STREAM]) {
        const f = fixture(), raw = Buffer.from(f.source.profile, "base64");
        f.options.baseSnapshot = {document: f.source, fingerprint: fingerprint(f.source), identity: f.identity,
            status: {activeKind: 1, activeGeneration: 3, activeDigest: fnv1a32(raw), activeOriginHalf: 0},
            storage: {...f.storage, profile: raw}};
        const factory = f.operations.createCoordinator;
        let given;
        f.operations.createCoordinator = (connection, options) => {
            const coordinator = factory(connection, options), upload = coordinator.upload;
            coordinator.upload = async (bytes, options) => {given = options; return upload(bytes, options);};
            return coordinator;
        };
        await restoreProfile({}, {}, {...capabilities, featureFlags: capabilities.featureFlags | extensions}, f.targetDocument, f.options);
        assert.equal(given.streamChunks, Boolean(extensions));
        if (extensions) {
            assert.deepEqual(given.baseSource, {bytes: raw, kind: 1, generation: 3, digest: fnv1a32(raw), crc32: crc32(raw), origin: 0});
        } else assert.equal(given.baseSource, undefined);
    }
});
test("a raw custom source that does not match its active identity falls back to full transfer", async () => {
    const {PROFILE_WIRE_FEATURES} = require("../../core/protocol/profile-wire-v1");
    const f = fixture(), raw = Buffer.from(f.source.profile, "base64");
    f.options.baseSnapshot = {document: f.source, fingerprint: fingerprint(f.source), identity: f.identity,
        status: {activeKind: 1, activeGeneration: 3, activeDigest: fnv1a32(raw) ^ 1, activeOriginHalf: 0}, storage: {...f.storage, profile: raw}};
    const factory = f.operations.createCoordinator;
    f.operations.createCoordinator = (connection, options) => {
        const coordinator = factory(connection, options), upload = coordinator.upload;
        coordinator.upload = async (bytes, options) => {assert.equal(options.baseSource, undefined); return upload(bytes, options);}; return coordinator;
    };
    await restoreProfile({}, {}, {...capabilities, featureFlags: capabilities.featureFlags | PROFILE_WIRE_FEATURES.CANDIDATE_REUSE}, f.targetDocument, f.options);
});
