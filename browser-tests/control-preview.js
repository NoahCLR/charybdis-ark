// @ts-check
"use strict";
const {expect} = require("@playwright/test");
const {openPreview} = require("./shell-page");
const {emptyCells} = require("../core/model/empty-cells");

async function openControls(page, screen, state = {}, theme = "dark", search = "") {
    await openPreview(page, theme, search);
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

// Publish a behaviour row with `steps` as the core would once it accepts them:
// the key's built-ins with the empty cells those steps give
// (core/model/empty-cells.js), worked out here in Node as core works them
// out. Which tiers a step sets is all a cell reads of it. `row` adds or
// replaces the row's other fields; a key with no row yet starts from its
// published defaults. The built-ins stay the key's own, so a test that sets
// a Transparent Single tap, or holds another pointing mode on a later tap
// count, publishes them itself.
async function publishBehaviour(page, keycode, steps, row = {}) {
    const builtIn = await page.evaluate(async (keycode) => {
        const {getModel} = await import("/webview/store.mjs");
        const model = getModel();
        const row = model.keyBehaviors.find((entry) => entry.keycode === keycode);
        return row ? row.builtIn : model.behaviorEditing.keyDefaults[keycode]?.builtIn || {};
    }, keycode);
    const {cells: _, ...own} = builtIn;
    await page.evaluate(async ({keycode, steps, row, builtIn}) => {
        const store = await import("/webview/store.mjs");
        const model = structuredClone(store.getModel());
        const index = model.keyBehaviors.findIndex((entry) => entry.keycode === keycode);
        const published = {...(index < 0 ? {} : model.keyBehaviors[index]), ...row, keycode, steps, builtIn};
        if (index < 0) model.keyBehaviors.push(published);
        else model.keyBehaviors[index] = published;
        model.draft.revision++;
        window.dispatchEvent(new MessageEvent("message", {data: {type: "model", model}}));
    }, {keycode, steps, row, builtIn: {...own, cells: emptyCells(own, steps.map(({tapCount, tap, hold, longHold}) => ({tapIndex: tapCount, tap, hold, longHold})))}});
}

// A behaviour row's steps as the page has them.
const behaviourSteps = (page, keycode) => page.evaluate(async (keycode) => {
    const {getModel} = await import("/webview/store.mjs");
    return getModel().keyBehaviors.find((entry) => entry.keycode === keycode)?.steps || [];
}, keycode);

module.exports = {openControls, clearPosts, posted, expectPost, change, publishAccepted, publishBehaviour, behaviourSteps};
