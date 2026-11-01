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
// A few short options are on show as one segmented group: pick one by its value.
const choose = (page, label, value) => editor(page).locator(`.seg[aria-label="${label}"] label`).filter({has: page.locator(`input[value="${value}"]`)}).click();
// A direction's key, picked as a person picks it: the key, then Use.
async function pickDirection(page, direction, keycode) {
    await editor(page).locator(`.pd-arm.${direction} .pd-key`).click();
    await page.locator(`.pkb-key[data-pick="${keycode}"]`).click();
    await page.locator('.picker [data-act="use"]').click();
}
async function advanced(page) {
    await editor(page).locator("details summary").click();
    await expect(editor(page).locator("details")).toHaveAttribute("open");
    await expect.poll(() => page.evaluate(async () => (await import("/webview/store.mjs")).state.pdAdvanced)).toBe(true);
}

test("the slot list opens on the modes in use; New opens the first free slot, and Show all the rest", async ({page}) => {
    await openControls(page, "pointing", {pointingSlot: 0});
    const list = page.getByRole("list", {name: "Pointing slots"});
    const used = await page.evaluate(async () => (await import("/webview/store.mjs")).getModel().pdModes.filter(slot => slot.kind));
    await expect(list.locator(".pd-tile")).toHaveCount(used.length);
    await expect(list.locator(".pd-tile .v")).toHaveText(used.map(slot => slot.name));
    await expect(page.locator(".pointing-library .card-h .tag").first()).toHaveText(`${used.length} of 32 used`);
    await list.locator('[data-act="new-slot"]').click();
    const free = await page.evaluate(async () => (await import("/webview/store.mjs")).getModel().pdModes.find(slot => !slot.kind).id);
    await expect(editor(page).locator(".card-h h3")).toHaveText("New pointing mode");
    await expect(editor(page).locator(".card-h .tag")).toHaveText(`Slot ${free}`);
    expect(await posted(page)).toEqual([]);
    await list.locator('[data-all-slots="pointing"]').click();
    await expect(list.locator(".pd-tile")).toHaveCount(32);
    // An empty slot that keys still reach is marked, and says so.
    await expect(list.locator(`.pd-tile[data-slot="${free}"]`)).toHaveClass(/warn/);
    await expect(list.locator(`.pd-tile[data-slot="${free}"]`)).toHaveAttribute("data-tip", /still reach it/);
});

test("every scrolling tuning field posts the visible value once, retaining the rest of the record", async ({page}) => {
    await openControls(page, "pointing", {pointingSlot: 0});
    await advanced(page);
    const fields = [
        ["Sideways: ball movement per step", "divisorH"], ["Up and down: ball movement per step", "divisorV"],
        ["Fastest repeat ms", "intervalMs"], ["Axis kept after the ball stops ms", "lockMs"],
        ["Horizontal activation threshold", "thresholdH"], ["Vertical activation threshold", "thresholdV"],
        ["Leftover movement kept for ms", "expireMs"], ["Cross-axis decay divisor", "decayDivisor"],
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
    ["Pointing mode name", "Scroll sentinel", {name: "Scroll sentinel"}],
    ["Pointer speed", "1400", {dpi: 1400}],
    ["Scrolls", "1", {axis: 1}],
    ["Pointer layer", "1", {pointerLayer: 1}],
]) {
    test(`scrolling ${label} posts its record`, async ({page}) => {
        await openControls(page, "pointing", {pointingSlot: 0});
        if (label === "Pointing mode name") await change(field(page, label), value);
        else if (label === "Pointer speed") await field(page, label).selectOption(value);
        else await choose(page, label, value);
        await configPost(page, 0, {kind: 2, ...expected});
    });
}

test("reverse scrolling is a switch per axis, posted as the record's two bits", async ({page}) => {
    await openControls(page, "pointing", {pointingSlot: 0});
    const sideways = page.locator('[data-f="pointing:0:invert:1"]'), upDown = page.locator('[data-f="pointing:0:invert:2"]');
    // Each switch is named as Review names its axis, and Dragscroll reverses up and down only.
    await expect(page.locator(".pd-switches .sw .txt")).toHaveText(["Horizontal", "Vertical"]);
    await expect(sideways).not.toBeChecked();
    await expect(upDown).toBeChecked();
    await page.locator("label.sw").filter({has: sideways}).click();
    await configPost(page, 0, {scroll: expect.objectContaining({invert: 3})});
    await page.evaluate(() => { window.__posted.length = 0; });
    await page.locator("label.sw").filter({has: upDown}).click();
    await configPost(page, 0, {scroll: expect.objectContaining({invert: 1})});
});

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
    // The preview never applies what is posted, so each pick posts only its own direction changed.
    for (const direction of ["up", "left", "right", "down"]) {
        await clearPosts(page);
        await pickDirection(page, direction, "KC_A");
        await configPost(page, 4, {directions: expect.objectContaining({[direction]: expect.objectContaining({keycode: "KC_A"})})});
    }
    for (const [label, value, expected] of [
        ["When a direction has no key", "2", {emptyDirection: 2}],
        ["How often it sends", "1", {directionOutput: 1}],
    ]) {
        await clearPosts(page);
        await choose(page, label, value);
        await configPost(page, 4, expected);
    }
    await advanced(page);
    for (const [axis, key] of [["Horizontal", "thresholdX"], ["Vertical", "thresholdY"]]) {
        await clearPosts(page);
        await change(editor(page).locator("label.field").filter({hasText: new RegExp(`^${axis} movement`)}).locator("input"), 777);
        await configPost(page, 4, {[key]: 777});
    }
    await clearPosts(page);
    await choose(page, "Pointer layer", "0");
    await configPost(page, 4, {pointerLayer: 0});
    await clearPosts(page);
    await choose(page, "Reads", "0");
    await configPost(page, 4, {axis: 0, thresholdX: 0,
        directions: expect.objectContaining({left: {keycode: "0", modifierPolicy: 0, mask: 0}, right: {keycode: "0", modifierPolicy: 0, mask: 0}})});
});

