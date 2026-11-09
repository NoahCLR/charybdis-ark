// @ts-check
"use strict";
const {test, expect} = require("@playwright/test");
const {openControls, posted, clearPosts} = require("./control-preview");

// The keycode picker's key sections: named groups on one twelve-column grid,
// All keycodes listing every key, and a search finding any of them.

/** @param {import("@playwright/test").Page} page */
async function openPicker(page) {
    await openControls(page, "keys");
    await page.evaluate(async () => (await import("/webview/ui/keys/key-edits.mjs")).pickKeycodeFor(27));
    return page.locator(".picker");
}

/** @param {import("@playwright/test").Page} page @param {string} keycode */
async function usePosts(page, keycode) {
    await clearPosts(page);
    await page.locator('.picker [data-act="use"]').click();
    await expect.poll(() => posted(page)).toEqual([expect.objectContaining({type: "updateLayoutKeys", changes: [expect.objectContaining({layoutIndex: 27, keycode})]})]);
}

test("every key section's tiles line up on one grid, with no words cut off", async ({page}) => {
    const picker = await openPicker(page);
    for (const section of ["letters", "symbols", "numpad", "common", "macros", "custom", "mouse", "media", "lighting", "magic", "more", "other", "all"]) {
        await picker.locator(`[data-sec="${section}"]`).click();
        const off = await picker.locator(".pk-grid").first().evaluate((first) => {
            const box = first.getBoundingClientRect(), step = (box.width + 8) / 12;
            const onGrid = (tile) => {
                const at = (tile.getBoundingClientRect().left - box.left) / step;
                return Math.abs(at - Math.round(at)) < 0.02;
            };
            return [...document.querySelectorAll(".picker .pk-grid .pk")].filter((tile) => !onGrid(tile)).map((tile) => tile.getAttribute("data-pick"));
        });
        expect(off, `${section}: tiles off the grid`).toEqual([]);
        const cut = await picker.locator(".pk-grid .pk .l, .pk-grid .pk .c").evaluateAll((words) => words.filter((word) => word.scrollWidth > word.clientWidth + 1).map((word) => word.textContent));
        expect(cut, `${section}: words cut off`).toEqual([]);
    }
});

test("a section's keys sit in named groups, and the sections stay in reach as they scroll", async ({page}) => {
    const picker = await openPicker(page);
    await picker.locator('[data-sec="common"]').click();
    await expect(picker.locator(".pk-label").first()).toHaveText("Typing");
    await expect(picker.locator(".pk-label").last()).toHaveText("No key");
    await expect(picker.locator(".pk-group").last().locator("[data-pick]")).toHaveCount(2);
    await picker.locator('[data-sec="macros"]').click();
    await expect(picker.locator('[data-pick="MACRO_100"] .l')).toHaveText("Macro 100");
    await expect(picker.locator('[data-pick="MACRO_100"] .c')).toHaveText("MACRO_100");
    await picker.locator('[data-sec="all"]').click();
    const side = picker.locator(".picker-side");
    const before = (await side.boundingBox())?.y;
    await picker.locator(".picker-keys").evaluate((keys) => { keys.scrollTop = 1500; });
    await expect.poll(async () => (await side.boundingBox())?.y).toBe(before);
});

test("the picker keeps one height for every section, and its keys scroll inside it", async ({page}) => {
    await page.setViewportSize({width: 1400, height: 1200});
    const picker = await openPicker(page);
    const sheet = page.locator(".sheet.picker");
    const height = (await sheet.boundingBox())?.height;
    for (const section of ["board", "letters", "common", "macros", "custom", "all"]) {
        await picker.locator(`[data-sec="${section}"]`).click();
        expect((await sheet.boundingBox())?.height, section).toBe(height);
    }
    await picker.locator("#pickerSearch").fill("e");
    expect((await sheet.boundingBox())?.height).toBe(height);
    // Every section's name fits with nothing to scroll, in the whole sheet too.
    const overflow = (/** @type {Element} */ node) => node.scrollHeight - node.clientHeight;
    expect(await picker.locator(".picker-side").evaluate(overflow)).toBeLessThanOrEqual(0);
    expect(await sheet.evaluate(overflow)).toBeLessThanOrEqual(0);
    expect(await picker.locator(".picker-keys").evaluate(overflow)).toBeGreaterThan(0);
});

test("a window too short for the picker scrolls its sections and keys, and keeps the footer in reach", async ({page}) => {
    await page.setViewportSize({width: 1400, height: 560});
    const picker = await openPicker(page);
    const sheet = page.locator(".sheet.picker");
    const box = await sheet.boundingBox();
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(560);
    await expect(picker.locator('[data-act="use"]')).toBeInViewport();
    await picker.locator('[data-sec="all"]').click();
    await expect(picker.locator('[data-sec="all"]')).toBeInViewport();
    // Scrolled to reach it, the sections stay there through a pick.
    const sections = picker.locator(".picker-side");
    const place = await sections.evaluate((node) => node.scrollTop);
    expect(place).toBeGreaterThan(0);
    await picker.locator('.pk-grid [data-pick="KC_A"]').click();
    await expect(picker.locator('.pk-grid [data-pick="KC_A"]')).toHaveClass(/\bon\b/);
    expect(await sections.evaluate((node) => node.scrollTop)).toBe(place);
});

