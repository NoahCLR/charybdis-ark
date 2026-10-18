// @ts-check
"use strict";
const {test, expect} = require("@playwright/test");
const {dropFiles} = require("./profile-drop");
const {openPreview} = require("./host-page");

for (const host of ["", "?host=web", "?host=demo"]) {
    test(`Import card posts a dropped file and refuses multiple, oversized and unreadable files (${host || "extension"})`, async ({page}) => {
        await page.goto(`/preview/index.html${host}`);
        await page.locator('[data-screen="profile"]').click();
        const card = page.locator("[data-profile-drop]");
        await expect(card).toContainText("drop a backup file here");
        await page.evaluate(() => {window.__posted.length = 0;});
        const file = {name: "777.charybdis.json", text: '{"sentinel":777}'};
        await card.evaluate((node) => {
            const transfer = new DataTransfer();
            transfer.items.add(new File(["{}"], "profile.json"));
            node.dispatchEvent(new DragEvent("dragover", {bubbles: true, cancelable: true, dataTransfer: transfer}));
        });
        await expect(card).toHaveClass(/drag-over/);
        expect(await dropFiles(page, [file, file])).toBe(true);
        await expect(card.locator('[role="status"]')).toHaveText("Drop one backup file at a time.");
        await expect(card).not.toHaveClass(/drag-over/);
        await dropFiles(page, [{...file, text: "x".repeat(262145)}]);
        await expect(card.locator('[role="status"]')).toHaveText("This backup file is too large.");
        await page.evaluate(() => {
            const text = File.prototype.text;
            File.prototype.text = () => Promise.reject(new Error("unreadable"));
            window.__restoreFileText = () => {File.prototype.text = text;};
        });
        await dropFiles(page, [file]);
        await expect(card.locator('[role="status"]')).toContainText("could not be read");
        await page.evaluate(() => window.__restoreFileText());
        expect(await page.evaluate(() => window.__posted)).toEqual([]);
        expect(await dropFiles(page, [file])).toBe(true);
        await expect.poll(() => page.evaluate(() => window.__posted)).toEqual([
            expect.objectContaining({type: "reviewPortableProfile", name: file.name, text: file.text, draftId: expect.any(String), draftRevision: expect.any(Number)}),
        ]);
        // Dropping outside the Import card never navigates away or posts.
        await page.evaluate(() => {window.__posted.length = 0;});
        expect(await dropFiles(page, [file], "body")).toBe(true);
        expect(await page.evaluate(() => window.__posted)).toEqual([]);
    });
}

test("dropping respects every Import gate and cancels a read when the surface changes", async ({page}) => {
    await page.goto("/preview/index.html");
    await page.locator('[data-screen="profile"]').click();
    await page.evaluate(async () => {
        const store = await import("/webview/store.mjs");
        window.__dropModel = structuredClone(store.getModel());
        window.__setDropModel = (patch) => {
            const next = structuredClone(window.__dropModel);
            for (const [area, values] of Object.entries(patch)) Object.assign(next[area], values);
            store.setModel(next);
            store.render();
        };
        window.__posted.length = 0;
    });
    const file = {name: "profile.json", text: "{}"};
    // Simulate the coherent binding core publishes for each read-only state.
    // Presentation flags alone no longer decide whether a draft takes edits.
    for (const patch of [
        {device: {connected: false}, draft: {editable: false, reason: "disconnected"}},
        {draft: {matching: false, editable: false, reason: "other-keyboard"}},
        {draft: {stale: true, editable: false, reason: "stale"}},
        {draft: {busy: true, editable: false, reason: "busy"}},
        {draft: {editable: false, reason: "connection-changed"}},
        {draft: {editable: false, reason: "unsupported"}},
        {portable: {busy: true}, draft: {editable: false, reason: "busy"}},
    ]) {
        await page.evaluate((patch) => window.__setDropModel(patch), patch);
        await expect(page.locator('[data-act="import"]')).toBeDisabled();
        expect(await dropFiles(page, [file])).toBe(true);
        expect(await page.evaluate(() => window.__posted)).toEqual([]);
    }
    await page.evaluate(() => window.__setDropModel({portable: {available: false}}));
    await expect(page.locator('[data-act="import"]')).toHaveCount(0);
    expect(await dropFiles(page, [file], "body")).toBe(true);
    expect(await page.evaluate(() => window.__posted)).toEqual([]);
    await page.evaluate(() => {
        window.__setDropModel({});
        File.prototype.text = () => new Promise((resolve) => {window.__finishDropRead = resolve;});
    });
    await dropFiles(page, [file]);
    await expect(page.locator('[data-act="import"]')).toBeDisabled();
    await expect(page.locator('.profile-drop-status')).toHaveText("Reading the backup file…");
    await page.evaluate(() => {
        window.__setDropModel({draft: {revision: window.__dropModel.draft.revision + 1}});
        window.__finishDropRead("{}");
    });
    expect(await page.evaluate(() => window.__posted)).toEqual([]);
});
for (const theme of ["plain", "vscode-dark", "vscode-light"]) {
    test(`Mouse edit posts its complete section (${theme})`, async ({page}) => {
        const errors = [];
        page.on("pageerror", error => errors.push(error.message));
        await openPreview(page, theme);
        await page.locator('[data-screen="mouse"]').click();
        const field = page.locator('select[data-macro="normalDpi"]');
        await expect(field).toHaveCount(1);
        await expect(field).toBeEnabled();
        await page.evaluate(() => {window.__posted.length = 0;});
        await field.selectOption("1400");
        await expect.poll(() => page.evaluate(() => window.__posted)).toEqual([
            expect.objectContaining({type: "updateConfigDefaults", sectionId: "normalPointerSpeed", fields: [{macro: "normalDpi", value: "1400"}, {macro: "snipingDpi", value: "200"}]}),
        ]);
        await expect(page.locator("body")).toHaveCSS("padding-left", "0px");
        expect(errors).toEqual([]);
    });
}

