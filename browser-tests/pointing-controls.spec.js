// @ts-check
"use strict";
const {test, expect} = require("@playwright/test");
const {openControls, clearPosts, posted, expectPost, change} = require("./control-preview");

const editor = page => page.locator(".pd-editor");
const field = (page, name) => editor(page).getByLabel(name, {exact: true})
    .or(editor(page).locator("label.field").filter({has: page.getByText(name, {exact: true})}).locator("input, select"));
const configPost = (page, slot, config) => expectPost(page, {
    type: "savePdMode", slot, expectedBase: expect.any(Object), config: expect.objectContaining({id: slot, ...config}),
});
async function advanced(page) {
    await editor(page).locator("details summary").click();
    await expect(editor(page).locator("details")).toHaveAttribute("open");
    await expect.poll(() => page.evaluate(async () => (await import("/webview/store.mjs")).state.pdAdvanced)).toBe(true);
}

test("every scrolling tuning field posts the visible value once, retaining the rest of the record", async ({page}) => {
    await openControls(page, "pointing", {pointingSlot: 0});
    await advanced(page);
    const fields = [
        ["Movement per wheel step ↔", "divisorH"], ["Movement per wheel step ↕", "divisorV"],
        ["Minimum interval ms", "intervalMs"], ["Axis lock timeout ms", "lockMs"],
        ["Horizontal activation threshold", "thresholdH"], ["Vertical activation threshold", "thresholdV"],
        ["Gesture expiry ms", "expireMs"], ["Cross-axis decay divisor", "decayDivisor"],
        ["Axis selection ratio numerator", "startNumerator"], ["Axis selection ratio denominator", "startDenominator"],
        ["Axis retention ratio numerator", "sustainNumerator"], ["Axis retention ratio denominator", "sustainDenominator"],
    ];
    const changed = {invert: 2};
    for (const [index, [label, key]] of fields.entries()) {
        await clearPosts(page);
        await change(field(page, label), 71 + index);
        changed[key] = 71 + index;
        await configPost(page, 0, {kind: 2, name: "Dragscroll", dpi: 100, scroll: expect.objectContaining({...changed})});
    }
});

for (const [label, value, expected] of [
    ["Name", "Scroll sentinel", {name: "Scroll sentinel"}],
    ["Pointer speed while active", "1400", {dpi: 1400}],
    ["Scrolls", "1", {axis: 1}],
    ["Reverse scrolling", "3", {scroll: expect.objectContaining({invert: 3})}],
    ["After this mode ends", "1", {pointerLayer: 1}],
]) {
    test(`scrolling ${label} posts its record`, async ({page}) => {
        await openControls(page, "pointing", {pointingSlot: 0});
        if (label === "After this mode ends") await advanced(page);
        if (label === "Name") await change(field(page, label), value);
        else await field(page, label).selectOption(value);
        await configPost(page, 0, {kind: 2, ...expected});
    });
}

test("each modifier checkbox in scrolling contributes its own bit", async ({page}) => {
    await openControls(page, "pointing", {pointingSlot: 0});
    const modifiers = editor(page).locator('.pd-mods [data-bit]');
    await expect(modifiers).toHaveCount(8);
    let mask = 0;
    for (let index = 0; index < 8; index++) {
        const control = modifiers.nth(index);
        const bit = Number(await control.getAttribute("data-bit"));
        await clearPosts(page);
        await control.locator("..").click();
        mask |= bit;
        await configPost(page, 0, {heldModifiers: mask});
    }
});

