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

test("the board legend names the shortcuts this computer uses", async ({page}) => {
    await page.addInitScript(() => Object.defineProperty(Navigator.prototype, "platform", {get: () => "Win32"}));
    await page.goto("/preview/index.html");
    await page.locator('[data-screen="keys"]').click();
    await page.locator("[data-key]").first().click();
    await expect(page.locator(".legend-item.dim")).toContainText("Ctrl+C and Ctrl+V copy between keys");
    expect(await shownWords(page)).not.toContain("⌘");
});
