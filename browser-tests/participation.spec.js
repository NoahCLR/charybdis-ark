// @ts-check
"use strict";
const {test, expect} = require("@playwright/test");
const {demoDocument, openDraft, panelModel} = require("../tests/fixtures/published-model");
const {editDomain} = require("../tests/fixtures/profile-document");
const {SETTING} = require("../core/schema/settings-domain-v1");
// Text replacement's switch: key option 12 of the settings (firmware's settings domain).
const AUTOCORRECT_OPTION = 1 << 12;

// What core publishes for the demo profile, or `doc`, saved with `edits` (a
// fresh draft on it, so no key reads as drafted), as the shell posts it, shown
// on `layer`.
async function publish(page, edits, layer, doc = demoDocument()) {
    const {draft, state} = openDraft(openDraft(doc, {edits}).draft.document);
    const model = panelModel(draft, state);
    await page.evaluate(async ({model, layer}) => {
        const store = await import("/webview/store.mjs");
        store.setModel(model); store.showLayer(layer); store.render();
    }, {model, layer});
    return model;
}

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
    const layersPanel = page.locator(".def-layers [aria-haspopup]");
    await page.getByText("Layers it runs on", {exact: true}).click();
    // Each layer by its name and mark, as Settings draws its layer switches;
    // layer 15 is empty, so it shows once the empty layers do.
    await expect(layersPanel).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator('.def-layers .layer-grid .sw .mk').first()).toBeVisible();
    await page.locator('.def-layers [data-empty-layers]').click();
    await clear();
    await page.locator('.def-layers label').filter({has: page.locator('[data-switch-layer="15"]')}).click();
    await expect.poll(posted).toEqual([expect.objectContaining({type: "saveBehavior", behavior: expect.objectContaining({enabled: true, allowedLayers: 32767})})]);
    // The panel stays open across the redraw the switch caused; a press
    // outside it closes it, and the press still lands.
    await expect(layersPanel).toHaveAttribute("aria-expanded", "true");
    await clear();
    await page.getByText('Use this behaviour', {exact: true}).click();
    await expect.poll(posted).toEqual([expect.objectContaining({type: "saveBehavior", behavior: expect.objectContaining({enabled: false, allowedLayers: 32767})})]);
    await expect(layersPanel).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator(".def-pop")).toHaveCount(0);

    await page.locator('[data-tab="combos"]').click();
    await page.getByRole("button", {name: "New combo", exact: true}).click();
    await page.getByText('Use this combo', {exact: true}).click();
    // A combo opens the same panel.
    await page.getByText("Layers it runs on", {exact: true}).click();
    await expect(layersPanel).toHaveAttribute("aria-expanded", "true");
    await page.locator('.def-layers [data-empty-layers]').click();
    await page.locator('.def-layers label').filter({has: page.locator('[data-switch-layer="15"]')}).click();
    // Esc closes the panel, focus back on its button; a press outside would too.
    await page.keyboard.press("Escape");
    await expect(page.locator(".def-pop")).toHaveCount(0);
    await expect(layersPanel).toBeFocused();
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
        if (macro.endsWith("Layer15") && await page.locator(`[data-empty-layers="settings:${sectionId}"][aria-expanded="false"]`).count()) await page.locator(`[data-empty-layers="settings:${sectionId}"]`).click();
        await clear();
        await page.locator("label").filter({has: page.locator(`[data-macro="${macro}"]`)}).click();
        await expect.poll(posted).toEqual([expect.objectContaining({type: "updateConfigDefaults", sectionId, fields: expect.arrayContaining([{macro, enabled: false}])})]);
    }
    expect(errors).toEqual([]);
});

test("Layers it runs on says which layers Settings keeps off, for its own kind, and each switch still posts", async ({page}) => {
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("/preview/index.html");
    await page.locator('[data-screen="keys"]').click();
    // Behaviours off on layer 1, combos off on layer 2.
    await publish(page, [], 0, editDomain(demoDocument(), "settings", (settings) => {
        settings.values[SETTING.LAYER_BEHAVIORS] &= ~(1 << 1);
        settings.values[SETTING.LAYER_COMBOS] &= ~(1 << 2);
    }));
    const row = (layer) => page.locator(".def-layers .layer-grid label").filter({has: page.locator(`[data-switch-layer="${layer}"]`)});
    const flagged = () => page.locator(".def-layers .layer-grid .layer-why:visible");

    await page.locator('[data-tab="behaviours"]').click();
    await page.getByText("Layers it runs on", {exact: true}).click();
    await expect(flagged()).toHaveCount(1);
    await expect(row(1).locator(".layer-why")).toHaveText("off in Behaviour settings");
    await expect(row(1)).toHaveAttribute("data-tip", /^Behaviour settings has behaviours off on this layer \(.+\)\. For a key on this layer, this switch takes effect once that is on again; for a combo sending this behaviour, it applies now\.$/);
    await expect(row(0).locator(".layer-why")).toHaveCount(0);
    await expect(row(2).locator(".layer-why")).toHaveCount(0);
    // Settings says no for now; this behaviour's own switch stays its own.
    await page.evaluate(() => {window.__posted.length = 0;});
    await row(1).click();
    await expect.poll(() => page.evaluate(() => window.__posted)).toEqual([expect.objectContaining({type: "saveBehavior", behavior: expect.objectContaining({allowedLayers: 65533})})]);
    await page.keyboard.press("Escape");

    await page.locator('[data-tab="combos"]').click();
    await page.getByRole("button", {name: "New combo", exact: true}).click();
    await page.getByText("Layers it runs on", {exact: true}).click();
    await expect(flagged()).toHaveCount(1);
    await expect(row(2).locator(".layer-why")).toHaveText("off in Combo settings");
    await expect(row(1).locator(".layer-why")).toHaveCount(0);
    expect(errors).toEqual([]);
});

