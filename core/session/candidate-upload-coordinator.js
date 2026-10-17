// @ts-check
"use strict";

/**
 * @typedef {import("./candidate-upload-types.js").UploadContext} Context
 * @typedef {import("./candidate-upload-types.js").OperationContext} OperationContext
 * @typedef {import("./candidate-upload-types.js").CommitContext} CommitContext
 * @typedef {import("./candidate-upload-types.js").TransferContext} TransferContext
 * @typedef {import("./candidate-upload-types.js").MutationDetails} Details
 * @typedef {import("./types.js").CandidateStatus} Status
 * @typedef {import("./types.js").CandidateProgress} Progress
 * @typedef {import("./candidate-upload-types.js").FailureDetails} FailureDetails
 */
const {isUnhandledEcho, orUnhandled} = require("../protocol/via-unhandled-v1");
const {
    CANDIDATE_ADMISSION,
    CANDIDATE_ERROR,
    CANDIDATE_ERROR_NAMES,
    CANDIDATE_OPERATION,
    CANDIDATE_STATE,
    CANDIDATE_STATE_NAMES,
    CandidateRequestIdSequence,
    CandidateTransactionIdSequence,
    PROFILE_CANDIDATE_V1,
    buildCandidateAbortRequest,
    buildCandidateBeginRequest,
    buildCandidateChunkRequest,
    buildCandidateReuseRequest,
    buildCandidateCommitRequest,
    buildCandidateValidateRequest,
    candidateMetadataForBlob,
    candidateMutationResponseMatcher,
    decodeCandidateAcknowledgement,
    normalizeCandidateMetadata,
    readCandidateStatus,
} = require("../protocol/profile-candidate-v1");

const {candidateTransferPlan} = require("../protocol/candidate-transfer-plan");
const {crc32, fnv1a32} = require("../schema/profile-blob-v1");

const DEFAULT_POLL_INTERVAL_MS = 10;
const DEFAULT_MAX_BUSY_RESUBMISSIONS = 3;
const FIRMWARE_HOST_PRECOMMIT_TIMEOUT_MS = 15000;
const FIRMWARE_PREPARING_PEER_NO_PROGRESS_TIMEOUT_MS = 60000;
const FIRMWARE_SPLIT_PEER_TIMEOUT_MS = 3000;
const DEFAULT_PREPARING_PEER_TRANSFER_ALLOWANCE_MS = 20000;
const DEFAULT_STATUS_SCHEDULING_MARGIN_MS = 1000;
const DEFAULT_STATUS_SCAN_STEP_ALLOWANCE_MS = 45;
const DEFAULT_STATUS_TIMEOUT_SAFETY_MS = 1000;
// Whole-profile validation takes one step a scan, each one read of at most 20
// bytes; settings and names read 20 bytes a step, behaviours a few bytes a
// step. A maximum 37,667-byte profile took 7,429 steps (firmware D-F14), so a
// step per four bytes gives a conservative software allowance with 5 ms
// per scan. Real scan and validation latency still need hardware acceptance.
const VALIDATION_BYTES_PER_STEP = 4;
const DEFAULT_VALIDATION_STEP_ALLOWANCE_MS = 5;

/** @type {readonly number[]} */
const COMMIT_IN_PROGRESS_STATES = Object.freeze([
    CANDIDATE_STATE.PREPARING_PEER,
    CANDIDATE_STATE.COMMITTING,
    CANDIDATE_STATE.CONVERGING_PEER,
    CANDIDATE_STATE.ACTIVATING,
]);

const UPLOAD_PHASE = Object.freeze({
    PREFLIGHT: "preflight",
    BEGIN: "begin",
    WRITING: "writing",
    VALIDATE: "validate",
    VALIDATING: "validating",
    COMMIT_PREFLIGHT: "commit-preflight",
    COMMIT: "commit",
    COMMITTING: "committing",
    ABORTING: "aborting",
    COMPLETE: "complete",
});

class CandidateUploadError extends Error {
    /** @param {string} code @param {string} message @param {FailureDetails} [details] */
    constructor(code, message, details = {}) {
        super(message);
        this.name = "CandidateUploadError";
        this.code = code;
        this.phase = details.phase || UPLOAD_PHASE.PREFLIGHT;
        this.transactionId = details.transactionId;
        this.operation = details.operation;
        this.progress = details.progress ? cloneProgress(details.progress) : undefined;
        this.status = details.status ? cloneStatus(details.status) : undefined;
        this.deviceError = details.deviceError ? {...details.deviceError} : undefined;
        this.ambiguous = Boolean(details.ambiguous);
        this.safeToRetry = details.safeToRetry === true;
        this.abortAttempted = Boolean(details.abortAttempted);
        this.abortSucceeded = details.abortSucceeded;
        if (details.cause !== undefined) this.cause = details.cause;
    }
}

class CandidateUploadCoordinator {
    /** @param {import("./candidate-upload-types.js").Connection} connection @param {import("./candidate-upload-types.js").CoordinatorOptions} [options] */
    constructor(connection, options = {}) {
        if (!connection || typeof connection.request !== "function") {
            throw new TypeError("connection must provide request(report, options).");
        }
        this.connection = connection;
        this.chunkSize = normalizeInteger(
            options.chunkSize === undefined ? PROFILE_CANDIDATE_V1.CHUNK_MAX : options.chunkSize,
            "Candidate chunk size",
            1,
            PROFILE_CANDIDATE_V1.CHUNK_MAX
        );
        this.pollIntervalMs = normalizeInteger(
            options.pollIntervalMs === undefined ? DEFAULT_POLL_INTERVAL_MS : options.pollIntervalMs,
            "Candidate poll interval",
            0,
            60000
        );
        this.maxStatusPolls = options.maxStatusPolls === undefined
            ? undefined
            : normalizeInteger(options.maxStatusPolls, "Maximum candidate status polls", 1, 100000);
        this.statusStallTimeoutMs = options.statusStallTimeoutMs === undefined
            ? undefined
            : normalizeInteger(options.statusStallTimeoutMs, "Candidate status stall timeout", 1, 300000);
        this.maxBusyResubmissions = normalizeInteger(
            options.maxBusyResubmissions === undefined ? DEFAULT_MAX_BUSY_RESUBMISSIONS : options.maxBusyResubmissions,
            "Maximum busy resubmissions",
            0,
            100
        );
        this.requestTimeoutMs = options.requestTimeoutMs;
        this.onProgress = typeof options.onProgress === "function" ? options.onProgress : undefined;
        // Reads candidate status page 1 while the keyboard prepares the other
        // half. Optional: without it the peer phase is waited out blind.
        this.readPeerStatus = typeof options.readPeerStatus === "function" ? options.readPeerStatus : undefined;
        this.sleep = typeof options.sleep === "function" ? options.sleep : defaultSleep;
        this.now = typeof options.now === "function" ? options.now : Date.now;
        this.transactionIds = options.transactionIds || new CandidateTransactionIdSequence(options.transactionIdStart);
        this.requestIds = options.requestIds || new CandidateRequestIdSequence(options.requestIdStart);
        assertIdSequence(this.transactionIds, "transactionIds");
        assertIdSequence(this.requestIds, "requestIds");
        this.uploading = false;
    }

