// @ts-check
/**
 * @typedef {import("../../contracts/panel.js").PublishedModel | null} Model
 * @typedef {import("../../contracts/panel.js").AutocorrectEntry} Entry
 * @typedef {import("../../contracts/edits.js").AutocorrectEdit} Edit
 * @typedef {NonNullable<NonNullable<Model>["autocorrect"]>} List
 * @typedef {NonNullable<import("../state.js").PanelState["autocorrectAdding"]>} Adding
 */
// Text replacement: what the keyboard replaces as a word ends (firmware
// D-F68, where the feature is autocorrect, a replacement a correction and a
// typed form a typo; the code keeps those names). The screen is the list and
// nothing else (D-L87): its switch is a Host setting, as every switch is a
// Settings screen's, and a banner says so while it is off.
//
// A row is an entry: its replacement, then what is typed for it as chips,
// each written as its owner wrote it, with `*` where other letters may go.
// Everything is edited in place: a replacement where it stands, a typed form
// in a small panel under its chip, another one in a field at the end of its
// row. Add replacement opens one more row at the top, with a field that
// turns what is typed into chips.
//
// A list comes in from a file (QMK's text, a spreadsheet's CSV or Ark's JSON,
// D-L85), chosen or dropped on the screen, or from the starter list. The core
// reads it and says what it would do; nothing changes until Add to my list
// or Replace my list is chosen. Export saves the list in any of the three.
//
// Try it is a box typed in as on the keyboard: the core runs what was typed
// through the draft's list by the keyboard's rules (firmware autocorrect-v1.md)
// and the box shows what the computer would end with.
//
// What is typed is checked by the core against the draft as it stands, which
// answers with the refusal the edit would meet or what it would newly warn
// about; the edit itself is posted when it is kept, and the core has the
// last word on it.

import {el, esc, watchPressOutside} from "../lib/dom.mjs";
import {meterFill} from "./meter.mjs";
import {choiceField} from "./segmented.mjs";
import {topbar} from "./frame.mjs";
import {settingOffBanner} from "./participation.mjs";
import {getModel, post, render, state} from "../store.mjs";
import {editGate} from "../view/edit-gate.mjs";
import {draftDot, draftMarks} from "../view/review.mjs";
import {AUTOCORRECT_SORTS, LIST_FILE_FORMATS, LIST_FILE_MAX_BYTES, LIST_FILE_TOO_LARGE, addedReplacement, autocorrectRows, countWords, importLines, joinedEntry, macroLabel, memoryWords,
    replacementLabel, replacementOf, switchedOff, triedAfter, triedWords, typedTokens, usageShare} from "../view/autocorrect.mjs";
import * as edits from "../view/edits.mjs";
import * as controls from "../view/controls.mjs";

// The one line that says how a typed form is written.
const STAR_HINT = "Add * where other letters may go: recieve* also fixes recieved and recieving.";
const MACRO_HINT = "A macro plays for the whole word only, as it is stored, and Backspace does not take it back.";
// The choice in a macro menu that goes to Macros to make one.
const NEW_MACRO = "new";

/** @param {Model} model */
const identityOf = (model) => model?.autocorrectEditing?.identity;

// ── checking what is typed ──────────────────────────────────────────────

// The check in flight or answered, for the one form being typed in.
let nextCheck = 0;

// Asks the core what `edit` would meet, for the form named `form`.
/** @param {string} form @param {Edit | null} edit */
function check(form, edit) {
    if (!edit || !editGate(getModel(), "autocorrect").editable) { state.autocorrectCheck = null; paintFeedback(); return; }
    const requestId = ++nextCheck;
    // What the last answer said stands until this one comes, so the line
    // does not blink as each letter is typed; another form's is dropped.
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

// The answer under the form it is for; every other form's line is emptied.
function paintFeedback() {
    const answer = state.autocorrectCheck;
    for (const line of /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll("[data-ac-feedback]"))) {
        const mine = answer && line.dataset.acFeedback === answer.form ? answer : null;
        line.hidden = !mine || (!mine.error && !mine.warnings.length);
        line.replaceChildren(...(!mine ? [] : mine.error ? [el(`<div class="unavailable">${esc(mine.error)}</div>`)]
            : mine.warnings.map((warning) => el(`<p class="note ac-warning">${esc(warning)}</p>`))));
    }
    const save = /** @type {HTMLButtonElement | null} */ (document.querySelector('[data-act="ac-add-save"]'));
    if (save) save.disabled = !canSave();
}

// The typed forms the add row holds: its chips, and what is still in its field.
/** @param {Adding} adding */
const addedTyped = (adding) => [...adding.typed, ...typedTokens(adding.draft)];
// The edit the add row would post as it stands, or null while it lacks a part.
/** @param {Adding | null} adding */
function addEdit(adding) {
    const replacement = adding && addedReplacement(adding), typed = adding ? addedTyped(adding) : [];
    return replacement && typed.length ? edits.addAutocorrectTyped(replacement, typed, identityOf(getModel())) : null;
}
// Whether the add row holds something the core has not refused.
function canSave() {
    const answer = state.autocorrectCheck;
    return editGate(getModel(), "autocorrect").editable && Boolean(addEdit(state.autocorrectAdding)) && !(answer?.form === "add" && answer.error);
}

// ── the screen ──────────────────────────────────────────────────────────

/** @type {(() => void) | null} */
let stopWatching = null;   // stops the open panel's outside-press watch

