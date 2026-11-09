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
        const customKeys = ["CUSTOM_KEY_0", "CUSTOM_KEY_1", "CUSTOM_KEY_2"], noKeys = ["KC_NO", "KC_TRANSPARENT"];
        for (const [section, keys] of [["custom", customKeys], ["common", noKeys], ["all", [...customKeys, ...noKeys]]]) {
            await picker.locator(`[data-sec="${section}"]`).click();
            await expect(picker.locator('[data-pick^="QK_USER_"]')).toHaveCount(0);
            for (const key of keys)
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

// The keyboard's switch keys for behaviours (firmware D-F66) are picked beside
// QMK's for combos, in Other QMK, and post by the keyboard's name.
test("a switch key for behaviours is picked beside those for combos and posts by name", async ({page}) => {
    await openControls(page, "keys", {tab: "key", selected: 0});
    await page.locator('[data-act="pick"]').click();
    const picker = page.getByRole("dialog", {name: "Pick a keycode"});
    await picker.locator('[data-sec="other"]').click();
    const switches = ["QK_COMBO_ON", "QK_COMBO_OFF", "QK_COMBO_TOGGLE", "BH_ON", "BH_OFF", "BH_TOGG"];
    const shown = await picker.locator("[data-pick]").evaluateAll(tiles => tiles.map(tile => tile.getAttribute("data-pick")));
    const at = shown.indexOf("QK_COMBO_ON");
    expect(shown.slice(at, at + switches.length)).toEqual(switches);
    await expect(picker.locator('[data-pick="BH_TOGG"]')).toContainText("Toggle Behaviours");
    await clearPosts(page);
    await picker.locator('[data-pick="BH_TOGG"]').click();
    await picker.locator('[data-act="use"]').click();
    expect(await posted(page)).toEqual([expect.objectContaining({type: "updateLayoutKeys",
        changes: [expect.objectContaining({layoutIndex: 0, keycode: "BH_TOGG"})]})]);
});

// And its switch keys for auto-mouse (firmware D-F66), right after them in the
// same group.
test("a switch key for auto-mouse is picked after those for behaviours and posts by name", async ({page}) => {
    await openControls(page, "keys", {tab: "key", selected: 0});
    await page.locator('[data-act="pick"]').click();
    const picker = page.getByRole("dialog", {name: "Pick a keycode"});
    await picker.locator('[data-sec="other"]').click();
    const switches = ["QK_COMBO_ON", "QK_COMBO_OFF", "QK_COMBO_TOGGLE", "BH_ON", "BH_OFF", "BH_TOGG", "AM_ON", "AM_OFF", "AM_TOGG"];
    const shown = await picker.locator("[data-pick]").evaluateAll(tiles => tiles.map(tile => tile.getAttribute("data-pick")));
    const at = shown.indexOf("QK_COMBO_ON");
    expect(shown.slice(at, at + switches.length)).toEqual(switches);
    await expect(picker.locator('[data-pick="AM_TOGG"]')).toContainText("Toggle Auto-mouse");
    await clearPosts(page);
    await picker.locator('[data-pick="AM_TOGG"]').click();
    await picker.locator('[data-act="use"]').click();
    expect(await posted(page)).toEqual([expect.objectContaining({type: "updateLayoutKeys",
        changes: [expect.objectContaining({layoutIndex: 0, keycode: "AM_TOGG"})]})]);
});
