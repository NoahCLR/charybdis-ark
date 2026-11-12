// @ts-check
import {DISCLOSURE, el, esc} from "../../lib/dom.mjs";

import {foldOpen, keepFold} from "../disclosure.mjs";
import {currentLayer, getModel, post, render, state} from "../../store.mjs";
import {localityInText, vocabulary, word} from "../../view/vocabulary.mjs";
import {editGate} from "../../view/edit-gate.mjs";
import {isOff, isPassthrough, stageEnabled} from "../../view/lighting.mjs";
import * as edits from "../../view/edits.mjs";
import {colourEditor} from "../colour-editor.mjs";
import {sectionsIn} from "../../view/settings-layout.mjs";

/** @param {string} title @param {string} [extra] */
export const section = (title, extra = "") => sectionMarked(esc(title), extra);
// The same with its title already markup, a layer in it by its mark.
/** @param {string} title @param {string} [extra] */
export const sectionMarked = (title, extra = "") => el(`<section><div class="sect-h"><h4>${title}</h4>${extra}</div></section>`);

// A stage's on/off switch rides on the header line of the section that says
// where or when the stage paints (Where it paints, When and where, Timing),
// the body's last column, so whether it paints sits with where it paints
// and no row is spent on it. The switch keeps the stage's colours; its bit
// comes from the keyboard (model.rgb.stages), and a stage without one has
// no switch.
/** @param {import("../../../contracts/panel.js").PublishedModel} model @param {string} id */
export function stageSwitch(model, id) {
    const bit = (model.rgb.stages || []).find((stage) => stage.id === id)?.bit;
    if (bit === undefined) return null;
    const on = stageEnabled(model, id);
    const sw = el(`<label class="sw" data-tip="Turn this whole stage off without losing the colours it stores.">
        <input data-f="lighting:${esc(id)}:enabled" type="checkbox" ${on ? "checked" : ""} ${editGate(model, "lighting").editable ? "" : "disabled"}><span class="track"></span>
        <span class="txt">${on ? "Stage on" : "Stage off"}</span></label>`);
    /** @type {HTMLInputElement} */ (sw.querySelector("input")).addEventListener("change", (event) => {
        const mask = model.rgb.stageEnableMask ?? 0;
        post(edits.rgbStages(mask, bit, /** @type {HTMLInputElement} */ (event.target).checked));
    });
    return sw;
}

/** @param {import("../../../contracts/panel.js").PublishedModel} model @param {string} id @param {string} title */
export function paintsSection(model, id, title) {
    const node = section(title);
    const sw = stageSwitch(model, id);
    if (sw) /** @type {HTMLElement} */ (node.querySelector(".sect-h")).appendChild(sw);
    return node;
}

// A group of a Lighting list folds as the Keymap's groups do, its open state
// kept by "stage:group" across renders (state.lightingGroupsShut).
/** @param {string} id @returns {{open: boolean, toggle: () => void}} */
export function lightingGroup(id) {
    const open = !state.lightingGroupsShut.includes(id);
    return {open, toggle: () => {
        state.lightingGroupsShut = open ? [...state.lightingGroupsShut, id] : state.lightingGroupsShut.filter((each) => each !== id);
        render();
    }};
}

// What a stage does, said the same way on every stage's tab: under its
// editors, across them, before its accents, behind one fold that stays as
// it was left for the session (keepFold): it is read once.
/** @param {string} text */
export function aboutStage(text) {
    const node = el(`<section class="span stage-fold"><details ${foldOpen("lighting:about") ? "open" : ""}>
        <summary class="disclose">${DISCLOSURE}<span>What this stage does</span></summary></details></section>`);
    const fold = /** @type {HTMLDetailsElement} */ (node.querySelector("details"));
    fold.append(el(`<p class="note stage-about">${esc(text)}</p>`));
    fold.addEventListener("toggle", () => { keepFold("lighting:about", fold.open); });
    return node;
}

