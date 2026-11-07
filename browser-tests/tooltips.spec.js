// @ts-check
"use strict";
const {test, expect} = require("@playwright/test");
const {openPreview} = require("./shell-page");
const {openControls} = require("./control-preview");

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

// A tip opens where the pointer rested, below and to the right of it, never at
// its control (D-L80): a settings row's tip once sat over the row's middle,
// far from a pointer at its end, while a button's sat just above the button.
/** @param {{x: number, y: number} | null} box @param {string} what */
const corner = (box, what) => { if (!box) throw new Error(`no ${what}`); return box; };

test("a tip opens at the pointer, not over its control, and stays while the pointer stays on it", async ({page}) => {
    await page.setViewportSize({width: 1440, height: 900});
    await openControls(page, "pointer");
    const row = page.locator(".setrow").first();
    const box = corner(await row.boundingBox(), "settings row");
    const tip = page.locator(".tip");
    // Towards the row's right end, well away from its middle, with room for
    // the tip before the window's edge (at the edge it is kept inside).
    const at = {x: Math.min(box.x + box.width - 24, 1440 - 340), y: box.y + box.height / 2};
    await page.mouse.move(at.x, at.y);
    await expect(tip).toBeVisible();
    const opened = corner(await tip.boundingBox(), "tip");
    expect(Math.abs(opened.x - (at.x + 12))).toBeLessThanOrEqual(1);
    expect(Math.abs(opened.y - (at.y + 20))).toBeLessThanOrEqual(1);
    expect(Math.abs(opened.x + opened.width / 2 - (box.x + box.width / 2))).toBeGreaterThan(100);
    // Moving along the row, crossing its label and field, leaves the tip where
    // it opened: to a point of the row itself, not of a tip nested in it.
    const far = await row.evaluate((node, y) => {
        for (let x = node.getBoundingClientRect().left + 8; x < innerWidth; x += 8) {
            if (document.elementFromPoint(x, y)?.closest("[data-tip]") === node) return x;
        }
        throw new Error("no point of the row outside a nested tip");
    }, at.y);
    expect(at.x - far).toBeGreaterThan(100);
    await page.mouse.move(far, at.y, {steps: 6});
    await page.waitForTimeout(400);
    await expect(tip).toBeVisible();
    expect(await tip.boundingBox()).toEqual(opened);
    // A small control's tip sits the same way beside the pointer (this one is
    // at the rail's foot, so its tip may be above the pointer).
    const history = page.locator(".rail-history");
    const small = corner(await history.boundingBox(), "history button");
    const there = {x: small.x + 6, y: small.y + 6};
    await page.mouse.move(there.x, there.y);
    await expect(tip).toHaveText(String(await history.getAttribute("data-tip")));
    const beside = corner(await tip.boundingBox(), "tip");
    expect(Math.abs(beside.x - (there.x + 12))).toBeLessThanOrEqual(1);
    expect(Math.min(Math.abs(beside.y - (there.y + 20)), Math.abs(beside.y + beside.height - (there.y - 8)))).toBeLessThanOrEqual(1);
});

test("a tip with no room below the pointer opens above it, and a focused control's tip opens over the control", async ({page}) => {
    await page.setViewportSize({width: 1440, height: 900});
    await page.goto("/preview/index.html?shell=demo-edited");
    const discard = page.locator('.commit [data-act="discard"]');
    const box = corner(await discard.boundingBox(), "discard button");
    const tip = page.locator(".tip");
    const at = {x: box.x + box.width / 2, y: box.y + box.height / 2};
    await page.mouse.move(at.x, at.y);
    await expect(tip).toBeVisible();
    const above = corner(await tip.boundingBox(), "tip");
    expect(Math.abs(above.x - (at.x + 12))).toBeLessThanOrEqual(1);
    expect(Math.abs(above.y + above.height - (at.y - 8))).toBeLessThanOrEqual(1);
    // The keyboard reaches the control with no pointer: its tip sits over the control's middle.
    await page.mouse.move(10, 10);
    await expect(tip).toBeHidden();
    await page.locator('.commit [data-act="review"]').focus();
    await page.keyboard.press("Shift+Tab");
    await expect(discard).toBeFocused();
    await expect(tip).toBeVisible();
    const over = corner(await tip.boundingBox(), "tip");
    expect(Math.abs(over.x + over.width / 2 - (box.x + box.width / 2))).toBeLessThanOrEqual(1);
    expect(Math.abs(over.y + over.height - (box.y - 8))).toBeLessThanOrEqual(1);
});
