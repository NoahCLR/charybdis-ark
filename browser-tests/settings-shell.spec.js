// @ts-check
"use strict";
// Settings, Backups, Keyboard and the Apply moment: the controls this
// package draws are wired and say what the keyboard does.
const {test, expect} = require("@playwright/test");
const {openControls, change, expectPost, clearPosts} = require("./control-preview");

test("the default combo window and the combo hold threshold are editable on current firmware, even without combos", async ({page}) => {
    await openControls(page, "settings");
    await page.evaluate(async () => {
        const store = await import("/webview/store.mjs");
        const model = structuredClone(store.getModel());
        model.combos = [];
        store.setModel(model); store.render();
        window.__posted.length = 0;
    });
    await expect(page.getByText("Flash the updated firmware")).toHaveCount(0);
    const window = page.locator('[data-f="settings:combo:default"]');
    await change(window, 77);
    await expectPost(page, {type: "updateComboDefaultTerm", defaultTermMs: "77"});
    await clearPosts(page);
    await change(page.locator('[data-f="settings:combo:hold"]'), 233);
    await expectPost(page, {type: "updateComboHoldTerm", holdTermMs: "233"});
});

test("Settings: the combo layer matching grid posts its section whole; search says when nothing matches and where else to look", async ({page}) => {
    await openControls(page, "settings");
    await page.locator('[data-section="comboReferences"] > summary').click();
    const select = page.locator('[data-f="setting:comboReference1"]');
    await expect(select).toBeVisible();
    await select.selectOption("Layer 0");
    await expect.poll(() => page.evaluate(() => window.__posted)).toEqual([expect.objectContaining({type: "updateConfigDefaults", sectionId: "comboReferences",
        fields: expect.arrayContaining([expect.objectContaining({macro: "comboReference1", value: "Layer 0"})])})]);
    await page.locator("#settingsSearch").fill("qwerty");
    await expect(page.locator(".settings-empty")).toHaveText("No setting matches “qwerty”.");
    await page.locator("#settingsSearch").fill("dpi");
    await page.getByRole("button", {name: /matches? on Trackball →/}).click();
    await expect(page.locator('[data-screen="mouse"]')).toHaveAttribute("aria-current", "true");
});

test("Keyboard: the title renames the keyboard, and memory and diagnostics live here", async ({page}) => {
    await openControls(page, "device");
    const title = page.locator('[data-f="keyboard:name"]');
    await expect(title).toBeEnabled();
    await title.click();
    await expect(page.locator(".rename-note")).toBeVisible();
    await clearPosts(page);
    await title.fill("Desk 777");
    await title.press("Enter");
    await expect.poll(() => page.evaluate(() => window.__posted)).toEqual([expect.objectContaining({type: "renameKeyboard", name: "Desk 777"})]);
    await expect(page.locator(".card.usage")).toHaveCount(1);
    await expect(page.locator('[data-section="diagnostics"]')).not.toHaveAttribute("open", "");
    await clearPosts(page);
    await page.locator('[data-section="diagnostics"] [data-act="read"]').click();
    await expect.poll(() => page.evaluate(() => window.__posted)).toEqual([expect.objectContaining({type: "refresh"})]);
    await expect(page.locator('[data-section="diagnostics"]')).not.toHaveAttribute("open", "");
    await page.locator('[data-screen="settings"]').click();
    await expect(page.locator('[data-f="settings:keyboard-name"]')).toHaveCount(0);
});