    /** @overload @param {Uint8Array} value @param {import("./candidate-upload-types.js").UploadCallOptions} options @returns {Promise<import("./types.js").PreparedCandidate>} */
    /** @param {Uint8Array} value @param {import("./candidate-upload-types.js").UploadOptions} [options] @returns {Promise<import("./types.js").PreparedCandidate>} */
    async upload(value, options = {}) {
        if (this.uploading) {
            throw new CandidateUploadError("UPLOAD_BUSY", "A candidate upload is already active.", {
                phase: UPLOAD_PHASE.PREFLIGHT,
                safeToRetry: true,
            });
        }
        const context = createUploadContext();
        this.uploading = true;
        context.onProgress = typeof options.onProgress === "function" ? options.onProgress : undefined;
        try {
            context.blob = copyBytes(value, "Candidate profile blob");
            context.totalBytes = context.blob.length;
            if (options.metadata === undefined) {
                // Authored uploads supply VIA identity; the codec validates every value,
                // including absent fields from an untyped caller, before returning metadata.
                context.metadata = candidateMetadataForBlob(context.blob, /** @type {import("../protocol/types.js").CandidateBlobOptions} */ ({
                    actionAbiDigest: options.actionAbiDigest,
                    storeFormatVersion: options.storeFormatVersion,
                    capabilities: options.capabilities,
                    requestedDomains: options.requestedDomains,
                    viaGeneration: options.viaGeneration,
                    viaDigest: options.viaDigest,
                }));
            } else {
                const supplied = normalizeCandidateMetadata(options.metadata);
                const derived = candidateMetadataForBlob(context.blob, {
                    actionAbiDigest: supplied.actionAbiDigest,
                    storeFormatVersion: supplied.storeFormatVersion,
                    requestedDomains: supplied.requestedDomains,
                    viaGeneration: supplied.viaGeneration,
                    viaDigest: supplied.viaDigest,
                });
                for (const field of /** @type {const} */ (["schemaMajor", "schemaMinor", "requestedDomains", "flags", "payloadLength", "crc32", "digest", "actionAbiDigest", "storeFormatVersion"])) {
                    if (supplied[field] !== derived[field]) {
                        throw new RangeError(`Candidate metadata ${field} does not match the exact candidate blob.`);
                    }
                }
                context.metadata = supplied;
            }

            const base = options.baseSource && {...options.baseSource, bytes: Buffer.from(options.baseSource.bytes)};
            if (base && (crc32(base.bytes) !== base.crc32 || fnv1a32(base.bytes) !== base.digest)) {
                throw new RangeError("Reuse source bytes do not match the reviewed source identity.");
            }
            const plan = candidateTransferPlan(context.blob, base?.bytes);
            context.chunkCount = plan.filter(part => part.kind === "write")
                .reduce((count, part) => count + Math.ceil(part.length / this.chunkSize), 0);

            context.phase = UPLOAD_PHASE.PREFLIGHT;
            context.status = await this.readStatus(context, {ambiguous: false});
            assertNoActiveCandidate(context.status);
            context.transactionId = options.transactionId === undefined
                ? allocateTransactionId(this.transactionIds)
                : normalizeTransactionId(options.transactionId);
            assertTransferContext(context);
            this.emitProgress(context);

            context.phase = UPLOAD_PHASE.BEGIN;
            context.operation = CANDIDATE_OPERATION.BEGIN;
            context.abortNeeded = true;
            context.status = await this.performMutation(
                buildCandidateBeginRequest(context.transactionId, context.metadata),
                context,
                {metadata: context.metadata}
            );
            // BEGIN has acquired the firmware's exclusive store admission.
            // A draft-base mismatch now aborts through the ordinary failure path.
            if (options.verifyBase) await options.verifyBase();
            this.emitProgress(context);

            context.phase = UPLOAD_PHASE.WRITING;
            for (const part of plan) {
                if (part.kind === "reuse") {
                    if (!base) throw new TypeError("Reuse requires the reviewed source bytes.");
                    context.operation = CANDIDATE_OPERATION.REUSE;
                    context.status = await this.performMutation(buildCandidateReuseRequest(context.transactionId, {...part, source: base}), context, part);
                    context.bytesSent = part.offset + part.length;
                    context.bytesReused += part.length;
                    this.emitProgress(context);
                } else {
                    await this.writeChunkRange(context, part);
                }
            }

            context.phase = UPLOAD_PHASE.VALIDATE;
            context.operation = CANDIDATE_OPERATION.VALIDATE;
            context.status = await this.performMutation(
                buildCandidateValidateRequest(context.transactionId),
                context
            );
            this.emitProgress(context);

            context.phase = UPLOAD_PHASE.VALIDATING;
            context.status = await this.waitForValidation(context);
            context.phase = UPLOAD_PHASE.COMPLETE;
            context.operation = CANDIDATE_OPERATION.NONE;
            context.abortNeeded = false;
            this.emitProgress(context);
            return {
                transactionId: context.transactionId,
                metadata: {...context.metadata},
                status: cloneStatus(context.status),
                progress: progressFor(context),
            };
        } catch (cause) {
            if (cause instanceof CandidateUploadError) {
                if (context.abortNeeded && !cause.ambiguous) {
                    const abortResult = await this.bestEffortAbort(context);
                    cause.abortAttempted = abortResult.attempted;
                    cause.abortSucceeded = abortResult.succeeded;
                    cause.safeToRetry = abortResult.succeeded === true;
                    if (abortResult.succeeded !== true) cause.ambiguous = true;
                }
                throw cause;
            }
            const abortResult = context.abortNeeded
                ? await this.bestEffortAbort(context)
                : {attempted: false, succeeded: undefined};
            throw uploadError(context.abortNeeded ? "UPLOAD_FAILED" : "INVALID_CANDIDATE", /** @type {Error | null | undefined} */ (cause)?.message || "Candidate upload failed.", context, {
                abortAttempted: abortResult.attempted,
                abortSucceeded: abortResult.succeeded,
                ambiguous: abortResult.attempted && abortResult.succeeded !== true,
                cause,
                safeToRetry: !context.abortNeeded || abortResult.succeeded === true,
            });
        } finally {
            this.uploading = false;
        }
    }