export function screenAutocorrect() {
    const model = getModel(), list = model?.autocorrect;
    const gate = editGate(model, "autocorrect"), canEdit = gate.editable;
    const main = el(`<div class="main">${topbar("Text replacement", "Fixes typos and types longer text for you when you finish a word, on any computer.")}</div>`);
    const content = el(`<div class="content"><div class="pad autocorrect stack"></div></div>`);
    const pad = /** @type {HTMLElement} */ (content.firstElementChild);
    main.appendChild(content);
    stopWatching?.();
    stopWatching = null;
    if (!list) {
        pad.appendChild(el(`<div class="screen-stub"><h3>No replacements read</h3>
            <p class="note">${esc(gate.why || "Choose Read keyboard to read this keyboard's text replacements.")}</p></div>`));
        return main;
    }
    settle(model);
    if (switchedOff(model)) pad.appendChild(settingOffBanner("autocorrect", "The keyboard keeps this list and replaces nothing."));
    if (!canEdit && !gate.quiet) pad.appendChild(el(`<div class="unavailable">${esc(gate.why || "This list cannot be edited right now.")}</div>`));
    for (const notice of list.notices) pad.appendChild(el(`<div class="unavailable ac-notice" data-ac-notice>${esc(notice)} Change the host layout back, or edit the marked replacements.</div>`));
    if (state.autocorrectImport) pad.appendChild(importCard(list, canEdit));
    const layout = el(`<div class="ac-layout"></div>`);
    layout.append(listCard(model, list, canEdit), tryCard(model, list));
    pad.append(layout, el(`<div class="ac-drop" aria-hidden="true"><span>Drop a .txt, .csv or .json list to import it</span></div>`));
    takesDrops(pad);
    queueMicrotask(paintFeedback);
    queueMicrotask(paintTry);
    queueMicrotask(() => watchOpenPanel(pad));
    // The field for more typed forms is open to be typed in: after the list
    // takes one, it is where the next goes.
    if (state.autocorrectEdit?.part === "more" && !state.autocorrectEdit.sent) focusLater("[data-ac-more]");
    return main;
}

// What the core's answer leaves of the forms: an edit it took closes the row
// or the panel it came from, but for the field that adds typed forms to a
// row, which stays for the next one; an edit it refused keeps what was typed.
/** @param {Model} model */
function settle(model) {
    const adding = state.autocorrectAdding, editing = state.autocorrectEdit, identity = identityOf(model) || "";
    if (adding?.sent && adding.sent !== identity) { state.autocorrectAdding = null; state.autocorrectCheck = null; }
    else if (adding?.sent && state.error) state.autocorrectAdding = {...adding, sent: undefined};
    if (editing?.sent && editing.sent !== identity) {
        state.autocorrectEdit = editing.part === "more" && model?.autocorrect?.entries.some((entry) => entry.id === editing.entry) ? {entry: editing.entry, part: "more"} : null;
        state.autocorrectCheck = null;
    } else if (editing?.sent && state.error) state.autocorrectEdit = {...editing, sent: undefined};
    // An entry that is gone has nothing open.
    if (state.autocorrectEdit && !model?.autocorrect?.entries.some((entry) => entry.id === state.autocorrectEdit?.entry)) state.autocorrectEdit = null;
}

// A panel or an editor open on a row closes at a press outside it, and the
// Export menu at one outside the menu.
/** @param {HTMLElement} pad */
function watchOpenPanel(pad) {
    const open = /** @type {HTMLElement[]} */ ([...pad.querySelectorAll("[data-ac-open], [data-ac-menu]")]);
    if (!open.length) return;
    stopWatching?.();
    stopWatching = watchPressOutside(open, (event) => {
        stopWatching?.();
        stopWatching = null;
        state.autocorrectEdit = null;
        state.autocorrectExport = false;
        state.autocorrectCheck = null;
        // A press on one of the screen's own buttons is that button's to
        // answer: redrawing now would take it from under the click.
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest(".pad.autocorrect button[data-act]")) document.addEventListener("click", () => render(), {once: true});
        else render();
    });
}

// Sets a field to what the state holds for it before a redraw, so the redraw
// does not put back text the screen has already taken (lib/focus.mjs keeps
// what is typed and not yet committed).
/** @param {HTMLInputElement} input @param {string} value */
const taken = (input, value) => { input.value = value; input.defaultValue = value; };

/** @param {Edit} edit */
const keep = (edit) => { state.error = ""; state.autocorrectCheck = null; post(edit); };

// ── the list ────────────────────────────────────────────────────────────

const SORT_WORDS = /** @type {const} */ ({replacement: "A to Z", typed: "Most typed"});

