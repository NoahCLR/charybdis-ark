"use strict";
const {test, expect} = require("@playwright/test");

async function editor(page) {
    await page.goto("/preview/index.html");
    await page.evaluate(async () => {
        const store = await import("/webview/store.mjs");
        store.state.screen = "macros"; store.state.macroSlot = "VIA_MACRO_17"; store.render();
        window.__posted.length = 0;
    });
}
const updates = page => page.evaluate(() => window.__posted.filter(m => m.type === "updateViaMacro"));
async function add(page, kind) {
    await page.locator("[data-kind]").selectOption(kind);
    await page.locator('[data-act="insert"]').click();
}
async function pick(page, index, keys) {
    await page.locator(`[data-step="${index}"] [data-pick-step]`).click();
    for (const key of keys) await page.locator(`.pkb-key[data-pick="${key}"]`).click();
    await page.locator('.picker [data-act="use"]').click();
}

test("Text accepts code literally and live counters describe pending input before blur", async ({page}) => {
    await editor(page);
    const text = ' {"key": "{KC_A}"}\n\thello ';
    await page.locator("[data-step-text]").fill(text);
    await expect(page.locator("[data-macro-size]")).toContainText(`${Buffer.byteLength(text)} bytes of macro memory`);
    expect(await updates(page)).toHaveLength(0);
    await page.locator("[data-step-text]").dispatchEvent("change");
    await expect.poll(() => updates(page).then(rows => rows.at(-1)?.payload)).toBe(text.replaceAll("{", "{{").replaceAll("}", "}}"));
    await expect(page.locator("[data-raw]")).not.toHaveAttribute("open");
    await expect(page.locator("[data-macro-feedback] .unavailable")).toHaveCount(0);
    await expect(page.locator("[data-local-state]")).toHaveText("edited here");
});

test("oversized text remains editable, reports its size and recovers as soon as it fits", async ({page}) => {
    await editor(page);
    const field = page.locator("[data-step-text]");
    await field.fill("a".repeat(509));
    await field.dispatchEvent("change");
    await expect(page.locator("[data-macro-size]")).toContainText("513 of 512 playback bytes");
    await expect(page.locator("[data-macro-feedback]")).toContainText("This edit is not staged");
    expect(await updates(page)).toHaveLength(0);
    await expect(field).toHaveValue("a".repeat(509));
    await field.fill("a".repeat(508));
    await expect(page.locator("[data-macro-size]")).toContainText("512 of 512 playback bytes");
    await expect(page.locator("[data-macro-feedback] .unavailable")).toHaveCount(0);
    await field.dispatchEvent("change");
    await expect.poll(() => updates(page).then(rows => rows.length)).toBe(1);
});

test("mixed steps edit, reorder and remove; raw commands round-trip through Advanced", async ({page}) => {
    await editor(page);
    await page.locator("[data-step-text]").fill("hi {KC_A}");
    await page.locator("[data-step-text]").dispatchEvent("change");
    await add(page, "delay");
    await page.locator("[data-step-delay]").fill("777");
    await page.locator("[data-step-delay]").dispatchEvent("change");
    await add(page, "tap");
    await pick(page, 2, ["KC_LGUI", "KC_A"]);
    await expect.poll(() => updates(page).then(rows => rows.at(-1)?.payload)).toBe("hi {{KC_A}}{777}{KC_LEFT_GUI,KC_A}");
    // Stored canonical names and the board's short aliases identify one key.
    await page.locator('[data-step="2"] [data-pick-step]').click();
    await expect(page.locator('.pkb-key[data-pick="KC_LGUI"]')).toHaveClass(/on/);
    await page.locator('.pkb-key[data-pick="KC_LGUI"]').click();
    await expect(page.locator('.picker [data-remove]')).toHaveCount(1);
    await page.locator('.pkb-key[data-pick="KC_LGUI"]').click();
    await page.locator('.picker [data-act="cancel"]').first().click();
    await page.locator('[data-step="2"] [data-move="-1"]').click();
    await expect.poll(() => updates(page).then(rows => rows.at(-1)?.payload)).toBe("hi {{KC_A}}{KC_LEFT_GUI,KC_A}{777}");
    await page.locator('[data-step="2"] [data-remove]').click();
    await expect.poll(() => updates(page).then(rows => rows.at(-1)?.payload)).toBe("hi {{KC_A}}{KC_LEFT_GUI,KC_A}");
    await page.locator("[data-raw] summary").click();
    await page.locator("[data-raw-payload]").fill("literal {{braces}}{120}{KC_ENT}");
    await page.locator("[data-raw-payload]").dispatchEvent("change");
    await expect(page.locator("[data-step-text]")).toHaveValue("literal {braces}");
    await expect(page.locator("[data-step-delay]")).toHaveValue("120");
    await expect.poll(() => updates(page).then(rows => rows.at(-1)?.payload)).toBe("literal {{braces}}{120}{KC_ENT}");
    await page.locator("[data-raw-payload]").fill("{+KC_LGUI}{KC_A}{-KC_LEFT_GUI}");
    await page.locator("[data-raw-payload]").dispatchEvent("change");
    await expect(page.locator("[data-pick-step]").first()).toBeEnabled();
    await expect(page.locator("[data-macro-feedback] .unavailable")).toHaveCount(0);
    await expect.poll(() => updates(page).then(rows => rows.at(-1)?.payload)).toBe("{+KC_LGUI}{KC_A}{-KC_LEFT_GUI}");
});

