// @ts-check
"use strict";
const {test, expect} = require("@playwright/test");

// Shortcuts are written as this computer presses them (view/shortcuts.mjs):
// ⌘ on a Mac, Ctrl elsewhere, in the visible text and in every tip.
/** @param {import("@playwright/test").Page} page */
const shownWords = (page) => page.evaluate(() => [document.body.innerText,
    ...[...document.querySelectorAll("[data-tip], [title], [aria-keyshortcuts]")].flatMap((node) =>
        ["data-tip", "title", "aria-keyshortcuts"].map((name) => node.getAttribute(name) || ""))].join("\n"));

for (const [platform, mac] of [["Win32", false], ["Linux x86_64", false], ["MacIntel", true]]) {
    for (const shell of ["demo-edited", "live", "live-auto"]) test(`shortcuts read as ${mac ? "⌘" : "Ctrl"} on ${platform} (${shell})`, async ({page}) => {
        await page.addInitScript((name) => Object.defineProperty(Navigator.prototype, "platform", {get: () => name}), platform);
        await page.goto(`/preview/index.html?shell=${shell}`);
        await page.locator('[data-screen="keys"]').click();
        await page.locator("[data-key]").first().click();
        await page.locator('.commit [data-act="review"]').first().click();
        await expect(page.locator(".sheet")).toBeVisible();
        const words = await shownWords(page);
        expect(words).toContain(mac ? "⌘Z" : "Ctrl+Z");
        if (mac) expect(words).toContain("Meta+Z");
        else {
            expect(words).not.toContain("⌘");
            expect(words).not.toContain("⇧");
            expect(words).toContain("Control+Z");
        }
    });
}

test("the board's Shortcuts list names the shortcuts this computer uses", async ({page}) => {
    await page.addInitScript(() => Object.defineProperty(Navigator.prototype, "platform", {get: () => "Win32"}));
    await page.goto("/preview/index.html");
    await page.locator('[data-screen="keys"]').click();
    await page.locator("[data-key]").first().click();
    await page.getByRole("button", {name: "Shortcuts"}).click();
    const list = page.locator("#board-shortcuts");
    await expect(list).toContainText("Ctrl+C, Ctrl+V");
    await expect(list).toContainText("Copy a key, paste it onto the selected one");
    await expect(list).toContainText("Ctrl+Z, Ctrl+Shift+Z");
    expect(await shownWords(page)).not.toContain("⌘");
});

// The legend keeps the marks on one line; what the board takes from the mouse
// and the keys waits behind Shortcuts, which Escape or a press outside closes.
test("the board's Shortcuts list opens from its button and Escape closes it, focus back on the button", async ({page}) => {
    await page.goto("/preview/index.html");
    await page.locator('[data-screen="keys"]').click();
    const button = page.getByRole("button", {name: "Shortcuts"});
    const list = page.locator("#board-shortcuts");
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await expect(list).toHaveCount(0);
    await expect(page.locator(".board-legend")).not.toContainText("Double-click");

    await button.focus();
    await page.keyboard.press("Enter");
    await expect(button).toHaveAttribute("aria-expanded", "true");
    await expect(button).toHaveAttribute("aria-controls", "board-shortcuts");
    await expect(list).toBeVisible();
    await expect(list).toContainText("Double-click");
    await expect(list).toContainText("Swap the two keys");
    await expect(list).toContainText("Make the selected key transparent");

    await page.keyboard.press("Escape");
    await expect(list).toHaveCount(0);
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await expect(button).toBeFocused();

    // A press anywhere else closes it too, and still lands where it was.
    await button.click();
    await expect(list).toBeVisible();
    await page.locator("[data-key]").nth(2).click();
    await expect(list).toHaveCount(0);
    await expect(page.locator("[data-key]").nth(2)).toHaveClass(/\bsel\b/);
});

test("while the board takes no edit, the Shortcuts list says only selecting and copying", async ({page}) => {
    await page.goto("/preview/index.html?shell=live-held");
    await page.locator('[data-screen="keys"]').click();
    await page.getByRole("button", {name: "Shortcuts"}).click();
    const list = page.locator("#board-shortcuts");
    await expect(list).toContainText("Select a key to read it");
    await expect(list).toContainText("Copy the selected key");
    await expect(list).not.toContainText("Double-click");
    await expect(list).not.toContainText("transparent");
});
