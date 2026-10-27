// @ts-check
"use strict";
const {expect} = require("@playwright/test");

// The preview in one of the page's themes: "dark", the page's own default, or
// "light", as its toggle leaves it (scripts/preview.js's ?theme=).
/** @param {import("@playwright/test").Page} page @param {"dark" | "light"} [theme] @param {string} [search] */
async function openPreview(page, theme = "dark", search = "") {
    const query = new URLSearchParams(search);
    if (theme === "light") query.set("theme", "light");
    const wanted = query.toString();
    await page.goto(`/preview/index.html${wanted ? `?${wanted}` : ""}`);
    await page.waitForFunction((expected) => document.documentElement.dataset.theme === expected, theme);
}

// The rail's keyboard menu, opened from its button as a person would; one
// already open is left open.
/** @param {import("@playwright/test").Page} page */
async function keyboardMenu(page) {
    const menu = page.locator("#rail-menu");
    if (!(await menu.count())) await page.locator('.rail [data-act="keyboard-menu"]').click();
    await expect(menu).toBeVisible();
    return menu;
}

// Chooses an edit mode, by its wire value, from the keyboard menu.
/** @param {import("@playwright/test").Page} page @param {number} mode */
async function chooseEditMode(page, mode) {
    await (await keyboardMenu(page)).locator(`[data-edit-mode="${mode}"]`).click();
}

// The edit mode the menu ticks, by its wire value. The menu is left closed.
/** @param {import("@playwright/test").Page} page */
async function currentEditMode(page) {
    const value = await (await keyboardMenu(page)).locator('[data-act="edit-mode"][aria-checked="true"]').getAttribute("data-edit-mode");
    await page.keyboard.press("Escape");
    return Number(value);
}

module.exports = {chooseEditMode, currentEditMode, keyboardMenu, openPreview};
