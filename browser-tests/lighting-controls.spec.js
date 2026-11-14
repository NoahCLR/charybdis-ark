// @ts-check
"use strict";
const {test, expect} = require("@playwright/test");
const {openControls, clearPosts, posted, expectPost, change, publishAccepted} = require("./control-preview");

const body = page => page.locator("#benchBody");
const channel = (page, index) => body(page).locator(`[data-channel="${index}"]`);
// A colour's state, one choice beside its value (D-L94): Colour, Off, Passthrough.
const colourState = (page, value) => body(page).locator(`.colour-state label:has(input[value="${value}"])`);
// The stage bar's switch, at its end on every stage (D-L95).
const stageSwitch = page => page.locator(".bench-body .stage-bar label.sw");
const stages = [
    {id: "layers", offTip: /paints nothing/, owned: true, offWord: "Passthrough", bit: 1, path: ["rgb", "layerColors", 1, "color"], colour: [85, 255, 200],
        message: colour => ({type: "updateLayerColor", layer: "Layer 1", mode: "KEYS_MAPPED_ON_THIS_LAYER_ONLY", ...colour})},
    {id: "auto", offTip: /ends with the LEDs off/, bit: 2, path: ["rgb", "automouseFade", "end_color"], colour: [167, 255, 199],
        message: colour => ({type: "updateAutomouseFade", mode: "END_COLOR_ON_ALL_KEYS", ...colour})},
    {id: "pd", offTip: /paints nothing/, owned: true, offWord: "Passthrough", bit: 4, path: ["rgb", "pdModeColors", 0, "color"], colour: [21, 255, 200],
        message: colour => ({type: "updatePdModeColor", pointingMode: "POINTING_MODE_DRAGSCROLL", locality: "RGB_RIGHT_HALF", ...colour})},
    {id: "combo", offTip: /paints nothing/, owned: true, offWord: "Passthrough", bit: 8, path: ["rgb", "comboFeedback", "color"], colour: [191, 255, 200],
        message: colour => ({type: "updateComboFeedback", locality: "RGB_KEY_HALF", ...colour})},
    {id: "key", offTip: /paints nothing/, owned: true, offWord: "Passthrough", bit: 16, path: ["rgb", "keyBehaviorFeedback", "holdActiveColor"], colour: [18, 255, 200],
        message: colour => ({type: "updateKeyBehaviorFeedback", config: expect.objectContaining({holdActiveColor: colour,
            tapCommitMode: "KEY_FEEDBACK_TAP_COMMIT_NON_BASE_TAPS", holdActiveLocality: "RGB_KEY_HALF"})})},
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
    test(`${stage.id}: each HSV channel posts, survives an accepted model, and can be made passthrough or off and given a colour again`, async ({page}) => {
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
        // Off (D-L94): brightness 0, the hue and saturation kept, its LEDs dark; the fade end has no passthrough, as 0, 0, 0 is off there.
        await clearPosts(page);
        if (stage.owned) {
            await colourState(page, "off").click();
            await expectPost(page, stage.message({...colour, v: 0}));
        } else await expect(colourState(page, "passthrough")).toHaveCount(0);
        await clearPosts(page);
        const nothing = stage.owned ? "passthrough" : "off";
        await expect(colourState(page, nothing)).toHaveAttribute("data-tip", stage.offTip);
        await expect(colourState(page, nothing)).toHaveText(stage.offWord || "Off");
        await colourState(page, nothing).click();
        await expectPost(page, stage.message({h: 0, s: 0, v: 0}));
        await publishAccepted(page, stage.path, {h: "0", s: "0", v: "0"});
        // The editor keeps its size: the square and fields stay, dimmed and inert, under what it means.
        await expect(body(page).locator("[data-channel]")).toHaveCount(3);
        await expect(body(page).locator("[data-channel]:enabled")).toHaveCount(0);
        await expect(body(page).locator(".colour-body[data-idle] .colour-idle")).toBeVisible();
        await expect(body(page).locator(".colour-head .note")).toHaveText(stage.offWord || "Off");
        await clearPosts(page);
        await colourState(page, "colour").click();
        await expectPost(page, stage.message({h: 140, s: 255, v: 200}));
        if (stage.owned) {
            // From passthrough, Off stores value 0 with saturation.
            await clearPosts(page);
            await colourState(page, "off").click();
            await expectPost(page, stage.message({h: 0, s: 255, v: 0}));
            // From Off, Colour brings back the hue and saturation it kept.
            await publishAccepted(page, stage.path, {h: "30", s: "180", v: "0"});
            await clearPosts(page);
            await colourState(page, "colour").click();
            await expectPost(page, stage.message({h: 30, s: 180, v: 200}));
        }
    });

    test(`${stage.id}: the stage switch posts its own bit without changing other stages`, async ({page}) => {
        await openStage(page, stage.id);
        await expect(stageSwitch(page)).toHaveCount(1);
        await stageSwitch(page).click();
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

test("the layer's Where it paints explains only the paint modes it offers, on its info mark", async ({page}) => {
    await openStage(page, "layers");
    const where = body(page).locator("section", {has: page.locator('[data-f="lighting:layer:1:mode:ALL_KEYS"]')});
    const offered = await where.locator(".seg label").allInnerTexts();
    expect(offered).toEqual(["Keys mapped on this layer only", "All LEDs"]);
    const terms = where.locator(".sect-h .info-pop dt");
    for (const mode of offered) await expect(terms.filter({hasText: mode})).toHaveCount(1);
    await expect(where.locator(".info-pop")).not.toContainText(/pass-through/i);
    await expect(where.locator("p.note"), "what each mode means is read once, not printed under it").toHaveCount(0);
});

test("all Lighting policy selects post the chosen policy and retained colour", async ({page}) => {
    for (const [stage, label, value, message] of [
        ["layers", "Which LEDs light up", "ALL_KEYS", {type: "updateLayerColor", layer: "Layer 1", mode: "ALL_KEYS", h: 85, s: 255, v: 200}],
        ["auto", "Fade mode", "END_COLOR_WHERE_BASE_EFFECT_WOULD_SHOW", {type: "updateAutomouseFade", mode: "END_COLOR_WHERE_BASE_EFFECT_WOULD_SHOW", h: 167, s: 255, v: 199}],
        ["pd", "Locality", "RGB_LEFT_HALF", {type: "updatePdModeColor", pointingMode: "POINTING_MODE_DRAGSCROLL", locality: "RGB_LEFT_HALF", h: 21, s: 255, v: 200}],
        ["combo", "Locality", "RGB_BOTH_HALVES", {type: "updateComboFeedback", locality: "RGB_BOTH_HALVES", h: 191, s: 255, v: 200}],
        ["key", "Tap branch commit", "KEY_FEEDBACK_TAP_COMMIT_OFF", {type: "updateKeyBehaviorFeedback", config: expect.objectContaining({tapCommitMode: "KEY_FEEDBACK_TAP_COMMIT_OFF", holdActiveColor: {h: 18, s: 255, v: 200}})}],
        ["key", "Locality", "RGB_LEFT_HALF", {type: "updateKeyBehaviorFeedback", config: expect.objectContaining({holdActiveLocality: "RGB_LEFT_HALF", holdActiveColor: {h: 18, s: 255, v: 200}})}],
    ]) {
        await openStage(page, stage);
        // A few short choices are on show; a longer list is a menu.
        const onShow = body(page).locator(`.seg[aria-label="${label}"]`);
        if (await onShow.count()) await onShow.locator("label").filter({has: page.locator(`input[value="${value}"]`)}).click();
        else await body(page).locator("label.field").filter({has: page.getByText(label, {exact: true})}).locator("select").selectOption(value);
        await expectPost(page, message);
    }
});

test("behaviour feedback names each colour once, in its list, grouped as the behaviour grid is", async ({page}) => {
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
    await expect(body(page).locator(".stage-bar .info-pop")).toContainText("behaviour dots");
    // When it flashes is every case's: it sits on the stage bar, said so.
    const commit = body(page).locator('.stage-bar .seg[aria-label="Tap branch commit"] label');
    await expect(commit).toHaveText(["Off", "Double taps and more"]);
    await expect(body(page).locator(".stage-bar .stage-bar-scope")).toHaveText("Every behaviour state");
});

test("every behaviour feedback colour row posts its own field, preserving all the other colours", async ({page}) => {
    await openStage(page, "key");
    const rows = ["tapCommittedColor", "holdActiveColor", "longHoldActiveColor", "branch:0", "branch:1", "branch:2", "branch:3"];
    for (const row of rows) {
        await body(page).locator(`[data-row="${row}"]`).click();
        await clearPosts(page);
        const before = await page.evaluate(async () => (await import("/webview/store.mjs")).getModel().rgb.keyBehaviorFeedback);
        const number = colour => Object.fromEntries(Object.entries(colour).map(([channel, value]) => [channel, Number(value)]));
        const expected = {...before, tapBranches: before.tapBranches.map(branch => ({color: number(branch.color), locality: branch.locality}))};
        for (const key of rows.slice(0, 3)) expected[key] = number(before[key]);
        await change(channel(page, 0), 77);
        if (row.startsWith("branch:")) expected.tapBranches[Number(row.slice(7))].color.h = 77;
        else expected[row].h = 77;
        await expectPost(page, {type: "updateKeyBehaviorFeedback", config: expected});
    }
});

// Each case has its own locality (D-L93): picking a case and changing it
// posts the record with that case's locality alone changed.
test("every behaviour feedback case's Locality posts that case's locality alone, and the list says where each paints", async ({page}) => {
    await openStage(page, "key");
    const rows = ["tapCommittedColor", "holdActiveColor", "longHoldActiveColor", "branch:0", "branch:1", "branch:2", "branch:3"];
    const choices = ["RGB_BOTH_HALVES", "RGB_LEFT_HALF", "RGB_RIGHT_HALF", "RGB_KEYS_ONLY", "RGB_BOTH_HALVES", "RGB_LEFT_HALF", "RGB_KEYS_ONLY"];
    await expect(body(page).locator(".stage-detail > section:not(.accents) > .sect-h h4")).toHaveText(["Colour", "Where it paints"]);
    for (const [index, row] of rows.entries()) {
        await body(page).locator(`[data-row="${row}"]`).click();
        await clearPosts(page);
        const before = await page.evaluate(async () => (await import("/webview/store.mjs")).getModel().rgb.keyBehaviorFeedback);
        const number = colour => Object.fromEntries(Object.entries(colour).map(([channel, value]) => [channel, Number(value)]));
        const expected = {...before, tapCommittedColor: number(before.tapCommittedColor), holdActiveColor: number(before.holdActiveColor), longHoldActiveColor: number(before.longHoldActiveColor),
            tapBranches: before.tapBranches.map(branch => ({color: number(branch.color), locality: branch.locality}))};
        if (row.startsWith("branch:")) expected.tapBranches[Number(row.slice(7))].locality = choices[index];
        else expected[row.replace(/Color$/, "Locality")] = choices[index];
        await body(page).locator(`[data-f="lighting:key:${row}:locality"]`).selectOption(choices[index]);
        await expectPost(page, {type: "updateKeyBehaviorFeedback", config: expected});
    }
    await publishAccepted(page, ["rgb", "keyBehaviorFeedback", "holdActiveLocality"], "RGB_BOTH_HALVES");
    await expect(body(page).locator('[data-row="holdActiveColor"] td').nth(1)).toHaveText("all LEDs");
    await expect(body(page).locator('[data-row="tapCommittedColor"] td').nth(1)).toHaveText("trigger's half", "the other cases keep theirs");
    // The case picked heads its own settings, saying where it paints whole.
    await body(page).locator('[data-row="holdActiveColor"]').click();
    await expect(body(page).locator(".stage-item")).toContainText("Hold active");
    await expect(body(page).locator(".stage-item .note")).toHaveText("Paints all LEDs");
});

// Each tap branch is its own accent owner (D-L93, firmware D-F73).
test("an accent on one tap branch lights for that branch alone and posts its owner", async ({page}) => {
    await openStage(page, "key");
    await body(page).locator('[data-row="branch:1"]').click();
    const section = body(page).locator('[data-accents="keyBehavior"]');
    // A tap branch is marked by its badge, in the head and its accents' band.
    await expect(body(page).locator(".stage-item-name .bn")).toHaveText("3×");
    await expect(section.locator(".accent-band").first()).toHaveText("For 3×Triple tap");
    await clearPosts(page);
    await section.getByRole("button", {name: "Add accent", exact: true}).click();
    const editor = section.locator(".accent-editor");
    await expect(editor.locator('.seg[aria-label="Lights for"] label')).toHaveText(["Triple tap", "Every tap branch", "Every behaviour state"]);
    await page.locator('.board [data-led="5"]').click();
    for (const [index, value] of [77, 78, 79].entries()) await change(editor.locator(`[data-channel="${index}"]`), value);
    await editor.locator('[data-act="keep"]').click();
    await expectPost(page, {type: "addRgbLedGroup", group: {target: "keyBehavior", owner: "KEY_FEEDBACK_GROUP_TAP_COUNT_3", ledIndices: [5], h: 77, s: 78, v: 79}});
});

// One accent for every tap branch (D-L93, firmware D-F75), in the colour of
// the branch showing or one of its own; a tier offers no such choice.
test("an accent for every tap branch posts its owner, in the branch's colour or its own", async ({page}) => {
    await openStage(page, "key");
    await body(page).locator('[data-row="branch:2"]').click();
    const section = body(page).locator('[data-accents="keyBehavior"]');
    for (const [colourFrom, colour] of [["Same as the feedback colour", {h: 0, s: 0, v: 0}], ["Its own", {h: 77, s: 78, v: 79}]]) {
        await clearPosts(page);
        await section.getByRole("button", {name: "Add accent", exact: true}).click();
        const editor = section.locator(".accent-editor");
        await editor.locator('.seg[aria-label="Lights for"]').getByText("Every tap branch", {exact: true}).click();
        await editor.locator('.seg[aria-label="Colour"]').getByText(colourFrom, {exact: true}).click();
        if (colour.v) for (const [index, value] of [colour.h, colour.s, colour.v].entries()) await change(editor.locator(`[data-channel="${index}"]`), value);
        await page.locator('.board [data-led="6"]').click();
        await editor.locator('[data-act="keep"]').click();
        await expectPost(page, {type: "addRgbLedGroup", group: {target: "keyBehavior", owner: "KEY_FEEDBACK_GROUP_TAP_BRANCH_ANY", ledIndices: [6], ...colour}});
    }
    await body(page).locator('[data-row="holdActiveColor"]').click();
    await section.getByRole("button", {name: "Add accent", exact: true}).click();
    await expect(section.locator('.accent-editor .seg[aria-label="Lights for"] label')).toHaveText(["Hold active", "Every behaviour state"]);
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
    await expect(section.locator(".sect-h h4")).toHaveText("Accents");
    // Every key is numbered by its LED, and the trackball too.
    await expect(page.locator('.board [data-led="0"] .kc-led')).toHaveText("0");
    await expect(page.locator('.board .kc-ball .kc-led')).toHaveText("56");
    // The trackball has no corner: its number sits in its middle.
    const [label, ball] = await Promise.all(['.board .kc-ball .kc-led', '.board .kc-ball circle'].map((selector) => page.locator(selector).first().boundingBox()));
    if (!label || !ball) throw new Error("the trackball and its number are drawn");
    expect(Math.abs(label.x + label.width / 2 - (ball.x + ball.width / 2))).toBeLessThan(1);
    expect(Math.abs(label.y + label.height / 2 - (ball.y + ball.height / 2))).toBeLessThan(1);
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
    // It is kept from under the board, where its LEDs were picked.
    await expect(page.locator('.board-foot [data-act="keep-accent"]')).toBeEnabled();
    await page.locator('.board-foot [data-act="keep-accent"]').click();
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
    await expect(section().locator(".accent-band").first()).toHaveText(/^For /);
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
    for (const stage of ["layers", "pd", "combo", "key", "autocorrect"]) {
        await page.evaluate(async (next) => { const store = await import("/webview/store.mjs"); store.state.stage = next; store.render(); }, stage);
        const spill = await page.locator(".lighting-bench").evaluate((bench) => {
            const right = bench.getBoundingClientRect().right;
            return [...bench.querySelectorAll(".bench-body *")].filter((node) => node.getBoundingClientRect().right > right + 1).length;
        });
        expect(spill, stage).toBe(0);
    }
});

test("a key's legends are the same on Lighting as on the Keymap: its LED number moves none of them", async ({page}) => {
    // Every legend, line and hold, by its key: its text, size, place and condensing.
    const legends = () => page.locator(".board [data-key]").evaluateAll((keys) => Object.fromEntries(keys.map((key) => [key.getAttribute("data-key"),
        [...key.querySelectorAll(".kc-label tspan, .kc-sub")].map((text) => [text.textContent, text.closest("text")?.getAttribute("font-size"),
            text.getAttribute("y"), text.getAttribute("textLength")].join(" "))])));
    await openControls(page, "keys", {layer: 0}, "dark", "shell=demo");
    const keymap = await legends();
    expect(Object.keys(keymap)).toHaveLength(56);
    await page.locator('[data-screen="lighting"]').click();
    await page.evaluate(async () => { const store = await import("/webview/store.mjs"); Object.assign(store.state, {stage: "layers", layer: 0}); store.render(); });
    await expect(page.locator('.board [data-led="0"] .kc-led')).toHaveText("0");
    expect(await legends()).toEqual(keymap);
});

test("a key opens its hover card on the Keymap and none on Lighting, whose board is about light", async ({page}) => {
    await openControls(page, "keys", {layer: 0}, "dark", "shell=demo");
    await page.locator('.board [data-key="27"]').first().hover();
    await expect(page.locator(".hovercard")).toBeVisible();
    await page.mouse.move(0, 0);
    await page.locator('[data-screen="lighting"]').click();
    await page.locator('.board [data-key="27"]').first().hover();
    // Longer than the card takes to open on the Keymap.
    await page.waitForTimeout(500);
    await expect(page.locator(".hovercard")).toBeHidden();
    await expect(page.locator(".hovercard-side")).toBeHidden();
});

test("the Keymap frosts a transparent key and Lighting draws it solid, as the keyboard lights it", async ({page}) => {
    const caps = (selector) => page.locator(`.board ${selector} .kc-rect`).evaluateAll((rects) => rects.map((rect) => getComputedStyle(rect).filter));
    await openControls(page, "keys", {layer: 1}, "dark", "shell=demo");
    const frosted = await caps(".kc-trns");
    expect(frosted.length).toBeGreaterThan(0);
    expect(frosted.every((filter) => filter.startsWith("blur"))).toBe(true);
    await page.locator('[data-screen="lighting"]').click();
    await page.evaluate(async () => { const store = await import("/webview/store.mjs"); Object.assign(store.state, {stage: "layers", layer: 1}); store.render(); });
    await expect(page.locator('.board [data-led="0"] .kc-led')).toHaveText("0");
    await expect(page.locator(".board .kc-glass, .board .kc-ball.glass, .board .kc-glow-trns")).toHaveCount(0);
    expect(await caps(".kc-trns")).toEqual(frosted.map(() => "none"));
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
    // and behaviour state, so each shows, and is edited, on every mode's list.
    await openStage(page, "pd");
    const section = body(page).locator('[data-accents="pdMode"]');
    // Grouped by who they light for: none of Dragscroll's own, then those for every mode.
    await expect(section.locator(".accent-band")).toHaveText(["For Dragscroll", "For every pointing mode"]);
    const shared = section.locator(".accent-row");
    await expect(shared).toContainText("LEDs 24–28, 53–55");
    await expect(shared.locator('[data-act="remove"]')).toHaveAttribute("data-tip", "Removes it for every pointing mode.");
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
    await expect(body(page).locator('[data-accents="keyBehavior"] [data-band="every"]')).toHaveText("For every behaviour state");
    // It lands on the accent, shown on the board.
    await expect(body(page).locator('[data-accents="keyBehavior"] .accent-row[data-picked]')).toHaveCount(1);
    await expect(page.locator('.board [data-led="24"].led-hover')).toHaveCount(1);
    expect(await posted(page)).toEqual([]);
});

test("A clicked accent keeps its LEDs glowing on the board until it is clicked again", async ({page}) => {
    const glowing = () => page.locator(".board [data-led].led-hover").evaluateAll((groups) =>
        groups.map((group) => Number(/** @type {HTMLElement} */ (group).dataset.led)).sort((a, b) => a - b));
    const leds = [24, 25, 26, 27, 28, 53, 54, 55];
    await openStage(page, "accents");
    const line = body(page).locator(".accents-overview .accent-row").nth(0);
    const name = line.getByRole("button", {name: "Every pointing mode"});
    // Pointing glows them only while pointed at.
    await line.hover();
    expect(await glowing()).toEqual(leds);
    await page.mouse.move(0, 0);
    expect(await glowing()).toEqual([]);
    // A click anywhere on the line keeps them, across a redraw.
    await line.locator(".accent-colours").click();
    await page.mouse.move(0, 0);
    await expect(name).toHaveAttribute("aria-pressed", "true");
    await expect(line).toHaveAttribute("data-picked", "true");
    expect(await glowing()).toEqual(leds);
    await page.evaluate(async () => (await import("/webview/store.mjs")).render());
    expect(await glowing()).toEqual(leds);
    // Enter on the name lets go of it.
    await name.focus();
    await page.keyboard.press("Enter");
    await expect(name).toHaveAttribute("aria-pressed", "false");
    expect(await glowing()).toEqual([]);
    // On a stage's tab an accent is shown the same way, and not while one is changed.
    await openStage(page, "pd");
    const row = body(page).locator('[data-accents="pdMode"] .accent-row').first();
    await row.locator(".accent-leds").click();
    await page.mouse.move(0, 0);
    expect(await glowing()).toEqual(leds);
    await row.getByRole("button", {name: "Change", exact: true}).click();
    expect(await glowing()).toEqual([]);
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
    const layer = list.locator('tr[data-layer="15"]');
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
            return {pane: height(".workbench .bench-pane"), body: height("#benchBody .stage-main")};
        });
    }
    // The tallest stage sets the height for all of them, from the first one
    // shown, as the Keymap's Behaviours tab sets its workbench's.
    expect(new Set(Object.values(heights).map((each) => each.pane)).size, JSON.stringify(heights)).toBe(1);
    // Under the stage bar, the list fills the rest of the body, with no gap under it.
    for (const each of Object.values(heights)) expect(each.pane, "the list fills the body, with no gap under it").toBeGreaterThanOrEqual(each.body - 1);
    expect(await posted(page)).toEqual([]);
});

