"use strict";
const {test, expect} = require("@playwright/test");

for (const text of [' {"a":1} {KC_A} ', '   ', '{{already doubled}}']) {
    test(`Text builder preserves literal characters: ${JSON.stringify(text)}`, async ({page}) => {
        await page.goto("/preview/index.html");
        await page.locator('[data-screen="macros"]').click();
        await page.locator('[data-slot="VIA_MACRO_28"]').click();
        await page.locator('[data-kind]').selectOption("text");
        await page.locator('[data-value]').fill(text);
        await page.evaluate(() => {window.__posted.length = 0;});
        await page.locator('[data-act="insert"]').click();
        const payload = text.replace(/[{}]/g, brace => brace + brace);
        await expect(page.locator("textarea").first()).toHaveValue(payload);
        await expect.poll(() => page.evaluate(() => window.__posted)).toEqual([
            expect.objectContaining({type: "updateViaMacro", keycode: "VIA_MACRO_28", payload}),
        ]);
        await expect(page.locator(".step .tok")).toHaveText(text);
        await expect(page.locator(".unavailable")).toHaveCount(0);
        expect(await page.evaluate(async () => {
            const {getModel} = await import("/webview/store.mjs");
            const {macroMessage} = await import("/webview/view/edits.mjs");
            return window.__posted[0].expectedFingerprint === macroMessage("VIA_MACRO_28", "", getModel().macroEditing.identity).expectedFingerprint;
        })).toBe(true);
    });
}

test("literal text inserts at the cursor and survives step reorder and removal", async ({page}) => {
    await page.goto("/preview/index.html");
    await page.locator('[data-screen="macros"]').click();
    await page.locator('[data-slot="VIA_MACRO_28"]').click();
    const textarea = page.locator("textarea").first();
    await textarea.fill("{120}{KC_A}");
    await textarea.evaluate(node => {node.setSelectionRange(5, 5); node.dispatchEvent(new Event("select"));});
    await page.locator('[data-kind]').selectOption("text");
    await page.locator('[data-value]').fill('{"n":777}');
    await page.locator('[data-act="insert"]').click();
    await expect(textarea).toHaveValue('{120}{{"n":777}}{KC_A}');
    await page.locator(".step").nth(1).getByRole("button", {name: "Move step up"}).click();
    await expect(textarea).toHaveValue('{{"n":777}}{120}{KC_A}');
    await page.locator(".step").nth(1).getByRole("button", {name: "Remove"}).click();
    await expect(textarea).toHaveValue('{{"n":777}}{KC_A}');
});
