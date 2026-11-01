import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {MACRO_LIMITS, MACRO_PROBLEM_CODES, readMacroPayload} from "../../rules/macro-payload.mjs";

const require = createRequire(import.meta.url);
// A reader that knows KC_A, KC_B and KC_LSFT, and calls KC_LSFT a modifier.
const KNOWN = new Set(["KC_A", "KC_B", "KC_LSFT"]);
const reading = (more = {}) => ({identity: (name) => name, sendable: (name) => KNOWN.has(name), ordinary: (name) => name !== "KC_LSFT", ...more});
const read = (source, more) => readMacroPayload(source, reading(more));

test("text, taps, chords, presses, releases and delays read as steps; doubled braces are literal", () => {
    assert.deepEqual(read("a{{b}}{KC_A}{KC_A,KC_B}{+KC_LSFT}{120}{-KC_LSFT}").steps, [
        {kind: "text", text: "a{b}"}, {kind: "tap", keys: ["KC_A"], ids: ["KC_A"]}, {kind: "tap", keys: ["KC_A", "KC_B"], ids: ["KC_A", "KC_B"]},
        {kind: "press", keys: ["KC_LSFT"], ids: ["KC_LSFT"]}, {kind: "delay", delay: 120}, {kind: "release", keys: ["KC_LSFT"], ids: ["KC_LSFT"]}]);
    assert.equal(read("a{KC_A}").error, null);
});

test("each way a macro does not read has its reason, the key it names, and the steps before it", () => {
    const code = (source, more) => read(source, more).error?.code;
    assert.equal(code("}"), "unexpectedClose");
    assert.equal(code(String.fromCharCode(1)), "unprintable");
    assert.equal(code("{KC_A"), "missingClose");
    assert.equal(code(`{${MACRO_LIMITS.maxDelayMs + 1}}`), "delay");
    assert.equal(code("{ }"), "empty");
    assert.equal(code("{+}", {skipEmptyNames: true}), "noKeys");
    assert.equal(code("{+KC_A,KC_B}"), "pressOne");
    assert.equal(code("{KC_A,KC_A}"), "chord");
    assert.deepEqual(read("x{KC_Q}").error, {code: "unknown", key: "KC_Q"});
    assert.deepEqual(read("x{KC_Q}").steps, [{kind: "text", text: "x"}]);
    assert.deepEqual(read("{-KC_A}").error, {code: "notHeld", key: "KC_A"});
    assert.equal(code("{+KC_A}{KC_A}"), "heldAgain");
    assert.equal(code("{+KC_A}"), undefined, "a key may stay held unless the reader needs every key released");
    assert.equal(code("{+KC_A}", {releaseAll: true}), "stillHeld");
    assert.equal(code("{KC_A,}"), "unknown", "an empty name is refused unless skipped");
    assert.equal(code("{KC_A,}", {skipEmptyNames: true}), undefined);
});

test("text that needs Unicode entry may not run under a held ordinary key: core stops there, the editor says it once the rest reads", () => {
    const entry = {textEntry: true, needsEntry: (character) => character === "é"};
    assert.equal(read("{+KC_LSFT}é{-KC_LSFT}", entry).error, null, "a modifier may be held");
    assert.equal(read("{+KC_A}é{-KC_A}", {...entry, stopAtTextHold: true}).error?.code, "textHold");
    const later = read("{+KC_A}é{-KC_A}{KC_Q}", entry);
    assert.equal(later.error?.code, "unknown", "the editor reads on and says the first command that does not read");
    assert.equal(read("{+KC_A}é{-KC_A}", entry).error?.code, "textHold");
});

test("every reason has its words in core and in the step editor's vocabulary", () => {
    const {VOCABULARY} = require("../../core/model/vocabulary");
    assert.deepEqual(Object.keys(VOCABULARY.macroProblems).sort(), [...MACRO_PROBLEM_CODES].sort());
    assert.ok(MACRO_PROBLEM_CODES.every((code) => typeof VOCABULARY.macroProblems[code] === "string" && VOCABULARY.macroProblems[code]));
});
