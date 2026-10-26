// @ts-check
"use strict";
const {test, expect} = require("@playwright/test");
const {openControls, posted, clearPosts} = require("./control-preview");

const shortcut = (mods, key, layers = 0, layerKind = 0) => expect.objectContaining({type: "updateCustomKeyShortcut", keycode: "CUSTOM_KEY_1", shortcut: {mods, key, layers, layerKind}});

// The Shortcut field is set in the keycode picker, with the modifier row the
// Keys screen uses: here left and right mix, and modifiers alone or a key
// alone are a shortcut. Use posts the whole shortcut; Clear posts none.
for (const theme of ["dark"]) {
    test(`a custom key's shortcut is picked with mixed-side modifiers, and cleared (${theme})`, async ({page}) => {
        await openControls(page, "customKeys", {customKey: "CUSTOM_KEY_1"}, theme);
        await expect(page.locator('[data-f^="custom-key:1:shortcut:modifier"]'), "no separate modifier grid").toHaveCount(0);
        await page.locator('[data-act="pick-shortcut"]').click();
        await expect(page.locator(".picker")).toBeVisible();
        await expect(page.locator(".picker .pk-mods")).toHaveCount(1);
        // Left Ctrl and Right Alt together: a single keycode cannot, a shortcut can.
        await page.locator('.picker [data-mod="C"]').click();
        await page.locator('.picker [data-mod="RALT"]').click();
        await page.locator("#pickerSearch").fill("KC_K");
        await page.locator('.picker [data-pick="KC_K"]').first().click();
        await expect(page.locator(".picker .pk-problem")).toHaveCount(0);
        await expect(page.locator(".picker .pk-value")).toHaveText(/^Left Ctrl \+ Right (Alt|Option) \+ K$/);
        await page.locator('.picker [data-act="use"]').click();
        await expect.poll(() => posted(page)).toEqual([shortcut(0x41, 0x0e)]);

        // Modifiers alone are a shortcut too.
        await clearPosts(page);
        await page.locator('[data-act="pick-shortcut"]').click();
        for (const mod of ["C", "S", "A", "G"]) await page.locator(`.picker [data-mod="${mod}"]`).click();
        await page.locator('.picker [data-act="use"]').click();
        await expect.poll(() => posted(page)).toEqual([shortcut(0x0f, 0)]);

        // Publish a model in which the key has the mixed-side shortcut, as the
        // core would after staging: the field shows it, the picker opens with
        // its modifiers on, and Clear posts none.
        await page.evaluate(async () => {
            const store = await import("/webview/store.mjs");
            const model = structuredClone(store.getModel());
            Object.assign(model.customKeys[1], {shortcut: {mods: 0x41, key: 0x0e, layers: 0, layerKind: 0}, shortcutLabel: "Left Ctrl + Right Alt + K"});
            store.setModel(model); store.render();
            window.__posted.length = 0;
        });
        await expect(page.locator('[data-f="custom-key:1:shortcut"]')).toHaveValue("Left Ctrl + Right Alt + K");
        await page.locator('[data-act="pick-shortcut"]').click();
        await expect(page.locator('.picker [data-mod="C"]')).toHaveClass(/\bon\b/);
        await expect(page.locator('.picker [data-mod="RALT"]')).toHaveClass(/\bon\b/);
        await page.locator('.picker [data-act="cancel"]').first().click();
        expect(await posted(page)).toEqual([]);
        await page.locator('[data-act="clear-shortcut"]').click();
        await expect.poll(() => posted(page)).toEqual([shortcut(0, 0)]);
    });
}