    /** @param {number} transactionId @param {import("./candidate-upload-types.js").CommitOptions} [options] */
    async commit(transactionId, options = {}) {
        if (this.uploading) {
            throw new CandidateUploadError("UPLOAD_BUSY", "A candidate operation is already active.", {
                phase: UPLOAD_PHASE.COMMIT_PREFLIGHT,
                safeToRetry: true,
            });
        }
        const context = createUploadContext();
        context.transactionId = normalizeTransactionId(transactionId);
        context.onProgress = typeof options.onProgress === "function" ? options.onProgress : undefined;
        context.expectedDigest = options.digest === undefined ? undefined : normalizeInteger(options.digest, "Candidate digest", 0, 0xffffffff);
        if (options.afterDecision !== undefined && typeof options.afterDecision !== "function") {
            throw new TypeError("afterDecision must be a function.");
        }
        context.afterDecision = options.afterDecision;
        this.uploading = true;
        try {
            context.phase = UPLOAD_PHASE.COMMIT_PREFLIGHT;
            context.status = await this.readStatus(context, {ambiguous: false});
            assertOperationContext(context);
            assertCandidateIdentity(context.status, context);
            if (context.expectedDigest !== undefined && context.status.digest !== context.expectedDigest) {
                throw uploadError("CANDIDATE_IDENTITY_MISMATCH", "Prepared candidate digest does not match the requested commit.", context, {safeToRetry: false});
            }
            context.expectedDigest = context.status.digest;
            assertCommitContext(context);
            if (commitIsComplete(context.status, context)) {
                assertNoDeviceError(context.status, context);
                context.phase = UPLOAD_PHASE.COMPLETE;
                this.emitProgress(context);
                return commitResult(context);
            }
            if (context.status.state === CANDIDATE_STATE.AUTHORITY_FAILED) {
                throw deviceRejection(context.status, context);
            }
            if (COMMIT_IN_PROGRESS_STATES.includes(context.status.state)) {
                context.phase = UPLOAD_PHASE.COMMITTING;
                context.operation = CANDIDATE_OPERATION.COMMIT;
                context.status = await this.waitForCommit(context);
                context.phase = UPLOAD_PHASE.COMPLETE;
                context.operation = CANDIDATE_OPERATION.NONE;
                this.emitProgress(context);
                return commitResult(context);
            }
            if (context.status.state !== CANDIDATE_STATE.VALIDATED || context.status.error.id !== CANDIDATE_ERROR.NONE) {
                throw uploadError("CANDIDATE_NOT_VALIDATED", "Only the matching validated candidate can be committed.", context, {safeToRetry: false});
            }

            context.phase = UPLOAD_PHASE.COMMIT;
            context.operation = CANDIDATE_OPERATION.COMMIT;
            context.status = await this.performMutation(
                buildCandidateCommitRequest(context.transactionId),
                context
            );
            context.phase = UPLOAD_PHASE.COMMITTING;
            context.status = await this.waitForCommit(context);
            context.phase = UPLOAD_PHASE.COMPLETE;
            context.operation = CANDIDATE_OPERATION.NONE;
            this.emitProgress(context);
            return commitResult(context);
        } catch (cause) {
            if (cause instanceof CandidateUploadError) throw cause;
            throw uploadError("COMMIT_FAILED", /** @type {Error | null | undefined} */ (cause)?.message || "Candidate commit failed.", context, {
                ambiguous: context.phase !== UPLOAD_PHASE.COMMIT_PREFLIGHT,
                cause,
                safeToRetry: context.operation === CANDIDATE_OPERATION.COMMIT,
            });
        } finally {
            this.uploading = false;
        }
    }

    /** @param {number} transactionId */
    async abort(transactionId) {
        if (this.uploading) throw new CandidateUploadError("UPLOAD_BUSY", "A candidate operation is already active.", {phase: UPLOAD_PHASE.ABORTING, safeToRetry: true});
        const context = createUploadContext();
        context.transactionId = normalizeTransactionId(transactionId);
        this.uploading = true;
        try {
            context.status = await this.readStatus(context, {ambiguous: false});
            const result = await this.bestEffortAbort(context);
            if (!result.succeeded) throw new CandidateUploadError("ABORT_FAILED", "The prepared profile could not be cancelled cleanly.", {phase: UPLOAD_PHASE.ABORTING, ambiguous: true, safeToRetry: false});
            return {transactionId: context.transactionId, status: cloneStatus(context.status)};
        } finally {
            this.uploading = false;
        }
    }

    /** @param {TransferContext} context @param {Extract<import("../protocol/types.js").CandidateTransferRange, {kind: "write"}>} part */
    async writeChunkRange(context, part) {
        let offset = part.offset;
        while (offset < part.offset + part.length) {
            const baseline = context.status;
            let admitted = 0;
            while (admitted < 4 && offset < part.offset + part.length) {
                const bytes = context.blob.subarray(offset, Math.min(offset + this.chunkSize, part.offset + part.length));
                const frame = buildCandidateChunkRequest(context.transactionId, offset, bytes);
                frame[2] = PROFILE_CANDIDATE_V1.VALUE_STREAM_CHUNK;
                context.operation = CANDIDATE_OPERATION.CHUNK;
                context.chunkIndex = context.chunksAdmitted;
                const ack = await this.admitMutation(frame, context);
                if (ack.admission === CANDIDATE_ADMISSION.BUSY) {
                    // Nothing was admitted for this frame. Drain the accepted
                    // prefix before retrying; never guess about lost replies.
                    if (admitted) break;
                    context.status = await this.performMutation(frame, context, {offset, length: bytes.length});
                    context.chunksAdmitted++;
                    context.bytesUploaded += bytes.length;
                    offset += bytes.length;
                    break;
                }
                if (ack.admission !== CANDIDATE_ADMISSION.QUEUED) {
                    throw uploadError("ADMISSION_REJECTED", "Firmware rejected a streaming chunk.", context, {safeToRetry: false,
                        deviceError: {id: ack.errorId, name: ack.errorName, frameOffset: ack.frameOffset}});
                }
                admitted++;
                context.chunksAdmitted++;
                offset += bytes.length;
            }
            if (admitted) {
                context.status = await this.waitForChunkBatch(context, baseline, offset, admitted);
                context.bytesUploaded += offset - baseline.nextOffset;
                context.chunkIndex = context.chunksAdmitted - 1;
            }
            context.bytesSent = offset;
            this.emitProgress(context);
        }
    }

