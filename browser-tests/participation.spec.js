// @ts-check
"use strict";
const {test, expect} = require("@playwright/test");
const {compileLayerAnswers} = require("../core/model/layer-resolution");

test("participation controls post placements, shared definitions and master/source-layer settings", async ({page}) => {
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("/preview/index.html");
    await page.locator('[data-screen="keys"]').click();
    const clear = () => page.evaluate(() => {window.__posted.length = 0;});
    const posted = () => page.evaluate(() => window.__posted);
    await clear();
    await page.getByText('Use behaviour', {exact: true}).click();
    await expect.poll(posted).toEqual([expect.objectContaining({type: "updatePlacementPolicy", layer: 0, layoutIndex: 0, useBehavior: false, joinCombos: true})]);
    await clear();
    await page.getByText('Join combos', {exact: true}).click();
    await expect.poll(posted).toEqual([expect.objectContaining({type: "updatePlacementPolicy", useBehavior: false, joinCombos: false})]);

    await page.locator('[data-tab="behaviours"]').click();
    await clear();
    await page.getByText('Use this behaviour', {exact: true}).click();
    await expect.poll(posted).toEqual([expect.objectContaining({type: "saveBehavior", behavior: expect.objectContaining({enabled: false, allowedLayers: 65535})})]);
    await page.getByText("Layers it runs on", {exact: true}).click();
    // Each layer by its name and mark, as Settings draws its layer switches.
    await expect(page.locator('.def-layers .layer-grid .sw .mk').first()).toBeVisible();
    await clear();
    await page.locator('.def-layers label').filter({has: page.locator('[data-switch-layer="15"]')}).click();
    await expect.poll(posted).toEqual([expect.objectContaining({type: "saveBehavior", behavior: expect.objectContaining({enabled: false, allowedLayers: 32767})})]);

    await page.locator('[data-tab="combos"]').click();
    await page.getByRole("button", {name: "New combo", exact: true}).click();
    await page.getByText('Use this combo', {exact: true}).click();
    await page.getByText("Layers it runs on", {exact: true}).click();
    await page.locator('.def-layers label').filter({has: page.locator('[data-switch-layer="15"]')}).click();
    await page.locator('[data-output]').fill("KC_A");
    await page.locator('[data-act="pickboard"]').click();
    await page.locator('.board-card [data-key="1"]').click();
    await page.locator('.board-card [data-key="2"]').click();
    await clear();
    await page.locator('[data-act="keep"]').click();
    await expect.poll(posted).toEqual([expect.objectContaining({type: "addCombo", output: "KC_A", inputs: expect.any(Array), enabled: false, allowedLayers: 32767})]);
    expect((await posted())[0].inputs).toHaveLength(2);

    // The layers each runs on are shown under its master switch.
    for (const [macro, sectionId, screen] of [["behaviorsEnabled", "behaviorSettings", "behaviours"], ["behaviorsOnLayer15", "behaviorSettings", "behaviours"],
        ["combosEnabled", "comboSettings", "combos"], ["combosOnLayer15", "comboSettings", "combos"]]) {
        await page.locator(`[data-screen="${screen}"]`).click();
        await clear();
        await page.locator("label").filter({has: page.locator(`[data-macro="${macro}"]`)}).click();
        await expect.poll(posted).toEqual([expect.objectContaining({type: "updateConfigDefaults", sectionId, fields: expect.arrayContaining([{macro, enabled: false}])})]);
    }
    expect(errors).toEqual([]);
});

