// @ts-check
/**
 * @typedef {import("../../contracts/panel.js").PublishedModel | null} Model
 * @typedef {import("../../contracts/panel.js").AutocorrectEntry} Entry
 * @typedef {import("../../contracts/edits.js").AutocorrectEdit} Edit
 * @typedef {NonNullable<NonNullable<Model>["autocorrect"]>} List
 * @typedef {NonNullable<import("../state.js").PanelState["autocorrectNew"]>} Fresh
 * @typedef {NonNullable<import("../state.js").PanelState["autocorrectCheck"]>} Check
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
// One the list already has is offered to be opened instead. A replacement
// whose last input is removed leaves the list the same way, and stays open
// as one being made, for the input that puts it back.
//
// A list comes in from a file (QMK's text, a spreadsheet's CSV or Ark's JSON,
// D-L85), chosen or dropped on the screen. Ark ships no list of its own
// (D-L90): a list is what a person makes or imports. The core
// reads it and says what it would do in a sheet, as a backup is compared
// before it is used; nothing changes until Add to my list or Replace my list
// is chosen. Export saves the list in any of the three.
//
// Try it is a box typed in as anywhere, which Ark never changes, and under
// it a preview: the core runs what was typed through the draft's list by the
// keyboard's rules (firmware autocorrect-v1.md) and the preview shows what
// the keyboard would type with the draft's list (D-L86).
//
// The screen holds no rule of the list (D-L84). What is typed is checked by
// the core against the draft as it stands, which answers with the refusal the
// edit would meet, what it would newly warn about, and the entry its
// replacement is in the list. An edit is posted only once that check has
// passed, so what the core refuses stays in its field with the reason under
// it; the core still has the last word on the edit itself. A replacement is
// called what the core calls it (each entry's `label`), and a field's text
// goes to the core as it was typed.

import {el, esc, watchPressOutside} from "../lib/dom.mjs";
import {menuKey} from "../lib/menu-keys.mjs";
import {meterFill} from "./meter.mjs";
import {choiceField} from "./segmented.mjs";
import {topbar} from "./frame.mjs";
import {dialogFoot} from "./dialog-foot.mjs";
import {openPicker} from "./picker.mjs";
import {attachInfoMarks, infoMark} from "./info-mark.mjs";
import {marked, phraseMarked, replacementMark} from "./marks.mjs";
import {titleText} from "./title-name.mjs";
import {settingOffBanner, settingSwitchedOff} from "./participation.mjs";
import {getModel, post, render, state} from "../store.mjs";
import {editGate} from "../view/edit-gate.mjs";
import {keyIdentity} from "../view/key-identity.mjs";
import {keycodePlacements, reachLine} from "../view/placements.mjs";
import {draftDot, draftMarks} from "../view/review.mjs";
import {macroNamed, vocabulary, word} from "../view/vocabulary.mjs";
import {LIST_FILE_MAX_BYTES, LIST_FILE_TOO_LARGE, addedReplacement, autocorrectRows, bytesWords, countWords, freeWords, importLines,
    leaderTriedWords, openEntry, replacementOf, textCount, triedAfter, triedWords, usageWords} from "../view/autocorrect.mjs";
import * as edits from "../view/edits.mjs";
import * as controls from "../view/controls.mjs";

// How it works, behind each section's info mark rather than written under
// it: what a replacement does and when, how an input is written, and what
// the preview can and cannot show. Every figure in them is the keyboard's,
// as the list publishes it.
/** @param {List} list */
const replacementInfo = (list) => infoMark({id: "ac-info-replacement", label: "How a replacement works", heading: "How a replacement works", rows: [
    {term: "When", says: "As you finish a word with a space, punctuation, Enter or Tab. A word you are still typing is never touched."},
    {term: "Capitals", says: "Follow what you typed: Teh becomes The, TEH becomes THE. A replacement written with capitals keeps them."},
    {term: "Backspace", says: "Right after a replacement, Backspace puts back what you typed. Not after Enter or Tab."},
    {term: "Text", says: `One line, up to ${list.usage.correctionMax} bytes: a word, a phone number, an address.`},
    {term: "Macro", says: "For anything longer or on several lines. It plays for whole-word inputs only, keeps no capitals rule, and Backspace does not take it back."},
    {term: "Starting over", says: "A click, a shortcut or an arrow key starts a new word. The keyboard cannot see a password field or a terminal: turn text replacement off there."},
    {term: "On and off", says: "Settings → Host, or a key set to Text replacement on, off or toggle."}]});
/** @param {List} list */
const inputsInfo = (list) => infoMark({id: "ac-info-inputs", label: "How inputs are written, and the * wildcard", heading: "How inputs are written",
    lead: "An input matches a whole word. Add *, the wildcard, where other letters may go: one input then catches every form of a word, and only the part you wrote is replaced.",
    rows: [
    {term: "teh", mono: true, says: "No *: only the word teh itself."},
    {term: "recieve*", mono: true, says: "* at the end: words that start with recieve. For receive, it also fixes recieved and recieving."},
    {term: "*mnet", mono: true, says: "* at the start: words that end in mnet. For ment, it fixes developmnet and managemnet."},
    {term: "*tihng*", mono: true, says: "* at both ends: tihng anywhere in a word. For thing, it fixes anytihng and tihngs."},
    {term: "Where * goes", says: "Only at the start, the end or both. Not in the middle: re*ve is refused."},
    {term: "Short inputs", says: `With *, an input under ${list.usage.shortInput} letters can catch real words, so Ark warns about it.`},
    {term: "Capitals", says: "Do not matter: teh also catches Teh and TEH."},
    {term: "Characters", says: `Letters, digits and apostrophes, up to ${list.usage.textMax} bytes.`},
    {term: "Several", says: "Type them with spaces between to add more than one at once."},
    {term: "Overlaps", says: "The longest input wins, and a whole word beats a wildcard."},
    {term: "Macros", says: "A replacement that plays a macro takes whole words only, without *."},
    {term: "After Leader", says: "Typed after the Leader key, an input is matched whole, whatever its *. How it fires is set above."}]});
// How a replacement fires (D-L91), each choice in the vocabulary's words.
/** @param {Model} model */
const firesInfo = (model) => {
    const modes = vocabulary(model).inputModes;
    return infoMark({id: "ac-info-fires", label: "How a replacement fires", heading: "How a replacement fires", lead: "Its inputs stay the same whichever you choose.", rows: [
        {term: word(modes, "word"), says: "Replaced as you finish the word."},
        {term: word(modes, "leader"), says: "Typed after the Leader key, and sent the moment it is typed: the computer never sees what you typed."},
        {term: word(modes, "both"), says: "Either way."}]});
};

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
/** @param {boolean} shown */
const editMacroLink = (shown) => shown ? `<button class="btn tiny link" data-act="ac-edit-macro" data-tip="Open this macro in Macros, to see or change its steps.">Edit in Macros →</button>` : "";
/** @param {Model} model @param {number | null} slot */
const macroName = (model, slot) => slot === null ? "" : macroNamed(model?.macros?.[slot]);

// ── checking what is typed ──────────────────────────────────────────────

// The check in flight or answered, for the one field being typed in, and
// what waits on a check's answer before it is kept: an edit is posted only
// once the core has said it would take it.
let nextCheck = 0;
/** @type {{requestId: number, then: (answer: Check) => void, refused: (error: string) => void} | null} */
let awaiting = null;

// Asks the core what `edit` would meet, for the field named `form`; the
// request that asks it, or 0 when there is nothing to ask. An edit asked
// already is not asked twice.
/** @param {Check["form"]} form @param {Edit | null} edit */
function check(form, edit) {
    if (!edit || !editGate(getModel(), "autocorrect").editable) { state.autocorrectCheck = null; paintFeedback(); return 0; }
    const asked = JSON.stringify(edit);
    // What the last answer said stands until this one comes, so the line
    // does not blink as each letter is typed; another field's is dropped.
    const last = state.autocorrectCheck?.form === form ? state.autocorrectCheck : null;
    if (last?.asked === asked && last.requestId) return last.requestId;
    const requestId = ++nextCheck;
    state.autocorrectCheck = {form, requestId, asked, pending: true, error: "", warnings: last?.warnings || []};
    post(edits.autocorrectValidationMessage(edit, requestId));
    paintFeedback();
    return requestId;
}