    /** @param {TransferContext} context @param {Status} baseline @param {number} end @param {number} admitted */
    async waitForChunkBatch(context, baseline, end, admitted) {
        const budget = this.createStatusBudget(context, baseline);
        const sequence = (baseline.operationSequence + admitted) & 0xffff;
        while (true) {
            const status = await this.readStatus(context, {ambiguous: true});
            context.status = status;
            assertCandidateIdentity(status, context);
            assertNoDeviceError(status, context);
            if (status.digest !== context.metadata.digest || status.payloadLength !== context.totalBytes
                || status.nextOffset < baseline.nextOffset || status.nextOffset > end) {
                throw operationStatusMismatch(status, context, "streaming chunk identity or offset changed");
            }
            if (!status.mailboxPending && status.nextOffset === end && status.operationSequence === sequence && status.lastOperation === CANDIDATE_OPERATION.CHUNK) {
                assertSuccessfulOperationStatus(status, context, {offset: baseline.nextOffset, length: end - baseline.nextOffset});
                return status;
            }
            if (!this.statusBudgetAllowsAnotherPoll(budget, status)) break;
            await this.waitBeforePoll(context);
        }
        throw uploadError("OPERATION_OUTCOME_AMBIGUOUS", "Streaming chunks did not confirm their exact accepted prefix.", context, {ambiguous: true, safeToRetry: false});
    }

    /** @param {Buffer} frame @param {Context} context */
    async admitMutation(frame, context) {
        let response;
        try {
            response = await this.connection.request(frame, {
                matchResponse: orUnhandled(candidateMutationResponseMatcher, frame),
                timeoutMs: this.requestTimeoutMs,
            });
        } catch (cause) {
            throw uploadError(
                "TRANSPORT_OUTCOME_AMBIGUOUS",
                "The candidate mutation response was lost; the keyboard may or may not have admitted it.",
                context,
                {ambiguous: true, cause, safeToRetry: context.operation === CANDIDATE_OPERATION.COMMIT}
            );
        }
        // The profile owner takes candidate frames only while it is ready;
        // while it reconciles the halves, recovers, or has a storage error,
        // the frame falls through to QMK's unhandled reply. That is a
        // definite answer — this frame was not admitted — not a lost one.
        if (isUnhandledEcho(response, frame)) {
            throw uploadError(
                "KEYBOARD_NOT_READY",
                `The keyboard is not ready to take a profile ${operationLabel(context.operation)} right now; it may be reconciling its halves or recovering. Read the keyboard again, then retry.`,
                context,
                {ambiguous: false, safeToRetry: false}
            );
        }
        let acknowledgment;
        try {
            acknowledgment = decodeCandidateAcknowledgement(response, frame);
        } catch (cause) {
            throw uploadError("PROTOCOL_ERROR", /** @type {Error} */ (cause).message, context, {
                ambiguous: true,
                cause,
                safeToRetry: false,
            });
        }
        return acknowledgment;
    }

    /** @param {Buffer} frame @param {OperationContext} context @param {Details} [operationDetails] */
    async performMutation(frame, context, operationDetails = {}) {
        let baseline = context.status;
        let busyResubmissions = 0;
        while (true) {
            const acknowledgment = await this.admitMutation(frame, context);

            if (acknowledgment.admission === CANDIDATE_ADMISSION.QUEUED) {
                return this.waitForProcessedOperation(context, baseline, operationDetails);
            }
            if (acknowledgment.admission !== CANDIDATE_ADMISSION.BUSY) {
                throw uploadError(
                    "ADMISSION_REJECTED",
                    `Firmware rejected the candidate ${operationLabel(context.operation)} frame at admission.`,
                    context,
                    {
                        deviceError: {
                            id: acknowledgment.errorId,
                            name: acknowledgment.errorName,
                            frameOffset: acknowledgment.frameOffset,
                        },
                        safeToRetry: false,
                    }
                );
            }

            const resolution = await this.waitUntilBusyCanResolve(context, baseline, operationDetails);
            if (resolution.processed) {
                return resolution.status;
            }
            if (!resolution.safeToResubmit) {
                throw uploadError(
                    "UNSAFE_RESUBMISSION",
                    `Firmware was busy and the ${operationLabel(context.operation)} frame cannot be resubmitted safely.`,
                    context,
                    {status: resolution.status, safeToRetry: false}
                );
            }
            if (busyResubmissions >= this.maxBusyResubmissions) {
                throw uploadError("MAILBOX_BUSY", "Firmware remained busy after the bounded resubmission limit.", context, {
                    status: resolution.status,
                    safeToRetry: true,
                });
            }
            busyResubmissions += 1;
            context.status = resolution.status;
            baseline = resolution.status;
        }
    }

    /** @param {OperationContext} context @param {Status} baseline @param {Details} operationDetails */
    async waitForProcessedOperation(context, baseline, operationDetails) {
        const budget = this.createStatusBudget(context, baseline);
        while (true) {
            const status = await this.readStatus(context, {ambiguous: true});
            context.status = status;
            this.emitProgress(context);
            if (status.operationSequence !== baseline.operationSequence) {
                if (status.lastOperation !== context.operation) {
                    throw uploadError(
                        "OPERATION_CORRELATION_MISMATCH",
                        `Candidate operation sequence advanced for ${operationLabel(status.lastOperation)}, not ${operationLabel(context.operation)}.`,
                        context,
                        {ambiguous: true, status, safeToRetry: false}
                    );
                }
                assertSuccessfulOperationStatus(status, context, operationDetails);
                return status;
            }
            if (!this.statusBudgetAllowsAnotherPoll(budget, status)) break;
            await this.waitBeforePoll(context);
        }
        throw uploadError(
            "OPERATION_OUTCOME_AMBIGUOUS",
            `Candidate ${operationLabel(context.operation)} made no observable progress within its firmware-aware wait window.`,
            context,
            {ambiguous: true, safeToRetry: false}
        );
    }

