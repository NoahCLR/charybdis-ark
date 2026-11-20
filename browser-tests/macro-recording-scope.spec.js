// @ts-check
"use strict";
const {test, expect} = require("@playwright/test");
const {openControls, wideFont} = require("./control-preview");

const take = page => page.evaluate(async () => {
    const {state, macroForm} = await import("/webview/store.mjs");
    return {recording: state.recording?.slot ?? null, payload: macroForm("MACRO_17").draft};
});
const updates = page => page.evaluate(() => window.__posted.filter(message => message.type === "updateMacro"));

test("compact recording captures Command+A as one chord in the original slot", async ({page}) => {
    await openControls(page, "macros", {macroSlot: "MACRO_17", recordDelays: false});
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
    await openControls(page, "macros", {macroSlot: "MACRO_17", recordDelays: false, allSlotsShown: ["macros"]});
    await page.locator('[data-act="record"]').click();
    await page.keyboard.down("Control");
    await page.keyboard.press("a");
    await page.keyboard.press("c");
    await page.keyboard.up("Control");
    await page.locator('[data-slot="MACRO_18"]').click();
    await expect.poll(() => updates(page).then(rows => rows.at(-1)?.payload)).toBe("{KC_LCTL,KC_A}{KC_LCTL,KC_C}");
    await page.locator('[data-slot="MACRO_17"]').click();
    await expect(page.locator('[data-step]')).toHaveCount(2);
});

test("compact recording groups ordinary overlaps but keeps rolling overlap accurate", async ({page}) => {
    await openControls(page, "macros", {macroSlot: "MACRO_17", recordDelays: false});
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
    await openControls(page, "macros", {macroSlot: "MACRO_17", recordDelays: false, recordDelayThreshold: 1000});
    await page.locator('label:has([data-preserve-hold-timing])').click();
    await expect(page.locator('[data-preserve-hold-timing]')).toBeChecked();
    // What it keeps is the recorder's info mark, read once (D-L96).
    await expect(page.locator('[data-recorder] .card-h .info-pop')).toContainText("Keeps individual presses and releases with their timing");
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
    await openControls(page, "macros", {macroSlot: "MACRO_17", recordDelays: false});
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
        await openControls(page, "macros", {macroSlot: "MACRO_17", recordDelays: false, allSlotsShown: ["macros"]});
        await page.locator('[data-act="record"]').click();
        await page.keyboard.press("a");
        expect((await take(page)).payload).toBe("{KC_A}");
        if (destination === "screen") await page.locator('[data-screen="host"]').click();
        if (destination === "slot") await page.locator('[data-slot="MACRO_18"]').click();
        if (destination === "editor") await page.locator('[data-raw-toggle]').click();
        await expect.poll(() => take(page).then(value => value.recording)).toBeNull();
        await page.keyboard.press("b");
        expect((await take(page)).payload).toBe("{KC_A}");
        await expect.poll(() => updates(page)).toEqual([
            expect.objectContaining({keycode: "MACRO_17", payload: "{KC_A}"}),
        ]);
        if (destination === "screen") await expect(page.locator('[data-section="host"]')).toBeVisible();
        if (destination === "slot") await expect(page.locator('[data-macro-editor="MACRO_18"]')).toBeVisible();
        if (destination === "editor") await expect(page.locator('[data-raw]')).toHaveAttribute("open");
    });
}

test("ending an explicit take releases captured held keys and Clear take restores it", async ({page}) => {
    await openControls(page, "macros", {macroSlot: "MACRO_17", recordDelays: false, recordPreserveHoldTiming: true, recordDelayThreshold: 1000, allSlotsShown: ["macros"]});
    await page.locator('[data-insert-kind="text"]').click();
    await page.locator('[data-step-text]').fill("before");
    await page.locator('[data-step-text]').press("Tab");
    await expect.poll(() => updates(page).then(rows => rows.at(-1)?.payload)).toBe("before");
    await page.evaluate(() => {window.__posted.length = 0;});
    await page.locator('[data-act="record"]').click();
    await page.keyboard.down("Shift");
    await page.locator('[data-slot="MACRO_18"]').click();
    await page.keyboard.up("Shift");
    await expect.poll(() => updates(page)).toEqual([
        expect.objectContaining({keycode: "MACRO_17", payload: "before{+KC_LSFT}{-KC_LSFT}"}),
    ]);
    await page.locator('[data-slot="MACRO_17"]').click();
    await page.locator('[data-act="clear-take"]').click();
    await expect.poll(() => updates(page).then(rows => rows.at(-1)?.payload)).toBe("before");
});

