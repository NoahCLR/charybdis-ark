"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const {BUSY_REFUSAL, causeText, cleanText, publicError, rejection} = require("../../core/session/operation-failure");

test("a recorded failure keeps its code, its sentence and where an Apply stopped, and nothing else", () => {
    assert.deepEqual(publicError(Object.assign(new Error(" The keyboard did not answer. "), {code: "TIMEOUT", step: "upload", saved: "", deviceId: "hid-1"})),
        {code: "TIMEOUT", message: "The keyboard did not answer.", step: "upload"});
    assert.deepEqual(publicError(new TypeError("x is not a function")), {code: "TypeError", message: "x is not a function"}, "an uncoded error goes by its name");
    assert.deepEqual(publicError(undefined), {code: "LIVE_LINK_ERROR", message: "Unknown live-link error."});
    assert.deepEqual(publicError("boom"), {code: "LIVE_LINK_ERROR", message: "boom"});
    assert.equal(cleanText(7), "");
});

test("what lies under a failure names each cause and the device, for the diagnostics only", () => {
    assert.equal(causeText(new Error("plain")), "");
    const error = Object.assign(new Error("The read failed."), {deviceId: "hid-1",
        cause: Object.assign(new Error("No answer."), {code: "TIMEOUT", deviceId: "hid-2", cause: new RangeError("Offset")})});
    assert.equal(causeText(error), " (device hid-1; TIMEOUT: No answer. [hid-2]; RangeError: Offset)");
    /** @type {{cause?: unknown}} */
    const loop = {}; loop.cause = loop;
    assert.equal(causeText(loop).split("; ").length, 8, "a cause that names itself stops after eight");
});

test("an operation rejects with the error it recorded", () => {
    const thrown = rejection({code: "SERVICE_BUSY", message: BUSY_REFUSAL, step: "verify"});
    assert.ok(thrown instanceof Error);
    assert.deepEqual({code: thrown.code, message: thrown.message, step: thrown.step}, {code: "SERVICE_BUSY", message: BUSY_REFUSAL, step: "verify"});
});
