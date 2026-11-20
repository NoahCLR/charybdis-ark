// @ts-check
"use strict";
const {test, expect} = require("@playwright/test");
const {openControls} = require("./control-preview");

// The rail's message closes by itself when it only says what happened, waits
// while the pointer is over it, and stays when it is a failure or holds while
// its condition does (D-L106). Closing it redraws it alone.

/** @param {import("@playwright/test").Page} page @param {{notice: string, failed?: boolean, lasting?: boolean, health?: string}} said */
const say = (page, said) => page.evaluate(async ({notice, failed, lasting, health}) => {
    const {getModel} = await import("/webview/store.mjs");
    const model = structuredClone(getModel());
    if (health !== undefined && model?.device?.health) model.device.health.error = health;
    window.dispatchEvent(new MessageEvent("message", {data: {type: "model", model, notice, failed, lasting}}));
}, said);

const message = (page) => page.locator(".rail-message");

test("a notice closes by itself once read, and waits while the pointer is on it", async ({page}) => {
    await page.clock.install();
    await openControls(page, "keys");
    await say(page, {notice: "Left the demo."});
    await expect(message(page).locator("span")).toHaveText("Left the demo.");
    // The screen is not drawn again when it closes: a mark left on it stays.
    await page.evaluate(() => document.querySelector(".main")?.setAttribute("data-kept", "1"));
    await page.clock.runFor(4000);
    await expect(message(page)).toHaveCount(1);
    await page.clock.runFor(1500);
    await expect(message(page)).toHaveCount(0);
    await expect(page.locator(".main[data-kept]")).toHaveCount(1);

    // Held by the pointer after two seconds, it stays past its time; let go,
    // it takes the three it had left, not its whole time again.
    await page.clock.pauseAt(Date.now() + 60000);
    await say(page, {notice: "Read the keyboard's saved profile, generation 3."});
    await page.clock.runFor(2000);
    await message(page).hover();
    await page.clock.runFor(15000);
    await expect(message(page)).toHaveCount(1);
    await page.mouse.move(600, 400);
    await page.clock.runFor(2500);
    await expect(message(page)).toHaveCount(1);
    await page.clock.runFor(1000);
    await expect(message(page)).toHaveCount(0);
});

// The line at its foot drains, full to empty, over the notice's time: how
// wide it is, as a percentage, part way through.
const lineWidth = (page, at) => message(page).evaluate((node, at) => {
    const [drain] = node.getAnimations();
    if (at !== undefined) {drain.pause(); drain.currentTime = at;}
    return {size: parseFloat(getComputedStyle(node).backgroundSize), state: drain.playState};
}, at);

test("a notice that closes by itself drains a line, stopped while held and carried over a redraw", async ({page}) => {
    await page.clock.install();
    await openControls(page, "keys");
    await page.mouse.move(600, 400);
    await say(page, {notice: "Left the demo."});
    await expect(message(page)).toHaveClass(/fades/);
    expect((await lineWidth(page, 0)).size).toBeCloseTo(100, 0);
    expect((await lineWidth(page, 2500)).size).toBeCloseTo(50, 0);
    expect((await lineWidth(page, 5000)).size).toBeCloseTo(0, 0);

    // A redraw starts the line where it had drained to.
    await say(page, {notice: "Left the demo."});
    await page.clock.runFor(2000);
    await page.evaluate(async () => (await import("/webview/store.mjs")).render());
    await expect(message(page)).toHaveAttribute("style", /--fade-passed: 2[0-4][0-9][0-9]ms/);

    // Held, it stops; let go, it runs on.
    await message(page).hover();
    await expect(message(page)).toHaveClass(/held/);
    expect((await lineWidth(page)).state).toBe("paused");
    await page.mouse.move(600, 400);
    await expect(message(page)).not.toHaveClass(/held/);
    expect((await lineWidth(page)).state).toBe("running");

    // A failure and a lasting notice have no line.
    await say(page, {notice: "Failed: no answer.", failed: true});
    await expect(message(page)).not.toHaveClass(/fades/);
    await say(page, {notice: "Restarting the keyboard…", lasting: true});
    await expect(message(page)).not.toHaveClass(/fades/);
});

test("a failure and a lasting notice stay; ✕ closes them, and the keyboard's error until it changes", async ({page}) => {
    await page.clock.install();
    await openControls(page, "keys");
    await say(page, {notice: "Failed: The keyboard did not answer.", failed: true});
    await page.clock.runFor(60000);
    await expect(message(page)).toHaveClass(/err/);
    await message(page).locator('[data-act="dismiss"]').click();
    await expect(message(page)).toHaveCount(0);

    await say(page, {notice: "Restarting the keyboard…", lasting: true});
    await page.clock.runFor(60000);
    await expect(message(page).locator("span")).toHaveText("Restarting the keyboard…");
    await say(page, {notice: ""});
    await expect(message(page)).toHaveCount(0);

    // The keyboard's own error: ✕ hides it, and a different one shows.
    await say(page, {notice: "", health: "The keyboard reported a fault."});
    await expect(message(page).locator("span")).toHaveText("The keyboard reported a fault.");
    await message(page).locator('[data-act="dismiss"]').click();
    await expect(message(page)).toHaveCount(0);
    await say(page, {notice: "", health: "The keyboard reported another fault."});
    await expect(message(page).locator("span")).toHaveText("The keyboard reported another fault.");

    // Shown over a notice, ✕ closes the error, and the notice shows.
    await say(page, {notice: "Left the demo.", health: "The keyboard reported a third fault."});
    await expect(message(page).locator("span")).toHaveText("The keyboard reported a third fault.");
    await message(page).locator('[data-act="dismiss"]').click();
    await expect(message(page).locator("span")).toHaveText("Left the demo.");
});

test("a notice dismissed from the keyboard leaves the next one free to close", async ({page}) => {
    await page.clock.install();
    await openControls(page, "keys");
    await page.mouse.move(600, 400);
    await say(page, {notice: "Left the demo."});
    await message(page).locator('[data-act="dismiss"]').focus();
    await page.keyboard.press("Enter");
    await expect(message(page)).toHaveCount(0);
    await say(page, {notice: "Opened mine.charybdis.json in the demo."});
    await expect(message(page)).not.toHaveClass(/held/);
    await page.clock.runFor(10500);
    await expect(message(page)).toHaveCount(0);
});
