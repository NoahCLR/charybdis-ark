// @ts-check
"use strict";
const {test, expect} = require("@playwright/test");
const {openPreview} = require("./shell-page");

// The Keys workbench lists what a layer reaches in one grouped table on every
// tab, and a list never stretches it: the table scrolls in its own pane, under
// its column header, beside the editor that sets the workbench's height.
// While it scrolls, the band of the group in view sticks under that header,
// and no row shows through either of them.

const tab = (page, name) => page.locator(`.bench [data-tab="${name}"]`);
const pane = (page) => page.locator(".bench-pane .reach-table");

test("the behaviour list is a reach table that scrolls beside the editor", async ({page}) => {
    await openPreview(page);
    await tab(page, "behaviours").click();
    await expect(page.locator(".bench-pane thead th")).toHaveText(["Behaviour", "Branches"]);
    const sizes = await page.evaluate(() => {
        const list = /** @type {HTMLElement} */ (document.querySelector(".bench-pane .reach-table"));
        const editor = /** @type {HTMLElement} */ (document.querySelector(".beh-main"));
        const bench = /** @type {HTMLElement} */ (document.querySelector(".keys-bench"));
        const body = /** @type {HTMLElement} */ (document.querySelector(".bench-body"));
        const padding = parseFloat(getComputedStyle(body).paddingTop) + parseFloat(getComputedStyle(body).paddingBottom);
        const pane = /** @type {HTMLElement} */ (document.querySelector(".bench-pane"));
        return {list: list.scrollHeight, shown: list.clientHeight, pane: pane.offsetHeight, editor: editor.offsetHeight, body: body.clientHeight - padding, bench: bench.offsetHeight};
    });
    expect(sizes.list, "the fixture lists more behaviours than fit").toBeGreaterThan(sizes.shown);
    expect(sizes.pane, "the list's pane is as tall as the editor beside it").toBe(sizes.body);
    expect(Math.abs(sizes.body - sizes.editor), "the editor, not the list, sets the height").toBeLessThan(2);

    // Every tab keeps that height, and its table scrolls in the same pane.
    for (const name of ["macros", "customKeys", "pointing", "combos"]) {
        await tab(page, name).click();
        await expect(pane(page)).toHaveAttribute("data-scroll-list", name);
        expect(await page.locator(".keys-bench").evaluate((node) => /** @type {HTMLElement} */ (node).offsetHeight)).toBe(sizes.bench);
    }
});

// A rule is a see-through line, so a stuck cell is checked by its pixels:
// with every row painted red, nothing red may show from the top of the list
// to the bottom of the stuck band, whatever lies under them.
test("rows scrolling under the header and the group's band never show through", async ({page}) => {
    await openPreview(page);
    await tab(page, "behaviours").click();
    await page.addStyleTag({content: ".bench-pane tr.beh-row > td { background: #ff0000 !important; transition: none !important; }"});
    for (const scrolled of [0, 41, 100, 300]) {
        const clip = await pane(page).evaluate((node, top) => {
            node.scrollTop = top;
            const list = node.getBoundingClientRect();
            const band = /** @type {HTMLElement} */ (node.querySelector("td.t-group")).getBoundingClientRect();
            return {x: list.left, y: list.top, width: list.width, height: band.bottom - list.top - 1};
        }, scrolled);
        const shot = await page.screenshot({clip});
        const red = await page.evaluate(async (png) => {
            const image = new Image();
            image.src = `data:image/png;base64,${png}`;
            await image.decode();
            const canvas = document.createElement("canvas");
            canvas.width = image.width;
            canvas.height = image.height;
            const context = /** @type {CanvasRenderingContext2D} */ (canvas.getContext("2d"));
            context.drawImage(image, 0, 0);
            const {data} = context.getImageData(0, 0, image.width, image.height);
            let count = 0;
            for (let at = 0; at < data.length; at += 4) if (data[at] > 150 && data[at + 1] < 90 && data[at + 2] < 90) count++;
            return count;
        }, shot.toString("base64"));
        expect(red, `no row shows through the header or the band (scrolled ${scrolled})`).toBe(0);
    }
});