test("press and release pick one basic key; incomplete steps never stage", async ({page}) => {
    await editor(page);
    await add(page, "press");
    await expect(page.locator("[data-macro-feedback]")).toContainText("Choose a key");
    await page.locator('[data-step="1"] [data-pick-step]').click();
    await expect(page.locator("[data-mod], [data-sec=layers], [data-sec=macros], [data-sec=modes]")).toHaveCount(0);
    await page.locator('.pkb-key[data-pick="KC_A"]').click();
    await page.locator('.pkb-key[data-pick="KC_LGUI"]').click();
    await expect(page.locator(".picker [data-remove]")).toHaveCount(1);
    await page.locator('.picker [data-act="use"]').click();
    await expect(page.locator("[data-macro-feedback]")).toContainText("before the macro ends");
    expect(await updates(page)).toHaveLength(0);
    await add(page, "release");
    await pick(page, 2, ["KC_LGUI"]);
    await expect.poll(() => updates(page).then(rows => rows.at(-1)?.payload)).toBe("{+KC_LEFT_GUI}{-KC_LEFT_GUI}");
});

test("recording appends keys to literal text and Clear take restores the exact text", async ({page}) => {
    await editor(page);
    const text = ' {"key": "{KC_A}"}\nhello ';
    await page.locator("[data-step-text]").fill(text);
    await page.locator("[data-step-text]").dispatchEvent("change");
    await expect.poll(() => updates(page).then(rows => rows.length)).toBe(1);
    await page.locator('[data-act="record"]').click();
    await expect(page.locator("[data-step-text]")).toBeDisabled();
    await page.keyboard.press("a");
    await page.locator('[data-act="record"]').click();
    const escaped = text.replaceAll("{", "{{").replaceAll("}", "}}");
    await expect.poll(() => updates(page).then(rows => rows.at(-1)?.payload)).toBe(escaped + "{KC_A}");
    await page.locator('[data-act="clear-take"]').click();
    await expect(page.locator("[data-step-text]")).toHaveValue(text);
    await expect.poll(() => updates(page).then(rows => rows.at(-1)?.payload)).toBe(escaped);
});

test("discarded input ignores delayed validation and can be entered again", async ({page}) => {
    await editor(page);
    await page.locator("[data-step-text]").fill("pending");
    await expect(page.locator("[data-macro-size]")).toContainText("7 bytes of macro memory");
    const request = await page.evaluate(() => window.__posted.find(m => m.type === "validateViaMacro"));
    await page.locator('[data-act="discard"]').click();
    await page.evaluate(message => window.dispatchEvent(new MessageEvent("message", {data: {...message, type: "macroValidation", validation: {error: "OLD ERROR"}}})), request);
    await expect(page.locator("[data-macro-feedback]")).not.toContainText("OLD ERROR");
    await expect(page.locator("[data-step-text]")).toHaveValue("");
    expect(await updates(page)).toHaveLength(0);
    await page.locator("[data-step-text]").fill("pending");
    await page.locator("[data-step-text]").dispatchEvent("change");
    await expect.poll(() => updates(page).then(rows => rows.at(-1)?.payload)).toBe("pending");
});

