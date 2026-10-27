// @ts-check
"use strict";
// Ark's live edits through the selected firmware's production edit channel
// and working copy (live-edit-probe.c): Ark's own coordinator sends each edit,
// and the working copy must equal, byte for byte, what Ark's splicing says it
// is. Then refusals Ark relies on, and every reply layout and status flag
// through Ark's decoders. Scan opportunities are simulated; nothing here
// predicts device timing.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const {spawn} = require("node:child_process");
const {createInterface} = require("node:readline");
const {LiveEditCoordinator} = require("../../core/session/live-edit-coordinator");
const {applySplices, diffProfiles} = require("../../core/schema/profile-splices");
const {PROFILE_DOMAIN_VERSIONS} = require("../../core/schema/profile-domains");
const {crc32, decodeProfileBlob, encodeProfileBlob, PROFILE_DOMAIN_IDS} = require("../../core/schema/profile-blob-v1");
const {decodeSettings, encodeSettings} = require("../../core/schema/settings-domain-v1");
const {decodeCapabilityPages} = require("../../core/protocol/profile-wire-v1");
const {PROFILE_EDIT_V1, EDIT_RESULT, EDIT_RESULT_NAMES, EDIT_FLAGS, EDIT_PHASE, buildEditBeginRequest, buildEditSpliceRequest, buildEditDataRequest, buildEditCommitRequest,
    buildEditAbortRequest, buildSaveRequest, buildEditModeRequest, buildRestartRequest, sendEditRequest, readEditStatus, readEditProgress, readEditMode, readRuntime,
    readActiveProfile} = require("../../core/protocol/profile-edit-v1");
const {validateSnapshot} = require("../../core/model/portable-profile");
const {document32, CAPABILITIES_32} = require("../fixtures/pointing-slots-32");
const {editLayers} = require("../fixtures/profile-document");
const {MATRIX_ROWS, MATRIX_COLUMNS} = require("../../core/data/charybdis-layout");

const [bin, directory, contractFile] = process.argv.slice(2);
/** @type {{capabilityPages: string[]}} */
const contract = JSON.parse(fs.readFileSync(contractFile, "utf8"));
const capabilities = decodeCapabilityPages(contract.capabilityPages.map(hex => Buffer.from(hex, "hex")));
const abi = CAPABILITIES_32.actionAbiDigest;
const positions = MATRIX_ROWS * MATRIX_COLUMNS;

/** @param {Buffer} bytes @param {(settings: ReturnType<typeof decodeSettings>) => void} change */
function editSettings(bytes, change) {
    const profile = decodeProfileBlob(bytes), settings = profile.domains.find(d => d.id === PROFILE_DOMAIN_IDS.SETTINGS);
    assert(settings, "The corpus profile holds settings.");
    const decoded = decodeSettings(settings.payload); change(decoded);
    settings.payload = encodeSettings(decoded);
    return encodeProfileBlob(profile);
}
/** @param {Buffer} bytes @param {(layers: number[][]) => void} change */
function withLayers(bytes, change) {
    const document = {...document32(), profile: bytes.toString("base64")};
    editLayers(document, change);
    return Buffer.from(document.profile, "base64");
}
/** @param {Buffer} bytes @param {number} id */
function without(bytes, id) {
    const profile = decodeProfileBlob(bytes);
    profile.domains = profile.domains.filter(domain => domain.id !== id);
    return encodeProfileBlob(profile);
}

