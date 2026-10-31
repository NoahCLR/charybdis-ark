// @ts-check
"use strict";
const {test, expect} = require("@playwright/test");
const {openControls, publishAccepted, clearPosts, posted} = require("./control-preview");

async function identityProblems(page) {
    return page.locator("input, select, textarea").evaluateAll(nodes => {
        const identities = nodes.map(node => node.getAttribute("data-f"));
        return nodes.flatMap((node, index) => !identities[index] || identities.indexOf(identities[index]) !== index
            ? [node.outerHTML] : []);
    });
}

const surfaces = [
    ["keys", {tab: "key"}], ["keys", {tab: "behaviours", behaviourRow: "KC_LEFT_GUI", cell: "1-hold", cellRow: "KC_LEFT_GUI"}],
    ["keys", {tab: "combos"}], ["keys", {layersOpen: true}],
    ["behaviours", {}], ["combos", {}], ["pointer", {}], ["host", {}], ["customKeys", {}], ["macros", {macroSlot: "MACRO_17"}],
    ...["base", "layers", "auto", "pd", "combo", "key", "groups"].map(stage =>
        ["lighting", {stage, layer: 1, pointingSlot: 0, feedbackRow: "holdActiveColor"}]),
    ...[0, 4, 8].map(pointingSlot => ["pointing", {pointingSlot, pdAdvanced: true}]),
];

for (const [screen, state] of surfaces) {
    test(`${screen} ${JSON.stringify(state)}: unique identities and focus after a model publish`, async ({page}) => {
        test.setTimeout(90000);
        await openControls(page, screen, state);
        if (screen === "keys" && state.tab === "combos") {
            await page.evaluate(async () => {
                const store = await import("/webview/store.mjs");
                store.openComboBuilder(store.getModel().combos[0]); store.render();
            });
        }
        if (screen === "macros") await page.locator("[data-raw-toggle]").click();
        // Visit the complete forms, including collapsed settings, modifier
        // masks, diagonals and tuning controls that are absent by default.
        if (screen === "pointing" && state.pointingSlot === 4) {
            await page.evaluate(async () => {
                const store = await import("/webview/store.mjs");
                const model = structuredClone(store.getModel()); model.pdModes[4].axis = 3;
                for (const key of Object.keys(model.pdModes[4].diagonals)) model.pdModes[4].diagonals[key].keycode = 4;
                store.setModel(model); store.render();
            });
        }
        if (screen === "lighting" && state.stage === "auto") {
            await page.evaluate(async () => {
                const store = await import("/webview/store.mjs");
                const model = structuredClone(store.getModel()); model.rgb.automouseFade.mode = "END_COLOR_ON_ALL_KEYS";
                store.setModel(model); store.render();
            });
        }
        // The browser's own toggle event follows each opening, as a task:
        // wait for every one, so what the screen keeps of its folds has
        // caught up before the publishes below draw it again.
        await page.locator("details:not([open])").evaluateAll(nodes => Promise.all(nodes.map(node => {
            const toggled = new Promise(resolve => node.addEventListener("toggle", event => {if (event.isTrusted) resolve(undefined);}));
            node.open = true; node.dispatchEvent(new Event("toggle"));
            return toggled;
        })));
        expect(await identityProblems(page)).toEqual([]);
        const ids = await page.locator("input:visible:enabled, select:visible:enabled, textarea:visible:enabled")
            .evaluateAll(nodes => nodes.map(node => node.getAttribute("data-f")));
        // The background effect is edited on its stage; its effect and LED
        // choices wait for the keyboard's options, which the fixture lacks.
        if (screen === "lighting" && state.stage === "base") expect(ids).toEqual(expect.arrayContaining(["lighting:base:stage:colour:0", "setting:effectSpeed"]));
        // All lighting and its idle timeout sit above every stage.
        if (screen === "lighting") expect(ids).toEqual(expect.arrayContaining(["setting:lightingEnabled", "setting:lightingTimeout"]));
        expect(ids.length, "the editor exposes a form control").toBeGreaterThan(0);
        // Each assertion crosses the actual receiver's full-DOM accepted-edit
        // path; retaining the same node cannot satisfy it.
        for (const id of ids) {
            const control = page.locator(`[data-f=${JSON.stringify(id)}]`);
            await control.evaluate(node => {
                for (let ancestor = node.parentElement; ancestor; ancestor = ancestor.parentElement) {
                    if (ancestor.tagName === "DETAILS") ancestor.open = true;
                }
            });
            await control.focus();
            const old = await control.elementHandle();
            await publishAccepted(page, [], undefined);
            expect(await old.evaluate(node => node.isConnected), id).toBe(false);
            await expect(control, id).toBeFocused();
        }
    });
}

test("Pointing name preserves focus and caret across an accepted edit", async ({page}) => {
    await openControls(page, "pointing", {pointingSlot: 0});
    const input = page.locator(".pd-identity label").filter({has: page.getByText("Name", {exact: true})}).locator("input");
    await input.focus();
    await input.evaluate(node => node.setSelectionRange(2, 5));
    const previous = await input.elementHandle();
    await publishAccepted(page, ["pdModes", 0, "name"], "Dragscroll");
    expect(await previous.evaluate(node => node.isConnected)).toBe(false);
    await expect(input).toBeFocused();
    expect(await input.evaluate(node => [node.selectionStart, node.selectionEnd])).toEqual([2, 5]);
});

