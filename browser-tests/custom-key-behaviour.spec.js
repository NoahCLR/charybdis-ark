// @ts-check
"use strict";
const {test, expect} = require("@playwright/test");
const {openControls, clearPosts, posted, change, publishAccepted} = require("./control-preview");

// Custom keys shows the selected key's behaviour editor: the Keys screen's,
// for a key on a layer or on none, posting the same draft edits.

const editor = (page) => page.locator(".custom-key-behaviour");
// Picks a key; one with no behaviour yet shows one line and "Add taps and
// holds…", which opens its grid (unless the test asks to see the fold).
const pick = async (page, slot, {open = true} = {}) => {
    await page.locator(`.macro-grid [data-custom-key="CUSTOM_KEY_${slot}"]`).click();
    const add = editor(page).locator('[data-act="add-behaviour"]');
    if (open && await add.count()) await add.click();
};

test("the custom key bank scrolls on its own and keeps its place, so the editor stays beside it", async ({page}) => {
    await openControls(page, "customKeys", {customKeyEmptyOpen: true});
    const bank = page.locator(".pad.library .bank-scroll");
    const content = page.locator(".content");
    const tile = page.locator('.macro-grid [data-custom-key="CUSTOM_KEY_100"]');
    await tile.scrollIntoViewIfNeeded();
    const position = await bank.evaluate(node => node.scrollTop);
    expect(position, "the bank scrolls inside its card").toBeGreaterThan(0);
    expect(await content.evaluate(node => node.scrollTop), "the page does not scroll").toBe(0);
    const expectPosition = () => expect.poll(() => bank.evaluate(node => node.scrollTop)).toBe(position);

    await tile.click();
    await expect(tile).toHaveAttribute("aria-current", "true");
    await expectPosition();
    const name = page.locator('[data-f="custom-key:100:name"]');
    await expect(name).toBeInViewport();
    await clearPosts(page);
    await change(name, "Far key");
    await expect.poll(() => posted(page).then(rows => JSON.stringify(rows))).toContain("Far key");
    const index = await page.evaluate(async () => (await import("/webview/store.mjs")).getModel().customKeys.findIndex(row => row.slot === 100));
    await publishAccepted(page, ["customKeys", index, "name"], "Far key");
    await expectPosition();
    await expect(name).toBeInViewport();

    await page.locator('[data-screen="settings"]').click();
    await page.locator('[data-screen="customKeys"]').click();
    await expect.poll(() => bank.evaluate(node => node.scrollTop)).toBe(0);
});

test("a custom key tile hovers its tip, not the board's key card", async ({page}) => {
    await openControls(page, "customKeys", {customKeyEmptyOpen: true});
    const tile = page.locator('.macro-grid [data-custom-key="CUSTOM_KEY_5"]');
    await tile.hover();
    await expect(page.locator(".tip")).toBeVisible();
    await expect(page.locator(".tip")).toHaveText(await tile.getAttribute("data-tip"));
    await expect(page.locator(".hovercard")).toBeHidden();
});

