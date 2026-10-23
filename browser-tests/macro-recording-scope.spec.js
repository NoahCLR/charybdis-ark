// @ts-check
"use strict";
const {test, expect} = require("@playwright/test");
const {openControls} = require("./control-preview");

const take = page => page.evaluate(async () => {
    const {state, macroForm} = await import("/webview/store.mjs");
    return {recording: state.recording?.slot ?? null, payload: macroForm("VIA_MACRO_17").draft};
});
const updates = page => page.evaluate(() => window.__posted.filter(message => message.type === "updateMacro"));

test("compact recording captures Command+A as one chord in the original slot", async ({page}) => {
    await openControls(page, "macros", {macroSlot: "VIA_MACRO_17", recordDelays: false});
    await expect(page.locator('[data-preserve-hold-timing]')).toBeVisible();
    await expect(page.locator('[data-recorder] details')).toHaveCount(0);
    await expect(page.locator('[data-recorder] select')).toHaveCount(0);
    await page.locator('[data-act="record"]').click();
    await page.keyboard.down("Meta");
    await page.keyboard.down("a");
    await page.keyboard.up("a");
    await page.keyboard.up("Meta");
    await page.locator('[data-act="record"]').click();
    await expect.poll(() => updates(page).then(rows => rows.at(-1)?.payload)).toBe("{KC_LGUI,KC_A}");
    await expect(page.locator('[data-step]')).toHaveCount(1);
    await expect(page.locator('[data-step] .tok')).toContainText("A");
});

test("compact recording retains a modifier across shortcuts without stray modifier taps", async ({page}) => {
    await openControls(page, "macros", {macroSlot: "VIA_MACRO_17", recordDelays: false});
    await page.locator('[data-act="record"]').click();
    await page.keyboard.down("Control");
    await page.keyboard.press("a");
    await page.keyboard.press("c");
    await page.keyboard.up("Control");
    await page.locator('[data-slot="VIA_MACRO_18"]').click();
    await expect.poll(() => updates(page).then(rows => rows.at(-1)?.payload)).toBe("{KC_LCTL,KC_A}{KC_LCTL,KC_C}");
    await page.locator('[data-slot="VIA_MACRO_17"]').click();
    await expect(page.locator('[data-step]')).toHaveCount(2);
});

test("compact recording groups ordinary overlaps but keeps rolling overlap accurate", async ({page}) => {
    await openControls(page, "macros", {macroSlot: "VIA_MACRO_17", recordDelays: false});
    await page.locator('[data-act="record"]').click();
    await page.keyboard.down("a"); await page.keyboard.down("s");
    await page.keyboard.up("a"); await page.keyboard.up("s");
    await page.keyboard.down("a"); await page.keyboard.down("s");
    await page.keyboard.up("a"); await page.keyboard.down("d");
    await page.keyboard.up("s"); await page.keyboard.up("d");
    await page.locator('[data-act="record"]').click();
    await expect.poll(() => updates(page).then(rows => rows.at(-1)?.payload)).toBe("{KC_A,KC_S}{+KC_A}{+KC_S}{-KC_A}{+KC_D}{-KC_S}{-KC_D}");
});

test("Preserve hold timing preserves Command+A as press and release steps", async ({page}, testInfo) => {
    await openControls(page, "macros", {macroSlot: "VIA_MACRO_17", recordDelays: false, recordDelayThreshold: 1000});
    await page.locator('label:has([data-preserve-hold-timing])').click();
    await expect(page.locator('[data-preserve-hold-timing]')).toBeChecked();
    await expect(page.locator('[data-recorder]')).toContainText("Preserving hold timing");
    await page.locator('[data-recorder]').screenshot({path: testInfo.outputPath("recorder-options.png")});
    await page.locator('[data-act="record"]').click();
    await expect(page.locator('[data-preserve-hold-timing]')).toBeDisabled();
    await page.keyboard.down("Meta"); await page.keyboard.down("a");
    await page.keyboard.up("a"); await page.keyboard.up("Meta");
    await page.locator('[data-act="record"]').click();
    await expect.poll(() => updates(page).then(rows => rows.at(-1)?.payload)).toBe("{+KC_LGUI}{+KC_A}{-KC_A}{-KC_LGUI}");
    await expect(page.locator('[data-step]')).toHaveCount(4);
});

