// @ts-check
"use strict";
// The Autocorrect screen. In the preview, every control posts the edit its
// builder makes (the preview applies nothing). In the built page's demo the
// real core takes them: an Add is kept, checked as it is typed, refused in
// words, and reviewed entry by entry.
const {test, expect} = require("@playwright/test");
const {openControls, clearPosts, posted, expectPost, change} = require("./control-preview");

const identity = expect.any(String);

test("adding an entry posts the correction with every typo typed, matching where the form says", async ({page}) => {
    await openControls(page, "autocorrect");
    await expect(page.locator(".main > .topbar h1")).toHaveText("Autocorrect");
    await expect(page.locator("[data-ac-count]")).toHaveText("10 corrections · 15 typos");
    const add = page.locator('[data-act="ac-add"]');
    await expect(add).toBeDisabled();
    await page.locator('[data-f="autocorrect:add:correction"]').fill("definitely");
    await page.locator('[data-f="autocorrect:add:typos"]').fill("definately definitly");
    await page.locator('[data-f="autocorrect:add:match:2"]').check({force: true});
    await expect(add).toBeEnabled();
    // Typing asks the core to check the edit; keeping it posts the edit itself.
    expect((await posted(page)).every((message) => message.type === "validateAutocorrect")).toBe(true);
    expect((await posted(page)).at(-1).edit).toEqual({type: "addAutocorrectTypos", correction: "definitely",
        typos: [{typo: "definately", match: 2}, {typo: "definitly", match: 2}], expectedFingerprint: identity});
    await clearPosts(page);
    await add.click();
    await expectPost(page, {type: "addAutocorrectTypos", correction: "definitely", typos: [{typo: "definately", match: 2}, {typo: "definitly", match: 2}], expectedFingerprint: identity});
    // Enter in the typos field keeps it too, and a correction the list has is named the same way.
    await page.locator('[data-f="autocorrect:add:correction"]').fill("because");
    await page.locator('[data-f="autocorrect:add:match:0"]').check({force: true});
    await page.locator('[data-f="autocorrect:add:typos"]').fill("bcause");
    await clearPosts(page);
    await page.locator('[data-f="autocorrect:add:typos"]').press("Enter");
    await expectPost(page, {type: "addAutocorrectTypos", correction: "because", typos: [{typo: "bcause", match: 0}], expectedFingerprint: identity});
});

test("the open entry posts each edit: a respelling, a typo's spelling, match and correction, another typo, and both deletes", async ({page}) => {
    await openControls(page, "autocorrect");
    await expect(page.locator('[data-ac-entry="because"] .ac-chip')).toHaveText(["beacuse", "becasue", "becuase"]);
    await expect(page.locator('[data-ac-entry="thing"] .ac-chip .ac-where')).toHaveText("anywhere in a word");
    await expect(page.locator('[data-ac-entry="because"] .ac-chip .ac-where')).toHaveCount(0);
    await page.locator('[data-ac-entry="because"]').click();
    const open = page.locator("[data-ac-open]");
    await expect(open).toHaveAttribute("data-ac-entry", "because");
    await clearPosts(page);

    await change(open.locator("[data-ac-correction]"), "Because");
    await expect.poll(async () => (await posted(page)).at(-1)).toEqual(expect.objectContaining({type: "updateAutocorrectCorrection", correction: "because", to: "Because"}));
    await clearPosts(page);

    const typo = page.locator('[data-ac-typo="becasue"]');
    await change(typo.locator("[data-ac-typo-text]"), "becaseu");
    await expect.poll(async () => (await posted(page)).at(-1)).toEqual(expect.objectContaining({type: "updateAutocorrectTypo", typo: "becasue", to: "becaseu"}));
    await clearPosts(page);

    await typo.locator('[data-f="autocorrect:typo:becasue:match:1"]').check({force: true});
    await expectPost(page, {type: "updateAutocorrectTypo", typo: "becasue", match: 1, expectedFingerprint: identity});
    await clearPosts(page);

    await change(typo.locator("[data-ac-move]"), "the");
    await expect.poll(async () => (await posted(page)).at(-1)).toEqual(expect.objectContaining({type: "updateAutocorrectTypo", typo: "becasue", correction: "the"}));
    await clearPosts(page);

    await page.locator("[data-ac-new] [data-f$=':new-match:3']").check({force: true});
    expect(await posted(page)).toEqual([]);
    await page.locator("[data-ac-new-text]").fill("bcuz");
    await clearPosts(page);
    await page.locator("[data-ac-new-text]").press("Enter");
    await expectPost(page, {type: "addAutocorrectTypos", correction: "because", typos: [{typo: "bcuz", match: 3}], expectedFingerprint: identity});
    await clearPosts(page);

    await typo.locator('[data-act="ac-delete-typo"]').click();
    await expectPost(page, {type: "deleteAutocorrectTypo", typo: "becasue", expectedFingerprint: identity});
    await clearPosts(page);
    await open.locator('[data-act="ac-delete-entry"]').click();
    await expectPost(page, {type: "deleteAutocorrectEntry", correction: "because", expectedFingerprint: identity});
});