// A shortcut can hold layers too (firmware D-F26): the picker's Layers
// section is a switch per layer, any number on; the base layer and the
// default layers are dimmed and say why. Layers alone are a shortcut.
test("a custom key's shortcut picks several layers, with the always-on ones dimmed", async ({page}) => {
    await openControls(page, "customKeys", {customKey: "CUSTOM_KEY_1"});
    await page.locator('[data-act="pick-shortcut"]').click();
    await page.locator('.picker [data-sec="layers"]').click();
    const base = page.locator('.picker .layer-table-row.unusable', {has: page.locator('[data-f="picker:shortcut-layer:0"]')});
    await expect(base).toContainText("base layer, always on");
    await expect(page.locator('.picker [data-f="picker:shortcut-layer:0"]')).toBeDisabled();
    await page.locator('.picker [data-f="picker:shortcut-layer:3"]').check({force: true});
    await page.locator('.picker [data-f="picker:shortcut-layer:5"]').check({force: true});
    await page.locator('.picker [data-mod="G"]').click();
    await expect(page.locator(".picker .pk-value")).toHaveText(/^Left (Command|GUI|Win|Super) \+ Navigation \+ Extra 1$/);
    await expect(page.locator('.picker [data-unlayer="5"]')).toHaveCount(1);
    await page.locator('.picker [data-act="use"]').click();
    await expect.poll(() => posted(page)).toEqual([shortcut(0x08, 0, (1 << 3) | (1 << 5))]);

    // Layers alone, with one taken off again by its chip.
    await clearPosts(page);
    await page.evaluate(async () => {
        const store = await import("/webview/store.mjs");
        const model = structuredClone(store.getModel());
        Object.assign(model.customKeys[1], {shortcut: {mods: 0, key: 0, layers: 0b101000, layerKind: 0}, shortcutLabel: "Navigation + Extra 1"});
        store.setModel(model); store.render();
        window.__posted.length = 0;
    });
    await page.locator('[data-act="pick-shortcut"]').click();
    await page.locator('.picker [data-sec="layers"]').click();
    await expect(page.locator('.picker [data-f="picker:shortcut-layer:3"]')).toBeChecked();
    await page.locator('.picker [data-unlayer="3"]').click();
    await page.locator('.picker [data-act="use"]').click();
    await expect.poll(() => posted(page)).toEqual([shortcut(0, 0, 1 << 5)]);
});

// How a shortcut turns its layers on is chosen beside them, as one layer key
// would (firmware D-F26): nothing to choose until a layer is on, each kind
// posts with the layers, the label leads the layers with its verb, and
// Clear goes back to Hold.
test("a shortcut's layers can be locked, moved to, tap-toggled or one-shot, and each posts", async ({page}) => {
    await openControls(page, "customKeys", {customKey: "CUSTOM_KEY_1"});
    const kind = (value) => page.locator(`.picker [data-f="picker:shortcut-layer-kind:${value}"]`);
    for (const [value, verb] of [[1, "Lock"], [2, "Move to"], [3, "Tap-toggle"], [4, "One-shot"]]) {
        await clearPosts(page);
        await page.locator('[data-act="pick-shortcut"]').click();
        await page.locator('.picker [data-sec="layers"]').click();
        await expect(kind(0)).toBeChecked();
        await expect(kind(value), "nothing to choose before a layer is on").toBeDisabled();
        await page.locator('.picker [data-f="picker:shortcut-layer:3"]').check({force: true});
        await page.locator('.picker [data-f="picker:shortcut-layer:5"]').check({force: true});
        await kind(value).check({force: true});
        await expect(kind(value)).toBeChecked();
        await expect(page.locator(".picker .pk-value")).toHaveText(`${verb} Navigation + Extra 1`);
        await expect(page.locator(".picker .layer-table-head")).not.toContainText("Held on while the shortcut is");
        await page.locator('.picker [data-act="use"]').click();
        await expect.poll(() => posted(page)).toEqual([shortcut(0, 0, (1 << 3) | (1 << 5), value)]);
    }

    // Opened on a shortcut that locks, the choice shows Lock; Clear goes back
    // to Hold and to nothing to choose.
    await page.evaluate(async () => {
        const store = await import("/webview/store.mjs");
        const model = structuredClone(store.getModel());
        Object.assign(model.customKeys[1], {shortcut: {mods: 0x08, key: 0, layers: 0b1000, layerKind: 1}, shortcutLabel: "Left GUI + Lock Navigation"});
        store.setModel(model); store.render();
    });
    await page.locator('[data-act="pick-shortcut"]').click();
    await page.locator('.picker [data-sec="layers"]').click();
    await expect(kind(1)).toBeChecked();
    await page.locator('.picker [data-act="clear"]').click();
    await expect(kind(0)).toBeChecked();
    await expect(kind(0)).toBeDisabled();
    await page.locator('.picker [data-act="cancel"]').first().click();

    // Switching the last layer off goes back to Hold too: switching one on
    // again does not bring the old kind back.
    await page.locator('[data-act="pick-shortcut"]').click();
    await page.locator('.picker [data-sec="layers"]').click();
    await expect(kind(1)).toBeChecked();
    await page.locator('.picker [data-f="picker:shortcut-layer:3"]').uncheck({force: true});
    await expect(kind(0)).toBeChecked();
    await page.locator('.picker [data-f="picker:shortcut-layer:5"]').check({force: true});
    await expect(kind(0)).toBeChecked();
    await expect(kind(1)).not.toBeChecked();
    await page.locator('.picker [data-act="cancel"]').first().click();
});

