// @ts-check
"use strict";
const {test, expect} = require("@playwright/test");
const {openControls, clearPosts, posted} = require("./control-preview");

// Letters typed or pasted into a number field never appear in it, so the
// field never shows text the edit would refuse.
test("a whole-number setting shows and posts only the digits typed into it", async ({page}) => {
    await openControls(page, "behaviours");
    const field = page.locator('.setrow input[inputmode="numeric"]:not([disabled])').first();
    await field.fill("");
    await field.pressSequentially("1a2b");
    await expect(field).toHaveValue("12");
    // The caret stays after what was typed, not at the end.
    await field.press("Home");
    await field.pressSequentially("x9");
    await expect(field).toHaveValue("912");
    await page.keyboard.insertText("q-");
    await expect(field).toHaveValue("912");
    await clearPosts(page);
    await field.press("Tab");
    await expect.poll(() => posted(page).then(JSON.stringify)).toContain('"912"');
});

test("a duration keeps one decimal point and no letters", async ({page}) => {
    // The idle timeout, beside All lighting at the top of Lighting.
    await openControls(page, "lighting");
    const field = page.locator('[data-f="setting:lightingTimeout"]');
    await field.fill("");
    await field.pressSequentially("1.5.s");
    await expect(field).toHaveValue("1.5");
});

test("a pointing tuning field drops pasted letters", async ({page}) => {
    await openControls(page, "pointing", {pointingSlot: 0});
    const field = page.locator('.pd-editor input[inputmode="numeric"]:not([disabled])').first();
    await field.fill("");
    await page.keyboard.insertText("4x0");
    await expect(field).toHaveValue("40");
});

test("a macro delay refuses the letters and signs a number field would allow", async ({page}) => {
    await openControls(page, "macros", {macroSlot: "MACRO_17"});
    await page.locator('[data-insert-kind="delay"]').click();
    const field = page.locator("[data-step-delay]");
    await field.fill("");
    await field.pressSequentially("1e-+.2");
    await expect(field).toHaveValue("12");
});
