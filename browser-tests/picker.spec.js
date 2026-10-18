// @ts-check
"use strict";
// The keycode picker's controls post what they show (AGENTS.md, "Proving a
// control is wired"): the Hold slot, Basics, search with typed expressions
// and the keyboard, and never Use key for what the draft would refuse (B10).
const {test, expect} = require("@playwright/test");
const {openControls, clearPosts, posted} = require("./control-preview");

/** @param {import("@playwright/test").Page} page */
async function openPicker(page, {hold = false} = {}) {
    await openControls(page, "keys", {tab: "key", selected: 10});
    if (hold) await page.evaluate(async () => (await import("/webview/ui/keys/key-edits.mjs")).pickKeycodeFor(10, {hold: true}));
    else await page.locator('[data-act="pick"]').click();
    const picker = page.getByRole("dialog", {name: "Choose a key"});
    await expect(picker).toBeVisible();
    await clearPosts(page);
    return picker;
}
const changes = (keycode) => [expect.objectContaining({type: "updateLayoutKeys", changes: [{layoutIndex: 10, keycode}]})];

test("the header names the key and its layer, never an index", async ({page}) => {
    const picker = await openPicker(page);
    await expect(picker.locator("h2")).toHaveText(/^Change .+ on .+$/);
    await expect(picker).not.toContainText("index 10");
});

test("Hold ▸ Ctrl over Esc posts a mod-tap", async ({page}) => {
    const picker = await openPicker(page);
    await picker.locator('[data-pick="KC_ESC"]').click();
    await picker.locator('[data-act="holdmenu"]').click();
    await picker.locator('[data-hold="mod:MOD_LCTL"]').click();
    await expect(picker.locator(".pk-value")).toHaveText("MT(MOD_LCTL, KC_ESC)");
    await picker.locator('[data-act="use"]').click();
    await expect.poll(() => posted(page)).toEqual(changes("MT(MOD_LCTL, KC_ESC)"));
});

test("Add a hold opens with the Hold menu focused; a layer hold keeps the tap", async ({page}) => {
    const picker = await openPicker(page, {hold: true});
    await expect(picker.locator(".pk-menu")).toBeVisible();
    await expect(picker.locator('[data-act="holdmenu"]')).toBeFocused();
    await picker.locator('[data-holdnav="layer"]').click();
    await picker.locator('[data-hold="layer:3"]').click();
    await picker.locator('[data-pick="KC_F"]').click();
    // A tap with a hold takes no modifiers: the chips say why.
    await expect(picker.locator('[data-mod="S"]')).toHaveAttribute("aria-disabled", "true");
    await picker.locator('[data-mod="S"]').click({force: true});
    await expect(picker.locator(".pk-value")).toHaveText("LT(3, KC_F)");
    await picker.locator('[data-act="use"]').click();
    await expect.poll(() => posted(page)).toEqual(changes("LT(3, KC_F)"));
});

test("a trackball-mode hold posts one behaviour edit with its scope chosen", async ({page}) => {
    const picker = await openPicker(page);
    await picker.locator('[data-pick="KC_SPC"]').click();
    await picker.locator('[data-act="holdmenu"]').click();
    await picker.locator('[data-holdnav="mode"]').click();
    await picker.locator('[data-hold="mode:0"]').click();
    await expect(picker.locator(".pk-scope")).toContainText("Every");
    await picker.locator('[data-f="picker:hold-scope:every"]').check();
    await picker.locator('[data-act="use"]').click();
    const [message] = await posted(page);
    expect(message.type).toBe("saveBehavior");
    expect(message.behavior.steps).toEqual([{tapCount: 0, hold: {helper: "PRESS_AND_HOLD_UNTIL_RELEASE", action: "PD_SLOT_0", repeatHz: "0"}}]);
    expect(message.then).toEqual({type: "updateLayoutKeys", layer: expect.any(String), changes: [{layoutIndex: 10, keycode: "KC_SPC"}]});
});