    /** @param {OperationContext} context @param {Status} baseline @param {Details} operationDetails */
    async waitUntilBusyCanResolve(context, baseline, operationDetails) {
        const budget = this.createStatusBudget(context, baseline);
        while (true) {
            const status = await this.readStatus(context, {ambiguous: false});
            context.status = status;
            this.emitProgress(context);

            if (status.operationSequence !== baseline.operationSequence
                && status.lastOperation === context.operation
                && operationStatusCouldBeOurs(status, context, operationDetails)) {
                assertSuccessfulOperationStatus(status, context, operationDetails);
                return {processed: true, safeToResubmit: false, status};
            }
            if (!status.mailboxPending) {
                return {
                    processed: false,
                    safeToResubmit: canSafelyResubmit(status, context, operationDetails),
                    status,
                };
            }
            if (!this.statusBudgetAllowsAnotherPoll(budget, status)) break;
            await this.waitBeforePoll(context);
        }
        throw uploadError("MAILBOX_BUSY", "Firmware mailbox made no observable progress within its firmware-aware wait window.", context, {
            safeToRetry: true,
        });
    }

    /** @param {OperationContext} context */
    async waitForValidation(context) {
        const budget = this.createStatusBudget(context, context.status);
        while (true) {
            const status = context.status?.state === CANDIDATE_STATE.VALIDATED
                || context.status?.state === CANDIDATE_STATE.REJECTED
                ? context.status
                : await this.readStatus(context, {ambiguous: true});
            context.status = status;
            this.emitProgress(context);
            assertCandidateIdentity(status, context);
            if (status.state === CANDIDATE_STATE.VALIDATED) {
                assertNoDeviceError(status, context);
                return status;
            }
            if (status.state === CANDIDATE_STATE.REJECTED || status.error.id !== CANDIDATE_ERROR.NONE) {
                throw deviceRejection(status, context);
            }
            if (status.state !== CANDIDATE_STATE.VALIDATING) {
                throw uploadError("INVALID_VALIDATION_STATE", `Firmware entered candidate state ${status.state} during validation.`, context, {
                    status,
                    safeToRetry: false,
                });
            }
            if (!this.statusBudgetAllowsAnotherPoll(budget, status)) break;
            await this.waitBeforePoll(context);
        }
        throw uploadError("VALIDATION_OUTCOME_AMBIGUOUS", "Candidate validation made no observable progress within its firmware-aware wait window.", context, {
            ambiguous: true,
            safeToRetry: false,
        });
    }

    /** @param {CommitContext} context */
    async waitForCommit(context) {
        const budget = this.createStatusBudget(context, context.status);
        let first = true;
        while (true) {
            const status = first
                ? context.status
                : await this.readStatus(context, {ambiguous: true});
            first = false;
            context.status = status;
            if (status.state === CANDIDATE_STATE.PREPARING_PEER) await this.refreshPeerStatus(context);
            this.emitProgress(context);
            assertCandidateIdentity(status, context);
            if (status.digest !== context.expectedDigest) {
                throw uploadError("CANDIDATE_IDENTITY_MISMATCH", "Commit status digest changed during persistence.", context, {status, safeToRetry: false});
            }
            if (status.state === CANDIDATE_STATE.CONVERGING_PEER && context.afterDecision && !context.decisionHandled) {
                // CONVERGING_PEER begins only after the local custom-profile
                // commit marker is durable. The caller may now roll the VIA
                // store forward on the USB half while the peer remains the
                // recovery copy for an interrupted post-decision write.
                context.decisionHandled = true;
                await context.afterDecision({
                    transactionId: context.transactionId,
                    digest: context.expectedDigest,
                    status: cloneStatus(status),
                });
                budget.deadline = this.now() + budget.timeoutMs;
            }
            if (commitIsComplete(status, context)) {
                assertNoDeviceError(status, context);
                return status;
            }
            if (status.state === CANDIDATE_STATE.AUTHORITY_FAILED || status.state === CANDIDATE_STATE.REJECTED || status.error.id !== CANDIDATE_ERROR.NONE) {
                throw deviceRejection(status, context);
            }
            if (!COMMIT_IN_PROGRESS_STATES.includes(status.state)) {
                throw uploadError("INVALID_COMMIT_STATE", `Firmware entered candidate state ${status.state} during commit.`, context, {status, safeToRetry: false});
            }
            // The copy to the other half moving on counts as progress.
            if (!this.statusBudgetAllowsAnotherPoll(budget, status, peerProgressFingerprint(context.peer))) break;
            await this.waitBeforePoll(context);
        }
        throw uploadError("COMMIT_OUTCOME_AMBIGUOUS", "Candidate commit made no observable progress within its firmware-aware wait window.", context, {
            ambiguous: true,
            safeToRetry: true,
        });
    }

    /** @param {Context} context @param {{ambiguous: boolean}} options */
    async readStatus(context, options) {
        try {
            return await readCandidateStatus(this.connection, {
                nextRequestId: () => this.requestIds.next(),
                timeoutMs: this.requestTimeoutMs,
            });
        } catch (cause) {
            throw uploadError(
                options.ambiguous ? "TRANSPORT_OUTCOME_AMBIGUOUS" : "TRANSPORT_FAILURE",
                options.ambiguous
                    ? "Candidate status could not be read after a mutation; its outcome is ambiguous."
                    : "Candidate status could not be read.",
                context,
                {ambiguous: options.ambiguous, cause, safeToRetry: !options.ambiguous}
            );
        }
    }

    /** @param {Context} context @param {Status | undefined} baseline */
    createStatusBudget(context, baseline) {
        const timeoutMs = this.statusStallTimeoutMs === undefined
            ? candidateStatusStallTimeoutMs(candidatePayloadLength(context), baseline?.state)
            : this.statusStallTimeoutMs;
        return {
            configuredTimeoutMs: this.statusStallTimeoutMs,
            deadline: this.now() + timeoutMs,
            fingerprint: `${statusProgressFingerprint(baseline)}|`,
            maxPolls: this.maxStatusPolls,
            payloadLength: candidatePayloadLength(context),
            polls: 0,
            timeoutMs,
        };
    }

