"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const {SLOT_BANKS, BANKS, swapStep, reorderSlots, actionByIdentity, identityOf} = require("../../core/model/slot-order");
const {editProfileDomains, fingerprint, validateSnapshot} = require("../../core/model/portable-profile");
const {decodeProfileBlob} = require("../../core/schema/profile-blob-v1");
const {PROFILE_DOMAIN_IDS} = require("../../core/schema/profile-domains");
const {MACRO_DOMAIN_V1} = require("../../core/schema/macro-domain-v1");
const {RGB_DOMAIN_V1} = require("../../core/schema/rgb-domain-v1");
const {encodeMacroPayload} = require("../../core/schema/macro-payload");
const {CUSTOM_KEY_SLOTS, customKeyCode} = require("../../core/data/user-keycodes");
const {PD_MODE_KEYS, POINTING_SLOT_COUNT} = require("../../core/data/pd-mode-keys");
const {QK, macroName} = require("../../rules/qmk-keycodes.mjs");
const {document: pdDocument} = require("../fixtures/pd-profile");

const MACRO = slot => QK.MACRO.first + slot;
// The test profile with every kind of reference to a slot: a macro with a
// name, a key for each bank on layer 1, a custom key's name and shortcut, a
// pointing tap that runs the macro, and an accent on a pointing mode. Its
// behaviours already reach macros (the key 0x806 sends MACRO_10), custom
// keys (rows on CUSTOM_KEY_0–3) and pointing modes (rows on PD_MODE_1).
function referenced() {
    return editProfileDomains(pdDocument(), {}, open => {
        open("macros")[2] = encodeMacroPayload("hello");
        const settings = open("settings");
        settings.macroNames[2] = "Greeting";
        settings.customKeyNames[3] = "Thumb";
        settings.customKeyShortcuts[3] = {mods: 2, keys: [4], layers: 0, layerKind: 0};
        const layer = open("keymap")[1];
        layer[0] = MACRO(2); layer[1] = customKeyCode(3); layer[2] = PD_MODE_KEYS[1].holdCode; layer[3] = PD_MODE_KEYS[1].lockCode;
        open("pdModes")[1].directions.up.keycode = MACRO(2);
        const rgb = open("rgb");
        rgb.pdModeGroupRows.push({selector: 1, color: {h: 1, s: 2, v: 3}, groupId: rgb.pdModeGroupRows[0].groupId});
    });
}
const macroDomain = document => decodeProfileBlob(validateSnapshot(document).profile).domains.find(domain => domain.id === PROFILE_DOMAIN_IDS.MACROS).payload;
const behaviourOn = (decoded, target) => decoded.behaviors.rows.find(row => row.target.kind === target.kind && row.target.operand === target.operand);
const sent = row => row.steps.flatMap(step => [step.tap, step.hold?.action, step.longHold?.action]).filter(Boolean).map(action => `${action.kind}/${action.operand}`);

test("the banks are the keyboard's fixed sets, and a swap step trades exactly two slots", () => {
    assert.deepEqual(BANKS, ["macros", "customKeys", "pdModes"]);
    assert.deepEqual(Object.fromEntries(BANKS.map(bank => [bank, SLOT_BANKS[bank].count])), {macros: MACRO_DOMAIN_V1.SLOTS, customKeys: CUSTOM_KEY_SLOTS, pdModes: POINTING_SLOT_COUNT});
    const step = swapStep("pdModes", 1, 6);
    assert.equal(step.length, POINTING_SLOT_COUNT);
    assert.deepEqual(step.map((held, slot) => held !== slot ? [slot, held] : null).filter(Boolean), [[1, 6], [6, 1]]);
    assert.deepEqual(identityOf(3), [0, 1, 2]);
    assert.throws(() => swapStep("macros", 2, 2), /two different slots/);
    assert.throws(() => swapStep("macros", 2, 128), /0 to 127/);
    assert.throws(() => swapStep("customKeys", -1, 3), /0 to 127/);
    assert.throws(() => reorderSlots(pdDocument(), {macros: [0, 1]}), /every slot once/);
    assert.throws(() => reorderSlots(pdDocument(), {pdModes: identityOf(POINTING_SLOT_COUNT).map(slot => (slot === 1 ? 0 : slot))}), /every slot once/);
});

test("two macros trade places with their steps and names, and every key, behaviour and pointing tap that runs them follows (D-L81)", () => {
    const source = referenced(), moved = reorderSlots(source, {macros: swapStep("macros", 2, 10)});
    const was = validateSnapshot(source), now = validateSnapshot(moved);
    assert.equal(now.macroSlots[10].toString("latin1"), was.macroSlots[2].toString("latin1"), "the steps moved to slot 10");
    assert.equal(now.macroSlots[2].length, 0, "slot 2 holds what slot 10 held: nothing");
    assert.deepEqual([now.settings.macroNames[2], now.settings.macroNames[10]], ["", "Greeting"]);
    assert.equal(now.layers[1][0], MACRO(10), "the key that typed Greeting still does");
    assert.deepEqual(sent(behaviourOn(now, {kind: 1, operand: 0x806})), sent(behaviourOn(was, {kind: 1, operand: 0x806})).map(a => (a === "6/10" ? "6/2" : a)), "the behaviour that sent macro 10 now names slot 2, where it is");
    assert.equal(now.pdModes[1].directions.up.keycode, MACRO(10), "the pointing tap runs the same macro");
    assert.deepEqual([now.settings.customKeyNames[3], now.layers[1][1], now.pdModes[1].name, now.rgb.pdModeGroupRows.length], ["Thumb", customKeyCode(3), "Volume", 2], "nothing else moved");
    assert.equal(fingerprint(reorderSlots(moved, {macros: swapStep("macros", 2, 10)})), fingerprint(source), "swapping back is the keyboard's profile again");
});

