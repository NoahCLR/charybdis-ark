// @ts-check
"use strict";
const {test, expect} = require("@playwright/test");
const {openControls, clearPosts, posted, expectPost, change, publishAccepted} = require("./control-preview");

const body = page => page.locator("#benchBody");
const channel = (page, index) => body(page).locator(`[data-channel="${index}"]`);
const stages = [
    {id: "layers", offTip: /paints nothing/, bit: 1, path: ["rgb", "layerColors", 1, "color"], colour: [85, 255, 200],
        message: colour => ({type: "updateLayerColor", layer: "Layer 1", mode: "KEYS_MAPPED_ON_THIS_LAYER_ONLY", ...colour})},
    {id: "auto", offTip: /ends on black/, bit: 2, path: ["rgb", "automouseFade", "end_color"], colour: [167, 255, 199],
        message: colour => ({type: "updateAutomouseFade", mode: "END_COLOR_ON_ALL_KEYS", ...colour})},
    {id: "pd", offTip: /locality black.*Stage on/, bit: 4, path: ["rgb", "pdModeColors", 0, "color"], colour: [21, 255, 200],
        message: colour => ({type: "updatePdModeColor", pointingMode: "POINTING_MODE_DRAGSCROLL", locality: "RGB_RIGHT_HALF", ...colour})},
    {id: "combo", offTip: /locality black.*Stage on/, bit: 8, path: ["rgb", "comboFeedback", "color"], colour: [191, 255, 200],
        message: colour => ({type: "updateComboFeedback", locality: "RGB_KEY_HALF", ...colour})},
    {id: "key", offTip: /flashes black.*Stage on/, bit: 16, path: ["rgb", "keyBehaviorFeedback", "holdActiveColor"], colour: [18, 255, 200],
        message: colour => ({type: "updateKeyBehaviorFeedback", config: expect.objectContaining({holdActiveColor: colour,
            tapCommitMode: "KEY_FEEDBACK_TAP_COMMIT_NON_BASE_TAPS", locality: "RGB_KEY_HALF"})})},
];

async function openStage(page, stage, theme = "dark") {
    await openControls(page, "lighting", {stage, layer: 1, pointingSlot: 0, feedbackRow: "holdActiveColor"}, theme);
    if (stage === "auto") {
        await page.evaluate(async () => {
            const store = await import("/webview/store.mjs");
            const model = structuredClone(store.getModel());
            model.rgb.automouseFade.mode = "END_COLOR_ON_ALL_KEYS";
            store.setModel(model); store.render();
        });
    }
}

for (const stage of stages) {
    test(`${stage.id}: each HSV channel posts, survives an accepted model, and can turn off/on`, async ({page}) => {
        await openStage(page, stage.id);
        const colour = Object.fromEntries(["h", "s", "v"].map((key, index) => [key, stage.colour[index]]));
        for (const [index, key] of ["h", "s", "v"].entries()) {
            await clearPosts(page);
            const field = channel(page, index);
            await change(field, 71 + index);
            colour[key] = 71 + index;
            await expectPost(page, stage.message({...colour}));
            await field.focus();
            const original = await field.elementHandle();
            await publishAccepted(page, stage.path, Object.fromEntries(Object.entries(colour).map(([key, value]) => [key, String(value)])));
            expect(await original.evaluate(node => node.isConnected)).toBe(false);
            await expect(field).toBeFocused();
            await expect(field).toHaveValue(String(71 + index));
        }
        await clearPosts(page);
        await expect(body(page).locator("[data-off]")).toHaveAttribute("data-tip", stage.offTip);
        await body(page).locator("[data-off]").click();
        await expectPost(page, stage.message({h: 0, s: 0, v: 0}));
        await publishAccepted(page, stage.path, {h: "0", s: "0", v: "0"});
        await expect(body(page).locator("[data-channel]")).toHaveCount(0);
        await clearPosts(page);
        await body(page).getByRole("button", {name: "Give it a colour", exact: true}).click();
        await expectPost(page, stage.message({h: 140, s: 255, v: 200}));
    });

    test(`${stage.id}: the stage switch posts its own bit without changing other stages`, async ({page}) => {
        await openStage(page, stage.id);
        await page.locator("#benchRight label.sw").click();
        await expectPost(page, {type: "updateRgbStages", stageEnableMask: 31 & ~stage.bit});
    });
}

