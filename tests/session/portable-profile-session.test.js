"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const {captureProfile, restoreProfile, fingerprint, validateSnapshot} = require("../../core/session/portable-profile-session");
const {decodeProfileBlob, encodeProfileBlob, crc32, fnv1a32} = require("../../core/schema/profile-blob-v1");
const {encodeSettings} = require("../../core/schema/settings-domain-v1");
const {PROFILE_CANDIDATE_V1: C, CANDIDATE_ERROR: E} = require("../../core/protocol/profile-candidate-v1");
const {CandidateUploadCoordinator} = require("../../core/session/candidate-upload-coordinator");
const {fakeKeyboard} = require("../fixtures/fake-keyboard");
const {capabilities, fixture} = require("../fixtures/portable-restore");
const {document32: document, backup32, CAPABILITIES_32} = require("../fixtures/pd-slots-32");
const {profileMacros, editLayers, editMacros} = require("../fixtures/profile-document");
const candidateMutations = f => f.keyboard.mutations.filter(r => [7, 9].includes(r[0]));
const payloadReads = f => f.keyboard.requests.filter(r => r[0] === 8 && [4, 5, 6].includes(r[2]));
function assertTarget(f) {
    assert.deepEqual(f.keyboard.local.profile, f.target.candidate);
    assert.deepEqual(f.keyboard.peer.profile, f.target.candidate);
    assert.deepEqual(f.keyboard.active, f.target.candidate);
    assert.ok(f.keyboard.mutations.every(r => [7, 9].includes(r[0]) && r[1] === 0 &&
        [C.VALUE_BEGIN, C.VALUE_STREAM_CHUNK, C.VALUE_CHUNK, C.VALUE_REUSE, C.VALUE_VALIDATE, C.VALUE_COMMIT, C.VALUE_ABORT].includes(r[2])), "only Profile Wire candidate commands are written");
    assert.ok(f.keyboard.requests.every(r => ![0x01, 0x02, 0x0c, 0x0e, 0x11, 0x12].includes(r[0])), "no VIA reads");
}
function stall(f, t, extra = {}) {
    t.mock.timers.enable({apis: ["Date"], now: 0});
    Object.assign(f.keyboard.faults, {stallCommit: true, ...extra});
    f.options.sleep = async () => t.mock.timers.tick(120000);
}
async function fullUpload(f) {
    const captured = await f.capture(); delete captured.storage; f.options.baseSnapshot = captured;
}
test("restore saves recovery first, uploads one candidate and verifies one generation on both halves", async () => {
    const f = fixture(), views = [];
    f.options.onApplyProgress = view => views.push(view);
    const result = await f.restore();
    assert.deepEqual([...new Set(views.map(view => view.current))], ["check", "backup", "upload", "validate", "peer", "converge", "verify"]);
    assert.equal(views.at(-1).state, "done");
    assert.equal(result.fingerprint, fingerprint(f.targetDocument));
    assert.deepEqual({...result.performance, elapsedMs: 0}, {elapsedMs: 0, baseSource: "device-read", profileBytes: f.target.candidate.length});
    assert.equal(result.status.activeGeneration, 5);
    assert.equal(result.status.committedGeneration, 5);
    assert.equal(result.status.peerGeneration, 5);
    assert.equal(result.status.lastCommittedTransactionId, 1);
    assertTarget(f);
    assert.deepEqual(f.keyboard.events, ["backup", "begin", "validated", "commit", "decision", "activated"]);
    assert.equal((await f.capture()).fingerprint, result.fingerprint);
});
test("restore uses the host's sleep for candidate polling", async () => {
    const f = fixture(), waits = [];
    f.options.sleep = async ms => {assert.ok(ms > 0); waits.push(ms);};
    await f.restore(); assert.ok(waits.length > 0); assertTarget(f);
});
test("restore verifies and reuses the reviewed capture without rereading payload bytes", async () => {
    const f = fixture(); f.options.baseSnapshot = await f.capture(); f.keyboard.requests.length = 0;
    const result = await f.restore();
    assert.equal(payloadReads(f).length, 0); assert.equal(result.performance.baseSource, "verified-cache"); assertTarget(f);
});
test("a changed profile or settings identity rejects the cached base before recovery and writes", async () => {
    for (const changed of ["profile", "settings"]) {
        const f = fixture(); f.options.baseSnapshot = await f.capture();
        f.keyboard.faults.afterRequest = (r, response) => {
            if (r[0] !== 8) return;
            if (changed === "profile" && r[2] === 2 && r.readUInt16LE(4) === 1) response.writeUInt32LE(5, 7);
            if (changed === "settings" && r[2] === 7) {
                const settings = validateSnapshot(f.source).settings; settings.values[0]++;
                const bytes = encodeSettings(settings), page = r.readUInt16LE(4);
                if (!page) {response.writeUInt32LE(crc32(bytes), 11); response.writeUInt32LE(fnv1a32(bytes), 15);}
                else bytes.copy(response, 7, (page - 1) * 25, page * 25);
            }
        };
        await assert.rejects(f.restore(), error => error.code === "PROFILE_CHANGED" && error.step === "check" && error.saved === "none");
        assert.deepEqual(f.keyboard.mutations, []); assert.deepEqual(f.keyboard.events, []);
    }
});
test("stale review and failed recovery save perform no device mutations", async () => {
    const f = fixture(); f.options.expectedFingerprint = "stale";
    await assert.rejects(f.restore(), /changed/);
    f.options.expectedFingerprint = fingerprint(f.source); f.options.saveRecovery = async () => {throw Error("disk full");};
    await assert.rejects(f.restore(), /disk full/); assert.deepEqual(f.keyboard.mutations, []);
});
test("no recovery writer or an empty recovery path refuses without mutations", async () => {
    for (const saveRecovery of [undefined, async () => null]) {
        const f = fixture(); f.options.saveRecovery = saveRecovery;
        await assert.rejects(f.restore(), error => error.code === "RECOVERY_REQUIRED" && error.saved === "none");
        assert.deepEqual(f.keyboard.mutations, []);
    }
});
test("changes after acquiring the lease abort before bytes or commit", async () => {
    const f = fixture();
    f.keyboard.faults.afterRequest = (r, response, keyboard) => {
        if (keyboard.events.includes("begin") && r[0] === 8 && r[2] === 2 && r.readUInt16LE(4) === 1) response.writeUInt32LE(5, 7);
    };
    await assert.rejects(f.restore(), /changed/);
    assert.deepEqual(candidateMutations(f).map(r => r[2]), [C.VALUE_BEGIN, C.VALUE_ABORT]);
    assert.deepEqual(f.keyboard.active, validateSnapshot(f.source).candidate);
});
test("validation refusal cancels the candidate before commit and leaves the old generation", async () => {
    const f = fixture();
    f.keyboard.faults.afterRequest = (r, response) => {if (r[0] === 7 && r[2] === C.VALUE_VALIDATE) {response[5] = 4; response[6] = E.INVALID_STATE;}};
    await assert.rejects(f.restore());
    assert.equal(f.keyboard.events.includes("commit"), false);
    assert.equal(f.keyboard.events.at(-1), "aborted");
    assert.deepEqual(f.keyboard.active, validateSnapshot(f.source).candidate);
});
test("a failure carries its real peer BUSY reason and the step where it happened", async t => {
    const f = fixture(), views = []; stall(f, t); f.options.onApplyProgress = view => views.push(view);
    await assert.rejects(f.restore(), error => error.code === "RESTORE_NOT_SAVED" && error.step === "peer"
        && error.stepLabel === "Copy the profile to the slave half" && error.reason === "The slave half stopped handling requests from the master half." && error.saved === "none");
    assert.equal(views.at(-1).state, "failed"); assert.equal(views.at(-1).failure.step, "peer");
});
test("a sent commit the keyboard cancels is reported as not saved", async t => {
    const f = fixture(); stall(f, t);
    await assert.rejects(f.restore(), error => error.code === "RESTORE_NOT_SAVED" && /no observable progress/.test(error.message) && !/Unplug/.test(error.message));
    assert.equal(f.keyboard.durable, false); assert.equal(f.keyboard.events.at(-1), "aborted");
});
test("a sent commit without a confirmed cancel keeps its recovery file and unknown outcome", async t => {
    const f = fixture(); stall(f, t, {abortRejected: true});
    await assert.rejects(f.restore(), error => error.code === "RESTORE_INCOMPLETE" && error.saved === "unknown" && error.message.includes("/recovery.json"));
    assert.equal(f.keyboard.events.at(-1), "abort refused");
});
test("unconfirmed peer cleanup adds restart guidance; unreadable status loses only that hint", async t => {
    const f = fixture(); stall(f, t, {cleanupPending: true});
    await assert.rejects(f.restore(), error => error.code === "RESTORE_NOT_SAVED" && /Unplug the USB cable \(not the cable between the halves\)/.test(error.message));
    const g = fixture(); g.keyboard.faults.stallCommit = true; g.options.sleep = f.options.sleep;
    g.keyboard.faults.beforeRequest = (r, keyboard) => {if (keyboard.events.includes("aborted") && r[0] === 8 && r[2] === 2) throw Error("unreadable");};
    await assert.rejects(g.restore(), error => error.code === "RESTORE_NOT_SAVED" && !/Unplug/.test(error.message));
});
test("an active target with the peer out of sight is saved, while wrong digest, generation or transaction fails", async () => {
    const f = fixture(); f.keyboard.faults.peerUnseen = true;
    assert.equal((await f.restore()).peerUnseen, true); assertTarget(f);
    for (const [page, offset] of [[0, 12], [1, 0], [1, 17]]) {
        const g = fixture();
        g.keyboard.faults.afterRequest = (r, response, keyboard) => {
            if (keyboard.events.includes("activated") && r[0] === 8 && r[2] === 2 && r.readUInt16LE(4) === page) response[7 + offset] ^= 1;
        };
        await assert.rejects(g.restore(), /did not confirm the imported profile/);
    }
});
test("an observed decision followed by disconnect needs no host roll-forward on reconnect", async () => {
    const f = fixture(); f.keyboard.faults.stallConvergence = true;
    let seen = false;
    f.options.onApplyProgress = view => {if (view.current === "converge") seen = true;};
    f.keyboard.faults.beforeRequest = (r, keyboard) => {
        if (seen && keyboard.durable) {keyboard.faults.disconnected = true; throw Object.assign(Error("disconnected"), {code: "DISCONNECTED"});}
    };
    await assert.rejects(f.restore(), error => error.code === "RESTORE_INCOMPLETE" && error.saved === "decided" && /finishes the same generation by itself/.test(error.message));
    assert.equal(f.keyboard.events.includes("aborted"), false);
    delete f.keyboard.faults.beforeRequest; f.keyboard.recover(); assertTarget(f);
    assert.equal((await f.capture()).fingerprint, fingerprint(f.targetDocument));
});
test("an unobserved durable decision refuses abort and firmware completes the same profile", async () => {
    const f = fixture(); f.keyboard.faults.disconnectAfterDecision = true; f.keyboard.faults.stallConvergence = true;
    await assert.rejects(f.restore(), error => error.code === "RESTORE_INCOMPLETE" && error.saved === "unknown" && error.message.includes("/recovery.json"));
    assert.equal(f.keyboard.durable, true); f.keyboard.faults.disconnected = false;
    await assert.rejects(new CandidateUploadCoordinator(f.connection, {requestIds: f.ids, sleep: async () => {}}).abort(1));
    assert.equal(f.keyboard.events.at(-1), "abort refused");
    assert.deepEqual(f.keyboard.active, validateSnapshot(f.source).candidate);
    f.keyboard.recover(); assertTarget(f);
});
for (const error of [E.POSTCOMMIT_AUTHORITY_LOST, E.PEER_COMMIT_CONFLICT]) {
    test(`post-decision authority failure ${error} requires restart without inventing an input fence`, async () => {
        const f = fixture(); f.keyboard.faults.authorityFailed = {error};
        await assert.rejects(f.restore(), failure => failure.code === "RESTORE_INCOMPLETE" && failure.saved === "unknown"
            && failure.cause.code === "AUTHORITY_FAILED" && /Unplug the USB cable/.test(failure.message)
            && /keeps running a complete profile/.test(failure.message) && !/types nothing|ACCEPT/.test(failure.message));
        assert.equal(f.keyboard.events.includes("activated"), false);
        assert.deepEqual(f.keyboard.active, validateSnapshot(f.source).candidate);
    });
}
test("lost replies retain ambiguous upload ownership; a commit is safe only after confirmed cancel", async () => {
    for (const value of [C.VALUE_STREAM_CHUNK, C.VALUE_COMMIT]) {
        const f = fixture(); await fullUpload(f); f.keyboard.faults.loseReply = value;
        if (value === C.VALUE_COMMIT) f.keyboard.faults.stallCommit = true;
        await assert.rejects(f.restore(), error => value === C.VALUE_STREAM_CHUNK ? error.code === "TRANSPORT_OUTCOME_AMBIGUOUS" : error.code === "RESTORE_NOT_SAVED");
        if (value === C.VALUE_STREAM_CHUNK) {
            assert.equal(f.keyboard.events.at(-1), "begin");
            await new CandidateUploadCoordinator(f.connection, {requestIds: f.ids}).abort(1);
        }
        assert.equal(f.keyboard.events.at(-1), "aborted"); assert.equal(f.keyboard.durable, false);
    }
});
test("BUSY admission retries real status without duplicating accepted bytes", async () => {
    const f = fixture(); await fullUpload(f); f.keyboard.faults.busy = C.VALUE_STREAM_CHUNK;
    await f.restore(); assertTarget(f);
    const chunks = candidateMutations(f).filter(r => r[2] === C.VALUE_STREAM_CHUNK);
    assert.equal(chunks[0].readUInt32LE(5), chunks[1].readUInt32LE(5));
    assert.equal(chunks.length, Math.ceil(f.target.candidate.length / 20) + 1);
});
test("changed settings during capture or a corrupted payload refuses before recovery or writes", async () => {
    for (const corrupt of ["settings", "payload"]) {
        const f = fixture(); let settingsReads = 0;
        f.keyboard.faults.afterRequest = (r, reply) => {
            if (r[0] !== 8) return;
            if (corrupt === "payload" && r[2] === 4 && r.readUInt16LE(4) === 1) reply[7] ^= 1;
            if (corrupt === "settings" && r[2] === 7 && r.readUInt16LE(4) === 0 && ++settingsReads === 2) reply[11] ^= 1;
        };
        await assert.rejects(f.restore()); assert.deepEqual(f.keyboard.mutations, []);
    }
});
test("old backups and incompatible capabilities are refused before any report", async () => {
    const f = fixture();
    for (const version of [1, 3, 4]) await assert.rejects(restoreProfile(f.connection, f.ids, capabilities, {...f.targetDocument, version}, f.options), {code: "INVALID_PORTABLE_PROFILE"});
    for (const incompatible of [{...capabilities, compiledLayerCount: 5}, {...capabilities, supportedDomainMask: 15}, {...capabilities, actionAbiDigest: 0x1d3fcacc}])
        await assert.rejects(captureProfile(f.connection, f.ids, incompatible), {code: "FIRMWARE_UPDATE_REQUIRED"});
    assert.deepEqual(f.keyboard.requests, []);
});
function withSetting(source) {
    const result = structuredClone(source), decoded = validateSnapshot(source); decoded.settings.values[0]++;
    const blob = decodeProfileBlob(decoded.profile); blob.domains.find(d => d.id === 64).payload = encodeSettings(decoded.settings);
    result.profile = encodeProfileBlob(blob).toString("base64"); return result;
}
const EDITS = {
    "layout-only": source => editLayers(structuredClone(source), layers => layers[0][0] ^= 1),
    "settings-only": withSetting,
    "macro-only": source => editMacros(structuredClone(source), macros => macros[3] = Buffer.from("imported").toString("base64")),
};
for (const [name, source] of [["current", document], ["six configured slots", require("../fixtures/pd-profile").document]]) {
    for (const [editName, edit] of Object.entries(EDITS)) for (const cached of [false, true]) {
        test(`${editName} Apply of ${name} from ${cached ? "cached" : "fresh"} capture preserves every other domain`, async () => {
            const f = fixture({source: source()}); f.targetDocument = edit(f.source); f.target = validateSnapshot(f.targetDocument);
            if (cached) f.options.baseSnapshot = await f.capture(); f.keyboard.requests.length = 0;
            const result = await f.restore(); assertTarget(f);
            assert.equal(payloadReads(f).length > 0, !cached);
            assert.deepEqual(result.storage.profile, f.target.candidate);
            assert.deepEqual(Object.keys(result.document).sort(), ["actionAbiDigest", "format", "keyboard", "profile", "version"]);
        });
    }
}
test("Apply reuses exact committed or compiled source ranges and streams changes", async () => {
    for (const compiledOnly of [false, true]) {
        const f = fixture({compiledOnly}); f.options.baseSnapshot = await f.capture(); await f.restore(); assertTarget(f);
        const reuse = candidateMutations(f).find(r => r[2] === C.VALUE_REUSE);
        assert.ok(reuse); assert.equal(reuse[29], compiledOnly ? 0 : 1); assert.equal(reuse[30], compiledOnly ? 255 : 0);
        assert.ok(candidateMutations(f).some(r => r[2] === C.VALUE_STREAM_CHUNK));
    }
});
test("missing or corrupted exact source bytes fall back to full transfer without trusting reconstructed bytes", async () => {
    for (const missing of [true, false]) {
        const f = fixture(), capture = await f.capture(); f.options.baseSnapshot = capture;
        if (missing) delete capture.storage; else capture.storage.profile[10] ^= 1;
        await f.restore(); assertTarget(f);
        assert.equal(candidateMutations(f).some(r => r[2] === C.VALUE_REUSE), false);
    }
});