// A name commits on Enter or blur, so a model arriving while it is typed (the
// live watch reading the keyboard, say) must not throw the typing away.
test("a name typed but not yet confirmed survives a redraw that renders the same name", async ({page}) => {
    await openControls(page, "device");
    const title = page.locator('[data-f="keyboard:name"]');
    await title.click();
    await title.fill("Desk 777");
    await title.evaluate(node => node.setSelectionRange(2, 4));
    const previous = await title.elementHandle();
    await publishAccepted(page, [], undefined);
    expect(await previous.evaluate(node => node.isConnected)).toBe(false);
    await expect(title).toBeFocused();
    await expect(title).toHaveValue("Desk 777");
    expect(await title.evaluate(node => [node.selectionStart, node.selectionEnd])).toEqual([2, 4]);
    await clearPosts(page);
    await title.press("Enter");
    await expect.poll(() => posted(page)).toEqual([expect.objectContaining({type: "renameKeyboard", name: "Desk 777"})]);
});

test("a name typed on after such a redraw is renamed once", async ({page}) => {
    await openControls(page, "device");
    const title = page.locator('[data-f="keyboard:name"]');
    await title.click();
    await title.fill("Desk 777");
    await publishAccepted(page, [], undefined);
    await title.press("End");
    await title.pressSequentially("8");
    await clearPosts(page);
    await title.press("Enter");
    await expect.poll(() => posted(page)).toEqual([expect.objectContaining({type: "renameKeyboard", name: "Desk 7778"})]);
});

test("a redraw that renders a different name drops the typed text for the new name", async ({page}) => {
    await openControls(page, "device");
    const title = page.locator('[data-f="keyboard:name"]');
    await title.click();
    await title.fill("Desk 777");
    await publishAccepted(page, ["keyboardName", "name"], "Travel");
    await expect(title).toBeFocused();
    await expect(title).toHaveValue("Travel");
    await clearPosts(page);
    await title.press("Enter");
    expect(await posted(page)).toEqual([]);
});

// The text such a redraw drops still goes on as the browser sent it when the
// field was thrown away, as before: held back while the redraw decided, not lost.
test("a redraw that renders a different name still sends what was typed, once", async ({page}) => {
    await openControls(page, "device");
    const title = page.locator('[data-f="keyboard:name"]');
    await title.click();
    await title.fill("Desk 777");
    await clearPosts(page);
    await publishAccepted(page, ["keyboardName", "name"], "Travel");
    await expect(title).toHaveValue("Travel");
    await expect.poll(() => posted(page)).toEqual([expect.objectContaining({type: "renameKeyboard", name: "Desk 777"})]);
    await title.press("Enter");
    await title.press("Tab");
    expect(await posted(page)).toHaveLength(1);
});

test("a name too long for the keyboard still says so after such a redraw", async ({page}) => {
    await openControls(page, "device");
    const title = page.locator('[data-f="keyboard:name"]');
    await title.click();
    await title.fill("x".repeat(40));
    await publishAccepted(page, [], undefined);
    await expect(title).toHaveValue("x".repeat(40));
    await expect(page.locator("[data-name-count]")).toHaveClass(/warn/);
});

// Any field commits on Enter, so a number kept across redraws goes into the
// draft on Enter, once, and nothing posts while the redraws come.
test("a number typed but not yet confirmed survives two redraws and is posted once on Enter", async ({page}) => {
    await openControls(page, "combos");
    const field = page.locator('[data-f="settings:combo:default"]');
    await field.click();
    await field.fill("77");
    await clearPosts(page);
    await publishAccepted(page, [], undefined);
    await publishAccepted(page, [], undefined);
    await expect(field).toBeFocused();
    await expect(field).toHaveValue("77");
    expect(await posted(page)).toEqual([]);
    await field.press("Enter");
    await expect.poll(() => posted(page)).toEqual([expect.objectContaining({type: "updateComboDefaultWindow", defaultTermMs: "77"})]);
    await field.press("Tab");
    expect(await posted(page)).toHaveLength(1);
});

// What a closed field was typed with goes on as the browser sends it when
// the field is thrown away, as before; the field shows only what is stored.
test("a field drawn closed keeps no typed text", async ({page}) => {
    await openControls(page, "combos");
    const field = page.locator('[data-f="settings:combo:default"]');
    const stored = await field.inputValue();
    await field.click();
    await field.fill("77");
    await publishAccepted(page, ["draft", "editable"], false);
    await expect(field).toBeDisabled();
    await expect(field).toHaveValue(stored);
    await publishAccepted(page, ["draft", "editable"], true);
    await expect(field).toHaveValue(stored);
});

