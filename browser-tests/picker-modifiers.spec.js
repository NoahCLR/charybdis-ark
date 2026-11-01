// @ts-check
"use strict";
const {test, expect} = require("@playwright/test");
const {openControls, clearPosts} = require("./control-preview");

// A picker for one key, as the Keymap opens one, seeded with what the key holds.
async function openKeyPicker(page, seed) {
    await page.evaluate(async (seed) => {
        const {openPicker} = await import("/webview/ui/picker.mjs");
        const {post} = await import("/webview/store.mjs");
        const {setKey} = await import("/webview/view/edits.mjs");
        openPicker({title: "Key", seed: [seed], onPick: key => post(setKey("Layer 0", 0, key))});
    }, seed);
    return page.getByRole("dialog", {name: "Pick a keycode"});
}
const postedKey = (page) => page.evaluate(() => window.__posted.at(-1)?.changes?.[0]?.keycode ?? window.__posted.at(-1)?.keycode);

test("a modifier key on the board and its button in the row are one: clicking either lights both", async ({page}) => {
    await openControls(page, "keys");
    let picker = await openKeyPicker(page, "KC_A");
    const command = () => picker.locator('[data-mod="G"]');
    const commandKey = () => picker.locator('.pkb-key[data-pick="KC_LGUI"]');
    const a = () => picker.locator('.pkb-key[data-pick="KC_A"]');

    // The board's Left Command lights the row's Command, and A stays picked.
    await commandKey().click();
    await expect(command()).toHaveAttribute("aria-pressed", "true");
    await expect(commandKey()).toHaveClass(/\bon\b/);
    await expect(a()).toHaveClass(/\bon\b/);
    // And the row's Command takes it off the board again.
    await command().click();
    await expect(commandKey()).not.toHaveClass(/\bon\b/);
    await command().click();
    await expect(commandKey()).toHaveClass(/\bon\b/);
    await clearPosts(page);
    await picker.locator('[data-act="use"]').click();
    await expect.poll(() => postedKey(page)).toBe("G(KC_A)");

    // Reopened, Command+A shows as A with Command lit, row and board alike.
    picker = await openKeyPicker(page, "G(KC_A)");
    await expect(command()).toHaveAttribute("aria-pressed", "true");
    await expect(commandKey()).toHaveClass(/\bon\b/);
    await expect(a()).toHaveClass(/\bon\b/);
    await command().click();
    await clearPosts(page);
    await picker.locator('[data-act="use"]').click();
    await expect.poll(() => postedKey(page)).toBe("KC_A");

    // A modifier key alone is its button, and stores as that key.
    picker = await openKeyPicker(page, "KC_LEFT_GUI");
    await expect(command()).toHaveAttribute("aria-pressed", "true");
    await expect(commandKey()).toHaveClass(/\bon\b/);
    await clearPosts(page);
    await picker.locator('[data-act="use"]').click();
    await expect.poll(() => postedKey(page)).toBe("KC_LEFT_GUI");
});