const {settings: currentSettings} = require("../fixtures/portable-profile");
const {encodeComboDomain} = require("../../core/schema/combo-domain-v1");
const {decodeSettings} = require("../../core/schema/settings-domain-v1");
const captureCapabilities = {...CAPABILITIES_32, candidateChunkMax: 20, macroBytes: 34903};
function wired(keyboard) {
    let id = 0;
    return {connection: {request: async (report) => keyboard.answer(report)[0]}, ids: {next: () => (id = id % 255 + 1)}};
}
function factoryProfile(source) {
    const factory = currentSettings(); factory.values[0] = 1600; factory.names[1] = "Factory";
    const combos = {version: 3, defaultTermMs: 40, holdTermMs: 180, rows: [{inputs: [6, 7].map(operand => ({kind: 1, operand, flags: 0})), output: {kind: 1, operand: 9, flags: 0}, termMs: null, mustHold: false, mustTap: true, ordered: false}]};
    const blob = decodeProfileBlob(validateSnapshot(source).candidate);
    return encodeProfileBlob({schema: blob.schema, domains: blob.domains.map(domain => domain.id === 0x40 ? {...domain, payload: encodeSettings(factory)}
        : domain.id === 0x30 ? {...domain, payload: encodeComboDomain(combos)} : domain)});
}
for (const compiledOnly of [false, true]) {
    test(`a capture ${compiledOnly ? "of a keyboard running its defaults" : "of a committed profile"} keeps the live combos and settings beside a seven-domain compiled read`, async () => {
        const source = backup32(), compiled = factoryProfile(source);
        assert.deepEqual(decodeProfileBlob(compiled).domains.map(domain => domain.id), [16, 32, 48, 64, 80, 96, 112], "the compiled read has every domain");
        const keyboard = fakeKeyboard({document: source, compiled, compiledOnly});
        const {connection, ids} = wired(keyboard);
        const captured = await captureProfile(connection, ids, captureCapabilities);
        const reads = new Set(keyboard.requests.filter(r => r[0] === 0x08 && r[1] === 0).map(r => r[2]));
        assert.ok(reads.has(0x05) && reads.has(0x06) && reads.has(0x07), "the compiled, combo and settings reads all ran");
        assert.equal(reads.has(0x04), !compiledOnly);
        const domains = decodeProfileBlob(Buffer.from(captured.document.profile, "base64")).domains;
        assert.deepEqual(domains.map(domain => domain.id), [16, 32, 48, 64, 80, 96, 112], "each domain once, in registry order");
        const live = validateSnapshot(source);
        assert.deepEqual(decodeSettings(domains[3].payload), live.settings, "the live settings, not the factory ones");
        assert.notEqual(decodeSettings(domains[3].payload).values[0], 1600);
        assert.ok(domains[2].payload.equals(decodeProfileBlob(live.profile).domains[2].payload), "the live combos, not the authored defaults");
        assert.equal(captured.fingerprint, fingerprint(source), "the export is the keyboard's effective profile");
    });
}

