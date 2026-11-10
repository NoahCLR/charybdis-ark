// @ts-check
"use strict";
// The Text replacement screen (its id is the keyboard's name for the feature,
// autocorrect). In the preview, every control posts the edit its builder
// makes (the preview applies nothing). In the built page's demo the real core
// takes them: an added replacement is kept, checked as it is typed, refused
// in words, and reviewed entry by entry.
const {test, expect} = require("@playwright/test");
const {openControls, clearPosts, posted, expectPost} = require("./control-preview");
const {dropFiles} = require("./profile-drop");

const identity = expect.any(String);
// What the screen posted, without the checks it asks of the core as it is typed in.
const edits = async (page) => (await posted(page)).filter((message) => message.type !== "validateAutocorrect");
const row = (page, id) => page.locator(`.ac-rows > [data-ac-entry="${id}"]`);
const openDemo = async (page) => {
    await page.goto("/dist/web/index.html");
    await page.locator('.read-placeholder [data-act="explore-demo"]').click();
    await page.locator('[data-screen="autocorrect"]').click();
};

test("the screen is the list: its name, its counts, its columns and its memory, with no ceiling of replacements", async ({page}) => {
    await openControls(page, "autocorrect");
    await expect(page.locator('.rail [data-screen="autocorrect"]')).toContainText("Text replacement");
    await expect(page.locator(".main > .topbar h1")).toHaveText("Text replacement");
    await expect(page.locator(".main > .topbar .sub")).toContainText("Fixes typos and types longer text for you");
    await expect(page.locator("[data-ac-count]")).toHaveText("10 replacements · 15 typed");
    await expect(page.locator(".ac-heads span")).toHaveText(["Replacement", "Typed"]);
    await expect(page.locator("[data-ac-memory]")).toHaveText("15 of 1,024 typed · 375 of 34,824 bytes");
    await expect(page.locator("[data-ac-meter]")).toBeVisible();
    // The list comes first: nothing but a banner or a notice stands above it.
    await expect(page.locator(".ac-layout > :first-child")).toHaveClass(/ac-list/);
    // No switch here, and nothing says typo, correction or a match by name.
    await expect(page.locator('.pad.autocorrect [data-macro="autocorrect"]')).toHaveCount(0);
    const text = await page.locator(".pad.autocorrect .ac-list").innerText();
    expect(text).not.toMatch(/correction|typos\b|whole word|start of word|end of word|anywhere in a word|1,024 replacements/i);
    // A typed form is shown as it is written, with * where other letters may go.
    await expect(row(page, "because").locator(".ac-chip")).toHaveText(["beacuse", "becasue", "becuase"]);
    await expect(row(page, "thing").locator(".ac-chip")).toHaveText(["*tihng*"]);
    await expect(row(page, "un").locator(".ac-chip")).toHaveText(["nu*"]);
    await expect(row(page, "ment").locator(".ac-chip")).toHaveText(["*mnet"]);
    await expect(row(page, "+31 6 1234 5678").locator(".ac-chip")).toHaveText(["pnumber"]);
});

test("Add replacement opens a row at the top: typed forms become chips, and it posts the replacement with each as written", async ({page}) => {
    await openControls(page, "autocorrect");
    await page.locator('[data-act="ac-add"]').click();
    const adding = page.locator("[data-ac-adding]");
    await expect(page.locator(".ac-rows > :first-child")).toHaveAttribute("data-ac-adding", "");
    const replacement = adding.locator('[data-f="autocorrect:add:replacement"]'), typed = adding.locator('[data-f="autocorrect:add:typed"]'), save = adding.locator('[data-act="ac-add-save"]');
    await expect(replacement).toBeFocused();
    await expect(save).toBeDisabled();
    await expect(adding.locator("[data-ac-hint]")).toHaveText("Add * where other letters may go: recieve* also fixes recieved and recieving.");
    // No control says where a typed form matches: the * does.
    await expect(adding.locator('[data-f*=":match"]')).toHaveCount(0);
    await replacement.fill("definitely");
    await replacement.press("Enter");
    await expect(typed).toBeFocused();
    // A space or Enter turns what is typed into a chip; Backspace on the empty field takes the last one back.
    await typed.pressSequentially("definately definitly ");
    await expect(adding.locator(".ac-tokens .ac-chip")).toHaveText(["definately×", "definitly×"]);
    await typed.pressSequentially("oops");
    await typed.press("Enter");
    await expect(adding.locator(".ac-tokens .ac-chip")).toHaveCount(3);
    await expect(typed).toHaveValue("");
    await typed.press("Backspace");
    await expect(adding.locator(".ac-tokens .ac-chip")).toHaveText(["definately×", "definitly×"]);
    await typed.pressSequentially("recieve*");
    await expect(save).toBeEnabled();
    // Typing asks the core to check the edit as it stands; keeping it posts the edit itself.
    expect((await posted(page)).at(-1)).toEqual(expect.objectContaining({type: "validateAutocorrect",
        edit: {type: "addAutocorrectTypos", correction: "definitely", typos: [{typo: "definately"}, {typo: "definitly"}, {typo: "recieve*"}], expectedFingerprint: identity}}));
    await clearPosts(page);
    await typed.press("Enter");
    await expect(adding.locator(".ac-tokens .ac-chip")).toHaveCount(3);
    await typed.press("Enter");
    expect(await edits(page)).toEqual([expect.objectContaining({type: "addAutocorrectTypos", correction: "definitely",
        typos: [{typo: "definately"}, {typo: "definitly"}, {typo: "recieve*"}], expectedFingerprint: identity})]);
});

test("the add row says when its replacement is already on the list, takes a chip away, and Add and Cancel do as they say", async ({page}) => {
    await openControls(page, "autocorrect");
    await page.locator('[data-act="ac-add"]').click();
    const adding = page.locator("[data-ac-adding]");
    await adding.locator('[data-f="autocorrect:add:replacement"]').fill("because");
    await expect(adding.locator("[data-ac-joins]")).toHaveText("“because” is already on your list: this adds to it.");
    await adding.locator('[data-f="autocorrect:add:replacement"]').fill("because of");
    await expect(adding.locator("[data-ac-joins]")).toHaveCount(0);
    await adding.locator('[data-f="autocorrect:add:replacement"]').fill("because");
    await adding.locator('[data-f="autocorrect:add:typed"]').pressSequentially("bcause,bcuz bcos ");
    await expect(adding.locator(".ac-tokens .ac-chip")).toHaveCount(3);
    await adding.locator('[data-act="ac-token-remove"]').nth(1).click();
    await expect(adding.locator(".ac-tokens .ac-chip")).toHaveText(["bcause×", "bcos×"]);
    await clearPosts(page);
    await adding.locator('[data-act="ac-add-save"]').click();
    expect(await edits(page)).toEqual([expect.objectContaining({type: "addAutocorrectTypos", correction: "because", typos: [{typo: "bcause"}, {typo: "bcos"}]})]);
    await clearPosts(page);
    await adding.locator('[data-act="ac-add-cancel"]').click();
    await expect(page.locator("[data-ac-adding]")).toHaveCount(0);
    await expect(page.locator('[data-act="ac-add"]')).toBeFocused();
    expect(await edits(page)).toEqual([]);
});

