// Macros: the keyboard's macro slots, edited as literal text and key steps, each
// with an optional name kept in the keyboard's profile. The slots share one
// block of macro memory; the host says which still have room.
//
// The preview parses the payload for reading; the host parses it again for
// real when the slot is staged, and says so if it disagrees.

import {el, esc} from "../lib/dom.mjs";
import {describeStep, macroMatches, macroPeek, parseMacro, macroStepsInput, unreleased} from "../view/macro.mjs";
import {actionLabel, macroPlacements} from "../view/keyface.mjs";
import {NAME_TIP, nameCount} from "../view/names.mjs";
import {setReachGroupOpen} from "../view/reach-groups.mjs";
import {canEdit as canEditArea, getModel, layerName, layers, macroForm, post, render, setMacroForm, state, writable} from "../store.mjs";
import * as edits from "../view/edits.mjs";
import {layerSwatch} from "./layerbar.mjs";
import {openPicker} from "./picker.mjs";
import {draftDot, draftMarks} from "../view/review.mjs";
import {topbar, unavailable} from "./shell.mjs";

const STEP_KINDS = [
    ["text", "Text"], ["tap", "Tap key or chord"], ["delay", "Delay"],
    ["press", "Press and hold"], ["release", "Release"],
];

export function screenMacros() {
    const model = getModel();
    const bank = model?.viaMacros || [];
    const memory = model?.macroBank;
    const slot = bank.find((row) => row.keycode === state.macroSlot) || bank[0];
    const canEdit = canEditArea("macros") && slot?.available !== false;

    const main = el(`<div class="main">${topbar(
        "Macros",
        "Macro slots on the keyboard. A named macro shows by its name on keys, in the picker and in the key card.",
        bank.length ? `<input class="input" id="macroSearch" type="search" placeholder="Search macros by name" style="width:220px" value="${esc(state.macroSearch || "")}">` : "",
    )}</div>`);
    main.querySelector("#macroSearch")?.addEventListener("input", (event) => { state.macroSearch = event.target.value; render(); });

    const content = el(`<div class="content"><div class="pad" style="display:grid;grid-template-columns:minmax(0,340px) minmax(0,1fr);gap:20px;align-items:start"></div></div>`);
    const pad = content.firstElementChild;
    if (!bank.length) {
        pad.style.display = "block";
        pad.appendChild(el(`<div class="screen-stub"><h3>No macro banks read</h3>
            <p class="note">${esc(unavailable(model) || "This firmware has not reported its macro banks.")}</p></div>`));
        main.appendChild(content);
        return main;
    }

    const filled = bank.filter((row) => !row.empty).length;
    const available = memory?.available ?? bank.length;
    const grid = el(`<div class="card"><div class="card-h"><h3>Slots</h3>
        <span class="right tag" data-tip="${filled} filled">${available} of ${bank.length} available</span></div>
        <div class="card-b"><div class="macro-grid"></div>${memoryMeter(memory)}</div></div>`);
    const cells = grid.querySelector(".macro-grid");
    const query = state.macroSearch || "";
    if (!bank.some((row) => macroMatches(row, query))) {
        cells.replaceWith(el(`<p class="note">No macro is named “${esc(query.trim())}”.</p>`));
    }
    const changedMacros = draftMarks(model?.draft?.changes).macros;
    bank.forEach((row, index) => {
        if (!macroMatches(row, query)) return;
        const {steps} = parseMacro(row.payload, {unicode: model?.macroUnicode?.supported, textEntry: Boolean(model?.macroUnicode?.mode), layoutChars: model?.macroUnicode?.layoutChars, modifierKeys: model?.macroPayloadModifierKeycodes});
        const peek = macroPeek(row.payload, (name) => model?.qmkKeyLabels?.[name] || name);
        const out = row.available === false;
        const tip = out ? `Slot ${index} · no room: the free macro memory is kept for the lower empty slots. Shorten or clear a macro to open it.`
            : row.empty ? `Slot ${index} · empty` : `Slot ${index} · ${steps.length} step${steps.length === 1 ? "" : "s"} · ${row.program} of ${memory?.programMax ?? 512} bytes to play · ${row.payload}`;
        const cell = el(`<button class="mslot ${row.empty ? "" : "filled"} ${out ? "out" : ""} ${row.playable === false ? "warn" : ""}" data-slot="${esc(row.keycode)}"
            aria-current="${row.keycode === slot?.keycode}" ${out ? "disabled" : ""} data-tip="${esc(tip)}">
            <span class="n">M${index}</span>${changedMacros.has(row.keycode) ? draftDot("Changed in your draft", "corner") : ""}
            <span class="v">${row.needsUnicodeSetup ? "setup" : row.playable === false ? "too long" : row.name ? esc(row.name.length > 13 ? `${row.name.slice(0, 12)}…` : row.name) : row.empty ? (out ? "no room" : "—") : esc(peek.length > 13 ? `${peek.slice(0, 12)}…` : peek)}</span></button>`);
        cell.addEventListener("click", () => { state.macroSlot = row.keycode; render(); });
        cells.append(cell);
    });
    pad.appendChild(grid);
    pad.appendChild(slot ? editor(model, slot, canEdit) : el(`<div class="empty-card"><p class="note">Pick a slot.</p></div>`));
    main.appendChild(content);
    return main;
}

