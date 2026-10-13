// @ts-check
/** @typedef {import("../../../contracts/panel.js").PublishedModel | null} Model */
/** @typedef {import("../../../contracts/panel.js").MacroSlot} MacroSlot */
/** @typedef {import("../../view/types.js").MacroStep} MacroStep */
import {el, esc} from "../../lib/dom.mjs";
import {unreleased} from "../../view/macro.mjs";
import {readMacro} from "../../view/macro-cache.mjs";
import {actionLabel} from "../../view/keyface.mjs";
import {canEdit as canEditArea, getModel, macroForm, post, setMacroForm, state} from "../../store.mjs";
import * as edits from "../../view/edits.mjs";
// Input remains local until the host has inspected this exact payload under
// the current draft. A late reply can never stage a newer or discarded edit.
let nextInspection = 0;
/** @type {Map<string, {context: string, payload: string, requestId: number}>} */
const pendingInspections = new Map();
/** @param {Model} model @param {MacroSlot} slot */
const inspectionContext = (model, slot) => JSON.stringify([model?.draft?.id, model?.draft?.revision,
    model?.macroUnicode, slot?.bytes, model?.macroBank?.free, canEditArea("macros")]);
/** @param {import("../../state.js").MacroForm} form @param {Model} model @param {MacroSlot} slot */
export const matchingValidation = (form, model, slot) => form.validation != null && form.validation.payload === form.draft &&
    form.validation.context === inspectionContext(model, slot);

/** @param {string} keycode */
function currentSlot(keycode) { return getModel()?.viaMacros?.find(slot => slot.keycode === keycode); }

/** @param {MacroSlot} slot */
export function requestInspection(slot) {
    const form = macroForm(slot.keycode), model = getModel();
    if (form.draft === undefined || form.stepError || !canEditArea("macros")) return;
    const context = inspectionContext(model, slot);
    const pending = pendingInspections.get(slot.keycode);
    if (pending?.context === context && pending.payload === form.draft && pending.requestId === form.requestId) return;
    const requestId = ++nextInspection;
    pendingInspections.set(slot.keycode, {context, payload: form.draft, requestId});
    setMacroForm(slot.keycode, {requestId});
    post(edits.macroValidationMessage(slot.keycode, form.draft, requestId));
}

/** @param {MacroSlot} slot @param {boolean} stage */
export function inspectEdit(slot, stage) {
    slot = currentSlot(slot.keycode) || slot;
    if (stage && macroForm(slot.keycode).cancelBlur) {
        setMacroForm(slot.keycode, {cancelBlur: false});
        return;
    }
    const model = getModel(), form = macroForm(slot.keycode);
    setMacroForm(slot.keycode, {wantsStage: stage});
    if (matchingValidation(form, model, slot)) keepValidated(slot);
    else requestInspection(slot);
    refreshFeedback(slot.keycode);
}

/** @param {MacroSlot} slot */
function keepValidated(slot) {
    const model = getModel(), form = macroForm(slot.keycode);
    if (!canEditArea("macros") || slot.available === false || !form.wantsStage || form.stepError || state.recording || !matchingValidation(form, model, slot) || form.validation?.validation.error) return;
    setMacroForm(slot.keycode, {wantsStage: false});
    if (form.draft !== slot.payload) post(edits.macroMessage(slot.keycode, form.draft ?? slot.payload, model?.macroEditing?.identity));
}

/** @param {Extract<import("../../../contracts/messages.js").PanelResponse, {type: "macroValidation"}>} message */
export function receiveMacroValidation(message) {
    const form = macroForm(message.keycode), model = getModel();
    if (form.requestId !== message.requestId || form.draft !== message.payload || message.draftId !== model?.draft?.id || message.draftRevision !== model?.draft?.revision) return;
    const pending = pendingInspections.get(message.keycode), slot = currentSlot(message.keycode);
    pendingInspections.delete(message.keycode);
    if (!slot || pending?.context !== inspectionContext(model, slot)) {
        if (slot) requestInspection(slot);
        return;
    }
    setMacroForm(message.keycode, {validation: {...message, context: pending.context}});
    if (slot) keepValidated(slot);
    refreshFeedback(message.keycode);
}

/** @param {string} keycode */
function refreshFeedback(keycode) {
    const card = /** @type {HTMLElement | null} */ (document.querySelector(`[data-macro-editor="${keycode}"]`)), slot = currentSlot(keycode);
    if (card && slot) paintFeedback(card, getModel(), slot);
}

/** @param {HTMLElement} card @param {Model} model @param {MacroSlot} slot */
export function paintFeedback(card, model, slot) {
    const form = macroForm(slot.keycode), local = form.draft !== undefined;
    const payload = form.draft ?? slot.payload;
    const parsed = readMacro(model, slot.keycode, payload, "feedback");
    const held = unreleased(parsed.steps, model?.qmkKeycodeAliases);
    /** @type {import("../../../contracts/messages.js").MacroValidation | null | undefined} */
    const inspection = matchingValidation(form, model, slot) ? form.validation?.validation : null;
    const error = form.stepError || parsed.error || (held.length ? `Release ${held.map(key => actionLabel(model, key)).join(", ")} before the macro ends.` : "") || inspection?.error || (!local && slot.playbackError);
    const measured = inspection && "bytes" in inspection ? /** @type {import("../../../contracts/model.js").MacroInspection} */ (inspection) : null;
    const program = local ? measured?.program : slot.program;
    const max = model?.macroBank?.programMax === null ? null : model?.macroBank?.programMax ?? 512;
    const note = error ? (local ? "Fix this edit before it can be kept in your draft." : "Change Host settings or fix the macro before playing it.") : local && !inspection ? "Checking this edit…" : "";
    const feedback = /** @type {HTMLElement} */ (card.querySelector("[data-macro-feedback]"));
    feedback.hidden = !error && !note && max === null;
    feedback.replaceChildren(el(`<div class="stack">
        ${error ? `<div class="unavailable">${esc(error)} ${local ? "This edit is not staged." : "This stored macro cannot play with the current Host settings."}</div>` : ""}
        ${max === null ? "" : `<div class="meter ${program != null && program > max ? "over" : ""}"><i style="width:${Math.min(100, (program ?? 0) / max * 100)}%"></i></div>`}
        ${max === null ? "" : `<p class="note" data-macro-size>${program == null ? "Playback size unavailable" : `${esc(program)} of ${esc(max)} playback bytes`}</p>`}
        ${note ? `<p class="note">${esc(note)}</p>` : ""}
    </div>`));
    const dirty = local && payload !== slot.payload;
    /** @type {HTMLElement} */ (card.querySelector("[data-local-state]")).replaceChildren(el(`<i class="dot ${dirty ? "draft" : "on"}"></i>`), document.createTextNode(dirty ? "edited here" : "as read"));
    /** @type {HTMLButtonElement} */ (card.querySelector('[data-act="discard"]')).disabled = form.draft === undefined || form.draft === slot.payload;
}

/** @param {Model} model @param {MacroSlot} slot @param {string} payload */
export function stageMacro(model, slot, payload) {
    setMacroForm(slot.keycode, {draft: payload, steps: undefined, stepError: ""});
    inspectEdit(slot, true);
}
