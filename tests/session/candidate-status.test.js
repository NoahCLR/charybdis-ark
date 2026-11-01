"use strict";
// What a candidate status says about the operation an upload sent. The upload
// coordinator acts on these answers (tests/session/candidate-upload-coordinator.test.js
// drives them through a fake keyboard); here each is held on its own.
const assert = require("node:assert/strict");
const test = require("node:test");
const {CANDIDATE_ERROR: E, CANDIDATE_OPERATION: OP, CANDIDATE_STATE: S} = require("../../core/protocol/profile-candidate-v1");
const {COMMIT_IN_PROGRESS_STATES, statusRejects, operationMismatchReason, operationStatusCouldBeOurs, canSafelyResubmit, commitIsComplete, cloneStatus} = require("../../core/session/candidate-status");

const metadata = {payloadLength: 100, digest: 0xabc};
/** @param {Record<string, unknown>} [fields] */
const status = (fields = {}) => ({state: S.IDLE, transactionId: 7, nextOffset: 0, payloadLength: 100, digest: 0xabc, lastOperation: OP.NONE,
    mailboxPending: false, poisoned: false, error: {id: E.NONE}, ...fields});

test("a refusal, a rejected candidate and a commit without authority are rejections", () => {
    assert.equal(statusRejects(status()), false);
    assert.equal(statusRejects(status({error: {id: E.MAILBOX_BUSY}})), true);
    assert.equal(statusRejects(status({state: S.REJECTED})), true);
    assert.equal(statusRejects(status({state: S.AUTHORITY_FAILED})), true);
});

test("each operation is done only by the state and offsets it leads to, and says why not", () => {
    assert.equal(operationMismatchReason(status({state: S.RECEIVING}), OP.BEGIN, {metadata}), "");
    assert.equal(operationMismatchReason(status({state: S.RECEIVING, digest: 1}), OP.BEGIN, {metadata}), "begin metadata/state did not match");
    // A chunk that ends the payload completes it; one before the end keeps receiving.
    assert.equal(operationMismatchReason(status({state: S.RECEIVING, nextOffset: 60}), OP.CHUNK, {offset: 40, length: 20}), "");
    assert.equal(operationMismatchReason(status({state: S.COMPLETE, nextOffset: 100}), OP.REUSE, {offset: 80, length: 20}), "");
    assert.equal(operationMismatchReason(status({state: S.RECEIVING, nextOffset: 100}), OP.CHUNK, {offset: 80, length: 20}), "next offset 100 did not equal 100");
    assert.equal(operationMismatchReason(status({state: S.RECEIVING, nextOffset: 40}), OP.CHUNK, {offset: 40, length: 20}), "next offset 40 did not equal 60");
    assert.equal(operationMismatchReason(status({state: S.VALIDATING}), OP.VALIDATE, {}), "");
    assert.equal(operationMismatchReason(status({state: S.COMPLETE}), OP.VALIDATE, {}), `validation entered state ${S.COMPLETE}`);
    for (const state of [...COMMIT_IN_PROGRESS_STATES, S.IDLE]) assert.equal(operationMismatchReason(status({state}), OP.COMMIT, {}), "", String(state));
    assert.equal(operationMismatchReason(status({state: S.VALIDATED}), OP.COMMIT, {}), `commit entered state ${S.VALIDATED}`);
    assert.equal(operationMismatchReason(status({state: S.RECEIVING}), OP.ABORT, {}), `abort entered state ${S.RECEIVING}`);
    assert.equal(operationMismatchReason(status(), OP.NONE, {}), "unknown operation");
    assert.throws(() => operationMismatchReason(status({state: S.RECEIVING}), OP.BEGIN, {}), TypeError, "a begin is judged against its metadata");
    assert.throws(() => operationMismatchReason(status(), OP.CHUNK, {offset: 0}), TypeError, "a chunk against its range");
});

