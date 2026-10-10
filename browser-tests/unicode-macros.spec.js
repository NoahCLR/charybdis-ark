"use strict";
const {test, expect} = require("@playwright/test");
const {openPreview} = require("./host-page");
for (const theme of ["vscode-dark", "vscode-light"]) {
    test(`Host Settings and literal Text steps post exact content (${theme})`, async ({page}) => {
        await openPreview(page, theme);
        await page.evaluate(async () => {
            const store = await import("/webview/store.mjs");
            const model = structuredClone(store.getModel());
            model.macroUnicode = {supported: true, mode: 1, enabled: true};
            store.setModel(model); store.state.screen = "macros"; store.render();
            window.__posted.length = 0;
        });
        await page.locator('[data-host-settings]').click();
        await expect(page.locator('[data-section="host"]')).toBeVisible();
        await page.locator('[data-macro="hostOs"]').selectOption("2");
        expect(await page.evaluate(() => window.__posted.at(-1))).toEqual(expect.objectContaining({type: "updateConfigDefaults", sectionId: "host", fields: [{macro:"hostOs",value:"2"},{macro:"unicodeEnabled",enabled:false}]}));
        await page.locator('label.sw:has([data-macro="unicodeEnabled"])').click();
        await expect(page.locator('[data-macro="unicodeEnabled"]')).toBeChecked();
        expect(await page.evaluate(() => window.__posted.at(-1).fields)).toEqual([{macro:"hostOs",value:"2"},{macro:"unicodeEnabled",enabled:true}]);
        await page.evaluate(async () => {
            const store = await import("/webview/store.mjs");
            const model = structuredClone(store.getModel());
            model.macroUnicode = {supported:true,mode:1,enabled:true};
            store.setModel(model); store.state.screen = "macros"; store.state.macroSlot = "VIA_MACRO_17"; store.render(); window.__posted.length = 0;
        });
        const text = ' {"café": “hello”} 🙂 e\u0301 👩‍💻 ';
        await page.locator('[data-step-text]').fill(text);
        await page.locator('[data-step-text]').dispatchEvent('change');
        await expect.poll(() => page.evaluate(() => window.__posted.filter(item => item.type === 'updateViaMacro').length)).toBe(1);
        const posted = await page.evaluate(() => window.__posted.filter(item => item.type === "updateViaMacro"));
        expect(posted.at(-1)?.payload).toContain(text.replaceAll("{", "{{").replaceAll("}", "}}"));
    });
}
