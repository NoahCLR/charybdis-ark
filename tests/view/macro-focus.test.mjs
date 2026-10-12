// @ts-check
import {test} from "node:test";
import assert from "node:assert/strict";
import {withStepFocus} from "../../webview/view/macro-focus.mjs";
import {serializeMacro} from "../../webview/view/macro.mjs";

test("step identities follow edits and reorders without changing the payload", () => {
    let next = 0;
    const createId = () => `step-${++next}`;
    const source = [{kind: "text", text: "hello"}, {kind: "delay", delay: 10}];
    const first = withStepFocus(source, undefined, createId);
    const edited = [{...first[1], delay: 20}, {...first[0], text: "world"}];
    const reordered = withStepFocus(edited, first, createId);
    assert.deepEqual(reordered.map(step => step.focusId), ["step-2", "step-1"]);
    assert.equal(serializeMacro(reordered), "{20}world");
    assert.deepEqual(source, [{kind: "text", text: "hello"}, {kind: "delay", delay: 10}]);
    assert.equal(next, 2);
});

test("fresh host steps retain matching identities once, including duplicate values", () => {
    let next = 0;
    const createId = () => `step-${++next}`;
    const first = withStepFocus([{kind: "text", text: "same"}, {kind: "text", text: "same"},
        {kind: "tap", keys: ["KC_A"]}], undefined, createId);
    const parsed = [{kind: "tap", keys: ["KC_A"]}, {kind: "text", text: "same"},
        {kind: "text", text: "same"}, {kind: "text", text: "new"}];
    const result = withStepFocus(parsed, first, createId);
    assert.deepEqual(result.map(step => step.focusId), ["step-3", "step-1", "step-2", "step-4"]);
    assert.equal(new Set(result.map(step => step.focusId)).size, result.length);
    assert.equal(serializeMacro(result), serializeMacro(parsed));
});
