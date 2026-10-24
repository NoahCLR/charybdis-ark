// @ts-check
"use strict";

// One live edit, Save, Revert or mode change at a time, in the order the
// firmware takes them (D-F32, profile-wire-v1/live-edits.md): an edit is
// begin, its splices, the inserted bytes, commit, then the edit status until
// the keyboard says how it ended and whether the slave half holds it too.
// Nothing here decides what to send; the draft does (profile-draft-session.js).
//
// What a caller learns, every time: the session and revision the keyboard has
// now. A refusal throws a LiveEditError naming the firmware's result; STALE
// carries the keyboard's current pair, so the caller rereads instead of
// retrying blindly. A lost answer ends the connection (the transport closes
// it on a timeout); reading the keyboard again then says whether the edit
// landed. An edit is never replayed.
//
// An edit or Revert the keyboard holds until no key is held (phase 4 or 5
// with flag 8) waits for the release, however long it takes: the firmware
// never drops it, and publishes it once nothing is held (live-edits.md,
// "Checking and publishing"). Meanwhile `onWaiting` says what holds it (page
// 2), and `cancelWaiting()` aborts a held edit, which is legal before
// publication. The short limit stays for every other phase.

const {PROFILE_EDIT_V1, EDIT_RESULT, EDIT_RESULT_NAMES, EDIT_PHASE, EDIT_FLAGS, buildEditBeginRequest, buildEditSpliceRequest, buildEditDataRequest,
    buildEditCommitRequest, buildEditAbortRequest, buildSaveRequest, buildRevertRequest, buildEditModeRequest, buildRestartRequest, sendEditRequest,
    readEditProgress, readEditStatus, readEditMode, readSafeBoundaryReasons} = require("../protocol/profile-edit-v1");
const {diffProfiles, applySplices, spliceEditFits} = require("../schema/profile-splices");
const {PROFILE_DOMAIN_IDS} = require("../schema/profile-blob-v1");
const {PROFILE_DOMAIN_VERSIONS} = require("../schema/profile-domains");
const {LIVE_RESULT_WORDS} = require("../model/vocabulary");


// The firmware never lets a profile lose these (D-F32: a required domain
// cannot be dropped).
const REQUIRED_DOMAINS = Object.freeze([PROFILE_DOMAIN_IDS.RGB, PROFILE_DOMAIN_IDS.KEY_BEHAVIORS]);
const DEFAULT_TIMING = Object.freeze({
    pollMs: 5,
    // An edit being loaded and checked, and the slave half, are short on a
    // keyboard in use, and a person is watching. Held keys are waited for
    // without a limit (the class comment).
    editMs: 5000,
    slaveMs: 3000,
    busyMs: 3000,
    // After the slave half refuses an edit, the master half sends it the
    // whole working copy once over the split link, which takes far longer
    // than an edit: a new edit waits this long while the slave half answers.
    catchUpMs: 30000,
    // A save erases and programs flash, pausing for a quiet keyboard before
    // each erase (D-F29); its own wait counts toward nothing on the keyboard.
    saveMs: 120000,
});

// How often a request the keyboard refuses while it saves is asked again,
// and how often a held edit is looked at: either can last long.
const SAVE_POLL_MS = 50, HELD_POLL_MS = 50;

class LiveEditError extends Error {
    /** @param {string} code @param {string} message @param {Record<string, unknown>} [details] */
    constructor(code, message, details = {}) {
        super(message);
        this.name = "LiveEditError";
        this.code = code;
        Object.assign(this, details);
    }
}

// A keyboard whose profile storage stopped refuses everything but a restart
// (firmware D-F34); it says so in its flags, and then so does the refusal.
/** @param {number} result @param {string} what @param {{session?: number, revision?: number, flags?: number, refusal?: unknown, candidateError?: number}} [details] */
function refused(result, what, details = {}) {
    const name = EDIT_RESULT_NAMES[result] || `RESULT_${result}`;
    const stopped = result !== EDIT_RESULT.OK && Boolean((details.flags ?? 0) & (EDIT_FLAGS.STOPPED | EDIT_FLAGS.PEER_STOPPED));
    const code = stopped ? "LIVE_KEYBOARD_STOPPED" : result === EDIT_RESULT.STALE ? "LIVE_EDIT_STALE" : result === EDIT_RESULT.NOT_CLEAN ? "LIVE_EDIT_NOT_CLEAN" : "LIVE_EDIT_REFUSED";
    const words = stopped ? LIVE_RESULT_WORDS.STOPPED : LIVE_RESULT_WORDS[name] || `the keyboard answered ${name}.`;
    return new LiveEditError(code, `${what}: ${words}`, {result: name, ...details});
}

