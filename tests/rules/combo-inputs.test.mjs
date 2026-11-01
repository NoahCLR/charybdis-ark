import test from "node:test";
import assert from "node:assert/strict";
import {comboInputIsKey, comboKeysAmong, comboTouches, inputOn, inputPressed, keyMeaning} from "../../rules/combo-inputs.mjs";

const key = (layoutIndex, keycode, semantic) => ({layoutIndex, keycode, ...(semantic ? {semantic} : {})});

test("a key presses an input by the keycode it stores or by what it means", () => {
    assert.equal(keyMeaning(key(0, "QK_USER_16", "PD_MODE_0")), "PD_MODE_0");
    assert.equal(keyMeaning(key(0, "KC_A")), "KC_A");
    assert.equal(keyMeaning(null), "");
    assert.equal(inputOn("KC_A", key(0, "KC_A")), true);
    assert.equal(inputOn("PD_MODE_0", key(0, "QK_USER_16", "PD_MODE_0")), true);
    assert.equal(inputOn("KC_B", key(0, "KC_A")), false);
});

test("input positions the keyboard reports decide which keys are a combo's, before keycodes", () => {
    const combo = {inputs: ["KC_A", "KC_B"], inputPositions: [3, 9]};
    assert.equal(comboTouches(combo, key(9, "KC_Z")), true);
    assert.equal(comboTouches(combo, key(4, "KC_A")), false);
    assert.equal(comboTouches({inputs: ["KC_A", "KC_B"]}, key(4, "KC_A")), true);
    assert.equal(comboTouches(null, key(4, "KC_A")), false);
    assert.equal(inputPressed({inputs: ["KC_A", "KC_B"]}, key(4, "KC_B")), "KC_B");
    assert.equal(inputPressed({inputs: ["KC_A"]}, key(4, "KC_Z")), "KC_Z", "a key matched by position presses its own keycode");
});

test("a chord forms once the keys cover every input, and an input on two keys is pressed on either", () => {
    const combo = {inputs: ["KC_D", "KC_F"]};
    const keys = [key(0, "KC_D"), key(1, "KC_J"), key(2, "KC_F"), key(3, "KC_F")];
    assert.deepEqual(comboKeysAmong(keys, combo), {keys: [keys[0], keys[2], keys[3]], covered: 2, forms: true});
    assert.deepEqual(comboKeysAmong(keys.slice(1), combo), {keys: [keys[2], keys[3]], covered: 1, forms: false});
    assert.equal(comboKeysAmong(keys, {inputs: []}).forms, false, "a combo with no inputs never forms");
});

test("an input by its number is the key at the place the keyboard reports, otherwise the key that presses its name", () => {
    assert.equal(comboInputIsKey({inputs: ["KC_A", "KC_B"], inputPositions: [3, 9]}, 1, key(9, "KC_Z")), true);
    assert.equal(comboInputIsKey({inputs: ["KC_A", "KC_B"], inputPositions: [3, 9]}, 0, key(9, "KC_A")), false);
    assert.equal(comboInputIsKey({inputs: ["KC_A", "KC_B"]}, 1, key(9, "KC_B")), true);
    assert.equal(comboInputIsKey({inputs: ["KC_A"]}, 1, key(9, "KC_B")), false, "a combo with no such input");
});
