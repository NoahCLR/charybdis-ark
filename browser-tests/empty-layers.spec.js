// @ts-check
"use strict";
// Empty layers fold behind one disclosure at the end of every list of layers
// (D-L76). The preview's profile uses layers 0 to 7; 8 to 15 are unnamed with
// nothing on them. Folding draws less and posts nothing of its own.
const {test, expect} = require("@playwright/test");
const {openControls, clearPosts, posted} = require("./control-preview");

test("the layer bar folds the empty layers, and one revealed can be picked and edited", async ({page}) => {
    await openControls(page, "keys");
    const bar = page.locator(".layerbar-wrap");
    const toggle = bar.locator('[data-empty-layers="layer-bar"]');
    await expect(bar.locator(".layer-tab")).toHaveCount(8);
    await expect(toggle).toHaveText("8 empty layers");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(toggle.locator("svg.chev")).toHaveCount(1);
    await expect(bar.locator('[data-layer="9"]')).toHaveCount(0);

    // The keyboard opens it, and the focus stays on it across the redraw.
    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(toggle).toBeFocused();
    await expect(bar.locator(".layer-tab")).toHaveCount(16);
    expect(await bar.locator(".layer-tab").evaluateAll((tabs) => tabs.map((tab) => tab.getAttribute("data-layer"))))
        .toEqual(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"]);
    expect(await posted(page)).toEqual([]);

    await bar.locator('[data-layer="9"]').click();
    await expect(bar.locator('[data-layer="9"]')).toHaveAttribute("aria-selected", "true");
    await expect(page.locator(".bench-body")).toContainText("This key on this layer (Layer 9)");
    await clearPosts(page);
    await page.locator("#keycodeField").fill("KC_A");
    await page.locator("#keycodeField").press("Tab");
    await expect.poll(() => posted(page)).toEqual([expect.objectContaining({type: "updateLayoutKeys", layer: "Layer 9"})]);

    // Folded again, the picked layer still shows, in its place.
    await toggle.click();
    await expect(toggle).toHaveText("7 empty layers");
    expect(await bar.locator(".layer-tab").evaluateAll((tabs) => tabs.map((tab) => tab.getAttribute("data-layer"))))
        .toEqual(["0", "1", "2", "3", "4", "5", "6", "7", "9"]);
});

test("This key on every layer folds the empty layers at its end and shows them in their places", async ({page}) => {
    await openControls(page, "keys");
    const list = page.locator(".stacklist");
    await expect(list.locator(".stackrow")).toHaveCount(8);
    const toggle = list.locator('[data-empty-layers="key-stack"]');
    await expect(toggle).toHaveText("8 empty layers");
    expect(await list.locator(":scope > *").last().getAttribute("data-empty-layers")).toBe("key-stack");
    await toggle.click();
    await expect(list.locator(".stackrow")).toHaveCount(16);
    expect(await list.locator(".stackrow").evaluateAll((rows) => rows.map((row) => row.getAttribute("data-golayer"))))
        .toEqual(["15", "14", "13", "12", "11", "10", "9", "8", "7", "6", "5", "4", "3", "2", "1", "0"]);
    await expect(list.locator(":scope > *").last()).toHaveAttribute("aria-expanded", "true");
});

test("a Settings grid folds its empty layers but still saves every layer's switch", async ({page}) => {
    await openControls(page, "combos");
    const card = page.locator('[data-section="comboSettings"]');
    const grid = card.locator(".layer-grid");
    await expect(grid.locator(".sw:visible")).toHaveCount(8);
    await expect(grid.locator('[data-switch-layer="9"]')).toBeHidden();
    await expect(grid.locator('[data-empty-layers="settings:comboSettings"]')).toHaveText("8 empty layers");

    // A visible switch saves the section whole, the folded layers included.
    await grid.locator("label").filter({has: page.locator('[data-switch-layer="3"]')}).click();
    await expect.poll(() => posted(page)).toEqual([expect.objectContaining({type: "updateConfigDefaults", sectionId: "comboSettings",
        fields: expect.arrayContaining([{macro: "combosOnLayer3", enabled: false}, {macro: "combosOnLayer9", enabled: true}, {macro: "combosOnLayer15", enabled: true}])})]);

    await grid.locator('[data-empty-layers="settings:comboSettings"]').click();
    await expect(grid.locator(".sw:visible")).toHaveCount(16);
    await clearPosts(page);
    await grid.locator("label").filter({has: page.locator('[data-switch-layer="9"]')}).click();
    await expect.poll(() => posted(page)).toEqual([expect.objectContaining({type: "updateConfigDefaults", sectionId: "comboSettings",
        fields: expect.arrayContaining([{macro: "combosOnLayer9", enabled: false}])})]);

    // Combo layer matching folds the empty layers that match on their own keys.
    const matching = page.locator('[data-section="comboReferences"]');
    await expect(matching.locator(".reference-cell:visible")).toHaveCount(8);
    await expect(matching.locator(".reference-cell select")).toHaveCount(16);
    await matching.locator('[data-empty-layers="combo-matching"]').click();
    await expect(matching.locator(".reference-cell:visible")).toHaveCount(16);
});

test("Rename & reorder folds the empty layers under its list, and offers Make base on the row in use", async ({page}) => {
    await openControls(page, "keys", {layersOpen: true});
    const panel = page.locator(".layerpanel");
    await expect(panel.locator(".lp-row:visible")).toHaveCount(8);
    await expect(panel.locator('[data-row="15"]')).toBeHidden();
    const toggle = panel.locator('[data-empty-layers="layer-reorder"]');
    await expect(toggle).toHaveText("8 empty layers");
    await toggle.click();
    await expect(panel.locator(".lp-row:visible")).toHaveCount(16);
    await expect(panel.locator('[data-row="15"] [data-name]')).toBeVisible();

    // Make base shows only on the row the pointer or the focus is on.
    const makeBase = panel.locator('[data-base="3"]');
    await expect(makeBase).toHaveCSS("opacity", "0");
    await makeBase.focus();
    await expect(makeBase).toHaveCSS("opacity", "1");
    await clearPosts(page);
    await page.keyboard.press("Enter");
    await expect.poll(() => posted(page)).toEqual([expect.objectContaining({type: "editPortableLayer", id: 3, makeBase: true})]);
});

test("the Lighting list and the pointing link fold the empty layers too", async ({page}) => {
    await openControls(page, "lighting", {stage: "layers"});
    const list = page.locator('[data-scroll-list="layers"]');
    await expect(list.locator(".rowitem")).toHaveCount(8);
    await list.locator('[data-empty-layers="lighting-layers"]').click();
    await expect(list.locator(".rowitem")).toHaveCount(16);

    await page.locator('[data-screen="pointing"]').click();
    const table = page.locator(".pd-starts .layer-table");
    await expect(table.locator(".layer-table-row:not(.layer-table-head):visible")).toHaveCount(8);
    await table.locator('[data-empty-layers="pointing-link"]').click();
    await expect(table.locator(".layer-table-row:not(.layer-table-head):visible")).toHaveCount(16);
});