// Each tab is opened first in a page of its own, so no height carried over
// from another tab can stand in for the Behaviours tab's.
test("every tab is as tall as the Behaviours tab, before it is ever opened", async ({context}) => {
    /** @type {Record<string, number>} */
    const heights = {};
    for (const name of ["key", "combos", "macros", "customKeys", "pointing", "behaviours"]) {
        const page = await context.newPage();
        await openPreview(page);
        await tab(page, name).click();
        heights[name] = await page.locator(".keys-bench").evaluate((node) => /** @type {HTMLElement} */ (node).offsetHeight);
        // The editor it was measured by is gone again: one editor at most.
        await expect(page.locator(".bench-sizer")).toHaveCount(0);
        await expect(page.locator(".bgrid")).toHaveCount(name === "behaviours" ? 1 : 0);
        await page.close();
    }
    for (const name of ["key", "combos", "macros", "customKeys", "pointing"]) expect(heights[name], name).toBe(heights.behaviours);

    // Narrowed, the editor wraps taller, and the open tab follows it.
    const page = await context.newPage();
    await openPreview(page);
    await tab(page, "combos").click();
    await page.setViewportSize({width: 1000, height: 900});
    const height = () => page.locator(".keys-bench").evaluate((node) => /** @type {HTMLElement} */ (node).offsetHeight);
    await expect.poll(height, "the narrow editor is taller than the wide one").toBeGreaterThan(heights.behaviours);
    const narrowed = await height();
    await tab(page, "behaviours").click();
    expect(await height()).toBe(narrowed);
});

test("a behaviour row opens its behaviour, by click or from the keyboard", async ({page}) => {
    await openPreview(page);
    await tab(page, "behaviours").click();
    await page.locator('.bench-pane tr[data-row="KC_2"][data-route="view"] td').nth(1).click();
    await expect(page.locator('.bench-pane tr[data-row="KC_2"]')).toHaveAttribute("data-picked", "true");
    await expect(page.locator(".beh-main .beh-title code")).toHaveText("KC_2");

    await page.locator('.bench-pane tr[data-row="KC_3"][data-route="view"] .row-pick').focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".beh-main .beh-title code")).toHaveText("KC_3");
    expect(await page.evaluate(() => window.__posted.filter((message) => message.type === "saveBehavior"))).toEqual([]);
});

test("a key picked on the board scrolls its row into the list, and unfolding a group keeps the list's place", async ({page}) => {
    await openPreview(page);
    await tab(page, "behaviours").click();
    await page.locator('.board [aria-label^="KC_ENTER at"]').click();
    const row = page.locator('.bench-pane tr[data-row="KC_ENTER"][data-picked]');
    await expect(row).toHaveCount(1);
    const inView = () => row.evaluate((node) => {
        const list = /** @type {HTMLElement} */ (node.closest(".reach-table")).getBoundingClientRect();
        const head = /** @type {HTMLElement} */ (node.closest("table")?.querySelector("thead")).getBoundingClientRect();
        const box = node.getBoundingClientRect();
        return box.top >= list.top + head.height && box.bottom <= list.bottom;
    });
    expect(await inView()).toBe(true);

    await pane(page).evaluate((node) => {node.scrollTop = node.scrollHeight;});
    const bottom = await pane(page).evaluate((node) => node.scrollTop);
    await page.locator('.bench-pane [data-group="elsewhere"]').click();
    await expect(page.locator('.bench-pane [data-group="elsewhere"]')).toHaveAttribute("aria-expanded", "true");
    expect(await pane(page).evaluate((node) => node.scrollTop), "the list stays where it was, not back at the pick").toBe(bottom);
});

