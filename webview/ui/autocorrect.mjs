// @ts-check
/**
 * @typedef {import("../../contracts/panel.js").PublishedModel | null} Model
 * @typedef {import("../../contracts/panel.js").AutocorrectEntry} Entry
 * @typedef {import("../../contracts/edits.js").AutocorrectEdit} Edit
 */
// Autocorrect: the typos the keyboard fixes as a word ends (firmware D-F68).
// The list is entries, each one correction with every typo that becomes it.
// A row is an entry: its correction, then its typos as chips, each saying
// where it matches when that is not the whole word. The open entry is edited
// in place: its spelling, each typo's spelling and match, the correction a
// typo belongs to, and another typo typed and kept with Enter.
//
// A list comes in from a file (QMK's text, a spreadsheet's CSV or Ark's JSON,
// D-L85), chosen or dropped on the screen, or from the starter list. The core
// reads it and says what it would do; nothing changes until Add to my list
// or Replace my list is chosen. Export saves the list in any of the three.
//
// The switch heads the screen: the stored key option, drawn as its settings
// section is (ui/settings.mjs), with the keyboard keys that change it too.
// Try it is a box typed in as on the keyboard: the core runs what was typed
// through the draft's list by the keyboard's rules (firmware autocorrect-v1.md)
// and the box shows what the computer would end with.
//
// What is typed is checked by the core against the draft as it stands, which
// answers with the refusal the edit would meet or what it would newly warn
// about; the edit itself is posted when it is kept, and the core has the
// last word on it.

import {el, esc} from "../lib/dom.mjs";
import {meterFill} from "./meter.mjs";
import {choiceField, choiceValue} from "./segmented.mjs";
import {topbar} from "./frame.mjs";
import {getModel, post, render, state} from "../store.mjs";
import {editGate} from "../view/edit-gate.mjs";
import {draftDot, draftMarks} from "../view/review.mjs";
import {vocabulary} from "../view/vocabulary.mjs";
import {AUTOCORRECT_SECTION} from "../view/settings-layout.mjs";
import {sectionCard} from "./settings.mjs";
import {AUTOCORRECT_SORTS, LIST_FILE_FORMATS, LIST_FILE_MAX_BYTES, LIST_FILE_TOO_LARGE, WHOLE_WORD, autocorrectRows, countWords, importLines, matchWords, triedAfter, triedWords, usageShare} from "../view/autocorrect.mjs";
import * as edits from "../view/edits.mjs";
import * as controls from "../view/controls.mjs";

const SORT_WORDS = /** @type {const} */ ({correction: "A to Z", typos: "Most typos"});

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
    const add = /** @type {HTMLButtonElement | null} */ (document.querySelector('[data-act="ac-add"]'));
    if (add) add.disabled = !canAdd();
}

// Whether the Add form holds something the core has not refused.
function canAdd() {
    const form = state.autocorrectAdd, answer = state.autocorrectCheck;
    return editGate(getModel(), "autocorrect").editable && Boolean(form.correction.trim() && form.typos.trim()) && !(answer?.form === "add" && answer.error);
}

/** @param {Model} model */
const identityOf = (model) => model?.autocorrectEditing?.identity;

