// @ts-check
"use strict";
// The web page as built (dist/web/), served over http://127.0.0.1 — a secure
// context, as localhost is — with a fake navigator.hid whose keyboard is
// tests/fixtures/fake-keyboard.js, answering in Node. playwright.config.js
// builds the page before these run.
const {profileMacros, editLayers} = require("../tests/fixtures/profile-document");
const {test, expect} = require("@playwright/test");
const {installFakeHid} = require("./fake-hid");
const {fakeKeyboard} = require("../tests/fixtures/fake-keyboard");
const {liveKeyboard} = require("../tests/fixtures/live-keyboard");
const {dropFiles} = require("./profile-drop");
const {document32: pdDocument} = require("../tests/fixtures/pd-slots-32");
const {CHARYBDIS_PRODUCT_ID, CHARYBDIS_VENDOR_ID, QMK_RAW_HID_USAGE, QMK_RAW_HID_USAGE_PAGE} = require("../core/transport/device-adapter");

const PAGE = "/dist/web/index.html";

// A browser context with the fake keyboard plugged in, recording every request
// any of its pages or workers makes.
async function withKeyboard(context, baseURL, keyboards = 1, keyboard = fakeKeyboard({document: pdDocument()})) {
    await context.exposeFunction("__fakeKeyboard", (reportId, bytes) => {
        if (reportId !== 0) throw new Error(`unexpected report id ${reportId}`);
        return keyboard.answer(Buffer.from(bytes)).map((reply) => Array.from(reply));
    });
    await context.addInitScript(installFakeHid, {vendorId: CHARYBDIS_VENDOR_ID, productId: CHARYBDIS_PRODUCT_ID,
        usagePage: QMK_RAW_HID_USAGE_PAGE, usage: QMK_RAW_HID_USAGE, bridge: "__fakeKeyboard", keyboards});
    const requests = [];
    context.on("request", (request) => requests.push(request.url()));
    // Nothing but the page's own files: no fetch, no connection, no manifest.
    const ownFilesOnly = () => {
        const elsewhere = requests.filter((url) => !url.startsWith(new URL("/dist/web/", baseURL).href) && !url.startsWith("blob:"));
        expect(elsewhere).toEqual([]);
        expect(requests.filter((url) => url.endsWith("manifest.json"))).toEqual([]);
    };
    return {keyboard, requests, ownFilesOnly};
}

async function open(page) {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {if (message.type() === "error") errors.push(message.text());});
    await page.goto(PAGE);
    return errors;
}

// The build line links to its commit on GitHub, with GitHub's mark, when the
// page was built from one. A build of uncommitted changes ("-dirty", as when
// these tests run on a work in progress) shows the line alone.
async function expectBuildLink(line, mark) {
    const commit = (await line.textContent()).trim().split(" · ")[1];
    if (/^[0-9a-f]{7,40}$/.test(commit)) {
        expect(await line.evaluate((node) => node.tagName)).toBe("A");
        expect(await line.getAttribute("href")).toBe(`https://github.com/NoahCLR/charybdis-ark/commit/${commit}`);
        await expect(line.locator(`svg.${mark} path`)).toHaveCount(1);
    } else {
        expect(await line.evaluate((node) => node.tagName)).not.toBe("A");
        await expect(line.locator("svg")).toHaveCount(0);
    }
}

const ready = (page) => expect(page.locator('[data-screen="mouse"]')).toBeEnabled({timeout: 20000});

for (const demo of [false, true]) test(`drop a profile into the real ${demo ? "demo" : "keyboard"} import review, use it, and undo`, async ({page, context, baseURL}) => {
    const {keyboard, ownFilesOnly} = await withKeyboard(context, baseURL);
    const errors = await open(page);
    await page.locator(`.read-placeholder [data-act="${demo ? "explore-demo" : "choose-keyboard"}"]`).click();
    await ready(page);
    await page.locator('[data-screen="profile"]').click();
    // Choosing remains available and uses the same review card.
    const file = pdDocument();
    editLayers(file, layers => layers[0][0] = 5);
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.locator('[data-act="import"]').click()]);
    await chooser.setFiles({name: "chosen.charybdis.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(file))});
    await expect(page.locator(".import-sheet")).toContainText("chosen.charybdis.json");
    await page.locator('[data-act="cancel"]').click();
    await expect(page.locator('[data-act="restore"]')).toHaveCount(0);
    await dropFiles(page, [{name: "broken.json", text: "not json"}]);
    await expect(page.locator(".rail-message")).toContainText("Failed");
    await expect(page.locator('[data-act="restore"]')).toHaveCount(0);
    await dropFiles(page, [{name: "dropped.charybdis.json", text: JSON.stringify(file), type: ""}]);
    await expect(page.locator('[data-act="restore"]')).toBeEnabled();
    await expect(page.locator(".import-sheet")).toContainText("dropped.charybdis.json");
    expect(keyboard.mutations).toEqual([]);
    await page.locator('[data-act="restore"]').click();
    await expect(page.locator(".rail-status")).toContainText(/\d+ changes? in draft/);
    await expect(page.locator('[data-act="restore"]')).toHaveCount(0);
    await page.keyboard.press("Meta+z");
    await expect(page.locator(".rail-status")).not.toContainText(/\d+ changes? in draft/);
    expect(keyboard.mutations).toEqual([]);
    expect(errors).toEqual([]);
    ownFilesOnly();
});

