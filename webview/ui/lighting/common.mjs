// @ts-check
import {el, esc} from "../../lib/dom.mjs";

import {currentLayer, getModel, post, render, state} from "../../store.mjs";
import {localityInText, vocabulary, word} from "../../view/vocabulary.mjs";
import {editGate} from "../../view/edit-gate.mjs";
import {isOff, isPassthrough, lightingOff, stageEnabled, stageHeldOffBy, stageOffDetail} from "../../view/lighting.mjs";
import * as edits from "../../view/edits.mjs";
import {colourEditor} from "../colour-editor.mjs";
import {settingOffWord} from "../participation.mjs";
import {sectionsIn} from "../../view/settings-layout.mjs";
import {stageInfo} from "./help.mjs";
import {accentOwner, ownerMark} from "../../view/accents.mjs";
import {marked} from "../marks.mjs";

/** @typedef {import("../../../contracts/panel.js").PublishedModel} Model */

/** @param {string} title @param {string} [extra] markup after the title: an info mark, a button */
export const section = (title, extra = "") => el(`<section><div class="sect-h"><h4>${esc(title)}</h4>${extra}</div></section>`);

// Every stage is laid out the same way, so switching tabs moves nothing that
// both have (D-L95). Across the top, the stage bar holds what is the whole
// stage's: its name and what it does (an info mark), the settings every item
// on it shares, whether a switch elsewhere keeps it from painting, and its
// Stage on switch, always at the bar's end. Under it, the first column (a
// stage's list, or the background effect's and the fade's own settings),
// then the colour beside where it paints, then the accents; on a stage with
// a list, the item picked heads its colour, where it paints and its accents,
// which are that item's alone.
/** @param {Model} model @param {{id: string, first: HTMLElement, head?: HTMLElement | null, colour: HTMLElement, side: HTMLElement, accents?: HTMLElement | null, shared?: HTMLElement[], note?: string}} parts */
export function stageSurface(model, {id, first, head = null, colour, side, accents = null, shared = [], note = ""}) {
    const node = el(`<div class="stage" data-stage="${esc(id)}"></div>`);
    const main = el(`<div class="tab-split reach-split stage-main"></div>`);
    const detail = el(`<div class="tab-grid two stage-detail"></div>`);
    if (head) detail.append(head);
    detail.append(colour, side);
    if (accents) detail.append(accents);
    main.append(first, detail);
    node.append(stageBar(model, id, {shared, note}), main);
    return node;
}

// The stage bar: what the whole stage is, in the same place on every tab.
/** @param {Model} model @param {string} id @param {{shared?: HTMLElement[], note?: string, end?: HTMLElement | null}} [options] */
export function stageBar(model, id, {shared = [], note = "", end = null} = {}) {
    const label = id === "accents" ? "All accents" : vocabulary(model).stages.find((stage) => stage.id === id)?.label || "";
    const sw = stageSwitch(model, id);
    const off = Boolean(sw) && !stageEnabled(model, id);
    const node = el(`<div class="stage-bar${off ? " off" : ""}" data-stage-bar="${esc(id)}">
        <div class="stage-bar-title"><span>${esc(label)}</span>${stageInfo(model, id)}</div></div>`);
    if (shared.length) {
        const box = el(`<div class="stage-bar-shared"><span class="stage-bar-scope">${esc(sharedBy(model, id))}</span></div>`);
        box.append(...shared);
        node.append(box);
    }
    // A stage switched off says so where the bar has room: beside its shared
    // settings the switch's own "Stage off" says it, so the bar keeps one line.
    const said = off && !shared.length ? "This stage is off: nothing on it paints, and its colours are kept." : note;
    if (said) node.append(el(`<span class="stage-bar-note">${esc(said)}</span>`));
    node.append(el(`<span class="grow"></span>`));
    // That nothing lights is news on every stage; a switch elsewhere that
    // keeps this one from painting goes to that switch, its whole sentence
    // in its tip, and the bar is tinted while either holds.
    if (lightingOff(model)) {
        node.classList.add("held");
        node.append(el(`<span class="stage-held" data-tip="Nothing is lit. Its switch is beside the title.">All lighting is off</span>`));
    } else {
        const heldBy = stageHeldOffBy(model, id);
        if (heldBy) {
            node.classList.add("held");
            node.append(settingOffWord(heldBy, stageOffDetail(model, id)));
        }
    }
    if (end) node.append(end);
    if (sw) node.append(sw);
    return node;
}

// Whose the settings on a stage bar are: every item of the stage, in the
// words its accents use for all of them.
/** @param {Model} model @param {string} id */
const sharedBy = (model, id) => ({key: vocabulary(model).accents.keyBehavior.every, autocorrect: vocabulary(model).accents.autocorrect.every})[id] || "";

// A stage's on/off switch, at the end of its stage bar. It keeps the stage's
// colours; its bit comes from the keyboard (model.rgb.stages), and a stage
// without one has no switch.
/** @param {Model} model @param {string} id */
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