// Does `then` with the check's answer once the core would take `edit`, at
// once when it has already said so; `refused` with its reason when it would
// not, or with none when the draft changed under the question.
/** @param {Check["form"]} form @param {Edit} edit @param {(answer: Check) => void} then @param {(error: string) => void} [refused] */
function whenChecked(form, edit, then, refused = () => {}) {
    const requestId = check(form, edit), answer = state.autocorrectCheck;
    if (!requestId || !answer) return;
    if (answer.pending) awaiting = {requestId, then, refused};
    else if (answer.error) refused(answer.error);
    else then(answer);
}

/** @param {Extract<import("../../contracts/messages.js").PanelResponse, {type: "autocorrectValidation"}>} message */
export function receiveAutocorrectValidation(message) {
    const asked = state.autocorrectCheck, draft = getModel()?.draft;
    const stale = message.draftId !== draft?.id || message.draftRevision !== draft?.revision;
    const waiting = awaiting?.requestId === message.requestId ? awaiting : null;
    if (waiting) awaiting = null;
    const mine = asked?.requestId === message.requestId ? asked : null;
    /** @type {Check | null} */
    const answer = mine && !stale ? {...mine, pending: false, error: message.validation.error, warnings: message.validation.warnings, entry: message.validation.entry,
        label: message.validation.label, listed: message.validation.listed, listedSaid: message.validation.listedSaid} : null;
    // An answer about a draft that has moved on answers nothing: the next
    // key asks again.
    if (mine) state.autocorrectCheck = answer;
    // A replacement being made learns what it is called, and whether the
    // list has it already.
    const fresh = state.autocorrectNew;
    if (answer?.form === "new" && fresh && !fresh.sent) {
        // Whether the list has it is true whatever is wrong with its input.
        const joins = answer.listed && answer.entry !== undefined ? {entry: answer.entry, said: answer.listedSaid || ""} : null;
        const label = answer.label ?? fresh.label;
        const redraw = (joins?.entry ?? null) !== (fresh.joins?.entry ?? null);
        state.autocorrectNew = {...fresh, joins, label};
        if (redraw) render();
        else if (label) { const shown = /** @type {HTMLElement | null} */ (document.querySelector("[data-ac-new-item] .v")); shown?.replaceWith(el(`<span class="v">${named_(getModel(), label, fresh.kind === "macro")}</span>`)); }
    }
    paintFeedback();
    if (!waiting) return;
    if (stale) waiting.refused("");
    else if (message.validation.error) waiting.refused(message.validation.error);
    else waiting.then(answer ?? {form: "input", requestId: message.requestId, asked: "", pending: false, error: "", warnings: message.validation.warnings,
        entry: message.validation.entry, listed: message.validation.listed});
}

// The answer under the field it is for; the other fields' lines are emptied.
function paintFeedback() {
    const answer = state.autocorrectCheck;
    for (const line of /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll("[data-ac-feedback]"))) {
        const mine = answer && line.dataset.acFeedback === answer.form ? answer : null;
        line.hidden = !mine || (!mine.error && !mine.warnings.length);
        line.replaceChildren(...(!mine ? [] : mine.error ? [el(`<div class="unavailable">${esc(mine.error)}</div>`)]
            : mine.warnings.map((warning) => el(`<p class="note warn">${esc(warning)}</p>`))));
    }
}

// ── inputs entered one after another ────────────────────────────────────

// What was entered into the field that adds inputs and is not in the list
// yet. The field is emptied as Enter is pressed, so the next input can be
// typed at once; each entry waits its turn here, is checked, and is posted
// once the one before it has been answered. One the core refuses goes back
// into the field with everything behind it, the reason under it.
/** @type {string[]} */
let entered = [];
/** @type {string | null} */
let adding = null;      // the entry being checked or posted now
let returned = "";      // what the next draw gives back to the field
// What waits on a check is dropped with them only when it is one of theirs.
function dropEntered() { if (adding !== null) awaiting = null; entered = []; adding = null; returned = ""; }

// What was refused, and what waited behind it, back before what the field
// holds now, with a space after it when the field was empty: whoever is
// still typing there types the next input, not more letters of that one.
/** @param {string} [reason] */
function giveBack(reason = "") {
    const field = /** @type {HTMLInputElement | null} */ (document.querySelector("[data-ac-more]"));
    const held = field?.value.trim() || "", back = [adding, ...entered, returned].filter(Boolean).join(" ");
    adding = null;
    entered = [];
    returned = "";
    if (field && back) field.value = held ? `${back} ${held}` : `${back} `;
    if (reason) { state.autocorrectCheck = {form: "input", requestId: 0, asked: "", pending: false, error: reason, warnings: []}; paintFeedback(); }
}

// Checks the next entry and posts it; the model's answer brings the one after.
function addNext() {
    if (adding !== null || !entered.length) return;
    const editing = state.autocorrectEdit, model = getModel();
    const entry = editing?.part === "more" && !editing.sent ? model?.autocorrect?.entries.find((candidate) => candidate.id === editing.entry) : null;
    if (!entry || !editGate(model, "autocorrect").editable) { if (!editing?.sent) giveBack(); return; }
    const text = /** @type {string} */ (entered.shift());
    const edit = edits.addAutocorrectInputs(replacementOf(entry), text, identityOf(model));
    adding = text;
    whenChecked("input", edit, () => {
        state.autocorrectEdit = {.../** @type {NonNullable<typeof state.autocorrectEdit>} */ (state.autocorrectEdit ?? editing), sent: identityOf(getModel()) || ""};
        keep(edit);
    }, giveBack);
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
    // What heads the screen runs across both panes, each a callout: the
    // switch's banner, and what the host layout cannot type, which the core
    // says whole. A list that cannot be edited now says nothing here, as
    // Macros says nothing: its controls are off, and the rail and the commit
    // bar say why.
    const heads = el(`<div class="library-head stack"></div>`);
    // With a leader input on the list the leader still sends (D-L91).
    if (settingSwitchedOff(model, "autocorrect")) heads.appendChild(list.usage.leaders > 0 ? settingOffBanner("autocorrect", vocabulary(model).settingOff.leading.list) : settingOffBanner("autocorrect"));
    for (const notice of list.notices) heads.appendChild(el(`<div class="callout caution" data-ac-notice>${esc(notice)}</div>`));
    if (heads.childElementCount) pad.appendChild(heads);

    const rows = autocorrectRows(list, {query: state.autocorrectSearch || "", macros: model?.macros});
    const fresh = state.autocorrectNew?.shown ? state.autocorrectNew : null;
    // With replacements in the list one is always open: the empty pattern is
    // for a list that has none.
    const entry = fresh ? null : openEntry(list, rows, state.autocorrectEntry, model?.macros);
    pad.append(bank(model, list, rows, entry, canEdit),
        fresh ? newEditor(model, list, fresh, canEdit) : entry ? entryEditor(model, list, entry, canEdit) : emptyEditor(canEdit),
        el(`<div class="ac-drop" aria-hidden="true"><span>Drop a .txt, .csv or .json list to import it</span></div>`));
    takesDrops(pad);
    // A file being chosen shows nothing until there is one: the system's own
    // chooser is the dialog then.
    if (state.autocorrectImport && !(state.autocorrectImport.pending && state.autocorrectImport.choosing)) main.appendChild(importSheet(canEdit));
    queueMicrotask(paintFeedback);
    queueMicrotask(paintTry);
    queueMicrotask(() => watchOpenField(pad));
    // The field that adds inputs is open to be typed in: after the list takes
    // one, it is where the next goes, and what it refused is back in it.
    if (state.autocorrectEdit?.part === "more" && !state.autocorrectImport) queueMicrotask(() => {
        const field = /** @type {HTMLInputElement | null} */ (document.querySelector("[data-ac-more]"));
        if (!field) return;
        if (returned) { field.value = field.value.trim() ? `${returned} ${field.value.trim()}` : `${returned} `; returned = ""; }
        // Left for something else, it does not take the focus back.
        if (!state.autocorrectEdit?.left) field.focus();
        addNext();
    });
    return main;
}