test("a file that matches the keyboard changes nothing, but still puts a draft with edits back to it", async ({page, context, baseURL}) => {
    const {keyboard} = await withKeyboard(context, baseURL);
    const errors = await open(page);
    await page.locator('.read-placeholder [data-act="choose-keyboard"]').click();
    await ready(page);
    await page.locator('[data-screen="profile"]').click();
    const card = page.locator(".import-sheet");
    const same = {name: "same.charybdis.json", text: JSON.stringify(pdDocument()), type: ""};
    await dropFiles(page, [same]);
    await expect(card).toContainText("This file holds exactly what the keyboard runs. Using it changes nothing.");
    await expect(page.locator('[data-act="restore"]')).toBeDisabled();
    await page.locator('[data-act="cancel"]').click();
    await expect(page.locator('[data-act="restore"]')).toHaveCount(0);
    // One edit in the draft, from another file.
    const edited = pdDocument();
    editLayers(edited, layers => layers[0][0] = layers[0][0] === 5 ? 6 : 5);
    await dropFiles(page, [{name: "edited.charybdis.json", text: JSON.stringify(edited), type: ""}]);
    await expect(page.locator('[data-act="restore"]')).toBeEnabled();
    await page.locator('[data-act="restore"]').click();
    await expect(page.locator(".rail-status")).toContainText("1 change in draft");
    await expect(page.locator('[data-act="restore"]')).toHaveCount(0);
    await dropFiles(page, [same]);
    await expect(card).toContainText("Using it puts your draft back to that, as Discard all does; Undo brings your 1 change back.");
    await expect(page.locator('[data-act="restore"]')).toBeEnabled();
    await page.locator('[data-act="restore"]').click();
    await expect(page.locator(".rail-status")).not.toContainText(/in draft/);
    await page.keyboard.press("Meta+z");
    await expect(page.locator(".rail-status")).toContainText("1 change in draft");
    expect(keyboard.mutations).toEqual([]);
    expect(errors).toEqual([]);
});

test("choose a keyboard, read it, stage an edit, keep a recovery copy, and reconnect on reload", async ({page, context, baseURL}) => {
    test.setTimeout(90000);
    const {keyboard, ownFilesOnly} = await withKeyboard(context, baseURL);
    await page.emulateMedia({colorScheme: "light"});
    const errors = await open(page);

    // Nothing is allowed yet: the page offers Chrome's picker, in its own words.
    const placeholder = page.locator(".read-placeholder");
    await expect(placeholder.locator("h2")).toHaveText("Connect your keyboard");
    await expect(placeholder).toContainText("pick it in Chrome's list with Choose keyboard");
    await expect(page.locator(".rail-build")).toHaveText(/^Ark \d{4}\.\d+\.\d+\S* · \S+$/);
    await expectBuildLink(page.locator(".rail-build"), "rail-build-mark");
    expect(await page.locator(".rail-build").getAttribute("target")).toBe(await page.locator("a.rail-build").count() ? "_blank" : null);
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe("light");

    // The click reaches the picker while it is still a click.
    await placeholder.locator('[data-act="choose-keyboard"]').click();
    await ready(page);
    expect(await page.evaluate(() => window.__fakeHid)).toEqual({requested: 1, refusedWithoutClick: 0, opened: 1});

    // Stage an edit.
    await page.locator('[data-screen="mouse"]').click();
    const field = page.locator('select[data-macro="normalDpi"]');
    await expect(field).toBeEnabled();
    const other = await field.evaluate((select) => [...select.options].find((option) => !option.selected).value);
    await field.selectOption(other);
    await expect(page.locator(".rail-status")).toContainText("1 change in draft");
    expect(keyboard.mutations).toEqual([]);

    // Export downloads the file the loop names.
    await page.locator('[data-screen="profile"]').click();
    const [exported] = await Promise.all([page.waitForEvent("download"), page.locator('[data-act="export"]').click()]);
    expect(exported.suggestedFilename()).toMatch(/^charybdis-\d{4}-\d\d-\d\d\.charybdis\.json$/);
    await expect(page.locator(".rail-message")).toContainText("in your downloads");
    await expect(page.locator(".card.recoveries")).toContainText("None yet");

    // Apply saves a recovery copy to this browser before it writes anything.
    // The fake keyboard refuses every write, so the Apply stops with nothing
    // saved — and the copy is listed, ready to download.
    await page.locator('[data-act="review"]').click();
    const apply = page.locator('.sheet [data-act="apply"]');
    await expect(apply).toBeEnabled();
    await apply.click();
    const anyway = page.locator('[data-act="apply-anyway"]');
    if (await anyway.count()) await anyway.click();
    await expect(page.locator(".commit.failed")).toBeVisible({timeout: 20000});
    await expect(page.locator(".commit.failed .ap-saved")).toHaveText("Nothing was saved: the keyboard kept the profile it had.");
    // The notice starts with the same verdict and is shown as a failure.
    await expect(page.locator(".rail-message.err > span")).toHaveText(/^Nothing was saved: the keyboard kept the profile it had\. [A-Z]/);
    await expect(page.locator(".rail-message")).not.toContainText(/Failed|Candidate|mutation|ambiguous|wait window/);
    expect(keyboard.mutations.length).toBeGreaterThan(0);
    expect(keyboard.mutations.every((report) => keyboard.unhandled.includes(report))).toBe(true);
    await page.locator('.commit.failed [data-act="dismiss"]').click();
    await page.locator('[data-screen="profile"]').click();
    const copies = page.locator(".card.recoveries .recovery-row");
    await expect(copies).toHaveCount(1);
    await expect(copies.first().locator(".recovery-name")).toHaveText(/^Before Apply · .+ · \d{1,2} \w{3} \d{4}, \d\d:\d\d$/);
    await expect(copies.first().locator(".recovery-name")).toHaveAttribute("title", /^recovery-.+\.charybdis\.json$/);
    const [recovery] = await Promise.all([page.waitForEvent("download"), copies.first().locator("[data-recovery]").click()]);
    expect(recovery.suggestedFilename()).toMatch(/^recovery-.+\.charybdis\.json$/);

    // The theme toggle sits at the top right, and the choice outlives a reload.
    await page.locator('.topbar [data-act="theme"]').click();
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe("dark");

    // Leaving with unapplied edits asks first.
    const dialogs = [];
    page.on("dialog", (dialog) => {dialogs.push(dialog.type()); void dialog.accept();});
    await page.reload();
    expect(dialogs).toEqual(["beforeunload"]);

    // Once chosen, the keyboard reconnects without the picker.
    await ready(page);
    expect(await page.evaluate(() => window.__fakeHid.requested)).toBe(0);
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe("dark");
    expect(errors.filter((text) => !/beforeunload/i.test(text))).toEqual([]);
    ownFilesOnly();
});

