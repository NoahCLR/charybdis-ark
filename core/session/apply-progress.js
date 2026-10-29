// @ts-check
"use strict";

/**
 * @typedef {import("../../contracts/model.js").ApplyView} ApplyView
 * @typedef {import("../../contracts/model.js").ApplyStep} ApplyStep
 * @typedef {{name?: string, domainId?: number, rowIndex?: number}} DeviceFailure
 * @typedef {{name?: string, code?: string, message?: string, cause?: unknown, deviceError?: DeviceFailure, status?: {error?: DeviceFailure}}} FailureDetails
 * @typedef {{waitingSafeBoundary?: boolean, lastStatusName?: string, busyStreak?: number, busyReason?: string, transportFailureCount?: number}} SlaveFailure
 */

const {interruption} = require("./interruption");
const {PROFILE_DOMAINS} = require("../schema/profile-domains");
const {APPLY_VERDICTS, FAILURE_WORDS, INTERRUPTION_REASONS, PROFILE_AREAS, SAVE_FAILURE_WORDS, SAVE_STEP_WORDS, failureSentence} = require("../model/vocabulary");

// The steps of one Apply, as the person watching it sees them.
//
// restoreProfile() reports into a tracker at each real boundary of the logical
// transaction; the tracker only moves forward, because the coordinators poll
// and may report an earlier phase again after a later one began (commit status
// keeps arriving while the connected half writes its keys). A failure is
// pinned to the step that was running, with the reason the keyboard gave.

/** @type {readonly {id: ApplyStep, label: string}[]} */
const APPLY_STEPS = Object.freeze(/** @type {const} */ (["check", "backup", "upload", "validate", "slave", "commit", "converge", "verify"])
    .map((id) => Object.freeze({id, label: SAVE_STEP_WORDS[id]})));
/** @type {Readonly<Record<string, number>>} */
const STEP_INDEX = Object.freeze(Object.fromEntries(APPLY_STEPS.map((step, index) => [step.id, index])));

// Up to this step nothing reaches durable storage; the commit decision is made
// inside "commit". Where a failure lands decides what can honestly be said
// about what was saved, together with whether the keyboard confirmed a cancel.
const LAST_UNSAVED_STEP = STEP_INDEX.slave;

/** @param {number | undefined} completed @param {number | undefined} total */
function bytes(completed, total) {
    return typeof completed === "number" && typeof total === "number" && Number.isInteger(completed) && Number.isInteger(total) && total > 0 ? {completed: Math.min(completed, total), total} : null;
}

let applySequence = 0;

class ApplyProgress {
    /** @param {(view: ApplyView) => void} [onChange] */
    constructor(onChange = () => {}) {
        this.onChange = onChange;
        // Tells one Apply's view from the next, so a dismissed failure stays
        // dismissed without hiding a later identical one.
        this.id = ++applySequence;
        this.index = -1;
        this.detail = "";
        /** @type {{completed: number, total: number} | null} */
        this.bytes = null;
        /** @type {import("../../contracts/model.js").ApplyFailure | null} */
        this.failure = null;
        this.finished = false;
    }

    // Moves to `step` (never backwards) and records what it is doing now.
    /** @param {ApplyStep} step @param {{detail?: string, completed?: number, total?: number}} [progress] */
    report(step, {detail = "", completed, total} = {}) {
        const index = STEP_INDEX[step];
        if (index === undefined) throw new RangeError(`Unknown Apply step ${step}.`);
        if (this.finished || this.failure || index < this.index) return;
        if (index > this.index) {
            this.index = index;
            this.bytes = null;
        }
        this.detail = detail;
        const counted = bytes(completed, total);
        if (counted) this.bytes = counted;
        this.onChange(this.view());
    }

    get current() {
        return this.index >= 0 ? APPLY_STEPS[this.index].id : "check";
    }

    // Nothing was saved when the failure came before the commit decision.
    get beforeDecision() {
        return this.index <= LAST_UNSAVED_STEP;
    }

    /** @param {{reason?: string, saved?: string}} [failure] */
    fail({reason = "", saved = "unknown"} = {}) {
        if (this.failure) return this.failure;
        const step = APPLY_STEPS[Math.max(this.index, 0)];
        const verdict = APPLY_VERDICTS[/** @type {keyof typeof APPLY_VERDICTS} */ (saved)] || APPLY_VERDICTS.unknown;
        this.failure = {step: step.id, label: step.label, reason, saved, verdict};
        this.onChange(this.view());
        return this.failure;
    }

    finish() {
        this.finished = true;
        this.index = APPLY_STEPS.length - 1;
        this.detail = "";
        this.bytes = null;
        this.onChange(this.view());
    }

    /** @returns {ApplyView} */
    view() {
        const failedAt = this.failure ? STEP_INDEX[this.failure.step] : -1;
        return {
            id: this.id,
            state: this.failure ? "failed" : this.finished ? "done" : "applying",
            steps: APPLY_STEPS.map(/** @returns {ApplyView["steps"][number]} */ (step, index) => ({
                id: step.id,
                label: step.label,
                state: index === failedAt ? "failed"
                    : this.finished || index < this.index ? "done"
                        : index === this.index && !this.failure ? "active" : "pending",
            })),
            current: this.current,
            detail: this.detail,
            bytes: this.bytes ? {...this.bytes} : null,
            failure: this.failure ? {...this.failure} : null,
        };
    }
}

// Each part of the profile, by its domain id, as Review names its area.
/** @type {ReadonlyMap<number, string>} */
const DOMAIN_NAMES = new Map(PROFILE_DOMAINS.map(domain => [domain.id, PROFILE_AREAS[domain.area]]));

