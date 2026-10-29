// @ts-check
"use strict";
const {test, expect} = require("@playwright/test");
const {hostMacros} = require("../tests/fixtures/host-macros");
const {ProfileDraftSession} = require("../core/session/profile-draft-session");
// The panel's whole model for the draft, published as the shell posts it.
const {connectedState, panelModel} = require("../tests/fixtures/published-model");
const {openPreview} = require("./shell-page");

for (const theme of ["dark", "light"]) {
    test(`macro protection defaults to Unicode entry and its override posts and reviews (${theme})`, async ({page}) => {
        const {snapshot, capabilities} = hostMacros(1 | (2 << 16), ["é"]);
        const draft = new ProfileDraftSession(snapshot, "board", capabilities);
        const state = connectedState(capabilities);
        const publish = async () => {
            await page.evaluate(async model => {
                const store = await import("/webview/store.mjs");
                store.setModel(model); store.render();
            }, panelModel(draft, state));
        };
        const stagePosted = async () => {
            const message = await page.evaluate(() => window.__posted.at(-1));
            draft.stage({...message, draftRevision: draft.revision}); await publish(); return message;
        };
        await openPreview(page, theme);
        await publish();
        await page.evaluate(async () => {const store = await import("/webview/store.mjs"); store.state.screen = "macros"; store.state.macroSlot = "MACRO_0"; store.render();});
        const policy = page.locator("[data-protection]");
        await expect(policy.locator("option:checked")).toHaveText("Automatic · off");
        await expect(page.locator('[data-macro-editor]')).toContainText("when this layout needs Unicode entry");
        await expect(page.locator('[data-macro-editor]')).toContainText("starts immediately and suspends ordinary keys already held");
        await expect(page.locator('[data-macro-editor]')).not.toContainText("Release ordinary keys before starting");
        await page.locator("[data-host-settings]").click();
        await page.locator('[data-macro="hostLayout"]').selectOption("3");
        await stagePosted();
        await page.evaluate(async () => {const store = await import("/webview/store.mjs"); store.state.screen = "macros"; store.render();});
        await expect(policy.locator("option:checked")).toHaveText("Automatic · on");
        await expect(page.locator('[data-macro-editor]')).not.toContainText("Avoid typing while a text macro plays");
        await policy.selectOption("off");
        expect(await stagePosted()).toMatchObject({type: "updateMacro", keycode: "MACRO_0", protection: "off"});
        await expect(policy).toHaveValue("off");
        await expect(page.locator('[data-macro-editor]')).toContainText("Avoid typing while a text macro plays");
        await page.evaluate(async () => {const store = await import("/webview/store.mjs"); store.state.overlay = "review"; store.render();});
        const review = page.getByRole("dialog", {name: "Review changes"});
        await expect(review).toContainText("Uninterruptible playback");
        const changed = draft.changes().find(row => row.unit === "macro:0");
        await review.locator(`[data-discard="${changed.group}"]`).click();
        const discard = await page.evaluate(() => window.__posted.at(-1));
        expect(discard).toMatchObject({type: "discardProfileDraftChanges", group: changed.group});
        draft.discard(draft.revision, discard.group); await publish();
        await review.getByRole("button", {name: "Close"}).click();
        await expect(policy).toHaveValue("auto");
        await expect(policy.locator("option:checked")).toHaveText("Automatic · on");
        await policy.scrollIntoViewIfNeeded();
        await page.screenshot({path: `/tmp/ark-macro-protection-${theme}.png`, fullPage: true});
    });
}
