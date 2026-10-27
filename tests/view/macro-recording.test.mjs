import assert from "node:assert/strict";
import test from "node:test";
import {createRequire} from "node:module";
import {recordedKeycode, recordedTakePayload, takeStands} from "../../webview/view/macro-recording.mjs";
import {parseMacro, unreleased} from "../../webview/view/macro.mjs";
const {parsePayload, macroKeycodes} = createRequire(import.meta.url)("../../core/schema/macro-payload.js");

test("the recorder maps every key a macro can send, and nothing a macro cannot", () => {
    const accepted = new Set(macroKeycodes());
    const codes = ["KeyA", "Digit0", "F1", "F24", "Delete", "Home", "End", "PageUp", "PageDown", "Insert", "CapsLock",
        "Numpad0", "Numpad9", "NumpadAdd", "NumpadEnter", "NumpadDecimal", "IntlBackslash", "PrintScreen", "ContextMenu",
        "ShiftLeft", "MetaRight", "ArrowLeft", "Backquote", "AudioVolumeUp"];
    for (const code of codes) assert.ok(accepted.has(recordedKeycode(code)), `${code} → ${recordedKeycode(code)}`);
    for (const code of ["Fn", "F25", "MediaPlayPause", "BrowserBack", ""]) assert.equal(recordedKeycode(code), "", code);
});

const down = (keycode, time) => ({keycode, time, type: "keydown"});
const up = (keycode, time) => ({keycode, time, type: "keyup"});
const record = (events, options = {}) => recordedTakePayload("", events, {delays: false, ...options});

for (const [name, events, expected] of [
    ["ordinary tap", [down("KC_A", 0), up("KC_A", 50)], "{KC_A}"],
    ["Command+A", [down("KC_LGUI", 0), down("KC_A", 10), up("KC_A", 40), up("KC_LGUI", 50)], "{KC_LGUI,KC_A}"],
    ["modifier released first", [down("KC_LGUI", 0), down("KC_A", 10), up("KC_LGUI", 40), up("KC_A", 50)], "{KC_LGUI,KC_A}"],
    ["three ordinary keys", [down("KC_A", 0), down("KC_B", 10), down("KC_C", 20), up("KC_B", 30), up("KC_C", 40), up("KC_A", 50)], "{KC_A,KC_B,KC_C}"],
    ["modifier-only chord", [down("KC_LCTL", 0), down("KC_RSFT", 10), up("KC_LCTL", 30), up("KC_RSFT", 40)], "{KC_LCTL,KC_RSFT}"],
    ["two sequential taps", [down("KC_A", 0), up("KC_A", 30), down("KC_B", 40), up("KC_B", 50)], "{KC_A}{KC_B}"],
    ["Command held across shortcuts", [down("KC_LGUI", 0), down("KC_A", 10), up("KC_A", 30), down("KC_C", 50), up("KC_C", 60), up("KC_LGUI", 70)], "{KC_LGUI,KC_A}{KC_LGUI,KC_C}"],
    ["nested modifiers across shortcuts", [down("KC_RCTL", 0), down("KC_A", 10), up("KC_A", 20), down("KC_RSFT", 30), down("KC_C", 40), up("KC_C", 50), up("KC_RSFT", 60), up("KC_RCTL", 70)], "{KC_RCTL,KC_A}{KC_RCTL,KC_RSFT,KC_C}"],
    ["rolling overlap", [down("KC_A", 0), down("KC_B", 10), up("KC_A", 20), down("KC_C", 30), up("KC_B", 40), up("KC_C", 50)], "{+KC_A}{+KC_B}{-KC_A}{+KC_C}{-KC_B}{-KC_C}"],
    ["rolling overlap under a modifier", [down("KC_LGUI", 0), down("KC_A", 10), down("KC_B", 20), up("KC_A", 30), down("KC_C", 40), up("KC_B", 50), up("KC_C", 60), up("KC_LGUI", 70)], "{+KC_LGUI}{+KC_A}{+KC_B}{-KC_A}{+KC_C}{-KC_B}{-KC_C}{-KC_LGUI}"],
    ["stopping while keys are held", [down("KC_LGUI", 0), down("KC_A", 10)], "{KC_LGUI,KC_A}"],
    ["duplicate downs and orphan releases", [up("KC_LGUI", 0), down("KC_A", 10), down("KC_A", 20), up("KC_A", 30), up("KC_A", 40)], "{KC_A}"],
]) {
    test(`compact recording preserves ${name}`, () => {
        const payload = record(events);
        assert.equal(payload, expected);
        assert.equal(parseMacro(payload).error, "");
        assert.deepEqual(unreleased(parseMacro(payload).steps), []);
        assert.doesNotThrow(() => parsePayload(payload));
    });
}

