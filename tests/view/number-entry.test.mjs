import assert from "node:assert/strict";
import test from "node:test";

import {numberText} from "../../webview/lib/number-entry.mjs";

test("a whole-number field keeps only its digits", () => {
    assert.equal(numberText("200", false), "200");
    assert.equal(numberText("2a0b0", false), "200");
    assert.equal(numberText("abc", false), "");
    assert.equal(numberText(" 1,500 ms", false), "1500");
    assert.equal(numberText("-12", false), "12");
    assert.equal(numberText("1e5", false), "15");
    assert.equal(numberText("1.5", false), "15");
    assert.equal(numberText("", false), "");
});

test("a decimal field also keeps its first point", () => {
    assert.equal(numberText("1.5", true), "1.5");
    assert.equal(numberText(".5", true), ".5");
    assert.equal(numberText("1.5.0", true), "1.50");
    assert.equal(numberText("1.x5s", true), "1.5");
    assert.equal(numberText("one", true), "");
});

test("the text before the caret keeps the caret where it was", () => {
    // Typing "x" after "12" in "12x34": the kept prefix is two characters.
    const value = "12x34";
    assert.equal(numberText(value.slice(0, 3), false).length, 2);
    assert.equal(numberText(value, false), "1234");
});
