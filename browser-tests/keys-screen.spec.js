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

test("the Key tab's keycode field stages a key it can store and keeps one it cannot, with the reason", async ({page}) => {
    await openControls(page, "keys", {tab: "key", selected: 0});
    const field = page.locator("#keycodeField");
    await clearPosts(page);
    await change(field, "NOT_A_KEY");
    await expect(page.locator(".key-field-error")).toContainText("not a key this keyboard can store");
    await expect(field).toHaveValue("NOT_A_KEY");
    expect(await page.evaluate(() => window.__posted.length)).toBe(0);
    await change(field, "KC_B");
    await expectPost(page, {type: "updateLayoutKeys", layer: "Layer 0", changes: [{layoutIndex: 0, keycode: "KC_B"}]});
});

test("Add a hold… opens the picker with its Hold slot open; Change key… opens it plain", async ({page}) => {
    await openControls(page, "keys", {tab: "key", selected: 0});
    await page.locator('.key-tab [data-act="hold"]').click();
    await expect(page.getByRole("dialog", {name: "Choose a key"})).toBeVisible();
    expect(await page.evaluate(async () => (await import("/webview/store.mjs")).state.picker?.holdMenu)).toBe("root");
    await openControls(page, "keys", {tab: "key", selected: 0});
    await page.locator('.key-tab [data-act="pick"]').click();
    await expect(page.getByRole("dialog", {name: "Choose a key"})).toBeVisible();
    expect(await page.evaluate(async () => (await import("/webview/store.mjs")).state.picker?.holdMenu)).toBe(null);
});

test("the Key tab's rows go to the behaviour and combos they name", async ({page}) => {
    await openControls(page, "keys", {tab: "key", selected: 0});
    await page.locator('.key-tab [data-goto="behaviours"]').click();
    await expect(page.locator('[data-tab="behaviours"]')).toHaveAttribute("aria-selected", "true");
    await page.locator('[data-tab="key"]').click();
    await page.locator('.key-tab [data-goto="combos"]').click();
    await expect(page.locator('[data-tab="combos"]')).toHaveAttribute("aria-selected", "true");
    await expect(page.locator('[data-tab="key"] .c')).toHaveCount(0);
});