for (const theme of ["dark", "light"]) {
    test(`colour field focus survives the shell's cascade (${theme})`, async ({page}) => {
        await openStage(page, "layers", theme);
        await change(channel(page, 0), 77);
        await expectPost(page, stages[0].message({h: 77, s: 255, v: 200}));
        await channel(page, 0).focus();
        await publishAccepted(page, stages[0].path, {h: "77", s: "255", v: "200"});
        await expect(channel(page, 0)).toBeFocused();
        await expect(channel(page, 0)).toHaveValue("77");
    });
}

test("the layer colour note describes only the paint modes it offers", async ({page}) => {
    await openStage(page, "layers");
    const where = body(page).locator("section", {has: page.locator('[data-f="lighting:layer:1:mode:ALL_KEYS"]')});
    const offered = await where.locator(".seg label").allInnerTexts();
    expect(offered).toEqual(["Keys mapped on this layer only", "All keys"]);
    const note = where.locator("p.note");
    for (const mode of offered) await expect(note).toContainText(mode);
    await expect(note).not.toContainText(/pass-through/i);
});

test("all Lighting policy selects post the chosen policy and retained colour", async ({page}) => {
    for (const [stage, label, value, message] of [
        ["layers", "Which keys light up", "ALL_KEYS", {type: "updateLayerColor", layer: "Layer 1", mode: "ALL_KEYS", h: 85, s: 255, v: 200}],
        ["auto", "Fade mode", "END_COLOR_WHERE_BASE_EFFECT_WOULD_SHOW", {type: "updateAutomouseFade", mode: "END_COLOR_WHERE_BASE_EFFECT_WOULD_SHOW", h: 167, s: 255, v: 199}],
        ["pd", "Locality", "RGB_LEFT_HALF", {type: "updatePdModeColor", pointingMode: "POINTING_MODE_DRAGSCROLL", locality: "RGB_LEFT_HALF", h: 21, s: 255, v: 200}],
        ["combo", "Locality", "RGB_BOTH_HALVES", {type: "updateComboFeedback", locality: "RGB_BOTH_HALVES", h: 191, s: 255, v: 200}],
        ["key", "Tap branch commit", "KEY_FEEDBACK_TAP_COMMIT_OFF", {type: "updateKeyBehaviorFeedback", config: expect.objectContaining({tapCommitMode: "KEY_FEEDBACK_TAP_COMMIT_OFF", holdActiveColor: {h: 18, s: 255, v: 200}})}],
        ["key", "Locality", "RGB_LEFT_HALF", {type: "updateKeyBehaviorFeedback", config: expect.objectContaining({locality: "RGB_LEFT_HALF", holdActiveColor: {h: 18, s: 255, v: 200}})}],
    ]) {
        await openStage(page, stage);
        // A few short choices are on show; a longer list is a menu.
        const onShow = body(page).locator(`.seg[aria-label="${label}"]`);
        if (await onShow.count()) await onShow.locator("label").filter({has: page.locator(`input[value="${value}"]`)}).click();
        else await body(page).locator("label.field").filter({has: page.getByText(label, {exact: true})}).locator("select").selectOption(value);
        await expectPost(page, message);
    }
});

