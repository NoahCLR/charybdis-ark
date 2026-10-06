import assert from "node:assert/strict";
import test from "node:test";
import {buildLine, chooseKeyboard, downloadRecovery, hostOf, otherTheme, savedWhen, setTheme, themeLabel} from "../webview/view/host.mjs";

test("a model without a host description offers nothing extra", () => {
    assert.deepEqual(hostOf(undefined), {chooseKeyboard: false, blocked: null, theme: null, recoveries: null, build: null, progress: null, words: {}});
    const host = hostOf({host: {chooseKeyboard: true, theme: "dark", words: {noKeyboard: "Choose keyboard."}}});
    assert.equal(host.chooseKeyboard, true);
    assert.equal(host.words.noKeyboard, "Choose keyboard.");
});

test("the host's controls post these messages", () => {
    assert.deepEqual(chooseKeyboard(), {type: "chooseKeyboard"});
    assert.deepEqual(setTheme("light"), {type: "setTheme", theme: "light"});
    assert.deepEqual(downloadRecovery(3), {type: "downloadRecovery", id: 3});
});

test("the toggle names the theme it switches to", () => {
    assert.equal(otherTheme("dark"), "light");
    assert.equal(otherTheme("light"), "dark");
    assert.equal(themeLabel("dark"), "Switch to light theme");
});

test("the build and a copy's time read as words", () => {
    assert.equal(buildLine({version: "2026.10.5+1", commit: "47eae264eab0"}), "Ark 2026.10.5+1 · 47eae264eab0");
    assert.equal(buildLine(null), "");
    assert.equal(savedWhen("not a date"), "not a date");
    assert.ok(savedWhen("2026-10-06T09:14:03.512Z").length > 0);
});
