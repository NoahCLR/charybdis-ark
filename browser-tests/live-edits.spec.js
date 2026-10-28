// @ts-check
"use strict";
// Live preview + save (firmware D-F32) in the preview: the mode switch and its
// questions, Save and Revert, a live edit's trap question, a toggle turned off
// by key, and an edit in every domain posted from the same controls as in
// Review and save. The core sends each one to the keyboard; the preview logs
// what the panel posts.
const {test, expect} = require("@playwright/test");
const {clearPosts, posted, expectPost, change} = require("./control-preview");
const {chooseEditMode, currentEditMode, keyboardMenu} = require("./shell-page");

/** @param {import("@playwright/test").Page} page @param {string} screen @param {object} [state] */
async function openLive(page, screen, state = {}) {
    await page.goto("/preview/index.html?shell=live");
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
    expect(await currentEditMode(page)).toBe(2);
    const label = await page.evaluate(async () => (await import("/webview/store.mjs")).getModel().vocabulary.editModes[2].label);
    await expect(page.locator(".rail-keyboard .rail-mode")).toHaveText(label);
    // The bar says it; the rail keeps no status lines of its own.
    await expect(page.locator(".rail-status")).toHaveCount(0);
    const bar = page.locator(".commit.live");
    await expect(bar).toContainText("1 unsaved change running on the keyboard");
    await bar.locator('[data-act="revert"]').click();
    await expectPost(page, {type: "revertProfileDraft"});
});

test("leaving Live + review with unsaved edits asks Save or Revert; Cancel posts nothing", async ({page}) => {
    await openLive(page, "keys");
    await chooseEditMode(page, 0);
    const ask = page.locator(".sheet.edit-mode-ask");
    await expect(ask).toContainText("Save or revert first?");
    await ask.locator('[data-act="cancel"]').click();
    await expect(ask).toHaveCount(0);
    expect(await posted(page)).toEqual([]);
    await chooseEditMode(page, 0);
    await page.locator('.sheet.edit-mode-ask [data-pending="save"]').click();
    await expectPost(page, {type: "setEditMode", mode: 0, pending: "save"});
    await clearPosts(page);
    await chooseEditMode(page, 0);
    await page.locator('.sheet.edit-mode-ask [data-pending="revert"]').click();
    await expectPost(page, {type: "setEditMode", mode: 0, pending: "revert"});
});

test("going from Apply to Live + review with a draft asks Send or Discard; without one it switches at once", async ({page}) => {
    await page.goto("/preview/index.html");
    expect(await currentEditMode(page)).toBe(0);
    await page.evaluate(() => {window.__posted.length = 0;});
    await chooseEditMode(page, 2);
    await expectPost(page, {type: "setEditMode", mode: 2});
    await page.evaluate(async () => {
        const store = await import("/webview/store.mjs");
        const model = structuredClone(store.getModel());
        model.draft.dirty = true;
        model.draft.changes = [{area: "Keys", unit: "key", title: "Base · Q", status: "changed", group: 0, place: null, fields: []}];
        store.setModel(model); store.render();
        window.__posted.length = 0;
    });
    await chooseEditMode(page, 2);
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
    // The core marks the review read; the preview stands in for it.
    await page.evaluate(async () => {
        const store = await import("/webview/store.mjs");
        const model = structuredClone(store.getModel());
        model.draft.reviewed = true;
        store.setModel(model); store.render();
        window.__posted.length = 0;
    });
    const save = sheet.locator('[data-act="apply"]');
    await expect(save).toHaveText("Save to keyboard");
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
    await openLive(page, "combos");
    const mark = page.locator('.off-by-key');
    await expect(mark).toHaveCount(1);
    await expect(mark).toHaveText("turned off by key");
    await expect(page.locator(".commit.live")).toContainText("1 unsaved change");
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
    await withModel(page, model => {model.draft.live.slaveRefused = true; model.draft.live.converged = false;});
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
    await expect(page.locator('.rail-mode [data-tip*="halves stored different modes"]')).toHaveCount(1);
    const menu = await keyboardMenu(page);
    await expect(menu.locator(".rail-menu-note")).toHaveAttribute("data-tip", /Unplugging it now may lose the mode/);
    await menu.locator('[data-act="edit-mode-settle"]').click();
    const ask = page.locator(".sheet.edit-mode-ask");
    await expect(ask).toContainText("settles halves");
    await ask.locator('[data-pending="revert"]').click();
    await expectPost(page, {type: "setEditMode", mode: 2, pending: "revert"});
});

