// @ts-check
"use strict";
const {test, expect} = require("@playwright/test");
const {openControls, clearPosts, posted, expectPost, change, publishAccepted} = require("./control-preview");

const body = page => page.locator("#benchBody");
const channel = (page, index) => body(page).locator(`[data-channel="${index}"]`);
const stages = [
    {id: "layers", bit: 1, path: ["rgb", "layerColors", 1, "color"], colour: [85, 255, 200],
        message: colour => ({type: "updateLayerColor", layer: "Layer 1", mode: "KEYS_MAPPED_ON_THIS_LAYER_ONLY", ...colour})},
    {id: "auto", bit: 2, path: ["rgb", "automouseFade", "end_color"], colour: [167, 255, 199],
        message: colour => ({type: "updateAutomouseFade", mode: "END_COLOR_ON_ALL_KEYS", ...colour})},
    {id: "pd", bit: 4, path: ["rgb", "pdModeColors", 0, "color"], colour: [21, 255, 200],
        message: colour => ({type: "updatePdModeColor", pointingMode: "PD_MODE_DRAGSCROLL", locality: "RGB_RIGHT_HALF", ...colour})},
    {id: "combo", bit: 8, path: ["rgb", "comboFeedback", "color"], colour: [191, 255, 200],
        message: colour => ({type: "updateComboFeedback", locality: "RGB_KEY_HALF", ...colour})},
    {id: "key", bit: 16, path: ["rgb", "keyBehaviorFeedback", "holdActiveColor"], colour: [18, 255, 200],
        message: colour => ({type: "updateKeyBehaviorFeedback", config: expect.objectContaining({holdActiveColor: colour,
            tapCommitMode: "KEY_FEEDBACK_TAP_COMMIT_NON_BASE_TAPS", locality: "RGB_KEY_HALF"})})},
];

async function openStage(page, stage, theme = "plain") {
    await openControls(page, "lighting", {stage, layer: 1, pdSlot: 0, feedbackRow: "holdActiveColor"}, theme);
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
        // "Show this stage" sits in the stage body's header.
        await page.locator("#benchBody .stage-head label.sw").click();
        await expectPost(page, {type: "updateRgbStages", stageEnableMask: 31 & ~stage.bit});
    });
}

for (const theme of ["vscode-dark", "vscode-light"]) {
    test(`colour field focus survives the panel host cascade (${theme})`, async ({page}) => {
        await openStage(page, "layers", theme);
        await change(channel(page, 0), 77);
        await expectPost(page, stages[0].message({h: 77, s: 255, v: 200}));
        await channel(page, 0).focus();
        await publishAccepted(page, stages[0].path, {h: "77", s: "255", v: "200"});
        await expect(channel(page, 0)).toBeFocused();
        await expect(channel(page, 0)).toHaveValue("77");
    });
}

test("all Lighting policy selects post the chosen policy and retained colour", async ({page}) => {
    for (const [stage, label, value, message] of [
        ["layers", "Lights", "ALL_KEYS", {type: "updateLayerColor", layer: "Layer 1", mode: "ALL_KEYS", h: 85, s: 255, v: 200}],
        ["auto", "Fade mode", "END_COLOR_WHERE_BASE_EFFECT_WOULD_SHOW", {type: "updateAutomouseFade", mode: "END_COLOR_WHERE_BASE_EFFECT_WOULD_SHOW", h: 167, s: 255, v: 199}],
        ["pd", "Where it lights", "RGB_LEFT_HALF", {type: "updatePdModeColor", pointingMode: "PD_MODE_DRAGSCROLL", locality: "RGB_LEFT_HALF", h: 21, s: 255, v: 200}],
        ["combo", "Where it lights", "RGB_BOTH_HALVES", {type: "updateComboFeedback", locality: "RGB_BOTH_HALVES", h: 191, s: 255, v: 200}],
        ["key", "Where it lights", "RGB_LEFT_HALF", {type: "updateKeyBehaviorFeedback", config: expect.objectContaining({locality: "RGB_LEFT_HALF", holdActiveColor: {h: 18, s: 255, v: 200}})}],
    ]) {
        await openStage(page, stage);
        await body(page).locator("label.field").filter({has: page.getByText(label, {exact: true})}).locator("select").selectOption(value);
        await expectPost(page, message);
    }
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
        // At the bottom of the window, clear of the sticky board and tab strip.
        await surface.evaluate(node => node.scrollIntoView({block: "end"}));
        const box = await surface.boundingBox();
        await page.mouse.move(box.x + box.width * fraction.x, box.y + box.height * fraction.y);
        await page.mouse.down();
        expect(await posted(page)).toEqual([]);
        await page.mouse.up();
        await expectPost(page, {type: "updateComboFeedback", locality: "RGB_KEY_HALF", ...expected});
        await publishAccepted(page, ["rgb", "comboFeedback", "color"], Object.fromEntries(Object.entries(expected).map(([key, value]) => [key, String(value)])));
    }
});

