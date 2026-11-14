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
        const {accentsOverview} = await import("/webview/ui/lighting/accents.mjs");
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
            owners: read(accentsOverview({...model, rgb: {...model.rgb,
                layerAccents: [{index: 0, owner: `Layer ${NAVIGATION}`, ledIndices: [0], leds: "LED 0", color: {h: "0", s: "0", v: "0"}}],
                pdModeAccents: [{index: 0, owner: zoomMode, ledIndices: [0], leds: "LED 0", color: {h: "0", s: "0", v: "0"}}],
                comboAccents: [], keyFeedbackAccents: []}})).icons,
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
    expect(drawn.owners, "All accents names their owners by mark").toEqual(["layer", "pointing"]);
    expect(drawn.review).toEqual({icons: ["layer", "pointing"], swatches: 0});
    expect(drawn.colour).toBe(1);
    expect(drawn.layerSet, "a set of layers marks each layer before its name").toEqual({icons: 2, names: ["Base", "Navigation"], text: "Base, Navigation"});
});

// The demo's Base holds Macro 0, Custom key 0 and Dragscroll's hold side by
// side on the left thumb.
test("a key wears the icon of each kind of thing it reaches, in its legend's colour", async ({page}) => {
    await openControls(page, "keys");
    const drawn = await page.evaluate(() => {
        const at = (index) => [...document.querySelectorAll(`.board [data-key="${index}"] .kc-icon`)].map((icon) => {
            const legend = document.querySelector(`.board [data-key="${index}"] .kc-label`);
            return `${icon.dataset.kind}${getComputedStyle(icon).stroke === getComputedStyle(legend).fill ? "" : " coloured"}`;
        });
        return {macro: at(48), customKey: at(49), dragscroll: at(50), plain: at(0)};
    });
    expect(drawn).toEqual({macro: ["macro"], customKey: ["customKey"], dragscroll: ["pointing"], plain: []});

    // The icons sit in a row under the legend, and the dots stay centred.
    const placed = await page.evaluate(() => {
        const at = (index) => {
            const key = document.querySelector(`.board [data-key="${index}"]`);
            const rect = key.querySelector(".kc-rect");
            const centre = Number(rect.getAttribute("x")) + Number(rect.getAttribute("width")) / 2;
            const xs = [...key.querySelectorAll('circle[r="3.9"]')].map((dot) => Number(dot.getAttribute("cx")));
            const label = key.querySelector(".kc-label").getBBox();
            const icon = key.querySelector(".kc-icon");
            return {dots: xs.length, dotsOffCentre: Math.round(((xs[0] + xs.at(-1)) / 2 - centre) * 100) / 100,
                iconsBelowLegend: Number(icon.getAttribute("y")) >= label.y + label.height - 1};
        };
        return {dragscroll: at(50), customKey: at(49)};
    });
    expect(placed).toEqual({dragscroll: {dots: 2, dotsOffCentre: 0, iconsBelowLegend: true}, customKey: {dots: 3, dotsOffCentre: 0, iconsBelowLegend: true}});
});

// A macro and a custom key have no colour, so their mark is their screen's
// icon in the words' colour, wherever a key names one (D-L31).
test("the hover card names a macro and a custom key after their screen's icon", async ({page}) => {
    await openControls(page, "keys");
    const card = page.locator(".hovercard").first();
    await page.locator('.board [data-key="48"]').first().hover();
    await expect(card.locator(".hc-title .kind-icon[data-kind=macro]")).toHaveCount(1);
    await expect(card.locator(".hc-sect .kind-icon[data-kind=macro]")).toHaveCount(1);
    await expect(card.locator(".hc-sect .sends")).toContainText("Macro 0");
    await page.mouse.move(0, 0);
    await page.locator('.board [data-key="49"]').first().hover();
    await expect(card.locator(".hc-title .kind-icon[data-kind=customKey]")).toHaveCount(1);
    await expect(card.locator(".kind-icon[data-kind=macro]")).toHaveCount(0);

    // The review's values carry the mark core gives them, as every other surface does.
    const review = await page.evaluate(async () => {
        const {getModel} = await import("/webview/store.mjs");
        const {mark} = await import("/webview/ui/marks.mjs");
        const {html} = await import("/webview/lib/dom.mjs");
        const box = (markup) => Object.assign(document.createElement("div"), {innerHTML: html(markup)});
        return ["macro", "customKey"].map((kind) => box(mark(getModel(), {kind})).querySelector(".kind-icon")?.dataset.kind);
    });
    expect(review).toEqual(["macro", "customKey"]);
});