export function screenAutocorrect() {
    const model = getModel(), list = model?.autocorrect;
    const gate = editGate(model, "autocorrect"), canEdit = gate.editable;
    const main = el(`<div class="main">${topbar("Autocorrect", "Typos the keyboard fixes as you finish a word, on any computer.")}</div>`);
    const content = el(`<div class="content"><div class="pad autocorrect stack"></div></div>`);
    const pad = /** @type {HTMLElement} */ (content.firstElementChild);
    main.appendChild(content);
    if (!list) {
        pad.appendChild(el(`<div class="screen-stub"><h3>No autocorrect list read</h3>
            <p class="note">${esc(gate.why || "Choose Read keyboard to read this keyboard's autocorrect list.")}</p></div>`));
        return main;
    }
    // An Add the core took empties its form and opens the entry it made or
    // added to; one it refused keeps what was typed.
    const sent = state.autocorrectAdd.sent;
    if (sent && sent.identity !== identityOf(model)) {
        state.autocorrectOpen = {correction: sent.correction};
        state.autocorrectAdd = {correction: "", typos: "", match: WHOLE_WORD};
        state.autocorrectCheck = null;
    } else if (sent && state.error) state.autocorrectAdd = {...state.autocorrectAdd, sent: undefined};

    if (state.autocorrectImport) pad.appendChild(importCard(model, list, canEdit));
    for (const notice of list.notices) pad.appendChild(el(`<div class="unavailable ac-notice" data-ac-notice>${esc(notice)} Change the host layout back, or edit the marked entries.</div>`));
    // The switch is a setting, edited as the Settings screens' are.
    const onOff = (model?.configDefaults || []).find((section) => section.id === AUTOCORRECT_SECTION);
    if (onOff?.fields.length) pad.appendChild(sectionCard(model, onOff, editGate(model, "settings").editable));
    pad.append(addCard(model, canEdit, gate), tryCard(model, list), filesCard(list, canEdit), listCard(model, list, canEdit));
    takesDrops(pad);
    paintFeedbackLater();
    queueMicrotask(paintTry);
    return main;
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
// fired last, and that entry and its typo are marked in the table.
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
    said.textContent = tried.error || triedWords(tried);
    said.classList.toggle("ac-warning", Boolean(tried.error));
    for (const row of /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll("[data-ac-entry]"))) {
        const fired = Boolean(last) && row.dataset.acEntry === last?.correction;
        row.classList.toggle("fired", fired);
        for (const chip of /** @type {NodeListOf<HTMLElement>} */ (row.querySelectorAll("[data-ac-chip], [data-ac-typo]"))) {
            chip.classList.toggle("fired", fired && (chip.dataset.acChip ?? chip.dataset.acTypo) === last?.typo);
        }
    }
}

