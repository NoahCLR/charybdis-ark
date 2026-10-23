import assert from "node:assert/strict";
import test from "node:test";
import {createMacroReader} from "../../webview/view/macro-cache.mjs";
import {parseMacro, macroPeek, macroPeekSteps} from "../../webview/view/macro.mjs";
import {withStepFocus} from "../../webview/view/macro-focus.mjs";

test("unchanged bank reads parse each slot once per purpose while changed payloads parse again", () => {
    let calls = 0;
    const read = createMacroReader((payload, options) => { calls++; return parseMacro(payload, options); });
    const model = {macroUnicode: {supported: true}};
    for (let render = 0; render < 5; render++) for (let slot = 0; slot < 128; slot++) {
        read(model, `VIA_MACRO_${slot}`, `slot ${slot}`, "grid");
        read(model, `VIA_MACRO_${slot}`, `slot ${slot}`, "peek");
    }
    assert.equal(calls, 256);
    const old = read(model, "VIA_MACRO_1", "slot 1", "grid");
    assert.equal(read(model, "VIA_MACRO_1", "slot 1", "grid"), old);
    assert.equal(read(model, "VIA_MACRO_1", "edited", "grid").steps[0].text, "edited");
    assert.equal(calls, 257);
    read(model, "VIA_MACRO_1", "slot 1", "grid");
    assert.equal(calls, 258, "only the latest payload stays cached");
});

test("local step focus metadata stays outside the core's cached parsing", () => {
    const read = createMacroReader(), model = {};
    const parsed = read(model, "VIA_MACRO_0", "text{120}", "editor");
    const identified = withStepFocus(parsed.steps, undefined, () => "local-id");
    identified[0].text = "local edit";
    assert.deepEqual(read(model, "VIA_MACRO_0", "text{120}", "editor").steps,
        [{kind: "text", text: "text"}, {kind: "delay", delay: 120}], "the core's payload and focus metadata remain separate");
});

test("a new published model cannot reuse parsing under old host settings", () => {
    const read = createMacroReader();
    // A held key across text the layout cannot type is fine until Unicode entry is on.
    const native = {macroUnicode: {mode: 0}};
    assert.equal(read(native, "VIA_MACRO_0", "{+KC_A}é{-KC_A}", "grid").error, "");
    assert.match(read({...native, macroUnicode: {mode: 1}}, "VIA_MACRO_0", "{+KC_A}é{-KC_A}", "grid").error, /Release ordinary keys/);
    const model = {macroPayloadKeycodes: ["KC_A"], qmkKeycodeAliases: {KC_ENT: "KC_ENTER"}};
    assert.match(read(model, "VIA_MACRO_0", "{KC_B}", "editor").error, /not a key/);
    assert.equal(read(model, "VIA_MACRO_0", "{KC_B}", "peek").error, "", "peek preserves its independent permissive parser");
    assert.equal(read({...model, macroPayloadKeycodes: ["KC_B"]}, "VIA_MACRO_0", "{KC_B}", "editor").error, "");
    assert.equal(read(null, "VIA_MACRO_0", "text", "peek").steps[0].text, "text");
});

test("cached peek steps keep the existing text, chord and held-key preference and current labels", () => {
    const read = createMacroReader(), model = {};
    for (const payload of [" text ", "{KC_A,KC_B}", "{+KC_A}", "{120}", "{bad", ""]) {
        const steps = read(model, "VIA_MACRO_0", payload, "peek").steps;
        assert.equal(macroPeekSteps(steps, key => `named ${key}`), macroPeek(payload, key => `named ${key}`));
    }
    const steps = read(model, "VIA_MACRO_0", "{KC_A}", "peek").steps;
    assert.equal(macroPeekSteps(steps, () => "Old label"), "Old label");
    assert.equal(macroPeekSteps(steps, () => "New label"), "New label", "labels are resolved when rendered");
});
