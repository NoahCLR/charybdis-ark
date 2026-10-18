"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {FakeDeviceAdapter} = require("../../core/transport/fake-device-adapter");
const {crc32, fnv1a32} = require("../../core/schema/profile-blob-v1");
const {CANDIDATE_ERROR, CANDIDATE_OPERATION, CANDIDATE_STATE} = require("../../core/protocol/profile-candidate-v1");
const {
    ProfileRequestIdSequence,
    ProfileDeviceService,
    evaluateProfileCompatibility,
    evaluateLiveMutationCompatibility,
} = require("../../core/session/profile-device-service");
const {PROFILE_ACTIVE_KIND, PROFILE_WIRE_FEATURES, PROFILE_WIRE_KNOWN_MASKS, PROFILE_WIRE_STATUS, PROFILE_WIRE_V1, VIA_READS} = require("../../core/protocol/profile-wire-v1");
const {document} = require("../fixtures/pd-profile");
const {fakeKeyboard} = require("../fixtures/fake-keyboard");
const {connectedService} = require("../fixtures/connected-service");
const {PROFILE_PAYLOAD_V1} = require("../../core/protocol/profile-payload-v1");

test("Apply progress has a separate notification and cannot let a closed panel stop a save", () => {
    let changes = 0;
    const progress = [];
    const service = new ProfileDeviceService({adapter: new FakeDeviceAdapter(), onChange: () => changes++,
        onApplyProgress: view => progress.push(view)});
    const view = {id: 777, state: "applying", steps: [], bytes: {completed: 12, total: 120}};
    for (let completed = 1; completed <= 120; completed++) service.reportApplyProgress({...view, bytes: {completed, total: 120}});
    assert.equal(changes, 0, "copy counters never rebuild a full snapshot");
    assert.equal(progress.length, 120);
    progress.at(-1).bytes.completed = 0;
    assert.equal(service.liveApply.bytes.completed, 120, "the panel receives a separate progress value");
    service.onApplyProgress = () => {throw Error("panel closed");};
    assert.doesNotThrow(() => service.reportApplyProgress(view));
    service.onApplyProgress = undefined;
    service.reportApplyProgress(view);
    assert.equal(changes, 1, "other service clients keep the complete-snapshot fallback");
});

test("a restore reads what the keyboard accepts, including its host OS, before writing anything", async t => {
    const {service, adapter, keyboard} = await connectedService(t, {document: document()});
    // The keyboard stops answering its host OS after connecting.
    adapter.keyboard = {...keyboard, answer: report => report[0] === PROFILE_WIRE_V1.COMMAND_GET && report[2] === 0x0b
        ? [Object.assign(Buffer.from(report), {0: 0xff})] : keyboard.answer(report)};
    const target = document(); target.layers[0][0] = 5;
    await assert.rejects(service.restorePortableProfile(target, {saveRecovery: () => {throw Error("must not start restore");}}));
    assert.deepEqual(keyboard.mutations, [], "a failed facts read refuses before the first write");
});

test("a restore to firmware without a current feature is refused before recovery or any write", async t => {
    const source = fakeKeyboard({document: document()});
    const keyboard = {...source, answer: report => {
        const responses = source.answer(report);
        if (report[0] === PROFILE_WIRE_V1.COMMAND_GET && report[2] === PROFILE_WIRE_V1.VALUE_CAPABILITIES && report[4] === 0) {
            for (const response of responses) response.writeUInt32LE((response.readUInt32LE(16) & ~(1 << 28)) >>> 0, 16);
        }
        return responses;
    }};
    const {service} = await connectedService(t, {keyboard});
    assert.equal(service.capabilities.featureFlags & (1 << 28), 0);
    let recovery = 0;
    await assert.rejects(service.restorePortableProfile(document(), {saveRecovery: () => {recovery++;}}), {code: "FIRMWARE_UPDATE_REQUIRED"});
    assert.equal(recovery, 0);
    assert.deepEqual(source.mutations, []);
});

