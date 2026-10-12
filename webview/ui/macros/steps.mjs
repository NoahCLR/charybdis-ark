// @ts-check
/** @typedef {import("../../../contracts/panel.js").PublishedModel | null} Model */
/** @typedef {import("../../../contracts/panel.js").MacroSlot} MacroSlot */
/** @typedef {import("../../view/types.js").MacroStep} MacroStep */
import {el, esc} from "../../lib/dom.mjs";
import {describeStep, macroStepsInput} from "../../view/macro.mjs";
import {withStepFocus} from "../../view/macro-focus.mjs";
import {actionLabel} from "../../view/keyface.mjs";
import {macroForm, render, setMacroForm} from "../../store.mjs";
import {openPicker} from "../picker.mjs";
import {inspectEdit} from "./validation.mjs";
/** @type {[MacroStep["kind"], string][]} */
export const STEP_KINDS = [
    ["text", "Text"], ["tap", "Tap key or chord"], ["delay", "Delay"],
    ["press", "Press and hold"], ["release", "Release"],
];

/** @param {MacroSlot} slot @param {MacroStep[]} steps */
export function saveSteps(slot, steps, stage = false) {
    steps = focusSteps(slot, steps);
    const {payload, error} = macroStepsInput(steps);
    setMacroForm(slot.keycode, {steps, draft: payload, stepError: error, cancelBlur: false});
    const raw = /** @type {HTMLTextAreaElement | null} */ (document.querySelector(`[data-raw-payload="${slot.keycode}"]`));
    if (raw && document.activeElement !== raw) raw.value = payload;
    inspectEdit(slot, stage);
}

/** @param {MacroSlot} slot @param {MacroStep[]} steps */
export function focusSteps(slot, steps) {
    const identified = withStepFocus(steps, macroForm(slot.keycode).stepFocus, () => crypto.randomUUID());
    setMacroForm(slot.keycode, {stepFocus: identified});
    return identified;
}

/** @param {import("../../../contracts/panel.js").PublishedModel} model @param {MacroSlot} slot @param {MacroStep[]} steps @param {MacroStep} step @param {number} index @param {boolean} canEdit */
export function stepEditor(model, slot, steps, step, index, canEdit) {
    const label = STEP_KINDS.find(([kind]) => kind === step.kind)?.[1] || step.kind;
    const node = el(`<div class="macro-step" data-step="${index}">
        <div class="row macro-step-head"><span class="kind">${esc(label)}</span><span class="right row">
            <button class="btn tiny ghost" data-move="-1" ${canEdit && index > 0 ? "" : "disabled"} aria-label="Move step up">↑</button>
            <button class="btn tiny ghost" data-move="1" ${canEdit && index < steps.length - 1 ? "" : "disabled"} aria-label="Move step down">↓</button>
            <button class="btn tiny ghost" data-remove ${canEdit ? "" : "disabled"}>Remove</button></span></div>
        ${step.kind === "text" ? `<label class="field"><textarea data-f="macro:${esc(slot.keycode)}:step:${esc(step.focusId)}:text" aria-label="Text for step ${index + 1}" class="input" rows="3" data-step-text="${index}" placeholder="Type or paste text" ${canEdit ? "" : "disabled"}>${esc(step.text)}</textarea></label>`
            : step.kind === "delay" ? `<label class="field"><span>Milliseconds</span><input data-f="macro:${esc(slot.keycode)}:step:${esc(step.focusId)}:delay" class="input mono" data-step-delay="${index}" type="number" min="0" max="65535" value="${esc(step.delay)}" ${canEdit ? "" : "disabled"}></label>`
            : `<div class="row"><span class="tok">${esc(describeStep(step, key => actionLabel(model, key))) || "Choose keys"}</span><button class="btn" data-pick-step ${canEdit ? "" : "disabled"}>Pick…</button></div>`}
    </div>`);
    const input = /** @type {HTMLTextAreaElement | HTMLInputElement | null} */ (node.querySelector("textarea, input"));
    input?.addEventListener("input", () => {
        const next = macroForm(slot.keycode).steps ?? steps;
        saveSteps(slot, next.map((item, at) => at === index ? {...item, ...(step.kind === "text" ? {text: input.value} : {delay: input.value})} : item));
    });
    input?.addEventListener("change", () => inspectEdit(slot, true));
    /** @type {HTMLElement | null} */ (node.querySelector("[data-pick-step]"))?.addEventListener("click", () => openPicker({
        title: label, contextKeycode: slot.keycode, mode: "list", seed: "keys" in step ? step.keys : [], allowedKeys: model.macroPayloadKeycodes, maxKeys: step.kind === "tap" ? 16 : 1,
        onPick: expression => {
            const next = macroForm(slot.keycode).steps ?? steps;
            saveSteps(slot, next.map((item, at) => at === index ? {...item, keys: expression.split(",").map(key => key.trim()).filter(Boolean)} : item), true); render();
        },
    }));
    /** @type {HTMLElement} */ (node.querySelector("[data-remove]")).addEventListener("click", () => {
        const next = (macroForm(slot.keycode).steps ?? steps).filter((_, at) => at !== index);
        saveSteps(slot, next.length ? next : [{kind: "text", text: ""}], true); render();
    });
    /** @type {NodeListOf<HTMLElement>} */ (node.querySelectorAll("[data-move]")).forEach(button => button.addEventListener("click", () => {
        const next = (macroForm(slot.keycode).steps ?? steps).slice(), target = index + Number(button.dataset.move);
        [next[index], next[target]] = [next[target], next[index]];
        saveSteps(slot, next, true); render();
    }));
    return node;
}