test("a second tab is refused, and takes over when the first closes", async ({page, context, baseURL}) => {
    test.setTimeout(60000);
    const {ownFilesOnly} = await withKeyboard(context, baseURL);
    await open(page);
    await page.locator('.read-placeholder [data-act="choose-keyboard"]').click();
    await ready(page);

    const second = await context.newPage();
    const errors = await open(second);
    const placeholder = second.locator(".read-placeholder");
    await expect(placeholder.locator("h2")).toHaveText("Ark is open in another tab");
    await expect(placeholder.locator("button")).toHaveCount(0);
    await expect(second.locator('.rail [data-act="choose-keyboard"]')).toHaveCount(0);
    await expect(second.locator('.rail [data-act="refresh"]')).toHaveCount(0);
    expect(await second.evaluate(() => window.__fakeHid.opened)).toBe(0);

    await page.close();
    await ready(second);
    expect(errors).toEqual([]);
    ownFilesOnly();
});

test("without WebHID the page says Ark needs Chrome or Edge over HTTPS", async ({page, context, baseURL}) => {
    const requests = [];
    context.on("request", (request) => requests.push(request.url()));
    await context.addInitScript(() => Object.defineProperty(Navigator.prototype, "hid", {configurable: true, get: () => undefined}));
    const errors = await open(page);
    const placeholder = page.locator(".read-placeholder");
    await expect(placeholder.locator("h2")).toHaveText("Ark needs Chrome or Edge");
    await expect(placeholder).toContainText("HTTPS");
    await expect(page.locator('[data-act="choose-keyboard"]')).toHaveCount(0);

    // The demo needs no keyboard, so it is still offered, and works.
    await placeholder.locator('[data-act="explore-demo"]').click();
    await ready(page);
    await expect(page.locator(".demo-banner")).toContainText("Demo · no keyboard");
    await page.locator('[data-screen="profile"]').click();
    const [exported] = await Promise.all([page.waitForEvent("download"), page.locator('[data-act="export"]').click()]);
    expect(exported.suggestedFilename()).toMatch(/^charybdis-demo-/);
    expect(errors).toEqual([]);
    expect(requests.filter((url) => !url.startsWith(new URL("/dist/web/", baseURL).href) && !url.startsWith("blob:"))).toEqual([]);
});