test("only this key: a custom key sending the tap takes the hold", async ({page}) => {
    const picker = await openPicker(page);
    await picker.locator('[data-pick="KC_SPC"]').click();
    await picker.locator('[data-act="holdmenu"]').click();
    await picker.locator('[data-holdnav="mode"]').click();
    await picker.locator('[data-hold="mode:0"]').click();
    await picker.locator('[data-f="picker:hold-scope:this"]').check();
    await picker.locator('[data-act="use"]').click();
    const [message] = await posted(page);
    expect(message.type).toBe("updateCustomKeyShortcut");
    expect(message.shortcut).toEqual({mods: 0, key: 0x2c});
    expect(message.then.map((edit) => edit.type)).toEqual(["saveBehavior", "updateLayoutKeys"]);
});

test("search finds layer keys; arrows walk the results and Enter uses one", async ({page}) => {
    const picker = await openPicker(page);
    const search = picker.locator('[data-f="picker:search"]');
    await search.fill("numbers");
    await expect(picker.locator(".pk-results [data-pick]").first()).toContainText("Hold");
    await search.press("ArrowDown");
    await expect(search).toBeFocused();
    await search.press("Enter");
    await expect.poll(() => posted(page)).toEqual(changes("LOCK_LAYER(1)"));
});

test("a typed expression is the first result and Enter uses it", async ({page}) => {
    const picker = await openPicker(page);
    const search = picker.locator('[data-f="picker:search"]');
    await search.fill("lctl_t(kc_a)");
    await expect(picker.locator("[data-typed]")).toContainText("Use LCTL_T(KC_A)");
    await search.press("Enter");
    await expect.poll(() => posted(page)).toEqual(changes("MT(MOD_LCTL, KC_A)"));
});

test("what the draft refuses is never offered (B10)", async ({page}) => {
    const picker = await openPicker(page);
    const search = picker.locator('[data-f="picker:search"]');
    await search.fill("S(MO(2))");
    await expect(picker.locator("[data-typed]")).toHaveAttribute("aria-disabled", "true");
    await search.press("Enter");
    await search.fill("");
    await picker.locator('[data-sec="layers"]').click();
    await picker.locator('[data-pick="MO(2)"]').click();
    await expect(picker.locator('[data-mod="S"]')).toHaveAttribute("aria-disabled", "true");
    await picker.locator('[data-sec="modes"]').click();
    await picker.locator('[data-pick="PD_SLOT_0"]').click();
    await expect(picker.locator('[data-mod="G"]')).toHaveAttribute("aria-disabled", "true");
    await picker.locator('[data-mod="G"]').click({force: true});
    await expect(picker.locator('[data-act="use"]')).toBeEnabled();
    await picker.locator('[data-act="use"]').click();
    await expect.poll(() => posted(page)).toEqual(changes("PD_SLOT_0"));
});

test("Basics, double-click and Enter on a key use it at once", async ({page}) => {
    let picker = await openPicker(page);
    await picker.locator('.pk-basics [data-pick="KC_NO"]').dblclick();
    await expect.poll(() => posted(page)).toEqual(changes("KC_NO"));
    picker = await openPicker(page);
    await picker.locator('.pkb [data-pick="KC_Q"]').focus();
    await page.keyboard.press("Enter");
    await expect.poll(() => posted(page)).toEqual(changes("KC_Q"));
});

test("empty slots fold, and dangerous keys say what they do", async ({page}) => {
    const picker = await openPicker(page);
    await picker.locator('[data-sec="macros"]').click();
    const fold = picker.locator("[data-empty=\"macros\"]");
    await expect(fold).toHaveText(/^Show \d+ empty$/);
    const before = await picker.locator("[data-pick^=\"VIA_MACRO_\"]").count();
    await fold.click();
    expect(await picker.locator("[data-pick^=\"VIA_MACRO_\"]").count()).toBeGreaterThan(before);
    await picker.locator('[data-sec="else"]').click();
    const boot = picker.locator('[data-pick="QK_BOOTLOADER"]');
    await expect(boot).toContainText("⚠");
    await expect(boot).toHaveAttribute("data-tip", /flashing mode/);
});
