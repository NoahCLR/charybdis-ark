"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const {editDeviceProfile} = require("../../core/model/device-profile-edits");
const {readProfileDomains} = require("../../core/model/portable-profile");
const {decodeProfileBlob} = require("../../core/schema/profile-blob-v1");
const {capabilities, comboRead, deviceDocument} = require("../fixtures/device-profile");
// The document a draft holds on this keyboard; each edit makes a new one.
const base = deviceDocument();
const rgb = document => readProfileDomains(document)("rgb");
const payloads = document => decodeProfileBlob(Buffer.from(document.profile, "base64")).domains;

test("RGB edits replace the selected fields and retain all behaviour bytes", () => {
    const edited = editDeviceProfile(base, {type: "updateLayerColor", layer: "Layer 0", hue: "0", sat: "255", val: "120", mode: "KEYS_MAPPED_ON_THIS_LAYER_ONLY"});
    assert.deepEqual(payloads(edited).filter(domain => domain.id !== 0x10), payloads(base).filter(domain => domain.id !== 0x10));
    const expected = rgb(base);
    expected.layerColors[0].color = {h: 0, s: 255, v: 120}; expected.layerColors[0].mode = 1;
    assert.deepEqual(rgb(edited), expected);
});

test("RGB policies preserve zero and reject missing or malformed values", () => {
    const edited = editDeviceProfile(base, {type: "updateRgbStages", stageEnableMask: 0});
    assert.equal(rgb(edited).stageEnableMask, 0);
    const fade = editDeviceProfile(base, {type: "updateAutomouseFade", mode: "END_COLOR_ON_ALL_KEYS", hue: 1, sat: 0, val: 0});
    assert.deepEqual(rgb(fade).automouseFade, {mode: 2, endColor: {h: 1, s: 0, v: 0}});
    for (const hue of ["", "bad", null, -1, 256]) assert.throws(() => editDeviceProfile(base, {type: "updateLayerColor", layer: "Layer 0", hue, sat: 0, val: 0, mode: "ALL_KEYS"}));
});

test("LED membership edits preserve references and refuse deleting an assigned group", () => {
    const next = editDeviceProfile(base, {type: "saveRgbReusableLedGroup", group: {originalName: "Group 1", ledIndices: [0, 1, 57]}});
    assert.deepEqual(rgb(next).groups.find(group => group.leds.includes(57)).leds, [0, 1, 57]);
    assert.throws(() => editDeviceProfile(base, {type: "deleteRgbReusableLedGroup", name: "Group 1"}), /assignments/);
    assert.throws(() => editDeviceProfile(base, {type: "saveRgbReusableLedGroup", group: {originalName: "Group 1", ledIndices: [58]}}));
});

test("saving a group refuses one with no LEDs, new or edited", () => {
    assert.throws(() => editDeviceProfile(base, {type: "saveRgbReusableLedGroup", group: {ledIndices: []}}), /Pick LEDs/);
    assert.throws(() => editDeviceProfile(base, {type: "saveRgbReusableLedGroup", group: {originalName: "Group 1", ledIndices: []}}), /Pick LEDs/);
    assert.deepEqual(rgb(base).groups.map(group => group.leds.length).filter(length => !length), []);
});

