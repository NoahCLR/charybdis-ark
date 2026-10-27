import assert from "node:assert/strict";
import test from "node:test";
import {buildLine, copyTitle, deleteRecovery, useRecovery, chooseKeyboard, forgetKeyboard, commitUrl, downloadRecovery, githubMark, shellOf, otherTheme, savedWhen, setTheme, themeLabel} from "../../webview/view/shell-panel.mjs";

test("before its first model the panel offers no picker yet, a theme and an empty Backups list", () => {
    assert.deepEqual(shellOf(undefined), {chooseKeyboard: false, blocked: null, theme: "dark", recoveries: [], build: null, progress: null, words: {}});
    const shell = shellOf({shell: {chooseKeyboard: true, theme: "light", words: {noKeyboard: "Choose keyboard."}}});
    assert.equal(shell.chooseKeyboard, true);
    assert.equal(shell.theme, "light");
    assert.equal(shell.words.noKeyboard, "Choose keyboard.");
});

test("the shell's controls post these messages", () => {
    assert.deepEqual(chooseKeyboard(), {type: "chooseKeyboard"});
    assert.deepEqual(forgetKeyboard(), {type: "forgetKeyboard"});
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
    assert.match(savedWhen("2026-10-06T09:14:03.512Z"), /^6 Oct 2026, \d\d:\d\d$/, "British dates");
    assert.deepEqual(useRecovery(2), {type: "useRecovery", id: 2});
    assert.deepEqual(deleteRecovery(2), {type: "deleteRecovery", id: 2});
});

test("a recovery copy is named by what made it and the keyboard it came from", () => {
    const savedAt = "2026-10-18T07:12:00Z";
    // A whole-profile save (the keyboard's Apply) and a live Save are both
    // Save to a person (D-L72); the titles tell which one the copy came before.
    const titles = {apply: "Before saving a draft", restore: "Before restoring a backup", save: "Before saving live edits", restart: "Before Restart", "leave-live": "Before leaving Live edit"};
    for (const [cause, words] of Object.entries(titles)) {
        assert.match(copyTitle({cause, keyboard: "Charybdis - Home", savedAt}), new RegExp(`^${words} · Charybdis - Home · 18 Oct 2026, \\d\\d:\\d\\d$`), cause);
    }
    assert.match(copyTitle({cause: "save", keyboard: "", savedAt}), /^Before saving live edits · 18 Oct 2026, \d\d:\d\d$/, "no keyboard name, none shown");
});

test("a copy stored before causes were recorded has a neutral title", () => {
    const savedAt = "2026-10-18T07:12:00Z";
    assert.match(copyTitle({savedAt}), /^Recovery copy · 18 Oct 2026, \d\d:\d\d$/);
    assert.match(copyTitle({cause: "unknown", keyboard: "Elsewhere", savedAt}), /^Recovery copy · 18 Oct 2026, \d\d:\d\d$/, "a cause this Ark has no words for");
    for (const words of [copyTitle({savedAt}), copyTitle({cause: "apply", keyboard: "K", savedAt})]) assert.doesNotMatch(words, /Before Apply copy|recovery file|safety backup/i);
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
