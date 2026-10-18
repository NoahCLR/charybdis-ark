// @ts-check
"use strict";
// The Combos tab: a new combo is built and added once it has what it needs;
// an existing one edits live. Each control is proven by what it posts.
const {test, expect} = require("@playwright/test");
const {openControls, clearPosts, posted, change} = require("./control-preview");

test("a new combo says what it needs, picks its keys from the bench, and adds from the pick bar (B8)", async ({page}) => {
    await openControls(page, "keys", {tab: "combos", showKeycodes: true});
    await page.getByRole("button", {name: "New combo…", exact: true}).click();
    const builder = page.locator(".combo-builder");
    await expect(builder.locator('[data-act="keep"]')).toBeDisabled();
    await expect(builder.locator("[data-missing]")).toHaveText("Needs what it sends and two keys.");
    await builder.locator("[data-output]").fill("KC_TAB");
    await builder.locator('[data-act="pickboard"]').click();
    await expect(page.locator(".pickbar")).toBeVisible();
    await expect(page.locator('.pickbar [data-act="add"]')).toBeDisabled();
    await page.locator('.board-card [data-key="1"]').click();
    await expect(builder.locator("[data-missing]")).toHaveText("Needs one more key.");
    await page.locator('.board-card [data-key="2"]').click();
    await expect(builder.locator("[data-missing]")).toHaveCount(0);
    await clearPosts(page);
    await page.locator('.pickbar [data-act="add"]').click();
    await expect.poll(() => posted(page)).toEqual([expect.objectContaining({type: "addCombo", output: "KC_TAB", inputs: expect.any(Array)})]);
    expect((await posted(page))[0].inputs).toHaveLength(2);
});

test("Esc ends picking keys on the board", async ({page}) => {
    await openControls(page, "keys", {tab: "combos"});
    await page.getByRole("button", {name: "New combo…", exact: true}).click();
    await page.locator('.combo-builder [data-act="pickboard"]').click();
    await expect(page.locator(".pickbar")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator(".pickbar")).toHaveCount(0);
    await expect(page.locator(".combo-builder"), "the builder stays").toHaveCount(1);
});

test("an existing combo edits live: switches, window and key order post the combo whole", async ({page}) => {
    await openControls(page, "keys", {tab: "combos"});
    await page.evaluate(async () => {
        const store = await import("/webview/store.mjs");
        const model = structuredClone(store.getModel());
        model.combos = [{id: 0, badge: "C0", inputs: ["KC_D", "KC_F"], inputDisplays: ["D", "F"], output: "KC_ESCAPE", outputDisplay: "Esc", termMs: 50,
            followsDefault: true, mustHold: false, mustTap: false, ordered: false, enabled: true, useOutputBehavior: true, allowedLayers: 0xffff}];
        model.comboReadback = {...model.comboReadback, state: "read", defaultTermMs: 50, holdTermMs: 200};
        store.setModel(model); store.render();
    });
    const header = page.locator(".reach-table th");
    await expect(header.nth(1)).toHaveText(/Window · \d+ ms default/);
    await page.locator("tr[data-combo]").first().click();
    const builder = page.locator(".combo-builder");
    await expect(builder.locator('[data-act="keep"]'), "no Keep for an existing combo").toHaveCount(0);
    const id = Number(await page.locator("tr[data-combo]").first().getAttribute("data-combo"));
    await clearPosts(page);
    await builder.locator("label").filter({has: page.locator("[data-ordered]")}).click();
    await expect.poll(() => posted(page)).toEqual([expect.objectContaining({type: "saveCombo", id, ordered: true})]);
    await expect(builder.locator("label").filter({has: page.locator("[data-musthold]")})).toHaveAttribute("data-tip", /\d+ ms, the longer of its window and the combo hold threshold/);

    await clearPosts(page);
    await change(builder.locator("[data-term]"), "777");
    await expect.poll(() => posted(page)).toEqual([expect.objectContaining({type: "saveCombo", id, termMs: "777", followsDefault: false})]);

    const before = await page.evaluate(async (id) => (await import("/webview/store.mjs")).getModel().combos.find((combo) => combo.id === id).inputs, id);
    await clearPosts(page);
    await builder.locator("[data-input-at='0']").focus();
    await page.keyboard.press("Alt+ArrowRight");
    await expect.poll(() => posted(page)).toEqual([expect.objectContaining({type: "saveCombo", id, inputs: [before[1], before[0], ...before.slice(2)]})]);
    await expect(builder.locator("[data-input-at] [data-remove]").first(), "two keys is the least a combo has").toBeDisabled();
});
