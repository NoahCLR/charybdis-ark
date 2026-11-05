// @ts-check
"use strict";
const {test, expect} = require("@playwright/test");
const {openControls, clearPosts, posted} = require("./control-preview");

// Every control is reached, worked and heard without a mouse
// (docs/spec/interface-contracts.md, Accessibility).

test("a strip of tabs is one tab stop, walked by the arrows, Home and End, each tab reached picked and labelling its panel", async ({page}) => {
    await openControls(page, "keys");
    const tabs = page.locator(".keys-bench [role=tab]");
    await expect(tabs.first()).toHaveAttribute("tabindex", "0");
    await expect(page.locator('.keys-bench [role=tab][tabindex="0"]')).toHaveCount(1);
    await page.locator("#bench-tab-key").focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("#bench-tab-behaviours")).toBeFocused();
    await expect(page.locator("#bench-tab-behaviours")).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("#bench-tab-behaviours")).toHaveAttribute("aria-controls", "benchBody");
    await expect(page.locator("#benchBody")).toHaveAttribute("role", "tabpanel");
    await expect(page.locator("#benchBody")).toHaveAttribute("aria-labelledby", "bench-tab-behaviours");
    await page.keyboard.press("End");
    await expect(page.locator("#bench-tab-pointing")).toBeFocused();
    await expect(page.locator("#bench-tab-pointing")).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("#bench-tab-key"), "the arrows wrap").toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("Home");
    await expect(page.locator("#bench-tab-key")).toHaveAttribute("aria-selected", "true");

    // The layer tabs pick the layer the board shows.
    await page.locator("#layer-tab-0").focus();
    await page.keyboard.press("ArrowRight");
    const next = page.locator(".layer-tabs [role=tab]").nth(1);
    await expect(next).toBeFocused();
    await expect(next).toHaveAttribute("aria-selected", "true");
    const id = await next.getAttribute("id");
    await expect(page.locator(".board")).toHaveAttribute("role", "tabpanel");
    await expect(page.locator(".board")).toHaveAttribute("aria-labelledby", String(id));

    // Lighting's stages, LED groups included.
    await page.locator('[data-screen="lighting"]').click();
    const stages = page.locator(".bench [role=tab]");
    await stages.first().focus();
    await page.keyboard.press("End");
    await expect(page.locator("#stage-tab-groups")).toBeFocused();
    await expect(page.locator("#stage-tab-groups")).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("#benchBody")).toHaveAttribute("aria-labelledby", "stage-tab-groups");
    expect(await posted(page)).toEqual([]);
});

test("a reach row is picked from the keyboard by its name's button, Enter or Space, and says whether it is picked", async ({page}) => {
    for (const [tab, search] of [["macros", ""], ["pointing", ""], ["combos", "shell=demo"]]) {
        await openControls(page, "keys", {tab, reachGroups: {view: true, through: true, combos: true, behaviours: true, elsewhere: true}}, "dark", search);
        const pick = page.locator(".reach-table .row-pick").first();
        await expect(pick).toHaveAttribute("aria-pressed", "false");
        await pick.focus();
        await page.keyboard.press("Enter");
        const picked = page.locator(".reach-table .row-pick").first();
        await expect(picked).toHaveAttribute("aria-pressed", "true");
        await expect(picked, "the focus stays on the row it picked").toBeFocused();
        await expect(page.locator(".reach-table tr[data-picked]")).toHaveCount(1);
        await page.keyboard.press(" ");
        await expect(page.locator(".reach-table .row-pick").first()).toHaveAttribute("aria-pressed", "false");
        await expect(page.locator(".reach-table tr[data-picked]")).toHaveCount(0);
    }
    // A combo's name is its badge, so its button says the combo in words.
    await expect(page.locator(".reach-table .row-pick").first()).toHaveAttribute("aria-label", /^Combo C\d+: .+ sends .+$/);
    expect(await posted(page)).toEqual([]);
});