test("LED groups stage every table/owner/source/colour control and remove rows/groups", async ({page}) => {
    await openStage(page, "groups");
    const builder = body(page).locator(".builder > aside");
    await page.locator('.board [data-key="0"]').click();
    await page.locator('[data-act="trackball"]').click();
    await builder.locator('[data-act="save"]').click();
    await expectPost(page, {type: "saveRgbReusableLedGroup", group: {ledIndices: [0, 56]}});
    await clearPosts(page);
    await builder.getByRole("button", {name: "Give it a colour", exact: true}).click();
    for (const [index, value] of [77, 78, 79].entries()) await change(channel(page, index), value);
    expect(await posted(page)).toEqual([]);
    const cases = [
        ["layer", "Layer 2", {target: "layer", owner: "Layer 2"}],
        ["pdMode", "PD_MODE_VOLUME", {target: "pdMode", owner: "PD_MODE_VOLUME"}],
        ["combo", null, {target: "combo"}],
        ["keyBehavior", "KEY_FEEDBACK_GROUP_HOLD_ACTIVE", {target: "keyBehavior", owner: "KEY_FEEDBACK_GROUP_HOLD_ACTIVE"}],
    ];
    for (const [target, owner, expected] of cases) {
        await builder.locator("[data-target]").selectOption(target);
        if (owner) await builder.locator("[data-owner]").selectOption(owner);
        await builder.locator("[data-source]").selectOption("");
        await clearPosts(page);
        await builder.locator('[data-act="keep"]').click();
        await expectPost(page, {type: "addRgbLedGroup", group: {...expected, ledIndices: [0, 56], h: 77, s: 78, v: 79}});
    }
    await builder.locator("[data-source]").selectOption("Group 0");
    await clearPosts(page);
    await builder.locator('[data-act="keep"]').click();
    await expectPost(page, {type: "addRgbLedGroup", group: {target: "keyBehavior", owner: "KEY_FEEDBACK_GROUP_HOLD_ACTIVE", ledGroupName: "Group 0", h: 77, s: 78, v: 79}});
    await clearPosts(page);
    await body(page).locator('[data-delete="Group 0"]').click();
    await expectPost(page, {type: "deleteRgbReusableLedGroup", name: "Group 0"});
    await expect(body(page).locator('[data-delete="Group 1"]')).toBeDisabled();
    const tables = body(page).locator("table.led-rows");
    await expect(tables).toHaveCount(3);
    for (const [index, target] of ["pdMode", "combo", "keyBehavior"].entries()) {
        await clearPosts(page);
        await tables.nth(index).locator("[data-remove]").click();
        await expectPost(page, {type: "deleteRgbLedGroup", target, index: 0});
    }
});

test("Lighting preview toggles and screen links navigate without posting edits", async ({page}) => {
    await openStage(page, "pd");
    await body(page).getByRole("button", {name: "Show it running on the board", exact: true}).click();
    await expect(page.locator(".board-foot-text")).toContainText("held, painting");
    expect(await posted(page)).toEqual([]);
    await page.locator('[data-screen="lighting"]').click();
    await expect(page.locator('.topbar [data-act="read"]')).toHaveCount(0);
    await page.locator('[data-screen="device"]').click();
    await clearPosts(page);
    await page.locator('.main [data-act="read"]').click();
    await expectPost(page, {type: "refresh"});
});

// The base effect and the flash speed are settings the keyboard stores with
// its global policy, edited on Lighting: each posts its whole section.
const sectionOf = (page, id) => page.evaluate(async id => (await import("/webview/store.mjs")).getModel().configDefaults.find(section => section.id === id), id);
const sectionPost = (section, changes) => ({type: "updateConfigDefaults", sectionId: section.id, fields: section.fields.map(field =>
    field.kind === "toggle" ? {macro: field.macro, enabled: changes[field.macro] ?? field.enabled} : {macro: field.macro, value: changes[field.macro] ?? field.value})});

test("All lighting posts the master switch, and off it says so on every stage with Turn on", async ({page}) => {
    await openStage(page, "layers");
    const section = await sectionOf(page, "rgbAppearance");
    await page.locator(".topbar label.sw").click();
    await expectPost(page, sectionPost(section, {lightingEnabled: false}));
    const index = await page.evaluate(async () => (await import("/webview/store.mjs")).getModel().configDefaults.findIndex(row => row.id === "rgbAppearance"));
    await publishAccepted(page, ["configDefaults", index, "fields", 0, "enabled"], false);
    for (const stage of ["layers", "pd", "key"]) {
        await page.locator(`[data-ltab="${stage}"]`).click();
        await expect(body(page).locator("[data-all-off]")).toContainText("All lighting is off. Layer colours and feedback are dark too.");
    }
    await clearPosts(page);
    await body(page).getByRole("button", {name: "Turn on", exact: true}).click();
    await expectPost(page, sectionPost(section, {lightingEnabled: true}));
});