test("key feedback names each colour once, in its list, grouped as the behaviour grid is", async ({page}) => {
    await openStage(page, "key");
    // Tiers, then the tap branches, in the Keymap's grouped table, each group
    // under its band, and named nowhere else on the tab.
    const list = body(page).locator('[data-scroll-list="lighting-feedback"]');
    await expect(list.locator(".group-h .ttl")).toHaveText(["Tiers", "Tap branches"]);
    const grouped = await list.evaluate(node => [...node.querySelectorAll(".group-h .ttl, tr[data-row]")]
        .map(each => each.matches(".ttl") ? `# ${each.textContent}` : each.getAttribute("data-row")));
    expect(grouped).toEqual(["# Tiers", "tapCommittedColor", "holdActiveColor", "longHoldActiveColor",
        "# Tap branches", "branch:0", "branch:1", "branch:2", "branch:3"]);
    // A band folds its group, as the Keymap's do.
    await list.locator('.group-h[data-group="branches"]').click();
    await expect(list.locator("tr[data-row]")).toHaveCount(3);
    await list.locator('.group-h[data-group="branches"]').click();
    await expect(body(page).locator(".chip")).toHaveCount(0);
    await expect(body(page).locator(".stage-about")).toContainText("behaviour dots");
    const commit = body(page).locator('.seg[aria-label="Tap branch commit"] label');
    await expect(commit).toHaveText(["Off", "Double taps and more"]);
});

test("every key feedback colour row posts its own field, preserving all the other colours", async ({page}) => {
    await openStage(page, "key");
    const rows = ["tapCommittedColor", "holdActiveColor", "longHoldActiveColor", "branch:0", "branch:1", "branch:2", "branch:3"];
    for (const row of rows) {
        await body(page).locator(`[data-row="${row}"]`).click();
        await clearPosts(page);
        const before = await page.evaluate(async () => (await import("/webview/store.mjs")).getModel().rgb.keyBehaviorFeedback);
        const expected = {tapCommitMode: before.tapCommitMode, locality: before.locality};
        for (const key of rows.slice(0, 3)) expected[key] = Object.fromEntries(Object.entries(before[key]).map(([channel, value]) => [channel, Number(value)]));
        expected.tapBranchColors = before.tapBranchColors.map(colour => Object.fromEntries(Object.entries(colour).map(([channel, value]) => [channel, Number(value)])));
        await change(channel(page, 0), 77);
        if (row.startsWith("branch:")) expected.tapBranchColors[Number(row.slice(7))].h = 77;
        else expected[row].h = 77;
        await expectPost(page, {type: "updateKeyBehaviorFeedback", config: expected});
    }
});

test("auto-mouse hold slider stages the complete timing section and preserves focus on acceptance", async ({page}) => {
    await openStage(page, "auto");
    const range = body(page).locator('[data-macro="mouseFadeHold"]');
    await range.focus();
    await range.evaluate(input => {input.value = "77";});
    await range.dispatchEvent("input");
    await expect(body(page).locator("[data-readout]")).toHaveText("77%");
    expect(await posted(page)).toEqual([]);
    await range.dispatchEvent("change");
    await expectPost(page, {type: "updateConfigDefaults", sectionId: "automouseFade", fields: [{macro: "mouseFadeHold", value: "77"}]});
    const index = await page.evaluate(async () => (await import("/webview/store.mjs")).getModel().configDefaults.findIndex(section => section.id === "automouseFade"));
    await publishAccepted(page, ["configDefaults", index, "fields", 0, "value"], "77");
    await expect(range).toBeFocused();
    await expect(range).toHaveValue("77");
});

test("hue and saturation/brightness dragging preview locally and commit once on release", async ({page}) => {
    await openStage(page, "combo");
    for (const [selector, fraction, expected] of [
        [".hue-ramp", {x: 0.25, y: 0.5}, {h: 64, s: 255, v: 200}],
        [".sv-field", {x: 0.5, y: 0.25}, {h: 64, s: 128, v: 191}],
    ]) {
        await clearPosts(page);
        const surface = body(page).locator(selector);
        await surface.scrollIntoViewIfNeeded();
        const box = await surface.boundingBox();
        await page.mouse.move(box.x + box.width * fraction.x, box.y + box.height * fraction.y);
        await page.mouse.down();
        expect(await posted(page)).toEqual([]);
        await page.mouse.up();
        await expectPost(page, {type: "updateComboFeedback", locality: "RGB_KEY_HALF", ...expected});
        await publishAccepted(page, ["rgb", "comboFeedback", "color"], Object.fromEntries(Object.entries(expected).map(([key, value]) => [key, String(value)])));
    }
});