for (const theme of ["plain", "vscode-dark", "vscode-light"]) {
    test(`idle timeout units post milliseconds without changing other settings (${theme})`, async ({page}) => {
        await openPreview(page, theme);
        await page.evaluate(async () => {
            const store = await import("/webview/store.mjs");
            const model = structuredClone(store.getModel());
            model.configDefaults.find(section => section.id === "rgbAppearance").fields.find(field => field.macro === "lightingTimeout").value = "60000";
            store.setModel(model);
            store.state.screen = "settings";
            store.state.settingsOpen = ["rgbAppearance"];
            store.render();
            window.__posted.length = 0;
        });
        const input = page.getByRole("textbox", {name: "Idle timeout", exact: true});
        const unit = page.getByRole("combobox", {name: "Idle timeout unit"});
        await expect(input).toHaveValue("1");
        await expect(unit).toHaveValue("minutes");
        await unit.selectOption("seconds");
        await expect(input).toHaveValue("60");
        expect(await page.evaluate(() => window.__posted)).toEqual([]);
        for (const [units, value, ms] of [["seconds", "777", "777000"], ["minutes", "1.5", "90000"], ["seconds", "0.777", "777"], ["minutes", "0", "0"], ["minutes", "1440", "86400000"]]) {
            await unit.selectOption(units);
            await page.evaluate(() => {window.__posted.length = 0;});
            await input.fill(value);
            await input.blur();
            await expect.poll(() => page.evaluate(() => window.__posted)).toEqual([
                expect.objectContaining({type: "updateConfigDefaults", sectionId: "rgbAppearance", fields: expect.arrayContaining([{macro: "lightingTimeout", value: ms}])}),
            ]);
            const posted = await page.evaluate(() => window.__posted[0].fields);
            expect(posted).toHaveLength(8);
            expect(posted.find(field => field.macro === "brightness").value).toBe("200");
        }
        // Letters and signs never reach the field, so they cannot be posted.
        for (const [typed, kept] of [["no time", ""], ["-1", "1"], ["1.5.0", "1.50"]]) {
            await input.fill(typed);
            await expect(input).toHaveValue(kept);
        }
        for (const invalid of ["", "1441"]) {
            await page.evaluate(() => {window.__posted.length = 0;});
            await input.fill(invalid);
            await input.blur();
            expect(await page.evaluate(() => window.__posted)).toEqual([]);
            expect(await input.evaluate(node => node.validity.valid)).toBe(false);
        }
        await input.fill("1");
        await input.blur();
        await input.focus();
        await input.evaluate(node => node.setSelectionRange(0, 1));
        await page.evaluate(async () => (await import("/webview/store.mjs")).render());
        await expect(unit).toHaveValue("minutes");
        await expect(input).toBeFocused();
        expect(await input.evaluate(node => [node.selectionStart, node.selectionEnd])).toEqual([0, 1]);
    });
}

