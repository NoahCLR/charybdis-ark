// @ts-check
"use strict";
const {test, expect} = require("@playwright/test");
const {openControls} = require("./control-preview");

// A layer's mark is the board's icon in its layer colour and a pointing mode's
// is the Pointing modes icon in its slot's light, wherever either is named
// (D-L31), Settings' per-layer switches included. A swatch shows the colour
// only where the colour is the subject, or every item is a layer, as on the
// layer bar.

const LAYER_TAP = 46, NAVIGATION = 3, ZOOM = 3;

// What the marks inside a node are: each kind icon, whether it wears a
// colour, and whether a swatch stands in for one.
const marksIn = (node) => ({
    icons: [...node.querySelectorAll(".kind-icon")].map((icon) =>
        `${icon.classList.contains("layer") ? "layer" : "pointing"}${icon.getAttribute("style")?.includes("color:") ? "" : " off"}`),
    swatches: node.querySelectorAll(".swatch, .pd-swatch, .mk-swatch").length,
});

// The fixture has a behaviour row for LT(3,KC_SLASH) but no key for it, so one
// goes on the board in its "/" key's place; and a combo that holds Navigation.
async function withLayerTapAndCombo(page) {
    await page.evaluate(async (at) => {
        const {getModel} = await import("/webview/store.mjs");
        const model = structuredClone(getModel());
        Object.assign(model.layers[0].positions[at], {keycode: "LT(3,KC_SLASH)", semantic: "LT(3,KC_SLASH)",
            display: "/", editLabel: "/ / Navigation", layerLabel: "Navigation", value: 0x4338});
        model.combos = [{id: 0, inputs: ["KC_D", "KC_F"], inputDisplays: ["D", "F"], output: "MO(3)", outputDisplay: "Hold Navigation", termMs: 45, followsDefault: true,
            mustHold: false, mustTap: false, ordered: false, enabled: true, useOutputBehavior: false, allowedLayers: 65535}];
        model.draft.revision++;
        window.dispatchEvent(new MessageEvent("message", {data: {type: "model", model}}));
    }, LAYER_TAP);
}

