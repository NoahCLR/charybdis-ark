// @ts-check
"use strict";
const {test, expect} = require("@playwright/test");
const {openControls, clearPosts, expectPost, change, publishAccepted} = require("./control-preview");

for (const [index, destination] of [[1, 14], [9, 6]]) {
    test(`dragging Layer 15 into visual row ${index} posts slot ${destination}`, async ({page}) => {
        await openControls(page, "keys", {layersOpen: true});
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
        await openControls(page, "keys", {layersOpen: true});
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
    const text = await page.evaluate(async () => {
        const {groupRowsTable} = await import("/webview/ui/lighting/led-rows.mjs");
        return groupRowsTable([{owner: "Layer 1", ledGroup: "Inline", ledIndices: [0], color: {h: "85", s: "255", v: "0"}}], "layer").textContent;
    });
    expect(text).toContain("HSV(85, 255, 0)");
    expect(text).not.toContain("inherits the stage colour");
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
    const lock = picker.locator('[data-pick="PD_SLOT_0_LOCK"]');
    await expect(picker.locator('[data-pick="PD_SLOT_0"] .l')).toHaveText("Hold");
    await expect(lock.locator(".l")).toHaveText("Lock");
    await expect(picker.locator(".pk-note")).toContainText("Lock keeps the mode on");
    await expect(picker).not.toContainText(/toggle/i);
    await lock.click();
    await picker.locator('[data-act="use"]').click();
    await expect.poll(() => page.evaluate(() => JSON.stringify(window.__posted))).toContain('"keycode":"PD_SLOT_0_LOCK"');
});