test("a capture never reads the retired PD page, and asks for nothing the keyboard does not serve", async () => {
    const source = backup32(), keyboard = fakeKeyboard({document: source});
    const {connection, ids} = wired(keyboard);
    const captured = await captureProfile(connection, ids, captureCapabilities);
    assert.equal(keyboard.requests.some(r => r[0] === 0x08 && r[1] === 0 && r[2] === 0x09), false, "no GET 0x09");
    assert.equal(Object.hasOwn(captured.document, "pdModeSource"), false, "no pointing-mode source is written");
    assert.deepEqual(keyboard.unhandled, []);
});

test("complete capture preserves Unicode bank bytes", async () => {
    const source = backup32();
    const text = ' café “hello” 🙂 e\u0301 👩‍💻 ';
    editMacros(source, macros => macros[0] = Buffer.from(text).toString('base64'));
    const keyboard = fakeKeyboard({document:source});
    const {connection, ids} = wired(keyboard);
    const captured = await captureProfile(connection, ids, captureCapabilities);
    assert.deepEqual(profileMacros(captured.document), profileMacros(source));
    assert.equal(captured.fingerprint, fingerprint(source));
    assert.equal(Buffer.from(profileMacros(captured.document)[0], 'base64').toString('utf8'), text);
    assert.deepEqual(keyboard.mutations, []);
    const malformed = structuredClone(source);
    const invalid = decodeProfileBlob(Buffer.from(malformed.profile, "base64"));
    invalid.domains.find(d => d.id === 112).payload = Buffer.concat([Buffer.from([0xc0, 0xaf]), Buffer.alloc(128)]);
    malformed.profile = encodeProfileBlob(invalid).toString("base64");
    assert.throws(() => validateSnapshot(malformed), /valid|UTF-8/);
});