test("an unplaced custom key gets its behaviour on the Custom keys screen, with its built-in defaults", async ({page}) => {
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await openControls(page, "customKeys", {customKeyEmptyOpen: true});
    await pick(page, 5, {open: false});
    // Folded to one line until it has a behaviour; opening it posts nothing.
    await expect(editor(page).locator(".custom-key-row")).toContainText("Taps and holds");
    await expect(editor(page).locator(".custom-key-row")).toContainText("none");
    await expect(page.locator(".bgrid")).toHaveCount(0);
    await clearPosts(page);
    await editor(page).locator('[data-act="add-behaviour"]').click();
    expect(await posted(page)).toEqual([]);
    await expect(editor(page).locator(".beh-title"), "no title repeating the card's").toBeHidden();
    await expect(editor(page).locator('[data-act="show-behaviour"]'), "a key on no layer has nothing to show on the board").toHaveCount(0);
    await expect(editor(page).locator('[data-act="remove"]'), "an unstored grid has nothing to remove").toHaveCount(0);
    await expect(page.locator(".bgrid")).toHaveCount(1);
    expect(await page.evaluate(async () => {
        const {behaviourEditorRow} = await import("/webview/view/behavior-editor.mjs");
        const {getModel} = await import("/webview/store.mjs");
        return behaviourEditorRow(getModel(), "CUSTOM_KEY_5")?.builtIn;
    }), "the same defaults as a placed custom key").toEqual({releaseTaps: true});

    // The first edit adds the row: a Long hold on the first press, typed
    // exactly, which the cell's editor offers with Show keycodes on.
    await page.evaluate(async () => { const store = await import("/webview/store.mjs"); store.state.showKeycodes = true; store.render(); });
    await editor(page).locator('[data-cell="0-long"]').click();
    await expect(page.locator(".cell-editor")).toHaveCount(1);
    await clearPosts(page);
    await change(page.locator('[data-f="behaviour:CUSTOM_KEY_5:0-long:action"]'), "KC_B");
    await expect.poll(() => posted(page)).toEqual([expect.objectContaining({type: "saveBehavior", behavior: expect.objectContaining({
        keycode: "CUSTOM_KEY_5", tapHoldTerm: "0", longerHoldTerm: "0", multiTapTerm: "0",
        steps: [{tapCount: 0, longHold: expect.objectContaining({action: "KC_B"})}]})})]);
    const fromHere = (await posted(page))[0];

    // A timing posts the row too, with the timing as typed.
    await clearPosts(page);
    await change(page.locator('[data-f="behaviour:CUSTOM_KEY_5:timing:multiTapTerm"]'), "210");
    await expect.poll(() => posted(page)).toEqual([expect.objectContaining({type: "saveBehavior",
        behavior: expect.objectContaining({keycode: "CUSTOM_KEY_5", multiTapTerm: "210", steps: []})})]);

    // The same edit made on the Keys screen posts the same message.
    await page.evaluate(async () => {
        const store = await import("/webview/store.mjs");
        Object.assign(store.state, {screen: "keys", tab: "behaviours", behaviourRow: "CUSTOM_KEY_5", cell: null});
        store.render();
    });
    await expect(page.locator(".bgrid")).toHaveCount(1);
    await page.locator('.beh-main [data-cell="0-long"]').click();
    await clearPosts(page);
    await change(page.locator('[data-f="behaviour:CUSTOM_KEY_5:0-long:action"]'), "KC_B");
    await expect.poll(() => posted(page)).toHaveLength(1);
    expect((await posted(page))[0]).toEqual(fromHere);
    expect(errors).toEqual([]);
});

test("once stored, the behaviour shows its dashed cells and can be removed from Custom keys", async ({page}) => {
    await openControls(page, "customKeys", {customKeyEmptyOpen: true});
    await pick(page, 5);
    // What the host publishes once it accepts a tap and a Long hold.
    await page.evaluate(async () => {
        const store = await import("/webview/store.mjs");
        const model = structuredClone(store.getModel());
        model.keyBehaviors.push({keycode: "CUSTOM_KEY_5", tapHoldTerm: "0", longerHoldTerm: "0", multiTapTerm: "0", keepsAutoMouseAnchored: false,
            enabled: true, allowedLayers: 0xffff, builtIn: model.behaviorEditing.keyDefaults.CUSTOM_KEY_5.builtIn,
            steps: [{tapCount: 0, tap: {helper: "TAP_SENDS", action: "KC_A"}, longHold: {helper: "HOLD_WHILE_HELD", action: "KC_B", repeatHz: "0"}}]});
        model.customKeys[5].hasBehavior = true;
        store.setModel(model); store.render();
    });
    await expect(editor(page).locator('[data-act="add-behaviour"]'), "a stored behaviour is never folded").toHaveCount(0);
    const dashed = editor(page).locator('[data-cell="0-hold"]');
    await expect(dashed).toHaveClass(/inherited/);
    await expect(dashed).toContainText("tap if released before Long hold");
    await clearPosts(page);
    await editor(page).locator('[data-menu="more"]').click();
    await editor(page).locator('[data-act="remove"]').click();
    await expect.poll(() => posted(page)).toEqual([expect.objectContaining({type: "deleteBehavior", keycode: "CUSTOM_KEY_5"})]);
});