test("a master switch off says so at the top of its tab, not in Layers it runs on, where a layer's own switch still shows", async ({page}) => {
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("/preview/index.html");
    await page.locator('[data-screen="keys"]').click();
    const note = page.locator("[data-master-off]");
    const why = page.locator(".def-layers .layer-grid .layer-why:visible");
    const row = (layer) => page.locator(".def-layers .layer-grid label").filter({has: page.locator(`[data-switch-layer="${layer}"]`)});
    await page.locator('[data-tab="behaviours"]').click();
    await expect(note).toHaveCount(0);

    // Behaviours off everywhere and on layer 1 too; combos still on.
    await publish(page, [], 0, editDomain(demoDocument(), "settings", (settings) => {
        settings.values[SETTING.BEHAVIORS_ENABLED] = 0;
        settings.values[SETTING.LAYER_BEHAVIORS] &= ~(1 << 1);
    }));
    await expect(note).toHaveText("Behaviours are off. Turn them on in Behaviour settings →");
    await expect(page.locator(".keys-bench .bench-body > .banner-over > [data-master-off]")).toBeVisible();
    await expect(page.locator(".beh-main [data-master-off]")).toHaveCount(0);
    await page.getByText("Layers it runs on", {exact: true}).click();
    await expect(why).toHaveCount(1);
    await expect(row(1).locator(".layer-why")).toBeVisible();
    await page.keyboard.press("Escape");
    await page.locator('[data-tab="combos"]').click();
    await page.getByRole("button", {name: "New combo", exact: true}).click();
    await expect(note).toHaveCount(0);

    await publish(page, [], 0, editDomain(demoDocument(), "settings", (settings) => {
        settings.values[SETTING.COMBOS_ENABLED] = 0;
    }));
    await expect(note).toHaveText("Combos are off. Turn them on in Combo settings →");
    await expect(page.locator(".keys-bench .bench-body > .banner-over > [data-master-off]")).toBeVisible();
    await expect(page.locator(".combo-builder [data-master-off]")).toHaveCount(0);
    await page.getByText("Layers it runs on", {exact: true}).click();
    await expect(why).toHaveCount(0);
    await page.getByText("Layers it runs on", {exact: true}).click();

    // Pressing it goes to the switch that says so, and marks that row.
    await note.click();
    await expect(page.locator('[data-screen="combos"]')).toHaveAttribute("aria-current", "true");
    await expect(page.locator('.setrow:has([data-macro="combosEnabled"])')).toHaveClass(/revealed/);
    await expect(page.locator('[data-macro="combosEnabled"]')).not.toBeChecked();

    await page.locator('[data-screen="keys"]').click();
    await page.locator('[data-tab="behaviours"]').click();
    await publish(page, [], 0, editDomain(demoDocument(), "settings", (settings) => {
        settings.values[SETTING.BEHAVIORS_ENABLED] = 0;
    }));
    await note.click();
    await expect(page.locator('[data-screen="behaviours"]')).toHaveAttribute("aria-current", "true");
    await expect(page.locator('.setrow:has([data-macro="behaviorsEnabled"])')).toHaveClass(/revealed/);

    // A custom key's behaviour has no such tab: its card says so.
    await page.locator('[data-screen="customKeys"]').click();
    await expect(page.locator(".custom-key-behaviour [data-master-off]")).toBeVisible();
    expect(errors).toEqual([]);
});

