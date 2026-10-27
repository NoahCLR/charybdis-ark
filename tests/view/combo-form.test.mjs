import assert from "node:assert/strict";
import test from "node:test";
import {comboFull, comboMissing} from "../../webview/view/combo-form.mjs";

test("a new combo says what it still needs before it can be added (B8)", () => {
    assert.equal(comboMissing({output: ""}, []), "Needs what it sends and two keys.");
    assert.equal(comboMissing({output: " "}, ["KC_A"]), "Needs what it sends and one more key.");
    assert.equal(comboMissing({output: ""}, ["KC_A", "KC_B"]), "Needs what it sends.");
    assert.equal(comboMissing({output: "KC_TAB"}, []), "Needs two keys.");
    assert.equal(comboMissing({output: "KC_TAB"}, ["KC_A"]), "Needs one more key.");
    assert.equal(comboMissing({output: "KC_TAB"}, ["KC_A", "KC_B"]), "");
});

test("a combo takes no more keys than the keyboard's combo input limit, and says what the limit is", () => {
    const keys = (count) => Array.from({length: count}, (_, at) => `KC_F${at + 1}`);
    assert.equal(comboMissing({output: "KC_TAB"}, keys(16), 16), "", "at the limit it can be kept");
    assert.equal(comboFull(keys(16), 16), "A combo takes at most 16 keys.", "and says why Pick on board takes no more");
    assert.equal(comboFull(keys(15), 16), "");
    assert.equal(comboMissing({output: "KC_TAB"}, keys(17), 16), "A combo takes at most 16 keys. Remove one.");
    assert.equal(comboMissing({output: ""}, keys(19), 16), "A combo takes at most 16 keys. Remove 3.");
    assert.equal(comboMissing({output: "KC_TAB"}, keys(17)), "", "a keyboard that reported no limit");
    assert.equal(comboFull(keys(17), null), "");
});