/** @param {Model} model @param {List} list @param {boolean} canEdit */
function listCard(model, list, canEdit) {
    const query = state.autocorrectSearch || "", macros = model?.macros;
    const rows = autocorrectRows(list, {query, sort: state.autocorrectSort, macros});
    const changed = draftMarks(model?.draft?.changes).autocorrect;
    const off = canEdit ? "" : "disabled", none = list.entries.length ? "" : "disabled";
    const card = el(`<section class="card ac-list" aria-label="Replacements">
        <div class="card-h ac-toolbar"><h3>Replacements</h3>
            <span class="tag" data-ac-count>${esc(countWords(list.usage))}</span>
            <div class="right">
                <input class="input search" data-f="autocorrect:search" type="search" aria-label="Search replacements and what is typed for them" placeholder="Search" value="${esc(query)}">
                ${choiceField({label: "Order", f: "autocorrect:sort", hideLabel: true, choices: AUTOCORRECT_SORTS.map((sort) => /** @type {const} */ ([sort, SORT_WORDS[sort]])), current: state.autocorrectSort})}
                <button class="btn primary" data-act="ac-add" ${off}>Add replacement</button>
                <button class="btn" data-act="ac-import" ${off} data-tip="A .txt file in QMK's form, a .csv from a spreadsheet, or a .json Ark exported. You can also drop one on this screen.">Import…</button>
                <div class="ac-export" ${state.autocorrectExport ? "data-ac-menu" : ""}><button class="btn" data-act="ac-export-menu" aria-haspopup="menu" aria-expanded="${state.autocorrectExport ? "true" : "false"}" ${none}>Export</button>
                    ${state.autocorrectExport ? `<div class="ac-menu" role="menu" aria-label="Export as">${LIST_FILE_FORMATS.map((format) =>
                        `<button class="ac-menu-item" role="menuitem" data-act="ac-export" data-format="${esc(format)}">${esc(format === "txt" ? "Text (QMK)" : format.toUpperCase())}</button>`).join("")}</div>` : ""}</div>
            </div></div>
        <p class="note ac-file-status" data-ac-file-status hidden></p>
        <datalist id="acReplacements">${list.entries.map((entry) => `<option value="${esc(replacementLabel(entry, macros))}"></option>`).join("")}</datalist>
        <div class="ac-heads" aria-hidden="true"><span>Replacement</span><span>Typed</span></div>
        <div class="ac-rows" role="list"></div>
        <div class="ac-memory">
            <div class="meter" data-ac-meter data-tip="Text replacement memory: part of the profile, within its own limit.">${meterFill(usageShare(list.usage))}</div>
            <p class="note meter-note" data-ac-memory>${esc(memoryWords(list.usage))}</p>
        </div>
    </section>`);
    const body = /** @type {HTMLElement} */ (card.querySelector(".ac-rows"));
    bindToolbar(card);
    if (state.autocorrectAdding) body.appendChild(addRow(model, list, state.autocorrectAdding, canEdit));
    if (!list.entries.length) {
        if (!state.autocorrectAdding) body.appendChild(emptyState(canEdit));
        /** @type {HTMLElement} */ (card.querySelector(".ac-heads")).hidden = !state.autocorrectAdding;
        return card;
    }
    if (!rows.length) {
        body.appendChild(el(`<p class="note ac-none" data-ac-none>Nothing on your list matches “${esc(query.trim())}”.</p>`));
        return card;
    }
    for (const row of rows) body.appendChild(entryRow(model, row.entry, row.found, changed.has(row.entry.id), canEdit));
    return card;
}

/** @param {HTMLElement} card */
function bindToolbar(card) {
    /** @type {HTMLInputElement} */ (card.querySelector('[data-f="autocorrect:search"]')).addEventListener("input", (event) => { state.autocorrectSearch = /** @type {HTMLInputElement} */ (event.target).value; render(); });
    /** @type {HTMLElement} */ (card.querySelector(".ac-toolbar .right")).addEventListener("change", (event) => {
        const picked = /** @type {HTMLInputElement} */ (event.target);
        if (!picked.matches("[type=radio], select")) return;
        state.autocorrectSort = picked.value === "typed" ? "typed" : "replacement";
        render();
    });
    card.querySelector(".ac-toolbar")?.addEventListener("click", (event) => {
        const button = /** @type {HTMLButtonElement | null} */ (/** @type {HTMLElement} */ (event.target).closest("button[data-act]"));
        if (!button || button.disabled) return;
        const act = button.dataset.act;
        if (act === "ac-add") openAdd();
        else if (act === "ac-import") previewImport("choose");
        else if (act === "ac-export-menu") { state.autocorrectExport = !state.autocorrectExport; render(); if (state.autocorrectExport) focusLater(".ac-menu-item"); }
        else if (act === "ac-export") { state.autocorrectExport = false; post(controls.exportAutocorrect(/** @type {typeof LIST_FILE_FORMATS[number]} */ (button.dataset.format))); render(); focusLater('[data-act="ac-export-menu"]'); }
    });
    // The menu is a menu from the keyboard: the arrows move, Escape closes.
    card.querySelector(".ac-export")?.addEventListener("keydown", (event) => {
        const key = /** @type {KeyboardEvent} */ (event).key;
        const items = /** @type {HTMLElement[]} */ ([...card.querySelectorAll(".ac-menu-item")]);
        if (!items.length) return;
        const at = items.indexOf(/** @type {HTMLElement} */ (document.activeElement));
        if (key === "ArrowDown" || key === "ArrowUp") { event.preventDefault(); items[(at + (key === "ArrowDown" ? 1 : items.length - 1)) % items.length].focus(); }
        else if (key === "Escape") { event.preventDefault(); state.autocorrectExport = false; render(); focusLater('[data-act="ac-export-menu"]'); }
    });
}

/** @param {string} selector */
const focusLater = (selector) => queueMicrotask(() => /** @type {HTMLElement | null} */ (document.querySelector(selector))?.focus());

function openAdd() {
    state.autocorrectAdding = state.autocorrectAdding || {kind: "text", text: "", macro: null, typed: [], draft: ""};
    state.autocorrectEdit = null;
    state.autocorrectCheck = null;
    render();
    focusLater('[data-f="autocorrect:add:replacement"], [data-f="autocorrect:add:macro"]');
}

