import assert from "node:assert/strict";
import test from "node:test";
import {macroBankList, macroMemoryLine, macroProblem, macrosInUse, singleShortcut} from "../../webview/view/macro-bank.mjs";

const slot = (index, extra = {}) => ({keycode: `VIA_MACRO_${index}`, name: "", empty: true, available: true, ...extra});
const bank = [slot(0, {empty: false, name: "Spotlight"}), slot(1), slot(2, {name: "Named only"}), slot(3, {empty: false}), slot(4), slot(5, {available: false})];

test("the list shows slots in use and folds the empty ones; the open slot always shows", () => {
    const list = macroBankList(bank);
    assert.deepEqual(list.shown.map(entry => entry.index), [0, 2, 3]);
    assert.deepEqual(list.folded.map(entry => entry.index), [1, 4, 5]);
    assert.equal(list.firstFree?.keycode, "VIA_MACRO_1");
    assert.deepEqual(macroBankList(bank, {current: "VIA_MACRO_4"}).shown.map(entry => entry.index), [0, 2, 3, 4]);
    assert.equal(macrosInUse(bank), 3);
});

test("a search shows every slot it finds, empty ones too", () => {
    assert.deepEqual(macroBankList(bank, {query: "M4"}).shown.map(entry => entry.index), [4]);
    assert.deepEqual(macroBankList(bank, {query: "spot"}).shown.map(entry => entry.index), [0]);
});

test("no free slot when every empty one is unavailable or named", () => {
    assert.equal(macroBankList([slot(0, {empty: false}), slot(1, {available: false}), slot(2, {name: "x"})]).firstFree, undefined);
});

test("macro memory reads in one line; the reserve sentence only near full or when a slot is closed", () => {
    const memory = {capacity: 34903, stored: 408, free: 34495, available: 128, slots: 128, reserveTaps: 10};
    assert.deepEqual(macroMemoryLine(memory), {text: "408 of 34,903 bytes", share: 408 / 34903, level: "", note: ""});
    const near = macroMemoryLine({...memory, stored: 30000});
    assert.equal(near?.level, "near");
    assert.match(near?.note || "", /^Every empty slot keeps room for 10 key taps\. A key tap/);
    const closed = macroMemoryLine({...memory, stored: 34000, available: 126});
    assert.equal(closed?.level, "over");
    assert.match(closed?.note || "", /so 2 slots are unavailable until a macro is shortened or cleared/);
    assert.equal(macroMemoryLine(null), null);
});

test("a stored macro's problem is said in words, or nothing when it plays", () => {
    assert.equal(macroProblem({playable: true, playbackError: "", needsUnicodeSetup: false}), "");
    assert.equal(macroProblem({playable: false, playbackError: "Needs Unicode Hex Input.", needsUnicodeSetup: true}), "Needs Unicode Hex Input.");
    assert.match(macroProblem({playable: true, playbackError: "", needsUnicodeSetup: true}), /Your computer/);
});

test("a macro that is one shortcut: one chord of modifiers and one key", () => {
    assert.deepEqual(singleShortcut([{kind: "tap", keys: ["KC_LEFT_GUI", "KC_LEFT_SHIFT", "KC_4"]}]), ["KC_LEFT_GUI", "KC_LEFT_SHIFT", "KC_4"]);
    assert.deepEqual(singleShortcut([{kind: "tap", keys: ["KC_LGUI", "KC_SPC"]}]), ["KC_LGUI", "KC_SPC"]);
    assert.equal(singleShortcut([{kind: "tap", keys: ["KC_A", "KC_B"]}]), null);
    assert.equal(singleShortcut([{kind: "tap", keys: ["KC_A"]}]), null);
    assert.equal(singleShortcut([{kind: "tap", keys: ["KC_LGUI", "KC_A"]}, {kind: "delay", delay: 10}]), null);
    assert.equal(singleShortcut([{kind: "text", text: "hi"}]), null);
    assert.deepEqual(singleShortcut([{kind: "tap", keys: ["MY_CMD", "KC_A"]}], {MY_CMD: "KC_LGUI"}), ["MY_CMD", "KC_A"]);
});