// The demo needs no keyboard: a browser with WebHID but nothing chosen, where
// the fake keyboard is never asked anything.
test("explore the demo: edit on several screens, review with no Apply, export, open a profile file and leave", async ({page, context, baseURL}) => {
    test.setTimeout(90000);
    const {keyboard, ownFilesOnly} = await withKeyboard(context, baseURL);
    const errors = await open(page);
    const placeholder = page.locator(".read-placeholder");
    await expect(placeholder.locator("h2")).toHaveText("Connect your keyboard");
    await expect(placeholder.locator('[data-act="choose-keyboard"]')).toBeVisible();
    await placeholder.locator('[data-act="explore-demo"]').click();
    await ready(page);

    // It never looks like a keyboard.
    const banner = page.locator(".demo-banner");
    await expect(banner).toContainText("Demo · no keyboard");
    await expect(banner).toContainText("No keyboard is connected");
    await expect(page.locator(".rail-product")).toHaveText("Demo");
    await expect(page.locator(".rail-keyboard .dot.demo")).toHaveCount(1);
    await expect(page.locator(".rail-status")).not.toContainText(/Connected|halves|Recovery/);

    // Mouse: a pointer speed.
    await page.locator('[data-screen="mouse"]').click();
    const dpi = page.locator('select[data-macro="normalDpi"]');
    await expect(dpi).toBeEnabled();
    await dpi.selectOption(await dpi.evaluate((select) => [...select.options].find((option) => !option.selected).value));
    await expect(page.locator(".rail-status")).toContainText("1 change in draft");
    // Custom keys: a name.
    await page.locator('[data-screen="customKeys"]').click();
    const keyName = page.locator(".main [data-name]").first();
    await expect(keyName).toBeEnabled();
    await keyName.fill("Demo key");
    await keyName.dispatchEvent("change");
    await expect(page.locator(".rail-status")).toContainText("2 changes in draft");
    // Macros: a name.
    await page.locator('[data-screen="macros"]').click();
    const macroName = page.locator(".main [data-name]").first();
    await expect(macroName).toBeEnabled();
    await macroName.fill("Demo macro");
    await macroName.dispatchEvent("change");
    await expect(page.locator(".rail-status")).toContainText("3 changes in draft");

    // The review shows them, says Apply needs a keyboard and offers Export.
    await page.locator('.commit [data-act="review"]').click();
    const sheet = page.locator(".sheet");
    await expect(sheet.locator("h2")).toHaveText("Review 3 changes");
    for (const area of ["Mouse", "Custom keys", "Macros"]) await expect(sheet.locator(".rv-sect h4", {hasText: area})).toHaveCount(1);
    await expect(sheet).toContainText("Apply needs a keyboard");
    await expect(sheet.locator('[data-act="apply"], [data-act="apply-anyway"]')).toHaveCount(0);
    const [exported] = await Promise.all([page.waitForEvent("download"), sheet.locator('[data-act="export"]').click()]);
    expect(exported.suggestedFilename()).toMatch(/^charybdis-demo-\d{4}-\d\d-\d\d\.charybdis\.json$/);
    const file = JSON.parse(await (await exported.createReadStream()).toArray().then((chunks) => Buffer.concat(chunks).toString("utf8")));
    await expect(page.locator(".rail-message")).toContainText("Import it on your keyboard");
    await page.locator('.sheet [data-act="close"]').first().click();

    // Open a profile file: exported just now, so nothing is asked first.
    const replacement = pdDocument();
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), banner.locator('[data-act="open-demo-profile"]').click()]);
    await chooser.setFiles({name: "mine.charybdis.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(replacement))});
    await expect(page.locator(".rail-message")).toContainText("Opened mine.charybdis.json in the demo.");
    await expect(banner).toContainText("mine.charybdis.json");
    await expect(page.locator(".rail-status")).not.toContainText(/in draft/);

    // The exported file is one Import takes, as on a keyboard.
    await page.locator('[data-screen="profile"]').click();
    const [importChooser] = await Promise.all([page.waitForEvent("filechooser"), page.locator('[data-act="import"]').click()]);
    await importChooser.setFiles({name: "demo.charybdis.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(file))});
    await expect(page.locator('[data-act="restore"]')).toBeEnabled();
    await page.locator('[data-act="restore"]').click();
    await expect(page.locator(".rail-status")).toContainText(/\d+ changes? in draft/);

    // Leaving with edits not exported asks first, and offers Export.
    await banner.locator('[data-act="leave-demo"]').click();
    const ask = page.locator(".sheet.leave-demo");
    await expect(ask).toContainText("have not been exported");
    await expect(ask.locator('[data-act="export"]')).toBeVisible();
    await ask.locator('[data-act="confirm-leave"]').click();
    await expect(banner).toHaveCount(0);
    await expect(placeholder.locator("h2")).toHaveText("Connect your keyboard");

    expect(keyboard.requests).toEqual([], "nothing was sent to a keyboard");
    expect(await page.evaluate(() => window.__fakeHid)).toEqual({requested: 0, refusedWithoutClick: 0, opened: 0});
    expect(errors).toEqual([]);
    ownFilesOnly();
});

// A phone (web/phone.mjs): touch only, with a phone-sized screen. It gets a
// notice and nothing else: no panel, and no shell to take the keyboard's lock,
// open IndexedDB or start the worker. A tablet or a narrow desktop window
// still gets Ark.
const phone = {viewport: {width: 390, height: 844}, screen: {width: 390, height: 844}, deviceScaleFactor: 3, isMobile: true, hasTouch: true};
const tablet = {viewport: {width: 744, height: 1133}, screen: {width: 744, height: 1133}, deviceScaleFactor: 2, isMobile: true, hasTouch: true};

test("a phone gets a notice that Ark runs on a computer, with the repositories, and nothing of Ark", async ({browser, baseURL}) => {
    const context = await browser.newContext({...phone, baseURL, colorScheme: "light"});
    try {
        const {requests, ownFilesOnly} = await withKeyboard(context, baseURL);
        const page = await context.newPage();
        const errors = await open(page);
        const notice = page.locator(".phone-notice");
        // At the top, the board's shape: every key and the trackball, no legends.
        const board = notice.locator("svg.phone-board");
        await expect(notice.locator(":scope > *").first()).toHaveClass("phone-board");
        await expect(board.locator("rect.phone-key")).toHaveCount(56);
        await expect(board.locator("circle.phone-ball")).toHaveCount(1);
        await expect(board.locator("text")).toHaveCount(0);
        await expect(notice.locator("h1")).toHaveText("Ark runs on a computer");
        await expect(notice).toContainText("Chrome or Edge on a computer");
        await expect(notice).toContainText(`Open this page there: ${new URL(baseURL).host}`);
        const buttons = notice.locator(".phone-links a");
        await expect(buttons).toHaveText(["Ark on GitHub", "The firmware on GitHub", "Buy a Charybdis from BastardKB"]);
        expect(await buttons.evaluateAll((links) => links.map((link) => link.href)))
            .toEqual(["https://github.com/NoahCLR/charybdis-ark", "https://github.com/NoahCLR/charybdis-4x6", "https://bastardkb.com/"]);
        // GitHub's mark on the two GitHub links, and only there.
        expect(await buttons.evaluateAll((links) => links.map((link) => link.querySelectorAll("svg.phone-icon path").length)))
            .toEqual([1, 1, 0]);
        await expect(notice.locator(".phone-seller")).toContainText("hundreds of hours of good firmware and hardware tinkering");
        await expect(notice.locator(".phone-build")).toHaveText(/^Ark \d{4}\.\d+\.\d+\S* · \S+$/);
        await expectBuildLink(notice.locator(".phone-build"), "phone-build-mark");
        expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe("light");

        // Nothing of Ark: no panel, and no shell behind it.
        await expect(page.locator(".app, .read-placeholder")).toHaveCount(0);
        expect(await page.evaluate(() => typeof window.acquirePanelApi)).toBe("undefined");
        expect(await page.evaluate(async () => {
            const locks = await navigator.locks.query();
            return {locks: locks.held.length + locks.pending.length, databases: (await indexedDB.databases()).length, hid: window.__fakeHid};
        })).toEqual({locks: 0, databases: 0, hid: {requested: 0, refusedWithoutClick: 0, opened: 0}});
        expect(requests.filter((url) => /\/worker-[A-Z0-9]+\.js$/.test(url))).toEqual([]);

        // It fits the screen, and turning the phone keeps the notice.
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
        await page.setViewportSize({width: 844, height: 390});
        await expect(notice).toBeVisible();
        await expect(page.locator(".app")).toHaveCount(0);
        expect(errors).toEqual([]);
        ownFilesOnly();
    } finally {
        await context.close();
    }
});

test("a tablet still gets Ark: the demo, and that Ark needs Chrome or Edge to connect", async ({browser, baseURL}) => {
    const context = await browser.newContext({...tablet, baseURL});
    try {
        await context.addInitScript(() => Object.defineProperty(Navigator.prototype, "hid", {configurable: true, get: () => undefined}));
        const page = await context.newPage();
        const errors = await open(page);
        const placeholder = page.locator(".read-placeholder");
        await expect(placeholder.locator("h2")).toHaveText("Ark needs Chrome or Edge");
        await expect(placeholder.locator('[data-act="explore-demo"]')).toBeVisible();
        await expect(page.locator(".phone-notice")).toHaveCount(0);
        expect(errors).toEqual([]);
    } finally {
        await context.close();
    }
});

test("a narrow window on a computer still gets Ark", async ({browser, baseURL}) => {
    const context = await browser.newContext({viewport: {width: 380, height: 800}, baseURL});
    try {
        await withKeyboard(context, baseURL);
        const page = await context.newPage();
        const errors = await open(page);
        await expect(page.locator(".read-placeholder h2")).toHaveText("Connect your keyboard");
        await expect(page.locator(".phone-notice")).toHaveCount(0);
        expect(errors).toEqual([]);
    } finally {
        await context.close();
    }
});


test("literal macro steps stage through the real web shell, export exactly, undo and redo", async ({page, context, baseURL}) => {
    const {keyboard, ownFilesOnly} = await withKeyboard(context, baseURL);
    const errors = await open(page);
    await page.locator('.read-placeholder [data-act="explore-demo"]').click();
    await ready(page);
    await page.locator('[data-screen="macros"]').click();
    await page.locator('[data-slot="MACRO_17"]').click();
    await page.locator('[data-insert-kind="text"]').click();
    const text = ' {"key": "{KC_A}"}\nhello ';
    await page.locator("[data-step-text]").fill(text);
    await expect(page.locator("[data-macro-feedback]")).toBeHidden();
    await expect(page.locator(".rail-status")).not.toContainText(/in draft/);
    await page.locator("[data-step-text]").dispatchEvent("change");
    await expect(page.locator(".rail-status")).toContainText("1 change in draft");
    await page.locator('.commit [data-act="review"]').click();
    const [exported] = await Promise.all([page.waitForEvent("download"), page.locator('.sheet [data-act="export"]').click()]);
    const file = JSON.parse(await (await exported.createReadStream()).toArray().then(chunks => Buffer.concat(chunks).toString("utf8")));
    expect(Buffer.from(profileMacros(file)[17], "base64").toString("utf8")).toBe(text);
    await page.locator('.sheet [data-act="close"]').first().click();
    await page.locator('.rail [data-act="undo"]').click();
    await expect(page.locator(".macro-empty")).toBeVisible();
    await expect(page.locator("[data-step-text]")).toHaveCount(0);
    await page.locator('.rail [data-act="redo"]').click();
    await expect(page.locator("[data-step-text]")).toHaveValue(text);
    // Step history must also work after the real web shell accepts a deletion.
    await page.locator('[data-step-tile="0"]').click(); await page.keyboard.press('Delete');
    await expect(page.locator('.macro-empty')).toBeVisible();
    await expect(page.locator('.macro-titlebar [data-local-state]')).toHaveText('as read');
    await page.keyboard.press('Control+z');
    await expect(page.locator('[data-step-text]')).toHaveValue(text);
    await expect(page.locator('.macro-titlebar [data-local-state]')).toHaveText('changed in draft');
    await page.keyboard.press('Control+Shift+z');
    await expect(page.locator('.macro-empty')).toBeVisible();
    await expect(page.locator('.macro-titlebar [data-local-state]')).toHaveText('as read');
    expect(keyboard.requests).toEqual([]);
    expect(errors).toEqual([]);
    ownFilesOnly();
});

test("Disconnect lets go of the keyboard, and the page does not reopen it", async ({page, context, baseURL}) => {
    await withKeyboard(context, baseURL);
    await open(page);
    await page.locator('.read-placeholder [data-act="choose-keyboard"]').click();
    await ready(page);
    await page.locator('.rail [data-act="forget-keyboard"]').click();
    await expect(page.locator(".rail-product")).toHaveText("No keyboard connected");
    await expect(page.locator('.rail [data-act="forget-keyboard"]')).toHaveCount(0);
    await expect(page.locator(".rail-message")).toContainText("Disconnected");
    expect(await page.evaluate(() => window.__fakeHid.forgotten)).toBe(1);

    await page.reload();
    await expect(page.locator(".read-placeholder h2")).toHaveText("Connect your keyboard");
    expect(await page.evaluate(() => window.__fakeHid.opened)).toBe(0);
});

test("a keyboard that restarts under a new name is followed, and called by it", async ({page, context, baseURL}) => {
    await withKeyboard(context, baseURL);
    const errors = await open(page);
    await page.locator('.read-placeholder [data-act="choose-keyboard"]').click();
    await ready(page);
    await expect(page.locator(".rail-product")).toHaveText("Charybdis 4x6");
    await page.evaluate(() => window.__fakeHidReenumerate(0, "Desk board"));
    await expect(page.locator(".rail-product")).toHaveText("Desk board");
    await expect(page.locator(".rail-keyboard .dot.ok")).toHaveCount(1);
    await ready(page);
    expect(await page.evaluate(() => window.__fakeHid.requested)).toBe(1, "no second trip to Chrome's picker");
    expect(errors).toEqual([]);
});

test("every keyboard Chrome allows is the connected one or in the selector, as they come and go", async ({page, context, baseURL}) => {
    await withKeyboard(context, baseURL, 2);
    await open(page);
    const picker = page.locator("select#rail-device-picker");
    const name = page.locator(".rail-keyboard");

    // Allow both; the second chosen is the one connected, the selector holds both.
    await page.locator('.read-placeholder [data-act="choose-keyboard"]').click();
    await ready(page);
    await expect(picker).toHaveCount(0);
    await page.evaluate(() => {window.__fakeHidPick = 1;});
    await page.locator('.rail [data-act="choose-keyboard"]').click();
    await expect(picker.locator("option")).toHaveCount(2);
    await expect(name.locator(".dot.ok")).toHaveCount(1);

    // Unplugged, a keyboard leaves the selector; plugged back in, it returns.
    await page.evaluate(() => window.__fakeHidPlug(0, false));
    await expect(picker).toHaveCount(0);
    await expect(name.locator(".dot.ok")).toHaveCount(1);
    await page.evaluate(() => window.__fakeHidPlug(0, true));
    await expect(picker.locator("option")).toHaveCount(2);

    // Disconnecting one connects the one still allowed, not "No keyboard".
    await page.locator('.rail [data-act="forget-keyboard"]').click();
    await expect(picker).toHaveCount(0);
    await expect(name.locator(".dot.ok")).toHaveCount(1);
    await expect(page.locator(".rail-product")).not.toHaveText("No keyboard connected");

    // Unplugging the connected one leaves nothing; plugging it in connects it.
    const left = await page.evaluate(() => JSON.parse(localStorage.getItem("fake-hid-granted"))[0]);
    await page.evaluate((index) => window.__fakeHidPlug(index, false), left);
    await expect(page.locator(".rail-product")).toHaveText("No keyboard connected");
    await page.evaluate((index) => window.__fakeHidPlug(index, true), left);
    await expect(name.locator(".dot.ok")).toHaveCount(1);
});

test("the web shell reads, edits and Applies one profile generation without VIA", async ({page, context, baseURL}) => {
    const {writableKeyboard} = require("../tests/fixtures/writable-keyboard");
    const {validateSnapshot} = require("../core/model/portable-profile");
    const keyboard = writableKeyboard({document: pdDocument(), generation: 7});
    const {ownFilesOnly} = await withKeyboard(context, baseURL, 1, keyboard);
    const errors = await open(page);
    await page.locator('.read-placeholder [data-act="choose-keyboard"]').click();
    await ready(page);
    await page.locator('[data-screen="mouse"]').click();
    const dpi = page.locator('select[data-macro="normalDpi"]');
    const next = await dpi.evaluate(select => [...select.options].find(option => !option.selected).value);
    await dpi.selectOption(next);
    await expect(page.locator(".rail-status")).toContainText("1 change in draft");
    await page.locator('.commit [data-act="review"]').click();
    await page.locator('.sheet [data-act="apply"]').click();
    const confirm = page.locator('[data-act="apply-anyway"]');
    if (await confirm.count()) await confirm.click();
    await expect(page.locator(".rail-status")).not.toContainText(/changes? in draft/, {timeout: 20000});
    await expect(dpi).toBeEnabled({timeout: 20000});
    await expect(dpi).toHaveValue(next);
    expect(keyboard.generation).toBe(8);
    expect(keyboard.local.profile).toEqual(keyboard.slave.profile);
    const document = {format: "charybdis-profile", version: 5, keyboard: "charybdis-4x6", actionAbiDigest: pdDocument().actionAbiDigest, profile: keyboard.active.toString("base64")};
    expect(validateSnapshot(document).settings.values[require("../core/schema/settings-domain-v1").SETTING.DEFAULT_DPI]).toBe(Number(next));
    expect(keyboard.events).toEqual(["begin", "validated", "commit", "decision", "activated"]);
    expect(keyboard.mutations.every(report => [7, 9].includes(report[0]) && report[1] === 0)).toBe(true);
    expect(keyboard.requests.some(report => [1, 2, 0x0c, 0x0e, 0x12].includes(report[0]))).toBe(false);
    expect(errors).toEqual([]); ownFilesOnly();
});

// Live + review through the real web shell (firmware D-F32): an edit reaches
// the keyboard at once, review compares it with what is saved, and Save makes
// it the saved profile, with a recovery copy of what was saved before.
test("in Live + review an edit reaches the keyboard at once, and review and Save make it permanent", async ({page, context, baseURL}) => {
    test.setTimeout(90000);
    const keyboard = liveKeyboard({document: pdDocument()});
    const {ownFilesOnly} = await withKeyboard(context, baseURL, 1, keyboard);
    const errors = await open(page);
    await page.locator('.read-placeholder [data-act="choose-keyboard"]').click();
    await ready(page);
    await expect(page.locator('[data-f="rail:edit-mode"]')).toHaveValue("2");

    await page.locator('[data-screen="mouse"]').click();
    const field = page.locator('select[data-macro="normalDpi"]');
    await expect(field).toBeEnabled();
    const other = await field.evaluate((select) => [...select.options].find((option) => !option.selected).value);
    await field.selectOption(other);
    await expect(page.locator(".rail-status")).toContainText("1 unsaved change on the keyboard");
    expect(keyboard.working, "the keyboard runs the edit").toBeTruthy();
    expect(keyboard.events).toContain("published");

    await page.locator('.commit.live [data-act="review"]').click();
    await expect(page.locator(".sheet")).toContainText("Running now");
    const save = page.locator('.sheet [data-act="apply"]');
    await expect(save).toHaveText("Save on keyboard");
    await expect(save).toBeEnabled();
    await save.click();
    const anyway = page.locator('[data-act="apply-anyway"]');
    if (await anyway.count()) await anyway.click();
    await expect(page.locator(".rail-message")).toContainText("Saved on both halves", {timeout: 20000});
    expect(keyboard.events).toContain("saved");
    expect(keyboard.working).toBe(null);
    await expect(page.locator(".commit.live")).toHaveCount(0);
    await page.locator('[data-screen="profile"]').click();
    await expect(page.locator(".card.recoveries .recovery-row")).toHaveCount(1);

    // A key changed again, then Revert puts back what is saved.
    await page.locator('[data-screen="mouse"]').click();
    const again = await field.evaluate((select) => [...select.options].find((option) => !option.selected).value);
    await field.selectOption(again);
    await expect(page.locator(".commit.live")).toBeVisible();
    await page.locator('.commit.live [data-act="revert"]').click();
    await expect(page.locator(".commit.live")).toHaveCount(0);
    expect(keyboard.events).toContain("reverted");
    expect(errors).toEqual([]);
    ownFilesOnly();
});

// Live through the real web shell: Ark switches into it (no unsaved edits, so
// no question), an edit runs at once, and the page shows "saved by the
// keyboard" once the keyboard's status says so; Ark never sends Save. Leaving
// the page then loses nothing, so it does not ask.
test("in Live the keyboard saves an edit by itself and the page says so, without asking on leaving", async ({page, context, baseURL}) => {
    test.setTimeout(90000);
    const keyboard = liveKeyboard({document: pdDocument(), autoSaveAfterReads: 2});
    const {ownFilesOnly} = await withKeyboard(context, baseURL, 1, keyboard);
    const errors = await open(page);
    await page.locator('.read-placeholder [data-act="choose-keyboard"]').click();
    await ready(page);
    await page.locator('[data-f="rail:edit-mode"]').selectOption("1");
    await expect(page.locator(".rail-message")).toContainText("Edits now reach the keyboard by Live", {timeout: 20000});
    expect(keyboard.mode).toBe(1);

    await page.locator('[data-screen="mouse"]').click();
    const field = page.locator('select[data-macro="normalDpi"]');
    await expect(field).toBeEnabled();
    const other = await field.evaluate((select) => [...select.options].find((option) => !option.selected).value);
    await field.selectOption(other);
    await expect(page.locator(".rail-status")).toContainText("Saved by the keyboard", {timeout: 20000});
    expect(keyboard.events).toContain("auto-saved");
    expect(keyboard.working).toBe(null);
    expect(keyboard.mutations.some(report => report[2] === 0x25), "Ark never asked it to save").toBe(false);
    await expect(page.locator(".commit.live")).toHaveCount(0);
    // A second edit, then the page closes before the keyboard saves it: the
    // page does not ask, and opened again it reads what the keyboard kept.
    const third = await field.evaluate((select) => [...select.options].find((option) => !option.selected).value);
    await field.selectOption(third);
    await expect.poll(() => keyboard.events.filter((event) => event === "auto-saved").length, {timeout: 20000}).toBe(2);
    await expect(page.locator(".rail-status")).toContainText("Saved by the keyboard", {timeout: 20000});
    const dialogs = [];
    page.on("dialog", (dialog) => {dialogs.push(dialog.type()); void dialog.accept();});
    await page.reload();
    expect(dialogs).toEqual([]);
    await ready(page);
    await expect(page.locator('[data-f="rail:edit-mode"]')).toHaveValue("1");
    await page.locator('[data-screen="mouse"]').click();
    await expect(page.locator('select[data-macro="normalDpi"]')).toHaveValue(third);
    await expect(page.locator(".commit.live")).toHaveCount(0);
    expect(errors).toEqual([]);
    ownFilesOnly();
});

// Chrome on macOS holds back a page's input reports while one of its native
// menus is open. In Live, a press on a select pauses the looks at the keyboard
// until the menu closes, and answers held back for longer than any timeout do
// not drop the keyboard.
test("in Live a held-open menu pauses the looks, and answers held back never drop the keyboard", async ({page, context, baseURL}) => {
    test.setTimeout(60000);
    const keyboard = liveKeyboard({document: pdDocument()});
    await withKeyboard(context, baseURL, 1, keyboard);
    const errors = await open(page);
    await page.locator('.read-placeholder [data-act="choose-keyboard"]').click();
    await ready(page);
    await page.locator('[data-f="rail:edit-mode"]').selectOption("1");
    await expect(page.locator(".rail-message")).toContainText("Edits now reach the keyboard by Live", {timeout: 20000});
    await expect.poll(() => page.evaluate(() => window.__fakeHidSent), {timeout: 5000}).toBeGreaterThan(0);

    // The menu opens: no look goes out while it may be open. A real press
    // moves focus to the select, so the control focused before (a screen
    // button clicked earlier) loses it just after the press.
    const menu = page.locator('[data-f="rail:edit-mode"]');
    await page.locator('[data-screen="mouse"]').focus();
    await menu.dispatchEvent("pointerdown");
    await menu.focus();
    await page.evaluate(() => window.__fakeHidHold(true));
    const sent = await page.evaluate(() => window.__fakeHidSent);
    await page.waitForTimeout(2500);
    expect(await page.evaluate(() => window.__fakeHidSent), "no look while the menu may be open").toBe(sent);

    // It closes without a choice; looks resume while the answers are still
    // held back past every timeout, then they arrive late.
    await page.mouse.move(5, 5);
    await expect.poll(() => page.evaluate(() => window.__fakeHidSent), {timeout: 5000}).toBeGreaterThan(sent);
    await page.waitForTimeout(4000);
    await page.evaluate(() => window.__fakeHidHold(false));
    await page.waitForTimeout(2500);
    await expect(page.locator(".read-placeholder")).toHaveCount(0);
    await expect(page.locator(".rail-keyboard .dot.ok")).toHaveCount(1);
    expect(errors).toEqual([]);
});