test("Escape cancels the backup's comparison as its Cancel does, unless it is busy", async ({page}) => {
    await openControls(page, "profile");
    /** @param {boolean} busy */
    const review = (busy) => page.evaluate(async (busy) => {
        const store = await import("/webview/store.mjs");
        const model = structuredClone(store.getModel());
        model.portable.busy = busy;
        model.portable.review = {incoming: {layers: 16, behaviors: 1, combos: 0, macros: 0, names: []}, current: {layers: 16, behaviors: 1, combos: 0, macros: 0, names: []},
            fileName: "home.charybdis.json", differences: [], fits: {used: 4101, capacity: 53216}};
        store.setModel(model); store.render();
        window.__posted.length = 0;
    }, busy);
    await review(true);
    await expect(page.locator(".import-sheet")).toBeVisible();
    await page.keyboard.press("Escape");
    expect(await posted(page)).toEqual([]);
    await review(false);
    await page.keyboard.press("Escape");
    await expect.poll(() => posted(page)).toEqual([expect.objectContaining({type: "cancelPortableReview"})]);
});

test("a recovery copy's Delete asks first, in its row, and Cancel or Escape gives the focus back", async ({page}) => {
    await openControls(page, "profile");
    const row = page.locator(".recovery-row").first();
    await row.locator("[data-delete]").focus();
    await page.keyboard.press("Enter");
    const ask = row.locator(".recovery-ask");
    await expect(ask).toContainText("Delete this copy?");
    await expect(ask.locator(".right > button")).toHaveText(["Cancel", "Delete"]);
    await expect(ask.locator('[data-act="cancel"]'), "the way back takes the focus, so Enter twice deletes nothing").toBeFocused();
    expect(await posted(page)).toEqual([]);
    await page.keyboard.press("Enter");
    await expect(ask).toHaveCount(0);
    await expect(row.locator("[data-delete]")).toBeFocused();

    await page.keyboard.press("Enter");
    await page.keyboard.press("Escape");
    await expect(row.locator(".recovery-ask")).toHaveCount(0);
    await expect(row.locator("[data-delete]")).toBeFocused();
    expect(await posted(page)).toEqual([]);

    await row.locator("[data-delete]").click();
    await row.locator('[data-act="confirm-delete"]').click();
    await expect.poll(() => posted(page)).toEqual([expect.objectContaining({type: "deleteRecovery", id: 4})]);
});

test("a sheet closed gives the focus back to the control that opened it", async ({page}) => {
    await page.goto("/preview/index.html?shell=demo-edited");
    const open = page.locator('.commit [data-act="review"]');
    await open.focus();
    await page.keyboard.press("Enter");
    const sheet = page.locator('.sheet[aria-label="Review changes"]');
    await expect(sheet).toBeVisible();
    await expect.poll(() => page.evaluate(() => Boolean(document.activeElement?.closest(".sheet")))).toBe(true);
    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);
    await expect(open).toBeFocused();

    // The keycode picker, from the Key tab's Pick….
    await openControls(page, "keys");
    const pick = page.locator('.keys-bench [data-act="pick"]');
    await pick.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".sheet.picker")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator(".sheet.picker")).toHaveCount(0);
    await expect(pick).toBeFocused();
});

test("the picker's search and chips are named in words, and its modifiers say whether they are pressed", async ({page}) => {
    await openControls(page, "keys");
    await page.locator('.keys-bench [data-act="pick"]').click();
    const picker = page.locator(".sheet.picker");
    await expect(picker.locator("#pickerSearch")).toHaveAttribute("aria-label", "Search keycodes");
    const modifier = picker.locator(".pk-mod").first();
    await expect(modifier).toHaveAttribute("aria-pressed", "false");
    await modifier.click();
    await expect(picker.locator(".pk-mod").first()).toHaveAttribute("aria-pressed", "true");
    // Each chip of what is picked names what it takes away as the picker
    // shows it, never by its keycode name.
    const chips = picker.locator(".sheet-f .chip");
    await expect(chips.first()).toBeVisible();
    for (const label of await chips.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("aria-label")))) {
        expect(label).toMatch(/^Remove (?!KC_)\S/);
    }
});