test("two custom keys trade names, shortcuts and behaviour rows, and the keys and behaviours that send them follow", () => {
    const source = referenced(), moved = reorderSlots(source, {customKeys: swapStep("customKeys", 3, 20)});
    const was = validateSnapshot(source), now = validateSnapshot(moved);
    assert.deepEqual([now.settings.customKeyNames[3], now.settings.customKeyNames[20]], ["", "Thumb"]);
    assert.deepEqual(now.settings.customKeyShortcuts[20], was.settings.customKeyShortcuts[3]);
    assert.deepEqual(now.settings.customKeyShortcuts[3], was.settings.customKeyShortcuts[20]);
    assert.equal(behaviourOn(now, {kind: 7, operand: 3}), undefined, "the row on custom key 3 went with it");
    assert.deepEqual(sent(behaviourOn(now, {kind: 7, operand: 20})), sent(behaviourOn(was, {kind: 7, operand: 3})), "and listens to the key where it is now");
    assert.equal(now.layers[1][1], customKeyCode(20), "the layout key sends the same custom key");
    assert.deepEqual(macroDomain(moved), macroDomain(source), "the macro domain's bytes are left as they were");
    assert.equal(fingerprint(reorderSlots(moved, {customKeys: swapStep("customKeys", 20, 3)})), fingerprint(source));
});

test("two pointing modes trade records, colours and accents, and the keys and behaviours that start them follow", () => {
    const source = referenced(), moved = reorderSlots(source, {pdModes: swapStep("pdModes", 1, 6)});
    const was = validateSnapshot(source), now = validateSnapshot(moved);
    assert.deepEqual([now.pdModes[6].name, now.pdModes[6].kind, now.pdModes[6].id, now.pdModes[1].kind, now.pdModes[1].id], ["Volume", was.pdModes[1].kind, 6, 0, 1]);
    assert.equal(now.pdModes[6].directions.up.keycode, MACRO(2), "its taps went with it");
    assert.deepEqual([now.layers[1][2], now.layers[1][3]], [PD_MODE_KEYS[6].holdCode, PD_MODE_KEYS[6].lockCode], "the hold and lock keys still start Volume");
    assert.equal(behaviourOn(now, {kind: 4, operand: 1}), undefined);
    assert.deepEqual(sent(behaviourOn(now, {kind: 4, operand: 6})), sent(behaviourOn(was, {kind: 4, operand: 1})), "the behaviour on its key moved with the key");
    const colour = decoded => id => decoded.rgb.pdModeColors.find(row => row.pdModeId === id);
    assert.deepEqual([colour(now)(6).color, colour(now)(6).locality], [colour(was)(1).color, colour(was)(1).locality], "Lighting: its colour row went with it");
    assert.deepEqual([colour(now)(1).color, colour(now)(1).locality], [colour(was)(6).color, colour(was)(6).locality]);
    assert.deepEqual(now.rgb.pdModeColors.map(row => row.pdModeId), was.rgb.pdModeColors.map(row => row.pdModeId), "one row per slot, in slot order");
    assert.deepEqual(now.rgb.pdModeGroupRows.map(row => row.selector), [RGB_DOMAIN_V1.SELECTOR_ALL, 6], "its accent names it where it is; one for every mode stays");
    assert.deepEqual(macroDomain(moved), macroDomain(source));
    assert.equal(fingerprint(reorderSlots(moved, {pdModes: swapStep("pdModes", 6, 1)})), fingerprint(source));
});

test("a step naming no bank, or only identities, is the document itself", () => {
    const source = referenced();
    assert.equal(reorderSlots(source, {}), source);
    assert.equal(reorderSlots(source, {macros: identityOf(MACRO_DOMAIN_V1.SLOTS)}), source);
});

test("an action is named by what its slot holds", () => {
    const order = {macros: swapStep("macros", 2, 10), customKeys: swapStep("customKeys", 3, 20), pdModes: swapStep("pdModes", 1, 6)};
    assert.deepEqual(actionByIdentity({kind: 6, operand: 2}, order), {kind: 6, operand: 10});
    assert.deepEqual(actionByIdentity({kind: 7, operand: 20}, order), {kind: 7, operand: 3});
    assert.deepEqual(actionByIdentity({kind: 5, operand: 6}, order), {kind: 5, operand: 1});
    assert.deepEqual(actionByIdentity({kind: 1, operand: MACRO(10)}, order), {kind: 1, operand: MACRO(2)});
    assert.deepEqual(actionByIdentity({kind: 1, operand: PD_MODE_KEYS[1].lockCode}, order), {kind: 1, operand: PD_MODE_KEYS[6].lockCode});
    assert.deepEqual(actionByIdentity({kind: 1, operand: 4}, order), {kind: 1, operand: 4}, "KC_A is itself");
    assert.deepEqual(actionByIdentity({kind: 2, operand: 3}, order), {kind: 2, operand: 3}, "a layer action is no slot's");
    assert.equal(macroName(2), "MACRO_2");
});
