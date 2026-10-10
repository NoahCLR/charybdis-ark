"use strict";
const {test, expect} = require("@playwright/test");
const {openPreview} = require("./host-page");
const {buildDeviceModel} = require("../core/session/device-model");

// Sends the production model for a host layout, as the host would after the
// Host settings change.
async function sendLayout(page, effective, layout, macosIso = false) {
    const patch = buildDeviceModel({settingsView: {host: {effective, layout, macosIso}}});
    await page.evaluate(patch => {
        const model = structuredClone(window.__hostBase);
        for (const key of ["vocabulary", "qmkKeyLabels", "qmkKeycodes", "qmkKeycodeAliases", "hostLayoutLegends"]) model[key] = patch[key];
        window.dispatchEvent(new MessageEvent("message", {data: {type: "model", model}}));
    }, patch);
}

for (const theme of ["vscode-dark", "vscode-light"]) {
    test(`the picker board and search follow the host layout (${theme})`, async ({page}) => {
        await openPreview(page, theme);
        await page.evaluate(async () => {
            const s = await import("/webview/store.mjs");
            window.__hostBase = structuredClone(s.getModel());
            const picker = await import("/webview/ui/picker.mjs");
            picker.openPicker({title: "Layout", contextKeycode: "KC_A", seed: ["KC_A"], onPick: keycode => window.__picked = keycode});
        });
        await sendLayout(page, 2, 9);
        await expect(page.locator('.pkb-key[data-pick="KC_Y"]')).toHaveText("Z");
        await expect(page.locator('.pkb-key[data-pick="KC_Y"]')).toHaveAttribute("aria-label", "Z");
        await expect(page.locator('.pkb-key[data-pick="KC_GRV"]')).toContainText("^");
        await expect(page.locator('.pkb-key[data-pick="KC_GRV"]')).toContainText("◌");
        await expect(page.locator('.pkb-key[data-pick="KC_E"]')).toContainText("€");
        await expect(page.locator('.pkb-key[data-pick="KC_1"]')).toContainText("!");
        await page.locator("#pickerSearch").fill("ö");
        await expect(page.locator('[data-pick="KC_SEMICOLON"]')).toContainText("Ö");
        await page.locator("#pickerSearch").fill("");
        await sendLayout(page, 2, 0);
        await expect(page.locator('.pkb-key[data-pick="KC_Y"]')).toHaveText("Y");
        await page.locator('.pkb-key[data-pick="KC_Y"]').click();
        await page.locator('.picker [data-act="use"]').click();
        expect(await page.evaluate(() => window.__picked)).toBe("KC_Y");
    });

    test(`Dutch Option legends and macOS ISO labels follow settings (${theme})`, async ({page}) => {
        await openPreview(page, theme);
        await page.evaluate(async () => {
            const s = await import("/webview/store.mjs");
            window.__hostBase = structuredClone(s.getModel());
            const picker = await import("/webview/ui/picker.mjs");
            picker.openPicker({title: "Layout", contextKeycode: "KC_A", seed: ["KC_A"], onPick: () => {}});
        });
        await sendLayout(page, 1, 2);
        await expect(page.locator('.pkb-key[data-pick="KC_2"]')).toHaveText("2@€™");
        await expect(page.locator('.pkb-key[data-pick="KC_E"]')).toContainText("´ ◌");
        await expect(page.locator('.pkb-key[data-pick="KC_GRV"]')).toContainText("`");
        await sendLayout(page, 1, 2, true);
        await expect(page.locator('.pkb-key[data-pick="KC_GRV"] .pkb-main')).toHaveText("§");
        await expect(page.locator('.pkb-key[data-pick="KC_GRV"] .pkb-alt')).toHaveText("±");
        await page.locator("#pickerSearch").fill("KC_GRV");
        await expect(page.locator('[data-pick="KC_GRAVE"]')).toContainText("§");
    });
}
