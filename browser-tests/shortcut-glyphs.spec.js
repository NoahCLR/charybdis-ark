// @ts-check
"use strict";
const {test, expect} = require("@playwright/test");

// Shortcuts are written as this computer presses them (view/shortcuts.mjs):
// ⌘ on a Mac, Ctrl elsewhere, in the visible text and in every tip.
/** @param {import("@playwright/test").Page} page */
const shownWords = (page) => page.evaluate(() => [document.body.innerText,
    ...[...document.querySelectorAll("[data-tip], [title], [aria-keyshortcuts]")].flatMap((node) =>
        ["data-tip", "title", "aria-keyshortcuts"].map((name) => node.getAttribute(name) || ""))].join("\n"));

for (const [platform, mac] of [["Win32", false], ["Linux x86_64", false], ["MacIntel", true]]) {
    for (const shell of ["demo-edited", "live", "live-auto"]) test(`shortcuts read as ${mac ? "⌘" : "Ctrl"} on ${platform} (${shell})`, async ({page}) => {
        await page.addInitScript((name) => Object.defineProperty(Navigator.prototype, "platform", {get: () => name}), platform);
        await page.goto(`/preview/index.html?shell=${shell}`);
        await page.locator('[data-screen="keys"]').click();
        await page.locator("[data-key]").first().click();
        await page.locator('.commit [data-act="review"]').first().click();
        await expect(page.locator(".sheet")).toBeVisible();
        const words = await shownWords(page);
        expect(words).toContain(mac ? "⌘Z" : "Ctrl+Z");
        if (mac) expect(words).toContain("Meta+Z");
        else {
            expect(words).not.toContain("⌘");
            expect(words).not.toContain("⇧");
            expect(words).toContain("Control+Z");
        }
    });
}

test("the board's Shortcuts list names the shortcuts this computer uses", async ({page}) => {
    await page.addInitScript(() => Object.defineProperty(Navigator.prototype, "platform", {get: () => "Win32"}));
    await page.goto("/preview/index.html");
    await page.locator('[data-screen="keys"]').click();
    await page.locator("[data-key]").first().click();
    await page.getByRole("button", {name: "Shortcuts"}).hover();
    const list = page.locator("#board-shortcuts");
    await expect(list).toContainText("Ctrl+C, Ctrl+V");
    await expect(list).toContainText("Copy a key, paste it onto the selected one");
    await expect(list).toContainText("Ctrl+Z, Ctrl+Shift+Z");
    // Previewing layers together is listed too, with this computer's key.
    await expect(list).toContainText("Ctrl-click a layer");
    await expect(list).toContainText("Preview it on with the others");
    expect(await shownWords(page)).not.toContain("⌘");
});

// The board's shortcuts wait behind an info mark on its top-right corner:
// hovering it, or tabbing to it, shows them; leaving or Escape hides them.
test("the board's info mark previews its Shortcuts list on hover, opens it on a press until Escape or a press elsewhere, and Escape hides it", async ({page}) => {
    await page.goto("/preview/index.html");
    await page.locator('[data-screen="keys"]').click();
    const board = page.locator(".keys-pad .board");
    const mark = board.getByRole("button", {name: "Shortcuts"});
    const list = page.locator("#board-shortcuts");
    await expect(mark).toHaveAttribute("aria-describedby", "board-shortcuts");
    await expect(list).toBeHidden();
    await expect(page.locator(".board-legend")).not.toContainText("Shortcuts");

    // On the board's top-right corner.
    const [markBox, boardBox] = [await mark.boundingBox(), await board.boundingBox()];
    if (!markBox || !boardBox) throw new Error("no layout");
    expect(boardBox.x + boardBox.width - (markBox.x + markBox.width)).toBeLessThan(24);
    expect(markBox.y - boardBox.y).toBeLessThan(24);

    await mark.hover();
    await expect(list).toBeVisible();
    await expect(list).toContainText("Double-click");
    await expect(list).toContainText("Swap the two keys");
    await expect(list).toContainText("Make the selected key transparent");
    // The pointer can cross onto the list without it closing.
    await list.hover();
    await expect(list).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(list).toBeHidden();
    // Leaving and coming back shows it again.
    await page.locator(".board-legend").hover();
    await mark.hover();
    await expect(list).toBeVisible();
    await page.locator(".board-legend").hover();
    await expect(list).toBeHidden();

    // Reached by the keyboard, Enter opens it and keeps it open; the focus
    // alone opens nothing, the list being the mark's description (D-L96).
    await mark.focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await expect(mark).toBeFocused();
    await expect(list).toBeHidden();
    await expect(mark).toHaveAttribute("aria-expanded", "false");
    await page.keyboard.press("Enter");
    await expect(list).toBeVisible();
    await expect(mark).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Escape");
    await expect(list).toBeHidden();
    await expect(mark).toBeFocused();
    await expect(mark).toHaveAttribute("aria-expanded", "false");

    // A click keeps it open once the pointer leaves, and across a redraw;
    // a press elsewhere closes it, and so does a second click.
    await mark.click();
    await page.locator(".board-legend").hover();
    await expect(list).toBeVisible();
    await page.evaluate(async () => (await import("/webview/store.mjs")).render());
    await expect(list).toBeVisible();
    await page.locator(".topbar h1, .topbar").first().click();
    await expect(list).toBeHidden();
    await mark.click();
    await expect(list).toBeVisible();
    await mark.click();
    await expect(list).toBeHidden();
});

test("while the board takes no edit, the Shortcuts list says only selecting and copying", async ({page}) => {
    await page.goto("/preview/index.html?shell=live-held");
    await page.locator('[data-screen="keys"]').click();
    await page.getByRole("button", {name: "Shortcuts"}).hover();
    const list = page.locator("#board-shortcuts");
    await expect(list).toBeVisible();
    await expect(list).toContainText("Select a key to read it");
    await expect(list).toContainText("Copy the selected key");
    await expect(list).not.toContainText("Double-click");
    await expect(list).not.toContainText("transparent");
});