test("every stage says what it does on its stage bar's info mark, and the bar keeps its place", async ({page}) => {
    await openStage(page, "base");
    /** @type {number[]} */
    const tops = [];
    for (const stage of ["base", "layers", "auto", "pd", "combo", "key", "autocorrect", "accents"]) {
        await page.locator(`[data-ltab="${stage}"]`).click();
        const bar = body(page).locator(".stage-bar");
        await expect(bar, stage).toHaveCount(1);
        await expect(bar.locator(".info-mark .info-h"), stage).toHaveCount(1);
        await expect(body(page).locator("section.stage-fold, details"), stage).toHaveCount(0);
        tops.push(Math.round((await bar.boundingBox())?.y ?? -1));
        // Its switch, where it has one, is always the bar's last item.
        if (stage !== "base" && stage !== "accents") expect(await bar.evaluate((node) => node.lastElementChild?.matches("label.sw")), stage).toBe(true);
    }
    expect(new Set(tops).size, JSON.stringify(tops)).toBe(1);
    expect(await posted(page)).toEqual([]);
});

// The colour editor, Where it paints and the accents start in the same place
// on every stage with a list, and the colour editor in the same column on
// the two without (D-L95).
test("the colour editor and where it paints keep their place from tab to tab", async ({page}) => {
    await page.setViewportSize({width: 1440, height: 900});
    await openControls(page, "lighting", {stage: "layers", layer: 1, pointingSlot: 0}, "dark", "shell=demo");
    /** @type {Record<string, number[]>} */
    const at = {};
    for (const stage of ["base", "layers", "auto", "pd", "combo", "key", "autocorrect"]) {
        await page.locator(`[data-ltab="${stage}"]`).click();
        const box = async (selector) => { const rect = await body(page).locator(selector).first().boundingBox(); return rect ? [Math.round(rect.x), Math.round(rect.y)] : []; };
        at[stage] = [...await box(".stage-detail > section:nth-of-type(1) h4"), ...await box(".stage-detail > section:nth-of-type(2) h4")];
    }
    const listed = ["layers", "pd", "combo", "key", "autocorrect"].map((stage) => at[stage].join());
    expect(new Set(listed).size, JSON.stringify(at)).toBe(1);
    for (const stage of ["base", "auto"]) {
        expect(at[stage][0], `${stage}: the colour in the same column`).toBe(at.layers[0]);
        expect(at[stage][2], `${stage}: where it paints in the same column`).toBe(at.layers[2]);
    }
});

