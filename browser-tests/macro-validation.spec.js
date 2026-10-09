"use strict";
const {test, expect} = require("@playwright/test");

async function openEmptyMacro(page) {
    await page.goto("/preview/index.html");
    await page.locator('[data-screen="macros"]').click();
    await page.locator('[data-slot="VIA_MACRO_28"]').click();
    await page.evaluate(() => {window.__posted.length = 0;});
    return page.locator("textarea").first();
}

test("macro syntax feedback updates without blur and stages only valid completed text", async ({page}) => {
    const textarea = await openEmptyMacro(page);
    await textarea.fill("{KC_A");
    await expect(page.locator(".unavailable")).toContainText("missing its }");
    await expect(textarea).toBeFocused();
    expect(await page.evaluate(() => window.__posted)).toEqual([]);
    await textarea.press("Tab");
    expect(await page.evaluate(() => window.__posted)).toEqual([]);
    await textarea.fill("{KC_A}");
    await expect(page.locator(".unavailable")).toHaveCount(0);
    await expect(page.locator(".step .tok")).toHaveText("KC_A");
    await expect(textarea).toBeFocused();
    expect(await page.evaluate(() => window.__posted)).toEqual([]);
    await textarea.press("Tab");
    expect(await page.evaluate(() => window.__posted)).toEqual([
        expect.objectContaining({type: "updateViaMacro", keycode: "VIA_MACRO_28", payload: "{KC_A}"}),
    ]);
});

test("rapid edits keep the current feedback, textarea and selection", async ({page}) => {
    const textarea = await openEmptyMacro(page);
    await textarea.focus();
    expect(await textarea.evaluate(node => {
        window.__originalMacroInput = node;
        for (const value of ["{", "}", "café", "current text"]) {
            node.value = value;
            node.setSelectionRange(2, 5);
            node.dispatchEvent(new Event("input", {bubbles: true}));
        }
        return {same: document.querySelector("textarea") === node, selection: [node.selectionStart, node.selectionEnd], focused: document.activeElement === node};
    })).toEqual({same: true, selection: [2, 5], focused: true});
    await expect(page.locator(".unavailable")).toHaveCount(0);
    await expect(page.locator(".step .tok")).toHaveText("current text");
    expect(await page.evaluate(() => window.__posted)).toEqual([]);
});

test("held-key and ASCII errors clear live, and local errors stay with their slot", async ({page}) => {
    const textarea = await openEmptyMacro(page);
    await textarea.fill("{+KC_A}");
    await expect(page.locator(".unavailable")).toContainText("never releases KC_A");
    await textarea.fill("{+KC_A}{-KC_A}");
    await expect(page.locator(".unavailable")).toHaveCount(0);
    await textarea.fill("café");
    await expect(page.locator(".unavailable")).toContainText("ASCII");
    await page.locator('[data-slot="VIA_MACRO_29"]').click();
    await expect(page.locator(".unavailable")).toHaveCount(0);
    await page.locator('[data-slot="VIA_MACRO_28"]').click();
    await expect(page.locator(".unavailable")).toContainText("ASCII");
    await page.getByRole("button", {name: "Discard local text"}).click();
    await expect(textarea).toHaveValue("");
    await expect(page.locator(".unavailable")).toHaveCount(0);
    expect(await page.evaluate(() => window.__posted)).toEqual([]);
});

test("Clear payload removes stale validation and posts the empty macro", async ({page}) => {
    const textarea = await openEmptyMacro(page);
    await textarea.fill("{KC_A");
    await expect(page.locator(".unavailable")).toContainText("missing its }");
    await page.getByRole("button", {name: "Clear payload"}).click();
    await expect(textarea).toHaveValue("");
    await expect(page.locator(".unavailable")).toHaveCount(0);
    expect(await page.evaluate(() => window.__posted)).toEqual([
        expect.objectContaining({type: "updateViaMacro", payload: ""}),
    ]);
});