test("a replacement can play a macro: Text or Macro in the add row, a macro picked by its name, posted by its slot", async ({page}) => {
    await openControls(page, "autocorrect");
    await page.locator('[data-act="ac-add"]').click();
    const adding = page.locator("[data-ac-adding]");
    await adding.locator(".seg label", {hasText: "Macro"}).click();
    await expect(adding.locator('[data-f="autocorrect:add:kind:macro"]')).toBeChecked();
    const menu = adding.locator('[data-f="autocorrect:add:macro"]');
    await expect(menu).toBeVisible();
    await expect(adding.locator('[data-f="autocorrect:add:replacement"]')).toHaveCount(0);
    await expect(adding.locator("[data-ac-hint]")).toHaveText("A macro plays for the whole word only, as it is stored, and Backspace does not take it back.");
    await expect(menu.locator("option").first()).toHaveText("Choose a macro…");
    await expect(menu.locator("option").last()).toHaveText("New macro…");
    await expect(menu.locator('option[value="3"]')).toHaveText(/^Macro 3/);
    await menu.selectOption("3");
    await adding.locator('[data-f="autocorrect:add:typed"]').pressSequentially("sig sgi ");
    await clearPosts(page);
    await adding.locator('[data-act="ac-add-save"]').click();
    expect(await edits(page)).toEqual([expect.objectContaining({type: "addAutocorrectTypos", macro: 3, typos: [{typo: "sig"}, {typo: "sgi"}], expectedFingerprint: identity})]);
    // New macro… goes to Macros, on a slot with nothing in it.
    await adding.locator('[data-f="autocorrect:add:macro"]').selectOption("new");
    await expect(page.locator(".main > .topbar h1")).toHaveText("Macros");
});

test("a row adds another typed form in place, and its field stays for the next", async ({page}) => {
    await openControls(page, "autocorrect");
    const because = row(page, "because");
    await because.hover();
    await because.locator('[data-act="ac-more"]').click();
    const more = because.locator("[data-ac-more]");
    await expect(more).toBeFocused();
    await expect(because.locator(".ac-more-hint")).toContainText("Add * where other letters may go");
    await more.fill("bcuz");
    await clearPosts(page);
    await more.press("Enter");
    expect(await edits(page)).toEqual([expect.objectContaining({type: "addAutocorrectTypos", correction: "because", typos: [{typo: "bcuz"}], expectedFingerprint: identity})]);
    await expect(more).toBeFocused();
    await more.fill("*cuz bcos");
    await clearPosts(page);
    await more.press("Enter");
    expect(await edits(page)).toEqual([expect.objectContaining({type: "addAutocorrectTypos", correction: "because", typos: [{typo: "*cuz"}, {typo: "bcos"}]})]);
    // Escape closes it, with focus back on what opened it.
    await more.press("Escape");
    await expect(because.locator("[data-ac-more]")).toHaveCount(0);
    await expect(because.locator('[data-act="ac-more"]')).toBeFocused();
});

test("a chip opens its typed form's panel: written anew with or without *, moved to another replacement, or removed", async ({page}) => {
    await openControls(page, "autocorrect");
    const because = row(page, "because"), chip = because.locator('[data-ac-chip="becasue"]');
    await chip.click();
    const panel = because.locator("[data-ac-pop]");
    await expect(panel).toBeVisible();
    await expect(chip).toHaveAttribute("aria-expanded", "true");
    await expect(panel).toHaveAttribute("role", "dialog");
    const text = panel.locator("[data-ac-typed-text]");
    await expect(text).toBeFocused();
    await expect(text).toHaveValue("becasue");
    await expect(panel.locator(".note").first()).toHaveText("Add * where other letters may go: recieve* also fixes recieved and recieving.");
    // No list of matches to choose from: the * is the whole of it.
    await expect(panel.locator("select, [type=radio]")).toHaveCount(0);
    await text.fill("becaseu*");
    await clearPosts(page);
    await text.press("Enter");
    expect(await edits(page)).toEqual([expect.objectContaining({type: "updateAutocorrectTypo", typo: "becasue", to: "becaseu*", expectedFingerprint: identity})]);
    await clearPosts(page);
    const move = panel.locator("[data-ac-move]");
    await expect(move).toHaveAttribute("list", "acReplacements");
    await move.fill("the");
    await move.press("Enter");
    expect(await edits(page)).toEqual([expect.objectContaining({type: "updateAutocorrectTypo", typo: "becasue", correction: "the", expectedFingerprint: identity})]);
    await clearPosts(page);
    // Moved to a replacement the list does not have yet, that one is made.
    await move.fill("be cause");
    await move.press("Enter");
    expect(await edits(page)).toEqual([expect.objectContaining({type: "updateAutocorrectTypo", typo: "becasue", correction: "be cause"})]);
    await clearPosts(page);
    await panel.locator('[data-act="ac-remove-typed"]').click();
    expect(await edits(page)).toEqual([expect.objectContaining({type: "deleteAutocorrectTypo", typo: "becasue", expectedFingerprint: identity})]);
});

test("a panel closes at Escape, at Done, at its chip and at a press outside, and another chip opens its own", async ({page}) => {
    await openControls(page, "autocorrect");
    const because = row(page, "because"), chip = because.locator('[data-ac-chip="becasue"]'), panel = page.locator("[data-ac-pop]");
    await chip.click();
    await panel.locator("[data-ac-typed-text]").press("Escape");
    await expect(panel).toHaveCount(0);
    await expect(chip).toBeFocused();
    await chip.click();
    await panel.locator('[data-act="ac-close"]').click();
    await expect(panel).toHaveCount(0);
    await chip.click();
    await expect(panel).toHaveCount(1);
    await chip.click();
    await expect(panel).toHaveCount(0);
    await chip.click();
    await because.locator('[data-ac-chip="becuase"]').click();
    await expect(panel).toHaveCount(1);
    await expect(panel.locator("[data-ac-typed-text]")).toHaveValue("becuase");
    await page.locator(".main > .topbar h1").click();
    await expect(panel).toHaveCount(0);
    expect(await edits(page)).toEqual([]);
});

