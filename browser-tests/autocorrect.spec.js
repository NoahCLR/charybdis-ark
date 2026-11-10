// @ts-check
"use strict";
// The Text replacement screen (its id is the keyboard's name for the feature,
// autocorrect): a bank of replacements beside the editor of the one picked,
// as Macros, Custom keys and Pointing modes are (D-L88). In the preview, every
// control posts the edit its builder makes (the preview applies nothing; its
// stand-in answers the check of what is typed by the list's own rules, since
// an edit is posted only once that check has passed). In the built page's
// demo the real core takes them: a new replacement is kept, checked as it is
// typed, refused in words, and reviewed entry by entry.
const {test, expect} = require("@playwright/test");
const {openControls, clearPosts, posted, expectPost} = require("./control-preview");
const {dropFiles} = require("./profile-drop");

const identity = expect.any(String);
// What the screen posted, without the checks it asks of the core as it is typed in.
const edits = async (page) => (await posted(page)).filter((message) => message.type !== "validateAutocorrect");
// An edit is posted once the check of it has answered, a moment after the key.
const expectEdits = (page, expected) => expect.poll(() => edits(page)).toEqual(expected);
const bank = (page) => page.locator("[data-ac-bank]");
const item = (page, id) => page.locator(`[data-ac-bank] [data-ac-entry="${id}"]`);
const editor = (page) => page.locator("[data-ac-editor]");
const chips = (page) => editor(page).locator(".ac-inputs [data-ac-chip]");
const usage = (page) => page.locator("[data-ac-usage]"), count = (page) => page.locator("[data-ac-count]");
const openDemo = async (page) => {
    await page.goto("/dist/web/index.html");
    await page.locator('.read-placeholder [data-act="explore-demo"]').click();
    await page.locator('[data-screen="autocorrect"]').click();
};
// Publishes the model core would after taking an edit: the list as `change`
// leaves it, under another identity, which is how the screen knows it landed.
const accept = (page, change = () => {}) => publish(page, (model) => { model.autocorrectEditing.identity = `${model.autocorrectEditing.identity}+`; change(model); });
// An entry as core publishes one.
const published = (correction, ...inputs) => ({id: correction, label: correction, correction, warnings: [], typos: inputs.map((input) => ({typo: input.replace(/\*/g, ""), input, warnings: []}))});
// Publishes a model as core would, changed by `change` (run in the page).
const publish = async (page, change) => {
    const model = await page.evaluate(async () => structuredClone((await import("/webview/store.mjs")).getModel()));
    change(model);
    await page.evaluate((model) => {
        window.dispatchEvent(new MessageEvent("message", {data: {type: "model", model}}));
        window.__posted.length = 0;
    }, model);
};
// Picks a macro in the keycode picker, by its keycode, and uses it.
const pickMacro = async (page, keycode) => {
    await page.locator(`.picker [data-pick="${keycode}"]`).click();
    await page.locator('.picker [data-act="use"]').click();
};

// ── the bank and the editor ─────────────────────────────────────────────

test("the screen is a bank of replacements beside the editor of the one picked, as Macros is", async ({page}) => {
    await page.setViewportSize({width: 1440, height: 900});
    await openControls(page, "autocorrect");
    await expect(page.locator('.rail [data-screen="autocorrect"]')).toContainText("Text replacement");
    await expect(page.locator(".main > .topbar h1")).toHaveText("Text replacement");
    await expect(page.locator(".main > .topbar .sub")).toContainText("Fixes typos and types longer text for you");
    // The two panes of every Configure library: the bank at the left, the editor beside it.
    await expect(page.locator(".pad.library.autocorrect")).toBeVisible();
    const left = await bank(page).boundingBox(), right = await editor(page).boundingBox();
    expect(right.x).toBeGreaterThan(left.x + left.width - 1);
    expect(Math.abs(right.y - left.y)).toBeLessThan(2);
    // The bank: its name, how much of what the keyboard holds is used, a search, the items, New, the files and its memory.
    await expect(bank(page).locator(".card-h h3")).toHaveText("Replacements");
    await expect(usage(page)).toHaveText("15 of 1,024 inputs");
    await expect(bank(page).locator('[data-f="autocorrect:search"]')).toHaveAttribute("placeholder", "Search replacements and inputs");
    await expect(bank(page).locator("[data-ac-entry]")).toHaveCount(10);
    await expect(bank(page).locator('[data-act="ac-add"]')).toHaveText("+ New replacement");
    await expect(bank(page).locator(".ac-files button")).toHaveText(["Import…", "Export"]);
    await expect(bank(page).locator(".memory-h h4")).toHaveText("Text replacement memory");
    await expect(page.locator("[data-ac-memory]")).toHaveText("375 / 34,824 bytes");
    await expect(page.locator("[data-ac-meter]")).toBeVisible();
    // What is free, as Macro memory says its own, and the list's size.
    await expect(page.locator("[data-ac-free]")).toHaveText(/^[\d,]+ bytes free$/);
    await expect(count(page)).toHaveText("10 replacements · 15 inputs");
    // An item is a replacement on one line, with its inputs under it as they are written.
    await expect(item(page, "because").locator(".v")).toHaveText("because");
    await expect(item(page, "because").locator(".n")).toHaveText("beacuse becasue becuase");
    await expect(item(page, "thing").locator(".n")).toHaveText("*tihng*");
    await expect(item(page, "un").locator(".n")).toHaveText("nu*");
    await expect(item(page, "ment").locator(".n")).toHaveText("*mnet");
    // A long replacement stays on its one line.
    const long = bank(page).locator("[data-ac-entry]", {hasText: "Kind regards"});
    expect(await long.locator(".v").evaluate((node) => getComputedStyle(node).whiteSpace)).toBe("nowrap");
    // The first is open, as a bank opens on its first item: its header, then its sections.
    await expect(bank(page).locator('[aria-current="true"]')).toHaveAttribute("data-ac-entry", "+31 6 1234 5678");
    await expect(editor(page).locator(".name-titlebar .title-name-text")).toHaveText("+31 6 1234 5678");
    await expect(editor(page).locator(".name-titlebar .mark-lg svg")).toBeVisible();
    await expect(editor(page).locator("[data-ac-kind]")).toHaveText("Text");
    await expect(editor(page).locator('.name-titlebar [data-act="ac-delete"]')).toHaveText("Delete replacement");
    await expect(editor(page).locator('[data-act="place"]')).toHaveCount(0);
    await expect(editor(page).locator(".macro-sequence-heading h4, .editor-section .card-h h3")).toHaveText(["Replacement", "Inputs", "Try it"]);
    // No switch here, no menu of macros, and nothing says typo, correction, typed form or a match by name.
    await expect(page.locator('.pad.autocorrect [data-macro="autocorrect"]')).toHaveCount(0);
    await expect(page.locator(".pad.autocorrect select")).toHaveCount(0);
    const text = await page.locator(".pad.autocorrect").innerText();
    expect(text).not.toMatch(/correction|typos?\b|typed form|typed for|\d typed|whole word|start of word|end of word|anywhere in a word|1,024 replacements/i);
});

test("picking a replacement opens it, and it stays open through a redraw, a search and another screen", async ({page}) => {
    await openControls(page, "autocorrect");
    await item(page, "the").click();
    await expect(item(page, "the")).toHaveAttribute("aria-current", "true");
    await expect(editor(page)).toHaveAttribute("data-ac-editor", "the");
    await expect(editor(page).locator(".title-name-text")).toHaveText("the");
    await expect(chips(page)).toHaveText(["hte", "teh"]);
    await publish(page, (model) => { model.draft.revision++; });
    await expect(editor(page)).toHaveAttribute("data-ac-editor", "the");
    await page.locator('[data-screen="macros"]').click();
    await page.locator('[data-screen="autocorrect"]').click();
    await expect(item(page, "the")).toHaveAttribute("aria-current", "true");
    // A search narrows the bank and leaves the editor on what is open.
    const search = page.locator('[data-f="autocorrect:search"]');
    await search.fill("dosen");
    await expect(bank(page).locator("[data-ac-entry]")).toHaveCount(1);
    await expect(item(page, "doesn't").locator('[data-ac-input="dosen\'t"]')).toHaveClass(/found/);
    await expect(item(page, "doesn't").locator('[data-ac-input="doesnt"]')).not.toHaveClass(/found/);
    await expect(search).toBeFocused();
    await expect(editor(page)).toHaveAttribute("data-ac-editor", "the");
    await search.fill("iph");
    await expect(bank(page).locator("[data-ac-entry]")).toHaveCount(1);
    await expect(bank(page).locator(".found")).toHaveCount(0);
    await search.fill("*tihng*");
    await expect(bank(page).locator("[data-ac-entry]")).toHaveAttribute("data-ac-entry", "thing");
    await search.fill("zzz");
    await expect(page.locator("[data-ac-none]")).toHaveText("No replacement or input matches “zzz”.");
    expect(await posted(page)).toEqual([]);
});

test("a search that finds nothing leaves a replacement open, never the empty list's start; New is for the whole list", async ({page}) => {
    await openControls(page, "autocorrect");
    // None picked yet: the first of the list is open, and stays open when a search shows nothing.
    await expect(editor(page)).toHaveAttribute("data-ac-editor", "+31 6 1234 5678");
    const search = page.locator('[data-f="autocorrect:search"]');
    await search.fill("zzz");
    await expect(page.locator("[data-ac-none]")).toBeVisible();
    await expect(bank(page).locator("[data-ac-entry]")).toHaveCount(0);
    await expect(editor(page)).toHaveAttribute("data-ac-editor", "+31 6 1234 5678");
    await expect(page.locator("[data-ac-empty]")).toHaveCount(0);
    await expect(page.locator('[data-act="ac-starter"]')).toHaveCount(0);
    // While searching the bank shows what it found and nothing else, as Macros' does: New comes back with the list.
    await expect(bank(page).locator('[data-act="ac-add"]')).toHaveCount(0);
    await search.fill("iph");
    await expect(editor(page)).toHaveAttribute("data-ac-editor", "iPhone");
    await expect(bank(page).locator('[data-act="ac-add"]')).toHaveCount(0);
    await search.fill("");
    await expect(bank(page).locator('[data-act="ac-add"]')).toBeVisible();
    expect(await edits(page)).toEqual([]);
});