    /** @param {Context} context */
    async refreshPeerStatus(context) {
        if (!this.readPeerStatus) return;
        try {
            context.peer = await this.readPeerStatus(this.connection, {nextRequestId: () => this.requestIds.next(), timeoutMs: this.requestTimeoutMs});
        } catch {
            // Page 1 is advisory; the page-0 poll decides the commit's outcome.
        }
    }

    /** @param {import("./candidate-upload-types.js").StatusBudget} budget @param {Status | undefined} status @param {string} [extra] */
    statusBudgetAllowsAnotherPoll(budget, status, extra = "") {
        const now = this.now();
        const fingerprint = `${statusProgressFingerprint(status)}|${extra}`;
        budget.polls += 1;
        if (fingerprint !== budget.fingerprint) {
            budget.fingerprint = fingerprint;
            budget.timeoutMs = budget.configuredTimeoutMs === undefined
                ? candidateStatusStallTimeoutMs(budget.payloadLength, status?.state)
                : budget.configuredTimeoutMs;
            budget.deadline = now + budget.timeoutMs;
        }
        if (budget.maxPolls !== undefined && budget.polls >= budget.maxPolls) return false;
        return now < budget.deadline;
    }

    /** @param {Context} context */
    async waitBeforePoll(context) {
        if (this.pollIntervalMs > 0) {
            await this.sleep(this.pollIntervalMs);
        }
    }

    /** @param {Context} context */
    async bestEffortAbort(context) {
        const result = {attempted: true, succeeded: false};
        const previousPhase = context.phase;
        const previousOperation = context.operation;
        try {
            context.phase = UPLOAD_PHASE.ABORTING;
            context.operation = CANDIDATE_OPERATION.ABORT;
            if (!context.status) {
                context.status = await this.readStatus(context, {ambiguous: false});
            }
            assertOperationContext(context);
            context.status = await this.performMutation(
                buildCandidateAbortRequest(context.transactionId),
                context
            );
            result.succeeded = context.status.state === CANDIDATE_STATE.IDLE;
        } catch {
            result.succeeded = false;
        } finally {
            context.phase = previousPhase;
            context.operation = previousOperation;
        }
        return result;
    }

    /** @param {Context} context */
    emitProgress(context) {
        const listener = typeof context.onProgress === "function" ? context.onProgress : this.onProgress;
        if (!listener) return;
        try {
            listener(progressFor(context));
        } catch {
            // Progress observers must not affect the transport transaction.
        }
    }
}

/** @param {Status} status @param {Context} context @param {Details} operationDetails */
function assertSuccessfulOperationStatus(status, context, operationDetails) {
    if (status.error.id !== CANDIDATE_ERROR.NONE || status.state === CANDIDATE_STATE.REJECTED || status.state === CANDIDATE_STATE.AUTHORITY_FAILED) {
        throw deviceRejection(status, context);
    }
    assertCandidateIdentity(status, context);
    switch (context.operation) {
        case CANDIDATE_OPERATION.BEGIN:
            if (status.state !== CANDIDATE_STATE.RECEIVING
                || status.nextOffset !== 0
                || status.payloadLength !== beginMetadata(operationDetails).payloadLength
                || status.digest !== beginMetadata(operationDetails).digest) {
                throw operationStatusMismatch(status, context, "begin metadata/state did not match");
            }
            break;
        case CANDIDATE_OPERATION.REUSE:
        case CANDIDATE_OPERATION.CHUNK: {
            const expectedOffset = mutationEnd(operationDetails);
            const expectedState = expectedOffset === status.payloadLength
                ? CANDIDATE_STATE.COMPLETE
                : CANDIDATE_STATE.RECEIVING;
            if (status.nextOffset !== expectedOffset || status.state !== expectedState) {
                throw operationStatusMismatch(status, context, `next offset ${status.nextOffset} did not equal ${expectedOffset}`);
            }
            break;
        }
        case CANDIDATE_OPERATION.VALIDATE:
            if (!(/** @type {number[]} */ ([CANDIDATE_STATE.VALIDATING, CANDIDATE_STATE.VALIDATED])).includes(status.state)) {
                throw operationStatusMismatch(status, context, `validation entered state ${status.state}`);
            }
            break;
        case CANDIDATE_OPERATION.COMMIT:
            if (![...COMMIT_IN_PROGRESS_STATES, CANDIDATE_STATE.IDLE].includes(status.state)) {
                throw operationStatusMismatch(status, context, `commit entered state ${status.state}`);
            }
            break;
        case CANDIDATE_OPERATION.ABORT:
            if (status.state !== CANDIDATE_STATE.IDLE) {
                throw operationStatusMismatch(status, context, `abort entered state ${status.state}`);
            }
            break;
        default:
            throw operationStatusMismatch(status, context, "unknown operation");
    }
}

/** @param {Status} status @param {Context} context @param {Details} operationDetails */
function operationStatusCouldBeOurs(status, context, operationDetails) {
    if (status.transactionId !== context.transactionId) return false;
    if (status.error.id !== CANDIDATE_ERROR.NONE) return true;
    switch (context.operation) {
        case CANDIDATE_OPERATION.BEGIN:
            return status.payloadLength === beginMetadata(operationDetails).payloadLength
                && status.digest === beginMetadata(operationDetails).digest;
        case CANDIDATE_OPERATION.REUSE:
        case CANDIDATE_OPERATION.CHUNK:
            return !status.mailboxPending && status.nextOffset === mutationEnd(operationDetails);
        case CANDIDATE_OPERATION.VALIDATE:
            return (/** @type {number[]} */ ([CANDIDATE_STATE.VALIDATING, CANDIDATE_STATE.VALIDATED, CANDIDATE_STATE.REJECTED])).includes(status.state);
        case CANDIDATE_OPERATION.COMMIT:
            return [...COMMIT_IN_PROGRESS_STATES, CANDIDATE_STATE.IDLE, CANDIDATE_STATE.REJECTED, CANDIDATE_STATE.AUTHORITY_FAILED].includes(status.state);
        case CANDIDATE_OPERATION.ABORT:
            return status.state === CANDIDATE_STATE.IDLE;
        default:
            return false;
    }
}