// What the core's answer leaves of the forms. A new replacement the list took
// is the entry open from then on, with the field for its next input ready. An
// edit it took closes the field it came from, but for the field that adds
// inputs, which stays for the next one unless it was left; an entry whose
// replacement changed is followed to where it is now, which the check said
// before the edit was posted. An edit it refused keeps what was typed.
/** @param {Model} model @param {List} list */
function settle(model, list) {
    const fresh = state.autocorrectNew, editing = state.autocorrectEdit, identity = identityOf(model) || "";
    /** @param {string | undefined} id */
    const entryOf = (id) => list.entries.find((entry) => entry.id === id);
    if (fresh?.sent && fresh.sent !== identity) {
        const made = entryOf(fresh.made);
        state.autocorrectNew = null;
        state.autocorrectCheck = null;
        // Left for another replacement while it was on its way, it does not
        // take the editor back.
        if (made && fresh.shown) Object.assign(state, {autocorrectEntry: made.id, autocorrectEdit: {entry: made.id, part: "more"}});
    } else if (fresh?.sent && state.error) state.autocorrectNew = {...fresh, sent: undefined};
    // A replacement whose last input was removed waits as one being made.
    // Refused, it is the entry it was; once the removal lands it is asked
    // about as any new one is; and Undo, bringing it back as it was, opens it.
    if (fresh?.emptied && !fresh.sent) {
        const back = entryOf(fresh.emptied.entry), named = addedReplacement(fresh);
        const reopen = () => { state.autocorrectNew = null; if (fresh.shown && back) state.autocorrectEntry = back.id; };
        if (fresh.emptied.sent && state.error) reopen();
        else if (fresh.emptied.sent && fresh.emptied.sent !== identity) state.autocorrectNew = {...fresh, emptied: {entry: fresh.emptied.entry}};
        else if (!fresh.emptied.sent && back && !fresh.input?.trim() && named
            && ("macro" in named ? back.macro === named.macro : back.macro === undefined && back.correction === named.correction)) reopen();
    }
    if (editing?.sent && editing.sent !== identity) {
        const now = entryOf(editing.follow ?? editing.entry);
        if (now && state.autocorrectEntry === editing.entry) state.autocorrectEntry = now.id;
        state.autocorrectEdit = editing.part === "more" && now && !(editing.left && !entered.length) ? {entry: now.id, part: "more", ...(editing.left ? {left: true} : {})} : null;
        state.autocorrectCheck = null;
        if (editing.part === "more") adding = null;
        if (!state.autocorrectEdit) dropEntered();
    } else if (editing?.sent && state.error) {
        state.autocorrectEdit = {...editing, sent: undefined};
        // What the core refused after all, and what waited behind it, go back
        // into the field at the next draw.
        if (editing.part === "more") { returned = [adding, ...entered].filter(Boolean).join(" "); adding = null; entered = []; }
    }
    // An entry that is gone has nothing open.
    if (state.autocorrectEdit && !entryOf(state.autocorrectEdit.entry)) { state.autocorrectEdit = null; dropEntered(); }
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
        // An input entered and still on its way keeps its field until it lands.
        if (adding !== null || entered.length) { if (state.autocorrectEdit?.part === "more") state.autocorrectEdit = {...state.autocorrectEdit, left: true}; return; }
        state.autocorrectEdit = state.autocorrectEdit?.part === "kind" ? state.autocorrectEdit : null;
        state.autocorrectExport = false;
        state.autocorrectCheck = null;
        // The press is whatever it lands on's to answer first, a control on
        // this screen or the rail: redrawing now would take it from under
        // the click, so the redraw waits for the press to be let go, and
        // comes whether or not it made a click (a drag, a right-click).
        let drawn = false;
        const redraw = () => { if (drawn) return; drawn = true; document.removeEventListener("click", redraw); render(); };
        document.addEventListener("click", redraw, {once: true});
        document.addEventListener("pointerup", () => setTimeout(redraw), {once: true});
    });
}

// ── the bank ────────────────────────────────────────────────────────────

// The entry picked in the bank is the one open; a new replacement with
// nothing in it yet is let go, one begun waits at the top of the list.
/** @param {string} id */
function openInEditor(id) {
    const fresh = state.autocorrectNew;
    dropEntered();
    Object.assign(state, {autocorrectEntry: id, autocorrectEdit: null, autocorrectCheck: null,
        autocorrectNew: fresh && addedReplacement(fresh) ? {...fresh, shown: false} : null});
    render();
}

function openNew() {
    const fresh = state.autocorrectNew || {kind: /** @type {const} */ ("text"), text: "", macro: null, input: "", joins: null, shown: true};
    dropEntered();
    Object.assign(state, {autocorrectNew: {...fresh, shown: true}, autocorrectEdit: null, autocorrectCheck: null});
    render();
    focusLater("[data-ac-new] [data-ac-text], [data-ac-new] [data-act=\"ac-pick\"]");
}

/** @param {Model} model @param {List} list @param {ReturnType<typeof autocorrectRows>} rows @param {Entry | null} open @param {boolean} canEdit */
function bank(model, list, rows, open, canEdit) {
    const query = state.autocorrectSearch || "", fresh = state.autocorrectNew, searching = Boolean(query.trim());
    const changed = draftMarks(model?.draft?.changes).autocorrect;
    const off = canEdit ? "" : "disabled", none = list.entries.length ? "" : "disabled";
    const menu = state.autocorrectExport;
    // New is for the whole list: a search shows what it found and nothing
    // else, as Macros' does.
    const card = el(`<div class="card bank" data-ac-bank><div class="card-h"><h3>Replacements</h3>
            <input class="input search card-search" id="replacementSearch" data-f="autocorrect:search" type="search" aria-label="Search replacements and inputs" placeholder="Search replacements and inputs" value="${esc(query)}">
            <span class="tag" data-ac-usage>${esc(usageWords(list.usage))}</span></div>
        <div class="card-b">
            <div class="macro-grid ac-bank" role="group" aria-label="Replacements"></div>
            ${searching ? "" : `<button type="button" class="mslot new-slot ac-new" data-act="ac-add" ${off} data-tip="Make a replacement: its text or macro, then its inputs."><span class="v">+ New replacement</span></button>`}
            <div class="row ac-files">
                <button class="btn tiny" data-act="ac-import" ${off} data-tip="${IMPORT_TIP}">Import…</button>
                <div class="ac-export" ${menu ? "data-ac-menu" : ""}><button class="btn tiny" id="ac-export" data-act="ac-export-menu" aria-haspopup="menu" aria-expanded="${menu ? "true" : "false"}" ${none}
                        data-tip="Save this list as a file: QMK's text, a spreadsheet's CSV, or Ark's JSON.">Export</button>
                    ${menu ? `<div class="rail-menu ac-menu" role="menu" aria-labelledby="ac-export">${vocabulary(model).listFileFormats.map(([format, words]) =>
                        `<button class="rail-menu-item" role="menuitem" tabindex="-1" data-act="ac-export" data-format="${esc(format)}">${esc(words)}</button>`).join("")}</div>` : ""}</div>
            </div>
            <p class="note profile-drop-status" data-ac-file-status role="status" hidden></p>
            <div class="sect-h memory-h"><h4>Text replacement memory</h4><span class="right note" data-ac-memory>${esc(bytesWords(list.usage))}</span></div>
            <div class="meter" data-ac-meter data-tip="Part of the profile, within its own limit.">${meterFill(list.usage.share * 100)}</div>
            <p class="note meter-note"><span data-ac-free>${esc(freeWords(list.usage))}</span>, in <span data-ac-count>${esc(countWords(list.usage))}</span>. A replacement holds up to ${esc(list.usage.correctionMax)} bytes of text and an input up to ${esc(list.usage.textMax)}; an accented letter takes two or more.</p>
        </div></div>`);
    const cells = /** @type {HTMLElement} */ (card.querySelector(".ac-bank"));
    /** @type {HTMLInputElement} */ (card.querySelector("#replacementSearch")).addEventListener("input", (event) => { state.autocorrectSearch = /** @type {HTMLInputElement} */ (event.target).value; render(); });
    if (fresh && !searching) {
        const named = addedReplacement(fresh);
        const cell = el(`<button type="button" class="mslot ac-item" data-ac-new-item aria-current="${esc(fresh.shown)}">
            <span class="ac-item-head"><span class="v">${!named ? "New replacement" : named_(model, fresh.label || (fresh.kind === "macro" ? macroName(model, fresh.macro) : fresh.text.trim()), fresh.kind === "macro")}</span>${firesTag(model, fresh.fires ?? "word")}</span>
            <span class="n">not on your list yet</span></button>`);
        cell.addEventListener("click", openNew);
        cells.appendChild(cell);
    }
    for (const row of rows) cells.appendChild(item(model, row, row.entry.id === open?.id, changed.has(row.entry.id)));
    if (!rows.length && searching) cells.appendChild(el(`<p class="note" data-ac-none>No replacement or input matches “${esc(query.trim())}”.</p>`));
    if (!cells.childElementCount) cells.remove();
    const closeMenu = () => { state.autocorrectExport = false; render(); focusLater("#ac-export"); };
    card.addEventListener("click", (event) => {
        const button = pressed(event);
        if (!button) return;
        const act = button.dataset.act;
        if (act === "ac-add") openNew();
        else if (act === "ac-import") previewImport("choose");
        else if (act === "ac-export-menu") { state.autocorrectExport = !state.autocorrectExport; render(); focusLater(state.autocorrectExport ? ".ac-menu [role=menuitem]" : "#ac-export"); }
        else if (act === "ac-export") { post(controls.exportAutocorrect(/** @type {import("../../contracts/messages.js").AutocorrectFileFormat} */ (button.dataset.format))); closeMenu(); }
    });
    // The menu is a menu from the keyboard, the rail's own keys (lib/menu-keys.mjs).
    card.querySelector(".ac-export")?.addEventListener("keydown", (event) => {
        const items = /** @type {HTMLElement[]} */ ([...card.querySelectorAll(".ac-menu [role=menuitem]")]);
        if (items.length) menuKey(/** @type {KeyboardEvent} */ (event), items, closeMenu);
    });
    return card;
}