test("an accent is added from LEDs picked on the board, posting nothing until it is kept", async ({page}) => {
    await openStage(page, "layers");
    const section = body(page).locator('[data-accents="layer"]');
    await expect(section.locator("h4")).toHaveText(/^Accents · /);
    // Every key is numbered by its LED, and the trackball too.
    await expect(page.locator('.board [data-led="0"] .kc-led')).toHaveText("0");
    await expect(page.locator('.board .kc-ball .kc-led')).toHaveText("56");
    await section.getByRole("button", {name: "Add accent", exact: true}).click();
    const editor = section.locator(".accent-editor");
    await expect(editor.locator('[data-act="keep"]')).toBeDisabled();
    await expect(page.locator('.board [data-led="0"]')).toHaveAttribute("aria-pressed", "false");
    // A press picks an LED and a drag across keys picks each it crosses.
    const box = async (led) => {
        await page.locator(`.board [data-led="${led}"]`).first().scrollIntoViewIfNeeded();
        const rect = await page.locator(`.board [data-led="${led}"]`).first().boundingBox();
        if (!rect) throw new Error(`LED ${led} is not drawn`);
        return {x: rect.x + rect.width / 2, y: rect.y + rect.height / 2};
    };
    const [from, to] = [await box(0), await box(1)];
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, {steps: 6});
    await page.mouse.up();
    await expect(page.locator('.board [data-led="0"]')).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator('.board [data-led="1"]')).toHaveAttribute("aria-pressed", "true");
    await page.locator(".board .kc-ball").click();
    await expect(editor).toContainText("3 LEDs picked");
    await expect(page.locator(".board-foot-text")).toContainText("3 picked");
    for (const [index, value] of [77, 78, 79].entries()) await change(editor.locator(`[data-channel="${index}"]`), value);
    expect(await posted(page)).toEqual([]);
    await editor.locator('[data-act="keep"]').click();
    await expectPost(page, {type: "addRgbLedGroup", group: {target: "layer", owner: "Layer 1", ledIndices: [0, 1, 56], h: 77, s: 78, v: 79}});
    await expect(section.locator(".accent-editor")).toHaveCount(0);

    // For every layer, in the layer's own colour.
    await clearPosts(page);
    await section.getByRole("button", {name: "Add accent", exact: true}).click();
    await page.locator('.board [data-led="5"]').click();
    await section.locator(".accent-editor").getByText("Every layer", {exact: true}).click();
    await section.locator(".accent-editor").getByText("Same as the layer", {exact: true}).click();
    await expect(section.locator('.accent-editor [data-channel]')).toHaveCount(0);
    await section.locator('.accent-editor [data-act="keep"]').click();
    await expectPost(page, {type: "addRgbLedGroup", group: {target: "layer", owner: "RGB_LAYER_GROUP_ALL", ledIndices: [5], h: 0, s: 0, v: 0}});

    // Cancel posts nothing.
    await clearPosts(page);
    await section.getByRole("button", {name: "Add accent", exact: true}).click();
    await page.locator('.board [data-led="7"]').click();
    await section.locator('.accent-editor [data-act="cancel"]').click();
    await expect(page.locator('.board [data-led="7"]')).not.toHaveAttribute("aria-pressed", "true");
    expect(await posted(page)).toEqual([]);
});

