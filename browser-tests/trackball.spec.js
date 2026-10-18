// @ts-check
"use strict";
// The Trackball screen: its fixed entries save their settings sections, a
// mode's new controls post what they show, a refused value names its field
// and posts nothing, and an empty slot's templates post ordinary edits.
const {test, expect} = require("@playwright/test");
const {openControls, clearPosts, posted, expectPost, change} = require("./control-preview");

const section = (page, id, fields) => expectPost(page, {type: "updateConfigDefaults", sectionId: id, expectedFingerprint: expect.anything(),
    fields: expect.arrayContaining(fields.map((field) => expect.objectContaining(field)))});
const configPost = (page, slot, config) => expectPost(page, {
    type: "savePdMode", slot, expectedBase: expect.any(Object), config: expect.objectContaining({id: slot, ...config}),
});
const editor = (page) => page.locator(".pd-editor");

test("Pointer, Sniping and Mouse layer each save their own section", async ({page}) => {
    await openControls(page, "mouse", {tbEntry: "pointer"});
    await expect(page.locator(".tb-list [data-entry]")).toHaveCount(3);
    await page.locator('[data-macro="normalDpi"]').selectOption("800");
    await section(page, "normalPointerSpeed", [{macro: "normalDpi", value: "800"}]);

    await page.locator('[data-entry="sniping"]').click();
    await clearPosts(page);
    await page.locator('[data-macro="snipingDpi"]').selectOption("300");
    await section(page, "normalPointerSpeed", [{macro: "snipingDpi", value: "300"}]);
    await clearPosts(page);
    await page.locator('[data-macro="autoSniping"]').locator("..").click();
    await section(page, "sniping", [{macro: "autoSniping", enabled: false}]);
    await expect(page.locator(".tb-key")).toHaveCount(2);

    await page.locator('[data-entry="mouseLayer"]').click();
    await clearPosts(page);
    await change(page.locator('[data-macro="mouseTimeout"]'), 777);
    await section(page, "autoMouse", [{macro: "mouseTimeout", value: "777"}]);
    await page.locator(".tb-fold summary").click();
    await clearPosts(page);
    await change(page.locator('[data-macro="mouseThreshold"]'), 12);
    await section(page, "autoMouse", [{macro: "mouseThreshold", value: "12"}]);
});

test("Place on a key… for a sniping key arms placement on Keys without an edit", async ({page}) => {
    await openControls(page, "mouse", {tbEntry: "sniping"});
    await page.locator('[data-place="SNP_TOG"]').click();
    await expect(page.locator(".main h1")).toHaveText("Keys");
    expect(await page.evaluate(async () => (await import("/webview/store.mjs")).state.placement)).toEqual({keycode: "SNP_TOG"});
    expect(await posted(page)).toEqual([]);
});

test("a mode's step distance posts counts from millimetres, and its counts as typed", async ({page}) => {
    await openControls(page, "pointing", {pdSlot: 4});
    // Arrow: 40 counts at 400 DPI is 2.5 mm; 5 mm is 79 counts.
    await expect(editor(page).getByLabel("Sideways step in millimetres", {exact: true})).toHaveValue("2.5");
    await change(editor(page).getByLabel("Sideways step in millimetres", {exact: true}), "5");
    await configPost(page, 4, {thresholdX: 79, thresholdY: 50});
    await clearPosts(page);
    await change(editor(page).getByLabel("Up and down step in sensor counts", {exact: true}), 61);
    await configPost(page, 4, {thresholdY: 61});
});

test("While this mode runs is on the editor, not under Advanced, and posts", async ({page}) => {
    await openControls(page, "pointing", {pdSlot: 4});
    const select = editor(page).locator('[data-f="pointing:4:pointerLayer"]');
    await expect(select).toBeVisible();
    await expect(editor(page).locator(".pd-advanced [data-f='pointing:4:pointerLayer']")).toHaveCount(0);
    await select.selectOption("0");
    await configPost(page, 4, {pointerLayer: 0});
});

test("a scroll value the keyboard would refuse names its field and posts nothing", async ({page}) => {
    await openControls(page, "pointing", {pdSlot: 0, pdAdvanced: true});
    await change(editor(page).getByLabel("Cross-axis decay divisor", {exact: true}), 1);
    const reason = editor(page).locator('[data-problem-for="scroll:decayDivisor"] [data-problem]');
    await expect(reason).toBeVisible();
    await expect(reason).toContainText("at least 2");
    expect(await posted(page)).toEqual([]);
    await change(editor(page).getByLabel("Cross-axis decay divisor", {exact: true}), 3);
    await configPost(page, 0, {scroll: expect.objectContaining({decayDivisor: 3})});
    await expect(reason).toBeHidden();
});

test("a button's tapped shortcut posts its held-modifier policy", async ({page}) => {
    await openControls(page, "pointing", {pdSlot: 4, pdAdvanced: true});
    await expect(editor(page).locator(".pd-buttons .n").first()).toHaveText("1 · left click");
    await editor(page).locator('[data-f="pointing:4:button:1:policy"]').selectOption("0");
    await configPost(page, 4, {buttons: expect.arrayContaining([expect.objectContaining({kind: 2, tap: expect.objectContaining({modifierPolicy: 0})})])});
});

test("directions read in words, with keycodes only under Show keycodes", async ({page}) => {
    await openControls(page, "pointing", {pdSlot: 3});
    await expect(editor(page).locator(".pd-cross .arm.up .value-btn")).toHaveText("Command + =");
    await expect(editor(page).locator(".pd-cross input")).toHaveCount(0);
    await page.evaluate(async () => { const store = await import("/webview/store.mjs"); store.state.showKeycodes = true; store.render(); });
    await expect(editor(page).locator(".pd-cross .arm.up input")).toHaveValue("G(KC_EQUAL)");
});

test("every empty-slot template posts a mode", async ({page}) => {
    await openControls(page, "pointing", {pdSlot: 8});
    const templates = editor(page).locator("[data-template]");
    await expect(templates).toHaveCount(8);
    for (const [id, name, kind] of [["volume", "Volume", 1], ["scroll", "Scroll", 2], ["tabs", "Tabs", 1]]) {
        await clearPosts(page);
        await editor(page).locator(`[data-template="${id}"]`).click();
        await configPost(page, 8, {name, kind});
    }
    await clearPosts(page);
    await editor(page).locator('[data-template="scroll"]').click();
    await configPost(page, 8, {dpi: 100, scroll: expect.objectContaining({invert: 2})});
});

test("a link to a mode lands on the Trackball screen with its rail item lit", async ({page}) => {
    await openControls(page, "pointing", {pdSlot: 5});
    await expect(page.locator('[data-screen="mouse"]')).toHaveAttribute("aria-current", "true");
    await expect(page.locator('.tb-list [data-slot="5"]')).toHaveAttribute("aria-current", "true");
});