// A replacement as it is listed: what the core calls it, a macro's after the
// macros' mark, as the picker and Review show a macro (markup).
/** @param {Model} model @param {string} label @param {boolean} macro */
const named_ = (model, label, macro) => macro ? marked(model, {kind: "macro"}, label) : esc(label);

// How a replacement fires, as a tag on its line in the bank, in the words of
// its switch (D-L91): one for each way, so After Leader and Both are told
// apart at a glance.
/** @param {Model} model @param {"word" | "leader" | "both"} fires */
const firesTag = (model, fires) => `<span class="tag ac-fires" data-ac-fires="${esc(fires)}">${esc(word(vocabulary(model).inputModes, fires))}</span>`;

// A replacement in the bank: what the core calls it on one line, with how it
// fires beside it, and its inputs under it. An input a search found is
// marked.
/** @param {Model} model @param {ReturnType<typeof autocorrectRows>[number]} row @param {boolean} open @param {boolean} changed */
function item(model, {entry, found}, open, changed) {
    const warned = entry.warnings.length > 0 || entry.typos.some((typo) => typo.warnings.length);
    const tip = `${entry.label} · ${word(vocabulary(model).inputModes, entry.fires).toLowerCase()} · inputs: ${entry.typos.map((typo) => typo.input).join(", ")}${warned ? " · has a warning" : ""}`;
    const cell = el(`<button type="button" class="mslot filled ac-item ${warned ? "caution" : ""}" data-ac-entry="${esc(entry.id)}" aria-current="${esc(open)}" data-tip="${esc(tip)}">
        <span class="ac-item-head"><span class="v">${named_(model, entry.label, entry.macro !== undefined)}</span>${firesTag(model, entry.fires)}</span>${changed ? draftDot(model?.draft, "corner") : ""}
        <span class="n">${entry.typos.map((typo) => `<span ${found.includes(typo.typo) ? `class="found"` : ""} data-ac-input="${esc(typo.typo)}">${esc(typo.input)}</span>`).join(" ")}</span></button>`);
    cell.addEventListener("click", () => openInEditor(entry.id));
    return cell;
}

// ── the editor ──────────────────────────────────────────────────────────

const ICON = `<span class="mark-lg">${replacementMark()}</span>`;

