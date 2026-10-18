// @ts-check
/**
 * @typedef {import("../../../contracts/panel.js").PublishedModel | null} Model
 * @typedef {import("../../state.js").PanelState["combo"]["form"]} ComboForm
 */
// The combo builder beside the Combos table. An existing combo edits live,
// like a behaviour: every change posts the combo whole. A new one is built
// here, its inputs picked on the board, and added with Add combo once it has
// what it sends and two keys.

import {el, esc} from "../../lib/dom.mjs";
import {actionLabel, canonicalKeycode, visibleKeycode} from "../../view/keyface.mjs";
import {customKeyOf, customKeySendsNote, hasShortcut} from "../../view/custom-key.mjs";
import {comboInputShown, toggleComboInput} from "../../view/combo-reach.mjs";
import {comboDecidedAfter, comboMissing, comboWaitTip, moved} from "../../view/combo-form.mjs";
import {closeComboBuilder, comboFormOf, getModel, heldLayers, layerName, layers, post, render, state} from "../../store.mjs";
import {definitionControls} from "../participation.mjs";
import * as edits from "../../view/edits.mjs";
import {timingInput} from "../../view/timing-input.mjs";
import {openPicker} from "../picker.mjs";
import {keyNameMarked, comboIdentityMarked, keycodeMark} from "../marks.mjs";
import {vocabulary} from "../../view/vocabulary.mjs";

/** @param {string} text */
const sentence = (text) => text.charAt(0).toUpperCase() + text.slice(1);
// A builder input by the name the host gave its key, as the combo table and
// the review read it (core/model/key-names.js).
/** @param {Model} model @param {string} name */
export const comboInputLabel = (model, name) => actionLabel(model, name);

// The combo the builder has open, if it is one the keyboard already has.
const openCombo = () => state.combo.editId === null ? undefined
    : (getModel()?.combos || []).find((combo) => combo.id === state.combo.editId);

// What the builder shows: an existing combo's own fields from the model, or
// the new combo's form as built so far.
function shownCombo() {
    const original = openCombo();
    if (!original) return {original, form: state.combo.form, inputs: state.combo.inputs};
    const fresh = comboFormOf(original);
    return {original, form: fresh.form, inputs: fresh.inputs};
}

// The keys the open builder's combo takes, for the board to ring.
export const builderInputs = () => shownCombo().inputs;

// An existing combo posts whole with one change; a new one keeps the change
// until Add combo.
/** @param {Partial<ComboForm>} patch @param {string[]} [inputs] */
function commit(patch, inputs) {
    const {original, form, inputs: current} = shownCombo();
    if (!original) {
        Object.assign(state.combo.form, patch);
        if (inputs) state.combo.inputs = inputs;
        return;
    }
    post(edits.comboMessage(original.id, {...form, ...patch, inputs: inputs || current.slice(),
        holdTermMs: edits.comboHoldTermValue(getModel(), undefined)}));
}

// A key clicked on the board while picking: added, or taken out again. An
// existing combo keeps at least two keys.
/** @param {Parameters<typeof toggleComboInput>[1]} answer */
export function pickComboInput(answer) {
    const {original, inputs} = shownCombo();
    const next = toggleComboInput(inputs, answer);
    if (original && next.length < 2) return;
    commit({}, next);
}