// The workbench's height follows the stages, never what was open a moment
// ago: an accent being added grows it, and cancelling gives the room back.
test("the workbench gives back the room an accent editor took once it closes", async ({page}) => {
    await openStage(page, "pd");
    const height = () => page.locator(".lighting-bench").evaluate((bench) => Math.round(bench.getBoundingClientRect().height));
    const before = await height();
    await body(page).locator('[data-accents="pdMode"]').getByRole("button", {name: "Add accent", exact: true}).click();
    await expect.poll(height).toBeGreaterThan(before);
    await body(page).locator('.accent-editor [data-act="cancel"]').click();
    await expect.poll(height).toBe(before);
    await page.locator('[data-ltab="layers"]').click();
    await expect.poll(height).toBe(before);
});

// Replacement feedback (D-L89), on the demo profile, which carries the
// keyboard's compiled defaults for the stage: on, a colour for each case,
// the half holding the trigger key, and an accent for every case.
const FLASH = {textColor: {h: 106, s: 255, v: 200}, textLocality: "RGB_KEY_HALF", macroColor: {h: 234, s: 255, v: 200}, macroLocality: "RGB_KEY_HALF",
    undoColor: {h: 0, s: 255, v: 200}, undoLocality: "RGB_KEY_HALF", leadingColor: {h: 170, s: 255, v: 200}, leadingLocality: "RGB_KEY_HALF"};
