"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const {NAME_MAX_BYTES, validName, nameBytes, nameOfBytes, encodeName} = require("../../core/schema/profile-name");

// The one name rule (firmware D-F14): at most 32 bytes of well-formed UTF-8,
// no C0 control and no DEL, counted in bytes rather than characters.

test("a name is at most 32 bytes, counted in bytes, multibyte included", () => {
    assert.equal(NAME_MAX_BYTES, 32);
    for (const name of ["", "Base", "x".repeat(32), "é".repeat(16), "ab" + "€".repeat(10), "😀".repeat(8), "Édition ⌘", " ~!"]) {
        assert.ok(validName(name), JSON.stringify(name));
        assert.equal(nameBytes(name), Buffer.byteLength(name, "utf8"));
    }
    assert.equal(nameBytes("é".repeat(16)), 32);
    assert.equal(nameBytes(undefined), 0);
    assert.equal(nameBytes(null), 0);
    for (const name of ["x".repeat(33), "é".repeat(16) + "x", "😀".repeat(8) + "a", "€".repeat(11)]) assert.equal(validName(name), false, `${nameBytes(name)} bytes`);
});

test("control characters, DEL, lone surrogates and non-strings are not names", () => {
    for (const name of ["tab\t", "line\n", "nul\0", "\x1f", "del\x7f", "\ud800", "a\udc00b", undefined, null, 7, ["a"]]) assert.equal(validName(name), false, JSON.stringify(name));
    // C1 controls and other printable Unicode are allowed; only C0 and DEL are refused.
    assert.ok(validName("\u0080 "));
});

test("a name encodes as a length byte and its UTF-8", () => {
    assert.deepEqual([...encodeName("")], [0]);
    assert.deepEqual([...encodeName("Aé")], [3, 0x41, 0xc3, 0xa9]);
    const full = encodeName("é".repeat(16));
    assert.equal(full.length, 33);
    assert.equal(full[0], 32);
    for (const name of ["x".repeat(33), "tab\t", "\ud800", 1]) {
        assert.throws(() => encodeName(name), error => error.code === "INVALID_NAME" && /32 bytes/.test(error.message), JSON.stringify(name));
    }
});

test("stored bytes read back only as a well-formed, uncut, control-free name", () => {
    assert.equal(nameOfBytes(Buffer.alloc(0)), "");
    assert.equal(nameOfBytes(Buffer.from("Édition ⌘")), "Édition ⌘");
    assert.equal(nameOfBytes(Buffer.from("é".repeat(16))), "é".repeat(16));
    assert.equal(nameOfBytes(encodeName("Layer 3").subarray(1)), "Layer 3");
    for (const [label, bytes] of [
        ["33 bytes", Buffer.alloc(33, 0x61)],
        ["cut two-byte sequence", Buffer.from([0x61, 0xc3])],
        ["cut three-byte sequence", Buffer.from("€").subarray(0, 2)],
        ["stray continuation", Buffer.from([0x80])],
        ["overlong slash", Buffer.from([0xc0, 0xaf])],
        ["overlong NUL", Buffer.from([0xc0, 0x80])],
        ["UTF-8 surrogate", Buffer.from([0xed, 0xa0, 0x80])],
        ["past U+10FFFF", Buffer.from([0xf4, 0x90, 0x80, 0x80])],
        ["invalid lead byte", Buffer.from([0xff])],
        ["C0 control", Buffer.from("a\tb")],
        ["NUL", Buffer.from([0x61, 0])],
        ["DEL", Buffer.from([0x7f])],
    ]) assert.equal(nameOfBytes(bytes), undefined, label);
    assert.equal(nameOfBytes("abc"), undefined, "a string is not stored bytes");
    assert.equal(nameOfBytes([0x61]), undefined);
});

test("every valid name survives its record and every record names it back", () => {
    for (const name of ["", "x", "Ω≈ç√", "😀 key", "é".repeat(16), "x".repeat(32)]) {
        const record = encodeName(name);
        assert.equal(record[0], record.length - 1);
        assert.equal(nameOfBytes(record.subarray(1)), name);
    }
});