test("a status is the upload's own only for its transaction, and then by what the operation leaves", () => {
    const sent = {transactionId: 7, operation: OP.CHUNK};
    assert.equal(operationStatusCouldBeOurs(status({transactionId: 8, nextOffset: 20}), sent, {offset: 0, length: 20}), false);
    assert.equal(operationStatusCouldBeOurs(status({nextOffset: 20}), sent, {offset: 0, length: 20}), true);
    assert.equal(operationStatusCouldBeOurs(status({nextOffset: 20, mailboxPending: true}), sent, {offset: 0, length: 20}), false, "still pending is not processed");
    assert.equal(operationStatusCouldBeOurs(status({error: {id: E.OUT_OF_ORDER}}), sent, {offset: 0, length: 20}), true, "an error on its transaction is its own");
    assert.equal(operationStatusCouldBeOurs(status(), {transactionId: 7, operation: OP.BEGIN}, {metadata}), true);
    assert.equal(operationStatusCouldBeOurs(status({digest: 1}), {transactionId: 7, operation: OP.BEGIN}, {metadata}), false);
    assert.equal(operationStatusCouldBeOurs(status({state: S.REJECTED}), {transactionId: 7, operation: OP.VALIDATE}, {}), true);
    assert.equal(operationStatusCouldBeOurs(status({state: S.AUTHORITY_FAILED}), {transactionId: 7, operation: OP.COMMIT}, {}), true);
    assert.equal(operationStatusCouldBeOurs(status({state: S.RECEIVING}), {transactionId: 7, operation: OP.ABORT}, {}), false);
    assert.equal(operationStatusCouldBeOurs(status(), {transactionId: 7, operation: OP.NONE}, {}), false);
});

test("an operation is sent again only where repeating it cannot do it twice", () => {
    assert.equal(canSafelyResubmit(status({mailboxPending: true}), {transactionId: 7, operation: OP.ABORT}, {}), false, "nothing while the mailbox is full");
    assert.equal(canSafelyResubmit(status({poisoned: true, state: S.RECEIVING}), {transactionId: 7, operation: OP.ABORT}, {}), true, "an abort, even poisoned");
    assert.equal(canSafelyResubmit(status({transactionId: 8, state: S.RECEIVING}), {transactionId: 7, operation: OP.ABORT}, {}), false);
    assert.equal(canSafelyResubmit(status({poisoned: true}), {transactionId: 7, operation: OP.BEGIN}, {metadata}), false);
    assert.equal(canSafelyResubmit(status(), {transactionId: 7, operation: OP.BEGIN}, {metadata}), true);
    const chunk = {transactionId: 7, operation: OP.CHUNK};
    // Before the chunk or just after it, never elsewhere.
    assert.equal(canSafelyResubmit(status({state: S.RECEIVING, nextOffset: 40}), chunk, {offset: 40, length: 20}), true);
    assert.equal(canSafelyResubmit(status({state: S.RECEIVING, nextOffset: 60}), chunk, {offset: 40, length: 20}), true);
    assert.equal(canSafelyResubmit(status({state: S.RECEIVING, nextOffset: 20}), chunk, {offset: 40, length: 20}), false);
    assert.equal(canSafelyResubmit(status({state: S.VALIDATING, nextOffset: 40}), chunk, {offset: 40, length: 20}), false);
    assert.equal(canSafelyResubmit(status({state: S.COMPLETE}), {transactionId: 7, operation: OP.VALIDATE}, {}), true);
    assert.equal(canSafelyResubmit(status({state: S.VALIDATED}), {transactionId: 7, operation: OP.COMMIT}, {}), true);
    assert.equal(canSafelyResubmit(status({state: S.IDLE}), {transactionId: 7, operation: OP.COMMIT}, {}), false, "a finished commit is confirmed, not resent");
});

test("a commit is complete when the keyboard is idle after this transaction's commit, at its digest", () => {
    const done = status({lastOperation: OP.COMMIT});
    assert.equal(commitIsComplete(done, {transactionId: 7, expectedDigest: 0xabc}), true);
    assert.equal(commitIsComplete(done, {transactionId: 7, expectedDigest: 0xabd}), false);
    assert.equal(commitIsComplete(done, {transactionId: 8, expectedDigest: 0xabc}), false);
    assert.equal(commitIsComplete(status({lastOperation: OP.COMMIT, state: S.ACTIVATING}), {transactionId: 7, expectedDigest: 0xabc}), false);
});

test("a cloned status shares no error with the one it came from", () => {
    const original = status({error: {id: E.OUT_OF_ORDER, offset: 4}});
    const copy = cloneStatus(original);
    assert.deepEqual(copy, original);
    assert.notEqual(copy.error, original.error);
});