// Why a save stopped, by the keyboard's candidate error, the slave half's
// last answer and why it kept answering busy (vocabulary.js). An unlisted
// keyboard error is said as one this Ark does not know; its name stays with
// the failure, for the diagnostics.
const {keyboard: DEVICE_REASONS, slave: SLAVE_REASONS, slaveBusy: SLAVE_BUSY_REASONS} = SAVE_FAILURE_WORDS;

/** @param {DeviceFailure | null | undefined} error */
function locate(error) {
    if (!error || error.domainId === 0xff || error.domainId === undefined) return "";
    // A part this Ark does not know is not named at all.
    const domain = DOMAIN_NAMES.get(error.domainId);
    if (!domain) return "";
    return error.rowIndex !== 0xffff && error.rowIndex !== undefined ? ` in ${domain}, row ${error.rowIndex + 1}` : ` in ${domain}`;
}

// Ark's own wait running out, from the upload coordinator: the keyboard kept
// answering but made no progress Ark could see.
const STALLED = new Set(["COMMIT_OUTCOME_AMBIGUOUS", "VALIDATION_OUTCOME_AMBIGUOUS", "OPERATION_OUTCOME_AMBIGUOUS", "MAILBOX_BUSY", "UPLOAD_BUSY"]);

// Errors whose text is for diagnostics only: the coordinators' and the
// transport's.
/** @param {FailureDetails | null | undefined} error */
const diagnosticOnly = error => error?.name === "CandidateUploadError" || error?.name === "LiveLinkTransportError";

// What a coordinator's or the transport's error stands for, by its cause
// chain: the first cause that is neither (Ark's sentence, a fault in Ark, an
// answer that did not read), else whether one of them was a fault in Ark
// (the transport's `fault: "ark"`, device-adapter.js).
/** @param {FailureDetails} error @returns {{cause?: FailureDetails, arkFault: boolean}} */
function carried(error) {
    const seen = new Set();
    let arkFault = false;
    for (let link = /** @type {unknown} */ (error); link && typeof link === "object" && !seen.has(link); link = /** @type {{cause?: unknown}} */ (link).cause) {
        seen.add(link);
        const details = /** @type {FailureDetails & {fault?: unknown}} */ (link);
        if (!diagnosticOnly(details)) return {cause: details, arkFault};
        arkFault ||= details.fault === "ark";
    }
    return {arkFault};
}

// Why an Apply stopped, in the words of the person who pressed it: a lost
// connection anywhere in the cause first (a restarted keyboard makes the slave
// half look busy), then the keyboard's own reason, then the slave half's last
// answer. The coordinators' and the transport's text is never said: it stays
// in the cause and the diagnostics. Ark's own sentences are.
/** @param {FailureDetails | null | undefined} error @param {SlaveFailure | null | undefined} slave @returns {string} */
function failureReason(error, slave) {
    const cut = interruption(error);
    if (cut === "lost") return INTERRUPTION_REASONS.lost;
    const device = error?.deviceError || error?.status?.error;
    if (device?.name && device.name !== "NONE") {
        // The copy was ready; the save waited for the master half to go idle.
        if (device.name === "TIMEOUT" && slave?.waitingSafeBoundary) return SAVE_FAILURE_WORDS.held;
        // The copy to the slave half stopped: its last answer says why.
        if (device.name === "PEER_TRANSFER_FAILED" && slave?.lastStatusName && SLAVE_REASONS[slave.lastStatusName]) return SLAVE_REASONS[slave.lastStatusName];
        const known = DEVICE_REASONS[device.name];
        if (known) return device.name === "VALIDATION_REJECTED" ? `${known}${locate(device)}.` : known;
        return SAVE_FAILURE_WORDS.unknownKeyboard;
    }
    // Ark's own wait ran out while the keyboard waited for a safe moment.
    if (slave?.waitingSafeBoundary && STALLED.has(error?.code || "")) return SAVE_FAILURE_WORDS.heldArkWait;
    if (slave && (slave.busyStreak ?? 0) >= 3 && slave.busyReason && SLAVE_BUSY_REASONS[slave.busyReason]) return SLAVE_BUSY_REASONS[slave.busyReason];
    if (slave && slave.lastStatusName && slave.lastStatusName !== "OK" && SLAVE_REASONS[slave.lastStatusName]) return SLAVE_REASONS[slave.lastStatusName];
    if (slave && (slave.transportFailureCount ?? 0) > 0 && /progress|timed out|timeout/i.test(error?.message || "")) return SAVE_FAILURE_WORDS.linkSilent;
    if (cut === "unanswered") return INTERRUPTION_REASONS.unanswered;
    if (STALLED.has(error?.code || "")) return SAVE_FAILURE_WORDS.stalled;
    if (error && diagnosticOnly(error)) {
        // What stopped the coordinator, carried in its cause, is said as Ark
        // says it: Ark's own sentence (a keyboard that changed under the
        // upload), a fault in Ark as Ark's own problem, an answer that did
        // not read as the keyboard's. A fault in Ark beneath the transport is
        // Ark's too; only what the coordinator saw the keyboard answer
        // itself is the keyboard's unexpected answer.
        const {cause, arkFault} = carried(error);
        if (cause) return cause.message ? failureReason(cause, slave) : failureSentence(cause);
        return arkFault ? FAILURE_WORDS.unexpected : SAVE_FAILURE_WORDS.unexpected;
    }
    return error?.message ? failureSentence(error) : INTERRUPTION_REASONS.unanswered;
}

module.exports = {APPLY_STEPS, ApplyProgress, failureReason};
