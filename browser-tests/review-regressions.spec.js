// @ts-check
"use strict";
const {test, expect} = require("@playwright/test");
const {openControls, clearPosts, expectPost, change, publishAccepted} = require("./control-preview");

// Layer 15 is empty, so its row shows once the empty layers do.
for (const [index, destination] of [[1, 14], [9, 6]]) {
    test(`dragging Layer 15 into visual row ${index} posts slot ${destination}`, async ({page}) => {
        await openControls(page, "keys", {layersOpen: true, emptyLayersShown: ["layer-reorder"]});
        await expect(page.locator('.layerpanel [data-grip="15"]')).toBeVisible();
        await page.evaluate(index => {
            const list = document.querySelector(".layerpanel .list");
            const rows = [...list.querySelectorAll(".lp-row:not(.base)")];
            const origin = rows[0].getBoundingClientRect(), target = rows[index].getBoundingClientRect();
            rows[0].querySelector("[data-grip]").dispatchEvent(new PointerEvent("pointerdown", {
                bubbles: true, button: 0, clientY: origin.top + origin.height / 2,
            }));
            window.dispatchEvent(new PointerEvent("pointermove", {clientY: target.top + target.height / 2 + 1}));
            window.dispatchEvent(new PointerEvent("pointerup"));
        }, index);
        await expectPost(page, {type: "editPortableLayer", id: 15, to: destination});
    });
}

// Moves stay pending in the core until Keep layers in draft; closing the
// panel any other way discards them, as Discard does, so it reopens on the
// draft's order.
for (const [how, dismiss] of [
    ["Escape", page => page.keyboard.press("Escape")],
    ["a click outside", page => page.locator(".board").click({position: {x: 5, y: 5}})],
    ["its trigger", page => page.locator(".layer-edit").click()],
    ["Discard", page => page.locator('.layerpanel [data-act="cancel"]').click()],
]) {
    test(`closing Rename & Reorder by ${how} discards its pending moves`, async ({page}) => {
        await openControls(page, "keys", {layersOpen: true, emptyLayersShown: ["layer-reorder"]});
        await page.locator('.layerpanel [data-base="15"]').click();
        await expectPost(page, {type: "editPortableLayer", id: 15, makeBase: true});
        await clearPosts(page);
        await dismiss(page);
        await expect(page.locator(".layerpanel")).toHaveCount(0);
        await expect.poll(() => page.evaluate(() => window.__posted.map(message => message.type))).toEqual(["cancelPortableReview"]);
    });
}

test("keeping Rename & Reorder posts the layers and discards nothing", async ({page}) => {
    await openControls(page, "keys", {layersOpen: true});
    await page.locator('.layerpanel [data-act="save"]').click();
    await expect(page.locator(".layerpanel")).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => window.__posted.map(message => message.type))).toEqual(["savePortableLayers"]);
});

test("mixed-side picker modifiers explain the conflict and cannot be used", async ({page}) => {
    await openControls(page, "keys");
    await page.evaluate(async () => {
        const {openPicker} = await import("/webview/ui/picker.mjs");
        const {post} = await import("/webview/store.mjs");
        const {setKey} = await import("/webview/view/edits.mjs");
        openPicker({title: "Key", seed: ["KC_A"], onPick: key => post(setKey("Layer 0", 0, key))});
    });
    await page.locator('.picker [data-mod="C"]').click();
    await page.locator('.picker [data-mod="RSFT"]').click();
    await expect(page.locator('.picker [data-act="use"]')).toBeDisabled();
    await expect(page.locator(".picker [role=status]")).toContainText("one side");
    // A pick that cannot be stored shows no keycode value.
    await expect(page.locator(".picker .pk-value")).toHaveText("—");
    await page.locator('.picker [data-mod="C"]').click();
    await page.locator('.picker [data-mod="RCTL"]').click();
    await expect(page.locator(".picker .pk-value")).toHaveText("RCTL(RSFT(KC_A))");
    await clearPosts(page);
    await page.locator('.picker [data-act="use"]').click();
    await expectPost(page, {type: "updateLayoutKeys", layer: "Layer 0", changes: [{layoutIndex: 0, keycode: "RCTL(RSFT(KC_A))"}]});
});

test("zero brightness retains editable HSV channels and LED black does not inherit", async ({page}) => {
    await openControls(page, "lighting", {stage: "layers", layer: 1});
    const body = page.locator("#benchBody"), value = body.locator('[data-channel="2"]');
    await change(value, 0);
    await expectPost(page, {type: "updateLayerColor", layer: "Layer 1", mode: "KEYS_MAPPED_ON_THIS_LAYER_ONLY", h: 85, s: 255, v: 0});
    await publishAccepted(page, ["rgb", "layerColors", 1, "color"], {h: "85", s: "255", v: "0"});
    await expect(body).toContainText("HSV(85, 255, 0)");
    await expect(body.locator('[data-channel="0"]')).toHaveValue("85");
    await expect(body.locator('[data-channel="1"]')).toHaveValue("255");
    await expect(value).toHaveValue("0");
    await expect(body).not.toContainText("No colour is stored for this layer");
    await clearPosts(page);
    await change(value, 100);
    await expectPost(page, {type: "updateLayerColor", layer: "Layer 1", mode: "KEYS_MAPPED_ON_THIS_LAYER_ONLY", h: 85, s: 255, v: 100});
    // An accent at zero brightness keeps its hue and saturation too; only
    // HSV(0, 0, 0) takes the stage's colour.
    const text = await page.evaluate(async () => {
        const store = await import("/webview/store.mjs");
        const model = structuredClone(store.getModel());
        model.rgb.layerAccents = [{index: 0, owner: "Layer 1", ledIndices: [0], leds: "LED 0", color: {h: "85", s: "255", v: "0"}}];
        store.setModel(model); store.render();
        return document.querySelector('#benchBody [data-accents="layer"]')?.textContent || "";
    });
    expect(text).toContain("HSV(85, 255, 0)");
    expect(text).not.toContain("Same as the layer");
});

