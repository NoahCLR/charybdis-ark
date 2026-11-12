"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const {applyDraftEdit} = require("../../core/model/draft-editor");
const {readProfileDomains} = require("../../core/model/portable-profile");
const {decodeProfileBlob} = require("../../core/schema/profile-blob-v1");
const {capabilities, comboRead, deviceDocument} = require("../fixtures/device-profile");
// The document a draft holds on this keyboard; each edit makes a new one, as
// the draft makes it.
const base = deviceDocument();
const edit = (document, message, context = {}) => applyDraftEdit({document, limits: context.limits}, message, {capabilities: context.capabilities});
const rgb = document => readProfileDomains(document)("rgb");
const payloads = document => decodeProfileBlob(Buffer.from(document.profile, "base64")).domains;

test("RGB edits replace the selected fields and retain all behaviour bytes", () => {
    const edited = edit(base, {type: "updateLayerColor", layer: "Layer 0", hue: "0", sat: "255", val: "120", mode: "KEYS_MAPPED_ON_THIS_LAYER_ONLY"});
    assert.deepEqual(payloads(edited).filter(domain => domain.id !== 0x10), payloads(base).filter(domain => domain.id !== 0x10));
    const expected = rgb(base);
    expected.layerColors[0].color = {h: 0, s: 255, v: 120}; expected.layerColors[0].mode = 1;
    assert.deepEqual(rgb(edited), expected);
});

test("RGB policies preserve zero and reject missing or malformed values", () => {
    const edited = edit(base, {type: "updateRgbStages", stageEnableMask: 0});
    assert.equal(rgb(edited).stageEnableMask, 0);
    const fade = edit(base, {type: "updateAutomouseFade", mode: "END_COLOR_ON_ALL_KEYS", hue: 1, sat: 0, val: 0});
    assert.deepEqual(rgb(fade).automouseFade, {mode: 2, endColor: {h: 1, s: 0, v: 0}});
    for (const hue of ["", "bad", null, -1, 256]) assert.throws(() => edit(base, {type: "updateLayerColor", layer: "Layer 0", hue, sat: 0, val: 0, mode: "ALL_KEYS"}));
});

// Every accent table, and the groups no accent lights.
const accents = rgbProfile => [rgbProfile.layerGroupRows, rgbProfile.pdModeGroupRows, rgbProfile.comboGroupRows, rgbProfile.keyGroupRows, rgbProfile.autocorrectGroupRows].flat();
const unused = rgbProfile => rgbProfile.groups.filter(group => !accents(rgbProfile).some(row => row.groupId === group.id));

test("an accent changed in place keeps its place and the accents around it, and refuses LEDs the keyboard lacks", () => {
    const before = rgb(base);
    const index = before.pdModeGroupRows.length - 1;
    const next = edit(base, {type: "updateRgbLedGroup", target: "pdMode", index, group: {owner: "POINTING_MODE_VOLUME", ledIndices: [0, 1, 57], h: 5, s: 6, v: 7}});
    const row = rgb(next).pdModeGroupRows[index];
    assert.equal(rgb(next).pdModeGroupRows.length, before.pdModeGroupRows.length, "changed, not added");
    assert.deepEqual([rgb(next).groups.find(group => group.id === row.groupId).leds, row.color, row.selector], [[0, 1, 57], {h: 5, s: 6, v: 7}, 1]);
    assert.deepEqual(rgb(next).keyGroupRows.length, before.keyGroupRows.length, "other tables keep their accents");
    assert.throws(() => edit(base, {type: "updateRgbLedGroup", target: "pdMode", index, group: {owner: "POINTING_MODE_VOLUME", ledIndices: [58], h: 0, s: 0, v: 0}}));
    assert.throws(() => edit(base, {type: "updateRgbLedGroup", target: "pdMode", index: index + 1, group: {owner: "POINTING_MODE_VOLUME", ledIndices: [1], h: 0, s: 0, v: 0}}), /Accent/);
});