test("an editor read and a restore attach the same device facts and rebuild the editor views", async t => {
    const {fixture} = require("../fixtures/portable-restore");
    const {editorViews} = require("../../core/session/device-model");
    const f = fixture(), {service} = await connectedService(t, {keyboard: f.keyboard});
    const facts = ({limits, options, hostOs}) => ({limits, options, hostOs});
    const views = () => {const {settingsView, macroView, customKeyView} = service.snapshot(); return {settingsView, macroView, customKeyView};};
    // Snapshots carry JSON copies.
    const built = snapshot => JSON.parse(JSON.stringify(editorViews(snapshot, service.capabilities)));
    await service.readKeyboardProfile();
    const read = service.portable;
    assert.ok(read.limits && read.options && read.hostOs, "limits, options and host OS travel with the profile");
    assert.deepEqual(views(), built(read));
    await service.restorePortableProfile(f.targetDocument, f.options);
    assert.notEqual(service.portable.fingerprint, read.fingerprint, "the restored profile is the one the editors follow");
    assert.deepEqual(facts(service.portable), facts(read));
    assert.deepEqual(views(), built(service.portable));
});

test("read counters retain snapshots and notify without copying the profile", async t => {
    let changes = 0;
    const reads = [];
    const {service, id} = await connectedService(t, {document: document()}, {onChange: () => changes++, onReadProgress: view => reads.push(view)});
    changes = 0;
    const state = await service.readCommittedProfile();
    assert.equal(state.error, null);
    assert.equal(changes, 2, "only operation start and completion publish full snapshots");
    assert.ok(reads.length > 100, "the actual payload reader exercises many chunks");
    assert.ok(reads.every(read => read.source === "profile" && read.operationId === state.operationId
        && read.selectedDeviceId === id && read.connectionToken === state.connectionToken));
    const final = reads.at(-1).progress;
    assert.equal(final.done, final.total);
    assert.equal(state.committed.progress, null, "completion keeps its regular full notification");
    service.reportReadProgress("layout", {done: 1, total: 896});
    reads.at(-1).progress.done = 99;
    assert.equal(service.snapshot().layout.progress.done, 1, "progress callbacks receive their own value");
    service.onReadProgress = () => {throw Error("panel closed");};
    assert.doesNotThrow(() => service.reportReadProgress("portable", "Reading the complete keyboard configuration"));
    service.onReadProgress = undefined;
    service.reportReadProgress("layout", {done: 2, total: 896});
    assert.equal(changes, 3, "clients without the callback retain full snapshot notifications");
});

function response(request, payload) {
    const report = Buffer.from(request);
    report.fill(0, 5);
    report[5] = 0;
    report[6] = payload.length;
    Buffer.from(payload).copy(report, 7);
    return report;
}

function readPages(options = {}) {
    const capabilityIdentity = Buffer.alloc(25);
    const featureFlags = (PROFILE_WIRE_KNOWN_MASKS.CURRENT_FEATURES | PROFILE_WIRE_FEATURES.SPLIT_KEYBOARD
        | (options.mutation ? PROFILE_WIRE_KNOWN_MASKS.CURRENT_MUTATION_FEATURES : 0)) >>> 0;
    capabilityIdentity.set([2, 3, 1, 0, options.schemaMajor || 3, 0, 32, options.mutation ? 20 : 0, 2], 0);
    capabilityIdentity.writeUInt32LE(featureFlags, 9);
    capabilityIdentity.writeUInt32LE(options.actionAbiDigest ?? 0x12345678, 13);
    const capacity = Buffer.from([
        5, options.maxLayers || 16, 128, 5, 0, 128, 16, 16, 32, 58, 8, 128, 128,
        0xe0, 0xff, 0xe0, 0xff, 0, 0, 0x57, 0x28, 3, 0, 0, 0,
    ]);
    const wide = Buffer.alloc(25);
    wide.writeUInt16LE(640, 0); wide[2] = 5;
    wide.writeUInt32LE(65536, 3); wide[7] = 32; wide[8] = 32; wide[9] = 60;
    const statusIdentity = Buffer.alloc(25);
    statusIdentity.set([1, 2], 0);
    const stateFlags = options.stateFlags ?? (options.mutation ? 0x31 : 0x81);
    statusIdentity.writeUInt16LE(stateFlags, 2);
    statusIdentity.writeUInt32LE(options.activeDigest ?? 0, 12);
    statusIdentity.writeUInt32LE(options.committedDigest ?? 0, 20);
    statusIdentity[24] = options.activeKind ?? PROFILE_ACTIVE_KIND.COMPILED_ONLY;
    return {
        [`${PROFILE_WIRE_V1.VALUE_CAPABILITIES}:0`]: capabilityIdentity,
        [`${PROFILE_WIRE_V1.VALUE_CAPABILITIES}:1`]: capacity,
        [`${PROFILE_WIRE_V1.VALUE_CAPABILITIES}:2`]: wide,
        [`${PROFILE_WIRE_V1.VALUE_STATUS}:0`]: statusIdentity,
        [`${PROFILE_WIRE_V1.VALUE_STATUS}:1`]: Buffer.alloc(25),
    };
}