test("the picker refuses a key a shortcut cannot hold", async ({page}) => {
    await openControls(page, "customKeys", {customKey: "CUSTOM_KEY_1"});
    await page.locator('[data-act="pick-shortcut"]').click();
    await page.locator("#pickerSearch").fill("KC_AUDIO_MUTE");
    await expect(page.locator('.picker [data-pick="KC_AUDIO_MUTE"]')).toHaveCount(0);
    await page.locator('.picker [data-act="cancel"]').first().click();
    expect(await posted(page)).toEqual([]);
});

// A modifier key is its modifier and a shifted symbol is Shift and its key,
// both of which a shortcut holds, so the shortcut picker's board, Symbols and
// More keys are the Keys screen's. Picked, `!` is the 1 key with Left Shift
// lit, and reopens that way; the board's Shift key is the Shift button.
test("the shortcut picker offers the modifier keys and shifted symbols, as modifiers and their key", async ({page}) => {
    const keysOf = (selector) => page.locator(selector).evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-pick")));
    const open = {};
    await openControls(page, "keys");
    await page.evaluate(async () => (await import("/webview/ui/keys/key-edits.mjs")).pickKeycodeFor(27));
    open.board = await keysOf(".picker .pkb [data-pick]");
    expect(open.board).toContain("KC_LSFT");
    for (const section of ["symbols", "more"]) {
        await page.locator(`.picker [data-sec="${section}"]`).click();
        open[section] = await keysOf(".picker .pk-rows [data-pick]");
    }
    expect(open.symbols).toContain("KC_EXLM");
    expect(open.more).toContain("KC_LEFT_CTRL");
    await page.locator('.picker [data-act="cancel"]').first().click();

    await page.locator('[data-screen="customKeys"]').click();
    await page.evaluate(async () => {
        const store = await import("/webview/store.mjs");
        store.state.customKey = "CUSTOM_KEY_1"; store.render();
    });
    await page.locator('[data-act="pick-shortcut"]').click();
    expect(await keysOf(".picker .pkb [data-pick]")).toEqual(open.board);
    await page.locator('.picker .pkb [data-pick="KC_LSFT"]').click();
    await expect(page.locator('.picker [data-mod="S"]')).toHaveClass(/\bon\b/);
    await expect(page.locator('.picker .pkb [data-pick="KC_LSFT"]')).toHaveClass(/\bon\b/);
    await page.locator('.picker .pkb [data-pick="KC_LSFT"]').click();
    await expect(page.locator('.picker [data-mod="S"]')).not.toHaveClass(/\bon\b/);
    await page.locator('.picker [data-sec="more"]').click();
    expect(await keysOf(".picker .pk-rows [data-pick]")).toEqual(open.more);
    await page.locator('.picker [data-sec="symbols"]').click();
    expect(await keysOf(".picker .pk-rows [data-pick]")).toEqual(open.symbols);
    await page.locator('.picker [data-pick="KC_EXLM"]').click();
    await expect(page.locator('.picker [data-mod="S"]')).toHaveClass(/\bon\b/);
    await expect(page.locator('.picker [data-pick="KC_EXLM"]')).toHaveClass(/\bon\b/);
    await expect(page.locator(".picker .pk-value")).toHaveText("Left Shift + 1");
    await clearPosts(page);
    await page.locator('.picker [data-act="use"]').click();
    await expect.poll(() => posted(page)).toEqual([shortcut(0x02, 0x1e)]);

    await page.evaluate(async () => {
        const store = await import("/webview/store.mjs");
        const model = structuredClone(store.getModel());
        Object.assign(model.customKeys[1], {shortcut: {mods: 0x02, key: 0x1e, layers: 0, layerKind: 0}, shortcutLabel: "Left Shift + 1"});
        store.setModel(model); store.render();
    });
    await page.locator('[data-act="pick-shortcut"]').click();
    await page.locator('.picker [data-sec="symbols"]').click();
    await expect(page.locator('.picker [data-pick="KC_EXLM"]')).toHaveClass(/\bon\b/);
    // Shift off again is the 1 key alone.
    await page.locator('.picker [data-mod="S"]').click();
    await expect(page.locator('.picker [data-pick="KC_EXLM"]')).not.toHaveClass(/\bon\b/);
    await expect(page.locator(".picker .pk-value")).toHaveText("1");
});

