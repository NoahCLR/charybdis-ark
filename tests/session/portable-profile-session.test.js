"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const {captureProfile, restoreProfile, fingerprint, validateSnapshot} = require("../../core/session/portable-profile-session");
const pd = require("../fixtures/pd-profile");
const {document32: document} = require("../fixtures/pd-slots-32");
const {changedRanges, viaStorageDigest, VIA_STORAGE} = require("../../core/protocol/via-storage-v1");
const {decodeProfileBlob, encodeProfileBlob, fnv1a32} = require("../../core/schema/profile-blob-v1");
const {encodeSettings} = require("../../core/schema/settings-domain-v1");
const {PROFILE_CANDIDATE_V1: C} = require("../../core/protocol/profile-candidate-v1");
const {LOGICAL_VIA_STAGE_V1: V} = require("../../core/protocol/logical-via-stage-v1");
const {PROFILE_WIRE_FEATURES: FEATURES} = require("../../core/protocol/profile-wire-v1");
const {fakeKeyboard} = require("../fixtures/fake-keyboard");
const {capabilities, fixture} = require("../fixtures/portable-restore");

const candidateMutations = f => f.keyboard.mutations.filter(r => [C.VALUE_BEGIN, C.VALUE_CHUNK, C.VALUE_STREAM_CHUNK, C.VALUE_VALIDATE, C.VALUE_COMMIT, C.VALUE_ABORT, C.VALUE_REUSE].includes(r[2]) && [7, 9].includes(r[0]));
const payloadReads = f => f.keyboard.requests.filter(r => r[0] === 8 && [4, 5, 6].includes(r[2]));
function assertTarget(f) {
    for (const bank of [f.keyboard.local, f.keyboard.peer]) {
        assert.deepEqual(bank.layout, f.target.layout);
        assert.deepEqual(bank.macros, f.target.macros);
        assert.equal(viaStorageDigest(bank), viaStorageDigest(f.target));
    }
    assert.deepEqual(f.keyboard.active, f.target.profile);
}
// The host's poll wait advances Date in timeout scenarios; the production
// coordinators and their firmware-aware budgets remain in use.
function stall(f, t, extra = {}) {
    t.mock.timers.enable({apis: ["Date"], now: 0});
    Object.assign(f.keyboard.faults, {stallCommit: true, ...extra});
    f.options.sleep = async () => t.mock.timers.tick(120000);
}