/** @param {boolean} canEdit */
function emptyState(canEdit) {
    const off = canEdit ? "" : "disabled";
    const empty = el(`<div class="empty-card ac-empty" data-ac-empty>
        <h4>Nothing is replaced yet</h4>
        <p class="note">A replacement is text the keyboard types for you when you finish a word: <span class="mono">the</span> for <span class="mono">teh</span>, your phone number for <span class="mono">pnumber</span>, or a macro for anything longer.</p>
        <div class="ac-empty-actions">
            <button class="btn primary" data-act="ac-starter" ${off} data-tip="Fixes for about 200 common English typos, each a whole word. You see what it adds before anything changes.">Add common typo fixes</button>
            <button class="btn" data-act="ac-add" ${off}>Add replacement</button>
            <button class="btn" data-act="ac-import" ${off}>Import…</button>
        </div></div>`);
    empty.addEventListener("click", (event) => {
        const button = /** @type {HTMLButtonElement | null} */ (/** @type {HTMLElement} */ (event.target).closest("button[data-act]"));
        if (!button || button.disabled) return;
        if (button.dataset.act === "ac-starter") previewImport("starter");
        else if (button.dataset.act === "ac-add") openAdd();
        else previewImport("choose");
    });
    return empty;
}

// A replacement's kind and value as two controls: Text or Macro, then the
// text or the macro's menu. `f` names their form identities.
/** @param {Model} model @param {string} f @param {{kind: "text" | "macro", text: string, macro: number | null}} value @param {boolean} canEdit @param {number} most */
function replacementControls(model, f, value, canEdit, most) {
    const off = canEdit ? "" : "disabled", macros = model?.macros || [];
    return `${choiceField({label: "Replacement is", f: `${f}:kind`, hideLabel: true, disabled: !canEdit, choices: [["text", "Text"], ["macro", "Macro"]], current: value.kind,
        tip: "Text is one line the keyboard types. A macro is for anything longer, or of more than one line."})}
        ${value.kind === "macro" ? `<label class="field ac-rep-field"><span class="sr">Macro to play</span>
            <select class="input" data-f="${esc(f)}:macro" data-ac-macro ${off}>
                <option value="" ${value.macro === null ? "selected" : ""}>Choose a macro…</option>
                ${macros.map((macro, slot) => `<option value="${esc(slot)}" ${value.macro === slot ? "selected" : ""}>${esc(macroLabel(macros, slot))}${macro.empty ? " (empty)" : ""}</option>`).join("")}
                <option value="${NEW_MACRO}">New macro…</option></select></label>`
        : `<label class="field ac-rep-field"><span class="sr">Replacement text</span>
            <input class="input" data-f="${esc(f)}:replacement" data-ac-text autocomplete="off" spellcheck="false" placeholder="because, or +31 6 1234 5678" value="${esc(value.text)}" ${off}
                data-tip="Up to ${esc(most)} bytes on one line: a word, a phone number, a sign-off."></label>`}`;
}

// Goes to Macros on the first empty slot, to make the macro a replacement
// will play.
/** @param {Model} model */
function newMacro(model) {
    const empty = (model?.macros || []).find((macro) => macro.empty);
    Object.assign(state, {screen: "macros", ...(empty ? {macroSlot: empty.keycode} : {})});
    render();
}

// The row a replacement is added in: its replacement, then a field that
// makes a chip of each thing typed for it.
/** @param {Model} model @param {List} list @param {Adding} adding @param {boolean} canEdit */
function addRow(model, list, adding, canEdit) {
    const off = canEdit ? "" : "disabled";
    const joins = joinedEntry(list, adding);
    const row = el(`<div class="ac-row adding" role="listitem" data-ac-adding>
        <div class="ac-rep">${replacementControls(model, "autocorrect:add", adding, canEdit, list.usage.correctionMax)}</div>
        <div class="ac-typed"><div class="ac-tokens" data-ac-tokens>
            ${adding.typed.map((typed, at) => `<span class="chip ac-chip token"><span class="mono">${esc(typed)}</span><button class="ac-token-x" data-act="ac-token-remove" data-at="${esc(at)}" aria-label="Remove ${esc(typed)}" ${off}>×</button></span>`).join("")}
            <input class="input mono ac-token-input" data-f="autocorrect:add:typed" aria-label="What you type for it" autocomplete="off" autocapitalize="off" spellcheck="false"
                placeholder="${adding.typed.length ? "another, or Enter to add" : "what you type: becuase becasue"}" value="${esc(adding.draft)}" ${off}></div></div>
        <div class="ac-add-foot">
            <p class="note" data-ac-hint>${esc(adding.kind === "macro" ? MACRO_HINT : STAR_HINT)}</p>
            ${joins ? `<p class="note" data-ac-joins>“${esc(replacementLabel(joins, model?.macros))}” is already on your list: this adds to it.</p>` : ""}
            <div data-ac-feedback="add" hidden></div>
            <div class="ac-add-actions"><button class="btn primary" data-act="ac-add-save" ${canSave() ? "" : "disabled"}>Add</button>
                <button class="btn ghost" data-act="ac-add-cancel">Cancel</button></div>
        </div></div>`);
    const tokens = /** @type {HTMLInputElement} */ (row.querySelector('[data-f="autocorrect:add:typed"]'));
    const current = () => /** @type {Adding} */ (state.autocorrectAdding);
    const ask = () => check("add", addEdit(current()));
    // Everything typed but what follows the last space becomes chips.
    /** @param {boolean} all */
    const chip = (all) => {
        const parts = typedTokens(tokens.value), rest = all || /[\s,]$/.test(tokens.value) ? "" : parts.pop() || "";
        if (!parts.length) return false;
        state.autocorrectAdding = {...current(), typed: [...current().typed, ...parts.filter((part) => !current().typed.includes(part))], draft: rest};
        taken(tokens, rest);
        render();
        ask();
        return true;
    };
    const save = () => {
        const edit = addEdit(current());
        if (!edit || !canSave()) return;
        state.autocorrectAdding = {...current(), typed: addedTyped(current()), draft: "", sent: identityOf(getModel()) || ""};
        taken(tokens, "");
        keep(edit);
    };
    tokens.addEventListener("input", () => {
        if (/[\s,]/.test(tokens.value)) { if (chip(false)) return; taken(tokens, ""); }
        state.autocorrectAdding = {...current(), draft: tokens.value};
        ask();
    });
    tokens.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            if (tokens.value.trim()) chip(true); else save();
        } else if (event.key === "Backspace" && !tokens.value && current().typed.length) {
            event.preventDefault();
            state.autocorrectAdding = {...current(), typed: current().typed.slice(0, -1)};
            render();
            ask();
        } else if (event.key === "Escape") closeAdd();
    });
    row.addEventListener("input", (event) => {
        const input = /** @type {HTMLInputElement} */ (event.target);
        if (!input.matches("[data-ac-text]")) return;
        state.autocorrectAdding = {...current(), text: input.value};
        // Whether it joins an entry is said as it is typed.
        const note = row.querySelector("[data-ac-joins]"), joined = joinedEntry(list, current());
        if (Boolean(note) !== Boolean(joined)) { taken(input, input.value); render(); }
        ask();
    });
    row.addEventListener("change", (event) => {
        const input = /** @type {HTMLInputElement | HTMLSelectElement} */ (event.target);
        if (input.matches("[type=radio]")) { state.autocorrectAdding = {...current(), kind: input.value === "macro" ? "macro" : "text"}; render(); ask(); focusLater('[data-f="autocorrect:add:replacement"], [data-f="autocorrect:add:macro"]'); }
        else if (input.matches("[data-ac-macro]")) {
            if (input.value === NEW_MACRO) { newMacro(model); return; }
            state.autocorrectAdding = {...current(), macro: input.value === "" ? null : Number(input.value)};
            render();
            ask();
        }
    });
    row.addEventListener("keydown", (event) => {
        const input = /** @type {HTMLElement} */ (event.target);
        if (event.key === "Enter" && input.matches("[data-ac-text]")) { event.preventDefault(); tokens.focus(); }
        else if (event.key === "Escape" && input.matches("[data-ac-text], [data-ac-macro], [type=radio]")) closeAdd();
    });
    row.addEventListener("click", (event) => {
        const button = /** @type {HTMLButtonElement | null} */ (/** @type {HTMLElement} */ (event.target).closest("button[data-act]"));
        if (!button || button.disabled) { if (/** @type {HTMLElement} */ (event.target).matches("[data-ac-tokens]")) tokens.focus(); return; }
        if (button.dataset.act === "ac-add-save") save();
        else if (button.dataset.act === "ac-add-cancel") closeAdd();
        else if (button.dataset.act === "ac-token-remove") {
            state.autocorrectAdding = {...current(), typed: current().typed.filter((_, at) => at !== Number(button.dataset.at))};
            render();
            ask();
            focusLater('[data-f="autocorrect:add:typed"]');
        }
    });
    return row;
}

