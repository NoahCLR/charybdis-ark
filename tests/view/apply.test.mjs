// The Apply moment's words and steps (view/apply.mjs).
import assert from "node:assert/strict";
import test from "node:test";
import {APPLY_NOTE, USER_STEPS, applyTarget, changesKept, staleWords, userSteps, verdict, waitHeadline, waitLeft} from "../../webview/view/apply.mjs";

const TEN = ["check", "backup", "upload", "validate", "stage", "peer", "commit", "converge", "local", "verify"];
const view = (at, failed = false) => ({steps: TEN.map((id, index) => ({id, label: id, state: index < at ? "done" : index === at ? (failed ? "failed" : "active") : "pending"}))});

test("the keyboard's ten steps fold into three a person follows, every one of them placed once", () => {
    assert.deepEqual(USER_STEPS.flatMap((step) => step.steps), TEN);
    assert.deepEqual(userSteps(view(0)).map((step) => step.state), ["active", "pending", "pending"]);
    assert.deepEqual(userSteps(view(5)).map((step) => step.state), ["done", "active", "pending"]);
    assert.deepEqual(userSteps(view(7, true)).map((step) => step.state), ["done", "done", "failed"]);
});

test("the wait counts down from a minute and never below zero", () => {
    assert.equal(waitHeadline(waitLeft(1000, 4000)), "Let go of every key to finish · 57 s");
    assert.equal(waitLeft(0, 120000), 0);
});

test("three verdicts, none promising a rollback; an unknown verdict reads as unknown", () => {
    assert.match(verdict("none").title, /Nothing was saved/);
    assert.match(verdict("decided").words, /15 seconds/);
    assert.equal(verdict("whatever"), verdict("unknown"));
    for (const words of [verdict("none"), verdict("decided"), verdict("unknown")].flatMap((entry) => [entry.title, entry.words]).concat(APPLY_NOTE)) {
        assert.doesNotMatch(words, /restores? it|part of it/i);
    }
});

test("the stale bar says what changed, with its grammar right", () => {
    assert.equal(changesKept(1), "your 1 change is kept");
    assert.equal(changesKept(3), "your 3 changes are kept");
    const words = staleWords({keyboardChanged: ["A 1 → 2", "B", "C", "D"], changes: [1]});
    assert.equal(words.title, "Changed on the keyboard: A 1 → 2; B; and 2 more");
    assert.match(staleWords({connectionChanged: true, changes: []}).title, /reconnected/);
});

test("the review footer names the keyboard and its halves", () => {
    assert.equal(applyTarget({keyboardName: {name: "Home"}, device: {label: "x", health: {halves: "agree"}}}), "To Home · both halves connected");
    assert.equal(applyTarget({device: {label: "Charybdis", health: {halves: "alone"}}}), "To Charybdis · left half not answering");
});
