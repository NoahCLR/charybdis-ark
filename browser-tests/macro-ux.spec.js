// @ts-check
"use strict";
const {test, expect} = require("@playwright/test");
const {openControls, publishAccepted} = require("./control-preview");
const updates = page => page.evaluate(() => window.__posted.filter(m => m.type === "updateMacro"));

for (const theme of ["dark", "light"]) {
    test(`macro bank keeps its scroll when selecting, editing and recording a later slot (${theme})`, async ({page}) => {
        await openControls(page, "macros", {macroSlot: "MACRO_17", recordDelays: false}, theme);
        const bank = page.locator(".macros-library .macro-grid");
        const slot = page.locator('[data-slot="MACRO_100"]');
        await slot.scrollIntoViewIfNeeded();
        const position = await bank.evaluate(node => node.scrollTop);
        expect(position).toBeGreaterThan(0);
        const expectPosition = () => expect.poll(() => bank.evaluate(node => node.scrollTop)).toBe(position);

        await slot.click();
        await expectPosition();
        await expect(slot).toHaveAttribute("aria-current", "true");
        await page.locator('[data-insert-kind="delay"]').click();
        await expectPosition();
        await page.locator("[data-step-delay]").fill("777");
        await page.locator("[data-step-delay]").press("Tab");
        await expect.poll(() => updates(page).then(rows => rows.at(-1)?.payload)).toBe("{777}");
        await publishAccepted(page, ["macros", 100, "payload"], "{777}");
        await expectPosition();

        await page.locator('[data-act="record"]').click();
        await page.keyboard.press("a");
        await expectPosition();
        await page.locator('[data-act="record"]').click();
        await expectPosition();
        await expect.poll(() => updates(page).then(rows => rows.at(-1)?.payload)).toBe("{777}{KC_A}");

        await page.locator('[data-screen="host"]').click();
        await page.locator('[data-screen="macros"]').click();
        await expect.poll(() => bank.evaluate(node => node.scrollTop)).toBe(0);
    });
}

test("dropping in the space before the first tile inserts the dragged step first", async ({page}) => {
    await openControls(page, "macros", {macroSlot: "MACRO_17"});
    await page.locator("[data-raw-toggle]").click();
    await page.locator("[data-raw-payload]").fill("{KC_A}{KC_C}");
    await page.locator("[data-raw-payload]").press("Tab");
    await expect.poll(() => page.evaluate(() => window.__posted.filter(m => m.type === "updateMacro").at(-1)?.payload)).toBe("{KC_A}{KC_C}");
    const dragged = await page.locator('[data-step-tile="1"]').getAttribute("data-step-id");
    await page.locator('[data-step-tile="1"]').dragTo(page.locator("[data-sequence-tiles]"), {targetPosition: {x: 1, y: 50}});
    await expect(page.locator('[data-step-tile="0"]')).toHaveAttribute("data-step-id", dragged, {timeout: 1000});
    await expect.poll(() => page.evaluate(() => window.__posted.filter(m => m.type === "updateMacro").at(-1)?.payload)).toBe("{KC_C}{KC_A}");
});

test("the first step can move to trailing whitespace after wrapped rows", async ({page}) => {
    await page.setViewportSize({width: 800, height: 900});
    await openControls(page, "macros", {macroSlot: "MACRO_17"});
    await page.locator('[data-raw-toggle]').click();
    await page.locator('[data-raw-payload]').fill('{KC_A}{KC_B}{KC_C}{KC_D}{KC_ENT}');
    await page.locator('[data-raw-payload]').press('Tab');
    await expect.poll(() => updates(page).then(rows => rows.at(-1)?.payload)).toBe('{KC_A}{KC_B}{KC_C}{KC_D}{KC_ENT}');
    const root = page.locator('[data-sequence-tiles]');
    await root.scrollIntoViewIfNeeded();
    const geometry = await root.evaluate(node => {
        const box = node.getBoundingClientRect(), tiles = [...node.querySelectorAll('[data-step-id]')].map(t => t.getBoundingClientRect());
        return {width: box.width, height: box.height, wrapped: tiles.at(-1).top > tiles[0].top};
    });
    expect(geometry.wrapped).toBe(true);
    const first = await page.locator('[data-step-tile="0"]').getAttribute('data-step-id');
    await page.locator('[data-step-tile="0"]').dragTo(root, {targetPosition: {x: geometry.width - 12, y: geometry.height - 12}, timeout:5000});
    await expect(page.locator('[data-step-tile="4"]')).toHaveAttribute('data-step-id', first);
    await expect.poll(() => updates(page).then(rows => rows.at(-1)?.payload)).toBe('{KC_B}{KC_C}{KC_D}{KC_ENT}{KC_A}');
});