test("a layer and a pointing mode are marked by their icon in their colour", async ({page}) => {
    await openControls(page, "keys");
    const drawn = await page.evaluate(async ({NAVIGATION, ZOOM}) => {
        const {getModel} = await import("/webview/store.mjs");
        const {mark, marked} = await import("/webview/ui/marks.mjs");
        const {groupRowsTable} = await import("/webview/ui/lighting/led-rows.mjs");
        const {reviewItem} = await import("/webview/ui/review-items.mjs");
        const model = getModel();
        // The page takes markup only through the panel's policy (Trusted Types).
        const {html} = await import("/webview/lib/dom.mjs");
        const box = (markup) => Object.assign(document.createElement("div"), {innerHTML: html(markup)});
        const read = (node) => ({
            icons: [...node.querySelectorAll(".kind-icon")].map((icon) =>
                `${icon.classList.contains("layer") ? "layer" : "pointing"}${icon.getAttribute("style")?.includes("color:") ? "" : " off"}`),
            swatches: node.querySelectorAll(".swatch, .pd-swatch, .mk-swatch").length,
        });
        const zoomMode = model.rgb.pdModeColors[ZOOM].pointingMode;
        return {
            layer: read(box(mark(model, {kind: "layer", layer: NAVIGATION}))),
            pointing: read(box(mark(model, {kind: "pointing", slot: ZOOM}))),
            slotted: read(box(marked(model, {kind: "layer", layer: NAVIGATION}, "Navigation", {slot: true}))),
            owners: read(groupRowsTable([{owner: `Layer ${NAVIGATION}`, ledGroup: "Inline", ledIndices: [0], color: {h: "0", s: "0", v: "0"}}], "layer"))
                .icons.concat(read(groupRowsTable([{owner: zoomMode, ledGroup: "Inline", ledIndices: [0], color: {h: "0", s: "0", v: "0"}}], "pdMode")).icons),
            review: read(box(reviewItem(model, {unit: "x", title: "Right Option", status: "changed", fields: [
                {label: "Hold", status: "changed", before: "Hold Navigation", after: "Zoom", beforeMark: {kind: "layer", layer: NAVIGATION}, afterMark: {kind: "pointing", slot: ZOOM}},
            ]}))),
            // A set of layers, as a pointing link's: each name after its mark.
            layerSet: (() => {
                const node = box(reviewItem(model, {unit: "x", title: "Volume", status: "changed", fields: [
                    {label: "Layers that start this pointing mode", status: "changed", before: "None", after: "Base, Navigation",
                        afterMark: {kind: "layers", layers: [{layer: 0, name: "Base"}, {layer: NAVIGATION, name: "Navigation"}]}},
                ]}));
                return {icons: node.querySelectorAll(".ins .kind-icon.layer").length, names: [...node.querySelectorAll(".ins .mk")].map((entry) => entry.textContent),
                    text: node.querySelector(".ins")?.textContent};
            })(),
            // A colour value in the review keeps its swatch beside the value.
            colour: box(reviewItem(model, {unit: "x", title: "Navigation", status: "changed", titleMark: {kind: "layer", layer: NAVIGATION}, fields: [
                {label: "Colour", status: "changed", before: "off", after: "HSV(85, 255, 255)", afterColour: {h: 85, s: 255, v: 255}},
            ]}, {titleSlot: true})).querySelectorAll(".rv-swatch").length,
        };
    }, {NAVIGATION, ZOOM});
    expect(drawn.layer).toEqual({icons: ["layer"], swatches: 0});
    expect(drawn.pointing).toEqual({icons: ["pointing"], swatches: 0});
    expect(drawn.slotted).toEqual({icons: ["layer"], swatches: 0});
    expect(drawn.owners, "Lighting's LED groups name their owners by mark").toEqual(["layer", "pointing"]);
    expect(drawn.review).toEqual({icons: ["layer", "pointing"], swatches: 0});
    expect(drawn.colour).toBe(1);
    expect(drawn.layerSet, "a set of layers marks each layer before its name").toEqual({icons: 2, names: ["Base", "Navigation"], text: "Base, Navigation"});
});

test("the hover card's title and the Combos table mark a layer by its icon", async ({page}) => {
    await openControls(page, "keys");
    await withLayerTapAndCombo(page);
    await page.locator(`.board [data-key="${LAYER_TAP}"]`).first().hover();
    const title = page.locator(".hovercard .hc-title").first();
    await expect(title).toContainText("Navigation");
    expect(await title.evaluate(marksIn)).toEqual({icons: ["layer"], swatches: 0});

    await page.mouse.move(0, 0);
    await page.locator('[data-tab="combos"]').click();
    const output = page.locator('tr[data-combo="0"] td.mono').first();
    await expect(output).toContainText("Navigation");
    expect(await output.evaluate(marksIn)).toEqual({icons: ["layer"], swatches: 0});
});

test("the layer bar keeps its swatches, Settings' per-layer switches mark their layers, and a layer's icon goes grey with its stage", async ({page}) => {
    await openControls(page, "keys");
    const bar = await page.locator(".layer-tabs").first().evaluate(marksIn);
    expect(bar.icons).toEqual([]);
    expect(bar.swatches).toBeGreaterThan(1);
    await openControls(page, "behaviours");
    const switches = await page.locator('label.sw:has([data-f^="setting:behaviorsOnLayer"])').evaluateAll((labels) => labels.map((label) => ({
        icons: label.querySelectorAll(".kind-icon").length, swatches: label.querySelectorAll(".swatch").length})));
    expect(switches.length).toBeGreaterThan(1);
    expect(switches.every((cell) => cell.icons === 1 && cell.swatches === 0)).toBe(true);
    const off = await page.evaluate(async (NAVIGATION) => {
        const {getModel} = await import("/webview/store.mjs");
        const {mark} = await import("/webview/ui/marks.mjs");
        const model = structuredClone(getModel());
        model.rgb.stages.forEach((stage) => { if (stage.id === "layers") stage.enabled = false; });
        const {html} = await import("/webview/lib/dom.mjs");
        const node = Object.assign(document.createElement("div"), {innerHTML: html(mark(model, {kind: "layer", layer: NAVIGATION}))});
        return node.querySelector(".kind-icon")?.className;
    }, NAVIGATION);
    expect(off).toBe("kind-icon layer off");
});

