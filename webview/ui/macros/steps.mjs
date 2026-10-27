// @ts-check
/** @typedef {import("../../../contracts/panel.js").PublishedModel | null} Model */
/** @typedef {import("../../../contracts/panel.js").MacroSlot} MacroSlot */
/** @typedef {import("../../view/types.js").MacroStep} MacroStep */
import {el, esc} from "../../lib/dom.mjs";
import {describeStep, macroStepsInput, stepKindName} from "../../view/macro.mjs";
import {withStepFocus} from "../../view/macro-focus.mjs";
import {actionLabel} from "../../view/keyface.mjs";
import {appendSequenceStep, moveSequenceStep, sequenceFace, sequenceInsertionAt, sequenceIssues} from "../../view/macro-sequence.mjs";
import {getModel, macroForm, render, setMacroForm, state} from "../../store.mjs";
import {openPicker} from "../picker.mjs";
import {stepMark, stepWord} from "../marks.mjs";
import {inspectEdit} from "./validation.mjs";
import {finishMacroHistoryGroup, rememberMacroEdit, selectedStepIds} from "./history.mjs";

// Like the board's deletion shortcut, consume Backspace before the shell turns
// it into navigation. Keep normal editing keys inside form fields and dialogs.
/** @param {KeyboardEvent} event @returns {boolean} */
export function macroStepShortcut(event) {
    if (event.defaultPrevented || event.isComposing || !["Delete", "Backspace"].includes(event.key)
        || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || state.picker || state.overlay || state.recording) return false;
    const target = event.target;
    if (!(target instanceof Element) || target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return false;
    const sequence = target.closest('[data-macro-sequence][data-editable="true"]');
    const keycode = sequence?.closest("[data-macro-editor]")?.getAttribute("data-macro-editor");
    const slot = getModel()?.macros?.find(item => item.keycode === keycode);
    if (!slot) return false;
    const form = macroForm(slot.keycode), steps = form.steps ?? form.stepFocus ?? [];
    const id = target.closest("[data-step-id]")?.getAttribute("data-step-id") ?? form.selectedStep;
    if (!id || !steps.some(step => step.focusId === id)) return false;
    event.preventDefault();
    if (!event.repeat) removeStep(slot, steps, id);
    return true;
}

/** @param {MacroSlot} slot @param {MacroStep[]} steps @param {boolean} [stage] @param {string | null} [group] */
export function saveSteps(slot, steps, stage = false, group = null) {
    steps = focusSteps(slot, steps);
    const {payload, error} = macroStepsInput(steps);
    rememberMacroEdit(slot, payload, steps, group);
    const model = getModel();
    const issues = sequenceIssues(steps, model?.qmkKeycodeAliases, key => actionLabel(model, key));
    setMacroForm(slot.keycode, {steps, draft: payload, stepError: error || issues.find(Boolean) || "", cancelBlur: false});
    const raw = /** @type {HTMLTextAreaElement | null} */ (document.querySelector(`[data-raw-payload="${slot.keycode}"]`));
    if (raw && document.activeElement !== raw) raw.value = payload;
    inspectEdit(slot, stage);
    const sequence = document.querySelector(`[data-macro-editor="${slot.keycode}"] [data-sequence-tiles]`);
    if (sequence && model) paintTiles(/** @type {HTMLElement} */ (sequence), model, slot, steps);
    if (stage) finishMacroHistoryGroup(slot);
}

/** @param {MacroSlot} slot @param {MacroStep[]} steps */
export function focusSteps(slot, steps) {
    const identified = withStepFocus(steps, macroForm(slot.keycode).stepFocus, () => crypto.randomUUID());
    setMacroForm(slot.keycode, {stepFocus: identified});
    return identified;
}

/** @param {import('../../../contracts/panel.js').PublishedModel} model @param {MacroSlot} slot @param {MacroStep[]} steps @param {MacroStep['kind']} kind */
export function insertStep(model, slot, steps, kind) {
    /** @param {MacroStep} step */
    const insert = step => {
        saveSteps(slot, appendSequenceStep(macroForm(slot.keycode).steps ?? steps, step), true);
        const id = macroForm(slot.keycode).steps?.at(-1)?.focusId;
        setMacroForm(slot.keycode, {selectedStep: id, selectionAnchor: id, selectedSteps: id ? [id] : [], moveNotice: ""}); render();
        const inspector = document.querySelector(`[data-inspector-id="${CSS.escape(id || "")}"]`);
        /** @type {HTMLInputElement | HTMLTextAreaElement | null} */ (inspector?.querySelector("input, textarea"))?.focus();
    };
    if (kind === "text") insert({kind, text: ""});
    else if (kind === "delay") insert({kind, delay: 120});
    else openPicker({title: stepKindName(kind), contextKeycode: slot.keycode,
        mode: "list", seed: [], allowedKeys: model.macroPayloadKeycodes, maxKeys: kind === "tap" ? 16 : 1,
        onPick: expression => insert({kind, keys: expression.split(",").map(key => key.trim()).filter(Boolean)}),
    });
}

/** @param {import('../../../contracts/panel.js').PublishedModel} model @param {MacroSlot} slot @param {MacroStep[]} steps @param {boolean} canEdit */
export function sequenceEditor(model, slot, steps, canEdit) {
    const form = macroForm(slot.keycode);
    if (form.selectedStep === undefined || (form.selectedStep && !steps.some(step => step.focusId === form.selectedStep))) {
        const selected = steps[0]?.kind === "text" ? steps[0].focusId : null;
        setMacroForm(slot.keycode, {selectedStep: selected, selectionAnchor: selected, selectedSteps: selected ? [selected] : []});
    }
    const node = el(`<div class="macro-sequence-editor" data-macro-sequence>
        <div class="macro-sequence ${steps.length ? "" : "empty"}" data-sequence-tiles tabindex="0" data-act="macro-sequence:${esc(slot.keycode)}" aria-label="Macro step sequence"></div>
        ${steps.length ? `<div class="macro-legend note"><span>↓ press</span><span>↑ release</span><span>• tap</span><span>+ chord</span><span>ms wait</span><span class="right">${canEdit ? "Click to edit · drag to reorder · Delete to remove" : "Click a step to inspect"}</span></div>` : ""}
        <p class="note" data-sequence-notice role="status" aria-live="polite">${esc(form.moveNotice || "")}</p>
        <div data-step-inspectors></div>
    </div>`);
    node.dataset.editable = String(canEdit);
    const canvas = /** @type {HTMLElement} */ (node.querySelector('[data-sequence-tiles]'));
    canvas.addEventListener('click', event => {if (!(event.target instanceof Element) || !event.target.closest('button')) canvas.focus();});
    const inspectors = /** @type {HTMLElement} */ (node.querySelector("[data-step-inspectors]"));
    steps.forEach((step, index) => {
        const inspector = stepEditor(model, slot, steps, step, index, canEdit);
        inspector.hidden = macroForm(slot.keycode).selectedStep !== step.focusId;
        inspector.dataset.inspectorId = step.focusId;
        inspectors.append(inspector);
    });
    paintTiles(/** @type {HTMLElement} */ (node.querySelector("[data-sequence-tiles]")), model, slot, steps);
    return node;
}

/** @param {HTMLElement} node @param {import('../../../contracts/panel.js').PublishedModel} model @param {MacroSlot} slot @param {MacroStep[]} steps */
function paintTiles(node, model, slot, steps) {
    const editable = node.closest("[data-macro-sequence]")?.getAttribute("data-editable") === "true";
    const issues = sequenceIssues(steps, model.qmkKeycodeAliases, key => actionLabel(model, key));
    /** @type {string | null} */
    let dragged = null;
    const clearDrop = () => node.querySelectorAll(".drop-before, .drop-after").forEach(item => item.classList.remove("drop-before", "drop-after"));
    const finishDrag = () => {dragged = null; clearDrop(); node.querySelectorAll(".dragging").forEach(item => item.classList.remove("dragging"));};
    /** @param {DragEvent} event */
    const insertion = event => sequenceInsertionAt([...node.querySelectorAll("[data-step-id]")].map(tile => tile.getBoundingClientRect()), event.clientX, event.clientY);
    node.ondragover = event => {
        if (!editable || !dragged) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
        clearDrop();
        const before = insertion(event), wraps = node.querySelectorAll(".macro-token-wrap");
        wraps[Math.min(before, steps.length - 1)]?.classList.add(before === steps.length ? "drop-after" : "drop-before");
    };
    node.ondragleave = event => {if (!(event.relatedTarget instanceof Node) || !node.contains(event.relatedTarget)) clearDrop();};
    node.ondrop = event => {
        if (!editable || !dragged || event.dataTransfer?.getData("application/x-ark-macro-step") !== dragged) return;
        event.preventDefault();
        const id = dragged, before = insertion(event);
        finishDrag();
        moveStep(slot, macroForm(slot.keycode).steps ?? steps, id, before);
    };
    if (!steps.length) {
        node.replaceChildren(el(`<div class="macro-empty"><span class="macro-empty-mark" aria-hidden="true">+</span>
            <strong>Your macro starts here</strong><p class="note">${editable ? "Add text, a shortcut or a delay above, or record your keys below." : "This macro has no steps."}</p></div>`));
        return;
    }
    node.replaceChildren(...steps.map((step, index) => {
        const face = sequenceFace(model, step), selected = selectedStepIds(slot).includes(step.focusId || "");
        const title = `${index + 1}. ${stepKindName(step.kind)}: ${face.full || "Choose a value"}${issues[index] ? ` · ${issues[index]}` : ""}`;
        const content = "keys" in step && step.keys.length
            ? step.keys.map((key, at) => `<span class="macro-chord-part">${at ? "+ " : ""}${esc(sequenceFace(model, {kind: "tap", keys: [key]}).label)}</span>`).join(" ")
            : esc(face.label || (step.kind === "text" ? "Text…" : "Choose…"));
        const wrap = el(`<div class="macro-token-wrap"><button type="button" class="macro-token ${esc(step.kind)} ${face.wide ? "wide" : ""} ${issues[index] ? "invalid" : ""}"
            data-step-tile="${esc(index)}" data-step-id="${esc(step.focusId)}" data-act="macro-step:${esc(slot.keycode)}:${esc(step.focusId)}"
            draggable="${editable}" aria-pressed="${esc(selected)}" aria-label="${esc(title)}" ${issues[index] ? 'aria-invalid="true"' : ""} data-tip="${esc(title)}">
            <span class="macro-token-index" aria-hidden="true">${esc(index + 1)}</span><span class="macro-token-mark" aria-hidden="true">${stepMark(step.kind)}</span>
            <span class="macro-token-label">${content}${step.kind === "delay" ? '<span class="macro-token-unit"> ms</span>' : ""}</span>
            <span class="macro-token-kind">${esc(stepWord(step.kind, face.kind === "chord"))}</span>
            ${issues[index] ? '<span class="macro-token-error" aria-hidden="true">!</span>' : ""}</button>
            ${index < steps.length - 1 ? '<span class="macro-connector" aria-hidden="true">→</span>' : ""}</div>`);
        const tile = /** @type {HTMLButtonElement} */ (wrap.querySelector("button"));
        tile.addEventListener("click", event => {
            const id = step.focusId || "", form = macroForm(slot.keycode);
            let selection = [id];
            if (event.shiftKey && form.selectedStep) {
                const anchor = steps.findIndex(item => item.focusId === (form.selectionAnchor ?? form.selectedStep));
                selection = steps.slice(Math.min(anchor < 0 ? index : anchor, index), Math.max(anchor, index) + 1).map(item => item.focusId || "");
            } else if (event.metaKey || event.ctrlKey) {
                const previous = selectedStepIds(slot);
                selection = previous.includes(id) ? previous.filter(value => value !== id) : [...previous, id];
            }
            setMacroForm(slot.keycode, {selectedStep: selection.includes(id) ? id : selection.at(-1) ?? null, selectedSteps: selection, selectionAnchor: event.shiftKey ? form.selectionAnchor ?? form.selectedStep : id});
            const root = tile.closest("[data-macro-sequence]");
            root?.querySelectorAll("[data-inspector-id]").forEach(item => {/** @type {HTMLElement} */ (item).hidden = /** @type {HTMLElement} */ (item).dataset.inspectorId !== macroForm(slot.keycode).selectedStep;});
            root?.querySelectorAll("[data-step-id]").forEach(item => item.setAttribute("aria-pressed", String(selection.includes(/** @type {HTMLElement} */ (item).dataset.stepId || ""))));
        });
        tile.addEventListener("dragstart", event => {
            if (!editable || !step.focusId || !event.dataTransfer) {event.preventDefault(); return;}
            dragged = step.focusId;
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("application/x-ark-macro-step", dragged);
            tile.classList.add("dragging");
        });
        tile.addEventListener("dragend", finishDrag);
        return wrap;
    }));
}

/** @param {MacroSlot} slot @param {MacroStep[]} steps @param {string} id @param {number} before */
function moveStep(slot, steps, id, before) {
    const next = moveSequenceStep(steps, id, before), at = next.findIndex(step => step.focusId === id);
    if (at < 0 || next.every((step, index) => step === steps[index])) return;
    saveSteps(slot, next, true);
    setMacroForm(slot.keycode, {selectedStep: id, selectionAnchor: id, selectedSteps: [id], moveNotice: `Moved to step ${at + 1} of ${next.length}.`}); render();
    /** @type {HTMLElement | null} */ (document.querySelector(`[data-step-id="${CSS.escape(id)}"]`))?.focus();
}

/** @param {MacroSlot} slot @param {MacroStep[]} steps @param {string} id */
function removeStep(slot, steps, id) {
    const at = steps.findIndex(step => step.focusId === id);
    if (at < 0) return;
    const selection = selectedStepIds(slot), removed = new Set(selection.includes(id) ? selection : [id]);
    const next = steps.filter(step => !removed.has(step.focusId || ""));
    const before = steps.slice(0, at).filter(step => !removed.has(step.focusId || "")).length;
    const selected = next[Math.min(before, next.length - 1)]?.focusId;
    saveSteps(slot, next, true);
    setMacroForm(slot.keycode, {selectedStep: selected ?? null, selectionAnchor: selected ?? null, selectedSteps: selected ? [selected] : [], moveNotice: ""}); render();
    const selector = selected ? `[data-step-id="${CSS.escape(selected)}"]` : `[data-macro-editor="${CSS.escape(slot.keycode)}"] [data-insert-kind]`;
    /** @type {HTMLElement | null} */ (document.querySelector(selector))?.focus();
}

/** @param {import("../../../contracts/panel.js").PublishedModel} model @param {MacroSlot} slot @param {MacroStep[]} steps @param {MacroStep} step @param {number} index @param {boolean} canEdit */
export function stepEditor(model, slot, steps, step, index, canEdit) {
    const label = stepKindName(step.kind);
    const node = el(`<div class="macro-step" data-step="${esc(index)}">
        <div class="row macro-step-head"><span class="kind">Step ${esc(index + 1)} · ${esc(label)}</span><span class="right row">
            <button class="btn tiny ghost" data-move="-1" ${canEdit && index > 0 ? "" : "disabled"} aria-label="Move step earlier">← Earlier</button>
            <button class="btn tiny ghost" data-move="1" ${canEdit && index < steps.length - 1 ? "" : "disabled"} aria-label="Move step later">Later →</button>
            <button class="btn tiny ghost" data-remove ${canEdit ? "" : "disabled"}>Remove</button>
            <button class="btn tiny ghost" data-close-step aria-label="Close step editor">×</button></span></div>
        ${step.kind === "text" ? `<label class="field"><textarea data-f="macro:${esc(slot.keycode)}:step:${esc(step.focusId)}:text" aria-label="Text for step ${index + 1}" class="input" rows="3" data-step-text="${esc(index)}" placeholder="Type or paste text" ${canEdit ? "" : "disabled"}>${esc(step.text)}</textarea></label>`
            : step.kind === "delay" ? `<label class="field"><span>Milliseconds</span><input data-f="macro:${esc(slot.keycode)}:step:${esc(step.focusId)}:delay" class="input mono" data-step-delay="${esc(index)}" type="number" min="0" max="65535" value="${esc(step.delay)}" ${canEdit ? "" : "disabled"}></label>`
            : `<div class="row"><span class="tok">${esc(describeStep(step, key => actionLabel(model, key))) || "Choose keys"}</span><button class="btn" data-pick-step ${canEdit ? "" : "disabled"}>Pick…</button></div>`}
    </div>`);
    const input = /** @type {HTMLTextAreaElement | HTMLInputElement | null} */ (node.querySelector("textarea, input"));
    input?.addEventListener("input", () => {
        const next = macroForm(slot.keycode).steps ?? steps;
        saveSteps(slot, next.map((item, at) => at === index ? {...item, ...(step.kind === "text" ? {text: input.value} : {delay: input.value})} : item), false, input.dataset.f || null);
    });
    input?.addEventListener("change", () => {finishMacroHistoryGroup(slot); inspectEdit(slot, true);});
    /** @type {HTMLButtonElement} */ (node.querySelector("[data-close-step]")).addEventListener("click", () => {
        setMacroForm(slot.keycode, {selectedStep: null, selectionAnchor: null, selectedSteps: []}); render();
        /** @type {HTMLElement | null} */ (document.querySelector(`[data-step-id="${CSS.escape(step.focusId || "")}"]`))?.focus();
    });
    /** @type {HTMLElement | null} */ (node.querySelector("[data-pick-step]"))?.addEventListener("click", () => openPicker({
        title: label, contextKeycode: slot.keycode, mode: "list", seed: "keys" in step ? step.keys : [], allowedKeys: model.macroPayloadKeycodes, maxKeys: step.kind === "tap" ? 16 : 1,
        onPick: expression => {
            const next = macroForm(slot.keycode).steps ?? steps;
            saveSteps(slot, next.map((item, at) => at === index ? {...item, keys: expression.split(",").map(key => key.trim()).filter(Boolean)} : item), true); render();
        },
    }));
    /** @type {HTMLElement} */ (node.querySelector("[data-remove]")).addEventListener("click", () => {
        if (step.focusId) removeStep(slot, macroForm(slot.keycode).steps ?? steps, step.focusId);
    });
    /** @type {NodeListOf<HTMLElement>} */ (node.querySelectorAll("[data-move]")).forEach(button => button.addEventListener("click", () => {
        const next = macroForm(slot.keycode).steps ?? steps, direction = Number(button.dataset.move);
        if (step.focusId) moveStep(slot, next, step.focusId, index + (direction > 0 ? 2 : -1));
    }));
    return node;
}