test("a replacement is changed where it stands, to other text or to a macro, and deleted from its row", async ({page}) => {
    await openControls(page, "autocorrect");
    const the = row(page, "the");
    await the.locator('[data-act="ac-edit-replacement"]').click();
    const text = the.locator("[data-ac-text]");
    await expect(text).toBeFocused();
    await expect(text).toHaveValue("the");
    await text.fill("The");
    await clearPosts(page);
    await text.press("Enter");
    expect(await edits(page)).toEqual([expect.objectContaining({type: "updateAutocorrectCorrection", correction: "the", to: "The", expectedFingerprint: identity})]);
    await clearPosts(page);
    await the.locator(".seg label", {hasText: "Macro"}).click();
    await the.locator("[data-ac-macro]").selectOption("7");
    expect(await edits(page)).toEqual([expect.objectContaining({type: "updateAutocorrectCorrection", correction: "the", toMacro: 7, expectedFingerprint: identity})]);
    await the.locator("[data-ac-macro]").press("Escape");
    await expect(the.locator("[data-ac-open]")).toHaveCount(0);
    await expect(the.locator('[data-act="ac-edit-replacement"]')).toBeFocused();
    await clearPosts(page);
    const iphone = row(page, "iPhone");
    await iphone.hover();
    await expect(iphone.locator('[data-act="ac-delete"]')).toHaveAttribute("aria-label", "Delete the replacement iPhone");
    await iphone.locator('[data-act="ac-delete"]').click();
    expect(await edits(page)).toEqual([expect.objectContaining({type: "deleteAutocorrectEntry", correction: "iPhone", expectedFingerprint: identity})]);
});

test("a replacement that plays a macro shows the macro's name, is told apart, and is edited and deleted by its slot", async ({page}) => {
    await openControls(page, "autocorrect");
    // As core publishes a list with one: its id is no text's, its macro a slot.
    await page.evaluate(async () => {
        const store = await import("/webview/store.mjs");
        const model = structuredClone(store.getModel());
        model.macros[5] = {...model.macros[5], name: "Sign-off", empty: false};
        model.autocorrect.entries.push({id: "\u0001macro:5", correction: "", macro: 5, warnings: [], typos: [{typo: "sig", typed: "sig", match: 0, warnings: []}]},
            {id: "\u0001macro:6", correction: "", macro: 6, warnings: ["“Macro 6” has no steps, so this replacement does nothing yet. Add steps in Macros, or choose another replacement."], typos: [{typo: "addr", typed: "addr", match: 0, warnings: []}]});
        window.dispatchEvent(new MessageEvent("message", {data: {type: "model", model}}));
        window.__posted.length = 0;
    });
    const played = page.locator('.ac-rows > [data-ac-entry$="macro:5"]');
    await expect(played.locator(".ac-rep-text .tag")).toHaveText("Macro");
    await expect(played.locator(".ac-rep-words")).toHaveText("Sign-off");
    // One whose macro is empty says so on its row, as a pointing mode that runs an empty macro is said.
    const empty = page.locator('.ac-rows > [data-ac-entry$="macro:6"]');
    await expect(empty).toHaveClass(/warn/);
    await expect(empty.locator(".ac-warning")).toContainText("has no steps, so this replacement does nothing yet");
    // Its typed form's panel says a macro is for whole words.
    await played.locator('[data-ac-chip="sig"]').click();
    await expect(played.locator("[data-ac-pop] .note").first()).toContainText("A macro plays for the whole word only");
    await played.locator('[data-ac-pop] [data-act="ac-close"]').click();
    await played.locator('[data-act="ac-edit-replacement"]').click();
    await expect(played.locator("[data-ac-macro]")).toHaveValue("5");
    await played.locator(".seg label", {hasText: "Text"}).click();
    await played.locator("[data-ac-text]").fill("Kind regards");
    await played.locator("[data-ac-text]").press("Enter");
    expect(await edits(page)).toEqual([expect.objectContaining({type: "updateAutocorrectCorrection", macro: 5, to: "Kind regards", expectedFingerprint: identity})]);
    await clearPosts(page);
    await played.locator("[data-ac-text]").press("Escape");
    await played.hover();
    await played.locator('[data-act="ac-delete"]').click();
    expect(await edits(page)).toEqual([expect.objectContaining({type: "deleteAutocorrectEntry", macro: 5, expectedFingerprint: identity})]);
});

test("search finds a replacement or something typed, showing the replacement it is typed for; the order changes without a post", async ({page}) => {
    await openControls(page, "autocorrect");
    const rows = page.locator(".ac-rows > [data-ac-entry]");
    await expect(rows).toHaveCount(10);
    await expect(rows.first()).toHaveAttribute("data-ac-entry", "+31 6 1234 5678");
    await page.locator('[data-f="autocorrect:sort:typed"]').check({force: true});
    await expect(rows.first()).toHaveAttribute("data-ac-entry", "because");
    const search = page.locator('[data-f="autocorrect:search"]');
    await search.fill("dosen");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toHaveAttribute("data-ac-entry", "doesn't");
    await expect(page.locator('[data-ac-chip="dosen\'t"]')).toHaveClass(/found/);
    await expect(page.locator('[data-ac-chip="doesnt"]')).not.toHaveClass(/found/);
    await expect(search).toBeFocused();
    await search.fill("iph");
    await expect(rows).toHaveCount(1);
    await expect(page.locator(".ac-chip.found")).toHaveCount(0);
    await search.fill("*tihng*");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toHaveAttribute("data-ac-entry", "thing");
    await search.fill("zzz");
    await expect(page.locator("[data-ac-none]")).toHaveText("Nothing on your list matches “zzz”.");
    expect(await posted(page)).toEqual([]);
});

