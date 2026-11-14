// @ts-check
// A configured pointing mode's editor: one card titled by the mode's name,
// clicked to rename as Macros and Custom keys are, its actions beside it, and
// four numbered steps read top to bottom — what the ball does, what it sends
// or how it scrolls, what starts it, and what holds while it runs. Advanced
// follows as its own card, folded.
import {el, esc} from "../../lib/dom.mjs";
import {NAME_MAX_BYTES} from "../../view/names.mjs";
import {KIND, dpiOptions, readConfig, scrollStarter, settleTaps, startingRecord} from "../../view/pointing-config.mjs";
import {sectionPath} from "../../view/settings-layout.mjs";
import {post, render, state} from "../../store.mjs";
import {editGate} from "../../view/edit-gate.mjs";
import * as edits from "../../view/edits.mjs";
import {mark} from "../marks.mjs";
import {attachTitleName, titleName} from "../title-name.mjs";
import {formControls} from "./form-controls.mjs";
import {movementChoice} from "./movement-choice.mjs";
import {movement} from "./movement.mjs";
import {lightRow, placeButton} from "./keys-and-light.mjs";
import {placedOnMarkup, showPlacements} from "../keys/reach.mjs";
import {startAbout, startStep} from "./link.mjs";
import {advancedControls} from "./advanced.mjs";
import {step as pdStep} from "./step.mjs";
import {choicesPart, tipFor, words} from "./common.mjs";

/** @param {import("../../../contracts/panel.js").PublishedModel} model @param {import("../surface-types.js").PresentedSlot} slot @param {boolean} canEdit @param {import("../surface-types.js").PresentedSlot[]} slots */
export function editor(model, slot, canEdit, slots) {
    // The kind being edited, which is the stored one until step 1 changes it.
    // The form has to be rebuilt on that change: each step registers the
    // readers for its own fields, so a directional record cannot be read out
    // of a scrolling form.
    const kind = state.pdKind?.slot === slot.id ? state.pdKind.kind : slot.kind;
    // startingRecord spreads the supplied slot, retaining its presentation fields.
    if (kind !== slot.kind) slot = /** @type {import("../surface-types.js").PresentedSlot} */ (startingRecord(slot, kind, scrollStarter(slots)));
    const scrolling = kind === KIND.SCROLLING;
    const controls = formControls(model, slot, canEdit);
    const {form} = controls;
    form.kind = () => kind;
    const stage = () => {
        const {config, pending} = settleTaps(slot, readConfig(slot, form, model), model);
        const holding = Object.keys(pending).length > 0;
        const held = Boolean(state.pdTaps);
        state.pdTaps = holding ? {slot: slot.id, rows: pending} : null;
        post(edits.pdMode(slot.id, config, model.profileIdentity));
        // A new kind draws its own field, even when nothing new was stored.
        if (holding || held) render();
    };

    const wrap = el(`<div class="pd-editor stack" data-pd-editor="${esc(slot.id)}"></div>`);
    const empties = slots.some((candidate) => !candidate.kind);
    const card = el(`<div class="card">
        <div class="card-h name-titlebar"><span class="mark-lg">${mark(model, {kind: "pointing", slot: slot.id})}</span>
            ${titleName({f: `pointing:${slot.id}:name`, value: slot.name || "", placeholder: slot.displayName,
                label: words(model).fieldLabels.name, perName: NAME_MAX_BYTES, canEdit})}
            <span class="tag">Mode ${esc(slot.id)}</span>
            <span class="right row actions">
                ${empties ? `<button class="btn tiny ghost" data-act="duplicate" ${canEdit ? "" : "disabled"}
                    data-tip="Copy this mode into the first empty slot.">Duplicate</button>` : ""}
                <button class="btn tiny ghost destructive" data-act="clear" ${canEdit ? "" : "disabled"}
                    data-tip="Empty this slot. Keys bound to it stay on the board and do nothing until it holds a mode again.">Clear mode</button>
            </span></div>
        <div class="card-b pd-steps"><div class="slot-context">${placedOnMarkup(model, "pointing", String(slot.id),
            "No key, behaviour, combo or layer starts this mode. Place it on a key to use it.")}</div></div></div>`);
    /** @type {HTMLElement} */ (card.querySelector(".right")).prepend(placeButton(slot, editGate(model, "keys").editable));
    showPlacements(card, "pointing", String(slot.id));
    const nameInput = /** @type {HTMLInputElement} */ (card.querySelector("[data-name]"));
    form.name = () => nameInput.value.trim();
    // A rename stages the whole record, as every field of the mode does.
    attachTitleName(card, {stored: slot.name || "", perName: NAME_MAX_BYTES, rename: () => stage()});

    const steps = /** @type {HTMLElement} */ (card.querySelector(".pd-steps"));
    /** @param {number} n @param {string} title @param {Parameters<typeof pdStep>[5]} [about] */
    const step = (n, title, about) => pdStep(steps, slot.id, n, title, "", about);
    const P = words(model);
    step(1, "What the ball does").append(movementChoice(model, slot.id, kind, {disabled: !canEdit,
        // Switching movement only redraws the form for the other kind: its
        // fields start empty, so staging now would post an invalid record.
        // The slot is staged once a field of the new form is changed.
        pick: (picked) => { state.pdKind = {slot: slot.id, kind: picked}; render(); }}));
    // What a step's choices mean is its info mark, read once, not each
    // field's tip (D-L96).
    step(2, scrolling ? "How it scrolls" : "What each direction sends", scrolling ? {} : {parts: [
        choicesPart(model, "emptyDirection", P.fieldLabels.emptyDirection), choicesPart(model, "directionOutput", P.fieldLabels.directionOutput)]})
        .append(movement(model, slot, scrolling, controls, stage));
    step(3, "What starts it", startAbout(model, slot)).append(startStep(model, slot, controls, stage));
    // The same four columns step 2 lays its fields in.
    const runs = el(`<div class="pd-cols"></div>`);
    const pointerLayer = controls.choice(P.pointerLayerLabel, P.pointerLayer, slot.pointerLayer, "pointerLayer");
    pointerLayer.classList.add("span2");
    runs.append(controls.choice(words(model).fieldLabels.dpi, dpiOptions(model.pdModeEditing?.dpiChoices, slot.dpi), slot.dpi ?? 0, "dpi",
        {tip: `${tipFor(model, "dpi")} Normal pointer speed keeps the DPI set in ${sectionPath(model, "normalPointerSpeed")}.`}),
    lightRow(model, slot), pointerLayer);
    step(4, "While it runs", {parts: [choicesPart(model, "pointerLayer", P.pointerLayerLabel)]}).append(runs);
    wrap.append(card, advancedControls(model, slot, scrolling, controls));

    wrap.addEventListener("change", (event) => {
        const target = /** @type {Element} */ (event.target);
        if (!target.matches("input, select") || target.matches("[data-name]")) return;
        stage();
    });
    /** @type {HTMLButtonElement} */ (card.querySelector('[data-act="clear"]')).addEventListener("click", () => {
        state.pdKind = null;
        state.pdTaps = null;
        post(edits.clearPdMode(slot.id, model.profileIdentity));
    });
    /** @type {HTMLButtonElement | null} */ (card.querySelector('[data-act="duplicate"]'))?.addEventListener("click", () => {
        const target = slots.find((candidate) => !candidate.kind);
        if (!target) return;
        state.pointingSlot = target.id;
        post(edits.duplicatePdMode(target.id, slot.id, model.profileIdentity));
    });
    return wrap;
}
