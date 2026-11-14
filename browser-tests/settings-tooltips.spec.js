// @ts-check
"use strict";
const {test, expect} = require("@playwright/test");
const {openControls} = require("./control-preview");

// Every Settings row says what it does: its hint, on screen under its name,
// or its tip. A tip adds to what the row shows and never repeats its hint,
// so no sentence is in both (D-L96).
// A row with a tip, on each screen that has one, is hovered to see it.
const SAMPLE = {behaviours: "setting:tappingTerm", combos: "", pointer: "setting:normalDpi", host: "setting:swapControlCaps"};
for (const [screen, identity] of Object.entries(SAMPLE)) {
    test(`every ${screen} setting says what it does once`, async ({page}) => {
        await openControls(page, screen);
        const rows = await page.locator(".setrow").evaluateAll(rows => rows.map(row => ({
            name: row.querySelector(".nm")?.textContent?.trim(),
            tip: row.getAttribute("data-tip")?.trim() || "",
            // A row of one choice per layer, named by none, is said by its
            // section's line (Combo layer matching).
            hint: (row.querySelector(":scope > div > .hint") || (row.querySelector(".nm") ? null : row.closest(".settings-group")?.querySelector(".settings-intro .note")))?.textContent?.trim() || ""})));
        expect(rows.filter(row => !row.tip && !row.hint).map(row => row.name), "unsaid").toEqual([]);
        expect(rows.filter(row => row.tip && row.hint && row.tip.includes(row.hint)).map(row => row.name), "said twice").toEqual([]);
        if (!identity) return;
        const row = page.locator(".setrow").filter({has: page.locator(`[data-f="${identity}"]`)});
        const tip = await row.getAttribute("data-tip");
        expect(tip).toBeTruthy();
        await row.locator(".nm").hover();
        await expect(page.locator(".tip")).toBeVisible();
        await expect(page.locator(".tip")).toHaveText(/** @type {string} */ (tip));
    });
}

test("a read-only setting says why on screen, and its row's tip what it does", async ({page}) => {
    await openControls(page, "pointer");
    await page.evaluate(async () => {
        const store = await import("/webview/store.mjs");
        const model = structuredClone(store.getModel());
        const field = model.configDefaults.find(section => section.id === "normalPointerSpeed").fields[0];
        Object.assign(field, {readOnly: true, hint: "Read the keyboard to edit this."});
        store.setModel(model); store.render();
    });
    const row = page.locator('[data-section="normalPointerSpeed"] .setrow.ro').first();
    await expect(row.locator(".hint")).toHaveText("Read the keyboard to edit this.");
    await expect(row.locator(".chip")).not.toHaveAttribute("data-tip", /./);
    await row.locator(".chip").hover();
    await expect(page.locator(".tip")).toContainText("Trackball sensitivity");
    await expect(page.locator(".tip")).not.toContainText("Read the keyboard");
});

// The marks beside a setting a key on the keyboard can change are short, with
// no tip; what they mean is said once, in the info mark beside the section's
// title (D-L96), and only on a section that has such a setting.
test("what keyboard keys change is the section's info mark, and the marks carry no tip", async ({page}) => {
    await openControls(page, "behaviours");
    const section = page.locator('.settings-group[data-section="behaviorSettings"]');
    await expect(section.locator(".kk-mark")).toHaveText(["↺ keyboard keys change this too"]);
    await expect(section.locator(".kk-mark")).not.toHaveAttribute("data-tip", /./);
    const mark = section.locator(":scope > .card-h .info-mark");
    await expect(mark.locator("dt")).toHaveText(["↺ keyboard keys change this too", "turned off by key"]);
    await expect(mark.locator(".info-pop")).toContainText("until the keyboard restarts");
    await mark.locator(".info-button").click();
    await expect(mark.locator(".info-pop")).toBeVisible();
    // A section no key changes has none.
    await expect(page.locator('.settings-group[data-section="keyTiming"] .info-mark')).toHaveCount(0);
});
