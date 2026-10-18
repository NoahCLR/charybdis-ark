// @ts-check
import {el, esc} from "../../lib/dom.mjs";
import {css, isOff, label as hsvLabel} from "../../lib/colour.mjs";
import {canEdit as canEditArea, post, render, state, writable} from "../../store.mjs";
import {stageIdle} from "../../view/lighting.mjs";
import {vocabulary} from "../../view/vocabulary.mjs";
import {draftDot, draftMarks} from "../../view/review.mjs";
import * as edits from "../../view/edits.mjs";
import {shareHold} from "../../view/share.mjs";
import {sectionsIn} from "../settings.mjs";
import {unavailable} from "../shell.mjs";
import {colourControl, section, stack} from "./common.mjs";

// How long the auto-mouse colour holds before it fades, as a share of the
// timeout. The keyboard stores milliseconds and keeps them with its global
// policy, so this is a settings section, saved whole; a share cannot outlast
// the timeout, and a new timeout on Trackball carries it along.
/** @param {import("../../../contracts/panel.js").PublishedModel} model @param {string | null} idle */
function fadeTiming(model, idle) {
    const section = sectionsIn(model, "Lighting").find((entry) => entry.stage === "auto");
    const node = el(`<section><div class="sect-h"><h4>Timing${section && draftMarks(model?.draft?.changes).settings.has(section.id) ? draftDot() : ""}</h4></div></section>`);
    if (!section) {
        node.append(el(`<p class="note">${esc(unavailable(model) || "Choose Read keyboard to load the mouse layer timing.")}</p>`));
        return node;
    }
    const field = section.fields[0];
    const editable = canEditArea("settings") && !field.readOnly && !idle;
    const whole = Number(field.whole);
    // The slider's track is the timeout: solid while the colour holds, fading
    // after. Dragging previews here and commits once on release, since every
    // commit redraws this control and is a step in the draft's history.
    const control = el(`<label class="field share-field"><span>${esc(field.label)}<b class="mono" data-readout></b></span>
        <input type="range" class="share-range" min="0" max="${esc(field.max)}" step="1" value="${esc(field.value)}" data-f="lighting:auto:${esc(field.macro)}" data-macro="${esc(field.macro)}"
            aria-valuetext="" ${editable ? "" : "disabled"} data-tip="${esc(field.hint)}"></label>`);
    const range = /** @type {HTMLInputElement} */ (control.querySelector("input"));
    const note = el(`<p class="note"></p>`);
    const preview = () => {
        const percent = Number(range.value), hold = shareHold(/** @type {import("../../../contracts/panel.js").PresentedField & {whole: string, ms: string}} */ (field), percent);
        range.style.setProperty("--share", `${percent}%`);
        range.setAttribute("aria-valuetext", `${percent}%, ${hold} ms`);
        /** @type {HTMLElement} */ (control.querySelector("[data-readout]")).textContent = `${percent}%`;
        note.textContent = `Of the ${whole} ms timeout, the colour holds for ${hold} ms, then fades over the last ${whole - hold} ms. The timeout is set on Trackball; changing it keeps this share.`;
    };
    preview();
    range.addEventListener("input", preview);
    const open = el(`<button class="btn tiny self-start">Open Trackball → Mouse layer</button>`);
    open.addEventListener("click", () => { state.screen = "mouse"; state.reveal = '.settings-group[data-section="autoMouse"]'; render(); });
    range.addEventListener("change", () => post(edits.settingsSection(section, () => range.value, model.settingsEditing?.identity)));
    const box = el(`<div class="stack gap-12"></div>`);
    box.append(control, note);
    if (!idle) box.append(open);
    if (!editable && !idle) box.append(el(`<div class="unavailable">${esc(unavailable(model) || "The fade timing cannot be edited right now.")}</div>`));
    node.append(box);
    return node;
}

/** @param {import("../../../contracts/panel.js").PublishedModel} model */
export function stageAuto(model) {
    const node = el(`<div></div>`);
    const canEdit = writable();

    /** @type {Partial<import("../../../contracts/panel.js").RgbView["automouseFade"]>} */
    const fade = model.rgb.automouseFade || {};
    node.className = "tab-grid three";
    // With auto-mouse off the fade never runs, so its controls are shown
    // disabled rather than pretending to matter. Nothing is cleared: the
    // stage switch and these values come back with auto-mouse.
    const idle = stageIdle(model, "auto");
    const editFade = canEdit && !idle;
    if (idle) {
        node.classList.add("idle");
        const notice = el(`<div class="unavailable span"><span>${esc(idle)} A mouse layer turned on by hand shows its own layer lighting. The fade settings below are kept for when Mouse layer is back on.</span>
            <button class="btn tiny self-start">Open Trackball → Mouse layer</button></div>`);
        /** @type {HTMLButtonElement} */ (notice.querySelector("button")).addEventListener("click", () => { state.screen = "mouse"; state.reveal = '.settings-group[data-section="autoMouse"]'; render(); });
        node.append(notice);
    }
    const policy = section("Fade");
    const select = el(`<label class="field"><span>Fade mode</span><select data-f="lighting:auto:fade-mode" class="input" ${editFade ? "" : "disabled"}>
        ${vocabulary(model).fadeModes.map(([id, text]) => `<option value="${id}" ${fade.mode === id ? "selected" : ""}>${text}</option>`).join("")}</select></label>`);
    /** @type {HTMLSelectElement} */ (select.querySelector("select")).addEventListener("change", (event) =>
        { if (fade.end_color) post(edits.automouseFade(/** @type {HTMLSelectElement} */ (event.target).value, fade.end_color)); });
    policy.append(stack(select, el(`<p class="note">Where the fade lands once the mouse layer drops out. It starts from the mouse layer's own colour and replaces the layer colours while it runs; the board shows the layers, not the fade.</p>`)));
    const endColour = section("End colour");
    const unused = fade.mode === "FOLLOW_REAL_DESTINATION";
    endColour.append(unused
        ? el(`<div class="row colour-head unused"><span class="swatch-lg ${isOff(fade.end_color) ? "swatch-off" : ""}" style="${isOff(fade.end_color) ? "" : `background:${css(fade.end_color)}`}"></span>
            <div><div class="colour-title">Unused in this mode</div><div class="note mono">${esc(hsvLabel(fade.end_color))}</div></div></div>`)
        : colourControl(model, {colour: fade.end_color, canEdit: editFade, title: "Fade destination", black: "The fade ends dark: the keys go black as the mouse layer drops out.",
            onChange: (next) => { if (fade.mode !== undefined) post(edits.automouseFade(fade.mode, next)); }}));
    if (unused) endColour.append(el(`<p class="note">Follow-the-real-destination lands on whatever the board would show once the mouse layer drops out, so the end colour is not read. It stays disabled rather than pretending to matter.</p>`));
    node.append(policy, endColour, fadeTiming(model, idle));
    return node;
}