/** @param {Status} status @param {Context} context @param {Details} operationDetails */
function canSafelyResubmit(status, context, operationDetails) {
    if (status.mailboxPending) return false;
    if (context.operation === CANDIDATE_OPERATION.ABORT) {
        return status.state === CANDIDATE_STATE.IDLE || status.transactionId === context.transactionId;
    }
    if (status.poisoned) return false;
    switch (context.operation) {
        case CANDIDATE_OPERATION.BEGIN:
            return status.state === CANDIDATE_STATE.IDLE;
        case CANDIDATE_OPERATION.REUSE:
        case CANDIDATE_OPERATION.CHUNK: {
            if (status.transactionId !== context.transactionId
                || !(/** @type {number[]} */ ([CANDIDATE_STATE.RECEIVING, CANDIDATE_STATE.COMPLETE])).includes(status.state)) {
                return false;
            }
            const end = mutationEnd(operationDetails);
            return status.nextOffset === operationDetails.offset || status.nextOffset === end;
        }
        case CANDIDATE_OPERATION.VALIDATE:
            return status.transactionId === context.transactionId && status.state === CANDIDATE_STATE.COMPLETE;
        case CANDIDATE_OPERATION.COMMIT:
            return status.transactionId === context.transactionId
                && ([CANDIDATE_STATE.VALIDATED, ...COMMIT_IN_PROGRESS_STATES].includes(status.state)
                    || (status.state === CANDIDATE_STATE.IDLE && status.lastOperation === CANDIDATE_OPERATION.COMMIT));
        default:
            return false;
    }
}

/** @param {Status} status @param {Context} context */
function assertCandidateIdentity(status, context) {
    if (status.transactionId !== context.transactionId) {
        throw uploadError(
            "TRANSACTION_CORRELATION_MISMATCH",
            `Candidate status transaction ${status.transactionId} does not match ${context.transactionId}.`,
            context,
            {status, safeToRetry: false}
        );
    }
}

/** @param {Status} status @param {Context} context */
function commitIsComplete(status, context) {
    return status.state === CANDIDATE_STATE.IDLE
        && status.lastOperation === CANDIDATE_OPERATION.COMMIT
        && status.transactionId === context.transactionId
        && status.digest === context.expectedDigest;
}

/** @param {CommitContext} context */
function commitResult(context) {
    return {
        transactionId: context.transactionId,
        digest: context.expectedDigest,
        status: cloneStatus(context.status),
        progress: progressFor(context),
    };
}

/** @param {Status} status @param {Context} context */
function assertNoDeviceError(status, context) {
    if (status.error.id !== CANDIDATE_ERROR.NONE) {
        throw deviceRejection(status, context);
    }
}

/** @param {Status} status @param {Context} context */
function deviceRejection(status, context) {
    if (status.error.id === CANDIDATE_ERROR.DURABILITY_UNKNOWN) {
        return uploadError(
            "DURABILITY_UNKNOWN",
            "Firmware could not confirm whether the final commit marker became durable; reconcile device status before retrying.",
            context,
            {ambiguous: true, deviceError: status.error, status, safeToRetry: false}
        );
    }
    if (status.state === CANDIDATE_STATE.AUTHORITY_FAILED) {
        return uploadError(
            "AUTHORITY_FAILED",
            `The committed profile could not establish split authority (${CANDIDATE_ERROR_NAMES[status.error.id] || `error ${status.error.id}`}); it was not activated.`,
            context,
            {deviceError: status.error, status, safeToRetry: false}
        );
    }
    return uploadError(
        "DEVICE_REJECTED",
        `Firmware rejected the candidate with ${CANDIDATE_ERROR_NAMES[status.error.id] || `error ${status.error.id}`}.`,
        context,
        {deviceError: status.error, status, safeToRetry: false}
    );
}

/** @param {Status} status @param {Context} context @param {string} reason */
function operationStatusMismatch(status, context, reason) {
    return uploadError(
        "OPERATION_STATUS_MISMATCH",
        `Processed candidate ${operationLabel(context.operation)} status was inconsistent: ${reason}.`,
        context,
        {status, safeToRetry: false}
    );
}

/** @returns {Context} */
function createUploadContext() {
    return {
        abortNeeded: false,
        afterDecision: undefined,
        blob: undefined,
        bytesSent: 0,
        bytesUploaded: 0,
        bytesReused: 0,
        chunkCount: 0,
        chunkIndex: -1,
        chunksAdmitted: 0,
        metadata: undefined,
        decisionHandled: false,
        onProgress: undefined,
        operation: CANDIDATE_OPERATION.NONE,
        phase: UPLOAD_PHASE.PREFLIGHT,
        status: undefined,
        totalBytes: 0,
        transactionId: undefined,
    };
}

/** @param {Context} context */
function candidatePayloadLength(context) {
    return context.metadata?.payloadLength
        ?? context.status?.payloadLength
        ?? PROFILE_CANDIDATE_V1.MAX_BLOB_SIZE;
}

// Firmware performs at most one <=20-byte candidate/split work item per scan.
// Ordinary staging therefore scales with the actual candidate, leaves room
// for the split peer's 3-second liveness window, and expires before the 15-
// second precommit inactivity cleanup. PREPARING_PEER is different: candidate
// status cannot expose its internal acknowledged split offset, so the desktop
// allows the firmware's full 60-second no-progress window plus enough time for
// the audited maximum transfer and scheduling overhead. Observable status
// transitions renew the deadline for the newly visible phase.
//
// VALIDATING is the other phase page 0 cannot show progress in: validation
// renews the firmware's lease each step, so no precommit cleanup runs while it
// works, and a large profile may validate for longer than the cleanup window.
// It gets an allowance proportional to the candidate.
/** @param {number} payloadLength @param {number | undefined} state */
function candidateStatusStallTimeoutMs(payloadLength, state) {
    if (state === CANDIDATE_STATE.PREPARING_PEER) {
        return FIRMWARE_PREPARING_PEER_NO_PROGRESS_TIMEOUT_MS
            + DEFAULT_PREPARING_PEER_TRANSFER_ALLOWANCE_MS;
    }
    const boundedLength = Math.max(
        PROFILE_CANDIDATE_V1.MIN_BLOB_SIZE,
        Math.min(PROFILE_CANDIDATE_V1.MAX_BLOB_SIZE, Number(payloadLength) || PROFILE_CANDIDATE_V1.MAX_BLOB_SIZE)
    );
    if (state === CANDIDATE_STATE.VALIDATING) {
        return FIRMWARE_SPLIT_PEER_TIMEOUT_MS
            + DEFAULT_STATUS_SCHEDULING_MARGIN_MS
            + Math.ceil(boundedLength / VALIDATION_BYTES_PER_STEP) * DEFAULT_VALIDATION_STEP_ALLOWANCE_MS;
    }
    const scanSteps = Math.ceil(boundedLength / PROFILE_CANDIDATE_V1.CHUNK_MAX);
    const workAllowance = FIRMWARE_SPLIT_PEER_TIMEOUT_MS
        + DEFAULT_STATUS_SCHEDULING_MARGIN_MS
        + scanSteps * DEFAULT_STATUS_SCAN_STEP_ALLOWANCE_MS;
    return Math.min(
        FIRMWARE_HOST_PRECOMMIT_TIMEOUT_MS - DEFAULT_STATUS_TIMEOUT_SAFETY_MS,
        workAllowance
    );
}