test("what the host layout cannot type is said once and marked on its entries, without blocking the list", async ({page}) => {
    await openControls(page, "autocorrect");
    await expect(page.locator("[data-ac-notice]")).toHaveCount(0);
    // As core publishes a list after the host layout changed under it.
    await page.evaluate(async () => {
        const store = await import("/webview/store.mjs");
        const model = structuredClone(store.getModel());
        const warning = "US cannot type “é”, so this replacement will not be typed.";
        model.autocorrect.entries.push({id: "café", correction: "café", warnings: [warning], typos: [{typo: "cafe", typed: "cafe", match: 0, warnings: []}]});
        model.autocorrect.notices = ["1 replacement will not fire on US."];
        window.dispatchEvent(new MessageEvent("message", {data: {type: "model", model}}));
    });
    await expect(page.locator("[data-ac-notice]")).toContainText("1 replacement will not fire on US.");
    await expect(row(page, "café")).toHaveClass(/warn/);
    await expect(row(page, "café").locator(".ac-warning")).toHaveText("US cannot type “é”, so this replacement will not be typed.");
    await expect(row(page, "the")).not.toHaveClass(/warn/);
    await expect(page.locator('[data-act="ac-add"]')).toBeEnabled();
    await expect(page.locator("[data-ac-meter]")).toBeVisible();
    // A typed form with a warning is amber, its reason in its tip and in its panel.
    const short = row(page, "un").locator('[data-ac-chip="nu"]');
    await expect(short).toHaveClass(/warn/);
    await expect(short).toHaveAttribute("data-tip", /is a short typed form with \*, so it fires inside many words/);
    await short.click();
    await expect(page.locator("[data-ac-pop] .ac-warning")).toContainText("is a short typed form with *");
});

// ── the switch is a Host setting (D-L87) ───────────────────────────────

test("the switch is a Host setting with a link to the list, and the list's screen says so while it is off", async ({page}) => {
    await openControls(page, "host");
    const card = page.locator('.settings-group[data-section="autocorrect"]');
    await expect(card.locator("h3")).toHaveText("Text replacement");
    // After Your computer, whose layout it types through, and before the key swaps.
    await expect(page.locator(".settings-pad > .settings-group")).toHaveCount(3);
    expect(await page.locator(".settings-pad > .settings-group").evaluateAll((cards) => cards.map((node) => node.getAttribute("data-section")))).toEqual(["host", "autocorrect", "keyboardOptions"]);
    const setting = card.locator(".setrow");
    await expect(setting.locator(".nm")).toContainText("Enabled");
    await expect(setting.locator(".kk-mark")).toHaveText(["↺ keyboard keys change this too"]);
    await expect(setting.locator(".hint")).toContainText("fixes typos and types your replacements when you finish a word");
    const toggle = card.locator('[data-macro="autocorrect"]');
    await expect(toggle).not.toBeChecked();
    await clearPosts(page);
    await toggle.check({force: true});
    await expectPost(page, {type: "updateConfigDefaults", sectionId: "autocorrect", fields: [{macro: "autocorrect", enabled: true}], expectedFingerprint: identity});
    // Key swaps & typing does not list it.
    await expect(page.locator('.settings-group[data-section="keyboardOptions"] [data-macro="autocorrect"]')).toHaveCount(0);
    await expect(page.locator('[data-macro="autocorrect"]')).toHaveCount(1);
    // Its link goes to the list.
    await card.locator('[data-act="section-screen"]').click();
    await expect(page.locator(".main > .topbar h1")).toHaveText("Text replacement");
    // Off, the list's screen says so across its top, as the combo and behaviour editors do, and the banner goes to the switch.
    const banner = page.locator(".pad.autocorrect [data-master-off]");
    await expect(banner).toContainText("Text replacement is off.");
    await expect(banner).toContainText("Turn it on in Host settings");
    await expect(page.locator(".pad.autocorrect > :first-child")).toHaveAttribute("data-master-off", "");
    await banner.click();
    await expect(page.locator(".main > .topbar h1")).toHaveText("Host");
    await expect(page.locator('.settings-group[data-section="autocorrect"]')).toBeVisible();
});

// ── Try it ──────────────────────────────────────────────────────────────

test("Try it posts what was typed, Backspace and Caps Lock included, and shows what the core answers", async ({page}) => {
    await openControls(page, "autocorrect");
    // Beside the list where there is room for both.
    const list = await page.locator(".ac-list").boundingBox(), aside = await page.locator(".ac-try").boundingBox();
    expect(aside.x).toBeGreaterThan(list.x + list.width - 1);
    const box = page.locator('[data-f="autocorrect:try:text"]');
    await clearPosts(page);
    await box.pressSequentially("teh ");
    const last = async () => (await posted(page)).at(-1);
    await expect.poll(last).toEqual(expect.objectContaining({type: "tryAutocorrect", before: "", typed: "teh ", capsLock: false, requestId: expect.any(Number)}));
    // The core's answer is the text in the box, the line under it and the mark on the entry.
    const answer = (result) => page.evaluate(async (result) => {
        const {getModel} = await import("/webview/store.mjs");
        const {draft} = getModel();
        window.dispatchEvent(new MessageEvent("message", {data: {type: "autocorrectTry", requestId: window.__posted.at(-1).requestId, draftId: draft.id, draftRevision: draft.revision, result}}));
    }, result);
    await answer({text: "the ", fired: [{entry: "the", correction: "the", typo: "teh"}], undone: false});
    await expect(box).toHaveValue("the ");
    await expect(page.locator("[data-ac-try-said]")).toHaveText("“teh” was replaced with “the”.");
    await expect(page.locator(".ac-row.fired")).toHaveAttribute("data-ac-entry", "the");
    await expect(page.locator(".ac-chip.fired")).toHaveText("teh");
    // One character gone from the end is a Backspace.
    await box.press("Backspace");
    await expect.poll(last).toEqual(expect.objectContaining({type: "tryAutocorrect", before: "", typed: "teh \b"}));
    await answer({text: "teh", fired: [], undone: true});
    await expect(box).toHaveValue("teh");
    await expect(page.locator("[data-ac-try-said]")).toContainText("Backspace put the word back");
    await expect(page.locator(".ac-row.fired")).toHaveCount(0);
    // A replacement that plays a macro is said by the macro's name.
    await box.pressSequentially(" ");
    await answer({text: "teh ", fired: [{entry: "\u0001macro:3", correction: "", typo: "sig", macro: 3}], undone: false});
    await expect(page.locator("[data-ac-try-said]")).toHaveText("“sig” plays macro “Macro 3”.");
    // An edit in the middle is what a click is to the keyboard: the text stands, and typing starts afresh.
    await box.fill("tex");
    await expect.poll(last).toEqual(expect.objectContaining({type: "tryAutocorrect", before: "tex", typed: ""}));
    // Caps Lock is posted with what is typed.
    await page.locator('[data-f="autocorrect:try:caps"]').check({force: true});
    await expect.poll(last).toEqual(expect.objectContaining({type: "tryAutocorrect", before: "tex", typed: "", capsLock: true}));
    // Clear empties the box and asks nothing.
    await answer({text: "tex", fired: [], undone: false});
    await clearPosts(page);
    await page.locator('[data-act="ac-try-clear"]').click();
    await expect(box).toHaveValue("");
    expect(await posted(page)).toEqual([]);
});

