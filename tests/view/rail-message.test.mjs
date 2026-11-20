import assert from "node:assert/strict";
import test from "node:test";
import {railMessageView, readingTime} from "../../webview/view/rail-message.mjs";

const panel = (over = {}) => ({notice: "", error: "", noticeLasting: false, healthDismissed: "", ...over});
/** @param {string} [error] @returns {any} */
const model = (error = "") => ({device: {health: {error}}});

test("a notice stays long enough to read, and never lingers", () => {
    assert.equal(readingTime("Left the demo."), 5000, "a short one stays the least");
    const long = "Saved on both halves. Recovery copy of what was saved before, on Backups: charybdis-2026-11-20 recovery-apply.json";
    assert.ok(readingTime(long) > 5000 && readingTime(long) < 10000, "a longer one stays longer");
    assert.equal(readingTime("word ".repeat(80)), 10000, "the longest stays no more than ten seconds");
});

test("a notice closes by itself; a failure and a lasting notice do not (D-L106)", () => {
    assert.deepEqual(railMessageView(model(), panel({notice: "Left the demo."}), null), {text: "Left the demo.", source: "notice", failed: false, fades: true});
    assert.deepEqual(railMessageView(model(), panel({notice: "Restarting the keyboard…", noticeLasting: true}), null), {text: "Restarting the keyboard…", source: "notice", failed: false, fades: false});
    assert.deepEqual(railMessageView(model(), panel({error: "Failed: no answer.", notice: "Left the demo."}), null), {text: "Failed: no answer.", source: "error", failed: true, fades: false});
    assert.equal(railMessageView(model(), panel(), null), null);
});

test("the keyboard's own error stays while it is reported, unless it was dismissed", () => {
    const error = "The keyboard did not answer.";
    // Shown over a notice, it is the one ✕ closes.
    assert.deepEqual(railMessageView(model(error), panel({notice: "Left the demo."}), null), {text: error, source: "health", failed: true, fades: false});
    // Dismissed, the notice under it shows, and a different error shows again.
    assert.deepEqual(railMessageView(model(error), panel({notice: "Left the demo.", healthDismissed: error}), null), {text: "Left the demo.", source: "notice", failed: false, fades: true});
    assert.equal(railMessageView(model("Another fault."), panel({healthDismissed: error}), null)?.text, "Another fault.");
});

test("a failure a failed Apply's bar says is the bar's alone", () => {
    const failure = {label: "Send the profile", reason: "The keyboard did not answer.", verdict: "Nothing was saved.", advice: []};
    /** @type {any} */
    const bar = {kind: "failed", apply: {failure}};
    assert.equal(railMessageView(model(), panel({error: "Failed: The keyboard did not answer."}), bar), null);
    assert.equal(railMessageView(model("The keyboard did not answer."), panel(), bar), null);
});
