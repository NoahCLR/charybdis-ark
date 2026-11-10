// @ts-check
/**
 * @typedef {import("../../contracts/panel.js").PublishedModel | null} Model
 * @typedef {import("../../contracts/panel.js").AutocorrectEntry} Entry
 * @typedef {import("../../contracts/edits.js").AutocorrectEdit} Edit
 * @typedef {NonNullable<NonNullable<Model>["autocorrect"]>} List
 * @typedef {NonNullable<import("../state.js").PanelState["autocorrectNew"]>} Fresh
 * @typedef {{kind: "text" | "macro", text: string, macro: number | null}} Named a replacement as a form holds it
 */
// Text replacement: what the keyboard replaces as a word ends (firmware
// D-F68, where the feature is autocorrect, a replacement a correction and an
// input a typo; the code keeps those names). Its switch is a Host setting, as
// every switch is a Settings screen's, and a banner says so while it is off
// (D-L87).
//
// The screen is a bank beside an editor, as Macros, Custom keys and Pointing
// modes are (D-L88). The bank lists the replacements, each with its inputs
// under it, with a search, New replacement, the list's files and its memory.
// The editor is the replacement picked: what it is (text, or a macro picked
// in the keycode picker), its inputs as chips, each written as its owner
// wrote it with `*` where other letters may go, and Try it. A chip opens to
// be written anew or removed; what removes is always written out, never a
// bare × (D-L88).
//
// New replacement opens an editor with nothing in the list behind it yet: a
// replacement always has an input, so it joins the list with its first one.
// One the list already has is offered to be opened instead.
//
// A list comes in from a file (QMK's text, a spreadsheet's CSV or Ark's JSON,
// D-L85), chosen or dropped on the screen, or from the starter list. The core
// reads it and says what it would do in a sheet, as a backup is compared
// before it is used; nothing changes until Add to my list or Replace my list
// is chosen. Export saves the list in any of the three.
//
// Try it is a box typed in as anywhere, which Ark never changes, and under
// it a preview: the core runs what was typed through the draft's list by the
// keyboard's rules (firmware autocorrect-v1.md) and the preview shows what
// the keyboard would type once the draft is applied (D-L86).
//
// What is typed is checked by the core against the draft as it stands, which
// answers with the refusal the edit would meet or what it would newly warn
// about; the edit itself is posted when it is kept, and the core has the
// last word on it.

import {el, esc, watchPressOutside} from "../lib/dom.mjs";
import {meterFill} from "./meter.mjs";
import {choiceField} from "./segmented.mjs";
import {topbar} from "./frame.mjs";
import {dialogFoot} from "./dialog-foot.mjs";
import {openPicker} from "./picker.mjs";
import {attachInfoMarks, infoMark} from "./info-mark.mjs";
import {titleText} from "./title-name.mjs";
import {settingOffBanner} from "./participation.mjs";
import {getModel, post, render, state} from "../store.mjs";
import {editGate} from "../view/edit-gate.mjs";
import {keyIdentity} from "../view/key-identity.mjs";
import {draftDot, draftMarks} from "../view/review.mjs";
import {SCREENS} from "../view/screens.mjs";
import {LIST_FILE_FORMATS, LIST_FILE_MAX_BYTES, LIST_FILE_TOO_LARGE, addedReplacement, autocorrectRows, bytesWords, countWords, importLines, inputTokens, joinedEntry, macroLabel,
    openEntry, replacementLabel, replacementOf, switchedOff, textCount, triedAfter, triedWords, usageShare, usageWords} from "../view/autocorrect.mjs";
import * as edits from "../view/edits.mjs";
import * as controls from "../view/controls.mjs";

// How it works, behind each section's info mark rather than written under
// it: what a replacement does and when, how an input is written, and what
// the preview can and cannot show.
const REPLACEMENT_INFO = infoMark({id: "ac-info-replacement", label: "How a replacement works", heading: "How a replacement works", rows: [
    {term: "When", says: "As you finish a word with a space, punctuation, Enter or Tab. A word you are still typing is never touched."},
    {term: "Capitals", says: "Follow what you typed: Teh becomes The, TEH becomes THE. A replacement written with capitals keeps them."},
    {term: "Backspace", says: "Right after a replacement, Backspace puts back what you typed. Not after Enter or Tab."},
    {term: "Text", says: "One line, up to 128 bytes: a word, a phone number, an address."},
    {term: "Macro", says: "For anything longer or on several lines. It plays for whole-word inputs only, keeps no capitals rule, and Backspace does not take it back."},
    {term: "Starting over", says: "A click, a shortcut or an arrow key starts a new word. The keyboard cannot see a password field or a terminal: turn text replacement off there."},
    {term: "On and off", says: "Settings → Host, or a key set to Text replacement on, off or toggle."}]});
const INPUTS_INFO = infoMark({id: "ac-info-inputs", label: "How inputs are written", heading: "How inputs are written", rows: [
    {term: "teh", mono: true, says: "The whole word only."},
    {term: "recieve*", mono: true, says: "The start of a word: also recieved, recieving."},
    {term: "*mnet", mono: true, says: "The end of a word: also developmnet, managemnet."},
    {term: "*tihng*", mono: true, says: "Anywhere in a word: also anytihng, tihngs."},
    {term: "Capitals", says: "Do not matter: teh also catches Teh and TEH."},
    {term: "Characters", says: "Letters, digits and apostrophes, up to 32 bytes."},
    {term: "Overlaps", says: "The longest input wins, and a whole word beats one with *."},
    {term: "Macros", says: "A replacement that plays a macro takes whole words only, without *."}]});
// A macro's mark before its name, where a replacement is named in one line.
const PLAYS = "▶";

/** @param {Model} model */
const identityOf = (model) => model?.autocorrectEditing?.identity;
/** @param {string} selector */
const focusLater = (selector) => queueMicrotask(() => /** @type {HTMLElement | null} */ (document.querySelector(selector))?.focus());
// Sets a field to what the state holds for it before a redraw, so the redraw
// does not put back text the screen has already taken (lib/focus.mjs keeps
// what is typed and not yet committed).
/** @param {HTMLInputElement} input @param {string} value */
const taken = (input, value) => { input.value = value; input.defaultValue = value; };
/** @param {Edit} edit */
const keep = (edit) => { state.error = ""; state.autocorrectCheck = null; post(edit); };
/** @param {Event} event */
const pressed = (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    // The read-only field naming a replacement's macro picks, as Pick… beside it does.
    const field = /** @type {HTMLInputElement | null} */ (target.closest("input[data-ac-macro]"));
    const button = /** @type {HTMLButtonElement | null} */ (field && !field.disabled ? field.parentElement?.querySelector('[data-act="ac-pick"]') : target.closest("button[data-act]"));
    return button && !button.disabled ? button : null;
};
// Opens a replacement's macro in Macros, from its editor's header as a
// macro's Place on a key → is.
/** @param {string | null} name */
const editMacroLink = (name) => name ? `<button class="btn tiny link" data-act="ac-edit-macro" data-tip="Open this macro in Macros, to see or change its steps.">Edit in Macros →</button>` : "";

// ── checking what is typed ──────────────────────────────────────────────

// The check in flight or answered, for the one field being typed in.
let nextCheck = 0;