test("search finds a correction or a typo and opens the entry a typo found; the order changes without a post", async ({page}) => {
    await openControls(page, "autocorrect");
    const rows = page.locator(".ac-rows > [data-ac-entry]");
    await expect(rows).toHaveCount(10);
    await expect(rows.first()).toHaveAttribute("data-ac-entry", "a lot");
    await page.locator('[data-f="autocorrect:sort:typos"]').check({force: true});
    await expect(rows.first()).toHaveAttribute("data-ac-entry", "because");
    const search = page.locator('[data-f="autocorrect:search"]');
    await search.fill("dosen");
    await expect(rows).toHaveCount(1);
    await expect(page.locator("[data-ac-open]")).toHaveAttribute("data-ac-entry", "doesn't");
    await expect(page.locator('[data-ac-typo="dosen\'t"]')).toHaveClass(/found/);
    await expect(search).toBeFocused();
    await search.fill("iph");
    await expect(rows).toHaveCount(1);
    await expect(page.locator("[data-ac-open]")).toHaveCount(0);
    await search.fill("zzz");
    await expect(page.locator(".ac-list .note").first()).toContainText("No correction or typo matches “zzz”.");
    expect(await posted(page)).toEqual([]);
});

test("what the host layout cannot type is said once and marked on its entries, without blocking the list", async ({page}) => {
    await openControls(page, "autocorrect");
    await expect(page.locator("[data-ac-notice]")).toContainText("2 entries will not fire on US.");
    await expect(page.locator('[data-ac-entry="café"]')).toHaveClass(/warn/);
    await expect(page.locator('[data-ac-entry="the"]')).not.toHaveClass(/warn/);
    await expect(page.locator('[data-f="autocorrect:add:correction"]')).toBeEnabled();
    await expect(page.locator("[data-ac-meter]")).toBeVisible();
});