// The slave half refused the working copy, as an edit and as a whole copy:
// the halves run different profiles until a Revert or an Apply, and Save and
// new edits are BUSY meanwhile (profile-split-v1.md).
/** @param {string} what */
const apart = what => new LiveEditError("LIVE_HALVES_APART",
    `${what}: the slave half refused the keyboard's unsaved edits, so the halves run different profiles. Revert puts both back on the saved profile.`);

// The slave half is not heard (edit status flag 3 clear for 3 s): what needs
// both halves stays BUSY until it is back, so waiting never ends it
// (Profile Wire admission, "Edit mode").
/** @param {string} what */
const absent = what => new LiveEditError("LIVE_SLAVE_ABSENT",
    `${what}: the slave half is not connected. Connect the cable between the halves and try again.`);

// 16-bit transaction ids, nonzero, never one the keyboard last finished or is
// still receiving.
class TransactionIds {
    constructor(start = 1 + Math.floor(Math.random() * 0xfffe)) {
        this.value = start;
        /** @type {Set<number>} ids an earlier connection left unfinished */
        this.retired = new Set();
    }
    /** @param {number} id */
    retire(id) {this.retired.add(id);}
    /** @param {...number} avoid */
    next(...avoid) {
        let id = this.value;
        while (avoid.includes(id) || this.retired.has(id)) id = id === 0xffff ? 1 : id + 1;
        this.value = id === 0xffff ? 1 : id + 1;
        return id;
    }
}

/** @typedef {import("./types.js").LiveWaiting} LiveWaiting */
/** @typedef {{onWaiting?: (waiting: LiveWaiting | null) => void}} WaitOptions */

class LiveEditCoordinator {
    /** @param {import("../transport/types.js").RequestConnection} connection @param {{requestIds: import("../protocol/types.js").RequestIds, transactionIds?: TransactionIds, sleep?: (ms: number) => Promise<void>, now?: () => number, timing?: Partial<Record<keyof typeof DEFAULT_TIMING, number>>}} options */
    constructor(connection, {requestIds, transactionIds = new TransactionIds(), sleep, now = Date.now, timing = {}}) {
        this.connection = connection;
        this.options = {nextRequestId: () => requestIds.next()};
        this.transactionIds = transactionIds;
        this.sleep = sleep || (ms => new Promise(resolve => setTimeout(resolve, ms)));
        this.now = now;
        this.timing = {...DEFAULT_TIMING, ...timing};
        /** @type {{transactionId: number, kind: "edit" | "revert", cancelRequested: boolean, abortSent: boolean} | undefined} Ark's own edit or Revert, held until no key is held */
        this.held = undefined;
    }

    // Cancel edit: a held edit is aborted at the next look. False when
    // nothing of Ark's is held, or what is held is a Revert, whose abort the
    // keyboard refuses.
    cancelWaiting() {
        if (this.held?.kind !== "edit") return false;
        this.held.cancelRequested = true;
        return true;
    }

    // Whether the keyboard holds this transaction until no key is held.
    /** @param {import("../protocol/types.js").EditProgress} progress @param {number} transactionId @param {number} phase */
    static heldBy(progress, transactionId, phase) {
        return progress.waitingSafe && progress.phase === phase && progress.transactionId === transactionId;
    }

    // One look at a held edit or Revert: says what holds it, aborts an edit
    // the person cancelled (once), then waits a moment.
    /** @param {number} transactionId @param {"edit" | "revert"} kind @param {WaitOptions["onWaiting"]} onWaiting */
    async waitHeld(transactionId, kind, onWaiting = () => {}) {
        const reasons = await readSafeBoundaryReasons(this.connection, this.options);
        if (this.held?.transactionId !== transactionId) this.held = {transactionId, kind, cancelRequested: false, abortSent: false};
        const held = this.held;
        onWaiting({kind, reasons, cancelling: held.cancelRequested});
        if (held.cancelRequested && !held.abortSent) {
            held.abortSent = true;
            // OK whether it ended the edit or the edit published first.
            await this.send(buildEditAbortRequest(transactionId));
        }
        await this.sleep(Math.max(this.timing.pollMs, HELD_POLL_MS));
    }