test("New replacement opens an editor with its text focused, and it joins the list with its first input", async ({page}) => {
    await openControls(page, "autocorrect");
    await bank(page).locator('[data-act="ac-add"]').click();
    const fresh = page.locator("[data-ac-new]");
    await expect(fresh.locator(".title-name-text")).toHaveText("New replacement");
    await expect(fresh.locator(".name-titlebar .tag")).toHaveText("Not on your list yet");
    await expect(fresh.locator('[data-act="ac-discard"]')).toHaveText("Discard");
    // It heads the bank, and is the item open.
    await expect(bank(page).locator(".ac-bank > :first-child")).toHaveAttribute("data-ac-new-item", "");
    await expect(bank(page).locator("[data-ac-new-item]")).toHaveAttribute("aria-current", "true");
    const replacement = fresh.locator('[data-f="autocorrect:new:replacement"]'), first = fresh.locator("[data-ac-first]");
    await expect(replacement).toBeFocused();
    await expect(first).toBeDisabled();
    await expect(fresh.locator(".card-b > .note").first()).toHaveText("It joins your list with its first input.");
    // No control says where an input matches: the * does.
    await expect(fresh.locator('[data-f*=":match"]')).toHaveCount(0);
    await replacement.fill("definitely");
    await expect(fresh.locator("[data-ac-bytes]")).toHaveText("10 / 128 bytes");
    await expect(bank(page).locator("[data-ac-new-item] .v")).toHaveText("definitely");
    await replacement.press("Enter");
    await expect(first).toBeFocused();
    // Typing asks the core to check the edit as it stands, the field's text as it was typed: the core reads its inputs.
    // Enter posts the edit itself, once that check has passed.
    await first.pressSequentially("definately definitly recieve*");
    expect((await posted(page)).at(-1)).toEqual(expect.objectContaining({type: "validateAutocorrect",
        edit: {type: "addAutocorrectTypos", correction: "definitely", inputs: "definately definitly recieve*", expectedFingerprint: identity}}));
    await clearPosts(page);
    await first.press("Enter");
    await expectEdits(page, [expect.objectContaining({type: "addAutocorrectTypos", correction: "definitely", inputs: "definately definitly recieve*", expectedFingerprint: identity})]);
    // The list takes it: it is the entry open from then on, the field for its next input ready.
    await accept(page, (model) => { model.autocorrect.entries.push({id: "definitely", label: "definitely", correction: "definitely", warnings: [],
        typos: ["definately", "definitly", "recieve*"].map((input) => ({typo: input.replace("*", ""), input, warnings: []}))}); });
    await expect(editor(page)).toHaveAttribute("data-ac-editor", "definitely");
    await expect(page.locator("[data-ac-new], [data-ac-new-item]")).toHaveCount(0);
    await expect(editor(page).locator("[data-ac-more]")).toBeFocused();
    await editor(page).locator("[data-ac-more]").press("Escape");
    // One begun and left for another replacement waits at the head of the bank, with what was typed for it.
    await bank(page).locator('[data-act="ac-add"]').click();
    await page.locator("[data-ac-new] [data-ac-text]").fill("separate");
    await page.locator("[data-ac-new] [data-ac-first]").pressSequentially("sep-rate");
    await expect(page.locator('[data-ac-new] [data-ac-feedback="new"]')).toContainText("“-” is neither");
    // Going back to its own fields keeps nothing yet; leaving the editor keeps the input as Enter does, were it one the list takes.
    await page.locator("[data-ac-new] [data-ac-text]").focus();
    await clearPosts(page);
    await page.locator("[data-ac-new] [data-ac-first]").focus();
    await item(page, "the").click();
    await expect(bank(page).locator("[data-ac-new-item]")).toHaveAttribute("aria-current", "false");
    expect(await edits(page)).toEqual([]);
    await bank(page).locator("[data-ac-new-item]").click();
    await expect(page.locator("[data-ac-new] [data-ac-text]")).toHaveValue("separate");
    await expect(page.locator("[data-ac-new] [data-ac-first]")).toHaveValue("sep-rate");
    // Put right and left for another replacement, it is posted, and the one picked stays open when it lands.
    await page.locator("[data-ac-new] [data-ac-first]").fill("seprate");
    await expect(page.locator('[data-ac-new] [data-ac-feedback="new"]')).toBeHidden();
    await item(page, "the").click();
    await expectEdits(page, [expect.objectContaining({type: "addAutocorrectTypos", correction: "separate", inputs: "seprate"})]);
    await accept(page, (model) => { model.autocorrect.entries.push({id: "separate", label: "separate", correction: "separate", warnings: [], typos: [{typo: "seprate", input: "seprate", warnings: []}]}); });
    await expect(editor(page)).toHaveAttribute("data-ac-editor", "the");
    await expect(page.locator("[data-ac-new], [data-ac-new-item]")).toHaveCount(0);
    await expect(item(page, "separate")).toBeVisible();
    await bank(page).locator('[data-act="ac-add"]').click();
    await page.locator("[data-ac-new] [data-ac-text]").fill("definately");
    // Discard lets it go, with focus back on New replacement.
    await clearPosts(page);
    await page.locator('[data-ac-new] [data-act="ac-discard"]').click();
    await expect(page.locator("[data-ac-new], [data-ac-new-item]")).toHaveCount(0);
    await expect(bank(page).locator('[data-act="ac-add"]')).toBeFocused();
    expect(await edits(page)).toEqual([]);
    // One with nothing in it is let go by Escape, or by picking another.
    await bank(page).locator('[data-act="ac-add"]').click();
    await page.locator("[data-ac-new] [data-ac-text]").press("Escape");
    await expect(page.locator("[data-ac-new]")).toHaveCount(0);
    await bank(page).locator('[data-act="ac-add"]').click();
    await item(page, "the").click();
    await expect(page.locator("[data-ac-new-item]")).toHaveCount(0);
});

test("a new replacement the list already has is offered to be opened, and makes no duplicate", async ({page}) => {
    await openControls(page, "autocorrect");
    await bank(page).locator('[data-act="ac-add"]').click();
    const fresh = page.locator("[data-ac-new]"), replacement = fresh.locator("[data-ac-text]");
    await replacement.fill("because");
    await expect(fresh.locator("[data-ac-joins]")).toContainText("“because” is already on your list. Add inputs to it there.");
    await expect(fresh.locator("[data-ac-first]")).toHaveCount(0);
    await expect(replacement).toBeFocused();
    await replacement.fill("because of");
    await expect(fresh.locator("[data-ac-joins]")).toHaveCount(0);
    await expect(fresh.locator("[data-ac-first]")).toBeEnabled();
    // Whether the list has it is said whatever is wrong with the input typed for it so far.
    await fresh.locator("[data-ac-first]").fill("teh");
    await expect(fresh.locator('[data-ac-feedback="new"]')).toContainText("“teh” is already an input for “the”.");
    await replacement.fill("because");
    await expect(fresh.locator("[data-ac-joins]")).toContainText("“because” is already on your list.");
    await fresh.locator('[data-act="ac-open-joined"]').click();
    await expect(editor(page)).toHaveAttribute("data-ac-editor", "because");
    await expect(page.locator("[data-ac-new], [data-ac-new-item]")).toHaveCount(0);
    await expect(editor(page).locator('[data-act="ac-more"]')).toBeFocused();
    expect(await edits(page)).toEqual([]);
});

test("a replacement can play a macro: Pick… opens the keycode picker on the macros with steps, and it is posted by its slot", async ({page}) => {
    await openControls(page, "autocorrect");
    // Macros 3 and 7 have steps; the rest are empty, and an empty macro would play nothing.
    await publish(page, (model) => {
        model.macros = model.macros.map((macro, slot) => ({...macro, empty: slot !== 3 && slot !== 7}));
    });
    await bank(page).locator('[data-act="ac-add"]').click();
    const fresh = page.locator("[data-ac-new]");
    await fresh.locator(".seg label", {hasText: "Macro"}).click();
    await expect(fresh.locator('[data-f="autocorrect:new:kind:macro"]')).toBeChecked();
    await expect(fresh.locator("[data-ac-text]")).toHaveCount(0);
    await expect(fresh.locator("select")).toHaveCount(0);
    // A read-only field names the macro and Pick… beside it chooses one, as a custom key's shortcut is.
    const field = fresh.locator(".ac-macro input[data-ac-macro]"), pick = fresh.locator('.ac-macro .btn[data-act="ac-pick"]');
    await expect(pick).toHaveText("Pick…");
    await expect(pick).toBeFocused();
    await expect(field).toHaveValue("");
    await expect(field).toHaveAttribute("placeholder", "No macro yet");
    await expect(field).toHaveAttribute("readonly", "");
    await expect(fresh.locator(".pd-key")).toHaveCount(0);
    // How a macro differs is behind the Replacement heading's info mark, not written under it.
    await expect(fresh.locator(".card-b > .note")).not.toContainText(["A macro plays"]);
    await expect(fresh.locator("#ac-info-replacement")).toContainText("Backspace does not take it back");
    await expect(fresh.locator('[data-act="ac-edit-macro"]')).toHaveCount(0);
    await pick.click();
    // The picker, as a key's is, with one section: the macros that have steps, by name.
    const picker = page.locator(".sheet.picker");
    await expect(picker).toBeVisible();
    await expect(picker.locator(".picker-side button")).toHaveText(["Macros"]);
    await expect(picker.locator(".pkb")).toHaveCount(0);
    await expect(picker.locator(".pk-mods")).toHaveCount(0);
    await expect(picker.locator(".pk-label")).toHaveText(["In use"]);
    expect(await picker.locator("[data-pick]").evaluateAll((tiles) => tiles.map((tile) => tile.dataset.pick))).toEqual(["MACRO_3", "MACRO_7"]);
    await pickMacro(page, "MACRO_3");
    await expect(picker).toHaveCount(0);
    // The field names the macro; the bank names the replacement as the core calls it.
    await expect(field).toHaveValue("Macro 3");
    await expect(field).toHaveAttribute("data-ac-macro", "3");
    await expect(bank(page).locator("[data-ac-new-item] .v")).toHaveText("▶ Macro 3");
    const first = fresh.locator("[data-ac-first]");
    await expect(first).toBeFocused();
    await first.fill("sig sgi");
    await clearPosts(page);
    await first.press("Enter");
    await expectEdits(page, [expect.objectContaining({type: "addAutocorrectTypos", macro: 3, inputs: "sig sgi", expectedFingerprint: identity})]);
    // A click on the field opens the picker on the macro chosen; Escape closes it and changes nothing.
    await field.click();
    await expect(picker.locator('[data-pick="MACRO_3"]')).toHaveClass(/\bon\b/);
    await page.keyboard.press("Escape");
    await expect(picker).toHaveCount(0);
    await expect(field).toHaveValue("Macro 3");
    // Edit in Macros is in the header, as a macro's Place on a key → is, and goes to that macro.
    await expect(fresh.locator('.card-h [data-act="ac-edit-macro"]')).toHaveText("Edit in Macros →");
    await fresh.locator('[data-act="ac-edit-macro"]').click();
    await expect(page.locator(".main > .topbar h1")).toHaveText("Macros");
    await expect(page.locator('.mslot[data-slot="MACRO_3"]')).toHaveAttribute("aria-current", "true");
});

