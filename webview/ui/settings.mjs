// @ts-check
// Settings: the keyboard's global policy, exactly as it reports it.
//
// The sections, fields, hints and limits all come from the device snapshot, so
// this screen renders what the firmware says it has rather than a list this
// app decided on. A field the firmware cannot report stays visible and
// read-only with its reason. Each section names the screen it is edited on:
// this one draws the Settings sections, and Mouse draws its own with the same
// cards.

// Selector assertions refer to elements created by this module's authored markup.
import * as edits from "../view/edits.mjs";
import {DISCLOSURE, el, esc} from "../lib/dom.mjs";
import {getModel, layerName, layers, post, render, state, canEdit as canEditArea} from "../store.mjs";
import {topbar, unavailable} from "./shell.mjs";
import {draftDot, draftMarks} from "../view/review.mjs";
import {marked} from "./marks.mjs";
import {githubMark} from "../view/host.mjs";
import {durationControl} from "./duration.mjs";
import {NAME_MAX_BYTES, NAME_TIP, nameCount} from "../view/names.mjs";

// The sections a screen draws, by the area the keyboard's model files them in.
/** @param {import("../../contracts/panel.js").PublishedModel | null} model @param {string} area */
export const sectionsIn = (model, area) => (model?.configDefaults || []).filter((section) => section.area === area);

export function screenSettings() {
    const model = getModel();
    const sections = sectionsIn(model, "Settings");
    const canEdit = canEditArea("settings");
    const main = el(`<div class="main">${topbar(
        "Settings",
        "What applies to the whole keyboard: its name, tap and hold timing, where behaviours and combos run, and the computer it types on."
    )}</div>`);

    const content = el(`<div class="content"><div class="pad settings-pad"></div></div>`);
    const pad = /** @type {HTMLElement} */ (content.firstElementChild);
    if (!sections.length) {
        pad.appendChild(el(`<div class="screen-stub"><h3>No settings read</h3>
            <p class="note">${esc(unavailable(model) || "Choose Read keyboard to load this keyboard's policy.")}</p></div>`));
    }
    if (!canEdit && sections.length) {
        pad.appendChild(el(`<div class="unavailable">${esc(unavailable(model)
            || "These settings cannot be edited right now.")}</div>`));
    }

    if (sections.length) {
        const search = el(`<input class="input search settings-search" id="settingsSearch" data-f="settings:search" type="search" placeholder="Search settings" value="${esc(state.settingsSearch || "")}">`);
        search.addEventListener("input", () => {
            state.settingsSearch = /** @type {HTMLInputElement} */ (search).value;
            render();
        });
        pad.appendChild(search);
    }
    const query = (state.settingsSearch || "").trim().toLowerCase();
    if (model?.keyboardName && (!query || matches(KEYBOARD_NAME, query))) pad.appendChild(keyboardCard(model, model.keyboardName, canEdit));
    /** @param {import("../../contracts/panel.js").PresentedSection} section */
    // A section found by one of its other names (section.search: QMK's,
    // or the one Ark used before) shows whole.
    const matching = (section) => !query || matches({label: section.label, hint: section.search}, query) ? section.fields : section.fields.filter((field) => matches(field, query));
    for (const section of sections) {
        const fields = matching(section);
        const timing = section.id === "comboSettings" ? (section.comboTiming || []).filter((entry) => !query || matches(entry, query)) : [];
        if (!fields.length && !timing.length) continue;
        const card = sectionCard(model, section, fields, canEdit, Boolean(query));
        if (section.id === "comboSettings") {
            for (const entry of timing) /** @type {HTMLElement} */ (card.querySelector(".rows")).appendChild(comboTimingRow(model, entry));
            /** @type {HTMLElement} */ (card.querySelector(".card-h .tag")).textContent = `${section.fields.length + (section.comboTiming || []).length} settings`;
        }
        pad.appendChild(card);
    }
    // A search for something that moved to Trackball or Lighting says where
    // it went, and goes there: a Lighting section opens its stage.
    for (const [area, screen, name] of /** @type {const} */ ([["Trackball", "mouse", "Trackball"], ["Lighting", "lighting", "Lighting"]])) {
        const found = query ? sectionsIn(model, area).filter((section) => matching(section).length) : [];
        const elsewhere = found.reduce((total, section) => total + matching(section).length, 0);
        if (!elsewhere) continue;
        const note = el(`<div class="callout row gap-10" data-elsewhere="${area}">
            <span>${elsewhere} matching setting${elsewhere === 1 ? " is" : "s are"} on the ${name} screen${area === "Lighting" ? ` (${esc(found.map((section) => section.label).join(", "))})` : ""}.</span>
            <button class="btn text" data-act="${screen}">Open ${name} →</button></div>`);
        /** @type {HTMLButtonElement} */ (note.querySelector("button")).addEventListener("click", () => {
            state.screen = screen;
            if (found[0]?.stage) state.stage = found[0].stage;
            render();
        });
        pad.appendChild(note);
    }

    main.appendChild(content);
    return main;
}