test("every slot editor's title starts with its thing's icon, as a pointing mode's does", async ({page}) => {
    for (const [screen, options, kind] of /** @type {const} */ ([["macros", {macroSlot: "MACRO_0"}, "macro"], ["customKeys", {customKey: "CUSTOM_KEY_0"}, "customKey"]])) {
        await openControls(page, screen, options);
        const icon = page.locator(`.name-titlebar > .mark-lg .kind-icon.plain[data-kind="${kind}"]`);
        await expect(icon).toHaveCount(1);
        const [mark, title] = await Promise.all([icon.boundingBox(), page.locator(".name-titlebar .title-name").boundingBox()]);
        expect((mark?.x ?? 0) < (title?.x ?? 0), `${kind}'s icon comes before its name`).toBe(true);
    }
    await openControls(page, "pointing", {pointingSlot: 0});
    await expect(page.locator(".name-titlebar > .mark-lg .kind-icon.pointing")).toHaveCount(1);
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

// A transparent key on Symbols over Macro 0, which Base and Numbers both
// hold: Base answers it, and Numbers too while it is held.
async function withMacroThroughTransparentKey(page) {
    return page.evaluate(async () => {
        const {getModel} = await import("/webview/store.mjs");
        const model = structuredClone(getModel());
        const at = model.layers[0].positions.findIndex((position) => position.keycode === "QK_MACRO_0");
        const layoutIndex = model.layers[0].positions[at].layoutIndex;
        model.layers[1].positions[at] = {...model.layers[0].positions[at]};
        Object.assign(model.layers[2].positions[at], {keycode: "KC_TRNS", semantic: "KC_TRNS", display: "", editLabel: "", value: 1});
        model.layers[2].answers[layoutIndex] = [{layer: 0, active: 0b101, blocked: 0}, {layer: 1, active: 0b111, blocked: 0}];
        model.draft.revision++;
        window.dispatchEvent(new MessageEvent("message", {data: {type: "model", model}}));
        return model.layers.slice(0, 2).map((layer) => layer.displayName || layer.name);
    });
}

// The layer marks inside a node, lit or off alike: one per layer named.
const layerIcons = (node) => node.querySelectorAll(".kind-icon.layer").length;

test("a reach names each layer a transparent key falls through to by its icon, one answering when held too", async ({page}) => {
    await openControls(page, "keys");
    const [base, held] = await withMacroThroughTransparentKey(page);
    await page.locator('[data-tab="macros"]').click();
    await page.evaluate(async () => {
        const store = await import("/webview/store.mjs");
        store.showLayer(2);
        store.state.reachGroups = {...store.state.reachGroups, through: true};
        store.render();
    });
    const reached = page.locator('tr[data-reach="through:MACRO_0"] td.muted');
    await expect(reached).toContainText(`on ${base}, ${held} when held`);
    expect(await reached.evaluate(layerIcons)).toBe(2);
});

test("the Key tab and the preview's caption name their layers by their icons", async ({page}) => {
    await openControls(page, "keys");
    const heading = page.locator(".tab-grid h4").first();
    await expect(heading).toContainText("Base");
    expect(await heading.evaluate(layerIcons)).toBe(1);
    // Which layer's key is pressed is the section's info mark, in words.
    await expect(page.locator("#key-info-stack")).toContainText("The highest layer on wins; a transparent key takes the next one down. Base is always on.");

    await page.evaluate(async () => {
        const store = await import("/webview/store.mjs");
        store.showLayer(2);
        store.toggleLayerOn(1);
        store.render();
    });
    const caption = page.locator(".board-foot-text").first();
    await expect(caption).toContainText("on top of");
    expect(await caption.evaluate(layerIcons)).toBe(4);
});

test("an empty slot's note names the layer still reaching it by its icon, in its sentence", async ({page}) => {
    await openControls(page, "pointing", {pointingSlot: 6});
    const note = page.locator(".pd-editor .unavailable").first();
    await expect(note).toContainText("still reaches this slot");
    expect(await note.evaluate(layerIcons)).toBe(1);
    // The box lays its children out as rows; the sentence is one of them, whole.
    expect(await note.evaluate((node) => [node.children.length, node.children[0]?.textContent?.includes("still reaches this slot")])).toEqual([1, true]);
});

test("the keycode picker names the layer its Tap-hold is armed on by its icon", async ({page}) => {
    await openControls(page, "keys");
    await page.locator('.tab-grid [data-act="pick"]').first().click();
    await page.locator('.picker [data-sec="layers"]').click();
    await page.locator('.picker [data-lt="1"]').click();
    const note = page.locator(".picker .pk-note");
    await expect(note).toContainText("is armed");
    expect(await note.evaluate(layerIcons)).toBe(1);
});

test("the keycode picker marks a pointing mode, a macro and a custom key as it marks a layer", async ({page}) => {
    await openControls(page, "keys");
    await page.locator('.tab-grid [data-act="pick"]').first().click();
    const picker = page.locator(".picker");

    // Each pointing slot's row, by its icon in its own light; the words stay.
    await picker.locator('[data-sec="modes"]').click();
    const rows = picker.locator(".pk-layers.modes .pk-layer");
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
    await expect(rows.locator(".nm .mk .kind-icon.pointing")).toHaveCount(count);
    await expect(rows.first().locator(".nm .mk")).toHaveText("Dragscroll");
    await expect(rows.first().locator('[data-pick="PD_MODE_0"] .kind-icon')).toHaveCount(0);
    // Lit or off, every row's name starts at one edge, its kind under it.
    const edges = await rows.evaluateAll((all) => all.map((row) => {
        const left = (selector) => {
            const words = document.createRange();
            words.selectNodeContents(row.querySelector(selector));
            return words.getBoundingClientRect().left - row.getBoundingClientRect().left;
        };
        return [left(".mk > span:last-child"), left(".sub")];
    }));
    expect(new Set(edges.flat()).size, "one left edge for every name and kind").toBe(1);

    // Every macro tile, named or not.
    await picker.locator('[data-sec="macros"]').click();
    const macros = picker.locator(".pk-grid .pk");
    const macroCount = await macros.count();
    expect(macroCount).toBeGreaterThan(0);
    await expect(macros.locator('.l .mk .kind-icon[data-kind="macro"]')).toHaveCount(macroCount);
    await expect(picker.locator('[data-pick="MACRO_0"] .l')).toHaveText("Macro 0");

    await picker.locator('[data-sec="custom"]').click();
    await expect(picker.locator('[data-pick="CUSTOM_KEY_0"] .l .kind-icon[data-kind="customKey"]')).toHaveCount(1);
    await expect(picker.locator('[data-pick="CUSTOM_KEY_0"] .l')).toHaveText("Custom key 0");
    await picker.locator('[data-sec="common"]').click();
    await expect(picker.locator('[data-pick="KC_TRANSPARENT"] .kind-icon')).toHaveCount(0);

    // A search draws them the same way, a pointing mode's key by its slot's light.
    const search = picker.locator("#pickerSearch");
    await search.fill("dragscroll");
    const hold = picker.locator('[data-pick="PD_MODE_0"]');
    await expect(hold.locator(".l .kind-icon.pointing")).toHaveCount(1);
    await expect(hold.locator(".sends-name")).toHaveText("Dragscroll");
    await expect(hold.locator(".sends-tag")).toHaveText("hold");
    await expect(hold).toHaveAccessibleName("Dragscroll · hold PD_MODE_0");
    // An empty slot's key too, whose name is its slot's.
    await search.fill("PD_MODE_8_LOCK");
    await expect(picker.locator('[data-pick="PD_MODE_8_LOCK"] .l .kind-icon.pointing')).toHaveCount(1);
    await search.fill("CUSTOM_KEY_0");
    await expect(picker.locator('[data-pick="CUSTOM_KEY_0"] .l .kind-icon[data-kind="customKey"]')).toHaveCount(1);
    await search.fill("M0");
    await expect(picker.locator('[data-pick="MACRO_0"] .l .kind-icon[data-kind="macro"]')).toHaveCount(1);

    // A key that reaches none of them keeps its bare name.
    await search.fill("KC_ENTER");
    await expect(picker.locator('[data-pick="KC_ENTER"]')).toBeVisible();
    await expect(picker.locator('[data-pick="KC_ENTER"] .kind-icon')).toHaveCount(0);
});

test("Lighting names the layer whose colour and accents it edits by its icon", async ({page}) => {
    await openControls(page, "lighting", {stage: "layers", layer: 1});
    expect(await page.locator("h4", {hasText: / colour$/}).first().evaluate(layerIcons)).toBe(1);
    const accents = page.locator('[data-accents="layer"]');
    const when = accents.locator(".note", {hasText: "is on, with those for every layer"});
    expect(await accents.locator("h4").evaluate(layerIcons)).toBe(1);
    expect(await when.evaluate(layerIcons)).toBe(1);
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
    expect(arrow.text).toMatch(/^from Right Option · 1× ?tap$/);
    const dragscroll = reached("PD_MODE_0_LOCK");
    await expect(dragscroll.locator(".bn")).toHaveText(["2×"]);
    await expect(dragscroll.locator(".fbdot")).toHaveCount(1);
    expect(await dragscroll.evaluate(namedIn)).toMatchObject({named: [{icon: "pointing", name: "Dragscroll", tags: ["hold"]}, {icon: "pointing", name: "Dragscroll", tags: ["lock"]}]});
    expect((await dragscroll.evaluate(namedIn)).text).toMatch(/· 2× ?hold sends Dragscroll ?lock$/);
    expect((await dragscroll.evaluate(namedIn)).text).not.toContain("from");

    // A key reads by its name however it reaches the row: the row's own first
    // column carries the keycodes. Every route says so, the ones this fixture
    // does not reach too: a behaviour's key, what it sends, a combo through one.
    const routes = await page.evaluate(async () => {
        const {getModel} = await import("/webview/store.mjs");
        const {reachLabel} = await import("/webview/ui/keys/reach.mjs");
        const {el} = await import("/webview/lib/dom.mjs");
        const cells = [{branch: 1, tier: "tap"}];
        const box = el(`<div>${reachLabel(getModel(), {name: "PD_MODE_0", keys: [],
            behaviours: [{keycode: "KC_RIGHT_ALT", action: "PD_MODE_0_LOCK", layer: null, whileHeld: false, cells}],
            combos: [{combo: {badge: "C0", inputs: ["KC_D", "KC_F"]}, via: "KC_RIGHT_ALT", action: "PD_MODE_0_LOCK", keys: [], cells}]})}</div>`);
        return {text: box.textContent.replace(/\s+/g, " ").trim(), codes: box.querySelectorAll("code").length};
    });
    expect(routes.text).toContain("from Right Option");
    expect(routes.text).toContain("through Right Option");
    expect(routes.text).toContain("sends Dragscroll");
    expect(routes.codes, "no keycode in Reached by").toBe(0);
});

// The Multi tap window governs every tap count past the first, so its mark is
// the branch badge counting "N×", its border and fill split into an equal,
// hard-edged share of each tap-branch colour in tap order (D-L31); and a
// Settings row's one mark sits in the middle of its slot.
test("Settings marks the Multi tap window with an N× badge in every tap-branch colour, each timing's mark centred in its slot", async ({page}) => {
    await openControls(page, "behaviours");
    const badge = page.locator('[data-section="keyTiming"] .setrow:has([data-f="setting:multiTapTerm"]) .mk-slot .bn');
    await expect(badge).toHaveText("N×");

    const offsets = await page.locator('[data-section="keyTiming"] .mk-slot:has(> *)').evaluateAll((slots) => slots.map((slot) => {
        const box = slot.getBoundingClientRect(), mark = /** @type {Element} */ (slot.firstElementChild).getBoundingClientRect();
        return Math.abs((mark.left + mark.right) / 2 - (box.left + box.right) / 2);
    }));
    expect(offsets).toHaveLength(3);
    expect(offsets.every((offset) => offset < 1)).toBe(true);

    // Red, a passthrough colour, blue and green: four tap counts, so four
    // quarters, the passthrough one left empty. Drawn on its own and large, on a known ground,
    // so each quarter is many pixels wide.
    await page.evaluate(async () => {
        const {getModel} = await import("/webview/store.mjs");
        const {mark} = await import("/webview/ui/marks.mjs");
        const {html} = await import("/webview/lib/dom.mjs");
        const model = structuredClone(getModel());
        model.rgb.keyBehaviorFeedback.tapBranches = [{h: "0", s: "255", v: "255"}, {h: "0", s: "0", v: "0"}, {h: "170", s: "255", v: "255"}, {h: "85", s: "255", v: "255"}].map(color => ({color, locality: "RGB_KEY_HALF"}));
        const box = Object.assign(document.createElement("div"), {id: "drawn", innerHTML: html(`<span class="mk">${mark(model, {kind: "branches"})}</span>`)});
        box.style.cssText = "position: fixed; left: 0; top: 0; z-index: 999; padding: 8px; background: rgb(20, 20, 20); zoom: 4";
        document.body.appendChild(box);
    });
    const shot = (await page.locator("#drawn .bn").screenshot()).toString("base64");
    const pixels = await page.evaluate(async (png) => {
        const image = await createImageBitmap(await (await fetch(`data:image/png;base64,${png}`)).blob());
        const canvas = new OffscreenCanvas(image.width, image.height);
        const context = /** @type {OffscreenCanvasRenderingContext2D} */ (canvas.getContext("2d"));
        context.drawImage(image, 0, 0);
        const at = (x, y) => [...context.getImageData(Math.round(x), Math.round(y), 1, 1).data.slice(0, 3)];
        const {width: w} = image, quarter = w / 4;
        return {
            background: at(0, 0),
            // The fill above the count, at each quarter's middle, and either side of each edge.
            fill: [0, 1, 2, 3].map((i) => at(quarter * (i + .5), 8)),
            nearEdges: [1, 2, 3].map((i) => [at(quarter * i - 3, 8), at(quarter * i + 3, 8)]),
            // The border's top row, in the two middle quarters.
            ring: [1, 2].map((i) => at(quarter * (i + .5), 1)),
        };
    }, shot);
    const leads = ([r, g, b]) => r > g + 20 && r > b + 20 ? "red" : g > r + 20 && g > b + 20 ? "green" : b > r + 20 && b > g + 20 ? "blue" : "none";
    const close = (a, b) => a.every((channel, i) => Math.abs(channel - b[i]) <= 3);
    expect(pixels.fill.map(leads)).toEqual(["red", "none", "blue", "green"]);
    expect(close(pixels.fill[1], pixels.background)).toBe(true);
    // A hard switch: three pixels either side of an edge are each its own share's colour.
    expect(pixels.nearEdges.map(([before, after]) => [leads(before), leads(after)])).toEqual([["red", "none"], ["none", "blue"], ["blue", "green"]]);
    expect(close(pixels.nearEdges[2][0], pixels.fill[2]) && close(pixels.nearEdges[2][1], pixels.fill[3])).toBe(true);
    expect(close(pixels.ring[0], pixels.background)).toBe(true);
    expect(pixels.ring[1][2]).toBeGreaterThan(200);

    // With behaviour feedback off the badge is drawn unlit, as a tap count's is.
    const off = await page.evaluate(async () => {
        const {getModel} = await import("/webview/store.mjs");
        const {mark} = await import("/webview/ui/marks.mjs");
        const model = structuredClone(getModel());
        model.rgb.stages.forEach((stage) => { if (stage.id === "key") stage.enabled = false; });
        return mark(model, {kind: "branches"});
    });
    expect(off).toBe('<span class="bn">N×</span>');
});