const CASES = [["textColor", "Replaced with text"], ["macroColor", "Replaced by a macro"], ["undoColor", "Replacement undone"], ["leadingColor", "Leader waiting"]];
const openReplacement = (page, state = {}, theme = "dark") =>
    openControls(page, "lighting", {stage: "autocorrect", layer: 0, replacementRow: "textColor", ...state}, theme, "shell=demo");
const flashPost = config => ({type: "updateAutocorrectFeedback", config: {...FLASH, ...config}});

// The strip's widths are set so every stage fits a 1440px window with none
// scrolled out of sight and no name cut short.
test("every stage tab and All accents fit a 1440px window, whichever stage is selected", async ({page}) => {
    await page.setViewportSize({width: 1440, height: 900});
    for (const stage of ["autocorrect", "layers"]) {
        await openControls(page, "lighting", {stage, layer: 0}, "dark", "shell=demo");
        const strip = page.locator(".lighting-bench .bench-tablist");
        await expect(strip.locator('[role="tab"]')).toHaveCount(8);
        expect(await strip.evaluate(list => list.scrollWidth - list.clientWidth), `${stage}: the strip does not scroll`).toBeLessThanOrEqual(0);
        expect(await strip.locator(".tab-label").evaluateAll(labels => labels.filter(label => label.scrollWidth > label.clientWidth).map(label => label.textContent)),
            `${stage}: no name is cut`).toEqual([]);
    }
});