function candidateStatus(overrides = {}) {
    return {
        state: CANDIDATE_STATE.IDLE,
        lastOperation: CANDIDATE_OPERATION.NONE,
        flags: 0,
        mailboxPending: false,
        poisoned: false,
        transactionId: 0,
        nextOffset: 0,
        payloadLength: 0,
        digest: 0,
        error: {id: CANDIDATE_ERROR.NONE, name: "NONE"},
        operationSequence: 0,
        ...overrides,
    };
}

function serviceHarness(options = {}) {
    const pages = readPages(options);
    const adapter = new FakeDeviceAdapter({
        devices: [{
            id: "/native/raw/hid/path",
            path: "/native/raw/hid/path",
            product: "Charybdis 4x6",
            serialNumber: "SERIAL-1",
        }],
        onWrite({connection, report}) {
            if (report[0] === VIA_READS.COMMAND_GET_PROTOCOL_VERSION) {
                const viaResponse = Buffer.from(report);
                viaResponse[1] = 0;
                viaResponse[2] = VIA_READS.PROTOCOL_VERSION;
                queueMicrotask(() => connection.emitReport(viaResponse));
                return;
            }
            if (report[0] === VIA_READS.COMMAND_GET_KEYBOARD_VALUE && report[1] === VIA_READS.VALUE_FIRMWARE_VERSION) {
                queueMicrotask(() => connection.emitReport(Buffer.from(report)));
                return;
            }
            assert.equal(report[0], PROFILE_WIRE_V1.COMMAND_GET, "Stage 01 service must only send read requests");
            const payload = pages[`${report[2]}:${report[4]}`];
            assert.ok(payload, `unexpected Profile Wire read ${report[2]} page ${report[4]}`);
            queueMicrotask(() => connection.emitReport(response(report, payload)));
        },
    });
    const changes = [];
    const service = new ProfileDeviceService({
        adapter,
        defaultTimeoutMs: 100,
        onChange(snapshot) {
            changes.push(snapshot);
        },
        readCandidateStatus: options.readCandidateStatus || (async () => candidateStatus(options.candidateStatus)),
    });
    return {adapter, changes, service};
}

// Connected to a keyboard in one state, which then answers in another: the
// status the service holds from connecting is stale by the time it reads.
// `seen` lists the [value, page] of each Profile Wire read after connecting.
async function profileRead(t, {connectedCommitted, committed, rejectChunk = false}, options = {}) {
    const {service, adapter} = await connectedService(t, {document: document(), compiledOnly: !connectedCommitted}, options);
    const fresh = fakeKeyboard({document: document(), compiledOnly: !committed}), seen = [];
    adapter.keyboard = {...fresh, answer(report) {
        if (report[0] === PROFILE_WIRE_V1.COMMAND_GET) seen.push([report[2], report[4]]);
        if (rejectChunk && report[0] === PROFILE_WIRE_V1.COMMAND_GET && report[2] === PROFILE_PAYLOAD_V1.VALUE && report[4] === 1) {
            const rejected = response(report, Buffer.alloc(0));
            rejected[5] = PROFILE_WIRE_STATUS.UNAVAILABLE;
            return [rejected];
        }
        return fresh.answer(report);
    }};
    return {service, seen};
}