test("on a narrow screen Try it folds under the list, and the rows stack", async ({page}) => {
    await page.setViewportSize({width: 700, height: 900});
    await openControls(page, "autocorrect");
    const list = await page.locator(".ac-list").boundingBox(), aside = await page.locator(".ac-try").boundingBox();
    expect(aside.y).toBeGreaterThan(list.y + list.height - 1);
    const box = page.locator('[data-f="autocorrect:try:text"]'), fold = page.locator('[data-act="ac-try-fold"]');
    await expect(box).toBeHidden();
    await expect(fold).toHaveAttribute("aria-expanded", "false");
    await fold.click();
    await expect(box).toBeVisible();
    await expect(page.locator('[data-act="ac-try-fold"]')).toHaveAttribute("aria-expanded", "true");
    // Nothing runs off the side.
    expect(await page.evaluate(() => document.querySelector(".pad.autocorrect").scrollWidth <= document.querySelector(".pad.autocorrect").clientWidth + 1)).toBe(true);
    // With no pointer to hover, the row's own controls are always there.
    await expect(row(page, "the").locator('[data-act="ac-more"]')).toBeVisible();
});

// ── files (D-L85) ───────────────────────────────────────────────────────

test("Import, the starter list and the Export menu each post their control from the preview", async ({page}) => {
    await openControls(page, "autocorrect");
    await page.locator('[data-act="ac-import"]').click();
    await expectPost(page, {type: "chooseAutocorrectFile", requestId: expect.any(Number)});
    await expect(page.locator("[data-ac-import]")).toContainText("Reading…");
    await page.locator('[data-act="ac-import-cancel"]').click();
    await expect(page.locator("[data-ac-import]")).toHaveCount(0);
    // One Export button, with the three formats in its menu.
    await expect(page.locator('[data-act="ac-export"]')).toHaveCount(0);
    const exportButton = page.locator('[data-act="ac-export-menu"]');
    await expect(exportButton).toHaveAttribute("aria-expanded", "false");
    for (const format of ["txt", "csv", "json"]) {
        await clearPosts(page);
        await exportButton.click();
        await expect(exportButton).toHaveAttribute("aria-expanded", "true");
        await expect(page.locator(".ac-menu [role=menuitem]")).toHaveText(["Text (QMK)", "CSV", "JSON"]);
        await page.locator(`[data-act="ac-export"][data-format="${format}"]`).click();
        await expectPost(page, {type: "exportAutocorrect", format});
        await expect(page.locator(".ac-menu")).toHaveCount(0);
    }
    // From the keyboard: it opens on its first format, the arrows move, Escape closes with focus back on the button.
    await exportButton.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator('[data-act="ac-export"][data-format="txt"]')).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(page.locator('[data-act="ac-export"][data-format="csv"]')).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.locator(".ac-menu")).toHaveCount(0);
    await expect(exportButton).toBeFocused();
    // A press outside closes it too.
    await exportButton.click();
    await page.locator(".main > .topbar h1").click();
    await expect(page.locator(".ac-menu")).toHaveCount(0);

    // A dropped file is read in the page and posted with its name; the whole screen says where it will go.
    await clearPosts(page);
    await page.evaluate(() => {
        const transfer = new DataTransfer();
        transfer.items.add(new File(["x"], "mine.txt", {type: "text/plain"}));
        document.querySelector(".pad.autocorrect").dispatchEvent(new DragEvent("dragover", {bubbles: true, cancelable: true, dataTransfer: transfer}));
    });
    await expect(page.locator(".pad.autocorrect")).toHaveClass(/drag-over/);
    await expect(page.locator(".ac-drop")).toBeVisible();
    await expect(page.locator(".ac-drop")).toContainText("Drop a .txt, .csv or .json list to import it");
    expect(await dropFiles(page, [{text: ":tehn: -> then\n", name: "mine.txt", type: "text/plain"}], ".pad.autocorrect")).toBe(true);
    await expect(page.locator(".ac-drop")).toBeHidden();
    await expectPost(page, {type: "previewAutocorrectImport", text: ":tehn: -> then\n", name: "mine.txt", requestId: expect.any(Number)});
    // Two files, or one too large, are refused where they are dropped.
    await page.locator('[data-act="ac-import-cancel"]').click();
    await clearPosts(page);
    await dropFiles(page, [{text: "a -> b", name: "a.txt"}, {text: "c -> d", name: "b.txt"}], ".pad.autocorrect");
    await expect(page.locator("[data-ac-file-status]")).toHaveText("Drop one file at a time.");
    await dropFiles(page, [{text: "x".repeat(262145), name: "big.txt"}], ".pad.autocorrect");
    await expect(page.locator("[data-ac-file-status]")).toHaveText("This file is too large for a text replacement list.");
    expect(await posted(page)).toEqual([]);
});

test("an empty list explains itself and offers the common typo fixes first, then Add replacement and Import", async ({page}) => {
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
    const empty = page.locator("[data-ac-empty]");
    await expect(empty).toContainText("Nothing is replaced yet");
    await expect(empty).toContainText("your phone number for pnumber");
    await expect(empty.locator("button")).toHaveText(["Add common typo fixes", "Add replacement", "Import…"]);
    await expect(empty.locator("button").first()).toHaveClass(/primary/);
    await expect(page.locator("[data-ac-count]")).toHaveText("0 replacements · 0 typed");
    await expect(page.locator('[data-act="ac-export-menu"]')).toBeDisabled();
    await empty.locator('[data-act="ac-starter"]').click();
    await expectPost(page, {type: "previewAutocorrectImport", starter: true, requestId: expect.any(Number)});
    await expect(page.locator("[data-ac-import] h3")).toHaveText("Add common typo fixes");
    await page.locator('[data-act="ac-import-cancel"]').click();
    await clearPosts(page);
    await page.locator('[data-ac-empty] [data-act="ac-import"]').click();
    await expectPost(page, {type: "chooseAutocorrectFile", requestId: expect.any(Number)});
    await page.locator('[data-act="ac-import-cancel"]').click();
    // Add replacement opens the row in the explanation's place.
    await page.locator('[data-ac-empty] [data-act="ac-add"]').click();
    await expect(page.locator("[data-ac-adding]")).toBeVisible();
    await expect(page.locator("[data-ac-empty]")).toHaveCount(0);
});