test("the Base effect stage edits the settings values, brightness of 200, never Effect N", async ({page}) => {
    await openStage(page, "base");
    // A keyboard that reports its brightness limit, as a current one does.
    await page.evaluate(async () => {
        const store = await import("/webview/store.mjs");
        const model = structuredClone(store.getModel());
        const fields = model.configDefaults.find(row => row.id === "rgbAppearance").fields;
        Object.assign(fields.find(field => field.macro === "brightness"), {max: 200, readOnly: false});
        // and its effects and LED classes.
        Object.assign(fields.find(field => field.macro === "effectMode"), {readOnly: false, choices: [{value: 1, label: "Solid colour"}, {value: 13, label: "Cycle left right"}]});
        Object.assign(fields.find(field => field.macro === "effectLeds"), {readOnly: false, choices: [{value: 255, label: "All LEDs"}, {value: 4, label: "Main keys"}]});
        store.setModel(model); store.render();
    });
    const section = await sectionOf(page, "rgbAppearance");
    const value = macro => section.fields.find(field => field.macro === macro).value;
    await expect(body(page)).not.toContainText(/Effect \d/);
    await expect(body(page).locator("[data-base-brightness]")).toContainText(`Brightness ${value("brightness")}`);
    await expect(body(page).locator("[data-base-brightness]")).not.toContainText("255");
    await change(channel(page, 0), 77);
    await expectPost(page, sectionPost(section, {hue: "77"}));
    await clearPosts(page);
    await change(channel(page, 2), 150);
    await expectPost(page, sectionPost(section, {brightness: "150"}));
    await clearPosts(page);
    await body(page).locator('[data-f="lighting:base:leds"]').selectOption("4");
    await expectPost(page, sectionPost(section, {effectLeds: "4"}));
    await clearPosts(page);
    await body(page).locator('[data-f="setting:lightingTimeout"]').fill("5");
    await body(page).locator('[data-f="setting:lightingTimeout"]').press("Tab");
    expect(Number(value("lightingTimeout")) % 60000, "the fixture reads in minutes").toBe(0);
    await expectPost(page, sectionPost(section, {lightingTimeout: "300000"}));
    const animated = (await page.locator('[data-f="lighting:base:effect"] option').evaluateAll(options => options.map(option => option.value))).find(id => id !== "1");
    await clearPosts(page);
    await body(page).locator('[data-f="lighting:base:effect"]').selectOption(animated);
    await expectPost(page, sectionPost(section, {effectMode: animated}));
    await expect(body(page).locator('[data-f="lighting:base:speed"]')).toHaveCount(0);
});

test("Key feedback's switch and Flash speed post what they say", async ({page}) => {
    await openStage(page, "key");
    await expect(body(page).locator("[data-row]")).toHaveText(["Waiting on 2×", "Waiting on 3×", "Waiting on 4×", "Waiting on 5×", "Holding", "Long hold", "Multi-tap sent"]);
    await body(page).locator("label.sw").filter({hasText: "Flash after a double tap or more"}).click();
    await expectPost(page, {type: "updateKeyBehaviorFeedback", config: expect.objectContaining({tapCommitMode: "KEY_FEEDBACK_TAP_COMMIT_OFF"})});
    const section = await sectionOf(page, "lightingFeedback");
    await clearPosts(page);
    await change(body(page).locator('[data-f="lighting:key:flash"]'), 321);
    await expectPost(page, sectionPost(section, {feedbackFlash: "321"}));
});

