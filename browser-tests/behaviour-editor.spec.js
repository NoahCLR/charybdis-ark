// @ts-check
"use strict";
// The behaviour editor on the Keys screen: its head, timing strip, grid and
// cell popover, each control proven by what it posts (AGENTS.md, "Proving a
// control is wired"), and the firmware facts the grid draws.
const {test, expect} = require("@playwright/test");
const {openControls, clearPosts, posted, change} = require("./control-preview");

/** @param {import("@playwright/test").Page} page @param {string} row */
const openBehaviour = (page, row) => openControls(page, "keys", {tab: "behaviours", behaviourRow: row, cell: null, cellRow: null});

test("Delete and Cmd-V in Behaviours act on the open cell only, never on the board's selected key (B7)", async ({page}) => {
    await openBehaviour(page, "KC_1");
    await page.evaluate(async () => { (await import("/webview/store.mjs")).state.keyClipboard = {keycode: "KC_Z", label: "Z"}; });
    await clearPosts(page);
    await page.locator(".beh-editor h3").click();
    await page.keyboard.press("Backspace");
    await page.keyboard.press("Delete");
    await page.keyboard.press("Meta+v");
    expect(await posted(page), "nothing reaches Esc, the board's selected key").toEqual([]);

    // With a cell open, Delete clears that cell.
    await page.locator('[data-cell="0-hold"]').click();
    await expect(page.locator(".cell-pop")).toHaveCount(1);
    await page.locator(".cell-pop .eyebrow").click();
    await clearPosts(page);
    await page.keyboard.press("Backspace");
    await expect.poll(() => posted(page)).toEqual([expect.objectContaining({type: "saveBehavior",
        behavior: expect.objectContaining({keycode: "KC_1", steps: []})})]);
});

test("the head's On switch, Layers popover and More menu post the behaviour whole", async ({page}) => {
    await openBehaviour(page, "KC_ESCAPE");
    const head = page.locator(".beh-head");
    await expect(head.locator('[data-menu="layers"]')).toHaveText("Layers: All ▾");
    await clearPosts(page);
    await head.locator("label").filter({has: page.locator("[data-definition-enabled]")}).click();
    await expect.poll(() => posted(page)).toEqual([expect.objectContaining({type: "saveBehavior",
        behavior: expect.objectContaining({keycode: "KC_ESCAPE", enabled: false})})]);

    await head.locator('[data-menu="layers"]').click();
    await expect(page.locator('[data-pop="layers"]')).toBeVisible();
    await clearPosts(page);
    await page.locator('[data-pop="layers"] label').filter({has: page.locator('[data-allowed-layer="3"]')}).click();
    await expect.poll(() => posted(page)).toEqual([expect.objectContaining({type: "saveBehavior",
        behavior: expect.objectContaining({allowedLayers: 0xffff & ~(1 << 3)})})]);
    await expect(page.locator('[data-pop="layers"]'), "the popover stays open across the edit").toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator('[data-pop="layers"]')).toBeHidden();

    await head.locator('[data-menu="more"]').click();
    const more = page.locator('[data-pop="more"]');
    await expect(more.locator("button")).toHaveText(["Move to another key…", "Remove behaviour"]);
    await clearPosts(page);
    await more.locator("label").filter({has: page.locator("[data-anchor]")}).click();
    await expect.poll(() => posted(page)).toEqual([expect.objectContaining({type: "saveBehavior",
        behavior: expect.objectContaining({keycode: "KC_ESCAPE", keepsAutoMouseAnchored: true})})]);
    await page.locator(".bgrid").click({position: {x: 4, y: 4}});
    await expect(more, "a press outside closes it").toBeHidden();
});

test("the timing strip names each default's source and posts what is typed", async ({page}) => {
    await openBehaviour(page, "KC_ESCAPE");
    await expect(page.locator('[data-term="tapHoldTerm"]')).toHaveAttribute("placeholder", /^\d+ · behaviour default$/);
    await expect(page.locator('[data-term="multiTapTerm"]')).toHaveAttribute("placeholder", /^\d+ · default$/);
    await expect(page.locator(".beh-timing")).toContainText("Taps within");
    await expect(page.locator(".beh-timing")).toContainText("Long hold after");
    await clearPosts(page);
    await change(page.locator('[data-term="tapHoldTerm"]'), "777");
    expect(JSON.stringify(await posted(page))).toContain("777");
    await openBehaviour(page, "LT(3,KC_SLASH)");
    await expect(page.locator('[data-term="tapHoldTerm"]')).toHaveAttribute("placeholder", /· dual-role$/);
});