test("the open cell belongs to one behaviour across keys and screens", async ({page}) => {
    await openControls(page, "customKeys", {customKeyEmptyOpen: true});
    await pick(page, 0);
    await expect(editor(page).locator('[data-act="show-behaviour"]'), "CUSTOM_KEY_0 is placed").toHaveCount(1);
    await editor(page).locator('[data-cell="0-tap"]').click();
    await expect(page.locator(".cell-editor")).toHaveCount(1);

    // Another key opens with no cell open.
    await pick(page, 1);
    await expect(page.locator(".cell-editor")).toHaveCount(0);

    // A cell opened in the Keys screen's row is not open on Custom keys, and
    // picking another custom key there leaves it open on the Keys screen.
    await page.locator('[data-screen="keys"]').click();
    await page.locator('[data-tab="behaviours"]').click();
    const keysRow = await page.evaluate(async () => (await import("/webview/store.mjs")).state.behaviourRow);
    expect(keysRow).not.toBe("CUSTOM_KEY_0");
    await page.locator('.beh-main [data-cell="0-long"]').click();
    await expect(page.locator(".cell-editor")).toHaveCount(1);
    await page.locator('[data-screen="customKeys"]').click();
    await expect(page.locator(".bgrid")).toHaveCount(1);
    await expect(page.locator(".cell-editor"), "CUSTOM_KEY_1, still selected, has no cell open").toHaveCount(0);
    await pick(page, 0);
    await expect(page.locator(".cell-editor")).toHaveCount(0);
    await page.locator('[data-screen="keys"]').click();
    await expect(page.locator(".cell-editor"), "the Keys screen's cell survived picking a custom key").toHaveCount(1);
    await expect(page.locator('.beh-main [data-cell="0-long"]')).toHaveClass(/\bon\b/);
    await page.locator('[data-screen="customKeys"]').click();
    await expect(page.locator(".bgrid")).toHaveCount(1);
    await expect(page.locator(".cell-editor")).toHaveCount(0);

    // A cell open on Custom keys is not open in the Keys screen's row, and the
    // board's Delete there does not clear that row's cell.
    await editor(page).locator('[data-cell="0-long"]').click();
    await expect(page.locator(".cell-editor")).toHaveCount(1);
    await page.locator('[data-screen="keys"]').click();
    await expect(page.locator('.bench [data-tab="behaviours"]')).toHaveAttribute("aria-selected", "true");
    expect(await page.evaluate(async () => (await import("/webview/store.mjs")).state.behaviourRow)).toBe(keysRow);
    await expect(page.locator(".cell-editor")).toHaveCount(0);
    await expect(page.locator(".bcell.on")).toHaveCount(0);
    await clearPosts(page);
    await page.keyboard.press("Delete");
    expect((await posted(page)).filter((message) => message.type === "saveBehavior")).toEqual([]);

    // Show on the Keys screen opens this behaviour there, its open cell with it.
    await page.locator('[data-screen="customKeys"]').click();
    await expect(page.locator(".cell-editor"), "the key's own cell stays open").toHaveCount(1);
    await editor(page).locator('[data-act="show-behaviour"]').click();
    await expect(page.locator('.bench [data-tab="behaviours"]')).toHaveAttribute("aria-selected", "true");
    expect(await page.evaluate(async () => (await import("/webview/store.mjs")).state.behaviourRow)).toBe("CUSTOM_KEY_0");
    await expect(page.locator(".bgrid")).toHaveCount(1);
    await expect(page.locator('.beh-main [data-cell="0-long"]')).toHaveClass(/\bon\b/);
    await expect(page.locator(".cell-editor")).toHaveCount(1);
});

test("the behaviour editor on Custom keys follows the behaviours edit gate", async ({page}) => {
    await openControls(page, "customKeys", {customKeyEmptyOpen: true});
    await page.evaluate(async () => {
        const store = await import("/webview/store.mjs");
        const model = structuredClone(store.getModel());
        model.behaviorEditing.writable = false;
        store.setModel(model); store.render();
    });
    await expect(page.locator('[data-f="custom-key:0:name"]'), "the name is the custom keys area's").toBeEnabled();
    await expect(page.locator('[data-f="behaviour:CUSTOM_KEY_0:timing:tapHoldTerm"]')).toBeDisabled();
    await expect(page.locator('[data-f="behaviour:CUSTOM_KEY_0:anchor"]')).toBeDisabled();
    await expect(editor(page).locator('[data-act="remove"]')).toBeDisabled();
    await expect(editor(page).locator('[data-act="rekey"]')).toBeDisabled();
});