// ── memory, on the Keyboard screen ──────────────────────────────────────

test("the Keyboard screen's Memory panel counts what is typed for text replacements and shows their memory", async ({page}) => {
    await openControls(page, "device");
    const usage = page.locator(".card.usage");
    const counted = usage.locator(".usage-counts tbody tr").filter({hasText: "Text replacement typed"});
    await expect(counted.locator(".count")).toHaveText("15 of 1,024");
    await expect(counted).toHaveAttribute("data-tip", /Everything typed for a text replacement/);
    const memory = usage.locator('[data-usage="replacements"]');
    await expect(memory.locator("h4")).toHaveText("Text replacement memory");
    await expect(memory.locator(".sect-h .note")).toHaveText("375 of 34,824 bytes used");
    await expect(memory.locator(".meter i")).toBeVisible();
    await expect(memory.locator(".meter-note")).toHaveText("Replacements and what is typed for them are part of the profile above, within their own limit, and listed on Text replacement.");
    await expect(usage.locator(".card-b > .note")).toContainText("Behaviours, combos, macros, text replacements, custom keys, pointing modes, lighting, settings and names are stored together here");
    // After Macro memory, as its screen follows Macros.
    expect(await usage.locator(".sect-h h4").allTextContents()).toEqual(["Profile", "Macro memory", "Text replacement memory"]);
});

// ── the real core, in the demo ──────────────────────────────────────────

test("in the demo the core keeps an added replacement, checks what is typed, refuses in words and reviews entry by entry", async ({page}) => {
    await openDemo(page);
    const count = page.locator("[data-ac-count]");
    await expect(count).toHaveText("8 replacements · 14 typed");
    await page.locator('[data-act="ac-add"]').click();
    const adding = page.locator("[data-ac-adding]");
    const replacement = adding.locator('[data-f="autocorrect:add:replacement"]'), typed = adding.locator('[data-f="autocorrect:add:typed"]');
    const feedback = adding.locator('[data-ac-feedback="add"]'), save = adding.locator('[data-act="ac-add-save"]');

    // Something already typed for another replacement is refused as it is typed, and Add is off.
    await replacement.fill("ten");
    await typed.fill("teh");
    await expect(feedback).toContainText("“teh” is already typed for “the”.");
    await expect(save).toBeDisabled();
    // A * where it cannot go is refused in plain words.
    await typed.fill("te*h");
    await expect(feedback).toContainText("has * where it cannot go. Put * only at the start or the end");
    await expect(save).toBeDisabled();
    // A short typed form with * is only warned about.
    await replacement.fill("no");
    await typed.fill("*on");
    await expect(feedback).toContainText("“*on” is a short typed form with *, so it fires inside many words.");
    await expect(save).toBeEnabled();
    // What the demo's layout cannot type is refused when it is added.
    await replacement.fill("日本");
    await typed.fill("nihon");
    await expect(feedback).toContainText("cannot type “日”, “本”");

    await replacement.fill("separate");
    await typed.fill("");
    await typed.pressSequentially("seperate Seperat ");
    await expect(feedback).toBeHidden();
    await typed.press("Enter");
    await expect(count).toHaveText("9 replacements · 16 typed");
    await expect(page.locator("[data-ac-adding]")).toHaveCount(0);
    const separate = row(page, "separate");
    await expect(separate.locator(".ac-chip")).toHaveText(["seperat", "seperate"]);

    // Adding the same replacement again adds to it: still one entry.
    await page.locator('[data-act="ac-add"]').click();
    await page.locator('[data-f="autocorrect:add:replacement"]').fill("separate");
    await expect(page.locator("[data-ac-joins]")).toContainText("already on your list");
    await page.locator('[data-f="autocorrect:add:typed"]').pressSequentially("seprate");
    await page.locator('[data-act="ac-add-save"]').click();
    await expect(count).toHaveText("9 replacements · 17 typed");
    await expect(separate.locator(".ac-chip")).toHaveCount(3);

    // Another typed form in its row, one given a *, one moved, one removed.
    await separate.hover();
    await separate.locator('[data-act="ac-more"]').click();
    await separate.locator("[data-ac-more]").fill("separat");
    await separate.locator("[data-ac-more]").press("Enter");
    await expect(separate.locator(".ac-chip")).toHaveCount(4);
    await expect(separate.locator("[data-ac-more]")).toBeFocused();
    await separate.locator("[data-ac-more]").press("Escape");
    await separate.locator('[data-ac-chip="seprate"]').click();
    await page.locator("[data-ac-typed-text]").fill("seprate*");
    await page.locator("[data-ac-typed-text]").press("Enter");
    // The chip shows the * once the core has taken it, and its panel has closed.
    await expect(separate.locator('[data-ac-chip="seprate"]')).toHaveText("seprate*");
    await expect(page.locator("[data-ac-pop]")).toHaveCount(0);
    await separate.locator('[data-ac-chip="seperat"]').click();
    await page.locator("[data-ac-move]").fill("separately");
    await page.locator("[data-ac-move]").press("Enter");
    await expect(count).toHaveText("10 replacements · 18 typed");
    await separate.locator('[data-ac-chip="separat"]').click();
    await page.locator('[data-act="ac-remove-typed"]').click();
    await expect(count).toHaveText("10 replacements · 17 typed");
    // A refused edit of a typed form is said in its panel, and nothing changes.
    await separate.locator('[data-ac-chip="seprate"]').click();
    await page.locator("[data-ac-typed-text]").fill("teh");
    await expect(page.locator('[data-ac-pop] [data-ac-feedback="entry"]')).toContainText("“teh” is already typed for “the”.");
    await page.locator("[data-ac-typed-text]").press("Escape");
    await expect(count).toHaveText("10 replacements · 17 typed");
    // The replacement respelled where it stands.
    await separate.locator('[data-act="ac-edit-replacement"]').click();
    await separate.locator("[data-ac-text]").fill("Separate");
    await separate.locator("[data-ac-text]").press("Enter");
    await expect(row(page, "Separate")).toHaveCount(1);
    await expect(row(page, "separate")).toHaveCount(0);

    // Review lists the entries, each once, a typed form as it is written.
    await page.locator('.commit [data-act="review"]').click();
    const review = page.locator('.sheet[aria-label="Review changes"]');
    await expect(review.locator(".rv-sect")).toContainText(["Text replacement"]);
    await expect(review).toContainText("Separate");
    await expect(review).toContainText("separately");
    await expect(review.locator(".sheet-h h2")).toHaveText("Review 2 changes");
    await expect(review).toContainText("seprate*");
    expect(await review.innerText()).not.toMatch(/whole word|start of word|Typo\b|Correction\b/);
});