test("profile read chooses compiled defaults from a fresh status", async t => {
    const {service, seen} = await profileRead(t, {connectedCommitted: true, committed: false});
    assert.equal(service.snapshot().status.activeKind, PROFILE_ACTIVE_KIND.COMMITTED, "the held status is stale");
    const state = await service.readCommittedProfile();
    assert.equal(state.error, null);
    assert.equal(state.committed.source, "compiled");
    assert.equal(state.committed.state, "read");
    assert.equal(state.status.activeKind, PROFILE_ACTIVE_KIND.COMPILED_ONLY);
    assert.ok(seen.some(([value]) => value === PROFILE_PAYLOAD_V1.COMPILED_VALUE));
    assert.ok(!seen.some(([value]) => value === PROFILE_PAYLOAD_V1.VALUE));
});

test("a rejected committed payload chunk stays a read failure", async t => {
    const changes = [];
    const {service, seen} = await profileRead(t, {connectedCommitted: false, committed: true, rejectChunk: true},
        {onReadProgress: () => {}, onChange: state => changes.push(state)});
    assert.equal(service.snapshot().status.activeKind, PROFILE_ACTIVE_KIND.COMPILED_ONLY, "the held status is stale");
    await assert.rejects(service.readCommittedProfile(), {code: "DEVICE_REJECTED"}, "a failed read rejects with the error it records");
    const state = service.snapshot();
    assert.equal(state.error.code, "DEVICE_REJECTED");
    assert.equal(state.committed.state, "reading");
    assert.equal(changes.at(-1).error.code, "DEVICE_REJECTED", "failed reads still publish a full model");
    assert.equal(changes.at(-1).busy, false);
    assert.equal(state.status.activeKind, PROFILE_ACTIVE_KIND.COMMITTED, "a failed payload read still reports the fresh device status");
    assert.ok(seen.some(([value]) => value === PROFILE_PAYLOAD_V1.VALUE));
    assert.ok(!seen.some(([value]) => value === PROFILE_PAYLOAD_V1.COMPILED_VALUE), "a failed committed chunk is not treated as missing storage");
});

test("service exposes opaque descriptors and performs only capability/status reads", async () => {
    const {adapter, service} = serviceHarness();
    const scanned = await service.enumerate();
    assert.equal(scanned.devices.length, 1);
    assert.equal(scanned.devices[0].id, "charybdis-1");
    assert.equal(JSON.stringify(scanned).includes("/native/raw/hid/path"), false);

    const connected = await service.connect(scanned.devices[0].id);
    assert.equal(connected.connected, true);
    assert.equal(connected.connectionToken, 1);
    assert.equal(connected.capabilities.schema.major, 3);
    assert.equal(connected.status.activeKind, 0);
    assert.equal(connected.compatibility.compatible, true);
    assert.ok(connected.diagnostics.includes("Live protocol, schema, VIA identity and required features are compatible."));
    assert.equal(adapter.lastConnection().writes.length, 7);
    assert.deepEqual(adapter.lastConnection().writes.map((report) => report[0]), [1, 2, 8, 8, 8, 8, 8]);
    assert.deepEqual(adapter.lastConnection().writes.slice(2).map((report) => report[2]), [1, 1, 1, 2, 2]);
    assert.deepEqual(adapter.lastConnection().writes.slice(2).map((report) => report[3]), [1, 2, 3, 4, 5]);

    const disconnected = await service.disconnect();
    assert.equal(disconnected.connected, false);
    assert.equal(disconnected.connectionToken, null);
    assert.equal(disconnected.capabilities, null);
    const reconnected = await service.connect(scanned.devices[0].id);
    assert.equal(reconnected.connectionToken, 2, "the same HID path is still a new connection for draft safety");
});

