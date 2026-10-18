// @ts-check
"use strict";
const {test, expect} = require("@playwright/test");
const {openControls} = require("./control-preview");
const {buildDeviceModel} = require("../core/session/device-model");

async function payload(page, text) {
    await page.locator("[data-raw-toggle]").click();
    await page.locator("[data-raw-payload]").fill(text);
    await page.locator("[data-raw-payload]").press("Tab");
    await expect.poll(() => updates(page).then(rows => rows.at(-1)?.payload)).toBe(text);
    await expect(page.locator("[data-macro-feedback] .unavailable")).toHaveCount(0);
    await page.evaluate(() => {window.__posted.length = 0;});
}
const updates = page => page.evaluate(() => window.__posted.filter(m => m.type === "updateViaMacro"));

for (const theme of ["vscode-dark", "vscode-light"]) {
    test(`fixed tiles, full names and retained name/protection controls (${theme})`, async ({page}) => {
        await openControls(page, "macros", {macroSlot: "VIA_MACRO_17"}, theme);
        await payload(page, "{+KC_LGUI}{KC_A}{-KC_LGUI}{65535}{KC_LGUI,KC_LSFT,KC_LALT,KC_ENT}" + "long text ".repeat(100));
        const sizes = await page.locator(".macro-token").evaluateAll(nodes => nodes.map(node => [node.offsetWidth, node.offsetHeight]));
        expect(sizes).toEqual([[64,80],[64,80],[64,80],[64,80],[144,80],[144,80]]);
        await expect(page.locator('[data-step-tile="0"] .macro-token-mark')).toHaveText("↓");
        await expect(page.locator('[data-step-tile="2"] .macro-token-mark')).toHaveText("↑");
        await expect(page.locator('[data-step-tile="1"] .macro-tap-dot')).toHaveCount(1);
        await expect(page.locator('[data-step-tile="1"] .macro-token-mark')).toHaveText("");
        expect(await page.locator('[data-step-tile="3"] .macro-token-label').evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
        await page.locator('[data-step-tile="5"]').click();
        await expect(page.locator('[data-step-text="5"]')).toHaveValue("long text ".repeat(100));
        await expect(page.locator('[data-step-text="5"]')).toBeVisible();
        await page.locator('[data-name]').fill("Sequence test");
        await page.locator('[data-name]').press("Tab");
        await expect.poll(() => updates(page).then(rows => rows.find(m => m.name)?.name)).toBe("Sequence test");
        await page.locator('[data-protection]').selectOption("on");
        await expect.poll(() => updates(page).then(rows => rows.find(m => m.protection)?.protection)).toBe("on");
        await expect(page.locator('[data-act="place"]')).toBeVisible();
        await expect(page.locator('[data-preserve-hold-timing]')).toBeVisible();
        const patch = buildDeviceModel({settingsView: {host: {effective: 1}}});
        await page.evaluate(async patch => {
            const store = await import("/webview/store.mjs"), model = store.getModel();
            store.setModel({...model, qmkKeyLabels: patch.qmkKeyLabels, qmkKeyShortLabels: patch.qmkKeyShortLabels}); store.render();
        }, patch);
        await expect(page.locator('[data-step-tile="0"] .macro-token-label')).toHaveText("L Cmd");
        await expect(page.locator('[data-step-tile="0"]')).toHaveAccessibleName(/Left Command/);
        await page.locator('[data-raw-toggle]').click();
        await page.locator('[data-close-step]').filter({visible: true}).click();
        await page.setViewportSize({width: 1600, height: 1400});
        await page.locator('[data-macro-editor]').screenshot({path: `/tmp/ark-macro-sequence-${theme}.png`});
    });
}

test("dragging a release before its press stays local, flags tiles and can be corrected", async ({page}) => {
    await openControls(page, "macros", {macroSlot: "VIA_MACRO_17"});
    await payload(page, "{+KC_LGUI}{KC_A}{-KC_LGUI}{50}{KC_C}hello");
    const release = page.locator('[data-step-tile="2"]');
    const id = await release.getAttribute("data-step-id");
    await release.dragTo(page.locator('[data-step-tile="0"]'), {targetPosition: {x: 3, y: 40}});
    await expect(page.locator('[data-step-tile="0"]')).toHaveAttribute("data-step-id", id);
    await expect(page.locator('[data-step-tile="0"]')).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator('[data-macro-feedback]')).toContainText("released before it is pressed");
    await expect(page.locator('[data-macro-feedback]')).toContainText("not in your draft");
    expect(await updates(page)).toEqual([]);
    await page.locator('[data-step-tile="0"]').dragTo(page.locator('[data-step-tile="1"]'), {targetPosition: {x: 60, y: 40}});
    await expect(page.locator('[data-step-tile="1"]')).toHaveAttribute("data-step-id", id);
    await expect(page.locator('[data-step="1"]')).toBeVisible();
    await expect(page.locator('.macro-token[aria-invalid]')).toHaveCount(0);
    await expect.poll(() => updates(page).then(rows => rows.at(-1)?.payload)).toBe("{+KC_LGUI}{-KC_LGUI}{KC_A}{50}{KC_C}hello");
});