// A layout key's picker offers an unused custom key for modifiers no keycode
// can hold — two or more from each side — and makes it in one draft step:
// named, given the shortcut and placed on that key (D-L63).
test("the Keys screen's picker offers a custom key for Ctrl and Shift on both sides, and places it", async ({page}) => {
    await openControls(page, "keys");
    await page.evaluate(async () => (await import("/webview/ui/keys/key-edits.mjs")).pickKeycodeFor(27));
    await expect(page.locator(".picker")).toBeVisible();
    // The picker starts on the key already there; take it off for modifiers alone.
    await page.locator('.picker [data-remove="0"]').click();
    for (const mod of ["C", "S", "RCTL", "RSFT"]) await page.locator(`.picker [data-mod="${mod}"]`).click();
    const offer = page.locator('.picker [data-act="use-custom-key"]');
    await expect(offer).toHaveText(/^Use Custom key \d+$/);
    await expect(page.locator(".picker .pk-offer")).toContainText("No keycode can hold");
    // The footer names the modifiers picked, and shows no keycode value for them.
    const chips = page.locator(".picker .sheet-f [data-unmod]");
    await expect(chips).toHaveCount(4);
    await expect(page.locator(".picker .sheet-f")).not.toContainText("nothing picked yet");
    await expect(page.locator(".picker .pk-value")).toHaveText("—");
    // Its ✕ takes a modifier off, as its button does: Left Ctrl + Left Shift + Right Shift is a keycode.
    await page.locator('.picker .sheet-f [data-unmod="RCTL"]').click();
    await expect(chips).toHaveCount(3);
    await expect(page.locator('.picker [data-mod="RCTL"]')).not.toHaveClass(/\bon\b/);
    await expect(page.locator(".picker .pk-value")).toHaveText("S(C(KC_RIGHT_SHIFT))");
    await page.locator('.picker [data-mod="RCTL"]').click();
    const slot = Number((await offer.textContent()).match(/\d+/)[0]);
    const layer = await page.evaluate(async () => (await import("/webview/store.mjs")).currentLayer()?.name);
    await clearPosts(page);
    await offer.click();
    await expect(page.locator(".picker")).toHaveCount(0);
    await expect.poll(() => posted(page)).toEqual([expect.objectContaining({type: "updateCustomKeyShortcut", keycode: `CUSTOM_KEY_${slot}`,
        shortcut: {mods: 0x33, key: 0, layers: 0, layerKind: 0}, name: "LCtrl+LShift+RCtrl+RShift",
        then: {type: "updateLayoutKeys", layer, changes: [{layoutIndex: 27, keycode: `CUSTOM_KEY_${slot}`}]}})]);

    // One side and a key is an ordinary keycode: no offer.
    await page.evaluate(async () => (await import("/webview/ui/keys/key-edits.mjs")).pickKeycodeFor(27));
    await page.locator('.picker [data-mod="G"]').click();
    await page.locator('.picker [data-pick="KC_C"]').first().click();
    await expect(page.locator('.picker [data-act="use-custom-key"]')).toHaveCount(0);
    await expect(page.locator('.picker [data-act="use"]')).toBeEnabled();
});

