// @ts-check
/** @typedef {import('../../../contracts/panel.js').MacroSlot} Slot */
/** @typedef {import('../../view/types.js').MacroStep} Step */
/** @typedef {import('../../state.js').MacroHistoryEntry} Entry */
import {getModel, macroForm, render, setMacroForm, state} from '../../store.mjs';
import {editGate} from '../../view/edit-gate.mjs';
import {createMacroHistory, moveMacroHistory, rememberMacroHistory} from '../../view/macro-history.mjs';
import {readMacro} from '../../view/macro-cache.mjs';
import {withStepFocus} from '../../view/macro-focus.mjs';
import {macroStepsInput} from '../../view/macro.mjs';
import {sequenceIssues} from '../../view/macro-sequence.mjs';
import {keyIdentity} from '../../view/key-identity.mjs';
import {inspectEdit} from './validation.mjs';

// An empty macro slot's name and protection: what Clear macro leaves.
/** @type {Readonly<import('../../state.js').MacroSlotFields>} */
export const EMPTY_MACRO_FIELDS = Object.freeze({name: '', protection: 'auto'});
/** @param {Slot} slot @param {string} payload @param {Step[] | undefined} steps @returns {Entry} */
function entry(slot, payload, steps) {
    const form = macroForm(slot.keycode);
    if (!steps) {
        const parsed = readMacro(getModel(), slot.keycode, payload, 'editor');
        if (!parsed.error) steps = withStepFocus(parsed.steps, form.stepFocus, () => crypto.randomUUID());
    }
    return {payload, steps, selectedStep: form.selectedStep ?? null, selectedSteps: selectedStepIds(slot)};
}
/** @param {Slot} slot @param {Step[]} [steps] */
export function ensureMacroHistory(slot, steps) {
    const form = macroForm(slot.keycode);
    if (!form.stepHistory) setMacroForm(slot.keycode, {stepHistory: createMacroHistory(entry(slot, form.draft ?? slot.payload, form.steps ?? steps))});
    return /** @type {import('../../state.js').MacroHistory} */ (macroForm(slot.keycode).stepHistory);
}
// `emptied` marks Clear macro's entry with the name and protection it took
// away, so undoing it puts them back with the steps.
/** @param {Slot} slot @param {string} payload @param {Step[]} [steps] @param {string | null} [group] @param {import('../../state.js').MacroSlotFields} [emptied] */
export function rememberMacroEdit(slot, payload, steps, group = null, emptied) {
    if (state.recording) return;
    const form = macroForm(slot.keycode), history = ensureMacroHistory(slot);
    // Selection is navigation rather than a new history item, but follows the edit.
    const before = {...history, present: {...history.present, selectedStep: form.selectedStep ?? null, selectedSteps: selectedStepIds(slot)}};
    const next = {...entry(slot, payload, steps), ...(emptied ? {emptied} : {})};
    setMacroForm(slot.keycode, {stepHistory: rememberMacroHistory(before, next, group), stepFocus: next.steps ?? form.stepFocus});
}
/** @param {Slot} slot */
export function finishMacroHistoryGroup(slot) {
    const history = macroForm(slot.keycode).stepHistory;
    if (history?.group) setMacroForm(slot.keycode, {stepHistory: {...history, group: null}});
}
/** @param {Slot} slot @returns {string[]} */
export function selectedStepIds(slot) {
    const form = macroForm(slot.keycode);
    return form.selectedSteps ?? (form.selectedStep ? [form.selectedStep] : []);
}
/** @param {Slot} slot @param {Entry} snapshot @param {import('../../state.js').MacroSlotFields} [fields] */
function restore(slot, snapshot, fields) {
    const model = getModel(), steps = snapshot.steps;
    const encoded = steps ? macroStepsInput(steps) : null;
    const parsed = readMacro(model, slot.keycode, snapshot.payload, 'editor');
    const stepError = encoded?.error || (steps ? parsed.error || sequenceIssues(steps, model, key => keyIdentity(model, key).label).find(Boolean) : '') || '';
    setMacroForm(slot.keycode, {draft: snapshot.payload, steps, stepFocus: steps ?? macroForm(slot.keycode).stepFocus,
        selectedStep: snapshot.selectedStep, selectionAnchor: snapshot.selectedStep, selectedSteps: snapshot.selectedSteps, stepError,
        validation: undefined, wantsStage: false, cancelBlur: false, moveNotice: '', stageFields: fields});
    inspectEdit(slot, true); render();
    const id = snapshot.selectedStep;
    const tile = id ? document.querySelector(`[data-step-id="${CSS.escape(id)}"]`) : null;
    /** @type {HTMLElement | null} */ (tile ?? document.querySelector(`[data-macro-editor="${slot.keycode}"] [data-insert-kind]`))?.focus();
}
/** @param {Slot} slot @param {'undo' | 'redo' | 'copy' | 'paste'} action */
function macroCommand(slot, action) {
    if (state.recording || state.picker || state.overlay || state.retarget) return;
    const form = macroForm(slot.keycode);
    const steps = form.steps ?? form.stepFocus ?? [];
    if (action === 'copy') {
        const selected = new Set(selectedStepIds(slot));
        const copied = steps.filter(step => selected.has(step.focusId || '')).map(({focusId, ...value}) => structuredClone(value));
        if (copied.length) state.macroClipboard = copied;
        return;
    }
    if (!editGate(getModel(), "macros").editable || slot.available === false) return;
    if (action === 'paste') {
        if (!state.macroClipboard?.length || !form.steps && readMacro(getModel(), slot.keycode, form.draft ?? slot.payload, 'editor').error) return;
        const pasted = state.macroClipboard.map(step => ({...structuredClone(step), focusId: crypto.randomUUID()}));
        const selected = new Set(selectedStepIds(slot));
        const base = steps.length === 1 && steps[0].kind === 'text' && steps[0].text === '' ? [] : steps;
        const at = base.reduce((last, step, index) => selected.has(step.focusId || '') ? index : last, -1);
        const next = [...base.slice(0, at < 0 ? base.length : at + 1), ...pasted, ...base.slice(at < 0 ? base.length : at + 1)];
        const {payload} = macroStepsInput(next);
        rememberMacroEdit(slot, payload, next);
        restore(slot, {payload, steps: next, selectedStep: pasted[0].focusId, selectedSteps: pasted.map(step => step.focusId)});
        return;
    }
    const history = ensureMacroHistory(slot);
    if (!(action === 'undo' ? history.past.length : history.future.length)) return;
    const current = {...history, present: {...history.present, selectedStep: form.selectedStep ?? null, selectedSteps: selectedStepIds(slot)}};
    const moved = moveMacroHistory(current, action);
    setMacroForm(slot.keycode, {stepHistory: moved});
    // Undoing Clear macro puts the name and protection back; redoing it
    // empties them again.
    restore(slot, moved.present, action === 'undo' ? current.present.emptied : moved.present.emptied && EMPTY_MACRO_FIELDS);
}
/** @param {KeyboardEvent} event @param {'undo' | 'redo'} action @returns {boolean} */
export function macroHistoryShortcut(event, action) {
    const target = event.target;
    if (!(target instanceof Element) || state.picker || state.overlay || state.recording || state.retarget) return false;
    const keycode = target.closest('[data-macro-editor]')?.getAttribute('data-macro-editor');
    const slot = getModel()?.macros?.find(item => item.keycode === keycode);
    if (!slot) return false;
    event.preventDefault();
    if (!event.repeat && !event.isComposing) macroCommand(slot, action);
    return true;
}
/** @param {KeyboardEvent} event @returns {boolean} */
export function macroClipboardShortcut(event) {
    const target = event.target, key = event.key.toLowerCase();
    if (!(target instanceof Element) || event.defaultPrevented || event.isComposing || state.recording || state.picker || state.overlay || state.retarget
        || !(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey || !['c', 'v', 'a'].includes(key)
        || target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return false;
    const keycode = target.closest('[data-macro-editor]')?.getAttribute('data-macro-editor');
    const slot = getModel()?.macros?.find(item => item.keycode === keycode);
    if (!slot) return false;
    event.preventDefault();
    if (event.repeat) return true;
    if (key === 'a') {
        const steps = macroForm(slot.keycode).steps ?? macroForm(slot.keycode).stepFocus ?? [];
        setMacroForm(slot.keycode, {selectedStep: steps[0]?.focusId ?? null, selectionAnchor: steps[0]?.focusId ?? null, selectedSteps: steps.map(step => step.focusId || '')});
        render();
        /** @type {HTMLElement | null} */ (document.querySelector(`[data-macro-editor="${slot.keycode}"] [data-step-id]`))?.focus();
    } else macroCommand(slot, key === 'c' ? 'copy' : 'paste');
    return true;
}