// Asks the core what `edit` would meet, for the field named `form`.
/** @param {"replacement" | "input"} form @param {Edit | null} edit */
function check(form, edit) {
    if (!edit || !editGate(getModel(), "autocorrect").editable) { state.autocorrectCheck = null; paintFeedback(); return; }
    const requestId = ++nextCheck;
    // What the last answer said stands until this one comes, so the line
    // does not blink as each letter is typed; another field's is dropped.
    const last = state.autocorrectCheck?.form === form ? state.autocorrectCheck : null;
    state.autocorrectCheck = {form, requestId, error: "", warnings: last?.warnings || []};
    post(edits.autocorrectValidationMessage(edit, requestId));
    paintFeedback();
}

/** @param {Extract<import("../../contracts/messages.js").PanelResponse, {type: "autocorrectValidation"}>} message */
export function receiveAutocorrectValidation(message) {
    const asked = state.autocorrectCheck, draft = getModel()?.draft;
    if (!asked || asked.requestId !== message.requestId || message.draftId !== draft?.id || message.draftRevision !== draft?.revision) return;
    state.autocorrectCheck = {...asked, error: message.validation.error, warnings: message.validation.warnings};
    paintFeedback();
}

// The answer under the field it is for; the other field's line is emptied.
function paintFeedback() {
    const answer = state.autocorrectCheck;
    for (const line of /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll("[data-ac-feedback]"))) {
        const mine = answer && line.dataset.acFeedback === answer.form ? answer : null;
        line.hidden = !mine || (!mine.error && !mine.warnings.length);
        line.replaceChildren(...(!mine ? [] : mine.error ? [el(`<div class="unavailable">${esc(mine.error)}</div>`)]
            : mine.warnings.map((warning) => el(`<p class="note warn">${esc(warning)}</p>`))));
    }
}

// ── the screen ──────────────────────────────────────────────────────────

/** @type {(() => void) | null} */
let stopWatching = null;   // stops the open field's outside-press watch

export function screenAutocorrect() {
    const model = getModel(), list = model?.autocorrect;
    const gate = editGate(model, "autocorrect"), canEdit = gate.editable;
    const main = el(`<div class="main">${topbar("Text replacement", "Fixes typos and types longer text for you when you finish a word, on any computer.")}</div>`);
    const content = el(`<div class="content"><div class="pad library autocorrect"></div></div>`);
    const pad = /** @type {HTMLElement} */ (content.firstElementChild);
    main.appendChild(content);
    stopWatching?.();
    stopWatching = null;
    if (!list) {
        pad.classList.remove("library");
        pad.appendChild(el(`<div class="screen-stub"><h3>No replacements read</h3>
            <p class="note">${esc(gate.why || "Choose Read keyboard to read this keyboard's text replacements.")}</p></div>`));
        return main;
    }
    settle(model, list);
    // What heads the screen runs across both panes. A list that cannot be
    // edited now says nothing here, as Macros says nothing: its controls are
    // off, and the rail and the commit bar say why.
    const heads = el(`<div class="library-head stack"></div>`);
    if (switchedOff(model)) heads.appendChild(settingOffBanner("autocorrect", "The keyboard keeps this list and replaces nothing."));
    for (const notice of list.notices) heads.appendChild(el(`<div class="unavailable ac-notice" data-ac-notice>${esc(notice)} Change the host layout back, or edit the marked replacements.</div>`));
    if (heads.childElementCount) pad.appendChild(heads);

    const rows = autocorrectRows(list, {query: state.autocorrectSearch || "", macros: model?.macros});
    const fresh = state.autocorrectNew?.shown ? state.autocorrectNew : null;
    const entry = fresh ? null : openEntry(list, rows, state.autocorrectEntry);
    pad.append(bank(model, list, rows, entry, canEdit),
        fresh ? newEditor(model, list, fresh, canEdit) : entry ? entryEditor(model, list, entry, canEdit) : emptyEditor(canEdit),
        el(`<div class="ac-drop" aria-hidden="true"><span>Drop a .txt, .csv or .json list to import it</span></div>`));
    takesDrops(pad);
    if (state.autocorrectImport) main.appendChild(importSheet(list, canEdit));
    queueMicrotask(paintFeedback);
    queueMicrotask(paintTry);
    queueMicrotask(() => watchOpenField(pad));
    // The field that adds inputs is open to be typed in: after the list takes
    // one, it is where the next goes.
    if (state.autocorrectEdit?.part === "more" && !state.autocorrectEdit.sent && !state.autocorrectImport) focusLater("[data-ac-more]");
    return main;
}

// What the core's answer leaves of the forms. A new replacement the list took
// is the entry open from then on, with the field for its next input ready. An
// edit it took closes the field it came from, but for the field that adds
// inputs, which stays for the next one; an entry whose replacement changed is
// followed to where it is now. An edit it refused keeps what was typed.
/** @param {Model} model @param {List} list */
function settle(model, list) {
    const fresh = state.autocorrectNew, editing = state.autocorrectEdit, identity = identityOf(model) || "";
    if (fresh?.sent && fresh.sent !== identity) {
        const made = joinedEntry(list, fresh);
        state.autocorrectNew = null;
        state.autocorrectCheck = null;
        if (made) Object.assign(state, {autocorrectEntry: made.id, autocorrectEdit: {entry: made.id, part: "more"}});
    } else if (fresh?.sent && state.error) state.autocorrectNew = {...fresh, sent: undefined};
    if (editing?.sent && editing.sent !== identity) {
        const now = editing.follow ? joinedEntry(list, editing.follow) : list.entries.find((entry) => entry.id === editing.entry);
        if (now && state.autocorrectEntry === editing.entry) state.autocorrectEntry = now.id;
        state.autocorrectEdit = editing.part === "more" && now ? {entry: now.id, part: "more"} : null;
        state.autocorrectCheck = null;
    } else if (editing?.sent && state.error) state.autocorrectEdit = {...editing, sent: undefined};
    // An entry that is gone has nothing open.
    if (state.autocorrectEdit && !list.entries.some((entry) => entry.id === state.autocorrectEdit?.entry)) state.autocorrectEdit = null;
}

// A field open in the editor closes at a press outside it, and the Export
// menu at one outside the menu.
/** @param {HTMLElement} pad */
function watchOpenField(pad) {
    const open = /** @type {HTMLElement[]} */ ([...pad.querySelectorAll("[data-ac-open], [data-ac-menu]")]);
    if (!open.length) return;
    stopWatching?.();
    stopWatching = watchPressOutside(open, () => {
        stopWatching?.();
        stopWatching = null;
        // A field left with something in it is kept as it is left, which its
        // own change says; the press only closes what is open.
        const active = document.activeElement;
        if (active instanceof HTMLInputElement && active.closest("[data-ac-open]") && active.value !== active.defaultValue) return;
        state.autocorrectEdit = state.autocorrectEdit?.part === "kind" ? state.autocorrectEdit : null;
        state.autocorrectExport = false;
        state.autocorrectCheck = null;
        // The press is whatever it lands on's to answer first, a control on
        // this screen or the rail: redrawing now would take it from under
        // the click, so the redraw waits for the click to be heard.
        document.addEventListener("click", () => render(), {once: true});
    });
}

// ── the bank ────────────────────────────────────────────────────────────

/** @param {Model} model @param {Pick<Entry, "correction" | "macro">} entry */
const oneLine = (model, entry) => `${entry.macro === undefined ? "" : `${PLAYS} `}${replacementLabel(entry, model?.macros)}`;