test("directional shortcuts, axes, empty directions, output and thresholds all post", async ({page}) => {
    await openControls(page, "pointing", {pointingSlot: 4});
    const directions = {};
    for (const direction of ["up", "left", "right", "down"]) {
        await clearPosts(page);
        await change(editor(page).locator(`.pd-cross .arm.${direction} input`), "KC_A");
        directions[direction] = expect.objectContaining({keycode: "KC_A"});
        await configPost(page, 4, {directions: expect.objectContaining({...directions})});
    }
    for (const [label, value, expected] of [
        ["When a direction is empty", "2", {emptyDirection: 2}],
        ["How often it sends", "1", {directionOutput: 1}],
    ]) {
        await clearPosts(page);
        await field(page, label).selectOption(value);
        await configPost(page, 4, expected);
    }
    await advanced(page);
    for (const [axis, key] of [["Horizontal", "thresholdX"], ["Vertical", "thresholdY"]]) {
        await clearPosts(page);
        await change(editor(page).locator("label.field").filter({hasText: new RegExp(`^${axis} movement`)}).locator("input"), 777);
        await configPost(page, 4, {[key]: 777});
    }
    await clearPosts(page);
    await field(page, "After this mode ends").selectOption("0");
    await configPost(page, 4, {pointerLayer: 0});
    await clearPosts(page);
    await field(page, "Reads").selectOption("0");
    await configPost(page, 4, {axis: 0, thresholdX: 0,
        directions: expect.objectContaining({left: {keycode: "0", modifierPolicy: 0, mask: 0}, right: {keycode: "0", modifierPolicy: 0, mask: 0}})});
});

test("eight directions draw and post every diagonal shortcut and modifier policy", async ({page}) => {
    await openControls(page, "pointing", {pointingSlot: 4});
    await field(page, "Reads").selectOption("3");
    await configPost(page, 4, {axis: 3});
    // The core accepts the axis change before the four new fields are drawn.
    await page.evaluate(async () => {
        const store = await import("/webview/store.mjs");
        const model = structuredClone(store.getModel());
        model.pdModes[4].axis = 3;
        for (const key of Object.keys(model.pdModes[4].diagonals)) model.pdModes[4].diagonals[key].keycode = 4;
        store.setModel(model); store.render();
    });
    const diagonals = {};
    for (const direction of ["upLeft", "upRight", "downLeft", "downRight"]) {
        await clearPosts(page);
        await change(editor(page).locator(`.pd-cross .arm.${direction} input`), "KC_B");
        diagonals[direction] = expect.objectContaining({keycode: "KC_B"});
        await configPost(page, 4, {diagonals: expect.objectContaining({...diagonals})});
    }
    await advanced(page);
    for (const label of ["Up", "Left", "Right", "Down", "Up-left", "Up-right", "Down-left", "Down-right"]) {
        await clearPosts(page);
        await field(page, `${label} with held modifiers`).selectOption("2");
        const key = label.replace(/-(\w)/g, (_, letter) => letter.toUpperCase()).replace(/^\w/, letter => letter.toLowerCase());
        const group = label.includes("-") ? "diagonals" : "directions";
        await configPost(page, 4, {[group]: expect.objectContaining({[key]: expect.objectContaining({modifierPolicy: 2, mask: 0})})});
    }
});

test("a direction's Ignore mask posts each checkbox", async ({page}) => {
    await openControls(page, "pointing", {pointingSlot: 4});
    await advanced(page);
    for (const [label, initial, expected] of [
        ["Up leaves out", 68, mask => ({directions: expect.objectContaining({up: expect.objectContaining({modifierPolicy: 1, mask})})})],
        ["Down leaves out", 68, mask => ({directions: expect.objectContaining({down: expect.objectContaining({modifierPolicy: 1, mask})})})],
    ]) {
        const group = editor(page).locator(".field").filter({has: page.locator(".pd-mods")}).filter({hasText: label});
        const controls = group.locator("[data-bit]");
        await expect(controls).toHaveCount(8);
        let mask = initial;
        for (let index = 0; index < 8; index++) {
            const input = controls.nth(index);
            const bit = Number(await input.getAttribute("data-bit"));
            await clearPosts(page);
            await input.locator("..").click();
            mask ^= bit;
            await configPost(page, 4, expected(mask));
        }
    }
});

