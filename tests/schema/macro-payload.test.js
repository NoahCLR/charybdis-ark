"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {encodeMacroPayload, decodeMacroPayload, macroKeycodes, macroProgramBytes, MACRO_PROGRAM_MAX} = require("../../core/schema/macro-payload");

test("VIA macros round-trip text, literal braces, Cmd+N, holds and delays", () => {
    const payload = 'hello {{"key": 1}}\n{KC_LGUI,KC_N}{250}{+KC_LSFT}{KC_A}{-KC_LSFT}{0}';
    const bytes = encodeMacroPayload(payload);
    assert.deepEqual(encodeMacroPayload(decodeMacroPayload(bytes)), bytes);
    assert.equal(encodeMacroPayload("").length, 0);
    assert.ok(decodeMacroPayload(bytes).includes('{{"key": 1}}'));
});

test("VIA chords hold keys together and release in reverse order", () => {
    assert.deepEqual([...encodeMacroPayload("{KC_LGUI,KC_N}")], [1, 2, 227, 1, 2, 17, 1, 3, 17, 1, 3, 227]);
});

test("macro validation refuses stuck keys, ambiguous commands and oversized content", () => {
    for (const payload of ["{+KC_A}", "{-KC_A}", "{+KC_A}{KC_A}{-KC_A}", "{KC_A,KC_A}", "{G(KC_N)}", "{MO(1)}", "{65536}", "{KC_A,}", "{", "}", "é", "\u0000"]) {
        assert.throws(() => encodeMacroPayload(payload), undefined, payload);
    }
    assert.throws(() => decodeMacroPayload(Buffer.from([1, 4, 50])), /Truncated/);
    assert.ok(macroKeycodes().includes("KC_LGUI"));
    assert.ok(!macroKeycodes().includes("QK_BOOTLOADER"));
});

test("a macro's program size is what the keyboard compiles it to", () => {
    const size = payload => macroProgramBytes(encodeMacroPayload(payload));
    assert.equal(MACRO_PROGRAM_MAX, 512);
    assert.equal(size(""), 0);
    assert.equal(size("{KC_A}"), 3, "a tap is one three-byte tap list");
    assert.equal(size("{KC_A}{KC_B}"), 6);
    assert.equal(size("hi"), 4, "a text run is two bytes plus one per character");
    assert.equal(size("a".repeat(255)), 257);
    assert.equal(size("a".repeat(256)), 260, "a second run starts after 255 characters");
    assert.equal(size("{120}"), 3);
    assert.equal(size("{KC_LGUI,KC_N}"), 8, "a chord is stored as held keys, pressed and released");
    assert.equal(size("{+KC_LSFT}{KC_A}{-KC_LSFT}"), 4, "a tap under a held key is one tap list");
    assert.equal(size("{+KC_LSFT}{KC_A}{KC_B}{-KC_LSFT}"), 10, "each tap once, then the release");
    assert.equal(size("a{KC_A}b"), 9, "a command ends a text run");
    assert.equal(size("{KC_A}".repeat(170)), 510, "about 170 taps fit");
    assert.ok(size("{KC_A}".repeat(171)) > MACRO_PROGRAM_MAX);
});

test("Unicode macros preserve scalars and count UTF-8 bank bytes and compiled scalars", () => {
    for (const text of ["café", "“hello” € 🙂", "e\u0301", "👩‍💻", " {{json}} 🙂 "]) {
        const bytes = encodeMacroPayload(text, {unicode: true});
        assert.equal(bytes.toString("utf8"), text.replaceAll("{{", "{").replaceAll("}}", "}"));
        assert.equal(decodeMacroPayload(bytes, {unicode: true}), text);
        assert.throws(() => encodeMacroPayload(text), /ASCII/);
    }
    assert.equal(macroProgramBytes(encodeMacroPayload("é".repeat(128), {unicode: true})), 512);
    assert.equal(macroProgramBytes(encodeMacroPayload("🙂".repeat(128), {unicode: true})), 512);
    assert.equal(macroProgramBytes(encodeMacroPayload("a".repeat(254) + "🙂", {unicode: true})), 260);
    assert.equal(macroProgramBytes(encodeMacroPayload("a".repeat(255) + "🙂b", {unicode: true})), 264);
    for (const text of ["\uD800", "\uDC00", "\u0000", "\u0001", "\u0080", "\u009F"]) assert.throws(() => encodeMacroPayload(text, {unicode: true}), /valid Unicode/);
    for (const bytes of [[0xC0,0xAF], [0xE0,0x80,0xAF], [0xED,0xA0,0x80], [0xF4,0x90,0x80,0x80], [0xF0,0x9F,0x99], [0x80], [0xFF]]) assert.throws(() => decodeMacroPayload(Buffer.from(bytes), {unicode: true}), /UTF-8/);
});