test("a keyboard without its slave half refuses a capture at once, without waiting for the halves", async () => {
    const source = backup32();
    const keyboard = fakeKeyboard({document: source, compiled: factoryProfile(source), peerKnown: false});
    const {connection, ids} = wired(keyboard);
    let waits = 0;
    await assert.rejects(captureProfile(connection, ids, captureCapabilities, undefined, false, false, {sleep: async () => {waits += 1;}}),
        {code: "KEYBOARD_NOT_READY", message: /slave half is not connected/});
    assert.equal(waits, 0, "no poll for the halves to agree");
});

// Ark reads and writes only current firmware: a keyboard storing settings in
// another version is neither captured nor written.
test("a keyboard storing settings in another version is not captured, and a restore to it is refused before any write", async () => {
    const keyboard = fakeKeyboard({document: document(), settingsVersion: 7});
    let id = 0;
    const ids = {next: () => (id = id % 255 + 1)};
    const connection = {request: async report => keyboard.answer(report)[0]};
    await assert.rejects(captureProfile(connection, ids, capabilities), {code: "FIRMWARE_UPDATE_REQUIRED", message: /Ark supports only current firmware/});
    let recovered = false;
    await assert.rejects(restoreProfile(connection, ids, capabilities, document(), {sleep: async () => {}, saveRecovery: async () => {recovered = true; return "/r.json";}}),
        {code: "FIRMWARE_UPDATE_REQUIRED", message: /Ark supports only current firmware/});
    assert.equal(recovered, false, "refused before the recovery copy");
    assert.deepEqual(keyboard.mutations, []);
});