// Version 4 retired the mouse button overrides (firmware D-F22): Advanced has
// no table for them, and saving a mode posts no button fields.
test("Advanced has no mouse button overrides, and a saved mode posts no button fields", async ({page}) => {
    await openControls(page, "pointing", {pointingSlot: 4});
    await advanced(page);
    await expect(editor(page).locator(".pd-buttons")).toHaveCount(0);
    await expect(editor(page)).not.toContainText("Mouse button overrides");
    await expect(editor(page).locator('[data-f^="pointing:4:button:"]')).toHaveCount(0);
    await change(field(page, "Name"), "Arrow sentinel");
    await configPost(page, 4, {name: "Arrow sentinel"});
    expect((await posted(page))[0].config).not.toHaveProperty("buttons");
});

test("movement changes its form locally, and the first edit posts the new kind", async ({page}) => {
    await openControls(page, "pointing", {pointingSlot: 0});
    await field(page, "Movement").selectOption("1");
    expect(await posted(page)).toEqual([]);
    await expect(editor(page).locator(".pd-cross")).toBeVisible();
    await change(field(page, "Name"), "Directional sentinel");
    await configPost(page, 0, {kind: 1, name: "Directional sentinel", thresholdY: 60});
});

test("shortcut picker, duplicate, clear and empty-slot creation post their commands", async ({page}) => {
    await openControls(page, "pointing", {pointingSlot: 4});
    await editor(page).locator(".pd-cross .arm.up [data-pick]").click();
    await page.locator('.pkb-key[data-pick="KC_A"]').click();
    await page.locator('.picker [data-act="use"]').click();
    await configPost(page, 4, {directions: expect.objectContaining({up: expect.objectContaining({keycode: expect.stringContaining("KC_A")})})});
    await clearPosts(page);
    await editor(page).locator('[data-act="duplicate"]').click();
    await expectPost(page, {type: "duplicatePdMode", slot: 6, source: 4});
    await page.locator('[data-slot="4"]').click();
    await clearPosts(page);
    await editor(page).locator('[data-act="clear"]').click();
    await expectPost(page, {type: "clearPdMode", slot: 4});
    await page.locator('[data-slot="8"]').click();
    for (const [label, kind] of [["New directional mode", 1], ["New scrolling mode", 2]]) {
        await clearPosts(page);
        await editor(page).getByRole("button", {name: label, exact: true}).click();
        await configPost(page, 8, {kind, name: "Mode 8"});
    }
    await clearPosts(page);
    await editor(page).locator("[data-source]").selectOption("5");
    await editor(page).getByRole("button", {name: "Duplicate into this slot", exact: true}).click();
    await expectPost(page, {type: "duplicatePdMode", slot: 8, source: 5});
});

test("pointing navigation reaches placement and lighting without an edit", async ({page}) => {
    await openControls(page, "pointing", {pointingSlot: 4});
    await editor(page).locator('[data-act="place"]').click();
    await expect(page.locator('.main h1')).toHaveText("Keymap");
    expect(await posted(page)).toEqual([]);
    await page.locator('[data-screen="pointing"]').click();
    await editor(page).locator('[data-act="lighting"]').click();
    await expect(page.locator('[data-ltab="pd"]')).toHaveAttribute("aria-selected", "true");
    expect(await posted(page)).toEqual([]);
});

test("the reach row places the hold key on a key, and an empty slot names what still reaches it", async ({page}) => {
    await openControls(page, "pointing", {pointingSlot: 4});
    const place = editor(page).locator('[data-act="place"]');
    await expect(place).toHaveText("Place on a key…");
    await expect(place).toHaveAttribute("data-tip", /hold key/);
    const hold = await page.evaluate(async () => {
        const store = await import("/webview/store.mjs");
        const model = structuredClone(store.getModel());
        const slot = model.pdModes.find(row => !row.kind);
        model.keyBehaviors = [...(model.keyBehaviors || []), {keycode: "KC_F13", steps: [{tapIndex: 0, tap: {action: slot.keys.hold}}]}];
        store.setModel(model);
        store.state.pointingSlot = slot.id;
        store.render();
        return slot.keys.hold;
    });
    const warning = editor(page).locator(".unavailable");
    await expect(warning).toContainText("1 behaviour (F13) still reach this slot");
    await expect(warning).not.toContainText(hold);
    await expect(warning).not.toContainText("KC_F13");
});