test("in the demo a replacement is made to play a macro, Try it says which, and deleting it is undone from the draft's history", async ({page}) => {
    await openDemo(page);
    const count = page.locator("[data-ac-count]");
    await page.locator('[data-act="ac-add"]').click();
    const adding = page.locator("[data-ac-adding]");
    await adding.locator(".seg label", {hasText: "Macro"}).click();
    await expect(adding.locator('[data-f="autocorrect:add:kind:macro"]')).toBeChecked();
    const menu = adding.locator('[data-f="autocorrect:add:macro"]');
    // The demo's macros by their names; the first of them plays keys.
    const name = (await menu.locator('option[value="0"]').textContent()).trim();
    expect(name).not.toMatch(/empty/);
    await menu.selectOption("0");
    // A * is refused for a macro, in plain words.
    await adding.locator('[data-f="autocorrect:add:typed"]').fill("spot*");
    await expect(adding.locator('[data-ac-feedback="add"]')).toContainText("A macro plays for a whole word only: take the * out of “spot*”.");
    await adding.locator('[data-f="autocorrect:add:typed"]').fill("spot");
    await adding.locator('[data-act="ac-add-save"]').click();
    await expect(count).toHaveText("9 replacements · 15 typed");
    const played = page.locator(".ac-rows > [data-ac-entry]").filter({has: page.locator('[data-ac-chip="spot"]')});
    await expect(played.locator(".ac-rep-text .tag")).toHaveText("Macro");
    await expect(played.locator(".ac-rep-words")).toHaveText(name);
    // Try it: the typed form goes, and the line says what plays.
    const box = page.locator('[data-f="autocorrect:try:text"]');
    await box.pressSequentially("spot ");
    await expect(page.locator("[data-ac-try-said]")).toHaveText(`“spot” plays macro “${name}”.`);
    await expect(box).not.toHaveValue(/spot/);
    await expect(played).toHaveClass(/fired/);
    // Backspace after a macro is only Backspace.
    await box.press("Backspace");
    await expect(page.locator("[data-ac-try-said]")).not.toContainText("Backspace put the word back");
    // Review names it by its macro.
    await page.locator('.commit [data-act="review"]').click();
    const review = page.locator('.sheet[aria-label="Review changes"]');
    await expect(review).toContainText(`Macro “${name}”`);
    await page.keyboard.press("Escape");
    // Deleted from its row, and back with one undo.
    await played.hover();
    await played.locator('[data-act="ac-delete"]').click();
    await expect(count).toHaveText("8 replacements · 14 typed");
    await page.locator('.rail [data-act="undo"]').click();
    await expect(count).toHaveText("9 replacements · 15 typed");
});

test("in the demo Try it replaces as the keyboard would, keeps case, undoes on Backspace, and the switch is a Host setting reviewed under Settings", async ({page}) => {
    await openDemo(page);
    const box = page.locator('[data-f="autocorrect:try:text"]'), said = page.locator("[data-ac-try-said]");
    await box.pressSequentially("Teh");
    await expect(box).toHaveValue("Teh");
    await box.pressSequentially(" ");
    await expect(box).toHaveValue("The ");
    await expect(said).toHaveText("“teh” was replaced with “the”.");
    await expect(page.locator(".ac-row.fired")).toHaveAttribute("data-ac-entry", "the");
    await expect(page.locator(".ac-chip.fired")).toHaveText("teh");
    // Backspace right after puts the word back, and ending it again leaves it.
    await box.press("Backspace");
    await expect(box).toHaveValue("Teh");
    await expect(said).toContainText("Backspace put the word back");
    await box.pressSequentially(" ");
    await expect(box).toHaveValue("Teh ");
    // A typed form with * inside a word in capitals, and Enter, after which Backspace is only Backspace.
    await box.pressSequentially("SOMETIHNG");
    await box.press("Enter");
    await expect(box).toHaveValue("Teh SOMETHING\n");
    await expect(page.locator(".ac-row.fired")).toHaveAttribute("data-ac-entry", "thing");
    await expect(page.locator(".ac-chip.fired")).toHaveText("*tihng*");
    await box.press("Backspace");
    await expect(box).toHaveValue("Teh SOMETHING");
    // An edit to the list is tried at once: with the typed form gone the word stays.
    await page.locator('[data-act="ac-try-clear"]').click();
    await box.pressSequentially("hte ");
    await expect(box).toHaveValue("the ");
    await row(page, "the").locator('[data-ac-chip="hte"]').click();
    await page.locator('[data-act="ac-remove-typed"]').click();
    await expect(box).toHaveValue("hte ");
    // A replacement that is no word: digits, spaces and punctuation, whatever the case typed.
    await page.locator('[data-act="ac-add"]').click();
    await page.locator('[data-f="autocorrect:add:replacement"]').fill("+31 6 1234 5678");
    await page.locator('[data-f="autocorrect:add:typed"]').pressSequentially("pnumber");
    await page.locator('[data-act="ac-add-save"]').click();
    await expect(row(page, "+31 6 1234 5678")).toHaveCount(1);
    await page.locator('[data-act="ac-try-clear"]').click();
    await box.pressSequentially("Pnumber, ");
    await expect(box).toHaveValue("+31 6 1234 5678, ");

    // The switch: on in the demo, so the list's screen has no banner; turned off on Host.
    await expect(page.locator(".pad.autocorrect [data-master-off]")).toHaveCount(0);
    await page.locator('[data-screen="host"]').click();
    const toggle = page.locator('.settings-group[data-section="autocorrect"] [data-macro="autocorrect"]');
    await expect(toggle).toBeChecked();
    await toggle.uncheck({force: true});
    await expect(page.locator('.settings-group[data-section="autocorrect"] [data-macro="autocorrect"]')).not.toBeChecked();
    await page.locator('[data-screen="autocorrect"]').click();
    await expect(page.locator(".pad.autocorrect [data-master-off]")).toContainText("Text replacement is off.");
    await page.locator('.commit [data-act="review"]').click();
    const review = page.locator('.sheet[aria-label="Review changes"]');
    await expect(review.locator(".rv-sect")).toContainText(["Text replacement", "Settings"]);
    await expect(review).toContainText("Enabled");
});