/** @param {Model} model @param {NonNullable<NonNullable<Model>["autocorrect"]>} list */
function tryCard(model, list) {
    const tried = state.autocorrectTry;
    const card = el(`<div class="card ac-try"><div class="card-h"><h3>Try it</h3>
        <div class="right">
            <label class="sw" data-tip="Whether Caps Lock is on at the computer. It follows your own Caps Lock as you type here."><input type="checkbox" data-f="autocorrect:try:caps" ${tried.capsLock ? "checked" : ""}><span class="track"></span><span class="txt">Caps Lock is on</span></label>
            <button class="btn ghost" data-act="ac-try-clear">Clear</button>
        </div></div>
        <div class="card-b stack">
            <textarea class="input ac-try-box" data-f="autocorrect:try:text" rows="3" aria-label="Type here to try the list" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Type here as you would on the keyboard: a typo, then a space.">${esc(tried.text)}</textarea>
            <p class="note" data-ac-try-said aria-live="polite"></p>
            <p class="note">This is what the keyboard would leave on screen with the list as it stands in this draft, typing through ${esc(list.layoutName)}. A word is corrected when you end it, and Backspace straight after puts it back. Shortcuts, cursor keys, a held key and macros are the keyboard's alone and are not tried here.</p>
        </div></div>`);
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

// Import, the starter list and Export, in one row over the list.
/** @param {NonNullable<NonNullable<Model>["autocorrect"]>} list @param {boolean} canEdit */
function filesCard(list, canEdit) {
    const off = canEdit ? "" : "disabled", none = list.entries.length ? "" : "disabled";
    const card = el(`<div class="card ac-files"><div class="card-b ac-files-row">
        <button class="btn" data-act="ac-import" ${off} data-tip="A .txt file in QMK's form, a .csv from a spreadsheet, or a .json Ark exported">Import…</button>
        <button class="btn" data-act="ac-starter" ${off} data-tip="Common English typos, each matching the whole word">Add the starter list…</button>
        <span class="note ac-drop-note">or drop a .txt, .csv or .json file here</span>
        <span class="ac-export"><span class="note">Export as</span>
            ${LIST_FILE_FORMATS.map((format) => `<button class="btn" data-act="ac-export" data-format="${esc(format)}" ${none}>${esc(format === "txt" ? "Text" : format.toUpperCase())}</button>`).join("")}</span>
        <p class="note ac-file-status" data-ac-file-status hidden></p>
    </div></div>`);
    card.addEventListener("click", (event) => {
        const button = /** @type {HTMLButtonElement | null} */ (/** @type {HTMLElement} */ (event.target).closest("button[data-act]"));
        if (!button || button.disabled) return;
        if (button.dataset.act === "ac-import") previewImport("choose");
        else if (button.dataset.act === "ac-starter") previewImport("starter");
        else if (button.dataset.act === "ac-export") post(controls.exportAutocorrect(/** @type {typeof LIST_FILE_FORMATS[number]} */ (button.dataset.format)));
    });
    return card;
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

// What the file would do, both ways, and the choice.
/** @param {Model} model @param {NonNullable<NonNullable<Model>["autocorrect"]>} list @param {boolean} canEdit */
function importCard(model, list, canEdit) {
    const asked = /** @type {NonNullable<typeof state.autocorrectImport>} */ (state.autocorrectImport);
    const title = asked.starter ? "Add the starter list" : `Import ${asked.name || "a list"}`;
    const preview = asked.preview;
    /** @param {import("../../contracts/messages.js").AutocorrectImportOutcome} outcome */
    const lines = (outcome) => importLines(outcome, list.usage).map((line) => `<li data-ac-line="${esc(line.kind)}">${esc(line.text)}${line.names?.length
        ? `<span class="ac-names">${line.names.slice(0, NAMES_SHOWN).map((name) => `<span>${esc(name)}</span>`).join("")}${line.names.length > NAMES_SHOWN ? `<span>and ${esc(line.names.length - NAMES_SHOWN)} more</span>` : ""}</span>` : ""}</li>`).join("");
    const changes = (/** @type {import("../../contracts/messages.js").AutocorrectImportOutcome} */ outcome) => outcome.newCorrections.length + outcome.addedTypos.length > 0;
    const card = el(`<div class="card ac-import" data-ac-import role="region" aria-label="${esc(title)}"><div class="card-h"><h3>${esc(title)}</h3>
            <div class="right"><button class="btn ghost" data-act="ac-import-cancel">Cancel</button></div></div>
        <div class="card-b stack">${asked.pending ? `<p class="note">Reading…</p>` : asked.error || !preview ? `<div class="unavailable">${esc(asked.error || "This file could not be read.")}</div>` : `
            <div class="ac-import-ways">
                <section data-ac-way="add"><h4>Add to my list</h4><ul class="ac-import-lines">${lines(preview.add)}</ul>
                    <p class="note">Your list would hold ${esc(preview.add.corrections.toLocaleString("en-US"))} corrections and ${esc(preview.add.typos.toLocaleString("en-US"))} typos.</p>
                    <button class="btn primary" data-act="ac-import-add" ${canEdit && changes(preview.add) ? "" : "disabled"}>Add to my list</button></section>
                <section data-ac-way="replace"><h4>Replace my list</h4><ul class="ac-import-lines">${lines(preview.replace)}</ul>
                    <p class="note">Your list would hold ${esc(preview.replace.corrections.toLocaleString("en-US"))} corrections and ${esc(preview.replace.typos.toLocaleString("en-US"))} typos.</p>
                    <button class="btn" data-act="ac-import-replace" ${canEdit && preview.replace.corrections ? "" : "disabled"}>Replace my list</button></section>
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
// How many names a line of the import's preview lists before it counts the rest.
const NAMES_SHOWN = 12;

// The feedback lines are painted once the screen is in the page.
function paintFeedbackLater() {
    queueMicrotask(paintFeedback);
}

/** @param {Model} model @param {string} f @param {number} current @param {boolean} disabled */
const matchChoice = (model, f, current, disabled) => choiceField({label: "Matches", f, hideLabel: true, disabled,
    choices: vocabulary(model).autocorrectMatches.map(([value, text]) => /** @type {const} */ ([value, text])), current,
    tip: "Where the typo has to be in a word for the keyboard to fix it"});

/** @param {Model} model @param {boolean} canEdit @param {import("../view/edit-gate.mjs").EditGate} gate */
function addCard(model, canEdit, gate) {
    const form = state.autocorrectAdd;
    const card = el(`<div class="card ac-add"><div class="card-h"><h3>Add</h3></div>
        <div class="card-b stack">
            <div class="ac-add-row">
                <label class="field"><span>Correction</span>
                    <input class="input" data-f="autocorrect:add:correction" list="acCorrections" autocomplete="off" spellcheck="false" placeholder="because" value="${esc(form.correction)}" ${canEdit ? "" : "disabled"}></label>
                <label class="field"><span>Typos, with a space between them</span>
                    <input class="input" data-f="autocorrect:add:typos" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="becuase becasue" value="${esc(form.typos)}" ${canEdit ? "" : "disabled"}></label>
                ${matchChoice(model, "autocorrect:add:match", form.match, !canEdit)}
                <button class="btn primary" data-act="ac-add" ${canAdd() ? "" : "disabled"}>Add</button>
            </div>
            <div data-ac-feedback="add" hidden></div>
            ${canEdit || gate.quiet ? "" : `<p class="note">${esc(gate.why)}</p>`}
            <p class="note">Typing a correction the list already has adds the typos to it. Entries are checked against your host layout, ${esc(model?.autocorrect?.layoutName)}.</p>
        </div></div>`);
    const correction = /** @type {HTMLInputElement} */ (card.querySelector('[data-f="autocorrect:add:correction"]'));
    const typos = /** @type {HTMLInputElement} */ (card.querySelector('[data-f="autocorrect:add:typos"]'));
    const read = () => ({correction: correction.value, typos: typos.value, match: Number(choiceValue(/** @type {HTMLElement} */ (card.querySelector(".ac-add-row"))) || WHOLE_WORD)});
    const typed = () => {
        const next = read();
        state.autocorrectAdd = next;
        check("add", next.correction.trim() && next.typos.trim() ? edits.addAutocorrectTypos(next.correction, next.typos, next.match, identityOf(getModel())) : null);
    };
    const keep = () => {
        if (!canAdd()) return;
        const next = read();
        state.autocorrectAdd = {...next, sent: {identity: identityOf(getModel()) || "", correction: next.correction.trim()}};
        state.error = "";
        post(edits.addAutocorrectTypos(next.correction, next.typos, next.match, identityOf(getModel())));
    };
    card.addEventListener("input", typed);
    card.addEventListener("change", typed);
    card.addEventListener("keydown", (event) => { if (event.key === "Enter" && /** @type {HTMLElement} */ (event.target).matches("input:not([type=radio])")) { event.preventDefault(); keep(); } });
    /** @type {HTMLButtonElement} */ (card.querySelector('[data-act="ac-add"]')).addEventListener("click", keep);
    return card;
}

/** @param {Model} model @param {NonNullable<NonNullable<Model>["autocorrect"]>} list @param {boolean} canEdit */
function listCard(model, list, canEdit) {
    const query = state.autocorrectSearch || "";
    const rows = autocorrectRows(list, {query, sort: state.autocorrectSort});
    const changed = draftMarks(model?.draft?.changes).autocorrect;
    const card = el(`<div class="card ac-list"><div class="card-h"><h3>Entries</h3>
        <span class="tag" data-ac-count>${esc(countWords(list.usage))}</span>
        <div class="right">
            ${choiceField({label: "Order", f: "autocorrect:sort", hideLabel: true, choices: AUTOCORRECT_SORTS.map((sort) => /** @type {const} */ ([sort, SORT_WORDS[sort]])), current: state.autocorrectSort})}
            <input class="input search" data-f="autocorrect:search" type="search" aria-label="Search corrections and typos" placeholder="Search" value="${esc(query)}">
        </div></div>
        <div class="card-b stack">
            <datalist id="acCorrections">${list.entries.map((entry) => `<option value="${esc(entry.correction)}"></option>`).join("")}</datalist>
            <div class="ac-rows" role="list"></div>
            ${memoryMeter(list.usage)}
        </div></div>`);
    /** @type {HTMLInputElement} */ (card.querySelector('[data-f="autocorrect:search"]')).addEventListener("input", (event) => { state.autocorrectSearch = /** @type {HTMLInputElement} */ (event.target).value; render(); });
    /** @type {HTMLElement} */ (card.querySelector(".card-h .right")).addEventListener("change", (event) => {
        const picked = /** @type {HTMLInputElement} */ (event.target);
        if (!picked.matches("[type=radio], select")) return;
        state.autocorrectSort = picked.value === "typos" ? "typos" : "correction";
        render();
    });
    const body = /** @type {HTMLElement} */ (card.querySelector(".ac-rows"));
    if (!list.entries.length) {
        const empty = el(`<div class="empty-card" data-ac-empty><p class="note">No entries yet. Add a correction and the ways you mistype it above, import a list, or start from common English typos.</p>
            <button class="btn" data-act="ac-starter-empty" ${canEdit ? "" : "disabled"}>Add the starter list…</button></div>`);
        /** @type {HTMLButtonElement} */ (empty.querySelector("button")).addEventListener("click", () => previewImport("starter"));
        body.replaceWith(empty);
        return card;
    }
    if (!rows.length) {
        body.replaceWith(el(`<p class="note">No correction or typo matches “${esc(query.trim())}”.</p>`));
        return card;
    }
    // The open entry: the one picked, by the spelling it has now or had
    // before a respelling the core has yet to answer; else one a search
    // found by its typo.
    const open = state.autocorrectOpen;
    const opened = (/** @type {Entry} */ entry) => entry.correction === open?.correction || (entry.correction === open?.was && !list.entries.some((other) => other.correction === open.correction));
    for (const row of rows) {
        const isOpen = opened(row.entry) || (row.found.length > 0 && !open);
        body.appendChild(isOpen ? openRow(model, row.entry, canEdit, row.found, changed.has(row.entry.correction)) : closedRow(model, row.entry, row.found, changed.has(row.entry.correction)));
    }
    return card;
}

/** @param {Model} model @param {Entry["typos"][number]} typo @param {boolean} found */
function chip(model, typo, found) {
    const where = matchWords(model, typo.match);
    return `<span class="chip ac-chip ${typo.warnings.length ? "warn" : ""} ${found ? "found" : ""}" data-ac-chip="${esc(typo.typo)}" ${typo.warnings.length ? `data-tip="${esc(typo.warnings.join(" "))}"` : ""}>
        <span class="mono">${esc(typo.typo)}</span>${where ? `<span class="ac-where">${esc(where)}</span>` : ""}</span>`;
}

/** @param {Model} model @param {Entry} entry @param {string[]} found @param {boolean} changed */
function closedRow(model, entry, found, changed) {
    const warned = entry.warnings.length > 0;
    const row = el(`<button class="ac-row ${warned ? "warn" : ""}" role="listitem" data-ac-entry="${esc(entry.correction)}" ${warned ? `data-tip="${esc(entry.warnings.join(" "))}"` : ""}>
        <span class="ac-correction">${esc(entry.correction)}${changed ? draftDot(model?.draft) : ""}</span>
        <span class="ac-arrow" aria-hidden="true">←</span>
        <span class="ac-typos">${entry.typos.map((typo) => chip(model, typo, found.includes(typo.typo))).join("")}</span></button>`);
    row.addEventListener("click", () => { state.autocorrectOpen = {correction: entry.correction}; state.autocorrectCheck = null; render(); });
    return row;
}

/** @param {Model} model @param {Entry} entry @param {boolean} canEdit @param {string[]} found @param {boolean} changed */
function openRow(model, entry, canEdit, found, changed) {
    const id = entry.correction, off = canEdit ? "" : "disabled";
    const row = el(`<div class="ac-row open" role="listitem" data-ac-entry="${esc(id)}" data-ac-open>
        <div class="ac-open-h">
            <label class="field"><span>Correction${changed ? draftDot(model?.draft) : ""}</span>
                <input class="input" data-f="autocorrect:entry:${esc(id)}:correction" data-ac-correction autocomplete="off" spellcheck="false" value="${esc(id)}" ${off}></label>
            <div class="right actions">
                <button class="btn ghost" data-act="ac-close">Done</button>
                <button class="btn ghost destructive" data-act="ac-delete-entry" ${off}>Delete entry</button>
            </div>
        </div>
        ${entry.warnings.map((warning) => `<p class="note ac-warning">${esc(warning)}</p>`).join("")}
        <div class="ac-typo-rows">
            ${entry.typos.map((typo) => `<div class="ac-typo ${found.includes(typo.typo) ? "found" : ""}" data-ac-typo="${esc(typo.typo)}">
                <label class="field"><span class="sr">Typo</span>
                    <input class="input mono" data-f="autocorrect:typo:${esc(typo.typo)}:typo" data-ac-typo-text autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(typo.typo)}" ${off}></label>
                ${matchChoice(model, `autocorrect:typo:${typo.typo}:match`, typo.match, !canEdit)}
                <label class="field"><span class="sr">Move to another correction</span>
                    <input class="input" data-f="autocorrect:typo:${esc(typo.typo)}:move" data-ac-move list="acCorrections" autocomplete="off" spellcheck="false" placeholder="Move to…" value="" ${off}></label>
                <button class="btn ghost icon destructive" data-act="ac-delete-typo" aria-label="Delete the typo ${esc(typo.typo)}" data-tip="Delete this typo" ${off}>×</button>
                ${typo.warnings.map((warning) => `<p class="note ac-warning">${esc(warning)}</p>`).join("")}
            </div>`).join("")}
            <div class="ac-typo new" data-ac-new>
                <label class="field"><span class="sr">Another typo</span>
                    <input class="input mono" data-f="autocorrect:entry:${esc(id)}:new" data-ac-new-text autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Another typo, then Enter" value="" ${off}></label>
                ${matchChoice(model, `autocorrect:entry:${id}:new-match`, WHOLE_WORD, !canEdit)}
            </div>
        </div>
        <div data-ac-feedback="entry" hidden></div>
    </div>`);
    const identity = () => identityOf(getModel());
    /** @param {Edit} edit */
    const keep = (edit) => { state.error = ""; state.autocorrectCheck = null; post(edit); };
    /** @param {Element} node */
    const typoOf = (node) => /** @type {HTMLElement} */ (node.closest("[data-ac-typo]")).dataset.acTypo || "";
    /** @param {Element} node */
    const matchIn = (node) => Number(choiceValue(/** @type {HTMLElement} */ (node.closest(".ac-typo"))) || WHOLE_WORD);
    // What a control would post as it stands, or nothing while it holds
    // what the list already has.
    /** @param {HTMLInputElement} input @returns {Edit | null} */
    const editOf = (input) => {
        const value = input.value;
        if (input.matches("[data-ac-correction]")) return value.trim() && value.trim() !== id ? edits.respellAutocorrectCorrection(id, value, identity()) : null;
        if (input.matches("[data-ac-typo-text]")) return value.trim() && value.trim() !== typoOf(input) ? edits.changeAutocorrectTypo(typoOf(input), {to: value}, identity()) : null;
        if (input.matches("[data-ac-move]")) return value.trim() && value.trim() !== id ? edits.changeAutocorrectTypo(typoOf(input), {correction: value}, identity()) : null;
        if (input.matches("[data-ac-new-text]")) return value.trim() ? edits.addAutocorrectTypos(id, value, matchIn(input), identity()) : null;
        if (input.closest("[data-ac-typo]")) return edits.changeAutocorrectTypo(typoOf(input), {match: Number(input.value)}, identity());
        return null;
    };
    row.addEventListener("input", (event) => {
        const input = /** @type {HTMLInputElement} */ (event.target);
        if (input.matches("input:not([type=radio])")) check("entry", editOf(input));
    });
    // A text field is kept when it is left or Enter is pressed in it; a
    // match as soon as it is picked.
    row.addEventListener("change", (event) => {
        const input = /** @type {HTMLInputElement} */ (event.target);
        // The new typo's match is read when its typo is kept.
        if (input.closest("[data-ac-new]") && !input.matches("[data-ac-new-text]")) return;
        const edit = editOf(input);
        if (!edit) return;
        if (edit.type === "updateAutocorrectCorrection") state.autocorrectOpen = {correction: edit.to.trim(), was: id};
        keep(edit);
    });
    row.addEventListener("keydown", (event) => {
        const input = /** @type {HTMLInputElement} */ (event.target);
        if (event.key === "Enter" && input.matches("input:not([type=radio])")) { event.preventDefault(); input.blur(); if (input.matches("[data-ac-new-text]")) queueMicrotask(() => /** @type {HTMLElement | null} */ (document.querySelector("[data-ac-new-text]"))?.focus()); }
        if (event.key === "Escape" && input.matches("input:not([type=radio])")) { input.value = input.defaultValue; check("entry", null); }
    });
    row.addEventListener("click", (event) => {
        const button = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (event.target).closest("[data-act]"));
        if (!button) return;
        if (button.dataset.act === "ac-close") { state.autocorrectOpen = null; state.autocorrectCheck = null; render(); }
        else if (button.dataset.act === "ac-delete-entry") { state.autocorrectOpen = null; keep(edits.deleteAutocorrectEntry(id, identity())); }
        else if (button.dataset.act === "ac-delete-typo") keep(edits.deleteAutocorrectTypo(typoOf(button), identity()));
    });
    return row;
}

// What the list uses of what the keyboard holds for it.
/** @param {NonNullable<NonNullable<Model>["autocorrect"]>["usage"]} usage */
function memoryMeter(usage) {
    /** @param {number} value */
    const n = (value) => esc(value.toLocaleString("en-US"));
    return `<div class="sect-h memory-h"><h4>Autocorrect memory</h4>
            <span class="right note">${n(usage.bytes)} / ${n(usage.capacity)} bytes</span></div>
        <div class="meter" data-ac-meter>${meterFill(usageShare(usage))}</div>
        <p class="note meter-note">${n(usage.corrections)} of ${n(usage.maxCorrections)} corrections, ${n(usage.typos)} of ${n(usage.maxTypos)} typos and ${n(usage.textBytes)} of ${n(usage.maxTextBytes)} bytes of text. ${n(usage.free)} bytes free; a correction or a typo is at most ${n(usage.textMax)} bytes.</p>`;
}
