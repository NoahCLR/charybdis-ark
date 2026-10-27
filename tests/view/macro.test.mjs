import assert from "node:assert/strict";
import test from "node:test";
import {sequenceFace} from "../../webview/view/macro-sequence.mjs";
import {TEXT_CHIP, TEXT_TIP, describeStep, macroChips, macroMatches, macroPeek, parseMacro, serializeMacro, macroStepsInput, unreleased} from "../../webview/view/macro.mjs";

test("a payload reads back as the steps the keyboard will play", () => {
    const {steps, error} = parseMacro("noah@xomnia.com{120}{KC_ENT}");
    assert.equal(error, "");
    assert.deepEqual(steps, [
        {kind: "text", text: "noah@xomnia.com"},
        {kind: "delay", delay: 120},
        {kind: "tap", keys: ["KC_ENT"]},
    ]);
    assert.equal(describeStep(steps[0]), "noah@xomnia.com");
    assert.equal(describeStep(steps[1]), "120 ms");
});

test("presses, releases and chords keep their shape", () => {
    const {steps} = parseMacro("{+KC_LGUI}{KC_LSFT,KC_4}{-KC_LGUI}");
    assert.deepEqual(steps.map((step) => step.kind), ["press", "tap", "release"]);
    assert.deepEqual(steps[1].keys, ["KC_LSFT", "KC_4"]);
    assert.equal(describeStep(steps[1]), "KC_LSFT + KC_4");
});

test("literal braces are doubled, exactly as the keyboard stores them", () => {
    const {steps, error} = parseMacro("{{not a command}}");
    assert.equal(error, "");
    assert.deepEqual(steps, [{kind: "text", text: "{not a command}"}]);
});

test("parsed steps serialize losslessly for reordering and removal", () => {
    const source = "hello {{world}}{120}{+KC_LGUI}{KC_D,KC_ENT}{-KC_LGUI}";
    const {steps, error} = parseMacro(source);
    assert.equal(error, "");
    assert.equal(serializeMacro(steps), source);
    assert.equal(serializeMacro([steps[1], steps[0]]), "{120}hello {{world}}");
});

test("a payload this cannot read says so instead of guessing", () => {
    assert.match(parseMacro("{KC_A").error, /missing its }/);
    assert.match(parseMacro("stray }").error, /Unexpected }/);
    assert.match(parseMacro("{}").error, /empty/i);
});

test("keys left held are reported, because the keyboard would hold them", () => {
    assert.deepEqual(unreleased(parseMacro("{+KC_LGUI}{KC_D}").steps), ["KC_LGUI"]);
    assert.deepEqual(unreleased(parseMacro("{+KC_LGUI}{KC_D}{-KC_LGUI}").steps), []);
});

test("a slot's cell shows what the macro sends, not the modifier they all start with", () => {
    // Twelve real slots all opened with {+KC_LEFT_GUI}, so every cell read
    // "KC_LEFT_…" and no slot could be told from another.
    const label = (name) => ({KC_SPACE: "Space", KC_DOT: ".", KC_X: "X", KC_LEFT_GUI: "Left GUI"})[name] || name;
    assert.equal(macroPeek("{+KC_LEFT_GUI}{KC_SPACE}{-KC_LEFT_GUI}", label), "Space");
    assert.equal(macroPeek("{+KC_LEFT_GUI}{+KC_LEFT_SHIFT}{KC_DOT}{-KC_LEFT_SHIFT}{-KC_LEFT_GUI}", label), ".");
    assert.equal(macroPeek("hello", label), "hello", "text still speaks for itself");
    assert.equal(macroPeek("{+KC_LEFT_GUI}", label), "Left GUI", "a press with no tap is all there is to show");
    assert.equal(macroPeek("", label), "");
});

