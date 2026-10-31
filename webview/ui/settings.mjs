// @ts-check
// The Settings screens: the keyboard's global policy, exactly as it reports
// it, a screen per subject (Behaviours, Combos, Pointer, Host).
//
// The sections, fields, hints and limits all come from the device snapshot, so
// these screens render what the firmware says it has rather than a list this
// app decided on. A field the firmware cannot report stays visible and
// read-only with its reason. Which sections each screen draws is
// view/settings-layout.mjs's; every one is drawn open. Lighting draws its own
// sections with the same rows.

// Selector assertions refer to elements created by this module's authored markup.
import * as edits from "../view/edits.mjs";
import {el, esc, html} from "../lib/dom.mjs";
import {getModel, layers, post, render, state} from "../store.mjs";
import {editGate} from "../view/edit-gate.mjs";
import {layerCalled} from "../view/vocabulary.mjs";
import {topbar} from "./frame.mjs";
import {draftDot, draftMarks} from "../view/review.mjs";
import {marked} from "./marks.mjs";
import {githubMark} from "../view/shell-panel.mjs";
import {keyIdentity} from "../view/key-identity.mjs";
import {keycodePlacements, reachLine} from "../view/placements.mjs";
import {durationControl} from "./duration.mjs";
import {layerSwitchGrid} from "./layer-switches.mjs";
import {fieldParts, isLayerSwitch, sectionsOn} from "../view/settings-layout.mjs";

/** @typedef {import("../../contracts/panel.js").PublishedModel} Model */
/** @typedef {import("../../contracts/panel.js").PresentedSection} Section */
/** @typedef {import("../../contracts/panel.js").PresentedField} Field */

export const screenBehaviours = () => settingsScreen("behaviours", "Behaviours",
    "How long a key waits to tell a tap from a hold, and the layers on which keys use their behaviours.");
export const screenCombos = () => settingsScreen("combos", "Combos",
    "Whether combos run and on which layers, the timing every combo shares, and the layer each layer matches its combos on.");
export const screenPointer = () => settingsScreen("pointer", "Pointer",
    "How the trackball moves the pointer: its speed, sniping (a slower speed for precise work), and the layer moving the ball turns on.");
export const screenHost = () => settingsScreen("host", "Host",
    "The computer the keyboard is plugged into, which macros type for, and the key swaps and typing options for every layer.");

// One Settings screen: its sections as cards, all open, each saved whole.
/** @param {string} screen @param {string} title @param {string} subtitle */
function settingsScreen(screen, title, subtitle) {
    const model = getModel();
    const sections = sectionsOn(model?.configDefaults || [], screen);
    const gate = editGate(model, "settings"), canEdit = gate.editable;
    const main = el(`<div class="main">${topbar(title, subtitle)}</div>`);

    const content = el(`<div class="content"><div class="pad settings-pad"></div></div>`);
    const pad = /** @type {HTMLElement} */ (content.firstElementChild);
    if (!sections.length) {
        pad.appendChild(el(`<div class="screen-stub"><h3>No settings read</h3>
            <p class="note">${esc(gate.why || "Choose Read keyboard to read this keyboard's settings.")}</p></div>`));
    }
    // Why nothing here can be edited, said once; while the keyboard is busy
    // the draft bar already says what it is doing.
    else if (!canEdit && !gate.quiet) {
        pad.appendChild(el(`<div class="unavailable">${esc(gate.why || "These settings cannot be edited right now.")}</div>`));
    }
    // A section the keyboard has not filled in yet (Key swaps before its
    // options are read) still shows, to say why it is empty.
    for (const section of sections) {
        if (section.id === "comboSettings") pad.appendChild(combosCard(model, section, canEdit));
        else if (section.id === "comboReferences") pad.appendChild(referenceCard(model, section, canEdit));
        else {
            const card = sectionCard(model, section, canEdit);
            // The sniping keys sit under Sniping DPI, the speed they turn on.
            if (section.id === "normalPointerSpeed") card.appendChild(snipingKeys(model, canEdit));
            pad.appendChild(card);
        }
    }
    main.appendChild(content);
    return main;
}

// Combos: the master switch, the default window and hold threshold every
// combo shares, whether outputs use behaviours, then the layers combos run
// on. The timing is stored with the combos rather than in the settings
// domain, so it saves on its own.
/** @param {Model | null} model @param {Section} section @param {boolean} canEdit */
const combosCard = (model, section, canEdit) => sectionCard(model, section, canEdit,
    {extra: {after: "combosEnabled", nodes: (section.comboTiming || []).map((entry) => comboTimingRow(model, entry))}});