test("Preserve hold timing records a held key even when ordinary delay recording was off", async ({page}) => {
    await openControls(page, "macros", {macroSlot: "VIA_MACRO_17", recordDelays: false});
    await page.locator('label:has([data-preserve-hold-timing])').click();
    await expect(page.locator('[data-delays]')).toBeChecked();
    await expect(page.locator('[data-delays]')).toBeDisabled();
    await expect(page.locator('[data-threshold]')).toBeEnabled();
    await page.locator('[data-act="record"]').click();
    await page.evaluate(() => {
        const now = Date.now;
        try {
            for (const [type, time] of [["keydown", 10000], ["keyup", 12000]]) {
                Date.now = () => time;
                document.dispatchEvent(new KeyboardEvent(type, {code: "KeyA", key: "a", bubbles: true, cancelable: true}));
            }
        } finally {Date.now = now;}
    });
    await page.locator('[data-act="record"]').click();
    await expect.poll(() => updates(page).then(rows => rows.at(-1)?.payload)).toBe("{+KC_A}{2000}{-KC_A}");
    await expect(page.locator('[data-preserve-hold-timing]')).toBeVisible();
    await page.locator('label:has([data-preserve-hold-timing])').click();
    await expect(page.locator('[data-delays]')).not.toBeChecked();
    await expect(page.locator('[data-delays]')).toBeEnabled();
});

for (const destination of ["screen", "slot", "editor"]) {
    test(`leaving the recorder for another ${destination} finishes only the original slot`, async ({page}) => {
        await openControls(page, "macros", {macroSlot: "VIA_MACRO_17", recordDelays: false});
        await page.locator('[data-act="record"]').click();
        await page.keyboard.press("a");
        expect((await take(page)).payload).toBe("{KC_A}");
        if (destination === "screen") await page.locator('[data-screen="settings"]').click();
        if (destination === "slot") await page.locator('[data-slot="VIA_MACRO_18"]').click();
        if (destination === "editor") await page.locator('[data-raw-toggle]').click();
        await expect.poll(() => take(page).then(value => value.recording)).toBeNull();
        await page.keyboard.press("b");
        expect((await take(page)).payload).toBe("{KC_A}");
        await expect.poll(() => updates(page)).toEqual([
            expect.objectContaining({keycode: "VIA_MACRO_17", payload: "{KC_A}"}),
        ]);
        if (destination === "screen") await expect(page.locator('#settingsSearch')).toBeVisible();
        if (destination === "slot") await expect(page.locator('[data-macro-editor="VIA_MACRO_18"]')).toBeVisible();
        if (destination === "editor") await expect(page.locator('[data-raw]')).toHaveAttribute("open");
    });
}

test("ending an explicit take releases captured held keys and Clear take restores it", async ({page}) => {
    await openControls(page, "macros", {macroSlot: "VIA_MACRO_17", recordDelays: false, recordPreserveHoldTiming: true, recordDelayThreshold: 1000});
    await page.locator('[data-insert-kind="text"]').click();
    await page.locator('[data-step-text]').fill("before");
    await page.locator('[data-step-text]').press("Tab");
    await expect.poll(() => updates(page).then(rows => rows.at(-1)?.payload)).toBe("before");
    await page.evaluate(() => {window.__posted.length = 0;});
    await page.locator('[data-act="record"]').click();
    await page.keyboard.down("Shift");
    await page.locator('[data-slot="VIA_MACRO_18"]').click();
    await page.keyboard.up("Shift");
    await expect.poll(() => updates(page)).toEqual([
        expect.objectContaining({keycode: "VIA_MACRO_17", payload: "before{+KC_LSFT}{-KC_LSFT}"}),
    ]);
    await page.locator('[data-slot="VIA_MACRO_17"]').click();
    await page.locator('[data-act="clear-take"]').click();
    await expect.poll(() => updates(page).then(rows => rows.at(-1)?.payload)).toBe("before");
});

test("recorder options and ordinary rerenders keep a take running; Escape stops it", async ({page}) => {
    await openControls(page, "macros", {macroSlot: "VIA_MACRO_17", recordDelays: false});
    await page.locator('[data-act="record"]').click();
    await page.locator('label:has([data-delays])').click();
    expect((await take(page)).recording).toBe("VIA_MACRO_17");
    await page.keyboard.press("a");
    await page.keyboard.press("Escape");
    await expect.poll(() => take(page).then(value => value.recording)).toBeNull();
    await page.keyboard.press("b");
    expect((await take(page)).payload).toBe("{KC_A}");
});