function closeAdd() {
    state.autocorrectAdding = null;
    state.autocorrectCheck = null;
    render();
    focusLater('[data-act="ac-add"]');
}

/** @param {Entry["typos"][number]} typo @param {boolean} found @param {boolean} open */
const chip = (typo, found, open) => `<button class="chip ac-chip ${typo.warnings.length ? "warn" : ""} ${found ? "found" : ""}" data-act="ac-chip" data-ac-chip="${esc(typo.typo)}"
    aria-haspopup="dialog" aria-expanded="${open ? "true" : "false"}" ${typo.warnings.length ? `data-tip="${esc(typo.warnings.join(" "))}"` : ""}><span class="mono">${esc(typo.typed)}</span></button>`;

// An entry: its replacement, what is typed for it, and its delete. One part
// of it may be open: its replacement being changed, a field for more typed
// forms, or one typed form's panel.
/** @param {Model} model @param {Entry} entry @param {string[]} found @param {boolean} changed @param {boolean} canEdit */
function entryRow(model, entry, found, changed, canEdit) {
    const macros = model?.macros, label = replacementLabel(entry, macros), off = canEdit ? "" : "disabled";
    const editing = state.autocorrectEdit?.entry === entry.id ? state.autocorrectEdit : null;
    const usage = /** @type {List} */ (model?.autocorrect).usage;
    const kind = editing?.kind ?? (entry.macro === undefined ? "text" : "macro");
    const replacement = editing?.part === "replacement"
        ? `<div class="ac-rep-edit" data-ac-open>${replacementControls(model, `autocorrect:entry:${entry.id}`, {kind, text: entry.correction, macro: entry.macro ?? null}, canEdit, usage.correctionMax)}
            <button class="btn ghost tiny" data-act="ac-close">Done</button>
            ${kind === "macro" ? `<p class="note">${esc(MACRO_HINT)}</p>` : ""}<div data-ac-feedback="entry" hidden></div></div>`
        : `<button class="ac-rep-text" data-act="ac-edit-replacement" ${off} data-tip="${esc(entry.macro === undefined ? label : `Plays the macro “${label}”`)}">${entry.macro === undefined ? "" : `<span class="tag">Macro</span> `}<span class="ac-rep-words">${esc(label)}</span></button>${changed ? draftDot(model?.draft) : ""}`;
    const typed = editing?.part === "typed" ? entry.typos.find((typo) => typo.typo === editing.typo) : undefined;
    const row = el(`<div class="ac-row ${entry.warnings.length ? "warn" : ""}" role="listitem" data-ac-entry="${esc(entry.id)}">
        <div class="ac-rep">${replacement}${entry.warnings.map((warning) => `<p class="note ac-warning">${esc(warning)}</p>`).join("")}</div>
        <div class="ac-typed">
            ${entry.typos.map((typo) => chip(typo, found.includes(typo.typo), typo === typed)).join("")}
            ${editing?.part === "more" ? `<input class="input mono ac-more-input" data-f="autocorrect:entry:${esc(entry.id)}:more" data-ac-more data-ac-open aria-label="Something else typed for ${esc(label)}"
                    autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="type it, then Enter" value="" ${off}>`
                : `<button class="chip ac-more" data-act="ac-more" ${off} data-tip="Something else you type for this replacement">+ typed</button>`}
            ${editing?.part === "more" ? `<p class="note ac-more-hint">${esc(entry.macro === undefined ? STAR_HINT : MACRO_HINT)}</p><div data-ac-feedback="entry" hidden></div>` : ""}
            ${typed ? typedPanel(entry, typed, canEdit) : ""}
        </div>
        <button class="btn ghost icon tiny destructive ac-delete" data-act="ac-delete" aria-label="Delete the replacement ${esc(label)}" data-tip="Delete this replacement. Undo takes it back." ${off}>×</button>
    </div>`);
    const identity = () => identityOf(getModel());
    const target = replacementOf(entry);
    /** @param {NonNullable<typeof state.autocorrectEdit>["part"]} part @param {string} [typo] */
    const open = (part, typo) => { state.autocorrectEdit = {entry: entry.id, part, ...(typo === undefined ? {} : {typo})}; state.autocorrectAdding = null; state.autocorrectCheck = null; render(); };
    const close = () => { state.autocorrectEdit = null; state.autocorrectCheck = null; render(); };
    /** @param {Edit} edit */
    const send = (edit) => { state.autocorrectEdit = {.../** @type {NonNullable<typeof state.autocorrectEdit>} */ (state.autocorrectEdit), sent: identity() || ""}; keep(edit); };
    // What a field would post as it stands, or nothing while it holds what
    // the list already has.
    /** @param {HTMLInputElement | HTMLSelectElement} input @returns {Edit | null} */
    const editOf = (input) => {
        const value = input.value;
        if (input.matches("[data-ac-text]")) return value.trim() && (entry.macro !== undefined || value.trim() !== entry.correction) ? edits.changeAutocorrectReplacement(target, {correction: value}, identity()) : null;
        if (input.matches("[data-ac-macro]")) return value !== "" && value !== NEW_MACRO && Number(value) !== entry.macro ? edits.changeAutocorrectReplacement(target, {macro: Number(value)}, identity()) : null;
        if (input.matches("[data-ac-more]")) return typedTokens(value).length ? edits.addAutocorrectTyped(target, typedTokens(value), identity()) : null;
        if (input.matches("[data-ac-typed-text]")) return typed && value.trim() && value.trim() !== typed.typed ? edits.changeAutocorrectTyped(typed.typo, {to: value}, identity()) : null;
        if (input.matches("[data-ac-move]")) {
            const named = value.trim(), listed = /** @type {List} */ (getModel()?.autocorrect).entries.find((other) => replacementLabel(other, getModel()?.macros) === named);
            return typed && named && listed?.id !== entry.id ? edits.changeAutocorrectTyped(typed.typo, {replacement: listed ? replacementOf(listed) : {correction: named}}, identity()) : null;
        }
        return null;
    };
    row.addEventListener("input", (event) => {
        const input = /** @type {HTMLInputElement} */ (event.target);
        if (input.matches("input:not([type=radio])")) check("entry", editOf(input));
    });
    // A field is kept when it is left or Enter is pressed in it; a choice as
    // soon as it is made.
    row.addEventListener("change", (event) => {
        const input = /** @type {HTMLInputElement | HTMLSelectElement} */ (event.target);
        if (input.matches("[type=radio]")) { state.autocorrectEdit = {entry: entry.id, part: "replacement", kind: input.value === "macro" ? "macro" : "text"}; render(); return; }
        if (input.matches("[data-ac-macro]") && input.value === NEW_MACRO) { newMacro(model); return; }
        const edit = editOf(input);
        if (!edit) return;
        send(edit);
        // The field for more typed forms is ready for the next one.
        if (input.matches("[data-ac-more]")) taken(/** @type {HTMLInputElement} */ (input), "");
    });
    row.addEventListener("keydown", (event) => {
        const input = /** @type {HTMLInputElement} */ (event.target);
        if (event.key === "Escape" && state.autocorrectEdit?.entry === entry.id) {
            event.preventDefault();
            const back = editing?.part === "typed" ? `[data-ac-entry="${CSS.escape(entry.id)}"] [data-ac-chip="${CSS.escape(editing.typo || "")}"]`
                : `[data-ac-entry="${CSS.escape(entry.id)}"] [data-act="${editing?.part === "more" ? "ac-more" : "ac-edit-replacement"}"]`;
            if (input.matches("input:not([type=radio])")) taken(input, input.defaultValue);
            close();
            focusLater(back);
        } else if (event.key === "Enter" && input.matches("input:not([type=radio])")) {
            event.preventDefault();
            // An empty field for more typed forms is done with.
            if (input.matches("[data-ac-more]") && !input.value.trim()) { close(); focusLater(`[data-ac-entry="${CSS.escape(entry.id)}"] [data-act="ac-more"]`); return; }
            // Leaving the field keeps it, once, as the browser tells it.
            input.blur();
            if (input.matches("[data-ac-more]")) input.focus();
        }
    });
    row.addEventListener("click", (event) => {
        const button = /** @type {HTMLButtonElement | null} */ (/** @type {HTMLElement} */ (event.target).closest("button[data-act]"));
        if (!button || button.disabled) return;
        const act = button.dataset.act;
        if (act === "ac-edit-replacement") { open("replacement"); focusLater(`[data-f="autocorrect:entry:${CSS.escape(entry.id)}:replacement"], [data-f="autocorrect:entry:${CSS.escape(entry.id)}:macro"]`); }
        else if (act === "ac-more") { open("more"); focusLater("[data-ac-more]"); }
        else if (act === "ac-chip") {
            const typo = button.dataset.acChip || "";
            if (editing?.part === "typed" && editing.typo === typo) close(); else { open("typed", typo); focusLater("[data-ac-typed-text]"); }
        } else if (act === "ac-close") close();
        else if (act === "ac-remove-typed" && typed) { state.autocorrectEdit = null; keep(edits.deleteAutocorrectTypo(typed.typo, identity())); }
        else if (act === "ac-delete") { state.autocorrectEdit = null; keep(edits.deleteAutocorrectEntry(target, identity())); }
    });
    return row;
}