test("an accent being added lights for the layer the board shows, and one being changed is dropped where it is not listed", async ({page}) => {
    await openStage(page, "layers");
    const section = () => body(page).locator('[data-accents="layer"]');
    await section().getByRole("button", {name: "Add accent", exact: true}).click();
    await page.locator('.board [data-led="5"]').click();
    // Picking another layer carries the new accent to it, as the list it sits in says.
    await page.locator("#layer-tab-2").click();
    await expect(section().locator("h4")).toHaveText(/^Accents · /);
    await clearPosts(page);
    await section().locator('.accent-editor [data-act="keep"]').click();
    await expectPost(page, {type: "addRgbLedGroup", group: expect.objectContaining({target: "layer", owner: "Layer 2", ledIndices: [5]})});

    // Layer 1's own accent, being changed, is no row of Layer 2's list.
    await page.evaluate(async () => {
        const store = await import("/webview/store.mjs");
        const model = structuredClone(store.getModel());
        model.rgb.layerAccents = [{index: 0, owner: "Layer 1", ownerLayer: 1, color: {h: "10", s: "255", v: "200"}, ledIndices: [9], leds: "LED 9"}];
        store.state.layer = 1;
        store.setModel(model); store.render();
    });
    await section().locator('.accent-row [data-act="change"]').click();
    await expect(section().locator(".accent-editor")).toHaveCount(1);
    await page.locator("#layer-tab-2").click();
    await expect(section().locator(".accent-editor"), "the editor goes with the row it changes").toHaveCount(0);
    await expect(page.locator(".board-foot b")).toHaveText("Preview");
    await clearPosts(page);
    expect(await posted(page)).toEqual([]);
});

test("in a narrow window a stage's list stacks over its editor, and nothing runs past the workbench", async ({page}) => {
    await page.setViewportSize({width: 800, height: 900});
    await openControls(page, "lighting", {stage: "combo"}, "dark", "shell=demo");
    const list = await body(page).locator(".bench-pane").boundingBox();
    const editor = await body(page).locator(".stage-detail").boundingBox();
    expect(list && editor && list.y + list.height <= editor.y + 1, "the list sits above the editor").toBe(true);
    for (const stage of ["layers", "pd", "combo", "key"]) {
        await page.evaluate(async (next) => { const store = await import("/webview/store.mjs"); store.state.stage = next; store.render(); }, stage);
        const spill = await page.locator(".lighting-bench").evaluate((bench) => {
            const right = bench.getBoundingClientRect().right;
            return [...bench.querySelectorAll(".bench-body *")].filter((node) => node.getBoundingClientRect().right > right + 1).length;
        });
        expect(spill, stage).toBe(0);
    }
});

test("a key's LED number keeps clear of its legends", async ({page}) => {
    await openControls(page, "lighting", {stage: "layers", layer: 0}, "dark", "shell=demo");
    // In the cap's own coordinates, before a thumb key's turn.
    const crossings = await page.locator(".board [data-key]").evaluateAll((keys) => keys.flatMap((key) => {
        const mark = /** @type {SVGGraphicsElement | null} */ (key.querySelector(".kc-led"));
        if (!mark) return [];
        const led = mark.getBBox();
        return [...key.querySelectorAll(".kc-sub, .kc-label")].filter((text) => {
            const box = /** @type {SVGGraphicsElement} */ (text).getBBox();
            return box.width && led.x < box.x + box.width && box.x < led.x + led.width && led.y < box.y + box.height && box.y < led.y + led.height;
        }).map(() => key.getAttribute("aria-label"));
    }));
    expect(crossings).toEqual([]);
});