/** @param {string} label @param {Buffer} saved */
async function probe(label, saved) {
    const input = path.join(directory, `${label}-saved.bin`);
    fs.writeFileSync(input, saved);
    const child = spawn(bin, [input, String(abi), String(positions)], {stdio: ["pipe", "pipe", "inherit"]});
    /** @type {string[]} */
    const lines = [];
    /** @type {{resolve: (line: string) => void, reject: (error: Error) => void}[]} */
    const listeners = [];
    const reader = createInterface({input: child.stdout});
    reader.on("line", line => {const listener = listeners.shift(); if (listener) listener.resolve(line); else lines.push(line);});
    child.on("exit", code => {for (const listener of listeners.splice(0)) listener.reject(Error(`Probe exited ${code}`));});
    const next = () => {
        const line = lines.shift();
        return line !== undefined ? Promise.resolve(line) : /** @type {Promise<string>} */ (new Promise((resolve, reject) => listeners.push({resolve, reject})));
    };
    /** @param {string} line */
    const exchange = line => {child.stdin.write(line + "\n"); return next();};
    assert.equal(await next(), "ready");
    /** @type {import("../../core/transport/types.js").RequestConnection} */
    const connection = {request: async (report, options) => {
        const frame = Buffer.from(report);
        const answer = await exchange(frame.toString("hex"));
        assert.notEqual(answer, "unhandled", `the edit channel handles ${frame.subarray(0, 3).toString("hex")}`);
        const response = Buffer.from(answer, "hex");
        assert(options?.matchResponse, "Ark supplies a response matcher.");
        assert.equal(options.matchResponse(response, frame), true, "the reply correlates with its request");
        return response;
    }};
    let id = 1;
    const ids = {next: () => (id = id === 255 ? 1 : id + 1)};
    const coordinator = new LiveEditCoordinator(connection, {requestIds: ids,
        sleep: async () => {assert.match(await exchange("scan"), /^(ok|busy)$/);}, timing: {busyMs: 0, catchUpMs: 0}});
    return {
        coordinator, connection, options: {nextRequestId: () => ids.next()},
        read: async () => Buffer.from(await exchange("read"), "hex"),
        scan: async () => assert.match(await exchange("scan"), /^(ok|busy)$/),
        /** @param {string} name @param {number} value */
        set: async (name, value) => assert.equal(await exchange(`set ${name} ${value}`), "ok", name),
        saved: async () => (await exchange("saved")).split(" ").map(word => parseInt(word, 16)),
        restarts: async () => Number(await exchange("restarts")),
        close: () => {child.stdin.end(); child.kill(); reader.close();},
    };
}

/** @param {Awaited<ReturnType<typeof probe>>} keyboard @param {Buffer} to @param {{replace?: boolean, defaults?: Buffer}} [options] */
async function edit(keyboard, to, {replace = false, defaults} = {}) {
    const from = await keyboard.read(), progress = await readEditProgress(keyboard.connection, keyboard.options);
    const result = await keyboard.coordinator.post({from, to, defaults, identity: progress, capacity: replace ? 1 : 130048, replaceWhenLarge: replace});
    const working = await keyboard.read();
    assert.ok(working.equals(result.bytes), "the working copy is the bytes Ark records");
    assert.ok(working.equals(to), "the working copy is the profile Ark sent");
    if (!replace) assert.ok(applySplices(from, diffProfiles(from, to, {defaults}), {versions: PROFILE_DOMAIN_VERSIONS}).equals(working), "C and Ark splice alike");
    assert.equal(result.revision, progress.revision + 1);
    return result;
}

