"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {asBytes, copyBytes, u8, u16, zeroRange, protocolError, canonical} = require("../../core/schema/bytes");

test("wire integers retain numeric coercion, ceilings and nonzero requirements", () => {
    for (const [integer, ceiling, width] of [[u8, 255, 8], [u16, 65535, 16]]) {
        assert.equal(integer("0", "value"), 0);
        assert.equal(integer(String(ceiling), "value"), ceiling);
        assert.equal(integer(true, "value"), 1);
        for (const value of [-1, ceiling + 1, 0.5, NaN, Infinity, "bad"]) {
            assert.throws(() => integer(value, "value"), {name: "RangeError", message: `value must be an ${width}-bit integer.`});
        }
        assert.equal(integer(1, "value", {nonzero: true}), 1);
        assert.throws(() => integer(0, "value", {nonzero: true}), {name: "RangeError", message: `value must be a nonzero ${width}-bit integer.`});
    }
});

test("byte views respect slice offsets and copies isolate their backing storage", () => {
    const input = new Uint8Array([9, 1, 2, 8]).subarray(1, 3);
    const view = asBytes(input, "payload"), copy = copyBytes(input, "payload");
    assert.deepEqual([...copy], [1, 2]);
    input[0] = 3;
    assert.deepEqual([...view], [3, 2]);
    assert.deepEqual([...copy], [1, 2]);
    for (const input of [null, [1, 2], "12", new Uint16Array([1])]) {
        assert.throws(() => copyBytes(input, "payload"), {name: "TypeError", message: "payload must be a Buffer or Uint8Array."});
    }
});

test("reserved ranges report the first offending offset with the caller's error identity", () => {
    const DomainError = protocolError("ExampleDomainError");
    assert.equal(DomainError.name, "ExampleDomainError");
    const error = offset => new DomainError("NONCANONICAL", "Reserved byte is nonzero.", {offset, frameOffset: offset});
    zeroRange(Buffer.from([7, 0, 0, 8]), 1, 3, error);
    assert.throws(() => zeroRange(Buffer.from([7, 0, 4, 5]), 1, 4, error), failure => {
        assert.ok(failure instanceof DomainError);
        assert.equal(failure.name, "ExampleDomainError");
        assert.equal(failure.code, "NONCANONICAL");
        assert.equal(failure.offset, 2);
        assert.equal(failure.frameOffset, 2);
        return true;
    });
});

test("the canonical check returns the value only when it encodes back to the bytes it was read from", () => {
    const DomainError = protocolError("ExampleDomainError");
    const refuse = () => new DomainError("NONCANONICAL", "Not canonical.");
    const value = {n: 7};
    assert.equal(canonical(new Uint8Array([7]), value, v => Buffer.from([v.n]), refuse), value);
    assert.throws(() => canonical(Buffer.from([7, 0]), value, v => Buffer.from([v.n]), refuse), {name: "ExampleDomainError", code: "NONCANONICAL"});
    assert.throws(() => canonical(Buffer.from([8]), value, v => new Uint8Array([v.n]), refuse), {code: "NONCANONICAL"});
    // An encoder that refuses the value refuses the bytes in its own words.
    const invalid = Object.assign(new Error("Invalid."), {code: "INVALID"});
    assert.throws(() => canonical(Buffer.from([7]), value, () => {throw invalid;}, refuse), error => error === invalid);
});
