// @ts-check
"use strict";
const {test, expect} = require("@playwright/test");

test("every registered screen opens from the rail with its own title and keeps the authored groups", async ({page}) => {
    await page.goto("/preview/index.html");
    await expect(page.locator('[data-screen="keys"]')).toBeEnabled();
    const screens = await page.evaluate(async () => {
        const {SCREENS} = await import("/webview/view/screens.mjs");
        return Object.entries(SCREENS).map(([id, definition]) => ({id, label: definition.label}));
    });
    await expect(page.locator(".rail-group")).toHaveText(["Configure", "Settings", "Keyboard"]);
    await expect(page.locator(".rail [data-screen]")).toHaveCount(screens.length);
    const heights = new Set();
    for (const {id, label} of screens) {
        const button = page.locator(`.rail [data-screen="${id}"]`);
        await expect(button).toHaveText(label);
        await button.click();
        await expect(button).toHaveAttribute("aria-current", "true");
        // Keyboard's title is the keyboard's own name, renamed in place.
        if (id === "device") await expect(page.locator('.main > .topbar [data-f="keyboard:name"]')).toHaveCount(1);
        else await expect(page.locator(".main > .topbar h1")).toHaveText(label);
        await expect(page.locator(".read-placeholder")).toHaveCount(0);
        // Every header is as tall as every other, so nothing below it jumps
        // between screens; the Keyboard screen's renamable title included.
        heights.add(await page.locator(".main > .topbar").evaluate((node) => node.getBoundingClientRect().height));
    }
    await page.locator('.main > .topbar [data-f="keyboard:name"]').focus();
    heights.add(await page.locator(".main > .topbar").evaluate((node) => node.getBoundingClientRect().height));
    expect([...heights]).toHaveLength(1);
});

test("a screen waiting for a keyboard is titled as the rail item it highlights", async ({page}) => {
    await page.goto("/preview/index.html?shell=none");
    await expect(page.locator(".read-placeholder")).toBeVisible();
    const current = page.locator('.rail [data-screen][aria-current="true"]');
    await expect(page.locator(".main > .topbar h1")).toHaveText(await current.innerText());
});

test("an unknown screen shows an unavailable surface and recovers through a known rail choice", async ({page}) => {
    await page.goto("/preview/index.html");
    await expect(page.locator('[data-screen="keys"]')).toBeEnabled();
    await page.evaluate(async () => {
        const store = await import("/webview/store.mjs");
        store.state.screen = "unknown-screen";
        store.render();
    });
    await expect(page.locator(".read-placeholder h2")).toHaveText("Screen unavailable");
    await expect(page.locator(".main .board")).toHaveCount(0);
    await page.locator('[data-screen="lighting"]').click();
    await expect(page.locator(".main > .topbar h1")).toHaveText("Lighting");
});
