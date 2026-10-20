// @ts-check
// Settings: the keyboard's global policy, exactly as it reports it.
//
// The sections, fields, hints and limits all come from the device snapshot, so
// this screen renders what the firmware says it has rather than a list this
// app decided on. A field the firmware cannot report stays visible and
// read-only with its reason. Each section names the screen it is edited on:
// this one draws the Settings sections, and Mouse and Lighting draw their own
// with the same rows.

// Selector assertions refer to elements created by this module's authored markup.
import * as edits from "../view/edits.mjs";
import {DISCLOSURE, el, esc} from "../lib/dom.mjs";
import {getModel, layerName, layers, post, render, state, canEdit as canEditArea} from "../store.mjs";
import {topbar, unavailable} from "./shell.mjs";
import {draftDot, draftMarks} from "../view/review.mjs";
import {marked} from "./marks.mjs";
import {githubMark} from "../view/host.mjs";
import {durationControl} from "./duration.mjs";
import {elsewhereWords, fieldParts, foldedSummary, isLayerSwitch, layerSwitchSummary, matchesElsewhere, matchesQuery, noMatchWords, settingsCards, startsFolded} from "../view/settings-layout.mjs";

/** @typedef {import("../../contracts/panel.js").PublishedModel} Model */
/** @typedef {import("../../contracts/panel.js").PresentedSection} Section */
/** @typedef {import("../../contracts/panel.js").PresentedField} Field */

// The sections a screen draws, by the area the keyboard's model files them in.
/** @param {Model | null} model @param {string} area */
export const sectionsIn = (model, area) => (model?.configDefaults || []).filter((section) => section.area === area);

// A layer's name by its index, as the layer tabs call it.
/** @param {number} index */
const nameOf = (index) => {
    const layer = layers().find((entry) => entry.index === index);
    return layer ? layerName(layer) : `Layer ${index}`;
};

// A fold opened by hand or by the review's Show stays open on the next
// render, and one closed by hand stays closed.
/** @param {string} id */
const isOpened = (id) => (state.settingsOpen || []).includes(id);
/** @param {HTMLDetailsElement} node @param {string} id */
function remember(node, id) {
    node.addEventListener("toggle", () => {
        const others = (state.settingsOpen || []).filter((entry) => entry !== id);
        state.settingsOpen = node.open ? [...others, id] : others;
    });
}