test("an accent is changed where it stands or removed, on the stage that paints it", async ({page}) => {
    // The fixture's accents light the thumbs for every pointing mode, combo
    // and feedback state, so each shows, and is edited, on every mode's list.
    await openStage(page, "pd");
    const section = body(page).locator('[data-accents="pdMode"]');
    await expect(section.locator("h4")).toHaveText("Accents · Dragscroll");
    const shared = section.locator(".accent-row");
    await expect(shared).toContainText("LEDs 24–28, 53–55");
    await expect(shared.locator(".tag")).toHaveText("Every pointing mode");
    await shared.locator('[data-act="change"]').click();
    for (const led of [24, 25, 26, 27, 28, 53, 54, 55]) await expect(page.locator(`.board [data-led="${led}"]`)).toHaveAttribute("aria-pressed", "true");
    await page.locator('.board [data-led="28"]').click();
    await clearPosts(page);
    await section.locator('.accent-editor [data-act="keep"]').click();
    await expectPost(page, {type: "updateRgbLedGroup", target: "pdMode", index: 0, group: {owner: "RGB_POINTING_MODE_GROUP_ALL", ledIndices: [24, 25, 26, 27, 53, 54, 55], h: 0, s: 0, v: 0}});
    // Narrowed to the mode it is changed on.
    await section.locator('.accent-row [data-act="change"]').click();
    await section.locator(".accent-editor").getByText("Dragscroll", {exact: true}).click();
    await clearPosts(page);
    await section.locator('.accent-editor [data-act="keep"]').click();
    await expectPost(page, {type: "updateRgbLedGroup", target: "pdMode", index: 0, group: {owner: "POINTING_MODE_DRAGSCROLL", ledIndices: [24, 25, 26, 27, 28, 53, 54, 55], h: 0, s: 0, v: 0}});

    for (const [stage, target] of [["combo", "combo"], ["key", "keyBehavior"]]) {
        await openStage(page, stage);
        const accents = body(page).locator(`[data-accents="${target}"]`);
        await clearPosts(page);
        await accents.locator('.accent-row [data-act="remove"]').click();
        await expectPost(page, {type: "deleteRgbLedGroup", target, index: 0});
    }
});

test("All accents lists every accent by stage and owner, and Open shows it on its stage", async ({page}) => {
    await openStage(page, "accents");
    const rows = body(page).locator(".accents-overview .accent-row");
    await expect(rows).toHaveCount(3);
    await expect(body(page)).not.toContainText(/Group|RGB_|KEY_FEEDBACK_|POINTING_MODE_/);
    await expect(rows.nth(0)).toContainText("Every pointing mode");
    await expect(rows.nth(0)).toContainText("LEDs 24–28, 53–55");
    await rows.nth(2).getByRole("button", {name: "Open", exact: true}).click();
    await expect(page.locator('[data-ltab="key"]')).toHaveAttribute("aria-selected", "true");
    await expect(body(page).locator('[data-accents="keyBehavior"] .accent-row .tag')).toHaveText("Every feedback state");
    expect(await posted(page)).toEqual([]);
});

