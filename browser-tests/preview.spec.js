"use strict";
const {test, expect} = require("@playwright/test");
for (const theme of ["plain", "vscode-dark", "vscode-light"]) {
    test(`Mouse edit posts its complete section (${theme})`, async ({page}) => {
        const errors = [];
        page.on("pageerror", error => errors.push(error.message));
        await page.goto("/preview/index.html");
        if (theme !== "plain") {
            // Target the documented host-cascade regressions. This is a small
            // fixture, not a claim to run the VS Code extension host itself.
            await page.addStyleTag({content: "@layer vscode-host { body { padding: 0 20px; } code { background: red; color: white; padding: 4px; border-radius: 3px; } }"});
            await page.locator("body").evaluate((body, name) => body.classList.add("vscode-body", name), theme);
        }
        await page.locator('[data-screen="mouse"]').click();
        const field = page.locator('select[data-macro="normalDpi"]');
        await expect(field).toHaveCount(1);
        await expect(field).toBeEnabled();
        await page.evaluate(() => {window.__posted.length = 0;});
        await field.selectOption("1400");
        await expect.poll(() => page.evaluate(() => window.__posted)).toEqual([
            expect.objectContaining({type: "updateConfigDefaults", sectionId: "normalPointerSpeed", fields: [{macro: "normalDpi", value: "1400"}, {macro: "snipingDpi", value: "200"}]}),
        ]);
        await expect(page.locator("body")).toHaveCSS("padding-left", "0px");
        expect(errors).toEqual([]);
    });
}