// The default combo window and the combo hold threshold apply to every combo,
// so they are edited with the other combo settings. The keyboard stores them
// with the combos rather than in the settings domain, so each saves as a combo
// edit. A keyboard that stores them once has them even without combos; an
// older one has no default, and repeats the threshold on every combo, so there
// is nothing to store it on until a combo exists.
// A combo follows the default window unless it has its own, so changing it
// re-times those combos. QMK waits for the hold threshold only on combos that
// must be held or are tap only — the longer of it and the combo's own window
// — and every other combo ignores it.
/** @param {import("../../contracts/panel.js").PublishedModel | null} model @param {import("../../contracts/model.js").ComboTimingField} entry */
function comboTimingRow(model, entry) {
    const readback = model?.comboReadback || {};
    const stores = readback.version === 2;
    const hold = entry.id === "hold";
    const value = hold ? readback.holdTermMs : readback.defaultTermMs;
    const stored = String(value ?? "");
    const combos = model?.combos || [];
    const editable = canEditArea("combos") && (stores || (hold && combos.length > 0));
    const hint = stores ? entry.hint : hold ? (combos.length ? entry.hint : "Stored with the combos, so it can be set once the keyboard has one. Flash the updated firmware pair to set it without one.")
        : "This keyboard keeps each combo's own window. Flash the updated firmware pair to set a default.";
    const row = el(`<div class="setrow" data-tip="${esc(hint)}">
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

// Search reads a field's label, hint and hover help, so a QMK name said only
// in the hover help still finds it.
/** @param {{label: string, hint?: string, tooltip?: string, macro?: string}} field @param {string} query */
const matches = (field, query) => `${field.label} ${field.hint || ""} ${field.tooltip || ""}`.toLowerCase().includes(query);

// The keyboard's own name, which it stores with its settings and reports over
// USB. Empty is the firmware's built-in name, shown as the placeholder when
// the keyboard reports it. Changing it is one draft edit, posted on change.
const KEYBOARD_NAME = {label: "Keyboard name",
    hint: "Shown in Chrome's keyboard chooser, your computer's list of devices and Ark's keyboard menu. Leave it empty for the built-in name. After Apply the keyboard reconnects for a moment to take its new name."};
/** @param {import("../../contracts/panel.js").PublishedModel | null} model @param {NonNullable<import("../../contracts/panel.js").PublishedModel["keyboardName"]>} keyboard @param {boolean} canEdit */
function keyboardCard(model, keyboard, canEdit) {
    const count = nameCount(keyboard.name, keyboard.perName || NAME_MAX_BYTES);
    const node = el(`<section class="card settings-group" data-section="keyboard">
        <div class="card-h"><h3>Keyboard${draftMarks(model?.draft?.changes).settings.has("keyboard") ? draftDot() : ""}</h3>
            <span class="right tag">1 setting</span></div>
        <div class="rows"><div class="setrow" data-tip="${esc(KEYBOARD_NAME.hint)}">
            <div><div class="nm">Name</div><div class="hint">${esc(KEYBOARD_NAME.hint)}</div></div>
            <div class="control field"><input class="input" data-f="settings:keyboard-name" data-keyboard-name value="${esc(keyboard.name)}"
                placeholder="${esc(keyboard.builtIn || "Built-in name")}" aria-label="Keyboard name" data-tip="${esc(KEYBOARD_NAME.hint + " " + NAME_TIP)}" ${canEdit ? "" : "disabled"}>
                <span class="note${count.over ? " warn" : ""}" data-name-count>${esc(count.label)}</span></div>
        </div></div>
    </section>`);
    const input = /** @type {HTMLInputElement} */ (node.querySelector("[data-keyboard-name]"));
    input.addEventListener("input", () => {
        const now = nameCount(input.value, keyboard.perName || NAME_MAX_BYTES), counter = /** @type {HTMLElement} */ (node.querySelector("[data-name-count]"));
        counter.textContent = now.label;
        counter.classList.toggle("warn", now.over);
    });
    input.addEventListener("change", () => post(edits.keyboardNameMessage(input.value, keyboard.identity)));
    return node;
}

/** @param {import("../../contracts/panel.js").PublishedModel | null} model @param {import("../../contracts/panel.js").PresentedSection} section @param {import("../../contracts/panel.js").PresentedField[]} fields @param {boolean} canEdit @param {boolean} [searching] */
export function sectionCard(model, section, fields, canEdit, searching = false) {
    // A folded section stays open once opened, by hand or by the review's
    // Show, instead of folding again on the next render.
    const opened = (state.settingsOpen || []).includes(section.id);
    const open = searching || section.expanded !== false || opened;
    const node = /** @type {HTMLDetailsElement} */ (el(`<details class="card settings-group" data-section="${esc(section.id)}" ${open ? "open" : ""}>
        <summary class="card-h">${DISCLOSURE}<h3>${esc(section.label)}${draftMarks(model?.draft?.changes).settings.has(section.id) ? draftDot() : ""}</h3>
            <span class="right tag">${section.fields.length} setting${section.fields.length === 1 ? "" : "s"}</span></summary>
        ${section.description ? `<div class="card-b settings-intro"><p class="note">${esc(section.description)}</p></div>` : ""}
        <div class="rows"></div>
        ${section.warning ? `<div class="card-b"><div class="callout warn" role="note">${esc(section.warning)}</div></div>` : ""}
        ${section.githubLink ? `<div class="card-b"><a class="btn tiny ghost" href="${esc(section.githubLink.url)}" target="_blank" rel="noopener">${githubMark("settings-help-mark")}<span>${esc(section.githubLink.label)}</span></a></div>` : ""}
    </details>`));
    const rows = /** @type {HTMLElement} */ (node.querySelector(".rows"));
    if (section.expanded === false) node.addEventListener("toggle", () => {
        const others = (state.settingsOpen || []).filter((id) => id !== section.id);
        state.settingsOpen = node.open ? [...others, section.id] : others;
    });

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
    const grouped = section.layerGroup ? section.fields.filter(layerSwitch) : [];
    const slot = section.fields.some((entry) => entry.governs && !grouped.includes(entry));
    for (const field of section.fields) {
        if (grouped.includes(field)) {
            if (field === grouped[0] && section.layerGroup) rows.appendChild(layerGroupRow(section.layerGroup, grouped, fields, canEdit, submit));
            continue;
        }
        const hidden = !fields.includes(field);
        rows.appendChild(fieldRow(field, canEdit, submit, hidden, slot, durations));
    }
    return node;
}

/** @param {import("../../contracts/panel.js").PresentedField} field */
const layerSwitch = (field) => field.kind === "toggle" && field.governs?.kind === "layer";

// One switch per layer, each named by its layer and marked in its colour, in
// the order the layer tabs read. Each keeps its own field identity, so the
// section still saves whole and a search still finds a single layer.
/** @param {{label: string, hint: string}} group @param {import("../../contracts/panel.js").PresentedField[]} fields @param {import("../../contracts/panel.js").PresentedField[]} shown @param {boolean} canEdit @param {() => void} submit */
function layerGroupRow(group, fields, shown, canEdit, submit) {
    const model = getModel();
    const row = el(`<div class="setrow layer-switches" data-tip="${esc(group.hint)}" ${fields.some((field) => shown.includes(field)) ? "" : "hidden"}>
        <div><div class="nm">${esc(group.label)}</div><div class="hint">${esc(group.hint)}</div></div>
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
        <div><div class="nm">${marked(getModel(), field.governs, label, {slot})}</div>${field.hint ? `<div class="hint">${esc(field.hint)}</div>` : ""}</div>
        <div class="control"></div>
    </div>`);
    const control = /** @type {HTMLElement} */ (row.querySelector(".control"));

    if (field.readOnly) {
        control.appendChild(el(`<span class="chip"
            data-tip="${esc([field.tooltip, field.hint, "This setting cannot be edited with the connected firmware."].filter(Boolean).join(" "))}">read-only · ${esc(field.kind === "toggle" ? (field.enabled ? "on" : "off") : field.value)}</span>`));
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

/** @param {string} value */
const cssEscape = (value) => String(value).replace(/["\\]/g, "\\$&");
