// @ts-check
"use strict";
// Live + review (firmware D-F32) in the preview: the mode switch and its
// questions, Save and Revert, a live edit's trap question, a toggle turned off
// by key, and an edit in every domain posted from the same controls as in
// Apply. The host sends each one to the keyboard; the preview logs what the
// panel posts.
const {test, expect} = require("@playwright/test");
const {clearPosts, posted, expectPost, change} = require("./control-preview");

/** @param {import("@playwright/test").Page} page @param {string} screen @param {object} [state] */
async function openLive(page, screen, state = {}) {
    await page.goto("/preview/index.html?host=live");
    await page.locator(`[data-screen="${screen}"]`).click();
    await page.evaluate(async state => {
        const store = await import("/webview/store.mjs");
        Object.assign(store.state, state);
        store.render();
        window.__posted.length = 0;
    }, state);
}

test("the rail says how edits reach the keyboard, and the bar says what runs unsaved", async ({page}) => {
    await openLive(page, "keys");
    await expect(page.locator('[data-f="rail:edit-mode"]')).toHaveValue("2");
    await expect(page.locator(".rail-status")).toContainText("1 unsaved change on the keyboard");
    const bar = page.locator(".commit.live");
    await expect(bar).toContainText("running on the keyboard");
    await bar.locator('[data-act="revert"]').click();
    await expectPost(page, {type: "revertProfileDraft"});
});

test("leaving Live + review with unsaved edits asks Save or Revert; Cancel posts nothing", async ({page}) => {
    await openLive(page, "keys");
    const mode = page.locator('[data-f="rail:edit-mode"]');
    await mode.selectOption("0");
    const ask = page.locator(".sheet.edit-mode-ask");
    await expect(ask).toContainText("Save or revert first?");
    await ask.locator('[data-act="cancel"]').click();
    await expect(ask).toHaveCount(0);
    expect(await posted(page)).toEqual([]);
    await mode.selectOption("0");
    await page.locator('.sheet.edit-mode-ask [data-pending="save"]').click();
    await expectPost(page, {type: "setEditMode", mode: 0, pending: "save"});
    await clearPosts(page);
    await mode.selectOption("0");
    await page.locator('.sheet.edit-mode-ask [data-pending="revert"]').click();
    await expectPost(page, {type: "setEditMode", mode: 0, pending: "revert"});
});

test("going from Apply to Live + review with a draft asks Send or Discard; without one it switches at once", async ({page}) => {
    await page.goto("/preview/index.html");
    const mode = page.locator('[data-f="rail:edit-mode"]');
    await expect(mode).toHaveValue("0");
    await page.evaluate(() => {window.__posted.length = 0;});
    await mode.selectOption("2");
    await expectPost(page, {type: "setEditMode", mode: 2});
    await page.evaluate(async () => {
        const store = await import("/webview/store.mjs");
        const model = structuredClone(store.getModel());
        model.draft.dirty = true;
        model.draft.changes = [{area: "Keys", unit: "key", title: "Base · Q", status: "changed", group: 0, place: null, fields: []}];
        store.setModel(model); store.render();
        window.__posted.length = 0;
    });
    await mode.selectOption("2");
    await expect(page.locator(".sheet.edit-mode-ask")).toContainText("Send your draft live?");
    await page.locator('.sheet.edit-mode-ask [data-pending="send"]').click();
    await expectPost(page, {type: "setEditMode", mode: 2, pending: "send"});
});

test("review compares what is saved with what runs, and Save posts the keyboard's save", async ({page}) => {
    await openLive(page, "keys");
    await page.locator('.commit.live [data-act="review"]').click();
    const sheet = page.locator(".sheet");
    await expect(sheet).toContainText("Saved");
    await expect(sheet).toContainText("Running now");
    await expect.poll(() => posted(page)).toEqual([expect.objectContaining({type: "reviewProfileDraft"})]);
    // The host marks the review read; the preview stands in for it.
    await page.evaluate(async () => {
        const store = await import("/webview/store.mjs");
        const model = structuredClone(store.getModel());
        model.draft.reviewed = true;
        store.setModel(model); store.render();
        window.__posted.length = 0;
    });
    const save = sheet.locator('[data-act="apply"]');
    await expect(save).toHaveText("Save on keyboard");
    await save.click();
    const confirm = page.locator('[data-act="apply-anyway"]');
    if (await confirm.count()) {
        await expect(confirm).toHaveText("Save anyway");
        await confirm.click();
        await expectPost(page, {type: "saveProfileDraft", confirmChecks: true});
    } else await expectPost(page, {type: "saveProfileDraft"});
});

