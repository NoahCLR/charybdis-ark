// @ts-check
"use strict";
const {test, expect} = require("@playwright/test");
const {openControls, clearPosts, expectPost, posted} = require("./control-preview");

// A key dragged onto another swaps the two. Held over a layer tab for a
// moment, the drag switches the board to that layer and goes on carrying the
// key, so it lands on a key there: one message on the layer it landed on,
// whose first change names the layer it came from (webview/ui/board-drag.mjs).

/** @param {import("@playwright/test").Page} page @param {string} selector */
async function centre(page, selector) {
    const box = await page.locator(selector).first().boundingBox();
    if (!box) throw new Error(`${selector} is not drawn`);
    return {x: box.x + box.width / 2, y: box.y + box.height / 2};
}

/** @param {import("@playwright/test").Page} page @param {number} layer @param {number} layoutIndex */
const keycodeAt = (page, layer, layoutIndex) => page.evaluate(async ({layer, layoutIndex}) => {
    const {layers, positionAt} = await import("/webview/store.mjs");
    return positionAt(layers()[layer], layoutIndex)?.keycode;
}, {layer, layoutIndex});

// The preview's layers hold no transparent key, so one is published as core
// would: layer 1 transparent at `index`, which base answers.
/** @param {import("@playwright/test").Page} page @param {number} index */
const publishTransparent = (page, index) => page.evaluate(async (index) => {
    const {getModel} = await import("/webview/store.mjs");
    const model = structuredClone(getModel());
    const top = model.layers[1];
    top.positions = top.positions.map((position) => position.layoutIndex === index ? {layoutIndex: index, keycode: "KC_TRANSPARENT"} : position);
    top.answers[index] = [{layer: 0, active: 1, blocked: 0}];
    window.dispatchEvent(new MessageEvent("message", {data: {type: "model", model}}));
}, index);

/** @param {import("@playwright/test").Page} page @param {{x: number, y: number}} from */
async function press(page, from) {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
}

const tab = (/** @type {number} */ layer) => `.layer-tabs [data-layer="${layer}"]`;
const key = (/** @type {number} */ index) => `.board [data-key="${index}"]`;

test("a key dragged onto another key of its layer swaps the two", async ({page}) => {
    await openControls(page, "keys", {layer: 0, layersOn: [], selected: 0});
    const [a, b] = [await keycodeAt(page, 0, 0), await keycodeAt(page, 0, 1)];
    expect(a, "base stores two different keys at 0 and 1").not.toBe(b);
    const [from, to] = [await centre(page, key(0)), await centre(page, key(1))];
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, {steps: 8});
    await expect(page.locator(`${key(1)}.drop-target`)).toHaveCount(1);
    await expect(page.locator(".drag-layer"), "over the board it is drawn whole").not.toHaveClass(/off-board/);
    // Anywhere on the board's canvas, empty space between the halves too.
    const canvas = await page.locator(".board").boundingBox();
    if (!canvas) throw new Error("the board is drawn");
    await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + 60, {steps: 4});
    await expect(page.locator(".drag-layer"), "the board's canvas is the board, keys or not").not.toHaveClass(/off-board/);
    await page.mouse.move(to.x, to.y, {steps: 4});
    // Its picture is no key: unheard, and without the selection's ring.
    const picture = page.locator(".drag-layer .kc.dragging");
    await expect(picture).toHaveAttribute("aria-hidden", "true");
    await expect(picture).not.toHaveAttribute("data-key", /.*/);
    await expect(picture.locator(".kc-ring")).toHaveCount(0);
    await page.mouse.up();
    await expectPost(page, {type: "updateLayoutKeys", layer: "Layer 0", changes: [{layoutIndex: 0, keycode: b}, {layoutIndex: 1, keycode: a}]});
});

test("two keys that store the same thing have nothing to trade, so the drag posts nothing", async ({page}) => {
    await openControls(page, "keys", {layer: 1, layersOn: []});
    expect(await keycodeAt(page, 1, 2), "the preview's layer 1 stores the same key at 1 and 2").toBe(await keycodeAt(page, 1, 1));
    await press(page, await centre(page, key(1)));
    const to = await centre(page, key(2));
    await page.mouse.move(to.x, to.y, {steps: 8});
    await page.mouse.up();
    await expect(page.locator(`${key(2)}.sel`), "the key it landed on is selected").toHaveCount(1);
    expect(await posted(page)).toEqual([]);
});

