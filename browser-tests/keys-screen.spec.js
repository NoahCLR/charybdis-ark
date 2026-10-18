// @ts-check
"use strict";
// The Keys screen's own controls: the layer plate, the layer tabs, the Layers…
// panel's live edits, the Key tab and the board's keyboard control.
const {test, expect} = require("@playwright/test");
const {openControls, clearPosts, expectPost, change} = require("./control-preview");

test("Layers… renames a layer as its own draft edit, with no save step", async ({page}) => {
    await openControls(page, "keys", {layersOpen: true});
    await expect(page.locator('.layerpanel [data-name="2"]')).toBeVisible();
    await expect(page.locator('.layerpanel [data-act="save"]')).toHaveCount(0);
    await clearPosts(page);
    await change(page.locator('.layerpanel [data-name="2"]'), "777");
    await expectPost(page, {type: "editPortableLayer", id: 2, name: "777"});
});

test("empty layers fold into one tab whose menu shows them", async ({page}) => {
    await openControls(page, "keys");
    const fold = page.locator(".layer-empties > summary");
    await expect(fold).toHaveText(/^\+\d+ empty$/);
    await fold.click();
    const first = page.locator(".layer-empties-menu [data-layer]").first();
    const index = await first.getAttribute("data-layer");
    await first.click();
    await expect(page.locator(`.layer-tabs [data-layer="${index}"]`)).toHaveAttribute("aria-selected", "true");
    expect(await page.evaluate(() => window.__posted.length)).toBe(0);
});

test("the plate shows a layer over Base, This layer only shows it alone, and a layer can be added to the view", async ({page}) => {
    await openControls(page, "keys");
    await page.locator('.layer-tabs [data-layer="1"]').click();
    const plate = page.locator(".layer-plate");
    await expect(plate.locator(".plate-title")).toHaveText(await page.locator('.layer-tabs [data-layer="1"] span:not(.idx):not(.swatch)').first().innerText());
    await expect(plate.locator(".plate-over")).toHaveText(/^Over /);
    await expect(page.locator('.layer-tabs [data-layer="0"]')).toHaveClass(/\bon\b/);
    await plate.locator('[data-act="layer-only"]').click();
    await expect(page.locator('.layer-plate [data-act="layer-only"]')).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".layer-plate .plate-over")).toHaveText("As stored, alone");
    await expect(page.locator(".board .kc-under")).toHaveCount(0);
    await expect(page.locator('.layer-tabs [data-layer="0"]')).not.toHaveClass(/\bon\b/);
    await page.locator('.layer-plate [data-act="layer-only"]').click();
    await page.locator(".layer-plate .plate-add > summary").click();
    await page.locator(".layer-plate [data-add-layer]").first().click();
    await expect(page.locator(".layer-tabs .layer-tab.on")).not.toHaveCount(0);
    expect(await page.evaluate(() => window.__posted.length)).toBe(0);
});
