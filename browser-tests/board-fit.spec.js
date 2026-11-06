// @ts-check
"use strict";
const {test, expect} = require("@playwright/test");

// The board fits the window's height (styles.css, .board svg), so the
// workbench tabs share the first screen with it: at 1920 × 1080 nothing has
// to scroll before the editor under the board is in reach, on Keymap and on
// Lighting alike.
for (const [screen, query] of [["Keymap", ""], ["Lighting", "?screen=lighting"]]) {
    test(`${screen}: the workbench tabs share the first screen with the board at 1920 × 1080`, async ({page}) => {
        await page.setViewportSize({width: 1920, height: 1080});
        await page.goto(`/preview/index.html${query}`);
        const tabs = page.locator(".bench-tablist");
        await expect(tabs).toBeVisible();
        const box = await tabs.boundingBox();
        expect(box, "the tab strip is laid out").not.toBeNull();
        expect((box?.y ?? 0) + (box?.height ?? 0), "the tab strip ends inside the window").toBeLessThanOrEqual(1080);
        expect(await page.locator(".content").evaluate((node) => node.scrollTop), "the page has not scrolled").toBe(0);
        // The board is still the board: its keys keep a size a pointer can aim at.
        const key = await page.locator(".kc .kc-rect").first().boundingBox();
        expect(key?.width ?? 0).toBeGreaterThan(48);
    });
}
