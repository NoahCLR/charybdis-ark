// @ts-check
"use strict";
const {test, expect} = require("@playwright/test");
const {openControls, posted, expectPost} = require("./control-preview");

for (const theme of ["plain", "vscode-light", "vscode-dark"]) {
    test(`combo output permissions post from both controls (${theme})`, async ({page}) => {
        await openControls(page, "settings", {settingsOpen: ["comboSettings"]}, theme);
        const global = page.locator('label:has([data-f="setting:comboOutputBehaviors"])');
        await global.click();
        await expect.poll(() => posted(page)).toEqual([expect.objectContaining({
            type: "updateConfigDefaults", sectionId: "comboSettings",
            fields: expect.arrayContaining([{macro: "comboOutputBehaviors", enabled: false}]),
        })]);
        await openControls(page, "keys", {tab: "combos"}, theme);
        await page.evaluate(async () => {
            const store = await import("/webview/store.mjs");
            const combo = {id: 0, inputs: ["KC_D", "KC_F"], output: "KC_ESCAPE", termMs: 45,
                followsDefault: false, mustHold: false, mustTap: true, ordered: true, enabled: true,
                useOutputBehavior: true, allowedLayers: 3};
            const model = structuredClone(store.getModel()); model.combos = [combo];
            store.setModel(model); store.openComboBuilder(combo); store.render();
        });
        await page.locator('label:has([data-output-behavior])').click();
        expect(await posted(page)).toEqual([], "the builder waits for Keep");
        await page.locator('.combo-builder [data-act="keep"]').click();
        await expectPost(page, {type: "saveCombo", id: 0, useOutputBehavior: false,
            inputs: ["KC_D", "KC_F"], output: "KC_ESCAPE", termMs: "45", followsDefault: false,
            mustHold: false, mustTap: true, ordered: true, enabled: true, allowedLayers: 3});
    });
}

test("older firmware exposes a disabled per-combo switch and no editable global switch", async ({page}) => {
    await openControls(page, "settings", {settingsOpen: ["comboSettings"]});
    await page.evaluate(async () => {
        const store = await import("/webview/store.mjs");
        const model = structuredClone(store.getModel());
        model.participation.comboOutputBehaviorsSupported = false;
        model.configDefaults.find(section => section.id === "comboSettings").fields
            .find(field => field.macro === "comboOutputBehaviors").readOnly = true;
        store.setModel(model); store.render();
    });
    await expect(page.locator('[data-f="setting:comboOutputBehaviors"]')).toHaveCount(0);
    await page.locator('[data-screen="keys"]').click();
    await page.locator('[data-tab="combos"]').click();
    await page.getByRole("button", {name: "New combo", exact: true}).click();
    await expect(page.locator('[data-output-behavior]')).toBeDisabled();
    expect(await posted(page)).toEqual([]);
});
