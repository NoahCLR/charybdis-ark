import assert from "node:assert/strict";
import test from "node:test";
import {buildLine, chooseKeyboard, commitUrl, downloadRecovery, githubMark, hostOf, otherTheme, savedWhen, setTheme, themeLabel} from "../webview/view/host.mjs";

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

test("a build links to its commit on GitHub only when it names one", () => {
    assert.equal(commitUrl({version: "2026.10.6", commit: "c8f54c5"}), "https://github.com/NoahCLR/charybdis-ark/commit/c8f54c5");
    assert.equal(commitUrl({version: "2026.10.6", commit: "47eae264eab0"}), "https://github.com/NoahCLR/charybdis-ark/commit/47eae264eab0");
    assert.equal(commitUrl({version: "2026.10.6", commit: "c8f54c5-dirty"}), null, "uncommitted changes are not on GitHub");
    assert.equal(commitUrl({version: "2026.10.6", commit: "unknown"}), null);
    assert.equal(commitUrl({version: "2026.10.6", commit: "ci-1234"}), null);
    assert.equal(commitUrl(null), null);
    assert.match(githubMark("x"), /^<svg class="x" viewBox="0 0 16 16" aria-hidden="true"><path d="M[^"]+"\/><\/svg>$/);
});
