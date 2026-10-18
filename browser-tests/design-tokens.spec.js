// @ts-check
"use strict";
// The action grammar, checked where it renders (docs/architecture/
// interface-contracts.md, "Action grammar"): one filled commit per surface,
// and every icon-only button named for a screen reader. The stylesheet's
// tokens are checked without a browser in tests/view/design-tokens.test.mjs.
const {test, expect} = require("@playwright/test");

const SURFACES = [".main > .content", ".main > .commit", ".rail", ".sheet"];

test("every screen has at most one filled commit per surface, and every icon button has a name", async ({page}) => {
    await page.goto("/preview/index.html?host=demo-edited");
    await expect(page.locator('[data-screen="keys"]')).toBeEnabled();
    const screens = await page.locator(".rail [data-screen]").evaluateAll((buttons) => buttons.map((button) => /** @type {HTMLElement} */ (button).dataset.screen));
    for (const screen of screens) {
        await page.locator(`.rail [data-screen="${screen}"]`).click();
        await expect(page.locator(`.rail [data-screen="${screen}"]`)).toHaveAttribute("aria-current", "true");
        const counts = await page.evaluate((surfaces) => surfaces.map((selector) => [...document.querySelectorAll(selector)]
            .map((surface) => [...surface.querySelectorAll(".btn.primary")].filter((button) => /** @type {HTMLElement} */ (button).offsetParent !== null).length)
            .reduce((most, count) => Math.max(most, count), 0)), SURFACES);
        expect(Math.max(...counts), `${screen}: filled buttons per surface ${JSON.stringify(Object.fromEntries(SURFACES.map((s, i) => [s, counts[i]])))}`).toBeLessThanOrEqual(1);
        const unnamed = await page.locator(".btn.icon:not([aria-label])").count();
        expect(unnamed, `${screen}: icon buttons without an aria-label`).toBe(0);
    }
});