test("the macro title is the only name input, with Enter to commit and Escape to cancel", async ({page}) => {
    await openControls(page, "macros", {macroSlot: "MACRO_17"});
    const title = page.getByRole("textbox", {name: "Macro name", exact: true});
    await expect(page.locator("[data-name]")).toHaveCount(1);
    await expect(page.locator(".macro-titlebar [data-name]")).toHaveCount(1);
    await title.fill("Copy selection");
    await title.press("Enter");
    await expect.poll(() => updates(page).then(rows => rows.at(-1)?.name)).toBe("Copy selection");
    await page.evaluate(() => {window.__posted.length = 0;});
    await title.fill("Cancelled"); await title.press("Escape");
    await expect(title).toHaveValue(""); // The fixture's stored name has not been replaced by the posted edit.
    expect(await updates(page)).toEqual([]);
    await expect(page.locator("[data-protection]")).toBeVisible();
});

test("an empty macro has no placeholder; key picking cancels cleanly and Delay creates one step", async ({page}) => {
    await openControls(page, "macros", {macroSlot: "MACRO_17"});
    await expect(page.locator(".macro-empty")).toBeVisible();
    await expect(page.locator(".macro-token")).toHaveCount(0);
    await page.locator('[data-insert-kind="tap"]').click();
    await expect(page.locator(".picker")).toBeVisible();
    await page.locator('.picker [data-act="cancel"]').first().click();
    await expect(page.locator(".macro-token")).toHaveCount(0);
    expect(await updates(page)).toEqual([]);
    await page.locator('[data-insert-kind="delay"]').click();
    await expect(page.locator(".macro-token")).toHaveCount(1);
    await expect(page.locator("[data-step-text]")).toHaveCount(0);
    await expect(page.locator("[data-step-delay]")).toBeFocused();
    await expect.poll(() => updates(page).then(rows => rows.at(-1)?.payload)).toBe("{120}");
    await page.locator('[data-act="clear"]').click();
    await expect(page.locator(".macro-empty")).toBeVisible();
});

test("a blank Text starter is replaced by a shortcut; written text is retained before another shortcut", async ({page}) => {
    await openControls(page, "macros", {macroSlot: "MACRO_17"});
    await page.locator('[data-insert-kind="text"]').click();
    await expect(page.locator("[data-step-text]")).toBeFocused();
    await page.locator('[data-insert-kind="tap"]').click();
    await page.locator('.pkb-key[data-pick="KC_C"]').click();
    await page.locator('.picker [data-act="use"]').click();
    await expect(page.locator(".macro-token")).toHaveCount(1);
    await expect(page.locator("[data-step-text]")).toHaveCount(0);
    await expect.poll(() => updates(page).then(rows => rows.at(-1)?.payload)).toBe("{KC_C}");
    await page.locator('[data-insert-kind="text"]').click();
    await page.locator('[data-step-text="1"]').fill("hello");
    await page.locator('[data-insert-kind="tap"]').click();
    await page.locator('.pkb-key[data-pick="KC_ENT"]').click();
    await page.locator('.picker [data-act="use"]').click();
    await expect(page.locator(".macro-token")).toHaveCount(3);
    await expect(page.locator('[data-step-text="1"]')).toHaveValue("hello");
    await expect.poll(() => updates(page).then(rows => rows.at(-1)?.payload)).toBe("{KC_C}hello{KC_ENTER}");
});