    /** @param {WaitOptions["onWaiting"]} onWaiting */
    endHeld(onWaiting = () => {}) {
        if (!this.held) return;
        this.held = undefined;
        onWaiting(null);
    }

    status() {return readEditStatus(this.connection, this.options);}
    progress() {return readEditProgress(this.connection, this.options);}
    mode() {return readEditMode(this.connection, this.options);}

    /** @param {Buffer} request */
    send(request) {return sendEditRequest(this.connection, request, this.options);}

    // A SET the keyboard may answer BUSY while the slave half catches up or
    // something else holds the profile: asked again until it is taken. A
    // BUSY because the halves are apart, the slave half is not connected or a
    // half stopped never ends by waiting. A save holds
    // the profile until it lands (in Live the keyboard's own starts 3 s after
    // an edit and takes seconds, more for a large profile), so while the
    // keyboard says one runs the wait is a save's, asked at a save's pace.
    /** @param {() => Buffer} build @param {string} what */
    async sendWhenFree(build, what) {
        const started = this.now();
        for (;;) {
            const reply = await this.send(build());
            if (reply.result !== EDIT_RESULT.BUSY) return reply;
            if (reply.flags & EDIT_FLAGS.PEER_REFUSED) throw apart(what);
            // A stopped half ends only by a restart (D-F34): no waiting.
            if (reply.flags & (EDIT_FLAGS.STOPPED | EDIT_FLAGS.PEER_STOPPED)) throw refused(reply.result, what, {session: reply.session, revision: reply.revision, flags: reply.flags});
            if ((reply.flags & EDIT_FLAGS.PEER_REQUIRED) && !(reply.flags & EDIT_FLAGS.PEER_KNOWN)) throw absent(what);
            const saving = (reply.flags & EDIT_FLAGS.SAVING) !== 0;
            const catchingUp = (reply.flags & EDIT_FLAGS.PEER_KNOWN) && !(reply.flags & EDIT_FLAGS.PEER_CONVERGED);
            const limit = saving ? this.timing.saveMs : catchingUp ? this.timing.catchUpMs : this.timing.busyMs;
            if (this.now() - started > limit) throw refused(reply.result, what, {session: reply.session, revision: reply.revision, flags: reply.flags});
            await this.sleep(saving ? Math.max(this.timing.pollMs, SAVE_POLL_MS) : this.timing.pollMs);
        }
    }

    // After a reconnect: an edit this shell began on the lost connection is
    // still being received and holds the profile until its 15 s lease ends.
    // Aborting it frees the keyboard at once; its id is never used again here.
    async abandonUnfinished() {
        const progress = await this.progress();
        if (progress.phase !== EDIT_PHASE.RECEIVING || !progress.transactionId) return false;
        this.transactionIds.retire(progress.transactionId);
        await this.send(buildEditAbortRequest(progress.transactionId));
        return true;
    }