test("rescans keep each interface ID and never give a replacement the old draft ID", async () => {
    const {adapter, service} = serviceHarness();
    const first = (await service.enumerate()).devices[0].id;
    adapter.devices = [{id: "/native/second/path", product: "Charybdis 4x6", serialNumber: "SERIAL-2"}];
    const second = (await service.enumerate()).devices[0].id;
    assert.notEqual(second, first);
    await assert.rejects(service.connect(first), /latest scan/, "a removed interface cannot be selected from the latest scan");
    assert.equal(service.snapshot().connected, false);
    assert.match(service.snapshot().error.message, /latest scan/, "the refusal is recorded like a failure");
    adapter.devices = [
        {id: "/native/second/path", product: "Charybdis 4x6", serialNumber: "SERIAL-2"},
        {id: "/native/raw/hid/path", product: "Charybdis 4x6", serialNumber: "SERIAL-1"},
    ];
    const rescanned = (await service.enumerate()).devices;
    assert.deepEqual(rescanned.map((entry) => entry.id), [second, first], "enumeration order does not change identities");
});

test("a read refused before it starts rejects and is recorded like a failure", async () => {
    const changes = [];
    const service = new ProfileDeviceService({adapter: new FakeDeviceAdapter(), onChange: (state) => changes.push(state)});
    await assert.rejects(service.readLayout(), /Connect to a keyboard before reading its layout/);
    await assert.rejects(service.refresh(), /Connect to a keyboard before refreshing/);
    assert.match(changes.at(-1).error.message, /before refreshing/, "the refusal is published");
    assert.equal(changes.at(-1).busy, false);
    const optional = await service.readBaseRgb();
    assert.equal(optional.baseRgb, null, "an optional read resolves, and without a connection holds nothing");
});

for (const method of ["readKeyboardProfile", "readPortableProfile", "restorePortableProfile"]) {
    for (const state of ["disconnected", "busy"]) {
        test(`${method} publishes its ${state} refusal without starting an operation`, async () => {
            const {adapter, changes, service} = serviceHarness();
            let release, pending, recoveries = 0;
            try {
                if (state === "busy") {
                    const scanned = await service.enumerate();
                    await service.connect(scanned.devices[0].id);
                    pending = service.runOperation("existing operation", () => new Promise(resolve => {release = resolve;}));
                }
                service.setError(new Error("Earlier failure"));
                const before = service.snapshot(), writes = adapter.lastConnection()?.writes.length || 0;
                changes.length = 0;
                await assert.rejects(service[method](document(), {saveRecovery: async () => {recoveries++;}}), error => {
                    assert.ok(error instanceof Error);
                    assert.equal(error.message, "Connect the keyboard and wait for the current operation to finish.");
                    assert.deepEqual(service.snapshot().error, {code: error.code, message: error.message}, "the rejection and recorded failure agree");
                    return true;
                });
                const after = service.snapshot();
                assert.equal(changes.length, 1, "subscribers receive the refusal");
                assert.deepEqual(changes[0].error, after.error);
                assert.match(after.diagnostics.at(-1), /Connect the keyboard and wait/);
                assert.equal(after.operationId, before.operationId);
                assert.equal(after.phase, before.phase);
                assert.equal(after.busy, before.busy, "a refused call cannot finish the operation already running");
                assert.equal(adapter.lastConnection()?.writes.length || 0, writes, "no HID request is sent");
                assert.equal(recoveries, 0, "restore does not write a recovery file");
            } finally {
                release?.();
                await pending;
                await service.close();
            }
        });
    }
}

test("compatibility reports a schema blocker, and the diagnostic says what was checked", async () => {
    const {service} = serviceHarness({schemaMajor: 1});
    const scanned = await service.enumerate();
    const connected = await service.connect(scanned.devices[0].id);
    assert.equal(connected.compatibility.compatible, false);
    assert.match(connected.compatibility.reasons.join("\n"), /Schema major/);
    assert.match(connected.diagnostics.join("\n"), /found \d+ blocking issue/);
});

test("compatibility compares only what the keyboard reports with what this app reads", () => {
    const compatibility = evaluateProfileCompatibility({
        protocol: {major: 1},
        schema: {major: 1},
        reportSize: 31,
        statusPageCount: 2,
        supportedDomainMask: 1,
    }, {protocolVersion: 12, firmwareVersion: 0});
    assert.equal(compatibility.compatible, false);
    assert.match(compatibility.reasons.join("\n"), /Raw HID report size/);
    assert.match(compatibility.reasons.join("\n"), /Required profile domains/);
    assert.deepEqual(compatibility.checks.map((check) => check.label), [
        "Protocol major", "Schema major", "VIA protocol version", "VIA firmware version",
        "Raw HID report size", "Status pages", "Current firmware features", "Required profile domains",
    ], "no capacity is compared: the keyboard advertises its own and nothing here has another to compare");
});

