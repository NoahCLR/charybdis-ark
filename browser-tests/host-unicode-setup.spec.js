"use strict";

const {test, expect} = require("@playwright/test");
const {openPreview} = require("./host-page");
const {hostMacros} = require("../tests/fixtures/host-macros");
const {ProfileDraftSession} = require("../core/session/profile-draft-session");
const {buildDeviceModel} = require("../core/session/device-model");
const fs = require("node:fs");

for (const theme of ["vscode-dark", "vscode-light"]) {
    test(`macOS Unicode Hex Input warns about Option shortcuts (${theme})`, async ({page}) => {
        const {snapshot, capabilities} = hostMacros(1 | (2 << 16), []);
        const draft = new ProfileDraftSession(snapshot, "board", capabilities);
        const connection = {connected: true, selectedDeviceId: "board", capabilities};
        const publish = async () => {
            const patch = {...buildDeviceModel(draft.editingState(connection)), draft: draft.view(connection)};
            await page.evaluate(async patch => {
                const store = await import("/webview/store.mjs");
                store.setModel({...store.getModel(), ...patch});
                store.state.screen = "settings"; store.render();
            }, patch);
        };
        const selectLayout = async value => {
            await page.locator('[data-section="host"] [data-macro="hostLayout"]').selectOption(value);
            const message = await page.evaluate(() => window.__posted.at(-1));
            expect(message).toMatchObject({type: "updateConfigDefaults", sectionId: "host"});
            expect(message.fields).toContainEqual({macro: "hostLayout", value});
            draft.stage({...message, draftRevision: draft.revision});
            await publish();
        };
        if (fs.existsSync(`preview/${theme}.html`)) await page.goto(`/preview/${theme}.html`);
        else await openPreview(page, theme);
        await publish();
        const warning = page.locator('[data-section="host"] .callout.warn');
        await expect(warning).toHaveCount(0);
        await selectLayout("3");
        await expect(warning).toContainText("Option+Left/Right for word navigation");
        await expect(warning).toContainText("ordinary typing and key-step shortcuts");
        await expect(warning).toContainText("Ark does not switch your Mac's input source");
        await warning.scrollIntoViewIfNeeded();
        await page.screenshot({path: `/tmp/ark-macos-unicode-warning-${theme}.png`, fullPage: true});
        await selectLayout("2");
        await expect(warning).toHaveCount(0);
        draft.undo(draft.revision);
        await publish();
        await expect(warning).toBeVisible();
    });

    test(`WinCompose link follows Windows Unicode settings and opens GitHub (${theme})`, async ({page, context}) => {
        const {snapshot, capabilities} = hostMacros(0, []);
        snapshot.hostOs.detected = 2;
        const draft = new ProfileDraftSession(snapshot, "board", capabilities);
        const connection = {connected: true, selectedDeviceId: "board", capabilities};
        const publish = async () => {
            const patch = {...buildDeviceModel(draft.editingState(connection)), draft: draft.view(connection)};
            await page.evaluate(async patch => {
                const store = await import("/webview/store.mjs");
                store.setModel({...store.getModel(), ...patch});
                store.state.screen = "settings"; store.render();
            }, patch);
        };
        const stagePosted = async () => {
            const message = await page.evaluate(() => window.__posted.at(-1));
            expect(message).toMatchObject({type: "updateConfigDefaults", sectionId: "host"});
            draft.stage({...message, draftRevision: draft.revision});
            await publish();
            return message;
        };
        if (fs.existsSync(`preview/${theme}.html`)) await page.goto(`/preview/${theme}.html`);
        else await openPreview(page, theme);
        await publish();
        const host = page.locator('[data-section="host"]');
        const link = host.getByRole("link", {name: "WinCompose on GitHub"});
        await expect(link).toHaveCount(0);
        await host.locator('label.sw:has([data-macro="unicodeEnabled"])').click();
        expect((await stagePosted()).fields).toContainEqual({macro: "unicodeEnabled", enabled: true});
        await expect(link).toBeVisible();
        await expect(link).toHaveAttribute("href", "https://github.com/samhocevar/wincompose");
        await expect(link.locator("svg")).toHaveAttribute("aria-hidden", "true");
        expect(await link.locator("svg").evaluate(icon => ({width: icon.getBoundingClientRect().width, height: icon.getBoundingClientRect().height, filled: getComputedStyle(icon).fill !== "none", stroke: getComputedStyle(icon).stroke}))).toEqual({width: 14, height: 14, filled: true, stroke: "none"});
        await link.scrollIntoViewIfNeeded();
        await page.screenshot({path: `/tmp/ark-wincompose-link-${theme}.png`, fullPage: true});
        await context.route("https://github.com/samhocevar/wincompose", route => route.fulfill({contentType: "text/html", body: "WinCompose project"}));
        const opened = page.waitForEvent("popup");
        await link.click();
        const popup = await opened;
        await expect(popup).toHaveURL("https://github.com/samhocevar/wincompose");
        await popup.close();
        await host.locator('[data-macro="hostOs"]').selectOption("1");
        await stagePosted();
        await expect(link).toHaveCount(0);
        await host.locator('[data-macro="hostOs"]').selectOption("2");
        await stagePosted();
        await expect(link).toBeVisible();
        await host.locator('label.sw:has([data-macro="unicodeEnabled"])').click();
        expect((await stagePosted()).fields).toContainEqual({macro: "unicodeEnabled", enabled: false});
        await expect(link).toHaveCount(0);
    });
}