test("in the demo a list is imported in each format by picker and by drop, previewed, added or replaced, exported, and the starter list added", async ({page}) => {
    await openDemo(page);
    const count = page.locator("[data-ac-count]"), card = page.locator("[data-ac-import]");
    await expect(count).toHaveText("8 replacements · 14 typed");

    // QMK's text, through the chooser: one line refused with its reason.
    const txt = "# mine\n:tehn: -> then\n:thne: -> then\nsomthing -> something\n:teh: -> ten\n:nto: -> not\n";
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.locator('[data-act="ac-import"]').click()]);
    expect(chooser.element()).toBeTruthy();
    await chooser.setFiles({name: "typos.txt", mimeType: "text/plain", buffer: Buffer.from(txt)});
    await expect(card.locator("h3")).toHaveText("Import typos.txt");
    const add = card.locator('[data-ac-way="add"]');
    await expect(add.locator('[data-ac-line="new"]')).toContainText("3 new replacements, with 4 typed for them.");
    await expect(add.locator('[data-ac-line="refused"]')).toContainText("5: teh → ten — “teh” is already typed for “the”.");
    await expect(card.locator('[data-ac-way="replace"] [data-ac-line="removed"]')).toContainText("8 replacements in your list now are removed.");
    await expect(add.locator(".note")).toHaveText("Your list would hold 11 replacements, with 18 typed for them.");
    await expect(count).toHaveText("8 replacements · 14 typed");
    await add.locator('[data-act="ac-import-add"]').click();
    await expect(card).toHaveCount(0);
    await expect(count).toHaveText("11 replacements · 18 typed");
    // QMK's line with no colons is one that matches anywhere: written here with a * each side.
    await expect(row(page, "something").locator(".ac-chip")).toHaveText(["*somthing*"]);

    // A spreadsheet's CSV, dropped: Ark's columns, a typed form with its *, one added to a replacement the list has, duplicates skipped.
    const csv = "﻿replacement;typed\r\nthen;tehn thn\r\nreceive;recieve\r\nweird;wierd*\r\n";
    expect(await dropFiles(page, [{text: csv, name: "sheet.csv", type: "text/csv"}], ".pad.autocorrect")).toBe(true);
    await expect(card.locator("h3")).toHaveText("Import sheet.csv");
    await expect(add.locator('[data-ac-line="added"]')).toContainText("1 more typed for 1 replacement you already have.");
    await expect(add.locator('[data-ac-line="added"] .ac-names')).toContainText("thn → then");
    await expect(add.locator('[data-ac-line="duplicates"]')).toContainText("2 are already in the list, and skipped.");
    await expect(add.locator('[data-ac-line="new"]')).toContainText("1 new replacement, with 1 typed for it.");
    await add.locator('[data-act="ac-import-add"]').click();
    await expect(count).toHaveText("12 replacements · 20 typed");
    await expect(row(page, "weird").locator(".ac-chip")).toHaveText(["wierd*"]);

    // An older spreadsheet, with its match column, still reads; nothing in it is new.
    await dropFiles(page, [{text: "typos,correction,match\nwierd,weird,start\ntehn,then,whole word\n", name: "older.csv", type: "text/csv"}], ".pad.autocorrect");
    await expect(card.locator('[data-ac-way="add"] [data-ac-line="nothing"]')).toHaveText("Nothing in it would change your list.");
    await card.locator('[data-act="ac-import-cancel"]').click();

    // Export in each format, then each back in to replace the list with itself.
    const exports = {};
    for (const format of ["txt", "csv", "json"]) {
        await page.locator('[data-act="ac-export-menu"]').click();
        const [download] = await Promise.all([page.waitForEvent("download"), page.locator(`[data-act="ac-export"][data-format="${format}"]`).click()]);
        expect(download.suggestedFilename()).toMatch(new RegExp(`^charybdis-text-replacements-\\d{4}-\\d\\d-\\d\\d\\.${format}$`));
        exports[format] = require("node:fs").readFileSync(await download.path(), "utf8");
    }
    expect(exports.txt).toContain(":tehn: -> then\n");
    expect(exports.txt).toContain(":wierd -> weird\n");
    expect(exports.csv.startsWith("replacement,typed\r\n")).toBe(true);
    expect(exports.csv).toContain("weird,wierd*\r\n");
    const json = JSON.parse(exports.json);
    expect(json.version).toBe(1);
    expect(json.replacements).toContainEqual({replacement: "weird", typed: ["wierd*"]});
    expect(json.replacements).toContainEqual({replacement: "something", typed: ["*somthing*"]});
    expect(exports.json).not.toMatch(/"match"|"typos"|"correction"/);
    for (const format of ["json", "csv", "txt"]) {
        await dropFiles(page, [{text: exports[format], name: `back.${format}`}], ".pad.autocorrect");
        const replace = card.locator('[data-ac-way="replace"]');
        await expect(replace.locator('[data-ac-line="new"]')).toContainText("12 new replacements, with 20 typed for them.");
        await expect(card.locator('[data-ac-way="add"] [data-ac-line="nothing"]')).toHaveText("Nothing in it would change your list.");
        await expect(card.locator('[data-act="ac-import-add"]')).toBeDisabled();
        await replace.locator('[data-act="ac-import-replace"]').click();
        await expect(card).toHaveCount(0);
        await expect(count).toHaveText("12 replacements · 20 typed");
    }

    // A file that is no list says so, and changes nothing.
    await dropFiles(page, [{text: "{nope", name: "broken.json"}], ".pad.autocorrect");
    await expect(card.locator(".unavailable")).toHaveText("This file is not a valid text replacement list.");
    await card.locator('[data-act="ac-import-cancel"]').click();

    // The common typo fixes: offered where the list is empty, previewed and added with the same summary.
    for (let left = 12; left > 0; left--) {
        const first = page.locator(".ac-rows > [data-ac-entry]").first();
        await first.hover();
        await first.locator('[data-act="ac-delete"]').click();
        await expect(page.locator(".ac-rows > [data-ac-entry]")).toHaveCount(left - 1);
    }
    await page.locator('[data-ac-empty] [data-act="ac-starter"]').click();
    await expect(card.locator("h3")).toHaveText("Add common typo fixes");
    await expect(card.locator('[data-ac-way="add"] [data-ac-line="new"]')).toContainText("new replacements");
    await card.locator('[data-act="ac-import-add"]').click();
    await expect(card).toHaveCount(0);
    await expect(row(page, "tomorrow")).toHaveCount(1);
    await expect.poll(async () => Number((await count.textContent()).split(" ")[0])).toBeGreaterThan(190);
    // One undo takes the whole import back.
    await page.locator('.rail [data-act="undo"]').click();
    await expect(count).toHaveText("0 replacements · 0 typed");
});