export function screenSettings() {
    const model = getModel();
    const sections = sectionsIn(model, "Settings");
    const canEdit = canEditArea("settings");
    const main = el(`<div class="main">${topbar(
        "Settings",
        "Tap and hold timing, key swaps, where behaviours and combos run, and your computer: what applies to the whole keyboard."
    )}</div>`);

    const content = el(`<div class="content"><div class="pad settings-pad"></div></div>`);
    const pad = /** @type {HTMLElement} */ (content.firstElementChild);
    if (!sections.length) {
        pad.appendChild(el(`<div class="screen-stub"><h3>No settings read</h3>
            <p class="note">${esc(unavailable(model) || "Choose Read keyboard to load this keyboard's policy.")}</p></div>`));
    }
    // Why nothing here can be edited, said once; while the keyboard is busy
    // the draft bar already says what it is doing.
    const reason = canEdit || !sections.length || model?.draft?.busy ? "" : unavailable(model);
    if (reason) pad.appendChild(el(`<div class="unavailable">${esc(reason)}</div>`));

    if (sections.length) {
        const search = el(`<input class="input search settings-search" id="settingsSearch" data-f="settings:search" type="search" placeholder="Search settings" aria-label="Search settings" value="${esc(state.settingsSearch || "")}">`);
        search.addEventListener("input", () => {
            state.settingsSearch = /** @type {HTMLInputElement} */ (search).value;
            render();
        });
        pad.appendChild(search);
    }
    const query = (state.settingsSearch || "").trim().toLowerCase();
    // A section found by one of its other names (section.search: QMK's,
    // or the one Ark used before) shows whole.
    /** @param {Section} section */
    const matching = (section) => !query || matchesQuery({label: section.label, hint: section.search}, query) ? section.fields : section.fields.filter((field) => matchesQuery(field, query));
    let shown = 0;
    for (const card of settingsCards(sections)) {
        if (card.id === "comboSettings") {
            const node = combosCard(model, card.sections, matching, query, canEdit);
            if (node) { pad.appendChild(node); shown++; }
            continue;
        }
        // A section the keyboard has not filled in yet (Key swaps before its
        // options are read) still shows, to say why it is empty.
        const parts = card.sections.map((section) => ({section, fields: matching(section)}))
            .filter((part) => part.fields.length || (!query && !part.section.fields.length));
        if (!parts.length) continue;
        shown++;
        for (const {section, fields} of parts) pad.appendChild(sectionCard(model, section, fields, canEdit,
            {searching: Boolean(query), folded: startsFolded(card, section), summary: foldedSummary(section, nameOf)}));
    }
    if (query && sections.length && !shown) pad.appendChild(el(`<p class="note settings-empty" role="status">${esc(noMatchWords(state.settingsSearch || ""))}</p>`));
    // A search for something edited on another screen says where it is.
    const elsewhere = matchesElsewhere(model, query);
    if (elsewhere.length) {
        const note = el(`<div class="settings-elsewhere row gap-8">${elsewhere.map((entry) =>
            `<button class="btn text compact" data-go="${esc(entry.screen)}">${esc(elsewhereWords(entry))}</button>`).join("")}</div>`);
        /** @type {NodeListOf<HTMLButtonElement>} */ (note.querySelectorAll("[data-go]")).forEach((button) => button.addEventListener("click", () => {
            const screen = button.dataset.go;
            if (screen === "mouse" || screen === "lighting" || screen === "device") state.screen = screen;
            // A search on Keyboard is for what this firmware was built with.
            if (screen === "device") state.settingsOpen = [...(state.settingsOpen || []).filter((id) => id !== "builtIn"), "builtIn"];
            render();
        }));
        pad.appendChild(note);
    }

    main.appendChild(content);
    return main;
}

// Combos: the master switch, the default window and hold threshold every
// combo shares, whether outputs use behaviours, then folded, the layers
// combos run on and Combo layer matching. The timing is stored with the
// combos and Combo layer matching in the layer records, so each still saves
// on its own.
/** @param {Model | null} model @param {Section[]} sections @param {(section: Section) => Field[]} matching @param {string} query @param {boolean} canEdit */
function combosCard(model, sections, matching, query, canEdit) {
    const combos = sections.find((section) => section.id === "comboSettings");
    if (!combos) return null;
    const references = sections.find((section) => section.id === "comboReferences");
    const fields = matching(combos);
    const timing = (combos.comboTiming || []).filter((entry) => matchesQuery(entry, query));
    const referenceFields = references ? matching(references) : [];
    if (!fields.length && !timing.length && !referenceFields.length) return null;
    const node = sectionCard(model, combos, fields, canEdit, {searching: Boolean(query), extra: {after: "combosEnabled", nodes: timing.map((entry) => comboTimingRow(model, entry))}});
    if (references && referenceFields.length) {
        /** @type {HTMLElement} */ (node.querySelector(":scope > .rows")).appendChild(comboReferenceFold(model, references, referenceFields, canEdit, Boolean(query)));
        if (draftMarks(model?.draft?.changes).settings.has(references.id) && !node.querySelector(":scope > summary .draft-dot"))
            node.querySelector(":scope > summary h3")?.insertAdjacentHTML("beforeend", draftDot());
    }
    return node;
}