test("a replacement is changed in its editor, to other text or to a macro, and deleted from its header", async ({page}) => {
    await openControls(page, "autocorrect");
    await item(page, "the").click();
    const text = editor(page).locator("[data-ac-text]");
    await expect(text).toHaveValue("the");
    await expect(editor(page).locator("[data-ac-bytes]")).toHaveText("3 / 128 bytes");
    await text.fill("The café");
    await expect(editor(page).locator("[data-ac-bytes]")).toHaveText("9 / 128 bytes");
    // What the host layout cannot type is refused under the field, and Enter posts nothing and keeps what was typed.
    await expect(editor(page).locator('[data-ac-feedback="replacement"]')).toContainText("US cannot type “é”");
    await clearPosts(page);
    await text.press("Enter");
    await expect(text).toHaveValue("The café");
    expect(await edits(page)).toEqual([]);
    await text.focus();
    await text.fill("The cafe");
    await text.press("Enter");
    await expectEdits(page, [expect.objectContaining({type: "updateAutocorrectCorrection", correction: "the", to: "The cafe", expectedFingerprint: identity})]);
    // Changed to a replacement the list has, the two would join: the check says so under the field before it is kept.
    await text.fill("thing");
    await expect(editor(page).locator('[data-ac-feedback="replacement"]')).toHaveText("“thing” is already on your list: this one's inputs will join it.");
    // Escape puts back what the list holds, and posts nothing.
    await text.fill("something else");
    await clearPosts(page);
    await text.press("Escape");
    await expect(text).toHaveValue("the");
    expect(await edits(page)).toEqual([]);
    // Macro shows an empty macro field; picking one posts the change.
    await publish(page, (model) => { model.macros[7] = {...model.macros[7], empty: false}; });
    await item(page, "iPhone").click();
    await editor(page).locator(".seg label", {hasText: "Macro"}).click();
    await expect(editor(page).locator("input[data-ac-macro]")).toHaveValue("");
    // The choice is not kept yet, and says so: the header and the list still have the text.
    await expect(editor(page).locator("[data-ac-kind]")).toHaveText("Text");
    await expect(editor(page).locator("[data-ac-pending]")).toHaveText("Still Text until you pick a macro.");
    expect(await edits(page)).toEqual([]);
    await editor(page).locator('[data-act="ac-pick"]').click();
    await pickMacro(page, "MACRO_7");
    await expectEdits(page, [expect.objectContaining({type: "updateAutocorrectCorrection", correction: "iPhone", toMacro: 7, expectedFingerprint: identity})]);
    // Back on Text with nothing kept, it is the text it was.
    await item(page, "the").click();
    await item(page, "iPhone").click();
    await expect(editor(page).locator("[data-ac-text]")).toHaveValue("iPhone");
    await clearPosts(page);
    await editor(page).locator('[data-act="ac-delete"]').click();
    expect(await edits(page)).toEqual([expect.objectContaining({type: "deleteAutocorrectEntry", correction: "iPhone", expectedFingerprint: identity})]);
});

test("inputs are chips: + Input adds one or several and stays for the next, and a chip opens to be written anew or removed", async ({page}) => {
    await openControls(page, "autocorrect");
    await item(page, "because").click();
    await expect(chips(page)).toHaveText(["beacuse", "becasue", "becuase"]);
    // How an input is written is behind the Inputs heading's info mark: hovering it, or reaching it by the keyboard, shows it; Escape shuts it.
    const info = editor(page).locator("[data-info-mark]:has(#ac-info-inputs)");
    const list = info.locator("#ac-info-inputs");
    await expect(info.locator(".info-button")).toHaveAttribute("aria-label", "How inputs are written, and the * wildcard");
    await expect(list).toBeHidden();
    await info.locator(".info-button").hover();
    await expect(list).toBeVisible();
    await expect(list.locator(".info-lead")).toHaveText("An input matches a whole word. Add *, the wildcard, where other letters may go: one input then catches every form of a word, and only the part you wrote is replaced.");
    await expect(list.locator("dt")).toHaveText(["teh", "recieve*", "*mnet", "*tihng*", "Where * goes", "Short inputs", "Capitals", "Characters", "Several", "Overlaps", "Macros"]);
    await expect(list).toContainText("For receive, it also fixes recieved and recieving.");
    // Its figures are the keyboard's own, as the list publishes them.
    await expect(list).toContainText("With *, an input under 4 letters can catch real words");
    await expect(list).toContainText("Letters, digits and apostrophes, up to 32 bytes.");
    await page.keyboard.press("Escape");
    await expect(list).toBeHidden();
    await page.mouse.move(0, 0);
    const add = editor(page).locator('[data-act="ac-more"]');
    await expect(add).toHaveText("+ Input");
    await add.click();
    const more = editor(page).locator("[data-ac-more]");
    await expect(more).toBeFocused();
    // An input the list refuses stays in the field with the reason under it, and nothing is posted, whenever Enter comes.
    await clearPosts(page);
    await more.fill("annd teh andd");
    await more.press("Enter");
    await expect(editor(page).locator('[data-ac-feedback="input"]')).toHaveText("“teh” is already an input for “the”.");
    // It comes back with a space after it, so the next input typed is its own word.
    await expect(more).toHaveValue("annd teh andd ");
    await more.press("Enter");
    await expect(more).toHaveValue("annd teh andd ");
    await expect(editor(page).locator('[data-ac-feedback="input"]')).toHaveText("“teh” is already an input for “the”.");
    expect(await edits(page)).toEqual([]);
    // Enter keeps what the field holds and readies it for the next at once; what comes next waits its turn behind it.
    await more.fill("bcuz");
    await clearPosts(page);
    await more.press("Enter");
    await expect(more).toHaveValue("");
    await expect(more).toBeFocused();
    await more.pressSequentially("*cuz bcos");
    await more.press("Enter");
    await expect(more).toHaveValue("");
    await expectEdits(page, [expect.objectContaining({type: "addAutocorrectTypos", correction: "because", inputs: "bcuz", expectedFingerprint: identity})]);
    // The list takes the first; the second is checked against the list as it then stands, and posted.
    await accept(page, (model) => { model.autocorrect.entries.find((entry) => entry.id === "because").typos.push({typo: "bcuz", input: "bcuz", warnings: []}); });
    await expect(chips(page)).toHaveText(["beacuse", "becasue", "becuase", "bcuz"]);
    await expectEdits(page, [expect.objectContaining({type: "addAutocorrectTypos", correction: "because", inputs: "*cuz bcos", expectedFingerprint: identity})]);
    await expect(more).toBeFocused();
    await accept(page, (model) => { model.autocorrect.entries.find((entry) => entry.id === "because").typos.push({typo: "cuz", input: "*cuz", warnings: []}, {typo: "bcos", input: "bcos", warnings: []}); });
    await expect(chips(page)).toHaveCount(6);
    await expect(more).toBeFocused();
    // Escape closes it, with focus back on what opened it.
    await more.press("Escape");
    await expect(editor(page).locator("[data-ac-more]")).toHaveCount(0);
    await expect(add).toBeFocused();

    // A chip opens in place: its spelling in a field, and Remove written out beside it.
    const chip = editor(page).locator('[data-ac-chip="becasue"]');
    await chip.click();
    const field = editor(page).locator("[data-ac-input-text]"), remove = editor(page).locator('[data-act="ac-remove-input"]');
    await expect(field).toBeFocused();
    await expect(field).toHaveValue("becasue");
    await expect(remove).toHaveText("Remove");
    await expect(chips(page)).toHaveText(["beacuse", "becuase", "bcuz", "*cuz", "bcos"]);
    // No list of matches to choose from, and nowhere to move it: the * is the whole of it.
    await expect(editor(page).locator(".ac-inputs select, .ac-inputs [type=radio], [data-ac-move]")).toHaveCount(0);
    await field.fill("becaseu*");
    await clearPosts(page);
    await field.press("Enter");
    await expectEdits(page, [expect.objectContaining({type: "updateAutocorrectTypo", typo: "becasue", to: "becaseu*", expectedFingerprint: identity})]);
    // Remove posts the removal alone, whatever stands in the field.
    await item(page, "the").click();
    await editor(page).locator('[data-ac-chip="teh"]').click();
    await editor(page).locator("[data-ac-input-text]").fill("tehh");
    await clearPosts(page);
    await editor(page).locator('[data-act="ac-remove-input"]').click();
    expect(await edits(page)).toEqual([expect.objectContaining({type: "deleteAutocorrectTypo", typo: "teh", expectedFingerprint: identity})]);
});

test("an open chip closes at Escape and at a press outside, and another chip opens its own", async ({page}) => {
    await openControls(page, "autocorrect");
    await item(page, "because").click();
    const chip = editor(page).locator('[data-ac-chip="becasue"]'), field = editor(page).locator("[data-ac-input-text]");
    await chip.click();
    await field.press("Escape");
    await expect(field).toHaveCount(0);
    await expect(chip).toBeFocused();
    await chip.click();
    await editor(page).locator('[data-ac-chip="becuase"]').click();
    await expect(field).toHaveCount(1);
    await expect(field).toHaveValue("becuase");
    await page.locator(".main > .topbar h1").click();
    await expect(field).toHaveCount(0);
    await expect(chips(page)).toHaveCount(3);
    expect(await edits(page)).toEqual([]);
});