// One typed form's panel, under its chip: how it is written, the replacement
// it belongs to, and its removal.
/** @param {Entry} entry @param {Entry["typos"][number]} typo @param {boolean} canEdit */
function typedPanel(entry, typo, canEdit) {
    const off = canEdit ? "" : "disabled";
    return `<div class="ac-pop" role="dialog" aria-label="Typed form ${esc(typo.typed)}" data-ac-pop data-ac-open>
        <label class="field"><span>Typed</span>
            <input class="input mono" data-f="autocorrect:typed:${esc(typo.typo)}:text" data-ac-typed-text autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(typo.typed)}" ${off}></label>
        <p class="note">${esc(entry.macro === undefined ? STAR_HINT : MACRO_HINT)}</p>
        ${typo.warnings.map((warning) => `<p class="note ac-warning">${esc(warning)}</p>`).join("")}
        <label class="field"><span>Move to</span>
            <input class="input" data-f="autocorrect:typed:${esc(typo.typo)}:move" data-ac-move list="acReplacements" autocomplete="off" spellcheck="false" placeholder="Another replacement…" value="" ${off}></label>
        <div data-ac-feedback="entry" hidden></div>
        <div class="ac-pop-foot"><button class="btn ghost destructive" data-act="ac-remove-typed" ${off}>Remove</button>
            <button class="btn ghost" data-act="ac-close">Done</button></div>
    </div>`;
}

