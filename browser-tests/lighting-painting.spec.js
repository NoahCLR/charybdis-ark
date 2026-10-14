// @ts-check
"use strict";
const {test, expect} = require("@playwright/test");
const {openControls, clearPosts, expectPost, publishAccepted} = require("./control-preview");
for (const theme of ["vscode-dark", "vscode-light"]) {
    test(`layer Lighting tab posts identity, place, inheritance and opens the painter (${theme})`, async ({page}) => {
        await openControls(page, "keys", {layer: 3}, theme);
        await page.locator('.bench-tablist [data-tab="lighting"]').click();
        const tab = page.locator(".thing-lighting");await expect(tab).toContainText("What decides its lighting");
        await clearPosts(page);
        const hue = tab.locator('[data-channel="0"]');await hue.fill("177");await hue.press("Tab");
        await expectPost(page, {type: "editLightingIdentity", kind: 1, id: 3, field: "colour", slot: 1, colour: expect.objectContaining({h: 177})});
        await publishAccepted(page, [], null);
        await clearPosts(page);await tab.locator("select").selectOption("1");
        await expectPost(page, {type: "editLightingIdentity", kind: 1, id: 3, field: "place", place: 1});
        await clearPosts(page);await tab.getByRole("button", {name: "Use board default"}).click();
        await expectPost(page, {type: "editLightingIdentity", colour: "inherit"});
        await tab.getByRole("button", {name: "Customise", exact: true}).click();
        await expect(page.getByRole("region", {name: "Lighting painter"})).toBeVisible();
        await clearPosts(page);await page.locator('.painter [data-key="25"]').click();
        await expectPost(page, {type: "paintLightingMap", subject: {kind: 1, id: 3}});
    });
    test(`painter brush, selection, fill, mirror and copy each post (${theme})`, async ({page}) => {
        await openControls(page, "lighting", {}, theme);
        await page.getByRole("button", {name: "Paint keys…"}).click();
        await expect(page.locator('.painter [data-off]')).toHaveAttribute("data-tip", /real black, covering any lower rule/);
        await clearPosts(page);await page.locator('.painter [data-key="25"]').click();
        await expectPost(page, {type: "paintLightingMap", index: 0, leds: [5]});
        await page.getByRole("combobox", {name: "Select keys that…"}).selectOption("letters");
        await page.getByRole("button", {name: "Select keys", exact: true}).click();
        await clearPosts(page);await page.getByRole("button", {name: "Fill selection"}).click();
        await expectPost(page, {type: "paintLightingMap", index: 0});
        await clearPosts(page);await page.getByRole("button", {name: "Mirror left → right"}).click();
        await expectPost(page, {type: "paintLightingMap", cells: expect.any(Array)});
        await clearPosts(page);await page.getByRole("combobox", {name: "Copy painted layer"}).selectOption("3");await page.getByRole("button", {name: "Copy", exact: true}).click();
        await expectPost(page, {type: "paintLightingMap", index: 0});
        await expect(page.locator(".painter input, .painter select")).toHaveCount(6);
        expect(await page.locator(".painter input, .painter select").evaluateAll(nodes => new Set(nodes.map(n => n.getAttribute("data-f"))).size)).toBe(6);
    });
}

for (const theme of ["vscode-dark", "vscode-light"]) test(`real demo painting survives Undo, Redo, Review and backup (${theme})`, async ({page}) => {
    await page.goto("/dist/web/index.html");await page.locator('[data-act="explore-demo"]').click();
    await expect(page.locator(".bench-tablist")).toBeVisible();
    // The same host stylesheet and body class used by the extension previews.
    const fs = require("node:fs");
    const host = fs.existsSync(`preview/${theme}.html`) ? fs.readFileSync(`preview/${theme}.html`, "utf8").match(/<style>([\s\S]*?)<\/style>/)?.[1] : "@layer vscode-host { body { padding: 0 20px; } code { background: red; color: white; padding: 4px; } }";
    await page.route("**/painting-host.css", route => route.fulfill({contentType: "text/css", body: host || ""}));
    await page.addStyleTag({url: "/preview/painting-host.css"});
    const wanted = theme === "vscode-dark" ? "dark" : "light";
    if (await page.locator('[data-act="theme"]').getAttribute("data-theme-now") !== wanted) await page.locator('[data-act="theme"]').click();
    await page.locator("body").evaluate((body, theme) => body.classList.add("vscode-body", theme), theme);
    await page.locator('.bench-tablist [data-tab="lighting"]').click();await page.locator('.thing-lighting [data-customise]').click();
    const painter = page.locator(".painter");
    await painter.locator('[data-key="25"]').click();
    await expect(page.locator('[data-act="undo"]')).toBeEnabled();
    await expect(painter.locator('[data-key="25"] .kc-rect')).toHaveAttribute("style", /rgb/);
    await page.locator('[data-act="undo"]').click();
    await expect(page.locator('[data-act="redo"]')).toBeEnabled();
    await page.locator('[data-act="redo"]').click();
    await expect(page.locator('[data-act="undo"]')).toBeEnabled();
    await painter.locator('[data-query]').selectOption("letters");await painter.locator('[data-select-query]').click();
    await painter.locator('[data-fill]').click();
    await expect(painter.locator('[data-key="26"] .kc-rect')).toHaveAttribute("style", /rgb/);
    await painter.locator('[data-mirror="left"]').click();
    await expect(painter.locator('[data-key="34"] .kc-rect')).toHaveAttribute("style", /rgb/);
    await page.locator('.commit [data-act="review"]').click();
    const sheet = page.locator(".sheet");await expect(sheet).toContainText("Painted map");
    await expect(sheet.getByRole("region", {name: "Lighting memory"})).toContainText("8,192 bytes");
    await expect(sheet.locator('[data-act="apply"]')).toHaveCount(0);
    await expect(page.locator("html")).toHaveAttribute("data-theme", wanted);
    const [download] = await Promise.all([page.waitForEvent("download"), sheet.locator('[data-act="export"]').click()]);
    const file = JSON.parse(await (await download.createReadStream()).toArray().then(chunks => Buffer.concat(chunks).toString("utf8")));
    const {validateSnapshot} = require("../core/model/portable-profile"), lighting = validateSnapshot(file).rgb;
    expect(lighting.maps).toHaveLength(1);expect(lighting.rules.filter(r => r.parts.some(p => p.slot === 3 && p.kind === 4))).toHaveLength(1);
});