    // Sends the change from `from` (the keyboard's working copy, exactly) to
    // `to`, made against `identity`. Resolves with the bytes the keyboard
    // now runs, its new pair, whether the slave half holds them yet and
    // whether it refused them.
    // `onCommitted` learns the transaction once the keyboard has it whole, so
    // a read after a failure can tell whether this edit landed.
    /** @param {{from: Buffer, to: Buffer, defaults?: Buffer, identity: {session: number, revision: number}, capacity: number, replaceWhenLarge?: boolean}} edit
     * @param {WaitOptions & {onCommitted?: (transactionId: number) => void}} [options]
     * @returns {Promise<{bytes: Buffer, session: number, revision: number, converged: boolean, slaveRefused: boolean, sent: number, cancelled?: true, cancelTooLate?: true}>} */
    async post({from, to, defaults, identity, capacity, replaceWhenLarge = false}, {onWaiting, onCommitted} = {}) {
        const diff = diffProfiles(from, to, {defaults, required: REQUIRED_DOMAINS});
        if (!diff.splices.length) return {bytes: from, ...identity, converged: true, slaveRefused: false, sent: 0};
        const result = applySplices(from, diff, {versions: PROFILE_DOMAIN_VERSIONS});
        let replacement = false, stream = diff.stream;
        if (!spliceEditFits(from.length, result.length, stream.length, capacity)) {
            // Too large to stage beside the profile: only a whole replacement
            // fits, and the keyboard takes one only with nothing unsaved.
            if (!replaceWhenLarge) throw new LiveEditError("LIVE_EDIT_TOO_LARGE", "This change is too large to send as one edit while the keyboard has unsaved edits. Save or Revert first, then make it again.");
            replacement = true; stream = Buffer.from(to);
        }
        const before = await this.progress();
        const transactionId = this.transactionIds.next(before.lastTransactionId, before.transactionId);
        const begin = await this.sendWhenFree(() => buildEditBeginRequest(transactionId, {...identity, splices: replacement ? 0 : diff.splices.length, insertTotal: stream.length, replacement}), "The keyboard did not take the edit");
        if (begin.result !== EDIT_RESULT.OK) throw refused(begin.result, "The keyboard did not take the edit", {session: begin.session, revision: begin.revision, flags: begin.flags});
        try {
            if (!replacement) for (const [index, splice] of diff.splices.entries()) await this.expect(buildEditSpliceRequest(transactionId, index, splice), "The keyboard refused part of the edit");
            for (let offset = 0; offset < stream.length; offset += PROFILE_EDIT_V1.DATA_MAX) {
                await this.expect(buildEditDataRequest(transactionId, offset, stream.subarray(offset, offset + PROFILE_EDIT_V1.DATA_MAX)), "The keyboard refused part of the edit");
            }
            const commit = await this.send(buildEditCommitRequest(transactionId, stream));
            if (commit.result !== EDIT_RESULT.QUEUED && commit.result !== EDIT_RESULT.OK) throw refused(commit.result, "The keyboard refused the edit", {session: commit.session, revision: commit.revision, flags: commit.flags});
        } catch (error) {
            await this.send(buildEditAbortRequest(transactionId)).catch(() => {});
            throw error;
        }
        onCommitted?.(transactionId);
        const {progress: done, cancelled} = await this.settle(transactionId, onWaiting);
        // Cancelled before it took effect: nothing changed.
        if (cancelled && done.lastResult === EDIT_RESULT.ABORTED && done.session === identity.session && done.revision === identity.revision) {
            return {bytes: from, session: done.session, revision: done.revision, ...(await this.convergence(done.session, done.revision)), sent: 0, cancelled: true};
        }
        const status = await this.status();
        if (done.lastResult !== EDIT_RESULT.OK) {
            const details = done.lastResult === EDIT_RESULT.VALIDATION_REJECTED ? {refusal: status.refusal} : {};
            throw refused(done.lastResult, "The keyboard refused the edit", {session: done.session, revision: done.revision, flags: status.flags, ...details});
        }
        const bytes = replacement ? Buffer.from(to) : result;
        // A tripwire on Ark's own splicing: the keyboard's working copy must
        // be as long as the bytes Ark now takes it to hold.
        if (status.session !== done.session || status.revision !== done.revision || status.activeLength !== bytes.length) {
            throw new LiveEditError("LIVE_EDIT_MISMATCH", "The keyboard took the edit, but what it runs is not what Ark sent. Ark reads the keyboard again.", {session: status.session, revision: status.revision});
        }
        // Cancel edit came after the keyboard had taken the edit: it landed.
        return {bytes, session: done.session, revision: done.revision, ...(await this.convergence(done.session, done.revision)), sent: stream.length,
            ...(cancelled ? {cancelTooLate: /** @type {const} */ (true)} : {})};
    }

    /** @param {Buffer} request @param {string} what */
    async expect(request, what) {
        const reply = await this.send(request);
        if (reply.result !== EDIT_RESULT.OK) throw refused(reply.result, what, {session: reply.session, revision: reply.revision, flags: reply.flags});
        return reply;
    }

    // Waits for this half to finish the edit: its last finished transaction is
    // this one and nothing is in progress. Held for no key to be held, it
    // waits as long as that lasts; the short limit starts again after.
    /** @param {number} transactionId @param {WaitOptions["onWaiting"]} [onWaiting] */
    async settle(transactionId, onWaiting) {
        let until = this.now() + this.timing.editMs, cancelled = false;
        try {
            for (;;) {
                const progress = await this.progress();
                if (progress.lastTransactionId === transactionId && progress.transactionId !== transactionId && progress.phase === EDIT_PHASE.IDLE) return {progress, cancelled};
                if (LiveEditCoordinator.heldBy(progress, transactionId, EDIT_PHASE.WAITING_SAFE)) {
                    await this.waitHeld(transactionId, "edit", onWaiting);
                    cancelled ||= Boolean(this.held?.cancelRequested);
                    until = this.now() + this.timing.editMs;
                    continue;
                }
                if (this.now() > until) throw new LiveEditError("LIVE_EDIT_PENDING", "The keyboard has not finished the edit. Ark reads the keyboard again to see whether it did.", {session: progress.session, revision: progress.revision});
                await this.sleep(this.timing.pollMs);
            }
        } finally {this.endHeld(onWaiting);}
    }