test("in the demo the core keeps an Add, checks what is typed, refuses in words and reviews entry by entry", async ({page}) => {
    await page.goto("/dist/web/index.html");
    await page.locator('.read-placeholder [data-act="explore-demo"]').click();
    await page.locator('[data-screen="autocorrect"]').click();
    const count = page.locator("[data-ac-count]");
    await expect(count).toHaveText("8 corrections · 14 typos");
    const correction = page.locator('[data-f="autocorrect:add:correction"]'), typos = page.locator('[data-f="autocorrect:add:typos"]');
    const feedback = page.locator('[data-ac-feedback="add"]');

    // A typo another correction has is refused as it is typed, and Add is off.
    await correction.fill("ten");
    await typos.fill("teh");
    await expect(feedback).toContainText("“teh” already corrects to “the”.");
    await expect(page.locator('[data-act="ac-add"]')).toBeDisabled();
    // A short part-of-word typo is only warned about.
    await correction.fill("no");
    await typos.fill("on");
    await page.locator('[data-f="autocorrect:add:match:2"]').check({force: true});
    await expect(feedback).toContainText("shorter than four letters");
    await expect(page.locator('[data-act="ac-add"]')).toBeEnabled();
    // What the demo's layout cannot type is refused when it is added.
    await correction.fill("日本");
    await typos.fill("nihon");
    await expect(feedback).toContainText("cannot type “日”, “本”");

    await correction.fill("separate");
    await typos.fill("seperate Seperat");
    await page.locator('[data-f="autocorrect:add:match:0"]').check({force: true});
    await expect(feedback).toBeHidden();
    await page.locator('[data-act="ac-add"]').click();
    await expect(count).toHaveText("9 corrections · 16 typos");
    await expect(correction).toHaveValue("");
    await expect(typos).toHaveValue("");
    const open = page.locator("[data-ac-open]");
    await expect(open).toHaveAttribute("data-ac-entry", "separate");
    await expect(open.locator("[data-ac-typo]")).toHaveCount(2);

    // Typing the same correction again adds to it: still one entry.
    await correction.fill("separate");
    await typos.fill("seprate");
    await typos.press("Enter");
    await expect(count).toHaveText("9 corrections · 17 typos");
    await expect(open.locator("[data-ac-typo]")).toHaveCount(3);

    // Another typo in the open entry, a match changed, a typo moved, one deleted.
    await page.locator("[data-ac-new-text]").fill("separat");
    await page.locator("[data-ac-new-text]").press("Enter");
    await expect(open.locator("[data-ac-typo]")).toHaveCount(4);
    await page.locator('[data-f="autocorrect:typo:seprate:match:1"]').check({force: true});
    // The chip says the match once the core has taken it.
    await open.locator('[data-act="ac-close"]').click();
    await expect(page.locator('[data-ac-entry="separate"] .ac-where')).toHaveText("start of word");
    await page.locator('[data-ac-entry="separate"]').click();
    await page.locator('[data-ac-typo="seperat"] [data-ac-move]').fill("separately");
    await page.locator('[data-ac-typo="seperat"] [data-ac-move]').press("Enter");
    await expect(count).toHaveText("10 corrections · 18 typos");
    await page.locator('[data-ac-typo="separat"] [data-act="ac-delete-typo"]').click();
    await expect(count).toHaveText("10 corrections · 17 typos");
    // A refused edit of the open entry is said by the panel, and nothing changes.
    await page.locator('[data-ac-typo="seprate"] [data-ac-typo-text]').fill("teh");
    await expect(page.locator('[data-ac-feedback="entry"]')).toContainText("“teh” already corrects to “the”.");
    await page.locator('[data-ac-typo="seprate"] [data-ac-typo-text]').press("Enter");
    await expect(count).toHaveText("10 corrections · 17 typos");
    // The correction respelled, then the whole entry deleted.
    await page.locator("[data-ac-correction]").fill("Separate");
    await page.locator("[data-ac-correction]").press("Enter");
    await expect(page.locator("[data-ac-open]")).toHaveAttribute("data-ac-entry", "Separate");

    // Review lists the entries, each once.
    await page.locator('.commit [data-act="review"]').click();
    const review = page.locator('.sheet[aria-label="Review changes"]');
    await expect(review.locator(".rv-sect")).toContainText(["Autocorrect"]);
    await expect(review).toContainText("Separate");
    await expect(review).toContainText("separately");
    await expect(review.locator(".sheet-h h2")).toHaveText("Review 2 changes");
    await expect(review).toContainText("seprate · start of word");
});

// ── files (D-L85) ───────────────────────────────────────────────────────