// What a replacement is: Text or Macro, in the vocabulary's words, then its
// text with the bytes it may hold, or its macro named in a read-only field
// with Pick… beside it, as a custom key's shortcut is: the keycode picker on
// the macros alone. Opening the macro in Macros is the header's link. `f`
// names the fields' form identities; `pending` says a choice of Text or Macro
// made and not kept yet.
/** @param {Model} model @param {string} f @param {Named} value @param {boolean} canEdit @param {number} most @param {string} [pending] */
function replacementControls(model, f, value, canEdit, most, pending = "") {
    const off = canEdit ? "" : "disabled", macros = model?.macros || [];
    const count = textCount(value.text, most);
    const name = macroName(model, value.macro);
    return `<div class="ac-replacement">${choiceField({label: "Replacement is", f: `${f}:kind`, hideLabel: true, disabled: !canEdit, choices: vocabulary(model).replacementKinds, current: value.kind})}
        ${value.kind === "macro" ? `<div class="input-row ac-macro">
                <input class="input" data-f="${esc(f)}:macro" data-ac-macro="${esc(value.macro ?? "")}" aria-label="Macro" value="${esc(name)}" placeholder="No macro yet" readonly ${off}
                    data-tip="${esc(name ? `Plays the macro “${name}”.` : "Pick the macro this replacement plays.")}">
                <button type="button" class="btn" data-act="ac-pick" ${canEdit && (value.macro !== null || macros.some((macro) => !macro.empty)) ? "" : "disabled"}>Pick…</button></div>
            ${value.macro === null && !macros.some((macro) => !macro.empty) ? `<p class="note ac-macro-none">No macro has steps yet. <button type="button" class="btn tiny link" data-act="ac-macros">Make one in Macros →</button></p>` : ""}`
        : `<label class="field ac-text"><span class="sr">Replacement text</span>
            <input class="input" data-f="${esc(f)}:replacement" data-ac-text autocomplete="off" spellcheck="false" placeholder="because, or +31 6 1234 5678" value="${esc(value.text)}" ${off}>
            <span class="note ac-bytes${count.over ? " warn" : ""}" data-ac-bytes>${esc(count.label)}</span></label>`}
        ${pending ? `<p class="note ac-macro-none" data-ac-pending>${esc(pending)}</p>` : ""}</div>`;
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

// The Leader key's cap, drawn before Try it's field for what is typed after
// it, and before where the key is placed under Fires.
/** @param {Model} model */
const leaderCap = (model) => `<span class="kbd ac-leader-key" aria-hidden="true">${esc(vocabulary(model).leaderKey)}</span>`;
// How a replacement fires (D-L91): as you type, after the Leader key, or
// both. Its inputs are one list whichever.
/** @param {Model} model @param {string} f @param {boolean} canEdit @param {"word" | "leader" | "both"} current */
const firesField = (model, f, canEdit, current) => choiceField({label: "How it fires", f: `${f}:fires`, hideLabel: true, disabled: !canEdit, choices: vocabulary(model).inputModes, current});
// What a field for an input shows before it is typed in: an example, a
// word's as the field gives it (`words`).
/** @param {"word" | "leader" | "both"} fires @param {boolean} macro @param {string} [words] */
const inputPlaceholder = (fires, macro, words = "teh or recieve*") => `${macro ? "sig" : fires === "leader" ? "pn or sig" : words}, then Enter`;
// A new replacement's first input gives a word's example of its own.
const FIRST_INPUT = "becuase or recieve*";
// What the Leader key is, said where a replacement fires after it; what each
// choice of how it fires means is its info mark (firesInfo).
const LEADER_NOTE = "Press the Leader key, then type one of its inputs: the keyboard sends this replacement, and the computer never sees what you typed. How long it waits for you is Leader waits, on Host.";
// The Leader key as core names it (LEADER_KEY_NAME in core/schema/actions.js).
const LEADER_KEY = "QK_LEADER";
// Under the switch while a replacement fires after Leader: what the Leader
// key does, where it is placed (keys by layer, behaviours, combos), and Place
// on a key →, as a macro's and a pointing mode's editors have it.
/** @param {Model} model */
function leaderRow(model) {
    return `<div class="stack ac-leader" data-ac-leader-note><p class="note">${esc(LEADER_NOTE)}</p>
        <div class="ac-leader-place" role="group" aria-label="Where the Leader key is">${leaderCap(model)}
            <span class="note" data-ac-leader-placed>${phraseMarked(model, reachLine(keycodePlacements(model, [LEADER_KEY])))}</span>
            <button type="button" class="btn tiny link" data-act="ac-place-leader" ${editGate(model, "keys").editable ? "" : "disabled"}
                data-tip="Put the Leader key on a key you pick on the board.">Place on a key →</button></div></div>`;
}
// Place on a key → puts the Leader key on a key picked on the board.
function placeLeader() {
    Object.assign(state, {placement: {keycode: LEADER_KEY}, screen: "keys", tab: "key"});
    render();
}

// A replacement the list has, open: its header, what it is, its inputs, and
// Try it.
/** @param {Model} model @param {List} list @param {Entry} entry @param {boolean} canEdit */
function entryEditor(model, list, entry, canEdit) {
    const off = canEdit ? "" : "disabled", kinds = vocabulary(model).replacementKinds;
    const editing = state.autocorrectEdit?.entry === entry.id ? state.autocorrectEdit : null;
    const stored = entry.macro === undefined ? "text" : "macro";
    const kind = editing?.kind ?? stored;
    // Text or Macro picked and not yet kept shows that kind's field empty,
    // and says what keeps it: the header and the list still have the other.
    const value = {kind, text: kind === stored ? entry.correction : "", macro: kind === stored ? entry.macro ?? null : null};
    const pending = kind === stored ? "" : kind === "macro" ? `Still ${word(kinds, stored)} until you pick a macro.` : `Still ${word(kinds, stored)} until you type its text and press Enter.`;
    const card = el(`<div class="card ac-editor" data-ac-editor="${esc(entry.id)}">
        <div class="card-h name-titlebar">${ICON}${titleText(entry.label)}
            <span class="tag" data-ac-kind>${esc(word(kinds, stored))}</span>
            <span class="right row actions">
                ${editMacroLink(kind === "macro" && value.macro !== null)}
                <button class="btn tiny ghost destructive" data-act="ac-delete" ${off} data-tip="Delete this replacement and its inputs. Undo takes it back.">Delete replacement</button></span></div>
        <div class="card-b stack">
            <div class="macro-sequence-heading"><h4>Replacement</h4>${replacementInfo(list)}</div>
            ${replacementControls(model, `autocorrect:entry:${entry.id}`, value, canEdit, list.usage.correctionMax, pending)}
            ${entry.warnings.map((warning) => `<p class="note warn" data-ac-warning>${esc(warning)}</p>`).join("")}
            <div data-ac-feedback="replacement" hidden></div>
            <div class="macro-sequence-heading"><h4>Fires</h4>${firesInfo(model)}</div>
            ${firesField(model, `autocorrect:entry:${entry.id}`, canEdit, entry.fires)}
            ${entry.fires === "word" ? "" : leaderRow(model)}
            <div class="macro-sequence-heading"><h4>Inputs</h4>${inputsInfo(list)}</div>
            <div class="ac-inputs" role="group" aria-label="Inputs">
                ${entry.typos.map((typo) => editing?.part === "input" && editing.typo === typo.typo
                    ? `<span class="ac-chip-edit" data-ac-open data-ac-chip-edit="${esc(typo.typo)}">
                        <input class="input mono ac-chip-input" data-f="autocorrect:entry:${esc(entry.id)}:input:${esc(typo.typo)}" data-ac-input-text aria-label="The input ${esc(typo.input)}"
                            autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(typo.input)}" ${off}>
                        <button type="button" class="btn tiny ghost destructive" data-act="ac-remove-input" ${off}
                            data-tip="${entry.typos.length === 1 ? emptiesTip() : "Remove this input. Undo takes it back."}">Remove</button></span>`
                    : `<button type="button" class="chip mono ac-chip ${typo.warnings.length ? "warn" : ""}" data-act="ac-chip" data-ac-chip="${esc(typo.typo)}" ${off}
                        aria-label="The input ${esc(typo.input)}: edit or remove it" data-tip="${esc(typo.warnings.length ? typo.warnings.join(" ") : "Click to write it anew, or to remove it.")}">${esc(typo.input)}</button>`).join("")}
                ${editing?.part === "more"
                    ? `<span class="ac-more-field" data-ac-open><input class="input mono ac-chip-input" data-f="autocorrect:entry:${esc(entry.id)}:more" data-ac-more data-ac-open aria-label="Another input for ${esc(entry.label)}"
                        autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${esc(inputPlaceholder(entry.fires, entry.macro !== undefined))}" value="" ${off}></span>`
                    : `<button type="button" class="chip ac-more" data-act="ac-more" ${off} data-tip="Another input for this replacement.">+ Input</button>`}
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
    const open = (part, more = {}) => { dropEntered(); state.autocorrectEdit = {entry: entry.id, part, ...more}; state.autocorrectCheck = null; render(); };
    const close = () => { dropEntered(); state.autocorrectEdit = null; state.autocorrectCheck = null; render(); };
    // Posts an edit the check has passed; `follow` is the entry this one is
    // found as once it lands, as the check said.
    /** @param {Edit} edit @param {string} [follow] */
    const send = (edit, follow) => {
        state.autocorrectEdit = {.../** @type {NonNullable<typeof state.autocorrectEdit>} */ (state.autocorrectEdit ?? {entry: entry.id, part: "kind"}), sent: identity() || "", ...(follow === undefined ? {} : {follow})};
        keep(edit);
    };
    const typed = editing?.part === "input" ? entry.typos.find((typo) => typo.typo === editing.typo) : undefined;
    // What a field would post as it stands, or nothing while it holds what
    // the list already has.
    /** @param {HTMLInputElement} input @returns {Edit | null} */
    const editOf = (input) => {
        const value = input.value;
        if (input.matches("[data-ac-text]")) return value.trim() && (entry.macro !== undefined || value.trim() !== entry.correction) ? edits.changeAutocorrectReplacement(target, {correction: value}, identity()) : null;
        if (input.matches("[data-ac-more]")) return value.trim() ? edits.addAutocorrectInputs(target, value, identity()) : null;
        if (input.matches("[data-ac-input-text]")) return typed && value.trim() && value.trim() !== typed.input ? edits.changeAutocorrectInput(typed.typo, value, identity()) : null;
        return null;
    };
    // What is in the field that adds inputs takes its turn to be checked and
    // posted, and the field is ready for the next at once.
    /** @param {HTMLInputElement} input */
    const enter = (input) => {
        if (!input.value.trim()) return;
        entered.push(input.value.trim());
        taken(input, "");
        state.autocorrectCheck = null;
        paintFeedback();
        addNext();
    };
    // Remove takes precedence over the change that leaving its field causes.
    let removing = false;
    card.addEventListener("pointerdown", (event) => { removing = Boolean(/** @type {Element} */ (event.target).closest('[data-act="ac-remove-input"]')); });
    card.addEventListener("input", (event) => {
        const input = /** @type {HTMLInputElement} */ (event.target);
        if (input.matches("[data-ac-text]")) check("replacement", editOf(input));
        else if (input.matches("[data-ac-more], [data-ac-input-text]")) check("input", editOf(input));
    });
    // A field is kept when it is left or Enter is pressed in it, once the
    // core's check of it has passed; a choice as soon as it is made.
    card.addEventListener("change", (event) => {
        const input = /** @type {HTMLInputElement} */ (event.target);
        // How it fires is posted as soon as it is chosen; its inputs stay.
        if (input.matches('[type=radio][name$=":fires"]')) {
            /** @type {"word" | "leader" | "both"} */
            const picked = input.value === "leader" ? "leader" : input.value === "both" ? "both" : "word";
            if (picked !== entry.fires) { dropEntered(); state.autocorrectEdit = null; keep(edits.autocorrectTrigger(target, picked, identity())); }
            return;
        }
        if (input.matches('[type=radio][name$=":kind"]')) {
            const picked = input.value === "macro" ? "macro" : "text";
            if (picked === stored) close(); else open("kind", {kind: picked});
            focusLater(`[data-ac-editor] [data-ac-text], [data-ac-editor] [data-act="ac-pick"]`);
            return;
        }
        if (!input.matches("[data-ac-text], [data-ac-more], [data-ac-input-text]") || removing) return;
        // Left with something in it, the field that adds inputs keeps it and
        // closes once it has landed. A change that comes while the field still
        // has the focus is Enter's (lib/focus.mjs commits text it kept across
        // a redraw that way): it keeps the text and the field stays.
        if (input.matches("[data-ac-more]")) {
            if (!input.value.trim()) return;
            if (document.activeElement !== input && state.autocorrectEdit?.part === "more") state.autocorrectEdit = {...state.autocorrectEdit, left: true};
            enter(input);
            return;
        }
        const edit = editOf(input);
        if (!edit) { if (input.matches("[data-ac-input-text]")) close(); return; }
        if (input.matches("[data-ac-text]")) whenChecked("replacement", edit, (answer) => send(edit, answer.entry));
        else whenChecked("input", edit, () => send(edit));
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
            if (input.matches("[data-ac-more]")) {
                // An empty field for another input is done with.
                if (!input.value.trim() && adding === null && !entered.length) { close(); focusLater(`[data-ac-editor] [data-act="ac-more"]`); }
                else enter(input);
                return;
            }
            // Leaving the field keeps it, once, as the browser tells it.
            input.blur();
        }
    });
    card.addEventListener("click", (event) => {
        const button = pressed(event);
        if (!button) return;
        const act = button.dataset.act;
        if (act === "ac-pick") pickMacro(model, value.macro, entry.label, (slot) => {
            if (slot === entry.macro) { close(); return; }
            const edit = edits.changeAutocorrectReplacement(target, {macro: slot}, identity());
            whenChecked("replacement", edit, (answer) => send(edit, answer.entry));
        });
        else if (act === "ac-edit-macro" && value.macro !== null) showMacro(model, value.macro);
        else if (act === "ac-macros") showMacro(model, -1);
        else if (act === "ac-more") { open("more"); focusLater("[data-ac-more]"); }
        else if (act === "ac-chip") { open("input", {typo: button.dataset.acChip || ""}); focusLater("[data-ac-input-text]"); }
        else if (act === "ac-remove-input" && typed) {
            dropEntered();
            state.autocorrectEdit = null;
            const emptied = entry.typos.length === 1 && keepsEmptied();
            if (emptied) state.autocorrectNew = {kind: stored, text: entry.macro === undefined ? entry.correction : "", macro: entry.macro ?? null, input: "", fires: entry.fires,
                label: entry.label, joins: null, shown: true, emptied: {entry: entry.id, sent: identity() || ""}};
            keep(edits.deleteAutocorrectTypo(typed.typo, identity()));
            if (emptied) { render(); focusLater("[data-ac-new] [data-ac-first]"); }
        }
        else if (act === "ac-delete") { dropEntered(); state.autocorrectEdit = null; keep(edits.deleteAutocorrectEntry(target, identity())); }
        else if (act === "ac-place-leader") placeLeader();
    });
    return card;
}