// The item a stage's list has picked, heading what is its own: its mark and
// name, and in one line where it paints or, for a replacement case, when it
// shows.
/** @param {string} name markup: the item's name, with its mark @param {string} line @param {{when?: boolean}} [options] `when`: the line says when it shows */
export const itemHead = (name, line, {when = false} = {}) => el(`<div class="span stage-item"><span class="stage-item-name">${name}</span><span class="note"${when ? " data-replacement-when" : ""}>${esc(line)}</span></div>`);

// The item a stage's tab has picked, by its mark and name, as its accents'
// heading names it (D-L31).
/** @param {Model} model @param {string} stage @param {string} name */
export function pickedMarked(model, stage, name) {
    const whose = accentOwner(model, stage, {layer: state.layer, pointingSlot: state.pointingSlot, feedbackRow: state.feedbackRow, replacementRow: state.replacementRow});
    return whose ? marked(model, ownerMark(model, whose.target, whose.owner), name) : esc(name);
}

// Where a colour paints, for an item's head: passthrough, which paints
// nothing; off, where its LEDs go dark; else where it paints (D-L94).
/** @param {import("../../../contracts/edits.js").Colour | undefined} colour @param {string} where */
export const paintsLine = (colour, where) => isPassthrough(colour) ? "Passthrough: paints nothing, so what is beneath shows"
    : isOff(colour) ? `Off: its LEDs go dark, on ${where}` : `Paints ${where}`;

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

// How long a feedback stage's flash lasts: Behaviour feedback's flash
// interval (lightingFeedback) or Replacement feedback's flash length
// (replacementFeedback), each a stored setting of its own, on the stage
// bar since it is every case's. The keyboard keeps them with its settings,
// so each saves as a settings section of one field. What it means is in the
// stage's info mark alone (a tip is one control's one line, never an
// explanation the info mark already gives).
/** @param {Model} model @param {string} sectionId */
export function flashSetting(model, sectionId) {
    const flash = sectionsIn(model, "Lighting").find((entry) => entry.id === sectionId);
    const field = flash?.fields[0];
    if (!flash || !field) return el(`<span></span>`);
    const editable = editGate(model, "settings").editable && !field.readOnly;
    const label = field.unit ? field.label.replace(new RegExp(`\\s*\\(${field.unit}\\)$`), "") : field.label;
    const node = el(`<label class="field inline"><span>${esc(label)}</span>
        <span class="affix unit"><input class="input mono num" inputmode="numeric" data-macro="${esc(field.macro)}" data-f="setting:${esc(field.macro)}" value="${esc(field.value)}" ${editable ? "" : "disabled"}>${field.unit ? `<i>${esc(field.unit)}</i>` : ""}</span></label>`);
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

// What a list says a colour an owner has paints, beside its name (D-L94):
// passthrough, which paints nothing; off where its LEDs go dark; else where
// it paints, in a word or two so the row stays one line.
/** @param {import("../../../contracts/edits.js").Colour | undefined} colour @param {string | undefined} locality */
export function paintsCell(colour, locality) {
    const where = word(vocabulary(getModel()).localitiesBrief, locality);
    return isPassthrough(colour) ? "passthrough" : isOff(colour) ? `off · ${where}` : where;
}

// Where an owner paints, whole, for its head.
/** @param {string | undefined} locality */
export const localityWhole = (locality) => localityInText(getModel(), locality);

// A Locality field: where one owner's colour paints (a pointing slot's, a
// feedback case's, D-L93), with which key its trigger key is under it where
// that depends on the owner. What each place means is in the info mark on
// its section's heading (help.mjs localityInfo).
/** @param {Model} model @param {{f: string, value: string | undefined, canEdit: boolean, hint?: string, onChange: (locality: string) => void}} options */
export function localityField(model, {f, value, canEdit, hint = "", onChange}) {
    const words = vocabulary(model);
    const node = el(`<label class="field"><span>${esc(words.lightingFields.locality)}</span>
        <select data-f="${esc(f)}" class="input" ${canEdit ? "" : "disabled"}>
        ${words.localities.map(([id, text]) => `<option value="${esc(id)}" ${value === id ? "selected" : ""}>${esc(text)}</option>`).join("")}</select>
        ${hint ? `<span class="hint">${esc(hint)}</span>` : ""}</label>`);
    /** @type {HTMLSelectElement} */ (node.querySelector("select")).addEventListener("change", (event) => onChange(/** @type {HTMLSelectElement} */ (event.target).value));
    return node;
}

// Keep each colour editor's identity tied to the same stored owner as before.
/** @param {Model} model @param {Omit<Parameters<typeof colourEditor>[0], "identity">} options */
export function colourControl(model, options) {
    return colourEditor({choiceWords: vocabulary(model).colourChoice, identity: `lighting:${state.stage}:${state.stage === "layers" ? currentLayer()?.index : state.stage === "pd" ? state.pointingSlot : state.stage === "key" ? state.feedbackRow : state.stage === "autocorrect" ? state.replacementRow : "stage"}`, maximumBrightness: model.rgb.maximumBrightness, ...options});
}
