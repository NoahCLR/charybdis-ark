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
    await expectPost(page, {type: "updateComboDefaultWindow", defaultTermMs: "77"});
    await clearPosts(page);
    await change(page.locator('[data-f="settings:combo:hold"]'), 233);
    await expectPost(page, {type: "updateComboHoldTerm", holdTermMs: "233"});
});

test("Settings: the combo layer matching grid posts its section whole; search says when nothing matches and where else to look", async ({page}) => {
    await openControls(page, "settings");
    await page.locator('[data-section="comboReferences"] > summary').click();
    const select = page.locator('[data-f="setting:comboReference1"]');
    await expect(select).toBeVisible();
    await select.selectOption("Layer 0");
    await expect.poll(() => page.evaluate(() => window.__posted)).toEqual([expect.objectContaining({type: "updateConfigDefaults", sectionId: "comboReferences",
        fields: expect.arrayContaining([expect.objectContaining({macro: "comboReference1", value: "Layer 0"})])})]);
    await page.locator("#settingsSearch").fill("qwerty");
    await expect(page.locator(".settings-empty")).toHaveText("No setting matches “qwerty”.");
    await page.locator("#settingsSearch").fill("dpi");
    await page.getByRole("button", {name: /matches? on Mouse →/}).click();
    await expect(page.locator('[data-screen="mouse"]')).toHaveAttribute("aria-current", "true");
});

test("Keyboard: the title renames the keyboard, and memory and diagnostics live here", async ({page}) => {
    await openControls(page, "device");
    const title = page.locator('[data-f="keyboard:name"]');
    await expect(title).toBeEnabled();
    await title.click();
    await expect(page.locator(".rename-note")).toBeVisible();
    await clearPosts(page);
    await title.fill("Desk 777");
    await title.press("Enter");
    await expect.poll(() => page.evaluate(() => window.__posted)).toEqual([expect.objectContaining({type: "renameKeyboard", name: "Desk 777"})]);
    await expect(page.locator(".card.usage")).toHaveCount(1);
    await expect(page.locator('[data-section="diagnostics"]')).not.toHaveAttribute("open", "");
    await clearPosts(page);
    await page.locator('[data-section="diagnostics"] [data-act="read"]').click();
    await expect.poll(() => page.evaluate(() => window.__posted)).toEqual([expect.objectContaining({type: "refresh"})]);
    await expect(page.locator('[data-section="diagnostics"]')).not.toHaveAttribute("open", "");
    await page.locator('[data-screen="settings"]').click();
    await expect(page.locator('[data-f="settings:keyboard-name"]')).toHaveCount(0);
});

test("Keyboard: opening Diagnostics reads the flash pauses once, and its Read keyboard reads them after the keyboard", async ({page}) => {
    await openControls(page, "device");
    const fold = page.locator('[data-section="diagnostics"]');
    await clearPosts(page);
    await fold.locator("summary h3").click();
    await expect(fold).toHaveAttribute("open", "");
    await expect.poll(() => page.evaluate(() => window.__posted)).toEqual([expect.objectContaining({type: "readFlashPauses"})]);
    await expect(fold.locator(".flash-pauses-section")).toContainText("Not read yet.");
    await clearPosts(page);
    await fold.locator('[data-act="read"]').click();
    await expect.poll(() => page.evaluate(() => window.__posted)).toEqual([expect.objectContaining({type: "refresh", flashPauses: true})]);
    await expect(fold).toHaveAttribute("open", "");
    await clearPosts(page);
    await fold.locator("summary h3").click();
    await expect(fold).not.toHaveAttribute("open", "");
    await fold.locator('[data-act="read"]').click();
    await expect.poll(() => page.evaluate(() => window.__posted)).toEqual([{type: "refresh", draftId: expect.any(String), draftRevision: expect.any(Number)}]);
});