// Narrower, each tab reads by its short word, its stage bar naming it whole,
// so the strip still fits a 1280px window and keeps one line.
test("the stage tabs fit a 1280px window by their short words, and every stage bar keeps one line", async ({page}) => {
    await page.setViewportSize({width: 1280, height: 800});
    await openControls(page, "lighting", {stage: "key", layer: 0}, "dark", "shell=demo");
    const strip = page.locator(".lighting-bench .bench-tablist");
    expect(await strip.evaluate(list => list.scrollWidth - list.clientWidth), "the strip does not scroll").toBeLessThanOrEqual(0);
    await expect(page.locator('[data-ltab="key"] .tab-label .short')).toBeVisible();
    await expect(page.locator('[data-ltab="key"] .tab-label .short')).toHaveText("Behaviours");
    await expect(page.locator('[data-ltab="key"]')).toHaveAttribute("aria-label", "Behaviour feedback");
    for (const stage of ["base", "layers", "auto", "pd", "combo", "key", "autocorrect", "accents"]) {
        await page.locator(`[data-ltab="${stage}"]`).click();
        expect(await body(page).locator(".stage-bar").evaluate((bar) => Math.round(bar.getBoundingClientRect().height)), stage).toBeLessThanOrEqual(42);
    }
});

// A tab wears the colour its stage paints for what it has picked; Behaviour
// feedback's follows the case picked, as the others follow theirs.
test("Behaviour feedback's tab wears the colour of the case picked", async ({page}) => {
    await openStage(page, "key");
    const swatch = () => page.locator('[data-ltab="key"] .swatch').evaluate((node) => getComputedStyle(node).backgroundColor);
    const held = await swatch();
    await body(page).locator('[data-row="branch:0"]').click();
    await expect.poll(swatch).not.toBe(held);
    const colour = await page.evaluate(async () => {
        const store = await import("/webview/store.mjs"), {css} = await import("/webview/lib/colour.mjs");
        const probe = Object.assign(document.createElement("i"), {style: `background:${css(store.getModel().rgb.keyBehaviorFeedback.tapBranches[0].color)}`});
        document.body.append(probe); const shown = getComputedStyle(probe).backgroundColor; probe.remove(); return shown;
    });
    expect(await swatch()).toBe(colour);
});

// The Lighting board lists its shortcuts on its corner, as the Keymap's does,
// with those that work on the tab shown.
test("the Lighting board lists its shortcuts on its corner", async ({page}) => {
    await openStage(page, "layers");
    const mark = page.locator(".board .info-mark.corner");
    await expect(mark).toHaveCount(1);
    await expect(mark.locator("dt")).toHaveText([/-click a layer$/, "LED numbers"]);
    await body(page).locator('[data-accents="layer"]').getByRole("button", {name: "Add accent", exact: true}).click();
    await expect(page.locator(".board .info-mark.corner dt")).toHaveText([/-click a layer$/, "Click, or drag", "LED numbers"]);
});

test("replacement feedback is the seventh stage, lists its four cases once, and says what it does", async ({page}) => {
    await openReplacement(page);
    const tab = page.locator("#stage-tab-autocorrect");
    await expect(tab).toHaveAttribute("aria-selected", "true");
    await expect(tab.locator(".n")).toHaveText("7");
    await expect(tab.locator(".tab-label .long")).toHaveText("Replacement feedback");
    await expect(tab).toHaveAttribute("data-tip", "Replacement feedback · painted 7 of 7");
    const list = body(page).locator('[data-scroll-list="lighting-replacements"]');
    await expect(list.locator(".group-h .ttl")).toHaveText(["Cases"]);
    await expect(list.locator("tr[data-row]")).toHaveText(CASES.map(([, label]) => `${label}trigger's half`), "each with where it paints, in a word or two");
    expect(await list.locator("tr[data-row]").evaluateAll(rows => rows.map(row => row.getAttribute("data-row")))).toEqual(CASES.map(([field]) => field));
    await expect(body(page).locator(".stage-item")).toContainText("Replaced with text");
    await expect(body(page).locator(".stage-bar .info-pop")).toContainText("One flash as text replacement changes what you typed");
    await expect(body(page).locator(".stage-bar .info-pop")).toContainText("a colour held while the leader waits");
    await expect(body(page)).not.toContainText(/autocorrect|typo/i);
    // The words for the trigger key, which here is the key that ended the word.
    const where = body(page).locator("section", {has: page.locator('[data-f="lighting:autocorrect:textColor:locality"]')});
    await expect(where.locator("h4")).toHaveText("Where it paints");
    await expect(where.locator('.field:has([data-f="lighting:autocorrect:textColor:locality"]) .hint')).toHaveText("Trigger key: the key that ended the word, or the Backspace that undid it.");
    // The rest, and every place's meaning, on the section's info mark.
    await expect(where.locator(".sect-h .info-pop")).toContainText("Space, Enter, a punctuation key");
    await expect(where.locator(".sect-h .info-pop")).toContainText("The last two choices paint every key.");
    await expect(where.locator(".sect-h .info-pop")).not.toContainText("paints both halves");
    await expect(body(page).locator("[data-replacement-when]")).toHaveText("Flashes once as an input is replaced with text, and as the Leader key sends text.");
    expect(await where.locator("select option").allInnerTexts()).toEqual(["All LEDs", "Left half", "Right half", "The half holding the trigger key", "Only the trigger key"]);
});