// An action on a layer or a pointing mode, named in the core's words for it,
// reads as the grid draws it wherever it is named: mark, name and the action as
// a tag, never the action's word beside the name (docs/spec/interface-contracts.md).
const namedIn = (node) => ({
    named: [...node.querySelectorAll(".sends")].map((named) => ({
        icon: named.querySelector(".kind-icon.layer") ? "layer" : named.querySelector(".kind-icon.pointing") ? "pointing" : "",
        name: named.querySelector(".sends-name")?.textContent,
        tags: [...named.querySelectorAll(".sends-tag")].map((tag) => tag.textContent)})),
    icons: node.querySelectorAll(".kind-icon").length,
    text: node.textContent.replace(/\s+/g, " ").trim(),
});

test("a layer or pointing-mode action is named with its tag, a layer-tap by its name", async ({page}) => {
    await openControls(page, "keys");
    // Each drawing goes on the page in its own box, read by namedIn.
    await page.evaluate(async ({NAVIGATION, ZOOM}) => {
        const {getModel} = await import("/webview/store.mjs");
        const {actionMarked, keyNameMarked} = await import("/webview/ui/marks.mjs");
        const {reviewItem} = await import("/webview/ui/review-items.mjs");
        const {keyIdentity} = await import("/webview/view/key-identity.mjs");
        const {html} = await import("/webview/lib/dom.mjs");
        const model = getModel();
        const slot = model.pdModes.find((entry) => entry.id === ZOOM);
        const drawn = {
            hold: actionMarked(model, `MO(${NAVIGATION})`),
            pointing: actionMarked(model, slot.keys.lock),
            layerTap: keyNameMarked(model, "/ / Navigation", `LT(${NAVIGATION},KC_SLASH)`),
            // A name the core did not give keeps the words, with the layer marked.
            other: keyNameMarked(model, "Navigation", `MO(${NAVIGATION})`),
            review: reviewItem(model, {unit: "x", title: "Right Option", status: "changed", fields: [
                {label: "Hold", status: "changed", before: "Hold Navigation", after: "Zoom · lock", beforeMark: {kind: "layer", layer: NAVIGATION}, afterMark: {kind: "pointing", slot: ZOOM}},
                {label: "Tap", status: "changed", before: "/ / Navigation", after: "Lock Navigation", beforeMark: {kind: "layer", layer: NAVIGATION}, afterMark: {kind: "layer", layer: NAVIGATION}},
            ]}),
            // A behaviour is titled by its key, named as that key is everywhere.
            reviewTitle: reviewItem(model, {unit: "y", title: keyIdentity(model, slot.keys.hold).label, status: "removed",
                place: {kind: "behaviour", keycode: slot.keys.hold}, fields: []}),
        };
        for (const [name, markup] of Object.entries(drawn)) document.body.insertAdjacentHTML("beforeend", html(`<div data-drawn="${name}">${markup}</div>`));
    }, {NAVIGATION, ZOOM});
    const read = (name) => page.locator(`[data-drawn="${name}"]`).evaluate(namedIn);
    expect((await read("hold")).named).toEqual([{icon: "layer", name: "Navigation", tags: ["Hold"]}]);
    expect((await read("pointing")).named).toEqual([{icon: "pointing", name: "Zoom", tags: ["lock"]}]);
    expect(await read("layerTap")).toEqual({named: [], icons: 1, text: "/ / Navigation"});
    expect(await read("other")).toEqual({named: [], icons: 1, text: "Navigation"});
    const review = await read("review");
    expect(review.named).toEqual([
        {icon: "layer", name: "Navigation", tags: ["Hold"]},
        {icon: "pointing", name: "Zoom", tags: ["lock"]},
        {icon: "layer", name: "Navigation", tags: ["Lock"]},
    ]);
    expect(review.text).toContain("/ / Navigation");
    expect((await read("reviewTitle")).named).toEqual([{icon: "pointing", name: "Zoom", tags: ["hold"]}]);
});

