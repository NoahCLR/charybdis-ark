// @ts-check
/**
 * @typedef {import("../../../contracts/panel.js").PublishedModel | null} Model
 */
// The combo builder beside the Combos table: what a new or open combo sends,
// its inputs picked on the board, its window and conditions. The form keeps
// its own state until the combo is kept in the draft.

import {el, esc} from "../../lib/dom.mjs";
import {scrollContentTo} from "../../lib/scroll.mjs";
import {actionLabel, comboInputShown, visibleKeycode} from "../../view/keyface.mjs";
import {closeComboBuilder, getModel, heldLayers, layerName, layers, post, render, state} from "../../store.mjs";
import {definitionControls} from "../participation.mjs";
import * as edits from "../../view/edits.mjs";
import {timingInput} from "../../view/timing-input.mjs";
import {openPicker} from "../picker.mjs";
import {keyNameMarked} from "../marks.mjs";
import {vocabulary} from "../../view/vocabulary.mjs";

/** @param {string} text */
const sentence = (text) => text.charAt(0).toUpperCase() + text.slice(1);
// A builder input by the name the host gave its key, as the combo table and
// the review read it (core/model/key-names.js).
/** @param {Model} model @param {string} name */
export const comboInputLabel = (model, name) => actionLabel(model, name);

