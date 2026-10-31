// @ts-check
/** @typedef {import("../../../contracts/panel.js").PublishedModel | null} Model */
/** @typedef {import("../../../contracts/panel.js").MacroSlot} MacroSlot */
/** @typedef {import("../../view/types.js").MacroStep} MacroStep */
import {el, esc} from "../../lib/dom.mjs";
import {readMacro} from "../../view/macro-cache.mjs";
import {STEP_KINDS, addStepLabel, macroLocalState, macroShortName, protectionChoiceLabel, samePayload} from "../../view/macro.mjs";
import {titleName, attachTitleName} from "../title-name.mjs";
import {getModel, macroForm, post, render, setMacroForm, state} from "../../store.mjs";
import {editGate} from "../../view/edit-gate.mjs";
import * as edits from "../../view/edits.mjs";
import {sectionPath} from "../../view/settings-layout.mjs";
import {macroNamed, vocabulary, word} from "../../view/vocabulary.mjs";
import {insertStep, sequenceEditor, saveSteps, focusSteps} from "./steps.mjs";
import {inspectEdit, paintFeedback, matchingValidation, requestInspection} from "./validation.mjs";
import {ensureMacroHistory, finishMacroHistoryGroup, rememberMacroEdit} from "./history.mjs";
import {cancelRecording, recorder} from "./recorder.mjs";
import {placementChipsMarkup, showPlacements} from "../keys/reach.mjs";
/** @param {import("../../../contracts/panel.js").PublishedModel} model @param {MacroSlot} slot @param {boolean} canEdit */
export function editor(model, slot, canEdit) {
    const form = macroForm(slot.keycode);
    const payload = form.draft ?? slot.payload ?? "";
    const parsed = readMacro(model, slot.keycode, payload, "editor");
    /** @type {MacroStep[]} */
    let steps = focusSteps(slot, form.steps ?? parsed.steps);
    ensureMacroHistory(slot, parsed.error && !form.steps ? undefined : steps);
    const editable = canEdit && !state.recording && (!parsed.error || Boolean(form.steps));
    const dirty = form.draft !== undefined && !samePayload(payload, slot.payload, model);
    const chip = macroLocalState(model.draft?.changes, slot.keycode, dirty);
    const rawOpen = Boolean(form.rawOpen || (parsed.error && !form.steps));
    const wrap = el(`<div class="stack"></div>`), uninterruptible = vocabulary(model).macroUninterruptible;
    const card = el(`<div class="card macro-editor-card" data-macro-editor="${esc(slot.keycode)}">
        <div class="card-h name-titlebar macro-titlebar">${nameField(model, slot, canEdit)}
            <span class="tag">${esc(macroShortName(slot))}</span>
            <span class="right row actions"><span class="chip" data-local-state><i class="dot ${chip.dot}"></i>${chip.text}</span>
                <button class="btn tiny ghost" data-act="place" ${editGate(model, "keys").editable ? "" : "disabled"}>Place on a key…</button>
                <button class="btn tiny ghost" data-act="discard" ${dirty ? "" : "disabled"}>Discard local edits</button>
                <button class="btn tiny ghost" data-act="clear" ${canEdit && !state.recording ? "" : "disabled"}>Clear macro</button></span></div>
        <div class="card-b stack">
            <div class="macro-context">${placedOn(model, slot)}
            <label class="macro-protection"><span>${esc(uninterruptible.label)}</span><select class="input" data-f="macro:${esc(slot.keycode)}:protection" data-protection ${canEdit ? "" : "disabled"}>
                ${(model.macroProtectionChoices || []).map((choice) => `<option value="${esc(choice.value)}" ${slot.protection === choice.value ? "selected" : ""}>${esc(protectionChoiceLabel(model, choice, slot.uninterruptible))}</option>`).join("")}</select></label></div>
            <div class="macro-sequence-heading"><h4>Sequence</h4></div>
            <div class="macro-insert-tools" aria-label="Add a macro step">
                ${STEP_KINDS.map((value) => `<button class="btn" data-insert-kind="${esc(value)}" data-act="macro-insert:${esc(slot.keycode)}:${esc(value)}" ${editable ? "" : "disabled"}>${esc(addStepLabel(model, value))}</button>`).join("")}
                <label class="sw macro-raw-toggle"><input type="checkbox" data-f="macro:${esc(slot.keycode)}:raw-toggle" data-raw-toggle aria-controls="macro-raw-${esc(slot.keycode)}" ${rawOpen ? "checked" : ""}><span class="track"></span><span>Raw payload</span></label>
            </div>
            <details class="macro-raw" id="macro-raw-${esc(slot.keycode)}" data-raw ${rawOpen ? "open" : ""}>
                <summary hidden>Raw payload</summary>
                <label class="field"><span>Raw payload</span><textarea class="input mono" rows="3" data-f="macro:${esc(slot.keycode)}:raw" data-raw-payload="${esc(slot.keycode)}" ${canEdit && !state.recording ? "" : "disabled"}>${esc(payload)}</textarea></label>
                <p class="note">Commands use {KC_A}, {+KC_A}, {-KC_A} and {120}. Literal braces use {{ and }}. Text steps escape them automatically.</p>
            </details>
            <div data-macro-steps class="stack"></div>
            <div data-macro-feedback role="status" aria-live="polite"></div>
            <div class="stack macro-footer">
            <div class="macro-utilities"><button class="btn tiny ghost" data-host-settings>${model.macroUnicode?.layoutName ? `${esc(model.macroUnicode.layoutName)} · ` : ""}${esc(vocabulary(model).settingsSections.host)} ↗</button>
                <button class="btn tiny ghost macro-help-link" data-show-help aria-controls="macro-help-${esc(slot.keycode)}" aria-expanded="${Boolean(form.guidanceOpen)}">Typing & playback help</button>
            </div>
            <details class="macro-guidance" id="macro-help-${esc(slot.keycode)}" data-guidance ${form.guidanceOpen ? "open" : ""}>
                <summary>Typing & playback help</summary>${unicodeSetup(model, slot)}
                <p class="note">${esc(word(vocabulary(model).macroProtection, "auto"))} turns ${esc(uninterruptible.label)} on when this layout needs Unicode entry. A macro that plays uninterruptibly starts immediately and suspends ordinary keys already held. Only the macro types; new presses are ignored and releases still work. Held modifiers resume afterward. Suspended ordinary keys need to be released and pressed again; ignored presses are never replayed. Pointing and other keyboards can still interfere.</p>
            </details>
            </div>
        </div></div>`);
    // Pointer actions that discard/clear this input take precedence over the
    // change event caused by leaving its field.
    card.addEventListener("pointerdown", event => {
        if (/** @type {HTMLElement | null} */ (/** @type {Element} */ (event.target).closest('[data-act="discard"], [data-act="clear"]'))) setMacroForm(slot.keycode, {cancelBlur: true});
    });
    // The host section, on Host settings.
    /** @type {HTMLElement | null} */ (card.querySelector("[data-host-settings]"))?.addEventListener("click", () => {
        Object.assign(state, {screen: "host", reveal: '.settings-group[data-section="host"]'});
        render();
    });
    /** @type {HTMLSelectElement} */ (card.querySelector("[data-protection]")).addEventListener("change", event => post(edits.macroProtectionMessage(slot.keycode, /** @type {"auto" | "on" | "off"} */ (/** @type {HTMLSelectElement} */ (event.target).value), model.macroEditing.identity)));
    if (model.macroNameSpace) attachTitleName(card, {stored: slot.name || "", perName: model.macroNameSpace.perName,
        rename: name => post(edits.macroNameMessage(slot.keycode, name, getModel()?.macroEditing?.identity))});
    showPlacements(card, "macros", slot.keycode);
    /** @type {HTMLButtonElement} */ (card.querySelector('[data-act="place"]')).addEventListener("click", () => {
        state.placement = {keycode: slot.keycode}; state.screen = "keys"; state.tab = "key"; render();
    });
    /** @type {HTMLElement} */ (card.querySelector("[data-macro-steps]")).append(sequenceEditor(model, slot, steps, editable));
    card.querySelectorAll("[data-insert-kind]").forEach(button => button.addEventListener("click", () => insertStep(model, slot, steps, /** @type {MacroStep['kind']} */ (/** @type {HTMLElement} */ (button).dataset.insertKind))));
    const guidance = /** @type {HTMLDetailsElement} */ (card.querySelector("[data-guidance]"));
    const helpButton = /** @type {HTMLButtonElement} */ (card.querySelector("[data-show-help]"));
    helpButton.addEventListener("click", () => {guidance.open = !guidance.open; setMacroForm(slot.keycode, {guidanceOpen: guidance.open}); helpButton.setAttribute("aria-expanded", String(guidance.open));});
    guidance.addEventListener("toggle", () => {if (guidance.isConnected) {setMacroForm(slot.keycode, {guidanceOpen: guidance.open}); helpButton.setAttribute("aria-expanded", String(guidance.open));}});
    const raw = /** @type {HTMLTextAreaElement} */ (card.querySelector("[data-raw-payload]"));
    raw.addEventListener("input", () => {
        rememberMacroEdit(slot, raw.value, undefined, raw.dataset.f || null);
        setMacroForm(slot.keycode, {draft: raw.value, steps: undefined, stepError: "", cancelBlur: false});
        inspectEdit(slot, false);
        const current = macroForm(slot.keycode);
        const parsed = readMacro(model, slot.keycode, current.draft ?? slot.payload ?? "", "editor");
        steps = focusSteps(slot, current.steps ?? parsed.steps);
        const editable = canEdit && !state.recording && (!parsed.error || Boolean(current.steps));
        // Refresh while typing in raw text. Blur happens between pointerdown
        // and click, so it must preserve every control the user can press.
        /** @type {HTMLElement} */ (card.querySelector("[data-macro-steps]")).replaceChildren(sequenceEditor(model, slot, steps, editable));
        card.querySelectorAll("[data-insert-kind]").forEach(button => {/** @type {HTMLButtonElement} */ (button).disabled = !editable;});
    });
    raw.addEventListener("change", () => {finishMacroHistoryGroup(slot); inspectEdit(slot, true);});
    const rawPanel = /** @type {HTMLDetailsElement} */ (card.querySelector("[data-raw]"));
    const rawToggle = /** @type {HTMLInputElement} */ (card.querySelector("[data-raw-toggle]"));
    rawToggle.addEventListener("change", () => {
        rawPanel.open = rawToggle.checked;
        setMacroForm(slot.keycode, {rawOpen: rawPanel.open});
    });
    rawPanel.addEventListener("toggle", () => {
        if (!rawPanel.isConnected) return;
        rawToggle.checked = rawPanel.open;
        setMacroForm(slot.keycode, {rawOpen: rawPanel.open});
    });
    /** @type {HTMLButtonElement} */ (card.querySelector('[data-act="discard"]')).addEventListener("click", () => {
        cancelRecording(slot.keycode);
        rememberMacroEdit(slot, slot.payload);
        setMacroForm(slot.keycode, {draft: undefined, steps: undefined, stepError: "", validation: undefined, wantsStage: false, cancelBlur: false, selectedStep: undefined, selectionAnchor: null, selectedSteps: [], moveNotice: ""}); render();
    });
    /** @type {HTMLButtonElement} */ (card.querySelector('[data-act="clear"]')).addEventListener("click", () => {
        saveSteps(slot, [], true);
        setMacroForm(slot.keycode, {cancelBlur: false, selectedStep: null, selectionAnchor: null, selectedSteps: [], moveNotice: ""}); render();
    });
    if (slot.available === false) /** @type {HTMLElement} */ (card.querySelector(".card-b")).prepend(el(`<div class="unavailable">This slot is unavailable: macro memory has no room left for it. Shorten or clear another macro to make it available.</div>`));
    paintFeedback(card, model, slot);
    if (form.draft !== undefined && !matchingValidation(form, model, slot) && !form.stepError) requestInspection(slot);
    /** @type {HTMLElement} */ (card.querySelector(".card-b")).insertBefore(recorder(model, slot, canEdit), card.querySelector(".macro-footer"));
    wrap.append(card);
    return wrap;
}