test("compatibility accepts VIA 13, which current firmware reports, and nothing else", () => {
    const via = (protocolVersion) => evaluateProfileCompatibility({}, {protocolVersion, firmwareVersion: 0})
        .checks.find((check) => check.label === "VIA protocol version");
    assert.equal(via(13).ok, true);
    for (const version of [11, 12, 14, undefined]) {
        assert.equal(via(version).ok, false);
        assert.match(via(version).message, /requires 13/);
    }
});

test("persistent live apply requires every mutation capability", () => {
    const compatible = {compatible: true, reasons: []};
    const completeFlags = PROFILE_WIRE_KNOWN_MASKS.CURRENT_MUTATION_FEATURES;
    const readyStatus = {peerKnown: true, peerConverged: true, candidatePending: false};
    assert.equal(evaluateLiveMutationCompatibility({featureFlags: completeFlags, candidateChunkMax: 20}, compatible, true, readyStatus).available, true);

    const blocked = evaluateLiveMutationCompatibility({
        featureFlags: completeFlags & ~PROFILE_WIRE_FEATURES.PEER_RECONCILIATION,
        candidateChunkMax: 20,
    }, compatible, true, readyStatus);
    assert.equal(blocked.available, false);
    assert.match(blocked.reasons.join("\n"), /persistent split apply mask/);
});

test("persistent live apply requires a detected and converged second half", () => {
    const capabilities = {
        featureFlags: PROFILE_WIRE_FEATURES.CANDIDATE_WRITE
            | PROFILE_WIRE_FEATURES.PERSISTENT_COMMIT
            | PROFILE_WIRE_FEATURES.RUNTIME_ACTIVATION
            | PROFILE_WIRE_FEATURES.PEER_RECONCILIATION
            | PROFILE_WIRE_FEATURES.ATOMIC_LOGICAL_APPLY,
        candidateChunkMax: 20,
    };
    const peerMissing = evaluateLiveMutationCompatibility(
        capabilities,
        {compatible: true, reasons: []},
        true,
        {peerKnown: false, peerConverged: false, candidatePending: false}
    );
    assert.equal(peerMissing.available, false);
    assert.match(peerMissing.reasons.join("\n"), /slave half has not been detected/);

    const unconverged = evaluateLiveMutationCompatibility(
        capabilities,
        {compatible: true, reasons: []},
        true,
        {peerKnown: true, peerConverged: false, candidatePending: false}
    );
    assert.equal(unconverged.available, false);
    assert.match(unconverged.reasons.join("\n"), /have not established a converged profile state/);
});