test("held over a layer tab, a dragged key goes to that layer and swaps with a key there", async ({page}) => {
    await openControls(page, "keys", {layer: 0, layersOn: []});
    const [a, b] = [await keycodeAt(page, 0, 0), await keycodeAt(page, 1, 5)];
    const from = await centre(page, key(0));
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    const over = await centre(page, tab(1));
    await page.mouse.move(over.x, over.y, {steps: 8});
    await expect(page.locator(`${tab(1)}.drop-target`)).toHaveCount(1);
    // The picture rides on a layer over the page, above the tabs rather than
    // under them, laid over the board's drawing; off the board, over the tabs
    // too, it fades, letting the held tab show through.
    await expect(page.locator(".board .kc.dragging"), "not drawn inside the board, which the tabs cover").toHaveCount(0);
    await expect(page.locator("body > .drag-layer.off-board .kc.dragging")).toHaveCount(1);
    const [layer, drawing] = await Promise.all([page.locator(".drag-layer").boundingBox(), page.locator(".board > svg").boundingBox()]);
    expect(layer, "laid over the board's drawing").toEqual(drawing);
    // The held tab glows in its layer's light, and its bar fills over the moment.
    expect(await page.locator(tab(1)).evaluate((node) => {
        const bar = getComputedStyle(node, "::after");
        return {light: getComputedStyle(node).getPropertyValue("--tab-light") !== "", bar: bar.animationName, lasts: bar.animationDuration};
    })).toEqual({light: true, bar: "tab-held", lasts: "0.4s"});
    // The board switches while the button is still down, and carries the key.
    await expect(page.locator(tab(1))).toHaveAttribute("aria-selected", "true");
    await expect(page.locator(".drag-layer .kc.dragging")).toHaveCount(1);
    await expect(page.locator(`${key(0)}:not(.carried)`), "on another layer, its own key 0 stays in place").toHaveCount(1);
    const to = await centre(page, key(5));
    await page.mouse.move(to.x, to.y, {steps: 8});
    await expect(page.locator(`${key(5)}.drop-target`)).toHaveCount(1);
    await page.mouse.up();
    await expectPost(page, {type: "updateLayoutKeys", layer: "Layer 1", changes: [{layoutIndex: 0, keycode: b, layer: "Layer 0"}, {layoutIndex: 5, keycode: a}]});
    await expect(page.locator(".drag-layer .kc.dragging")).toHaveCount(0);
    await expect(page.locator(tab(1))).toHaveAttribute("aria-selected", "true");
});

test("passing over a tab switches nothing, and Escape drops the key where it was", async ({page}) => {
    await openControls(page, "keys", {layer: 0, layersOn: []});
    const from = await centre(page, key(0));
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    const over = await centre(page, tab(1));
    await page.mouse.move(over.x, over.y, {steps: 4});
    await page.mouse.move(from.x, from.y - 30, {steps: 4});
    await page.waitForTimeout(600);
    await expect(page.locator(tab(0))).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Escape");
    await expect(page.locator(".drag-layer .kc.dragging")).toHaveCount(0);
    await page.mouse.up();
    expect(await posted(page)).toEqual([]);
    await expect(page.locator(`${key(0)}:not(.carried)`), "the key is back in its place").toHaveCount(1);

    // Dropped off any key on another layer, nothing is posted either, and
    // the board is drawn without the carried key.
    await clearPosts(page);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(over.x, over.y, {steps: 8});
    await expect(page.locator(tab(1))).toHaveAttribute("aria-selected", "true");
    await page.mouse.move(over.x, over.y + 60, {steps: 4});
    await expect(page.locator(".drag-layer"), "off the board it fades, as nothing lands there").toHaveClass(/off-board/);
    await page.mouse.up();
    expect(await posted(page)).toEqual([]);
    await expect(page.locator(".drag-layer .kc.dragging")).toHaveCount(0);
});