test("an edit that would add a trap asks first; Go back and Send anyway post their answers", async ({page}) => {
    await openLive(page, "keys");
    await page.evaluate(async () => {
        const store = await import("/webview/store.mjs");
        const model = structuredClone(store.getModel());
        model.liveProposal = {id: 7, label: "Set Base · Q to TG(2)", checks: [{kind: "trap", level: "trap", status: "new", key: "trap:2", layers: [2], title: "Layer 2 has no way back", detail: "", fix: ""}]};
        store.setModel(model); store.render();
        window.__posted.length = 0;
    });
    const ask = page.locator(".sheet.live-ask");
    await expect(ask).toContainText("This edit adds a trap");
    await expect(ask).toContainText("Send this edit anyway?");
    await ask.locator('[data-act="back"]').click();
    await expectPost(page, {type: "cancelLiveEdit", proposal: 7});
    await clearPosts(page);
    await ask.locator('[data-act="send"]').click();
    await expectPost(page, {type: "confirmLiveEdit", proposal: 7});
});

test("combos turned off by a key show beside the switch, not as a change", async ({page}) => {
    await openLive(page, "settings");
    const mark = page.locator('.off-by-key');
    await expect(mark).toHaveCount(1);
    await expect(mark).toHaveText("turned off by key");
    await expect(page.locator(".rail-status")).toContainText("1 unsaved change");
});

/** @param {import("@playwright/test").Page} page @param {(model: any) => void} change */
async function withModel(page, change) {
    await page.evaluate(async source => {
        const store = await import("/webview/store.mjs");
        const model = structuredClone(store.getModel());
        new Function("model", source)(model);
        store.setModel(model); store.render();
        window.__posted.length = 0;
    }, `(${change.toString()})(model)`);
}

test("halves apart: the rail says so and the bar offers Revert, not Save", async ({page}) => {
    await openLive(page, "keys");
    await withModel(page, model => {model.draft.live.apart = true; model.draft.live.converged = false;});
    await expect(page.locator(".rail-status")).toContainText("Halves apart");
    const bar = page.locator(".commit.live");
    await expect(bar).toContainText("the halves are apart");
    await expect(bar.locator('[data-act="review"]')).toHaveCount(0);
    await expect(bar.locator('[data-act="revert"]')).toHaveClass(/primary/);
    await bar.locator('[data-act="revert"]').click();
    await expectPost(page, {type: "revertProfileDraft"});
});

test("halves that stored different modes are settled by choosing the mode again; a mode not stored yet is marked", async ({page}) => {
    await openLive(page, "keys");
    await withModel(page, model => {model.editMode.conflict = true; model.editMode.notStored = true;});
    await expect(page.locator('.rail-mode [data-tip*="Unplugging it now may lose the mode"]')).toHaveCount(1);
    await page.locator('[data-act="edit-mode-settle"]').click();
    const ask = page.locator(".sheet.edit-mode-ask");
    await expect(ask).toContainText("settles halves");
    await ask.locator('[data-pending="revert"]').click();
    await expectPost(page, {type: "setEditMode", mode: 2, pending: "revert"});
});

test("the mode question lists the checks Save confirms, and Save anyway confirms them", async ({page}) => {
    await openLive(page, "keys");
    await withModel(page, model => {model.draft.checks = [{id: "w", kind: "unowned", level: "warning", status: "existing", title: "Layer 3 has no way back", detail: "", place: null}];});
    await page.locator('[data-f="rail:edit-mode"]').selectOption("0");
    const ask = page.locator(".sheet.edit-mode-ask");
    await expect(ask).toContainText("In Apply");
    await expect(ask.locator(".live-ask-checks")).toContainText("Layer 3 has no way back");
    await ask.locator('[data-pending="save"]').click();
    await expectPost(page, {type: "setEditMode", mode: 0, pending: "save", confirmChecks: true});
});