test("raw edits preserve the next action or step control click", async ({page}) => {
    await editor(page);
    await page.locator("[data-raw] summary").click();
    const raw = page.locator("[data-raw-payload]");
    await raw.fill("invalid {");
    await page.locator('[data-act="discard"]').click();
    await expect(raw).toHaveValue("");
    expect(await updates(page)).toHaveLength(0);

    await raw.fill("another {");
    await page.locator('[data-act="clear"]').click();
    await expect(raw).toHaveValue("");

    await page.locator("[data-kind]").selectOption("delay");
    await raw.fill("new raw text");
    await page.locator('[data-act="insert"]').click();
    await expect(page.locator("[data-step-text]")).toHaveValue("new raw text");
    await expect(page.locator("[data-step-delay]")).toHaveValue("120");
    await expect.poll(() => updates(page).then(rows => rows.at(-1)?.payload)).toBe("new raw text{120}");

    await raw.fill("hi{120}{KC_A}");
    await page.locator('[data-step="1"] [data-move="-1"]').click();
    await expect(raw).toHaveValue("{120}hi{KC_A}");
    await raw.fill("hi{120}{KC_A}");
    await page.locator('[data-step="1"] [data-remove]').click();
    await expect(raw).toHaveValue("hi{KC_A}");
    await raw.fill("{KC_A}");
    await page.locator("[data-pick-step]").click();
    await expect(page.locator(".picker")).toBeVisible();
    await page.locator('.picker [data-act="cancel"]').first().click();
});


test("invalid delay stays local and clears its error while editing a valid value", async ({page}) => {
    await editor(page);
    await add(page, "delay");
    await expect.poll(() => updates(page).then(rows => rows.at(-1)?.payload)).toBe("{120}");
    await page.evaluate(() => {window.__posted.length = 0;});
    const field = page.locator("[data-step-delay]");
    await field.fill("65536");
    await field.dispatchEvent("change");
    await expect(page.locator("[data-macro-feedback]")).toContainText("65,535");
    await expect(field).toHaveValue("65536");
    expect(await updates(page)).toHaveLength(0);
    await field.fill("777");
    await expect(page.locator("[data-macro-feedback] .unavailable")).toHaveCount(0);
    await field.dispatchEvent("change");
    await expect.poll(() => updates(page).then(rows => rows.at(-1)?.payload)).toBe("{777}");
});

test("an old inspection cannot stage after host setup changes at the same draft revision", async ({page}) => {
    await editor(page);
    await page.evaluate(async () => {
        const store = await import("/webview/store.mjs"), model = structuredClone(store.getModel());
        model.macroUnicode = {supported: true, mode: 1, enabled: true};
        store.setModel(model); store.render();
        window.__heldInspections = [];
        window.__dispatchBeforeHold = window.dispatchEvent.bind(window);
        window.dispatchEvent = event => {
            if (event.data?.type === "macroValidation") {window.__heldInspections.push(event.data); return true;}
            return window.__dispatchBeforeHold(event);
        };
    });
    await page.locator("[data-step-text]").fill("café");
    await page.locator("[data-step-text]").dispatchEvent("change");
    await expect.poll(() => page.evaluate(() => window.__heldInspections.length)).toBe(1);
    expect(await updates(page)).toHaveLength(0);
    await page.evaluate(async () => {
        const store = await import("/webview/store.mjs"), model = structuredClone(store.getModel());
        model.macroUnicode = {...model.macroUnicode, mode: 0};
        store.setModel(model); // Simulate changed detection before a pending reply arrives.
        window.dispatchEvent = window.__dispatchBeforeHold;
        window.dispatchEvent(new MessageEvent("message", {data: window.__heldInspections[0]}));
    });
    await expect(page.locator("[data-macro-feedback]")).toContainText("cannot type “é”");
    expect(await updates(page)).toHaveLength(0);
    await expect(page.locator("[data-step-text]")).toHaveValue("café");
});