// Record delays is switched on mid-take, so the threshold sits above any gap
// between two keys, however slow the machine.
test("recorder options and ordinary rerenders keep a take running; a tapped Escape records, a held one stops it", async ({page}) => {
    await openControls(page, "macros", {macroSlot: "MACRO_17", recordDelays: false, recordDelayThreshold: 1000});
    await page.locator('[data-act="record"]').click();
    await page.locator('label:has([data-delays])').click();
    expect((await take(page)).recording).toBe("MACRO_17");
    await page.keyboard.press("a");
    await page.keyboard.press("Escape");
    expect((await take(page)).recording).toBe("MACRO_17");
    await page.keyboard.down("Escape");
    await expect.poll(() => take(page).then(value => value.recording)).toBeNull();
    await page.keyboard.up("Escape");
    await page.keyboard.press("b");
    expect((await take(page)).payload).toBe("{KC_A}{KC_ESC}");
});

test("while a take records, Enter, Space and Tab are its keys, not the page's", async ({page}) => {
    await openControls(page, "macros", {macroSlot: "MACRO_17", recordDelays: false});
    const record = page.locator('[data-act="record"]');
    await record.click();
    await record.focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press(" ");
    await page.keyboard.press("Tab");
    expect(await take(page)).toEqual({recording: "MACRO_17", payload: "{KC_ENT}{KC_SPC}{KC_TAB}"});
    await expect(record).toBeFocused();
});

test("leaving the page mid-chord finishes the take without the unfinished chord", async ({page}) => {
    await openControls(page, "macros", {macroSlot: "MACRO_17", recordDelays: false});
    await page.locator('[data-act="record"]').click();
    await page.keyboard.press("a");
    await page.keyboard.down("Alt");
    await page.evaluate(() => dispatchEvent(new FocusEvent("blur")));
    await page.keyboard.up("Alt");
    await expect.poll(() => updates(page).then(rows => rows.at(-1)?.payload)).toBe("{KC_A}");
    expect((await take(page)).recording).toBeNull();
});

for (const ending of ['stop', 'escape', 'screen', 'slot', 'editor']) {
    test(`ending a held key via ${ending} preserves elapsed hold timing`, async ({page}) => {
        await openControls(page, 'macros', {macroSlot: 'MACRO_17', recordPreserveHoldTiming: true, recordDelays: false, allSlotsShown: ['macros']});
        await page.locator('[data-act="record"]').click();
        await page.evaluate(() => {
            window.__realRecordingNow = Date.now;
            Date.now = () => 10000;
            document.dispatchEvent(new KeyboardEvent('keydown', {code: 'KeyA', key: 'a', bubbles: true, cancelable: true}));
            Date.now = () => 12000;
        });
        if (ending === 'stop') await page.locator('[data-act="record"]').click();
        if (ending === 'escape') {
            await page.keyboard.down('Escape');
            await expect.poll(() => take(page).then(value => value.recording)).toBeNull();
            await page.keyboard.up('Escape');
        }
        if (ending === 'screen') await page.locator('[data-screen="host"]').click();
        if (ending === 'slot') await page.locator('[data-slot="MACRO_18"]').click();
        if (ending === 'editor') await page.locator('[data-raw-toggle]').click();
        await page.evaluate(() => {Date.now = window.__realRecordingNow;});
        await expect.poll(() => updates(page).then(rows => rows.at(-1)?.payload)).toBe('{+KC_A}{2000}{-KC_A}');
        await expect.poll(() => take(page).then(value => value.recording)).toBeNull();
    });
}