// Each domain's own control posts its edit in Live + review exactly as in
// Apply; the host sends it live.
test("keys: a key change posts", async ({page}) => {
    await openLive(page, "keys");
    await change(page.locator('[data-f="key:0:0:keycode"]'), "KC_Q");
    await expect.poll(() => posted(page)).toEqual([expect.objectContaining({type: "updateLayoutKeys"})]);
});
test("lighting: a layer colour posts", async ({page}) => {
    await openLive(page, "lighting", {stage: "layers", layer: 1, pdSlot: 0, feedbackRow: "holdActiveColor"});
    await change(page.locator('#benchBody [data-channel="0"]'), 71);
    await expect.poll(() => posted(page)).toEqual([expect.objectContaining({type: "updateLayerColor", h: 71})]);
});
test("settings: a timing posts", async ({page}) => {
    await openLive(page, "settings");
    await change(page.locator('[data-f="setting:tappingTerm"]'), 211);
    await expect.poll(() => posted(page)).toEqual([expect.objectContaining({type: "updateConfigDefaults"})]);
});
test("combos: the default window posts", async ({page}) => {
    await openLive(page, "settings");
    await change(page.locator('[data-f="settings:combo:default"]'), 77);
    await expectPost(page, {type: "updateComboDefaultTerm", defaultTermMs: "77"});
});
test("pointing: a scrolling field posts its record", async ({page}) => {
    await openLive(page, "pointing", {pdSlot: 0});
    await change(page.locator('[data-f="pointing:0:scroll:divisorH"]'), 71);
    await expect.poll(() => posted(page)).toEqual([expect.objectContaining({type: "savePdMode"})]);
});
test("mouse: a pointer setting posts", async ({page}) => {
    await openLive(page, "mouse");
    await change(page.locator('[data-f="setting:mouseTimeout"]'), 900);
    await expect.poll(() => posted(page)).toEqual([expect.objectContaining({type: "updateConfigDefaults"})]);
});
test("macros: a macro's name posts", async ({page}) => {
    await openLive(page, "macros");
    const name = page.locator('[data-f="macro:VIA_MACRO_0:name"]');
    await name.fill("Hello 777");
    await name.press("Enter");
    await expect.poll(() => posted(page).then(rows => JSON.stringify(rows))).toContain("Hello 777");
    expect((await posted(page))[0].type).toBe("updateViaMacro");
});
test("behaviours: a custom key's behaviour posts", async ({page}) => {
    await openLive(page, "customKeys");
    await page.locator('.macro-grid [data-custom-key="CUSTOM_KEY_5"]').click();
    await page.locator('.custom-key-behaviour [data-cell="0-long"]').click();
    await clearPosts(page);
    await change(page.locator('[data-f="behaviour:CUSTOM_KEY_5:0-long:action"]'), "KC_B");
    await expect.poll(() => posted(page)).toEqual([expect.objectContaining({type: "saveBehavior"})]);
});
test("custom keys: a name posts", async ({page}) => {
    await openLive(page, "customKeys");
    await change(page.locator('[data-f="custom-key:0:name"]'), "Copy 777");
    await expect.poll(() => posted(page).then(rows => JSON.stringify(rows))).toContain("Copy 777");
});

// Live (the keyboard saves by itself): the switch into it, an edit, and the
// bar saying what the keyboard has not saved yet, with no Save.
test("switching into Live from Live + review asks Save or Revert; from Apply with nothing pending it switches at once", async ({page}) => {
    await openLive(page, "keys");
    const mode = page.locator('[data-f="rail:edit-mode"]');
    await expect(mode.locator("option")).toHaveText(["Apply", "Live", "Live + review"]);
    await mode.selectOption("1");
    const ask = page.locator(".sheet.edit-mode-ask");
    await expect(ask).toContainText("In Live the keyboard saves edits by itself");
    await ask.locator('[data-pending="save"]').click();
    await expectPost(page, {type: "setEditMode", mode: 1, pending: "save"});
    await page.goto("/preview/index.html");
    await page.evaluate(() => {window.__posted.length = 0;});
    await page.locator('[data-f="rail:edit-mode"]').selectOption("1");
    await expectPost(page, {type: "setEditMode", mode: 1});
});