// Custom keys have a screen of their own and are reached as macros are, so
// they have a tab of their own too, between Macros and Pointing modes as the
// rail orders those screens.
test("the Custom keys tab lists the custom keys a layer reaches, and opens one on its screen", async ({page}) => {
    await openPreview(page);
    await expect(page.locator(".bench-tablist [data-tab] .tab-label")).toHaveText(["Key", "Behaviours", "Combos", "Macros", "Custom keys", "Pointing modes"]);
    await tab(page, "customKeys").click();
    await expect(page.locator(".bench-pane thead th")).toHaveText(["Key", "Shortcut", "Behaviour", "Reached by", ""]);
    const row = page.locator('.bench-pane tr[data-reach="view:CUSTOM_KEY_0"]');
    await expect(row).toContainText("CUSTOM_KEY_0");
    await expect(row.locator("td").nth(2).locator(".fbdot")).not.toHaveCount(0);
    // Picked, it rings the key carrying it, as a macro row does.
    await row.locator("td").first().click();
    await expect(row).toHaveAttribute("data-picked", "true");
    await expect(page.locator(".board .kc-reach")).toHaveCount(1);
    await row.locator("[data-editcustom]").click();
    await expect(page.locator('[data-screen="customKeys"]')).toHaveAttribute("aria-current", "true");
    await expect(page.locator('.mslot[data-custom-key="CUSTOM_KEY_0"]')).toHaveAttribute("aria-current", "true");

    // And back: a layer under On layers opens the tab on the key's row.
    await page.locator("[data-goto-layer]").first().click();
    await expect(tab(page, "customKeys")).toHaveAttribute("aria-selected", "true");
    await expect(page.locator('.bench-pane tr[data-reach="here:CUSTOM_KEY_0"]')).toHaveAttribute("data-picked", "true");
    expect(await page.evaluate(() => window.__posted.filter((message) => message.type !== "ready")), "looking edits nothing").toEqual([]);
});