// The entry picked in the bank is the one open; a new replacement with
// nothing in it yet is let go, one begun waits at the top of the list.
/** @param {string} id */
function openInEditor(id) {
    const fresh = state.autocorrectNew;
    Object.assign(state, {autocorrectEntry: id, autocorrectEdit: null, autocorrectCheck: null,
        autocorrectNew: fresh && addedReplacement(fresh) ? {...fresh, shown: false} : null});
    render();
}

function openNew() {
    const fresh = state.autocorrectNew || {kind: /** @type {const} */ ("text"), text: "", macro: null, shown: true};
    Object.assign(state, {autocorrectNew: {...fresh, shown: true}, autocorrectEdit: null, autocorrectCheck: null});
    render();
    focusLater("[data-ac-new] [data-ac-text], [data-ac-new] [data-act=\"ac-pick\"]");
}

/** @param {Model} model @param {List} list @param {ReturnType<typeof autocorrectRows>} rows @param {Entry | null} open @param {boolean} canEdit */
function bank(model, list, rows, open, canEdit) {
    const query = state.autocorrectSearch || "", fresh = state.autocorrectNew;
    const changed = draftMarks(model?.draft?.changes).autocorrect;
    const off = canEdit ? "" : "disabled", none = list.entries.length ? "" : "disabled";
    const menu = state.autocorrectExport;
    const card = el(`<div class="card bank" data-ac-bank><div class="card-h"><h3>Replacements</h3>
            <input class="input search card-search" id="replacementSearch" data-f="autocorrect:search" type="search" aria-label="Search replacements and inputs" placeholder="Search replacements and inputs" value="${esc(query)}">
            <span class="tag" data-ac-usage data-tip="The keyboard holds ${esc(list.usage.maxTypos.toLocaleString("en-US"))} inputs across all replacements.">${esc(usageWords(list.usage))}</span></div>
        <div class="card-b">
            <div class="macro-grid ac-bank" role="list" aria-label="Replacements"></div>
            <button type="button" class="mslot new-slot ac-new" data-act="ac-add" ${off} data-tip="Make a replacement: its text or macro, then what you type for it."><span class="v">+ New replacement</span></button>
            <div class="row ac-files">
                <button class="btn tiny" data-act="ac-import" ${off} data-tip="A .txt file in QMK's form, a .csv from a spreadsheet, or a .json Ark exported. You can also drop one on this screen.">Import…</button>
                <div class="ac-export" ${menu ? "data-ac-menu" : ""}><button class="btn tiny" id="ac-export" data-act="ac-export-menu" aria-haspopup="menu" aria-expanded="${menu ? "true" : "false"}" ${none}
                        data-tip="Save this list as a file: QMK's text, a spreadsheet's CSV, or Ark's JSON.">Export</button>
                    ${menu ? `<div class="rail-menu ac-menu" role="menu" aria-labelledby="ac-export">${LIST_FILE_FORMATS.map((format) =>
                        `<button class="rail-menu-item" role="menuitem" tabindex="-1" data-act="ac-export" data-format="${esc(format)}">${esc(format === "txt" ? "Text (QMK)" : format.toUpperCase())}</button>`).join("")}</div>` : ""}</div>
            </div>
            <p class="note profile-drop-status" data-ac-file-status role="status" hidden></p>
            <div class="sect-h memory-h"><h4>Text replacement memory</h4><span class="right note" data-ac-memory>${esc(bytesWords(list.usage))}</span></div>
            <div class="meter" data-ac-meter data-tip="Part of the profile, within its own limit. The bar shows the fullest of its inputs, its text and its bytes.">${meterFill(usageShare(list.usage))}</div>
            <p class="note meter-note"><span data-ac-count>${esc(countWords(list.usage))}</span>. Text uses its UTF-8 bytes: a replacement holds up to ${esc(list.usage.correctionMax)}, an input up to ${esc(list.usage.textMax)}.</p>
        </div></div>`);
    const cells = /** @type {HTMLElement} */ (card.querySelector(".ac-bank"));
    /** @type {HTMLInputElement} */ (card.querySelector("#replacementSearch")).addEventListener("input", (event) => { state.autocorrectSearch = /** @type {HTMLInputElement} */ (event.target).value; render(); });
    if (fresh) {
        const named = addedReplacement(fresh);
        const cell = el(`<button type="button" class="mslot ac-item" role="listitem" data-ac-new-item aria-current="${esc(fresh.shown)}">
            <span class="v">${esc(named ? oneLine(model, {correction: fresh.text.trim(), macro: fresh.kind === "macro" ? fresh.macro ?? undefined : undefined}) : "New replacement")}</span>
            <span class="n">not on your list yet</span></button>`);
        cell.addEventListener("click", openNew);
        cells.appendChild(cell);
    }
    for (const row of rows) cells.appendChild(item(model, row, row.entry.id === open?.id, changed.has(row.entry.id)));
    if (!rows.length && query.trim()) cells.appendChild(el(`<p class="note" data-ac-none>No replacement or input matches “${esc(query.trim())}”.</p>`));
    if (!cells.childElementCount) cells.remove();
    card.addEventListener("click", (event) => {
        const button = pressed(event);
        if (!button) return;
        const act = button.dataset.act;
        if (act === "ac-add") openNew();
        else if (act === "ac-import") previewImport("choose");
        else if (act === "ac-export-menu") { state.autocorrectExport = !state.autocorrectExport; render(); focusLater(state.autocorrectExport ? ".ac-menu [role=menuitem]" : "#ac-export"); }
        else if (act === "ac-export") { state.autocorrectExport = false; post(controls.exportAutocorrect(/** @type {typeof LIST_FILE_FORMATS[number]} */ (button.dataset.format))); render(); focusLater("#ac-export"); }
    });
    // The menu is a menu from the keyboard, as the rail's is: the arrows,
    // Home and End move, Escape and Tab close.
    card.querySelector(".ac-export")?.addEventListener("keydown", (event) => {
        const key = /** @type {KeyboardEvent} */ (event).key;
        const items = /** @type {HTMLElement[]} */ ([...card.querySelectorAll(".ac-menu [role=menuitem]")]);
        if (!items.length) return;
        const at = items.indexOf(/** @type {HTMLElement} */ (document.activeElement));
        const step = /** @type {Record<string, number>} */ ({ArrowDown: 1, ArrowUp: -1})[key];
        if (step) items[(at + step + items.length) % items.length].focus();
        else if (key === "Home") items[0].focus();
        else if (key === "End") items[items.length - 1].focus();
        else if (key === "Escape" || key === "Tab") { state.autocorrectExport = false; render(); focusLater("#ac-export"); }
        else return;
        event.preventDefault();
        event.stopPropagation();
    });
    return card;
}

