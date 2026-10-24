import assert from "node:assert/strict";
import test from "node:test";
import {flashPausesView, pauseWords} from "../../webview/view/flash-pauses.mjs";

const vocabulary = {physicalHalves: [[0, "left"], [1, "right"], [255, "side not set"]]};
const master = {physicalHalf: 1, longestEraseUs: 49045, longestProgramUs: 632, longestStorageStepUs: 49310, lastSaveUs: 790000, lastSaveFlashUs: 114000, saves: 1};
const slave = {physicalHalf: 0, longestEraseUs: 48708, longestProgramUs: 1007, longestStorageStepUs: 48990, lastSaveUs: 410000, lastSaveFlashUs: 117000, saves: 1};
/** @param {unknown} flashPauses */
const model = (flashPauses) => ({vocabulary, device: {connected: true, flashPauses}});

test("a pause reads in the unit that suits it: µs, then ms, then seconds", () => {
    assert.equal(pauseWords(0), "0 µs", "a zero is the keyboard's, said");
    assert.equal(pauseWords(632), "632 µs");
    assert.equal(pauseWords(1007), "1.0 ms");
    assert.equal(pauseWords(49045), "49.0 ms");
    assert.equal(pauseWords(114000), "114 ms");
    assert.equal(pauseWords(790000), "790 ms");
    assert.equal(pauseWords(1250000), "1.25 s");
    assert.equal(pauseWords(0xffffffff), "4294.97 s");
});

test("both halves' figures, master then slave, named with the side each reports", () => {
    const view = flashPausesView(model({state: "read", master, slave}));
    assert.deepEqual(view.halves, ["Master half (right)", "Slave half (left)"]);
    assert.deepEqual(view.rows.map((row) => row.label), ["Longest sector erase", "Longest page program", "Most flash in one scan",
        "Last save", "Flash in the last save", "Saves since boot"]);
    assert.deepEqual(view.rows.map((row) => row.values.map((value) => value.text)), [
        ["49.0 ms", "48.7 ms"], ["632 µs", "1.0 ms"], ["49.3 ms", "49.0 ms"], ["790 ms", "410 ms"], ["114 ms", "117 ms"], ["1", "1"]]);
    assert.equal(view.rows[0].values[0].tip, "49,045 µs", "the exact figure the keyboard reported");
    assert.equal(view.rows[5].values[0].tip, "", "a count needs no tip");
    assert.ok(view.rows.every((row) => row.hint), "each figure says what it measures");
});

test("a half with no figures yet is not measured yet, never zeros", () => {
    const view = flashPausesView(model({state: "read", master, slave: null}));
    assert.deepEqual(view.halves, ["Master half (right)", "Slave half"]);
    assert.ok(view.rows.every((row) => row.values[1].text === "not measured yet" && row.values[1].tip === ""));
    assert.equal(flashPausesView(model({state: "read", master: null, slave: null})).rows[0].values[0].text, "not measured yet");
});

test("a half whose side is not provisioned says so", () => {
    assert.equal(flashPausesView(model({state: "read", master: {...master, physicalHalf: 255}, slave})).halves[0], "Master half (side not set)");
});

test("a failed read says why; with nothing read, or no keyboard, there is nothing to show", () => {
    assert.deepEqual(flashPausesView(model({state: "unavailable", error: "The keyboard did not handle flash pause page 0."})),
        {failed: "Could not read the flash pauses: The keyboard did not handle flash pause page 0."});
    assert.equal(flashPausesView(model(null)), null);
    assert.equal(flashPausesView({vocabulary, device: {connected: false, flashPauses: null}}), null);
    assert.equal(flashPausesView(null), null);
});
