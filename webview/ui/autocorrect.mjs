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
import {AUTOCORRECT_SORTS, WHOLE_WORD, autocorrectRows, countWords, matchWords, usageShare} from "../view/autocorrect.mjs";
import * as edits from "../view/edits.mjs";

const SORT_WORDS = /** @type {const} */ ({correction: "A to Z", typos: "Most typos"});

// The check in flight or answered, for the one form being typed in.
let nextCheck = 0;

// Asks the core what `edit` would meet, for the form named `form`.
/** @param {string} form @param {Edit | null} edit */
function check(form, edit) {
    if (!edit || !editGate(getModel(), "autocorrect").editable) { state.autocorrectCheck = null; paintFeedback(); return; }
    const requestId = ++nextCheck;
    state.autocorrectCheck = {form, requestId, pending: true, error: "", warnings: []};
    post(edits.autocorrectValidationMessage(edit, requestId));
}

/** @param {Extract<import("../../contracts/messages.js").PanelResponse, {type: "autocorrectValidation"}>} message */
export function receiveAutocorrectValidation(message) {
    const asked = state.autocorrectCheck, draft = getModel()?.draft;
    if (!asked || asked.requestId !== message.requestId || message.draftId !== draft?.id || message.draftRevision !== draft?.revision) return;
    state.autocorrectCheck = {...asked, pending: false, error: message.validation.error, warnings: message.validation.warnings};
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

    for (const notice of list.notices) pad.appendChild(el(`<div class="unavailable ac-notice" data-ac-notice>${esc(notice)} Change the host layout back, or edit the marked entries.</div>`));
    pad.append(addCard(model, canEdit, gate), listCard(model, list, canEdit));
    paintFeedbackLater();
    return main;
}

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
            <p class="note">Typing a correction the list already has adds the typos to it.</p>
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
        body.replaceWith(el(`<div class="empty-card" data-ac-empty><p class="note">No entries yet. Add a correction and the ways you mistype it above; the keyboard fixes them once the list is saved.</p></div>`));
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
    return `<span class="chip ac-chip ${typo.warnings.length ? "warn" : ""} ${found ? "found" : ""}" ${typo.warnings.length ? `data-tip="${esc(typo.warnings.join(" "))}"` : ""}>
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