// A custom key that already sends the modifiers is used, not another made:
// on a layout key only one without a behaviour, since the key runs it there.
test("the picker uses a custom key that already holds the shortcut", async ({page}) => {
    await openControls(page, "keys");
    await page.evaluate(async () => {
        const store = await import("/webview/store.mjs");
        const model = structuredClone(store.getModel());
        Object.assign(model.customKeys[3], {name: "Ctrl Shift both", hasBehavior: false, shortcut: {mods: 0x33, key: 0, layers: 0, layerKind: 0}, shortcutLabel: "Left Ctrl + Left Shift + Right Ctrl + Right Shift"});
        store.setModel(model); store.render();
    });
    await page.evaluate(async () => (await import("/webview/ui/keys/key-edits.mjs")).pickKeycodeFor(27));
    await page.locator('.picker [data-remove="0"]').click();
    for (const mod of ["C", "S", "RCTL", "RSFT"]) await page.locator(`.picker [data-mod="${mod}"]`).click();
    await expect(page.locator('.picker [data-act="use-custom-key"]')).toHaveCount(0);
    const reuse = page.locator('.picker [data-act="use-existing-key"]');
    await expect(reuse).toHaveText("Use Custom key 3 · Ctrl Shift both");
    const layer = await page.evaluate(async () => (await import("/webview/store.mjs")).currentLayer()?.name);
    await clearPosts(page);
    await reuse.click();
    await expect.poll(() => posted(page)).toEqual([expect.objectContaining({type: "updateLayoutKeys", layer, changes: [{layoutIndex: 27, keycode: "CUSTOM_KEY_3"}]})]);
});

// A behaviour cell takes the same offer: the custom key is made and the cell
// sends it, in one message.
test("a behaviour cell's picker makes a custom key for mixed-side modifiers, and sends it", async ({page}) => {
    await openControls(page, "customKeys", {customKey: "CUSTOM_KEY_5"});
    await page.locator('.custom-key-behaviour [data-cell="0-hold"]').click();
    await page.locator('.cell-editor [data-act="pick"]').click();
    for (const mod of ["C", "S", "RCTL", "RSFT"]) await page.locator(`.picker [data-mod="${mod}"]`).click();
    const offer = page.locator('.picker [data-act="use-custom-key"]');
    await expect(offer).toHaveText(/^Use Custom key \d+$/);
    const slot = Number((await offer.textContent()).match(/\d+/)[0]);
    await clearPosts(page);
    await offer.click();
    await expect.poll(() => posted(page)).toEqual([expect.objectContaining({type: "updateCustomKeyShortcut", keycode: `CUSTOM_KEY_${slot}`, shortcut: {mods: 0x33, key: 0, layers: 0, layerKind: 0},
        then: expect.objectContaining({type: "saveBehavior", behavior: expect.objectContaining({keycode: "CUSTOM_KEY_5",
            steps: [expect.objectContaining({tapCount: 0, hold: expect.objectContaining({action: `CUSTOM_KEY_${slot}`})})]})})})]);
});