test("Backups: a copy saved before Apply can be used as a draft or deleted, and a chosen file opens as a sheet", async ({page}) => {
    await page.goto("/preview/index.html?host=web");
    await page.locator('[data-screen="profile"]').click();
    await expect(page.locator(".card.usage")).toHaveCount(0);
    await expect(page.locator(".recovery-row .recovery-name").first()).toHaveText(/^Before Apply · .+ · 6 Oct 2026, \d\d:\d\d/);
    await clearPosts(page);
    await page.locator(".recovery-row [data-use]").first().click();
    await expect.poll(() => page.evaluate(() => window.__posted)).toEqual([expect.objectContaining({type: "useRecovery", id: 2})]);
    await clearPosts(page);
    await page.locator(".recovery-row [data-delete]").first().click();
    await expect.poll(() => page.evaluate(() => window.__posted)).toEqual([expect.objectContaining({type: "deleteRecovery", id: 2})]);
    await page.evaluate(async () => {
        const store = await import("/webview/store.mjs");
        const model = structuredClone(store.getModel());
        model.portable.review = {incoming: {layers: 16, behaviors: 1, combos: 0, macros: 0, names: []}, current: {layers: 16, behaviors: 1, combos: 0, macros: 0, names: []},
            fileName: "home.charybdis.json", differences: [], fits: {used: 4101, capacity: 53216}};
        store.setModel(model); store.render();
        window.__posted.length = 0;
    });
    const sheet = page.locator(".import-sheet");
    await expect(sheet).toBeVisible();
    await expect(sheet.locator(".import-fits")).toHaveText("This file fits: 4,101 of 53,216 bytes");
    await sheet.locator('[data-act="cancel"]').click();
    await expect.poll(() => page.evaluate(() => window.__posted)).toEqual([expect.objectContaining({type: "cancelPortableReview"})]);
});

// The Apply moment, drawn from the model the host would publish.
async function withApply(page, patch) {
    await page.goto("/preview/index.html?host=web");
    await expect(page.locator('[data-screen="keys"]')).toBeEnabled();
    await page.evaluate(async (patch) => {
        const store = await import("/webview/store.mjs");
        const model = structuredClone(store.getModel());
        const steps = ["check", "backup", "upload", "validate", "stage", "peer", "commit", "converge", "local", "verify"];
        const at = steps.indexOf(patch.at || "peer");
        const state = patch.state || "applying";
        model.apply = {id: 7, state, current: steps[at], detail: patch.detail || "", bytes: null, waiting: Boolean(patch.waiting),
            failure: state === "failed" ? {step: steps[at], label: steps[at], reason: "The keyboard stopped answering.", saved: patch.saved} : null,
            steps: steps.map((id, index) => ({id, label: id, state: index < at ? "done" : index === at ? (state === "failed" ? "failed" : "active") : "pending"}))};
        model.draft.busy = state !== "failed";
        if (patch.apply === null) model.apply = null;
        Object.assign(model.draft, patch.draft || {});
        Object.assign(model.portable, patch.portable || {});
        Object.assign(store.state, patch.store || {});
        store.setModel(model); store.render();
        window.__posted.length = 0;
    }, patch);
}

test("Apply: three steps with the ten in Details, and the wait for a quiet keyboard as the headline", async ({page}) => {
    await withApply(page, {at: "stage"});
    const bar = page.locator(".commit.ap");
    await expect(bar.locator(".ap-user-steps li")).toHaveText(["Save a copy", "Write both halves", "Switch over"].map((word) => new RegExp(word)));
    await expect(bar.locator(".ap-user-steps li.active")).toContainText("Write both halves");
    await expect(bar.locator(".ap-more .ap-steps li")).toHaveCount(10);
    await expect(bar.locator(".ap-more .ap-steps")).toBeHidden();
    await withApply(page, {at: "peer", waiting: true});
    await expect(page.locator(".commit.ap.waiting [data-countdown]")).toHaveText(/^Let go of every key to finish · (60|59) s$/);
    await expect(page.locator(".unavailable")).toHaveCount(0);
});

test("Apply: each failure says what was saved, never Restore, and a decided save is read again by itself", async ({page}) => {
    for (const [saved, words] of [["none", "Nothing was saved"], ["decided", "finishes this save by itself"], ["unknown", "can't tell what was saved"]]) {
        await withApply(page, {state: "failed", at: saved === "none" ? "upload" : "converge", saved});
        await expect(page.locator(".commit.failed .ap-head")).toContainText(words);
        await expect(page.locator(".commit.failed")).not.toContainText(/restore|part of it/i);
    }
    await expect(page.locator(".commit.failed")).not.toContainText("Reading the keyboard again");
    await withApply(page, {state: "failed", at: "converge", saved: "decided"});
    await expect(page.locator(".commit.failed")).toContainText("Reading the keyboard again in 15 s.");
});