    // Whether the slave half holds this session and revision, waiting a
    // moment for it, and whether it refused them (the halves are then apart
    // until a Revert). A keyboard whose slave half is not required (one half
    // on its own) holds it by definition. Not holding it yet is "catching
    // up": the master half keeps sending, and the next edit waits for it.
    /** @param {number} session @param {number} revision @returns {Promise<{converged: boolean, slaveRefused: boolean}>} */
    async convergence(session, revision) {
        const until = this.now() + this.timing.slaveMs;
        for (;;) {
            const progress = await this.progress();
            if (progress.slaveRefused) return {converged: false, slaveRefused: true};
            if (progress.session !== session || progress.revision !== revision) return {converged: false, slaveRefused: false};
            if (!progress.slaveRequired || progress.slaveConverged) return {converged: true, slaveRefused: false};
            if (this.now() > until) return {converged: false, slaveRefused: false};
            await this.sleep(this.timing.pollMs);
        }
    }

    // Save: the keyboard writes its working copy as a new generation through
    // the ordinary candidate path, on both halves.
    /** @param {{session: number, revision: number}} identity @param {(progress: import("../protocol/types.js").EditStatus) => void} [onProgress] */
    async save(identity, onProgress = () => {}) {
        const before = await this.status();
        const transactionId = this.transactionIds.next(before.save.lastTransactionId, before.save.transactionId);
        const reply = await this.sendWhenFree(() => buildSaveRequest(transactionId, identity), "The keyboard did not save");
        if (reply.result === EDIT_RESULT.OK) return {saved: false, ...(await this.status())};
        if (reply.result !== EDIT_RESULT.QUEUED) throw refused(reply.result, "The keyboard did not save", {session: reply.session, revision: reply.revision, flags: reply.flags});
        const until = this.now() + this.timing.saveMs;
        for (;;) {
            const status = await this.status();
            onProgress(status);
            if (status.save.phase === 0 && status.save.lastTransactionId === transactionId) {
                if (status.save.lastResult !== EDIT_RESULT.OK) throw refused(status.save.lastResult, "The keyboard did not save", {session: status.session, revision: status.revision, flags: status.flags, candidateError: status.save.lastError});
                return {saved: true, ...status};
            }
            if (this.now() > until) throw new LiveEditError("LIVE_SAVE_PENDING", "The keyboard has not finished saving. Keep both halves connected and read the keyboard again.");
            await this.sleep(Math.max(this.timing.pollMs, 20));
        }
    }

    // Leaving Live: the keyboard saves at once whatever it has not saved yet,
    // since it refuses a mode change with unsaved edits (firmware D-F32). A
    // save of its own that is running is waited for, not raced; the pair
    // saved is the keyboard's own, since in Live it would save it anyway.
    /** @param {(progress: import("../protocol/types.js").EditStatus) => void} [onProgress]
     * @param {(status: import("../protocol/types.js").EditStatus) => Promise<void>} [beforeSave] */
    async flush(onProgress = () => {}, beforeSave = async () => {}) {
        const until = this.now() + this.timing.saveMs;
        for (;;) {
            const status = await this.status();
            onProgress(status);
            if (status.slaveRefused) throw apart("The keyboard could not save");
            const running = status.adjustmentPending || status.saving || status.save.phase !== 0 || status.autoSave.inProgress;
            if (!running && !status.unsaved) return {saved: false, ...status};
            if (!running) {
                try {
                    await beforeSave(status);
                    const current = await this.status();
                    if (!current.unsaved && !current.adjustmentPending && !current.saving && !current.autoSave.inProgress) return {saved: false, ...current};
                    if (current.session !== status.session || current.revision !== status.revision || current.savedGeneration !== status.savedGeneration
                        || current.savedOrigin !== status.savedOrigin || current.adjustmentPending || current.saving || current.autoSave.inProgress) {
                        throw new LiveEditError("LIVE_EDIT_STALE", "The keyboard moved while its recovery copy was saved.");
                    }
                    if (this.now() > until) throw new LiveEditError("LIVE_SAVE_PENDING", "The keyboard has not finished saving. Read the keyboard again.");
                    return await this.save({session: current.session, revision: current.revision}, onProgress);
                }
                catch (error) {
                    // An edit of the keyboard's own (an adjustment key) or its
                    // own save got in first: look again.
                    const code = /** @type {{code?: string, result?: string}} */ (error);
                    if (!(code.code === "LIVE_EDIT_STALE" || code.result === "BUSY")) throw error;
                }
            }
            if (this.now() > until) throw new LiveEditError("LIVE_SAVE_PENDING", "The keyboard has not finished saving. Keep both halves connected and read the keyboard again.");
            await this.sleep(Math.max(this.timing.pollMs, 20));
        }
    }

