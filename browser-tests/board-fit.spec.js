// @ts-check
"use strict";
const {test, expect} = require("@playwright/test");

// The board fits the window's height (styles.css, .board svg), so the
// workbench tabs share the first screen with it: at 1920 × 1080 nothing has
// to scroll before the editor under the board is in reach, on Keymap and on
// Lighting alike.
for (const [screen, query] of [["Keymap", ""], ["Lighting", "?screen=lighting"]]) {
    test(`${screen}: the workbench tabs share the first screen with the board at 1920 × 1080`, async ({page}) => {
        await page.setViewportSize({width: 1920, height: 1080});
        await page.goto(`/preview/index.html${query}`);
        const tabs = page.locator(".bench-tablist");
        await expect(tabs).toBeVisible();
        const box = await tabs.boundingBox();
        expect(box, "the tab strip is laid out").not.toBeNull();
        expect((box?.y ?? 0) + (box?.height ?? 0), "the tab strip ends inside the window").toBeLessThanOrEqual(1080);
        expect(await page.locator(".content").evaluate((node) => node.scrollTop), "the page has not scrolled").toBe(0);
        // The board is still the board: its keys keep a size a pointer can aim at.
        const key = await page.locator(".kc .kc-rect").first().boundingBox();
        expect(key?.width ?? 0).toBeGreaterThan(48);
    });
}

// Previewing layers together captions the board over its empty bottom-left
// corner (styles.css, .board > .board-foot), wrapping there when it is long,
// so the board card keeps its height and nothing under it moves, on Keymap as
// on Lighting.
for (const [screen, query] of [["Keymap", ""], ["Lighting", "?screen=lighting"]]) {
    test(`${screen}: previewing a second layer leaves the board card its height`, async ({page}) => {
        await page.setViewportSize({width: 1920, height: 1080});
        await page.goto(`/preview/index.html${query}`);
        const card = page.locator(".board-card");
        const tabs = page.locator(".layer-tabs [data-layer]");
        await expect(tabs.nth(1)).toBeVisible();
        const before = await card.boundingBox();
        await tabs.nth(1).click({modifiers: ["ControlOrMeta"]});
        await expect(page.locator(".board-foot-text"), "the preview is captioned").toBeVisible();
        const after = await card.boundingBox();
        expect(after?.height, "the card is as tall as before").toBe(before?.height);
        await expect(page.locator(".board > .board-foot"), "the caption lies on the board").toBeVisible();
        // A long caption wraps into the corner rather than being cut short.
        await tabs.nth(2).click({modifiers: ["ControlOrMeta"]});
        const text = page.locator(".board > .board-foot .board-foot-text");
        expect(await text.evaluate((node) => node.scrollWidth <= node.clientWidth), "the caption is not cut").toBe(true);
        expect((await card.boundingBox())?.height, "a wrapped caption leaves the card its height").toBe(before?.height);
    });
}

// Both screens say a preview's layers in the same words (layersOnTop), each
// adding only what is its own: the Keymap where edits go, Lighting what the
// layers paint over.
for (const [screen, query, rest] of [
    ["Keymap", "", " · keys seen through from below are frosted · edits go to Extra 1"],
    ["Lighting", "?screen=lighting", ", over the background effect"],
]) {
    test(`${screen}: a preview's caption names its layers top first, down to the base`, async ({page}) => {
        await page.goto(`/preview/index.html${query}`);
        const tabs = page.locator(".layer-tabs [data-layer]");
        for (const at of [4, 5]) await tabs.nth(at).click({modifiers: ["ControlOrMeta"]});
        await expect(page.locator(".board-foot b")).toHaveText("Preview");
        await expect(page.locator(".board-foot-text")).toHaveText(`Extra 1 on top of Pointer and Base${rest}`);
    });
}
