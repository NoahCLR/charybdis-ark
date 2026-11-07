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

test("a Tap / hold at or past the Long hold stays in its field, edged red with the reason, and the rail says core's refusal (D-L82)", async ({page}) => {
    await openControls(page, "keys", {tab: "behaviours", behaviourRow: "KC_LEFT_GUI"});
    await button(page).click();
    const panel = timings(page).locator(".def-pop");
    const field = (term) => panel.locator(`[data-f="behaviour:KC_LEFT_GUI:timing:${term}"]`);
    const danger = () => page.evaluate(() => {
        const probe = document.createElement("i"); probe.style.color = "var(--danger)"; document.body.append(probe);
        const colour = getComputedStyle(probe).color; probe.remove(); return colour;
    });
    const refused = async () => {
        await expect(field("tapHoldTerm")).toHaveValue("700");
        await expect(field("tapHoldTerm")).toHaveAttribute("aria-invalid", "true");
        await expect(field("tapHoldTerm")).toHaveCSS("border-top-color", await danger());
        await expect(panel.locator("#timing-problem")).toHaveText("The Long hold threshold, 400 ms, must be later than the Tap / hold threshold, 700 ms.");
        await expect(field("tapHoldTerm")).toHaveAttribute("aria-describedby", "timing-problem");
    };
    await clearPosts(page);
    // The Long hold follows its 400 ms default. The edit still posts, for core
    // to refuse.
    await change(field("tapHoldTerm"), "700");
    await refused();
    await expect.poll(() => posted(page)).toEqual([expect.objectContaining({type: "saveBehavior",
        behavior: expect.objectContaining({keycode: "KC_LEFT_GUI", tapHoldTerm: "700", longHoldTerm: "0"})})]);
    // Core's refusal redraws with its notice: the rail says it, and the field keeps its mark.
    const notice = "Failed: The behaviour on KC_LEFT_GUI: its Long hold threshold, 400 ms, must be later than its Tap / hold threshold, 700 ms.";
    await page.evaluate(async (notice) => {
        const {getModel} = await import("/webview/store.mjs");
        window.dispatchEvent(new MessageEvent("message", {data: {type: "model", model: structuredClone(getModel()), notice, failed: true}}));
    }, notice);
    await expect(page.locator(".rail-message.err > span")).toHaveText(notice);
    await refused();
    // A later Long hold puts them in order: both post, and the marks go.
    await clearPosts(page);
    await change(field("longHoldTerm"), "900");
    await expect.poll(() => posted(page)).toEqual([expect.objectContaining({type: "saveBehavior",
        behavior: expect.objectContaining({keycode: "KC_LEFT_GUI", tapHoldTerm: "700", longHoldTerm: "900"})})]);
    await expect(panel.locator("[aria-invalid]")).toHaveCount(0);
    await expect(panel.locator("#timing-problem")).toHaveCount(0);
    await expect(field("tapHoldTerm")).toHaveValue("700");
    // Core's acceptance redraws, and the rail's refusal is gone.
    await publishBehaviour(page, "KC_LEFT_GUI", [], {tapHoldTerm: "700", longHoldTerm: "900"});
    await expect(page.locator(".rail-message")).toHaveCount(0);
});

test("closing Timings drops a refused timing: reopened, it shows what is kept (D-L82)", async ({page}) => {
    await openControls(page, "keys", {tab: "behaviours", behaviourRow: "KC_LEFT_GUI"});
    const panel = timings(page).locator(".def-pop");
    const field = (term) => panel.locator(`[data-f="behaviour:KC_LEFT_GUI:timing:${term}"]`);
    const reopened = async () => {
        await expect(panel).toHaveCount(0);
        await button(page).click();
        await expect(field("tapHoldTerm")).toHaveValue("");
        await expect(panel.locator("[aria-invalid]")).toHaveCount(0);
        await expect(panel.locator("#timing-problem")).toHaveCount(0);
    };
    // Refused, then closed by Esc.
    await button(page).click();
    await change(field("tapHoldTerm"), "700");
    await expect(field("tapHoldTerm")).toHaveAttribute("aria-invalid", "true");
    await field("tapHoldTerm").press("Escape");
    await reopened();
    // Typed and left by a press outside, which closes Timings first: the edit
    // posts for core to refuse, and nothing is kept.
    await clearPosts(page);
    await field("tapHoldTerm").fill("700");
    await page.getByText("Use this behaviour", {exact: true}).click();
    await expect.poll(() => posted(page)).toContainEqual(expect.objectContaining({type: "saveBehavior",
        behavior: expect.objectContaining({tapHoldTerm: "700"})}));
    await reopened();
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
