// @ts-check
"use strict";

// A keyboard with a working copy (firmware D-F32), at the same report seam as
// fake-keyboard: live edits, Save, Revert, the edit mode, the runtime
// toggles, and the reads that show them. It models what the host sees, not
// the firmware's scheduling: an edit is checked and published when its commit
// arrives, the slave half follows at once unless told to lag, and Save writes
// a new generation at once. In Live edit the keyboard's own save happens when
// a test says the quiet period passed (`autoSave()`), or, for the preview and
// browser tests, after `autoSaveAfterReads` reads of its status. Every read it
// does not own goes to a read-only fake keyboard built from what it runs now,
// so a complete read reproduces it.
//
// It keeps the firmware's rules a host can trip over: a new begin while an
// edit is being received is BUSY; an edit being received holds a 15 s lease
// on the fake's clock (`elapse`); Revert aborts an edit being received; an
// edit the slave half refuses is sent to it once more as a whole copy, and
// refused again leaves the halves apart (flag 11) until a Revert, with Save
// and new edits BUSY meanwhile.
//
// Held keys (`hold(reasons)`, page 2's safe-boundary bits; bit 0 a key):
// a checked edit then waits in phase 4, and a Revert in phase 5, with flag 8
// set, until `release()` publishes it, as the firmware does once nothing is
// held. Abort ends a waiting edit; a waiting Revert answers it BUSY.
// `faults.checking` leaves an edit in phase 3 instead, until `release()`.
//
// A stopped keyboard (firmware D-F34: `raised.stopped`, `raised.slaveStopped`)
// says so in its flags and answers every SET but a restart INVALID_STATE. A
// restart (SET 0x28 with "REST") answers, then boots as from power: what it
// saved runs, nothing unsaved, a new session; `onRestart` is called just
// after, so a test can drop the connection as USB would.

const assert = require("node:assert/strict");
const {fakeKeyboard} = require("./fake-keyboard");
const {createSnapshot, validateSnapshot} = require("../../core/model/portable-profile");
const {crc32} = require("../../core/schema/profile-blob-v1");
const {applySplices} = require("../../core/schema/profile-splices");
const {PROFILE_DOMAIN_VERSIONS} = require("../../core/schema/profile-domains");
const {SETTING} = require("../../core/schema/settings-domain-v1");
const {PROFILE_WIRE_V1, PROFILE_ACTIVE_KIND, PROFILE_STATE_FLAGS} = require("../../core/protocol/profile-wire-v1");
const {PROFILE_CANDIDATE_V1: C, CANDIDATE_ADMISSION: A, CANDIDATE_ERROR: CE} = require("../../core/protocol/profile-candidate-v1");
const {PROFILE_EDIT_V1: E, EDIT_RESULT: R, EDIT_FLAGS: F, EDIT_PHASE} = require("../../core/protocol/profile-edit-v1");

/** @typedef {{loseReply?: number, busy?: number, refuse?: number, slaveLag?: number, stale?: boolean, saveFails?: number, slaveRefuses?: number, slaveCatchUp?: number, savePauses?: number, modeWriteFails?: boolean, modeReadFails?: number, lengthSkew?: number, checking?: boolean, autoSaveFails?: number, restartUnacknowledged?: boolean, noRestart?: boolean, stopsAgain?: boolean, workingReadFails?: boolean, slaveAbsent?: boolean}} LiveFaults */
const LEASE_MS = 15000;