test("Keyboard: an open Diagnostics reads the flash pauses of each connection once, when nothing holds the keyboard", async ({page}) => {
    await openControls(page, "device");
    await page.locator('[data-section="diagnostics"] summary h3').click();
    /** @param {{connectionToken: number, busy?: boolean, read?: boolean}} next */
    const publish = (next) => page.evaluate(async ({connectionToken, busy, read}) => {
        const {getModel} = await import("/webview/store.mjs");
        const model = structuredClone(getModel());
        model.load = {...model.load, connectionToken};
        model.device.health.busy = Boolean(busy);
        model.device.flashPauses = read ? {state: "unavailable", error: "x"} : null;
        window.__posted.length = 0;
        window.dispatchEvent(new MessageEvent("message", {data: {type: "model", model}}));
        await new Promise((resolve) => setTimeout(resolve, 50));
        return window.__posted.map((message) => message.type);
    }, next);
    expect(await publish({connectionToken: 7, busy: true})).toEqual([]);
    expect(await publish({connectionToken: 7})).toEqual(["readFlashPauses"]);
    expect(await publish({connectionToken: 7}), "asked once for this connection").toEqual([]);
    expect(await publish({connectionToken: 8, read: true}), "figures already read").toEqual([]);
    expect(await publish({connectionToken: 9}), "a reconnected keyboard is read too").toEqual(["readFlashPauses"]);
});

test("Keyboard: the demo's Diagnostics shows sample flash pauses for both halves and reads nothing", async ({page}) => {
    await page.goto("/preview/index.html?shell=demo&screen=device");
    const fold = page.locator('[data-section="diagnostics"]');
    await clearPosts(page);
    await fold.locator("summary h3").click();
    const table = fold.locator("table.flash-pauses");
    await expect(table.locator("thead th")).toHaveText(["", "Master half (right)", "Slave half (left)"]);
    await expect(table.locator("tbody tr").first()).toHaveText(/Longest sector erase\s*49\.0 ms\s*48\.7 ms/);
    await expect(table.locator("tbody td.num").first()).toHaveAttribute("data-tip", "49,045 µs");
    expect(await page.evaluate(() => window.__posted)).toEqual([]);
});

test("Backups: a recovery copy is named by what made it and its keyboard, can be used as a draft or deleted, and a chosen file opens as a sheet", async ({page}) => {
    await page.goto("/preview/index.html");
    await page.locator('[data-screen="profile"]').click();
    await expect(page.locator(".card.usage")).toHaveCount(0);
    const names = page.locator(".recovery-row .recovery-name");
    await expect(names.nth(0)).toHaveText(/^Before saving live edits · Charybdis - Home · 6 Oct 2026, \d\d:\d\d$/);
    await expect(names.nth(1)).toHaveText(/^Before leaving Live edit · Charybdis - Home · 4 Oct 2026, \d\d:\d\d$/);
    await expect(names.nth(2)).toHaveText(/^Before saving a draft · Charybdis - Office · 3 Oct 2026, \d\d:\d\d$/);
    await expect(names.nth(3)).toHaveText(/^Recovery copy · 1 Oct 2026, \d\d:\d\d$/);
    await expect(page.locator(".card.recoveries h3")).toHaveText("Recovery copies");
    await clearPosts(page);
    await page.locator(".recovery-row [data-use]").first().click();
    await expect.poll(() => page.evaluate(() => window.__posted)).toEqual([expect.objectContaining({type: "useRecovery", id: 4})]);
    await clearPosts(page);
    await page.locator(".recovery-row [data-delete]").first().click();
    await expect.poll(() => page.evaluate(() => window.__posted)).toEqual([expect.objectContaining({type: "deleteRecovery", id: 4})]);
    // A copy stored before causes were recorded works as any other.
    for (const [attribute, type] of [["data-use", "useRecovery"], ["data-recovery", "downloadRecovery"], ["data-delete", "deleteRecovery"]]) {
        await clearPosts(page);
        await page.locator(`.recovery-row [${attribute}]`).nth(3).click();
        await expect.poll(() => page.evaluate(() => window.__posted)).toEqual([expect.objectContaining({type, id: 1})]);
    }
    await page.evaluate(async () => {
        const store = await import("/webview/store.mjs");
        const model = structuredClone(store.getModel());
        model.portable.review = {incoming: {layers: 16, behaviors: 1, combos: 0, macros: 0, names: []}, current: {layers: 16, behaviors: 1, combos: 0, macros: 0, names: []},
            fileName: "home.charybdis.json", differences: [], fits: {used: 4101, capacity: 53216}};
        store.setModel(model); store.render();
        window.__posted.length = 0;
    });
    const sheet = page.locator(".import-sheet");
    await expect(sheet).toBeVisible();
    await expect(sheet.locator(".import-fits")).toHaveText("This file fits: 4,101 of 53,216 bytes");
    await sheet.locator('[data-act="cancel"]').click();
    await expect.poll(() => page.evaluate(() => window.__posted)).toEqual([expect.objectContaining({type: "cancelPortableReview"})]);
});
