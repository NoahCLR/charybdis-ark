// @ts-check
"use strict";
const {test, expect} = require("@playwright/test");
const {openControls, clearPosts, posted, expectPost, change} = require("./control-preview");

const editor = page => page.locator(".pd-editor");
const field = (page, name) => editor(page).getByLabel(name, {exact: true})
    .or(editor(page).locator("label.field").filter({has: page.getByText(name, {exact: true})}).locator("input, select"));
const configPost = (page, slot, config) => expectPost(page, {
    type: "savePdMode", slot, expectedBase: expect.any(Object), config: expect.objectContaining({id: slot, ...config}),
});
async function advanced(page) {
    await editor(page).locator("details summary").click();
    await expect(editor(page).locator("details")).toHaveAttribute("open");
    await expect.poll(() => page.evaluate(async () => (await import("/webview/store.mjs")).state.pdAdvanced)).toBe(true);
}

test("every scrolling tuning field posts the visible value once, retaining the rest of the record", async ({page}) => {
    await openControls(page, "pointing", {pdSlot: 0});
    await advanced(page);
    // Each value keeps every rule the keyboard checks (expiry at least the
    // lock timeout, ratios at least 1:1, retention at most selection), so
    // every change is posted.
    const fields = [
        ["Sideways · per wheel step in sensor counts", "divisorH", 71], ["Up and down · per wheel step in sensor counts", "divisorV", 72],
        ["Minimum interval", "intervalMs", 73], ["Axis lock timeout", "lockMs", 74],
        ["Sideways activation threshold", "thresholdH", 75], ["Up and down activation threshold", "thresholdV", 76],
        ["Gesture expiry", "expireMs", 177], ["Cross-axis decay divisor", "decayDivisor", 78],
        ["Axis selection ratio numerator", "startNumerator", 79], ["Axis retention ratio numerator", "sustainNumerator", 71],
        ["Axis retention ratio denominator", "sustainDenominator", 70], ["Axis selection ratio denominator", "startDenominator", 70],
    ];
    const changed = {invert: 2};
    for (const [label, key, value] of fields) {
        await clearPosts(page);
        await change(field(page, label), value);
        changed[key] = value;
        await configPost(page, 0, {kind: 2, name: "Dragscroll", dpi: 100, scroll: expect.objectContaining({...changed})});
    }
});

for (const [label, value, expected] of [
    ["Name", "Scroll sentinel", {name: "Scroll sentinel"}],
    ["Sensitivity", "1400", {dpi: 1400}],
    ["Sensitivity", "12000", {dpi: 12000}],
    ["Scrolls", "1", {axis: 1}],
    ["Reverse scrolling", "3", {scroll: expect.objectContaining({invert: 3})}],
    ["While this mode runs", "1", {pointerLayer: 1}],
]) {
    test(`scrolling ${label} ${value} posts its record`, async ({page}) => {
        await openControls(page, "pointing", {pdSlot: 0});
        if (label === "Name") await change(field(page, label), value);
        else await field(page, label).selectOption(value);
        await configPost(page, 0, {kind: 2, ...expected});
    });
}

test("each modifier checkbox in scrolling contributes its own bit", async ({page}) => {
    await openControls(page, "pointing", {pdSlot: 0});
    const modifiers = editor(page).locator('.pd-mods [data-bit]');
    await expect(modifiers).toHaveCount(8);
    let mask = 0;
    for (let index = 0; index < 8; index++) {
        const control = modifiers.nth(index);
        const bit = Number(await control.getAttribute("data-bit"));
        await clearPosts(page);
        await control.locator("..").click();
        mask |= bit;
        await configPost(page, 0, {heldModifiers: mask});
    }
});