// A replacement in the bank: its text, or its macro by name, on one line,
// with its inputs under it. An input a search found is marked.
/** @param {Model} model @param {ReturnType<typeof autocorrectRows>[number]} row @param {boolean} open @param {boolean} changed */
function item(model, {entry, found}, open, changed) {
    const label = replacementLabel(entry, model?.macros);
    const warned = entry.warnings.length > 0 || entry.typos.some((typo) => typo.warnings.length);
    const tip = `${entry.macro === undefined ? label : `Plays the macro “${label}”`} · typed as ${entry.typos.map((typo) => typo.input).join(", ")}${warned ? " · has a warning" : ""}`;
    const cell = el(`<button type="button" class="mslot filled ac-item ${warned ? "caution" : ""}" role="listitem" data-ac-entry="${esc(entry.id)}" aria-current="${esc(open)}" data-tip="${esc(tip)}">
        <span class="v">${esc(oneLine(model, entry))}</span>${changed ? draftDot(model?.draft, "corner") : ""}
        <span class="n">${entry.typos.map((typo) => `<span ${found.includes(typo.typo) ? `class="found"` : ""} data-ac-input="${esc(typo.typo)}">${esc(typo.input)}</span>`).join(" ")}</span></button>`);
    cell.addEventListener("click", () => openInEditor(entry.id));
    return cell;
}

// ── the editor ──────────────────────────────────────────────────────────

const ICON = `<span class="mark-lg"><span class="kind-icon plain" aria-hidden="true">${SCREENS.autocorrect.icon}</span></span>`;

// What a replacement is: Text or Macro, then its text with the bytes it may
// hold, or its macro named in a read-only field with Pick… beside it, as a
// custom key's shortcut is: the keycode picker on the macros alone. Opening
// the macro in Macros is the header's link. `f` names the fields' form
// identities.
/** @param {Model} model @param {string} f @param {Named} value @param {boolean} canEdit @param {number} most */
function replacementControls(model, f, value, canEdit, most) {
    const off = canEdit ? "" : "disabled", macros = model?.macros || [];
    const count = textCount(value.text, most);
    const name = value.macro === null ? "" : macroLabel(macros, value.macro);
    return `<div class="ac-replacement">${choiceField({label: "Replacement is", f: `${f}:kind`, hideLabel: true, disabled: !canEdit, choices: [["text", "Text"], ["macro", "Macro"]], current: value.kind,
        tip: "Text is one line the keyboard types. A macro is for anything longer, or of more than one line."})}
        ${value.kind === "macro" ? `<div class="input-row ac-macro">
                <input class="input" data-ac-macro="${esc(value.macro ?? "")}" aria-label="Macro" value="${esc(name ? `${PLAYS} ${name}` : "")}" placeholder="No macro yet" readonly ${off}
                    data-tip="${esc(name ? `Plays the macro “${name}”.` : "Pick the macro this replacement plays.")}">
                <button type="button" class="btn" data-act="ac-pick" ${canEdit && (value.macro !== null || macros.some((macro) => !macro.empty)) ? "" : "disabled"}>Pick…</button></div>
            ${value.macro === null && !macros.some((macro) => !macro.empty) ? `<p class="note ac-macro-none">No macro has steps yet. <button type="button" class="btn tiny link" data-act="ac-macros">Make one in Macros →</button></p>` : ""}`
        : `<label class="field ac-text"><span class="sr">Replacement text</span>
            <input class="input" data-f="${esc(f)}:replacement" data-ac-text autocomplete="off" spellcheck="false" placeholder="because, or +31 6 1234 5678" value="${esc(value.text)}" ${off}
                data-tip="One line of up to ${esc(most)} bytes: a word, a phone number, a sign-off.">
            <span class="note ac-bytes${count.over ? " warn" : ""}" data-ac-bytes>${esc(count.label)}</span></label>`}</div>`;
}

// The counter under a replacement's text follows each keystroke.
/** @param {HTMLElement} card @param {number} most */
function countsBytes(card, most) {
    card.addEventListener("input", (event) => {
        const input = /** @type {HTMLInputElement} */ (event.target), counter = card.querySelector("[data-ac-bytes]");
        if (!input.matches("[data-ac-text]") || !counter) return;
        const count = textCount(input.value, most);
        counter.textContent = count.label;
        counter.classList.toggle("warn", count.over);
    });
}

// Pick… for a replacement's macro: the keycode picker, offering the macros
// that have steps and nothing else, each by its name; an empty macro would
// play nothing. The one already picked stays offered.
/** @param {Model} model @param {number | null} slot @param {string} context @param {(slot: number) => void} then */
function pickMacro(model, slot, context, then) {
    const macros = model?.macros || [];
    openPicker({title: "Replacement", context, seed: slot === null || !macros[slot] ? [] : [macros[slot].keycode], mode: "list", maxKeys: 1,
        allowedKeys: macros.filter((macro, at) => !macro.empty || at === slot).map((macro) => macro.keycode),
        onPick: (expression) => {
            const now = getModel()?.macros || [];
            const picked = now.findIndex((macro) => macro.keycode === expression || keyIdentity(getModel(), macro.keycode).name === expression);
            if (picked >= 0) then(picked);
        }});
}

/** @param {Model} model @param {number} slot */
function showMacro(model, slot) {
    const macro = model?.macros?.[slot];
    Object.assign(state, {screen: "macros", ...(macro ? {macroSlot: macro.keycode} : {})});
    render();
}