// Combo layer matching: one select per layer, four across, the sentence
// said once, folded inside Combos. Saved whole, as every section is.
/** @param {Model | null} model @param {Section} section @param {Field[]} shown @param {boolean} canEdit @param {boolean} searching */
function comboReferenceFold(model, section, shown, canEdit, searching) {
    const open = searching || isOpened(section.id);
    const node = /** @type {HTMLDetailsElement} */ (el(`<details class="setrow subfold settings-group" data-section="${esc(section.id)}" data-tip="${esc(section.description || "")}" ${open ? "open" : ""}>
        <summary>${DISCLOSURE}<span class="nm">Layer matching${draftMarks(model?.draft?.changes).settings.has(section.id) ? draftDot() : ""}</span>
            <span class="fold-summary">${esc(foldedSummary(section, nameOf))}</span></summary>
        ${section.description ? `<div class="hint">${esc(section.description)}</div>` : ""}
        <div class="layer-grid reference-grid" role="group" aria-label="${esc(section.label)}"></div>
    </details>`));
    remember(node, section.id);
    const grid = /** @type {HTMLElement} */ (node.querySelector(".reference-grid"));
    const submit = () => post(edits.settingsSection(section, (field) => {
        const input = /** @type {HTMLSelectElement | null} */ (node.querySelector(`[data-macro="${cssEscape(field.macro)}"]`));
        return input ? input.value : undefined;
    }, model?.settingsEditing?.identity));
    for (const field of section.fields) {
        const at = field.governs?.kind === "layer" ? field.governs.layer : -1;
        const layer = layers().find((entry) => entry.index === at);
        const editable = canEdit && !field.readOnly;
        const cell = el(`<label class="reference-cell" data-tip="${esc([field.tooltip, field.hint].filter(Boolean).join(" "))}" ${shown.includes(field) ? "" : "hidden"}>
            <span class="txt">${marked(model, field.governs, layer ? layerName(layer) : field.label)}</span>
            <select class="input compact" data-macro="${esc(field.macro)}" data-f="setting:${esc(field.macro)}" aria-label="${esc(field.label)}" ${editable ? "" : "disabled"}>
            ${layers().map((entry) => `<option value="Layer ${entry.index}" ${field.value === `Layer ${entry.index}` ? "selected" : ""}>${esc(entry.displayName || entry.name)}</option>`).join("")}</select></label>`);
        /** @type {HTMLSelectElement} */ (cell.querySelector("select")).addEventListener("change", submit);
        grid.appendChild(cell);
    }
    return node;
}

// The default combo window and the combo hold threshold apply to every combo,
// so they are edited with the other combo settings. The keyboard stores them
// once with the combos rather than in the settings domain (combo readback
// v3), so each saves as a combo edit, with or without any combos.
// A combo follows the default window unless it has its own, so changing it
// re-times those combos. QMK waits for the hold threshold only on combos that
// must be held or are tap only — the longer of it and the combo's own window
// — and every other combo ignores it.
/** @param {Model | null} model @param {import("../../contracts/model.js").ComboTimingField} entry */
function comboTimingRow(model, entry) {
    const readback = model?.comboReadback || {};
    const hold = entry.id === "hold";
    const value = hold ? readback.holdTermMs : readback.defaultTermMs;
    const stored = String(value ?? "");
    const editable = canEditArea("combos");
    const hint = entry.hint;
    const row = el(`<div class="setrow" data-tip="${esc(hint)}" data-timing="${esc(entry.id)}">
        <div><div class="nm">${esc(entry.label)}</div>
            <div class="hint">${esc(hint)}</div></div>
        <div class="control"><span class="affix unit"><input class="input mono" id="${hold ? "comboHoldTerm" : "comboDefaultTerm"}" data-f="settings:combo:${hold ? "hold" : "default"}" inputmode="numeric" value="${esc(stored)}" ${editable ? "" : "disabled"}><i>ms</i></span></div>
    </div>`);
    // Posted on its own rather than riding along with whichever combo is saved
    // next. The keyboard always stores a number, so an emptied field is put
    // back rather than read as some default.
    /** @type {HTMLInputElement} */ (row.querySelector("input")).addEventListener("change", (event) => {
        const written = /** @type {HTMLInputElement} */ (event.target).value.trim();
        if (!written) { /** @type {HTMLInputElement} */ (event.target).value = stored; return; }
        if (written === stored) return;
        post(hold ? edits.comboHoldTerm(written, model?.profileIdentity) : edits.comboDefaultTerm(written, model?.profileIdentity));
    });
    return row;
}

/**
 * One section as a card, saved whole. Its options:
 * `searching` opens every fold; `folded` starts it closed, saying `summary`;
 * `extra` adds rows another store saves after the named field's row.
 * @param {Model | null} model @param {Section} section @param {Field[]} fields @param {boolean} canEdit
 * @param {{searching?: boolean, folded?: boolean, summary?: string, extra?: {after: string, nodes: HTMLElement[]}}} [options]
 */
