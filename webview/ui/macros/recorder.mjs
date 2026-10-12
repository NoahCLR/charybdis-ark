// @ts-check
/** @typedef {import("../../../contracts/panel.js").PublishedModel | null} Model */
/** @typedef {import("../../../contracts/panel.js").MacroSlot} MacroSlot */
/** @typedef {import("../../view/types.js").MacroStep} MacroStep */
import {el, esc} from "../../lib/dom.mjs";
import {getModel, macroForm, render, setMacroForm, state} from "../../store.mjs";
import * as edits from "../../view/edits.mjs";
import {stageMacro} from "./validation.mjs";
/* ── the recorder ──────────────────────────────────────────────────────── */
/** @type {Record<string, string>} */
const EVENT_CODES = {
    Space: "KC_SPC", Enter: "KC_ENT", Tab: "KC_TAB", Backspace: "KC_BSPC", Escape: "KC_ESC",
    Minus: "KC_MINS", Equal: "KC_EQL", BracketLeft: "KC_LBRC", BracketRight: "KC_RBRC",
    Backslash: "KC_BSLS", Semicolon: "KC_SCLN", Quote: "KC_QUOT", Comma: "KC_COMM",
    Period: "KC_DOT", Slash: "KC_SLSH", Backquote: "KC_GRV",
    ShiftLeft: "KC_LSFT", ShiftRight: "KC_RSFT", ControlLeft: "KC_LCTL", ControlRight: "KC_RCTL",
    AltLeft: "KC_LALT", AltRight: "KC_RALT", MetaLeft: "KC_LGUI", MetaRight: "KC_RGUI",
    ArrowUp: "KC_UP", ArrowDown: "KC_DOWN", ArrowLeft: "KC_LEFT", ArrowRight: "KC_RGHT",
};
/** @param {string} code */
const codeToKeycode = (code) => EVENT_CODES[code]
    || (/^Key([A-Z])$/.test(code) ? `KC_${code.slice(3)}` : "")
    || (/^Digit(\d)$/.test(code) ? `KC_${code.slice(5)}` : "")
    || (/^F(\d{1,2})$/.test(code) ? `KC_${code}` : "");

/** @param {Model} model @param {MacroSlot} slot @param {boolean} canEdit */
export function recorder(model, slot, canEdit) {
    const recording = state.recording?.slot === slot.keycode;
    const node = el(`<div class="card">
        <div class="card-h"><h3>Record</h3><span class="right"><span class="tag">${recording ? "recording" : "idle"}</span></span></div>
        <div class="card-b stack">
            <div class="row record-opts">
                <label class="field capture-field"><span>Capture style</span><select class="input" data-f="macro:${esc(slot.keycode)}:record-mode" data-mode ${recording ? "disabled" : ""}>
                    <option value="compact" ${state.recordMode !== "explicit" ? "selected" : ""}>Compact taps</option>
                    <option value="explicit" ${state.recordMode === "explicit" ? "selected" : ""}>Explicit press and release</option>
                </select></label>
                <label class="sw"><input type="checkbox" data-f="macro:${esc(slot.keycode)}:record-delays" data-delays ${state.recordDelays !== false ? "checked" : ""}>
                    <span class="track"></span><span class="txt">Record delays</span></label>
                <label class="field ms-field"><span>After (ms)</span><input class="input mono" data-f="macro:${esc(slot.keycode)}:record-threshold" data-threshold value="${esc(state.recordDelayThreshold)}" ${state.recordDelays === false ? "disabled" : ""}></label>
                <label class="field ms-field"><span>Round to (ms)</span><input class="input mono" data-f="macro:${esc(slot.keycode)}:record-round" data-round value="${esc(state.recordDelayRound)}" ${state.recordDelays === false ? "disabled" : ""}></label>
            </div>
            <div class="row gap-8">
                <span class="note">${recording ? "Typing in this window is captured. Press Escape or Stop when the take is done." : "Appends key steps captured in this window."}</span>
                <span class="right row gap-8"><button class="btn ghost" data-act="clear-take" ${recording || state.lastTake?.slot === slot.keycode ? "" : "disabled"}>Clear take</button>
                <button class="btn ${recording ? "" : "primary"}" data-act="record" ${canEdit ? "" : "disabled"}>${recording ? "Stop" : "● Record"}</button></span>
            </div>
        </div></div>`);

    /** @type {HTMLSelectElement} */ (node.querySelector("[data-mode]")).addEventListener("change", (event) => { state.recordMode = /** @type {HTMLSelectElement} */ (event.target).value; });
    /** @type {HTMLInputElement} */ (node.querySelector("[data-delays]")).addEventListener("change", (event) => { state.recordDelays = /** @type {HTMLInputElement} */ (event.target).checked; render(); });
    /** @type {HTMLInputElement} */ (node.querySelector("[data-threshold]")).addEventListener("change", (event) => {
        state.recordDelayThreshold = Math.max(0, Number(/** @type {HTMLInputElement} */ (event.target).value) || 0);
    });
    /** @type {HTMLInputElement} */ (node.querySelector("[data-round]")).addEventListener("change", (event) => {
        state.recordDelayRound = Math.max(1, Number(/** @type {HTMLInputElement} */ (event.target).value) || 1);
    });
    // Clear take puts the payload back to what it was before Record. A take
    // still in progress was never staged; a finished one was, so its restore
    // is staged too, rather than only rewriting the text on screen.
    /** @type {HTMLButtonElement} */ (node.querySelector('[data-act="clear-take"]')).addEventListener("click", () => {
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
    /** @type {HTMLButtonElement} */ (node.querySelector('[data-act="record"]')).addEventListener("click", () => {
        if (recording) { stopRecording(model, slot); return; }
        startRecording(slot, macroForm(slot.keycode).draft ?? slot.payload ?? "");
    });
    return node;
}

// A take appends to what the payload held when Record was pressed. The
// recording state exists only while keys are being captured, so everything
// that pauses for a recording — undo, the key shortcuts — resumes on Stop.
/** @param {MacroSlot} slot @param {string} before */
function startRecording(slot, before) {
    state.lastTake = null;
    setMacroForm(slot.keycode, {draft: before, steps: undefined, stepError: ""});
    state.recording = {slot: slot.keycode, before, last: Date.now(), captured: false};
    document.addEventListener("keydown", onRecordKey, true);
    document.addEventListener("keyup", onRecordKey, true);
    render();
}

/** @param {Model} model @param {MacroSlot | null} slot */
function stopRecording(model = getModel(), slot = null) {
    const recordedSlot = state.recording?.slot;
    document.removeEventListener("keydown", onRecordKey, true);
    document.removeEventListener("keyup", onRecordKey, true);
    state.lastTake = state.recording ? {slot: state.recording.slot, before: state.recording.before} : null;
    state.recording = null;
    const target = slot || (model?.viaMacros || [])
        .find((candidate) => candidate.keycode === recordedSlot);
    if (target) stageMacro(model, target, macroForm(target.keycode).draft ?? target.payload ?? "");
    render();
}

/** @param {KeyboardEvent} event */
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