const {decodeComboPages} = require("../../core/protocol/combo-readback-v1");
const {retiredPages} = require("../fixtures/device-combos");
const readOf = pages => ({state: "read", ...decodeComboPages(pages[0], pages.slice(1))});
const context = {capabilities, combos: comboRead()};
const comboTable = document => readProfileDomains(document)("combos");
const comboRows = document => comboTable(document).rows;
test("adding, editing and deleting combos preserves every untouched profile domain and combo", () => {
    const added = editDeviceProfile(base, {type: "addCombo", inputs: ["KC_A", "KC_B"], output: "LGUI(KC_C)", termMs: "25", ordered: true}, context);
    const rows = comboRows(added);
    assert.equal(rows.length, 3);
    assert.deepEqual(rows[0].inputs.map(action => action.operand), context.combos.rows[0].inputs);
    // The keyboard's combos keep following its default; the new one has its own.
    assert.deepEqual(rows.map(row => row.termMs), [null, null, 25]);
    assert.equal(rows[2].output.operand, 0x806);
    assert.deepEqual(payloads(added).filter(domain => domain.id !== 0x30), payloads(base).filter(domain => domain.id !== 0x30));
    // A combo holds its output, so a layer hold works there; LT() does not.
    assert.throws(() => editDeviceProfile(added, {type: "saveCombo", id: 2, inputs: ["KC_C", "KC_D"], output: "LT(1,KC_A)", termMs: "30"}, context), /C2: LT\(1,KC_A\) makes its own tap\/hold decision/);
    const edited = editDeviceProfile(added, {type: "saveCombo", id: 2, inputs: ["KC_C", "KC_D"], output: "MO(2)", termMs: "30", mustHold: true}, context);
    // QMK never fires a combo with a 0 ms window, so none is stored.
    assert.throws(() => editDeviceProfile(added, {type: "saveCombo", id: 2, inputs: ["KC_C", "KC_D"], output: "KC_E", termMs: "0"}, context), /at least 1 ms/);
    assert.deepEqual(comboRows(edited)[2].output, {kind: 2, flags: 0, operand: 2});
    assert.equal(comboRows(edited)[2].mustHold, true);
    const timed = editDeviceProfile(edited, {type: "updateComboHoldTerm", holdTermMs: 400}, context);
    assert.equal(comboTable(timed).holdTermMs, 400);
    const removed = editDeviceProfile(timed, {type: "deleteCombo", id: 1}, context);
    assert.equal(comboRows(removed).length, 2);
    assert.equal(comboRows(removed)[1].output.kind, 2);
    const rgbChanged = editDeviceProfile(removed, {type: "updateRgbStages", stageEnableMask: 0});
    assert.deepEqual(comboRows(rgbChanged), comboRows(removed));
});
test("a combo's key count is refused in plain words, naming the keyboard's limit", () => {
    const keys = count => Array.from({length: count}, (_, at) => `KC_F${at + 1}`);
    assert.throws(() => editDeviceProfile(base, {type: "addCombo", inputs: ["KC_A"], output: "KC_C", termMs: ""}, context), /A combo needs at least two keys\./);
    assert.throws(() => editDeviceProfile(base, {type: "addCombo", inputs: keys(17), output: "KC_C", termMs: ""}, context), /A combo takes at most 16 keys\./);
    const four = {...context, capabilities: {...context.capabilities, maxKeysPerCombo: 4}};
    assert.throws(() => editDeviceProfile(base, {type: "addCombo", inputs: keys(5), output: "KC_C", termMs: ""}, four), /A combo takes at most 4 keys\./);
});
test("a combo follows the default window until it has its own, and the default is one edit", () => {
    const added = editDeviceProfile(base, {type: "addCombo", inputs: ["KC_A", "KC_B"], output: "KC_C", termMs: ""}, context);
    assert.equal(comboRows(added)[2].termMs, null);
    const custom = editDeviceProfile(added, {type: "saveCombo", id: 2, inputs: ["KC_A", "KC_B"], output: "KC_C", termMs: "80"}, context);
    assert.equal(comboRows(custom)[2].termMs, 80);
    const back = editDeviceProfile(custom, {type: "saveCombo", id: 2, inputs: ["KC_A", "KC_B"], output: "KC_C", termMs: "80", followsDefault: true}, context);
    assert.equal(comboRows(back)[2].termMs, null);
    const retimed = editDeviceProfile(custom, {type: "updateComboDefaultWindow", defaultTermMs: "70"}, context);
    assert.equal(comboTable(retimed).defaultTermMs, 70);
    // Only the combos that follow the default move with it.
    assert.deepEqual(comboRows(retimed).map(row => row.termMs), [null, null, 80]);
    for (const defaultTermMs of ["0", "", "abc", 65536]) assert.throws(() => editDeviceProfile(custom, {type: "updateComboDefaultWindow", defaultTermMs}, context));
    // With every combo deleted, both combo-wide values stay stored.
    let empty = retimed;
    for (let id = 2; id >= 0; id--) empty = editDeviceProfile(empty, {type: "deleteCombo", id}, context);
    assert.deepEqual(comboTable(empty), {version: 3, defaultTermMs: 70, holdTermMs: 200, rows: []});
    assert.equal(comboTable(editDeviceProfile(empty, {type: "updateComboHoldTerm", holdTermMs: 250}, context)).holdTermMs, 250);
});
test("retired combo readback never becomes an editable table", () => {
    assert.throws(() => readOf(retiredPages(1)), {code: "COMBO_INCOMPATIBLE"});
});
test("Cmd+N from the combo picker saves as a standard modified key", () => {
    const message = {type: "saveCombo", id: 0, inputs: ["G(KC_C)", "G(KC_V)"], output: "G(KC_N)", termMs: "50"};
    const edited = editDeviceProfile(base, message, context);
    const row = comboRows(edited)[0];
    assert.deepEqual(row.output, {kind: 1, flags: 0, operand: 0x0811});
    assert.deepEqual(row.inputs.map(action => action.operand), [0x0806, 0x0819]);
    assert.deepEqual(comboRows(edited)[1], comboRows(editDeviceProfile(base, {type: "updateComboHoldTerm", holdTermMs: 200}, context))[1]);
    assert.deepEqual(payloads(edited).filter(domain => domain.id !== 0x30), payloads(base).filter(domain => domain.id !== 0x30));
});

test("combo edits refuse unsupported firmware, incomplete reads, invalid inputs and opaque callbacks", () => {
    const message = {type: "addCombo", inputs: ["KC_A", "KC_A"], output: "KC_TAB", termMs: 50};
    assert.throws(() => editDeviceProfile(base, message, {...context, capabilities: {...capabilities, supportedDomainMask: 3}}), /firmware/);
    assert.throws(() => editDeviceProfile(base, message, {...context, combos: null}), /Read/);
    assert.throws(() => editDeviceProfile(base, message, context), /distinct/);
    assert.throws(() => editDeviceProfile(base, {...message, inputs: ["KC_A", "KC_B"], mustHold: true, mustTap: true}, context), /both/);
    assert.throws(() => editDeviceProfile(base, {...message, inputs: ["KC_A", "KC_B"], output: "KC_NO"}, context), /callback/);
    assert.throws(() => editDeviceProfile(base, {type: "deleteCombo", id: 99}, context), /index/);
});
test("auto-mouse save encodes all three policies exactly and keeps the chosen end colour", () => {
    const names = ["FOLLOW_REAL_DESTINATION", "END_COLOR_WHERE_BASE_EFFECT_WOULD_SHOW", "END_COLOR_ON_ALL_KEYS"];
    for (const [mode, name] of names.entries()) {
        const edited = editDeviceProfile(base, {type: "updateAutomouseFade", mode: name, hue: 179, sat: 255, val: 199});
        assert.deepEqual(rgb(edited).automouseFade, {mode, endColor: {h: 179, s: 255, v: 199}});
        assert.deepEqual(rgb(edited).layerColors, rgb(base).layerColors);
        assert.deepEqual(rgb(edited).pdModeColors, rgb(base).pdModeColors);
    }
});