test("the mode question lists the checks Save confirms, and Save anyway confirms them", async ({page}) => {
    await openLive(page, "keys");
    await withModel(page, model => {model.draft.checks = [{id: "w", kind: "unowned", level: "warning", status: "existing", title: "Layer 3 has no way back", detail: "", place: null}];});
    await chooseEditMode(page, 0);
    const ask = page.locator(".sheet.edit-mode-ask");
    await expect(ask).toContainText("In Review and save");
    await expect(ask.locator(".live-ask-checks")).toContainText("Layer 3 has no way back");
    await ask.locator('[data-pending="save"]').click();
    await expectPost(page, {type: "setEditMode", mode: 0, pending: "save", confirmChecks: true});
});

// Each domain's own control posts its edit in Live preview + save exactly as
// in Review and save; the core sends it live.
test("keys: a key change posts", async ({page}) => {
    await openLive(page, "keys");
    await change(page.locator('[data-f="key:0:0:keycode"]'), "KC_Q");
    await expect.poll(() => posted(page)).toEqual([expect.objectContaining({type: "updateLayoutKeys"})]);
});
test("lighting: a layer colour posts", async ({page}) => {
    await openLive(page, "lighting", {stage: "layers", layer: 1, pointingSlot: 0, feedbackRow: "holdActiveColor"});
    await change(page.locator('#benchBody [data-channel="0"]'), 71);
    await expect.poll(() => posted(page)).toEqual([expect.objectContaining({type: "updateLayerColor", h: 71})]);
});
test("behaviours: a timing posts", async ({page}) => {
    await openLive(page, "behaviours");
    await change(page.locator('[data-f="setting:tappingTerm"]'), 211);
    await expect.poll(() => posted(page)).toEqual([expect.objectContaining({type: "updateConfigDefaults"})]);
});
test("combos: the default window posts", async ({page}) => {
    await openLive(page, "combos");
    await change(page.locator('[data-f="settings:combo:default"]'), 77);
    await expectPost(page, {type: "updateComboDefaultWindow", defaultTermMs: "77"});
});
test("pointing: a scrolling field posts its record", async ({page}) => {
    await openLive(page, "pointing", {pointingSlot: 0});
    await change(page.locator('[data-f="pointing:0:scroll:divisorH"]'), 71);
    await expect.poll(() => posted(page)).toEqual([expect.objectContaining({type: "savePdMode"})]);
});
test("Pointer: a pointer setting posts", async ({page}) => {
    await openLive(page, "pointer");
    await change(page.locator('[data-f="setting:mouseTimeout"]'), 900);
    await expect.poll(() => posted(page)).toEqual([expect.objectContaining({type: "updateConfigDefaults"})]);
});
test("macros: a macro's name posts", async ({page}) => {
    await openLive(page, "macros");
    const name = page.locator('[data-f="macro:MACRO_0:name"]');
    await name.fill("Hello 777");
    await name.press("Enter");
    await expect.poll(() => posted(page).then(rows => JSON.stringify(rows))).toContain("Hello 777");
    expect((await posted(page))[0].type).toBe("updateMacro");
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

// Live edit (the keyboard saves by itself): the switch into it, an edit, and
// the bar saying what the keyboard has not saved yet, with no Save.
test("switching into Live from Live + review asks Save or Revert; from Apply with nothing pending it switches at once", async ({page}) => {
    await openLive(page, "keys");
    // The menu lists the modes in the order the keyboard offers them, each with its words.
    const words = await page.evaluate(async () => {
        const model = (await import("/webview/store.mjs")).getModel();
        return model.editMode.offered.map((mode) => `${model.vocabulary.editModes[mode].label}${model.vocabulary.editModes[mode].hint}`);
    });
    const modes = (await keyboardMenu(page)).locator('[data-act="edit-mode"] .rail-menu-text');
    await expect(modes).toHaveText(words);
    await expect(modes).toHaveText([/^Live edit/, /^Live preview \+ save/, /^Review and save/]);
    await chooseEditMode(page, 1);
    const ask = page.locator(".sheet.edit-mode-ask");
    await expect(ask).toContainText("In Live edit the keyboard saves edits by itself");
    await ask.locator('[data-pending="save"]').click();
    await expectPost(page, {type: "setEditMode", mode: 1, pending: "save"});
    await page.goto("/preview/index.html");
    await page.evaluate(() => {window.__posted.length = 0;});
    await chooseEditMode(page, 1);
    await expectPost(page, {type: "setEditMode", mode: 1});
});

test("in Live an edit posts as in Live + review, the bar has no Save, and leaving Live asks nothing", async ({page}) => {
    await page.goto("/preview/index.html?shell=live-auto");
    await page.locator('[data-screen="pointer"]').click();
    expect(await currentEditMode(page)).toBe(1);
    await page.evaluate(() => {window.__posted.length = 0;});
    const bar = page.locator(".commit.live.auto");
    await expect(bar).toContainText("Not saved yet");
    await expect(bar).toContainText("after 3 seconds without typing");
    await expect(bar.locator('[data-act="save-again"]')).toHaveCount(0);
    await expect(bar.locator('[data-act="review"]')).toHaveText("1 change");
    const field = page.locator('select[data-macro="normalDpi"]');
    const other = await field.evaluate((select) => [...select.options].find((option) => !option.selected)?.value);
    await field.selectOption(/** @type {string} */ (other));
    await expect.poll(async () => JSON.stringify(await posted(page))).toContain(`"${other}"`);
    await bar.locator('[data-act="review"]').click();
    await expect(page.locator(".sheet")).toContainText("saves them by itself");
    await expect(page.locator('.sheet [data-act="apply"]')).toHaveCount(0);
    await page.locator('.sheet [data-act="close"]').click();
    await clearPosts(page);
    await chooseEditMode(page, 2);
    await expect(page.locator(".sheet.edit-mode-ask")).toHaveCount(0);
    await expectPost(page, {type: "setEditMode", mode: 2});
});

test("in Live the keyboard's own save, a failed one and halves apart each say what to do", async ({page}) => {
    await page.goto("/preview/index.html?shell=live-auto");
    /** @param {object} keyboard @param {boolean} [unsaved] */
    const set = (keyboard, unsaved = true) => page.evaluate(async ([keyboard, unsaved]) => {
        const store = await import("/webview/store.mjs");
        const model = structuredClone(store.getModel());
        model.draft.live = {...model.draft.live, unsaved, slaveRefused: false, keyboard: {...model.draft.live.keyboard, ...keyboard}};
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
    await change({"draft.live": {...(await page.evaluate(async () => (await import("/webview/store.mjs")).getModel().draft.live)), slaveRefused: true}});
    await expect(page.locator(".commit.live")).toContainText("the halves are apart");
    await expect(page.locator('.commit.live [data-act="save-again"]')).toHaveCount(0);
    await page.locator('.commit.live [data-act="revert"]').click();
    await expectPost(page, {type: "revertProfileDraft"});
    await change({"editMode.notStored": true});
    await set({savedByKeyboard: true}, false);
    await expect(page.locator(".commit.live")).toHaveCount(0);
    // With no bar, the keyboard's dot says it saved.
    await expect(page.locator(".rail-keyboard > .dot")).toHaveAttribute("data-tip", /Saved by the keyboard\./);
    await expect(page.locator(".rail-mode .dot.warn")).toHaveCount(1);
});

// The keyboard holds an edit until nothing is held and takes it on release:
// the bar says what to let go of, and Cancel edit posts its control.
test("an edit the keyboard holds for released keys says what holds it, and Cancel edit posts", async ({page}) => {
    await page.goto("/preview/index.html?shell=live-held");
    const bar = page.locator(".commit.held");
    await expect(bar).toContainText("Let go of the held keys to finish the edit");
    await expect(bar).toContainText("Held now: a key and a modifier or one-shot.");
    await expect(page.locator("body")).not.toContainText("Failed");
    await clearPosts(page);
    await bar.locator('[data-act="cancel-edit"]').click();
    await expectPost(page, {type: "abortLiveEdit"});
    // A held Revert cannot be cancelled: no button.
    await page.evaluate(async () => {
        const store = await import("/webview/store.mjs");
        const model = structuredClone(store.getModel());
        model.liveWait = {...model.liveWait, title: "Let go of the held keys to finish reverting", cancellable: false};
        store.setModel(model); store.render();
    });
    await expect(page.locator(".commit.held")).toContainText("finish reverting");
    await expect(page.locator('.commit.held [data-act="cancel-edit"]')).toHaveCount(0);
});

// Firmware D-F34: a keyboard that stopped saving says so in one line where it
// used to look "not ready" or "catching up", and Restart posts its control.
test("a keyboard that stopped saving says so, for either half, and Restart posts", async ({page}) => {
    await page.goto("/preview/index.html?shell=live-stopped");
    const bar = page.locator(".commit.live.stopped");
    await expect(bar).toContainText("The keyboard stopped saving");
    await expect(bar).toContainText("Restart it to continue.");
    await expect(page.locator("body")).not.toContainText("catching up");
    await expect(bar.locator('[data-act="review"], [data-act="save-again"], [data-act="revert"]')).toHaveCount(0);
    await clearPosts(page);
    await bar.locator('[data-act="restart"]').click();
    await expectPost(page, {type: "restartKeyboard"});
    // The slave half's stop reads the same.
    await page.evaluate(async () => {
        const store = await import("/webview/store.mjs");
        const model = structuredClone(store.getModel());
        model.draft.live = {...model.draft.live, keyboard: {...model.draft.live.keyboard, stopped: false, slaveStopped: true}};
        store.setModel(model); store.render();
    });
    await expect(page.locator(".commit.live.stopped")).toContainText("The keyboard stopped saving");
});

// The same under a Review and save draft: the look between edits reads the
// same flags, and Restart is the one action, not Review and save.
test("an Apply draft's keyboard that stopped saving says so, for either half, and Restart posts", async ({page}) => {
    await page.goto("/preview/index.html?shell=apply-stopped");
    const bar = page.locator(".commit.stopped");
    await expect(bar).toContainText("The keyboard stopped saving");
    await expect(bar).toContainText("Restart it to continue.");
    await expect(bar).not.toHaveClass(/\blive\b/);
    // The draft is kept as it is, and the bar still counts it.
    await expect(bar).toContainText("1 change in your draft");
    await expect(page.locator("body")).not.toContainText("not ready");
    await expect(page.locator('.commit [data-act="review"], .commit [data-act="discard"]')).toHaveCount(0);
    await clearPosts(page);
    await bar.locator('[data-act="restart"]').click();
    await expectPost(page, {type: "restartKeyboard"});
    await page.evaluate(async () => {
        const store = await import("/webview/store.mjs");
        const model = structuredClone(store.getModel());
        model.draft.keyboard = {...model.draft.keyboard, stopped: false, slaveStopped: true};
        store.setModel(model); store.render();
    });
    await expect(page.locator(".commit.stopped")).toContainText("The keyboard stopped saving");
    // Back saving: the draft's own bar again.
    await page.evaluate(async () => {
        const store = await import("/webview/store.mjs");
        const model = structuredClone(store.getModel());
        model.draft.keyboard = {...model.draft.keyboard, stopped: false, slaveStopped: false};
        store.setModel(model); store.render();
    });
    await expect(page.locator(".commit.stopped")).toHaveCount(0);
    await expect(page.locator('.commit [data-act="review"]')).toHaveText("Review and save");
});

/** @param {import("@playwright/test").Page} page @param {boolean} restartNeeded */
async function setRestartNeeded(page, restartNeeded) {
    await page.evaluate(async restartNeeded => {
        const store = await import("/webview/store.mjs");
        const model = structuredClone(store.getModel());
        model.device.health.restartNeeded = restartNeeded;
        store.setModel(model); store.render();
        window.__posted.length = 0;
    }, restartNeeded);
}

// A slave half that never confirmed a cancelled save leaves the keyboard
// refusing saves until it restarts: the bar says so with Restart, in every
// edit mode, where only the keyboard dot's hover words used to.
for (const [mode, shell] of [["Review and save", ""], ["Live edit", "live-auto"], ["Live preview + save", "live"]]) {
    test(`a keyboard that needs a restart says so in the bar in ${mode}, and Restart posts`, async ({page}) => {
        await page.goto(`/preview/index.html${shell ? `?shell=${shell}` : ""}`);
        await expect(page.locator(".commit.restart-needed")).toHaveCount(0);
        await setRestartNeeded(page, true);
        const bar = page.locator(".commit.restart-needed");
        await expect(bar).toContainText("Restart the keyboard");
        await expect(bar).toContainText("The slave half did not confirm a cancelled save");
        await expect(bar.locator('[data-act="review"], [data-act="save-again"], [data-act="revert"]')).toHaveCount(0);
        await bar.locator('[data-act="restart"]').click();
        await expectPost(page, {type: "restartKeyboard"});
        // The dot keeps its words.
        await expect(page.locator(".rail-keyboard .dot.err")).toHaveCount(1);
        await setRestartNeeded(page, false);
        await expect(page.locator(".commit.restart-needed")).toHaveCount(0);
    });
}

test("a keyboard that stopped saving and needs a restart shows one bar, the stopped one", async ({page}) => {
    await page.goto("/preview/index.html?shell=apply-stopped");
    await setRestartNeeded(page, true);
    await expect(page.locator(".commit")).toHaveCount(1);
    await expect(page.locator(".commit.stopped")).toContainText("The keyboard stopped saving");
    await expect(page.locator(".commit.stopped")).toContainText("1 change in your draft");
    await expect(page.locator(".commit.restart-needed")).toHaveCount(0);
});
