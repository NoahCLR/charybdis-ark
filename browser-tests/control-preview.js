// @ts-check
"use strict";
const {expect} = require("@playwright/test");
const {openPreview} = require("./shell-page");

async function openControls(page, screen, state = {}, theme = "dark") {
    await openPreview(page, theme);
    await expect(page.locator(`[data-screen="${screen}"]`)).toBeEnabled();
    await page.locator(`[data-screen="${screen}"]`).click();
    await page.evaluate(async state => {
        const store = await import("/webview/store.mjs");
        Object.assign(store.state, state);
        store.render();
        window.__posted.length = 0;
    }, state);
}

const clearPosts = page => page.evaluate(() => {window.__posted.length = 0;});
const posted = page => page.evaluate(() => window.__posted);

async function expectPost(page, message) {
    await expect.poll(() => posted(page)).toEqual([expect.objectContaining({
        draftId: expect.any(String), draftRevision: expect.any(Number), ...message,
    })]);
}

async function change(field, value) {
    await expect(field).toHaveCount(1);
    await expect(field).toBeEnabled();
    await field.fill(String(value));
    // Blur lets the browser emit its real change event and clears its dirty
    // value. A synthetic change would be emitted again at the next blur.
    await field.press("Tab");
}

// Publish through the real message receiver, including acceptedEdit so the
// renderer must rebuild the screen. A counter-only model would keep its DOM
// and falsely prove focus restoration. Patches model what the core accepted;
// the preview never applies edits itself.
async function publishAccepted(page, path, value) {
    await page.evaluate(async ({path, value}) => {
        const {getModel} = await import("/webview/store.mjs");
        const model = structuredClone(getModel());
        let target = model;
        for (const key of path.slice(0, -1)) target = target[key];
        if (path.length) target[path.at(-1)] = value;
        model.draft.revision++;
        window.dispatchEvent(new MessageEvent("message", {data: {
            type: "model", model,
            acceptedEdit: {message: {type: window.__posted.at(-1)?.type || "testEdit"},
                previousFingerprint: "before", fingerprint: "after"},
        }}));
    }, {path, value});
}

module.exports = {openControls, clearPosts, posted, expectPost, change, publishAccepted};
