// @ts-check
/** @typedef {import("../../../contracts/panel.js").PublishedModel | null} Model */
/** @typedef {import("../../../contracts/panel.js").MacroSlot} MacroSlot */
/** @typedef {import("../../view/types.js").MacroStep} MacroStep */
import {el, esc} from "../../lib/dom.mjs";
import {readMacro} from "../../view/macro-cache.mjs";
import {macroPlacements} from "../../view/reach.mjs";
import {NAME_TIP, nameCount} from "../../view/names.mjs";
import {ROUTE_WORDS, setReachGroupOpen} from "../../view/reach-groups.mjs";
import {getModel, layerName, layers, macroForm, post, render, setMacroForm, state, writable} from "../../store.mjs";
import * as edits from "../../view/edits.mjs";
import {layerSwatch} from "../layerbar.mjs";
import {vocabulary, word} from "../../view/vocabulary.mjs";
import {STEP_KINDS, stepEditor, saveSteps, focusSteps} from "./steps.mjs";
import {inspectEdit, paintFeedback, matchingValidation, requestInspection} from "./validation.mjs";
import {recorder} from "./recorder.mjs";
/** @param {import("../../../contracts/panel.js").PublishedModel} model @param {MacroSlot} slot @param {boolean} canEdit */
export function editor(model, slot, canEdit) {
    const form = macroForm(slot.keycode);
    const payload = form.draft ?? slot.payload ?? "";
    const parsed = readMacro(model, slot.keycode, payload, "editor");
    /** @type {MacroStep[]} */
    let steps = focusSteps(slot, form.steps ?? (parsed.steps.length ? parsed.steps : [{kind: "text", text: ""}]));
    const editable = canEdit && !state.recording && (!parsed.error || Boolean(form.steps));
    const dirty = form.draft !== undefined && payload !== slot.payload;
    const wrap = el(`<div class="stack"></div>`);
    const card = el(`<div class="card" data-macro-editor="${esc(slot.keycode)}">
        <div class="card-h"><h3>${esc(slot.name || `Macro ${slot.keycode.split("_").at(-1)}`)}</h3>
            <span class="tag">Slot ${esc(slot.keycode.split("_").at(-1))}</span>
            <span class="right row"><span class="chip" data-local-state><i class="dot ${dirty ? "draft" : "on"}"></i>${dirty ? "edited here" : "as read"}</span>
                <button class="btn tiny ghost" data-act="place" ${writable() ? "" : "disabled"}>Place on a key…</button></span></div>
        <div class="card-b stack">
            ${nameField(model, slot, canEdit)}
            ${placedOn(model, slot)}
            ${unicodeSetup(model, slot)}
            <label class="field"><span>Uninterruptible playback</span><select class="input" data-f="macro:${esc(slot.keycode)}:protection" data-protection ${canEdit && model.macroProtectionSupported ? "" : "disabled"}>
                ${(model.macroProtectionChoices || []).map(({value, label}) => `<option value="${esc(value)}" ${slot.protection === value ? "selected" : ""}>${esc(label)}${value === "auto" ? ` · ${slot.uninterruptible ? "on" : "off"}` : ""}</option>`).join("")}</select></label>
            <p class="note">${model.macroProtectionSupported ? (model.macroOutputIsolationSupported ? "Automatic turns protection on when this layout needs Unicode entry. Protected playback starts immediately and suspends ordinary keys already held. Only the macro types; new presses are ignored and releases still work. Held modifiers resume afterward. Suspended ordinary keys need to be released and pressed again; ignored presses are never replayed. Pointing and other keyboards can still interfere." : "Typing during Unicode entry can corrupt the text. Automatic turns protection on when this layout needs Unicode entry. On ignores new keypresses from this keyboard until playback finishes; releases still work. Ignored presses are not replayed. Release ordinary keys before starting; other keyboards can still interfere. Update both halves to suspend keys already held.") : "Update both halves to protect macro playback. This firmware does not support the per-macro setting."}</p>
            <div class="sect-h"><h4>Steps</h4><span class="right note">played from top to bottom</span></div>
            <p class="note">Type or paste exactly what you want in Text. Add keys and delays as separate steps.</p>
            <div data-macro-steps class="stack"></div>
            <div data-macro-feedback role="status" aria-live="polite"></div>
            <div class="row macro-add"><select class="input" data-f="macro:${esc(slot.keycode)}:new-kind" data-kind aria-label="New step type" ${editable ? "" : "disabled"}>
                ${STEP_KINDS.map(([value, text]) => `<option value="${value}" ${value === (form.newKind || "text") ? "selected" : ""}>${text}</option>`).join("")}</select>
                <button class="btn" data-act="insert" ${editable ? "" : "disabled"}>Add a step</button></div>
            <details data-raw ${form.rawOpen || (parsed.error && !form.steps) ? "open" : ""}>
                <summary>Advanced · Raw payload</summary>
                <label class="field"><span>Raw payload</span><textarea class="input mono" rows="3" data-f="macro:${esc(slot.keycode)}:raw" data-raw-payload="${esc(slot.keycode)}" ${canEdit && !state.recording ? "" : "disabled"}>${esc(payload)}</textarea></label>
                <p class="note">Commands use {KC_A}, {+KC_A}, {-KC_A} and {120}. Literal braces use {{ and }}. Text steps escape them automatically.</p>
            </details>
            <div class="row macro-actions">
                <button class="btn ghost" data-act="discard" ${dirty ? "" : "disabled"}>Discard local edits</button>
                <button class="btn ghost" data-act="clear" ${canEdit && !state.recording ? "" : "disabled"}>Clear macro</button>
            </div>
        </div></div>`);
    // Pointer actions that discard/clear this input take precedence over the
    // change event caused by leaving its field.
    card.addEventListener("pointerdown", event => {
        if (/** @type {HTMLElement | null} */ (/** @type {Element} */ (event.target).closest('[data-act="discard"], [data-act="clear"]'))) setMacroForm(slot.keycode, {cancelBlur: true});
    });
    /** @type {HTMLElement | null} */ (card.querySelector("[data-host-settings]"))?.addEventListener("click", () => { state.screen = "settings"; render(); });
    /** @type {HTMLSelectElement} */ (card.querySelector("[data-protection]")).addEventListener("change", event => post(edits.macroProtectionMessage(slot.keycode, /** @type {"auto" | "on" | "off"} */ (/** @type {HTMLSelectElement} */ (event.target).value), model.macroEditing.identity)));
    const nameInput = /** @type {HTMLInputElement | null} */ (card.querySelector("[data-name]"));
    nameInput?.addEventListener("input", () => showCount(/** @type {HTMLElement} */ (card.querySelector("[data-name-count]")), nameInput.value, /** @type {{perName: number}} */ (model.macroNameSpace).perName));
    nameInput?.addEventListener("change", () => post(edits.macroNameMessage(slot.keycode, nameInput.value, getModel()?.macroEditing?.identity)));
    /** @type {NodeListOf<HTMLElement>} */ (card.querySelectorAll("[data-goto-layer]")).forEach(button => button.addEventListener("click", () => showOnLayer(slot.keycode, Number(button.dataset.gotoLayer))));
    /** @type {HTMLButtonElement} */ (card.querySelector('[data-act="place"]')).addEventListener("click", () => {
        state.placement = {keycode: slot.keycode}; state.screen = "keys"; state.tab = "key"; render();
    });
    steps.forEach((step, index) => /** @type {HTMLElement} */ (card.querySelector("[data-macro-steps]")).append(stepEditor(model, slot, steps, step, index, editable)));
    const kind = /** @type {HTMLSelectElement} */ (card.querySelector("[data-kind]"));
    kind.addEventListener("change", () => setMacroForm(slot.keycode, {newKind: /** @type {MacroStep["kind"]} */ (kind.value)}));
    /** @type {HTMLButtonElement} */ (card.querySelector('[data-act="insert"]')).addEventListener("click", () => {
        /** @type {MacroStep} */
        const step = kind.value === "text" ? {kind: "text", text: ""} : kind.value === "delay" ? {kind: "delay", delay: 120} : {kind: /** @type {"tap" | "press" | "release"} */ (kind.value), keys: []};
        saveSteps(slot, [...(macroForm(slot.keycode).steps ?? steps), step], true); render();
    });
    const raw = /** @type {HTMLTextAreaElement} */ (card.querySelector("[data-raw-payload]"));
    raw.addEventListener("input", () => {
        setMacroForm(slot.keycode, {draft: raw.value, steps: undefined, stepError: "", cancelBlur: false});
        inspectEdit(slot, false);
        const current = macroForm(slot.keycode);
        const parsed = readMacro(model, slot.keycode, current.draft ?? slot.payload ?? "", "editor");
        steps = focusSteps(slot, current.steps ?? (parsed.steps.length ? parsed.steps : [{kind: "text", text: ""}]));
        const editable = canEdit && !state.recording && (!parsed.error || Boolean(current.steps));
        // Refresh while typing in raw text. Blur happens between pointerdown
        // and click, so it must preserve every control the user can press.
        /** @type {HTMLElement} */ (card.querySelector("[data-macro-steps]")).replaceChildren(...steps.map((step, index) => stepEditor(model, slot, steps, step, index, editable)));
        kind.disabled = !editable;
        /** @type {HTMLButtonElement} */ (card.querySelector('[data-act="insert"]')).disabled = !editable;
    });
    raw.addEventListener("change", () => inspectEdit(slot, true));
    /** @type {HTMLDetailsElement} */ (card.querySelector("[data-raw]")).addEventListener("toggle", event => {
        if (/** @type {Element} */ (event.target).isConnected) setMacroForm(slot.keycode, {rawOpen: /** @type {HTMLDetailsElement} */ (event.target).open});
    });
    /** @type {HTMLButtonElement} */ (card.querySelector('[data-act="discard"]')).addEventListener("click", () => {
        setMacroForm(slot.keycode, {draft: undefined, steps: undefined, stepError: "", validation: undefined, wantsStage: false, cancelBlur: false}); render();
    });
    /** @type {HTMLButtonElement} */ (card.querySelector('[data-act="clear"]')).addEventListener("click", () => {
        setMacroForm(slot.keycode, {cancelBlur: false});
        saveSteps(slot, [{kind: "text", text: ""}], true); render();
    });
    if (slot.available === false) /** @type {HTMLElement} */ (card.querySelector(".card-b")).prepend(el(`<div class="unavailable">This slot has no room. Shorten or clear another macro to open it.</div>`));
    paintFeedback(card, model, slot);
    if (form.draft !== undefined && !matchingValidation(form, model, slot) && !form.stepError) requestInspection(slot);
    wrap.append(card, recorder(model, slot, canEdit));
    return wrap;
}