// With layers previewed under the picked one, a transparent key shows the key
// that answers from below, but what a drag moves is what the picked layer
// stores: the transparent key, so that is what it carries.
test("a transparent key answered from below is carried as the transparent key it is", async ({page}) => {
    await openControls(page, "keys", {layer: 1, layersOn: [0]});
    const index = 0;
    await publishTransparent(page, index);
    await expect(page.locator(key(index)), "the board shows the key from below").toHaveAttribute("aria-label", /, from /);
    const other = 1;
    const [stored, b] = [await keycodeAt(page, 1, index), await keycodeAt(page, 1, other)];
    const [from, to] = [await centre(page, key(index)), await centre(page, key(other))];
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, {steps: 8});
    const carried = page.locator(".drag-layer .kc.dragging");
    await expect(carried).toHaveClass(/kc-trns/);
    await expect(carried.locator(".kc-label")).not.toHaveText(await page.locator(`${key(index)} .kc-label`).textContent() ?? "");
    await expect(page.locator(`${key(index)}.carried`), "its place is empty while it is away").toHaveCount(1);
    await page.mouse.up();
    await expectPost(page, {type: "updateLayoutKeys", layer: "Layer 1", changes: [{layoutIndex: index, keycode: b}, {layoutIndex: other, keycode: stored}]});
});

// In a preview, a drop on a key seen through from below swaps with what the
// picked layer stores there, the transparent key, and a transparent key
// carried to another layer is still pictured as one there.
test("in a preview, a frosted key takes the swap as the transparent key, and a carried one stays transparent on another layer", async ({page}) => {
    await openControls(page, "keys", {layer: 1, layersOn: [0]});
    await publishTransparent(page, 0);
    await expect(page.locator(key(0))).toHaveAttribute("aria-label", /, from /);
    const b = await keycodeAt(page, 1, 1);
    await press(page, await centre(page, key(1)));
    const frosted = await centre(page, key(0));
    await page.mouse.move(frosted.x, frosted.y, {steps: 8});
    await page.mouse.up();
    await expectPost(page, {type: "updateLayoutKeys", layer: "Layer 1", changes: [{layoutIndex: 1, keycode: "KC_TRANSPARENT"}, {layoutIndex: 0, keycode: b}]});

    await clearPosts(page);
    await press(page, await centre(page, key(0)));
    const over = await centre(page, tab(2));
    await page.mouse.move(over.x, over.y, {steps: 8});
    await expect(page.locator(tab(2))).toHaveAttribute("aria-selected", "true");
    await expect(page.locator(".layer-tabs .layer-tab.on"), "the switch ends the preview, as a click on the tab does").toHaveCount(0);
    await expect(page.locator(".drag-layer .kc.dragging")).toHaveClass(/kc-trns/);
    const c = await keycodeAt(page, 2, 5);
    const to = await centre(page, key(5));
    await page.mouse.move(to.x, to.y, {steps: 8});
    await page.mouse.up();
    await expectPost(page, {type: "updateLayoutKeys", layer: "Layer 2", changes: [{layoutIndex: 0, keycode: c, layer: "Layer 1"}, {layoutIndex: 5, keycode: "KC_TRANSPARENT"}]});
});

test("a held tab glows on and still switches when the board is drawn again under it, and losing the pointer drops the key", async ({page}) => {
    await openControls(page, "keys", {layer: 0, layersOn: []});
    await press(page, await centre(page, key(0)));
    const over = await centre(page, tab(1));
    await page.mouse.move(over.x, over.y, {steps: 8});
    await expect(page.locator(`${tab(1)}.drop-target`)).toHaveCount(1);
    // The screen is drawn again while the tab is held (as an edit's model
    // does), and the pointer never moves again: the tab drawn afresh glows
    // on, its bar part filled already.
    const redrawn = await page.evaluate(async () => {
        const held = () => /** @type {HTMLElement} */ (document.querySelector('.layer-tabs [data-layer="1"]'));
        const before = held();
        (await import("/webview/store.mjs")).render();
        await new Promise((resolve) => setTimeout(resolve));
        const after = held();
        return {afresh: after !== before, glows: after.classList.contains("drop-target"), passed: parseInt(after.style.getPropertyValue("--spring-passed"), 10) > 0};
    });
    expect(redrawn).toEqual({afresh: true, glows: true, passed: true});
    await expect(page.locator(tab(1))).toHaveAttribute("aria-selected", "true");
    await expect(page.locator(".drag-layer .kc.dragging")).toHaveCount(1);

    const released = await page.evaluate(() => [1, 0].filter((id) => {
        if (!document.documentElement.hasPointerCapture(id)) return false;
        document.documentElement.releasePointerCapture(id);
        return true;
    }));
    expect(released, "the page held the pointer").toHaveLength(1);
    // The browser says it let go at the pointer's next event.
    await page.mouse.move(over.x, over.y - 40, {steps: 2});
    await expect(page.locator(".drag-layer .kc.dragging"), "the key is dropped").toHaveCount(0);
    await page.mouse.up();
    expect(await posted(page)).toEqual([]);
});