test("explicit recording retains each event and rounds every event gap", () => {
    const events = [down("KC_LGUI", 900), down("KC_A", 950), up("KC_A", 1074), up("KC_LGUI", 1080)];
    assert.equal(record(events, {explicit: true}), "{+KC_LGUI}{+KC_A}{-KC_A}{-KC_LGUI}");
    assert.equal(record(events, {explicit: true, delays: true, threshold: 30, round: 10}), "{+KC_LGUI}{50}{+KC_A}{120}{-KC_A}{-KC_LGUI}");
});

test("an explicit live take displays held presses; finishing adds only missing releases", () => {
    const events = [down("KC_LGUI", 0), down("KC_A", 10)];
    assert.equal(record(events, {explicit: true, finished: false}), "{+KC_LGUI}{+KC_A}");
    assert.equal(record(events, {explicit: true}), "{+KC_LGUI}{+KC_A}{-KC_A}{-KC_LGUI}");
});

test("compact delays measure pauses between completed taps and chords, without a leading delay", () => {
    const events = [down("KC_A", 900), up("KC_A", 1000), down("KC_LGUI", 1124), down("KC_C", 1224), up("KC_C", 1300), up("KC_LGUI", 1500), down("KC_B", 1520), up("KC_B", 1530)];
    assert.equal(recordedTakePayload("hello {{braces}}", events, {threshold: 30, round: 10}), "hello {{braces}}{KC_A}{120}{KC_LGUI,KC_C}{KC_B}");
});

test("a held modifier preserves pauses between its shortcuts", () => {
    const events = [down("KC_LGUI", 900), down("KC_A", 910), up("KC_A", 950), down("KC_C", 1074), up("KC_C", 1100), up("KC_LGUI", 1200)];
    assert.equal(record(events, {delays: true, threshold: 30, round: 10}), "{KC_LGUI,KC_A}{120}{KC_LGUI,KC_C}");
});

test("long idle pauses split into delays the macro format can store", () => {
    const payload = record([down("KC_A", 0), up("KC_A", 10), down("KC_B", 70010), up("KC_B", 70020)], {delays: true});
    assert.equal(payload, "{KC_A}{65535}{4465}{KC_B}");
    assert.doesNotThrow(() => parsePayload(payload));
});

test("ending a take timestamps synthetic releases at the end, without adding idle time after physical releases", () => {
    const options = {explicit: true, delays: true, finishedAt: 12000};
    assert.equal(record([down('KC_A', 10000)], options), '{+KC_A}{2000}{-KC_A}');
    assert.equal(record([down('KC_A', 10000), up('KC_A', 10500)], options), '{+KC_A}{500}{-KC_A}');
    assert.equal(record([down('KC_LGUI', 10000), down('KC_A', 10010)], {...options, threshold: 30, round: 10}), '{+KC_LGUI}{+KC_A}{1990}{-KC_A}{-KC_LGUI}');
    assert.equal(record([down('KC_A', 10000)], {...options, finishedAt: 9990}), '{+KC_A}{-KC_A}');
    assert.equal(record([down('KC_A', 10000)], {finishedAt: 12000}), '{KC_A}');
    assert.equal(record([], options), '');
});

test("a finished take stands only while its macro holds exactly what the take produced", () => {
    const take = {slot: "MACRO_3", before: "hi", after: "hi{KC_A}"};
    assert.equal(takeStands(take, "MACRO_3", "hi{KC_A}"), true, "nothing changed since Stop");
    assert.equal(takeStands(take, "MACRO_3", "hi{KC_A}{KC_B}"), false, "a step pasted after the take");
    assert.equal(takeStands(take, "MACRO_3", "hi"), false, "a step deleted after the take");
    assert.equal(takeStands(take, "MACRO_3", "ho{KC_A}"), false, "text typed after the take");
    // Another spelling of the same steps is no change.
    assert.equal(takeStands({...take, after: "{KC_LCTL}"}, "MACRO_3", "{KC_LEFT_CTRL}", {KC_LCTL: "KC_LEFT_CTRL"}), true);
    assert.equal(takeStands(take, "MACRO_4", "hi{KC_A}"), false, "another macro's take");
    assert.equal(takeStands(null, "MACRO_3", "hi{KC_A}"), false);
});