// ── try it ──────────────────────────────────────────────────────────────

let nextTry = 0;
/** @param {Model} model */
const draftOf = (model) => `${model?.draft?.id ?? ""}:${model?.draft?.revision ?? ""}`;

// Asks the core what the keyboard would leave on screen for what the box
// holds: the text that was there, then what was typed after it.
function askTry() {
    const tried = state.autocorrectTry;
    if (!tried.before && !tried.typed) { state.autocorrectTry = {...tried, text: "", fired: [], undone: false, error: "", requestId: 0}; paintTry(); return; }
    const requestId = ++nextTry;
    state.autocorrectTry = {...tried, requestId};
    post(controls.tryAutocorrect(tried, requestId));
}

/** @param {Extract<import("../../contracts/messages.js").PanelResponse, {type: "autocorrectTry"}>} message */
export function receiveAutocorrectTry(message) {
    const tried = state.autocorrectTry, model = getModel();
    if (tried.requestId !== message.requestId || message.draftId !== model?.draft?.id || message.draftRevision !== model?.draft?.revision) return;
    state.autocorrectTry = {...tried, draft: draftOf(model), error: message.error || "",
        ...(message.result ? {text: message.result.text, fired: message.result.fired, undone: message.result.undone} : {})};
    paintTry();
}

// The box shows what the keyboard would leave, the line under it says what
// fired last, and that entry and its typed form are marked in the list.
function paintTry() {
    const tried = state.autocorrectTry;
    const box = /** @type {HTMLTextAreaElement | null} */ (document.querySelector('[data-f="autocorrect:try:text"]'));
    if (!box) return;
    if (box.value !== tried.text) {
        box.value = tried.text;
        box.setSelectionRange(tried.text.length, tried.text.length);
    }
    const last = tried.fired.at(-1);
    const said = /** @type {HTMLElement} */ (document.querySelector("[data-ac-try-said]"));
    said.textContent = tried.error || triedWords(tried, getModel()?.macros);
    said.classList.toggle("ac-warning", Boolean(tried.error));
    for (const row of /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll("[data-ac-entry]"))) {
        const fired = Boolean(last) && row.dataset.acEntry === last?.entry;
        row.classList.toggle("fired", fired);
        for (const marked of /** @type {NodeListOf<HTMLElement>} */ (row.querySelectorAll("[data-ac-chip]"))) marked.classList.toggle("fired", fired && marked.dataset.acChip === last?.typo);
    }
}

