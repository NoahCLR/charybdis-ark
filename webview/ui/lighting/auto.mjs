// @ts-check
import {el, esc} from "../../lib/dom.mjs";
import {post, render, state} from "../../store.mjs";
import {editGate} from "../../view/edit-gate.mjs";
import {offWording} from "../../view/lighting.mjs";
import {vocabulary} from "../../view/vocabulary.mjs";
import {draftDot, draftMarks} from "../../view/review.mjs";
import * as edits from "../../view/edits.mjs";
import {shareHold} from "../../view/share.mjs";
import {sectionPath, sectionsIn} from "../../view/settings-layout.mjs";
import {colourControl, section, stack, stageSurface} from "./common.mjs";
import {sectionInfo} from "./help.mjs";

// How long the auto-mouse colour holds before it fades, as a share of the
// timeout. The keyboard stores milliseconds and keeps them with its global
// policy, so this is a settings section, saved whole; a share cannot outlast
// the timeout, and a new timeout on Pointer settings carries it along.
/** @param {import("../../../contracts/panel.js").PublishedModel} model */
function fadeTiming(model) {
    const section = sectionsIn(model, "Lighting").find((entry) => entry.stage === "auto");
    const gate = editGate(model, "settings");
    const node = el(`<section><div class="sect-h"><h4>Timing${section && draftMarks(model?.draft?.changes).settings.has(section.id) ? draftDot(model?.draft) : ""}</h4>${sectionInfo("auto:timing")}</div></section>`);
    if (!section) {
        node.append(el(`<p class="note">${esc(gate.why || "Choose Read keyboard to read the auto-mouse timing.")}</p>`));
        return node;
    }
    const field = section.fields[0];
    const editable = gate.editable && !field.readOnly;
    const whole = Number(field.whole);
    // The slider's track is the timeout: solid while the colour holds, fading
    // after. Dragging previews here and commits once on release, since every
    // commit redraws this control and is a step in the draft's history.
    const control = el(`<label class="field share-field"><span>${esc(field.label)}<b class="mono" data-readout></b></span>
        <input type="range" class="share-range" min="0" max="${esc(field.max)}" step="1" value="${esc(field.value)}" data-f="lighting:auto:${esc(field.macro)}" data-macro="${esc(field.macro)}"
            aria-valuetext="" ${editable ? "" : "disabled"}></label>`);
    const range = /** @type {HTMLInputElement} */ (control.querySelector("input"));
    const note = el(`<p class="note"></p>`);
    const preview = () => {
        const percent = Number(range.value), hold = shareHold(/** @type {import("../../../contracts/panel.js").PresentedField & {whole: string, ms: string}} */ (field), percent);
        range.style.setProperty("--share", `${percent}%`);
        range.setAttribute("aria-valuetext", `${percent}%, ${hold} ms`);
        /** @type {HTMLElement} */ (control.querySelector("[data-readout]")).textContent = `${percent}%`;
        note.textContent = `Of the ${whole} ms timeout, the colour holds for ${hold} ms, then fades over the last ${whole - hold} ms.`;
    };
    preview();
    range.addEventListener("input", preview);
    const open = el(`<button class="btn tiny link self-start">Open ${esc(sectionPath(model, "autoMouse"))}</button>`);
    open.addEventListener("click", () => { state.screen = "pointer"; state.reveal = '.settings-group[data-section="autoMouse"]'; render(); });
    range.addEventListener("change", () => post(edits.settingsSection(section, () => range.value, model.settingsEditing?.identity)));
    const box = el(`<div class="stack gap-12"></div>`);
    box.append(control, note);
    box.append(open);
    if (!editable && !gate.quiet) box.append(el(`<div class="unavailable">${esc(gate.why || "The fade timing cannot be edited right now.")}</div>`));
    node.append(box);
    return node;
}

/** @param {import("../../../contracts/panel.js").PublishedModel} model */
export function stageAuto(model) {
    const canEdit = editGate(model, "lighting").editable;

    /** @type {Partial<import("../../../contracts/panel.js").RgbView["automouseFade"]>} */
    const fade = model.rgb.automouseFade || {};
    // With auto-mouse off the fade never runs (its stage bar says so). Its
    // controls stay editable, for when it is back on.
    const policy = section("Fade", sectionInfo("auto:fade"));
    const select = el(`<label class="field"><span>${esc(vocabulary(model).lightingFields.fadeMode)}</span><select data-f="lighting:auto:fade-mode" class="input" ${canEdit ? "" : "disabled"}>
        ${vocabulary(model).fadeModes.map(([id, text]) => `<option value="${esc(id)}" ${fade.mode === id ? "selected" : ""}>${esc(text)}</option>`).join("")}</select></label>`);
    /** @type {HTMLSelectElement} */ (select.querySelector("select")).addEventListener("change", (event) =>
        { if (fade.end_color) post(edits.automouseFade(/** @type {HTMLSelectElement} */ (event.target).value, fade.end_color)); });
    policy.append(stack(select));
    // A mode that lands on what the layers beneath show takes no end colour:
    // the colour is kept, drawn dimmed under why.
    const endColour = section(vocabulary(model).lightingFields.endColour);
    const unused = fade.mode === "FOLLOW_REAL_DESTINATION";
    endColour.append(colourControl(model, {colour: fade.end_color, canEdit, title: "Fade destination", ...offWording(model, "auto"),
        ...(unused ? {unused: "Unused in this mode: it lands on what the board would show without the pointer layer."} : {}),
        onChange: (next) => { if (fade.mode !== undefined) post(edits.automouseFade(fade.mode, next)); }}));
    return stageSurface(model, {id: "auto", first: policy, colour: endColour, side: fadeTiming(model), note: "One fade, for the pointer layer."});
}
