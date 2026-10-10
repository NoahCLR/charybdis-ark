"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {inspectMacroInput} = require("../../core/model/macro-input");
const {encodeMacroPayload, macroProgramBytes} = require("../../core/schema/macro-payload");
const context = {unicode: true, enabled: true, mode: 1, bankFree: 10327};

test("inspection counts the bytes the production codec stores and plays", () => {
    for (const payload of ["", "a".repeat(255), "a".repeat(256), "a".repeat(508),
        '{{"café": “hello”}} 🙂 e\u0301 👩‍💻\n\t', "{KC_LGUI,KC_A}{120}{+KC_LALT}{-KC_LALT}"]) {
        const bytes = encodeMacroPayload(payload, {unicode: true, textEntry: true});
        const result = inspectMacroInput(payload, context);
        assert.equal(result.bytes, bytes.length);
        assert.equal(result.program, macroProgramBytes(bytes));
        assert.equal(result.error, "");
    }
});

test("playback and shared memory limits are distinct and count the replaced slot's bytes", () => {
    assert.equal(inspectMacroInput("a".repeat(508), context).program, 512);
    const long = inspectMacroInput("a".repeat(509), context);
    assert.equal(long.program, 513);
    assert.equal(long.code, "MACRO_TOO_LONG");
    assert.match(long.error, /Shorten/);
    assert.equal(inspectMacroInput("é".repeat(128), context).program, 512);
    assert.equal(inspectMacroInput("é".repeat(129), context).code, "MACRO_TOO_LONG");
    assert.equal(inspectMacroInput("123456", {...context, bankFree: 2, currentBytes: 4}).error, "");
    const full = inspectMacroInput("1234567", {...context, bankFree: 2, currentBytes: 4});
    assert.equal(full.code, "MACRO_BANK_FULL");
    assert.equal(full.availableBytes, 6);
});

test("inspection refuses setup and syntax errors without throwing or mutating context", () => {
    assert.equal(inspectMacroInput("café", {...context, mode: 0}).code, "UNICODE_SETUP_REQUIRED");
    assert.match(inspectMacroInput("café", {...context, unicode: false}).error, /ASCII/);
    assert.equal(inspectMacroInput("hello", {...context, enabled: false, mode: 0}).error, "");
    // ASCII is typed with ordinary keys, so a held key may span it.
    assert.equal(inspectMacroInput("{+KC_A}text{-KC_A}", context).error, "");
    for (const payload of [null, "{KC_NO_SUCH_KEY}", "{65536}", "{KC_A", "{+KC_A}", "{-KC_A}", "{KC_A,KC_A}", "{+KC_A}café{-KC_A}", "\ud800"]) {
        assert.ok(inspectMacroInput(payload, context).error, String(payload));
    }
    assert.deepEqual(context, {unicode: true, enabled: true, mode: 1, bankFree: 10327});
});