test("keys picked on Layers become a row of their own colour, edited and dragged in place", async ({page}) => {
    await openStage(page, "layers");
    await page.locator('.board [data-key="0"]').click();
    await page.locator('.board [data-key="1"]').click();
    await expect(page.locator(".picks-foot")).toContainText("2 keys");
    await page.locator('[data-act="colour-picks"]').click();
    const leds = await page.evaluate(async () => {const {LED_INDEX} = await import("/webview/view/geometry.mjs"); return [LED_INDEX[0], LED_INDEX[1]];});
    await expectPost(page, {type: "addRgbLedGroup", group: expect.objectContaining({target: "layer", owner: "Layer 1", ledIndices: leds})});
    // The host accepts it: the row is on this layer, after any already there.
    await page.evaluate(async () => {
        const {getModel} = await import("/webview/store.mjs");
        const model = structuredClone(getModel());
        const rows = model.rgb.layerLedGroups = model.rgb.layerLedGroups || [];
        rows.push({owner: "Layer 1", ledGroup: "Group 9", ledIndices: [0, 1], color: {h: "170", s: "255", v: "200"}});
        rows.push({owner: "Layer 1", ledGroup: "Group 10", ledIndices: [2], color: {h: "10", s: "255", v: "200"}});
        model.draft.revision++;
        window.dispatchEvent(new MessageEvent("message", {data: {type: "model", model}}));
    });
    const own = body(page).locator(".own-row");
    await expect(own).toHaveCount(await page.evaluate(async () => (await import("/webview/store.mjs")).getModel().rgb.layerLedGroups
        .filter(row => row.owner === "Layer 1" || row.owner === "RGB_LAYER_GROUP_ALL").length));
    const index = Number(await own.nth(-2).getAttribute("data-own-row"));
    await clearPosts(page);
    if (!(await own.nth(-2).locator('[data-act="edit"]').getAttribute("aria-expanded") === "true")) await own.nth(-2).locator('[data-act="edit"]').click();
    await change(body(page).locator(`[data-f="lighting:layers:row:${index}:colour:0"]`), 33);
    await expectPost(page, {type: "updateRgbLedGroup", target: "layer", index, h: 33, s: 255, v: 200});
    await clearPosts(page);
    await own.nth(-2).locator(".grip").focus();
    await page.keyboard.press("ArrowDown");
    await expectPost(page, {type: "moveRgbLedGroup", target: "layer", from: index, to: index + 1});
    await clearPosts(page);
    // Dragged by the row: the drop lands it in the target's place.
    await page.evaluate(([from, to]) => {
        const transfer = new DataTransfer();
        const row = (index) => document.querySelector(`[data-own-row="${index}"]`);
        row(from)?.dispatchEvent(new DragEvent("dragstart", {bubbles: true, dataTransfer: transfer}));
        row(to)?.dispatchEvent(new DragEvent("dragover", {bubbles: true, cancelable: true, dataTransfer: transfer}));
        row(to)?.dispatchEvent(new DragEvent("drop", {bubbles: true, cancelable: true, dataTransfer: transfer}));
    }, [index + 1, index]);
    await expectPost(page, {type: "moveRgbLedGroup", target: "layer", from: index + 1, to: index});
    await clearPosts(page);
    await own.nth(-1).locator('[data-act="remove"]').click();
    await expectPost(page, {type: "deleteRgbLedGroup", target: "layer", index: index + 1});
});

test("the stage strip fits a 1100 px window, and hovering a key says what lights it", async ({page}) => {
    await page.setViewportSize({width: 1100, height: 700});
    await openStage(page, "layers");
    const tabs = page.locator(".bench-tablist");
    expect(await tabs.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    await expect(page.locator("[data-ltab] .n")).toHaveCount(0);
    await page.locator('.board [data-key="0"]').hover();
    await expect(page.locator(".hovercard")).toContainText("LED");
    await expect(page.locator(".hovercard")).not.toContainText("Key behaviour");
});

test("the layer and pointing-mode lists scroll on their own and keep their place", async ({page}) => {
    await openStage(page, "layers");
    const list = page.locator('[data-scroll-list="layers"]');
    const content = page.locator(".content");
    await expect(list).toHaveClass(/\bmany\b/);
    const layer = list.locator('[data-layer="15"]');
    await layer.scrollIntoViewIfNeeded();
    const position = await list.evaluate(node => node.scrollTop);
    expect(position, "the list scrolls inside its card").toBeGreaterThan(0);
    const page_ = await content.evaluate(node => node.scrollTop);
    await layer.click();
    await expect(layer).toHaveClass(/\bon\b/);
    await expect.poll(() => list.evaluate(node => node.scrollTop), {message: "a click redraws without losing the list's place"}).toBe(position);
    // The page keeps its place too, unless the picked layer's editor is
    // shorter and the page can no longer scroll that far.
    expect(await content.evaluate(node => node.scrollTop)).toBe(await content.evaluate((node, before) => Math.min(before, node.scrollHeight - node.clientHeight), page_));

    // Each list keeps its own place: the pointing list starts at its top, and
    // coming back shows the picked layer again.
    await page.locator('[data-ltab="pd"]').click();
    const pointing = page.locator('[data-scroll-list="pd"]');
    await expect.poll(() => pointing.evaluate(node => node.scrollTop)).toBe(0);
    await page.locator('[data-ltab="layers"]').click();
    const shown = () => page.locator('[data-scroll-list="layers"]').evaluate(node => {
        const bounds = node.getBoundingClientRect(), row = /** @type {Element} */ (node.querySelector(".rowitem.on")).getBoundingClientRect();
        return row.top >= bounds.top && row.bottom <= bounds.bottom;
    });
    await expect.poll(shown, {message: "the picked layer is shown inside the list"}).toBe(true);
    expect(await posted(page)).toEqual([]);
});
