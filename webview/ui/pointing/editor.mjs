// @ts-check
import {el, esc} from "../../lib/dom.mjs";
import {NAME_MAX_BYTES, NAME_TIP} from "../../view/names.mjs";
import {KIND, dpiOptions, readConfig, scrollStarter, settleButtons, settleTaps, startingRecord} from "../../view/pointing-config.mjs";
import {post, render, state} from "../../store.mjs";
import * as edits from "../../view/edits.mjs";
import {slotLight} from "../marks.mjs";
import {bindingName, words} from "./common.mjs";
import {formControls} from "./form-controls.mjs";
import {movement} from "./movement.mjs";
import {slotReach} from "./reach.mjs";
import {advancedControls} from "./advanced.mjs";

/** @param {import("../../../contracts/panel.js").PublishedModel} model @param {import("../surface-types.js").PresentedSlot} slot @param {boolean} canEdit @param {import("../surface-types.js").PresentedSlot[]} slots */
export function editor(model, slot, canEdit, slots) {
    // The kind being edited, which is the stored one until the Movement select
    // changes it. The form has to be rebuilt on that change: each section
    // registers the readers for its own fields, so a directional record cannot
    // be read out of a scrolling form.
    const kind = state.pdKind?.slot === slot.id ? state.pdKind.kind : slot.kind;
    // startingRecord spreads the supplied slot, retaining its presentation fields.
    if (kind !== slot.kind) slot = /** @type {import("../surface-types.js").PresentedSlot} */ (startingRecord(slot, kind, scrollStarter(slots)));
    const scrolling = kind === KIND.SCROLLING;
    const light = slotLight(model, slot);
    const wrap = el(`<div class="pd-editor stack"></div>`);
    let stageCurrent = () => {};
    const {form, disabled, field, select, shortcut, modifiers} = formControls(model, slot, canEdit, () => stageCurrent());
    // ── identity ──────────────────────────────────────────────────────────
    const empties = slots.some((candidate) => !candidate.kind);
    const head = el(`<div class="card">
        <div class="card-h">
            ${light.swatch("lg")}
            <h3>${esc(slot.displayName || `Slot ${slot.id}`)}</h3><span class="tag">slot ${slot.id} · ${esc(bindingName(slot))}</span>
            <span class="right">
                ${empties ? `<button class="btn tiny ghost" data-act="duplicate" ${disabled}
                    data-tip="Copy this mode into the first empty slot.">Duplicate</button>` : ""}
                <button class="btn tiny ghost" data-act="clear" ${disabled}
                    data-tip="Empty this slot. Keys bound to it stay on the board and do nothing until it is configured again.">Clear slot</button>
            </span></div>
        <div class="card-b pd-identity"></div></div>`);
    const headBody = /** @type {HTMLElement} */ (head.querySelector(".card-b"));
    const name = el(`<label class="field"><span>Name</span>
        <input data-f="pointing:${slot.id}:name" class="input" value="${esc(slot.name)}" maxlength="${NAME_MAX_BYTES}" data-tip="${esc(NAME_TIP)}" ${disabled}></label>`);
    form.name = () => /** @type {HTMLInputElement} */ (name.querySelector("input")).value.trim();
    headBody.append(name);
    headBody.append(select("Movement", words(model).kinds.filter(([value]) => value), kind, "kind",
        // Switching movement only redraws the form for the other kind: its
        // fields start empty, so staging now would post an invalid record.
        // The slot is staged once a field of the new form is changed.
        {onChange: (event) => { event.stopPropagation(); state.pdKind = {slot: slot.id, kind: Number(/** @type {HTMLSelectElement} */ (event.target).value)}; render(); }}));
    headBody.append(select("Pointer speed while active", dpiOptions(model.pdModeEditing?.dpiChoices, slot.dpi), slot.dpi ?? 0, "dpi",
        {tip: "Sensor DPI while this mode runs. Normal pointer speed keeps the DPI set in Mouse → Pointer speed."}));
    wrap.append(head);

    const controls = {form, disabled, field, select, shortcut, modifiers};
    wrap.append(movement(model, slot, scrolling, controls), slotReach(model, slot, canEdit), advancedControls(model, slot, scrolling, controls));

    stageCurrent = () => {
        const buttons = settleButtons(slot, readConfig(slot, form));
        const {config, pending} = settleTaps(slot, buttons.config);
        const holding = Object.keys(buttons.pending).length > 0 || Object.keys(pending).length > 0;
        const held = Boolean(state.pdButtons || state.pdTaps);
        state.pdButtons = Object.keys(buttons.pending).length ? {slot: slot.id, rows: buttons.pending} : null;
        state.pdTaps = Object.keys(pending).length ? {slot: slot.id, rows: pending} : null;
        post(edits.pdMode(slot.id, config, model.profileIdentity));
        // A new kind draws its own field, even when nothing new was stored.
        if (holding || held) render();
    };
    wrap.addEventListener("change", (event) => {
        if (!/** @type {Element} */ (event.target).matches("input, select")) return;
        stageCurrent();
    });

    /** @type {HTMLButtonElement} */ (head.querySelector('[data-act="clear"]')).addEventListener("click", () => {
        state.pdKind = null;
        state.pdButtons = null;
        state.pdTaps = null;
        post(edits.clearPdMode(slot.id, model.profileIdentity));
    });
    /** @type {HTMLButtonElement | null} */ (head.querySelector('[data-act="duplicate"]'))?.addEventListener("click", () => {
        const target = slots.find((candidate) => !candidate.kind);
        if (!target) return;
        state.pdSlot = target.id;
        post(edits.duplicatePdMode(target.id, slot.id, model.profileIdentity));
    });
    return wrap;
}
