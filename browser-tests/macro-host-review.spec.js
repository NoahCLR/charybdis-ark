// @ts-check
"use strict";

const {test, expect} = require("@playwright/test");
const {openPreview} = require("./host-page");
const {hostMacros} = require("../tests/fixtures/host-macros");
const {ProfileDraftSession} = require("../core/session/profile-draft-session");
const {buildSnapshotModel} = require("../core/session/device-model");
const {draftBinding} = require("../core/session/panel-session-state");
const fs = require("node:fs");

for (const theme of ["vscode-dark", "vscode-light"]) {
    test(`changing Host updates stored macros and reviews the effect (${theme})`, async ({page}) => {
        const {snapshot, capabilities} = hostMacros(1 | (2 << 16), ["café", "{+KC_A}é{-KC_A}", "hello", "{KC_A}"]);
        const draft = new ProfileDraftSession(snapshot, "board", capabilities);
        const connection = {connected: true, selectedDeviceId: "board", capabilities};
        const publish = async () => {
            const patch = {...buildSnapshotModel(draft.current, draft.capabilities, draftBinding({draft}, connection), connection), draft: {...draft.view(connection), ...draftBinding({draft}, connection)}};
            await page.evaluate(async patch => {
                const store = await import("/webview/store.mjs");
                store.setModel({...store.getModel(), ...patch}); store.render();
            }, patch);
        };
        // Use the installed host's real stylesheet when available locally;
        // CI uses the portable host-cascade fixture.
        if (fs.existsSync(`preview/${theme}.html`)) await page.goto(`/preview/${theme}.html`);
        else await openPreview(page, theme);
        await publish();
        await page.evaluate(async () => {
            const store = await import("/webview/store.mjs");
            store.state.screen = "settings"; store.render(); window.__posted.length = 0;
        });
        await page.locator('[data-macro="hostLayout"]').selectOption("3");
        const message = await page.evaluate(() => window.__posted.at(-1));
        expect(message).toMatchObject({type: "updateConfigDefaults", sectionId: "host"});
        expect(message.fields).toContainEqual({macro: "hostLayout", value: "3"});
        draft.stage({...message, draftRevision: draft.revision});
        await publish();
        await page.evaluate(async () => {
            const store = await import("/webview/store.mjs");
            store.state.screen = "macros"; store.state.macroSlot = "VIA_MACRO_1"; store.render();
        });
        // The tile keeps what the macro is, with a red mark and the reason in its tip.
        await expect(page.locator('[data-slot="VIA_MACRO_1"] .slot-problem')).toHaveCount(1);
        await expect(page.locator('[data-slot="VIA_MACRO_1"]')).not.toContainText("blocked");
        await expect(page.locator('[data-slot="VIA_MACRO_1"]')).toHaveAttribute("data-tip", /cannot play: .*Settings → Your computer/);
        await expect(page.locator('[data-macro-feedback]')).toContainText("Release ordinary keys");
        await expect(page.locator('[data-macro-feedback]')).toContainText("stored macro cannot play");
        await expect(page.locator('[data-macro-feedback] [data-feedback-settings]')).toHaveText("Your computer in Settings →");
        await expect(page.locator('[data-macro-feedback]')).not.toContainText("not in your draft");
        await page.evaluate(async () => {
            const store = await import("/webview/store.mjs");
            store.state.overlay = "review"; store.render();
        });
        const review = page.getByRole("dialog", {name: "Review changes"});
        await expect(review).toContainText("Playback changes because of Settings → Your computer");
        await expect(review).toContainText('layout keys: "é"');
        await expect(review).toContainText('Unicode entry (macOS): "é"');
        await expect(review).toContainText("Macro 1 cannot play with this computer setup");
        await expect(review).not.toContainText("Macro 2 · host setup");
        await expect(review).not.toContainText("Macro 3 · host setup");
        await page.screenshot({path: `/tmp/ark-macro-host-review-${theme}.png`, fullPage: true});
        const group = draft.changes().find(row => row.unit === "settings:host").group;
        await review.locator(`[data-discard="${group}"]`).first().click();
        const discard = await page.evaluate(() => window.__posted.at(-1));
        expect(discard).toMatchObject({type: "discardProfileDraftChanges", group});
        draft.discard(draft.revision, discard.group);
        await publish();
        await expect(review).toHaveCount(0);
        await expect(page.locator('[data-slot="VIA_MACRO_1"] .slot-problem')).toHaveCount(0);
        expect(draft.document.macros).toEqual(snapshot.document.macros);
    });
}
