"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const {slotEditStep, swapLabel} = require("../../core/model/slot-editor");
const {reorderSlots, swapStep} = require("../../core/model/slot-order");
const {editProfileDomains, fingerprint, summary} = require("../../core/model/portable-profile");
const {draftEdit} = require("../fixtures/draft-edit");
const {document: pdDocument} = require("../fixtures/pd-profile");

const snapshotOf = document => ({document, fingerprint: fingerprint(document), summary: summary(document)});
const named = () => editProfileDomains(pdDocument(), {}, open => {
    const settings = open("settings");
    settings.macroNames[2] = "Greeting";
    settings.customKeyNames[3] = "Thumb";
});

test("a swap edit rearranges the draft as its step says, by the names the screens pick slots with", () => {
    const value = named();
    for (const [message, step] of [
        [{type: "swapMacros", keycodes: ["MACRO_2", "MACRO_10"]}, {macros: swapStep("macros", 2, 10)}],
        [{type: "swapCustomKeys", keycodes: ["CUSTOM_KEY_3", "CUSTOM_KEY_20"]}, {customKeys: swapStep("customKeys", 3, 20)}],
        [{type: "swapPdModes", slots: [1, 6]}, {pdModes: swapStep("pdModes", 1, 6)}],
    ]) {
        assert.deepEqual(slotEditStep(message), step, message.type);
        assert.equal(fingerprint(draftEdit(snapshotOf(value), message)), fingerprint(reorderSlots(value, step)), message.type);
    }
});

test("a swap is refused in words when it names no two slots of its bank", () => {
    const value = named();
    for (const [message, why] of [
        [{type: "swapMacros", keycodes: ["MACRO_2"]}, /two macro slots/],
        [{type: "swapMacros", keycodes: ["MACRO_2", "KC_A"]}, /two macro slots/],
        [{type: "swapMacros", keycodes: ["MACRO_2", "MACRO_2"]}, /two different slots/],
        [{type: "swapCustomKeys", keycodes: ["CUSTOM_KEY_3", "MACRO_2"]}, /two custom keys/],
        [{type: "swapCustomKeys", keycodes: "CUSTOM_KEY_3"}, /two custom keys/],
        [{type: "swapPdModes", slots: [1, "6"]}, /two pointing slots/],
        [{type: "swapPdModes", slots: [1, 32]}, /0 to 31/],
    ]) assert.throws(() => draftEdit(snapshotOf(value), message), why, JSON.stringify(message));
});

test("a swap is recorded by the two names as they were before it", () => {
    const value = named();
    assert.equal(swapLabel({type: "swapMacros", keycodes: ["MACRO_2", "MACRO_10"]}, value), "Swapped Greeting and Macro 10");
    assert.equal(swapLabel({type: "swapCustomKeys", keycodes: ["CUSTOM_KEY_20", "CUSTOM_KEY_3"]}, value), "Swapped Custom key 20 and Thumb");
    assert.equal(swapLabel({type: "swapPdModes", slots: [1, 6]}, value), "Swapped Volume and Slot 6");
});