test("text and delays reorder across wrapped rows without losing editor identity", async ({page}) => {
    await page.setViewportSize({width: 800, height: 900});
    await openControls(page, "macros", {macroSlot: "VIA_MACRO_17"});
    await payload(page, "hello{50}{KC_A}{KC_C}{KC_ENT}{KC_LGUI,KC_C}");
    await page.locator('[data-step-tile="0"]').click();
    const fieldId = await page.locator('[data-step-text="0"]').getAttribute("data-f");
    // Start the native drag before scrolling to a partially hidden destination.
    // dragTo scrolls the target before its first mousemove, cancelling Chromium's
    // pending drag when the taller toolbar puts the final wrapped row below view.
    const source = page.locator('[data-step-tile="0"]'), target = page.locator('[data-step-tile="5"]');
    await source.scrollIntoViewIfNeeded();
    const start = await source.boundingBox();
    if (!start) throw new Error('The source tile is missing');
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
    await page.mouse.down();
    await page.mouse.move(start.x + start.width / 2 + 12, start.y + start.height / 2);
    await expect(source).toHaveClass(/dragging/);
    await target.scrollIntoViewIfNeeded();
    const end = await target.boundingBox();
    if (!end) throw new Error('The target tile is missing');
    await page.mouse.move(end.x + end.width - 4, end.y + end.height / 2);
    await page.mouse.move(end.x + end.width - 4, end.y + end.height / 2);
    await page.mouse.up();
    await expect(page.locator('[data-step-text="5"]')).toHaveAttribute("data-f", fieldId);
    await expect(page.locator('[data-step-text="5"]')).toHaveValue("hello");
    await expect.poll(() => updates(page).then(rows => rows.at(-1)?.payload)).toBe("{50}{KC_A}{KC_C}{KC_ENT}{KC_LGUI,KC_C}hello");
    await page.locator('[data-step="5"] [data-move="-1"]').click();
    await expect(page.locator('[data-step-text="4"]')).toHaveAttribute("data-f", fieldId);
    await expect.poll(() => updates(page).then(rows => rows.at(-1)?.payload)).toBe("{50}{KC_A}{KC_C}{KC_ENT}hello{KC_LGUI,KC_C}");
});

test("recording and read-only slots keep their sequence inspectable without offering drag edits", async ({page}) => {
    await openControls(page, "macros", {macroSlot: "VIA_MACRO_17"});
    await payload(page, "{KC_A}{50}{KC_C}");
    await page.locator('[data-act="record"]').click();
    await expect(page.locator('.macro-token[draggable="true"]')).toHaveCount(0);
    await page.locator('[data-act="record"]').click();
    await page.evaluate(async () => {
        const store = await import("/webview/store.mjs"), model = store.getModel();
        store.setModel({...model, macroEditing: {...model.macroEditing, writable: false}}); store.render();
        window.__posted.length = 0;
    });
    await expect(page.locator('.macro-token[draggable="true"]')).toHaveCount(0);
    await page.locator('[data-step-tile="0"]').click();
    await expect(page.locator('[data-step="0"]')).toBeVisible();
    await expect(page.locator('[data-step="0"] [data-pick-step]')).toBeDisabled();
    await expect(page.locator('[data-step="0"] [data-move="1"]')).toBeDisabled();
    expect(await updates(page)).toEqual([]);
});