// A combo output is saved with its combo: the key is made now and becomes the
// output in the builder.
// The custom key a combo output's picker offers is made only with the combo:
// Cancel leaves the draft as it was, and Keep posts both as one step.
test("a combo output's picker fills the output with a custom key made only when the combo is kept", async ({page}) => {
    await openControls(page, "keys", {tab: "combos"});
    const takeOffer = async () => {
        await page.getByRole("button", {name: "New combo", exact: true}).click();
        await page.locator('[data-act="pickout"]').click();
        for (const mod of ["S", "A", "RSFT", "RALT"]) await page.locator(`.picker [data-mod="${mod}"]`).click();
        const offer = page.locator('.picker [data-act="use-custom-key"]');
        const slot = Number((await offer.textContent()).match(/\d+/)[0]);
        await clearPosts(page);
        await offer.click();
        await expect(page.locator("[data-output]")).toHaveValue(`CUSTOM_KEY_${slot}`);
        await expect(page.locator(".combo-builder")).toContainText("once you keep this combo");
        return slot;
    };
    const inputs = () => page.evaluate(async () => {
        const store = await import("/webview/store.mjs");
        store.state.combo.inputs = ["KC_A", "KC_B"]; store.render();
    });
    await takeOffer();
    await page.locator('.combo-builder [data-act="cancel"]').click();
    expect(await posted(page)).toEqual([]);

    const slot = await takeOffer();
    await inputs();
    await page.locator('.combo-builder [data-act="keep"]').click();
    await expect.poll(() => posted(page)).toEqual([expect.objectContaining({type: "updateCustomKeyShortcut", keycode: `CUSTOM_KEY_${slot}`, shortcut: {mods: 0x66, key: 0, layers: 0, layerKind: 0},
        then: expect.objectContaining({type: "addCombo", output: `CUSTOM_KEY_${slot}`, inputs: ["KC_A", "KC_B"]})})]);

    // Picking another output after the offer makes no key.
    await page.evaluate(async () => { const store = await import("/webview/store.mjs"); store.closeComboBuilder(); store.render(); });
    await takeOffer();
    await page.locator('[data-act="pickout"]').click();
    await page.locator('.picker [data-remove="0"]').click();
    await page.locator('.picker [data-pick="KC_E"]').first().click();
    await page.locator('.picker [data-act="use"]').click();
    await inputs();
    await page.locator('.combo-builder [data-act="keep"]').click();
    await expect.poll(() => posted(page)).toEqual([expect.objectContaining({type: "addCombo", output: "KC_E"})]);
});

// On a layout key a matching custom key that has a behaviour would run it
// too: the picker offers it beside a new key, and either choice works.
test("a matching custom key with a behaviour is offered beside a new one on a layout key", async ({page}) => {
    await openControls(page, "keys");
    await page.evaluate(async () => {
        const store = await import("/webview/store.mjs");
        const model = structuredClone(store.getModel());
        Object.assign(model.customKeys[3], {name: "Ctrl Shift both", hasBehavior: true, shortcut: {mods: 0x33, key: 0, layers: 0, layerKind: 0}, shortcutLabel: "Left Ctrl + Left Shift + Right Ctrl + Right Shift"});
        store.setModel(model); store.render();
    });
    const open = async () => {
        await page.evaluate(async () => (await import("/webview/ui/keys/key-edits.mjs")).pickKeycodeFor(27));
        await page.locator('.picker [data-remove="0"]').click();
        for (const mod of ["C", "S", "RCTL", "RSFT"]) await page.locator(`.picker [data-mod="${mod}"]`).click();
    };
    await open();
    await expect(page.locator(".picker .pk-offer")).toContainText("with its behaviour on top");
    await expect(page.locator('.picker [data-act="use-existing-key"]')).toHaveText("Use Custom key 3 · Ctrl Shift both");
    const make = page.locator('.picker [data-act="use-custom-key"]');
    await expect(make).toHaveText(/^Make Custom key \d+$/);
    const layer = await page.evaluate(async () => (await import("/webview/store.mjs")).currentLayer()?.name);
    await clearPosts(page);
    await page.locator('.picker [data-act="use-existing-key"]').click();
    await expect.poll(() => posted(page)).toEqual([expect.objectContaining({type: "updateLayoutKeys", layer, changes: [{layoutIndex: 27, keycode: "CUSTOM_KEY_3"}]})]);
    await open();
    const slot = Number((await make.textContent()).match(/\d+/)[0]);
    expect(slot).not.toBe(3);
    await clearPosts(page);
    await make.click();
    await expect.poll(() => posted(page)).toEqual([expect.objectContaining({type: "updateCustomKeyShortcut", keycode: `CUSTOM_KEY_${slot}`, shortcut: {mods: 0x33, key: 0, layers: 0, layerKind: 0}})]);
});