test("a Lighting stage a global switch keeps from painting says so, reads off, and goes to that switch", async ({page}) => {
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("/preview/index.html");
    const banner = page.locator(".lighting-bench [data-master-off]");
    const open = async (stage) => {
        await page.locator('[data-screen="lighting"]').click();
        await page.locator(`[data-ltab="${stage}"]`).click();
    };
    for (const stage of ["auto", "combo", "key", "autocorrect", "layers"]) {
        await open(stage);
        await expect(banner).toHaveCount(0);
    }
    await publish(page, [], 0, editDomain(demoDocument(), "settings", (settings) => {
        settings.values[SETTING.AUTO_MOUSE_ENABLED] = 0;
        settings.values[SETTING.COMBOS_ENABLED] = 0;
        settings.values[SETTING.BEHAVIORS_ENABLED] = 0;
        settings.values[SETTING.KEYMAP_OPTIONS] &= ~AUTOCORRECT_OPTION;
    }));
    // The stage bar says so in a word, its tip the whole sentence, and the
    // stage keeps its place: no banner pushes it down.
    for (const [stage, words, tip, screen, macro] of [
        ["auto", "Auto-mouse is off →", "This stage paints nothing. Turn it on in Pointer settings →", "pointer", "autoMouse"],
        ["combo", "Combos are off →", "This stage paints nothing. Turn them on in Combo settings →", "combos", "combosEnabled"],
        ["key", "Behaviours are off →", "This stage paints nothing. Turn them on in Behaviour settings →", "behaviours", "behaviorsEnabled"],
        ["autocorrect", "Text replacement is off →", "This stage paints nothing. Turn it on in Host settings →", "host", "autocorrect"]]) {
        await open(stage);
        await expect(banner).toHaveText(words);
        await expect(banner).toHaveAttribute("data-tip", tip);
        await expect(page.locator(".lighting-bench .stage-bar.held")).toHaveCount(1);
        if (stage === "auto") {
            // Idle, its controls still post, for when auto-mouse is back on.
            const mode = page.locator('[data-f="lighting:auto:fade-mode"]');
            const other = await mode.evaluate((select) => [...select.options].find((option) => !option.selected).value);
            await page.evaluate(() => {window.__posted.length = 0;});
            await mode.selectOption(other);
            await expect.poll(() => page.evaluate(() => window.__posted.length)).toBe(1);
        }
        await expect(page.locator(`[data-ltab="${stage}"]`)).toHaveClass(/off/);
        await banner.click();
        await expect(page.locator(`[data-screen="${screen}"]`)).toHaveAttribute("aria-current", "true");
        await expect(page.locator(`.setrow:has([data-macro="${macro}"])`)).toHaveClass(/revealed/);
    }
    await open("layers");
    await expect(banner).toHaveCount(0);
    expect(errors).toEqual([]);
});

test("Esc straight after opening a panel closes that panel alone, with focus still on its button", async ({page}) => {
    await page.goto("/preview/index.html");
    await page.locator('[data-screen="keys"]').click();
    const panels = page.locator(".def-pop");
    const layersButton = page.locator('[data-act="definition-layers"]');

    // In the combo builder, Esc would otherwise cancel the form under it.
    await page.locator('[data-tab="combos"]').click();
    await page.getByRole("button", {name: "New combo", exact: true}).click();
    await page.locator("[data-output]").fill("KC_A");
    await layersButton.click();
    await expect(panels).toHaveCount(1);
    await expect(layersButton).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(panels).toHaveCount(0);
    await expect(layersButton).toBeFocused();
    await expect(page.locator("[data-output]")).toHaveValue("KC_A");
    // With no panel open, Esc cancels the builder as ever.
    await page.keyboard.press("Escape");
    await expect(page.locator(".combo-builder [data-output]")).toHaveCount(0);

    // On a behaviour, both of its panels.
    await page.locator('[data-tab="behaviours"]').click();
    for (const act of ["definition-layers", "behaviour-timings"]) {
        const button = page.locator(`[data-act="${act}"]`);
        await button.click();
        await expect(panels).toHaveCount(1);
        await page.keyboard.press("Escape");
        await expect(panels).toHaveCount(0);
        await expect(button).toBeFocused();
    }
});

test("an open panel takes Esc first wherever focus is, and a sheet over it takes Esc before it", async ({page}) => {
    await page.goto("/preview/index.html");
    await page.locator('[data-screen="keys"]').click();
    await page.locator('[data-tab="combos"]').click();
    await page.getByRole("button", {name: "New combo", exact: true}).click();
    const output = page.locator("[data-output]");
    await output.fill("KC_A");
    const panels = page.locator(".def-pop");
    const layersButton = page.locator('[data-act="definition-layers"]');

    // Focus moved on from the panel, into a field of the builder under it:
    // Esc closes the panel, not the builder holding what was typed.
    await layersButton.click();
    await output.focus();
    await page.keyboard.press("Escape");
    await expect(panels).toHaveCount(0);
    await expect(layersButton).toBeFocused();
    await expect(output).toHaveValue("KC_A");

    // Moving focus does not close the panel; only Esc or a press outside do.
    await layersButton.click();
    await output.focus();
    await expect(panels).toHaveCount(1);

    // The keycode picker opened from the keyboard sits over the panel, so it
    // closes first, then the panel, then the builder, one Esc each.
    await page.locator('[data-act="pickout"]').focus();
    await page.keyboard.press("Enter");
    const sheet = page.locator(".sheet.picker");
    await expect(sheet).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);
    await expect(panels).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(panels).toHaveCount(0);
    await expect(output).toHaveValue("KC_A");
    await page.keyboard.press("Escape");
    await expect(output).toHaveCount(0);
});