// A replacement the list has, open: its header, what it is, its inputs, and
// Try it.
/** @param {Model} model @param {List} list @param {Entry} entry @param {boolean} canEdit */
function entryEditor(model, list, entry, canEdit) {
    const label = replacementLabel(entry, model?.macros), off = canEdit ? "" : "disabled";
    const editing = state.autocorrectEdit?.entry === entry.id ? state.autocorrectEdit : null;
    const stored = entry.macro === undefined ? "text" : "macro";
    const kind = editing?.kind ?? stored;
    // Text or Macro picked and not yet kept shows that kind's field empty.
    const value = {kind, text: kind === stored ? entry.correction : "", macro: kind === stored ? entry.macro ?? null : null};
    const card = el(`<div class="card ac-editor" data-ac-editor="${esc(entry.id)}">
        <div class="card-h name-titlebar">${ICON}${titleText(label)}
            <span class="tag" data-ac-kind>${entry.macro === undefined ? "Text" : "Macro"}</span>
            <span class="right row actions">
                ${editMacroLink(kind === "macro" && value.macro !== null ? macroLabel(model?.macros || [], value.macro) : null)}
                <button class="btn tiny ghost destructive" data-act="ac-delete" ${off} data-tip="Delete this replacement and its inputs. Undo takes it back.">Delete replacement</button></span></div>
        <div class="card-b stack">
            <div class="macro-sequence-heading"><h4>Replacement</h4>${REPLACEMENT_INFO}</div>
            ${replacementControls(model, `autocorrect:entry:${entry.id}`, value, canEdit, list.usage.correctionMax)}
            ${entry.warnings.map((warning) => `<p class="note warn" data-ac-warning>${esc(warning)}</p>`).join("")}
            <div data-ac-feedback="replacement" hidden></div>
            <div class="macro-sequence-heading"><h4>Inputs</h4>${INPUTS_INFO}</div>
            <div class="ac-inputs" role="list" aria-label="Inputs">
                ${entry.typos.map((typo) => editing?.part === "input" && editing.typo === typo.typo
                    ? `<span class="ac-chip-edit" role="listitem" data-ac-open data-ac-chip-edit="${esc(typo.typo)}">
                        <input class="input mono ac-chip-input" data-f="autocorrect:entry:${esc(entry.id)}:input:${esc(typo.typo)}" data-ac-input-text aria-label="The input ${esc(typo.input)}"
                            autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(typo.input)}" ${off}>
                        <button type="button" class="btn tiny ghost destructive" data-act="ac-remove-input" ${off}
                            data-tip="${entry.typos.length === 1 ? "Its only input: removing it deletes the replacement. Undo takes it back." : "Remove this input. Undo takes it back."}">Remove</button></span>`
                    : `<button type="button" class="chip mono ac-chip ${typo.warnings.length ? "warn" : ""}" role="listitem" data-act="ac-chip" data-ac-chip="${esc(typo.typo)}" ${off}
                        aria-label="The input ${esc(typo.input)}: edit or remove it" data-tip="${esc(typo.warnings.length ? typo.warnings.join(" ") : "Click to write it anew, or to remove it.")}">${esc(typo.input)}</button>`).join("")}
                ${editing?.part === "more"
                    ? `<input class="input mono ac-chip-input" data-f="autocorrect:entry:${esc(entry.id)}:more" data-ac-more data-ac-open aria-label="Another input for ${esc(label)}"
                        autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="type it, then Enter" value="" ${off}>`
                    : `<button type="button" class="chip ac-more" data-act="ac-more" ${off} data-tip="Something else you type for this replacement.">+ Input</button>`}
            </div>
            ${entry.typos.map((typo) => typo.warnings.map((warning) => `<p class="note warn" data-ac-warning="${esc(typo.typo)}"><span class="mono">${esc(typo.input)}</span> ${esc(warning)}</p>`).join("")).join("")}
            <div data-ac-feedback="input" hidden></div>
        </div></div>`);
    /** @type {HTMLElement} */ (card.querySelector(".card-b")).appendChild(trySection(model, list));
    attachInfoMarks(card);
    countsBytes(card, list.usage.correctionMax);
    const identity = () => identityOf(getModel());
    const target = replacementOf(entry);
    /** @param {NonNullable<typeof state.autocorrectEdit>["part"]} part @param {Partial<NonNullable<typeof state.autocorrectEdit>>} [more] */
    const open = (part, more = {}) => { state.autocorrectEdit = {entry: entry.id, part, ...more}; state.autocorrectCheck = null; render(); };
    const close = () => { state.autocorrectEdit = null; state.autocorrectCheck = null; render(); };
    /** @param {Edit} edit @param {Named} [follow] */
    const send = (edit, follow) => {
        state.autocorrectEdit = {.../** @type {NonNullable<typeof state.autocorrectEdit>} */ (state.autocorrectEdit ?? {entry: entry.id, part: "kind"}), sent: identity() || "", ...(follow ? {follow} : {})};
        keep(edit);
    };
    const typed = editing?.part === "input" ? entry.typos.find((typo) => typo.typo === editing.typo) : undefined;
    // What a field would post as it stands, or nothing while it holds what
    // the list already has.
    /** @param {HTMLInputElement} input @returns {Edit | null} */
    const editOf = (input) => {
        const value = input.value;
        if (input.matches("[data-ac-text]")) return value.trim() && (entry.macro !== undefined || value.trim() !== entry.correction) ? edits.changeAutocorrectReplacement(target, {correction: value}, identity()) : null;
        if (input.matches("[data-ac-more]")) return inputTokens(value).length ? edits.addAutocorrectInputs(target, inputTokens(value), identity()) : null;
        if (input.matches("[data-ac-input-text]")) return typed && value.trim() && value.trim() !== typed.input ? edits.changeAutocorrectInput(typed.typo, {to: value}, identity()) : null;
        return null;
    };
    // Remove takes precedence over the change that leaving its field causes.
    let removing = false;
    card.addEventListener("pointerdown", (event) => { removing = Boolean(/** @type {Element} */ (event.target).closest('[data-act="ac-remove-input"]')); });
    card.addEventListener("input", (event) => {
        const input = /** @type {HTMLInputElement} */ (event.target);
        if (input.matches("[data-ac-text]")) check("replacement", editOf(input));
        else if (input.matches("[data-ac-more], [data-ac-input-text]")) check("input", editOf(input));
    });
    // A field is kept when it is left or Enter is pressed in it; a choice as
    // soon as it is made.
    card.addEventListener("change", (event) => {
        const input = /** @type {HTMLInputElement} */ (event.target);
        if (input.matches('[type=radio][name$=":kind"]')) {
            const picked = input.value === "macro" ? "macro" : "text";
            if (picked === stored) close(); else open("kind", {kind: picked});
            focusLater(`[data-ac-editor] [data-ac-text], [data-ac-editor] [data-act="ac-pick"]`);
            return;
        }
        if (!input.matches("[data-ac-text], [data-ac-more], [data-ac-input-text]") || removing) return;
        const edit = editOf(input);
        if (!edit) { if (input.matches("[data-ac-input-text]")) close(); return; }
        if (input.matches("[data-ac-text]")) send(edit, {kind: "text", text: input.value, macro: null});
        else send(edit);
        // The field that adds inputs is ready for the next one.
        if (input.matches("[data-ac-more]")) taken(input, "");
    });
    card.addEventListener("keydown", (event) => {
        const input = /** @type {HTMLInputElement} */ (event.target);
        if (!input.matches("[data-ac-text], [data-ac-more], [data-ac-input-text]")) return;
        if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            taken(input, input.defaultValue);
            const back = input.matches("[data-ac-more]") ? `[data-ac-editor] [data-act="ac-more"]` : typed ? `[data-ac-chip="${CSS.escape(typed.typo)}"]` : "";
            if (!back) { check("replacement", null); input.blur(); return; }
            close();
            focusLater(back);
        } else if (event.key === "Enter") {
            event.preventDefault();
            // An empty field for another input is done with.
            if (input.matches("[data-ac-more]") && !input.value.trim()) { close(); focusLater(`[data-ac-editor] [data-act="ac-more"]`); return; }
            // Leaving the field keeps it, once, as the browser tells it.
            input.blur();
            if (input.matches("[data-ac-more]")) input.focus();
        }
    });
    card.addEventListener("click", (event) => {
        const button = pressed(event);
        if (!button) return;
        const act = button.dataset.act;
        if (act === "ac-pick") pickMacro(model, value.macro, label, (slot) => {
            if (slot === entry.macro) { close(); return; }
            send(edits.changeAutocorrectReplacement(target, {macro: slot}, identity()), {kind: "macro", text: "", macro: slot});
        });
        else if (act === "ac-edit-macro" && value.macro !== null) showMacro(model, value.macro);
        else if (act === "ac-macros") showMacro(model, -1);
        else if (act === "ac-more") { open("more"); focusLater("[data-ac-more]"); }
        else if (act === "ac-chip") { open("input", {typo: button.dataset.acChip || ""}); focusLater("[data-ac-input-text]"); }
        else if (act === "ac-remove-input" && typed) { state.autocorrectEdit = null; keep(edits.deleteAutocorrectTypo(typed.typo, identity())); }
        else if (act === "ac-delete") { state.autocorrectEdit = null; keep(edits.deleteAutocorrectEntry(target, identity())); }
    });
    return card;
}

