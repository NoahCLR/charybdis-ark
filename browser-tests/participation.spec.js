"use strict";
const {test, expect} = require("@playwright/test");

test("participation controls post placements, shared definitions and master/source-layer settings", async ({page}) => {
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("/preview/index.html");
    await page.locator('[data-screen="keys"]').click();
    const clear = () => page.evaluate(() => {window.__posted.length = 0;});
    const posted = () => page.evaluate(() => window.__posted);
    await clear();
    await page.getByText('Use behaviour', {exact: true}).click();
    await expect.poll(posted).toEqual([expect.objectContaining({type: "updatePlacementPolicy", layer: 0, layoutIndex: 0, useBehavior: false, joinCombos: true})]);
    await clear();
    await page.getByText('Join combos', {exact: true}).click();
    await expect.poll(posted).toEqual([expect.objectContaining({type: "updatePlacementPolicy", useBehavior: false, joinCombos: false})]);

    await page.locator('[data-tab="behaviours"]').click();
    await clear();
    await page.getByText('Definition enabled', {exact: true}).click();
    await expect.poll(posted).toEqual([expect.objectContaining({type: "saveBehavior", behavior: expect.objectContaining({enabled: false, allowedLayers: 65535})})]);
    await page.getByText("Allowed source layers", {exact: true}).click();
    await clear();
    await page.locator('label').filter({has: page.locator('[data-allowed-layer="15"]')}).click();
    await expect.poll(posted).toEqual([expect.objectContaining({type: "saveBehavior", behavior: expect.objectContaining({enabled: false, allowedLayers: 32767})})]);

    await page.locator('[data-tab="combos"]').click();
    await page.getByRole("button", {name: "New combo", exact: true}).click();
    await page.getByText('Definition enabled', {exact: true}).click();
    await page.getByText("Allowed source layers", {exact: true}).click();
    await page.locator('label').filter({has: page.locator('[data-allowed-layer="15"]')}).click();
    await page.locator('[data-output]').fill("KC_A");
    await page.locator('[data-act="pickboard"]').click();
    await page.locator('.board-card [data-key="1"]').click();
    await page.locator('.board-card [data-key="2"]').click();
    await clear();
    await page.locator('[data-act="keep"]').click();
    await expect.poll(posted).toEqual([expect.objectContaining({type: "addCombo", output: "KC_A", inputs: expect.any(Array), enabled: false, allowedLayers: 32767})]);
    expect((await posted())[0].inputs).toHaveLength(2);

    await page.locator('[data-screen="settings"]').click();
    for (const [macro, sectionId] of [["behaviorsEnabled", "behaviorSettings"], ["behaviorsOnLayer15", "behaviorSettings"], ["combosEnabled", "comboSettings"], ["combosOnLayer15", "comboSettings"]]) {
        await clear();
        await page.locator("label").filter({has: page.locator(`[data-macro="${macro}"]`)}).click();
        await expect.poll(posted).toEqual([expect.objectContaining({type: "updateConfigDefaults", sectionId, fields: expect.arrayContaining([{macro, enabled: false}])})]);
    }
    expect(errors).toEqual([]);
});

test("a transparent late-layer key explains its source and opens that placement", async ({page}) => {
    await page.goto("/preview/index.html");
    await page.locator('[data-screen="keys"]').click();
    await page.evaluate(async () => {
        const store = await import("/webview/store.mjs");
        const model = structuredClone(store.getModel());
        const key = model.layers[15].positions[0];
        Object.assign(key, {keycode: "KC_TRNS", semantic: "KC_TRNS", value: 1, display: "Transparent"});
        store.setModel(model); store.showLayer(15); store.render();
    });
    await expect(page.locator('[data-source-layer]')).toBeVisible();
    await expect(page.locator('.bench-body')).toContainText("This transparent key inherits its permissions");
    await expect(page.locator('[data-use-behavior]')).toHaveCount(0);
    await page.locator('[data-source-layer]').click();
    await expect(page.locator('[data-use-behavior]')).toBeEnabled();
    await page.evaluate(() => {window.__posted.length = 0;});
    await page.getByText('Use behaviour', {exact: true}).click();
    await expect.poll(() => page.evaluate(() => window.__posted)).toEqual([expect.objectContaining({type: "updatePlacementPolicy", layer: 0, layoutIndex: 0})]);
});