// A pointing mode's link (firmware D-F62) shows on the Pointing modes tab: its
// Mode says which layers start it and which its key turns on, and a layer that
// starts it reaches it On this layer, named as the route.
test("the Pointing modes tab says a mode's link, and the layer that starts it reaches it", async ({page}) => {
    if (process.env.ARK_SHOT) await page.setViewportSize({width: 1900, height: 1200});
    await openPreview(page);
    await page.evaluate(async () => {
        const store = await import("/webview/store.mjs");
        const model = structuredClone(store.getModel());
        // Arrow starts from Navigation until a higher layer turns on, names the
        // pointer layer too (which the keyboard ignores in a link, so the core
        // leaves it out of linkStarts), and its key turns on Extra 1.
        Object.assign(model.pdModes.find((slot) => slot.id === 4), {linkedLayers: (1 << 3) | (1 << 4), linkTurnsOn: 1 << 5, linkEnds: 1,
            linkStarts: [{layer: 3, ends: (0xffff << 4) & 0xffff & ~(1 << 4)}]});
        // Base gets two keys that turn Navigation on: MO(3) in the "/" key's
        // place, and CUSTOM_KEY_0 (on Base already) locking Navigation.
        Object.assign(model.layers[0].positions[46], {keycode: "MO(3)", semantic: "MO(3)", display: "Navigation", editLabel: "Hold Navigation", value: 0x5223});
        Object.assign(model.customKeys.find((key) => key.keycode === "CUSTOM_KEY_0"),
            {shortcut: {mods: 0, key: 0, layers: 1 << 3, layerKind: 1}, shortcutLabel: "Lock Navigation", shortcutKeys: [], shortcutLayerNames: ["Navigation"]});
        model.qmkKeyTurnsOn = {...model.qmkKeyTurnsOn, "MO(3)": 1 << 3, "CUSTOM_KEY_0": 1 << 3};
        model.draft.revision++;
        window.dispatchEvent(new MessageEvent("message", {data: {type: "model", model}}));
        store.state.layer = 3; store.render();
    });
    await tab(page, "pointing").click();
    const group = page.locator('.bench-pane [data-group="here"]');
    if (await group.getAttribute("aria-expanded") !== "true") await group.click();
    await expect(group).toContainText("1");
    const here = pane(page).locator('tr[data-reach="here:4"]');
    const cell = (row, at) => row.locator("td").nth(at);
    // Mode, then a column for each part of the link, headed in the words the
    // vocabulary gives them.
    await expect(pane(page).locator("thead th")).toHaveText(["Slot", "Mode", "Started by", "Ends when", "Its key turns on", "Reached by", ""]);
    await expect(cell(here, 1)).toHaveText("Directional · 400 DPI");
    // The pointer layer is in the link but ignored, said with the card's reason.
    await expect(cell(here, 2)).toHaveText(/^Navigation, Pointer ignored$/);
    await expect(cell(here, 2).locator(".kind-icon.layer")).toHaveCount(2);
    await expect(cell(here, 2).locator("[data-tip]")).toHaveAttribute("data-tip", /pointer layer/);
    await expect(cell(here, 3)).toHaveText("A higher layer");
    await expect(cell(here, 4)).toHaveText(/^Extra/);
    await expect(cell(here, 5).locator(".reach-line")).toHaveText(["turning on Navigation"]);
    // Only its link starts it here, which sends neither keycode: the row says "started".
    await expect(cell(here, 0).locator(".sends-tag")).toHaveText(["started"]);
    await expect(cell(here, 0).locator("code")).toHaveCount(0);

    if (process.env.ARK_SHOT) await page.locator(".bench").screenshot({path: `${process.env.ARK_SHOT}/pointing-tab-layer.png`});

    // From Base, Base starts nothing, but a key turning Navigation on starts
    // the mode: the board rings it and Reached by says so after the key.
    await page.evaluate(async () => { const store = await import("/webview/store.mjs"); store.state.layer = 0; store.render(); });
    const fromKey = pane(page).locator('tr[data-reach="here:4"]');
    // A route a line, each as every reach tab says it: MO(3) as the board
    // names it, with its tag, and Custom key 0 with the shortcut layer that
    // starts the mode, tagged with its kind as its hover card does.
    const lines = cell(fromKey, 5).locator(".reach-line");
    await expect(lines).toHaveText([/^Navigation ?Hold$/, /^Custom key 0 · sends Navigation ?lock$/]);
    await expect(lines.nth(0).locator(".sends-tag")).toHaveText(["Hold"]);
    await expect(lines.nth(1).locator(".sends-tag")).toHaveText(["lock"]);
    await expect(cell(fromKey, 0).locator(".sends-tag")).toHaveText(["started"]);
    await fromKey.click();
    // On this view, Custom key 0's own behaviour also turns Navigation on,
    // which adds nothing to the key's own shortcut and is left out. The Right
    // Option tap locks Arrow, so the row is named by its lock keycode and that
    // line says only where it comes from; the others started it.
    const viewRow = pane(page).locator('tr[data-reach="view:4"]');
    await expect(cell(viewRow, 5).locator(".reach-line"))
        .toHaveText([/^Navigation ?Hold$/, /^Custom key 0 · sends Navigation ?lock$/, /^from Right Option KC_RIGHT_ALT · 1× ?tap$/]);
    await expect(cell(viewRow, 0).locator(".sends-tag")).toHaveText(["lock", "started"]);
    if (process.env.ARK_SHOT) {
        await page.locator(".board").first().screenshot({path: `${process.env.ARK_SHOT}/pointing-tab-board.png`});
        await page.locator(".bench").screenshot({path: `${process.env.ARK_SHOT}/pointing-tab-key.png`});
    }

    // From Extra 1, above Navigation, a key turning Navigation on would start
    // it with a higher layer already on, which ends it: Arrow is not reached
    // that way.
    await page.evaluate(async () => {
        const store = await import("/webview/store.mjs");
        const model = structuredClone(store.getModel());
        Object.assign(model.layers[5].positions[46], {keycode: "MO(3)", semantic: "MO(3)", display: "Navigation", editLabel: "Hold Navigation", value: 0x5223});
        model.draft.revision++;
        window.dispatchEvent(new MessageEvent("message", {data: {type: "model", model}}));
        store.state.layer = 5; store.render();
    });
    await expect(pane(page).locator('tr[data-reach="here:4"]')).toHaveCount(0);
    // With nothing ending it, the same key starts it.
    await page.evaluate(async () => {
        const store = await import("/webview/store.mjs");
        const model = structuredClone(store.getModel());
        Object.assign(model.pdModes.find((slot) => slot.id === 4), {linkEnds: 0, linkStarts: [{layer: 3, ends: 0}]});
        model.draft.revision++;
        window.dispatchEvent(new MessageEvent("message", {data: {type: "model", model}}));
    });
    await expect(cell(pane(page).locator('tr[data-reach="here:4"]'), 5).locator(".reach-line")).toHaveText([/^Navigation ?Hold$/]);
});