test("an accent lights some LEDs, and every accent edit drops the groups no accent lights", () => {
    assert.throws(() => edit(base, {type: "addRgbLedGroup", group: {target: "combo", ledIndices: [], h: 0, s: 0, v: 0}}), /Pick LEDs/);
    assert.throws(() => edit(base, {type: "updateRgbLedGroup", target: "combo", index: 0, group: {ledIndices: [], h: 0, s: 0, v: 0}}), /Pick LEDs/);
    const added = edit(base, {type: "addRgbLedGroup", group: {target: "combo", ledIndices: [30], h: 1, s: 2, v: 3}});
    assert.deepEqual(unused(rgb(added)), [], "a group the keyboard kept unlit goes at the next accent edit");
    const removed = edit(added, {type: "deleteRgbLedGroup", target: "combo", index: rgb(added).comboGroupRows.length - 1});
    assert.ok(!rgb(removed).groups.some(group => group.leds.join() === "30"), "and so does one whose last accent goes");
    assert.deepEqual(rgb(removed).groups.map(group => group.id), rgb(removed).groups.map((_, index) => index), "ids stay consecutive from zero");
    for (const row of accents(rgb(removed))) assert.ok(rgb(removed).groups.some(group => group.id === row.groupId), "every accent still names a group");
});

test("replacement feedback saves its four cases, a colour and a locality each, as one record, a case off included", () => {
    const before = rgb(base);
    const config = {textColor: {h: 1, s: 2, v: 3}, textLocality: "RGB_KEYS_ONLY", macroColor: {h: 0, s: 0, v: 0}, macroLocality: "RGB_BOTH_HALVES",
        undoColor: {h: "7", s: "8", v: "9"}, undoLocality: "RGB_LEFT_HALF", leadingColor: {h: "170", s: "255", v: "100"}, leadingLocality: "RGB_KEY_HALF"};
    const edited = edit(base, {type: "updateAutocorrectFeedback", config});
    assert.deepEqual(rgb(edited).autocorrectFeedback, {textColor: {h: 1, s: 2, v: 3}, textLocality: 4, macroColor: {h: 0, s: 0, v: 0}, macroLocality: 0,
        undoColor: {h: 7, s: 8, v: 9}, undoLocality: 1, leadingColor: {h: 170, s: 255, v: 100}, leadingLocality: 3});
    assert.deepEqual({...rgb(edited), autocorrectFeedback: before.autocorrectFeedback}, before, "nothing else in lighting moves");
    assert.deepEqual(payloads(edited).filter(domain => domain.id !== 0x10), payloads(base).filter(domain => domain.id !== 0x10));
    assert.throws(() => edit(base, {type: "updateAutocorrectFeedback", config: {...config, macroLocality: "RGB_NOWHERE"}}), /Unknown locality/);
    assert.throws(() => edit(base, {type: "updateAutocorrectFeedback", config: {...config, leadingLocality: undefined}}), /Unknown locality/);
    assert.throws(() => edit(base, {type: "updateAutocorrectFeedback", config: {...config, undoColor: {h: 0, s: 0, v: 256}}}), /Brightness/);
    assert.throws(() => edit(base, {type: "updateAutocorrectFeedback", config: {...config, undoColor: {h: 0, s: 0, v: 201}}}, {limits: {brightnessMax: 200}}), /Brightness must be between 0 and 200/);
    assert.throws(() => edit(base, {type: "updateAutocorrectFeedback", config: {...config, textColor: {h: "", s: 0, v: 0}}}));
});