test("the preview refuses exactly what the core refuses", async () => {
    const {createRequire} = await import("node:module");
    const require = createRequire(import.meta.url);
    const {parsePayload, macroKeycodes} = require("../../core/schema/macro-payload.js");
    const keys = macroKeycodes();
    const coreAccepts = (payload) => { try { parsePayload(payload); return true; } catch { return false; } };
    const previewAccepts = (payload) => { const {steps, error} = parseMacro(payload, {keys}); return !error && !unreleased(steps).length; };
    for (const payload of [
        "hello{120}{KC_ENT}", "{+KC_LGUI}{KC_LSFT,KC_4}{-KC_LGUI}", "{65535}", "a{{b}}c",
        "{+KC_A,KC_B}", "{-KC_A,KC_B}", "{65536}", "{KC_A,KC_A}", "{-KC_A}", "{+KC_A}{+KC_A}{-KC_A}",
        "{+KC_A}", "{KC_NOT_A_KEY}", "café", "{KC_A", "a}", "x".repeat(32769),
        `{${Array.from({length: 17}, (_, index) => ["KC_A", "KC_B", "KC_C", "KC_D", "KC_E", "KC_F", "KC_G", "KC_H", "KC_I", "KC_J", "KC_K", "KC_L", "KC_M", "KC_N", "KC_O", "KC_P", "KC_Q"][index]).join(",")}}`,
    ]) {
        assert.equal(previewAccepts(payload), coreAccepts(payload), payload.length > 40 ? `${payload.slice(0, 40)}…` : payload);
    }
    assert.equal(parseMacro("{KC_NOT_A_KEY}").error, "", "without the core's key list, names are not judged");
});

test("with Unicode playback on, only non-ASCII text refuses a held ordinary key, in preview and core alike", async () => {
    const {createRequire} = await import("node:module");
    const require = createRequire(import.meta.url);
    const {parsePayload, macroKeycodes, macroModifierKeycodes} = require("../../core/schema/macro-payload.js");
    const options = {unicode: true, textEntry: true};
    const coreAccepts = (payload) => { try { parsePayload(payload, options); return true; } catch { return false; } };
    const previewAccepts = (payload) => !parseMacro(payload, {...options, keys: macroKeycodes(), modifierKeys: macroModifierKeycodes()}).error;
    const expected = {"{+KC_A}text{-KC_A}": true, "{+KC_A}tab\there\n{-KC_A}": true, "{+KC_LSFT}café{-KC_LSFT}": true,
        "{+KC_A}café{-KC_A}": false, "{+KC_A}🙂{-KC_A}": false};
    for (const [payload, accepted] of Object.entries(expected)) {
        assert.equal(coreAccepts(payload), accepted, `core: ${payload}`);
        assert.equal(previewAccepts(payload), accepted, `preview: ${payload}`);
    }
});

test("a macro is found by its name, and by its slot when it has none", () => {
    const named = {keycode: "MACRO_3", name: "Screenshot area"};
    const unnamed = {keycode: "MACRO_12", name: ""};
    assert.equal(macroMatches(named, "screen"), true, "part of the name, case ignored");
    assert.equal(macroMatches(named, "  AREA "), true, "surrounding spaces are not part of the search");
    assert.equal(macroMatches(named, "m3"), true, "the slot label the grid shows");
    assert.equal(macroMatches(named, "copy"), false);
    assert.equal(macroMatches(unnamed, "macro 12"), true, "the name the editor falls back to");
    assert.equal(macroMatches(unnamed, "MACRO_12"), true, "and its keycode");
    assert.equal(macroMatches(unnamed, "screen"), false);
    assert.equal(macroMatches(unnamed, ""), true, "an empty search hides nothing");
});


test("editable text is literal, including command-looking braces, code and Unicode", () => {
    const text = ' {"café": "{KC_A}"}\n\t🙂 e\u0301 👩‍💻 ';
    const steps = [{kind: "text", text}, {kind: "delay", delay: "120"}, {kind: "tap", keys: ["KC_LGUI", "KC_A"]}];
    const input = macroStepsInput(steps);
    assert.equal(input.error, "");
    const parsed = parseMacro(input.payload, {unicode: true});
    assert.equal(parsed.error, "");
    assert.equal(parsed.steps[0].text, text);
    assert.deepEqual(parsed.steps.slice(1), [{kind: "delay", delay: 120}, steps[2]]);
    assert.equal(macroStepsInput([{kind: "text", text: ""}]).payload, "");
});

