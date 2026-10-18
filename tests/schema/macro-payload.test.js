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

test("chords use the firmware's form: presses, a tap of the last key, releases in reverse", () => {
    assert.deepEqual([...encodeMacroPayload("{KC_LGUI,KC_N}")], [1, 2, 227, 1, 1, 17, 1, 3, 227]);
    assert.deepEqual([...encodeMacroPayload("{KC_LCTL,KC_LALT,KC_LGUI,KC_X}")], [1, 2, 224, 1, 2, 226, 1, 2, 227, 1, 1, 27, 1, 3, 227, 1, 3, 226, 1, 3, 224]);
});

test("a firmware-authored chord and Ark's older all-down-all-up chord both read as one chord step", () => {
    const firmware = Buffer.from([1, 2, 224, 1, 2, 226, 1, 2, 227, 1, 1, 27, 1, 3, 227, 1, 3, 226, 1, 3, 224]);
    assert.equal(decodeMacroPayload(firmware), "{KC_LEFT_CTRL,KC_LEFT_ALT,KC_LEFT_GUI,KC_X}");
    const older = Buffer.from([1, 2, 227, 1, 2, 17, 1, 3, 17, 1, 3, 227]);
    assert.equal(decodeMacroPayload(older), "{KC_LEFT_GUI,KC_N}");
    // Releases that do not mirror the presses are not a chord.
    assert.equal(decodeMacroPayload(Buffer.from([1, 2, 227, 1, 1, 17, 1, 1, 4, 1, 3, 227])), "{+KC_LEFT_GUI}{KC_N}{KC_A}{-KC_LEFT_GUI}");
    assert.equal(decodeMacroPayload(Buffer.from([1, 2, 225, 1, 2, 4, 1, 3, 225, 1, 3, 4])), "{+KC_LEFT_SHIFT}{+KC_A}{-KC_LEFT_SHIFT}{-KC_A}");
});

test("steps round-trip: decode(encode(steps)) gives the same steps", () => {
    const {parsePayload} = require("../../core/schema/macro-payload");
    for (const payload of [
        "{KC_LEFT_GUI,KC_N}",
        "{KC_LEFT_CTRL,KC_LEFT_ALT,KC_LEFT_GUI,KC_X}",
        "hi {KC_LEFT_GUI,KC_LEFT_SHIFT,KC_4}{250}{KC_A}",
        "{+KC_LEFT_SHIFT}{KC_A}{KC_B}{-KC_LEFT_SHIFT}",
        "{+KC_X}{KC_LEFT_GUI,KC_N}{KC_A}{-KC_X}",
        "{+KC_LEFT_SHIFT}{100}{-KC_LEFT_SHIFT}{KC_LEFT_GUI,KC_SPACE}{KC_ENTER}",
    ]) {
        const steps = parsePayload(payload);
        assert.deepEqual(parsePayload(decodeMacroPayload(encodeMacroPayload(payload))), steps, payload);
        assert.equal(decodeMacroPayload(encodeMacroPayload(payload)), payload);
    }
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
