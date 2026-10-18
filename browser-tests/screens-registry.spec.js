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
    await expect(page.locator(".rail-group")).toHaveText(["Configure", "Manage"]);
    await expect(page.locator(".rail [data-screen]")).toHaveCount(screens.length);
    for (const {id, label} of screens) {
        const button = page.locator(`.rail [data-screen="${id}"]`);
        await expect(button).toHaveText(label);
        await button.click();
        await expect(button).toHaveAttribute("aria-current", "true");
        // Keyboard's title is the keyboard's own name, renamed in place.
        if (id === "device") await expect(page.locator('.main > .topbar [data-f="keyboard:name"]')).toHaveCount(1);
        else await expect(page.locator(".main > .topbar h1")).toHaveText(label);
        await expect(page.locator(".read-placeholder")).toHaveCount(0);
    }
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
