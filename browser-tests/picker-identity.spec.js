// @ts-check
"use strict";
const {test, expect} = require("@playwright/test");
const {openControls, clearPosts, posted} = require("./control-preview");

// The keycode picker stays open while the core publishes new models, and what
// it hands back is posted by the screen that opened it. An edit whose content
// comes from the picker alone names the draft as it is when posted; one that
// carries a row drawn before the picker opened names the draft that row was
// drawn from, so the core refuses it rather than overwrite a newer edit.

// Another edit accepted while the picker is open, as the core publishes it:
// the draft's next revision, and a new identity for every editor that names
// one, with `customKeys` the fields it changed on custom keys by keycode. The
// preview never applies edits itself (control-preview.js).
/** @param {import("@playwright/test").Page} page @param {Record<string, object>} [customKeys] */
const anotherEdit = (page, customKeys = {}) => page.evaluate(async (customKeys) => {
    const {getModel} = await import("/webview/store.mjs");
    const before = getModel();
    const model = structuredClone(before);
    const revision = ++model.draft.revision, fingerprint = `unrelated-edit-${revision}`;
    model.profileIdentity = {...model.profileIdentity, generation: revision, digest: fingerprint};
    model.customKeyEditing.identity = fingerprint;
    for (const [keycode, fields] of Object.entries(customKeys)) Object.assign(model.customKeys.find((row) => row.keycode === keycode), fields);
    window.dispatchEvent(new MessageEvent("message", {data: {
        type: "model", model,
        acceptedEdit: {message: {type: "updateLayoutKeys"}, previousFingerprint: "before", fingerprint},
    }}));
    return {drawn: {base: before.profileIdentity, fingerprint: before.customKeyEditing.identity},
        current: {revision, base: model.profileIdentity, fingerprint}};
}, customKeys);

// A custom key's shortcut is the picker's whole choice, so another edit made
// while the picker is open leaves it nothing to refuse.
test("a custom key's shortcut picked across another edit names the current draft", async ({page}) => {
    await openControls(page, "customKeys", {customKey: "CUSTOM_KEY_1"});
    await page.locator('[data-act="pick-shortcut"]').click();
    const {current} = await anotherEdit(page);
    await expect(page.locator(".picker")).toBeVisible();
    await page.locator('.picker [data-mod="C"]').click();
    await page.locator("#pickerSearch").fill("KC_K");
    await page.locator('.picker [data-pick="KC_K"]').first().click();
    await clearPosts(page);
    await page.locator('.picker [data-act="use"]').click();
    await expect.poll(() => posted(page)).toEqual([expect.objectContaining({type: "updateCustomKeyShortcut", keycode: "CUSTOM_KEY_1",
        shortcut: {mods: 0x01, keys: [0x0e], layers: 0, layerKind: 0}, draftRevision: current.revision, expectedFingerprint: current.fingerprint})]);
});

// The picker's choice is weighed against the key as it is when posted: the
// shortcut the picker opened with, kept after the key lost it meanwhile, is
// posted again.
test("a custom key's shortcut kept as it opened posts when the key changed meanwhile", async ({page}) => {
    await openControls(page, "customKeys", {customKey: "CUSTOM_KEY_1"});
    await page.evaluate(async () => {
        const store = await import("/webview/store.mjs");
        const model = structuredClone(store.getModel());
        Object.assign(model.customKeys.find((row) => row.keycode === "CUSTOM_KEY_1"), {shortcut: {mods: 0x01, keys: [0x0e], layers: 0, layerKind: 0}, shortcutLabel: "Left Ctrl + K"});
        store.setModel(model); store.render();
    });
    await page.locator('[data-act="pick-shortcut"]').click();
    const {current} = await anotherEdit(page, {CUSTOM_KEY_1: {shortcut: {mods: 0, keys: [], layers: 0, layerKind: 0}, shortcutLabel: ""}});
    await clearPosts(page);
    await page.locator('.picker [data-act="use"]').click();
    await expect.poll(() => posted(page)).toEqual([expect.objectContaining({type: "updateCustomKeyShortcut", keycode: "CUSTOM_KEY_1",
        shortcut: {mods: 0x01, keys: [0x0e], layers: 0, layerKind: 0}, expectedFingerprint: current.fingerprint})]);
});

// A behaviour cell posts its whole row as it was drawn when the picker
// opened, so it names the draft of that moment: after another edit the core
// refuses it, where the current identity would overwrite that edit.
test("a behaviour cell picked across another edit names the draft its row was drawn from", async ({page}) => {
    await openControls(page, "customKeys", {customKey: "CUSTOM_KEY_5"});
    await page.locator('.custom-key-behaviour [data-cell="0-hold"]').click();
    await page.locator('.cell-editor [data-act="pick"]').click();
    const {drawn, current} = await anotherEdit(page);
    await page.locator("#pickerSearch").fill("KC_B");
    await page.locator('.picker [data-pick="KC_B"]').first().click();
    await clearPosts(page);
    await page.locator('.picker [data-act="use"]').click();
    await expect.poll(() => posted(page)).toEqual([expect.objectContaining({type: "saveBehavior", draftRevision: current.revision, expectedBase: drawn.base,
        behavior: expect.objectContaining({keycode: "CUSTOM_KEY_5", steps: [expect.objectContaining({tapCount: 0, hold: expect.objectContaining({action: "KC_B"})})]})})]);
});

// A custom key made for the cell is the picker's own choice, made in the
// current draft; the row it carries (D-L63) still names the draft it was
// drawn from.
test("a custom key made for a behaviour cell across another edit carries the row's drawn identity", async ({page}) => {
    await openControls(page, "customKeys", {customKey: "CUSTOM_KEY_5"});
    await page.locator('.custom-key-behaviour [data-cell="0-hold"]').click();
    await page.locator('.cell-editor [data-act="pick"]').click();
    const {drawn, current} = await anotherEdit(page);
    for (const mod of ["C", "S", "RCTL", "RSFT"]) await page.locator(`.picker [data-mod="${mod}"]`).click();
    await clearPosts(page);
    await page.locator('.picker [data-act="use-custom-key"]').click();
    await expect.poll(() => posted(page)).toEqual([expect.objectContaining({type: "updateCustomKeyShortcut", expectedFingerprint: current.fingerprint,
        then: expect.objectContaining({type: "saveBehavior", expectedBase: drawn.base})})]);
});
