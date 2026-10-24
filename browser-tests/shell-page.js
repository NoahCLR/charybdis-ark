// @ts-check
"use strict";

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

// Opens a folded Settings card or fold by its title, as a person would; one
// already open is left open.
/** @param {import("@playwright/test").Page} page @param {string} id a data-section or data-subfold */
async function openFold(page, id) {
    const fold = page.locator(`details[data-section="${id}"], details[data-subfold="${id}"]`).first();
    if (!(await fold.evaluate((node) => /** @type {HTMLDetailsElement} */ (node).open))) await fold.locator(":scope > summary").click();
}

module.exports = {openFold, openPreview};