// A replacement being made: what it is, then its first input, which is what
// puts it on the list. One the list already has is offered to be opened.
/** @param {Model} model @param {List} list @param {Fresh} fresh @param {boolean} canEdit */
function newEditor(model, list, fresh, canEdit) {
    const off = canEdit ? "" : "disabled";
    const current = () => /** @type {Fresh} */ (state.autocorrectNew);
    const joins = joinedEntry(list, fresh), named = addedReplacement(fresh);
    const empty = fresh.kind === "macro" && fresh.macro !== null && model?.macros?.[fresh.macro]?.empty;
    const card = el(`<div class="card ac-editor" data-ac-editor data-ac-new>
        <div class="card-h name-titlebar">${ICON}${titleText("New replacement")}
            <span class="tag">Not on your list yet</span>
            <span class="right row actions">
                ${editMacroLink(fresh.kind === "macro" && fresh.macro !== null ? macroLabel(model?.macros || [], fresh.macro) : null)}
                <button class="btn tiny ghost destructive" data-act="ac-discard" data-tip="Let this new replacement go. Nothing was added to your list.">Discard</button></span></div>
        <div class="card-b stack">
            <div class="macro-sequence-heading"><h4>Replacement</h4>${REPLACEMENT_INFO}</div>
            ${replacementControls(model, "autocorrect:new", fresh, canEdit, list.usage.correctionMax)}
            ${empty ? `<p class="note warn" data-ac-warning>“${esc(macroLabel(model?.macros, /** @type {number} */ (fresh.macro)))}” has no steps, so this replacement would do nothing yet. Add steps in Macros, or pick another macro.</p>` : ""}
            <div data-ac-feedback="replacement" hidden></div>
            ${joins ? `<div class="callout ac-joins" data-ac-joins><span>${esc(fresh.kind === "macro" ? `The macro “${replacementLabel(joins, model?.macros)}”` : `“${replacementLabel(joins, model?.macros)}”`)} is already on your list. Add inputs to it there.</span>
                    <button type="button" class="btn tiny" data-act="ac-open-joined">Open it</button></div>` : `
            <div class="macro-sequence-heading"><h4>Inputs</h4>${INPUTS_INFO}</div>
            <div class="pd-chips ac-inputs">
                <input class="input mono ac-chip-input" data-f="autocorrect:new:input" data-ac-first aria-label="What you type for it" autocomplete="off" autocapitalize="off" spellcheck="false"
                    placeholder="${fresh.kind === "macro" ? "sig, then Enter" : "becuase becasue, then Enter"}" value="" ${canEdit && named ? "" : "disabled"}>
            </div>
            <p class="note">It joins your list with its first input.</p>
            <div data-ac-feedback="input" hidden></div>`}
        </div></div>`);
    /** @type {HTMLElement} */ (card.querySelector(".card-b")).appendChild(trySection(model, list));
    attachInfoMarks(card);
    countsBytes(card, list.usage.correctionMax);
    const first = /** @type {HTMLInputElement | null} */ (card.querySelector("[data-ac-first]"));
    // The edit the editor would post as it stands, or null while it lacks a part.
    const addEdit = () => {
        const replacement = addedReplacement(current()), inputs = inputTokens(first?.value || "");
        return replacement && inputs.length ? edits.addAutocorrectInputs(replacement, inputs, identityOf(getModel())) : null;
    };
    const discard = () => { Object.assign(state, {autocorrectNew: null, autocorrectCheck: null}); render(); focusLater('[data-act="ac-add"]'); };
    card.addEventListener("input", (event) => {
        const input = /** @type {HTMLInputElement} */ (event.target);
        if (input.matches("[data-ac-text]")) {
            state.autocorrectNew = {...current(), text: input.value};
            // Whether the list has it already, and whether it can take an
            // input yet, are said as it is typed.
            const joined = Boolean(joinedEntry(list, current()));
            if (joined !== Boolean(joins)) { taken(input, input.value); render(); return; }
            if (first) first.disabled = !canEdit || !addedReplacement(current());
            /** @type {HTMLElement | null} */ (document.querySelector("[data-ac-new-item] .v"))?.replaceChildren(input.value.trim() || "New replacement");
            check("input", addEdit());
        } else if (input === first) check("input", addEdit());
    });
    card.addEventListener("change", (event) => {
        const input = /** @type {HTMLInputElement} */ (event.target);
        if (!input.matches('[type=radio][name$=":kind"]')) return;
        state.autocorrectNew = {...current(), kind: input.value === "macro" ? "macro" : "text"};
        state.autocorrectCheck = null;
        render();
        focusLater(`[data-ac-new] [data-ac-text], [data-ac-new] [data-act="ac-pick"]`);
    });
    card.addEventListener("keydown", (event) => {
        const input = /** @type {HTMLInputElement} */ (event.target);
        if (event.key === "Enter" && input.matches("[data-ac-text]")) { event.preventDefault(); first?.focus(); }
        else if (event.key === "Enter" && input === first) {
            event.preventDefault();
            const edit = addEdit();
            if (!edit || state.autocorrectCheck?.error) return;
            state.autocorrectNew = {...current(), sent: identityOf(getModel()) || ""};
            taken(first, "");
            keep(edit);
        } else if (event.key === "Escape" && input.matches("[data-ac-text], [data-ac-first]") && !addedReplacement(current()) && !first?.value) { event.preventDefault(); discard(); }
    });
    card.addEventListener("click", (event) => {
        const button = pressed(event);
        if (!button) return;
        const act = button.dataset.act;
        if (act === "ac-pick") pickMacro(model, fresh.macro, "New replacement", (slot) => {
            state.autocorrectNew = {...current(), macro: slot};
            state.autocorrectCheck = null;
            render();
            focusLater("[data-ac-first], [data-act=\"ac-open-joined\"]");
        });
        else if (act === "ac-edit-macro" && fresh.macro !== null) showMacro(model, fresh.macro);
        else if (act === "ac-macros") showMacro(model, -1);
        else if (act === "ac-open-joined" && joins) { state.autocorrectNew = null; openInEditor(joins.id); focusLater('[data-ac-editor] [data-act="ac-more"]'); }
        else if (act === "ac-discard") discard();
    });
    return card;
}

// With no replacements, the editor's place says what one is and offers the
// ways to a first list, the starter list first.
/** @param {boolean} canEdit */
function emptyEditor(canEdit) {
    const off = canEdit ? "" : "disabled";
    const card = el(`<div class="card ac-editor" data-ac-editor><div class="card-b">
        <div class="macro-empty" data-ac-empty><span class="macro-empty-mark" aria-hidden="true">+</span>
            <strong>Your replacements start here</strong>
            <p class="note">Text the keyboard types for you when you finish a word: <span class="mono">the</span> for <span class="mono">teh</span>, your phone number for <span class="mono">pnumber</span>, or a macro for anything longer.</p>
            <div class="row ac-empty-actions">
                <button class="btn primary" data-act="ac-starter" ${off} data-tip="Fixes for about 200 common English typos, each a whole word. You see what it adds before anything changes.">Add common typo fixes</button>
                <button class="btn" data-act="ac-add" ${off}>+ New replacement</button>
                <button class="btn" data-act="ac-import" ${off}>Import…</button>
            </div></div></div></div>`);
    card.addEventListener("click", (event) => {
        const button = pressed(event);
        if (!button) return;
        if (button.dataset.act === "ac-starter") previewImport("starter");
        else if (button.dataset.act === "ac-add") openNew();
        else previewImport("choose");
    });
    return card;
}

// ── try it ──────────────────────────────────────────────────────────────

let nextTry = 0;
/** @param {Model} model */
const draftOf = (model) => `${model?.draft?.id ?? ""}:${model?.draft?.revision ?? ""}`;