test("a transparent late-layer key explains its source and opens that placement", async ({page}) => {
    await page.goto("/preview/index.html");
    await page.locator('[data-screen="keys"]').click();
    const model = await page.evaluate(async () => {
        const store = await import("/webview/store.mjs");
        const model = structuredClone(store.getModel());
        const key = model.layers[15].positions[0];
        Object.assign(key, {keycode: "KC_TRNS", semantic: "KC_TRNS", value: 1, display: "Transparent"});
        return model;
    });
    // This fixture changes a native layout value, so republish the same core
    // facts the production core regenerates after accepting that edit.
    const answers = compileLayerAnswers(model.layers.map(layer => {
        const codes = [];
        for (const key of layer.positions) codes[key.layoutIndex] = key.value;
        return codes;
    }));
    model.layers.forEach((layer, at) => { layer.answers = answers[at]; });
    await page.evaluate(async model => {
        const store = await import("/webview/store.mjs");
        store.setModel(model); store.showLayer(15); store.render();
    }, model);
    await expect(page.locator('[data-source-layer]')).toBeVisible();
    await expect(page.locator('.bench-body')).toContainText("This key is transparent on this layer");
    await expect(page.locator('[data-use-behavior]')).toHaveCount(0);
    await page.locator('[data-source-layer]').click();
    await expect(page.locator('[data-use-behavior]')).toBeEnabled();
    await page.evaluate(() => {window.__posted.length = 0;});
    await page.getByText('Use behaviour', {exact: true}).click();
    await expect.poll(() => page.evaluate(() => window.__posted)).toEqual([expect.objectContaining({type: "updatePlacementPolicy", layer: 0, layoutIndex: 0})]);

    // With no preview held, What this key reaches follows the same key from
    // below as the status line does, and Open opens that key's behaviour.
    await page.evaluate(async () => {
        const store = await import("/webview/store.mjs");
        store.showLayer(15); store.state.selected = 0; store.state.tab = "key"; store.render();
    });
    const base = model.layers[0], below = base.positions.find(key => key.layoutIndex === 0);
    const reach = page.locator('.key-reaches [data-goto="behaviours"]');
    await expect(reach).toBeEnabled();
    await expect(reach).not.toContainText("Unavailable");
    await expect(reach).toContainText(`from ${base.displayName || base.name}`);
    await reach.click();
    await expect.poll(() => page.evaluate(async () => {
        const {state} = await import("/webview/store.mjs");
        return [state.tab, state.behaviourRow];
    })).toEqual(["behaviours", below.semantic || below.keycode]);
});

test("a key whose behaviour is switched off for it on this layer shows no dots there, keeps them elsewhere, and its hover and Key tab say why", async ({page}) => {
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("/preview/index.html");
    await page.locator('[data-screen="keys"]').click();
    // A Base key with a behaviour that has branches, then the same model with
    // Use behaviour off for that key on Base.
    const found = await page.evaluate(async () => {
        const store = await import("/webview/store.mjs");
        const {behaviourFor, keyMeaning} = await import("/webview/view/keyface.mjs");
        const model = store.getModel();
        const key = model.layers[0].positions.find(position => position.row !== undefined && behaviourFor(model, keyMeaning(position))?.steps?.length);
        store.showLayer(0); store.state.tab = "key"; store.state.selected = key.layoutIndex; store.render();
        return {index: key.layoutIndex, placement: key.row * 6 + key.column, name: model.layers[0].displayName || model.layers[0].name};
    });
    const key = page.locator(`g.kc[data-key="${found.index}"]`);
    await expect(key.locator("circle").first()).toBeAttached();
    // The same keycode on a second layer, so one placement can be switched
    // off while the other keeps its behaviour. This fixture changes a native
    // layout value, so republish the facts the core regenerates after it.
    const model = await page.evaluate(async ({index, placement}) => {
        const store = await import("/webview/store.mjs");
        const model = structuredClone(store.getModel());
        const base = model.layers[0].positions.find(position => position.layoutIndex === index);
        const other = model.layers[1].positions.find(position => position.layoutIndex === index);
        Object.assign(other, {keycode: base.keycode, semantic: base.semantic, value: base.value, display: base.display});
        model.participation.layers[0].bypass = [placement];
        return model;
    }, found);
    const answers = compileLayerAnswers(model.layers.map(layer => {
        const codes = [];
        for (const key of layer.positions) codes[key.layoutIndex] = key.value;
        return codes;
    }));
    model.layers.forEach((layer, at) => { layer.answers = answers[at]; });
    await page.evaluate(async model => {
        const store = await import("/webview/store.mjs");
        store.setModel(model); store.showLayer(1); store.render();
    }, model);
    await expect(key.locator("circle").first()).toBeAttached();
    await page.evaluate(async () => {
        const store = await import("/webview/store.mjs");
        store.showLayer(0); store.render();
    });
    await expect(key.locator("circle")).toHaveCount(0);

    const why = `Use behaviour is off for this key on this layer (${found.name})`;
    await key.hover();
    const card = page.locator(".hovercard:not(.hc-side)");
    await expect(card).toBeVisible();
    await expect(card).toContainText("Key behaviour not used");
    await expect(card).toContainText(why);
    await expect(card.locator(".hc-branch")).toHaveCount(0);

    const body = page.locator(".bench-body");
    await expect(body.locator("h4").first()).toHaveText(`This key on this layer (${found.name})`);
    await expect(body.locator('.key-reaches [data-goto="behaviours"]')).toContainText(`not used: ${why}`);
    await expect(body.locator(".key-participation")).toContainText(`Behaviour and combos for this key on this layer (${found.name})`);
    await expect(body.locator(".key-participation")).toContainText(`They switch only this key on this layer (${found.name}).`);
    expect(errors).toEqual([]);
});