// All slots share one block of macro memory. Each empty slot keeps room for
// a few key taps; when that runs out the highest empty slots close.
function memoryMeter(memory) {
    if (!memory) return "";
    const used = memory.stored, share = Math.min(100, (used / memory.capacity) * 100);
    const closed = memory.slots - memory.available;
    return `<div class="sect-h" style="margin-top:14px"><h4>Macro memory</h4>
            <span class="right note">${used.toLocaleString("en-US")} of ${memory.capacity.toLocaleString("en-US")} bytes used</span></div>
        <div class="meter"><i style="width:${share}%"></i></div>
        <p class="note" style="margin-top:6px">A key tap takes 3 bytes; text uses its UTF-8 bytes. Every empty slot keeps room for ${memory.reserveTaps} key taps${closed ? `; ${closed} slot${closed === 1 ? " has" : "s have"} no room left` : ""}.</p>`;
}

function editor(model, slot, canEdit) {
    const form = macroForm(slot.keycode);
    const payload = form.draft ?? slot.payload ?? "";
    const parsed = parseMacro(payload, {unicode: true, keys: model?.macroPayloadKeycodes, aliases: model?.qmkKeycodeAliases});
    let steps = form.steps ?? (parsed.steps.length ? parsed.steps : [{kind: "text", text: ""}]);
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
            ${unicodeSetup(model, canEdit)}
            <div class="sect-h"><h4>Steps</h4><span class="right note">played from top to bottom</span></div>
            <p class="note">Type or paste exactly what you want in Text. Add keys and delays as separate steps.</p>
            <div data-macro-steps class="stack"></div>
            <div data-macro-feedback role="status" aria-live="polite"></div>
            <div class="row macro-add"><select class="input" data-kind aria-label="New step type" ${editable ? "" : "disabled"}>
                ${STEP_KINDS.map(([value, text]) => `<option value="${value}" ${value === (form.newKind || "text") ? "selected" : ""}>${text}</option>`).join("")}</select>
                <button class="btn" data-act="insert" ${editable ? "" : "disabled"}>Add a step</button></div>
            <details data-raw ${form.rawOpen || (parsed.error && !form.steps) ? "open" : ""}>
                <summary>Advanced · Raw payload</summary>
                <label class="field"><span>Raw payload</span><textarea class="input mono" rows="3" data-raw-payload="${esc(slot.keycode)}" ${canEdit && !state.recording ? "" : "disabled"}>${esc(payload)}</textarea></label>
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
        if (event.target.closest('[data-act="discard"], [data-act="clear"]')) setMacroForm(slot.keycode, {cancelBlur: true});
    });
    card.querySelector("[data-host-settings]")?.addEventListener("click", () => { state.screen = "settings"; render(); });
    const nameInput = card.querySelector("[data-name]");
    nameInput?.addEventListener("input", () => showCount(card.querySelector("[data-name-count]"), nameInput.value, model.macroNameSpace.perName));
    nameInput?.addEventListener("change", () => post(edits.macroNameMessage(slot.keycode, nameInput.value, getModel()?.macroEditing?.identity)));
    card.querySelectorAll("[data-goto-layer]").forEach(button => button.addEventListener("click", () => showOnLayer(slot.keycode, Number(button.dataset.gotoLayer))));
    card.querySelector('[data-act="place"]').addEventListener("click", () => {
        state.placement = {keycode: slot.keycode}; state.screen = "keys"; state.tab = "key"; render();
    });
    steps.forEach((step, index) => card.querySelector("[data-macro-steps]").append(stepEditor(model, slot, steps, step, index, editable)));
    const kind = card.querySelector("[data-kind]");
    kind.addEventListener("change", () => setMacroForm(slot.keycode, {newKind: kind.value}));
    card.querySelector('[data-act="insert"]').addEventListener("click", () => {
        const step = kind.value === "text" ? {kind: "text", text: ""} : kind.value === "delay" ? {kind: "delay", delay: 120} : {kind: kind.value, keys: []};
        saveSteps(slot, [...(macroForm(slot.keycode).steps ?? steps), step], true); render();
    });
    const raw = card.querySelector("[data-raw-payload]");
    raw.addEventListener("input", () => {
        setMacroForm(slot.keycode, {draft: raw.value, steps: undefined, stepError: "", cancelBlur: false});
        inspectEdit(slot, false);
        const current = macroForm(slot.keycode);
        const parsed = parseMacro(current.draft ?? slot.payload ?? "", {unicode: true, keys: model?.macroPayloadKeycodes, aliases: model?.qmkKeycodeAliases});
        steps = current.steps ?? (parsed.steps.length ? parsed.steps : [{kind: "text", text: ""}]);
        const editable = canEdit && !state.recording && (!parsed.error || Boolean(current.steps));
        // Refresh while typing in raw text. Blur happens between pointerdown
        // and click, so it must preserve every control the user can press.
        card.querySelector("[data-macro-steps]").replaceChildren(...steps.map((step, index) => stepEditor(model, slot, steps, step, index, editable)));
        kind.disabled = !editable;
        card.querySelector('[data-act="insert"]').disabled = !editable;
    });
    raw.addEventListener("change", () => inspectEdit(slot, true));
    card.querySelector("[data-raw]").addEventListener("toggle", event => {
        if (event.target.isConnected) setMacroForm(slot.keycode, {rawOpen: event.target.open});
    });
    card.querySelector('[data-act="discard"]').addEventListener("click", () => {
        setMacroForm(slot.keycode, {draft: undefined, steps: undefined, stepError: "", validation: null, wantsStage: false, cancelBlur: false}); render();
    });
    card.querySelector('[data-act="clear"]').addEventListener("click", () => {
        setMacroForm(slot.keycode, {cancelBlur: false});
        saveSteps(slot, [{kind: "text", text: ""}], true); render();
    });
    if (slot.available === false) card.querySelector(".card-b").prepend(el(`<div class="unavailable">This slot has no room. Shorten or clear another macro to open it.</div>`));
    paintFeedback(card, model, slot);
    if (form.draft !== undefined && !matchingValidation(form, model, slot) && !form.stepError) requestInspection(slot);
    wrap.append(card, recorder(model, slot, canEdit));
    return wrap;
}