// Asks the core what the keyboard would leave on screen for what the box
// holds: the text that was there, then what was typed after it.
function askTry() {
    const tried = state.autocorrectTry;
    if (!tried.before && !tried.typed) { state.autocorrectTry = {...tried, shown: "", fired: [], marks: [], undone: false, error: "", requestId: 0}; paintTry(); return; }
    const requestId = ++nextTry;
    state.autocorrectTry = {...tried, requestId};
    post(controls.tryAutocorrect(tried, requestId));
}

/** @param {Extract<import("../../contracts/messages.js").PanelResponse, {type: "autocorrectTry"}>} message */
export function receiveAutocorrectTry(message) {
    const tried = state.autocorrectTry, model = getModel();
    if (tried.requestId !== message.requestId || message.draftId !== model?.draft?.id || message.draftRevision !== model?.draft?.revision) return;
    state.autocorrectTry = {...tried, draft: draftOf(model), error: message.error || "",
        ...(message.result ? {shown: message.result.text, fired: message.result.fired, marks: message.result.marks, undone: message.result.undone} : {})};
    paintTry();
}

// The preview shows what the keyboard would leave, each replaced part marked
// and saying on hover what it replaced; the line under it says what fired
// last, and that replacement is marked in the bank, with its input in the
// editor when it is the one open; otherwise the line offers to open it. The
// box itself is the person's: nothing here writes to it.
function paintTry() {
    const tried = state.autocorrectTry, macros = getModel()?.macros;
    const preview = /** @type {HTMLElement | null} */ (document.querySelector("[data-ac-try-preview]"));
    if (!preview) return;
    let at = 0;
    /** @type {(string | HTMLElement)[]} */
    const parts = [];
    for (const mark of tried.marks) {
        if (mark.start < at || mark.end <= mark.start) continue;
        parts.push(tried.shown.slice(at, mark.start), el(`<mark class="ac-replaced" data-ac-replaced="${esc(mark.entry)}" tabindex="0"
            data-tip="${esc(triedWords({fired: [mark], undone: false}, macros))}">${esc(tried.shown.slice(mark.start, mark.end))}</mark>`));
        at = mark.end;
    }
    parts.push(tried.shown.slice(at));
    preview.replaceChildren(...(tried.shown ? parts : [el(`<span class="note">Nothing typed yet.</span>`)]));
    const last = tried.fired.at(-1);
    const said = /** @type {HTMLElement} */ (document.querySelector("[data-ac-try-said]"));
    said.textContent = tried.error || triedWords(tried, macros);
    said.classList.toggle("warn", Boolean(tried.error));
    for (const row of /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll("[data-ac-bank] [data-ac-entry]"))) row.classList.toggle("fired", Boolean(last) && row.dataset.acEntry === last?.entry);
    const open = /** @type {HTMLElement | null} */ (document.querySelector("[data-ac-editor]"))?.dataset.acEditor;
    for (const chip of /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll("[data-ac-editor] [data-ac-chip]"))) chip.classList.toggle("fired", Boolean(last) && open === last?.entry && chip.dataset.acChip === last?.typo);
    const show = /** @type {HTMLButtonElement} */ (document.querySelector('[data-act="ac-try-show"]'));
    show.hidden = !last || tried.undone || open === last.entry || !getModel()?.autocorrect?.entries.some((entry) => entry.id === last.entry);
    show.dataset.entry = last?.entry || "";
}

// Try it closes the editor, as Record closes a macro's: it tries the whole
// draft's list, whichever replacement is open. The box is typed in as
// anywhere, and stays as it was typed, whatever a connected keyboard does to
// it; under it the preview is that text as this draft's list would leave it
// (D-L86). Caps Lock and the undo are the preview's alone.
/** @param {Model} model @param {List} list */
function trySection(model, list) {
    const tried = state.autocorrectTry;
    const card = el(`<div class="card editor-section" data-ac-try>
        <div class="card-h"><h3>Try it</h3>${infoMark({id: "ac-info-try", label: "About the preview", heading: "About the preview", rows: [
                {term: "Preview", says: `What your keyboard would type with this draft, once you Apply, typing through ${list.layoutName}.`},
                {term: "Your text", says: "The box keeps what you type. Only the preview shows replacements."},
                {term: "Not shown", says: "Clicks, shortcuts, arrow keys and held keys. On the keyboard they start a new word or pause replacing until the next one."},
                {term: "Caps Lock", says: "Follows your own Caps Lock as you type here, or set it for the preview with the switch."}]})}
            <button class="btn tiny ghost destructive right" data-act="ac-try-clear" data-tip="Empty the box and its preview.">Clear</button></div>
        <div class="card-b stack">
            <textarea class="input ac-try-box" data-f="autocorrect:try:text" rows="2" aria-label="Type here to try your list" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Type here: teh, then a space.">${esc(tried.text)}</textarea>
            ${model?.autocorrectRunning ? `<p class="note" data-ac-try-running>Your keyboard is replacing as you type here too. The preview shows this draft.</p>` : ""}
            <div class="field"><span id="ac-try-label">Your keyboard would type</span>
                <div class="ac-try-preview" data-ac-try-preview role="status" aria-labelledby="ac-try-label"></div></div>
            <div class="row ac-try-tools">
                <label class="sw" data-tip="Whether the preview takes Caps Lock to be on at the computer. It follows your own Caps Lock as you type here."><input type="checkbox" data-f="autocorrect:try:caps" ${tried.capsLock ? "checked" : ""}><span class="track"></span><span class="txt">Preview with Caps Lock on</span></label>
                <span class="note" data-ac-try-said aria-live="polite"></span>
                <button class="btn tiny link" data-act="ac-try-show" hidden>Show it →</button>
            </div>
        </div></div>`);
    const box = /** @type {HTMLTextAreaElement} */ (card.querySelector("textarea"));
    const caps = /** @type {HTMLInputElement} */ (card.querySelector('[data-f="autocorrect:try:caps"]'));
    box.addEventListener("input", () => {
        state.autocorrectTry = {...state.autocorrectTry, ...triedAfter(state.autocorrectTry, box.value), text: box.value};
        askTry();
    });
    // The computer's own Caps Lock, as the key press reports it: read, and
    // nothing of the key changed.
    box.addEventListener("keydown", (event) => {
        const on = event.getModifierState("CapsLock");
        if (on === state.autocorrectTry.capsLock) return;
        caps.checked = on;
        state.autocorrectTry = {...state.autocorrectTry, capsLock: on};
    });
    caps.addEventListener("change", () => { state.autocorrectTry = {...state.autocorrectTry, capsLock: caps.checked}; askTry(); });
    // Clear is the one thing here that empties the box, with its preview.
    /** @type {HTMLButtonElement} */ (card.querySelector('[data-act="ac-try-clear"]')).addEventListener("click", (event) => {
        event.stopPropagation();
        box.value = "";
        state.autocorrectTry = {...state.autocorrectTry, before: "", typed: "", text: ""};
        askTry();
        box.focus();
    });
    /** @type {HTMLButtonElement} */ (card.querySelector('[data-act="ac-try-show"]')).addEventListener("click", (event) => {
        event.stopPropagation();
        openInEditor(/** @type {HTMLElement} */ (event.currentTarget).dataset.entry || "");
    });
    // The list or the host layout changed under what was tried: try it again.
    if ((tried.before || tried.typed) && tried.draft !== draftOf(model)) queueMicrotask(askTry);
    return card;
}