// In a behaviour cell the step sends only the shortcut, never the matching
// key's behaviour, so the match is used as it is with nothing new offered.
test("a behaviour cell uses a matching custom key even when it has a behaviour", async ({page}) => {
    await openControls(page, "customKeys", {customKey: "CUSTOM_KEY_5"});
    await page.evaluate(async () => {
        const store = await import("/webview/store.mjs");
        const model = structuredClone(store.getModel());
        Object.assign(model.customKeys[3], {name: "Ctrl Shift both", hasBehavior: true, shortcut: {mods: 0x33, key: 0, layers: 0, layerKind: 0}, shortcutLabel: "Left Ctrl + Left Shift + Right Ctrl + Right Shift"});
        store.setModel(model); store.render();
    });
    await page.locator('.custom-key-behaviour [data-cell="0-hold"]').click();
    await page.locator('.cell-editor [data-act="pick"]').click();
    for (const mod of ["C", "S", "RCTL", "RSFT"]) await page.locator(`.picker [data-mod="${mod}"]`).click();
    await expect(page.locator('.picker [data-act="use-custom-key"]')).toHaveCount(0);
    await expect(page.locator(".picker .pk-offer")).not.toContainText("behaviour on top");
    await clearPosts(page);
    await page.locator('.picker [data-act="use-existing-key"]').click();
    await expect.poll(() => posted(page)).toEqual([expect.objectContaining({type: "saveBehavior", behavior: expect.objectContaining({keycode: "CUSTOM_KEY_5",
        steps: [expect.objectContaining({hold: expect.objectContaining({action: "CUSTOM_KEY_3"})})]})})]);
});

// A modifier key is a modifier: with the buttons it folds into one set,
// stored as the simplest keycode that holds it (modifierPick).
test("modifier buttons and a modifier key fold into the simplest keycode", async ({page}) => {
    await openControls(page, "keys");
    const pick = async (mods, key) => {
        await page.evaluate(async () => (await import("/webview/ui/keys/key-edits.mjs")).pickKeycodeFor(27));
        await page.locator('.picker [data-remove="0"]').click();
        for (const mod of mods) await page.locator(`.picker [data-mod="${mod}"]`).click();
        if (key) await page.locator(`.picker [data-pick="${key}"]`).first().click();
    };
    const value = page.locator(".picker .pk-value");
    // Command and the Left Command key: just Left Command.
    await pick(["G"], "KC_LGUI");
    await expect(value).toHaveText("KC_LEFT_GUI");
    await page.locator('.picker [data-act="cancel"]').first().click();
    // Command, Right Command and the Left Command key: both Commands, a keycode.
    await pick(["G", "RGUI"], "KC_LGUI");
    await expect(value).toHaveText("RGUI(KC_LEFT_GUI)");
    await expect(page.locator(".picker .pk-problem")).toHaveCount(0);
    await expect(page.locator('.picker [data-act="use-custom-key"]')).toHaveCount(0);
    const layer = await page.evaluate(async () => (await import("/webview/store.mjs")).currentLayer()?.name);
    await clearPosts(page);
    await page.locator('.picker [data-act="use"]').click();
    await expect.poll(() => posted(page)).toEqual([expect.objectContaining({type: "updateLayoutKeys", layer, changes: [{layoutIndex: 27, keycode: "RGUI(KC_LEFT_GUI)"}]})]);
    // Both Commands from the buttons alone: the same keycode.
    await pick(["G", "RGUI"]);
    await expect(value).toHaveText("RGUI(KC_LEFT_GUI)");
    await expect(page.locator('.picker [data-act="use"]')).toBeEnabled();
    await page.locator('.picker [data-act="cancel"]').first().click();
    // Two from one side alone is a keycode too, not a custom key.
    await pick(["C", "S"]);
    await expect(value).toHaveText("S(KC_LEFT_CTRL)");
    await expect(page.locator(".picker .pk-problem")).toHaveCount(0);
    await expect(page.locator('.picker [data-act="use"]')).toBeEnabled();
});

