// @ts-check
"use strict";
const {test, expect} = require("@playwright/test");
const {openControls, publishAccepted} = require("./control-preview");

async function identityProblems(page) {
    return page.locator("input, select, textarea").evaluateAll(nodes => {
        const identities = nodes.map(node => node.getAttribute("data-f"));
        return nodes.flatMap((node, index) => !identities[index] || identities.indexOf(identities[index]) !== index
            ? [node.outerHTML] : []);
    });
}

const surfaces = [
    ["keys", {tab: "key"}], ["keys", {tab: "behaviours", behaviourRow: "KC_LEFT_GUI", cell: "1-hold"}],
    ["keys", {tab: "combos"}], ["keys", {layersOpen: true}],
    ["settings", {settingsOpen: ["keyBehavior", "comboSettings", "autoMouse", "mouse"]}],
    ["mouse", {}], ["customKeys", {}], ["macros", {macroSlot: "VIA_MACRO_17"}],
    ["lighting", {}],
    ...[0, 4, 8].map(pdSlot => ["pointing", {pdSlot, pdAdvanced: true}]),
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
        if (screen === "pointing" && state.pdSlot === 4) {
            await page.evaluate(async () => {
                const store = await import("/webview/store.mjs");
                const model = structuredClone(store.getModel()); model.pdModes[4].axis = 3;
                for (const key of Object.keys(model.pdModes[4].diagonals)) model.pdModes[4].diagonals[key].keycode = 4;
                store.setModel(model); store.render();
            });
        }
        await page.locator("details:not([open])").evaluateAll(nodes => nodes.forEach(node => {
            node.open = true; node.dispatchEvent(new Event("toggle"));
        }));
        await page.waitForTimeout(30);
        expect(await identityProblems(page)).toEqual([]);
        const ids = await page.locator("input:visible:enabled, select:visible:enabled, textarea:visible:enabled")
            .evaluateAll(nodes => nodes.map(node => node.getAttribute("data-f")));
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
    await openControls(page, "pointing", {pdSlot: 0});
    const input = page.locator(".pd-identity label").filter({has: page.getByText("Name", {exact: true})}).locator("input");
    await input.focus();
    await input.evaluate(node => node.setSelectionRange(2, 5));
    const previous = await input.elementHandle();
    await publishAccepted(page, ["pdModes", 0, "name"], "Dragscroll");
    expect(await previous.evaluate(node => node.isConnected)).toBe(false);
    await expect(input).toBeFocused();
    expect(await input.evaluate(node => [node.selectionStart, node.selectionEnd])).toEqual([2, 5]);
});

test("Settings search uses shared focus restoration and retains the editing caret", async ({page}) => {
    await openControls(page, "settings");
    const search = page.locator("#settingsSearch");
    await search.fill("timing");
    await search.evaluate(node => node.setSelectionRange(2, 4));
    const old = await search.elementHandle();
    await page.keyboard.insertText("X");
    expect(await old.evaluate(node => node.isConnected)).toBe(false);
    await expect(search).toBeFocused();
    await expect(search).toHaveValue("tiXng");
    expect(await search.evaluate(node => [node.selectionStart, node.selectionEnd])).toEqual([3, 3]);
});

test("picker search has a unique identity beside its underlying editor", async ({page}) => {
    await openControls(page, "pointing", {pdSlot: 4});
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
    await openControls(page, "macros", {macroSlot: "VIA_MACRO_17"});
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
        const {captureFocus, restoreFocus} = await import("/webview/lib/focus.mjs");
        const root = document.createElement("div"); document.body.append(root);
        root.innerHTML = '<input data-f="duplicate"><input data-f="duplicate">';
        root.querySelector("input").focus();
        const ambiguous = captureFocus(root);
        root.innerHTML = '<input data-f="stable">'; root.querySelector("input").focus();
        const form = captureFocus(root);
        root.innerHTML = '<input data-f="stable"><input data-f="stable">'; restoreFocus(root, form);
        const refusesReplacement = !root.contains(document.activeElement);
        const restored = [];
        for (const markup of ['<button data-act="test">Action</button>', '<svg><g data-key="42" role="button" tabindex="0"></g></svg>']) {
            root.innerHTML = markup; root.querySelector("[data-act], [data-key]").focus();
            const captured = captureFocus(root); root.innerHTML = markup; restoreFocus(root, captured);
            restored.push(root.contains(document.activeElement));
        }
        root.remove(); return {ambiguous, refusesReplacement, restored};
    });
    expect(result).toEqual({ambiguous: null, refusesReplacement: true, restored: [true, true]});
});