// ── files ───────────────────────────────────────────────────────────────

let nextImport = 0;
// Asks the core to read a list and say what it would do: the file the
// shell's chooser picks, a dropped file's text, or the starter list.
/** @param {{text: string, name: string} | "starter" | "choose"} source */
function previewImport(source) {
    const requestId = ++nextImport;
    state.autocorrectImport = {requestId, pending: true, name: typeof source === "string" ? "" : source.name, starter: source === "starter"};
    post(source === "choose" ? controls.chooseAutocorrectFile(requestId) : source === "starter" ? controls.previewAutocorrectStarter(requestId)
        : controls.previewAutocorrectFile(source.text, source.name, requestId));
    render();
}

/** @param {Extract<import("../../contracts/messages.js").PanelResponse, {type: "autocorrectImportPreview"}>} message */
export function receiveAutocorrectImport(message) {
    const asked = state.autocorrectImport, draft = getModel()?.draft;
    if (!asked || asked.requestId !== message.requestId) return;
    // A chooser closed without a file leaves nothing to show.
    const stale = message.draftId !== draft?.id || message.draftRevision !== draft?.revision;
    state.autocorrectImport = stale || (!message.preview && !message.error) ? null
        : {...asked, pending: false, name: message.name || asked.name, preview: message.preview, error: message.error};
    render();
}

// A list file dropped anywhere on the screen is read as a chosen one is, and
// what stops one is said under Import, as the Backups screen says it.
/** @param {HTMLElement} pad */
function takesDrops(pad) {
    const available = () => editGate(getModel(), "autocorrect").editable;
    /** @param {string} text */
    const tell = (text) => {
        const status = /** @type {HTMLElement | null} */ (pad.querySelector("[data-ac-file-status]"));
        if (status) { status.textContent = text; status.hidden = !text; }
    };
    /** @param {DragEvent} event */
    const files = (event) => Array.from(event.dataTransfer?.types || []).includes("Files");
    for (const type of /** @type {const} */ (["dragenter", "dragover"])) pad.addEventListener(type, (event) => {
        if (!files(event)) return;
        event.preventDefault();
        /** @type {DataTransfer} */ (event.dataTransfer).dropEffect = available() ? "copy" : "none";
        pad.classList.toggle("drag-over", available());
    });
    pad.addEventListener("dragleave", (event) => {
        if (!pad.contains(/** @type {Node | null} */ (event.relatedTarget))) pad.classList.remove("drag-over");
    });
    pad.addEventListener("drop", async (event) => {
        if (!files(event)) return;
        event.preventDefault();
        pad.classList.remove("drag-over");
        if (!available()) return;
        const dropped = Array.from(/** @type {DataTransfer} */ (event.dataTransfer).files);
        if (dropped.length !== 1) { tell("Drop one file at a time."); return; }
        const file = dropped[0];
        if (file.size > LIST_FILE_MAX_BYTES) { tell(LIST_FILE_TOO_LARGE); return; }
        const draft = getModel()?.draft;
        if (!draft) return;
        const {id, revision} = draft;
        tell("Reading list…");
        try {
            const text = await file.text();
            if (getModel()?.draft?.id !== id || getModel()?.draft?.revision !== revision || !available()) { tell("The draft changed while reading this file. Drop it again when ready."); return; }
            tell("");
            previewImport({text, name: file.name});
        } catch {
            tell("This file could not be read. Try Import… instead.");
        }
    });
}

// How many names a line of the import's summary lists before it counts the rest.
const NAMES_SHOWN = 12;

export function closeAutocorrectImport() {
    if (!state.autocorrectImport) return false;
    state.autocorrectImport = null;
    render();
    return true;
}

// What the file would do, both ways, and the choice: a sheet over the screen,
// as a backup's comparison is. Decide, then it closes.
/** @param {List} list @param {boolean} canEdit */
function importSheet(list, canEdit) {
    const asked = /** @type {NonNullable<typeof state.autocorrectImport>} */ (state.autocorrectImport);
    const title = asked.starter ? "Add the common typo fixes?" : "Import this list?";
    const preview = asked.pending || asked.error ? undefined : asked.preview;
    /** @param {import("../../contracts/messages.js").AutocorrectImportOutcome} outcome */
    const lines = (outcome) => importLines(outcome, list.usage).map((line) => `<li data-ac-line="${esc(line.kind)}">${esc(line.text)}${line.names?.length
        ? `<span class="ac-names">${line.names.slice(0, NAMES_SHOWN).map((name) => `<span>${esc(name)}</span>`).join("")}${line.names.length > NAMES_SHOWN ? `<span>and ${esc(line.names.length - NAMES_SHOWN)} more</span>` : ""}</span>` : ""}</li>`).join("");
    /** @param {import("../../contracts/messages.js").AutocorrectImportOutcome} outcome */
    const changes = (outcome) => outcome.newReplacements.length + outcome.addedInputs.length > 0;
    /** @param {import("../../contracts/messages.js").AutocorrectImportOutcome} outcome */
    const after = (outcome) => `Your list would hold ${countWords({...list.usage, corrections: outcome.replacements, typos: outcome.inputs}).replace(" · ", ", with ")}.`;
    const node = el(`<div class="scrim import-scrim"><div class="sheet import-sheet ac-import" role="dialog" aria-modal="true" aria-label="${esc(title)}" data-ac-import>
        <div class="sheet-h"><h2>${esc(title)}</h2>${asked.name ? `<span class="right note mono">${esc(asked.name)}</span>` : ""}</div>
        <div class="sheet-b stack gap-12">${asked.pending ? `<p class="note">Reading list…</p>` : !preview ? `<div class="unavailable">${esc(asked.error || "This file could not be read.")}</div>` : `
            <div class="ac-import-ways">
                <section data-ac-way="add"><div class="sect-h"><h4>Add to my list</h4></div><ul class="ac-import-lines">${lines(preview.add)}</ul>
                    <p class="note">${esc(after(preview.add))}</p></section>
                <section data-ac-way="replace"><div class="sect-h"><h4>Replace my list</h4></div><ul class="ac-import-lines">${lines(preview.replace)}</ul>
                    <p class="note">${esc(after(preview.replace))}</p></section>
            </div>
            <div class="callout">Nothing changes until you choose. Either way it is one step of the draft, which Undo takes back.</div>`}
        </div>
        <div class="sheet-f">${preview ? dialogFoot(`<button class="btn primary" data-act="ac-import-add" ${canEdit && changes(preview.add) ? "" : "disabled"}>Add to my list</button>`, {act: "ac-import-cancel"},
            `<button class="btn" data-act="ac-import-replace" ${canEdit && preview.replace.replacements ? "" : "disabled"}>Replace my list</button>`)
            : `<span class="right"><button class="btn ghost" data-act="ac-import-cancel">${asked.pending ? "Cancel" : "Close"}</button></span>`}</div>
    </div></div>`);
    node.addEventListener("click", (event) => {
        if (event.target === node) { closeAutocorrectImport(); return; }
        const button = pressed(event);
        if (!button) return;
        const mode = button.dataset.act === "ac-import-add" ? "add" : button.dataset.act === "ac-import-replace" ? "replace" : null;
        state.autocorrectImport = null;
        if (mode && preview) { state.error = ""; post(edits.importAutocorrect(mode, preview.entries, identityOf(getModel()))); }
        render();
    });
    return node;
}
