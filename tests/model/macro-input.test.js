"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {inspectMacroInput, inspectMacroPlayback} = require("../../core/model/macro-input");
const {encodeMacroPayload, macroProgramBytes} = require("../../core/schema/macro-payload");
const context = {unicode: true, enabled: true, mode: 1, bankFree: 10327};

test("playback routes use the fixture's native strokes, Unicode entry and macOS ISO swap", () => {
    const dutch = {layout: 2, effective: 1, unicodeMode: 0};
    const native = inspectMacroPlayback('café{KC_A}{{KC_A}}', dutch);
    assert.equal(native.error, "");
    assert.deepEqual(native.typing.find(route => route.character === "é"), {character: "é", method: "layout", strokes: ["ALGR(KC_E)", "KC_E"]});
    assert.ok(native.typing.some(route => route.character === "{"), "escaped literal braces are text");
    assert.deepEqual(inspectMacroPlayback("{KC_A}{120}", dutch).typing, [], "key and delay spelling is not text");
    const hex = inspectMacroPlayback("é🙂", {...dutch, layout: 3, unicodeMode: 1});
    assert.deepEqual(hex.typing, ["é", "🙂"].map(character => ({character, method: "unicode", mode: 1})));
    assert.equal(inspectMacroPlayback("é🙂", dutch).code, "UNICODE_SETUP_REQUIRED");
    const ansi = inspectMacroPlayback("~", dutch), iso = inspectMacroPlayback("~", {...dutch, macosIso: true});
    assert.deepEqual(ansi.typing[0].strokes, ["S(KC_GRV)"]);
    assert.deepEqual(iso.typing[0].strokes, ["S(KC_NUBS)"]);
});

test("changing from native entry to Unicode rechecks held ordinary keys", () => {
    const payload = "{+KC_A}é{-KC_A}", host = {layout: 2, effective: 1, unicodeMode: 0};
    assert.equal(inspectMacroPlayback(payload, host).error, "");
    const invalid = inspectMacroPlayback(payload, {...host, layout: 3, unicodeMode: 1});
    assert.equal(invalid.code, "INVALID_MACRO");
    assert.match(invalid.error, /Release ordinary keys/);
    assert.deepEqual(invalid.typing, [{character: "é", method: "unicode", mode: 1}]);
    assert.equal(inspectMacroPlayback("{+KC_LSFT}é{-KC_LSFT}", {...host, layout: 3, unicodeMode: 1}).error, "");
});

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
