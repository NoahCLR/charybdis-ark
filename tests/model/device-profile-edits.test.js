"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const {editDeviceProfile} = require("../../core/model/device-profile-edits");
const {decodeProfileBlob} = require("../../core/schema/profile-blob-v1");
const {decodeLightingDomain} = require("../../core/schema/lighting-domain-v1");
const {ruleIdentity} = require("../../core/model/lighting-editor");
const {bytes} = require("../fixtures/device-profile");
const rgb = blob => decodeLightingDomain(decodeProfileBlob(blob).domains[0].payload);

test("lighting rule colour edits retain behaviour bytes and every unrelated rule", () => {
    const original = rgb(bytes);
    const edited = editDeviceProfile(bytes, {type: "editLightingRule", index: 0, expectedRule: ruleIdentity(original.rules[0]), action: "colour", colour: {h: 0, s: 255, v: 120}});
    assert.deepEqual(decodeProfileBlob(edited).domains[1].payload, decodeProfileBlob(bytes).domains[1].payload);
    assert.deepEqual(rgb(edited).rules.slice(1), original.rules.slice(1));
    assert.deepEqual(rgb(edited).things, original.things);
    assert.deepEqual(rgb(edited).palette[rgb(edited).rules[0].parts.find(p => p.slot === 3).params[0]], {h: 0, s: 255, v: 120});
});

test("lighting rule edits preserve explicit black and reject malformed colours", () => {
    const message = {type: "editLightingRule", index: 0, expectedRule: ruleIdentity(rgb(bytes).rules[0]), action: "colour", colour: {h: 0, s: 0, v: 0}};
    const edited = editDeviceProfile(bytes, message);
    assert.deepEqual(rgb(edited).palette[rgb(edited).rules[0].parts.find(p => p.slot === 3).params[0]], {h: 0, s: 0, v: 0});
    for (const h of ["", "bad", null, -1, 256]) assert.throws(() => editDeviceProfile(bytes, {...message, colour: {h, s: 0, v: 0}}));
});

test("deleting a lighting rule retains key sets, maps and their references", () => {
    const original = rgb(bytes), index = 0;
    const next = editDeviceProfile(bytes, {type: "editLightingRule", index, expectedRule: ruleIdentity(original.rules[index]), action: "delete"});
    assert.deepEqual(rgb(next).keySets, original.keySets); assert.deepEqual(rgb(next).maps, original.maps);
    assert.deepEqual(rgb(next).rules, original.rules.slice(1));
    assert.throws(() => editDeviceProfile(bytes, {type: "editLightingRule", index: 99, action: "delete", expectedRule: ""}), /no longer exists/);
});

const {decodeComboDomain} = require("../../core/schema/combo-domain-v1");
const {decodeComboPages} = require("../../core/protocol/combo-readback-v1");
const {fixturePages} = require("../fixtures/device-combos");
const {assertEffectiveCombos} = require("../../core/model/device-profile-edits");
const readOf = pages => ({state: "read", ...decodeComboPages(pages[0], pages.slice(1))});
const pages = fixturePages();
const context = {capabilities: {supportedDomainMask: 7, actionAbiDigest: 0x837cf479}, combos: readOf(pages)};
const comboTable = bytes => {const domain = decodeProfileBlob(bytes).domains.find(row => row.id === 0x30); return decodeComboDomain(domain.payload);};
const comboRows = bytes => comboTable(bytes).rows;
test("adding, editing and deleting combos preserves every untouched profile domain and combo", () => {
    const added = editDeviceProfile(bytes, {type: "addCombo", inputs: ["KC_A", "KC_B"], output: "LGUI(KC_C)", termMs: "25", ordered: true}, context);
    const rows = comboRows(added);
    assert.equal(rows.length, 3);
    assert.deepEqual(rows[0].inputs.map(action => action.operand), context.combos.rows[0].inputs);
    // The keyboard's combos keep following its default; the new one has its own.
    assert.deepEqual(rows.map(row => row.termMs), [null, null, 25]);
    assert.equal(rows[2].output.operand, 0x806);
    for (let id = 0; id < 2; id++) assert.deepEqual(decodeProfileBlob(added).domains[id].payload, decodeProfileBlob(bytes).domains[id].payload);
    // A combo holds its output, so a layer hold works there; LT() does not.
    assert.throws(() => editDeviceProfile(added, {type: "saveCombo", id: 2, inputs: ["KC_C", "KC_D"], output: "LT(1,KC_A)", termMs: "30"}, context), /Combo 2: LT\(1,KC_A\) makes its own tap\/hold decision/);
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
    const rgbChanged = editDeviceProfile(removed, {type: "editLightingRule", index: 0, expectedRule: ruleIdentity(rgb(removed).rules[0]), action: "toggle"});
    assert.deepEqual(comboRows(rgbChanged), comboRows(removed));
});
test("a combo follows the default window until it has its own, and the default is one edit", () => {
    const added = editDeviceProfile(bytes, {type: "addCombo", inputs: ["KC_A", "KC_B"], output: "KC_C", termMs: ""}, context);
    assert.equal(comboRows(added)[2].termMs, null);
    const custom = editDeviceProfile(added, {type: "saveCombo", id: 2, inputs: ["KC_A", "KC_B"], output: "KC_C", termMs: "80"}, context);
    assert.equal(comboRows(custom)[2].termMs, 80);
    const back = editDeviceProfile(custom, {type: "saveCombo", id: 2, inputs: ["KC_A", "KC_B"], output: "KC_C", termMs: "80", followsDefault: true}, context);
    assert.equal(comboRows(back)[2].termMs, null);
    const retimed = editDeviceProfile(custom, {type: "updateComboDefaultTerm", defaultTermMs: "70"}, context);
    assert.equal(comboTable(retimed).defaultTermMs, 70);
    // Only the combos that follow the default move with it.
    assert.deepEqual(comboRows(retimed).map(row => row.termMs), [null, null, 80]);
    for (const defaultTermMs of ["0", "", "abc", 65536]) assert.throws(() => editDeviceProfile(custom, {type: "updateComboDefaultTerm", defaultTermMs}, context));
    // With every combo deleted, both combo-wide values stay stored.
    let empty = retimed;
    for (let id = 2; id >= 0; id--) empty = editDeviceProfile(empty, {type: "deleteCombo", id}, context);
    assert.deepEqual(comboTable(empty), {version: 3, defaultTermMs: 70, holdTermMs: 200, rows: []});
    assert.equal(comboTable(editDeviceProfile(empty, {type: "updateComboHoldTerm", holdTermMs: 250}, context)).holdTermMs, 250);
});
test("retired combo readback never becomes an editable table", () => {
    assert.throws(() => readOf(fixturePages(1)), {code: "COMBO_INCOMPATIBLE"});
});
test("Cmd+N from the combo picker saves and verifies as a standard modified key", () => {
    const message = {type: "saveCombo", id: 0, inputs: ["G(KC_C)", "G(KC_V)"], output: "G(KC_N)", termMs: "50"};
    // Standard shortcuts do not depend on the keyboard's custom action ABI.
    const edited = editDeviceProfile(bytes, message, {...context, capabilities: {supportedDomainMask: 7, actionAbiDigest: 0}});
    const row = comboRows(edited)[0];
    assert.deepEqual(row.output, {kind: 1, flags: 0, operand: 0x0811});
    assert.deepEqual(row.inputs.map(action => action.operand), [0x0806, 0x0819]);
    const read = {...context.combos, rows: context.combos.rows.map((row, id) => id ? row : {...row, inputs: [0x0806, 0x0819], output: 0x0811, termMs: 50, followsDefault: false, mustHold: false, mustTap: false, ordered: false})};
    assert.doesNotThrow(() => assertEffectiveCombos(edited, read));
    // A window equal to the default is still its own: it does not follow a changed default.
    assert.throws(() => assertEffectiveCombos(edited, context.combos), /running combo/);
    assert.deepEqual(comboRows(edited)[1], comboRows(editDeviceProfile(bytes, {type: "updateComboHoldTerm", holdTermMs: 200}, context))[1]);
    for (const original of decodeProfileBlob(bytes).domains) {
        assert.deepEqual(decodeProfileBlob(edited).domains.find(domain => domain.id === original.id).payload, original.payload);
    }
});

