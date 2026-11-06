// @ts-check
"use strict";
const {test, expect} = require("@playwright/test");
const {openPreview} = require("./shell-page");

// A control's tip says what it will do. Once pressed it is doing it, so the
// tip stays away until the pointer has left the control and come back, even
// though the press redraws the control under the pointer.
test("a pressed control's tip stays away until the pointer leaves and returns", async ({page}) => {
    await page.setViewportSize({width: 1440, height: 900});
    await openPreview(page);
    const empties = page.locator(".layerbar-wrap > .layer-empties");
    const tip = page.locator(".tip");
    await empties.hover();
    await expect(tip).toBeVisible();
    await expect(tip).toContainText("Show");
    const box = await empties.boundingBox();
    if (!box) throw new Error("no empties button");
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(empties).toHaveAttribute("aria-expanded", "true");
    await expect(tip).toBeHidden();
    // Still over the redrawn control: nothing.
    await page.mouse.move(box.x + box.width / 2 + 3, box.y + box.height / 2 + 1);
    await page.waitForTimeout(500);
    await expect(tip).toBeHidden();
    // Away and back: its tip, for what it does now.
    await page.locator(".board").hover({position: {x: 20, y: 20}});
    await empties.hover();
    await expect(tip).toBeVisible();
    await expect(tip).toContainText("Hide");
});