test("the search keeps its spot, however long the words beside it", async ({page}) => {
    await openPicker(page);
    const search = page.locator("#pickerSearch");
    const spot = await search.boundingBox();
    expect(spot).not.toBeNull();
    await page.locator('.picker [data-act="cancel"]').first().click();
    for (const options of [{title: "A key", context: "up to 6 keys held together, at most one media key and one system key, in a long line of words", shortcut: {mods: 0, keys: []}}, {title: "T", mode: "list", maxKeys: 1}]) {
        await page.evaluate(async (open) => (await import("/webview/ui/picker.mjs")).openPicker({...open, onPick() {}, onShortcut() {}}), options);
        expect(await search.boundingBox()).toEqual(spot);
        await page.locator('.picker [data-act="cancel"]').first().click();
    }
});

test("a pick keeps the keys' place, until another section or search shows other keys", async ({page}) => {
    const picker = await openPicker(page);
    const keys = () => picker.locator(".picker-keys");
    const top = () => keys().evaluate((node) => node.scrollTop);
    await picker.locator('[data-sec="all"]').click();
    await picker.locator('[data-pick="MACRO_100"]').scrollIntoViewIfNeeded();
    const place = await top();
    expect(place).toBeGreaterThan(0);
    await picker.locator('[data-pick="MACRO_100"]').click();
    await expect(picker.locator('[data-pick="MACRO_100"]')).toHaveClass(/\bon\b/);
    expect(await top()).toBe(place);
    await picker.locator('[data-sec="custom"]').click();
    expect(await top()).toBe(0);
    await keys().evaluate((node) => { node.scrollTop = 200; });
    await picker.locator("#pickerSearch").fill("key");
    expect(await top()).toBe(0);
});

test("All keycodes draws layers and pointing modes as their sections do, and picks from them", async ({page}) => {
    const picker = await openPicker(page);
    await picker.locator('[data-sec="all"]').click();
    await expect(picker.locator(".pk-section-head").first()).toHaveText("Letters and digits");
    await expect(picker.locator(".pk-label").first()).toHaveText("Letters");
    const common = picker.locator(".pk-section", {has: page.locator(".pk-section-head", {hasText: "Common keys"})});
    await expect(common.locator(".pk-label")).toHaveText(["Typing", "Modifiers", "Arrows", "Navigation", "System", "Function", "No key"]);
    await expect(picker.locator(".pk-section", {has: page.locator(".pk-section-head", {hasText: "Layers"})}).locator(".pk-label")).toHaveCount(0);
    await expect(picker.locator(".pk-layers:not(.modes) .pk-layer").first().locator("[data-pick], [data-lt]")).toHaveCount(6);
    await expect(picker.locator(".pk-layers.modes .pk-layer").first().locator("[data-pick]")).toHaveCount(2);
    await picker.locator('.pk-layers [data-pick="TT(4)"]').click();
    await usePosts(page, "TT(4)");
});

test("a macro and a pointing mode from All keycodes are picked as from their sections", async ({page}) => {
    const picker = await openPicker(page);
    await picker.locator('[data-sec="all"]').click();
    await picker.locator('.pk-grid [data-pick="MACRO_1"]').click();
    await expect(picker.locator(".pk-value")).toHaveText("MACRO_1");
    await picker.locator('.pk-layers.modes [data-pick="PD_MODE_3_LOCK"]').click();
    await usePosts(page, "PD_MODE_3_LOCK");
});

test("a search finds a layer key, marked, and picks it", async ({page}) => {
    const picker = await openPicker(page);
    await picker.locator("#pickerSearch").fill("MO(3)");
    await expect(picker.locator(".pk-count")).toHaveText("1 match");
    await expect(picker.locator(".pk-label")).toHaveText("Layers");
    await expect(picker.locator('[data-pick="MO(3)"] .l .kind-icon')).toHaveCount(1);
    await picker.locator('[data-pick="MO(3)"]').click();
    await expect(picker.locator('[data-pick="MO(3)"]')).toHaveClass(/\bon\b/);
    await usePosts(page, "MO(3)");
});

test("a search arms a Tap-hold, says so, and takes the tap key from the next search", async ({page}) => {
    const picker = await openPicker(page);
    const search = picker.locator("#pickerSearch");
    await search.fill("LT(2");
    await picker.locator('[data-lt="2"]').click();
    await expect(picker.locator('[data-lt="2"]')).toHaveClass(/\bon\b/);
    await expect(picker.locator(".pk-count").last()).toContainText("is armed");
    await search.fill("KC_A");
    await picker.locator('[data-pick="KC_A"]').click();
    await usePosts(page, "LT(2, KC_A)");
});

test("a search says when nothing matches", async ({page}) => {
    const picker = await openPicker(page);
    await picker.locator("#pickerSearch").fill("zzzq");
    await expect(picker.locator(".pk-empty")).toHaveText("No key matches “zzzq”.");
});