test("the stage switch takes replacement feedback's bit and no bit past it", () => {
    const mask = rgb(base).stageEnableMask;
    assert.equal(mask & 32, 32, "on in the keyboard's compiled defaults");
    assert.equal(rgb(edit(base, {type: "updateRgbStages", stageEnableMask: mask & ~32})).stageEnableMask, mask & ~32);
    assert.equal(rgb(edit(base, {type: "updateRgbStages", stageEnableMask: 63})).stageEnableMask, 63);
    assert.throws(() => edit(base, {type: "updateRgbStages", stageEnableMask: 64}), /RGB stage mask must be between 0 and 63/);
});

test("a replacement feedback accent is added for one case or all, changed where it stands and removed", () => {
    const before = rgb(base).autocorrectGroupRows;
    assert.deepEqual(before.map(row => row.semantic), [255], "the compiled accent for every replacement flash");
    const added = edit(base, {type: "addRgbLedGroup", group: {target: "autocorrect", owner: "AUTOCORRECT_FEEDBACK_GROUP_UNDO", ledIndices: [57], h: 0, s: 255, v: 200}});
    const row = rgb(added).autocorrectGroupRows.at(-1);
    assert.equal(rgb(added).autocorrectGroupRows.length, before.length + 1, "at the table's end");
    assert.deepEqual([rgb(added).groups.find(group => group.id === row.groupId).leds, row.color, row.semantic], [[57], {h: 0, s: 255, v: 200}, 2]);
    for (const [owner, semantic] of [["AUTOCORRECT_FEEDBACK_GROUP_TEXT", 0], ["AUTOCORRECT_FEEDBACK_GROUP_MACRO", 1], ["AUTOCORRECT_FEEDBACK_GROUP_ALL", 255]]) {
        const next = edit(added, {type: "updateRgbLedGroup", target: "autocorrect", index: 1, group: {owner, ledIndices: [3, 4], h: 0, s: 0, v: 0}});
        const changed = rgb(next).autocorrectGroupRows[1];
        assert.deepEqual([rgb(next).groups.find(group => group.id === changed.groupId).leds, changed.color, changed.semantic], [[3, 4], {h: 0, s: 0, v: 0}, semantic], owner);
        assert.deepEqual(rgb(next).autocorrectGroupRows[0].semantic, 255, "the accent before it keeps its place");
        assert.ok(!rgb(next).groups.some(group => group.leds.join() === "57"), "the set it no longer lights is dropped");
    }
    const removed = edit(added, {type: "deleteRgbLedGroup", target: "autocorrect", index: 1});
    const lit = value => accents(value).map(accent => [value.groups.find(group => group.id === accent.groupId).leds.join(), accent.color]);
    assert.deepEqual(lit(rgb(removed)), lit(rgb(base)), "removing it leaves every other accent lighting what it lit");
    assert.ok(!rgb(removed).groups.some(group => group.leds.join() === "57"), "and its LED set is dropped");
    assert.deepEqual(rgb(edit(base, {type: "deleteRgbLedGroup", target: "autocorrect", index: 0})).autocorrectGroupRows, []);
    assert.deepEqual(rgb(added).keyGroupRows.map(key => key.semantic), rgb(base).keyGroupRows.map(key => key.semantic), "other tables keep their accents");
    // A behaviour state is no replacement case, nor the other way round.
    assert.throws(() => edit(base, {type: "addRgbLedGroup", group: {target: "autocorrect", owner: "KEY_FEEDBACK_GROUP_ALL", ledIndices: [1], h: 0, s: 0, v: 0}}), /Unknown replacement case/);
    assert.throws(() => edit(base, {type: "addRgbLedGroup", group: {target: "keyBehavior", owner: "AUTOCORRECT_FEEDBACK_GROUP_ALL", ledIndices: [1], h: 0, s: 0, v: 0}}), /Unknown behaviour state/);
    assert.throws(() => edit(base, {type: "addRgbLedGroup", group: {target: "autocorrect", owner: "AUTOCORRECT_FEEDBACK_GROUP_TEXT", ledIndices: [], h: 0, s: 0, v: 0}}), /Pick LEDs/);
    assert.throws(() => edit(base, {type: "deleteRgbLedGroup", target: "autocorrect", index: 1}), /Accent/);
});

