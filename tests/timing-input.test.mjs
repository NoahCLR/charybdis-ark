import assert from "node:assert/strict";
import test from "node:test";
import {timingInput} from "../webview/view/timing-input.mjs";

test("inherited and matching timings show the default as a placeholder", () => {
    assert.deepEqual(timingInput("0", "150", true), {value: "", placeholder: "150 · default"});
    assert.deepEqual(timingInput("50", "50"), {value: "", placeholder: "50 · default"});
    assert.deepEqual(timingInput("050", 50), {value: "", placeholder: "50 · default"});
    assert.deepEqual(timingInput("0", 0), {value: "", placeholder: "0 · default"});
});

test("custom and unknown timings keep the entered value, including zero", () => {
    assert.deepEqual(timingInput("75", "50"), {value: "75", placeholder: "50 · default"});
    assert.deepEqual(timingInput("0", "50"), {value: "0", placeholder: "50 · default"});
    assert.deepEqual(timingInput("50", undefined), {value: "50", placeholder: "ms"});
    assert.deepEqual(timingInput("", undefined), {value: "", placeholder: "ms"});
});