// The web page's controls, where the model offers them (?host=web is the web
// host's model, scripts/preview.js). Each has to post what it says it does.
for (const theme of ["plain", "vscode-dark", "vscode-light"]) {
    test(`the keyboard's name is posted on change, with its byte count kept live (${theme})`, async ({page}) => {
        await openPreview(page, theme);
        await page.locator('[data-screen="settings"]').click();
        const field = page.getByRole("textbox", {name: "Keyboard name", exact: true});
        await expect(field).toHaveAttribute("placeholder", "Charybdis 4x6");
        await expect(page.locator(".settings-pad > .card").first()).toHaveAttribute("data-section", "keyboard");
        await page.evaluate(() => {window.__posted.length = 0;});
        await field.fill("777 · é");
        await expect(page.locator('[data-section="keyboard"] [data-name-count]')).toHaveText("9 / 32 bytes");
        expect(await page.evaluate(() => window.__posted)).toEqual([], "typing posts nothing");
        await field.blur();
        await expect.poll(() => page.evaluate(() => window.__posted)).toEqual([
            expect.objectContaining({type: "renameKeyboard", name: "777 · é", expectedFingerprint: expect.any(String), draftId: expect.any(String)}),
        ]);
        await field.fill("x".repeat(33));
        await expect(page.locator('[data-section="keyboard"] [data-name-count]')).toHaveClass(/warn/);
    });
}

test("the web host's controls post their messages", async ({page}) => {
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    const posted = () => page.evaluate(() => window.__posted.filter((message) => message.type !== "ready"));
    await page.goto("/preview/index.html?host=web");
    await expect(page.locator(".rail-build")).toHaveText(/^Ark .+ · preview$/);

    await page.evaluate(() => {window.__posted.length = 0;});
    await page.locator('.rail [data-act="choose-keyboard"]').click();
    await expect.poll(posted).toEqual([expect.objectContaining({type: "chooseKeyboard"})]);

    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe("dark");
    await page.evaluate(() => {window.__posted.length = 0;});
    await page.locator('.topbar [data-act="theme"]').click();
    await expect.poll(posted).toEqual([expect.objectContaining({type: "setTheme", theme: "light"})]);
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe("light");
    await expect(page.locator('.topbar [data-act="theme"]')).toHaveCount(1);

    await page.locator('[data-screen="profile"]').click();
    await expect(page.locator(".card.recoveries .recovery-row")).toHaveCount(2);
    await expect(page.locator('[data-act="upgrade"]')).toHaveCount(0);
    await page.evaluate(() => {window.__posted.length = 0;});
    await page.locator(".card.recoveries [data-recovery]").first().click();
    await expect.poll(posted).toEqual([expect.objectContaining({type: "downloadRecovery", id: 2})]);
    expect(errors).toEqual([]);
});

test("with no keyboard the web host offers its picker first, and without WebHID says why", async ({page}) => {
    await page.goto("/preview/index.html?host=web-none");
    const placeholder = page.locator(".read-placeholder");
    await expect(placeholder.locator("h2")).toHaveText("Connect your keyboard");
    await page.evaluate(() => {window.__posted.length = 0;});
    await placeholder.locator('[data-act="choose-keyboard"]').click();
    await expect.poll(() => page.evaluate(() => window.__posted)).toEqual([expect.objectContaining({type: "chooseKeyboard"})]);

    await page.goto("/preview/index.html?host=web-unsupported");
    await expect(page.locator(".read-placeholder h2")).toHaveText("Ark needs Chrome or Edge");
    await expect(page.locator('[data-act="choose-keyboard"]')).toHaveCount(0);
    await expect(page.locator('.rail [data-act="refresh"]')).toHaveCount(0);
});

