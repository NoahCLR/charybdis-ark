import assert from "node:assert/strict";
import test from "node:test";
import {comboMissing} from "../../webview/view/combo-form.mjs";

test("a new combo says what it still needs before it can be added (B8)", () => {
    assert.equal(comboMissing({output: ""}, []), "Needs what it sends and two keys.");
    assert.equal(comboMissing({output: " "}, ["KC_A"]), "Needs what it sends and one more key.");
    assert.equal(comboMissing({output: ""}, ["KC_A", "KC_B"]), "Needs what it sends.");
    assert.equal(comboMissing({output: "KC_TAB"}, []), "Needs two keys.");
    assert.equal(comboMissing({output: "KC_TAB"}, ["KC_A"]), "Needs one more key.");
    assert.equal(comboMissing({output: "KC_TAB"}, ["KC_A", "KC_B"]), "");
});