test("eight directions draw and post every diagonal shortcut and modifier policy", async ({page}) => {
    await openControls(page, "pointing", {pointingSlot: 4});
    await choose(page, "Reads", "3");
    await configPost(page, 4, {axis: 3});
    // The core accepts the axis change before the four new fields are drawn.
    await page.evaluate(async () => {
        const store = await import("/webview/store.mjs");
        const model = structuredClone(store.getModel());
        model.pdModes[4].axis = 3;
        for (const key of Object.keys(model.pdModes[4].diagonals)) model.pdModes[4].diagonals[key].keycode = 4;
        store.setModel(model); store.render();
    });
    await expect(editor(page).locator(".pd-compass.eight .pd-arm")).toHaveCount(8);
    for (const direction of ["upLeft", "upRight", "downLeft", "downRight"]) {
        await clearPosts(page);
        await pickDirection(page, direction, "KC_B");
        await configPost(page, 4, {diagonals: expect.objectContaining({[direction]: expect.objectContaining({keycode: "KC_B"})})});
    }
    await advanced(page);
    for (const label of ["Up", "Left", "Right", "Down", "Up-left", "Up-right", "Down-left", "Down-right"]) {
        await clearPosts(page);
        await choose(page, `${label} with held modifiers`, "2");
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
    await change(field(page, "Pointing mode name"), "Arrow sentinel");
    await configPost(page, 4, {name: "Arrow sentinel"});
    expect((await posted(page))[0].config).not.toHaveProperty("buttons");
});

test("movement changes its form locally, and the first edit posts the new kind", async ({page}) => {
    await openControls(page, "pointing", {pointingSlot: 0});
    const kinds = editor(page).getByRole("radiogroup", {name: "What the ball does"});
    await expect(kinds.getByRole("radio", {name: /Scroll/})).toBeChecked();
    await kinds.locator("label").filter({hasText: "Send keys"}).click();
    expect(await posted(page)).toEqual([]);
    await expect(kinds.getByRole("radio", {name: /Send keys/})).toBeChecked();
    await expect(editor(page).locator(".pd-compass")).toBeVisible();
    await expect(editor(page).locator(".pd-step h4").nth(1)).toHaveText("What each direction sends");
    await change(field(page, "Pointing mode name"), "Directional sentinel");
    await configPost(page, 0, {kind: 1, name: "Directional sentinel", thresholdY: 60});
});

test("shortcut picker, duplicate, clear and empty-slot creation post their commands", async ({page}) => {
    await openControls(page, "pointing", {pointingSlot: 4});
    await pickDirection(page, "up", "KC_A");
    await configPost(page, 4, {directions: expect.objectContaining({up: expect.objectContaining({keycode: expect.stringContaining("KC_A")})})});
    // × clears a direction's key.
    await clearPosts(page);
    await editor(page).locator(".pd-arm.down .pd-key-clear").click();
    await configPost(page, 4, {directions: expect.objectContaining({down: {keycode: "0", modifierPolicy: 0, mask: 0}})});
    await clearPosts(page);
    await editor(page).locator('[data-act="duplicate"]').click();
    await expectPost(page, {type: "duplicatePdMode", slot: 6, source: 4});
    await page.locator('[data-slot="4"]').click();
    await clearPosts(page);
    await editor(page).locator('[data-act="clear"]').click();
    await expectPost(page, {type: "clearPdMode", slot: 4});
    await page.locator('[data-all-slots="pointing"]').click();
    await page.locator('[data-slot="8"]').click();
    // An empty slot starts a mode by the same choice step 1 offers.
    await expect(editor(page).locator(".card-h h3")).toHaveText("New pointing mode");
    for (const [label, kind] of [["Send keys", 1], ["Scroll", 2]]) {
        await clearPosts(page);
        await editor(page).locator(".pd-kind").filter({hasText: label}).click();
        await configPost(page, 8, {kind, name: "Mode 8"});
    }
    await clearPosts(page);
    await editor(page).locator("[data-source]").selectOption("5");
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
    const name = field(page, "Pointing mode name");
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

test("What starts it posts the layers that start the mode, the layers its key turns on and what ends it", async ({page}) => {
    await openControls(page, "pointing", {pointingSlot: 1});
    const card = editor(page).locator(".pd-starts");
    // Step 3: its keys, then the layers that start it, then the layers its key turns on.
    await expect(editor(page).locator(".pd-step h4").nth(2)).toHaveText("What starts it");
    await expect(card.locator(".pd-row-l")).toHaveText(["Its keys", "Layers", "Its key turns on"]);
    await expect(card.locator(".pd-cap")).toHaveText(["Volume hold", "Volume lock"]);
    await expect(card).not.toContainText("PD_MODE_1");
    const add = page.locator('[data-f="pointing:1:linkedLayers:add"]'), addKey = page.locator('[data-f="pointing:1:linkTurnsOn:add"]');
    const starts = card.locator('[aria-labelledby="pd-starts-1"]'), turns = card.locator('[aria-labelledby="pd-turns-1"]');
    const link = (fields) => ({linkedLayers: 0, linkTurnsOn: 0, linkEnds: 0, ...fields});
    // Every layer not in a list is in its Add menu; the default and pointer
    // layers are there disabled, saying why.
    const layers = await page.evaluate(async () => (await import("/webview/store.mjs")).getModel().layers.length);
    await expect(add.locator("option:not([value=''])")).toHaveCount(layers);
    await expect(add.locator('option[value="0"]')).toBeDisabled();
    await expect(add.locator('option[value="0"]')).toContainText("default layer, always on");
    await expect(add.locator('option[value="4"]')).toContainText("pointer layer, follows the trackball");
    for (const menu of [add, addKey]) for (const n of ["0", "4"]) await expect(menu.locator(`option[value="${n}"]`)).toBeDisabled();
    const ends = card.locator('[role="radiogroup"]');
    await expect(ends).toHaveCount(0);

    await add.selectOption("3");
    await configPost(page, 1, link({linkedLayers: 1 << 3}));
    await publishSlot(page, 1, link({linkedLayers: 1 << 3}));
    await expect(starts.locator(".pd-chip")).toHaveText([/^Navigation\s*×$/]);
    await expect(ends).toHaveCount(1);
    await expect(card.locator(".pd-row:has([role=radiogroup]) .pd-row-l")).toHaveText("Ends when");
    await expect(ends.locator('input[value="0"]')).toBeChecked();
    await ends.locator("label").filter({hasText: "Any layer"}).click();
    await configPost(page, 1, link({linkedLayers: 1 << 3, linkEnds: 2}));
    await publishSlot(page, 1, {linkEnds: 2});
    await addKey.selectOption("3");
    await configPost(page, 1, link({linkedLayers: 1 << 3, linkTurnsOn: 1 << 3, linkEnds: 2}));
    // Navigation sits below the pointer layer, which this mode keeps: the
    // core publishes that the pointer layer covers it, and the step says so.
    await publishSlot(page, 1, {linkTurnsOn: 1 << 3, pointerCovers: 1 << 3});
    await expect(card.locator(".callout.warn")).toContainText("Pointer, the pointer layer, sits above Navigation");
    await addKey.selectOption("6");
    await configPost(page, 1, link({linkedLayers: 1 << 3, linkTurnsOn: (1 << 3) | (1 << 6), linkEnds: 2}));
    await publishSlot(page, 1, {linkTurnsOn: (1 << 3) | (1 << 6)});
    await expect(turns.locator(".pd-chip")).toHaveText([/^Navigation\s*×$/, /^Extra 2\s*×$/]);
    // Removing the last starting layer resets what ends it to Never.
    await starts.getByRole("button", {name: "Remove Navigation"}).click();
    await configPost(page, 1, link({linkTurnsOn: (1 << 3) | (1 << 6)}));
    await publishSlot(page, 1, link({linkTurnsOn: (1 << 3) | (1 << 6)}));
    await expect(ends).toHaveCount(0);
    await expect(starts).toContainText("None");
    await turns.getByRole("button", {name: "Remove Navigation"}).click();
    await configPost(page, 1, link({linkTurnsOn: 1 << 6}));
});

test("a layer that starts another mode cannot start this one and says so in the menu, while its key may still turn it on", async ({page}) => {
    await openControls(page, "pointing", {pointingSlot: 2});
    await page.evaluate(async () => {
        const store = await import("/webview/store.mjs");
        const model = structuredClone(store.getModel());
        Object.assign(model.pdModeEditing.linkTargets[5], {linkedBy: 1, linkedByName: "Volume"});
        store.setModel(model); store.render();
    });
    const starts = page.locator('[data-f="pointing:2:linkedLayers:add"] option[value="5"]');
    const key = page.locator('[data-f="pointing:2:linkTurnsOn:add"] option[value="5"]');
    await expect(starts).toBeDisabled();
    await expect(starts).toContainText("already starts Volume");
    await expect(key).toBeEnabled();
    await page.locator('[data-f="pointing:2:linkTurnsOn:add"]').selectOption("5");
    await configPost(page, 2, {linkTurnsOn: 1 << 5});
});

test("Pointer: auto-sniping's layers post one switch each, beside its master switch", async ({page}) => {
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

test("every setting in a mode says what it does, under Advanced too", async ({page}) => {
    for (const slot of [0, 4]) {
        await openControls(page, "pointing", {pointingSlot: slot, pdAdvanced: true});
        // Every number field, and every few-option choice outside the
        // per-direction table, carries a tip on the field itself.
        const untipped = await editor(page).locator(".field").evaluateAll(fields => fields
            .filter(field => field.querySelector("input.input, .seg, .pd-switches, .pd-mods") && !field.closest(".pd-taps"))
            .filter(field => !(field.getAttribute("data-tip") || field.querySelector(".seg[data-tip]")?.getAttribute("data-tip")))
            .map(field => field.querySelector("span")?.textContent));
        expect(untipped, `slot ${slot}`).toEqual([]);
    }
    await openControls(page, "pointing", {pointingSlot: 0, pdAdvanced: true});
    await expect(editor(page).locator(".field").filter({hasText: "Axis selection ratio"})).toHaveAttribute("data-tip", /1\.75 times/);
    await expect(editor(page).locator(".field").filter({hasText: "Axis kept after the ball stops"})).toHaveAttribute("data-tip", /once the ball stops/);
});

test("the pointer layer is set where the mode's running is, and no Advanced section is called Behaviour", async ({page}) => {
    for (const slot of [0, 4]) {
        await openControls(page, "pointing", {pointingSlot: slot, pdAdvanced: true});
        await expect(editor(page).locator(".pd-step").nth(3).locator('.seg[aria-label="Pointer layer"]')).toHaveCount(1);
        await expect(editor(page).locator(".pd-advanced .seg[aria-label=\"Pointer layer\"]")).toHaveCount(0);
        await expect(editor(page).locator(".pd-advanced h4")).not.toContainText(["Behaviour"]);
    }
    await expect(editor(page).locator(".pd-advanced h4").first()).toHaveText("Distance");
});