test("incomplete steps keep their input and give a field error instead of inventing a valid edit", () => {
    for (const delay of ["", "-1", "1.5", "65536", "wat"]) {
        const input = macroStepsInput([{kind: "delay", delay}]);
        assert.equal(input.payload, `{${delay}}`);
        assert.match(input.error, /delay/i);
    }
    const input = macroStepsInput([{kind: "tap", keys: []}, {kind: "text", text: "after"}]);
    assert.equal(input.payload, "{}after");
    assert.match(input.error, /Choose a key/);
});


test("canonical names and aliases are one key for holds, releases and chord limits", async () => {
    const {createRequire} = await import("node:module"), require = createRequire(import.meta.url);
    const aliases = require("../../core/data/keycode-catalog.js").aliasTable();
    const keys = require("../../core/schema/macro-payload.js").macroKeycodes();
    const source = "{+KC_LGUI}{KC_A}{-KC_LEFT_GUI}";
    const parsed = parseMacro(source, {aliases, keys});
    assert.equal(parsed.error, "");
    assert.deepEqual(unreleased(parsed.steps, aliases), []);
    assert.equal(serializeMacro(parsed.steps), source, "alias identity checking preserves raw spelling");
    assert.match(parseMacro("{KC_LGUI,KC_LEFT_GUI}", {aliases, keys}).error, /distinct/);
    assert.match(parseMacro("{+KC_LGUI}{KC_LEFT_GUI}{-KC_LGUI}", {aliases, keys}).error, /already held/);
});

test("a held key may span text the host layout types, in preview and core alike", async () => {
    const {createRequire} = await import("node:module");
    const require = createRequire(import.meta.url);
    const {parsePayload, macroKeycodes, macroModifierKeycodes} = require("../../core/schema/macro-payload.js");
    const {hostLayout} = require("../../core/data/host-layouts.js");
    for (const [layout, expected] of [[9, {"{+KC_A}ö{-KC_A}": true, "{+KC_A}🙂{-KC_A}": false}], [2, {"{+KC_A}é€{-KC_A}": true, "{+KC_A}ö{-KC_A}": true}], [0, {"{+KC_A}é{-KC_A}": false}]]) {
        const coreAccepts = (payload) => { try { parsePayload(payload, {unicode: true, textEntry: true, layout}); return true; } catch { return false; } };
        const previewAccepts = (payload) => !parseMacro(payload, {unicode: true, textEntry: true, layoutChars: hostLayout(layout).chars, keys: macroKeycodes(), modifierKeys: macroModifierKeycodes()}).error;
        for (const [payload, accepted] of Object.entries(expected)) {
            assert.equal(coreAccepts(payload), accepted, `core ${layout}: ${payload}`);
            assert.equal(previewAccepts(payload), accepted, `preview ${layout}: ${payload}`);
        }
    }
});

test("a macro's chips read it step by step, held, let go, tapped, typed and waited", () => {
    const face = (step) => ({label: describeStep(step, (name) => ({KC_LEFT_GUI: "L Cmd"})[name] ?? name),
        full: describeStep(step, (name) => ({KC_LEFT_GUI: "Left Command", KC_TAB: "Tab"})[name] ?? name)});
    assert.deepEqual(macroChips("{+KC_LEFT_GUI}{KC_TAB}{120}t3 code{-KC_LEFT_GUI}", face), {more: 0, chips: [
        {kind: "press", label: "L Cmd", full: "Left Command"}, {kind: "tap", label: "KC_TAB", full: "Tab"},
        {kind: "delay", label: "120 ms", full: "120 ms"}, {kind: "text", label: "t3 code", full: "t3 code"},
        {kind: "release", label: "L Cmd", full: "Left Command"}]});
    // The face the screens use: short names on the chip, a wait's bare number
    // (the chip adds its unit), a chord as one chip and line breaks shown.
    const model = {qmkKeyLabels: {KC_LGUI: "Left Command", KC_TAB: "Tab"}, qmkKeyShortLabels: {KC_LGUI: "L Cmd", KC_TAB: "Tab"}};
    assert.deepEqual(macroChips("{KC_LGUI,KC_TAB}{+KC_LGUI}{120}a\nb{-KC_LGUI}", (step) => sequenceFace(model, step)).chips, [
        {kind: "tap", label: "L Cmd + Tab", full: "Left Command + Tab", chord: true}, {kind: "press", label: "L Cmd", full: "Left Command"},
        {kind: "delay", label: "120", full: "120 ms"}, {kind: "text", label: "a ↵ b", full: "a\nb"},
        {kind: "release", label: "L Cmd", full: "Left Command"}]);
    const [typed] = macroChips("x".repeat(500)).chips;
    assert.equal([...typed.label].length, TEXT_CHIP, "a long string is cut on the chip");
    assert.ok(typed.label.endsWith("…"));
    assert.equal([...typed.full].length, TEXT_TIP, "and in its tooltip");
    assert.equal(macroChips("😀".repeat(30)).chips[0].label, `${"😀".repeat(TEXT_CHIP - 1)}…`, "cut between characters, not inside one");
    const long = macroChips("{KC_A}".repeat(15));
    assert.equal(long.chips.length, 12);
    assert.equal(long.more, 3);
});