for (const ending of ['stop', 'escape', 'screen', 'slot', 'editor']) {
    test(`ending a held key via ${ending} preserves elapsed hold timing`, async ({page}) => {
        await openControls(page, 'macros', {macroSlot: 'VIA_MACRO_17', recordPreserveHoldTiming: true, recordDelays: false});
        await page.locator('[data-act="record"]').click();
        await page.evaluate(() => {
            window.__realRecordingNow = Date.now;
            Date.now = () => 10000;
            document.dispatchEvent(new KeyboardEvent('keydown', {code: 'KeyA', key: 'a', bubbles: true, cancelable: true}));
            Date.now = () => 12000;
        });
        if (ending === 'stop') await page.locator('[data-act="record"]').click();
        if (ending === 'escape') await page.keyboard.press('Escape');
        if (ending === 'screen') await page.locator('[data-screen="settings"]').click();
        if (ending === 'slot') await page.locator('[data-slot="VIA_MACRO_18"]').click();
        if (ending === 'editor') await page.locator('[data-raw-toggle]').click();
        await page.evaluate(() => {Date.now = window.__realRecordingNow;});
        await expect.poll(() => updates(page).then(rows => rows.at(-1)?.payload)).toBe('{+KC_A}{2000}{-KC_A}');
        await expect.poll(() => take(page).then(value => value.recording)).toBeNull();
    });
}

for (const explicit of [false, true]) {
    test(`Discard cancels a ${explicit ? 'timed' : 'compact'} take without staging or resuming it`, async ({page}) => {
        await openControls(page, 'macros', {macroSlot: 'VIA_MACRO_17', recordPreserveHoldTiming: explicit, recordDelays: false});
        await page.locator('[data-act="record"]').click(); await page.keyboard.press('a');
        await page.locator('.macro-editor-card [data-act="discard"]').click();
        await expect.poll(() => take(page).then(value => value.recording)).toBeNull();
        await expect(page.locator('.macro-empty')).toBeVisible();
        await expect(page.locator('.macro-editor-card [data-act="clear-take"]')).toBeDisabled();
        await page.keyboard.press('b');
        expect(await updates(page)).toEqual([]);
        expect((await take(page)).payload ?? '').toBe('');
        await page.locator('[data-sequence-tiles]').focus(); await page.keyboard.press('Control+z');
        await expect(page.locator('.macro-empty')).toBeVisible();
        await page.locator('[data-act="record"]').click(); await page.keyboard.press('c'); await page.locator('[data-act="record"]').click();
        await expect.poll(() => updates(page).then(rows => rows.at(-1)?.payload.replace(/\{\d+\}/g, ''))).toBe(explicit ? '{+KC_C}{-KC_C}' : '{KC_C}');
    });
}

test('Discard during a take restores an existing macro and preserves its name/protection', async ({page}) => {
    await openControls(page, 'macros', {macroSlot: 'VIA_MACRO_17', recordDelays: false});
    await page.evaluate(async () => {
        const store = await import('/webview/store.mjs'), model = structuredClone(store.getModel());
        Object.assign(model.macros[17], {payload: 'original', bytes: 8, empty: false, name: 'Keep me', protection: 'off'});
        store.setModel(model); store.resetDraftForms(); store.render();
    });
    await page.locator('[data-step-text]').fill('local edit'); await page.locator('[data-step-text]').press('Tab');
    await expect.poll(() => updates(page).then(rows => rows.at(-1)?.payload)).toBe('local edit');
    await page.locator('[data-act="record"]').click();
    await page.evaluate(() => {window.__posted.length = 0;});
    await page.keyboard.press('a');
    await page.locator('.macro-editor-card [data-act="discard"]').click();
    await expect(page.locator('[data-step-text]')).toHaveValue('original');
    await expect(page.locator('[data-name]')).toHaveValue('Keep me');
    await expect(page.locator('[data-protection]')).toHaveValue('off');
    expect(await updates(page)).toEqual([]);
    await expect.poll(() => take(page).then(value => value.recording)).toBeNull();
    await page.locator('[data-sequence-tiles]').focus(); await page.keyboard.press('Control+z');
    await expect(page.locator('[data-step-text]')).toHaveValue('local edit');
});
