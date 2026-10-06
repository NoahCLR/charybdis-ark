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
    expect(errors).toEqual([]);
    expect(requests.filter((url) => !url.startsWith(new URL("/dist/web/", baseURL).href))).toEqual([]);
});