/** @param {Status | undefined} status */
function statusProgressFingerprint(status) {
    if (!status) return "none";
    return [
        status.state,
        status.lastOperation,
        status.flags,
        status.operationSequence,
        status.nextOffset,
        status.error?.id,
    ].join(":");
}

/** @param {import("../protocol/types.js").RequestIds} sequence */
function allocateTransactionId(sequence) {
    return normalizeTransactionId(sequence.next());
}

/** @param {Status} status */
function assertNoActiveCandidate(status) {
    if (status.state !== CANDIDATE_STATE.IDLE) {
        throw new CandidateUploadError(
            "ACTIVE_CANDIDATE",
            `Candidate transaction ${status.transactionId} is already in firmware state ${CANDIDATE_STATE_NAMES[status.state] || status.state}; abort or finish it before starting another upload.`,
            {phase: UPLOAD_PHASE.PREFLIGHT, status, transactionId: status.transactionId, safeToRetry: false}
        );
    }
}

/** @param {import("./types.js").CandidatePeer | undefined} peer */
function peerProgressFingerprint(peer) {
    return peer ? [peer.phase, peer.transferOffset, peer.lastStatus].join(":") : "";
}

/** @param {Context} context @returns {Progress} */
function progressFor(context) {
    return {
        peer: context.peer ? {...context.peer} : null,
        phase: context.phase,
        transactionId: context.transactionId,
        operation: context.operation,
        // bytesSent is retained for callers using it as completed progress.
        // Explicit counts distinguish reconstructed bytes from host uploads.
        bytesSent: context.bytesSent,
        bytesPrepared: context.bytesSent,
        bytesUploaded: context.bytesUploaded,
        bytesReused: context.bytesReused,
        totalBytes: context.totalBytes,
        chunkIndex: context.chunkIndex,
        chunkCount: context.chunkCount,
        status: context.status ? cloneStatus(context.status) : null,
    };
}

/** @param {Progress} progress @returns {Progress} */
function cloneProgress(progress) {
    return {
        ...progress,
        status: progress.status ? cloneStatus(progress.status) : progress.status,
    };
}

/** @param {Status} status @returns {Status} */
function cloneStatus(status) {
    return {
        ...status,
        error: status.error ? {...status.error} : status.error,
    };
}

/** @param {string} code @param {string} message @param {Context} context @param {FailureDetails} [details] */
function uploadError(code, message, context, details = {}) {
    return new CandidateUploadError(code, message, {
        phase: context.phase,
        transactionId: context.transactionId,
        operation: context.operation,
        progress: progressFor(context),
        status: details.status || context.status,
        ...details,
    });
}

/** @param {number} operation */
function operationLabel(operation) {
    return Object.entries(CANDIDATE_OPERATION).find(([, value]) => value === operation)?.[0].toLowerCase() || `operation ${operation}`;
}

/** @param {unknown} value */
function normalizeTransactionId(value) {
    const number = Number(value);
    if (!Number.isInteger(number) || number < 1 || number > 0xffff) {
        throw new RangeError("Candidate transaction id must be a nonzero 16-bit integer.");
    }
    return number;
}

/** @param {unknown} value @param {string} label @param {number} minimum @param {number} maximum */
function normalizeInteger(value, label, minimum, maximum) {
    const number = Number(value);
    if (!Number.isInteger(number) || number < minimum || number > maximum) {
        throw new RangeError(`${label} must be an integer from ${minimum} through ${maximum}.`);
    }
    return number;
}

/** @param {import("../protocol/types.js").RequestIds} value @param {string} label */
function assertIdSequence(value, label) {
    if (!value || typeof value.next !== "function") {
        throw new TypeError(`${label} must provide next().`);
    }
}

/** @param {unknown} value @param {string} label */
function copyBytes(value, label) {
    if (!(value instanceof Uint8Array)) {
        throw new TypeError(`${label} must be a Buffer or Uint8Array.`);
    }
    return Buffer.from(value);
}

/** @param {number} milliseconds @returns {Promise<void>} */
function defaultSleep(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

module.exports = {
    DEFAULT_MAX_BUSY_RESUBMISSIONS,
    DEFAULT_POLL_INTERVAL_MS,
    FIRMWARE_HOST_PRECOMMIT_TIMEOUT_MS,
    FIRMWARE_PREPARING_PEER_NO_PROGRESS_TIMEOUT_MS,
    CandidateUploadCoordinator,
    CandidateUploadError,
    UPLOAD_PHASE,
    candidateStatusStallTimeoutMs,
};

/** @param {Context} context @returns {asserts context is OperationContext} */
function assertOperationContext(context) {
    if (context.transactionId === undefined || !context.status) throw new TypeError("Candidate operation requires its transaction and read status.");
}
/** @param {Context} context @returns {asserts context is TransferContext} */
function assertTransferContext(context) {
    assertOperationContext(context);
    if (!context.blob || !context.metadata) throw new TypeError("Candidate transfer requires its validated bytes and metadata.");
}

/** @param {Context} context @returns {asserts context is CommitContext} */
function assertCommitContext(context) {
    assertOperationContext(context);
    if (context.expectedDigest === undefined) throw new TypeError("Candidate commit requires its expected digest.");
}
/** @param {Details} details */
function beginMetadata(details) {
    if (!details.metadata) throw new TypeError("Candidate begin requires its validated metadata.");
    return details.metadata;
}
/** @param {Details} details */
function mutationEnd(details) {
    if (details.offset === undefined || details.length === undefined) throw new TypeError("Candidate range requires its offset and length.");
    return details.offset + details.length;
}