test("Pointing modes and Combo feedback always preview what they picked, and screen links navigate without posting edits", async ({page}) => {
    await openStage(page, "pd");
    await expect(page.locator(".board-foot-text")).toContainText("Dragscroll held, painting right half");
    await expect(body(page).getByText("Preview it active on the board", {exact: true})).toHaveCount(0);
    // An empty slot never runs, so nothing is previewed for it.
    await page.evaluate(async () => {
        const store = await import("/webview/store.mjs");
        store.state.pointingSlot = store.getModel().pdModes.find((slot) => !slot.kind).id;
        store.render();
    });
    await expect(page.locator(".board-foot-text")).not.toContainText("held, painting");
    expect(await posted(page)).toEqual([]);
    // Combo feedback shows a combo held: the first, or the one picked. The
    // demo stores combos, one of which holds a layer.
    await openControls(page, "lighting", {stage: "combo"}, "dark", "shell=demo");
    await clearPosts(page);
    await expect(page.locator(".board-foot-text")).toContainText("C0 held, painting");
    await expect(body(page).locator('tr[data-combo="0"]')).toHaveAttribute("data-picked", "true");
    // Parted by what holding them shows: combo feedback first, then the
    // combos that hold a layer, whose own light shows instead.
    const list = body(page).locator('[data-scroll-list="lighting-combos"]');
    await expect(list.locator(".group-h .ttl")).toHaveText(["Combo feedback", "Hold a layer"]);
    await expect(list.locator('tbody[data-rows="layer"] tr[data-combo="10"]')).toHaveCount(1);
    await expect(list.locator('tbody[data-rows="feedback"] tr[data-combo="10"]')).toHaveCount(0);
    // Only the combos that fire on the layer shown: C3 fires on Base, not on Navigation.
    await expect(body(page).locator('[data-combo="3"]')).toHaveCount(1);
    await body(page).locator('[data-combo="3"]').click();
    await expect(page.locator(".board .kc-reach"), "its keys are ringed, as on the Keymap").toHaveCount(4);
    await body(page).locator('[data-combo="10"]').click();
    await expect(page.locator(".board-foot-text"), "a combo that holds a layer shows no combo light, but that layer on").toContainText("C10 held, holding Function, whose own light shows the hold");
    await expect(page.locator(".board-foot-text")).toContainText("Function");
    // C14 is Backspace + Enter, and Base has a Backspace on each thumb: a
    // ringed key holds it from there instead.
    await body(page).locator('[data-combo="14"]').click();
    await expect(page.locator(".board-foot-text")).toContainText("click a ringed key to hold it from that key");
    const held = () => page.evaluate(async () => {
        const store = await import("/webview/store.mjs");
        const {comboHeld} = await import("/webview/view/combo-held.mjs");
        return comboHeld(store.currentView(), store.state.comboPreview)?.held || [];
    });
    const ringed = await page.locator(".board [data-key]:has(.kc-reach)").evaluateAll((keys) => keys.map((key) => Number(/** @type {HTMLElement} */ (key).dataset.key)));
    const first = await held();
    const other = ringed.find((key) => !first.includes(key));
    expect(other, "a key that can hold it is not holding it").toBeDefined();
    await page.locator(`.board [data-key="${other}"]`).click();
    await expect.poll(held).toContain(other);
    await expect(page.locator(".board .kc-reach")).toHaveCount(ringed.length);
    await page.locator("#layer-tab-3").click();
    await expect(body(page).locator('[data-combo="3"]'), "only the combos on this view are listed").toHaveCount(0);
    await expect(body(page).locator(".group-h .ttl")).toHaveText(["Combo feedback", "Hold a layer"]);
    expect(await posted(page)).toEqual([]);
    await page.locator('[data-ltab="base"]').click();
    // The background effect is edited on its own stage, with the same colour
    // picker every stage has, and nothing posts until a control changes.
    await expect(body(page).locator(".sv-field, .hue-ramp")).toHaveCount(2);
    await expect(body(page).getByRole("button", {name: "Turn off"})).toHaveCount(0);
    expect(await posted(page)).toEqual([]);
    await expect(page.locator('.topbar [data-act="read"]')).toHaveCount(0);
    await page.locator('[data-screen="device"]').click();
    await clearPosts(page);
    await page.locator('.main [data-act="read"]').click();
    await expectPost(page, {type: "refresh"});
});

test("the pointing-mode list folds its empty slots at its end, as the layer list folds its empty layers", async ({page}) => {
    await openStage(page, "pd");
    const list = page.locator('[data-scroll-list="pd"]');
    const slots = await page.evaluate(async () => (await import("/webview/store.mjs")).getModel()?.pdModes?.map((slot) => ({id: slot.id, empty: !slot.kind})) || []);
    const empty = slots.filter((slot) => slot.empty && slot.id !== 0).map((slot) => slot.id);
    expect(empty.length, "the preview has empty slots to fold").toBeGreaterThan(0);
    const toggle = list.locator('.group-h[data-group="empty"]');
    await expect(toggle.locator(".ttl")).toHaveText("Empty slots");
    await expect(toggle.locator(".n")).toHaveText(String(empty.length));
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(list.locator("tr[data-slot]")).toHaveCount(slots.length - empty.length);
    await expect(list.locator("tbody").last().locator(".group-h"), "the band ends the list").toHaveAttribute("data-group", "empty");

    // Opened, the empty slots follow it in slot order, so nothing shown moves;
    // one picked stays shown once they fold again. Folding posts nothing.
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    const after = await list.evaluate((node) => [...node.querySelectorAll('tbody[data-rows="empty"] tr[data-slot]')].map((row) => Number(/** @type {HTMLElement} */ (row).dataset.slot)));
    expect(after).toEqual(empty);
    const picked = list.locator(`tr[data-slot="${empty[0]}"]`);
    await picked.click();
    await expect(picked).toHaveAttribute("data-picked", "true");
    await toggle.click();
    await expect(list.locator("tr[data-slot]")).toHaveCount(slots.length - empty.length + 1);
    await expect(list.locator(`tr[data-slot="${empty[0]}"]`)).toHaveAttribute("data-picked", "true");
    await expect(toggle.locator(".n")).toHaveText(String(empty.length - 1));
    expect(await posted(page)).toEqual([]);
});