test("the keyboard menu and the Layers panel opened over an open panel each take Esc before it", async ({page}) => {
    await page.goto("/preview/index.html");
    await page.locator('[data-screen="keys"]').click();
    await page.locator('[data-tab="combos"]').click();
    await page.getByRole("button", {name: "New combo", exact: true}).click();
    const panels = page.locator(".def-pop");
    await page.locator('[data-act="definition-layers"]').click();
    await expect(panels).toHaveCount(1);

    await page.locator("#rail-keyboard").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#rail-menu")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("#rail-menu")).toHaveCount(0);
    await expect(panels).toHaveCount(1);

    await page.getByRole("button", {name: "Rename & reorder"}).focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".layerpanel")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator(".layerpanel")).toHaveCount(0);
    await expect(panels).toHaveCount(1);

    await page.keyboard.press("Escape");
    await expect(panels).toHaveCount(0);
    await expect(page.locator("[data-output]")).toHaveCount(1);
});

test("a transparent late-layer key explains its source and opens that placement", async ({page}) => {
    await page.goto("/preview/index.html");
    await page.locator('[data-screen="keys"]').click();
    // Layer 15's first key made transparent, so a lower layer answers it.
    const model = await publish(page, [{type: "updateLayoutKeys", layer: "Layer 15", changes: [{layoutIndex: 0, keycode: "KC_TRNS"}]}], 15);
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
    // A Base key with a behaviour that has branches, then the same profile
    // with Use behaviour off for that key on Base.
    await publish(page, [], 0);
    const found = await page.evaluate(async () => {
        const store = await import("/webview/store.mjs");
        const {keyMeaning} = await import("/webview/view/keyface.mjs");
        const {keyIdentity} = await import("/webview/view/key-identity.mjs");
        const model = store.getModel();
        const key = model.layers[0].positions.find(position => position.row !== undefined && keyIdentity(model, keyMeaning(position)).behaviour?.steps?.length);
        store.showLayer(0); store.state.tab = "key"; store.state.selected = key.layoutIndex; store.render();
        return {index: key.layoutIndex, keycode: key.semantic || key.keycode, name: model.layers[0].displayName || model.layers[0].name};
    });
    const key = page.locator(`g.kc[data-key="${found.index}"]`);
    await expect(key.locator("circle").first()).toBeAttached();
    // The same keycode on a second layer, so one placement can be switched
    // off while the other keeps its behaviour.
    await publish(page, [{type: "updateLayoutKeys", layer: "Layer 1", changes: [{layoutIndex: found.index, keycode: found.keycode}]},
        {type: "updatePlacementPolicy", layer: 0, layoutIndex: found.index, useBehavior: false, joinCombos: true}], 1);
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
    expect(await card.locator(".hc-off .hc-sub").first().evaluate((node) => node.querySelectorAll(".kind-icon.layer").length), "the reason marks its layer").toBe(1);
    // Its brackets keep to the mark's line, so a wrap leaves no "(" behind.
    await expect(card.locator(".hc-off .hc-sub .mk-glued").first()).toHaveText(`(${found.name})`);

    const body = page.locator(".bench-body");
    await expect(body.locator("h4").first()).toHaveText(`This key on this layer (${found.name})`);
    await expect(body.locator('.key-reaches [data-goto="behaviours"]')).toContainText(`not used: ${why}`);
    await expect(body.locator(".key-participation")).toContainText(`Behaviour and combos for this key on this layer (${found.name})`);
    await expect(body.locator(".key-participation")).toContainText("For every key, use the behaviour's or combo's own switch; for a whole layer, Settings.");
    // Each reason names its layer by its icon, as the heading above it does.
    const layerIcons = (/** @type {Element} */ node) => node.querySelectorAll(".kind-icon.layer").length;
    expect(await body.locator('.key-reaches [data-goto="behaviours"] .dim').evaluate(layerIcons)).toBe(1);
    expect(await body.locator(".key-participation .note", {hasText: "Behaviour: "}).evaluate(layerIcons)).toBe(1);
    expect(errors).toEqual([]);
});