// Combo layer matching: one select per layer, four across, the sentence
// said once. Saved whole, as every section is.
/** @param {Model | null} model @param {Section} section @param {boolean} canEdit */
function referenceCard(model, section, canEdit) {
    const node = el(`<section class="card settings-group" data-section="${esc(section.id)}">
        <div class="card-h"><h3>${esc(section.label)}${draftMarks(model?.draft?.changes).settings.has(section.id) ? draftDot() : ""}</h3></div>
        ${section.description ? `<div class="card-b settings-intro"><p class="note">${esc(section.description)}</p></div>` : ""}
        <div class="rows"><div class="setrow layer-switches" data-tip="${esc(section.description || "")}"><div class="layer-grid reference-grid" role="group" aria-label="${esc(section.label)}"></div></div></div>
    </section>`);
    const grid = /** @type {HTMLElement} */ (node.querySelector(".reference-grid"));
    const submit = () => post(edits.settingsSection(section, (field) => {
        const input = /** @type {HTMLSelectElement | null} */ (node.querySelector(`[data-macro="${cssEscape(field.macro)}"]`));
        return input ? input.value : undefined;
    }, model?.settingsEditing?.identity));
    for (const field of section.fields) {
        const at = field.governs?.kind === "layer" ? field.governs.layer : -1;
        const layer = layers().find((entry) => entry.index === at);
        const editable = canEdit && !field.readOnly;
        const cell = el(`<label class="reference-cell" data-tip="${esc([field.tooltip, field.hint].filter(Boolean).join(" "))}">
            <span class="txt">${layerCell(model, field, layer)}</span>
            <select class="input compact" data-macro="${esc(field.macro)}" data-f="setting:${esc(field.macro)}" aria-label="${esc(field.label)}" ${editable ? "" : "disabled"}>
            ${layers().map((entry) => `<option value="${esc(entry.name)}" ${field.value === entry.name ? "selected" : ""}>${esc(layerCalled(entry))}</option>`).join("")}</select></label>`);
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
    const editable = editGate(model, "combos").editable;
    const hint = entry.hint;
    const row = el(`<div class="setrow" data-tip="${esc(hint)}" data-timing="${esc(entry.id)}">
        <div><div class="nm">${esc(entry.label)}</div>
            <div class="hint">${esc(hint)}</div></div>
        <div class="control"><span class="affix unit"><input class="input mono" id="${hold ? "comboHoldTerm" : "comboDefaultWindow"}" data-f="settings:combo:${hold ? "hold" : "default"}" inputmode="numeric" value="${esc(stored)}" ${editable ? "" : "disabled"}><i>ms</i></span></div>
    </div>`);
    // Posted on its own rather than riding along with whichever combo is saved
    // next. The keyboard always stores a number, so an emptied field is put
    // back rather than read as some default.
    /** @type {HTMLInputElement} */ (row.querySelector("input")).addEventListener("change", (event) => {
        const written = /** @type {HTMLInputElement} */ (event.target).value.trim();
        if (!written) { /** @type {HTMLInputElement} */ (event.target).value = stored; return; }
        if (written === stored) return;
        post(hold ? edits.comboHoldTerm(written, model?.profileIdentity) : edits.comboDefaultWindow(written, model?.profileIdentity));
    });
    return row;
}

/**
 * One section as an open card, saved whole. `extra` adds rows another store
 * saves after the named field's row.
 * @param {Model | null} model @param {Section} section @param {boolean} canEdit
 * @param {{extra?: {after: string, nodes: HTMLElement[]}}} [options]
 */
function sectionCard(model, section, canEdit, {extra} = {}) {
    const node = el(`<section class="card settings-group" data-section="${esc(section.id)}">
        <div class="card-h"><h3>${esc(section.label)}${draftMarks(model?.draft?.changes).settings.has(section.id) ? draftDot() : ""}</h3></div>
        ${section.description ? `<div class="card-b settings-intro"><p class="note">${esc(section.description)}</p></div>` : ""}
        <div class="rows"></div>
        ${section.warning ? `<div class="card-b"><div class="callout warn" role="note">${esc(section.warning)}</div></div>` : ""}
        ${section.githubLink ? `<div class="card-b"><a class="btn tiny ghost" href="${esc(section.githubLink.url)}" target="_blank" rel="noopener">${githubMark("settings-help-mark")}<span>${esc(section.githubLink.label)}</span></a></div>` : ""}
    </section>`);
    const rows = /** @type {HTMLElement} */ (node.querySelector(".rows"));

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
    // row of layers rather than a row each.
    const grouped = section.layerGroup ? section.fields.filter(isLayerSwitch) : [];
    const slot = section.fields.some((entry) => entry.governs && !grouped.includes(entry));
    for (const {part, fields} of fieldParts(section.fields)) {
        if (part) rows.appendChild(el(`<div class="setrow-part">${esc(part)}</div>`));
        for (const field of fields) {
            if (grouped.includes(field)) {
                if (field === grouped[0] && section.layerGroup) rows.appendChild(layerGroupRow(section.layerGroup, grouped, canEdit, submit));
                continue;
            }
            rows.appendChild(fieldRow(field, canEdit, submit, slot, durations));
            if (extra && field.macro === extra.after) rows.append(...extra.nodes);
        }
    }
    // A section QMK owns whole says so once, by its title, not on every row.
    if (section.fields.length > 1 && section.fields.every((field) => field.keyboardKeys)) {
        node.querySelectorAll(".rows .kk-mark").forEach((mark) => mark.remove());
        node.querySelector(":scope > .card-h > h3")?.insertAdjacentHTML("afterend", html(keyboardKeysMark(section.fields[0])));
    }
    return node;
}

// A cell of a grid of one switch or choice per layer: the layer named by its
// mark, as everywhere a layer is named (D-L31).
/** @param {Model | null} model @param {Field} field @param {import("../../contracts/panel.js").Layer | undefined} layer */
const layerCell = (model, field, layer) => layer
    ? marked(model, {kind: "layer", layer: layer.index}, layerCalled(layer))
    : marked(model, field.governs, field.label);

// A section's one-per-layer switches as one row of layers (layer-switches.mjs).
// Each keeps its own field identity, so the section still saves whole.
/** @param {{label: string, hint: string}} group @param {Field[]} fields @param {boolean} canEdit @param {() => void} submit */
function layerGroupRow(group, fields, canEdit, submit) {
    const row = el(`<div class="setrow layer-switches" data-tip="${esc(group.hint)}">
        <div><div class="nm">${esc(group.label)}${keyboardKeysMark(fields[0])}</div><div class="hint">${esc(group.hint)}</div></div>
    </div>`);
    const grid = layerSwitchGrid(getModel(), group.label, fields.map((field) => ({
        layer: field.governs?.kind === "layer" ? field.governs.layer : -1, label: field.label, macro: field.macro, f: `setting:${field.macro}`,
        checked: Boolean(field.enabled), disabled: !canEdit || Boolean(field.readOnly),
        tip: [field.tooltip, field.hint, field.readOnly ? "This setting cannot be edited with the connected firmware." : ""].filter(Boolean).join(" "),
    })));
    /** @type {NodeListOf<HTMLInputElement>} */ (grid.querySelectorAll("input")).forEach((input) => input.addEventListener("change", submit));
    row.appendChild(grid);
    return row;
}

/** @param {import("../../contracts/panel.js").PresentedField} field @param {boolean} canEdit @param {() => void} submit @param {boolean} slot @param {Map<string, ReturnType<typeof durationControl>>} durations */
function fieldRow(field, canEdit, submit, slot, durations) {
    const editable = canEdit && !field.readOnly;
    // A number field shows its unit inside the input, as every screen does,
    // so the label drops the "(ms)" it carries in the review.
    const affixed = Boolean(field.unit) && !field.readOnly && field.presentation !== "duration"
        && field.kind !== "toggle" && field.kind !== "layer" && !field.choices?.length;
    const label = affixed ? field.label.replace(new RegExp(`\\s*\\(${field.unit}\\)$`), "") : field.label;
    const row = el(`<div class="setrow ${field.readOnly ? "ro" : ""}" data-tip="${esc([field.tooltip, field.hint].filter(Boolean).join(" "))}">
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
            ${layers().map((layer) => `<option value="${esc(layer.name)}" ${field.value === layer.name ? "selected" : ""}>${esc(layerCalled(layer))}</option>`).join("")}</select>`);
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

// Sniping is on while a sniping key is held or toggled, and while an
// auto-sniping layer is on; this says where those keys are, places one, and
// says what sniping slows.
/** @param {Model | null} model @param {boolean} canEdit */
function snipingKeys(model, canEdit) {
    const node = el(`<div class="card-b sniping-keys">
        <div class="sect-h"><h4>Sniping keys</h4></div>
        <p class="note">Sniping is on while one of these keys is held or toggled, and while one of the auto-sniping layers is on.</p></div>`);
    for (const keycode of ["SNIPING", "SNP_TOG"]) {
        const words = keyIdentity(model, keycode).label;
        const row = el(`<div class="row gap-10 sniping-key">
            <span class="sniping-name">${esc(words)}</span>
            <span class="note">${esc(reachLine(keycodePlacements(model, [keycode])))}</span>
            <button class="btn tiny right" data-place="${esc(keycode)}" ${canEdit ? "" : "disabled"}>Place on a key…</button></div>`);
        /** @type {HTMLButtonElement} */ (row.querySelector("[data-place]")).addEventListener("click", () => {
            state.placement = {keycode};
            state.screen = "keys";
            state.tab = "key";
            render();
        });
        node.appendChild(row);
    }
    node.appendChild(el(`<p class="note">Sniping also slows directional pointing modes; scrolling modes ignore it. Sniping DPI keys on the keyboard change its speed too.</p>`));
    return node;
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
