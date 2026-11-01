// @ts-check
"use strict";

// What a candidate status read says about the operation an upload sent: that
// it did what was asked, that it could be the upload's own, that sending it
// again is safe, and that a commit finished. Pure: the upload coordinator
// (candidate-upload-coordinator.js) reads the status and acts on the answer.

/**
 * @typedef {import("./types.js").CandidateStatus} Status
 * @typedef {import("./candidate-upload-types.js").MutationDetails} Details
 * @typedef {Pick<import("./candidate-upload-types.js").UploadContext, "transactionId" | "operation">} Sent
 */
const {CANDIDATE_ERROR, CANDIDATE_OPERATION, CANDIDATE_STATE} = require("../protocol/profile-candidate-v1");

/** @type {readonly number[]} */
const COMMIT_IN_PROGRESS_STATES = Object.freeze([
    CANDIDATE_STATE.PREPARING_PEER,
    CANDIDATE_STATE.COMMITTING,
    CANDIDATE_STATE.CONVERGING_PEER,
    CANDIDATE_STATE.ACTIVATING,
]);

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

// The firmware refused the operation, or the commit could not take authority.
/** @param {Status} status */
const statusRejects = status => status.error.id !== CANDIDATE_ERROR.NONE
    || status.state === CANDIDATE_STATE.REJECTED || status.state === CANDIDATE_STATE.AUTHORITY_FAILED;

// Why a processed status does not show the operation done, or "" when it
// does. The transaction is the caller's to check first.
/** @param {Status} status @param {number} operation @param {Details} details */
function operationMismatchReason(status, operation, details) {
    switch (operation) {
        case CANDIDATE_OPERATION.BEGIN:
            return status.state !== CANDIDATE_STATE.RECEIVING
                || status.nextOffset !== 0
                || status.payloadLength !== beginMetadata(details).payloadLength
                || status.digest !== beginMetadata(details).digest ? "begin metadata/state did not match" : "";
        case CANDIDATE_OPERATION.REUSE:
        case CANDIDATE_OPERATION.CHUNK: {
            const expectedOffset = mutationEnd(details);
            const expectedState = expectedOffset === status.payloadLength
                ? CANDIDATE_STATE.COMPLETE
                : CANDIDATE_STATE.RECEIVING;
            return status.nextOffset !== expectedOffset || status.state !== expectedState
                ? `next offset ${status.nextOffset} did not equal ${expectedOffset}` : "";
        }
        case CANDIDATE_OPERATION.VALIDATE:
            return (/** @type {number[]} */ ([CANDIDATE_STATE.VALIDATING, CANDIDATE_STATE.VALIDATED])).includes(status.state)
                ? "" : `validation entered state ${status.state}`;
        case CANDIDATE_OPERATION.COMMIT:
            return [...COMMIT_IN_PROGRESS_STATES, CANDIDATE_STATE.IDLE].includes(status.state) ? "" : `commit entered state ${status.state}`;
        case CANDIDATE_OPERATION.ABORT:
            return status.state === CANDIDATE_STATE.IDLE ? "" : `abort entered state ${status.state}`;
        default:
            return "unknown operation";
    }
}

/** @param {Status} status @param {Sent} sent @param {Details} details */
function operationStatusCouldBeOurs(status, sent, details) {
    if (status.transactionId !== sent.transactionId) return false;
    if (status.error.id !== CANDIDATE_ERROR.NONE) return true;
    switch (sent.operation) {
        case CANDIDATE_OPERATION.BEGIN:
            return status.payloadLength === beginMetadata(details).payloadLength
                && status.digest === beginMetadata(details).digest;
        case CANDIDATE_OPERATION.REUSE:
        case CANDIDATE_OPERATION.CHUNK:
            return !status.mailboxPending && status.nextOffset === mutationEnd(details);
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

/** @param {Status} status @param {Sent} sent @param {Details} details */
function canSafelyResubmit(status, sent, details) {
    if (status.mailboxPending) return false;
    if (sent.operation === CANDIDATE_OPERATION.ABORT) {
        return status.state === CANDIDATE_STATE.IDLE || status.transactionId === sent.transactionId;
    }
    if (status.poisoned) return false;
    switch (sent.operation) {
        case CANDIDATE_OPERATION.BEGIN:
            return status.state === CANDIDATE_STATE.IDLE;
        case CANDIDATE_OPERATION.REUSE:
        case CANDIDATE_OPERATION.CHUNK: {
            if (status.transactionId !== sent.transactionId
                || !(/** @type {number[]} */ ([CANDIDATE_STATE.RECEIVING, CANDIDATE_STATE.COMPLETE])).includes(status.state)) {
                return false;
            }
            const end = mutationEnd(details);
            return status.nextOffset === details.offset || status.nextOffset === end;
        }
        case CANDIDATE_OPERATION.VALIDATE:
            return status.transactionId === sent.transactionId && status.state === CANDIDATE_STATE.COMPLETE;
        case CANDIDATE_OPERATION.COMMIT:
            // A finished COMMIT is confirmed from status (commitIsComplete),
            // not resubmitted.
            return status.transactionId === sent.transactionId
                && [CANDIDATE_STATE.VALIDATED, ...COMMIT_IN_PROGRESS_STATES].includes(status.state);
        default:
            return false;
    }
}

/** @param {Status} status @param {Pick<import("./candidate-upload-types.js").UploadContext, "transactionId" | "expectedDigest">} commit */
function commitIsComplete(status, commit) {
    return status.state === CANDIDATE_STATE.IDLE
        && status.lastOperation === CANDIDATE_OPERATION.COMMIT
        && status.transactionId === commit.transactionId
        && status.digest === commit.expectedDigest;
}

// A status to hand on: its error is the caller's own copy.
/** @param {Status} status @returns {Status} */
function cloneStatus(status) {
    return {
        ...status,
        error: status.error ? {...status.error} : status.error,
    };
}

module.exports = {COMMIT_IN_PROGRESS_STATES, statusRejects, operationMismatchReason, operationStatusCouldBeOurs, canSafelyResubmit, commitIsComplete, cloneStatus};
