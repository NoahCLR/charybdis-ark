"use strict";
const {test, expect} = require("@playwright/test");
const {hostMacros} = require("../tests/fixtures/host-macros");
const {ProfileDraftSession} = require("../core/session/profile-draft-session");
const {buildDeviceModel} = require("../core/session/device-model");
const {openPreview} = require("./host-page");
const fs = require("node:fs");

for (const theme of ["vscode-dark", "vscode-light"]) {
    test(`macro protection defaults to Unicode entry and its override posts and reviews (${theme})`, async ({page}) => {
        const {snapshot, capabilities} = hostMacros(1 | (2 << 16), ["é"]);
        capabilities.featureFlags |= 1 << 23;
        const draft = new ProfileDraftSession(snapshot, "board", capabilities);
        const connection = {connected: true, selectedDeviceId: "board", capabilities};
        const publish = async () => {
            const patch = {...buildDeviceModel(draft.editingState(connection)), draft: draft.view(connection)};
            await page.evaluate(async patch => {
                const store = await import("/webview/store.mjs");
                store.setModel({...store.getModel(), ...patch}); store.render();
            }, patch);
        };
        const stagePosted = async () => {
            const message = await page.evaluate(() => window.__posted.at(-1));
            draft.stage({...message, draftRevision: draft.revision}); await publish(); return message;
        };
        if (fs.existsSync(`preview/${theme}.html`)) await page.goto(`/preview/${theme}.html`);
        else await openPreview(page, theme);
        await publish();
        await page.evaluate(async () => {const store = await import("/webview/store.mjs"); store.state.screen = "macros"; store.state.macroSlot = "VIA_MACRO_0"; store.render();});
        const policy = page.locator("[data-protection]");
        await expect(policy.locator("option:checked")).toHaveText("Automatic · off");
        await expect(page.locator('[data-macro-editor]')).toContainText("when this layout needs Unicode entry");
        await page.locator("[data-host-settings]").click();
        await page.locator('[data-macro="hostLayout"]').selectOption("3");
        await stagePosted();
        await page.evaluate(async () => {const store = await import("/webview/store.mjs"); store.state.screen = "macros"; store.render();});
        await expect(policy.locator("option:checked")).toHaveText("Automatic · on");
        await policy.selectOption("off");
        expect(await stagePosted()).toMatchObject({type: "updateViaMacro", keycode: "VIA_MACRO_0", protection: "off"});
        await expect(policy).toHaveValue("off");
        await page.evaluate(async () => {const store = await import("/webview/store.mjs"); store.state.overlay = "review"; store.render();});
        const review = page.getByRole("dialog", {name: "Review changes"});
        await expect(review).toContainText("Uninterruptible playback");
        const changed = draft.changes().find(row => row.unit === "macro:0");
        await review.locator(`[data-discard="${changed.group}"]`).click();
        const discard = await page.evaluate(() => window.__posted.at(-1));
        expect(discard).toMatchObject({type: "discardProfileDraftChanges", group: changed.group});
        draft.discard(draft.revision, discard.group); await publish();
        await review.getByRole("button", {name: "Keep editing"}).click();
        await expect(policy).toHaveValue("auto");
        await expect(policy.locator("option:checked")).toHaveText("Automatic · on");
        await policy.scrollIntoViewIfNeeded();
        await page.screenshot({path: `/tmp/ark-macro-protection-${theme}.png`, fullPage: true});
        const legacy = {...connection, capabilities: {...capabilities, featureFlags: (1 << 21) | (1 << 22)}};
        const legacyDraft = new ProfileDraftSession(snapshot, "board", legacy.capabilities);
        await page.evaluate(async patch => {const store = await import("/webview/store.mjs"); store.setModel({...store.getModel(), ...patch}); store.render();},
            {...buildDeviceModel(legacyDraft.editingState(legacy)), draft: legacyDraft.view(legacy)});
        await expect(policy).toBeDisabled();
        await expect(page.locator('[data-macro-editor]')).toContainText("Update both halves to protect macro playback");
    });
}