test("a pointing mode name counts bytes and flags one past the limit instead of cutting it off", async ({page}) => {
    await openControls(page, "pointing", {pointingSlot: 4});
    const name = field(page, "Name");
    const count = editor(page).locator("[data-name-count]");
    await name.fill("é".repeat(17));
    await expect(name).toHaveValue("é".repeat(17));
    await expect(count).toHaveText("34 / 32 bytes");
    await expect(count).toHaveClass(/warn/);
    await name.fill("a".repeat(32));
    await expect(count).toHaveText("32 / 32 bytes");
    await expect(count).not.toHaveClass(/warn/);
});

// The How it starts card (firmware D-F62). The preview logs what is posted and never
// applies it, so the slot the core would hand back is published by hand.
async function publishSlot(page, id, link) {
    await page.evaluate(async ({id, link}) => {
        const {getModel} = await import("/webview/store.mjs");
        const model = structuredClone(getModel());
        Object.assign(model.pdModes.find(slot => slot.id === id), link);
        model.draft.revision++;
        window.dispatchEvent(new MessageEvent("message", {data: {type: "model", model,
            acceptedEdit: {message: {type: "savePdMode"}, previousFingerprint: "before", fingerprint: "after"}}}));
        window.__posted.length = 0;
    }, {id, link});
}

test("the How it starts card posts the layers that start the mode, the layers its key turns on and what ends it", async ({page}) => {
    await openControls(page, "pointing", {pointingSlot: 1});
    const card = editor(page).locator(".pd-starts");
    // One card for how the mode starts: its keys, then the layers, then what ends it.
    await expect(card.locator(".card-h h3")).toHaveText("How it starts");
    await expect(card.locator(".card-h .note")).toHaveCount(0);
    expect(await card.locator(".card-b > *").evaluateAll(nodes => nodes.map(node => node.className.split(" ")[0]))).toEqual(["note", "pd-lines", "layer-table"]);
    await expect(card.locator('[data-act="place"]')).toBeVisible();
    await expect(card.locator('[data-act="lighting"]')).toHaveCount(0);
    await expect(editor(page).locator('.pd-identity [data-act="lighting"]')).toBeVisible();
    const starts = n => page.locator(`[data-f="pointing:1:linkedLayers:${n}"]`);
    const key = n => page.locator(`[data-f="pointing:1:linkTurnsOn:${n}"]`);
    const sw = locator => page.locator("label.sw").filter({has: locator});
    const rowOf = n => card.locator(".layer-table-row").filter({has: starts(n)});
    const link = (fields) => ({linkedLayers: 0, linkTurnsOn: 0, linkEnds: 0, ...fields});
    // One row per layer, in the tab order, with a switch in each of two columns.
    const layers = await page.evaluate(async () => (await import("/webview/store.mjs")).getModel().layers.length);
    await expect(card.locator(".layer-table-row:not(.layer-table-head)")).toHaveCount(layers);
    await expect(card.locator(".layer-table-head")).toContainText("Starts this pointing mode");
    await expect(card.locator(".layer-table-head")).toContainText("Turned on by this pointing mode's key");
    // The default and pointer layers are dimmed rows that say why, both switches off limits.
    await expect(rowOf(0)).toHaveClass(/unusable/);
    await expect(rowOf(0)).toContainText("default layer, always on");
    await expect(rowOf(4)).toContainText("pointer layer, follows the trackball");
    for (const n of [0, 4]) { await expect(starts(n)).toBeDisabled(); await expect(key(n)).toBeDisabled(); }
    await expect(card).not.toContainText("Not offered");
    // A disabled switch looks disabled.
    expect(await sw(starts(4)).locator(".track").evaluate(node => getComputedStyle(node).borderStyle)).toBe("dashed");
    const ends = card.locator('[role="radiogroup"]');
    await expect(ends).toHaveCount(0);

    await sw(starts(3)).click();
    await configPost(page, 1, link({linkedLayers: 1 << 3}));
    await publishSlot(page, 1, link({linkedLayers: 1 << 3}));
    await expect(ends).toHaveCount(1);
    await expect(card.locator(".pd-link-ends")).toContainText("Ends when another layer turns on");
    await expect(ends.locator('input[value="0"]')).toBeChecked();
    await ends.locator("label").filter({hasText: "Any layer"}).click();
    await configPost(page, 1, link({linkedLayers: 1 << 3, linkEnds: 2}));
    await publishSlot(page, 1, {linkEnds: 2});
    await sw(key(3)).click();
    await configPost(page, 1, link({linkedLayers: 1 << 3, linkTurnsOn: 1 << 3, linkEnds: 2}));
    // Navigation sits below the pointer layer, which this mode keeps: the
    // core publishes that the pointer layer covers it, and the card says so.
    await publishSlot(page, 1, {linkTurnsOn: 1 << 3, pointerCovers: 1 << 3});
    await expect(card.locator(".callout.warn")).toContainText("Pointer, the pointer layer, sits above Navigation");
    await sw(key(6)).click();
    await configPost(page, 1, link({linkedLayers: 1 << 3, linkTurnsOn: (1 << 3) | (1 << 6), linkEnds: 2}));
    await publishSlot(page, 1, {linkTurnsOn: (1 << 3) | (1 << 6)});
    await expect(card.locator(".card-h .note")).toHaveText("also started by Navigation; its key turns on Navigation and Extra 2");
    // Switching off the last starting layer resets what ends it to Never.
    await sw(starts(3)).click();
    await configPost(page, 1, link({linkTurnsOn: (1 << 3) | (1 << 6)}));
    await publishSlot(page, 1, link({linkTurnsOn: (1 << 3) | (1 << 6)}));
    await expect(ends).toHaveCount(0);
    await sw(key(3)).click();
    await configPost(page, 1, link({linkTurnsOn: 1 << 6}));
});