test("each thing editor exposes its own Lighting tab, with unavailable macro facts explained", async ({page}) => {
    await page.goto("/dist/web/index.html");await page.locator('[data-act="explore-demo"]').click();
    await expect(page.locator(".bench-tablist")).toBeVisible();
    await page.locator('.bench-tablist [data-tab="behaviours"]').click();
    await page.locator('.behaviour-rail .rowitem').first().click();
    await page.locator('.beh-main .thing-tabs [data-lighting]').click();
    await expect(page.locator('.beh-main .thing-lighting')).toContainText("Feedback colour");
    await expect(page.locator('.beh-main .thing-lighting')).toContainText("Colour by outcome");
    await page.locator('.beh-main .thing-lighting select').first().selectOption("2");
    const colour = page.locator('.beh-main .thing-lighting [data-channel="0"]');
    await colour.fill("177");await colour.press("Tab");await expect(colour).toHaveValue("177");
    const outcome = page.locator('.beh-main .thing-lighting input[type="checkbox"]');await page.locator('.beh-main .thing-lighting .sw').click();await expect(outcome).toBeChecked();
    await page.locator('.bench-tablist [data-tab="combos"]').click();
    await page.locator('.reach-table [data-reach]').first().click();
    await page.locator('#comboSide .thing-tabs [data-lighting]').click();await expect(page.locator('#comboSide .thing-lighting')).toContainText("Identity colour");
    await page.locator('[data-screen="pointing"]').click();await page.locator('.pd-page .thing-tabs [data-lighting]').click();
    await expect(page.locator('.pd-page .thing-lighting')).toContainText("Where it lights up");
    await page.locator('[data-screen="macros"]').click();await page.locator('.thing-tabs [data-lighting]').click();
    await expect(page.locator('.thing-lighting')).toContainText("does not yet offer an identity or lighting condition");
});

test("painter respects capability gates and keyboard activation posts one stroke", async ({page}) => {
    await openControls(page, "lighting");await page.getByRole("button", {name: "Paint keys…"}).click();
    await clearPosts(page);const key = page.locator('.painter [data-key="25"]');await key.focus();await key.press("Enter");
    await expectPost(page, {type: "paintLightingMap", index: 0, leds: [5]});
    await clearPosts(page);await page.locator('.painter [data-trackball]').click();
    await expectPost(page, {type: "paintLightingMap", index: 0, leds: [56]});
    await publishAccepted(page, ["rgb", "lighting", "supportedPaints"], [0, 1, 4]);
    await expect(page.locator('.painter [data-colour] input')).toHaveCount(0);await expect(page.locator('.painter [data-palette] button:enabled')).toHaveCount(0);
    await publishAccepted(page, ["rgb", "lighting", "supportedPaints"], [0, 1]);
    await expect(page.locator('.painter [data-fill]')).toBeDisabled();await expect(page.locator('.painter [data-mirror="left"]')).toBeDisabled();
});

test("one brush drag posts every crossed key once on release", async ({page}) => {
    await openControls(page, "lighting");await page.getByRole("button", {name: "Paint keys…"}).click();await clearPosts(page);
    const keys = [13, 14, 15], boxes = [];
    for (const key of keys) boxes.push(await page.locator(`.painter [data-key="${key}"]`).boundingBox());
    await page.mouse.move(boxes[0].x + boxes[0].width / 2, boxes[0].y + boxes[0].height / 2);await page.mouse.down();
    for (const box of boxes.slice(1)) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    expect(await page.evaluate(() => window.__posted)).toEqual([]);
    await page.mouse.up();await expectPost(page, {type: "paintLightingMap", leds: [6, 9, 14]});
});

test("behaviour identity editing and Customise follow independent capability gates", async ({page}) => {
    await openControls(page, "keys", {layer: 3});
    await page.evaluate(async () => {
        const store = await import("/webview/store.mjs");
        store.state.tab = "behaviours";store.state.behaviourRow = store.getModel().keyBehaviors[0].keycode;store.render();
    });
    await page.locator('.beh-main .thing-tabs [data-lighting]').click();
    await publishAccepted(page, ["rgb", "lighting", "supportedFacts"], [8]);
    await publishAccepted(page, ["rgb", "lighting", "supportedPaints"], [3]);
    await publishAccepted(page, ["rgb", "lighting", "supportedTargets"], [7]);
    const tab = page.locator('.beh-main .thing-lighting');
    await expect(tab.locator('[data-channel="0"]')).toBeEnabled();
    await expect(tab.locator('[data-customise]')).toBeDisabled();
    await publishAccepted(page, ["rgb", "lighting", "supportedPaints"], [4]);
    await publishAccepted(page, ["rgb", "lighting", "supportedTargets"], [0]);
    await expect(tab.locator('[data-channel="0"]')).toBeDisabled();
    await expect(tab.locator('[data-customise]')).toBeEnabled();
});