/** @param {import('./types.js').FakeKeyboardOptions & {mode?: number, session?: number, combosOverride?: boolean, behavioursOverride?: boolean, autoSaveAfterReads?: number, quietMs?: number}} options */
function liveKeyboard(options) {
    const actionAbiDigest = options.document.actionAbiDigest;
    const compiled = options.compiled || validateSnapshot(options.document).candidate;
    let saved = /** @type {Buffer<ArrayBufferLike>} */ (Buffer.from(validateSnapshot(options.document).candidate)), generation = options.compiledOnly ? 0 : options.generation ?? 42;
    /** @type {Buffer<ArrayBufferLike> | null} */
    let working = null;
    let session = options.session ?? 0x5e550001, revision = 0, mode = options.mode ?? 2, modeCounter = 1;
    let lastResult = 0, lastTransaction = 0, slaveBehind = 0, slaveRefused = false, modeNotStored = false, modeConflict = false, clock = 0;
    /** @type {{transaction: number, session: number, revision: number, count: number, total: number, replacement: boolean, splices: import('../../core/protocol/types.js').EditSplice[], stream: Buffer, received: number, touched: number} | null} */
    let pending = null;
    // Keys held (page 2's reasons), and the committed edit or Revert they hold.
    let held = 0;
    /** @type {{kind: "edit" | "revert", transaction: number, phase: number, result?: Buffer} | null} */
    let waiting = null;
    const save = {phase: 0, lastResult: 0, lastError: 0, lastTransactionId: 0, pauses: 0};
    // The keyboard's own saves (edit status page 3), and status flags a test
    // raises directly: the slave half refusing, storage waiting, the mode
    // unstored (beside the faults that bring them about).
    const auto = {inProgress: false, lastWasAutomatic: false, count: 0, revision: 0, generation: 0, quietReads: 0, transaction: 0x8000};
    const raised = {slaveRefused: false, slaveStoragePaused: false, modeNotStored: false, adjustmentPending: false, stopped: false, slaveStopped: false};
    const overrides = {combos: options.combosOverride ?? true, behaviours: options.behavioursOverride ?? true};
    /** @type {LiveFaults} */
    const faults = {};
    /** @type {Buffer[]} */
    const requests = [];
    /** @type {Buffer[]} */
    const mutations = [];
    /** @type {Buffer[]} */
    const unhandled = [];
    /** @type {string[]} */
    const events = [];
    const active = () => working || saved;
    const reader = () => fakeKeyboard({...options, document: createSnapshot({profile: active(), actionAbiDigest}), compiled, compiledOnly: !working && generation === 0, generation});
    const stored = () => fakeKeyboard({...options, document: createSnapshot({profile: saved, actionAbiDigest}), compiled, compiledOnly: generation === 0, generation});
    let cached = reader(), savedCached = stored();
    const savedReader = () => savedCached;
    const refreshReader = () => {cached = reader(); savedCached = stored();};
    // The keyboard's own save, as after its quiet period: in Live edit (or in
    // Review and save for key adjustments) it writes what it runs, once per
    // revision.
    function autoSave() {
        if (!working || raised.slaveRefused || slaveRefused) return false;
        auto.transaction++; save.lastTransactionId = auto.transaction; auto.lastWasAutomatic = true;
        if (faults.autoSaveFails) {save.lastResult = faults.autoSaveFails; save.lastError = 9; delete faults.autoSaveFails; events.push("auto-save failed"); return false;}
        saved = working; working = null; generation++; save.lastResult = R.OK; save.lastError = 0;
        auto.count++; auto.revision = revision; auto.generation = generation; refreshReader(); events.push("auto-saved");
        return true;
    }
    // A save of the keyboard's own that is running until `autoSave()` ends it.
    const startAutoSave = () => {auto.inProgress = true;};
    /** @type {{restarts: number, onRestart?: () => void}} */
    const restarting = {restarts: 0};
    const keyboard = {requests, mutations, unhandled, events, faults, overrides, raised, answer, startAutoSave, restarting,
        autoSave() {auto.inProgress = false; return autoSave();},
        get working() {return working && Buffer.from(working);}, get saved() {return Buffer.from(saved);},
        get session() {return session;}, get revision() {return revision;}, get mode() {return mode;}, get generation() {return generation;},
        get receiving() {return pending?.transaction ?? 0;}, get slaveRefused() {return slaveRefused;},
        // The halves stored different modes (equal counters that disagree).
        get modeConflict() {return modeConflict;}, set modeConflict(value) {modeConflict = value;},
        // A replug: a new session, the saved profile running again.
        replug() {working = null; revision = 0; session = (session + 1) >>> 0; pending = null; waiting = null; slaveBehind = 0; slaveRefused = false; overrides.combos = true; overrides.behaviours = true; refreshReader(); events.push("replug");},
        // Time passing on the keyboard's clock (the edit lease).
        elapse(/** @type {number} */ ms) {clock += ms;},
        // Keys held on the keyboard, and their release, which publishes what
        // they held.
        hold(/** @type {number} */ reasons = 1) {held = reasons;},
        release() {
            held = 0;
            const done = waiting; waiting = null;
            if (done?.kind === "edit" && done.result) {lastTransaction = done.transaction; publish(done.result);}
            else if (done?.kind === "revert") revertNow(done.transaction);
        },
        get waiting() {return waiting?.kind ?? null;},
        // Another client's edit (or, later, an adjustment key): the revision moves.
        externalEdit(/** @type {Buffer} */ bytes) {working = Buffer.from(bytes); revision++; auto.quietReads = 0; refreshReader(); events.push("external edit");},
    };
    // faults.slaveAbsent: the slave half is unplugged (flag 3 clear).
    const flags = () => (working ? F.UNSAVED : 0) | F.PEER_REQUIRED | (faults.slaveAbsent ? 0 : F.PEER_KNOWN) | (slaveBehind || slaveRefused || faults.slaveAbsent ? 0 : F.PEER_CONVERGED) | (generation === 0 ? F.SAVED_COMPILED : 0)
        | (slaveBehind || slaveRefused || pending || waiting ? F.EDITS_BLOCKED : 0) | (waiting && held && waiting.phase !== EDIT_PHASE.VALIDATING ? F.WAITING_SAFE : 0) | (save.pauses ? F.SAVING | F.PEER_STORAGE_PAUSED : 0) | (auto.inProgress ? F.SAVING | F.EDITS_BLOCKED : 0) | (slaveRefused ? F.PEER_REFUSED : 0) | (modeNotStored ? F.MODE_NOT_STORED : 0)
        | (raised.slaveStoragePaused ? F.PEER_STORAGE_PAUSED : 0) | (raised.slaveRefused ? F.PEER_REFUSED : 0) | (raised.modeNotStored ? F.MODE_NOT_STORED : 0) | (raised.adjustmentPending ? F.ADJUSTMENT_PENDING | F.EDITS_BLOCKED : 0)
        | (raised.stopped ? F.STOPPED | F.EDITS_BLOCKED : 0) | (raised.slaveStopped ? F.PEER_STOPPED | F.EDITS_BLOCKED : 0);
    // The lease: an edit being received with nothing accepted for 15 s ends.
    function expire() {
        if (!pending || clock - pending.touched <= LEASE_MS) return;
        lastTransaction = pending.transaction; lastResult = R.ABORTED; pending = null; events.push("lease expired");
    }
    const phase = () => pending ? EDIT_PHASE.RECEIVING : waiting ? waiting.phase : EDIT_PHASE.IDLE;
    /** @param {Buffer} request @param {Buffer} payload */
    function page(request, payload) {
        const reply = Buffer.from(request); reply.fill(0, 5); reply[6] = payload.length; payload.copy(reply, PROFILE_WIRE_V1.PAYLOAD_OFFSET); return reply;
    }
    /** @param {Buffer} request @param {number} result */
    function reply(request, result) {
        const answer = Buffer.from(request); answer.fill(0, 5);
        answer[5] = result; answer[6] = phase();
        answer.writeUInt32LE(session, 7); answer.writeUInt32LE(revision, 11); answer.writeUInt16LE(flags(), 15);
        return answer;
    }
    function statusPage0() {
        if (slaveBehind && !slaveRefused) slaveBehind--;
        if (options.autoSaveAfterReads && mode === 1 && working && ++auto.quietReads >= options.autoSaveAfterReads) {auto.quietReads = 0; autoSave();}
        const p = Buffer.alloc(25); p[0] = E.STATUS_LAYOUT; p[1] = phase(); p.writeUInt16LE(flags(), 2);
        p.writeUInt32LE(session, 4); p.writeUInt32LE(revision, 8); p.writeUInt32LE(generation, 12); p[16] = generation ? 0 : 255;
        p[17] = lastResult; p.writeUInt16LE(lastTransaction, 18); p.writeUInt16LE(pending?.transaction ?? waiting?.transaction ?? 0, 20); p[22] = mode; return p;
    }
    function statusPage1() {
        const p = Buffer.alloc(25); p.writeUInt32LE(session, 4); p.writeUInt32LE(slaveBehind || slaveRefused ? revision - 1 : revision, 8); p[12] = working ? 1 : 0;
        // A save waiting for a quiet keyboard on the slave half stays in
        // progress for a few reads.
        if (save.pauses) save.pauses--;
        p[13] = save.pauses ? 1 : 0; p[14] = save.lastResult; p[15] = save.lastError; p.writeUInt16LE(save.pauses ? save.lastTransactionId : 0, 16);
        p.writeUInt16LE(save.pauses ? 0 : save.lastTransactionId, 18); p[24] = mode; return p;
    }
    // Page 2: where the last refusal failed (nothing here), what keeps the
    // keyboard from a safe boundary, and how long the profile it runs is.
    function statusPage2() {
        const p = Buffer.alloc(25); p.writeUInt32LE(held, 14); p.writeUInt32LE(active().length + (faults.lengthSkew ?? 0), 18); delete faults.lengthSkew; return p;
    }
    function statusPage3() {
        const p = Buffer.alloc(25); p[0] = E.AUTO_SAVE_LAYOUT; p[1] = (auto.inProgress ? 1 : 0) | (auto.lastWasAutomatic ? 2 : 0);
        p.writeUInt32LE(auto.count, 2); p.writeUInt32LE(auto.revision, 6); p.writeUInt32LE(auto.generation, 10); p.writeUInt16LE(options.quietMs ?? 3000, 14); return p;
    }
    /** @param {Uint8Array} report */
    function answer(report) {
        const request = Buffer.from(report); requests.push(request);
        const set = request[0] === E.COMMAND_SET && request[1] === 0 && request[2] >= 0x20 && request[2] <= E.VALUE_RESTART;
        if (set) mutations.push(request);
        const response = serve(request);
        // A lost answer: the keyboard took the report, the host hears nothing.
        if (set && faults.loseReply === request[2]) {delete faults.loseReply; return [];}
        return [response];
    }
    // Restart (firmware D-F34): answered, then the keyboard boots again.
    /** @param {Buffer} r */
    function restart(r) {
        if (faults.noRestart) {const response = Buffer.from(r); response[0] = 0xff; unhandled.push(r); return response;}
        if (r.readUInt16LE(3) === 0 || r.readUInt32LE(5) !== E.RESTART_CONFIRM || r.subarray(9).some(byte => byte !== 0)) return reply(r, R.INVALID_ARGUMENT);
        const response = reply(r, R.OK);
        response[17] = faults.restartUnacknowledged ? 0 : 1;
        const stops = Boolean(faults.stopsAgain);
        delete faults.restartUnacknowledged; delete faults.stopsAgain;
        working = null; revision = 0; session = (session + 1) >>> 0; pending = null; waiting = null; slaveBehind = 0; slaveRefused = false;
        overrides.combos = true; overrides.behaviours = true; raised.stopped = stops; raised.slaveStopped = false;
        restarting.restarts++; refreshReader(); events.push("restart");
        setTimeout(() => restarting.onRestart?.(), 1);
        return response;
    }
    // A checked edit taking effect: the working copy and revision move.
    /** @param {Buffer} result */
    function publish(result) {
        working = result; revision++; lastResult = R.OK; slaveBehind = faults.slaveLag ?? 0; delete faults.slaveLag; auto.quietReads = 0;
        refreshReader(); events.push("published");
        // The slave half refuses the edit: the master half sends it the
        // whole working copy once (catching up for a few reads); refused
        // again, the halves stay apart.
        if (faults.slaveRefuses) {
            events.push("slave refused");
            if (faults.slaveRefuses > 1) {slaveRefused = true; events.push("halves apart");}
            else slaveBehind = Math.max(slaveBehind, faults.slaveCatchUp ?? 3);
            delete faults.slaveRefuses; delete faults.slaveCatchUp;
        }
    }
    /** @param {number} transaction */
    function revertNow(transaction) {working = null; revision++; lastTransaction = transaction; lastResult = R.OK; refreshReader(); events.push("reverted");}
    /** @param {Buffer} r */
    function serve(r) {
        if (raised.adjustmentPending && r[0] === C.COMMAND_SET && r[2] === C.VALUE_BEGIN) {
            const response = Buffer.from(r); response.fill(0, 5); response[5] = A.BUSY; response[6] = CE.MAILBOX_BUSY; response[7] = 255; return response;
        }
        if (r[0] === E.COMMAND_GET && r[1] === 0) {
            const at = r[4] | (r[5] << 8);
            expire();
            if (r[2] === E.VALUE_STATUS) return page(r, [statusPage0, statusPage1, statusPage2, statusPage3][at]());
            if (r[2] === E.VALUE_MODE) {
                if (faults.modeReadFails) {faults.modeReadFails--; return page(r, Buffer.alloc(3));}
                const p = Buffer.alloc(11); p[0] = mode; p.writeUInt32LE(modeCounter, 1); p[5] = modeConflict ? (mode === 0 ? 2 : 0) : mode; p.writeUInt32LE(modeCounter, 6);
                p[10] = 1 | (modeConflict ? 2 : 4); return page(r, p);
            }
            if (r[2] === E.VALUE_RUNTIME) {
                const values = validateSnapshot(createSnapshot({profile: active(), actionAbiDigest})).settings.values;
                const p = Buffer.alloc(24); p.set([values[SETTING.COMBOS_ENABLED] ? 1 : 0, overrides.combos ? 1 : 0, values[SETTING.BEHAVIORS_ENABLED] ? 1 : 0, overrides.behaviours ? 1 : 0]);
                return page(r, p);
            }
            if (r[2] === E.VALUE_ACTIVE) {
                if (faults.workingReadFails && at === 0) {delete faults.workingReadFails; return page(r, Buffer.alloc(3));}
                const bytes = active();
                if (at === 0) {
                    const p = Buffer.alloc(25); p.set([E.ACTIVE_LAYOUT, 25]); p.writeUInt32LE(bytes.length, 2); p.writeUInt32LE(session, 6); p.writeUInt32LE(revision, 10);
                    p.writeUInt32LE(generation, 14); p[18] = generation ? 0 : 255; p[19] = 0x7f; p[20] = working ? 1 : 0; return page(r, p);
                }
                return page(r, bytes.subarray((at - 1) * 25, at * 25));
            }
            // Status and the saved and compiled payloads are the saved
            // profile's; a working copy shows as active kind 4, its revision
            // in the digest. Combos, settings and the rest are what it runs.
            const source = r[2] === 2 || r[2] === 4 || r[2] === 5 ? savedReader() : cached;
            const response = source.answer(r)[0];
            if (r[2] === 2 && at === 0 && working) {
                response.writeUInt16LE(response.readUInt16LE(9) & ~PROFILE_STATE_FLAGS.ACTIVE_IS_COMPILED_DEFAULT, 9);
                response.writeUInt32LE(revision, 7 + 12); response[7 + 24] = PROFILE_ACTIVE_KIND.WORKING;
            }
            if (response[0] === 0xff) unhandled.push(r);
            return response;
        }
        if (r[0] !== E.COMMAND_SET || r[1] !== 0 || r[2] < 0x20 || r[2] > E.VALUE_RESTART) {const response = cached.answer(r)[0]; if (response[0] === 0xff) unhandled.push(r); return response;}
        if (r[2] === E.VALUE_RESTART) return restart(r);
        // Stopped: everything but a restart is refused (firmware D-F34); with
        // the slave half stopped this half's owner runs, and what needs both
        // halves is BUSY (flag 15) until a restart.
        if (raised.stopped) return reply(r, R.INVALID_STATE);
        if (raised.slaveStopped) return reply(r, R.BUSY);
        const transaction = r.readUInt16LE(3);
        // A queued key adjustment holds edits, Save and Revert; a mode change is
        // NOT_CLEAN, as with unsaved edits (Profile Wire admission).
        if (raised.adjustmentPending && /** @type {number[]} */ ([E.VALUE_BEGIN, E.VALUE_SAVE, E.VALUE_REVERT, E.VALUE_MODE]).includes(r[2])) return reply(r, r[2] === E.VALUE_MODE ? R.NOT_CLEAN : R.BUSY);
        expire();
        if (faults.busy === r[2]) {delete faults.busy; return reply(r, R.BUSY);}
        if (faults.stale && (r[2] === E.VALUE_BEGIN || r[2] === E.VALUE_SAVE || r[2] === E.VALUE_REVERT)) {delete faults.stale; revision++; return reply(r, R.STALE);}
        const identity = () => r.readUInt32LE(5) === session && r.readUInt32LE(9) === revision;
        switch (r[2]) {
            case E.VALUE_BEGIN: {
                if (pending) return reply(r, pending.transaction === transaction ? R.OK : R.BUSY);
                if (waiting) return reply(r, R.BUSY);
                if (!identity()) return reply(r, R.STALE);
                // A save of the keyboard's own holds the profile until it lands.
                if (auto.inProgress) return reply(r, R.BUSY);
                // The slave half catching up takes time: each BUSY is a moment.
                if (slaveBehind || slaveRefused) {if (slaveBehind && !slaveRefused) slaveBehind--; return reply(r, R.BUSY);}
                const replacement = (r[14] & 1) === 1;
                if (replacement && working) return reply(r, R.NOT_CLEAN);
                pending = {transaction, session, revision, count: r[13], total: r.readUInt32LE(15), replacement, splices: [], stream: Buffer.alloc(r.readUInt32LE(15)), received: 0, touched: clock};
                events.push("begin"); return reply(r, R.OK);
            }
            case E.VALUE_SPLICE: {
                if (!pending || pending.transaction !== transaction) return reply(r, R.WRONG_TRANSACTION);
                const index = r[5], splice = {domainId: r[6], offset: r.readUInt32LE(8), remove: r.readUInt32LE(12), insert: r.readUInt32LE(16), create: Boolean(r[7] & 1), drop: Boolean(r[7] & 2)};
                if (index < pending.splices.length) return reply(r, JSON.stringify(pending.splices[index]) === JSON.stringify(splice) ? R.OK : R.OUT_OF_ORDER);
                if (index !== pending.splices.length) return reply(r, R.OUT_OF_ORDER);
                pending.splices.push(splice); pending.touched = clock; return reply(r, R.OK);
            }
            case E.VALUE_DATA: {
                if (!pending || pending.transaction !== transaction) return reply(r, R.WRONG_TRANSACTION);
                const offset = r.readUInt32LE(5), bytes = r.subarray(10, 10 + r[9]);
                if (offset < pending.received) return reply(r, pending.stream.subarray(offset, offset + bytes.length).equals(bytes) ? R.OK : R.OUT_OF_ORDER);
                if (offset !== pending.received) return reply(r, R.OUT_OF_ORDER);
                bytes.copy(pending.stream, offset); pending.received += bytes.length; pending.touched = clock; return reply(r, R.OK);
            }
            case E.VALUE_COMMIT: {
                if (!pending || pending.transaction !== transaction) return reply(r, lastTransaction === transaction || waiting?.transaction === transaction ? R.QUEUED : R.WRONG_TRANSACTION);
                assert.equal(pending.received, pending.total, "every inserted byte arrives before commit");
                if (r.readUInt32LE(5) !== crc32(pending.stream)) {pending = null; return reply(r, R.CHECKSUM_MISMATCH);}
                const edit = pending; pending = null;
                if (faults.refuse) {lastTransaction = transaction; lastResult = faults.refuse; delete faults.refuse; events.push("refused"); return reply(r, R.QUEUED);}
                /** @type {Buffer} */
                let result;
                try {
                    result = edit.replacement ? Buffer.from(edit.stream) : applySplices(active(), {splices: edit.splices, stream: edit.stream}, {versions: PROFILE_DOMAIN_VERSIONS});
                    validateSnapshot(createSnapshot({profile: result, actionAbiDigest}));
                } catch {lastTransaction = transaction; lastResult = R.VALIDATION_REJECTED; events.push("refused"); return reply(r, R.QUEUED);}
                // Still checking, or checked and held until nothing is held.
                if (faults.checking) {delete faults.checking; waiting = {kind: "edit", transaction, phase: EDIT_PHASE.VALIDATING, result}; events.push("checking"); return reply(r, R.QUEUED);}
                if (held) {waiting = {kind: "edit", transaction, phase: EDIT_PHASE.WAITING_SAFE, result}; events.push("waiting for release"); return reply(r, R.QUEUED);}
                lastTransaction = transaction; publish(result);
                return reply(r, R.QUEUED);
            }
            case E.VALUE_ABORT: {
                // Before publication an edit held for its boundary ends too;
                // its own Revert waiting answers BUSY.
                if (waiting) {
                    if (waiting.transaction !== transaction) return reply(r, R.WRONG_TRANSACTION);
                    if (waiting.kind === "revert") return reply(r, R.BUSY);
                    lastTransaction = transaction; lastResult = R.ABORTED; waiting = null; events.push("aborted"); return reply(r, R.OK);
                }
                if (pending && pending.transaction !== transaction) return reply(r, R.WRONG_TRANSACTION);
                if (pending) {lastTransaction = transaction; lastResult = R.ABORTED; events.push("aborted");}
                pending = null; return reply(r, R.OK);
            }
            case E.VALUE_SAVE: {
                if (!identity()) return reply(r, R.STALE);
                if (pending || waiting || slaveBehind || slaveRefused) return reply(r, R.BUSY);
                if (!working) return reply(r, R.OK);
                if (raised.slaveRefused || auto.inProgress) return reply(r, R.BUSY);
                save.lastTransactionId = transaction; save.pauses = faults.savePauses ?? 0; delete faults.savePauses; auto.lastWasAutomatic = false;
                if (faults.saveFails) {save.lastResult = faults.saveFails; save.lastError = 9; delete faults.saveFails; events.push("save failed"); return reply(r, R.QUEUED);}
                saved = working; working = null; generation++; save.lastResult = R.OK; save.lastError = 0; refreshReader(); events.push("saved");
                return reply(r, R.QUEUED);
            }
            case E.VALUE_REVERT: {
                if (waiting) return reply(r, waiting.kind === "revert" && waiting.transaction === transaction ? R.QUEUED : R.BUSY);
                if (!identity()) return reply(r, R.STALE);
                // Revert aborts an edit being received, then reverts; it
                // never waits for the slave half, and brings it back.
                if (pending) {pending = null; events.push("aborted");}
                slaveRefused = false; slaveBehind = 0;
                if (!working) return reply(r, R.OK);
                if (held) {waiting = {kind: "revert", transaction, phase: EDIT_PHASE.REVERTING}; events.push("waiting for release"); return reply(r, R.QUEUED);}
                revertNow(transaction);
                return reply(r, R.QUEUED);
            }
            case E.VALUE_MODE: {
                if (working) return reply(r, R.NOT_CLEAN);
                if (r[5] > 2) return reply(r, R.INVALID_ARGUMENT);
                // BUSY until the halves agree, an unplugged slave half included.
                if (pending || waiting || slaveBehind || slaveRefused || faults.slaveAbsent) return reply(r, R.BUSY);
                // Taken at once, written when the keyboard is quiet: a failed
                // write is retried and reported until it succeeds.
                mode = r[5]; modeCounter++; modeConflict = false; modeNotStored = Boolean(faults.modeWriteFails); delete faults.modeWriteFails;
                events.push(`mode ${mode}`); return reply(r, R.OK);
            }
            default: return reply(r, R.INVALID_ARGUMENT);
        }
    }
    return keyboard;
}

module.exports = {liveKeyboard};