test("a layer that starts another mode cannot start this one and says so in its row, while its key switch stays usable", async ({page}) => {
    await openControls(page, "pointing", {pointingSlot: 2});
    await page.evaluate(async () => {
        const store = await import("/webview/store.mjs");
        const model = structuredClone(store.getModel());
        Object.assign(model.pdModeEditing.linkTargets[5], {linkedBy: 1, linkedByName: "Volume"});
        store.setModel(model); store.render();
    });
    const starts = page.locator('[data-f="pointing:2:linkedLayers:5"]'), key = page.locator('[data-f="pointing:2:linkTurnsOn:5"]');
    await expect(starts).toBeDisabled();
    await expect(page.locator("label.sw").filter({has: starts})).toContainText("already starts Volume");
    await expect(page.locator(".layer-table-row").filter({has: starts})).not.toHaveClass(/unusable/);
    await expect(key).toBeEnabled();
    await page.locator("label.sw").filter({has: key}).click();
    await configPost(page, 2, {linkTurnsOn: 1 << 5});
});

test("Pointer settings: auto-sniping's layers post one switch each, beside its master switch", async ({page}) => {
    await openControls(page, "pointer");
    await page.locator('label:has([data-f="setting:snipingOnLayer2"])').click();
    await expectPost(page, {type: "updateConfigDefaults", sectionId: "sniping", expectedFingerprint: expect.any(String), fields: expect.arrayContaining([
        {macro: "autoSniping", enabled: true}, {macro: "snipingOnLayer2", enabled: true}, {macro: "snipingOnLayer3", enabled: true}, {macro: "snipingOnLayer0", enabled: false},
    ])});
    await clearPosts(page);
    await page.locator('label:has([data-f="setting:autoSniping"])').click();
    await expectPost(page, {type: "updateConfigDefaults", sectionId: "sniping", expectedFingerprint: expect.any(String), fields: expect.arrayContaining([
        {macro: "autoSniping", enabled: false}, {macro: "snipingOnLayer3", enabled: true},
    ])});
});