// Every slot can hold a full-length name. The host enforces the rule; the
// counter says where the name stands in bytes, which is what the keyboard
// counts.
function nameField(model, slot, canEdit) {
    const space = model?.macroNameSpace;
    if (!space) return "";
    const count = nameCount(slot.name || "", space.perName);
    return `<label class="field"><span>Name</span>
        <input class="input" data-name value="${esc(slot.name || "")}" placeholder="Macro ${esc(slot.keycode.split("_").at(-1))}" ${canEdit ? "" : "disabled"}
            data-tip="${esc(NAME_TIP)}">
        <span class="note${count.over ? " warn" : ""}" data-name-count>${esc(count.label)}</span></label>`;
}
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
const ROUTE_WORDS = {here: "key", branches: "behaviour", combos: "combo"};

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
        ${chips ? `<div class="row" style="gap:6px;flex-wrap:wrap">${chips}</div>`
            : `<span class="note">No key, behaviour or combo sets this macro off. Place it on a key to use it.</span>`}</div>`;
}

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

// Input remains local until the host has inspected this exact payload under
// the current draft. A late reply can never stage a newer or discarded edit.
let nextInspection = 0;
const pendingInspections = new Map();
const inspectionContext = (model, slot) => JSON.stringify([model?.draft?.id, model?.draft?.revision,
    model?.macroUnicode, slot?.bytes, model?.macroBank?.free, canEditArea("macros")]);
const matchingValidation = (form, model, slot) => Boolean(form.validation) && form.validation.payload === form.draft &&
    form.validation.context === inspectionContext(model, slot);

function currentSlot(keycode) { return getModel()?.viaMacros?.find(slot => slot.keycode === keycode); }

function requestInspection(slot) {
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

function inspectEdit(slot, stage) {
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

function keepValidated(slot) {
    const model = getModel(), form = macroForm(slot.keycode);
    if (!canEditArea("macros") || slot.available === false || !form.wantsStage || form.stepError || state.recording || !matchingValidation(form, model, slot) || form.validation.validation.error) return;
    setMacroForm(slot.keycode, {wantsStage: false});
    if (form.draft !== slot.payload) post(edits.macroMessage(slot.keycode, form.draft, model?.macroEditing?.identity));
}

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

function saveSteps(slot, steps, stage = false) {
    const {payload, error} = macroStepsInput(steps);
    setMacroForm(slot.keycode, {steps, draft: payload, stepError: error, cancelBlur: false});
    const raw = document.querySelector(`[data-raw-payload="${slot.keycode}"]`);
    if (raw && document.activeElement !== raw) raw.value = payload;
    inspectEdit(slot, stage);
}

function refreshFeedback(keycode) {
    const card = document.querySelector(`[data-macro-editor="${keycode}"]`), slot = currentSlot(keycode);
    if (card && slot) paintFeedback(card, getModel(), slot);
}

function paintFeedback(card, model, slot) {
    const form = macroForm(slot.keycode), local = form.draft !== undefined;
    const payload = form.draft ?? slot.payload;
    const parsed = parseMacro(payload, {keys: model?.macroPayloadKeycodes, aliases: model?.qmkKeycodeAliases, unicode: model?.macroUnicode?.supported,
        textEntry: Boolean(model?.macroUnicode?.mode), layoutChars: model?.macroUnicode?.layoutChars, modifierKeys: model?.macroPayloadModifierKeycodes});
    const held = unreleased(parsed.steps, model?.qmkKeycodeAliases);
    const inspection = matchingValidation(form, model, slot) ? form.validation.validation : null;
    const error = form.stepError || parsed.error || (held.length ? `Release ${held.map(key => actionLabel(model, key)).join(", ")} before the macro ends.` : "") || inspection?.error;
    const program = local ? inspection?.program : slot.program;
    const bytes = local ? inspection?.bytes : slot.bytes;
    const max = model?.macroBank?.programMax ?? 512;
    const feedback = card.querySelector("[data-macro-feedback]");
    feedback.replaceChildren(el(`<div class="stack">
        ${error ? `<div class="unavailable">${esc(error)} This edit is not staged.</div>` : ""}
        <div class="meter ${program > max ? "over" : ""}"><i style="width:${Math.min(100, (program ?? 0) / max * 100)}%"></i></div>
        <p class="note" data-macro-size>${program == null ? "Playback size unavailable" : `${esc(program)} of ${esc(max)} playback bytes`} · ${bytes == null ? "macro memory size unavailable" : `${esc(bytes)} bytes of macro memory`}</p>
        <p class="note">${error ? "Fix this edit before it can be kept in your draft." : local && !inspection ? "Checking this edit…" : "Valid edits are kept in your draft when you finish editing a step."}</p>
    </div>`));
    const dirty = local && payload !== slot.payload;
    card.querySelector("[data-local-state]").replaceChildren(el(`<i class="dot ${dirty ? "draft" : "on"}"></i>`), document.createTextNode(dirty ? "edited here" : "as read"));
    card.querySelector('[data-act="discard"]').disabled = form.draft === undefined || form.draft === slot.payload;
}

function stepEditor(model, slot, steps, step, index, canEdit) {
    const label = STEP_KINDS.find(([kind]) => kind === step.kind)?.[1] || step.kind;
    const node = el(`<div class="macro-step" data-step="${index}">
        <div class="row macro-step-head"><span class="kind">${esc(label)}</span><span class="right row">
            <button class="btn tiny ghost" data-move="-1" ${canEdit && index > 0 ? "" : "disabled"} aria-label="Move step up">↑</button>
            <button class="btn tiny ghost" data-move="1" ${canEdit && index < steps.length - 1 ? "" : "disabled"} aria-label="Move step down">↓</button>
            <button class="btn tiny ghost" data-remove ${canEdit ? "" : "disabled"}>Remove</button></span></div>
        ${step.kind === "text" ? `<label class="field"><textarea aria-label="Text for step ${index + 1}" class="input" rows="3" data-step-text="${index}" placeholder="Type or paste text" ${canEdit ? "" : "disabled"}>${esc(step.text)}</textarea></label>`
            : step.kind === "delay" ? `<label class="field"><span>Milliseconds</span><input class="input mono" data-step-delay="${index}" type="number" min="0" max="65535" value="${esc(step.delay)}" ${canEdit ? "" : "disabled"}></label>`
            : `<div class="row"><span class="tok">${esc(describeStep(step, key => actionLabel(model, key))) || "Choose keys"}</span><button class="btn" data-pick-step ${canEdit ? "" : "disabled"}>Pick…</button></div>`}
    </div>`);
    const input = node.querySelector("textarea, input");
    input?.addEventListener("input", () => {
        const next = macroForm(slot.keycode).steps ?? steps;
        saveSteps(slot, next.map((item, at) => at === index ? {...item, ...(step.kind === "text" ? {text: input.value} : {delay: input.value})} : item));
    });
    input?.addEventListener("change", () => inspectEdit(slot, true));
    node.querySelector("[data-pick-step]")?.addEventListener("click", () => openPicker({
        title: label, contextKeycode: slot.keycode, mode: "list", seed: step.keys, allowedKeys: model.macroPayloadKeycodes, maxKeys: step.kind === "tap" ? 16 : 1,
        onPick: expression => {
            const next = macroForm(slot.keycode).steps ?? steps;
            saveSteps(slot, next.map((item, at) => at === index ? {...item, keys: expression.split(",").map(key => key.trim()).filter(Boolean)} : item), true); render();
        },
    }));
    node.querySelector("[data-remove]").addEventListener("click", () => {
        const next = (macroForm(slot.keycode).steps ?? steps).filter((_, at) => at !== index);
        saveSteps(slot, next.length ? next : [{kind: "text", text: ""}], true); render();
    });
    node.querySelectorAll("[data-move]").forEach(button => button.addEventListener("click", () => {
        const next = (macroForm(slot.keycode).steps ?? steps).slice(), target = index + Number(button.dataset.move);
        [next[index], next[target]] = [next[target], next[index]];
        saveSteps(slot, next, true); render();
    }));
    return node;
}

function stageMacro(model, slot, payload) {
    setMacroForm(slot.keycode, {draft: payload, steps: undefined, stepError: ""});
    inspectEdit(slot, true);
}

/* ── the recorder ──────────────────────────────────────────────────────── */
const EVENT_CODES = {
    Space: "KC_SPC", Enter: "KC_ENT", Tab: "KC_TAB", Backspace: "KC_BSPC", Escape: "KC_ESC",
    Minus: "KC_MINS", Equal: "KC_EQL", BracketLeft: "KC_LBRC", BracketRight: "KC_RBRC",
    Backslash: "KC_BSLS", Semicolon: "KC_SCLN", Quote: "KC_QUOT", Comma: "KC_COMM",
    Period: "KC_DOT", Slash: "KC_SLSH", Backquote: "KC_GRV",
    ShiftLeft: "KC_LSFT", ShiftRight: "KC_RSFT", ControlLeft: "KC_LCTL", ControlRight: "KC_RCTL",
    AltLeft: "KC_LALT", AltRight: "KC_RALT", MetaLeft: "KC_LGUI", MetaRight: "KC_RGUI",
    ArrowUp: "KC_UP", ArrowDown: "KC_DOWN", ArrowLeft: "KC_LEFT", ArrowRight: "KC_RGHT",
};
const codeToKeycode = (code) => EVENT_CODES[code]
    || (/^Key([A-Z])$/.test(code) ? `KC_${code.slice(3)}` : "")
    || (/^Digit(\d)$/.test(code) ? `KC_${code.slice(5)}` : "")
    || (/^F(\d{1,2})$/.test(code) ? `KC_${code}` : "");

function recorder(model, slot, canEdit) {
    const recording = state.recording?.slot === slot.keycode;
    const node = el(`<div class="card">
        <div class="card-h"><h3>Record</h3><span class="right"><span class="tag">${recording ? "recording" : "idle"}</span></span></div>
        <div class="card-b" style="display:grid;gap:14px">
            <div class="row" style="gap:12px;align-items:end;flex-wrap:wrap">
                <label class="field" style="min-width:190px"><span>Capture style</span><select class="input" data-mode ${recording ? "disabled" : ""}>
                    <option value="compact" ${state.recordMode !== "explicit" ? "selected" : ""}>Compact taps</option>
                    <option value="explicit" ${state.recordMode === "explicit" ? "selected" : ""}>Explicit press and release</option>
                </select></label>
                <label class="sw"><input type="checkbox" data-delays ${state.recordDelays !== false ? "checked" : ""}>
                    <span class="track"></span><span class="txt">Record delays</span></label>
                <label class="field" style="width:120px"><span>After (ms)</span><input class="input mono" data-threshold value="${esc(state.recordDelayThreshold)}" ${state.recordDelays === false ? "disabled" : ""}></label>
                <label class="field" style="width:120px"><span>Round to (ms)</span><input class="input mono" data-round value="${esc(state.recordDelayRound)}" ${state.recordDelays === false ? "disabled" : ""}></label>
            </div>
            <div class="row" style="gap:8px">
                <span class="note">${recording ? "Typing in this window is captured. Press Escape or Stop when the take is done." : "Appends key steps captured in this window."}</span>
                <span class="right row" style="gap:8px"><button class="btn ghost" data-act="clear-take" ${recording || state.lastTake?.slot === slot.keycode ? "" : "disabled"}>Clear take</button>
                <button class="btn ${recording ? "" : "primary"}" data-act="record" ${canEdit ? "" : "disabled"}>${recording ? "Stop" : "● Record"}</button></span>
            </div>
        </div></div>`);

    node.querySelector("[data-mode]").addEventListener("change", (event) => { state.recordMode = event.target.value; });
    node.querySelector("[data-delays]").addEventListener("change", (event) => { state.recordDelays = event.target.checked; render(); });
    node.querySelector("[data-threshold]").addEventListener("change", (event) => {
        state.recordDelayThreshold = Math.max(0, Number(event.target.value) || 0);
    });
    node.querySelector("[data-round]").addEventListener("change", (event) => {
        state.recordDelayRound = Math.max(1, Number(event.target.value) || 1);
    });
    // Clear take puts the payload back to what it was before Record. A take
    // still in progress was never staged; a finished one was, so its restore
    // is staged too, rather than only rewriting the text on screen.
    node.querySelector('[data-act="clear-take"]').addEventListener("click", () => {
        const take = state.recording?.slot === slot.keycode ? state.recording
            : state.lastTake?.slot === slot.keycode ? state.lastTake : null;
        if (!take) return;
        const staged = !state.recording;
        document.removeEventListener("keydown", onRecordKey, true);
        document.removeEventListener("keyup", onRecordKey, true);
        state.recording = null;
        state.lastTake = null;
        setMacroForm(slot.keycode, {draft: take.before, steps: undefined, stepError: ""});
        if (staged) stageMacro(model, slot, take.before);
        render();
    });
    node.querySelector('[data-act="record"]').addEventListener("click", () => {
        if (recording) { stopRecording(model, slot); return; }
        startRecording(slot, macroForm(slot.keycode).draft ?? slot.payload ?? "");
    });
    return node;
}

// A take appends to what the payload held when Record was pressed. The
// recording state exists only while keys are being captured, so everything
// that pauses for a recording — undo, the key shortcuts — resumes on Stop.
function startRecording(slot, before) {
    state.lastTake = null;
    setMacroForm(slot.keycode, {draft: before, steps: undefined, stepError: ""});
    state.recording = {slot: slot.keycode, before, last: Date.now(), captured: false};
    document.addEventListener("keydown", onRecordKey, true);
    document.addEventListener("keyup", onRecordKey, true);
    render();
}

function stopRecording(model = getModel(), slot = null) {
    const recordedSlot = state.recording?.slot;
    document.removeEventListener("keydown", onRecordKey, true);
    document.removeEventListener("keyup", onRecordKey, true);
    state.lastTake = state.recording ? {slot: recordedSlot, before: state.recording.before} : null;
    state.recording = null;
    const target = slot || (model?.viaMacros || [])
        .find((candidate) => candidate.keycode === recordedSlot);
    if (target) stageMacro(model, target, macroForm(target.keycode).draft ?? target.payload ?? "");
    render();
}

function onRecordKey(event) {
    const recording = state.recording;
    if (!recording?.slot) return;
    if (event.key === "Escape" && event.type === "keydown") { event.preventDefault(); stopRecording(); return; }
    const keycode = codeToKeycode(event.code);
    if (!keycode) return;
    if (event.repeat) { event.preventDefault(); return; }
    if (state.recordMode !== "explicit" && event.type === "keyup") return;
    event.preventDefault();
    const now = Date.now();
    const gap = now - recording.last;
    const current = macroForm(recording.slot).draft ?? "";
    setMacroForm(recording.slot, {steps: undefined, stepError: "", draft: edits.recordedPayload(current, {
        keycode, type: event.type, gap, captured: recording.captured,
        delays: state.recordDelays !== false, threshold: state.recordDelayThreshold, round: state.recordDelayRound,
        explicit: state.recordMode === "explicit",
    })});
    state.recording = {...recording, last: now, captured: true};
    render();
}


function unicodeSetup(model, canEdit) {
    if (!model?.macroUnicode?.supported) return `<p class="note">Unicode macro text needs newer firmware on both halves.</p>`;
    const {mode, os, layouts, layoutName} = model.macroUnicode;
    const typed = layouts
        ? `Text types through the ${layoutName} layout chosen in Settings → Host, accented letters included; keep that layout active on the computer.`
        : "Plain ASCII text types with ordinary keys on any input source.";
    const entry = mode
        ? ["", "Other characters use Unicode entry: keep Unicode Hex Input active in macOS input sources while macros play. Option shortcuts can behave differently in this input source.",
            "Other characters use Unicode entry: install and run WinCompose on Windows with Right Alt as its Compose key.",
            "Other characters use Unicode entry: use an input method or application that accepts Ctrl+Shift+U, hexadecimal digits and Space, such as IBus. This sequence does not work in every Linux application."][mode]
        : layouts && os === 1 ? "Characters it cannot type, such as emoji, need the Unicode Hex Input layout."
            : "Characters it cannot type, such as emoji, need Unicode playback on and a known host OS.";
    return `<div class="field"><span class="note">${esc(typed)} ${esc(entry)} The keyboard cannot check your input setup. Avoid typing while a text macro plays.</span><button class="btn tiny ghost" data-host-settings>Open Host settings</button></div>`;
}