/** @param {Model} model @param {List} list */
function tryCard(model, list) {
    const tried = state.autocorrectTry, open = state.autocorrectTryOpen;
    const card = el(`<aside class="card ac-try" aria-label="Try it"><div class="card-h">
            <button class="ac-try-fold" data-act="ac-try-fold" aria-expanded="${open ? "true" : "false"}"><h3>Try it</h3></button>
            <h3 class="ac-try-title">Try it</h3></div>
        <div class="card-b stack ac-try-body ${open ? "" : "folded"}">
            <textarea class="input ac-try-box" data-f="autocorrect:try:text" rows="3" aria-label="Type here to try your list" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Type as on the keyboard: teh, then a space.">${esc(tried.text)}</textarea>
            <div class="ac-try-tools">
                <label class="sw" data-tip="Whether Caps Lock is on at the computer. It follows your own Caps Lock as you type here."><input type="checkbox" data-f="autocorrect:try:caps" ${tried.capsLock ? "checked" : ""}><span class="track"></span><span class="txt">Caps Lock</span></label>
                <button class="btn ghost tiny" data-act="ac-try-clear">Clear</button>
            </div>
            <p class="note" data-ac-try-said aria-live="polite"></p>
            <p class="note">What the keyboard would leave on screen with this draft's list, typing through ${esc(list.layoutName)}.</p>
        </div></aside>`);
    const box = /** @type {HTMLTextAreaElement} */ (card.querySelector("textarea"));
    const caps = /** @type {HTMLInputElement} */ (card.querySelector('[data-f="autocorrect:try:caps"]'));
    box.addEventListener("input", () => {
        state.autocorrectTry = {...state.autocorrectTry, ...triedAfter(state.autocorrectTry, box.value), text: box.value};
        askTry();
    });
    // The computer's own Caps Lock, as the key press reports it.
    box.addEventListener("keydown", (event) => {
        const on = event.getModifierState("CapsLock");
        if (on === state.autocorrectTry.capsLock) return;
        caps.checked = on;
        state.autocorrectTry = {...state.autocorrectTry, capsLock: on};
    });
    caps.addEventListener("change", () => { state.autocorrectTry = {...state.autocorrectTry, capsLock: caps.checked}; askTry(); });
    /** @type {HTMLButtonElement} */ (card.querySelector('[data-act="ac-try-clear"]')).addEventListener("click", () => {
        state.autocorrectTry = {...state.autocorrectTry, before: "", typed: ""};
        askTry();
        box.focus();
    });
    /** @type {HTMLButtonElement} */ (card.querySelector('[data-act="ac-try-fold"]')).addEventListener("click", () => { state.autocorrectTryOpen = !state.autocorrectTryOpen; render(); });
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

// A list file dropped anywhere on the screen is read as a chosen one is.
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
        tell("Reading the file…");
        try {
            const text = await file.text();
            if (getModel()?.draft?.id !== id || getModel()?.draft?.revision !== revision || !available()) { tell("The draft changed while reading this file. Drop it again when ready."); return; }
            previewImport({text, name: file.name});
        } catch {
            tell("This file could not be read. Try Import… instead.");
        }
    });
}

// How many names a line of the import's preview lists before it counts the rest.
const NAMES_SHOWN = 12;

// What the file would do, both ways, and the choice.
/** @param {List} list @param {boolean} canEdit */
function importCard(list, canEdit) {
    const asked = /** @type {NonNullable<typeof state.autocorrectImport>} */ (state.autocorrectImport);
    const title = asked.starter ? "Add common typo fixes" : `Import ${asked.name || "a list"}`;
    const preview = asked.preview;
    /** @param {import("../../contracts/messages.js").AutocorrectImportOutcome} outcome */
    const lines = (outcome) => importLines(outcome, list.usage).map((line) => `<li data-ac-line="${esc(line.kind)}">${esc(line.text)}${line.names?.length
        ? `<span class="ac-names">${line.names.slice(0, NAMES_SHOWN).map((name) => `<span>${esc(name)}</span>`).join("")}${line.names.length > NAMES_SHOWN ? `<span>and ${esc(line.names.length - NAMES_SHOWN)} more</span>` : ""}</span>` : ""}</li>`).join("");
    /** @param {import("../../contracts/messages.js").AutocorrectImportOutcome} outcome */
    const changes = (outcome) => outcome.newReplacements.length + outcome.addedTyped.length > 0;
    /** @param {import("../../contracts/messages.js").AutocorrectImportOutcome} outcome */
    const after = (outcome) => `Your list would hold ${esc(outcome.replacements.toLocaleString("en-US"))} replacement${outcome.replacements === 1 ? "" : "s"}, with ${esc(outcome.typed.toLocaleString("en-US"))} typed for ${outcome.replacements === 1 ? "it" : "them"}.`;
    const card = el(`<div class="card ac-import" data-ac-import role="region" aria-label="${esc(title)}"><div class="card-h"><h3>${esc(title)}</h3>
            <div class="right"><button class="btn ghost" data-act="ac-import-cancel">Cancel</button></div></div>
        <div class="card-b stack">${asked.pending ? `<p class="note">Reading…</p>` : asked.error || !preview ? `<div class="unavailable">${esc(asked.error || "This file could not be read.")}</div>` : `
            <div class="ac-import-ways">
                <section data-ac-way="add"><h4>Add to my list</h4><ul class="ac-import-lines">${lines(preview.add)}</ul>
                    <p class="note">${after(preview.add)}</p>
                    <button class="btn primary" data-act="ac-import-add" ${canEdit && changes(preview.add) ? "" : "disabled"}>Add to my list</button></section>
                <section data-ac-way="replace"><h4>Replace my list</h4><ul class="ac-import-lines">${lines(preview.replace)}</ul>
                    <p class="note">${after(preview.replace)}</p>
                    <button class="btn" data-act="ac-import-replace" ${canEdit && preview.replace.replacements ? "" : "disabled"}>Replace my list</button></section>
            </div>
            <p class="note">Nothing changes until you choose. Either way it is one step of the draft, which Undo takes back.</p>`}
        </div></div>`);
    card.addEventListener("click", (event) => {
        const button = /** @type {HTMLButtonElement | null} */ (/** @type {HTMLElement} */ (event.target).closest("button[data-act]"));
        if (!button || button.disabled) return;
        const mode = button.dataset.act === "ac-import-add" ? "add" : button.dataset.act === "ac-import-replace" ? "replace" : null;
        state.autocorrectImport = null;
        if (mode && preview) { state.error = ""; post(edits.importAutocorrect(mode, preview.entries, identityOf(getModel()))); }
        render();
    });
    return card;
}