test("a replacement that plays a macro is named by its macro, told apart, and edited and deleted by its slot", async ({page}) => {
    await openControls(page, "autocorrect");
    // As core publishes a list with one: its id is no text's, its macro a slot.
    await publish(page, (model) => {
        model.macros[5] = {...model.macros[5], name: "Sign-off", empty: false};
        model.autocorrect.entries.push({id: "\u0001macro:5", label: "▶ Sign-off", correction: "", macro: 5, warnings: [], typos: [{typo: "sig", input: "sig", warnings: []}]},
            {id: "\u0001macro:6", label: "▶ Macro 6", correction: "", macro: 6, warnings: ["“Macro 6” has no steps, so this replacement does nothing yet. Add steps in Macros, or choose another replacement."], typos: [{typo: "addr", input: "addr", warnings: []}]});
    });
    // It is called what the core calls it, in the bank and in its editor's title; its field names the macro.
    const played = bank(page).locator('[data-ac-entry$="macro:5"]');
    await expect(played.locator(".v")).toHaveText("▶ Sign-off");
    await played.click();
    await expect(editor(page).locator(".title-name-text")).toHaveText("▶ Sign-off");
    await expect(editor(page).locator("[data-ac-kind]")).toHaveText("Macro");
    await expect(editor(page).locator('[data-f$=":kind:macro"]')).toBeChecked();
    await expect(editor(page).locator("input[data-ac-macro]")).toHaveValue("Sign-off");
    await expect(editor(page).locator('.card-h [data-act="ac-edit-macro"]')).toBeVisible();
    // Nothing is written under the sections: how they work is behind their info marks.
    await expect(editor(page).locator(".card-b > .note:not(.warn)")).toHaveCount(0);
    // One whose macro is empty says so in the bank and in its editor, as a pointing mode that runs an empty macro is said.
    const empty = bank(page).locator('[data-ac-entry$="macro:6"]');
    await expect(empty).toHaveClass(/caution/);
    await empty.click();
    await expect(editor(page).locator("[data-ac-warning]")).toContainText("has no steps, so this replacement does nothing yet");
    // Made text, it is posted by its slot; and deleted by it.
    await played.click();
    await editor(page).locator(".seg label", {hasText: "Text"}).click();
    await expect(editor(page).locator("[data-ac-text]")).toBeFocused();
    await editor(page).locator("[data-ac-text]").fill("Kind regards");
    await expect(editor(page).locator("[data-ac-pending]")).toHaveText("Still Macro until you type its text and press Enter.");
    await editor(page).locator("[data-ac-text]").press("Enter");
    await expectEdits(page, [expect.objectContaining({type: "updateAutocorrectCorrection", macro: 5, to: "Kind regards", expectedFingerprint: identity})]);
    await clearPosts(page);
    await editor(page).locator('[data-act="ac-delete"]').click();
    expect(await edits(page)).toEqual([expect.objectContaining({type: "deleteAutocorrectEntry", macro: 5, expectedFingerprint: identity})]);
});

test("what the host layout cannot type is said once across the screen and on its entries, without blocking the list", async ({page}) => {
    await openControls(page, "autocorrect");
    await expect(page.locator("[data-ac-notice]")).toHaveCount(0);
    // As core publishes a list after the host layout changed under it.
    await publish(page, (model) => {
        const warning = "US cannot type “é”, so this replacement will not be typed.";
        model.autocorrect.entries.push({id: "café", label: "café", correction: "café", warnings: [warning], typos: [{typo: "cafe", input: "cafe", warnings: []}]});
        model.autocorrect.notices = ["US cannot type 1 replacement, so the keyboard skips it. Change Host settings → Your computer back, or edit the replacements marked."];
        model.configDefaults.find((section) => section.id === "autocorrect").fields.find((field) => field.macro === "autocorrect").enabled = false;
    });
    // The core's notice, whole, as the callout the switch's banner is: both run across the two panes, one as wide as the other.
    const notice = page.locator(".library-head [data-ac-notice]");
    await expect(notice).toHaveText("US cannot type 1 replacement, so the keyboard skips it. Change Host settings → Your computer back, or edit the replacements marked.");
    await expect(notice).toHaveClass(/callout/);
    const [noticeBox, bannerBox, padBox] = [await notice.boundingBox(), await page.locator(".library-head [data-master-off]").boundingBox(), await page.locator(".pad.autocorrect").boundingBox()];
    expect(Math.abs(noticeBox.width - bannerBox.width)).toBeLessThan(1);
    expect(noticeBox.width).toBeGreaterThan(padBox.width - 80);
    await expect(item(page, "café")).toHaveClass(/caution/);
    await expect(item(page, "the")).not.toHaveClass(/caution/);
    await item(page, "café").click();
    await expect(editor(page).locator("[data-ac-warning]")).toHaveText("US cannot type “é”, so this replacement will not be typed.");
    await expect(bank(page).locator('[data-act="ac-add"]')).toBeEnabled();
    // An input with a warning is marked on its chip, its reason in its tip and in a note under the chips.
    await item(page, "un").click();
    const short = editor(page).locator('[data-ac-chip="nu"]');
    await expect(short).toHaveClass(/warn/);
    await expect(short).toHaveAttribute("data-tip", /is a short input with \*, so it catches many words/);
    await expect(editor(page).locator('[data-ac-warning="nu"]')).toContainText("is a short input with *");
});

test("no control that removes something is a bare ×: each is written out", async ({page}) => {
    await openControls(page, "autocorrect");
    // Every state the screen has a removing control in: an entry with a chip open, a new replacement, the import's summary.
    const written = () => page.locator(".main button.destructive, .main [data-act*='delete'], .main [data-act*='remove'], .main [data-act*='discard'], .main [data-act*='clear']").evaluateAll((buttons) =>
        buttons.map((button) => (button.textContent || "").trim()));
    const lettered = (words) => { for (const word of words) expect(word, `“${word}” says what it does`).toMatch(/[A-Za-z]{4,}/); };
    await item(page, "because").click();
    await editor(page).locator('[data-ac-chip="becasue"]').click();
    expect(await written()).toEqual(["Delete replacement", "Remove", "Clear"]);
    lettered(await written());
    await bank(page).locator('[data-act="ac-add"]').click();
    await page.locator("[data-ac-new] .seg label", {hasText: "Macro"}).click();
    expect(await written()).toEqual(["Discard", "Clear"]);
    // No button of the screen, in any of them, is × alone.
    for (const open of [() => item(page, "because").click(), () => editor(page).locator('[data-ac-chip="becasue"]').click(), () => bank(page).locator('[data-act="ac-add"]').click(),
        () => bank(page).locator('[data-act="ac-export-menu"]').click()]) {
        await open();
        // The info marks are the only buttons drawn without words: each is named, and removes nothing.
        expect(await page.locator(".pad.autocorrect button:not(.info-button)").evaluateAll((buttons) => buttons.filter((button) => /^[×✕x]?$/i.test((button.textContent || "").trim())).length)).toBe(0);
    }
});

test("every control of the screen has a name, and the keyboard reaches them in reading order: the bank, then the editor", async ({page}) => {
    await openControls(page, "autocorrect");
    await item(page, "because").click();
    await editor(page).locator('[data-ac-chip="becasue"]').click();
    // A name a screen reader says: its words, its label or its aria-label.
    const unnamed = await page.locator(".pad.autocorrect :is(button, input, textarea, select)").evaluateAll((controls) => controls.filter((control) =>
        !(control.textContent || "").trim() && !control.getAttribute("aria-label") && !control.getAttribute("aria-labelledby") && !control.closest("label") && !(control.id && document.querySelector(`label[for="${control.id}"]`)))
        .map((control) => control.outerHTML.slice(0, 80)));
    expect(unnamed).toEqual([]);
    // The bank and the inputs are named groups of buttons: an item and a chip are announced as the buttons they are.
    await expect(bank(page).locator(".ac-bank")).toHaveAttribute("role", "group");
    await expect(editor(page).locator(".ac-inputs")).toHaveAttribute("role", "group");
    await expect(page.locator(".pad.autocorrect button[role]")).toHaveCount(0);
    // Tab from the search walks the bank's items, New, the files, then the editor from its header down.
    await page.locator('[data-f="autocorrect:search"]').focus();
    const order = [];
    for (let step = 0; step < 40; step++) {
        await page.keyboard.press("Tab");
        const at = await page.evaluate(() => { const node = document.activeElement; return node?.closest(".pad.autocorrect") ? node.dataset.act || node.dataset.f || (node.classList.contains("info-button") ? `ⓘ ${node.getAttribute("aria-label")}` : node.dataset.acEntry !== undefined ? "item" : node.tagName) : null; });
        if (!at) break;
        if (order.at(-1) !== at) order.push(at);
    }
    expect(order.map((name) => name.replace(/^autocorrect:entry:because:/, ""))).toEqual(["item", "ac-add", "ac-import", "ac-export-menu", "ac-delete", "ⓘ How a replacement works", "kind:text", "replacement",
        "ⓘ How inputs are written, and the * wildcard", "ac-chip", "input:becasue", "ac-remove-input", "ac-chip", "ac-more", "ⓘ About the preview", "autocorrect:try:text", "autocorrect:try:caps"]);
    // Clear is off with nothing to clear, as Clear take is, and a replaced part of the preview is no tab stop.
    await expect(editor(page).locator('[data-act="ac-try-clear"]')).toBeDisabled();
});

// ── the switch is a Host setting (D-L87) ───────────────────────────────