// The board's hover card draws a custom key's shortcut as its behaviour rows
// draw what they send: the keys as key chips, each layer by its mark and name.
test("the hover card draws a shortcut's keys and layers as the behaviour rows do", async ({page}) => {
    await openControls(page, "keys");
    const AT = 46;
    const place = (shortcut, shortcutLabel, shortcutKeys) => page.evaluate(async ({AT, shortcut, shortcutLabel, shortcutKeys}) => {
        const {getModel} = await import("/webview/store.mjs");
        const model = structuredClone(getModel());
        const key = model.customKeys.find(row => row.slot === 1);
        Object.assign(key, {hasBehavior: false, shortcut, shortcutLabel, shortcutKeys});
        Object.assign(model.layers[0].positions[AT], {keycode: "CUSTOM_KEY_1", semantic: "CUSTOM_KEY_1", display: key.name || "Custom key 1", editLabel: "Custom key 1"});
        model.draft.revision++;
        window.dispatchEvent(new MessageEvent("message", {data: {type: "model", model}}));
    }, {AT, shortcut, shortcutLabel, shortcutKeys});
    const section = page.locator(".hovercard .hc-sect").filter({has: page.locator(".hc-h", {hasText: "Shortcut"})});
    const hover = async () => { await page.mouse.move(0, 0); await page.locator(`.board [data-key="${AT}"]`).first().hover(); await expect(section).toBeVisible(); };

    await place({mods: 0x08, key: 0x2c, layers: 0b101000, layerKind: 0}, "Left GUI + Space + Navigation + Extra 1", ["Left GUI", "Space"]);
    await hover();
    await expect(page.locator(".hovercard .hc-head .hc-sub"), "the header leaves the shortcut to its section").toHaveCount(0);
    await expect(section.locator(".hc-sub").first()).toHaveText("Held while the key is held, tapped when it is tapped");
    await expect(section.locator(".hc-key")).toHaveText(["Left GUI", "Space"]);
    await expect(section.locator(".hc-layers .sends-name")).toHaveText(["Navigation", "Extra 1"]);
    await expect(section.locator(".hc-layers .sends-tag")).toHaveText(["hold", "hold"]);
    expect(await section.locator(".hc-layers .kind-icon.layer").count(), "each layer by its mark").toBe(2);
    await page.locator(".hovercard").first().screenshot({path: test.info().outputPath("shortcut-hover.png")});

    // Layers alone: no Sends row.
    await place({mods: 0, key: 0, layers: 0b1000, layerKind: 0}, "Navigation", []);
    await hover();
    await expect(section.locator(".hc-key")).toHaveCount(0);
    await expect(section.locator(".hc-stage")).toHaveText(["Layers"]);

    // A lock tags its layers as locked, and says what that does.
    await place({mods: 0, key: 0, layers: 0b101000, layerKind: 1}, "Lock Navigation + Extra 1", []);
    await hover();
    await expect(section.locator(".hc-sub").first()).toHaveText("When the key is pressed");
    await expect(section.locator(".hc-layers .sends-tag")).toHaveText(["lock", "lock"]);
    await expect(section.locator(".hc-layers .hc-under")).toHaveText("layers · locks them on, or off when all are on");
    await page.locator(".hovercard").first().screenshot({path: test.info().outputPath("lock-hover.png")});
    await page.locator(".hovercard").first().screenshot({path: test.info().outputPath("layers-hover.png")});
});