test("Import, the starter list and Export each post their control from the preview", async ({page}) => {
    await openControls(page, "autocorrect");
    await page.locator('[data-act="ac-import"]').click();
    await expectPost(page, {type: "chooseAutocorrectFile", requestId: expect.any(Number)});
    await expect(page.locator("[data-ac-import]")).toContainText("Reading…");
    await page.locator('[data-act="ac-import-cancel"]').click();
    await expect(page.locator("[data-ac-import]")).toHaveCount(0);
    await clearPosts(page);
    await page.locator('[data-act="ac-starter"]').click();
    await expectPost(page, {type: "previewAutocorrectImport", starter: true, requestId: expect.any(Number)});
    await page.locator('[data-act="ac-import-cancel"]').click();
    for (const format of ["txt", "csv", "json"]) {
        await clearPosts(page);
        await page.locator(`[data-act="ac-export"][data-format="${format}"]`).click();
        await expectPost(page, {type: "exportAutocorrect", format});
    }
    // A dropped file is read in the page and posted with its name.
    await clearPosts(page);
    const {dropFiles} = require("./profile-drop");
    expect(await dropFiles(page, [{text: ":tehn: -> then\n", name: "mine.txt", type: "text/plain"}], ".pad.autocorrect")).toBe(true);
    await expectPost(page, {type: "previewAutocorrectImport", text: ":tehn: -> then\n", name: "mine.txt", requestId: expect.any(Number)});
    // Two files, or one too large, are refused where they are dropped.
    await page.locator('[data-act="ac-import-cancel"]').click();
    await clearPosts(page);
    await dropFiles(page, [{text: "a -> b", name: "a.txt"}, {text: "c -> d", name: "b.txt"}], ".pad.autocorrect");
    await expect(page.locator("[data-ac-file-status]")).toHaveText("Drop one file at a time.");
    await dropFiles(page, [{text: "x".repeat(262145), name: "big.txt"}], ".pad.autocorrect");
    await expect(page.locator("[data-ac-file-status]")).toHaveText("This file is too large for an autocorrect list.");
    expect(await posted(page)).toEqual([]);
});