test("request ids advance across refreshes and reject a delayed duplicate", async () => {
    const pages = readPages();
    let delayedResponse;
    let customWriteCount = 0;
    const adapter = new FakeDeviceAdapter({
        devices: [{id: "native-device", product: "Charybdis"}],
        onWrite({connection, report}) {
            if (report[0] === VIA_READS.COMMAND_GET_PROTOCOL_VERSION) {
                const viaResponse = Buffer.from(report);
                viaResponse[2] = VIA_READS.PROTOCOL_VERSION;
                queueMicrotask(() => connection.emitReport(viaResponse));
                return;
            }
            if (report[0] === VIA_READS.COMMAND_GET_KEYBOARD_VALUE) {
                queueMicrotask(() => connection.emitReport(Buffer.from(report)));
                return;
            }
            const current = response(report, pages[`${report[2]}:${report[4]}`]);
            customWriteCount += 1;
            if (customWriteCount === 1) delayedResponse = Buffer.from(current);
            if (customWriteCount === 5) {
                queueMicrotask(() => connection.emitReport(delayedResponse));
            }
            queueMicrotask(() => connection.emitReport(current));
        },
    });
    const service = new ProfileDeviceService({adapter, defaultTimeoutMs: 100});
    const scanned = await service.enumerate();
    await service.connect(scanned.devices[0].id);
    const refreshed = await service.refresh();
    assert.equal(refreshed.connected, true);
    assert.equal(refreshed.error, null);
    const customWrites = adapter.lastConnection().writes.filter((report) => report[0] === PROFILE_WIRE_V1.COMMAND_GET);
    assert.deepEqual(customWrites.map((report) => report[3]), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    assert.ok(refreshed.diagnostics.some((entry) => entry.includes("unexpected Raw HID report")));
});

test("request id allocation wraps from 255 to 1 without emitting zero", () => {
    const ids = new ProfileRequestIdSequence(0xfe);
    assert.deepEqual([ids.next(), ids.next(), ids.next(), ids.next()], [0xfe, 0xff, 1, 2]);
    assert.throws(() => new ProfileRequestIdSequence(0), /1 through 255/);
});

test("the layout read counts only keys the app cannot name", () => {
    const {unnamedKeyCount} = require("../../core/session/profile-device-service");
    const keycodes = require("../../core/data/keycode-catalog");
    const layers = [{layer: 0, keys: [0x0004, 0x7e42, 0x7e85, 0x7ea3, 0x7ec2, 0x7e90, 0x7ee0].map((keycode) => ({keycode, resolved: keycodes.resolve(keycode)}))}];
    assert.equal(unnamedKeyCount(layers, {actionAbiDigest: 0x837cf479}), 1, "configured or empty pointing slots are named; a code past the blocks is not");
    for (const actionAbiDigest of [0x1d3fcacc, 0x61072732]) assert.equal(unnamedKeyCount(layers, {actionAbiDigest}), 5, "older firmware's user keys are not read as blocks");
});

// Exercise the actual service after the transaction succeeds, rather than a
// stubbed restore method in the panel's Apply tests.
test("successful service restore installs the saved profile and returns normally", async () => {
    const {fixture} = require("../fixtures/portable-restore");
    const {fakeKeyboardAdapter} = require("../fixtures/fake-keyboard");
    const f = fixture(), adapter = fakeKeyboardAdapter({keyboard: f.keyboard});
    const service = new ProfileDeviceService({adapter, defaultTimeoutMs: 200});
    try {
        await service.enumerate(); await service.connect(service.devices[0].id);
        const result = await service.restorePortableProfile(f.targetDocument, f.options);
        assert.equal(result.fingerprint, require("../../core/model/portable-profile").fingerprint(f.targetDocument));
        assert.equal(service.portable, result);
        assert.equal(service.liveApply.state, "done");
        assert.equal(service.error, undefined);
        assert.equal(f.keyboard.events[0], "backup");
        assert.ok(f.keyboard.events.includes("decision") && f.keyboard.events.includes("activated"));
        assert.ok(adapter.keyboard.mutations.length > 0, "the real service sends all writes through its request coordinator");
        assert.deepEqual(f.keyboard.local.macros, f.target.macros);
        assert.deepEqual(f.keyboard.peer.macros, f.target.macros);
        assert.equal(service.portable.fingerprint, result.fingerprint, "the service's post-Apply capture sees the saved target");
    } finally {await service.close();}
});

test("standalone export reads the current keyboard without replacing its editor snapshot", async () => {
    const {fixture} = require("../fixtures/portable-restore");
    const {fakeKeyboardAdapter} = require("../fixtures/fake-keyboard");
    const f = fixture(), adapter = fakeKeyboardAdapter({keyboard: f.keyboard});
    const service = new ProfileDeviceService({adapter, defaultTimeoutMs: 200, sleep: async () => {}});
    try {
        await service.enumerate(); await service.connect(service.devices[0].id);
        const editor = await service.readKeyboardProfile();
        const state = service.snapshot();
        // Another client has changed a key since the editor read. Export
        // captures it, but must leave the already published editor alone.
        f.keyboard.local.layout[1] ^= 1; f.keyboard.peer.layout[1] ^= 1;
        const exported = await service.readPortableProfile();
        assert.notEqual(exported.fingerprint, editor.fingerprint);
        assert.equal(service.portable, editor);
        for (const field of ["layout", "committed", "combos", "baseRgb", "macroView", "customKeyView", "settingsView"]) {
            assert.deepEqual(service.snapshot()[field], state[field], `${field} is still the editor read`);
        }
    } finally {await service.close();}
});

test("keyboards without a serial number are numbered by their id, the number first", async () => {
    const {ProfileDeviceService: Service} = require("../../core/session/profile-device-service");
    const {FakeDeviceAdapter: Fake} = require("../../core/transport/fake-device-adapter");
    const one = new Service({adapter: new Fake({devices: [{id: "a", product: "Charybdis (4x6) Splinky"}]})});
    await one.enumerate();
    assert.deepEqual(one.snapshot().devices.map((device) => device.label), ["Charybdis (4x6) Splinky"], "alone, no number");
    const two = new Service({adapter: new Fake({devices: [{id: "a", product: "Charybdis (4x6) Splinky"}, {id: "b", product: "Charybdis (4x6) Splinky"}]})});
    await two.enumerate();
    assert.deepEqual(two.snapshot().devices.map((device) => device.label), ["Keyboard 1 · Charybdis (4x6) Splinky", "Keyboard 2 · Charybdis (4x6) Splinky"]);
    const serial = new Service({adapter: new Fake({devices: [{id: "a", product: "Charybdis", serialNumber: "E4"}, {id: "b", product: "Charybdis", serialNumber: "DE"}]})});
    await serial.enumerate();
    assert.deepEqual(serial.snapshot().devices.map((device) => device.label), ["Charybdis · E4", "Charybdis · DE"]);
    const alone = new Service({adapter: new Fake({devices: [{id: "a", product: "Charybdis", serialNumber: "E4"}]})});
    await alone.enumerate();
    assert.deepEqual(alone.snapshot().devices.map((device) => device.label), ["Charybdis"], "a serial number only tells two of the same name apart");
});

test("keyboards with names of their own are listed by them, numbered only where two read alike", async () => {
    const {ProfileDeviceService: Service} = require("../../core/session/profile-device-service");
    const {FakeDeviceAdapter: Fake} = require("../../core/transport/fake-device-adapter");
    const adapter = new Fake({devices: [{id: "a", product: "Work board"}, {id: "b", product: "Charybdis (4x6) Splinky"}, {id: "c", product: "Charybdis (4x6) Splinky"}]});
    const service = new Service({adapter});
    await service.enumerate();
    assert.deepEqual(service.snapshot().devices.map((device) => device.label), ["Work board", "Keyboard 2 · Charybdis (4x6) Splinky", "Keyboard 3 · Charybdis (4x6) Splinky"]);
    // One reconnects under a new name: nothing reads alike any more.
    adapter.devices = [{id: "a", product: "Work board"}, {id: "b", product: "Charybdis (4x6) Splinky"}, {id: "d", product: "Home board"}];
    await service.enumerate();
    assert.deepEqual(service.snapshot().devices.map((device) => device.label), ["Work board", "Charybdis (4x6) Splinky", "Home board"]);
});

test("a replugged keyboard takes back the number that came free, so two keyboards are always 1 and 2", async () => {
    const {ProfileDeviceService: Service} = require("../../core/session/profile-device-service");
    const {FakeDeviceAdapter: Fake} = require("../../core/transport/fake-device-adapter");
    const adapter = new Fake({devices: [{id: "a", product: "Charybdis"}, {id: "b", product: "Charybdis"}]});
    const service = new Service({adapter});
    const labels = async () => {await service.enumerate(); return service.snapshot().devices.map((device) => device.label);};
    assert.deepEqual(await labels(), ["Keyboard 1 · Charybdis", "Keyboard 2 · Charybdis"]);
    adapter.devices = [{id: "b", product: "Charybdis"}];
    assert.deepEqual(await labels(), ["Charybdis"], "alone, no number");
    // Replugged, a keyboard is a new device to the browser.
    adapter.devices = [{id: "b", product: "Charybdis"}, {id: "c", product: "Charybdis"}];
    assert.deepEqual(await labels(), ["Keyboard 2 · Charybdis", "Keyboard 1 · Charybdis"], "the one still listed keeps its number");
});