test("Apply: success stays with Put back what it had, which posts its control", async ({page}) => {
    await withApply(page, {apply: null, store: {applied: 7, appliedDismissed: 0}, draft: {dirty: false, busy: false, stale: false, changes: []}, portable: {putBack: "2026-10-18T07:12:00Z"}});
    const bar = page.locator(".commit.done");
    await expect(bar).toContainText("✓ Saved to both halves");
    await bar.locator('[data-act="put-back"]').click();
    await expect.poll(() => page.evaluate(() => window.__posted)).toEqual([expect.objectContaining({type: "putBackProfile"})]);
});

test("a stale draft names what changed on the keyboard and offers Update draft", async ({page}) => {
    await withApply(page, {apply: null, draft: {busy: false, stale: true, connectionChanged: false, keyboardChanged: ["Ball speed: Normal 400 → 600"]}});
    const bar = page.locator(".commit.stale");
    await expect(bar).toContainText("Changed on the keyboard: Ball speed: Normal 400 → 600");
    await expect(bar).toContainText(/your 1 change is kept|your \d+ changes are kept/);
    await bar.locator('[data-act="rebase"]').click();
    await expect.poll(() => page.evaluate(() => window.__posted)).toEqual([expect.objectContaining({type: "rebaseProfileDraft"})]);
});

test("the review's Apply note is neutral and true, and its footer says where the draft goes", async ({page}) => {
    await page.goto("/preview/index.html?host=web");
    await expect(page.locator('[data-screen="keys"]')).toBeEnabled();
    await page.evaluate(async () => {
        const store = await import("/webview/store.mjs");
        const model = structuredClone(store.getModel());
        model.draft.dirty = true; model.draft.changes = [{area: "Settings", unit: "settings", title: "Tap & hold timing", status: "changed", group: 1, fields: []}];
        model.draft.checks = [];
        model.device.health.halves = "agree";
        store.setModel(model); store.state.overlay = "review"; store.render();
    });
    const note = page.locator(".rv-apply-note .callout");
    await expect(note).not.toHaveClass(/warn/);
    await expect(note).toContainText("Apply first saves a copy of what the keyboard has now.");
    await expect(note).not.toContainText("restores");
    await expect(page.locator(".sheet-f .rv-target")).toHaveText(/^To .+ · both halves connected$/);
});

test("first run is neutral, offers both ways in and the firmware; a missing half is said on every screen", async ({page}) => {
    await page.goto("/preview/index.html?host=web-none");
    const card = page.locator(".read-placeholder.first-run");
    await expect(card.locator("h2")).toHaveText("Connect your Charybdis");
    await expect(card.locator(".dot")).toHaveCount(0);
    await expect(card.locator('[data-act="choose-keyboard"]')).toHaveClass(/primary/);
    await expect(card.locator('[data-act="explore-demo"]')).not.toHaveClass(/ghost|primary/);
    await expect(card.locator('a[href*="charybdis-4x6/releases"]')).toHaveCount(1);
    await page.goto("/preview/index.html");
    await expect(page.locator('[data-screen="settings"]')).toBeEnabled();
    for (const screen of ["keys", "settings", "profile"]) {
        await page.locator(`[data-screen="${screen}"]`).click();
        await expect(page.locator(".halves-banner")).toContainText("The left half isn't answering");
    }
    await page.locator('.halves-banner [data-act="to-keyboard"]').click();
    await expect(page.locator('[data-screen="device"]')).toHaveAttribute("aria-current", "true");
    await expect(page.locator('.halves-banner [data-act="to-keyboard"]')).toHaveCount(0);
});