test("combo edits refuse unsupported firmware, incomplete reads, invalid inputs and opaque callbacks", () => {
    const message = {type: "addCombo", inputs: ["KC_A", "KC_A"], output: "KC_TAB", termMs: 50};
    assert.throws(() => editDeviceProfile(bytes, message, {capabilities: {supportedDomainMask: 3}}), /firmware/);
    assert.throws(() => editDeviceProfile(bytes, message, {...context, combos: null}), /Read/);
    assert.throws(() => editDeviceProfile(bytes, message, context), /distinct/);
    assert.throws(() => editDeviceProfile(bytes, {...message, inputs: ["KC_A", "KC_B"], mustHold: true, mustTap: true}, context), /both/);
    assert.throws(() => editDeviceProfile(bytes, {...message, inputs: ["KC_A", "KC_B"], output: "KC_NO"}, context), /callback/);
    assert.throws(() => editDeviceProfile(bytes, {type: "deleteCombo", id: 99}, context), /index/);
});
test("save verification requires the running combo table to match the saved domain", () => {
    const next = editDeviceProfile(bytes, {type: "updateComboHoldTerm", holdTermMs: 300}, context);
    assert.throws(() => assertEffectiveCombos(next, context.combos), /running combo/);
    assert.throws(() => assertEffectiveCombos(next, null), /could not be verified/);
    assert.doesNotThrow(() => assertEffectiveCombos(next, {...context.combos, holdTermMs: 300}));
    const retimed = editDeviceProfile(bytes, {type: "updateComboDefaultTerm", defaultTermMs: 70}, context);
    assert.throws(() => assertEffectiveCombos(retimed, context.combos), /running combo/);
    assert.doesNotThrow(() => assertEffectiveCombos(retimed, {...context.combos, defaultTermMs: 70, rows: context.combos.rows.map(row => ({...row, termMs: 70}))}));
});

test("lighting colour edits preserve the auto-mouse fade and tap flash settings", () => {
    const original = rgb(bytes);
    const next = editDeviceProfile(bytes, {type: "editLightingRule", index: 0, expectedRule: ruleIdentity(original.rules[0]), action: "colour", colour: {h: 179, s: 255, v: 199}});
    assert.deepEqual(rgb(next).extensions, original.extensions);
    assert.deepEqual(rgb(next).things, original.things);
});

test("effective combo verification includes definition enable and allowed source layers", () => {
    const current = editDeviceProfile(bytes, {type: "updateComboHoldTerm", holdTermMs: 300}, context);
    const read = {...context.combos, holdTermMs: 300};
    assert.doesNotThrow(() => assertEffectiveCombos(current, read));
    for (const patch of [{enabled: false}, {allowedLayers: 32767}, {useOutputBehavior: false}]) {
        assert.throws(() => assertEffectiveCombos(current, {...read, rows: read.rows.map((row, index) => index ? row : {...row, ...patch})}), /running combo/);
    }
});