test("in Live an edit posts as in Live + review, the bar has no Save, and leaving Live asks nothing", async ({page}) => {
    await page.goto("/preview/index.html?host=live-auto");
    await page.locator('[data-screen="mouse"]').click();
    await page.evaluate(() => {window.__posted.length = 0;});
    const mode = page.locator('[data-f="rail:edit-mode"]');
    await expect(mode).toHaveValue("1");
    const bar = page.locator(".commit.live.auto");
    await expect(bar).toContainText("Not saved yet");
    await expect(bar).toContainText("after 3 seconds without typing");
    await expect(bar.locator('[data-act="save-again"]')).toHaveCount(0);
    await expect(page.locator(".rail-status")).toContainText("1 change not saved yet");
    const field = page.locator('select[data-macro="normalDpi"]');
    const other = await field.evaluate((select) => [...select.options].find((option) => !option.selected)?.value);
    await field.selectOption(/** @type {string} */ (other));
    await expect.poll(async () => JSON.stringify(await posted(page))).toContain(`"${other}"`);
    await bar.locator('[data-act="review"]').click();
    await expect(page.locator(".sheet")).toContainText("saves them by itself");
    await expect(page.locator('.sheet [data-act="apply"]')).toHaveCount(0);
    await page.locator('.sheet [data-act="close"]').click();
    await clearPosts(page);
    await mode.selectOption("2");
    await expect(page.locator(".sheet.edit-mode-ask")).toHaveCount(0);
    await expectPost(page, {type: "setEditMode", mode: 2});
});

test("in Live the keyboard's own save, a failed one and halves apart each say what to do", async ({page}) => {
    await page.goto("/preview/index.html?host=live-auto");
    /** @param {object} keyboard @param {boolean} [unsaved] */
    const set = (keyboard, unsaved = true) => page.evaluate(async ([keyboard, unsaved]) => {
        const store = await import("/webview/store.mjs");
        const model = structuredClone(store.getModel());
        model.draft.live = {...model.draft.live, unsaved, apart: false, keyboard: {...model.draft.live.keyboard, ...keyboard}};
        if (!unsaved) {model.draft.dirty = false; model.draft.changes = [];}
        store.setModel(model); store.render();
        window.__posted.length = 0;
    }, /** @type {const} */ ([keyboard, unsaved]));
    await set({saveFailed: true});
    const bar = page.locator(".commit.live.failed");
    await expect(bar).toContainText("The keyboard could not save");
    await bar.locator('[data-act="save-again"]').click();
    await expectPost(page, {type: "saveProfileDraft"});
    /** @param {object} change */
    const change = (change) => page.evaluate(async (change) => {
        const store = await import("/webview/store.mjs");
        const model = structuredClone(store.getModel());
        for (const [path, value] of Object.entries(change)) {
            const [first, second] = path.split(".");
            model[first] = second ? {...model[first], [second]: value} : value;
        }
        store.setModel(model); store.render();
        window.__posted.length = 0;
    }, change);
    await set({saveFailed: false});
    await change({"draft.live": {...(await page.evaluate(async () => (await import("/webview/store.mjs")).getModel().draft.live)), apart: true}});
    await expect(page.locator(".commit.live")).toContainText("the halves are apart");
    await expect(page.locator(".rail-status")).toContainText("Halves apart");
    await expect(page.locator('.commit.live [data-act="save-again"]')).toHaveCount(0);
    await page.locator('.commit.live [data-act="revert"]').click();
    await expectPost(page, {type: "revertProfileDraft"});
    await change({"editMode.notStored": true});
    await set({savedByKeyboard: true}, false);
    await expect(page.locator(".commit.live")).toHaveCount(0);
    await expect(page.locator(".rail-status")).toContainText("Saved by the keyboard");
    await expect(page.locator(".rail-mode .dot.warn")).toHaveCount(1);
});