test("the layer and pointing-mode lists scroll on their own and keep their place", async ({page}) => {
    await openStage(page, "layers");
    const list = page.locator('[data-scroll-list="layers"]');
    const content = page.locator(".content");
    // Every layer listed, the empty ones shown too, is too many for its pane.
    await list.locator('.group-h[data-group="empty"]').click();
    await expect.poll(() => list.evaluate(node => node.scrollHeight > node.clientHeight)).toBe(true);
    const layer = list.locator('tr[data-layer="12"]');
    await layer.scrollIntoViewIfNeeded();
    const position = await list.evaluate(node => node.scrollTop);
    expect(position, "the list scrolls inside its card").toBeGreaterThan(0);
    const page_ = await content.evaluate(node => node.scrollTop);
    await layer.click();
    await expect(layer).toHaveAttribute("data-picked", "true");
    await expect.poll(() => list.evaluate(node => node.scrollTop), {message: "a click redraws without losing the list's place"}).toBe(position);
    expect(await content.evaluate(node => node.scrollTop)).toBe(page_);

    // Each list keeps its own place: the pointing list starts at its top, and
    // coming back shows the picked layer again.
    await page.locator('[data-ltab="pd"]').click();
    const pointing = page.locator('[data-scroll-list="pd"]');
    await expect.poll(() => pointing.evaluate(node => node.scrollTop)).toBe(0);
    await page.locator('[data-ltab="layers"]').click();
    const shown = () => page.locator('[data-scroll-list="layers"]').evaluate(node => {
        const bounds = node.getBoundingClientRect(), row = /** @type {Element} */ (node.querySelector("tr[data-picked]")).getBoundingClientRect();
        return row.top >= bounds.top && row.bottom <= bounds.bottom;
    });
    await expect.poll(shown, {message: "the picked layer is shown inside the list"}).toBe(true);
    expect(await posted(page)).toEqual([]);
});

test("every stage's list is as tall as the others, filling the workbench beside its editor", async ({page}) => {
    await openStage(page, "layers", "dark");
    /** @type {Record<string, {pane: number, body: number}>} */
    const heights = {};
    for (const stage of ["layers", "pd", "combo", "key"]) {
        await page.locator(`[data-ltab="${stage}"]`).click();
        heights[stage] = await page.evaluate(() => {
            const height = (/** @type {string} */ selector) => Math.round(document.querySelector(selector)?.getBoundingClientRect().height || 0);
            return {pane: height(".workbench .bench-pane"), body: height("#benchBody")};
        });
    }
    // The tallest stage sets the height for all of them, from the first one
    // shown, as the Keymap's Behaviours tab sets its workbench's.
    expect(new Set(Object.values(heights).map((each) => each.pane)).size, JSON.stringify(heights)).toBe(1);
    for (const each of Object.values(heights)) expect(each.pane, "the list fills the body, with no gap under it").toBeGreaterThan(each.body - 60);
    expect(await posted(page)).toEqual([]);
});

test("every stage says what it does, in one section under the same heading", async ({page}) => {
    await openStage(page, "base");
    for (const stage of ["base", "layers", "auto", "pd", "combo", "key"]) {
        await page.locator(`[data-ltab="${stage}"]`).click();
        const about = body(page).locator("section").filter({has: page.locator("h4", {hasText: /^What this stage does$/})});
        await expect(about, stage).toHaveCount(1);
        await expect(about.locator(".stage-about"), stage).not.toBeEmpty();
    }
    expect(await posted(page)).toEqual([]);
});