test("every replacement feedback case posts its own colour, preserving the others and the locality", async ({page}) => {
    await openReplacement(page);
    for (const [field] of CASES) {
        await body(page).locator(`[data-row="${field}"]`).click();
        await clearPosts(page);
        await change(channel(page, 0), 77);
        await expectPost(page, flashPost({[field]: {...FLASH[field], h: 77}}));
        // The field keeps its identity and its focus across the accepted model.
        const input = channel(page, 0);
        await expect(input).toHaveAttribute("data-f", `lighting:autocorrect:${field}:colour:0`);
        await input.focus();
        await publishAccepted(page, ["rgb", "autocorrectFeedback", field], {h: "77", s: String(FLASH[field].s), v: String(FLASH[field].v)});
        await expect(input).toBeFocused();
        await expect(input).toHaveValue("77");
        await publishAccepted(page, ["rgb", "autocorrectFeedback", field], Object.fromEntries(Object.entries(FLASH[field]).map(([key, value]) => [key, String(value)])));
    }
});

test("Passthrough makes one replacement case paint nothing, the list and the board say so, Off turns its LEDs dark and Colour brings it back", async ({page}) => {
    await openReplacement(page);
    const where = "trigger's half";
    for (const [field, label] of CASES) {
        await body(page).locator(`[data-row="${field}"]`).click();
        await clearPosts(page);
        const passthrough = colourState(page, "passthrough");
        await expect(passthrough).toHaveText("Passthrough");
        await expect(passthrough).toHaveAttribute("data-tip", /paints nothing.*The other cases still light/);
        await passthrough.click();
        await expectPost(page, flashPost({[field]: {h: 0, s: 0, v: 0}}));
        await publishAccepted(page, ["rgb", "autocorrectFeedback", field], {h: "0", s: "0", v: "0"});
        await expect(body(page).locator("[data-channel]:enabled")).toHaveCount(0);
        await expect(body(page).locator(".colour-head .note")).toHaveText("Passthrough");
        await expect(body(page).locator(".stage-detail .colour-idle")).toContainText("This case is passthrough: it paints nothing");
        await expect(body(page).locator(`[data-row="${field}"]`)).toHaveText(`${label}passthrough`);
        await expect(body(page).locator(`[data-row="${field}"] .mk-swatch`)).toHaveClass(/swatch-off/);
        for (const [other, name] of CASES.filter(([each]) => each !== field)) await expect(body(page).locator(`[data-row="${other}"]`)).toHaveText(`${name}${where}`);
        await expect(page.locator(".board-foot-text")).toContainText(`${label} is passthrough, so it does not ${field === "leadingColor" ? "light" : "flash"}`);
        // A keyboard's colour with no saturation or brightness at another hue is passthrough too.
        await publishAccepted(page, ["rgb", "autocorrectFeedback", field], {h: "40", s: "0", v: "0"});
        await expect(body(page).locator(".colour-head .note")).toHaveText("Passthrough");
        await expect(body(page).locator(`[data-row="${field}"]`)).toHaveText(`${label}passthrough`);
        // Off, from passthrough: brightness 0 with saturation, the hue kept.
        await clearPosts(page);
        await colourState(page, "off").click();
        await expectPost(page, flashPost({[field]: {h: 40, s: 255, v: 0}}));
        // One with brightness alone at zero turns its LEDs off, and says so.
        await publishAccepted(page, ["rgb", "autocorrectFeedback", field], {h: "40", s: "255", v: "0"});
        await expect(body(page).locator(`[data-row="${field}"]`)).toHaveText(`${label}off · ${where}`);
        await expect(body(page).locator(`[data-row="${field}"] .mk-swatch`)).toHaveClass(/swatch-dark/);
        // Off is a colour, black: its hue and saturation stay editable, and the head says what it does.
        await expect(colourState(page, "off").locator("input")).toBeChecked();
        await expect(body(page).locator("[data-channel]:enabled")).toHaveCount(3);
        await expect(body(page).locator(".colour-head")).not.toHaveAttribute("data-tip", /./);
        await publishAccepted(page, ["rgb", "autocorrectFeedback", field], {h: "0", s: "0", v: "0"});
        await clearPosts(page);
        await colourState(page, "colour").click();
        await expectPost(page, flashPost({[field]: {h: 140, s: 255, v: 200}}));
        await publishAccepted(page, ["rgb", "autocorrectFeedback", field], Object.fromEntries(Object.entries(FLASH[field]).map(([key, value]) => [key, String(value)])));
    }
});

test("replacement feedback's stage switch posts its own bit, and each case's locality that case's alone, the colours kept", async ({page}) => {
    await openReplacement(page);
    const mask = await page.evaluate(async () => (await import("/webview/store.mjs")).getModel().rgb.stageEnableMask);
    expect(mask & 32).toBe(32);
    const sw = stageSwitch(page);
    await expect(sw.locator("input")).toHaveAttribute("data-f", "lighting:autocorrect:enabled");
    await expect(sw).toHaveText("Stage on");
    await sw.click();
    await expectPost(page, {type: "updateRgbStages", stageEnableMask: mask & ~32});
    for (const [index, locality] of ["RGB_BOTH_HALVES", "RGB_LEFT_HALF", "RGB_RIGHT_HALF", "RGB_KEYS_ONLY"].entries()) {
        const [field] = CASES[index];
        await body(page).locator(`[data-row="${field}"]`).click();
        await clearPosts(page);
        await body(page).locator(`[data-f="lighting:autocorrect:${field}:locality"]`).selectOption(locality);
        await expectPost(page, flashPost({[field.replace(/Color$/, "Locality")]: locality}));
    }
});