const {decodeComboPages} = require("../../core/protocol/combo-readback-v1");
const {retiredPages} = require("../fixtures/device-combos");
const readOf = pages => ({state: "read", ...decodeComboPages(pages[0], pages.slice(1))});
const context = {capabilities};
const comboTable = document => readProfileDomains(document)("combos");
const comboRows = document => comboTable(document).rows;
test("adding, editing and deleting combos preserves every untouched profile domain and combo", () => {
    const added = edit(base, {type: "addCombo", inputs: ["KC_A", "KC_B"], output: "LGUI(KC_C)", termMs: "25", ordered: true}, context);
    const rows = comboRows(added);
    assert.equal(rows.length, 3);
    assert.deepEqual(rows[0].inputs.map(action => action.operand), comboRead().rows[0].inputs);
    // The keyboard's combos keep following its default; the new one has its own.
    assert.deepEqual(rows.map(row => row.termMs), [null, null, 25]);
    assert.equal(rows[2].output.operand, 0x806);
    assert.deepEqual(payloads(added).filter(domain => domain.id !== 0x30), payloads(base).filter(domain => domain.id !== 0x30));
    // A combo holds its output, so a layer hold works there; LT() does not.
    assert.throws(() => edit(added, {type: "saveCombo", id: 2, inputs: ["KC_C", "KC_D"], output: "LT(1,KC_A)", termMs: "30"}, context), /C2: LT\(1,KC_A\) makes its own tap\/hold decision/);
    const edited = edit(added, {type: "saveCombo", id: 2, inputs: ["KC_C", "KC_D"], output: "MO(2)", termMs: "30", mustHold: true}, context);
    // QMK never fires a combo with a 0 ms window, so none is stored.
    assert.throws(() => edit(added, {type: "saveCombo", id: 2, inputs: ["KC_C", "KC_D"], output: "KC_E", termMs: "0"}, context), /at least 1 ms/);
    assert.deepEqual(comboRows(edited)[2].output, {kind: 2, flags: 0, operand: 2});
    assert.equal(comboRows(edited)[2].mustHold, true);
    const timed = edit(edited, {type: "updateComboHoldTerm", holdTermMs: 400}, context);
    assert.equal(comboTable(timed).holdTermMs, 400);
    const removed = edit(timed, {type: "deleteCombo", id: 1}, context);
    assert.equal(comboRows(removed).length, 2);
    assert.equal(comboRows(removed)[1].output.kind, 2);
    const rgbChanged = edit(removed, {type: "updateRgbStages", stageEnableMask: 0});
    assert.deepEqual(comboRows(rgbChanged), comboRows(removed));
});
test("a combo's key count is refused in plain words, naming the keyboard's limit", () => {
    const keys = count => Array.from({length: count}, (_, at) => `KC_F${at + 1}`);
    assert.throws(() => edit(base, {type: "addCombo", inputs: ["KC_A"], output: "KC_C", termMs: ""}, context), /A combo needs at least two keys\./);
    assert.throws(() => edit(base, {type: "addCombo", inputs: keys(17), output: "KC_C", termMs: ""}, context), /A combo takes at most 16 keys\./);
    const four = {...context, capabilities: {...context.capabilities, maxKeysPerCombo: 4}};
    assert.throws(() => edit(base, {type: "addCombo", inputs: keys(5), output: "KC_C", termMs: ""}, four), /A combo takes at most 4 keys\./);
});
test("a combo follows the default window until it has its own, and the default is one edit", () => {
    const added = edit(base, {type: "addCombo", inputs: ["KC_A", "KC_B"], output: "KC_C", termMs: ""}, context);
    assert.equal(comboRows(added)[2].termMs, null);
    const custom = edit(added, {type: "saveCombo", id: 2, inputs: ["KC_A", "KC_B"], output: "KC_C", termMs: "80"}, context);
    assert.equal(comboRows(custom)[2].termMs, 80);
    const back = edit(custom, {type: "saveCombo", id: 2, inputs: ["KC_A", "KC_B"], output: "KC_C", termMs: "80", followsDefault: true}, context);
    assert.equal(comboRows(back)[2].termMs, null);
    const retimed = edit(custom, {type: "updateComboDefaultWindow", defaultTermMs: "70"}, context);
    assert.equal(comboTable(retimed).defaultTermMs, 70);
    // Only the combos that follow the default move with it.
    assert.deepEqual(comboRows(retimed).map(row => row.termMs), [null, null, 80]);
    for (const defaultTermMs of ["0", "", "abc", 65536]) assert.throws(() => edit(custom, {type: "updateComboDefaultWindow", defaultTermMs}, context));
    // With every combo deleted, both combo-wide values stay stored.
    let empty = retimed;
    for (let id = 2; id >= 0; id--) empty = edit(empty, {type: "deleteCombo", id}, context);
    assert.deepEqual(comboTable(empty), {version: 3, defaultTermMs: 70, holdTermMs: 200, rows: []});
    assert.equal(comboTable(edit(empty, {type: "updateComboHoldTerm", holdTermMs: 250}, context)).holdTermMs, 250);
});
test("retired combo readback never becomes an editable table", () => {
    assert.throws(() => readOf(retiredPages(1)), {code: "COMBO_INCOMPATIBLE"});
});
test("Cmd+N from the combo picker saves as a standard modified key", () => {
    const message = {type: "saveCombo", id: 0, inputs: ["G(KC_C)", "G(KC_V)"], output: "G(KC_N)", termMs: "50"};
    const edited = edit(base, message, context);
    const row = comboRows(edited)[0];
    assert.deepEqual(row.output, {kind: 1, flags: 0, operand: 0x0811});
    assert.deepEqual(row.inputs.map(action => action.operand), [0x0806, 0x0819]);
    assert.deepEqual(comboRows(edited)[1], comboRows(edit(base, {type: "updateComboHoldTerm", holdTermMs: 200}, context))[1]);
    assert.deepEqual(payloads(edited).filter(domain => domain.id !== 0x30), payloads(base).filter(domain => domain.id !== 0x30));
});

