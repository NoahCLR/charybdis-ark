"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const {ProfileRequestIdSequence, normalizeRequestId} = require("../../core/session/request-ids");

test("request id allocation wraps from 255 to 1 without emitting zero", () => {
    const ids = new ProfileRequestIdSequence(0xfe);
    assert.deepEqual([ids.next(), ids.next(), ids.next(), ids.next()], [0xfe, 0xff, 1, 2]);
    assert.throws(() => new ProfileRequestIdSequence(0), /1 through 255/);
});

test("a request id is an integer from 1 through 255", () => {
    assert.equal(normalizeRequestId(1), 1);
    assert.equal(normalizeRequestId("255"), 255);
    for (const bad of [0, 256, 1.5, -1, "x", undefined]) assert.throws(() => normalizeRequestId(bad), RangeError);
});

test("a sequence starts at 1, and gives every id from 1 to 255 once before it repeats", () => {
    const ids = new ProfileRequestIdSequence();
    const given = Array.from({length: 0xff}, () => ids.next());
    assert.deepEqual(given, Array.from({length: 0xff}, (_, index) => index + 1));
    assert.equal(ids.next(), 1, "then 1 again");
    assert.equal(new ProfileRequestIdSequence("7").next(), 7, "a start is taken as a number");
    for (const bad of [0x100, 1.5, "x"]) assert.throws(() => new ProfileRequestIdSequence(bad), RangeError);
});
