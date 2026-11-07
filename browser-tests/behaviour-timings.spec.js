// @ts-check
"use strict";
const {test, expect} = require("@playwright/test");
const {openControls, clearPosts, posted, change, publishBehaviour, behaviourSteps} = require("./control-preview");

// A behaviour's timings fold into its switches row under Timings, which opens
// them in a panel under the button as Layers it runs on does. Closed, Timings
// wears the mark of each timing the behaviour sets, the mark its default
// wears on Behaviour settings (D-L31), and none when all follow the defaults.

const timings = (page) => page.locator(".beh-main .beh-timings");
const button = (page) => timings(page).locator('[data-act="behaviour-timings"]');

test("Timings opens the behaviour's timings in a panel that stays open while they are edited", async ({page}) => {
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await openControls(page, "keys", {tab: "behaviours", behaviourRow: "KC_LEFT_GUI"});
    // Closed, the row holds no timing field and, with every timing following
    // the defaults, no mark; the grid follows the switches row at once.
    await expect(button(page)).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator(".beh-main [data-term]")).toHaveCount(0);
    await expect(button(page).locator(".own-timings")).toHaveCount(0);
    await expect(page.locator(".beh-main .beh-intro + .bgrid")).toHaveCount(1);

    await button(page).click();
    await expect(button(page)).toHaveAttribute("aria-expanded", "true");
    const panel = timings(page).locator(".def-pop");
    await expect(panel).toHaveAttribute("role", "dialog");
    // The three timings, one to a row, each named beside its field, in the
    // grid's order: the window between taps, then the two thresholds.
    await expect(panel.locator("[data-term]")).toHaveText(["", "", ""]);
    await expect(panel.locator(".bterm-field > span:first-child")).toHaveText(["Multi tap window", "Tap / hold threshold", "Long hold threshold"]);
    await expect(panel.locator('[data-f="behaviour:KC_LEFT_GUI:timing:tapHoldTerm"]')).toHaveAttribute("placeholder", /default/);

    // A timing typed posts the row, and the panel stays open across the redraw.
    await clearPosts(page);
    await change(panel.locator('[data-f="behaviour:KC_LEFT_GUI:timing:tapHoldTerm"]'), "177");
    await expect.poll(() => posted(page)).toEqual([expect.objectContaining({type: "saveBehavior",
        behavior: expect.objectContaining({keycode: "KC_LEFT_GUI", tapHoldTerm: "177"})})]);
    await expect(button(page)).toHaveAttribute("aria-expanded", "true");

    // Esc closes it, focus back on its button.
    await page.keyboard.press("Escape");
    await expect(timings(page).locator(".def-pop")).toHaveCount(0);
    await expect(button(page)).toBeFocused();

    // A press outside closes it in place, and the press still lands.
    await button(page).click();
    await expect(timings(page).locator(".def-pop")).toHaveCount(1);
    await clearPosts(page);
    await page.getByText("Use this behaviour", {exact: true}).click();
    await expect.poll(() => posted(page)).toEqual([expect.objectContaining({type: "saveBehavior", behavior: expect.objectContaining({enabled: false})})]);
    await expect(timings(page).locator(".def-pop")).toHaveCount(0);
    await expect(button(page)).toHaveAttribute("aria-expanded", "false");
    expect(errors).toEqual([]);
});

test("closed, Timings wears the mark of each timing the behaviour sets, and says which on hover", async ({page}) => {
    await openControls(page, "keys", {tab: "behaviours", behaviourRow: "KC_LEFT_GUI"});
    await expect(button(page).locator(".own-timings")).toHaveCount(0);
    await expect(button(page)).not.toHaveAttribute("data-tip", /sets its own/);

    // The core accepts a Tap / hold threshold and a Multi tap window of the
    // behaviour's own: the Hold tier's dot and the N× badge, the marks their
    // defaults wear on Behaviour settings, in the panel's order.
    const steps = await behaviourSteps(page, "KC_LEFT_GUI");
    await publishBehaviour(page, "KC_LEFT_GUI", steps, {tapHoldTerm: "177", multiTapTerm: "120"});
    const marks = button(page).locator(".own-timings > *");
    await expect(marks).toHaveCount(2);
    await expect(marks.nth(0)).toHaveClass(/\bbn\b/);
    await expect(marks.nth(0)).toHaveText("N×");
    await expect(marks.nth(1)).toHaveClass(/\bfbdot\b/);
    await expect(button(page)).toHaveAttribute("data-tip", /This key sets its own Multi tap window and Tap \/ hold threshold\./);
    // The values themselves stay in the panel.
    await expect(button(page)).not.toContainText("177");
    await button(page).click();
    await expect(timings(page).locator('[data-f="behaviour:KC_LEFT_GUI:timing:tapHoldTerm"]')).toHaveValue("177");
    await expect(timings(page).locator('[data-f="behaviour:KC_LEFT_GUI:timing:multiTapTerm"]')).toHaveValue("120");

    // Back on the defaults, the mark goes.
    await page.keyboard.press("Escape");
    await publishBehaviour(page, "KC_LEFT_GUI", steps, {tapHoldTerm: "0", multiTapTerm: "0"});
    await expect(button(page).locator(".own-timings")).toHaveCount(0);
});