test("directional shortcuts, axes, empty directions, output and thresholds all post", async ({page}) => {
    // Typed keycodes are the Show keycodes form of a direction.
    await openControls(page, "pointing", {pdSlot: 4, showKeycodes: true});
    const directions = {};
    for (const direction of ["up", "left", "right", "down"]) {
        await clearPosts(page);
        await change(editor(page).locator(`.pd-cross .arm.${direction} input`), "KC_A");
        directions[direction] = expect.objectContaining({keycode: "KC_A"});
        await configPost(page, 4, {directions: expect.objectContaining({...directions})});
    }
    // With every direction set, what an empty one does is not asked.
    await expect(editor(page).locator('[data-f="pointing:4:emptyDirection"]')).toHaveCount(0);
    for (const [label, value, expected] of [
        ["How often it sends", "1", {directionOutput: 1}],
    ]) {
        await clearPosts(page);
        await field(page, label).selectOption(value);
        await configPost(page, 4, expected);
    }
    for (const [axis, key] of [["Sideways step", "thresholdX"], ["Up and down step", "thresholdY"]]) {
        await clearPosts(page);
        await change(editor(page).getByLabel(`${axis} in sensor counts`, {exact: true}), 777);
        await configPost(page, 4, {[key]: 777});
    }
    await clearPosts(page);
    await field(page, "While this mode runs").selectOption("0");
    await configPost(page, 4, {pointerLayer: 0});
    await clearPosts(page);
    await field(page, "Reads").selectOption("0");
    await configPost(page, 4, {axis: 0, thresholdX: 0,
        directions: expect.objectContaining({left: {keycode: "0", modifierPolicy: 0, mask: 0}, right: {keycode: "0", modifierPolicy: 0, mask: 0}})});
});

test("eight directions draw and post every diagonal shortcut and modifier policy", async ({page}) => {
    await openControls(page, "pointing", {pdSlot: 4, showKeycodes: true});
    await field(page, "Reads").selectOption("3");
    await configPost(page, 4, {axis: 3});
    // The host accepts the axis change before the four new fields are drawn.
    await page.evaluate(async () => {
        const store = await import("/webview/store.mjs");
        const model = structuredClone(store.getModel());
        model.pdModes[4].axis = 3;
        for (const key of Object.keys(model.pdModes[4].diagonals)) model.pdModes[4].diagonals[key].keycode = 4;
        store.setModel(model); store.render();
    });
    const diagonals = {};
    for (const direction of ["upLeft", "upRight", "downLeft", "downRight"]) {
        await clearPosts(page);
        await change(editor(page).locator(`.pd-cross .arm.${direction} input`), "KC_B");
        diagonals[direction] = expect.objectContaining({keycode: "KC_B"});
        await configPost(page, 4, {diagonals: expect.objectContaining({...diagonals})});
    }
    await advanced(page);
    for (const label of ["Up", "Left", "Right", "Down", "Up-left", "Up-right", "Down-left", "Down-right"]) {
        await clearPosts(page);
        await field(page, `${label} with held modifiers`).selectOption("2");
        const key = label.replace(/-(\w)/g, (_, letter) => letter.toUpperCase()).replace(/^\w/, letter => letter.toLowerCase());
        const group = label.includes("-") ? "diagonals" : "directions";
        await configPost(page, 4, {[group]: expect.objectContaining({[key]: expect.objectContaining({modifierPolicy: 2, mask: 0})})});
    }
});

test("a direction's Ignore mask and mouse-button modifiers post each checkbox", async ({page}) => {
    await openControls(page, "pointing", {pdSlot: 4});
    await advanced(page);
    for (const [label, initial, expected] of [
        ["Up leaves out", 68, mask => ({directions: expect.objectContaining({up: expect.objectContaining({modifierPolicy: 1, mask})})})],
        ["Down leaves out", 68, mask => ({directions: expect.objectContaining({down: expect.objectContaining({modifierPolicy: 1, mask})})})],
        ["Button 1 holds", 32, modifiers => ({buttons: expect.arrayContaining([expect.objectContaining({kind: 3, modifiers})])})],
    ]) {
        const group = editor(page).locator(".field").filter({has: page.locator(".pd-mods")}).filter({hasText: label});
        const controls = group.locator("[data-bit]");
        await expect(controls).toHaveCount(8);
        let mask = initial;
        for (let index = 0; index < 8; index++) {
            const input = controls.nth(index);
            const bit = Number(await input.getAttribute("data-bit"));
            await clearPosts(page);
            await input.locator("..").click();
            mask ^= bit;
            await configPost(page, 4, expected(mask));
        }
    }
});