// Every slot can hold a full-length name. The host enforces the rule; the
// counter says where the name stands in bytes, which is what the keyboard
// counts.
/** @param {Model} model @param {MacroSlot} slot @param {boolean} canEdit */
function nameField(model, slot, canEdit) {
    const space = model?.macroNameSpace;
    if (!space) return "";
    const count = nameCount(slot.name || "", space.perName);
    return `<label class="field"><span>Name</span>
        <input class="input" data-f="macro:${esc(slot.keycode)}:name" data-name value="${esc(slot.name || "")}" placeholder="Macro ${esc(slot.keycode.split("_").at(-1))}" ${canEdit ? "" : "disabled"}
            data-tip="${esc(NAME_TIP)}">
        <span class="note${count.over ? " warn" : ""}" data-name-count>${esc(count.label)}</span></label>`;
}
/** @param {HTMLElement} node @param {string} text @param {number} max */
function showCount(node, text, max) {
    const count = nameCount(text, max);
    node.textContent = count.label;
    node.classList.toggle("warn", count.over);
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
    return `<div class="field"><span>On layers</span>
        ${chips ? `<div class="row layer-chips">${chips}</div>`
            : `<span class="note">No key, behaviour or combo sets this macro off. Place it on a key to use it.</span>`}</div>`;
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
    if (!model?.macroUnicode?.supported) return `<p class="note">Unicode macro text needs newer firmware on both halves.</p>`;
    const {mode, os, layouts, layout, layoutFits, layoutName} = model.macroUnicode;
    const typed = layouts && layoutFits === false
        ? `Text types through ${word(vocabulary(model).hostLayouts, layout)}, chosen in Settings → Host, which is not a ${word(vocabulary(model).hostOs, os)} layout: macros may type the wrong characters until the layout matches the computer.`
        : layouts
        ? `Text types through the ${layoutName} layout chosen in Settings → Host, accented letters included; keep that layout active on the computer.`
        : "Plain ASCII text types with ordinary keys on any input source.";
    const entry = mode
        ? ["", "Other characters use Unicode entry: keep Unicode Hex Input active in macOS input sources while macros play. Option shortcuts can behave differently in this input source.",
            "Other characters use Unicode entry: install and run WinCompose on Windows with Right Alt as its Compose key.",
            "Other characters use Unicode entry: use an input method or application that accepts Ctrl+Shift+U, hexadecimal digits and Space, such as IBus. This sequence does not work in every Linux application."][mode]
        : layouts && os === 1 ? "Characters it cannot type, such as emoji, need the Unicode Hex Input layout."
            : "Characters it cannot type, such as emoji, need Unicode playback on and a known host OS.";
    const typing = model.macroOutputIsolationSupported && slot?.uninterruptible ? "" : " Avoid typing while a text macro plays.";
    return `<div class="field"><span class="note">${esc(typed)} ${esc(entry)} The keyboard cannot check your input setup.${esc(typing)}</span><button class="btn tiny ghost" data-host-settings>Open Host settings</button></div>`;
}