test("the grid shows the tap counts in use and the next, the cycle, the costs, and every count on request", async ({page}) => {
    await openBehaviour(page, "KC_ESCAPE");
    const labels = page.locator(".bgrid .bhead");
    await expect(labels).toHaveText(["1×Single", "2×Double", "+ Triple"]);
    await expect(page.locator("[data-cycle]")).toHaveText("↻ 3 taps → like 1× again");
    await expect(page.locator('[data-cost="single"]')).toContainText("Single taps wait");
    await clearPosts(page);
    await page.locator('[data-act="all-taps"]').click();
    await expect(page.locator('[data-act="all-taps"]')).toHaveAttribute("aria-pressed", "true");
    await expect(labels).toHaveCount(5);
    await expect(labels.nth(3)).toContainText("↻ like 2×");
    expect(await posted(page), "a view preference posts nothing").toEqual([]);
    expect(await page.evaluate(async () => (await import("/webview/store.mjs")).state.allTapCounts)).toBe(true);
});

test("pointing-mode keys draw the hold they have built in (B6)", async ({page}) => {
    await openBehaviour(page, "PD_SLOT_0");
    await expect(page.locator('[data-cell="0-hold"]')).toHaveClass(/inherited/);
    await expect(page.locator('[data-cell="0-hold"]')).toContainText("built in · held from the press");
    // A later tap count that enters another mode makes the first hold wait.
    await openBehaviour(page, "PD_SLOT_5");
    await expect(page.locator('[data-cell="0-hold"]')).toContainText("built in · held until release");
});

test("the cell popover posts its action, how it runs, Nothing and Clear, and closes on Esc", async ({page}) => {
    await openBehaviour(page, "KC_ESCAPE");
    // A set cell: how it runs posts with the action it sends.
    await page.locator('[data-cell="0-long"]').click();
    const pop = page.locator(".cell-pop");
    await expect(pop).toHaveCount(1);
    await expect(pop.locator(".eyebrow")).toHaveText("Single tap · Long hold");
    await expect(pop.locator(".value-btn")).toContainText("Esc");
    await expect(pop.locator("button", {hasText: "Done"})).toHaveCount(0);
    await clearPosts(page);
    await pop.locator("[data-helper]").selectOption("REPEAT_WHILE_HELD");
    await expect.poll(() => posted(page)).toEqual([expect.objectContaining({type: "saveBehavior", behavior: expect.objectContaining({
        steps: expect.arrayContaining([expect.objectContaining({tapCount: 0, longHold: expect.objectContaining({helper: "REPEAT_WHILE_HELD"})})])})})]);
    await clearPosts(page);
    await pop.locator('[data-act="clear"]').click();
    await expect.poll(() => posted(page)).toEqual([expect.objectContaining({type: "saveBehavior", behavior: expect.objectContaining({
        steps: expect.not.arrayContaining([expect.objectContaining({longHold: expect.anything()})])})})]);
    await page.keyboard.press("Escape");
    await expect(page.locator(".cell-pop")).toHaveCount(0);

    // An empty built-in cell offers what it does, something else, or Nothing.
    await page.locator('[data-cell="0-tap"]').click();
    await expect(page.locator(".cell-pop .ce-builtin")).toHaveText("Built in: Esc");
    await clearPosts(page);
    await page.locator('.cell-pop [data-act="nothing"]').click();
    await expect.poll(() => posted(page)).toEqual([expect.objectContaining({type: "saveBehavior", behavior: expect.objectContaining({
        steps: expect.arrayContaining([expect.objectContaining({tapCount: 0, tap: expect.objectContaining({action: "KC_NO"})})])})})]);
    await page.locator('.cell-pop [data-act="pick"]').click();
    await expect(page.locator(".picker")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(page.locator(".picker"), "Esc closes the picker first").toHaveCount(0);
    await expect(page.locator(".cell-pop")).toHaveCount(1);
});

test("the Behaviours list hides On this view outside a preview, folds empty groups and dims only unreached rows", async ({page}) => {
    await openBehaviour(page, "KC_ESCAPE");
    const rail = page.locator(".behaviour-rail");
    await expect(rail.locator('[data-group="view"]')).toHaveCount(0);
    await expect(rail).not.toContainText(/on this view/i);
    await expect(rail.locator('[data-group="here"]')).toHaveAttribute("aria-expanded", "true");
    await expect(rail.locator(".rowitem.quiet")).toHaveCount(0);
    const height = await rail.locator('[data-group="here"] ~ * .rowitem, .rowitem').first().evaluate((node) => node.getBoundingClientRect().height);
    expect(height).toBeGreaterThanOrEqual(39);
    expect(height).toBeLessThanOrEqual(41);
    await page.evaluate(async () => { const store = await import("/webview/store.mjs"); store.state.layer = 3; store.state.layersOn = [0]; store.render(); });
    // Previewed, the view is its own group, or named in the folded line when empty.
    await expect(rail).toContainText(/on this view/i);
});