test("a layer name counts bytes and flags one past the limit instead of cutting it off", async ({page}) => {
    await openControls(page, "keys", {layersOpen: true});
    const row = page.locator('.layerpanel .lp-row[data-row="1"]');
    const name = row.locator("[data-name]");
    const count = row.locator("[data-name-count]");
    await name.fill("é".repeat(17));
    await expect(name).toHaveValue("é".repeat(17));
    await expect(count).toHaveText("34 / 32 bytes");
    await expect(count).toHaveClass(/warn/);
    await name.fill("a".repeat(32));
    await expect(count).toHaveText("32 / 32 bytes");
    await expect(count).not.toHaveClass(/warn/);
});

test("the picker offers each pointing slot's Hold and Lock keys and picks the lock keycode", async ({page}) => {
    await openControls(page, "keys");
    await page.evaluate(async () => {
        const {openPicker} = await import("/webview/ui/picker.mjs");
        const {post} = await import("/webview/store.mjs");
        const {setKey} = await import("/webview/view/edits.mjs");
        openPicker({title: "Key", seed: ["KC_A"], onPick: key => post(setKey("Layer 0", 0, key))});
    });
    const picker = page.getByRole("dialog", {name: "Pick a keycode"});
    await picker.locator('[data-sec="modes"]').click();
    const lock = picker.locator('[data-pick="PD_MODE_0_LOCK"]');
    await expect(picker.locator('[data-pick="PD_MODE_0"] .l')).toHaveText("Hold");
    await expect(lock.locator(".l")).toHaveText("Lock");
    // Each key says what it does in its tip, so no note under them says it again (D-L96).
    await expect(lock).toHaveAttribute("data-tip", "Turns the mode on until pressed again.");
    await expect(picker.locator(".pk-note")).toHaveCount(0);
    await expect(picker).not.toContainText(/toggle/i);
    await lock.click();
    await picker.locator('[data-act="use"]').click();
    await expect.poll(() => page.evaluate(() => JSON.stringify(window.__posted))).toContain('"keycode":"PD_MODE_0_LOCK"');
});

// How to pick on the keyboard is the picker's info mark, beside its title,
// read once (D-L96); Escape closes its list before the picker.
test("the picker's info mark says how to pick, and Escape closes it before the picker", async ({page}) => {
    await openControls(page, "keys");
    await page.locator('.tab-grid [data-act="pick"]').first().click();
    const picker = page.getByRole("dialog", {name: "Pick a keycode"});
    const mark = picker.locator(".pk-title .info-mark");
    await expect(mark.locator(".info-lead")).toContainText("Click a key. A modifier, picked above or on the board, is held down with it");
    await expect(picker.locator(".pk-note")).toHaveCount(0);
    await mark.locator(".info-button").click();
    await expect(mark.locator(".info-pop")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(mark.locator(".info-pop")).toBeHidden();
    await expect(picker).toBeVisible();
    // Layers and Pointing modes say what each key does in its tip, so they have none.
    await picker.locator('[data-sec="layers"]').click();
    await expect(picker.locator(".pk-title .info-mark")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(picker).toHaveCount(0);
});

// What takes macro memory is said once, in the memory's info mark; what is
// free stays on show (D-L96).
test("macro memory says what is free, and what takes room in its info mark", async ({page}) => {
    await openControls(page, "macros");
    await expect(page.locator(".memory-h .info-mark dt")).toHaveText(["A key tap", "Text", "An empty slot"]);
    await expect(page.locator(".meter-note")).toHaveText(/^[\d,]+ bytes free/);
    await expect(page.locator(".meter-note")).not.toContainText("3 bytes");
});

// The combo builder's info mark says how its form keeps itself and what Use
// output behaviour off does; under the switch, only what this combo's own
// custom key would send (D-L96).
test("the combo builder explains itself in its info mark, and says only a custom key's own output under the switch", async ({page}) => {
    await openControls(page, "keys", {tab: "combos"});
    await page.locator('[data-act="new-combo"]').click();
    const builder = page.locator(".combo-builder");
    await expect(builder.locator(".card-h .info-pop")).toContainText("this form keeps its own state");
    await expect(builder.locator(".card-h .info-pop")).toContainText("still fires and sends its normal output action");
    await expect(builder.locator("[data-bypassed-output]")).toHaveCount(0);
    await expect(builder).not.toContainText("keeps its own state until", {useInnerText: true});
    // Escape on its mark closes the list, not the builder.
    await builder.locator(".card-h .info-button").click();
    await page.keyboard.press("Escape");
    await expect(builder.locator(".card-h .info-pop")).toBeHidden();
    await expect(builder).toBeVisible();
});