test("picker search has a unique identity beside its underlying editor", async ({page}) => {
    await openControls(page, "pointing", {pointingSlot: 4});
    await page.locator(".pd-cross .arm.up [data-pick]").click();
    expect(await identityProblems(page)).toEqual([]);
    const search = page.locator("#pickerSearch");
    await search.fill("key");
    await search.evaluate(node => node.setSelectionRange(1, 2));
    await publishAccepted(page, [], undefined);
    await expect(search).toBeFocused();
    expect(await search.evaluate(node => [node.selectionStart, node.selectionEnd])).toEqual([1, 2]);
});

test("macro step identity moves with the step and survives edits and accepted models", async ({page}) => {
    await openControls(page, "macros", {macroSlot: "MACRO_17"});
    await page.locator('[data-insert-kind="text"]').click();
    await page.locator("[data-step-text]").fill("First");
    await page.locator("[data-step-text]").dispatchEvent("change");
    const firstId = await page.locator("[data-step-text]").getAttribute("data-f");
    await page.locator('[data-insert-kind="text"]').click();
    await page.locator('[data-step-text="1"]').fill("Second");
    await page.locator('[data-step-text="1"]').dispatchEvent("change");
    const secondId = await page.locator('[data-step-text="1"]').getAttribute("data-f");
    await page.locator('[data-step="1"] [data-move="-1"]').click();
    expect(await page.locator('[data-step-text="0"]').getAttribute("data-f")).toBe(secondId);
    expect(await page.locator('[data-step-text="1"]').getAttribute("data-f")).toBe(firstId);
    await page.locator('[data-step-tile="1"]').click();
    const first = page.locator(`[data-f=${JSON.stringify(firstId)}]`);
    await first.focus();
    await first.evaluate(node => node.setSelectionRange(1, 3));
    await publishAccepted(page, [], undefined);
    await expect(first).toBeFocused();
    expect(await first.evaluate(node => [node.selectionStart, node.selectionEnd])).toEqual([1, 3]);
    expect(await identityProblems(page)).toEqual([]);
});

test("ambiguous form identities are refused while action and SVG hooks still restore", async ({page}) => {
    await openControls(page, "keys");
    const result = await page.evaluate(async () => {
        const {redrawKeepingFocus} = await import("/webview/lib/focus.mjs");
        // The page takes markup only through the panel's policy (Trusted Types).
        const {html} = await import("/webview/lib/dom.mjs");
        const root = document.createElement("div"); document.body.append(root);
        /** @param {string} before @param {string} after */
        const restores = (before, after) => {
            root.innerHTML = html(before); /** @type {HTMLElement} */ (root.querySelector("input, [data-act], [data-key]")).focus();
            redrawKeepingFocus(root, () => {root.innerHTML = html(after);});
            return root.contains(document.activeElement);
        };
        const duplicate = '<input data-f="duplicate"><input data-f="duplicate">';
        const ambiguous = restores(duplicate, duplicate);
        const refusesReplacement = !restores('<input data-f="stable">', '<input data-f="stable"><input data-f="stable">');
        const restored = ['<button data-act="test">Action</button>', '<svg><g data-key="42" role="button" tabindex="0"></g></svg>']
            .map((markup) => restores(markup, markup));
        root.remove(); return {ambiguous, refusesReplacement, restored};
    });
    expect(result).toEqual({ambiguous: false, refusesReplacement: true, restored: [true, true]});
});

// A redraw that throws part way is still over: the text it kept commits
// when its field is left, once, as after a redraw that finished.
test("typed text kept by a redraw commits on leaving after a later redraw throws", async ({page}) => {
    await openControls(page, "keys");
    await page.evaluate(async () => {
        const {html} = await import("/webview/lib/dom.mjs");
        const root = document.createElement("div"); root.id = "redraw-root"; document.body.append(root);
        root.innerHTML = html('<input data-f="typed" value="Desk">');
        /** @type {string[]} */ (/** @type {any} */ (window).changes = []);
        root.addEventListener("change", (event) => /** @type {any} */ (window).changes.push(/** @type {HTMLInputElement} */ (event.target).value));
    });
    const field = page.locator('#redraw-root [data-f="typed"]');
    await field.click();
    await field.fill("Desk 777");
    const thrown = await page.evaluate(async () => {
        const {redrawKeepingFocus} = await import("/webview/lib/focus.mjs");
        const {html} = await import("/webview/lib/dom.mjs");
        const root = /** @type {HTMLElement} */ (document.getElementById("redraw-root"));
        redrawKeepingFocus(root, () => {root.innerHTML = html('<input data-f="typed" value="Desk">');});
        try {
            redrawKeepingFocus(root, () => {throw new Error("a screen failed to draw");});
        } catch (error) {
            return /** @type {Error} */ (error).message;
        }
        return null;
    });
    expect(thrown).toBe("a screen failed to draw");
    await expect(field).toBeFocused();
    await expect(field).toHaveValue("Desk 777");
    expect(await page.evaluate(() => /** @type {any} */ (window).changes)).toEqual([]);
    await field.evaluate((node) => /** @type {HTMLElement} */ (node).blur());
    expect(await page.evaluate(() => /** @type {any} */ (window).changes)).toEqual(["Desk 777"]);
});
