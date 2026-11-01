// @ts-check
"use strict";
const {test, expect} = require("@playwright/test");
const {openControls, posted} = require("./control-preview");

// The same kind of control looks and behaves the same on every screen
// (docs/spec/interface-contracts.md, Shared controls).

test("an editor opened in place closes on Escape and gives the focus back to what opened it", async ({page}) => {
    // A behaviour cell, on Custom keys: Done or Escape.
    await openControls(page, "customKeys");
    const cell = page.locator('.custom-key-behaviour .bcell[data-cell="0-tap"]');
    await cell.click();
    const editor = page.locator(".cell-editor");
    await expect(editor.locator('[data-act="done"]')).toHaveText("Done");
    await editor.locator("[data-action]").focus();
    await page.keyboard.press("Escape");
    await expect(editor).toHaveCount(0);
    await expect(cell).toBeFocused();
    await cell.click();
    await editor.locator('[data-act="done"]').click();
    await expect(editor).toHaveCount(0);
    await expect(cell).toBeFocused();

    // A macro step: its editor opens on a new step; Escape from its field.
    await openControls(page, "macros", {macroSlot: "MACRO_17"});
    await page.locator('[data-insert-kind="delay"]').click();
    const delay = page.locator("[data-step-delay]");
    await expect(delay).toBeVisible();
    await expect(page.locator(".macro-step .affix.unit i")).toHaveText("ms");
    await delay.focus();
    await page.keyboard.press("Escape");
    await expect(delay).toBeHidden();
    await expect(page.locator('[data-step-id]').first()).toBeFocused();

    // The combo builder keeps its own form until Keep, so it closes by Cancel;
    // Escape cancels it too, back to New combo.
    await openControls(page, "keys", {tab: "combos"});
    const add = page.locator('[data-act="new-combo"]');
    await add.click();
    const builder = page.locator(".combo-builder");
    await expect(add, "New combo never doubles as the builder's close").toBeDisabled();
    await builder.locator("[data-output]").focus();
    await page.keyboard.press("Escape");
    await expect(builder).toHaveCount(0);
    await expect(add).toBeFocused();
    expect(await posted(page)).toEqual([]);
});

test("a question's foot ends with the way back, then the primary action, and a destructive choice last", async ({page}) => {
    await page.goto("/preview/index.html?shell=demo-edited");
    await page.locator('.demo-banner [data-act="leave-demo"]').click();
    const foot = page.locator(".sheet.leave-demo .sheet-f .right > button");
    await expect(foot).toHaveText(["Stay in the demo", "Export profile…", /Leave/]);
    await expect(foot.first()).toHaveClass(/ghost/);
    await expect(foot.nth(1)).toHaveClass(/primary/);
});

test("a slot bank opens on the slots in use, makes a new one in the first free slot and folds the rest", async ({page}) => {
    await openControls(page, "customKeys");
    const bank = page.locator(".pad.library .macro-grid");
    // The preview's keys 0 to 3 hold behaviours; the other 124 fold.
    await expect(bank.locator("[data-custom-key]")).toHaveCount(4);
    await expect(bank.locator("[data-custom-key]").first()).toContainText("behaviour");
    const all = bank.locator('[data-all-slots="customKeys"]');
    await expect(all).toHaveText("Show all 128 slots");
    await expect(all).toHaveAttribute("aria-expanded", "false");

    // New opens the first free key with its name ready to type, and keeps it
    // shown while it is open.
    await bank.locator('[data-act="new-slot"]').click();
    await expect(bank.locator('[data-custom-key="CUSTOM_KEY_4"]')).toHaveAttribute("aria-current", "true");
    await expect(page.locator('[data-f="custom-key:4:name"]')).toBeFocused();
    await expect(bank.locator("[data-custom-key]")).toHaveCount(5);

    // Show all draws the rest after it, in slot order, so nothing shown moves.
    const before = await bank.locator('[data-custom-key="CUSTOM_KEY_2"]').boundingBox();
    await all.click();
    await expect(all).toHaveAttribute("aria-expanded", "true");
    await expect(all).toBeFocused();
    await expect(bank.locator("[data-custom-key]")).toHaveCount(128);
    expect(await bank.locator('[data-custom-key="CUSTOM_KEY_2"]').boundingBox()).toEqual(before);
    const order = await bank.locator("[data-all-slots] ~ [data-custom-key]").evaluateAll((tiles) => tiles.map((tile) => tile.getAttribute("data-custom-key")));
    expect(order.slice(0, 2)).toEqual(["CUSTOM_KEY_5", "CUSTOM_KEY_6"]);

    // A search looks through every slot, used or not.
    await all.click();
    await page.locator("#customKeySearch").fill("100");
    await expect(bank.locator("[data-custom-key]")).toHaveCount(1);
    await expect(bank.locator('[data-custom-key="CUSTOM_KEY_100"]')).toBeVisible();
    await expect(bank.locator("[data-all-slots]")).toHaveCount(0);

    // Macros: none in use in the preview, so the bank opens on the one open
    // in the editor, New and the disclosure.
    await openControls(page, "macros");
    const macros = page.locator(".macros-library .macro-grid");
    await expect(macros.locator("[data-slot]")).toHaveCount(1);
    await expect(macros.locator('[data-act="new-slot"]')).toHaveText("+ New macro");
    await expect(macros.locator('[data-all-slots="macros"]')).toHaveText("Show all 128 slots");
});

test("a number field is as wide as the values it takes, never as wide as its column", async ({page}) => {
    await page.setViewportSize({width: 1920, height: 1000});
    for (const [screen, state] of [["pointing", {pointingSlot: 0, pdAdvanced: true}], ["pointing", {pointingSlot: 4, pdAdvanced: true}], ["behaviours", {}], ["lighting", {stage: "key"}]]) {
        await openControls(page, screen, state);
        const widths = await page.locator("input.num:visible").evaluateAll(nodes => nodes.map(node => [node.getAttribute("data-f"), Math.round(node.getBoundingClientRect().width)]));
        expect(widths.length, `${screen} has number fields`).toBeGreaterThan(0);
        // Five digits and a unit, or a unit and its distance (≈ 2.5 mm), at most.
        for (const [f, width] of widths) expect(width, f).toBeLessThanOrEqual(160);
    }
    // Every number field on a screen carries the class that sizes it.
    expect(await page.locator('input[inputmode="numeric"]:not(.num), input[inputmode="decimal"]:not(.num)').count()).toBe(0);
});

test("a slot bank and its editor stop at 1320 px on a wide window, as Settings stops at 980 px", async ({page}) => {
    await page.setViewportSize({width: 2200, height: 1000});
    for (const screen of ["macros", "customKeys", "pointing"]) {
        await openControls(page, screen);
        const width = await page.locator(".pad.library").evaluate(node => node.getBoundingClientRect().width);
        expect(width, screen).toBeLessThanOrEqual(1320);
    }
});