(async () => {
    const ordinary = validateSnapshot(document32(), CAPABILITIES_32).candidate;
    assert.ok(capabilities.featureFlags !== undefined, "the firmware's capability pages decode");

    // Edits: one domain; several domains at once; a stream split across many
    // 22-byte data reports; a domain created; a whole replacement.
    let keyboard = await probe("edits", ordinary);
    try {
        const one = withLayers(ordinary, layers => {layers[0][1] = 0x05;});
        await edit(keyboard, one);
        const many = editSettings(withLayers(one, layers => {for (let key = 0; key < 30; key++) layers[2][key] = 0x04 + (key % 20);}), settings => {settings.names[0] = "Bridge";});
        const sent = diffProfiles(one, many);
        assert.ok(sent.splices.length >= 2, "a multi-domain edit");
        assert.ok(sent.stream.length > 2 * PROFILE_EDIT_V1.DATA_MAX && sent.stream.length % PROFILE_EDIT_V1.DATA_MAX !== 0, "its stream crosses several data reports");
        await edit(keyboard, many);
        const status = await readEditStatus(keyboard.connection, keyboard.options);
        assert.equal(status.activeLength, many.length, "status page 2 says the working copy's length");
        assert.equal(status.unsaved, true);
        const active = await readActiveProfile(keyboard.connection, {...keyboard.options, maxLength: 130048});
        assert.ok(active.bytes.equals(many), "GET 0x21 reads the working copy back");
        assert.deepEqual([active.metadata.session, active.metadata.revision, active.metadata.unsaved], [status.session, status.revision, true]);
        // Save names the identity Ark reviewed.
        await keyboard.coordinator.send(buildSaveRequest(0x0bb0, status));
        assert.deepEqual(await keyboard.saved(), [0x0bb0, status.session, status.revision]);
        // Revert, then a replacement (only with nothing unsaved).
        const reverted = await keyboard.coordinator.revert(status);
        assert.equal(reverted.unsaved, false);
        assert.ok((await keyboard.read()).equals(ordinary), "Revert runs the saved profile again");
        await edit(keyboard, many, {replace: true});
        console.log(`edits: one domain, ${sent.splices.length} domains in one edit (${sent.stream.length} bytes in ${Math.ceil(sent.stream.length / PROFILE_EDIT_V1.DATA_MAX)} data reports), a replacement: exact C working copy`);
    } finally {keyboard.close();}

    const lacking = without(ordinary, PROFILE_DOMAIN_IDS.COMBOS);
    keyboard = await probe("create", lacking);
    try {
        const sent = diffProfiles(lacking, ordinary);
        assert.ok(sent.splices.some(splice => splice.create), "a create splice");
        await edit(keyboard, ordinary);
        console.log("create: a domain the working copy lacked is created as Ark splices it");
    } finally {keyboard.close();}

    // Refusals Ark relies on.
    keyboard = await probe("refusals", ordinary);
    try {
        const {coordinator, options, connection} = keyboard;
        const to = editSettings(withLayers(ordinary, layers => {layers[0][2] = 0x06; layers[3][0] = 0x07;}), settings => {settings.names[0] = "Refusals";});
        const {splices, stream} = diffProfiles(ordinary, to);
        assert.ok(splices.length > 1);
        let progress = await readEditProgress(connection, options);
        /** @param {number} transaction */
        const begin = async (transaction, total = stream.length, count = splices.length) =>
            (await coordinator.send(buildEditBeginRequest(transaction, {...progress, splices: count, insertTotal: total}))).resultName;
        assert.equal(await begin(0x11), "OK");
        assert.equal(await begin(0x12), "BUSY", "a new edit while one is received is BUSY");
        assert.equal((await coordinator.send(buildEditSpliceRequest(0x11, 1, splices[1]))).resultName, "OUT_OF_ORDER", "splices arrive in order");
        assert.equal((await coordinator.send(buildEditAbortRequest(0x11))).resultName, "OK");
        // Two splices in one domain that overlap.
        progress = await readEditProgress(connection, options);
        const overlapping = [{domainId: PROFILE_DOMAIN_IDS.KEYMAP, offset: 10, remove: 4, insert: 2}, {domainId: PROFILE_DOMAIN_IDS.KEYMAP, offset: 12, remove: 2, insert: 2}];
        assert.equal(await begin(0x13, 4, 2), "OK");
        assert.equal((await coordinator.send(buildEditSpliceRequest(0x13, 0, overlapping[0]))).resultName, "OK");
        // Refused when the splice arrives, or when the commit plans the edit.
        let refusal = (await coordinator.send(buildEditSpliceRequest(0x13, 1, overlapping[1]))).resultName;
        if (refusal === "OK") {
            await coordinator.expect(buildEditDataRequest(0x13, 0, Buffer.from([4, 0, 5, 0])), "data");
            refusal = (await coordinator.send(buildEditCommitRequest(0x13, Buffer.from([4, 0, 5, 0])))).resultName;
            if (refusal === "QUEUED") {await keyboard.scan(); refusal = EDIT_RESULT_NAMES[(await readEditProgress(connection, options)).lastResult];}
        } else await coordinator.send(buildEditAbortRequest(0x13));
        assert.ok(["INVALID_SPLICE", "OUT_OF_ORDER"].includes(refusal), `overlapping splices are refused (${refusal})`);
        assert.throws(() => applySplices(ordinary, {splices: overlapping, stream: Buffer.alloc(4)}, {versions: PROFILE_DOMAIN_VERSIONS}), "Ark refuses them too");
        assert.ok((await keyboard.read()).equals(ordinary), "nothing changed");
        // Too large to stage beside the profile.
        progress = await readEditProgress(connection, options);
        assert.equal(await begin(0x14, 200000, 1), "CAPACITY_EXCEEDED");
        // A damaged stream fails the commit's CRC.
        assert.equal(await begin(0x15), "OK");
        for (const [index, splice] of splices.entries()) assert.equal((await coordinator.send(buildEditSpliceRequest(0x15, index, splice))).resultName, "OK");
        for (let offset = 0; offset < stream.length; offset += PROFILE_EDIT_V1.DATA_MAX) {
            assert.equal((await coordinator.send(buildEditDataRequest(0x15, offset, stream.subarray(offset, offset + PROFILE_EDIT_V1.DATA_MAX)))).resultName, "OK");
        }
        const damaged = Buffer.from(stream); damaged[0] ^= 1;
        assert.equal((await coordinator.send(buildEditCommitRequest(0x15, damaged))).resultName, "CHECKSUM_MISMATCH");
        assert.equal(crc32(stream) !== crc32(damaged), true);
        // A stale identity.
        assert.equal((await coordinator.send(buildEditBeginRequest(0x16, {session: progress.session, revision: progress.revision + 5, splices: 1, insertTotal: 1}))).resultName, "STALE");
        console.log("refusals: BUSY while receiving, out-of-order and overlapping splices, too large, a damaged stream, a stale identity");

        // Every status flag, the slave half's page, the mode and runtime pages.
        const flagFields = /** @type {const} */ ([["peer_required", "slaveRequired", EDIT_FLAGS.PEER_REQUIRED], ["halves_agree", "slaveConverged", EDIT_FLAGS.PEER_CONVERGED],
            ["peer_known", "slaveKnown", EDIT_FLAGS.PEER_KNOWN], ["edits_blocked", "editsBlocked", EDIT_FLAGS.EDITS_BLOCKED], ["saved_compiled", "savedCompiled", EDIT_FLAGS.SAVED_COMPILED],
            ["save_phase", "saving", EDIT_FLAGS.SAVING], ["mode_conflict", "modeConflict", EDIT_FLAGS.MODE_CONFLICT], ["storage_paused", "storagePaused", EDIT_FLAGS.STORAGE_PAUSED],
            ["peer_storage_paused", "slaveStoragePaused", EDIT_FLAGS.PEER_STORAGE_PAUSED], ["peer_refused", "slaveRefused", EDIT_FLAGS.PEER_REFUSED], ["mode_store_failed", "modeNotStored", EDIT_FLAGS.MODE_NOT_STORED], ["adjustment_pending", "adjustmentPending", EDIT_FLAGS.ADJUSTMENT_PENDING],
            ["stopped", "stopped", EDIT_FLAGS.STOPPED], ["peer_stopped", "slaveStopped", EDIT_FLAGS.PEER_STOPPED]]);
        for (const name of ["peer_required", "halves_agree", "peer_known", "edits_blocked", "saved_compiled", "save_phase", "mode_conflict", "storage_paused", "peer_storage_paused", "peer_refused", "mode_store_failed", "adjustment_pending", "stopped", "peer_stopped"]) await keyboard.set(name, 0);
        let seen = 0;
        for (const [field, key, bit] of flagFields) {
            await keyboard.set(field, 1);
            const read = await readEditProgress(connection, options);
            assert.equal(read[key], true, key); assert.equal(read.flags & bit, bit);
            const reply = await sendEditRequest(connection, buildEditAbortRequest(0x77), options);
            assert.equal(reply.flags & bit, bit, `the SET reply carries ${key}`);
            seen |= read.flags;
            await keyboard.set(field, 0);
        }
        // Unsaved (bit 0) and waiting for a safe boundary (bit 8): a real edit
        // published only once no key is held.
        progress = await readEditProgress(connection, options);
        await keyboard.set("safe_reasons", 1);
        assert.equal(await begin(0x18), "OK");
        for (const [index, splice] of splices.entries()) await coordinator.expect(buildEditSpliceRequest(0x18, index, splice), "splice");
        for (let offset = 0; offset < stream.length; offset += PROFILE_EDIT_V1.DATA_MAX) await coordinator.expect(buildEditDataRequest(0x18, offset, stream.subarray(offset, offset + PROFILE_EDIT_V1.DATA_MAX)), "data");
        assert.equal((await coordinator.send(buildEditCommitRequest(0x18, stream))).resultName, "QUEUED");
        await keyboard.scan();
        const waiting = await readEditProgress(connection, options);
        assert.deepEqual([waiting.phase, waiting.waitingSafe], [EDIT_PHASE.WAITING_SAFE, true], "held keys keep the edit waiting");
        seen |= waiting.flags;
        await keyboard.set("safe_reasons", 0);
        await keyboard.scan();
        const published = await readEditProgress(connection, options);
        assert.deepEqual([published.lastResult, published.unsaved], [EDIT_RESULT.OK, true]);
        assert.ok((await keyboard.read()).equals(to));
        seen |= published.flags;
        assert.equal(seen, 0xffff, "every status flag reached Ark's decoder");
        // Restart (D-F34): Ark's frame through the firmware's channel, its
        // confirmation checked there, the answer's byte 17 decoded here.
        await keyboard.set("stopped", 1);
        assert.deepEqual(await coordinator.restart(), {slaveAcknowledged: true}, "taken while stopped");
        await keyboard.set("restart_acknowledged", 0);
        assert.deepEqual(await coordinator.restart(), {slaveAcknowledged: false});
        const stray = buildRestartRequest(0x22); stray[8] ^= 1;
        assert.equal((await sendEditRequest(connection, stray, options)).resultName, "INVALID_ARGUMENT", "a wrong confirmation restarts nothing");
        assert.equal(await keyboard.restarts(), 2);
        await keyboard.set("stopped", 0);
        console.log("restart: the confirmed frame is taken in any state, a wrong confirmation is refused, and the answer says whether the slave half took it");
        for (const [name, value] of /** @type {[string, number][]} */ ([["peer_phase", 1], ["peer_last_result", EDIT_RESULT.ABORTED], ["peer_transaction", 0x4321], ["peer_session", 0x5e550001], ["peer_revision", 9],
            ["peer_flags", 3], ["peer_mode", 1], ["save_last_result", EDIT_RESULT.PUBLICATION_FAILED], ["save_last_error", 9], ["save_last_transaction", 0x0bb0],
            ["saved_generation", 42], ["saved_origin", 1], ["peer_mode_counter", 7], ["peer_known", 1], ["mode_conflict", 1]])) await keyboard.set(name, value);
        const status = await readEditStatus(connection, options);
        assert.deepEqual(status.slave, {phase: 1, lastResult: EDIT_RESULT.ABORTED, transactionId: 0x4321, session: 0x5e550001, revision: 9, unsaved: true, savedCompiled: true, mode: 1});
        assert.deepEqual([status.save.lastResult, status.save.lastError, status.save.lastTransactionId, status.savedGeneration, status.savedOrigin], [EDIT_RESULT.PUBLICATION_FAILED, 9, 0x0bb0, 42, 1]);
        assert.equal(status.phase, EDIT_PHASE.IDLE);
        const mode = await readEditMode(connection, options);
        assert.deepEqual([mode.mode, mode.slaveMode, mode.slaveCounter, mode.slaveKnown, mode.conflict, mode.agreed], [2, 1, 7, true, true, false]);
        await keyboard.set("mode_conflict", 0);
        assert.equal((await coordinator.send(buildEditModeRequest(0x21, 0))).resultName, "NOT_CLEAN", "the mode waits for Save or Revert");
        for (const [name, value] of /** @type {[string, number][]} */ ([["combos_master", 1], ["combos_override", 0], ["behaviours_master", 1], ["behaviours_override", 1], ["default_dpi", 1600], ["rgb_color", 0xc8ff55],
            ["default_layers", 5], ["keymap_options", 3]])) await keyboard.set(name, value);
        const runtime = await readRuntime(connection, options);
        assert.deepEqual([runtime.combos, runtime.behaviours], [{master: true, override: false}, {master: true, override: true}]);
        assert.deepEqual([runtime.live.defaultDpi, runtime.live.rgbColor, runtime.live.defaultLayers, runtime.live.keymapOptions], [1600, 0xc8ff55, 5, 3]);
        console.log("replies: the SET reply, status pages 0-2, the active profile's page 0, the mode and runtime pages, and flag bits 0-15 decode in Ark");
    } finally {keyboard.close();}
})().catch(error => {console.error(error); process.exitCode = 1;});