test("button overrides wait for a complete shortcut or modifiers, then stage", async ({page}) => {
    await openControls(page, "pointing", {pdSlot: 0});
    await advanced(page);
    await field(page, "Button 1").selectOption("2");
    await configPost(page, 0, {buttons: expect.arrayContaining([expect.objectContaining({kind: 0})])});
    await clearPosts(page);
    await page.evaluate(async () => { const store = await import("/webview/store.mjs"); store.state.showKeycodes = true; store.render(); });
    await change(editor(page).getByLabel("Button 1 shortcut keycode", {exact: true}), "KC_A");
    await configPost(page, 0, {buttons: expect.arrayContaining([expect.objectContaining({kind: 2, tap: expect.objectContaining({keycode: "KC_A"})})])});
    await clearPosts(page);
    await field(page, "Button 2").selectOption("3");
    const modifiers = editor(page).locator(".field").filter({has: page.locator(".pd-mods")}).filter({hasText: "Button 2 holds"});
    await expect(modifiers).toBeVisible();
    await clearPosts(page);
    await modifiers.locator('[data-bit="1"]').locator('..').click();
    await configPost(page, 0, {buttons: expect.arrayContaining([expect.objectContaining({kind: 3, modifiers: 1})])});
    await clearPosts(page);
    await field(page, "Button 3").selectOption("1");
    await configPost(page, 0, {buttons: expect.arrayContaining([expect.objectContaining({kind: 1})])});
});

test("movement changes its form locally, and the first edit posts the new kind", async ({page}) => {
    await openControls(page, "pointing", {pdSlot: 0});
    await field(page, "Movement").selectOption("1");
    expect(await posted(page)).toEqual([]);
    await expect(editor(page).locator(".pd-cross")).toBeVisible();
    await change(field(page, "Name"), "Directional sentinel");
    await configPost(page, 0, {kind: 1, name: "Directional sentinel", thresholdY: 60});
});

test("shortcut picker, duplicate, clear and empty-slot creation post their commands", async ({page}) => {
    await openControls(page, "pointing", {pdSlot: 4});
    await editor(page).locator(".pd-cross .arm.up [data-pick]").click();
    await page.locator('.pkb-key[data-pick="KC_A"]').click();
    await page.locator('.picker [data-act="use"]').click();
    await configPost(page, 4, {directions: expect.objectContaining({up: expect.objectContaining({keycode: expect.stringContaining("KC_A")})})});
    await clearPosts(page);
    await editor(page).locator('[data-act="duplicate"]').click();
    await expectPost(page, {type: "duplicatePdMode", slot: 6, source: 4});
    await page.locator('[data-slot="4"]').click();
    await clearPosts(page);
    await editor(page).locator('[data-act="clear"]').click();
    await expectPost(page, {type: "clearPdMode", slot: 4});
    await page.locator(".tb-list .pd-empties summary").click();
    await page.locator('[data-slot="8"]').click();
    await editor(page).locator(".pd-start-empty summary").click();
    for (const [label, kind] of [["New directional mode", 1], ["New scrolling mode", 2]]) {
        await clearPosts(page);
        await editor(page).getByRole("button", {name: label, exact: true}).click();
        await configPost(page, 8, {kind, name: "Mode 8"});
    }
    await clearPosts(page);
    await editor(page).locator("[data-source]").selectOption("5");
    await editor(page).getByRole("button", {name: "Duplicate into this slot", exact: true}).click();
    await expectPost(page, {type: "duplicatePdMode", slot: 8, source: 5});
});

test("pointing navigation reaches placement and lighting without an edit", async ({page}) => {
    await openControls(page, "pointing", {pdSlot: 4});
    await editor(page).locator('[data-act="place"]').click();
    await expect(page.locator('.main h1')).toHaveText("Keys");
    expect(await posted(page)).toEqual([]);
    await page.locator('[data-screen="mouse"]').click();
    await page.locator('[data-slot="4"]').click();
    await editor(page).locator('[data-act="lighting"]').click();
    await expect(page.locator('[data-ltab="pd"]')).toHaveAttribute("aria-selected", "true");
    expect(await posted(page)).toEqual([]);
});