test("the switch is a Host setting that says where its list is, and the list's screen says so while it is off", async ({page}) => {
    await openControls(page, "host");
    const card = page.locator('.settings-group[data-section="autocorrect"]');
    await expect(card.locator("h3")).toHaveText("Text replacement");
    // After Your computer, whose layout it types through, and before the key swaps.
    await expect(page.locator(".settings-pad > .settings-group")).toHaveCount(3);
    expect(await page.locator(".settings-pad > .settings-group").evaluateAll((cards) => cards.map((node) => node.getAttribute("data-section")))).toEqual(["host", "autocorrect", "keyboardOptions"]);
    const setting = card.locator(".setrow");
    await expect(setting.locator(".nm")).toContainText("Enabled");
    await expect(setting.locator(".kk-mark")).toHaveText(["↺ keyboard keys change this too"]);
    await expect(setting.locator(".hint")).toHaveText("Off, the keyboard types every word as you typed it and keeps your list. Replacements and their inputs are in Text replacement.");
    // A row and nothing else, as the switches of combos and behaviours are: no link of its own.
    await expect(card.locator("button, a")).toHaveCount(0);
    const toggle = card.locator('[data-macro="autocorrect"]');
    await expect(toggle).not.toBeChecked();
    await clearPosts(page);
    await toggle.check({force: true});
    await expectPost(page, {type: "updateConfigDefaults", sectionId: "autocorrect", fields: [{macro: "autocorrect", enabled: true}], expectedFingerprint: identity});
    // Key swaps & typing does not list it.
    await expect(page.locator('.settings-group[data-section="keyboardOptions"] [data-macro="autocorrect"]')).toHaveCount(0);
    await expect(page.locator('[data-macro="autocorrect"]')).toHaveCount(1);
    await page.locator('[data-screen="autocorrect"]').click();
    await expect(page.locator(".main > .topbar h1")).toHaveText("Text replacement");
    // Off, the list's screen says so across its head, over both panes, as the combo and behaviour editors do, and the banner goes to the switch.
    const banner = page.locator(".pad.autocorrect > .library-head [data-master-off]");
    await expect(banner).toContainText("Text replacement is off.");
    await expect(banner).toContainText("Turn it on in Host settings");
    await expect(page.locator(".pad.autocorrect > :first-child")).toHaveClass(/library-head/);
    const across = await banner.boundingBox(), left = await bank(page).boundingBox(), right = await editor(page).boundingBox();
    expect(Math.abs(across.x - left.x)).toBeLessThan(2);
    expect(Math.abs(across.x + across.width - (right.x + right.width))).toBeLessThan(2);
    await banner.click();
    await expect(page.locator(".main > .topbar h1")).toHaveText("Host");
    await expect(page.locator('.settings-group[data-section="autocorrect"]')).toBeVisible();
});

// ── Try it ──────────────────────────────────────────────────────────────

// The core's answer to the last try posted, as it would send it.
const answer = (page, result) => page.evaluate(async (result) => {
    const {getModel} = await import("/webview/store.mjs");
    const {draft} = getModel();
    window.dispatchEvent(new MessageEvent("message", {data: {type: "autocorrectTry", requestId: window.__posted.at(-1).requestId, draftId: draft.id, draftRevision: draft.revision, result}}));
}, result);

test("Try it closes the editor: its box is never changed, and the preview under it shows what the core answers", async ({page}) => {
    await openControls(page, "autocorrect");
    const section = editor(page).locator("[data-ac-try]"), box = page.locator('[data-f="autocorrect:try:text"]'), preview = page.locator("[data-ac-try-preview]");
    // The last section of the editor card, as Record is a macro's.
    await expect(editor(page).locator("> .card-b > :last-child")).toHaveAttribute("data-ac-try", "");
    await expect(section.locator(".field > span")).toHaveText("Your keyboard would type");
    await expect(section.locator("#ac-info-try")).toContainText("What your keyboard would type with this draft's list, through US.");
    // Save is the word on screen; nothing here says Apply.
    expect(await page.locator(".pad.autocorrect").evaluate((node) => node.textContent)).not.toMatch(/\bApply\b/);
    // Clear is off with nothing to clear, as Clear take is.
    await expect(section.locator('[data-act="ac-try-clear"]')).toBeDisabled();
    await expect(section.locator(".sw .txt")).toHaveText("Preview with Caps Lock on");
    await expect(preview).toHaveText("Nothing typed yet.");
    // No keyboard is replacing here, so nothing says one is.
    await expect(page.locator("[data-ac-try-running]")).toHaveCount(0);
    await clearPosts(page);
    await box.pressSequentially("teh ");
    const last = async () => (await posted(page)).at(-1);
    await expect.poll(last).toEqual(expect.objectContaining({type: "tryAutocorrect", before: "", typed: "teh ", capsLock: false, requestId: expect.any(Number)}));
    // The core's answer goes to the preview, each replaced part marked and saying what it replaced; the box stays as it was typed.
    await answer(page, {text: "the ", fired: [{entry: "the", correction: "the", typo: "teh"}], marks: [{entry: "the", correction: "the", typo: "teh", start: 0, end: 3}], undone: false});
    await expect(box).toHaveValue("teh ");
    expect(await preview.evaluate((node) => node.textContent)).toBe("the ");
    await expect(preview.locator("mark")).toHaveText("the");
    await expect(preview.locator("mark")).toHaveAttribute("data-tip", "“teh” was replaced with “the”.");
    await expect(page.locator("[data-ac-try-said]")).toHaveText("“teh” was replaced with “the”.");
    // What fired is marked in the bank; it is not the one open, so the line offers to open it.
    await expect(bank(page).locator(".fired")).toHaveAttribute("data-ac-entry", "the");
    await page.locator('[data-act="ac-try-show"]').click();
    await expect(editor(page)).toHaveAttribute("data-ac-editor", "the");
    await expect(box).toHaveValue("teh ");
    await expect(editor(page).locator(".ac-chip.fired")).toHaveText("teh");
    await expect(page.locator('[data-act="ac-try-show"]')).toBeHidden();
    // One character gone from the end is a Backspace, undone in the preview alone.
    await box.press("ControlOrMeta+ArrowDown");
    await box.press("Backspace");
    await expect.poll(last).toEqual(expect.objectContaining({type: "tryAutocorrect", before: "", typed: "teh \b"}));
    await answer(page, {text: "teh", fired: [], marks: [], undone: true});
    await expect(box).toHaveValue("teh");
    expect(await preview.evaluate((node) => node.textContent)).toBe("teh");
    await expect(preview.locator("mark")).toHaveCount(0);
    await expect(page.locator("[data-ac-try-said]")).toContainText("Backspace put the word back");
    await expect(bank(page).locator(".fired")).toHaveCount(0);
    // A replacement that plays a macro is said by the macro's name.
    await box.pressSequentially(" ");
    await answer(page, {text: "teh ", fired: [{entry: "\u0001macro:3", correction: "", typo: "sig", macro: 3}], marks: [], undone: false});
    await expect(page.locator("[data-ac-try-said]")).toHaveText("“sig” plays the macro “Macro 3”.");
    await expect(box).toHaveValue("teh ");
    // An edit in the middle is what a click is to the keyboard: the text stands, and typing starts afresh.
    await box.fill("tex");
    await expect.poll(last).toEqual(expect.objectContaining({type: "tryAutocorrect", before: "tex", typed: ""}));
    // Caps Lock is the preview's, posted with what is typed.
    await page.locator('[data-f="autocorrect:try:caps"]').check({force: true});
    await expect.poll(last).toEqual(expect.objectContaining({type: "tryAutocorrect", before: "tex", typed: "", capsLock: true}));
    await expect(box).toHaveValue("tex");
    // Set by hand, the switch stays as it was set while the computer's own Caps Lock does not change; when that changes, the switch follows it.
    const caps = page.locator('[data-f="autocorrect:try:caps"]');
    const key = (capsLock) => box.evaluate((node, modifierCapsLock) => node.dispatchEvent(new KeyboardEvent("keydown", {key: "a", bubbles: true, modifierCapsLock})), capsLock);
    await key(false);
    await expect(caps).toBeChecked();
    await key(true);
    await expect(caps).toBeChecked();
    await key(false);
    await expect(caps).not.toBeChecked();
    await caps.check({force: true});
    await key(false);
    await expect(caps).toBeChecked();
    // Clear empties the box and the preview, and asks nothing; with nothing left to clear it is off again.
    await answer(page, {text: "tex", fired: [], marks: [], undone: false});
    await clearPosts(page);
    await expect(page.locator('[data-act="ac-try-clear"]')).toBeEnabled();
    await page.locator('[data-act="ac-try-clear"]').click();
    await expect(box).toHaveValue("");
    await expect(preview).toHaveText("Nothing typed yet.");
    await expect(box).toBeFocused();
    await expect(page.locator('[data-act="ac-try-clear"]')).toBeDisabled();
    expect(await posted(page)).toEqual([]);
    // The preview is redrawn on every key, so it is not read out again each time: the line under it is what is announced.
    await expect(preview).not.toHaveAttribute("role", "status");
    await expect(page.locator("[data-ac-try-said]")).toHaveAttribute("aria-live", "polite");
});

test("Try it says a connected keyboard is replacing in its box too, only while the keyboard reports that it is", async ({page}) => {
    await openControls(page, "autocorrect");
    await expect(page.locator("[data-ac-try-running]")).toHaveCount(0);
    await publish(page, (model) => { model.autocorrectRunning = true; });
    await expect(page.locator("[data-ac-try-running]")).toHaveText("Your keyboard is replacing as you type here too. The preview shows this draft.");
    // Whatever arrives in the box stays as it arrived: a keyboard's replacement is text like any other.
    const box = page.locator('[data-f="autocorrect:try:text"]');
    await box.pressSequentially("teh ");
    await box.press("Backspace"); await box.press("Backspace"); await box.press("Backspace"); await box.press("Backspace");
    await box.pressSequentially("the ");
    await answer(page, {text: "the ", fired: [], marks: [], undone: false});
    await expect(box).toHaveValue("the ");
    await publish(page, (model) => { model.autocorrectRunning = false; });
    await expect(page.locator("[data-ac-try-running]")).toHaveCount(0);
    await expect(box).toHaveValue("the ");
});

test("on a narrow screen the bank stacks over the editor, and nothing runs off the side", async ({page}) => {
    await page.setViewportSize({width: 390, height: 844});
    await openControls(page, "autocorrect");
    const left = await bank(page).boundingBox(), right = await editor(page).boundingBox();
    expect(right.y).toBeGreaterThan(left.y + left.height - 1);
    expect(Math.abs(right.x - left.x)).toBeLessThan(2);
    const fits = () => page.evaluate(() => document.querySelector(".pad.autocorrect").scrollWidth <= document.querySelector(".pad.autocorrect").clientWidth + 1);
    expect(await fits()).toBe(true);
    await item(page, "because").click();
    await editor(page).locator('[data-ac-chip="becasue"]').click();
    expect(await fits()).toBe(true);
    await bank(page).locator('[data-act="ac-add"]').click();
    await page.locator("[data-ac-new] .seg label", {hasText: "Macro"}).click();
    expect(await fits()).toBe(true);
    await expect(page.locator('[data-f="autocorrect:try:text"]')).toBeVisible();
});

