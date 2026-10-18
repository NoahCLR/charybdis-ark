// @ts-check
"use strict";
// Settings, Backups, Keyboard and the Apply moment: the controls this
// package draws are wired and say what the keyboard does.
const {test, expect} = require("@playwright/test");
const {openControls, change, expectPost, clearPosts} = require("./control-preview");

test("the default combo window and the combo hold threshold are editable on current firmware, even without combos", async ({page}) => {
    await openControls(page, "settings");
    await page.evaluate(async () => {
        const store = await import("/webview/store.mjs");
        const model = structuredClone(store.getModel());
        model.combos = [];
        store.setModel(model); store.render();
        window.__posted.length = 0;
    });
    await expect(page.getByText("Flash the updated firmware")).toHaveCount(0);
    const window = page.locator('[data-f="settings:combo:default"]');
    await change(window, 77);
    await expectPost(page, {type: "updateComboDefaultTerm", defaultTermMs: "77"});
    await clearPosts(page);
    await change(page.locator('[data-f="settings:combo:hold"]'), 233);
    await expectPost(page, {type: "updateComboHoldTerm", holdTermMs: "233"});
});