test("in the demo a list is imported in each format by picker and by drop, previewed, added or replaced, exported, and the starter list added", async ({page}) => {
    const {dropFiles} = require("./profile-drop");
    await page.goto("/dist/web/index.html");
    await page.locator('.read-placeholder [data-act="explore-demo"]').click();
    await page.locator('[data-screen="autocorrect"]').click();
    const count = page.locator("[data-ac-count]"), card = page.locator("[data-ac-import]");
    await expect(count).toHaveText("8 corrections · 14 typos");

    // QMK's text, through the chooser: one line refused with its reason.
    const txt = "# mine\n:tehn: -> then\n:thne: -> then\nsomthing -> something\n:teh: -> ten\n:nto: -> not\n";
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.locator('[data-act="ac-import"]').click()]);
    expect(chooser.element()).toBeTruthy();
    await chooser.setFiles({name: "typos.txt", mimeType: "text/plain", buffer: Buffer.from(txt)});
    await expect(card.locator("h3")).toHaveText("Import typos.txt");
    const add = card.locator('[data-ac-way="add"]');
    await expect(add.locator('[data-ac-line="new"]')).toContainText("3 new corrections, with 4 typos.");
    await expect(add.locator('[data-ac-line="refused"]')).toContainText("5: teh → ten — “teh” already corrects to “the”.");
    await expect(card.locator('[data-ac-way="replace"] [data-ac-line="removed"]')).toContainText("8 entries in your list now are removed.");
    await expect(count).toHaveText("8 corrections · 14 typos");
    await add.locator('[data-act="ac-import-add"]').click();
    await expect(card).toHaveCount(0);
    await expect(count).toHaveText("11 corrections · 18 typos");
    await expect(page.locator('[data-ac-entry="something"] .ac-where')).toHaveText("anywhere in a word");

    // A spreadsheet's CSV, dropped: a typo added to a correction the list has, a duplicate skipped.
    const csv = "﻿typos;correction;match\r\ntehn thn;then;\r\nrecieve;receive;whole word\r\nwierd;weird;sometimes\r\n";
    expect(await dropFiles(page, [{text: csv, name: "sheet.csv", type: "text/csv"}], ".pad.autocorrect")).toBe(true);
    await expect(card.locator("h3")).toHaveText("Import sheet.csv");
    await expect(add.locator('[data-ac-line="added"]')).toContainText("1 typo added to 1 correction you already have.");
    await expect(add.locator('[data-ac-line="duplicates"]')).toContainText("2 typos are already in the list, and skipped.");
    await expect(add.locator('[data-ac-line="refused"]')).toContainText("“sometimes” is not where a typo can match");
    await add.locator('[data-act="ac-import-add"]').click();
    await expect(count).toHaveText("11 corrections · 19 typos");

    // Export in each format, then Ark's own JSON back in to replace the list with itself.
    const exports = {};
    for (const format of ["txt", "csv", "json"]) {
        const [download] = await Promise.all([page.waitForEvent("download"), page.locator(`[data-act="ac-export"][data-format="${format}"]`).click()]);
        expect(download.suggestedFilename()).toMatch(new RegExp(`^charybdis-autocorrect-\\d{4}-\\d\\d-\\d\\d\\.${format}$`));
        exports[format] = require("node:fs").readFileSync(await download.path(), "utf8");
    }
    expect(exports.txt).toContain(":tehn: -> then\n");
    expect(exports.csv.startsWith("correction,typos,match\r\n")).toBe(true);
    expect(JSON.parse(exports.json).version).toBe(1);
    for (const format of ["json", "csv", "txt"]) {
        await dropFiles(page, [{text: exports[format], name: `back.${format}`}], ".pad.autocorrect");
        const replace = card.locator('[data-ac-way="replace"]');
        await expect(replace.locator('[data-ac-line="new"]')).toContainText("11 new corrections, with 19 typos.");
        await expect(card.locator('[data-ac-way="add"] [data-ac-line="nothing"]')).toHaveText("Nothing in it would change your list.");
        await expect(card.locator('[data-act="ac-import-add"]')).toBeDisabled();
        await replace.locator('[data-act="ac-import-replace"]').click();
        await expect(card).toHaveCount(0);
        await expect(count).toHaveText("11 corrections · 19 typos");
    }

    // A file that is no list says so, and changes nothing.
    await dropFiles(page, [{text: "{nope", name: "broken.json"}], ".pad.autocorrect");
    await expect(card.locator(".unavailable")).toHaveText("This file is not a valid autocorrect list.");
    await card.locator('[data-act="ac-import-cancel"]').click();

    // The starter list, added with the same summary.
    await page.locator('[data-act="ac-starter"]').click();
    await expect(card.locator("h3")).toHaveText("Add the starter list");
    await expect(card.locator('[data-ac-way="add"] [data-ac-line="new"]')).toContainText("new corrections");
    await card.locator('[data-act="ac-import-add"]').click();
    await expect(card).toHaveCount(0);
    await expect(page.locator('[data-ac-entry="tomorrow"]')).toHaveCount(1);
    await expect.poll(async () => Number((await count.textContent()).split(" ")[0])).toBeGreaterThan(190);
    // One undo takes the whole import back.
    await page.locator('.rail [data-act="undo"]').click();
    await expect(count).toHaveText("11 corrections · 19 typos");
});

test("an empty list offers the starter list", async ({page}) => {
    await openControls(page, "autocorrect");
    await page.evaluate(async () => {
        const store = await import("/webview/store.mjs");
        const model = structuredClone(store.getModel());
        model.autocorrect.entries = [];
        model.autocorrect.usage = {...model.autocorrect.usage, corrections: 0, typos: 0, textBytes: 0, bytes: 8};
        model.autocorrect.notices = [];
        window.dispatchEvent(new MessageEvent("message", {data: {type: "model", model}}));
        window.__posted.length = 0;
    });
    await expect(page.locator("[data-ac-empty]")).toContainText("No entries yet.");
    await expect(page.locator('[data-act="ac-export"]').first()).toBeDisabled();
    await page.locator('[data-act="ac-starter-empty"]').click();
    await expectPost(page, {type: "previewAutocorrectImport", starter: true, requestId: expect.any(Number)});
});
