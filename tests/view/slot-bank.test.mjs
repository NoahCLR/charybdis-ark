import test from "node:test";
import assert from "node:assert/strict";
import {allSlotsLabel, emptySlotsLabel, slotBank} from "../../webview/view/slot-bank.mjs";

// Eight slots: 2 and 5 in use, 4 the one open in the editor, 6 out of room.
const slots = Array.from({length: 8}, (_, slot) => ({slot, used: slot === 2 || slot === 5, out: slot === 6}));
const rule = (fields = {}) => ({
    inUse: (row) => row.used, free: (row) => !row.used && !row.out, keep: (row) => row.slot === 4,
    matches: () => true, searching: false, open: false, ...fields,
});
const numbers = (rows) => rows.map((row) => row.slot);

test("a slot bank opens on the slots in use and the one open, in slot order, folding the rest", () => {
    const bank = slotBank(slots, rule());
    assert.deepEqual(numbers(bank.shown), [2, 4, 5]);
    assert.deepEqual(bank.revealed, [], "folded, the unused slots are not drawn");
    assert.equal(bank.folded, 5);
});

test("opened, the unused slots are drawn after the disclosure in slot order, so none shown moves", () => {
    const bank = slotBank(slots, rule({open: true}));
    assert.deepEqual(numbers(bank.shown), [2, 4, 5]);
    assert.deepEqual(numbers(bank.revealed), [0, 1, 3, 6, 7]);
});

test("New picks the first free slot, never one in use or without room", () => {
    assert.equal(slotBank(slots, rule()).firstFree?.slot, 0);
    const full = slots.map((row) => ({...row, used: row.slot !== 6, out: row.slot === 6}));
    assert.equal(slotBank(full, rule()).firstFree, null, "a bank with no free slot offers none");
});

test("a search looks through every slot, used or not, and folds nothing", () => {
    const bank = slotBank(slots, rule({searching: true, matches: (row) => row.slot % 3 === 0}));
    assert.deepEqual(numbers(bank.shown), [0, 3, 6]);
    assert.deepEqual(bank.revealed, []);
    assert.equal(bank.folded, 0);
});

test("the disclosure counts the whole bank", () => {
    assert.equal(allSlotsLabel(128), "Show all 128 slots");
});

test("a list of slots says how many empty slots its disclosure holds, as a list of layers does", () => {
    assert.equal(emptySlotsLabel(24), "24 empty slots");
    assert.equal(emptySlotsLabel(1), "1 empty slot");
});
