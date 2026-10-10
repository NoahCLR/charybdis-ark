"use strict";
const {test, expect} = require("@playwright/test");
const {openPreview} = require("./host-page");

for (const theme of ["plain", "vscode-dark", "vscode-light"]) {
    test(`long literal macro text stays inside its row (${theme})`, async ({page}) => {
        await openPreview(page, theme);
        await page.evaluate(async () => {
            const store = await import("/webview/store.mjs");
            store.state.screen = "macros"; store.state.macroSlot = "VIA_MACRO_17"; store.render();
            window.__posted.length = 0;
        });
        const pastedCode = "Skip to content\nNoahCLR\ncharybdis-4x6\n".repeat(80) + "{\n.keycode = CUSTOM_KEY_0,\n}";
        for (const text of ["word ".repeat(80), "x".repeat(1200), pastedCode]) {
            const field = page.locator("[data-step-text]");
            await field.fill(text);
            await field.dispatchEvent("change");
            await expect(field).toHaveValue(text);
            const bounds = await field.evaluate(node => {
                const box = node.getBoundingClientRect(), row = node.closest(".macro-step").getBoundingClientRect();
                const controls = node.closest(".macro-step").querySelector(".macro-step-head").getBoundingClientRect();
                const feedback = document.querySelector("[data-macro-feedback]").getBoundingClientRect();
                return {fieldContained: box.top >= row.top && box.bottom <= row.bottom && box.left >= row.left && box.right <= row.right,
                    controlsContained: controls.left >= row.left && controls.right <= row.right,
                    controlsSeparate: controls.bottom <= box.top, feedbackSeparate: row.bottom <= feedback.top,
                    preservesWhitespace: getComputedStyle(node).whiteSpace === "pre-wrap", scrollsInside: getComputedStyle(node).overflowY !== "visible"};
            });
            expect(bounds).toEqual({fieldContained: true, controlsContained: true, controlsSeparate: true,
                feedbackSeparate: true, preservesWhitespace: true, scrollsInside: true});
        }
        await expect(page.locator("[data-macro-feedback]")).toContainText("Shorten the text");
        await expect(page.locator("[data-macro-feedback]")).not.toContainText("not a key");
        const updates = await page.evaluate(() => window.__posted.filter(message => message.type === "updateViaMacro"));
        expect(updates).toHaveLength(1); // Only the 400-byte prose fits.
        await page.locator("[data-raw] summary").click();
        await page.locator("[data-raw-payload]").fill(pastedCode);
        await page.locator("[data-raw-payload]").dispatchEvent("change");
        await expect(page.locator("[data-macro-feedback]")).toContainText(".keycode = CUSTOM_KEY_0 is not a key");
        await expect(page.locator("[data-step-text]")).toBeDisabled();
        expect(await page.evaluate(() => window.__posted.filter(message => message.type === "updateViaMacro").length)).toBe(1);
    });
}
