"use strict";
const {test, expect} = require("@playwright/test");

for (const withCombo of [false, true]) {
    test(`first Macros click skips redundant layer combinations ${withCombo ? "with a combo" : "without combos"}`, async ({page}) => {
        await page.goto("/preview/index.html");
        await expect(page.locator('[data-screen="macros"]')).toBeEnabled();
        await page.evaluate(async withCombo => {
            const store = await import("/webview/store.mjs");
            const model = store.getModel();
            window.__layerReads = 0;
            const layers = model.layers.map(layer => ({...layer, get positions() {
                window.__layerReads++;
                return layer.positions;
            }}));
            store.setModel({...model, layers, combos: withCombo
                ? [{id: 0, inputs: ["KC_D", "KC_F"], output: "VIA_MACRO_0"}] : []});
            store.render();
            window.__layerReads = 0;
            window.__posted.length = 0;
        }, withCombo);
        await page.locator('[data-screen="macros"]').click();
        await expect(page.locator('[data-macro-editor="VIA_MACRO_0"]')).toBeVisible();
        const reads = await page.evaluate(() => window.__layerReads);
        expect(reads).toBeLessThan(1000);
        expect(await page.evaluate(() => window.__posted)).toEqual([]);
    });
}