// Each feedback stage's flash has a length of its own, one for every case,
// set on its stage bar (firmware settings scalars 15 and 31).
test("the Flash length field posts its own setting edit and keeps its focus across the accepted model", async ({page}) => {
    await openReplacement(page);
    const where = body(page).locator(".stage-bar", {has: page.locator('[data-f="setting:replacementFlash"]')});
    await expect(where.locator(".stage-bar-scope")).toHaveText("Every case");
    await expect(where.locator('[data-act="flash-interval"]')).toHaveCount(0);
    await expect(where).not.toContainText("flash interval");
    const field = where.locator('.field:has([data-f="setting:replacementFlash"])');
    await expect(field.locator("> span").first()).toHaveText("Flash length");
    await expect(field.locator(".affix i")).toHaveText("ms");
    // What it means is on the stage's info mark alone, never also in a tip.
    await expect(field).not.toHaveAttribute("data-tip", /./);
    await expect(where.locator(".info-pop")).toContainText("How long one flash lasts");
    // Leader waiting lasts as long as the leader waits instead, set on Host settings, a link away.
    await expect(where.locator('[data-act="leader-waits"]')).toHaveText("Leader waits →");
    const input = field.locator("input");
    await expect(input).toHaveValue("200");
    await clearPosts(page);
    await change(input, 350);
    await expectPost(page, {type: "updateConfigDefaults", sectionId: "replacementFeedback", fields: [{macro: "replacementFlash", value: "350"}], expectedFingerprint: expect.any(String)});
    await input.focus();
    const index = await page.evaluate(async () => (await import("/webview/store.mjs")).getModel().configDefaults.findIndex(section => section.id === "replacementFeedback"));
    await publishAccepted(page, ["configDefaults", index, "fields", 0, "value"], "350");
    await expect(input).toBeFocused();
    await expect(input).toHaveValue("350");
    // Emptied, it goes back to what is stored and posts nothing.
    await clearPosts(page);
    await change(input, "");
    await expect(input).toHaveValue("350");
    expect(await posted(page)).toEqual([]);
});

test("Behaviour feedback's Flash interval posts its own setting and no longer speaks for replacement feedback", async ({page}) => {
    await openStage(page, "key");
    const field = body(page).locator('.field:has([data-f="setting:feedbackFlash"])');
    await expect(field).not.toHaveAttribute("data-tip", /./);
    await expect(body(page).locator(".stage-bar .info-pop")).toContainText("a full blink takes twice this");
    await expect(field).not.toContainText(/replacement/i);
    await expect(field).not.toHaveAttribute("data-tip", /replacement/i);
    await clearPosts(page);
    await change(field.locator("input"), 120);
    await expectPost(page, {type: "updateConfigDefaults", sectionId: "lightingFeedback", fields: [{macro: "feedbackFlash", value: "120"}], expectedFingerprint: expect.any(String)});
    // With the tap-commit policy, one setting for every case, on the stage bar.
    await expect(body(page).locator(".stage-bar", {has: page.locator('[data-f="setting:feedbackFlash"]')}).locator(".stage-bar-scope")).toHaveText("Every behaviour state");
});

test("the board flashes the picked replacement case from the key standing in for the one that caused it", async ({page}) => {
    await openReplacement(page);
    const css = colour => page.evaluate(async (hsv) => (await import("/webview/lib/colour.mjs")).css(hsv), colour);
    const fill = key => page.locator(`.board [data-key="${key}"] .kc-rect`).evaluate(rect => getComputedStyle(rect).fill);
    const foot = page.locator(".board-foot-text");
    // The demo's Space is key 49 and its first Backspace key 54, both thumb keys of the left half.
    await expect(foot).toContainText("Replaced with text flashing, painting the half holding the trigger key · Space stands in for the key that ended the word");
    await expect(page.locator('.board [data-key="49"] .kc-ring')).toHaveCount(1);
    await expect(page.locator(".board .kc-ring")).toHaveCount(1);
    expect(await fill(13)).toBe(await css(FLASH.textColor));
    expect(await fill(7)).not.toBe(await css(FLASH.textColor));
    // The accent for every case takes the case's colour on the thumb LEDs of the other half too.
    expect(await page.locator('.board [data-led="53"] .kc-rect').evaluate(rect => getComputedStyle(rect).fill)).toBe(await css(FLASH.textColor));
    await body(page).locator('[data-row="macroColor"]').click();
    await expect(foot).toContainText("Replaced by a macro flashing");
    expect(await fill(13)).toBe(await css(FLASH.macroColor));
    await body(page).locator('[data-row="undoColor"]').click();
    await expect(foot).toContainText("Replacement undone flashing, painting the half holding the trigger key · Backspace stands in for the key that undid it");
    await expect(page.locator('.board [data-key="54"] .kc-ring')).toHaveCount(1);
    expect(await fill(13)).toBe(await css(FLASH.undoColor));
    expect(await fill(7)).not.toBe(await css(FLASH.undoColor));
    // Only the trigger key, with no accent: the standing-in key alone.
    await page.evaluate(async () => {
        const store = await import("/webview/store.mjs");
        const model = structuredClone(store.getModel());
        model.rgb.autocorrectFeedback.undoLocality = "RGB_KEYS_ONLY";
        model.rgb.autocorrectFeedbackAccents = [];
        store.setModel(model); store.render();
    });
    await expect(foot).toContainText("painting only the trigger key");
    expect(await fill(54)).toBe(await css(FLASH.undoColor));
    for (const key of [13, 49, 53]) expect(await fill(key), `key ${key}`).not.toBe(await css(FLASH.undoColor));
    // Off the tab, nothing flashes and no key is ringed.
    await page.locator("#stage-tab-layers").click();
    await expect(page.locator(".board .kc-ring")).toHaveCount(0);
    expect(await fill(54)).not.toBe(await css(FLASH.undoColor));
    expect(await posted(page)).toEqual([]);
});