export function sectionCard(model, section, fields, canEdit, {searching = false, folded = false, summary = "", extra} = {}) {
    const open = searching || !folded || isOpened(section.id);
    const node = /** @type {HTMLDetailsElement} */ (el(`<details class="card settings-group" data-section="${esc(section.id)}" ${open ? "open" : ""}>
        <summary class="card-h">${DISCLOSURE}<h3>${esc(section.label)}${draftMarks(model?.draft?.changes).settings.has(section.id) ? draftDot() : ""}</h3>
            ${folded && summary ? `<span class="right fold-summary" data-tip="${esc(summary)}">${esc(summary)}</span>` : ""}</summary>
        ${section.description ? `<div class="card-b settings-intro"><p class="note">${esc(section.description)}</p></div>` : ""}
        <div class="rows"></div>
        ${section.warning ? `<div class="card-b"><div class="callout warn" role="note">${esc(section.warning)}</div></div>` : ""}
        ${section.githubLink ? `<div class="card-b"><a class="btn tiny ghost" href="${esc(section.githubLink.url)}" target="_blank" rel="noopener">${githubMark("settings-help-mark")}<span>${esc(section.githubLink.label)}</span></a></div>` : ""}
    </details>`));
    const rows = /** @type {HTMLElement} */ (node.querySelector(".rows"));
    if (folded) remember(node, section.id);

    // A section is saved whole: the core validates the complete set, so every
    // field travels together and one changed value cannot half-write a section.
    /** @type {Map<string, ReturnType<typeof durationControl>>} */
    const durations = new Map();
    const submit = () => {
        for (const duration of durations.values()) if (duration.read() === null) { duration.reportValidity(); return; }
        post(edits.settingsSection(section, (field) => {
            const duration = durations.get(field.macro);
            if (duration) return duration.read() ?? undefined;
            const input = /** @type {HTMLInputElement | HTMLSelectElement | null} */ (node.querySelector(`[data-macro="${cssEscape(field.macro)}"]`));
            if (!input) return undefined;
            return field.kind === "toggle" ? /** @type {HTMLInputElement} */ (input).checked : input.value;
        }, model?.settingsEditing?.identity));
    };

    // A section's one-per-layer switches read as one setting, so they are one
    // row of layers rather than a row each; beside a master switch they fold
    // away under their own heading, saying which layers they leave out.
    const grouped = section.layerGroup ? section.fields.filter(isLayerSwitch) : [];
    const slot = section.fields.some((entry) => entry.governs && !grouped.includes(entry));
    for (const {part, fields: inPart} of fieldParts(section.fields)) {
        if (part) rows.appendChild(el(`<div class="setrow-part" ${inPart.some((field) => fields.includes(field)) ? "" : "hidden"}>${esc(part)}</div>`));
        for (const field of inPart) {
            if (grouped.includes(field)) {
                if (field === grouped[0] && section.layerGroup) {
                    const row = layerGroupRow(section.layerGroup, grouped, fields, canEdit, submit);
                    rows.appendChild(grouped.length === section.fields.length ? row
                        : layerFold(model, section, row, grouped.some((entry) => fields.includes(entry)) && searching, layerSwitchSummary(grouped, nameOf)));
                }
                continue;
            }
            rows.appendChild(fieldRow(field, canEdit, submit, !fields.includes(field), slot, durations));
            if (extra && field.macro === extra.after) rows.append(...extra.nodes);
        }
    }
    // A section QMK owns whole says so once, by its title, not on every row.
    if (section.fields.length > 1 && section.fields.every((field) => field.keyboardKeys)) {
        node.querySelectorAll(".rows .kk-mark").forEach((mark) => mark.remove());
        node.querySelector(":scope > .card-h > h3")?.insertAdjacentHTML("afterend", keyboardKeysMark(section.fields[0]));
    }
    return node;
}