test("combo edits refuse unsupported firmware, invalid inputs and opaque callbacks", () => {
    const message = {type: "addCombo", inputs: ["KC_A", "KC_A"], output: "KC_TAB", termMs: 50};
    assert.throws(() => edit(base, message, {...context, capabilities: {...capabilities, supportedDomainMask: 3}}), /firmware/);
    assert.throws(() => edit(base, message, context), /distinct/);
    assert.throws(() => edit(base, {...message, inputs: ["KC_A", "KC_B"], mustHold: true, mustTap: true}, context), /both/);
    assert.throws(() => edit(base, {...message, inputs: ["KC_A", "KC_B"], output: "KC_NO"}, context), /callback/);
    assert.throws(() => edit(base, {type: "deleteCombo", id: 99}, context), /index/);
});
test("auto-mouse save encodes all three policies exactly and keeps the chosen end colour", () => {
    const names = ["FOLLOW_REAL_DESTINATION", "END_COLOR_WHERE_BASE_EFFECT_WOULD_SHOW", "END_COLOR_ON_ALL_KEYS"];
    for (const [mode, name] of names.entries()) {
        const edited = edit(base, {type: "updateAutomouseFade", mode: name, hue: 179, sat: 255, val: 199});
        assert.deepEqual(rgb(edited).automouseFade, {mode, endColor: {h: 179, s: 255, v: 199}});
        assert.deepEqual(rgb(edited).layerColors, rgb(base).layerColors);
        assert.deepEqual(rgb(edited).pdModeColors, rgb(base).pdModeColors);
    }
});
