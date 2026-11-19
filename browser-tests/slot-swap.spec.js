// @ts-check
"use strict";
// Swapping two slots on the Macros, Custom keys and Pointing modes screens
// (D-L81): a tile dragged onto another posts the bank's swap, and so does
// Shift+Space on a held tile then on another; the selection follows the
// dragged thing. New and the disclosure take no drop.
const {test, expect} = require("@playwright/test");
const {openControls, clearPosts, publishAccepted} = require("./control-preview");

const swaps = (page, type) => page.evaluate((kind) => window.__posted.filter(m => m.type === kind), type);
/** @param {import("@playwright/test").Page} page @param {string} field */
async function panelState(page, field) {
    return page.evaluate(async (name) => {
        const store = await import("/webview/store.mjs");
        return /** @type {any} */ (store.state)[name];
    }, field);
}

test("dragging a macro tile onto another swaps the two, and the dragged macro stays open where it is now", async ({page}) => {
    await openControls(page, "macros", {macroSlot: "MACRO_0", allSlotsShown: ["macros"]});
    const from = page.locator('[data-slot="MACRO_0"]'), to = page.locator('[data-slot="MACRO_1"]');
    await expect(from).toHaveAttribute("aria-current", "true");
    await from.dragTo(to);
    await expect.poll(() => swaps(page, "swapMacros")).toEqual([expect.objectContaining({type: "swapMacros", keycodes: ["MACRO_0", "MACRO_1"]})]);
    expect(await panelState(page, "macroSlot")).toBe("MACRO_1");
    await expect(to).toHaveAttribute("aria-current", "true");
    await expect(page.locator(".mslot.dragging, .mslot.drop-target")).toHaveCount(0, {timeout: 1000});
});

test("a press that never moves picks the tile, and a drop on New or the disclosure swaps nothing", async ({page}) => {
    await openControls(page, "macros", {macroSlot: "MACRO_0", allSlotsShown: ["macros"]});
    const tile = page.locator('[data-slot="MACRO_1"]');
    await tile.click();
    await expect(tile).toHaveAttribute("aria-current", "true");
    await tile.dragTo(page.locator(".macro-grid .new-slot"));
    await tile.dragTo(page.locator(".macro-grid .all-slots"));
    await expect.poll(() => swaps(page, "swapMacros")).toEqual([]);
});

test("Shift+Space holds a custom key, Shift+Space on another swaps them, and Escape lets go", async ({page}) => {
    await openControls(page, "customKeys", {customKey: "CUSTOM_KEY_0", allSlotsShown: ["customKeys"]});
    const a = page.locator('[data-custom-key="CUSTOM_KEY_0"]'), b = page.locator('[data-custom-key="CUSTOM_KEY_2"]');
    await a.focus();
    await page.keyboard.press("Shift+ ");
    await expect(page.locator('[data-custom-key="CUSTOM_KEY_0"]')).toHaveClass(/held/);
    await expect(page.locator('[data-custom-key="CUSTOM_KEY_0"]')).toBeFocused();
    await expect(page.locator("#ark-status")).toContainText("held for a swap");
    await page.keyboard.press("Escape");
    await expect(page.locator('[data-custom-key="CUSTOM_KEY_0"].held')).toHaveCount(0);
    await clearPosts(page);
    await page.locator('[data-custom-key="CUSTOM_KEY_0"]').focus();
    await page.keyboard.press("Shift+ ");
    await b.focus();
    await page.keyboard.press("Shift+Enter");
    await expect.poll(() => swaps(page, "swapCustomKeys")).toEqual([expect.objectContaining({type: "swapCustomKeys", keycodes: ["CUSTOM_KEY_0", "CUSTOM_KEY_2"]})]);
    expect(await panelState(page, "customKey")).toBe("CUSTOM_KEY_2");
    expect(await panelState(page, "heldSlot")).toBe(null);
});

test("dragging a pointing mode onto an empty slot swaps the two by slot number", async ({page}) => {
    await openControls(page, "pointing", {pointingSlot: 1, allSlotsShown: ["pointing"]});
    await page.locator('.pointing-grid [data-slot="1"]').dragTo(page.locator('.pointing-grid [data-slot="9"]'));
    await expect.poll(() => swaps(page, "swapPdModes")).toEqual([expect.objectContaining({type: "swapPdModes", slots: [1, 9]})]);
    expect(await panelState(page, "pointingSlot")).toBe(9);
});

test("a read-only keyboard's tiles take no drag and no hold", async ({page}) => {
    await openControls(page, "macros", {macroSlot: "MACRO_0", allSlotsShown: ["macros"]});
    await publishAccepted(page, ["draft", "editable"], false);
    const from = page.locator('[data-slot="MACRO_0"]');
    await from.dragTo(page.locator('[data-slot="MACRO_1"]'));
    await from.focus();
    await page.keyboard.press("Shift+ ");
    await expect.poll(() => swaps(page, "swapMacros")).toEqual([]);
    await expect(page.locator(".mslot.held")).toHaveCount(0);
});
