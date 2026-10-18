"use strict";
const {test, expect} = require("@playwright/test");
const {openControls, clearPosts, posted} = require("./control-preview");
const {document: pdDocument} = require("../tests/fixtures/pd-profile");
const {fingerprint, summary, validateSnapshot} = require("../core/model/portable-profile");
const {ProfileDraftSession} = require("../core/session/profile-draft-session");
const {buildSnapshotModel} = require("../core/session/device-model");
const {draftBinding} = require("../core/session/panel-session-state");
const {PROFILE_WIRE_KNOWN_MASKS} = require("../core/protocol/profile-wire-v1");

for (const theme of ["vscode-dark", "vscode-light"]) {
    test(`retired user keys stay readable but cannot be picked (${theme})`, async ({page}) => {
        await openControls(page, "keys", {tab: "key", selected: 0}, theme);
        // Publish a real draft with named custom keys and a retained retired code.
        const value = pdDocument();
        value.layers[0][0] = 0x7e54;
        const capabilities = {compiledLayerCount: 16, supportedDomainMask: 31, actionAbiDigest: value.actionAbiDigest, featureFlags: PROFILE_WIRE_KNOWN_MASKS.CURRENT_PAIR_FEATURES};
        const draft = new ProfileDraftSession({document: value, fingerprint: fingerprint(value), summary: summary(value)}, "board", capabilities);
        for (const [slot, name] of ["Right Thumb", "Left Thumb", "Click Spam"].entries())
            draft.stage({type: "updateCustomKey", keycode: `CUSTOM_KEY_${slot}`, name, draftId: draft.id, draftRevision: draft.revision});
        const connection = {connected: true, selectedDeviceId: "board", capabilities};
        const editing = draftBinding({draft}, connection);
        const patch = {...buildSnapshotModel(draft.current, capabilities, editing, connection), draft: {...draft.view(connection), ...editing}};
        await page.evaluate(async patch => {
            const store = await import("/webview/store.mjs");
            store.setModel({...store.getModel(), ...patch}); store.render();
        }, patch);
        await expect(page.locator("#keycodeField")).toHaveValue("QK_USER_20");
        await expect(page.locator(".key-details")).toContainText("QK_USER_20");
        await page.locator('[data-act="pick"]').click();
        const picker = page.getByRole("dialog", {name: "Choose a key"});
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
        expect(validateSnapshot(draft.document).document.layers[0][0]).toBe(0x7f02);
    });
}
