"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const {APPLY_STEPS, ApplyProgress, failureReason} = require("../../core/session/apply-progress");

test("an Apply moves forward through its steps and never back", () => {
    const views = [];
    const progress = new ApplyProgress(view => views.push(view));
    progress.report("check");
    progress.report("upload", {completed: 20, total: 120});
    progress.report("upload", {completed: 60, total: 120});
    progress.report("validate");
    progress.report("upload", {completed: 120, total: 120}); // a late poll of an earlier phase
    const view = views.at(-1);
    assert.equal(view.current, "validate", "an earlier step reported late does not move it back");
    assert.equal(view.state, "applying");
    assert.deepEqual(view.steps.map(step => step.state).slice(0, 5), ["done", "done", "done", "active", "pending"]);
    assert.equal(view.bytes, null, "a new step starts without the previous step's byte count");
    progress.report("slave", {detail: "Sending", completed: 30, total: 900});
    assert.deepEqual(views.at(-1).bytes, {completed: 30, total: 900});
    assert.equal(views.at(-1).detail, "Sending");
    assert.throws(() => progress.report("nonsense"), /Unknown Apply step/);
});

test("a failure is pinned to the running step, and nothing moves after it", () => {
    const progress = new ApplyProgress();
    progress.report("slave");
    assert.equal(progress.beforeDecision, true, "the copy to the slave half comes before the commit decision");
    const failure = progress.fail({reason: "The slave half kept answering that it was busy.", saved: "none"});
    assert.deepEqual(failure, {step: "slave", label: "Copy the profile to the slave half", reason: "The slave half kept answering that it was busy.", saved: "none",
        verdict: "Nothing was saved: the keyboard kept the profile it had."});
    progress.report("commit");
    const view = progress.view();
    assert.equal(view.state, "failed");
    assert.equal(view.steps.find(step => step.id === "slave").state, "failed");
    assert.equal(view.steps.find(step => step.id === "validate").state, "done");
    assert.equal(view.steps.find(step => step.id === "commit").state, "pending");
    progress.report("commit");
    assert.equal(progress.beforeDecision, true);
});

test("a finished Apply shows every step done", () => {
    const progress = new ApplyProgress();
    progress.report("check");
    progress.finish();
    assert.equal(progress.view().state, "done");
    assert.ok(progress.view().steps.every(step => step.state === "done"));
    assert.equal(APPLY_STEPS.length, 8);
    assert.notEqual(new ApplyProgress().view().id, progress.view().id, "each Apply is told apart from the next");
});

test("the reason is the keyboard's own when it gave one, else the slave half's last answer", () => {
    assert.equal(failureReason({deviceError: {name: "VALIDATION_REJECTED", domainId: 0x20, rowIndex: 4}}),
        "The keyboard rejected the profile in key behaviours, row 5.");
    assert.equal(failureReason({status: {error: {name: "STORAGE_FAILURE"}}}), "The keyboard could not write its storage.");
    assert.equal(failureReason({deviceError: {name: "SOMETHING_NEW"}}), "The keyboard reported SOMETHING_NEW.");
    assert.equal(failureReason({message: "made no observable progress"}, {lastStatusName: "BUSY"}), "The slave half kept answering that it was busy.");
    assert.equal(failureReason({message: "made no observable progress"}, {lastStatusName: "OK", transportFailureCount: 3}), "The link between the halves stopped answering.");
    assert.equal(failureReason({code: "RESTORE_VERIFY_FAILED", message: "The keyboard did not confirm the imported profile on both halves."}),
        "The keyboard did not confirm the imported profile on both halves.", "Ark's own sentence is said as it is");
});

test("each verdict is the bar's sentence, and an unknown one says Ark can't tell", () => {
    for (const [saved, verdict] of [["none", /^Nothing was saved: /], ["decided", /^The keyboard had already decided to save/], ["unknown", /^Ark can't tell which profile was saved\./], ["", /^Ark can't tell/]]) {
        const progress = new ApplyProgress();
        progress.report("commit");
        assert.match(progress.fail({reason: "", saved}).verdict, verdict);
        assert.match(progress.view().failure.verdict, verdict, "the view carries the verdict the bar draws");
    }
});