// The keyboard keeps no replacement without an input, so removing the last
// one takes it off the list; the editor keeps it open as one being made, for
// the input that puts it back. The screen makes one at a time: with another
// begun and waiting in the bank, the replacement is deleted, and Undo takes
// it back.
const keepsEmptied = () => !state.autocorrectNew || !addedReplacement(state.autocorrectNew);
const emptiesTip = () => keepsEmptied()
    ? "Its only input: the replacement leaves your list but stays open, for a new input that puts it back. Undo takes it back."
    : "Its only input: removing it deletes the replacement, as a new one waits in the list. Undo takes it back.";

// A replacement being made: what it is, then its first input, which is what
// puts it on the list, kept when Enter is pressed in it or the editor is left
// from it; going back to the replacement's own fields keeps nothing yet. What
// is typed for it stays with it while it waits in the bank. One the list
// already has, which the core's check says, is offered to be opened.
/** @param {Model} model @param {List} list @param {Fresh} fresh @param {boolean} canEdit */
function newEditor(model, list, fresh, canEdit) {
    const off = canEdit ? "" : "disabled";
    const current = () => /** @type {Fresh} */ (state.autocorrectNew);
    const joins = fresh.joins ? list.entries.find((entry) => entry.id === fresh.joins?.entry) : undefined, named = addedReplacement(fresh);
    const empty = fresh.kind === "macro" && fresh.macro !== null && model?.macros?.[fresh.macro]?.empty;
    const card = el(`<div class="card ac-editor" data-ac-editor data-ac-new>
        <div class="card-h name-titlebar">${ICON}${titleText("New replacement")}
            <span class="tag">Not on your list yet</span>
            <span class="right row actions">
                ${editMacroLink(fresh.kind === "macro" && fresh.macro !== null)}
                <button class="btn tiny ghost destructive" data-act="ac-discard" data-tip="${fresh.emptied ? "Let this replacement go: it left your list with its last input. Undo takes it back." : "Let this new replacement go. Nothing was added to your list."}">Discard</button></span></div>
        <div class="card-b stack">
            <div class="macro-sequence-heading"><h4>Replacement</h4>${replacementInfo(list)}</div>
            ${replacementControls(model, "autocorrect:new", fresh, canEdit, list.usage.correctionMax)}
            ${empty ? `<p class="note warn" data-ac-warning>“${esc(macroName(model, fresh.macro))}” has no steps, so this replacement would do nothing yet. Add steps in Macros, or pick another macro.</p>` : ""}
            <div data-ac-feedback="replacement" hidden></div>
            ${joins ? `<div class="callout ac-joins" data-ac-joins><span>${esc(fresh.joins?.said)}</span>
                    <button type="button" class="btn tiny" data-act="ac-open-joined">Open it</button></div>` : `
            <div class="macro-sequence-heading"><h4>Fires</h4>${firesInfo(model)}</div>
            ${firesField(model, "autocorrect:new", canEdit && Boolean(named), fresh.fires ?? "word")}
            ${(fresh.fires ?? "word") === "word" ? "" : leaderRow(model)}
            <div class="macro-sequence-heading"><h4>Inputs</h4>${inputsInfo(list)}</div>
            <div class="pd-chips ac-inputs">
                <input class="input mono ac-chip-input" data-f="autocorrect:new:input" data-ac-first aria-label="First input" autocomplete="off" autocapitalize="off" spellcheck="false"
                    placeholder="${esc(inputPlaceholder(fresh.fires ?? "word", fresh.kind === "macro", FIRST_INPUT))}" value="${esc(fresh.input || "")}" ${canEdit && named ? "" : "disabled"}>
            </div>
            <p class="note" data-ac-joins-with>${fresh.emptied ? "Its last input was removed, so it is off your list: give it an input to put it back." : "It joins your list with its first input."}</p>
            <div data-ac-feedback="new" hidden></div>`}
        </div></div>`);
    /** @type {HTMLElement} */ (card.querySelector(".card-b")).appendChild(trySection(model, list));
    attachInfoMarks(card);
    countsBytes(card, list.usage.correctionMax);
    const first = /** @type {HTMLInputElement | null} */ (card.querySelector("[data-ac-first]"));
    // The add the editor names as it stands, with the first input typed so
    // far; null while it names no replacement. The core is asked about it
    // even before it has an input: whether the list has that replacement.
    const addEdit = () => {
        const replacement = addedReplacement(current());
        return replacement ? edits.addAutocorrectInputs(replacement, current().input || "", identityOf(getModel()), current().fires) : null;
    };
    // While the removal of its last input is on its way the list still has
    // it, so it is asked about once that has landed.
    const ask = () => { if (canEdit && !current().sent && !current().emptied?.sent) check("new", addEdit()); };
    const discard = () => { Object.assign(state, {autocorrectNew: null, autocorrectCheck: null}); render(); focusLater('[data-act="ac-add"]'); };
    // The first input, kept: the replacement joins the list with it.
    const commit = () => {
        const edit = addEdit();
        if (!edit || !current().input?.trim() || current().sent) return;
        whenChecked("new", edit, (answer) => {
            state.autocorrectNew = {...current(), sent: identityOf(getModel()) || "", made: answer.entry};
            keep(edit);
        });
    };
    // Discard takes precedence over the keeping that leaving the field causes.
    let discarding = false;
    card.addEventListener("pointerdown", (event) => { discarding = Boolean(/** @type {Element} */ (event.target).closest('[data-act="ac-discard"]')); });
    card.addEventListener("input", (event) => {
        const input = /** @type {HTMLInputElement} */ (event.target);
        if (input.matches("[data-ac-text]")) {
            state.autocorrectNew = {...current(), text: input.value, label: undefined};
            // Whether it can take an input yet is said as it is typed; whether
            // the list has it already is the check's answer.
            const ready = canEdit && Boolean(addedReplacement(current()));
            if (first) first.disabled = !ready;
            for (const radio of /** @type {NodeListOf<HTMLInputElement>} */ (card.querySelectorAll('[name$=":fires"]'))) radio.disabled = !ready;
            /** @type {HTMLElement | null} */ (document.querySelector("[data-ac-new-item] .v"))?.replaceChildren(input.value.trim() || "New replacement");
            ask();
        } else if (input === first) { state.autocorrectNew = {...current(), input: input.value}; ask(); }
    });
    // Left for something outside this editor (the bank, another screen), the
    // first input is kept as Enter keeps it. A field a redraw threw away, or
    // a window that lost the focus, has not been left.
    card.addEventListener("focusout", (event) => {
        const to = /** @type {Node | null} */ (event.relatedTarget);
        if (event.target !== first || !first?.isConnected || discarding || !document.hasFocus() || (to && card.contains(to))) return;
        commit();
    });
    card.addEventListener("change", (event) => {
        const input = /** @type {HTMLInputElement} */ (event.target);
        if (input.matches('[type=radio][name$=":fires"]')) {
            state.autocorrectNew = {...current(), fires: input.value === "leader" ? "leader" : input.value === "both" ? "both" : "word"};
            render();
            focusLater("[data-ac-new] [data-ac-first]");
            return;
        }
        if (!input.matches('[type=radio][name$=":kind"]')) return;
        state.autocorrectNew = {...current(), kind: input.value === "macro" ? "macro" : "text", joins: null, label: undefined};
        state.autocorrectCheck = null;
        render();
        focusLater(`[data-ac-new] [data-ac-text], [data-ac-new] [data-act="ac-pick"]`);
    });
    card.addEventListener("keydown", (event) => {
        const input = /** @type {HTMLInputElement} */ (event.target);
        if (event.key === "Enter" && input.matches("[data-ac-text]")) { event.preventDefault(); first?.focus(); }
        else if (event.key === "Enter" && input === first) { event.preventDefault(); commit(); }
        else if (event.key === "Escape" && input.matches("[data-ac-text], [data-ac-first]") && !addedReplacement(current()) && !first?.value) { event.preventDefault(); discard(); }
    });
    card.addEventListener("click", (event) => {
        const button = pressed(event);
        if (!button) return;
        const act = button.dataset.act;
        if (act === "ac-pick") pickMacro(model, fresh.macro, "New replacement", (slot) => {
            state.autocorrectNew = {...current(), macro: slot, joins: null, label: undefined};
            state.autocorrectCheck = null;
            render();
            focusLater("[data-ac-first], [data-act=\"ac-open-joined\"]");
        });
        else if (act === "ac-edit-macro" && fresh.macro !== null) showMacro(model, fresh.macro);
        else if (act === "ac-macros") showMacro(model, -1);
        else if (act === "ac-open-joined" && joins) { state.autocorrectNew = null; openInEditor(joins.id); focusLater('[data-ac-editor] [data-act="ac-more"]'); }
        else if (act === "ac-discard") discard();
        else if (act === "ac-place-leader") placeLeader();
    });
    // Drawn with a replacement named, it asks the core whether the list has it.
    if (named) queueMicrotask(ask);
    return card;
}

