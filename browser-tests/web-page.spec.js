"use strict";
// The web page as built (dist/web/), served over http://127.0.0.1 — a secure
// context, as localhost is — with a fake navigator.hid whose keyboard is
// tests/fixtures/fake-keyboard.js, answering in Node. playwright.config.js
// builds the page before these run.
const {test, expect} = require("@playwright/test");
const {installFakeHid} = require("./fake-hid");
const {fakeKeyboard} = require("../tests/fixtures/fake-keyboard");
const {document: pdDocument} = require("../tests/fixtures/pd-profile");
const {CHARYBDIS_PRODUCT_ID, CHARYBDIS_VENDOR_ID, QMK_RAW_HID_USAGE, QMK_RAW_HID_USAGE_PAGE} = require("../core/transport/device-adapter");

const PAGE = "/dist/web/index.html";

// A browser context with the fake keyboard plugged in, recording every request
// any of its pages or workers makes.
async function withKeyboard(context, baseURL) {
    const keyboard = fakeKeyboard({document: pdDocument()});
    await context.exposeFunction("__fakeKeyboard", (reportId, bytes) => {
        if (reportId !== 0) throw new Error(`unexpected report id ${reportId}`);
        return keyboard.answer(Buffer.from(bytes)).map((reply) => Array.from(reply));
    });
    await context.addInitScript(installFakeHid, {vendorId: CHARYBDIS_VENDOR_ID, productId: CHARYBDIS_PRODUCT_ID,
        usagePage: QMK_RAW_HID_USAGE_PAGE, usage: QMK_RAW_HID_USAGE, bridge: "__fakeKeyboard"});
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

const ready = (page) => expect(page.locator('[data-screen="mouse"]')).toBeEnabled({timeout: 20000});

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
    await expect(page.locator(".commit.failed")).toContainText("Nothing was saved");
    expect(keyboard.mutations.length).toBeGreaterThan(0);
    expect(keyboard.mutations.every((report) => keyboard.unhandled.includes(report))).toBe(true);
    await page.locator('.commit.failed [data-act="dismiss"]').click();
    await page.locator('[data-screen="profile"]').click();
    const copies = page.locator(".card.recoveries .recovery-row");
    await expect(copies).toHaveCount(1);
    await expect(copies.first().locator(".mono")).toHaveText(/^recovery-.+\.charybdis\.json$/);
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
    await expect(second.locator('.rail [data-act="refresh"]')).toBeDisabled();
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
    await expect(page.locator(".rail-status")).toContainText("Demo · no keyboard");
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
    await expect(page.locator(".rail-status")).toContainText("Draft clean");

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