// The row of layer switches folded under its label, saying which layers it
// leaves out while closed.
/** @param {Model | null} model @param {Section} section @param {HTMLElement} row @param {boolean} searching @param {string} summary */
function layerFold(model, section, row, searching, summary) {
    const id = `${section.id}:layers`;
    const open = searching || isOpened(id);
    const node = /** @type {HTMLDetailsElement} */ (el(`<details class="setrow subfold" data-subfold="${esc(id)}" ${row.hidden ? "hidden" : ""} ${open ? "open" : ""}>
        <summary>${DISCLOSURE}<span class="nm"></span><span class="fold-summary">${esc(summary)}</span></summary></details>`));
    // The row's label becomes the fold's; its hint and switches its body.
    /** @type {HTMLElement} */ (node.querySelector("summary .nm")).replaceWith(/** @type {HTMLElement} */ (row.querySelector(".nm")));
    node.append(...row.childNodes);
    node.dataset.tip = row.dataset.tip || "";
    remember(node, id);
    return node;
}

// One switch per layer, each named by its layer and marked in its colour, in
// the order the layer tabs read. Each keeps its own field identity, so the
// section still saves whole and a search still finds a single layer.
/** @param {{label: string, hint: string}} group @param {Field[]} fields @param {Field[]} shown @param {boolean} canEdit @param {() => void} submit */
function layerGroupRow(group, fields, shown, canEdit, submit) {
    const model = getModel();
    const row = el(`<div class="setrow layer-switches" data-tip="${esc(group.hint)}" ${fields.some((field) => shown.includes(field)) ? "" : "hidden"}>
        <div><div class="nm">${esc(group.label)}${keyboardKeysMark(fields[0])}</div><div class="hint">${esc(group.hint)}</div></div>
        <div class="layer-grid" role="group" aria-label="${esc(group.label)}"></div>
    </div>`);
    const grid = /** @type {HTMLElement} */ (row.querySelector(".layer-grid"));
    for (const field of fields) {
        const at = field.governs?.kind === "layer" ? field.governs.layer : -1;
        const layer = layers().find((entry) => entry.index === at);
        const editable = canEdit && !field.readOnly;
        const tip = [field.tooltip, field.hint, field.readOnly ? "This setting cannot be edited with the connected firmware." : ""].filter(Boolean).join(" ");
        const node = el(`<label class="sw" data-tip="${esc(tip)}" ${shown.includes(field) ? "" : "hidden"}>
            <input type="checkbox" data-macro="${esc(field.macro)}" data-f="setting:${esc(field.macro)}" ${field.enabled ? "checked" : ""} ${editable ? "" : "disabled"}>
            <span class="track"></span><span class="txt">${marked(model, field.governs, layer ? layerName(layer) : field.label)}</span></label>`);
        /** @type {HTMLInputElement} */ (node.querySelector("input")).addEventListener("change", submit);
        grid.appendChild(node);
    }
    return row;
}