// The keyboard restarting mid-copy makes the slave half look busy or slow;
// the lost connection is what happened (keyboard session, 2026-10-24).
test("a lost connection is the reason, ahead of anything the slave half last said", () => {
    const lost = {code: "TRANSPORT_OUTCOME_AMBIGUOUS", message: "Candidate status could not be read after a mutation; its outcome is ambiguous.",
        cause: {code: "DISCONNECTED", message: "Device DevSrvsID:4295254514 disconnected."}};
    for (const slave of [{lastStatusName: "BUSY"}, {lastStatusName: "OK", busyStreak: 12, busyReason: "STORE_WORKING"}, {waitingSafeBoundary: true}, null]) {
        assert.equal(failureReason(lost, slave), "The keyboard was disconnected or restarted.");
    }
    assert.equal(failureReason({code: "WRITE_FAILED", message: "Could not write a report to device DevSrvsID:1."}), "The keyboard was disconnected or restarted.");
    assert.equal(failureReason({code: "TIMEOUT", message: "Device DevSrvsID:1 did not respond within 1000 ms."}), "The keyboard stopped answering.");
});

test("the coordinators' own words never reach a person", () => {
    const stalled = code => ({name: "CandidateUploadError", code, message: `Candidate ${code} made no observable progress within its firmware-aware wait window.`});
    // Ark's wait for the commit ran out while the keyboard waited for keys.
    assert.match(failureReason(stalled("COMMIT_OUTCOME_AMBIGUOUS"), {waitingSafeBoundary: true}), /^A key stayed held, or a layer or pointer mode stayed locked/);
    for (const code of ["COMMIT_OUTCOME_AMBIGUOUS", "VALIDATION_OUTCOME_AMBIGUOUS", "MAILBOX_BUSY", "INVALID_COMMIT_STATE", "UPLOAD_FAILED"]) {
        const reason = failureReason(stalled(code), null);
        assert.doesNotMatch(reason, /Candidate|candidate|mutation|ambiguous|wait window|decision|commit/, reason);
        assert.match(reason, /^The keyboard /);
    }
});

test("a copy that stopped on the slave half names its answer", () => {
    assert.equal(failureReason({deviceError: {name: "PEER_TRANSFER_FAILED"}}, {lastStatusName: "STORAGE_ERROR"}), "The slave half could not store the profile, even after trying again.");
    assert.equal(failureReason({deviceError: {name: "PEER_TRANSFER_FAILED"}}, null), "The slave half could not take the profile.");
});

test("a copy the slave half keeps refusing says what it is waiting on", () => {
    const stalled = {message: "made no observable progress"};
    assert.equal(failureReason(stalled, {lastStatusName: "OK", busyStreak: 40, busyReason: "OTHER_COPY"}), "The slave half was still holding an earlier, unfinished copy.");
    assert.equal(failureReason(stalled, {lastStatusName: "OK", busyStreak: 40, busyReason: "MAILBOX_FULL"}), "The slave half stopped handling requests from the master half.");
    assert.equal(failureReason(stalled, {lastStatusName: "BUSY", busyStreak: 1, busyReason: "OTHER_COPY"}), "The slave half kept answering that it was busy.", "one BUSY is routine");
    const {slaveReport} = require("../../core/session/portable-profile-session");
    assert.equal(slaveReport({phaseName: "BEGINNING", transferOffset: 0, transferLength: 2520, busyStreak: 12, busyReason: "OTHER_COPY"}).detail, "Starting the copy · the slave half still holds an earlier copy");
    assert.equal(slaveReport({phaseName: "SENDING", transferOffset: 28, transferLength: 2520, busyStreak: 1, busyReason: "ADMITTED"}).detail, "Sending");
    assert.match(slaveReport({phaseName: "PREPARED", waitingSafeBoundary: true}).detail, /Release held keys/);
    assert.match(failureReason({deviceError: {name: "TIMEOUT"}}, {waitingSafeBoundary: true}), /stayed locked.*Nothing changed/);
    assert.equal(failureReason({deviceError: {name: "TIMEOUT"}}, {waitingSafeBoundary: false}), "The keyboard gave up waiting for this save.");
});