// Leader waiting (D-L92, firmware D-F72) is held while the leader waits and
// follows the Leader key that began it: with no Leader key in the demo the
// board holds it on every key of the halves its locality names and rings
// none, it takes accents of its own, and with Text replacement off and a
// leader input on the list it still lights.
test("Leader waiting holds from the Leader key, or on every key with none, takes an accent of its own, and still lights with text replacement off", async ({page}) => {
    await openReplacement(page, {replacementRow: "leadingColor"});
    const css = colour => page.evaluate(async (hsv) => (await import("/webview/lib/colour.mjs")).css(hsv), colour);
    const fill = key => page.locator(`.board [data-key="${key}"] .kc-rect`).evaluate(rect => getComputedStyle(rect).fill);
    await expect(body(page).locator(".stage-item")).toContainText("Leader waiting");
    // Under its name, in one line, what Leader waiting is: from the Leader key to the send or the end.
    await expect(body(page).locator("[data-replacement-when]")).toHaveText("Held, not flashed, from the Leader key until the leader sends or gives up.");
    await expect(page.locator(".board-foot-text")).toContainText("Leader waiting held, painting the half holding the trigger key · no Leader key to stand in, so it paints as when the keyboard cannot tell the key");
    await expect(page.locator(".board .kc-ring")).toHaveCount(0);
    // The demo's locality follows the key and it has no Leader key, so it paints both halves.
    for (const key of [7, 13, 49, 54]) expect(await fill(key), `key ${key}`).toBe(await css(FLASH.leadingColor));
    const where = body(page).locator('.field:has([data-f="lighting:autocorrect:leadingColor:locality"]) .hint');
    await expect(where).toHaveText("Trigger key: the Leader key you pressed.");
    await expect(body(page).locator(".stage-bar .info-pop")).toContainText("which holds as long as the leader waits");
    await expect(body(page).locator('[data-act="leader-waits"]')).toHaveAttribute("data-tip", /^Opens Host settings/);
    // An accent for Leader waiting alone.
    const section = body(page).locator('[data-accents="autocorrect"]');
    await expect(section.locator(".accent-band")).toHaveText(["For Leader waiting", "For every case"]);
    await expect(section.locator(".sect-h .info-pop")).toContainText("Those for every case paint first");
    await clearPosts(page);
    await section.getByRole("button", {name: "Add accent", exact: true}).click();
    const editor = section.locator(".accent-editor");
    await page.locator('.board [data-led="5"]').click();
    for (const [index, value] of [77, 78, 79].entries()) await change(editor.locator(`[data-channel="${index}"]`), value);
    await editor.locator('[data-act="keep"]').click();
    await expectPost(page, {type: "addRgbLedGroup", group: {target: "autocorrect", owner: "AUTOCORRECT_FEEDBACK_GROUP_LEADING", ledIndices: [5], h: 77, s: 78, v: 79}});
    // Text replacement off: with no leader input the tab is off; with one,
    // the leader still waits, so the tab is live and the banner says it lights.
    // The stage bar says so in a word and goes to the switch; its tip says the rest.
    const banner = page.locator(".lighting-bench .stage-bar [data-master-off]");
    const switchOff = (leaders) => page.evaluate(async (count) => {
        const store = await import("/webview/store.mjs");
        const model = structuredClone(store.getModel());
        for (const entry of model.configDefaults) for (const field of entry.fields) if (field.macro === "autocorrect") { field.value = "0"; field.enabled = false; }
        model.autocorrect.usage.leaders = count;
        store.setModel(model); store.render();
    }, leaders);
    await switchOff(0);
    await expect(banner).toHaveText("Text replacement is off →");
    await expect(banner).toHaveAttribute("data-tip", /^This stage paints nothing\. Turn it on in /);
    await expect(page.locator('[data-ltab="autocorrect"]')).toHaveClass(/off/);
    await switchOff(1);
    await expect(banner).toHaveAttribute("data-tip", /^Words you finish never flash; Leader waiting still lights, and what the Leader key sends still flashes, in the text or macro colour\./);
    await expect(page.locator('[data-ltab="autocorrect"]')).not.toHaveClass(/off/);
    expect(await fill(13)).toBe(await css(FLASH.leadingColor));
});

test("a replacement feedback accent is added for the picked case or every case, changed and removed", async ({page}) => {
    await openReplacement(page, {replacementRow: "undoColor"});
    const section = body(page).locator('[data-accents="autocorrect"]');
    await expect(section.locator(".accent-band")).toHaveText(["For Replacement undone", "For every case"]);
    // The compiled accent for every case is listed on each case, under every case's band.
    const row = section.locator('[data-accent="autocorrect:0"]');
    await expect(row.locator(".accent-leds")).toHaveText("LEDs 24–28, 53–55");
    await expect(row.locator('[data-act="change"]')).toHaveAttribute("data-tip", "Changes it for every case.");
    await expect(row.locator(".accent-colour")).toContainText("Same as the case's colour");
    await section.getByRole("button", {name: "Add accent", exact: true}).click();
    const editor = section.locator(".accent-editor");
    await expect(editor.locator('[data-act="keep"]')).toBeDisabled();
    await expect(page.locator(".board-foot b")).toHaveText("Picking LEDs");
    await page.locator('.board [data-led="5"]').click();
    await page.locator(".board .kc-ball").click();
    await expect(editor).toContainText("2 LEDs picked");
    for (const [index, value] of [77, 78, 79].entries()) await change(editor.locator(`[data-channel="${index}"]`), value);
    expect(await posted(page)).toEqual([]);
    await editor.locator('[data-act="keep"]').click();
    await expectPost(page, {type: "addRgbLedGroup", group: {target: "autocorrect", owner: "AUTOCORRECT_FEEDBACK_GROUP_UNDO", ledIndices: [5, 56], h: 77, s: 78, v: 79}});
    // For every case, in the case's colour.
    await clearPosts(page);
    await section.getByRole("button", {name: "Add accent", exact: true}).click();
    await page.locator('.board [data-led="7"]').click();
    await editor.getByText("Every case", {exact: true}).click();
    await editor.getByText("Same as the case's colour", {exact: true}).click();
    await expect(editor.locator("[data-channel]")).toHaveCount(0);
    await editor.locator('[data-act="keep"]').click();
    await expectPost(page, {type: "addRgbLedGroup", group: {target: "autocorrect", owner: "AUTOCORRECT_FEEDBACK_GROUP_ALL", ledIndices: [7], h: 0, s: 0, v: 0}});
    // Change keeps the accent's place in its table; Remove names it by that place.
    await clearPosts(page);
    await row.locator('[data-act="change"]').click();
    await editor.getByText("Replacement undone", {exact: true}).click();
    await page.locator('.board [data-led="24"]').click();
    await editor.locator('[data-act="keep"]').click();
    await expectPost(page, {type: "updateRgbLedGroup", target: "autocorrect", index: 0,
        group: {owner: "AUTOCORRECT_FEEDBACK_GROUP_UNDO", ledIndices: [25, 26, 27, 28, 53, 54, 55], h: 0, s: 0, v: 0}});
    await clearPosts(page);
    const remove = row.locator('[data-act="remove"]');
    await expect(remove).toHaveText("Remove");
    await expect(remove).toHaveClass(/destructive/);
    await remove.click();
    await expectPost(page, {type: "deleteRgbLedGroup", target: "autocorrect", index: 0});
    // All accents lists it under its stage, and Open goes to the case.
    await page.locator("#stage-tab-accents").click();
    const overview = body(page).locator("section", {has: page.locator('[data-owner="autocorrect:AUTOCORRECT_FEEDBACK_GROUP_ALL"]')});
    await expect(overview.locator("h4")).toHaveText("Replacement feedback");
    await overview.locator('[data-act="open"]').click();
    await expect(page.locator("#stage-tab-autocorrect")).toHaveAttribute("aria-selected", "true");
});

// Passthrough and off are two words in every list (D-L94): a layer's too.
test("the layer list says passthrough and off apart", async ({page}) => {
    await openStage(page, "layers");
    const cell = body(page).locator('tr[data-layer="1"] td').nth(1);
    await publishAccepted(page, ["rgb", "layerColors", 1, "color"], {h: "30", s: "200", v: "0"});
    await expect(cell).toHaveText(/^off · /);
    await publishAccepted(page, ["rgb", "layerColors", 1, "color"], {h: "30", s: "0", v: "0"});
    await expect(cell).toHaveText("passthrough");
});
