"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {encodeMacroPayload, decodeMacroPayload, macroKeycodes} = require("../../core/schema/macro-payload");

test("protection has one canonical prefix before the steps", () => {
    const {macroProtectionOf} = require("../../core/schema/macro-payload");
    for (const protection of ["auto", "on", "off"]) {
        const payload = "é{KC_A}", bytes = encodeMacroPayload(payload, {protection});
        assert.equal(decodeMacroPayload(bytes), payload);
        assert.equal(macroProtectionOf(bytes), protection);
        assert.equal(bytes.length, encodeMacroPayload(payload).length + (protection === "auto" ? 0 : 3));
    }
    for (const bytes of [[1,5], [1,5,0], [1,5,3], [97,1,5,1], [1,5,1,1,5,2]]) {
        assert.throws(() => decodeMacroPayload(Buffer.from(bytes)), /prefix|protection/);
    }
});

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
    for (const payload of ["{+KC_A}", "{-KC_A}", "{+KC_A}{KC_A}{-KC_A}", "{KC_A,KC_A}", "{G(KC_N)}", "{MO(1)}", "{65536}", "{KC_A,}", "{", "}", "\u0000"]) {
        assert.throws(() => encodeMacroPayload(payload), undefined, payload);
    }
    assert.throws(() => decodeMacroPayload(Buffer.from([1, 4, 50])), /Truncated/);
    assert.ok(macroKeycodes().includes("KC_LGUI"));
    assert.ok(!macroKeycodes().includes("QK_BOOTLOADER"));
});

test("Unicode macros preserve scalars and count their UTF-8 bank bytes", () => {
    for (const text of ["café", "“hello” € 🙂", "e\u0301", "👩‍💻", " {{json}} 🙂 "]) {
        const bytes = encodeMacroPayload(text);
        assert.equal(bytes.toString("utf8"), text.replaceAll("{{", "{").replaceAll("}}", "}"));
        assert.equal(decodeMacroPayload(bytes), text);
    }
    assert.equal(encodeMacroPayload("🙂".repeat(128)).length, 512);
    for (const text of ["\uD800", "\uDC00", "\u0000", "\u0001", "\u0080", "\u009F"]) assert.throws(() => encodeMacroPayload(text), /valid Unicode/);
    for (const bytes of [[0xC0,0xAF], [0xE0,0x80,0xAF], [0xED,0xA0,0x80], [0xF4,0x90,0x80,0x80], [0xF0,0x9F,0x99], [0x80], [0xFF]]) assert.throws(() => decodeMacroPayload(Buffer.from(bytes)), /UTF-8/);
});