// An info mark's list stays inside the screen's area (ui/info-mark.mjs):
// moved sideways in a narrow window, opened upward or bound in height, its
// body scrolling, in a short one.
const listBox = async (page, id) => {
    const mark = page.locator(`[data-info-mark]:has(#${id})`);
    await mark.locator(".info-button").scrollIntoViewIfNeeded();
    await mark.locator(".info-button").hover();
    await expect(page.locator(`#${id}`)).toBeVisible();
    // The screen's own area: under the top bar and beside the rail, which would cover what left it.
    return page.locator(`#${id}`).evaluate((node) => {
        const box = node.getBoundingClientRect(), area = document.querySelector(".content").getBoundingClientRect();
        return {left: box.left, right: box.right, top: box.top, bottom: box.bottom, area: {left: area.left, top: area.top, right: Math.min(area.right, document.documentElement.clientWidth), bottom: Math.min(area.bottom, document.documentElement.clientHeight)}};
    });
};
for (const [width, height] of [[430, 844], [390, 844], [1280, 620], [900, 480]]) {
    test(`an info mark's list stays inside a ${width} by ${height} window`, async ({page}) => {
        await page.setViewportSize({width, height});
        await openControls(page, "autocorrect");
        for (const id of ["ac-info-replacement", "ac-info-inputs", "ac-info-try"]) {
            const box = await listBox(page, id);
            expect(box.left, `${id} left`).toBeGreaterThanOrEqual(box.area.left);
            expect(box.right, `${id} right`).toBeLessThanOrEqual(box.area.right);
            expect(box.top, `${id} top`).toBeGreaterThanOrEqual(box.area.top);
            expect(box.bottom, `${id} bottom`).toBeLessThanOrEqual(box.area.bottom);
            // The pointer can cross onto the list without it closing, wherever it opened.
            await page.locator(`#${id}`).hover();
            await expect(page.locator(`#${id}`)).toBeVisible();
            await page.mouse.move(0, 0);
        }
    });
}

test("an info mark's list too tall for the window scrolls, by the wheel and by the arrow keys from the mark", async ({page}) => {
    await page.setViewportSize({width: 900, height: 480});
    await openControls(page, "autocorrect");
    const mark = page.locator("[data-info-mark]:has(#ac-info-inputs)"), body = page.locator("#ac-info-inputs .info-body");
    await mark.locator(".info-button").focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await expect(mark.locator(".info-button")).toBeFocused();
    await expect(page.locator("#ac-info-inputs")).toBeVisible();
    expect(await body.evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true);
    await page.keyboard.press("ArrowDown");
    await expect.poll(() => body.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
    await page.keyboard.press("Escape");
    await expect(page.locator("#ac-info-inputs")).toBeHidden();
});

// ── files (D-L85) ───────────────────────────────────────────────────────

test("Import, the starter list and the Export menu each post their control from the preview", async ({page}) => {
    await openControls(page, "autocorrect");
    await bank(page).locator('[data-act="ac-import"]').click();
    await expectPost(page, {type: "chooseAutocorrectFile", requestId: expect.any(Number)});
    // While the system's chooser is asking for a file, nothing is drawn behind it; a chooser closed without one leaves nothing.
    const sheet = page.locator(".scrim .sheet[data-ac-import]");
    await expect(sheet).toHaveCount(0);
    const chosen = (reply) => page.evaluate(async (reply) => {
        const {draft} = (await import("/webview/store.mjs")).getModel();
        window.dispatchEvent(new MessageEvent("message", {data: {type: "autocorrectImportPreview", requestId: window.__posted.at(-1).requestId, name: "", draftId: draft.id, draftRevision: draft.revision, ...reply}}));
    }, reply);
    await chosen({});
    await expect(sheet).toHaveCount(0);
    // What a chosen file would do is a sheet over the screen, as a backup's comparison is; Escape is its Cancel.
    await bank(page).locator('[data-act="ac-import"]').click();
    await chosen({name: "mine.json", error: "This file is not a valid text replacement list."});
    await expect(sheet).toHaveAttribute("role", "dialog");
    await expect(sheet.locator(".unavailable")).toHaveText("This file is not a valid text replacement list.");
    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);
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
    // From the keyboard, as the rail's menu: it opens on its first format, the arrows, Home and End move, Escape closes with focus back on the button.
    await exportButton.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator('[data-act="ac-export"][data-format="txt"]')).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(page.locator('[data-act="ac-export"][data-format="csv"]')).toBeFocused();
    await page.keyboard.press("End");
    await expect(page.locator('[data-act="ac-export"][data-format="json"]')).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(page.locator('[data-act="ac-export"][data-format="txt"]')).toBeFocused();
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
    await expect(sheet.locator(".sheet-h .mono")).toHaveText("mine.txt");
    await expect(sheet).toContainText("Reading list…");
    // Two files, or one too large, are refused where Import is, as the Backups screen says it.
    await sheet.locator('[data-act="ac-import-cancel"]').click();
    await clearPosts(page);
    await dropFiles(page, [{text: "a -> b", name: "a.txt"}, {text: "c -> d", name: "b.txt"}], ".pad.autocorrect");
    await expect(page.locator("[data-ac-file-status]")).toHaveText("Drop one file at a time.");
    await expect(page.locator("[data-ac-file-status]")).toHaveAttribute("role", "status");
    await dropFiles(page, [{text: "x".repeat(262145), name: "big.txt"}], ".pad.autocorrect");
    await expect(page.locator("[data-ac-file-status]")).toHaveText("This file is too large for a text replacement list.");
    expect(await posted(page)).toEqual([]);
});

test("with no replacements the editor's place says where they start, and offers the common typo fixes first", async ({page}) => {
    await openControls(page, "autocorrect");
    await publish(page, (model) => {
        model.autocorrect.entries = [];
        model.autocorrect.usage = {...model.autocorrect.usage, corrections: 0, typos: 0, textBytes: 0, bytes: 8};
        model.autocorrect.notices = [];
    });
    // The empty pattern a macro with no steps has: a mark, a line, a sentence.
    const empty = editor(page).locator(".macro-empty[data-ac-empty]");
    await expect(empty.locator("strong")).toHaveText("Your replacements start here");
    await expect(empty).toContainText("your phone number for pnumber");
    await expect(empty.locator("button")).toHaveText(["Add common typo fixes", "+ New replacement", "Import…"]);
    await expect(empty.locator("button").first()).toHaveClass(/primary/);
    await expect(empty.locator(".primary")).toHaveCount(1);
    // What the starter list holds is its own count, as the core publishes it.
    const starter = await page.evaluate(async () => (await import("/webview/store.mjs")).getModel().autocorrect.starter);
    expect(starter.inputs).toBeGreaterThan(starter.replacements);
    await expect(empty.locator('[data-act="ac-starter"]')).toHaveAttribute("data-tip", `Fixes for ${starter.inputs} common typos of ${starter.replacements} English words, each a whole word. You see what it adds before anything changes.`);
    await expect(editor(page).locator("[data-ac-try]")).toHaveCount(0);
    await expect(usage(page)).toHaveText("0 of 1,024 inputs");
    await expect(count(page)).toHaveText("0 replacements · 0 inputs");
    await expect(bank(page).locator("[data-ac-entry]")).toHaveCount(0);
    await expect(bank(page).locator('[data-act="ac-add"]')).toBeVisible();
    await expect(page.locator('[data-act="ac-export-menu"]')).toBeDisabled();
    await empty.locator('[data-act="ac-starter"]').click();
    await expectPost(page, {type: "previewAutocorrectImport", starter: true, requestId: expect.any(Number)});
    await expect(page.locator("[data-ac-import] h2")).toHaveText("Add the common typo fixes?");
    await page.locator('[data-act="ac-import-cancel"]').click();
    await clearPosts(page);
    await empty.locator('[data-act="ac-import"]').click();
    await expectPost(page, {type: "chooseAutocorrectFile", requestId: expect.any(Number)});
    await expect(page.locator("[data-ac-import]")).toHaveCount(0);
    // New replacement opens its editor in the explanation's place.
    await empty.locator('[data-act="ac-add"]').click();
    await expect(page.locator("[data-ac-new] [data-ac-text]")).toBeFocused();
    await expect(page.locator("[data-ac-empty]")).toHaveCount(0);
});

// ── memory, on the Keyboard screen ──────────────────────────────────────

test("the Keyboard screen's Memory panel counts the inputs of text replacements and shows their memory", async ({page}) => {
    await openControls(page, "device");
    const usage = page.locator(".card.usage");
    const counted = usage.locator(".usage-counts tbody tr").filter({hasText: "Text replacement inputs"});
    await expect(counted.locator(".count")).toHaveText("15 of 1,024");
    await expect(counted).toHaveAttribute("data-tip", /Every input of every text replacement/);
    const memory = usage.locator('[data-usage="replacements"]');
    await expect(memory.locator("h4")).toHaveText("Text replacement memory");
    await expect(memory.locator(".sect-h .note")).toHaveText("375 of 34,824 bytes used");
    await expect(memory.locator(".meter i")).toBeVisible();
    await expect(memory.locator(".meter-note")).toHaveText("Replacements and their inputs are part of the profile above, within their own limit, and listed on Text replacement.");
    await expect(usage.locator(".card-b > .note")).toContainText("Behaviours, combos, macros, text replacements, custom keys, pointing modes, lighting, settings and names are stored together here");
    // After Macro memory, as its screen follows Macros.
    expect(await usage.locator(".sect-h h4").allTextContents()).toEqual(["Profile", "Macro memory", "Text replacement memory"]);
    // The one share core works out fills this meter and the screen's own under the same heading, however full the list's inputs are.
    await publish(page, (model) => { model.autocorrect.usage = {...model.autocorrect.usage, typos: 1000, share: 0.5}; });
    const filled = (locator) => locator.evaluate((node) => node.style.width);
    expect(await filled(memory.locator(".meter i"))).toBe("50%");
    await page.locator('[data-screen="autocorrect"]').click();
    expect(await filled(page.locator("[data-ac-meter] i"))).toBe("50%");
});

// ── the real core, in the demo ──────────────────────────────────────────