test("two payloads are the same macro when their keys differ only by alias", async () => {
    const {samePayload} = await import("../../webview/view/macro.mjs");
    const aliases = {KC_LGUI: "KC_LEFT_GUI", KC_SPC: "KC_SPACE"};
    assert.equal(samePayload("{KC_LGUI,KC_SPC}{KC_A}", "{KC_LEFT_GUI,KC_SPACE}{KC_A}", aliases), true);
    assert.equal(samePayload("{KC_LGUI,KC_SPC}", "{KC_LEFT_GUI,KC_A}", aliases), false);
    assert.equal(samePayload("{KC_LGUI", "{KC_LGUI", aliases), true);
    assert.equal(samePayload("{KC_LGUI", "{KC_LEFT_GUI}", aliases), false);
    assert.equal(samePayload("", undefined), true);
});

test("each macro step kind has one name, on its add button and in the step editor", async () => {
    const {STEP_KINDS, addStepLabel, stepKindName} = await import("../../webview/view/macro.mjs");
    assert.deepEqual(STEP_KINDS.map(([kind]) => kind), ["text", "tap", "delay", "press", "release"]);
    assert.deepEqual(STEP_KINDS.map(([, name]) => name), ["Text", "Key or chord", "Delay", "Press", "Release"], "the glossary's macro steps");
    for (const [kind, name] of STEP_KINDS) {
        assert.equal(stepKindName(kind), name);
        assert.equal(addStepLabel(kind), `+ ${name}`);
    }
});

test("a macro's chip tells an unkept edit, a change kept in the draft and the macro as read apart", async () => {
    const {macroLocalState} = await import("../../webview/view/macro.mjs");
    const {createRequire} = await import("node:module"), require = createRequire(import.meta.url);
    const {ProfileDraftSession} = require("../../core/session/profile-draft-session");
    const portable = require("../../core/model/portable-profile");
    const {document} = require("../fixtures/portable-profile");
    const value = document();
    const {DEMO_CAPABILITIES} = require("../../core/session/demo-session");
    const draft = new ProfileDraftSession({document: value, fingerprint: portable.fingerprint(value), summary: portable.summary(value)}, "test-device", DEMO_CAPABILITIES);
    const changes = () => draft.view({selectedDeviceId: "test-device", connected: true}).changes;
    assert.equal(macroLocalState(changes(), "MACRO_0", false).text, "as read");
    assert.deepEqual(macroLocalState(changes(), "MACRO_0", true), {state: "local", dot: "draft", text: "edited here"});
    draft.stage({draftId: draft.id, draftRevision: draft.revision, type: "updateMacro", keycode: "MACRO_0", payload: "Hi"});
    assert.deepEqual(macroLocalState(changes(), "MACRO_0", false), {state: "draft", dot: "draft", text: "changed in draft"});
    assert.equal(macroLocalState(changes(), "MACRO_1", false).text, "as read", "another macro is as read");
    assert.equal(macroLocalState(changes(), "MACRO_0", true).text, "edited here", "an unkept edit over it still says so");
    draft.jump(draft.revision, 0);
    assert.equal(macroLocalState(changes(), "MACRO_0", false).text, "as read", "undone, it is as read again");
    // A playback change Your computer caused is listed under the macro, but it
    // is not a change to the macro.
    assert.equal(macroLocalState([{unit: "settings:host"}], "MACRO_0", false).text, "as read");
});