test("restore saves recovery first, restores both stores, then verifies complete readback", async () => {
    const f = fixture(), views = [];
    f.options.onApplyProgress = view => views.push(view);
    const result = await f.restore();
    assert.deepEqual([...new Set(views.map(view => view.current))], ["check", "backup", "upload", "validate", "stage", "peer", "converge", "local", "verify"]);
    assert.equal(views.at(-1).state, "done");
    assert.equal(result.fingerprint, fingerprint(f.targetDocument));
    assert.deepEqual({...result.performance, elapsedMs: 0}, {elapsedMs: 0, baseSource: "device-read", layoutBytes: 28, macroBytes: 28, viaConfigReports: 1, layoutReports: 3, macroReports: 3});
    assertTarget(f);
    assert.deepEqual(f.keyboard.events.filter(e => e !== "local write"), ["backup", "begin", "validated", "via begin", "via staged", "commit", "decision", "activated"]);
    const captured = await f.capture();
    assert.equal(captured.fingerprint, result.fingerprint, "a fresh capture sees the applied complete document");
});
test("restore uses the host's sleep for capture, leased identity, VIA staging, candidate and final storage waits", async () => {
    const f = fixture(), waits = [], delayed = new Set();
    let waiting;
    f.keyboard.faults.afterRequest = (r, response, keyboard) => {
        if (r[0] !== 8) return;
        if (r[2] === 8 && r[4] === 0) {
            const phase = keyboard.events.includes("activated") ? "verify" : keyboard.events.includes("begin") ? "identity" : "capture";
            if (!delayed.has(phase)) {response[8] = 1; waiting = phase; delayed.add(phase);}
        }
        if (r[2] === V.VALUE_STATUS && keyboard.events.includes("via begin") && !delayed.has("stage")) {
            response[10] = 1; waiting = "stage"; delayed.add("stage");
        }
    };
    f.options.sleep = async ms => {assert.ok(ms > 0); waits.push(waiting || "candidate"); waiting = undefined;};
    await f.restore();
    assert.deepEqual([...new Set(waits)], ["capture", "identity", "stage", "candidate", "verify"]);
    assertTarget(f);
});
test("restore verifies and reuses the reviewed snapshot without rereading its complete payload", async () => {
    const f = fixture(); f.options.baseSnapshot = await f.capture();
    f.keyboard.requests.length = 0;
    const result = await f.restore();
    assert.equal(payloadReads(f).length, 0);
    assert.equal(result.performance.baseSource, "verified-cache");
    assertTarget(f);
});
test("changed storage or settings identity rejects a cached recovery base before saving or staging", async () => {
    for (const changed of ["storage", "settings"]) {
        const f = fixture(); f.options.baseSnapshot = await f.capture();
        f.keyboard.faults.afterRequest = (r, response) => {
            if (r[0] !== 8) return;
            if (changed === "storage" && r[2] === 8 && r[4] === 0) {
                for (const offset of [9, 17, 25]) response.writeUInt32LE(5, offset);
            }
            // Change every settings byte read and both integrity fields, so
            // the read is valid but its identity differs from the review.
            if (changed === "settings" && r[2] === 7) {
                const settings = validateSnapshot(f.source).settings; settings.values[0]++;
                const bytes = encodeSettings(settings), page = r.readUInt16LE(4);
                if (page === 0) {
                    const {crc32, fnv1a32} = require("../../core/schema/profile-blob-v1");
                    response.writeUInt32LE(crc32(bytes), 11); response.writeUInt32LE(fnv1a32(bytes), 15);
                } else bytes.copy(response, 7, (page - 1) * 25, page * 25);
            }
        };
        await assert.rejects(f.restore(), error => error.code === "PROFILE_CHANGED" && error.step === "check" && error.saved === "none");
        assert.deepEqual(f.keyboard.mutations, []);
        assert.deepEqual(f.keyboard.events, []);
    }
});
test("stale review and failed recovery save perform no device mutations", async () => {
    const f = fixture(); f.options.expectedFingerprint = "stale";
    await assert.rejects(f.restore(), /changed/);
    f.options.expectedFingerprint = fingerprint(f.source); f.options.saveRecovery = async () => {throw Error("disk full");};
    await assert.rejects(f.restore(), /disk full/);
    assert.deepEqual(f.keyboard.mutations, []);
});
test("no recovery writer or an empty recovery path refuses without mutations", async () => {
    for (const saveRecovery of [undefined, async () => null]) {
        const f = fixture(); f.options.saveRecovery = saveRecovery;
        await assert.rejects(f.restore(), error => error.code === "RECOVERY_REQUIRED" && error.saved === "none");
        assert.deepEqual(f.keyboard.mutations, []);
    }
});
test("changes after acquiring the profile lease abort before staging or commit", async () => {
    const f = fixture();
    f.keyboard.faults.afterRequest = (r, response, keyboard) => {
        if (keyboard.events.includes("begin") && r[0] === 8 && r[2] === 8 && r[4] === 0) {
            for (const offset of [9, 17, 25]) response.writeUInt32LE(5, offset);
        }
    };
    await assert.rejects(f.restore(), /changed/);
    assert.deepEqual(candidateMutations(f).map(r => r[2]), [C.VALUE_BEGIN, C.VALUE_ABORT]);
    assert.equal(f.keyboard.events.includes("via begin"), false);
});
test("a staging failure before commit reports nothing saved and cancels the peer staging with the candidate", async () => {
    const f = fixture(); f.keyboard.faults.stageError = true;
    await assert.rejects(f.restore(), error => error.code === "RESTORE_NOT_SAVED" && error.step === "stage" && error.saved === "none"
        && /Nothing was saved/.test(error.message) && !error.message.includes("/recovery.json"));
    assert.equal(f.keyboard.events.includes("commit"), false);
    assert.equal(f.keyboard.events.at(-1), "aborted");
    assert.deepEqual(f.keyboard.active, Buffer.from(f.source.profile, "base64"));
});
test("a failure carries its real peer BUSY reason and the step where it happened", async t => {
    const f = fixture(), views = []; stall(f, t);
    f.options.onApplyProgress = view => views.push(view);
    await assert.rejects(f.restore(), error => error.code === "RESTORE_NOT_SAVED" && error.step === "peer"
        && error.stepLabel === "Copy the profile to the slave half" && error.reason === "The slave half stopped handling requests from the master half." && error.saved === "none");
    assert.equal(views.at(-1).state, "failed");
    assert.equal(views.at(-1).failure.step, "peer");
});
test("a sent commit the keyboard cancels is reported as not saved", async t => {
    const f = fixture(); stall(f, t);
    await assert.rejects(f.restore(), error => error.code === "RESTORE_NOT_SAVED" && /no observable progress/.test(error.message) && !/Unplug/.test(error.message));
    assert.equal(f.keyboard.durable, false);
    assert.equal(f.keyboard.events.at(-1), "aborted");
});
test("a sent commit without a confirmed cancel keeps its recovery file and unknown outcome", async t => {
    const f = fixture(); stall(f, t, {abortRejected: true});
    await assert.rejects(f.restore(), error => error.code === "RESTORE_INCOMPLETE" && error.saved === "unknown"
        && error.message.includes("/recovery.json") && !/finishes from the slave half's copy/.test(error.message));
    assert.equal(f.keyboard.events.at(-1), "abort refused");
});
test("a peer that never confirmed cancel adds restart guidance; an unreadable status loses only the hint", async t => {
    const f = fixture(); stall(f, t, {cleanupPending: true});
    await assert.rejects(f.restore(), error => error.code === "RESTORE_NOT_SAVED" && /Unplug the USB cable \(not the cable between the halves\)/.test(error.message));
    const g = fixture(); g.keyboard.faults.stallCommit = true;
    g.options.sleep = f.options.sleep;
    g.keyboard.faults.beforeRequest = (r, keyboard) => {if (keyboard.events.includes("aborted") && r[0] === 8 && r[2] === 2) throw Error("unreadable");};
    await assert.rejects(g.restore(), error => error.code === "RESTORE_NOT_SAVED" && !/Unplug/.test(error.message));
});
test("an active target with the peer out of sight is saved, but a wrong active digest still fails", async () => {
    const f = fixture(); f.keyboard.faults.peerUnseen = true;
    assert.equal((await f.restore()).peerUnseen, true); assertTarget(f);
    const g = fixture(); g.keyboard.faults.peerUnseen = true;
    g.keyboard.faults.afterRequest = (r, response, keyboard) => {
        if (keyboard.events.includes("activated") && r[0] === 8 && r[2] === 2 && r[4] === 0) response.writeUInt32LE(1, 19);
    };
    await assert.rejects(g.restore(), /did not confirm the imported profile/);
});
test("an observed decision followed by a local-write disconnect preserves the peer recovery copy", async () => {
    const f = fixture();
    f.keyboard.faults.beforeRequest = (r, keyboard) => {
        if (r[0] === VIA_STORAGE.LAYOUT_WRITE) {keyboard.faults.disconnected = true; throw Object.assign(Error("disconnected"), {code: "DISCONNECTED"});}
    };
    await assert.rejects(f.restore(), error => error.code === "RESTORE_INCOMPLETE" && error.saved === "unknown"
        && error.message.includes("/recovery.json") && /finishes from the slave half's copy/.test(error.message));
    assert.equal(f.keyboard.events.includes("aborted"), false);
    assert.deepEqual(f.keyboard.peer.macros, f.target.macros);
    delete f.keyboard.faults.beforeRequest; f.keyboard.recover(); assertTarget(f);
    assert.equal((await f.capture()).fingerprint, fingerprint(f.targetDocument));
});
test("an unobserved durable decision refuses abort and the keyboard finishes from the peer", async () => {
    const f = fixture(); f.keyboard.faults.disconnectAfterDecision = true;
    await assert.rejects(f.restore(), error => error.code === "RESTORE_INCOMPLETE" && error.message.includes("/recovery.json") && !/finishes from the slave half's copy/.test(error.message));
    assert.equal(f.keyboard.durable, true);
    f.keyboard.faults.disconnected = false;
    const {CandidateUploadCoordinator} = require("../../core/session/candidate-upload-coordinator");
    await assert.rejects(new CandidateUploadCoordinator(f.connection, {requestIds: f.ids, sleep: async () => {}}).abort(1));
    assert.equal(f.keyboard.events.at(-1), "abort refused");
    assert.deepEqual(f.keyboard.active, Buffer.from(f.source.profile, "base64"));
    f.keyboard.recover(); assertTarget(f);
});
test("lost replies retain an ambiguous upload lease and a sent commit is safe only after confirmed cancel", async () => {
    for (const value of [C.VALUE_CHUNK, C.VALUE_COMMIT]) {
        const f = fixture(); f.keyboard.faults.loseReply = value;
        if (value === C.VALUE_COMMIT) f.keyboard.faults.stallCommit = true;
        await assert.rejects(f.restore(), error => value === C.VALUE_CHUNK ? error.code === "TRANSPORT_OUTCOME_AMBIGUOUS"
            : error.code === "RESTORE_NOT_SAVED");
        if (value === C.VALUE_CHUNK) {
            assert.equal(f.keyboard.events.at(-1), "begin", "a lost acknowledgement is not proof the upload was cancelled");
            const {CandidateUploadCoordinator} = require("../../core/session/candidate-upload-coordinator");
            await new CandidateUploadCoordinator(f.connection, {requestIds: f.ids}).abort(1);
        }
        assert.equal(f.keyboard.events.at(-1), "aborted");
        assert.equal(f.keyboard.durable, false);
    }
});
test("BUSY candidate admission is retried through real status without duplicating accepted bytes", async () => {
    const f = fixture(); f.keyboard.faults.busy = C.VALUE_CHUNK;
    await f.restore(); assertTarget(f);
    const chunks = candidateMutations(f).filter(r => r[2] === C.VALUE_CHUNK);
    assert.equal(chunks[0].readUInt16LE(5), chunks[1].readUInt16LE(5));
    assert.equal(chunks.length, Math.ceil(f.target.profile.length / 20) + 1);
});
test("mismatching final changed-range readback fails verification", async () => {
    const f = fixture();
    f.keyboard.faults.afterRequest = (r, reply, keyboard) => {if (keyboard.events.includes("activated") && r[0] === VIA_STORAGE.LAYOUT_READ) reply[4] ^= 1;};
    await assert.rejects(f.restore(), error => error.code === "RESTORE_INCOMPLETE" && /readback/.test(error.message));
});
test("a change outside edited blocks fails whole-store verification", async () => {
    const f = fixture(); let statusReads = 0;
    f.keyboard.faults.afterRequest = (r, reply, keyboard) => {
        if (keyboard.events.includes("activated") && r[0] === 8 && r[2] === 8 && r[4] === 0 && ++statusReads === 2) {
            reply.writeUInt32LE(6, 9); reply.writeUInt32LE(6, 17);
        }
    };
    await assert.rejects(f.restore(), /did not confirm/);
});
test("recovery retries capture an incomplete bank and prove its repaired final byte", async () => {
    const f = fixture(); f.keyboard.local.macros[f.keyboard.local.macros.length - 1] = 1;
    f.keyboard.peer.macros[f.keyboard.peer.macros.length - 1] = 1;
    const snapshot = await f.capture(); assert.equal(snapshot.incomplete, true);
    f.options.expectedFingerprint = snapshot.fingerprint;
    f.options.saveRecovery = async doc => {assert.equal(doc.format, "charybdis-recovery-capture"); return "/interrupted.diagnostic.json";};
    await f.restore(); assertTarget(f);
    assert.equal(f.keyboard.mutations.filter(r => r[0] === VIA_STORAGE.MACRO_WRITE).at(-1)[4], 0);
});
test("a schema-1 backup and incompatible firmware are refused before any report", async () => {
    const f = fixture(), target = structuredClone(f.targetDocument), blob = Buffer.from(target.profile, "base64");
    blob[4] = 1; target.profile = blob.toString("base64"); target.version = 1;
    await assert.rejects(restoreProfile(f.connection, f.ids, capabilities, target, f.options), error => error.code === "INVALID_PORTABLE_PROFILE");
    for (const incompatible of [{...capabilities, compiledLayerCount: 5}, {...capabilities, supportedDomainMask: 15}, {...capabilities, actionAbiDigest: 0x1d3fcacc}]) {
        await assert.rejects(captureProfile(f.connection, f.ids, incompatible), {code: "FIRMWARE_UPDATE_REQUIRED"});
    }
    assert.deepEqual(f.keyboard.requests, []);
});

function withSetting(source) {
    const result = structuredClone(source), decoded = validateSnapshot(source); decoded.settings.values[0]++;
    const blob = decodeProfileBlob(decoded.profile);
    result.profile = encodeProfileBlob({schema: blob.schema, domains: blob.domains.map(domain => domain.id === 64 ? {...domain, payload: encodeSettings(decoded.settings)} : domain)}).toString("base64");
    return result;
}
const EDITS = {
    "layout-only": source => {const result = structuredClone(source); result.layers[0][0] ^= 1; return result;},
    "custom-only": withSetting,
    "imported macro": source => ({...structuredClone(source), macros: source.macros.map((slot, index) => index === 3 ? Buffer.from("imported").toString("base64") : slot)}),
};
for (const [name, source] of [["current", document], ["six configured slots", pd.document]]) {
    for (const [editName, edit] of Object.entries(EDITS)) {
        for (const cached of [false, true]) {
            test(`a ${editName} ${name} Apply from a ${cached ? "cached" : "fresh"} read clears stale macro tail bytes`, async () => {
                const f = fixture({source: source()});
                f.targetDocument = edit(f.source); f.target = validateSnapshot(f.targetDocument);
                const staleOffset = f.keyboard.local.macros.length - 20;
                f.keyboard.local.macros[staleOffset] = 65; f.keyboard.peer.macros[staleOffset] = 65;
                const raw = Buffer.from(f.keyboard.local.macros);
                if (cached) f.options.baseSnapshot = await f.capture();
                f.keyboard.requests.length = 0;
                const result = await restoreProfile(f.connection, f.ids, capabilities, f.targetDocument, f.options);
                assert.equal(payloadReads(f).length > 0, !cached);
                assertTarget(f);
                const stale = changedRanges(raw, f.target.macros, {end: raw.length - 1});
                assert.ok(stale.some(range => range.offset <= staleOffset && range.offset + range.bytes.length > staleOffset));
                assert.equal(result.performance.macroBytes, stale.reduce((sum, range) => sum + range.bytes.length, 0));
                assert.deepEqual(result.storage.macros, f.target.macros);
                assert.equal(result.document.macros.length, 128);
            });
        }
    }
}
test("a cached read without its stored bank is captured again", async () => {
    const f = fixture(); f.options.baseSnapshot = {...await f.capture(), storage: undefined}; f.keyboard.requests.length = 0;
    const result = await f.restore(); assert.equal(result.performance.baseSource, "device-read"); assert.ok(payloadReads(f).length > 0); assertTarget(f);
});
test("a malformed stored bank read refuses before any write", async () => {
    const f = fixture();
    f.keyboard.faults.afterRequest = (r, reply) => {if (r[0] === VIA_STORAGE.MACRO_READ) reply[3] ^= 1;};
    await assert.rejects(f.restore(), error => error.code === "VIA_STORAGE_INVALID" && error.saved === "none");
    assert.deepEqual(f.keyboard.mutations, []);
});
// Current firmware's compiled profile (GET 0x05) carries all five domains,
// with its authored combos and immutable factory settings. A capture takes
// lighting, behaviours and pointing from the running profile and combos and
// settings from their live readbacks, so the factory pair never stands in for
// what the keyboard runs, and no domain appears twice.
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
    assert.deepEqual(keyboard.unhandled.map(r => [r[0], r[1], r[2], r[4]]), [[8, 0, 0x0c, 0]], "only the optional macro read map is unsupported");
});

test("a complete fresh capture uses sparse macros without changing the backup or held bank", async () => {
    const source = backup32(), keyboard = fakeKeyboard({document: source, streaming: true, macroReadMap: true});
    const {connection, ids} = wired(keyboard);
    const captured = await captureProfile(connection, ids, {...captureCapabilities, viaMacroBytes: 34903, featureFlags: captureCapabilities.featureFlags | (1 << 27)});
    assert.equal(captured.fingerprint, fingerprint(source));
    assert.deepEqual(captured.document.macros, source.macros);
    assert.equal(captured.storage.macros.length, 34903);
    assert.ok(keyboard.requests.filter(r => r[0] === 0x0e).length < 100, "macro transfer follows occupied storage");
    assert.deepEqual(keyboard.unhandled, []);
});

test("clean nonzero VIA layout options retain complete capture through full-read fallback", async () => {
    const source = backup32(), keyboard = fakeKeyboard({document: source});
    const held = validateSnapshot(source);
    // Independent canonical storage digest for config [valid, options] = [1,1].
    const frame = (id, bytes) => [id, bytes.length & 255, bytes.length >>> 8, ...bytes];
    const digest = [...frame(1, [1, 1]), ...frame(2, held.layout), ...frame(3, []), ...frame(4, held.macros)]
        .reduce((hash, byte) => Math.imul((hash ^ byte) >>> 0, 16777619) >>> 0, 2166136261);
    const {connection, ids} = wired(keyboard), request = connection.request;
    connection.request = async report => {
        if (report[0] === 8 && report[2] === 0x0c) {
            const response = Buffer.from(report); response.fill(0, 5); response[5] = 3; return response;
        }
        const response = await request(report);
        if (report[0] === 8 && report[2] === 8 && report[4] === 0) {
            response.writeUInt32LE(digest, 13); response.writeUInt32LE(digest, 21);
        }
        return response;
    };
    const captured = await captureProfile(connection, ids, captureCapabilities);
    assert.equal(captured.fingerprint, fingerprint(source));
    assert.equal(captured.identity.storageDigest, digest);
    assert.deepEqual(captured.storage.macros, held.macros);
    assert.equal(keyboard.requests.filter(r => r[0] === 0x0e).length, 369);
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


test("Apply negotiates real transfer extensions from committed and compiled base sources", async () => {
    for (const compiledOnly of [false, true]) for (const extensions of [0, FEATURES.CANDIDATE_REUSE | FEATURES.CANDIDATE_STREAM]) {
        const f = fixture({compiledOnly}); f.options.baseSnapshot = await f.capture();
        const caps = {...capabilities, featureFlags: capabilities.featureFlags | extensions};
        await restoreProfile(f.connection, f.ids, caps, f.targetDocument, f.options);
        const values = candidateMutations(f).map(r => r[2]);
        assert.equal(values.includes(C.VALUE_REUSE), Boolean(extensions));
        assert.equal(values.includes(C.VALUE_CHUNK), !extensions);
        // A layout/macro edit leaves every custom byte reusable, so force a
        // custom edit separately to exercise streaming chunks as well.
        assertTarget(f);
        if (extensions) {
            const reuse = candidateMutations(f).find(r => r[2] === C.VALUE_REUSE);
            assert.equal(reuse[23], compiledOnly ? 0 : 1);
            assert.equal(reuse[24], compiledOnly ? 255 : 0);
        }
    }
    const f = fixture(), target = withSetting(f.source); f.options.baseSnapshot = await f.capture();
    await restoreProfile(f.connection, f.ids, {...capabilities, featureFlags: capabilities.featureFlags | FEATURES.CANDIDATE_REUSE | FEATURES.CANDIDATE_STREAM}, target, f.options);
    assert.ok(candidateMutations(f).some(r => r[2] === C.VALUE_STREAM_CHUNK));
});
test("raw custom bytes that differ from the reviewed active identity fall back to full transfer", async () => {
    const f = fixture(), snapshot = await f.capture(); snapshot.storage.profile[10] ^= 1; f.options.baseSnapshot = snapshot;
    await restoreProfile(f.connection, f.ids, {...capabilities, featureFlags: capabilities.featureFlags | FEATURES.CANDIDATE_REUSE}, f.targetDocument, f.options);
    assert.equal(candidateMutations(f).some(r => r[2] === C.VALUE_REUSE), false); assertTarget(f);
});
