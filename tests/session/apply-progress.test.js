"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const {APPLY_STEPS, ApplyProgress, failureReason} = require("../../core/session/apply-progress");
const {contractUnion} = require("../fixtures/contract-unions");

// The posted ApplyStep is the contract's union; the steps are these, each once.
test("an Apply has a step for every member of the contract's ApplyStep, and no other", () => {
    const ids = APPLY_STEPS.map(step => step.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.deepEqual([...ids].sort(), contractUnion("model.d.ts", "ApplyStep").sort());
});

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
        "The keyboard rejected the profile in Behaviours, row 5.");
    assert.equal(failureReason({status: {error: {name: "STORAGE_FAILURE"}}}), "The keyboard could not store the profile.");
    assert.equal(failureReason({deviceError: {name: "SOMETHING_NEW"}}), "The keyboard stopped the save for a reason this version of Ark does not know.",
        "a reason Ark has no words for is never said by its name");
    assert.equal(failureReason({message: "made no observable progress"}, {lastStatusName: "BUSY"}), "The slave half kept answering that it was busy.");
    assert.equal(failureReason({message: "made no observable progress"}, {lastStatusName: "OK", transportFailureCount: 3}), "The link between the halves stopped answering.");
    assert.equal(failureReason({code: "RESTORE_VERIFY_FAILED", message: "The keyboard did not confirm the imported profile on both halves."}),
        "The keyboard did not confirm the imported profile on both halves.", "Ark's own sentence is said as it is");
});

// Where the keyboard found the problem is the area Review names, for every
// part of the profile; a part this Ark does not know is not named, never by
// its number.
test("a rejected profile names the area the keyboard found the problem in, never a domain number", () => {
    const {PROFILE_DOMAINS} = require("../../core/schema/profile-domains");
    const {PROFILE_AREAS} = require("../../core/model/vocabulary");
    for (const domain of PROFILE_DOMAINS) {
        assert.equal(failureReason({deviceError: {name: "VALIDATION_REJECTED", domainId: domain.id, rowIndex: 0xffff}}),
            `The keyboard rejected the profile in ${PROFILE_AREAS[domain.area]}.`, domain.name);
    }
    assert.equal(failureReason({deviceError: {name: "VALIDATION_REJECTED", domainId: 0x40, rowIndex: 2}}), "The keyboard rejected the profile in Settings, row 3.");
    assert.equal(failureReason({deviceError: {name: "VALIDATION_REJECTED", domainId: 0x90, rowIndex: 2}}), "The keyboard rejected the profile.");
    assert.equal(failureReason({deviceError: {name: "VALIDATION_REJECTED", domainId: 0xff}}), "The keyboard rejected the profile.");
});

// A fault in Ark during a save is no sentence for a person: its text stays in
// the diagnostics, and the reason says so plainly.
test("a fault in Ark under a save reads as a plain sentence, never its own text", () => {
    const {FAILURE_WORDS} = require("../../core/model/vocabulary");
    assert.equal(failureReason(new TypeError("Cannot read properties of undefined (reading 'id')")), FAILURE_WORDS.unexpected);
    assert.equal(failureReason(Object.assign(new Error("x is not a function"), {code: "TypeError"})), FAILURE_WORDS.unexpected, "as the device service passes it on");
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
    assert.match(failureReason(stalled("COMMIT_OUTCOME_AMBIGUOUS"), {waitingSafeBoundary: true}), /^A key stayed held, or a layer or pointing mode stayed locked/);
    for (const code of ["COMMIT_OUTCOME_AMBIGUOUS", "VALIDATION_OUTCOME_AMBIGUOUS", "MAILBOX_BUSY", "INVALID_COMMIT_STATE", "UPLOAD_FAILED"]) {
        const reason = failureReason(stalled(code), null);
        assert.doesNotMatch(reason, /Candidate|candidate|mutation|ambiguous|wait window|decision|commit/, reason);
        assert.match(reason, /^The keyboard /);
    }
});

// A coordinator's error carries what stopped it in `cause`: Ark's own
// sentence is said, a fault in Ark is Ark's problem, an answer that did not
// read is the keyboard's; only what the coordinator saw the keyboard answer
// itself is the keyboard's unexpected answer.
test("a coordinator's error is said by what it carried, never blaming the keyboard for Ark", () => {
    const {FAILURE_WORDS, SAVE_FAILURE_WORDS} = require("../../core/model/vocabulary");
    const coordinator = (code, cause) => Object.assign(new Error(`Candidate ${code}.`), {name: "CandidateUploadError", code, ...(cause === undefined ? {} : {cause})});
    const changed = Object.assign(new Error("The keyboard changed before the save could start."), {code: "KEYBOARD_NOT_READY"});
    for (const code of ["INVALID_CANDIDATE", "UPLOAD_FAILED", "COMMIT_FAILED"]) {
        assert.equal(failureReason(coordinator(code, changed), null), changed.message, `${code}: Ark's own sentence`);
        assert.equal(failureReason(coordinator(code, new RangeError("Offset is outside the bounds of the DataView")), null), FAILURE_WORDS.unexpected, `${code}: a fault in Ark`);
    }
    assert.equal(failureReason(coordinator("UPLOAD_FAILED", coordinator("INVALID_CANDIDATE", changed)), null), changed.message, "through a coordinator's error it wrapped");
    const transportFault = Object.assign(new Error("The adapter answered a report it was never sent."), {name: "LiveLinkTransportError", code: "INVALID_ADAPTER", fault: "ark"});
    assert.equal(failureReason(coordinator("UPLOAD_FAILED", transportFault), null), FAILURE_WORDS.unexpected, "a fault in Ark beneath the transport");
    const unread = Object.assign(new Error("Candidate acknowledgement is 3 bytes short."), {name: "ProfileCandidateProtocolError", code: "MALFORMED_RESPONSE", fault: "answer"});
    assert.equal(failureReason(coordinator("PROTOCOL_ERROR", unread), null), FAILURE_WORDS.unreadable, "an answer that did not read");
    assert.equal(failureReason(coordinator("KEYBOARD_NOT_READY"), null), SAVE_FAILURE_WORDS.unexpected, "what the keyboard answered the coordinator itself");
    const mismatch = Object.assign(new Error("Report id mismatch."), {name: "LiveLinkTransportError", code: "RESPONSE_MATCH_FAILED"});
    assert.equal(failureReason(coordinator("UPLOAD_FAILED", mismatch), null), SAVE_FAILURE_WORDS.unexpected, "the keyboard's answer the transport could not match");
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