/** @param {boolean} canEdit @param {() => string} holdTerm */
export function comboBuilder(canEdit, holdTerm) {
    const model = getModel();
    /** @param {string} name */
    const shown = (name) => comboInputShown(model, layers(), state.layer, heldLayers(), name);
    const editing = state.combo.editId !== null;
    const original = (model?.combos || []).find((combo) => combo.id === state.combo.editId);
    const form = state.combo.form;
    // The keyboard's default window; empty on a keyboard that has none, where
    // every combo keeps its own.
    const fallback = edits.comboDefaultTermValue(model);
    const windowField = timingInput(form.termMs, fallback, form.followsDefault && fallback !== "");
    const node = el(`<div class="card combo-builder">
        <div class="card-h"><h3>${editing ? `Edit ${esc(original?.badge || "combo")}` : "New combo"}</h3>
            <span class="right">${editing ? `<button class="btn tiny ghost" data-act="delete" ${canEdit ? "" : "disabled"}>Delete</button>` : ""}</span></div>
        <div class="card-b">
            <div class="field"><span>Sends</span>
                <div class="input-row"><input class="input mono" data-f="combo:${esc(state.combo.editId ?? 'new')}:output" data-output value="${esc(visibleKeycode(model, form.output))}" ${canEdit ? "" : "disabled"}>
                <button class="btn" data-act="pickout" ${canEdit ? "" : "disabled"}>Pick…</button></div></div>
            <div class="field"><span>Inputs</span>
                <div class="row combo-inputs">
                    ${state.combo.inputs.length ? state.combo.inputs.map((input) => `<span class="chip"${shown(input) ? ""
                        : ` data-tip="No key on the board presses this from here, so nothing rings for it. It stays an input unless you remove it."`}>
                        <span class="mono">${keyNameMarked(model, comboInputLabel(model, input), input)}</span>
                        <button data-remove="${esc(input)}">✕</button></span>`).join("")
                        : `<span class="note">no inputs yet</span>`}
                </div>
                <div class="row combo-pick">
                    <button class="btn tiny ${state.combo.picking ? "primary" : ""}" data-act="pickboard" ${canEdit ? "" : "disabled"}
                        data-tip="Switch the board into input-picking mode; click keys to add or remove them.">${state.combo.picking ? "Picking on board…" : "Pick on board"}</button>
                </div>
            </div>
            <label class="field" data-tip="How close together its keys must be pressed, from the first to the last."><span>Combo window · ms</span>
                <div class="input-row"><input class="input mono" data-f="combo:${esc(state.combo.editId ?? 'new')}:term" data-term value="${esc(windowField.value)}" placeholder="${esc(windowField.placeholder)}" ${canEdit ? "" : "disabled"}>
                ${fallback ? `<button class="btn tiny ghost" data-act="usedefault" ${canEdit ? "" : "disabled"} ${form.followsDefault ? "hidden" : ""}
                    data-tip="Follow the default combo window (Settings · Combos) again, so this combo changes with it.">Use default · ${esc(fallback)} ms</button>` : ""}</div></label>
            <div class="row combo-flags">
                ${[["mustHold", "Fires only once its keys are held past the combo hold threshold (Settings · Combos). Released sooner, the keys type themselves."],
                   ["mustTap", "Fires only if its keys are released before the combo hold threshold. Held longer, the keys type themselves."],
                   ["ordered", "Fires only if its keys are pressed in the order listed above."]].map(([flag, tip]) =>
                    `<label class="sw" data-tip="${esc(tip)}"><input type="checkbox" data-f="combo:${esc(state.combo.editId ?? 'new')}:${esc(flag)}" data-${flag.toLowerCase()} ${form[/** @type {"mustHold" | "mustTap" | "ordered"} */ (flag)] ? "checked" : ""} ${canEdit ? "" : "disabled"}><span class="track"></span><span class="txt">${esc(sentence(vocabulary(model).comboOptions[flag]))}</span></label>`).join("")}
            </div>
            <div class="row combo-actions">
                <button class="btn primary" data-act="keep" ${canEdit && !state.combo.awaiting ? "" : "disabled"}>Keep combo in draft</button>
                <button class="btn ghost" data-act="cancel">Cancel</button>
            </div>
            <p class="note">A combo needs its output and at least two inputs, so this form keeps its own state until you keep it.</p>
        </div></div>`);

    /** @type {HTMLElement} */ (node.querySelector(".card-b")).insertBefore(definitionControls(layers().map(layer => ({...layer, label: layerName(layer)})), form, canEdit,
        (/** @type {{enabled: boolean, allowedLayers: number}} */ permissions) => Object.assign(form, permissions), `combo:${state.combo.editId ?? "new"}:definition`), /** @type {HTMLElement} */ (node.querySelector(".card-b")).firstChild);
    /** @type {NodeListOf<HTMLElement>} */ (node.querySelectorAll("[data-remove]")).forEach((button) => button.addEventListener("click", () => {
        state.combo.inputs = state.combo.inputs.filter((input) => input !== button.dataset.remove);
        render();
    }));
    /** @type {HTMLButtonElement | null} */ (node.querySelector('[data-act="pickboard"]'))?.addEventListener("click", () => {
        const starting = !state.combo.picking;
        state.combo.picking = starting;
        render();
        if (starting) scrollContentTo(document, ".board-card");
    });
    /** @type {HTMLButtonElement | null} */ (node.querySelector('[data-act="pickout"]'))?.addEventListener("click", () => openPicker({
        title: "Combo output", context: editing ? original?.badge : "new combo",
        seed: form.output ? [form.output] : [],
        onPick: (expression) => { form.output = expression; },
    }));
    // Typing and ticking land in state as they happen, so a board click that
    // redraws the screen keeps them.
    /** @type {HTMLInputElement} */ (node.querySelector("[data-output]")).addEventListener("input", (event) => { form.output = /** @type {HTMLInputElement} */ (event.target).value; });
    // Typing a window gives the combo its own; emptying the field, or Use
    // default, has it follow the keyboard's default again. The button changes
    // in place, and matching defaults become placeholders after editing.
    /** @param {boolean} follows */
    const followed = (follows) => {
        form.followsDefault = follows;
        const button = /** @type {HTMLButtonElement} */ (node.querySelector('[data-act="usedefault"]'));
        if (button) button.hidden = follows;
    };
    /** @type {HTMLInputElement} */ (node.querySelector("[data-term]")).addEventListener("input", (event) => {
        form.termMs = /** @type {HTMLInputElement} */ (event.target).value;
        if (fallback) followed(/** @type {HTMLInputElement} */ (event.target).value.trim() === "");
    });
    /** @type {HTMLInputElement} */ (node.querySelector("[data-term]")).addEventListener("change", (event) => {
        /** @type {HTMLInputElement} */ (event.target).value = timingInput(form.termMs, fallback, form.followsDefault && fallback !== "").value;
    });
    /** @type {HTMLButtonElement | null} */ (node.querySelector('[data-act="usedefault"]'))?.addEventListener("click", (event) => {
        event.preventDefault();
        form.termMs = fallback;
        /** @type {HTMLInputElement} */ (node.querySelector("[data-term]")).value = "";
        followed(true);
    });
    // A combo cannot both need a hold and refuse one — the keyboard rejects it,
    // and QMK would never fire it — so turning one on turns the other off.
    /** @type {Partial<Record<"mustHold" | "mustTap" | "ordered", "mustHold" | "mustTap">>} */
    const opposite = {mustHold: "mustTap", mustTap: "mustHold"};
    for (const field of /** @type {("mustHold" | "mustTap" | "ordered")[]} */ (["mustHold", "mustTap", "ordered"])) {
        /** @type {HTMLInputElement} */ (node.querySelector(`[data-${field.toLowerCase()}]`)).addEventListener("change", (event) => {
            form[field] = /** @type {HTMLInputElement} */ (event.target).checked;
            const other = opposite[field];
            if (other && /** @type {HTMLInputElement} */ (event.target).checked && form[other]) {
                form[other] = false;
                /** @type {HTMLInputElement} */ (node.querySelector(`[data-${other.toLowerCase()}]`)).checked = false;
            }
        });
    }
    /** @type {HTMLButtonElement} */ (node.querySelector('[data-act="cancel"]')).addEventListener("click", () => { closeComboBuilder(); render(); });
    // Keep and Delete close the builder once the host accepts them, so a
    // second press cannot add the combo twice, and a refused combo keeps its
    // fields for fixing.
    /** @type {HTMLButtonElement | null} */ (node.querySelector('[data-act="delete"]'))?.addEventListener("click", () => {
        state.combo.awaiting = true;
        post(edits.deleteCombo(/** @type {number} */ (state.combo.editId)));
    });
    /** @type {HTMLButtonElement | null} */ (node.querySelector('[data-act="keep"]'))?.addEventListener("click", () => {
        state.combo.awaiting = true;
        post(edits.comboMessage(editing ? state.combo.editId : null, {
            ...form,
            inputs: state.combo.inputs.slice(),
            holdTermMs: holdTerm(),
        }));
        render();
    });
    return node;
}