// How long a feedback stage's flash lasts: Behaviour feedback's flash
// interval (lightingFeedback) or Replacement feedback's flash length
// (replacementFeedback), each a stored setting of its own. The keyboard keeps
// them with its settings, so each saves as a settings section of one field,
// drawn as a field of the stage's When and where.
/** @param {import("../../../contracts/panel.js").PublishedModel} model @param {string} sectionId */
export function flashSetting(model, sectionId) {
    const flash = sectionsIn(model, "Lighting").find((entry) => entry.id === sectionId);
    const field = flash?.fields[0];
    if (!flash || !field) return el(`<span></span>`);
    const editable = editGate(model, "settings").editable && !field.readOnly;
    const label = field.unit ? field.label.replace(new RegExp(`\\s*\\(${field.unit}\\)$`), "") : field.label;
    const node = el(`<label class="field" data-tip="${esc([field.tooltip, field.hint].filter(Boolean).join(" "))}"><span>${esc(label)}</span>
        <span class="affix unit"><input class="input mono num" inputmode="numeric" data-macro="${esc(field.macro)}" data-f="setting:${esc(field.macro)}" value="${esc(field.value)}" ${editable ? "" : "disabled"}>${field.unit ? `<i>${esc(field.unit)}</i>` : ""}</span>
        <span class="hint">${esc(field.hint || "")}</span></label>`);
    /** @type {HTMLInputElement} */ (node.querySelector("input")).addEventListener("change", (event) => {
        const written = /** @type {HTMLInputElement} */ (event.target).value.trim();
        if (!written) { /** @type {HTMLInputElement} */ (event.target).value = field.value; return; }
        if (written !== field.value) post(edits.settingsSection(flash, () => written, model.settingsEditing?.identity));
    });
    return node;
}

/** @param {...Node} nodes */
export function stack(...nodes) {
    const box = el(`<div class="stack gap-12"></div>`);
    box.append(...nodes);
    return box;
}

/** @param {string | undefined} value */
export const localityLabel = value => word(vocabulary(getModel()).localities, value);

// What a list says a colour an owner has paints, beside its name (D-L94):
// passthrough, which paints nothing; off where its LEDs go dark; else where
// it paints.
/** @param {import("../../../contracts/edits.js").Colour | undefined} colour @param {string | undefined} locality */
export function paintsCell(colour, locality) {
    const where = localityInText(getModel(), locality);
    return isPassthrough(colour) ? "passthrough" : isOff(colour) ? `off · ${where}` : where;
}

// A Locality field: where one owner's colour paints (a pointing slot's, a
// feedback case's, D-L93), with what its trigger key is under it when that
// depends on the owner.
/** @param {import("../../../contracts/panel.js").PublishedModel} model @param {{f: string, value: string | undefined, canEdit: boolean, tip: string, hint?: string, onChange: (locality: string) => void}} options */
export function localityField(model, {f, value, canEdit, tip, hint = "", onChange}) {
    const words = vocabulary(model);
    const node = el(`<label class="field"><span>${esc(words.lightingFields.locality)}</span>
        <select data-f="${esc(f)}" class="input" ${canEdit ? "" : "disabled"} data-tip="${esc(tip)}">
        ${words.localities.map(([id, text]) => `<option value="${esc(id)}" ${value === id ? "selected" : ""}>${esc(text)}</option>`).join("")}</select>
        ${hint ? `<span class="hint">${esc(hint)}</span>` : ""}</label>`);
    /** @type {HTMLSelectElement} */ (node.querySelector("select")).addEventListener("change", (event) => onChange(/** @type {HTMLSelectElement} */ (event.target).value));
    return node;
}

// Keep each colour editor's identity tied to the same stored owner as before.
/** @param {import("../../../contracts/panel.js").PublishedModel} model @param {Omit<Parameters<typeof colourEditor>[0], "identity">} options */
export function colourControl(model, options) {
    return colourEditor({identity: `lighting:${state.stage}:${state.stage === "layers" ? currentLayer()?.index : state.stage === "pd" ? state.pointingSlot : state.stage === "key" ? state.feedbackRow : state.stage === "autocorrect" ? state.replacementRow : "stage"}`, maximumBrightness: model.rgb.maximumBrightness, ...options});
}