test("Change key… on Custom keys moves the behaviour and the screen follows it to another custom key", async ({page}) => {
    await openControls(page, "customKeys", {customKeyEmptyOpen: true});
    await pick(page, 0);
    await editor(page).locator('[data-menu="more"]').click();
    await editor(page).locator('[data-act="rekey"]').click();
    await expect(page.locator(".picker")).toHaveCount(1);
    const keysRow = await page.evaluate(async () => (await import("/webview/store.mjs")).state.behaviourRow);
    await clearPosts(page);
    // The picker's own path is covered with the Keys screen; this picks as it does.
    await page.evaluate(async () => {
        const store = await import("/webview/store.mjs");
        const {onPick} = /** @type {any} */ (store.state.picker);
        store.state.picker = null;
        onPick("CUSTOM_KEY_6");
    });
    await expect.poll(() => posted(page)).toEqual([expect.objectContaining({type: "retargetBehavior", keycode: "CUSTOM_KEY_0", target: "CUSTOM_KEY_6"})]);
    const after = await page.evaluate(async () => {
        const {state} = await import("/webview/store.mjs");
        return {screen: state.screen, customKey: state.customKey, behaviourRow: state.behaviourRow};
    });
    expect(after).toEqual({screen: "customKeys", customKey: "CUSTOM_KEY_6", behaviourRow: keysRow});
});

test("Show on the Keys screen shows a layer that reaches the key", async ({page}) => {
    await openControls(page, "customKeys", {customKeyEmptyOpen: true});
    await pick(page, 0);
    const layout = await page.evaluate(async () => {
        const store = await import("/webview/store.mjs");
        const {customKeyPlacements} = await import("/webview/view/reach.mjs");
        const reaching = customKeyPlacements(store.getModel(), store.layers(), "CUSTOM_KEY_0").map((entry) => entry.at);
        const free = store.layers().map((_, at) => at).find((at) => !reaching.includes(at));
        return {reaching, free};
    });
    expect(layout.reaching.length, "CUSTOM_KEY_0 is placed").toBeGreaterThan(0);
    expect(layout.free, "the fixture has a layer that does not reach CUSTOM_KEY_0").not.toBeUndefined();
    await page.evaluate(async (at) => {
        const store = await import("/webview/store.mjs");
        store.state.layer = at; store.render();
    }, layout.free);
    await editor(page).locator('[data-act="show-behaviour"]').click();
    const after = await page.evaluate(async () => {
        const {state} = await import("/webview/store.mjs");
        return {screen: state.screen, tab: state.tab, layer: state.layer, behaviourRow: state.behaviourRow};
    });
    expect(after).toEqual({screen: "keys", tab: "behaviours", layer: layout.reaching[0], behaviourRow: "CUSTOM_KEY_0"});

    // On a layer that already reaches it, the layer stays.
    const other = layout.reaching.at(-1);
    await page.locator('[data-screen="customKeys"]').click();
    await page.evaluate(async (at) => {
        const store = await import("/webview/store.mjs");
        store.state.layer = at; store.render();
    }, other);
    await editor(page).locator('[data-act="show-behaviour"]').click();
    expect(await page.evaluate(async () => (await import("/webview/store.mjs")).state.layer)).toBe(other);
});

test("Change key… on Custom keys to an ordinary key opens the behaviour on the Keys screen", async ({page}) => {
    await openControls(page, "customKeys", {customKeyEmptyOpen: true});
    await pick(page, 0);
    await editor(page).locator('[data-menu="more"]').click();
    await editor(page).locator('[data-act="rekey"]').click();
    await clearPosts(page);
    await page.evaluate(async () => {
        const store = await import("/webview/store.mjs");
        const {onPick} = /** @type {any} */ (store.state.picker);
        store.state.picker = null;
        onPick("KC_F13");
    });
    await expect.poll(() => posted(page)).toEqual([expect.objectContaining({type: "retargetBehavior", keycode: "CUSTOM_KEY_0", target: "KC_F13"})]);
    const after = await page.evaluate(async () => {
        const {state} = await import("/webview/store.mjs");
        return {screen: state.screen, tab: state.tab, behaviourRow: state.behaviourRow};
    });
    expect(after).toEqual({screen: "keys", tab: "behaviours", behaviourRow: "KC_F13"});
});