for (const explicit of [false, true]) {
    test(`Clear take cancels a ${explicit ? 'timed' : 'compact'} take without staging or resuming it`, async ({page}) => {
        await openControls(page, 'macros', {macroSlot: 'MACRO_17', recordPreserveHoldTiming: explicit, recordDelays: false});
        await page.locator('[data-act="record"]').click(); await page.keyboard.press('a');
        await page.locator('.macro-editor-card [data-act="clear-take"]').click();
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

test('Clear take during a take restores the macro as it was before Record and preserves its name/protection', async ({page}) => {
    await openControls(page, 'macros', {macroSlot: 'MACRO_17', recordDelays: false});
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
    await page.locator('.macro-editor-card [data-act="clear-take"]').click();
    await expect(page.locator('[data-step-text]')).toHaveValue('local edit');
    await expect(page.locator('[data-name]')).toHaveValue('Keep me');
    await expect(page.locator('[data-protection] input[value="off"]')).toBeChecked();
    expect(await updates(page)).toEqual([]);
    await expect.poll(() => take(page).then(value => value.recording)).toBeNull();
    await page.locator('[data-sequence-tiles]').focus(); await page.keyboard.press('Control+z');
    await expect(page.locator('[data-step-text]')).toHaveValue('original');
});

// Record sits on Record delays' line and Clear take on the next, right of the
// options; narrow, or in a wider font, they take a line under the options and
// nothing in the strip overflows it.
for (const [width, wide] of [[1400, false], [1000, true], [860, true]]) {
    test(`the recorder's actions share the options' lines at ${width}px${wide ? " in a wide font" : ""}`, async ({page}, testInfo) => {
        await page.setViewportSize({width, height: 1000});
        await openControls(page, "macros", {macroSlot: "MACRO_17"});
        if (wide) await wideFont(page);
        const box = async selector => /** @type {{x: number, y: number, width: number, height: number}} */ (await page.locator(`[data-recorder] ${selector}`).boundingBox());
        const strip = await box(".record-opts"), delays = await box(".record-opt:has([data-delays])"), hold = await box(".record-opt:has([data-preserve-hold-timing])");
        const record = await box('[data-act="record"]'), clear = await box('[data-act="clear-take"]');
        const middle = (/** @type {{y: number, height: number}} */ b) => b.y + b.height / 2;
        await page.locator("[data-recorder]").screenshot({path: testInfo.outputPath("recorder.png")});
        expect(await page.locator("[data-recorder] .record-opts").evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
        for (const part of [delays, hold, record, clear]) expect(part.x + part.width).toBeLessThanOrEqual(strip.x + strip.width + 0.5);
        if (record.x > delays.x + delays.width) {
            expect(Math.abs(middle(record) - middle(delays))).toBeLessThan(1);
            expect(Math.abs(middle(clear) - middle(hold))).toBeLessThan(1);
        } else {
            expect(record.y).toBeGreaterThan(hold.y + hold.height);
            expect(Math.abs(middle(record) - middle(clear))).toBeLessThan(1);
        }
    });
}

test("a take rings the canvas in red and says Recording in its corner, and stopping clears both", async ({page}) => {
    await openControls(page, "macros", {macroSlot: "MACRO_17", recordDelays: false});
    const canvas = page.locator(".macro-canvas"), status = page.locator("[data-recording-status]");
    await expect(status).toHaveCount(0);
    await page.locator('[data-act="record"]').click();
    await expect(canvas).toHaveClass(/is-recording/);
    await expect(status.locator(".recording-badge")).toHaveText("Recording");
    await expect(status).toContainText("Hold Escape, press Stop or click elsewhere to finish.");
    await expect(page.locator(".macro-empty")).toContainText("Type, and your keys appear here.");
    const color = await page.locator(".macro-canvas .macro-sequence").evaluate(node => getComputedStyle(node).borderTopColor);
    const danger = await page.evaluate(() => { const probe = Object.assign(document.createElement("i"), {style: "color: var(--danger)"}); document.body.append(probe); const value = getComputedStyle(probe).color; probe.remove(); return value; });
    expect(color).toBe(danger);
    // The badge is the canvas's bottom-right corner, inside it.
    const outer = /** @type {{x: number, y: number, width: number, height: number}} */ (await page.locator(".macro-canvas .macro-sequence").boundingBox());
    const badge = /** @type {{x: number, y: number, width: number, height: number}} */ (await status.locator(".recording-badge").boundingBox());
    expect(outer.x + outer.width - (badge.x + badge.width)).toBeLessThan(40);
    expect(outer.y + outer.height - (badge.y + badge.height)).toBeLessThan(30);
    await expect(page.locator('[data-recorder] [data-act="record"]')).toHaveText("Stop");
    await page.keyboard.press("a");
    await page.locator('[data-act="record"]').click();
    await expect(canvas).not.toHaveClass(/is-recording/);
    await expect(status).toHaveCount(0);
    await expect(page.locator("[data-recorder] .card-h .tag")).toHaveText("recorded");
});

test("a take that grows the steps keeps Stop in view, scrolling the page down with it", async ({page}) => {
    await page.setViewportSize({width: 1400, height: 760});
    await openControls(page, "macros", {macroSlot: "MACRO_17", recordDelays: false});
    const stop = page.locator('[data-recorder] [data-act="record"]');
    await stop.scrollIntoViewIfNeeded();
    await stop.click();
    const contentBottom = () => page.locator(".content").evaluate(node => node.getBoundingClientRect().bottom);
    const startTop = await page.locator(".content").evaluate(node => node.scrollTop);
    for (const key of "abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz") await page.keyboard.press(key);
    await expect.poll(async () => (/** @type {{y: number, height: number}} */ (await stop.boundingBox())).y + 32 <= await contentBottom()).toBe(true);
    expect(await page.locator(".content").evaluate(node => node.scrollTop)).toBeGreaterThan(startTop);
    // Pinned there, Stop holds still from key to key: the scroll lands in the
    // same frame as the redraw, never a glide the next key cuts short.
    const stopTop = () => page.locator('[data-recorder] [data-act="record"]').evaluate(node => Math.round(node.getBoundingClientRect().top));
    const pinned = await stopTop(), tops = [];
    for (const key of "abcdefghijklmnopqrstuvwxyz") { await page.keyboard.press(key); tops.push(await stopTop()); }
    expect(tops.every(top => Math.abs(top - pinned) <= 1)).toBe(true);
    // The Recording dot is drawn at its pulse's place on the clock, so a
    // redraw continues its beat rather than restarting it.
    expect(await page.locator(".recording-badge").evaluate(node => getComputedStyle(node, "::before").animationDelay)).toMatch(/^-\d/);
    await expect(stop).toHaveText("Stop");
    await stop.click();
    await expect.poll(() => updates(page).then(rows => rows.at(-1)?.payload.length)).toBeGreaterThan(0);
});

test("while a take records, nothing comes and goes between the steps and the recorder; the take is checked once it finishes", async ({page}) => {
    await openControls(page, "macros", {macroSlot: "MACRO_17", recordDelays: false});
    const feedback = page.locator("[data-macro-feedback]");
    const checks = () => page.evaluate(() => window.__posted.filter(message => message.type === "validateMacro").length);
    await page.locator('[data-act="record"]').click();
    const recorderTop = () => page.locator("[data-recorder]").evaluate(node => Math.round(node.getBoundingClientRect().top));
    // The first step turns the empty canvas into a row of steps; the next keys
    // fit that row, so the recorder has no reason to move.
    await page.keyboard.press("x");
    const top = await recorderTop();
    // A held key and each key's check would each show a line here.
    await page.keyboard.down("Shift");
    await expect(feedback).toBeHidden();
    await page.keyboard.press("a");
    await expect(feedback).toBeHidden();
    await page.keyboard.up("Shift");
    await page.keyboard.press("b");
    await expect(feedback).toBeHidden();
    expect(await recorderTop()).toBe(top);
    expect(await checks()).toBe(0);
    await page.locator('[data-act="record"]').click();
    await expect.poll(checks).toBeGreaterThan(0);
});