test("a control's tip shows on keyboard focus, is its description, and Escape hides it", async ({page}) => {
    await page.goto("/preview/index.html?shell=demo-edited");
    await page.locator('.commit [data-act="review"]').focus();
    await page.keyboard.press("Shift+Tab");
    const discard = page.locator('.commit [data-act="discard"]');
    await expect(discard).toBeFocused();
    const words = String(await discard.getAttribute("data-tip"));
    const tip = page.locator(".tip");
    await expect(tip).toBeVisible();
    await expect(tip).toHaveText(words);
    await expect(discard).toHaveAttribute("aria-describedby", "ark-focus-tip");
    await expect(page.locator("#ark-focus-tip")).toHaveText(words);
    await page.keyboard.press("Escape");
    await expect(tip).toBeHidden();
    await page.keyboard.press("Tab");
    await expect(discard).not.toHaveAttribute("aria-describedby", /ark-focus-tip/);
    await expect(tip).toBeHidden();
});

test("what happens is said through live regions outside what renders, once", async ({page}) => {
    await openControls(page, "keys");
    const status = page.locator("body > #ark-status");
    await expect(status).toHaveAttribute("aria-live", "polite");
    await expect(page.locator("body > #ark-alert")).toHaveAttribute("role", "alert");
    await page.evaluate(async () => {
        const store = await import("/webview/store.mjs");
        store.state.notice = "Saved on both halves.";
        store.render();
    });
    await expect(status).toHaveText("Saved on both halves.");
    await expect(page.locator(".rail-message")).not.toHaveAttribute("role", /status/);
    // A redraw that still says it writes nothing new.
    await page.evaluate(async () => {
        const store = await import("/webview/store.mjs");
        document.getElementById("ark-status").textContent = "";
        store.render();
    });
    await expect(status).toHaveText("");
});

test("a board key says it is selected, and a key the draft changed says so", async ({page}) => {
    // The live preview's draft changed Base's key 25; in a live mode that is
    // an unsaved change running on the keyboard.
    await page.goto("/preview/index.html?shell=live");
    await expect(page.locator(".board [data-key][aria-current=true]")).toHaveCount(1);
    await expect(page.locator(".board [data-key].sel")).toHaveAttribute("aria-current", "true");
    await expect(page.locator('.board [data-key="25"]')).toHaveAttribute("aria-label", /, unsaved change$/);
    await expect(page.locator(".board [aria-label$=', unsaved change']")).toHaveCount(1);
    // On LED groups a key is an LED, pressed while it is picked.
    await page.locator('[data-screen="lighting"]').click();
    await page.locator("#stage-tab-groups").click();
    const led = page.locator(".board [data-key]").first();
    await expect(led).toHaveAttribute("aria-pressed", "false");
    await led.click();
    await expect(page.locator(".board [data-key]").first()).toHaveAttribute("aria-pressed", "true");
});

test("Diagnostics' Read keyboard is no part of its summary", async ({page}) => {
    await openControls(page, "device");
    await expect(page.locator("summary button")).toHaveCount(0);
    const read = page.locator('.diagnostics [data-act="read"]');
    const summary = await page.locator('[data-section="diagnostics"] > summary').boundingBox();
    const box = await read.boundingBox();
    expect(box && summary && box.y >= summary.y && box.y + box.height <= summary.y + summary.height).toBe(true);
    await clearPosts(page);
    await read.focus();
    await page.keyboard.press("Enter");
    await expect.poll(() => posted(page)).toEqual([expect.objectContaining({type: "refresh"})]);
    await expect(page.locator('[data-section="diagnostics"]')).not.toHaveAttribute("open", "");
});
