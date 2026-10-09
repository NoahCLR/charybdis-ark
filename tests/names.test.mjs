// A name field counts what the keyboard counts: bytes of UTF-8, not characters.
import assert from "node:assert/strict";
import test from "node:test";
import {NAME_MAX_BYTES, nameBytes, nameCount} from "../webview/view/names.mjs";

test("a name is counted in bytes, so accented letters and emoji take more than one", () => {
    assert.equal(nameBytes("Layer"), 5);
    assert.equal(nameBytes("Ébène"), 7);
    assert.equal(nameBytes("😀"), 4);
    assert.equal(nameBytes(undefined), 0);
});

test("the counter marks a name past the limit, and the limit is the keyboard's", () => {
    assert.deepEqual(nameCount("a".repeat(NAME_MAX_BYTES)), {used: 32, max: 32, over: false, label: "32 / 32 bytes"});
    assert.equal(nameCount("é".repeat(17)).over, true, "17 two-byte letters are 34 bytes");
    assert.equal(nameCount("abc", 2).over, true);
});