/** @param {boolean} canEdit @param {() => string} holdTerm */
export function comboBuilder(canEdit, holdTerm) {
    const model = getModel();
    /** @param {string} name */
    const shown = (name) => comboInputShown(model, layers(), state.layer, heldLayers(), name);
    const {original, form, inputs} = shownCombo();
    const live = Boolean(original);
    const id = `combo:${state.combo.editId ?? "new"}`;
    // The keyboard's default window; empty on a keyboard that has none, where
    // every combo keeps its own.
    const fallback = edits.comboDefaultTermValue(model);
    const windowField = timingInput(form.termMs, fallback, form.followsDefault && fallback !== "");
    const wait = comboDecidedAfter(form.followsDefault ? fallback : form.termMs, holdTerm());
    const missing = live ? "" : comboMissing(form, inputs);
    const output = canonicalKeycode(model, form.output);
    const outputLabel = form.output ? actionLabel(model, form.output) : "";
    const node = el(`<div class="card combo-builder">
        <div class="card-h"><h3>${live && original ? `${comboIdentityMarked(model, original)} <span class="tag dim">${esc(original.badge || "")}</span>` : "New combo"}</h3>
            <span class="right">${live ? `<button class="btn text destructive" data-act="delete" ${canEdit ? "" : "disabled"}>Delete</button>` : ""}</span></div>
        <div class="card-b">
            <div class="field"><span>Sends</span>
                <button class="value-btn" data-act="pickout" ${canEdit ? "" : "disabled"}>${form.output
                    ? `${keyNameMarked(model, outputLabel, form.output)}${keycodeMark("comboSends", visibleKeycode(model, form.output), outputLabel)}`
                    : `<span class="dim">Choose a key…</span>`}</button>
                ${state.showKeycodes ? `<input class="input mono" data-f="${esc(id)}:output" data-output value="${esc(visibleKeycode(model, form.output))}" placeholder="KC_…" ${canEdit ? "" : "disabled"}>` : ""}
                ${customKeySendsNote(model, output) ? `<span class="note">${esc(customKeySendsNote(model, output))}</span>` : ""}</div>
            <div class="field"><span>Keys</span>
                <div class="row combo-inputs" role="list">
                    ${inputs.length ? inputs.map((input, at) => `<span class="chip" role="listitem" draggable="${canEdit}" tabindex="0" data-input-at="${at}"
                        data-tip="${esc([shown(input) ? "" : "No key on the board presses this from here, so nothing rings for it.", "Drag, or Alt+← →, to change the order Keys in order checks."].filter(Boolean).join(" "))}">
                        <span class="mono">${keyNameMarked(model, comboInputLabel(model, input), input)}</span>
                        <button data-remove="${esc(input)}" aria-label="Remove this key" ${canEdit && (!live || inputs.length > 2) ? "" : "disabled"}
                            ${live && inputs.length <= 2 ? `data-tip="A combo needs at least two keys."` : ""}>✕</button></span>`).join("")
                        : `<span class="note">No keys yet</span>`}
                </div>
                <div class="row combo-pick">
                    <button class="btn compact toggle" aria-pressed="${state.combo.picking}" data-act="pickboard" ${canEdit ? "" : "disabled"}
                        data-tip="Click keys on the board to add or remove them; Done or Esc ends it.">${state.combo.picking ? "Picking on the board…" : "Pick on board"}</button>
                </div>
            </div>
            <label class="field" data-tip="How close together its keys must be pressed, from the first to the last."><span>Combo window</span>
                <div class="input-row"><span class="affix unit"><input class="input mono" data-f="${esc(id)}:term" data-term inputmode="numeric" value="${esc(windowField.value)}" placeholder="${esc(windowField.placeholder)}" ${canEdit ? "" : "disabled"}><i>ms</i></span>
                ${fallback ? `<button class="btn text" data-act="usedefault" ${canEdit ? "" : "disabled"} ${form.followsDefault ? "hidden" : ""}
                    data-tip="Follow the default combo window (Settings · Combos) again, so this combo changes with it.">Use default · ${esc(fallback)} ms</button>` : ""}</div></label>
            <label class="sw" data-tip="${esc(`On, the combo's output runs its key's behaviour, as a key press would. Off, it sends its plain output. ${bypassedOutput(model, form.output)} The behaviour master and Settings · Combos · Combo outputs use behaviours must also be on.`)}">
                <input type="checkbox" data-output-behavior data-f="${esc(id)}:use-output-behavior" ${form.useOutputBehavior !== false ? "checked" : ""} ${canEdit ? "" : "disabled"}>
                <span class="track"></span><span class="txt">${esc(sentence(vocabulary(model).comboOptions.useOutputBehavior))}</span></label>
            <div class="row combo-flags">
                ${/** @type {const} */ (["mustHold", "mustTap", "ordered"]).map((flag) => {
                    const tip = flag === "ordered" ? "Fires only if its keys are pressed in the order listed above." : comboWaitTip(flag, wait);
                    return `<label class="sw" data-tip="${esc(tip)}"><input type="checkbox" data-f="${esc(id)}:${flag}" data-${flag.toLowerCase()} ${form[flag] ? "checked" : ""} ${canEdit ? "" : "disabled"}><span class="track"></span><span class="txt">${esc(sentence(vocabulary(model).comboOptions[flag]))}</span></label>`;
                }).join("")}
            </div>
            ${live ? "" : `<div class="row combo-actions">
                <button class="btn primary" data-act="keep" ${canEdit && !state.combo.awaiting && !missing ? "" : "disabled"}>Add combo</button>
                <button class="btn ghost" data-act="cancel">Cancel</button>
                ${missing ? `<span class="note" data-missing>${esc(missing)}</span>` : ""}
            </div>`}
        </div></div>`);

    /** @type {HTMLElement} */ (node.querySelector(".card-b")).insertBefore(definitionControls(layers().map(layer => ({...layer, label: layerName(layer)})), form, canEdit,
        (/** @type {{enabled: boolean, allowedLayers: number}} */ permissions) => commit(permissions), `${id}:definition`, "combo"), /** @type {HTMLElement} */ (node.querySelector(".card-b")).firstChild);
    /** @type {NodeListOf<HTMLElement>} */ (node.querySelectorAll("[data-remove]")).forEach((button) => button.addEventListener("click", () => {
        commit({}, inputs.filter((input) => input !== button.dataset.remove));
        render();
    }));
    // Chips move by drag, or by Alt+arrow from the keyboard.
    /** @param {number} from @param {number} to */
    const reorder = (from, to) => {
        const next = moved(inputs, from, to);
        if (next.join() === inputs.join()) return;
        commit({}, next);
        render();
    };
    /** @type {NodeListOf<HTMLElement>} */ (node.querySelectorAll("[data-input-at]")).forEach((chip) => {
        const at = Number(chip.dataset.inputAt);
        chip.addEventListener("dragstart", (event) => { event.dataTransfer?.setData("text/x-combo-input", String(at)); chip.classList.add("dragging"); });
        chip.addEventListener("dragend", () => chip.classList.remove("dragging"));
        chip.addEventListener("dragover", (event) => { if (event.dataTransfer?.types.includes("text/x-combo-input")) event.preventDefault(); });
        chip.addEventListener("drop", (event) => {
            event.preventDefault();
            reorder(Number(event.dataTransfer?.getData("text/x-combo-input")), at);
        });
        chip.addEventListener("keydown", (event) => {
            if (!canEdit || !event.altKey || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
            event.preventDefault();
            reorder(at, at + (event.key === "ArrowLeft" ? -1 : 1));
        });
    });
    /** @type {HTMLButtonElement | null} */ (node.querySelector('[data-act="pickboard"]'))?.addEventListener("click", () => {
        state.combo.picking = !state.combo.picking;
        render();
    });
    /** @type {HTMLButtonElement | null} */ (node.querySelector('[data-act="pickout"]'))?.addEventListener("click", () => openPicker({
        title: "Combo output", context: live ? original?.badge : "new combo",
        seed: form.output ? [form.output] : [],
        onPick: (expression) => { commit({output: expression}); render(); },
        // Modifiers no keycode can hold: an unused custom key is made that
        // shortcut now and becomes the output, saved with the combo (D-L63).
        onCustomKey: (keycode, shortcut, name) => {
            post(edits.customKeyForShortcut(keycode, shortcut, name, undefined, getModel()?.customKeyEditing?.identity));
            commit({output: keycode});
        },
    }));
    // A new combo keeps typing in state as it happens, so a board click that
    // redraws the screen keeps it; an existing one posts on change.
    const outputField = /** @type {HTMLInputElement | null} */ (node.querySelector("[data-output]"));
    outputField?.addEventListener(live ? "change" : "input", () => commit({output: outputField.value}));
    // Typing a window gives the combo its own; emptying the field, or Use
    // default, has it follow the keyboard's default again.
    const term = /** @type {HTMLInputElement} */ (node.querySelector("[data-term]"));
    /** @param {boolean} follows */
    const followed = (follows) => {
        const button = /** @type {HTMLButtonElement | null} */ (node.querySelector('[data-act="usedefault"]'));
        if (button) button.hidden = follows;
    };
    if (!live) term.addEventListener("input", () => {
        state.combo.form.termMs = term.value;
        state.combo.form.followsDefault = Boolean(fallback) && term.value.trim() === "";
        followed(state.combo.form.followsDefault);
    });
    term.addEventListener("change", () => {
        const follows = Boolean(fallback) && term.value.trim() === "";
        if (live) commit({termMs: follows ? fallback : term.value, followsDefault: follows});
        else term.value = timingInput(state.combo.form.termMs, fallback, state.combo.form.followsDefault && fallback !== "").value;
    });
    /** @type {HTMLButtonElement | null} */ (node.querySelector('[data-act="usedefault"]'))?.addEventListener("click", (event) => {
        event.preventDefault();
        term.value = "";
        followed(true);
        commit({termMs: fallback, followsDefault: true});
    });
    /** @type {HTMLInputElement} */ (node.querySelector("[data-output-behavior]")).addEventListener("change", (event) =>
        commit({useOutputBehavior: /** @type {HTMLInputElement} */ (event.target).checked}));
    // A combo cannot both need a hold and refuse one — the keyboard rejects it,
    // and QMK would never fire it — so turning one on turns the other off.
    /** @type {Partial<Record<"mustHold" | "mustTap" | "ordered", "mustHold" | "mustTap">>} */
    const opposite = {mustHold: "mustTap", mustTap: "mustHold"};
    for (const field of /** @type {("mustHold" | "mustTap" | "ordered")[]} */ (["mustHold", "mustTap", "ordered"])) {
        /** @type {HTMLInputElement} */ (node.querySelector(`[data-${field.toLowerCase()}]`)).addEventListener("change", (event) => {
            const on = /** @type {HTMLInputElement} */ (event.target).checked;
            const other = opposite[field];
            /** @type {Partial<ComboForm>} */
            const patch = {[field]: on};
            if (other && on && form[other]) {
                patch[other] = false;
                /** @type {HTMLInputElement} */ (node.querySelector(`[data-${other.toLowerCase()}]`)).checked = false;
            }
            commit(patch);
        });
    }
    /** @type {HTMLButtonElement | null} */ (node.querySelector('[data-act="cancel"]'))?.addEventListener("click", () => { closeComboBuilder(); render(); });
    // Add and Delete close the builder once the host accepts them, so a
    // second press cannot add the combo twice, and a refused combo keeps its
    // fields for fixing.
    /** @type {HTMLButtonElement | null} */ (node.querySelector('[data-act="delete"]'))?.addEventListener("click", () => {
        state.combo.awaiting = true;
        post(edits.deleteCombo(/** @type {number} */ (state.combo.editId)));
    });
    /** @type {HTMLButtonElement | null} */ (node.querySelector('[data-act="keep"]'))?.addEventListener("click", addCombo);
    return node;
}

// Add the new combo being built, if it has what it needs (the builder and the
// board's pick bar both offer it).
export function addCombo() {
    if (state.combo.editId !== null || comboMissing(state.combo.form, state.combo.inputs) || state.combo.awaiting) return;
    state.combo.awaiting = true;
    state.combo.picking = false;
    post(edits.comboMessage(null, {...state.combo.form, inputs: state.combo.inputs.slice(),
        holdTermMs: edits.comboHoldTermValue(getModel(), undefined)}));
    render();
}

// What a bypassed output sends, when it is a custom key: its shortcut, or
// nothing without one (firmware D-F26).
/** @param {Model} model @param {string} output */
function bypassedOutput(model, output) {
    const key = customKeyOf(model, canonicalKeycode(model, output));
    if (!key) return "A custom key sends its shortcut, or nothing if it has none.";
    return hasShortcut(key) ? `This custom key sends its shortcut, ${key.shortcutLabel}.` : "This custom key has no shortcut, so it sends nothing.";
}

// Esc ends picking keys on the board, before anything else it would close.
if (typeof addEventListener === "function") addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !state.combo.picking || state.picker || state.overlay) return;
    state.combo.picking = false;
    event.stopImmediatePropagation();
    render();
}, true);