test("the hover card's title, the Combos table and the Key and Pointing modes tabs name an action with its tag", async ({page}) => {
    await openControls(page, "keys");
    await withLayerTapAndCombo(page);
    // The fixture's key 50 is a pointing mode's hold key.
    const DRAGSCROLL = {named: [{icon: "pointing", name: "Dragscroll", tags: ["hold"]}]};
    await page.locator('.board [data-key="50"]').first().hover();
    const title = page.locator(".hovercard .hc-title").first();
    await expect(title).toContainText("Dragscroll");
    expect(await title.evaluate(namedIn)).toMatchObject(DRAGSCROLL);
    await page.mouse.move(0, 0);
    await page.locator(`.board [data-key="${LAYER_TAP}"]`).first().hover();
    await expect(title).toContainText("Navigation");
    expect((await title.evaluate(namedIn)).named).toEqual([]);

    await page.mouse.move(0, 0);
    await page.locator('[data-tab="combos"]').click();
    const output = page.locator('tr[data-combo="0"] td.mono').first();
    await expect(output).toContainText("Navigation");
    expect((await output.evaluate(namedIn)).named).toEqual([{icon: "layer", name: "Navigation", tags: ["Hold"]}]);

    await page.locator('.board [data-key="50"]').first().click();
    await page.locator('[data-tab="key"]').click();
    const does = page.locator("dl.kv dd").first();
    await expect(does).toContainText("Dragscroll");
    expect(await does.evaluate(namedIn)).toMatchObject(DRAGSCROLL);
    // The layer stack names what each layer does there the same way.
    expect(await page.locator(".stackrow.on .val").evaluate(namedIn)).toMatchObject(DRAGSCROLL);
    // Each layer of the stack is marked by its icon, as Settings marks it.
    await expect(page.locator(".stackrow:not(.folded) .mk-slot .kind-icon.layer").first()).toBeVisible();
    await expect(page.locator(".stackrow .swatch-lg")).toHaveCount(0);

    // Every row of the Pointing modes tab names its slot by its icon, then the
    // name and each keycode after its hold or lock tag.
    await page.locator('[data-tab="pointing"]').click();
    const row = page.locator(".reach-table tbody tr:has(code:text-is('PD_MODE_4_LOCK'))").first();
    await expect(row).toBeVisible();
    expect(await row.locator("td").first().evaluate(namedIn)).toMatchObject({named: [{icon: "", name: "Arrow", tags: ["lock"]}], icons: 1});
    await expect(page.locator(".reach-table .pd-swatch")).toHaveCount(0);

    // Reached by names the cell a branch fires from, as Review heads a tier:
    // the key, then its cell. The fixture's Right Option taps Arrow's lock, and
    // Dragscroll's own key locks it on a double tap held, so that cell follows
    // the key rather than naming the key a second time.
    const reached = (keycode) => page.locator(`.reach-table tbody tr:has(td:first-child code:text-is('${keycode}'))`).first().locator("td").nth(5);
    const arrow = await reached("PD_MODE_4_LOCK").evaluate(namedIn);
    expect(arrow.text).toMatch(/^from Right Option KC_RIGHT_ALT · 1× ?tap$/);
    const dragscroll = reached("PD_MODE_0_LOCK");
    await expect(dragscroll.locator(".bn")).toHaveText(["2×"]);
    await expect(dragscroll.locator(".fbdot")).toHaveCount(1);
    expect(await dragscroll.evaluate(namedIn)).toMatchObject({named: [{icon: "pointing", name: "Dragscroll", tags: ["hold"]}, {icon: "pointing", name: "Dragscroll", tags: ["lock"]}]});
    expect((await dragscroll.evaluate(namedIn)).text).toMatch(/· 2× ?hold sends Dragscroll ?lock ?PD_MODE_0_LOCK$/);
    expect((await dragscroll.evaluate(namedIn)).text).not.toContain("from");
});
