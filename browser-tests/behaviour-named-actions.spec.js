// @ts-check
"use strict";
const {test, expect} = require("@playwright/test");
const {openControls, publishBehaviour, behaviourSteps} = require("./control-preview");

// A branch that acts on a layer reads the way one that sends a pointing mode
// does: its kind's icon in its colour, its name and a tag, with the kind leading
// the line under it. The grid and the hover card draw it the same way, and a
// built-in cell stays dashed and says "standard key".

const LAYER_TAP = 46, RIGHT_OPTION = 47;

// The fixture has a behaviour row for LT(3,KC_SLASH) but no key for it, so one
// goes on the board in its "/" key's place; Right Option gains a double-tap
// hold of the Zoom pointing mode beside its single tap that toggles Arrow.
async function openWithKeys(page) {
    await openControls(page, "keys");
    await page.evaluate(async () => {
        const {getModel} = await import("/webview/store.mjs");
        const model = structuredClone(getModel());
        Object.assign(model.layers[0].positions[46], {keycode: "LT(3,KC_SLASH)", semantic: "LT(3,KC_SLASH)", display: "/",
            editLabel: "/ / Navigation", layerLabel: "Navigation", value: 0x4338});
        model.draft.revision++;
        window.dispatchEvent(new MessageEvent("message", {data: {type: "model", model}}));
    });
    await publishBehaviour(page, "KC_RIGHT_ALT", [...await behaviourSteps(page, "KC_RIGHT_ALT"),
        {tapCount: 1, tapCountName: "Double tap", hold: {style: "PRESS_AND_HOLD_UNTIL_RELEASE", action: "PD_MODE_3"}}]);
}

async function openGrid(page, index) {
    await page.locator(`.board [data-key="${index}"]`).first().click();
    const tab = page.locator('[data-tab="behaviours"]');
    if ((await tab.getAttribute("aria-selected")) !== "true") await tab.click();
    await expect(page.locator(".bgrid")).toHaveCount(1);
}

// What one named action shows: which icon, whether it wears a colour, its name
// and tags. The icon is the mark, so no swatch sits beside it.
const reading = (locator) => locator.evaluate((node) => {
    const icon = node.querySelector(".kind-icon");
    return {
        icon: icon ? [...icon.classList].filter((name) => name !== "kind-icon").join(" ") : "",
        coloured: Boolean(icon?.getAttribute("style")?.includes("color:")) && !node.querySelector(".mk-swatch"),
        name: node.querySelector(".sends-name")?.textContent,
        tags: [...node.querySelectorAll(".sends-tag")].map((tag) => tag.textContent),
    };
});

test("a layer action in the grid reads like a pointing mode, built in or set", async ({page}) => {
    await openWithKeys(page);
    await openGrid(page, LAYER_TAP);
    const builtIn = page.locator('.bgrid [data-cell="0-hold"]');
    await expect(builtIn).toHaveClass(/inherited/);
    expect(await reading(builtIn.locator(".sends"))).toEqual({icon: "layer", coloured: true, name: "Navigation", tags: ["Hold"]});
    await expect(builtIn.locator(".bl")).toHaveText(/^standard key · /);

    const set = page.locator('.bgrid [data-cell="1-hold"]');
    await expect(set).not.toHaveClass(/inherited/);
    expect(await reading(set.locator(".sends"))).toEqual({icon: "layer", coloured: true, name: "Navigation", tags: ["Lock"]});
    await expect(set.locator(".bl")).toHaveText(/^layer · /);
});

test("a pointing mode in the grid wears its light on its icon", async ({page}) => {
    await openWithKeys(page);
    await openGrid(page, RIGHT_OPTION);
    const set = page.locator('.bgrid [data-cell="0-tap"]');
    expect(await reading(set.locator(".sends"))).toEqual({icon: "pointing", coloured: true, name: "Arrow", tags: ["lock"]});
    await expect(set.locator(".bl")).toHaveText(/^pointing mode · /);
    // The double tap leaves its tap empty, so it is Right Option's own, twice,
    // never the lock: nothing reaches it from the Single tap.
    const own = page.locator('.bgrid [data-cell="1-tap"]');
    await expect(own).toHaveClass(/inherited/);
    await expect(own.locator(".sends")).toHaveCount(0);
    await expect(own.locator(".bl")).toHaveText(/^standard key · .*×2$/);
});