for (const theme of ["dark", "light"]) {
    test(`sequence stays above optional guidance and recorder controls stay visible (${theme})`, async ({page}) => {
        await page.setViewportSize({width: 1400, height: 1200});
        await openControls(page, "macros", {macroSlot: "MACRO_17"}, theme);
        await page.locator('[data-insert-kind="text"]').click();
        await page.locator('[data-step-text]').fill("Thanks, I'll take a look.");
        await page.locator('[data-step-text]').press("Tab");
        await page.locator('[data-insert-kind="delay"]').click();
        await page.locator('[data-step-delay]').fill('250');
        await page.locator('[data-step-delay]').press('Tab');
        await page.locator('[data-insert-kind="tap"]').click();
        await page.locator('.pkb-key[data-pick="KC_LGUI"]').click();
        await page.locator('.pkb-key[data-pick="KC_ENT"]').click();
        await page.locator('.picker [data-act="use"]').click();
        await page.locator('[data-close-step]:visible').click();
        await expect(page.locator('[data-guidance]')).not.toHaveAttribute("open");
        await expect(page.locator('[data-protection]')).toBeVisible();
        await expect(page.locator('[data-preserve-hold-timing]')).toBeVisible();
        await expect(page.locator('[data-host-settings]')).toBeVisible();
        await page.locator('[data-show-help]').click();
        await expect(page.locator('[data-guidance]')).toBeVisible();
        await expect(page.locator('[data-guidance]')).toContainText("Only the macro types");
        await page.locator('[data-show-help]').click();
        await page.getByRole('textbox', {name: 'Macro name', exact: true}).fill('Quick reply');
        await page.getByRole('textbox', {name: 'Macro name', exact: true}).press('Enter');
        await publishAccepted(page, ['macros', 17, 'name'], 'Quick reply');
        await page.locator('.macros-library').screenshot({path: `/tmp/ark-macro-ux-${theme}.png`});
    });
}

async function writePayload(page, payload) {
    await page.locator('[data-raw-toggle]').check();
    await page.locator('[data-raw-payload]').fill(payload);
    await page.locator('[data-raw-payload]').press('Tab');
    await expect.poll(() => updates(page).then(rows => rows.at(-1)?.payload)).toBe(payload);
    await page.evaluate(() => {window.__posted.length = 0;});
}

for (const key of ['Delete', 'Backspace']) {
    test(`${key} removes the focused step and keeps focus through deleting the last step`, async ({page}) => {
        await openControls(page, 'macros', {macroSlot: 'MACRO_17'});
        await writePayload(page, '{KC_A}{KC_B}{KC_C}');
        const tiles = page.locator('[data-step-tile]');
        const lastId = await tiles.nth(2).getAttribute('data-step-id');
        await tiles.nth(1).click();
        await page.keyboard.press(key);
        await expect(tiles).toHaveCount(2);
        await expect(tiles.nth(1)).toHaveAttribute('data-step-id', lastId);
        await expect(tiles.nth(1)).toBeFocused();
        await expect.poll(() => updates(page).then(rows => rows.at(-1)?.payload)).toBe('{KC_A}{KC_C}');
        await page.keyboard.press(key);
        await expect(tiles.first()).toBeFocused();
        await expect.poll(() => updates(page).then(rows => rows.at(-1)?.payload)).toBe('{KC_A}');
        // The fixture does not apply posts itself. Accept the last nonempty
        // draft so clearing it must post, rather than returning to its original empty value.
        await publishAccepted(page, ['macros', 17, 'payload'], '{KC_A}');
        await expect(tiles.first()).toBeFocused();
        await page.keyboard.press(key);
        await expect(page.locator('.macro-empty')).toBeVisible();
        await expect(page.locator('[data-insert-kind="text"]')).toBeFocused();
        await expect.poll(() => updates(page).then(rows => rows.at(-1)?.payload)).toBe('');
        await page.keyboard.press(key);
        expect(await updates(page)).toHaveLength(3);
    });
}

test('deletion uses step identity after a reorder and consumes auto-repeat', async ({page}) => {
    await openControls(page, 'macros', {macroSlot: 'MACRO_17'});
    await writePayload(page, '{KC_A}{KC_B}{KC_C}');
    await page.locator('[data-step-tile="0"]').click();
    await page.locator('[data-step="0"] [data-move="1"]').click();
    await page.locator('[data-step="1"] [data-pick-step]').focus();
    await page.keyboard.press('Backspace');
    await expect.poll(() => updates(page).then(rows => rows.at(-1)?.payload)).toBe('{KC_B}{KC_C}');
    const prevented = await page.locator('[data-step-tile="1"]').evaluate(node => {
        const event = new KeyboardEvent('keydown', {key: 'Backspace', repeat: true, bubbles: true, cancelable: true});
        node.dispatchEvent(event); return event.defaultPrevented;
    });
    expect(prevented).toBe(true);
    await expect(page.locator('[data-step-tile]')).toHaveCount(2);
    await page.keyboard.press('Control+Backspace');
    await expect(page.locator('[data-step-tile]')).toHaveCount(2);
});

