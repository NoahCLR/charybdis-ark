// @ts-check
"use strict";
const {test, expect} = require("@playwright/test");

// A list beside its editor scrolls down, never sideways: on every Keymap tab
// and every Lighting stage nothing it holds is wider than its pane, at the
// narrowest window the layouts are made for.
const sideways = (page) => page.evaluate(() => [...document.querySelectorAll(".bench-pane > .reach-table, .bench-body table.t")]
    .map((node) => ({at: node.className || node.tagName, over: node.scrollWidth - node.clientWidth})).filter(({over}) => over > 0));

test("no Keymap tab's list is wider than its pane", async ({page}) => {
    await page.setViewportSize({width: 1280, height: 720});
    await page.goto("/preview/index.html?shell=demo");
    for (const tab of ["behaviours", "combos", "macros", "customKeys", "pointing"]) {
        await page.locator(`.bench-tablist [data-tab="${tab}"]`).click();
        expect(await sideways(page), tab).toEqual([]);
    }
});

test("no Lighting stage's list is wider than its pane", async ({page}) => {
    await page.setViewportSize({width: 1280, height: 720});
    await page.goto("/preview/index.html?screen=lighting");
    for (const stage of ["layers", "pd", "combo", "key", "accents"]) {
        await page.locator(`[data-ltab="${stage}"]`).click();
        expect(await sideways(page), stage).toEqual([]);
    }
});
