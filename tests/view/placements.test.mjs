import assert from "node:assert/strict";
import test from "node:test";
import {keycodePlacements, reachLine} from "../../webview/view/placements.mjs";

const model = {
    layers: [{index: 0, name: "Base", positions: [{keycode: "SNIPING", value: 32260}]},
        {index: 3, name: "Navigation", displayName: "Navigation", positions: [{keycode: "QK_KB_5", value: 32261}, {keycode: "PD_MODE_4", value: 32388}]}],
    qmkKeycodes: [{value: "SNIPING", keycode: 32260}, {value: "SNP_TOG", keycode: 32261}],
    keyBehaviors: [{keycode: "KC_RIGHT_ALT", steps: [{hold: {action: "SNP_TOG"}}]}],
    combos: [{output: "SNIPING"}],
};

test("a key is found on layers, behaviours and combos, by its name or the value the keyboard stores", () => {
    const found = keycodePlacements(model, ["SNIPING", "SNP_TOG"]);
    assert.equal(found.keys.length, 2, "QK_KB_5 is SNP_TOG by value");
    assert.equal(found.behaviours.length, 1);
    assert.equal(found.combos.length, 1);
    assert.equal(reachLine(found), "Base · 1 key, Navigation · 1 key, 1 behaviour, 1 combo");
    assert.equal(reachLine({keys: [], behaviours: [], combos: [], layers: []}), "Not placed");
});