/** @param {import("../../contracts/panel.js").PresentedField} field @param {boolean} canEdit @param {() => void} submit @param {boolean} hidden @param {boolean} slot @param {Map<string, ReturnType<typeof durationControl>>} durations */
function fieldRow(field, canEdit, submit, hidden, slot, durations) {
    const editable = canEdit && !field.readOnly;
    // A number field shows its unit inside the input, as every screen does,
    // so the label drops the "(ms)" it carries in the review.
    const affixed = Boolean(field.unit) && !field.readOnly && field.presentation !== "duration"
        && field.kind !== "toggle" && field.kind !== "layer" && !field.choices?.length;
    const label = affixed ? field.label.replace(new RegExp(`\\s*\\(${field.unit}\\)$`), "") : field.label;
    const row = el(`<div class="setrow ${field.readOnly ? "ro" : ""}" data-tip="${esc([field.tooltip, field.hint].filter(Boolean).join(" "))}" ${hidden ? "hidden" : ""}>
        <div><div class="nm">${marked(getModel(), field.governs, label, {slot})}${keyboardKeysMark(field)}${offByKeyMark(field)}</div>${field.hint ? `<div class="hint">${esc(field.hint)}</div>` : ""}</div>
        <div class="control"></div>
    </div>`);
    const control = /** @type {HTMLElement} */ (row.querySelector(".control"));

    if (field.readOnly) {
        control.appendChild(el(`<span class="chip"
            data-tip="${esc([field.tooltip, field.hint, field.notBuilt ? "" : "This setting cannot be edited with the connected firmware."].filter(Boolean).join(" "))}">${field.notBuilt ? "Not in this firmware" : `read-only · ${esc(field.kind === "toggle" ? (field.enabled ? "on" : "off") : field.value)}`}</span>`));
        return row;
    }
    if (field.presentation === "duration") {
        const duration = durationControl(field, editable, submit);
        control.appendChild(duration.node);
        durations.set(field.macro, duration);
        return row;
    }
    if (field.kind === "toggle") {
        const node = el(`<label class="sw"><input type="checkbox" data-macro="${esc(field.macro)}" data-f="setting:${esc(field.macro)}" ${field.enabled ? "checked" : ""} ${editable ? "" : "disabled"}>
            <span class="track"></span><span class="txt muted">${field.enabled ? "On" : "Off"}</span></label>`);
        /** @type {HTMLInputElement} */ (node.querySelector("input")).addEventListener("change", submit);
        control.appendChild(node);
        return row;
    }
    if (field.kind === "layer") {
        const node = el(`<select class="input" data-macro="${esc(field.macro)}" data-f="setting:${esc(field.macro)}" ${editable ? "" : "disabled"}>
            ${layers().map((layer) => `<option value="Layer ${layer.index}" ${field.value === `Layer ${layer.index}` ? "selected" : ""}>${esc(layer.displayName || layer.name)}</option>`).join("")}</select>`);
        node.addEventListener("change", submit);
        control.appendChild(node);
        return row;
    }
    if (field.choices?.length) {
        const choices = field.choices.map((choice) => typeof choice === "object" ? choice : {value: choice, label: String(choice)});
        const known = choices.some((choice) => String(choice.value) === String(field.value));
        const node = el(`<select class="input" data-macro="${esc(field.macro)}" data-f="setting:${esc(field.macro)}" ${editable ? "" : "disabled"}>
            ${known ? "" : `<option value="${esc(field.value)}" selected>${esc(field.value)} · as stored</option>`}
            ${choices.map((choice) => `<option value="${esc(choice.value)}" ${String(choice.value) === String(field.value) ? "selected" : ""}>${esc(choice.label)}</option>`).join("")}</select>`);
        node.addEventListener("change", submit);
        control.appendChild(node);
        return row;
    }
    const node = el(`<span class="affix${affixed ? " unit" : ""}"><input class="input mono" data-macro="${esc(field.macro)}" data-f="setting:${esc(field.macro)}" inputmode="numeric" value="${esc(field.value)}" ${editable ? "" : "disabled"}>${affixed ? `<i>${esc(field.unit)}</i>` : ""}</span>`);
    /** @type {HTMLInputElement} */ (node.querySelector("input")).addEventListener("change", submit);
    control.appendChild(node);
    return row;
}

// QMK keeps the live value of these, so a key on the keyboard (a Magic, DF()
// or DPI key) changes it too, until the keyboard restarts: the profile is
// their only saved owner (firmware D-F32), and a combos key is a toggle over
// it, shown beside the switch rather than as a change.
const KEYBOARD_KEYS_TIP = "Keys on the keyboard can change this too, until the keyboard restarts; it then comes back to the value set here.";
/** @param {import("../../contracts/panel.js").PresentedField | undefined} field */
const keyboardKeysMark = (field) => field?.keyboardKeys ? ` <span class="kk-mark" data-tip="${esc(KEYBOARD_KEYS_TIP)}">↺ keyboard keys change this too</span>` : "";

// A toggle key turned this off over a stored "on" (plan answer 10): said
// beside the switch, never a change in the review.
/** @param {import("../../contracts/panel.js").PresentedField | undefined} field */
function offByKeyMark(field) {
    const runtime = getModel()?.runtime;
    const off = field?.macro === "combosEnabled" ? runtime?.combosOffByKey : field?.macro === "behaviorsEnabled" ? runtime?.behavioursOffByKey : false;
    return off ? ` <span class="kk-mark off-by-key" data-tip="${esc("A key on the keyboard turned this off for now. It stays on here; the key turns it back on, and so does unplugging the keyboard. Nothing to save.")}">turned off by key</span>` : "";
}

/** @param {string} value */
const cssEscape = (value) => String(value).replace(/["\\]/g, "\\$&");
