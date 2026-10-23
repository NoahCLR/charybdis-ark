// @ts-check
"use strict";
const {test, expect} = require("@playwright/test");

test("a disconnected web page offers Choose keyboard and a demo without Read keyboard", async ({page}) => {
    await page.goto("/preview/index.html?shell=web-none");
    await expect(page.locator('.read-actions [data-act="choose-keyboard"]')).toBeVisible();
    await expect(page.locator('.read-actions [data-act="retry"]')).toHaveCount(0);
    await expect(page.locator('.read-actions [data-act="explore-demo"]')).toBeVisible();
});

test("a connected read failure retains the retry action", async ({page}) => {
    await page.goto("/preview/index.html?shell=web");
    await page.evaluate(async () => {
        const store = await import("/webview/store.mjs");
        const model = structuredClone(store.getModel());
        model.draft = null; model.layers = [];
        model.load = {state: "unavailable"};
        store.setModel(model); store.state.screen = "keys"; store.render();
        window.__posted.length = 0;
    });
    await page.locator('.read-actions [data-act="retry"]').click();
    expect(await page.evaluate(() => window.__posted)).toEqual([{type: "refresh"}]);
});
