// @ts-check
/** @typedef {import("../../../contracts/panel.js").PublishedModel | null} Model */
/** @typedef {import("../../../contracts/panel.js").MacroSlot} MacroSlot */
/** @typedef {import("../../view/types.js").MacroStep} MacroStep */
import {el, esc} from "../../lib/dom.mjs";
import {readMacro} from "../../view/macro-cache.mjs";
import {samePayload} from "../../view/macro.mjs";
import {macroPlacements} from "../../view/reach.mjs";
import {titleName, attachTitleName} from "../title-name.mjs";
import {ROUTE_WORDS, setReachGroupOpen} from "../../view/reach-groups.mjs";
import {getModel, layerName, layers, macroForm, post, render, setMacroForm, state, writable} from "../../store.mjs";
import {draftDot, draftMarks} from "../../view/review.mjs";
import {singleShortcut} from "../../view/macro-bank.mjs";
import {keycodeAside} from "../../view/show-keycodes.mjs";
import * as edits from "../../view/edits.mjs";
import {layerSwatch} from "../layerbar.mjs";
import {vocabulary, word} from "../../view/vocabulary.mjs";
import {STEP_KINDS, insertStep, sequenceEditor, saveSteps, focusSteps} from "./steps.mjs";
import {inspectEdit, paintFeedback, matchingValidation, requestInspection} from "./validation.mjs";
import {ensureMacroHistory, finishMacroHistoryGroup, rememberMacroEdit} from "./history.mjs";
import {cancelRecording, recorder} from "./recorder.mjs";
// What Uninterruptible playback does, said where it is set (Noah keeps the
// label; the hint says the consequence).
const PROTECTION_HINT = "Other key presses are ignored while it plays (not the trackball or other keyboards).";
/** @param {import("../../../contracts/panel.js").PublishedModel} model @param {MacroSlot} slot @param {boolean} canEdit */
export function editor(model, slot, canEdit) {
    const form = macroForm(slot.keycode);
    const payload = form.draft ?? slot.payload ?? "";
    const parsed = readMacro(model, slot.keycode, payload, "editor");
    /** @type {MacroStep[]} */
    let steps = focusSteps(slot, form.steps ?? parsed.steps);
    ensureMacroHistory(slot, parsed.error && !form.steps ? undefined : steps);
    const editable = canEdit && !state.recording && (!parsed.error || Boolean(form.steps));
    // An edit still local to this screen (typed but not yet in the draft) can
    // be dropped; once staged, the draft's own undo and Review own it.
    const local = form.draft !== undefined && !samePayload(form.draft, slot.payload, model.qmkKeycodeAliases);
    const changed = draftMarks(model.draft?.changes).macros.has(slot.keycode);
    const rawOpen = Boolean(form.rawOpen || (parsed.error && !form.steps));
    const shortcut = parsed.error ? null : singleShortcut(steps, model.qmkKeycodeAliases);
    const tagTip = keycodeAside(state, "behaviourTitle", slot.keycode);
    const wrap = el(`<div class="stack"></div>`);
    const card = el(`<div class="card macro-editor-card" data-macro-editor="${esc(slot.keycode)}">
        <div class="card-h name-titlebar macro-titlebar">${nameField(model, slot, canEdit)}
            ${changed ? draftDot("This macro differs from the keyboard in your draft") : ""}
            <span class="tag"${tagTip ? ` data-tip="${esc(tagTip)}"` : ""}>M${esc(slot.keycode.split("_").at(-1))}</span>
            <span class="right row actions">
                <button class="btn text" data-act="discard" ${local ? "" : "hidden"} data-tip="Put back what the draft holds for this macro.">Discard this edit</button>
                <button class="btn text destructive" data-act="clear" ${canEdit && !state.recording ? "" : "disabled"}>Clear macro</button></span></div>
        <div class="card-b stack">
            <div class="macro-context"><span class="eyebrow">Placed on</span>${placedOn(model, slot)}
                <button class="btn compact" data-act="place" ${writable() ? "" : "disabled"}>Place on a key…</button>
            <label class="macro-protection" data-tip="${esc(PROTECTION_HINT)}"><span>Uninterruptible playback</span><select class="input" data-f="macro:${esc(slot.keycode)}:protection" data-protection ${canEdit ? "" : "disabled"}>
                ${(model.macroProtectionChoices || []).map(({value, label}) => `<option value="${esc(value)}" ${slot.protection === value ? "selected" : ""}>${esc(label)}${value === "auto" ? ` · ${slot.uninterruptible ? "on" : "off"}` : ""}</option>`).join("")}</select>
                <span class="note">${esc(PROTECTION_HINT)}</span></label></div>
            <div class="macro-insert-tools" aria-label="Add a macro step">
                ${STEP_KINDS.map(([value, label]) => `<button class="btn" data-insert-kind="${value}" data-act="macro-insert:${esc(slot.keycode)}:${value}" ${editable ? "" : "disabled"}>+ ${value === "tap" ? "Key / chord" : value === "press" ? "Press" : label}</button>`).join("")}
                <button class="btn toggle compact macro-raw-toggle" data-raw-toggle aria-pressed="${rawOpen}" aria-controls="macro-raw-${esc(slot.keycode)}">Raw payload</button>
            </div>
            <details class="macro-raw" id="macro-raw-${esc(slot.keycode)}" data-raw ${rawOpen ? "open" : ""}>
                <summary hidden>Raw payload</summary>
                <label class="field"><span>Raw payload</span><textarea class="input mono" rows="3" data-f="macro:${esc(slot.keycode)}:raw" data-raw-payload="${esc(slot.keycode)}" ${canEdit && !state.recording ? "" : "disabled"}>${esc(payload)}</textarea></label>
                <p class="note">Commands use {KC_A}, {+KC_A}, {-KC_A} and {120}. Literal braces use {{ and }}. Text steps escape them automatically.</p>
            </details>
            <div data-macro-steps class="stack"></div>
            <div data-macro-feedback role="status" aria-live="polite"></div>
            ${shortcut ? `<p class="note macro-shortcut-offer" data-shortcut-offer>This macro is one shortcut. A custom key sends it too, held as long as you hold the key, and uses no macro memory. <button class="btn text" data-act="custom-keys">Custom keys →</button></p>` : ""}
            <div class="stack macro-footer">
            <div class="macro-utilities"><button class="btn text" data-host-settings>${esc(model.macroUnicode?.layoutName || "Your computer")} · Your computer in Settings →</button>
                <button class="btn text macro-help-link" data-show-help aria-controls="macro-help-${esc(slot.keycode)}" aria-expanded="${Boolean(form.guidanceOpen)}">Typing & playback help</button>
            </div>
            <details class="macro-guidance" id="macro-help-${esc(slot.keycode)}" data-guidance ${form.guidanceOpen ? "open" : ""}>
                <summary hidden>Typing & playback help</summary>${unicodeSetup(model, slot)}
                <p class="note">Automatic turns protection on when this layout needs Unicode entry. Protected playback starts immediately and suspends ordinary keys already held. Only the macro types; new presses are ignored and releases still work. Held modifiers resume afterward. Suspended ordinary keys need to be released and pressed again; ignored presses are never replayed. Pointing and other keyboards can still interfere.</p>
            </details>
            </div>
        </div></div>`);
    // Pointer actions that discard/clear this input take precedence over the
    // change event caused by leaving its field.
    card.addEventListener("pointerdown", event => {
        if (/** @type {HTMLElement | null} */ (/** @type {Element} */ (event.target).closest('[data-act="discard"], [data-act="clear"]'))) setMacroForm(slot.keycode, {cancelBlur: true});
    });
    /** @type {HTMLElement | null} */ (card.querySelector("[data-host-settings]"))?.addEventListener("click", () => { state.screen = "settings"; render(); });
    /** @type {HTMLElement | null} */ (card.querySelector('[data-act="custom-keys"]'))?.addEventListener("click", () => { state.screen = "customKeys"; render(); });
    /** @type {HTMLSelectElement} */ (card.querySelector("[data-protection]")).addEventListener("change", event => post(edits.macroProtectionMessage(slot.keycode, /** @type {"auto" | "on" | "off"} */ (/** @type {HTMLSelectElement} */ (event.target).value), model.macroEditing.identity)));
    if (model.macroNameSpace) attachTitleName(card, {stored: slot.name || "", perName: model.macroNameSpace.perName,
        rename: name => post(edits.macroNameMessage(slot.keycode, name, getModel()?.macroEditing?.identity))});
    /** @type {NodeListOf<HTMLElement>} */ (card.querySelectorAll("[data-goto-layer]")).forEach(button => button.addEventListener("click", () => showOnLayer(slot.keycode, Number(button.dataset.gotoLayer))));
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
    const rawToggle = /** @type {HTMLButtonElement} */ (card.querySelector("[data-raw-toggle]"));
    rawToggle.addEventListener("click", () => {
        rawPanel.open = !rawPanel.open;
        rawToggle.setAttribute("aria-pressed", String(rawPanel.open));
        setMacroForm(slot.keycode, {rawOpen: rawPanel.open});
    });
    rawPanel.addEventListener("toggle", () => {
        if (!rawPanel.isConnected) return;
        rawToggle.setAttribute("aria-pressed", String(rawPanel.open));
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

// Every slot can hold a full-length name. The host enforces the rule; the
// counter says where the name stands in bytes, which is what the keyboard
// counts.
/** @param {Model} model @param {MacroSlot} slot @param {boolean} canEdit */
function nameField(model, slot, canEdit) {
    const space = model?.macroNameSpace;
    const number = slot.keycode.split("_").at(-1);
    if (!space) return `<h3>${esc(slot.name || `Macro ${number}`)}</h3>`;
    return titleName({f: `macro:${slot.keycode}:name`, value: slot.name || "", placeholder: `Macro ${number}`,
        label: "Macro name", perName: space.perName, canEdit});
}

// The layers that set this macro off themselves — a key carrying it, a
// behaviour mapped there whose branch plays it, or a combo on its keys — each
// in its layer colour and naming how. A click opens that layer in Keys with
// this macro picked in its Macros tab, on the row for the first of those
// routes, so the board rings its keys and the table marks the row.

/** @param {Model} model @param {MacroSlot} slot */
function placedOn(model, slot) {
    const chips = macroPlacements(model, layers(), slot.keycode).map(({layer, at, routes}) => {
        const swatch = layerSwatch(model, layer);
        const how = routes.map((route) => {
            const count = route.keys.length;
            return `${ROUTE_WORDS[route.group]}${route.group === "here" && count > 1 ? ` ×${count}` : ""}`;
        }).join(" · ");
        return `<button class="layer-chip link" data-goto-layer="${at}"
            data-tip="${esc(swatch.tip)} · reached by ${esc(how)} · show on the board">${swatch.html}
            <span>${esc(layerName(layer))}</span><span class="idx">${esc(how)}</span></button>`;
    }).join("");
    return chips ? `<div class="row layer-chips" aria-label="Used on layers">${chips}</div>`
        : `<span class="note" data-tip="No key, behaviour or combo sets this macro off. Place it on a key to use it.">Not on a key yet</span>`;
}

/** @param {string} keycode @param {number} at */
function showOnLayer(keycode, at) {
    const placement = macroPlacements(getModel(), layers(), keycode).find((entry) => entry.at === at);
    const route = placement?.routes[0];
    if (!route) return;
    Object.assign(state, {screen: "keys", tab: "macros", layer: at, placement: null});
    if (route.keys.length) state.selected = route.keys[0];
    state.reachRow.macros = `${route.group}:${keycode}`;
    state.reachGroups = setReachGroupOpen(state.reachGroups, route.group, true);
    render();
}

/** @param {Model} model @param {MacroSlot} slot */
function unicodeSetup(model, slot) {
    const {mode, os, layout, layoutFits, layoutName} = model?.macroUnicode || {mode: 0};
    const typed = layoutFits === false
        ? `Text types through ${word(vocabulary(model).hostLayouts, layout)}, chosen in Settings → Your computer, which is not a ${word(vocabulary(model).hostOs, os)} layout: macros may type the wrong characters until the layout matches the computer.`
        : `Text types through the ${layoutName} layout chosen in Settings → Your computer, accented letters included; keep that layout active on the computer.`;
    const entry = mode
        ? ["", "Other characters use Unicode entry: keep Unicode Hex Input active in macOS input sources while macros play. Option shortcuts can behave differently in this input source.",
            "Other characters use Unicode entry: install and run WinCompose on Windows with Right Alt as its Compose key.",
            "Other characters use Unicode entry: use an input method or application that accepts Ctrl+Shift+U, hexadecimal digits and Space, such as IBus. This sequence does not work in every Linux application."][mode]
        : os === 1 ? "Characters it cannot type, such as emoji, need the Unicode Hex Input layout."
            : "Characters it cannot type, such as emoji, need Unicode playback on and a known operating system.";
    const typing = slot?.uninterruptible ? "" : " Avoid typing while a text macro plays.";
    return `<p class="note">${esc(typed)} ${esc(entry)} The keyboard cannot check your input setup.${esc(typing)}</p>`;
}