// With no replacements, the editor's place says what one is and offers the
// two ways to a first list: make one, or import one.
/** @param {boolean} canEdit */
function emptyEditor(canEdit) {
    const off = canEdit ? "" : "disabled";
    const card = el(`<div class="card ac-editor" data-ac-editor><div class="card-b">
        <div class="macro-empty" data-ac-empty><span class="macro-empty-mark" aria-hidden="true">+</span>
            <strong>Your replacements start here</strong>
            <p class="note">Text the keyboard types for you when you finish a word: <span class="mono">the</span> for <span class="mono">teh</span>, your phone number for <span class="mono">pnumber</span>, or a macro for anything longer.</p>
            <p class="note">Make the first one, or import a list you already have: QMK's text, a CSV or Ark's JSON. You see what a file adds before anything changes.</p>
            <div class="row ac-empty-actions">
                <button class="btn primary" data-act="ac-add" ${off}>+ New replacement</button>
                <button class="btn" data-act="ac-import" ${off} data-tip="${IMPORT_TIP}">Import…</button>
            </div></div></div></div>`);
    card.addEventListener("click", (event) => {
        const button = pressed(event);
        if (!button) return;
        if (button.dataset.act === "ac-add") openNew();
        else previewImport("choose");
    });
    return card;
}

// ── try it ──────────────────────────────────────────────────────────────

let nextTry = 0;
// The computer's own Caps Lock as the last key in the box reported it. The
// preview's switch follows it only when it changes, so a switch set by hand
// stays as it was set while the real key does.
let realCapsLock = false;
/** @param {Model} model */
const draftOf = (model) => `${model?.draft?.id ?? ""}:${model?.draft?.revision ?? ""}`;

// Asks the core what the keyboard would leave on screen for what the box
// holds: the text that was there, then what was typed after it.
function askTry() {
    const tried = state.autocorrectTry;
    if (!tried.before && !tried.typed && !tried.leader) { state.autocorrectTry = {...tried, shown: "", fired: [], marks: [], undone: false, error: "", requestId: 0, leaderResult: null}; paintTry(); return; }
    const requestId = ++nextTry;
    state.autocorrectTry = {...tried, requestId};
    post(controls.tryAutocorrect(tried, requestId));
}

/** @param {Extract<import("../../contracts/messages.js").PanelResponse, {type: "autocorrectTry"}>} message */
export function receiveAutocorrectTry(message) {
    const tried = state.autocorrectTry, model = getModel();
    if (tried.requestId !== message.requestId || message.draftId !== model?.draft?.id || message.draftRevision !== model?.draft?.revision) return;
    state.autocorrectTry = {...tried, draft: draftOf(model), error: message.error || "",
        ...(message.result ? {shown: message.result.text, fired: message.result.fired, marks: message.result.marks, undone: message.result.undone, leaderResult: message.result.leader ?? null} : {})};
    paintTry();
}