// Every slot can hold a full-length name. The core enforces the rule; the
// counter says where the name stands in bytes, which is what the keyboard
// counts.
/** @param {Model} model @param {MacroSlot} slot @param {boolean} canEdit */
function nameField(model, slot, canEdit) {
    const space = model?.macroNameSpace;
    if (!space) return `<h3>${esc(macroNamed(slot))}</h3>`;
    return titleName({f: `macro:${slot.keycode}:name`, value: slot.name || "", placeholder: slot.defaultName,
        label: "Macro name", perName: space.perName, canEdit});
}

// The layers that set this macro off themselves — a key carrying it, a
// behaviour mapped there whose branch plays it, or a combo on its keys — each
// in its layer colour and naming how. A click opens that layer in Keymap with
// this macro picked in its Macros tab, on the row for the first of those
// routes, so the board rings its keys and the table marks the row.

/** @param {Model} model @param {MacroSlot} slot */
function placedOn(model, slot) {
    const chips = placementChipsMarkup(model, "macros", slot.keycode);
    return chips ? `<div class="row layer-chips" aria-label="Used on layers">${chips}</div>`
        : `<span class="note" data-tip="No key, behaviour or combo sets this macro off. Place it on a key to use it.">Not placed yet</span>`;
}

/** @param {Model} model @param {MacroSlot} slot */
function unicodeSetup(model, slot) {
    const {os, layout, layoutFits, layoutName, entry} = model?.macroUnicode || {mode: 0};
    const typed = layoutFits === false
        ? `Text types through ${word(vocabulary(model).hostLayouts, layout)}, chosen in ${sectionPath(model, "host")}, which is not a ${word(vocabulary(model).hostOs, os)} layout: macros may type the wrong characters until the layout matches the computer.`
        : `Text types through the ${layoutName} layout chosen in ${sectionPath(model, "host")}, accented letters included; keep that layout active on the computer.`;
    const typing = slot?.uninterruptible ? "" : " Avoid typing while a text macro plays.";
    return `<p class="note">${esc(typed)} ${esc(entry || "")} The keyboard cannot check your input setup.${esc(typing)}</p>`;
}
