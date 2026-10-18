import assert from "node:assert/strict";
import test from "node:test";
import {comboDecidedAfter, comboMissing, comboWaitTip, moved} from "../../webview/view/combo-form.mjs";

test("a new combo says what it still needs before it can be added (B8)", () => {
    assert.equal(comboMissing({output: ""}, []), "Needs what it sends and two keys.");
    assert.equal(comboMissing({output: " "}, ["KC_A"]), "Needs what it sends and one more key.");
    assert.equal(comboMissing({output: ""}, ["KC_A", "KC_B"]), "Needs what it sends.");
    assert.equal(comboMissing({output: "KC_TAB"}, []), "Needs two keys.");
    assert.equal(comboMissing({output: "KC_TAB"}, ["KC_A"]), "Needs one more key.");
    assert.equal(comboMissing({output: "KC_TAB"}, ["KC_A", "KC_B"]), "");
});

test("must be held and tap only wait for the longer of the window and the hold threshold", () => {
    assert.equal(comboDecidedAfter(50, 200), 200);
    assert.equal(comboDecidedAfter("300", "200"), 300);
    assert.equal(comboDecidedAfter("", 180), 180);
    assert.equal(comboDecidedAfter(undefined, undefined), null);
    assert.match(comboWaitTip("mustHold", 200), /held for 200 ms, the longer of its window/);
    assert.match(comboWaitTip("mustTap", 200), /released within 200 ms/);
    assert.match(comboWaitTip("mustTap", null), /the longer of its window and the combo hold threshold \(Settings/);
});

test("an input moves to another place in the order, and nothing else changes", () => {
    assert.deepEqual(moved(["A", "B", "C"], 0, 2), ["B", "C", "A"]);
    assert.deepEqual(moved(["A", "B", "C"], 2, 0), ["C", "A", "B"]);
    assert.deepEqual(moved(["A", "B"], 1, 1), ["A", "B"]);
    assert.deepEqual(moved(["A", "B"], 3, 0), ["A", "B"]);
});