// The preview shows what the keyboard would leave, each replaced part marked
// and saying on hover what it replaced; the line under it says what fired
// last, and that replacement is marked in the bank, with its input in the
// editor when it is the one open; otherwise the line offers to open it. The
// box itself is the person's: nothing here writes to it. The line under the
// preview is what a screen reader hears; the preview is redrawn on every key
// and is not announced again each time.
function paintTry() {
    const tried = state.autocorrectTry, macros = getModel()?.macros;
    const preview = /** @type {HTMLElement | null} */ (document.querySelector("[data-ac-try-preview]"));
    if (!preview) return;
    let at = 0;
    /** @type {(string | HTMLElement)[]} */
    const parts = [];
    for (const mark of tried.marks) {
        if (mark.start < at || mark.end <= mark.start) continue;
        parts.push(tried.shown.slice(at, mark.start), el(`<mark class="ac-replaced" data-ac-replaced="${esc(mark.entry)}"
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
    const leaderSaid = /** @type {HTMLElement | null} */ (document.querySelector("[data-ac-try-leader-said]"));
    if (leaderSaid) leaderSaid.textContent = leaderTriedWords(tried.leader, tried.leaderResult);
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
    // A Leader key cannot be typed into the box, and nothing writes one there:
    // what follows it is tried in a field of its own (D-L91), shown while the
    // list has a leader input.
    const leading = list.usage.leaders > 0;
    const card = el(`<div class="card editor-section" data-ac-try>
        <div class="card-h"><h3>Try it</h3>${infoMark({id: "ac-info-try", label: "About the preview", heading: "About the preview", rows: [
                {term: "Preview", says: `What your keyboard would type with this draft's list, through ${list.layoutName}.`},
                {term: "Your text", says: "The box keeps what you type. Only the preview shows replacements."},
                {term: "Not shown", says: "Clicks, shortcuts, arrow keys and held keys. On the keyboard they start a new word or pause replacing until the next one. A word ended through a dead key is left alone by the keyboard, and replaced here."},
                {term: "Caps Lock", says: "The switch follows your own Caps Lock when it changes as you type here, or set it yourself for the preview."},
                ...(leading ? [{term: "After Leader", says: "What you type after the Leader key, tried on its own: whether the keyboard sends a replacement, waits for more, or drops it. The box above never holds the Leader key."}] : [])]})}
            <button class="btn tiny ghost destructive right" data-act="ac-try-clear" ${tried.text ? "" : "disabled"} data-tip="Empty the box and its preview.">Clear</button></div>
        <div class="card-b stack">
            <textarea class="input ac-try-box" data-f="autocorrect:try:text" rows="2" aria-label="Type here to try your list" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Type here: teh, then a space.">${esc(tried.text)}</textarea>
            ${model?.autocorrectRunning ? `<p class="note" data-ac-try-running>Your keyboard is replacing as you type here too. The preview shows this draft.</p>` : ""}
            <div class="field"><span id="ac-try-label">Your keyboard would type</span>
                <div class="ac-try-preview" data-ac-try-preview role="group" aria-labelledby="ac-try-label"></div></div>
            <div class="row ac-try-tools">
                <label class="sw" data-tip="Whether the preview takes Caps Lock to be on at the computer. It follows your own Caps Lock when that changes as you type here."><input type="checkbox" data-f="autocorrect:try:caps" ${tried.capsLock ? "checked" : ""}><span class="track"></span><span class="txt">Preview with Caps Lock on</span></label>
                <span class="note" data-ac-try-said aria-live="polite"></span>
                <button class="btn tiny link" data-act="ac-try-show" hidden>Show it →</button>
            </div>
            ${leading ? `<label class="field ac-try-leader"><span>${esc(word(vocabulary(model).inputModes, "leader"))}</span>
                <span class="input-row">${leaderCap(model)}<input class="input mono" data-f="autocorrect:try:leader" data-ac-try-leader autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"
                    placeholder="What you type after the Leader key: pn" value="${esc(tried.leader)}"></span></label>
            <p class="note" data-ac-try-leader-said aria-live="polite"></p>` : ""}
        </div></div>`);
    const box = /** @type {HTMLTextAreaElement} */ (card.querySelector("textarea"));
    /** @type {HTMLInputElement | null} */ (card.querySelector("[data-ac-try-leader]"))?.addEventListener("input", (event) => {
        state.autocorrectTry = {...state.autocorrectTry, leader: /** @type {HTMLInputElement} */ (event.target).value};
        askTry();
    });
    const caps = /** @type {HTMLInputElement} */ (card.querySelector('[data-f="autocorrect:try:caps"]'));
    const clear = /** @type {HTMLButtonElement} */ (card.querySelector('[data-act="ac-try-clear"]'));
    box.addEventListener("input", () => {
        state.autocorrectTry = {...state.autocorrectTry, ...triedAfter(state.autocorrectTry, box.value), text: box.value};
        clear.disabled = !box.value;
        askTry();
    });
    // The computer's own Caps Lock, as the key press reports it: read, and
    // nothing of the key changed. The switch takes it when it changes.
    box.addEventListener("keydown", (event) => {
        const on = event.getModifierState("CapsLock");
        if (on === realCapsLock) return;
        realCapsLock = on;
        if (on === state.autocorrectTry.capsLock) return;
        caps.checked = on;
        state.autocorrectTry = {...state.autocorrectTry, capsLock: on};
    });
    caps.addEventListener("change", () => { state.autocorrectTry = {...state.autocorrectTry, capsLock: caps.checked}; askTry(); });
    // Clear is the one thing here that empties the box, with its preview.
    clear.addEventListener("click", (event) => {
        event.stopPropagation();
        box.value = "";
        clear.disabled = true;
        state.autocorrectTry = {...state.autocorrectTry, before: "", typed: "", text: ""};
        askTry();
        box.focus();
    });
    /** @type {HTMLButtonElement} */ (card.querySelector('[data-act="ac-try-show"]')).addEventListener("click", (event) => {
        event.stopPropagation();
        openInEditor(/** @type {HTMLElement} */ (event.currentTarget).dataset.entry || "");
    });
    // The list or the host layout changed under what was tried: try it again.
    if ((tried.before || tried.typed || tried.leader) && tried.draft !== draftOf(model)) queueMicrotask(askTry);
    return card;
}

// ── files ───────────────────────────────────────────────────────────────

// What Import… reads, said on both of its buttons, the bank's and an empty list's.
const IMPORT_TIP = "A .txt file in QMK's form, a .csv from a spreadsheet, or a .json Ark exported. You can also drop one on this screen.";

let nextImport = 0;
// Asks the core to read a list and say what it would do: the file the
// shell's chooser picks, or a dropped file's text.
/** @param {{text: string, name: string} | "choose"} source */
function previewImport(source) {
    const requestId = ++nextImport;
    state.autocorrectImport = {requestId, pending: true, choosing: source === "choose", name: source === "choose" ? "" : source.name};
    post(source === "choose" ? controls.chooseAutocorrectFile(requestId) : controls.previewAutocorrectFile(source.text, source.name, requestId));
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

// Escape on a list file's summary is its Cancel; a file still being chosen
// has no summary to close.
export function closeAutocorrectImport() {
    const asked = state.autocorrectImport;
    if (!asked || (asked.pending && asked.choosing)) return false;
    state.autocorrectImport = null;
    render();
    return true;
}

// What the file would do, both ways, and the choice: a sheet over the screen,
// as a backup's comparison is. Decide, then it closes. Replacing deletes
// every replacement the list has, so it is written in red and comes last, as
// every dialog's destructive choice does (ui/dialog-foot.mjs).
/** @param {boolean} canEdit */
function importSheet(canEdit) {
    const asked = /** @type {NonNullable<typeof state.autocorrectImport>} */ (state.autocorrectImport);
    const title = "Import this list?";
    const preview = asked.pending || asked.error ? undefined : asked.preview;
    /** @param {import("../../contracts/messages.js").AutocorrectImportOutcome} outcome */
    const lines = (outcome) => importLines(outcome).map((line) => `<li data-ac-line="${esc(line.kind)}">${esc(line.text)}${line.names?.length
        ? `<span class="ac-names">${line.names.slice(0, NAMES_SHOWN).map((name) => `<span>${name.macro ? marked(getModel(), {kind: "macro"}, name.text) : esc(name.text)}</span>`).join("")}${line.names.length > NAMES_SHOWN ? `<span>and ${esc(line.names.length - NAMES_SHOWN)} more</span>` : ""}</span>` : ""}</li>`).join("");
    /** @param {import("../../contracts/messages.js").AutocorrectImportOutcome} outcome */
    const changes = (outcome) => outcome.newReplacements.length + outcome.addedInputs.length > 0;
    /** @param {import("../../contracts/messages.js").AutocorrectImportOutcome} outcome */
    const after = (outcome) => `Your list would hold ${countWords({corrections: outcome.replacements, typos: outcome.inputs}).replace(" · ", ", with ")}.`;
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
        <div class="sheet-f">${preview ? dialogFoot(`<button class="btn primary" data-act="ac-import-add" ${canEdit && changes(preview.add) ? "" : "disabled"}>Add to my list</button>`, {act: "ac-import-cancel"}, "",
            `<button class="btn ghost destructive" data-act="ac-import-replace" ${canEdit && preview.replace.replacements ? "" : "disabled"}
                data-tip="Deletes every replacement your list has now, then adds this file's. Undo takes it back.">Replace my list</button>`)
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