test("the hover card names layer actions and pointing modes as the grid does", async ({page}) => {
    await openWithKeys(page);
    const card = page.locator(".hovercard").first();
    await page.locator(`.board [data-key="${LAYER_TAP}"]`).first().hover();
    await expect(card).toBeVisible();
    const actions = card.locator(".hc-act .sends");
    await expect(actions).toHaveCount(2);
    expect(await reading(actions.nth(0)), "the layer-tap's own hold").toEqual({icon: "layer", coloured: true, name: "Navigation", tags: ["Hold"]});
    expect(await reading(actions.nth(1))).toEqual({icon: "layer", coloured: true, name: "Navigation", tags: ["Lock"]});
    await expect(card.locator(".hc-act .hc-under").first(), "the built-in hold keeps its plain row; the set hold says layer").toHaveText(/^layer · /);

    await page.mouse.move(0, 0);
    await expect(card).toBeHidden();
    await page.locator(`.board [data-key="${RIGHT_OPTION}"]`).first().hover();
    await expect(card).toContainText("Right Option");
    expect(await reading(card.locator(".hc-act .sends").first())).toEqual({icon: "pointing", coloured: true, name: "Arrow", tags: ["lock"]});
    await expect(card.locator(".hc-act .hc-under").first()).toHaveText(/^pointing mode/);
});

// Right Option sets a single tap, a double-tap hold and, here, a triple tap of
// A: holding the third press still sends A on release. Whatever the row leaves
// empty is Right Option itself: a quick double tap sends it twice, and past the
// third tap every press is Right Option, the last one held.
test("the grid shows a tap sent on release, and Right Option itself wherever the row leaves a cell empty", async ({page}) => {
    await openWithKeys(page);
    await publishBehaviour(page, "KC_RIGHT_ALT", [...await behaviourSteps(page, "KC_RIGHT_ALT"),
        {tapCount: 2, tapCountName: "Triple tap", tap: {style: "TAP_SENDS", action: "KC_A"}}]);
    await openGrid(page, RIGHT_OPTION);
    for (const [cell, line] of [["2-hold", /^released after tap \/ hold threshold · /], ["2-long", /^released after long hold threshold · /],
        ["1-tap", /^standard key · .*×2$/], ["3-tap", /^standard key · .*×4$/], ["3-hold", /^after 3 taps · /]]) {
        const node = page.locator(`.bgrid [data-cell="${cell}"]`);
        await expect(node, cell).toHaveClass(/inherited/);
        await expect(node.locator(".bl"), cell).toHaveText(line);
    }
    await expect(page.locator('.bgrid [data-cell="2-hold"] .bk')).toHaveText("A");
    for (const cell of ["1-tap", "3-tap", "3-hold"]) await expect(page.locator(`.bgrid [data-cell="${cell}"] .bk`), cell).toHaveText("Right Option");
});

// In the fixture Right Option sets only its Single tap, so it never runs a
// multi tap: a second press is a Single tap of its own.
test("a row with only its Single tap shows each later press as a Single tap", async ({page}) => {
    await openControls(page, "keys");
    await openGrid(page, RIGHT_OPTION);
    const tap = page.locator('.bgrid [data-cell="1-tap"]');
    await expect(tap).toHaveClass(/inherited/);
    await expect(tap.locator(".bl")).toHaveText(/^each press · .*×2$/);
    for (const cell of ["1-hold", "1-long"]) {
        const node = page.locator(`.bgrid [data-cell="${cell}"]`);
        await expect(node, cell).toHaveClass(/inherited/);
        await expect(node.locator(".bk"), cell).toHaveText("Right Option");
        await expect(node.locator(".bl"), cell).toHaveText(/^as Single tap · /);
    }
});