test("in the demo the core keeps a new replacement, checks what is typed, refuses in words and reviews entry by entry", async ({page}) => {
    await openDemo(page);
    await expect(count(page)).toHaveText("8 replacements · 14 inputs");
    await expect(usage(page)).toHaveText("14 of 1,024 inputs");
    await bank(page).locator('[data-act="ac-add"]').click();
    const fresh = page.locator("[data-ac-new]");
    const replacement = fresh.locator("[data-ac-text]"), first = fresh.locator("[data-ac-first]"), feedback = fresh.locator('[data-ac-feedback="new"]');

    // An input another replacement has is refused as it is typed; Enter adds nothing and leaves it in its field, the reason under it.
    await replacement.fill("ten");
    await first.fill("teh");
    await expect(feedback).toContainText("“teh” is already an input for “the”.");
    await first.press("Enter");
    await expect(count(page)).toHaveText("8 replacements · 14 inputs");
    await expect(first).toHaveValue("teh");
    await expect(feedback).toContainText("“teh” is already an input for “the”.");
    // Entered before the check has answered, it is refused the same way: nothing is posted for the core to refuse in a toast.
    await first.fill("");
    await first.pressSequentially("hte");
    await first.press("Enter");
    await expect(feedback).toContainText("“hte” is already an input for “the”.");
    await expect(first).toHaveValue("hte");
    await expect(page.locator(".toast")).toHaveCount(0);
    await expect(count(page)).toHaveText("8 replacements · 14 inputs");
    // A * where it cannot go is refused in plain words.
    await first.fill("te*h");
    await expect(feedback).toContainText("has * where it cannot go. Put * only at the start or the end");
    // A short input with * is only warned about.
    await replacement.fill("no");
    await first.fill("*on");
    await expect(feedback).toContainText("“*on” is a short input with *, so it catches many words.");
    // What the demo's layout cannot type is refused when it is added.
    await replacement.fill("日本");
    await first.fill("nihon");
    await expect(feedback).toContainText("cannot type “日”, “本”");

    await replacement.fill("separate");
    await first.fill("seperate Seperat");
    await expect(feedback).toBeHidden();
    await first.press("Enter");
    // It is on the list, open in the editor, with the field for its next input ready.
    await expect(count(page)).toHaveText("9 replacements · 16 inputs");
    await expect(page.locator("[data-ac-new], [data-ac-new-item]")).toHaveCount(0);
    await expect(item(page, "separate")).toHaveAttribute("aria-current", "true");
    await expect(editor(page)).toHaveAttribute("data-ac-editor", "separate");
    await expect(chips(page)).toHaveText(["seperat", "seperate"]);
    const more = editor(page).locator("[data-ac-more]");
    await expect(more).toBeFocused();
    await more.fill("separat");
    await more.press("Enter");
    await expect(chips(page)).toHaveCount(3);
    await expect(more).toBeFocused();
    // Inputs entered one straight after another each arrive, as fast as they are typed.
    await more.pressSequentially("sepraate");
    await more.press("Enter");
    await more.pressSequentially("seperrate");
    await more.press("Enter");
    await more.pressSequentially("separrate");
    await more.press("Enter");
    await expect(chips(page)).toHaveText(["separat", "separrate", "seperat", "seperate", "seperrate", "sepraate"]);
    await expect(more).toHaveValue("");
    await expect(more).toBeFocused();
    await expect(page.locator(".toast")).toHaveCount(0);
    // One the list refuses, entered at once behind one it takes: the first arrives, the refused one is back in the field with the reason, and what was typed after it too.
    await more.pressSequentially("seperaate");
    await more.press("Enter");
    await more.pressSequentially("teh");
    await more.press("Enter");
    await more.pressSequentially("sepp");
    await expect(editor(page).locator('[data-ac-feedback="input"]')).toContainText("“teh” is already an input for “the”.");
    await expect(chips(page)).toHaveCount(7);
    await expect(more).toHaveValue(/^teh\b.*sepp$/);
    await expect(page.locator(".toast")).toHaveCount(0);
    await more.fill("");
    await more.press("Escape");
    for (const typo of ["sepraate", "seperrate", "separrate", "seperaate"]) {
        await editor(page).locator(`[data-ac-chip="${typo}"]`).click();
        await editor(page).locator('[data-act="ac-remove-input"]').click();
        await expect(editor(page).locator(`[data-ac-chip="${typo}"]`)).toHaveCount(0);
    }
    await expect(chips(page)).toHaveCount(3);

    // The same replacement made again is offered to be opened: still one entry.
    await bank(page).locator('[data-act="ac-add"]').click();
    await page.locator("[data-ac-new] [data-ac-text]").fill("separate");
    await expect(page.locator("[data-ac-joins]")).toContainText("already on your list");
    await page.locator('[data-act="ac-open-joined"]').click();
    await expect(editor(page)).toHaveAttribute("data-ac-editor", "separate");
    await editor(page).locator('[data-act="ac-more"]').click();
    await more.fill("seprate");
    await more.press("Enter");
    await expect(count(page)).toHaveText("9 replacements · 18 inputs");
    await expect(chips(page)).toHaveCount(4);
    await more.press("Escape");

    // One input given a *, one removed.
    await editor(page).locator('[data-ac-chip="seprate"]').click();
    await editor(page).locator("[data-ac-input-text]").fill("seprate*");
    await editor(page).locator("[data-ac-input-text]").press("Enter");
    // The chip shows the * once the core has taken it, and its field has closed.
    await expect(editor(page).locator('[data-ac-chip="seprate"]')).toHaveText("seprate*");
    await expect(editor(page).locator("[data-ac-input-text]")).toHaveCount(0);
    await editor(page).locator('[data-ac-chip="separat"]').click();
    await editor(page).locator('[data-act="ac-remove-input"]').click();
    await expect(count(page)).toHaveText("9 replacements · 17 inputs");
    // A refused edit of an input is said under the chips, and nothing changes.
    await editor(page).locator('[data-ac-chip="seprate"]').click();
    await editor(page).locator("[data-ac-input-text]").fill("teh");
    await expect(editor(page).locator('[data-ac-feedback="input"]')).toContainText("“teh” is already an input for “the”.");
    await editor(page).locator("[data-ac-input-text]").press("Escape");
    await expect(count(page)).toHaveText("9 replacements · 17 inputs");
    // The replacement respelled: the editor follows it to where it is now.
    await editor(page).locator("[data-ac-text]").fill("Separate");
    await editor(page).locator("[data-ac-text]").press("Enter");
    await expect(item(page, "Separate")).toHaveAttribute("aria-current", "true");
    await expect(item(page, "separate")).toHaveCount(0);
    await expect(editor(page).locator(".title-name-text")).toHaveText("Separate");

    // Changed to a replacement the list has, the two join, and the check says so before the field is left.
    await item(page, "thing").click();
    await editor(page).locator("[data-ac-text]").fill("the");
    await expect(editor(page).locator('[data-ac-feedback="replacement"]')).toHaveText("“the” is already on your list: this one's inputs will join it.");
    await editor(page).locator("[data-ac-text]").press("Escape");
    await expect(count(page)).toHaveText("9 replacements · 17 inputs");

    // Review lists the entry once, an input as it is written.
    await item(page, "the").click();
    await page.locator('.commit [data-act="review"]').click();
    const review = page.locator('.sheet[aria-label="Review changes"]');
    await expect(review.locator(".rv-sect")).toContainText(["Text replacement"]);
    await expect(review).toContainText("Separate");
    await expect(review.locator(".sheet-h h2")).toHaveText("Review 1 change");
    await expect(review).toContainText("seprate*");
    expect(await review.innerText()).not.toMatch(/whole word|start of word|Typo\b|Typed\b|Correction\b/);
    // Show opens the changed replacement in its editor, whichever was open, as a macro's Show opens the macro.
    await review.locator("[data-show]").click();
    await expect(review).toHaveCount(0);
    await expect(editor(page)).toHaveAttribute("data-ac-editor", "Separate");
    await expect(item(page, "Separate")).toHaveAttribute("aria-current", "true");
    // And with a new replacement being made, it gives way to the one shown.
    await bank(page).locator('[data-act="ac-add"]').click();
    await page.locator("[data-ac-new] [data-ac-text]").fill("half made");
    await page.locator('.commit [data-act="review"]').click();
    await review.locator("[data-show]").click();
    await expect(page.locator("[data-ac-new]")).toHaveCount(0);
    await expect(editor(page)).toHaveAttribute("data-ac-editor", "Separate");
});

test("in the demo a replacement is made to play a macro, Try it says which, and deleting it is undone from the draft's history", async ({page}) => {
    await openDemo(page);
    await bank(page).locator('[data-act="ac-add"]').click();
    const fresh = page.locator("[data-ac-new]");
    await fresh.locator(".seg label", {hasText: "Macro"}).click();
    await fresh.locator('.btn[data-act="ac-pick"]', {hasText: "Pick…"}).click();
    // The demo's macros that have steps, by their names; the first of them plays keys.
    const picker = page.locator(".sheet.picker");
    await expect(picker.locator(".pk-label").first()).toHaveText("In use");
    const name = (await picker.locator('[data-pick="MACRO_0"] .l').innerText()).trim();
    await pickMacro(page, "MACRO_0");
    await expect(fresh.locator("input[data-ac-macro]")).toHaveValue(name);
    await expect(bank(page).locator("[data-ac-new-item] .v")).toHaveText(`▶ ${name}`);
    // A * is refused for a macro, in plain words.
    const first = fresh.locator("[data-ac-first]");
    await first.fill("spot*");
    await expect(fresh.locator('[data-ac-feedback="new"]')).toContainText("A macro plays for a whole word only: take the * out of “spot*”.");
    await first.fill("spot");
    await first.press("Enter");
    await expect(count(page)).toHaveText("9 replacements · 15 inputs");
    const played = bank(page).locator("[data-ac-entry]").filter({has: page.locator('[data-ac-input="spot"]')});
    await expect(played.locator(".v")).toHaveText(`▶ ${name}`);
    await expect(played).toHaveAttribute("aria-current", "true");
    await expect(editor(page).locator("[data-ac-kind]")).toHaveText("Macro");
    // Try it: the box keeps what was typed; in the preview the input goes, and the line says what plays.
    const box = page.locator('[data-f="autocorrect:try:text"]'), preview = page.locator("[data-ac-try-preview]");
    await editor(page).locator("[data-ac-more]").press("Escape");
    await box.pressSequentially("spot ");
    await expect(page.locator("[data-ac-try-said]")).toHaveText(`“spot” plays the macro “${name}”.`);
    await expect(box).toHaveValue("spot ");
    await expect(preview).not.toContainText("spot");
    await expect(played).toHaveClass(/fired/);
    // Backspace after a macro is only Backspace.
    await box.press("Backspace");
    await expect(page.locator("[data-ac-try-said]")).not.toContainText("Backspace put the word back");
    // Review names it by its macro.
    await page.locator('.commit [data-act="review"]').click();
    const review = page.locator('.sheet[aria-label="Review changes"]');
    await expect(review).toContainText(`▶ ${name}`);
    await page.keyboard.press("Escape");
    // Deleted from its header, and back with one undo.
    await editor(page).locator('[data-act="ac-delete"]').click();
    await expect(count(page)).toHaveText("8 replacements · 14 inputs");
    await page.locator('.rail [data-act="undo"]').click();
    await expect(count(page)).toHaveText("9 replacements · 15 inputs");
});