test('Delete and Backspace keep editing text, delay, raw payload and the title', async ({page}) => {
    await openControls(page, 'macros', {macroSlot: 'MACRO_17'});
    await writePayload(page, 'hello{120}{KC_C}');
    await page.locator('[data-step-tile="0"]').click();
    const text = page.locator('[data-step-text="0"]');
    await text.focus(); await text.evaluate(node => node.setSelectionRange(node.value.length, node.value.length)); await text.press('Backspace');
    await expect(text).toHaveValue('hell');
    await text.evaluate(node => node.setSelectionRange(0, 0)); await text.press('Delete');
    await expect(text).toHaveValue('ell');
    await page.locator('[data-step-tile="1"]').click();
    await page.locator('[data-step-delay]').focus(); await page.keyboard.press('Backspace');
    await expect(page.locator('[data-step-tile]')).toHaveCount(3);
    const title = page.getByRole('textbox', {name: 'Macro name', exact: true});
    await title.fill('Test'); await title.press('Backspace');
    await expect(title).toHaveValue('Tes');
    await page.locator('[data-raw-payload]').fill('abc{KC_C}');
    await page.locator('[data-raw-payload]').evaluate(node => node.setSelectionRange(0, 0)); await page.keyboard.press('Delete');
    await expect(page.locator('[data-raw-payload]')).toHaveValue('bc{KC_C}');
    await expect(page.locator('[data-step-tile]')).toHaveCount(2);
});

test('read-only macro tiles cannot be deleted', async ({page}) => {
    await openControls(page, 'macros', {macroSlot: 'MACRO_17'});
    await writePayload(page, '{KC_A}{KC_C}');
    await page.evaluate(async () => {
        const store = await import('/webview/store.mjs'), model = store.getModel();
        store.setModel({...model, macroEditing: {...model.macroEditing, writable: false}}); store.render();
    });
    await page.locator('[data-step-tile="0"]').click();
    await page.keyboard.press('Delete'); await page.keyboard.press('Backspace');
    await expect(page.locator('[data-step-tile]')).toHaveCount(2);
    expect(await updates(page)).toEqual([]);
});

for (const theme of ["dark", "light"]) {
    test(`Raw payload is a persistent toggle on the right of the add row; tile focus has no extra outline (${theme})`, async ({page}) => {
        await page.setViewportSize({width: 1400, height: 1000});
        await openControls(page, 'macros', {macroSlot: 'MACRO_17'}, theme);
        const toggle = page.getByRole('checkbox', {name: 'Raw payload', exact: true});
        const positions = await page.locator('.macro-insert-tools').evaluate(row => {
            const add = row.querySelector('[data-insert-kind="text"]').getBoundingClientRect();
            const raw = row.querySelector('.macro-raw-toggle').getBoundingClientRect();
            return {addY: add.top + add.height / 2, rawY: raw.top + raw.height / 2, rightGap: row.getBoundingClientRect().right - raw.right};
        });
        expect(Math.abs(positions.addY - positions.rawY)).toBeLessThan(1);
        expect(positions.rightGap).toBeLessThan(1);
        await expect(toggle).not.toBeChecked();
        await expect(page.locator('[data-raw-payload]')).toBeHidden();
        await writePayload(page, '{KC_A}{KC_C}');
        await page.locator('[data-step-tile="0"]').click();
        await page.locator('[data-step="0"] [data-move="1"]').click();
        await expect(toggle).toBeChecked();
        await expect(page.locator('[data-raw-payload]')).toBeVisible();
        const tile = page.locator('[data-step-tile="1"]');
        await expect(tile).toBeFocused();
        expect(await tile.evaluate(node => getComputedStyle(node).outlineStyle)).toBe('none');
        await expect(tile).toHaveAttribute('aria-pressed', 'true');
        await toggle.uncheck();
        await expect(page.locator('[data-raw-payload]')).toBeHidden();
        await page.locator('[data-step="1"] [data-close-step]').click();
        await expect(toggle).not.toBeChecked();
        await expect(page.locator('[data-raw-payload]')).toBeHidden();
    });
}