    // Revert: the keyboard runs its saved profile again; no flash is written.
    /** @param {{session: number, revision: number}} identity @param {WaitOptions} [options] */
    async revert(identity, {onWaiting} = {}) {
        const before = await this.progress();
        const transactionId = this.transactionIds.next(before.lastTransactionId, before.transactionId);
        const reply = await this.sendWhenFree(() => buildRevertRequest(transactionId, identity), "The keyboard did not revert");
        if (reply.result !== EDIT_RESULT.OK && reply.result !== EDIT_RESULT.QUEUED) throw refused(reply.result, "The keyboard did not revert", {session: reply.session, revision: reply.revision, flags: reply.flags});
        let until = this.now() + this.timing.editMs;
        try {
            for (;;) {
                const progress = await this.progress();
                if (!progress.unsaved && progress.phase === EDIT_PHASE.IDLE) return {...progress, ...(await this.convergence(progress.session, progress.revision))};
                if (LiveEditCoordinator.heldBy(progress, transactionId, EDIT_PHASE.REVERTING)) {
                    await this.waitHeld(transactionId, "revert", onWaiting);
                    until = this.now() + this.timing.editMs;
                    continue;
                }
                if (this.now() > until) throw new LiveEditError("LIVE_EDIT_PENDING", "The keyboard has not finished reverting. Ark reads the keyboard again.");
                await this.sleep(this.timing.pollMs);
            }
        } finally {this.endHeld(onWaiting);}
    }

    // Restart both halves (firmware D-F34): the way out of a keyboard whose
    // profile storage stopped. Taken in any state, so never asked again; the
    // keyboard drops off USB right after it answers. Whether the slave half
    // acknowledged says whether it restarts too.
    async restart() {
        const reply = await this.send(buildRestartRequest(this.transactionIds.next()));
        if (reply.result !== EDIT_RESULT.OK) throw refused(reply.result, "The keyboard did not restart", {flags: 0});
        return {slaveAcknowledged: Boolean(reply.slaveAcknowledged)};
    }

    // The edit mode, stored on both halves; confirmed by reading it back.
    // Each half takes it at once and writes it when the keyboard is quiet;
    // `notStored` says a write failed and is being retried, so a replug now
    // may lose it.
    /** @param {number} mode */
    async setMode(mode) {
        const transactionId = this.transactionIds.next();
        const what = "The keyboard did not change its edit mode";
        const reply = await this.sendWhenFree(() => buildEditModeRequest(transactionId, mode), what);
        // NOT_CLEAN also while a DPI or lighting key change awaits saving.
        if (reply.result === EDIT_RESULT.NOT_CLEAN && (reply.flags & EDIT_FLAGS.ADJUSTMENT_PENDING) && !(reply.flags & EDIT_FLAGS.UNSAVED)) {
            throw new LiveEditError("LIVE_EDIT_NOT_CLEAN", `${what}: a DPI or lighting key change has not reached both halves yet. Wait a moment and try again.`, {result: "NOT_CLEAN"});
        }
        if (reply.result !== EDIT_RESULT.OK) throw refused(reply.result, what, {flags: reply.flags});
        const read = await this.mode();
        if (read.mode !== mode) throw new LiveEditError("LIVE_MODE_UNCONFIRMED", "The keyboard did not confirm its new edit mode. Read the keyboard again.");
        return {...read, notStored: (await this.progress()).modeNotStored};
    }
}

module.exports = {LiveEditCoordinator, LiveEditError, TransactionIds, REQUIRED_DOMAINS, DEFAULT_TIMING};