test("Delete on Custom keys clears the open cell of the selected key's behaviour, and only that", async ({page}) => {
    await openControls(page, "customKeys", {customKeyEmptyOpen: true});
    await pick(page, 5);
    await page.evaluate(async () => {
        const store = await import("/webview/store.mjs");
        const model = structuredClone(store.getModel());
        model.keyBehaviors.push({keycode: "CUSTOM_KEY_5", tapHoldTerm: "0", longerHoldTerm: "0", multiTapTerm: "0", keepsAutoMouseAnchored: false,
            enabled: true, allowedLayers: 0xffff, builtIn: model.behaviorEditing.keyDefaults.CUSTOM_KEY_5.builtIn,
            steps: [{tapCount: 0, tap: {helper: "TAP_SENDS", action: "KC_A"}, longHold: {helper: "HOLD_WHILE_HELD", action: "KC_B", repeatHz: "0"}}]});
        model.customKeys[5].hasBehavior = true;
        store.setModel(model); store.render();
    });
    // No cell open: Delete does nothing here.
    await clearPosts(page);
    await page.locator("body").press("Delete");
    expect(await posted(page)).toEqual([]);

    await editor(page).locator('[data-cell="0-tap"]').click();
    await expect(page.locator(".cell-editor")).toHaveCount(1);
    await page.locator(".custom-key-behaviour .custom-key-row .eyebrow").click();
    await clearPosts(page);
    await page.locator("body").press("Delete");
    await expect.poll(() => posted(page)).toEqual([expect.objectContaining({type: "saveBehavior", behavior: expect.objectContaining({keycode: "CUSTOM_KEY_5"})})]);
    const [message] = await posted(page);
    expect(message.behavior.steps).toEqual([expect.objectContaining({tapCount: 0, longHold: expect.objectContaining({action: "KC_B"})})]);
    expect(message.behavior.steps[0].tap).toBeUndefined();

    // Another key selected, the cell is not on screen, so Delete does nothing.
    await pick(page, 6);
    await clearPosts(page);
    await page.locator("body").press("Delete");
    expect(await posted(page)).toEqual([]);
});

test("a custom key is named by its title, as a macro is: Enter commits, Escape cancels", async ({page}) => {
    await openControls(page, "customKeys", {customKeyEmptyOpen: true});
    await pick(page, 3);
    const title = page.getByRole("textbox", {name: "Custom key name", exact: true});
    await expect(page.locator(".main [data-name]"), "the title is the only name field").toHaveCount(1);
    await expect(page.locator(".name-titlebar [data-name]")).toHaveCount(1);
    await expect(title).toHaveAttribute("placeholder", "Custom key 3");
    await clearPosts(page);
    await title.fill("Copy line");
    await title.press("Enter");
    await expect.poll(() => posted(page).then(rows => rows.filter(row => row.type === "updateCustomKey").at(-1)?.name)).toBe("Copy line");
    await clearPosts(page);
    await title.fill("Cancelled"); await title.press("Escape");
    await expect(title).toHaveValue("");
    expect((await posted(page)).filter(row => row.type === "updateCustomKey")).toEqual([]);
});

test("+ New custom key opens the first unused key and posts nothing", async ({page}) => {
    await openControls(page, "customKeys");
    await clearPosts(page);
    await page.locator('[data-act="new-custom-key"]').click();
    const first = await page.evaluate(async () => (await import("/webview/store.mjs")).getModel().customKeys
        .find(key => !key.name && !key.hasBehavior && !(key.shortcut.mods || key.shortcut.key)).keycode);
    await expect(page.locator(`[data-custom-key="${first}"]`)).toHaveAttribute("aria-current", "true");
    await expect(editor(page).locator('[data-act="add-behaviour"]')).toHaveCount(1);
    expect(await posted(page)).toEqual([]);
});
