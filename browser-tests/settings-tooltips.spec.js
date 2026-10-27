// @ts-check
"use strict";
const {test, expect} = require("@playwright/test");
const {openControls} = require("./control-preview");

const SAMPLE = {behaviours: "setting:tapHoldTerm", combos: "settings:combo:default", pointer: "setting:normalDpi", host: "setting:hostLayout"};
for (const [screen, identity] of Object.entries(SAMPLE)) {
    test(`every ${screen} setting has hover help`, async ({page}) => {
        await openControls(page, screen);
        const missing = await page.locator(".setrow").evaluateAll(rows => rows.filter(row => !row.getAttribute("data-tip")?.trim()).map(row => row.textContent));
        expect(missing).toEqual([]);
        const field = page.locator(`[data-f="${identity}"]`);
        const tip = await field.locator("xpath=ancestor::*[@data-tip][1]").getAttribute("data-tip");
        await field.hover();
        await expect(page.locator(".tip")).toBeVisible();
        await expect(page.locator(".tip")).toHaveText(tip);
    });
}

test("read-only settings retain explanations on hover", async ({page}) => {
    await openControls(page, "pointer");
    await page.evaluate(async () => {
        const store = await import("/webview/store.mjs");
        const model = structuredClone(store.getModel());
        model.configDefaults.find(section => section.id === "normalPointerSpeed").fields[0].readOnly = true;
        store.setModel(model); store.render();
    });
    const chip = page.locator('[data-section="normalPointerSpeed"] .chip').first();
    await chip.hover();
    await expect(page.locator(".tip")).toContainText("Trackball sensitivity");
    await expect(page.locator(".tip")).toContainText("cannot be edited");
});