test("the extension's panel has no theme toggle, picker, build line or browser recovery list", async ({page}) => {
    await page.goto("/preview/index.html");
    await expect(page.locator('[data-screen="keys"]')).toBeEnabled();
    await expect(page.locator('[data-act="theme"]')).toHaveCount(0);
    await expect(page.locator('[data-act="choose-keyboard"]')).toHaveCount(0);
    await expect(page.locator(".rail-build")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBeUndefined();
    await page.locator('[data-screen="profile"]').click();
    await expect(page.locator(".card.recoveries")).toHaveCount(0);
    await expect(page.locator('[data-act="upgrade"]')).toHaveCount(0, {message: "the retired PD upgrade export is offered by no host"});
});

// The demo's controls (scripts/preview.js builds the demo's models with the
// real demo session). Each has to post what it says it does.
test("the demo's controls post their messages", async ({page}) => {
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    const posted = () => page.evaluate(() => window.__posted.filter((message) => message.type !== "ready"));
    const clear = () => page.evaluate(() => {window.__posted.length = 0;});

    // With no keyboard the extension offers the demo beside Read keyboard, and
    // a browser without WebHID still offers it.
    await page.goto("/preview/index.html?host=none");
    const placeholder = page.locator(".read-placeholder");
    await expect(placeholder.locator('[data-act="retry"]')).toHaveText("Read keyboard");
    await clear();
    await placeholder.locator('[data-act="explore-demo"]').click();
    await expect.poll(posted).toEqual([{type: "openDemo"}]);
    await expect(page.locator(".demo-banner")).toBeVisible();
    await page.goto("/preview/index.html?host=web-unsupported");
    await expect(page.locator('.read-placeholder [data-act="explore-demo"]')).toHaveCount(1);
    await page.goto("/preview/index.html?host=web-none");
    await expect(page.locator('.read-placeholder [data-act="choose-keyboard"]')).toHaveCount(1);
    await expect(page.locator('.read-placeholder [data-act="explore-demo"]')).toHaveCount(1);

    // In the demo, with nothing to lose: an edit posts, and the banner's
    // controls post without asking.
    await page.goto("/preview/index.html?host=demo");
    await expect(page.locator(".rail-product")).toHaveText("Demo");
    await page.locator('[data-screen="mouse"]').click();
    await clear();
    await page.locator('select[data-macro="normalDpi"]').selectOption("1400");
    await expect.poll(posted).toEqual([expect.objectContaining({type: "updateConfigDefaults", sectionId: "normalPointerSpeed",
        fields: expect.arrayContaining([{macro: "normalDpi", value: "1400"}])})]);
    await clear();
    await page.locator('.demo-banner [data-act="open-demo-profile"]').click();
    await expect.poll(posted).toEqual([expect.objectContaining({type: "openDemoProfile"})]);
    await clear();
    await page.locator('.demo-banner [data-act="leave-demo"]').click();
    await expect.poll(posted).toEqual([expect.objectContaining({type: "leaveDemo"})]);
    expect(JSON.stringify(await posted())).not.toContain("discardDemo");
    await page.locator('[data-screen="device"]').click();
    await expect(page.locator(".main h1")).toHaveText("Keyboard");
    await expect(page.locator(".main")).toContainText("no keyboard");

    // With an edit not exported: the review has Export in Apply's place, and
    // leaving asks first, then says it asked.
    await page.goto("/preview/index.html?host=demo-edited");
    await page.locator('.commit [data-act="review"]').click();
    await expect(page.locator('.sheet [data-act="apply"]')).toHaveCount(0);
    await clear();
    await page.locator('.sheet [data-act="export"]').click();
    await expect.poll(posted).toEqual([expect.objectContaining({type: "exportPortableProfile"})]);
    await page.locator('.sheet [data-act="close"]').first().click();

    for (const [control, type] of [['.demo-banner [data-act="leave-demo"]', "leaveDemo"], ['.demo-banner [data-act="open-demo-profile"]', "openDemoProfile"],
        ['.rail [data-act="choose-keyboard"]', "chooseKeyboard"]]) {
        await clear();
        await page.locator(control).click();
        const ask = page.locator(".sheet.leave-demo");
        await expect(ask).toBeVisible();
        expect(await posted()).toEqual([]);
        await ask.locator('[data-act="stay"]').click();
        await expect(ask).toHaveCount(0);
        expect(await posted()).toEqual([]);
        await page.locator(control).click();
        await ask.locator('[data-act="confirm-leave"]').click();
        await expect.poll(posted).toEqual([expect.objectContaining({type, discardDemo: true})]);
    }
    await clear();
    await page.locator('.demo-banner [data-act="leave-demo"]').click();
    await page.locator('.sheet.leave-demo [data-act="export"]').click();
    await expect.poll(posted).toEqual([expect.objectContaining({type: "exportPortableProfile"})]);
    expect(errors).toEqual([]);
});
