"use strict";
const {editLayers} = require("../tests/fixtures/profile-document");
const {test, expect} = require("@playwright/test");
const {openControls, clearPosts, posted} = require("./control-preview");
const {document: pdDocument} = require("../tests/fixtures/pd-profile");
const {validateSnapshot} = require("../core/model/portable-profile");
// The panel's whole model for the draft, published as the shell posts it.
const {openDraft, panelModel} = require("../tests/fixtures/published-model");

for (const theme of ["dark", "light"]) {
    test(`retired user keys stay readable but cannot be picked (${theme})`, async ({page}) => {
        await openControls(page, "keys", {tab: "key", selected: 0}, theme);
        // Publish a real draft with named custom keys and a retained retired code.
        const value = pdDocument();
        editLayers(value, layers => layers[0][0] = 0x7e54);
        const {draft, state} = openDraft(value, {edits: ["Right Thumb", "Left Thumb", "Click Spam"].map((name, slot) => ({type: "updateCustomKey", keycode: `CUSTOM_KEY_${slot}`, name}))});
        await page.evaluate(async model => {
            const store = await import("/webview/store.mjs");
            store.setModel(model); store.render();
        }, panelModel(draft, state));
        await expect(page.locator("#keycodeField")).toHaveValue("QK_USER_20");
        await expect(page.locator(".key-details")).toContainText("QK_USER_20");
        await page.locator('[data-act="pick"]').click();
        const picker = page.getByRole("dialog", {name: "Pick a keycode"});
        for (const section of ["custom", "all"]) {
            await picker.locator(`[data-sec="${section}"]`).click();
            await expect(picker.locator('[data-pick^="QK_USER_"]')).toHaveCount(0);
            for (const key of ["CUSTOM_KEY_0", "CUSTOM_KEY_1", "CUSTOM_KEY_2", "KC_NO", "KC_TRANSPARENT"])
                await expect(picker.locator(`[data-pick="${key}"]`)).toHaveCount(1);
        }
        const search = picker.locator('[data-f="picker:search"]');
        for (const query of ["QK_USER_", "User 20"]) {
            await search.fill(query);
            await expect(picker.locator('[data-pick^="QK_USER_"]')).toHaveCount(0);
        }
        for (const name of ["Right Thumb", "Left Thumb", "Click Spam"]) {
            await search.fill(name);
            await expect(picker.locator('[data-pick^="CUSTOM_KEY_"]')).toHaveCount(1);
        }
        await clearPosts(page);
        await picker.locator('[data-pick="CUSTOM_KEY_2"]').click();
        await picker.locator('[data-act="use"]').click();
        const messages = await posted(page);
        expect(messages).toEqual([expect.objectContaining({type: "updateLayoutKeys",
            changes: [expect.objectContaining({layoutIndex: 0, keycode: "CUSTOM_KEY_2"})]})]);
        draft.stage(messages[0]);
        expect(validateSnapshot(draft.document).layers[0][0]).toBe(0x7f02);
    });
}