test("in the demo Try it previews as the keyboard would replace, keeps case, undoes on Backspace, and never changes its box", async ({page}) => {
    await openDemo(page);
    const box = page.locator('[data-f="autocorrect:try:text"]'), said = page.locator("[data-ac-try-said]");
    const shown = () => page.locator("[data-ac-try-preview]").evaluate((node) => node.textContent);
    await box.pressSequentially("Teh");
    await expect.poll(shown).toBe("Teh");
    await box.pressSequentially(" ");
    await expect.poll(shown).toBe("The ");
    await expect(box).toHaveValue("Teh ");
    await expect(page.locator("[data-ac-try-preview] mark")).toHaveText("The");
    await expect(said).toHaveText("“teh” was replaced with “the”.");
    await expect(bank(page).locator(".fired")).toHaveAttribute("data-ac-entry", "the");
    // The plain case the brief names: typed small, the box stays small.
    await page.locator('[data-act="ac-try-clear"]').click();
    await box.pressSequentially("teh ");
    await expect.poll(shown).toBe("the ");
    await expect(box).toHaveValue("teh ");
    // Backspace right after puts the word back in the preview, and ending it again leaves it.
    await box.press("Backspace");
    await expect.poll(shown).toBe("teh");
    await expect(said).toContainText("Backspace put the word back");
    await box.pressSequentially(" ");
    await expect.poll(shown).toBe("teh ");
    // An input with * inside a word in capitals, and Enter, after which Backspace is only Backspace.
    await box.pressSequentially("SOMETIHNG");
    await box.press("Enter");
    await expect.poll(shown).toBe("teh SOMETHING\n");
    await expect(box).toHaveValue("teh SOMETIHNG\n");
    await expect(bank(page).locator(".fired")).toHaveAttribute("data-ac-entry", "thing");
    await box.press("Backspace");
    await expect.poll(shown).toBe("teh SOMETHING");
    // An edit to the list is tried at once: with the input gone the word stays.
    await page.locator('[data-act="ac-try-clear"]').click();
    await expect.poll(shown).toBe("Nothing typed yet.");
    await box.pressSequentially("hte ");
    await expect.poll(shown).toBe("the ");
    await page.locator('[data-act="ac-try-show"]').click();
    await editor(page).locator('[data-ac-chip="hte"]').click();
    await editor(page).locator('[data-act="ac-remove-input"]').click();
    await expect.poll(shown).toBe("hte ");
    await expect(box).toHaveValue("hte ");
    // A replacement that is no word: digits, spaces and punctuation, whatever the case typed.
    await bank(page).locator('[data-act="ac-add"]').click();
    await page.locator("[data-ac-new] [data-ac-text]").fill("+31 6 1234 5678");
    await page.locator("[data-ac-first]").fill("pnumber");
    await page.locator("[data-ac-first]").press("Enter");
    await expect(item(page, "+31 6 1234 5678")).toHaveCount(1);
    await page.locator('[data-act="ac-try-clear"]').click();
    await box.pressSequentially("Pnumber, ");
    await expect.poll(shown).toBe("+31 6 1234 5678, ");
    await expect(box).toHaveValue("Pnumber, ");
    // No keyboard is connected in the demo, so nothing says one is replacing.
    await expect(page.locator("[data-ac-try-running]")).toHaveCount(0);

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

test("in the demo a list is imported in each format by picker and by drop, summed up, added or replaced, exported, and the starter list added", async ({page}) => {
    await openDemo(page);
    const sheet = page.locator("[data-ac-import]");
    await expect(count(page)).toHaveText("8 replacements · 14 inputs");

    // QMK's text, through the chooser: one line refused with its reason.
    const txt = "# mine\n:tehn: -> then\n:thne: -> then\nsomthing -> something\n:teh: -> ten\n:nto: -> not\n";
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), bank(page).locator('[data-act="ac-import"]').click()]);
    expect(chooser.element()).toBeTruthy();
    await chooser.setFiles({name: "typos.txt", mimeType: "text/plain", buffer: Buffer.from(txt)});
    await expect(sheet.locator("h2")).toHaveText("Import this list?");
    await expect(sheet.locator(".sheet-h .mono")).toHaveText("typos.txt");
    const add = sheet.locator('[data-ac-way="add"]');
    await expect(add.locator('[data-ac-line="new"]')).toContainText("3 new replacements, with 4 inputs.");
    await expect(add.locator('[data-ac-line="refused"]')).toContainText("5: teh → ten — “teh” is already an input for “the”.");
    await expect(sheet.locator('[data-ac-way="replace"] [data-ac-line="removed"]')).toContainText("8 replacements in your list now are deleted.");
    await expect(add.locator(".note")).toHaveText("Your list would hold 11 replacements, with 18 inputs.");
    await expect(sheet.locator(".callout")).toContainText("Nothing changes until you choose.");
    // The foot of every question: the way back, then the one that goes on; replacing deletes the list there is, so it is written in red and comes last.
    await expect(sheet.locator(".sheet-f button")).toHaveText(["Cancel", "Add to my list", "Replace my list"]);
    await expect(sheet.locator('[data-act="ac-import-replace"]')).toHaveClass(/destructive/);
    await expect(count(page)).toHaveText("8 replacements · 14 inputs");
    await sheet.locator('[data-act="ac-import-add"]').click();
    await expect(sheet).toHaveCount(0);
    await expect(count(page)).toHaveText("11 replacements · 18 inputs");
    // QMK's line with no colons is one that matches anywhere: written here with a * each side.
    await expect(item(page, "something").locator(".n")).toHaveText("*somthing*");

    // A spreadsheet's CSV, dropped, under the header Ark wrote before: an input with its *, one added to a replacement the list has, duplicates skipped.
    const csv = "\ufeffreplacement;typed\r\nthen;tehn thn\r\nreceive;recieve\r\nweird;wierd*\r\n";
    expect(await dropFiles(page, [{text: csv, name: "sheet.csv", type: "text/csv"}], ".pad.autocorrect")).toBe(true);
    await expect(sheet.locator(".sheet-h .mono")).toHaveText("sheet.csv");
    await expect(add.locator('[data-ac-line="added"]')).toContainText("1 more input for 1 replacement you already have.");
    await expect(add.locator('[data-ac-line="added"] .ac-names')).toContainText("thn → then");
    await expect(add.locator('[data-ac-line="duplicates"]')).toContainText("2 are already in the list, and skipped.");
    await expect(add.locator('[data-ac-line="new"]')).toContainText("1 new replacement, with 1 input.");
    await sheet.locator('[data-act="ac-import-add"]').click();
    await expect(count(page)).toHaveText("12 replacements · 20 inputs");
    await expect(item(page, "weird").locator(".n")).toHaveText("wierd*");

    // An older spreadsheet, with its match column, still reads; nothing in it is new.
    await dropFiles(page, [{text: "typos,correction,match\nwierd,weird,start\ntehn,then,whole word\n", name: "older.csv", type: "text/csv"}], ".pad.autocorrect");
    await expect(sheet.locator('[data-ac-way="add"] [data-ac-line="nothing"]')).toHaveText("Nothing in it would change your list.");
    await sheet.locator('[data-act="ac-import-cancel"]').click();

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
    // The spreadsheet's file starts with a byte order mark, so Excel reads its accents.
    expect(exports.csv.startsWith("\ufeffreplacement,inputs\r\n")).toBe(true);
    expect(exports.csv).toContain("weird,wierd*\r\n");
    const json = JSON.parse(exports.json);
    expect(json.version).toBe(1);
    expect(json.replacements).toContainEqual({replacement: "weird", inputs: ["wierd*"]});
    expect(json.replacements).toContainEqual({replacement: "something", inputs: ["*somthing*"]});
    expect(exports.json).not.toMatch(/"match"|"typos"|"typed"|"correction"/);
    for (const format of ["json", "csv", "txt"]) {
        await dropFiles(page, [{text: exports[format], name: `back.${format}`}], ".pad.autocorrect");
        const replace = sheet.locator('[data-ac-way="replace"]');
        await expect(replace.locator('[data-ac-line="new"]')).toContainText("12 new replacements, with 20 inputs.");
        await expect(sheet.locator('[data-ac-way="add"] [data-ac-line="nothing"]')).toHaveText("Nothing in it would change your list.");
        await expect(sheet.locator('[data-act="ac-import-add"]')).toBeDisabled();
        await sheet.locator('[data-act="ac-import-replace"]').click();
        await expect(sheet).toHaveCount(0);
        await expect(count(page)).toHaveText("12 replacements · 20 inputs");
    }

    // A file that is no list says so, and changes nothing.
    await dropFiles(page, [{text: "{nope", name: "broken.json"}], ".pad.autocorrect");
    await expect(sheet.locator(".unavailable")).toHaveText("This file is not a valid text replacement list.");
    await expect(sheet.locator(".sheet-f button")).toHaveText(["Close"]);
    await sheet.locator('[data-act="ac-import-cancel"]').click();

    // The common typo fixes: offered where the list is empty, summed up and added the same way.
    for (let left = 12; left > 0; left--) {
        await editor(page).locator('[data-act="ac-delete"]').click();
        await expect(bank(page).locator("[data-ac-entry]")).toHaveCount(left - 1);
    }
    await page.locator('[data-ac-empty] [data-act="ac-starter"]').click();
    await expect(sheet.locator("h2")).toHaveText("Add the common typo fixes?");
    await expect(sheet.locator('[data-ac-way="add"] [data-ac-line="new"]')).toContainText("new replacements");
    await sheet.locator('[data-act="ac-import-add"]').click();
    await expect(sheet).toHaveCount(0);
    await expect(item(page, "tomorrow")).toHaveCount(1);
    await expect.poll(async () => Number((await count(page).textContent()).split(" ")[0])).toBeGreaterThan(190);
    // One undo takes the whole import back.
    await page.locator('.rail [data-act="undo"]').click();
    await expect(count(page)).toHaveText("0 replacements · 0 inputs");
});
