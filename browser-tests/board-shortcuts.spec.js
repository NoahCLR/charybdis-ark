"use strict";
const {test, expect} = require("@playwright/test");

// A browser extension that makes Backspace go back (Google's "Go Back With
// Backspace" among them) listens on the window from before the page loads,
// and leaves alone a key the page has already handled. Ark has to have
// handled it by then, or deleting a key also leaves Ark.
test("Backspace on a selected key is handled before a listener registered ahead of Ark sees it", async ({page}) => {
    await page.addInitScript(() => {
        window.__extensionSaw = [];
        addEventListener("keydown", (event) => {
            if (event.key === "Backspace") window.__extensionSaw.push({defaultPrevented: event.defaultPrevented});
        });
    });
    await page.goto("/preview/index.html");
    await page.locator('[data-screen="keys"]').click();
    const key = page.locator("[data-key]").first();
    await key.click();
    await expect(key).toHaveClass(/sel/);
    await page.evaluate(() => {window.__posted.length = 0;});
    await page.keyboard.press("Backspace");
    await expect.poll(() => page.evaluate(() => window.__posted)).toEqual([
        expect.objectContaining({type: "updateLayoutKeys", changes: [expect.objectContaining({keycode: "KC_TRANSPARENT"})]}),
    ]);
    expect(await page.evaluate(() => window.__extensionSaw)).toEqual([]);
});
