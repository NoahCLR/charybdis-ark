import test from "node:test";
import assert from "node:assert/strict";
import {appendSequenceStep, moveSequenceStep, sequenceFace, sequenceInsertionAt, sequenceIssues} from "../../webview/view/macro-sequence.mjs";
import {serializeMacro} from "../../webview/view/macro.mjs";

test("sequence faces use published compact names and retain full accessible values", () => {
    const model = {qmkKeyLabels: {KC_LGUI: "Left Command", KC_C: "C"}, qmkKeyShortLabels: {KC_LGUI: "L Cmd", KC_C: "C"}};
    assert.deepEqual(sequenceFace(model, {kind: "tap", keys: ["KC_LGUI", "KC_C"]}), {full: "Left Command + C", label: "L Cmd + C", wide: true, kind: "chord"});
    assert.equal(sequenceFace(model, {kind: "press", keys: ["KC_LGUI"]}).wide, false);
    assert.equal(sequenceFace(model, {kind: "delay", delay: 65535}).wide, false);
    assert.deepEqual(sequenceFace(model, {kind: "text", text: "a\n\tb"}), {full: "a\n\tb", label: "a ↵  ⇥ b", wide: true, kind: "text"});
    assert.equal(sequenceFace(null, {kind: "tap", keys: ["UNKNOWN"]}).label, "UNKNOWN");
});

test("invalid releases, repeated holds and unfinished holds name the affected steps, including aliases", () => {
    const aliases = {KC_LEFT_GUI: "KC_LGUI"}, model = {qmkKeycodeAliases: aliases}, label = key => aliases[key] || key;
    const valid = [{kind: "press", keys: ["KC_LEFT_GUI"]}, {kind: "tap", keys: ["KC_A"]}, {kind: "release", keys: ["KC_LGUI"]}];
    assert.deepEqual(sequenceIssues(valid, model, label), ["", "", ""]);
    const bad = [valid[2], valid[0], valid[1]];
    const issues = sequenceIssues(bad, model, label);
    assert.match(issues[0], /released before it is pressed/);
    assert.match(issues[1], /before the macro ends/);
    assert.equal(issues[2], "");
    assert.match(sequenceIssues([valid[0], {kind: "tap", keys: ["KC_LGUI"]}, valid[2]], model)[1], /already held/);
    assert.match(sequenceIssues([{kind: "tap", keys: ["KC_A"]}, {kind: "release", keys: ["KC_A"]}])[1], /released before/);
});

test("moves preserve object identity, payload and repeated-step identities in both directions", () => {
    const steps = [{kind: "text", text: "hello", focusId: "a"}, {kind: "delay", delay: 50, focusId: "b"}, {kind: "text", text: "hello", focusId: "c"}];
    const later = moveSequenceStep(steps, "a", 3);
    assert.deepEqual(later.map(s => s.focusId), ["b", "c", "a"]);
    assert.equal(later[2], steps[0]);
    assert.equal(serializeMacro(later), "{50}hellohello");
    assert.deepEqual(moveSequenceStep(later, "a", 0), steps);
    assert.deepEqual(moveSequenceStep(steps, "b", 2), steps, "dropping beside itself is a no-op");
    assert.deepEqual(moveSequenceStep(steps, "missing", 0), steps);
    assert.deepEqual(moveSequenceStep(steps, "a", -1), steps);
    assert.deepEqual(steps.map(s => s.focusId), ["a", "b", "c"], "the source is untouched");
});

test("sequence hit testing includes leading/trailing gutters and gaps between wrapped rows", () => {
    const boxes = [{left: 18, top: 20, width: 64, height: 80}, {left: 94, top: 20, width: 144, height: 80},
        {left: 18, top: 124, width: 64, height: 80}, {left: 94, top: 124, width: 64, height: 80}];
    assert.equal(sequenceInsertionAt(boxes, 1, 50), 0);
    assert.equal(sequenceInsertionAt(boxes, 300, 50), 2);
    assert.equal(sequenceInsertionAt(boxes, 1, 128), 2);
    assert.equal(sequenceInsertionAt(boxes, 300, 164), 4);
    assert.equal(sequenceInsertionAt(boxes, 87, 60), 1);
    assert.equal(sequenceInsertionAt([], 0, 0), 0);
});

test("choosing a first step replaces only a sole empty text step and preserves written text", () => {
    const blank = {kind: "text", text: "", focusId: "placeholder"}, delay = {kind: "delay", delay: 50};
    assert.deepEqual(appendSequenceStep([], delay), [delay]);
    assert.deepEqual(appendSequenceStep([blank], delay), [delay]);
    const written = {...blank, text: " "};
    assert.deepEqual(appendSequenceStep([written], delay), [written, delay], "literal whitespace is content");
    assert.deepEqual(appendSequenceStep([written, blank], delay), [written, blank, delay]);
});

test("a step that would hold more than six keys at once besides modifiers is marked, held keys and text counting with it (firmware D-F65)", () => {
    const words = "A macro holds at most 6 keys at once besides modifiers.";
    const model = {macroPayloadModifierKeycodes: ["KC_LEFT_GUI", "KC_LGUI", "KC_LEFT_SHIFT", "KC_LSFT"], vocabulary: {macroProblems: {reportFull: words}}};
    const tap = (...keys) => ({kind: "tap", keys}), press = key => ({kind: "press", keys: [key]}), release = key => ({kind: "release", keys: [key]});
    assert.deepEqual(sequenceIssues([tap("KC_E", "KC_Y", "KC_K", "KC_SCLN", "KC_P", "KC_0", "KC_U")], model), [words]);
    assert.deepEqual(sequenceIssues([tap("KC_LGUI", "KC_LSFT", "KC_E", "KC_Y", "KC_K", "KC_SCLN", "KC_P", "KC_0")], model), [""]);
    const held = ["KC_A", "KC_B"];
    assert.deepEqual(sequenceIssues([...held.map(press), tap("KC_C", "KC_D", "KC_E", "KC_F", "KC_G"), ...held.map(release)], model), ["", "", words, "", ""]);
    assert.deepEqual(sequenceIssues([...held.map(press), tap("KC_C", "KC_D", "KC_E", "KC_F"), ...held.map(release)], model), ["", "", "", "", ""]);
    const six = ["KC_A", "KC_B", "KC_C", "KC_D", "KC_E", "KC_F"];
    assert.equal(sequenceIssues([...six.map(press), press("KC_G")], model)[6], words);
    assert.equal(sequenceIssues([...six.map(press), {kind: "text", text: "z"}, ...six.map(release)], model)[6], words, "text needs a slot of its own");
    assert.equal(sequenceIssues([...six.slice(1).map(press), {kind: "text", text: "z"}, ...six.slice(1).map(release)], model)[5], "");
    assert.deepEqual(sequenceIssues([tap("KC_E", "KC_Y", "KC_K", "KC_SCLN", "KC_P", "KC_0", "KC_U")], null), [""], "without the modifiers, core alone says it");
});
