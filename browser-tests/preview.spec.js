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

// The web page's controls, where the model offers them (?host=web is the web
// host's model, scripts/preview.js). Each has to post what it says it does.
test("the web host's controls post their messages", async ({page}) => {
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    const posted = () => page.evaluate(() => window.__posted.filter((message) => message.type !== "ready"));
    await page.goto("/preview/index.html?host=web");
    await expect(page.locator(".rail-build")).toHaveText(/^Ark .+ · preview$/);

    await page.evaluate(() => {window.__posted.length = 0;});
    await page.locator('.rail [data-act="choose-keyboard"]').click();
    await expect.poll(posted).toEqual([expect.objectContaining({type: "chooseKeyboard"})]);

    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe("dark");
    await page.evaluate(() => {window.__posted.length = 0;});
    await page.locator('.topbar [data-act="theme"]').click();
    await expect.poll(posted).toEqual([expect.objectContaining({type: "setTheme", theme: "light"})]);
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe("light");
    await expect(page.locator('.topbar [data-act="theme"]')).toHaveCount(1);

    await page.locator('[data-screen="profile"]').click();
    await expect(page.locator(".card.recoveries .recovery-row")).toHaveCount(2);
    await expect(page.locator('[data-act="upgrade"]')).toHaveCount(0);
    await page.evaluate(() => {window.__posted.length = 0;});
    await page.locator(".card.recoveries [data-recovery]").first().click();
    await expect.poll(posted).toEqual([expect.objectContaining({type: "downloadRecovery", id: 2})]);
    expect(errors).toEqual([]);
});

test("with no keyboard the web host offers its picker first, and without WebHID says why", async ({page}) => {
    await page.goto("/preview/index.html?host=web-none");
    const placeholder = page.locator(".read-placeholder");
    await expect(placeholder.locator("h2")).toHaveText("Connect your keyboard");
    await page.evaluate(() => {window.__posted.length = 0;});
    await placeholder.locator('[data-act="choose-keyboard"]').click();
    await expect.poll(() => page.evaluate(() => window.__posted)).toEqual([expect.objectContaining({type: "chooseKeyboard"})]);

    await page.goto("/preview/index.html?host=web-unsupported");
    await expect(page.locator(".read-placeholder h2")).toHaveText("Ark needs Chrome or Edge");
    await expect(page.locator('[data-act="choose-keyboard"]')).toHaveCount(0);
    await expect(page.locator('.rail [data-act="refresh"]')).toBeDisabled();
});

test("the extension's panel has no theme toggle, picker, build line or browser recovery list", async ({page}) => {
    await page.goto("/preview/index.html");
    await expect(page.locator('[data-screen="keys"]')).toBeEnabled();
    await expect(page.locator('[data-act="theme"]')).toHaveCount(0);
    await expect(page.locator('[data-act="choose-keyboard"]')).toHaveCount(0);
    await expect(page.locator(".rail-build")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBeUndefined();
    await page.locator('[data-screen="profile"]').click();
    await expect(page.locator(".card.recoveries")).toHaveCount(0);
    await expect(page.locator('[data-act="upgrade"]')).toHaveCount(1);
});
