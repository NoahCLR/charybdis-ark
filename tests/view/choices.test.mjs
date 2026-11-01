import assert from "node:assert/strict";
import test from "node:test";
import {ON_SCREEN_MAX_CHARACTERS, ON_SCREEN_MAX_OPTIONS, onScreenChoice, settingOptions} from "../../webview/view/choices.mjs";

test("two to four options whose words fit one line show on screen; more, longer or one stay a menu", () => {
    assert.equal(onScreenChoice(["seconds", "minutes"]), true);
    assert.equal(onScreenChoice(["Auto (macOS detected)", "macOS", "Windows", "Linux"]), true);
    assert.equal(onScreenChoice(["Only one"]), false, "one option is not a choice");
    assert.equal(onScreenChoice(["Both halves", "Left half", "Right half", "The half holding the trigger key", "Only the trigger key"]), false, "five options");
    assert.equal(onScreenChoice(["Follow the real destination", "End colour where the background effect would show", "End colour on all keys"]), false, "too long together");
    const half = ON_SCREEN_MAX_CHARACTERS / 2;
    assert.equal(onScreenChoice(["x".repeat(half), "y".repeat(half)]), true, "exactly the limit fits");
    assert.equal(onScreenChoice(["x".repeat(half), "y".repeat(half + 1)]), false);
    assert.equal(onScreenChoice(Array.from({length: ON_SCREEN_MAX_OPTIONS + 1}, (_, index) => String(index))), false, "one option too many");
});

test("a setting's options keep its stored value first, as stored, when it is none of its choices", () => {
    assert.deepEqual(settingOptions({value: "2", choices: [{value: 1, label: "macOS"}, {value: 2, label: "Windows"}]}), [["1", "macOS"], ["2", "Windows"]]);
    assert.deepEqual(settingOptions({value: "9", choices: [1, {value: 2, label: "Windows"}]}), [["9", "9 · as stored"], ["1", "1"], ["2", "Windows"]]);
    assert.deepEqual(settingOptions({value: "3", choices: [{value: 3}]}), [["3", "3"]], "a choice without words is its value");
});
