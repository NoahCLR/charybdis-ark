import assert from "node:assert/strict";
import test from "node:test";
import {fitsLine} from "../../webview/view/backups.mjs";

test("a file within the keyboard's memory fits, up to and at capacity", () => {
    assert.deepEqual(fitsLine({used: 5408, capacity: 130048}), {text: "This file fits: 5,408 of 130,048 bytes", warn: false});
    assert.deepEqual(fitsLine({used: 130048, capacity: 130048}), {text: "This file fits: 130,048 of 130,048 bytes", warn: false});
});

test("a file larger than the keyboard's memory says it does not fit, as a warning", () => {
    const line = fitsLine({used: 140000, capacity: 130048});
    assert.deepEqual(line, {text: "This file does not fit: 140,000 bytes, and this keyboard holds 130,048.", warn: true});
    assert.doesNotMatch(line.text, /fits:/);
});
