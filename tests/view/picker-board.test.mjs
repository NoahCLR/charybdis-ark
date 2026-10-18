import assert from "node:assert/strict";
import test from "node:test";
import {createRequire} from "node:module";
import {PICKER_BOARD, legendFits, pickerBoardKey} from "../../webview/view/picker-board.mjs";
const require = createRequire(import.meta.url);
const {buildDeviceModel} = require("../../core/session/device-model");

test("the picker keeps stored positions while showing Option legends, dead keys and ISO", () => {
    const model = buildDeviceModel({settingsView: {host: {effective: 1, layout: 2, macosIso: true}}});
    const source = PICKER_BOARD.keys.find(key => key.value === "KC_E");
    const key = pickerBoardKey(source, model);
    assert.deepEqual(key.labels, ["E", "", "´ ◌", "‰"]);
    assert.equal(key.value, "KC_E");
    assert.equal(key.x, source.x);
    assert.deepEqual(pickerBoardKey(PICKER_BOARD.keys.find(key => key.value === "KC_GRV"), model).labels, ["§", "±", "", ""]);
    assert.equal(pickerBoardKey(source, buildDeviceModel()), source, "US retains the existing board");
});

test("a picker legend shrinks only when it does not fit its key", () => {
    const width = (value) => PICKER_BOARD.keys.find(key => key.value === value).w;
    assert.ok(legendFits("Shift", width("KC_LSFT")), "Shift keeps full size on its wide key");
    assert.ok(legendFits("Space", width("KC_SPC")));
    assert.ok(legendFits("Home", width("KC_HOME")), "a four-letter legend fits one unit");
    assert.ok(!legendFits("Insert", width("KC_INS")), "a six-letter legend does not");
    assert.ok(!legendFits("Command", width("KC_LGUI")));
});
