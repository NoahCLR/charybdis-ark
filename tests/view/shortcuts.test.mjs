import assert from "node:assert/strict";
import test from "node:test";
import {readdirSync, readFileSync} from "node:fs";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {ariaShortcut, modifierKey, shortcut} from "../../webview/view/shortcuts.mjs";

test("shortcuts are written with ⌘ on a Mac and Ctrl elsewhere", () => {
    for (const platform of ["MacIntel", "iPad"]) {
        assert.equal(modifierKey(platform), "⌘");
        assert.equal(shortcut("Z", {platform}), "⌘Z");
        assert.equal(shortcut("Z", {shift: true, platform}), "⇧⌘Z");
    }
    for (const platform of ["Win32", "Linux x86_64", ""]) {
        assert.equal(modifierKey(platform), "Ctrl");
        assert.equal(shortcut("C", {platform}), "Ctrl+C");
        assert.equal(shortcut("Z", {shift: true, platform}), "Ctrl+Shift+Z");
    }
});

test("assistive technology is told the same shortcut", () => {
    assert.equal(ariaShortcut("Z", {platform: "MacIntel"}), "Meta+Z");
    assert.equal(ariaShortcut("Z", {shift: true, platform: "MacIntel"}), "Meta+Shift+Z");
    assert.equal(ariaShortcut("Z", {shift: true, platform: "Win32"}), "Control+Shift+Z");
});

// Every surface takes its shortcut words from view/shortcuts.mjs: a ⌘ or ⇧
// written into a screen (the hover card, the board legend, the Change key
// sheet, the rail's Undo and Redo, Discard all, Revert) would show on a
// computer that presses Ctrl. Comments may still name them.
test("no screen writes ⌘ or ⇧ itself", () => {
    const root = fileURLToPath(new URL("../../webview/", import.meta.url));
    const found = [];
    /** @param {string} directory */
    const visit = (directory) => {
        for (const entry of readdirSync(directory, {withFileTypes: true})) {
            const path = join(directory, entry.name);
            if (entry.isDirectory()) visit(path);
            else if (entry.name.endsWith(".mjs") && entry.name !== "shortcuts.mjs") {
                readFileSync(path, "utf8").split("\n").forEach((line, index) => {
                    const code = line.replace(/\/\/.*$/, "").replace(/^\s*\*.*$/, "");
                    if (/[⌘⇧]/.test(code)) found.push(`${path.slice(root.length)}:${index + 1}`);
                });
            }
        }
    };
    visit(root);
    assert.deepEqual(found, []);
});
