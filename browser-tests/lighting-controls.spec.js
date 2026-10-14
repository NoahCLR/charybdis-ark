// @ts-check
"use strict";
const {test, expect} = require("@playwright/test");
const {openControls, clearPosts, posted, expectPost, change, publishAccepted} = require("./control-preview");
const editor = page => page.locator(".lighting-rule-editor");
const channel = (page, index) => editor(page).locator(`[data-channel="${index}"]`);
async function rule(page, index = 0) {
    return page.evaluate(async index => (await import("/webview/store.mjs")).getModel().rgb.lighting.rules[index], index);
}
async function fixedColour(page, colour = {h: 85, s: 255, v: 200}) {
    const selected = await rule(page);
    await publishAccepted(page, ["rgb", "lighting", "rules", 0, "colour"], colour);
    await clearPosts(page);
    return selected;
}

for (const theme of ["plain", "vscode-dark", "vscode-light"]) {
    test(`all colour channels post a guarded rule edit and preserve focus (${theme})`, async ({page}) => {
        await openControls(page, "lighting", {}, theme);
        const selected = await fixedColour(page), colour = {h: 85, s: 255, v: 200};
        for (const [index, key] of ["h", "s", "v"].entries()) {
            await clearPosts(page);
            await change(channel(page, index), 71 + index);colour[key] = 71 + index;
            await expectPost(page, {type: "editLightingRule", index: 0, expectedRule: selected.identity, action: "colour", colour: {...colour}});
            await channel(page, index).focus();
            const old = await channel(page, index).elementHandle();
            await publishAccepted(page, ["rgb", "lighting", "rules", 0, "colour"], {...colour});
            expect(await old.evaluate(node => node.isConnected)).toBe(false);
            await expect(channel(page, index)).toBeFocused();
            await expect(channel(page, index)).toHaveValue(String(71 + index));
        }
        await clearPosts(page);
        await editor(page).locator("[data-off]").click();
        await expectPost(page, {type: "editLightingRule", index: 0, action: "colour", colour: {h: 0, s: 0, v: 0}});
        await publishAccepted(page, ["rgb", "lighting", "rules", 0, "colour"], {h: 0, s: 0, v: 0});
        await expect(editor(page).locator("[data-channel]")).toHaveCount(3);
        await expect(editor(page)).toContainText("HSV(0, 0, 0)");
    });
}

test("each rule switch, selection, deletion and arrows post its own identity", async ({page}) => {
    await openControls(page, "lighting");
    const rules = await page.evaluate(async () => (await import("/webview/store.mjs")).getModel().rgb.lighting.rules);
    for (const selected of rules) {
        await clearPosts(page);
        await page.locator(`[data-rule-index="${selected.index}"] .sw`).click();
        await expectPost(page, {type: "editLightingRule", index: selected.index, expectedRule: selected.identity, action: "toggle"});
        await clearPosts(page);
        await page.getByRole("button", {name: `Edit rule ${selected.index + 1}`, exact: true}).click();
        expect(await posted(page)).toEqual([]);
        await editor(page).getByRole("button", {name: "Delete", exact: true}).click();
        await expectPost(page, {type: "editLightingRule", index: selected.index, expectedRule: selected.identity, action: "delete"});
        for (const [direction, delta] of [["up", -1], ["down", 1]]) {
            if (selected.index + delta < 0 || selected.index + delta >= rules.length) continue;
            await clearPosts(page);
            await page.getByRole("button", {name: `Move rule ${selected.index + 1} ${direction}`, exact: true}).click();
            await expectPost(page, {type: "editLightingRule", index: selected.index, expectedRule: selected.identity, action: "move", to: selected.index + delta});
        }
    }
});

test("dragging across a band posts the actual destination and stable focus survives reorder", async ({page}) => {
    await openControls(page, "lighting");const selected = await rule(page);
    await page.locator('[data-rule-index="0"]').dragTo(page.locator('[data-rule-index="3"]'));
    await expectPost(page, {type: "editLightingRule", index: 0, expectedRule: selected.identity, action: "move", to: 3});
    const control = page.locator(`[data-f="lighting:${selected.key}:enabled"]`);await control.focus();
    const rules = await page.evaluate(async () => {
        const rules = structuredClone((await import("/webview/store.mjs")).getModel().rgb.lighting.rules);
        rules.splice(3,0,rules.splice(0,1)[0]);rules.forEach((rule,index)=>rule.index=index);return rules;
    });
    await publishAccepted(page, ["rgb", "lighting", "rules"], rules);
    await expect(control).toBeFocused();
    await expect(editor(page).locator("h3")).toHaveText("Rule 4");
    await expect(editor(page)).toContainText("Moving a rule across that boundary changes what fades");
});

test("inherited paint becomes a fixed colour; hue and SV gestures commit once on release", async ({page}) => {
    await openControls(page, "lighting");const selected = await rule(page);
    await editor(page).getByRole("button", {name: "Give it a colour", exact: true}).click();
    await expectPost(page, {type: "editLightingRule", index: 0, expectedRule: selected.identity, action: "colour", colour: {h: 140, s: 255, v: 200}});
    await fixedColour(page, {h: 140, s: 255, v: 200});
    for (const [selector, fraction, expected] of [[".hue-ramp", {x: .25, y: .5}, {h: 64, s: 255, v: 200}], [".sv-field", {x: .5, y: .25}, {h: 64, s: 128, v: 191}]]) {
        await clearPosts(page);const surface=editor(page).locator(selector);await surface.scrollIntoViewIfNeeded();const box=await surface.boundingBox();
        await page.mouse.move(box.x+box.width*fraction.x,box.y+box.height*fraction.y);await page.mouse.down();expect(await posted(page)).toEqual([]);await page.mouse.up();
        await expectPost(page, {type:"editLightingRule",index:0,action:"colour",colour:expected});
        await publishAccepted(page,["rgb","lighting","rules",0,"colour"],expected);
    }
});

test("unknown rules are read-only and unavailable paint kinds never expose colour editing", async ({page}) => {
    await openControls(page,"lighting");await publishAccepted(page,["rgb","lighting","rules",0,"readOnly"],true);
    await expect(page.locator('[data-rule-index="0"] input')).toBeDisabled();await expect(editor(page)).toContainText("stays unchanged");
    await expect(editor(page).getByRole("button",{name:"Delete",exact:true})).toHaveCount(0);await expect(editor(page).locator("[data-channel]")).toHaveCount(0);
    await publishAccepted(page,["rgb","lighting","rules",0,"readOnly"],false);await publishAccepted(page,["rgb","lighting","rules",0,"canColour"],false);
    await expect(editor(page)).toContainText("does not offer a plain colour paint");await expect(editor(page).getByRole("button",{name:"Give it a colour",exact:true})).toHaveCount(0);
});

test("lighting memory warns near 8 KiB and draft gates disable every edit", async ({page}) => {
    await openControls(page,"lighting");await publishAccepted(page,["rgb","lighting","used"],7500);
    await expect(page.getByRole("region",{name:"Lighting memory"})).toContainText("7,500 of 8,192");await expect(page.getByRole("region",{name:"Lighting memory"})).toContainText("nearly full");
    await publishAccepted(page,["draft","editable"],false);
    await expect(page.locator(".lighting-rule input:enabled")).toHaveCount(0);await expect(page.locator(".lighting-rule [data-up]:enabled, .lighting-rule [data-down]:enabled")).toHaveCount(0);
    await expect(editor(page).getByRole("button",{name:"Delete",exact:true})).toBeDisabled();
});
